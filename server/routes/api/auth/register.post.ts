import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { createSession, hashPassword } from '~/server/utils/auth'
import { defaultBoardPayload } from '~/server/utils/board'
import { createUserWithBoard, findUserByUsername } from '~/server/utils/repo'

const DEFAULT_REGISTRATION_CODE_HASH = '67d77054c3c30bc848b9a65dc40d1758e23ac9a55799014e89a8e544cb379ca4'

const hashText = (value: string) => createHash('sha256').update(value).digest('hex')

const getRegistrationCodeHash = (event: H3Event) => {
  const cloudflareEnv = event.context.cloudflare?.env as Record<string, unknown> | undefined
  const configuredCode = cloudflareEnv?.REGISTRATION_INVITE_CODE

  if (typeof configuredCode === 'string' && configuredCode.trim()) {
    return hashText(configuredCode.trim())
  }

  const envCode = process.env.REGISTRATION_INVITE_CODE

  if (typeof envCode === 'string' && envCode.trim()) {
    return hashText(envCode.trim())
  }

  return DEFAULT_REGISTRATION_CODE_HASH
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string; verifyCode?: string }>(event)
  const username = body.username?.trim() ?? ''
  const password = body.password ?? ''
  const verifyCode = body.verifyCode?.trim() ?? ''

  if (!username || !password || !verifyCode) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Username, password, and registration code are required.'
    })
  }

  if (hashText(verifyCode) !== getRegistrationCodeHash(event)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Invalid registration code.'
    })
  }

  const existingUser = await findUserByUsername(event, username)

  if (existingUser) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Username already exists.'
    })
  }

  const passwordHash = hashPassword(password)
  const user = await createUserWithBoard(event, username, passwordHash, JSON.stringify(defaultBoardPayload()))

  await createSession(event, user.id)

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username
    }
  }
})
