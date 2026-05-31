import { createSession, hashPassword } from '~/server/utils/auth'
import { findUserByUsername } from '~/server/utils/repo'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event)
  const username = body.username?.trim() ?? ''
  const password = body.password ?? ''

  if (!username || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Username and password are required.'
    })
  }

  const passwordHash = hashPassword(password)
  const user = await findUserByUsername(event, username)

  if (!user || user.password_hash !== passwordHash) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid username or password.'
    })
  }

  await createSession(event, user.id)

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username
    }
  }
})
