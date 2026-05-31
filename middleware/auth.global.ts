export default defineNuxtRouteMiddleware(async (to) => {
  const userAgent = import.meta.server
    ? useRequestHeaders(['user-agent'])['user-agent'] ?? ''
    : navigator.userAgent
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent)

  if (isMobile && to.path === '/') {
    return navigateTo({
      path: '/h5',
      query: to.query
    }, { replace: true })
  }

  if (to.path === '/login') {
    return
  }

  if (import.meta.server) {
    return
  }

  const session = useState<{ authenticated: boolean; user?: { id: string; username: string } } | null>('auth-session', () => null)

  if (session.value?.authenticated) {
    return
  }

  try {
    const response = await $fetch<{ authenticated: boolean; user?: { id: string; username: string } }>('/api/auth/session')
    session.value = response

    if (!response.authenticated) {
      return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
    }
  } catch {
    session.value = { authenticated: false }
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
