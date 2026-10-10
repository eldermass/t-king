import { getQuery } from 'h3'
import { requireUser } from '~/server/utils/auth'
import { deleteMarketDataRow } from '~/server/utils/marketData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const tradeDate = String(getQuery(event).tradeDate ?? '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid trade date' })
  }

  try {
    return await deleteMarketDataRow(event, tradeDate)
  } catch (error) {
    console.error('market data delete failed', error)
    throw createError({ statusCode: 500, statusMessage: error instanceof Error ? error.message : 'market data delete failed' })
  }
})
