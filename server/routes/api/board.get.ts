import { requireUser } from '~/server/utils/auth'
import { defaultBoardPayload, normalizeBoardPayload } from '~/server/utils/board'
import { getBoardPayloadByUserId, saveBoardPayload } from '~/server/utils/repo'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const row = await getBoardPayloadByUserId(event, user.id)

  if (!row?.payload) {
    const payload = defaultBoardPayload()
    const updatedAt = new Date().toISOString()

    await saveBoardPayload(event, user.id, JSON.stringify(payload), updatedAt)

    return payload
  }

  try {
    return normalizeBoardPayload(JSON.parse(row.payload))
  } catch {
    const payload = defaultBoardPayload()
    const updatedAt = new Date().toISOString()

    await saveBoardPayload(event, user.id, JSON.stringify(payload), updatedAt)

    return payload
  }
})
