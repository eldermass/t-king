import { getQuery } from 'h3'
import { normalizeCode } from '~/shared/reminder-core'

type StoredQuote = { code: string; changePercent: number | null }
type QuoteDay = { trade_date: string; quotes_json: string }

export default defineEventHandler(async (event) => {
  const code = normalizeCode(String(getQuery(event).code ?? ''))
  if (!/^\d{6}$/.test(code)) {
    throw createError({ statusCode: 400, statusMessage: '请输入有效的 6 位股票代码' })
  }

  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as {
    prepare?: (sql: string) => { all: <T>() => Promise<{ results?: T[] }> }
  } | undefined
  if (!db?.prepare) {
    throw createError({ statusCode: 503, statusMessage: '行情数据库暂不可用' })
  }

  const result = await db.prepare(`
    SELECT trade_date, quotes_json FROM market_stock_quotes
    ORDER BY trade_date DESC LIMIT 20
  `).all<QuoteDay>()

  const points = (result.results ?? []).flatMap((day) => {
    let parsed: unknown
    try { parsed = JSON.parse(day.quotes_json) } catch { return [] }
    if (!Array.isArray(parsed)) return []

    const quotes = new Map<string, StoredQuote>()
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const quote = item as Record<string, unknown>
      const quoteCode = normalizeCode(typeof quote.code === 'string' ? quote.code : '')
      if (!/^\d{6}$/.test(quoteCode)) continue
      quotes.set(quoteCode, {
        code: quoteCode,
        changePercent: typeof quote.changePercent === 'number' && Number.isFinite(quote.changePercent)
          ? quote.changePercent : null
      })
    }

    const ranked = [...quotes.values()]
      .filter((quote): quote is StoredQuote & { changePercent: number } => quote.changePercent !== null)
      .sort((left, right) => right.changePercent - left.changePercent || left.code.localeCompare(right.code))
    const rankIndex = ranked.findIndex((quote) => quote.code === code)
    return [{
      tradeDate: day.trade_date,
      rank: rankIndex < 0 ? null : rankIndex + 1,
      totalStocks: quotes.size,
      changePercent: quotes.get(code)?.changePercent ?? null
    }]
  }).reverse()

  return { code, maxStocks: Math.max(0, ...points.map((point) => point.totalStocks)), points }
})
