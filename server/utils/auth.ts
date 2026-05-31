import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { createUserSession, getSessionUser } from '~/server/utils/repo'

const SESSION_COOKIE = 'stock_board_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14

export const hashPassword = (password: string) =>
  createHash('sha256').update(password).digest('hex')

export const setSessionCookie = (event: H3Event, sessionId: string) => {
  setCookie(event, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: SESSION_TTL_SECONDS
  })
}

export const clearSessionCookie = (event: H3Event) => {
  deleteCookie(event, SESSION_COOKIE, {
    path: '/'
  })
}

export const createSession = async (event: H3Event, userId: string) => {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  const sessionId = await createUserSession(event, userId, expiresAt)

  setSessionCookie(event, sessionId)
  return sessionId
}

export const getAuthenticatedUser = async (event: H3Event) => {
  const sessionId = getCookie(event, SESSION_COOKIE)

  if (!sessionId) {
    return null
  }

  const session = await getSessionUser(event, sessionId, new Date().toISOString())

  if (!session) {
    clearSessionCookie(event)
    return null
  }

  return {
    id: session.user_id,
    username: session.username,
    sessionId: session.id
  }
}

export const requireUser = async (event: H3Event) => {
  const user = await getAuthenticatedUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  return user
}
