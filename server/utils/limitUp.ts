import type { H3Event } from 'h3'
import { StockSDK, type FullQuote, type ZTPoolItem } from 'stock-sdk'

export type LimitUpStock = {
  code: string
  name: string
  price: number | null
  changePercent: number
  amount: number | null
}

export type LimitUpResult = {
  tradeDate: string
  updatedAt: string
  source: string
  stale: boolean
  stocks: LimitUpStock[]
  limitDownStocks: LimitUpStock[]
  rawRows: Array<Record<string, unknown>>
  diagnostics: {
    total: number
    rowCount: number
    limitUpCount: number
    limitDownCount: number
  }
}

const CACHE_MS = 8_000
const stockSdk = new StockSDK({
  timeout: 15_000,
  retry: { maxRetries: 2, baseDelay: 500 },
  rateLimit: { requestsPerSecond: 2, maxBurst: 1 }
})

const tradeDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const asNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const isLimitUp = (quote: FullQuote) => quote.price >= quote.limitUp && quote.changePercent >= 0
const isLimitDown = (quote: FullQuote) => quote.price <= quote.limitDown && quote.changePercent <= 0

const mapQuote = (quote: FullQuote): LimitUpStock => ({
  code: quote.code,
  name: quote.name,
  price: asNumber(quote.price),
  changePercent: quote.changePercent,
  amount: asNumber(quote.amount)
})

const mapPoolItem = (item: ZTPoolItem): LimitUpStock => ({
  code: item.code,
  name: item.name,
  price: asNumber(item.price),
  changePercent: asNumber(item.changePercent) ?? 0,
  amount: asNumber(item.amount)
})

let cache: { expiresAt: number; result: LimitUpResult } | null = null

export const getLimitUpStocks = async (): Promise<LimitUpResult> => {
  if (cache && cache.expiresAt > Date.now()) return cache.result

  const quotes = await stockSdk.batch.cn({ batchSize: 500, concurrency: 1 })
  const limitUpPool = await stockSdk.marketEvent.ztPool('zt')
  const validQuotes = quotes.filter((quote) => quote.code && quote.name && Number.isFinite(quote.changePercent))
  const poolByCode = new Map(limitUpPool.map((item) => [item.code, mapPoolItem(item)]))
  const stocks = validQuotes.filter(isLimitUp).map(mapQuote)
  const limitDownStocks = validQuotes.filter(isLimitDown).map(mapQuote)
  const stocksByCode = new Map(stocks.map((stock) => [stock.code, stock]))

  for (const [code, stock] of poolByCode) {
    if (!stocksByCode.has(code)) stocks.push(stock)
  }

  const updatedAt = new Date().toISOString()
  const result = {
    tradeDate: tradeDate(),
    updatedAt,
    source: 'stock-sdk',
    stale: false,
    stocks,
    limitDownStocks,
    rawRows: validQuotes as Array<Record<string, unknown>>,
    diagnostics: {
      total: validQuotes.length,
      rowCount: validQuotes.length,
      limitUpCount: stocks.length,
      limitDownCount: limitDownStocks.length
    }
  }
  console.info('[market sdk] fetched quotes', {
    total: result.diagnostics.total,
    limitUp: stocks.length,
    limitDown: limitDownStocks.length
  })
  cache = { expiresAt: Date.now() + CACHE_MS, result }
  return result
}

type D1DatabaseLike = {
  prepare?: (sql: string) => {
    bind: (...params: unknown[]) => { run: () => Promise<unknown> }
  }
  batch?: (statements: Array<unknown>) => Promise<unknown>
}

export const saveLimitUpRawSnapshot = async (event: H3Event, result: LimitUpResult) => {
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as D1DatabaseLike | undefined
  if (!db?.prepare || !db.batch) throw new Error('D1 database binding is unavailable')

  await db.prepare(`
    INSERT OR REPLACE INTO market_limit_up_raw (
      trade_date, total_stocks, row_count, rows_json, created_at, updated_at
    ) VALUES (?, ?, ?, '[]', COALESCE((SELECT created_at FROM market_limit_up_raw WHERE trade_date = ?), ?), ?)
  `).bind(
    result.tradeDate,
    result.diagnostics.total,
    result.rawRows.length,
    result.tradeDate,
    result.updatedAt,
    result.updatedAt
  ).run()

  await db.prepare('DELETE FROM market_limit_up_quotes WHERE trade_date = ?')
    .bind(result.tradeDate).run()

  const statements: Array<unknown> = []
  for (let index = 0; index < result.rawRows.length; index += 100) {
    const rows = result.rawRows.slice(index, index + 100)
    const placeholders = rows.map(() => '(?, ?, ?, ?, ?)').join(', ')
    const params = rows.flatMap((row) => [
      result.tradeDate,
      typeof row.code === 'string' ? row.code : '',
      JSON.stringify(row),
      result.updatedAt,
      result.updatedAt
    ])
    statements.push(db.prepare(`
      INSERT INTO market_limit_up_quotes (trade_date, code, quote_json, created_at, updated_at)
      VALUES ${placeholders}
    `).bind(...params))
  }

  await db.batch(statements)

  await db.prepare(`
    DELETE FROM market_limit_up_raw
    WHERE trade_date NOT IN (
      SELECT trade_date FROM market_limit_up_raw ORDER BY trade_date DESC LIMIT 10
    )
  `).bind().run()

  await db.prepare(`
    DELETE FROM market_limit_up_quotes
    WHERE trade_date NOT IN (
      SELECT trade_date FROM market_limit_up_raw ORDER BY trade_date DESC LIMIT 10
    )
  `).bind().run()
}

export const refreshLimitUpRawSnapshot = async (event: H3Event) => {
  const result = await getLimitUpStocks()
  await saveLimitUpRawSnapshot(event, result)
  return {
    tradeDate: result.tradeDate,
    updatedAt: result.updatedAt,
    source: result.source,
    total: result.diagnostics.total,
    rowCount: result.rawRows.length,
    limitUp: result.stocks.length,
    limitDown: result.limitDownStocks.length
  }
}
