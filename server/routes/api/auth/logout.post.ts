import { clearSessionCookie } from '~/server/utils/auth'
import { deleteSession } from '~/server/utils/repo'

export default defineEventHandler(async (event) => {
  const sessionId = getCookie(event, 'stock_board_session')

  if (sessionId) {
    await deleteSession(event, sessionId)
  }

  clearSessionCookie(event)

  return {
    ok: true
  }
})
