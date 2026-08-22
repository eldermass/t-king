import { getQuery } from 'h3'
import { getPreviousSentimentSnapshot, getSentimentSnapshot, saveSentimentSnapshot } from '~/server/utils/sentiment'

export default defineEventHandler(async (event) => {
  if (getQuery(event).mode === 'close') return await getPreviousSentimentSnapshot(event) ?? getSentimentSnapshot()
  const snapshot = await getSentimentSnapshot()

  if (!snapshot.stale) {
    await saveSentimentSnapshot(event, snapshot)
  }

  return snapshot
})
