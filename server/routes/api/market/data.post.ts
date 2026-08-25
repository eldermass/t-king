import { readBody } from 'h3'
import { requireUser } from '~/server/utils/auth'
import { saveMarketDataRow, type MarketDataRow } from '~/server/utils/marketData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody<Partial<MarketDataRow>>(event)
  if (!body?.tradeDate || !body.updatedAt || !Number.isFinite(body.shIndexChange) || !Number.isFinite(body.chinextIndexChange) || !Number.isFinite(body.sci50IndexChange)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid market data row' })
  }

  return saveMarketDataRow(event, {
    tradeDate: String(body.tradeDate), shIndexChange: body.shIndexChange!, chinextIndexChange: body.chinextIndexChange!, sci50IndexChange: body.sci50IndexChange!,
    volume: body.volume ?? null, volumeChange: body.volumeChange ?? null, advancers: body.advancers ?? null, decliners: body.decliners ?? null,
    limitUpCount: body.limitUpCount ?? null, limitDownCount: body.limitDownCount ?? null, sentimentScore: body.sentimentScore ?? null, updatedAt: String(body.updatedAt)
  })
})
