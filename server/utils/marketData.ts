import type { H3Event } from 'h3'
import { StockSDK, type SimpleQuote } from 'stock-sdk'
import { refreshSentimentSnapshot } from './sentiment'

export type MarketDataRow = {
  tradeDate: string
  shIndexChange: number
  chinextIndexChange: number
  sci50IndexChange: number
  volume: number | null
  volumeChange: number | null
  advancers: number | null
  decliners: number | null
  limitUpCount: number | null
  limitDownCount: number | null
  sentimentScore: number | null
  updatedAt: string
}

type Db = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      all: <T>() => Promise<{ results?: T[] }>
      run: () => Promise<unknown>
    }
  }
}

const stockSdk = new StockSDK({
  timeout: 15_000,
  retry: { maxRetries: 2, baseDelay: 500 },
  rateLimit: { requestsPerSecond: 2, maxBurst: 1 }
})

const shanghaiDate = (value: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(value)

const normalizeCode = (code: string) => code.toLowerCase().replace(/^(sh|sz|bj)/, '')
const indexChange = (quotes: SimpleQuote[], code: string) => {
  const quote = quotes.find((item) => normalizeCode(item.code) === normalizeCode(code))
  if (!quote || !Number.isFinite(quote.changePercent)) throw new Error(`stock-sdk missing index quote: ${code}`)
  return quote.changePercent / 100
}

const dbFor = (event: H3Event) => (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as Db | undefined

export const getMarketDataHistory = async (event: H3Event, days = 60) => {
  const db = dbFor(event)
  if (!db) return []
  const result = await db.prepare(`
    SELECT trade_date AS tradeDate, sh_index_change AS shIndexChange,
      chinext_index_change AS chinextIndexChange, sci50_index_change AS sci50IndexChange,
      volume, volume_change AS volumeChange, advancers, decliners,
      limit_up_count AS limitUpCount, limit_down_count AS limitDownCount,
      sentiment_score AS sentimentScore, updated_at AS updatedAt
    FROM market_data_daily ORDER BY trade_date DESC LIMIT ?
  `).bind(days).all<MarketDataRow>()
  return result.results ?? []
}

export const saveMarketDataRow = async (event: H3Event, row: MarketDataRow) => {
  const db = dbFor(event)
  if (!db) throw new Error('D1 database binding is unavailable')
  const previous = await db.prepare('SELECT volume FROM market_data_daily WHERE trade_date < ? ORDER BY trade_date DESC LIMIT 1')
    .bind(row.tradeDate).all<{ volume: number | null }>()
  const previousVolume = previous.results?.[0]?.volume ?? null
  const volumeChange = row.volume !== null && previousVolume !== null ? row.volume - previousVolume : row.volumeChange
  await db.prepare(`
    INSERT OR REPLACE INTO market_data_daily (
      trade_date, sh_index_change, chinext_index_change, sci50_index_change, volume,
      volume_change, advancers, decliners, limit_up_count, limit_down_count,
      sentiment_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      COALESCE((SELECT created_at FROM market_data_daily WHERE trade_date = ?), ?), ?)
  `).bind(
    row.tradeDate, row.shIndexChange, row.chinextIndexChange, row.sci50IndexChange,
    row.volume, volumeChange, row.advancers, row.decliners, row.limitUpCount,
    row.limitDownCount, row.sentimentScore, row.tradeDate, row.updatedAt, row.updatedAt
  ).run()
  return { ...row, volumeChange }
}

export const refreshMarketDataRow = async (event: H3Event, requestedDate: string) => {
  const today = shanghaiDate(new Date())
  if (requestedDate !== today) throw new Error('只能刷新当前交易日的市场数据')

  const snapshot = await refreshSentimentSnapshot(event)
  const indexQuotes = await stockSdk.quotes.cnSimple(['sh000001', 'sz399006', 'sh000688'])
  const updatedAt = `${requestedDate}T15:00:00+08:00`
  return saveMarketDataRow(event, {
    tradeDate: requestedDate,
    updatedAt,
    shIndexChange: indexChange(indexQuotes, 'sh000001'),
    chinextIndexChange: indexChange(indexQuotes, 'sz399006'),
    sci50IndexChange: indexChange(indexQuotes, 'sh000688'),
    volume: snapshot.totalAmount === null ? null : snapshot.totalAmount / 10000,
    volumeChange: null,
    advancers: snapshot.market.advancers,
    decliners: snapshot.market.decliners,
    limitUpCount: snapshot.market.limitUp,
    limitDownCount: snapshot.market.limitDown,
    sentimentScore: snapshot.marketSentiment
  })
}
