import { requireUser } from '~/server/utils/auth'
import { normalizeBoardPayload } from '~/server/utils/board'
import { getBoardPayloadByUserId, saveBoardPayload } from '~/server/utils/repo'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const payload = normalizeBoardPayload(body)
  const existingRow = await getBoardPayloadByUserId(event, user.id)

  if (existingRow?.payload) {
    try {
      const existingPayload = normalizeBoardPayload(JSON.parse(existingRow.payload))
      const nextPushKey = payload.notifications.pushDeerKey.trim()
      const currentPushKey = existingPayload.notifications.pushDeerKey.trim()

      payload.notifications.activeReminders = nextPushKey === currentPushKey
        ? existingPayload.notifications.activeReminders
        : {}
      const nextGuide = payload.notifications.marketGuide
      const currentGuide = existingPayload.notifications.marketGuide
      if (!Object.prototype.hasOwnProperty.call(body?.notifications ?? {}, 'marketGuide')) {
        payload.notifications.marketGuide = {
          ...currentGuide,
          lastSentSlot: nextPushKey === currentPushKey ? currentGuide.lastSentSlot : null
        }
      } else {
        nextGuide.lastSentSlot = nextPushKey === currentPushKey && nextGuide.text === currentGuide.text && nextGuide.intervalMinutes === currentGuide.intervalMinutes
          ? currentGuide.lastSentSlot
          : null
      }
    } catch {
      payload.notifications.activeReminders = {}
    }
  }

  const updatedAt = new Date().toISOString()

  await saveBoardPayload(event, user.id, JSON.stringify(payload), updatedAt)

  return {
    ok: true,
    updatedAt
  }
})
