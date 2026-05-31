import { requireUser } from '~/server/utils/auth'
import { normalizeBoardPayload } from '~/server/utils/board'
import { saveBoardPayload } from '~/server/utils/repo'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const payload = normalizeBoardPayload(body)
  const updatedAt = new Date().toISOString()

  await saveBoardPayload(event, user.id, JSON.stringify(payload), updatedAt)

  return {
    ok: true,
    updatedAt
  }
})
