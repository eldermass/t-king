import { getSentimentSnapshot, saveSentimentSnapshot } from '~/server/utils/sentiment'

export default defineEventHandler(async (event) => {
  const snapshot = await getSentimentSnapshot()

  if (!snapshot.stale) {
    await saveSentimentSnapshot(event, snapshot)
  }

  return snapshot
})
