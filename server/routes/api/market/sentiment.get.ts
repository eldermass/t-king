import { getSentimentPageData } from '~/server/utils/sentiment'

export default defineEventHandler(async (event) => {
  return getSentimentPageData(event, 60)
})
