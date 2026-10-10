import { readBody } from 'h3'
import { requireUser } from '~/server/utils/auth'
import { deleteMarketDataRow } from '~/server/utils/marketData'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody<{ tradeDate?: string }>(event)
  const tradeDate = body?.tradeDate?.trim() ?? ''

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid trade date' })
  }

  return deleteMarketDataRow(event, tradeDate)
})
