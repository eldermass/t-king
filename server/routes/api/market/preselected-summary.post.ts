import { readBody } from 'h3'
import { normalizeCode } from '~/shared/reminder-core'
import { summarizePreselectedRank, type PreselectedRankPoint } from '~/shared/preselected-summary'

type QuoteDay = {
  trade_date: string
  quotes_json: string
  sh_index_change: number | null
  chinext_index_change: number | null
  sci50_index_change: number | null
}

const benchmarkColumn = (code: string): keyof Pick<QuoteDay, 'sh_index_change' | 'chinext_index_change' | 'sci50_index_change'> | null => {
  if (/^30[01]/.test(code)) return 'chinext_index_change'
  if (/^68[89]/.test(code)) return 'sci50_index_change'
  if (/^(?:00[0-3]|60[0135])/.test(code)) return 'sh_index_change'
  return null
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ codes?: unknown }>(event)
  if (!Array.isArray(body?.codes) || body.codes.length > 200) {
    throw createError({ statusCode: 400, statusMessage: '请提交不超过 200 个股票代码' })
  }
  const codes = [...new Set(body.codes.map((code) => normalizeCode(String(code))).filter((code) => /^\d{6}$/.test(code)))]
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as {
    prepare?: (sql: string) => { all: <T>() => Promise<{ results?: T[] }> }
  } | undefined
  if (!db?.prepare) throw createError({ statusCode: 503, statusMessage: '行情数据库暂不可用' })

  const result = await db.prepare(`
    SELECT quotes.trade_date, quotes.quotes_json,
      market.sh_index_change, market.chinext_index_change, market.sci50_index_change
    FROM market_stock_quotes AS quotes
    LEFT JOIN market_data_daily AS market ON market.trade_date = quotes.trade_date
    ORDER BY quotes.trade_date DESC LIMIT 20
  `).all<QuoteDay>()
  const points = new Map(codes.map((code) => [code, [] as PreselectedRankPoint[]]))
  for (const day of result.results ?? []) {
    let parsed: unknown
    try { parsed = JSON.parse(day.quotes_json) } catch { continue }
    if (!Array.isArray(parsed)) continue
    const changes = new Map<string, number | null>()
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const quote = item as Record<string, unknown>
      const code = normalizeCode(typeof quote.code === 'string' ? quote.code : '')
      if (!/^\d{6}$/.test(code)) continue
      changes.set(code, typeof quote.changePercent === 'number' && Number.isFinite(quote.changePercent) ? quote.changePercent : null)
    }
    const ranked = [...changes].filter((entry): entry is [string, number] => entry[1] !== null)
      .sort(([leftCode, leftChange], [rightCode, rightChange]) => rightChange - leftChange || leftCode.localeCompare(rightCode))
    const rankByCode = new Map(ranked.map(([code], index) => [code, index + 1]))
    for (const code of codes) {
      const changePercent = changes.get(code) ?? null
      const column = benchmarkColumn(code)
      const indexChange = column ? day[column] : null
      const differencePercent = changePercent === null || typeof indexChange !== 'number' || !Number.isFinite(indexChange)
        ? null : changePercent - indexChange * 100
      points.get(code)!.push({
        rank: rankByCode.get(code) ?? null,
        totalStocks: changes.size,
        changePercent,
        differencePercent
      })
    }
  }
  return { summaries: codes.map((code) => summarizePreselectedRank(code, points.get(code)!)) }
})
