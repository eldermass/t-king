import { readBody } from 'h3'
import { requireUser } from '~/server/utils/auth'
import { refreshMarketDataRow } from '~/server/utils/marketData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody<{ tradeDate?: string }>(event)
  if (!body?.tradeDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.tradeDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid trade date' })
  }

  try {
    return await refreshMarketDataRow(event, body.tradeDate)
  } catch (error) {
    console.error('market data refresh failed', error)
    throw createError({ statusCode: 502, statusMessage: error instanceof Error ? error.message : 'market data refresh failed' })
  }
})
