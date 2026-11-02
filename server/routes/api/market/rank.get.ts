import { getQuery } from 'h3'
import { normalizeCode } from '~/shared/reminder-core'

type StoredQuote = { code: string; changePercent: number | null }
type QuoteDay = {
  trade_date: string
  quotes_json: string
  sh_index_change: number | null
  chinext_index_change: number | null
  sci50_index_change: number | null
}

const stockBoard = (code: string) => {
  if (/^30[01]/.test(code)) return '创业板'
  if (/^68[89]/.test(code)) return '科创板'
  if (/^(?:[48]|92)/.test(code)) return '北交所'
  if (/^(?:00[0-3]|60[0135])/.test(code)) return '主板'
  return '其他'
}

const benchmarkFor = (board: string) => {
  if (board === '创业板') return { name: '创业板指数', column: 'chinext_index_change' } as const
  if (board === '科创板') return { name: '科创50指数', column: 'sci50_index_change' } as const
  if (board === '主板') return { name: '上证指数', column: 'sh_index_change' } as const
  return null
}

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
    SELECT quotes.trade_date, quotes.quotes_json,
      market.sh_index_change, market.chinext_index_change, market.sci50_index_change
    FROM market_stock_quotes AS quotes
    LEFT JOIN market_data_daily AS market ON market.trade_date = quotes.trade_date
    ORDER BY quotes.trade_date DESC LIMIT 20
  `).all<QuoteDay>()

  const board = stockBoard(code)
  const benchmark = benchmarkFor(board)
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
    const boardRanked = ranked.filter((quote) => stockBoard(quote.code) === board)
    const rankIndex = ranked.findIndex((quote) => quote.code === code)
    const boardRankIndex = boardRanked.findIndex((quote) => quote.code === code)
    const changePercent = quotes.get(code)?.changePercent ?? null
    const storedIndexChange = benchmark ? day[benchmark.column] : null
    const benchmarkChangePercent = typeof storedIndexChange === 'number' && Number.isFinite(storedIndexChange)
      ? storedIndexChange * 100 : null
    return [{
      tradeDate: day.trade_date,
      rank: rankIndex < 0 ? null : rankIndex + 1,
      totalStocks: quotes.size,
      boardRank: boardRankIndex < 0 ? null : boardRankIndex + 1,
      boardTotalStocks: [...quotes.keys()].filter((quoteCode) => stockBoard(quoteCode) === board).length,
      changePercent,
      benchmarkChangePercent,
      differencePercent: changePercent === null || benchmarkChangePercent === null
        ? null : changePercent - benchmarkChangePercent
    }]
  })

  return {
    code,
    board,
    benchmarkName: benchmark?.name ?? null,
    maxStocks: Math.max(0, ...points.map((point) => point.totalStocks)),
    boardMaxStocks: Math.max(0, ...points.map((point) => point.boardTotalStocks)),
    points
  }
})
