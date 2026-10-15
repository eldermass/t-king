import { StockSDK, type FullQuote } from 'stock-sdk'
import { requireUser } from '~/server/utils/auth'
import { saveMarketStockQuotes, type MarketStockQuote } from '~/server/utils/sentiment'
import { normalizeCode } from '~/shared/reminder-core'

const stockSdk = new StockSDK({
  timeout: 15_000,
  retry: { maxRetries: 2, baseDelay: 500 },
  rateLimit: { requestsPerSecond: 2, maxBurst: 1 }
})

const tradeDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const finiteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as { prepare?: unknown } | undefined
  if (!db?.prepare) {
    throw createError({ statusCode: 503, statusMessage: '行情数据库暂不可用' })
  }

  let fetched: FullQuote[]
  try {
    fetched = await stockSdk.batch.cn({ batchSize: 500, concurrency: 1 })
  } catch (error) {
    console.error('market rank quote refresh failed', error)
    throw createError({ statusCode: 502, statusMessage: '全市场行情获取失败，请稍后重试' })
  }

  const quoteMap = new Map<string, MarketStockQuote>()
  for (const quote of fetched) {
    const code = normalizeCode(quote.code || '')
    if (!/^\d{6}$/.test(code)) continue
    quoteMap.set(code, {
      name: quote.name || '',
      code: quote.code,
      price: finiteNumber(quote.price),
      changePercent: finiteNumber(quote.changePercent),
      amount: finiteNumber(quote.amount)
    })
  }

  if (quoteMap.size < 3000) {
    throw createError({ statusCode: 502, statusMessage: `行情仅返回 ${quoteMap.size} 只股票，未更新数据库` })
  }

  const updatedAt = new Date().toISOString()
  const currentTradeDate = tradeDate()
  await saveMarketStockQuotes(event, currentTradeDate, updatedAt, [...quoteMap.values()])
  return { tradeDate: currentTradeDate, updatedAt, quoteCount: quoteMap.size }
})
