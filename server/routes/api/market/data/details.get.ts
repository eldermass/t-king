import { getQuery } from 'h3'
import { getMarketStockQuotes } from '~/server/utils/sentiment'

export default defineEventHandler(async (event) => {
  const tradeDate = String(getQuery(event).tradeDate ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid trade date' })
  }
  return getMarketStockQuotes(event, tradeDate)
})
