import { getQuery } from 'h3'
import { getMarketDataHistory } from '~/server/utils/marketData'

export default defineEventHandler(async (event) => {
  const days = Math.min(60, Math.max(1, Number(getQuery(event).days ?? 60) || 60))
  return getMarketDataHistory(event, days)
})
