import { getQuery } from 'h3'
import { getSentimentHistory } from '~/server/utils/sentiment'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const parsedDays = Number(query.days ?? 60)
  const days = Number.isFinite(parsedDays) ? Math.min(60, Math.max(1, Math.floor(parsedDays))) : 60

  return getSentimentHistory(event, days)
})
