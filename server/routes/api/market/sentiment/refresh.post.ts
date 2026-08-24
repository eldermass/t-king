import { refreshSentimentSnapshot } from '~/server/utils/sentiment'

export default defineEventHandler(async (event) => {
  try {
    return await refreshSentimentSnapshot(event)
  } catch (error) {
    console.error('market raw refresh failed', error)
    throw createError({ statusCode: 502, statusMessage: 'market refresh failed; database was not updated' })
  }
})
