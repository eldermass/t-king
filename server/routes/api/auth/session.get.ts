import { getAuthenticatedUser } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getAuthenticatedUser(event)

  if (!user) {
    return {
      authenticated: false
    }
  }

  return {
    authenticated: true,
    user: {
      id: user.id,
      username: user.username
    }
  }
})
