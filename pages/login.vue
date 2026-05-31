<script setup lang="ts">
type AuthMode = 'login' | 'register'

const username = ref('')
const password = ref('')
const verifyCode = ref('')
const mode = ref<AuthMode>('login')
const loading = ref(false)
const errorMessage = ref('')
const route = useRoute()
const session = useState<{ authenticated: boolean; user?: { id: string; username: string } } | null>('auth-session', () => null)

const redirectTo = computed(() => {
  const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  return target.startsWith('/') ? target : '/'
})

const isRegisterMode = computed(() => mode.value === 'register')

const switchMode = (nextMode: AuthMode) => {
  mode.value = nextMode
  errorMessage.value = ''

  if (nextMode === 'login') {
    verifyCode.value = ''
  }
}

const submit = async () => {
  if (!username.value.trim() || !password.value) {
    errorMessage.value = '请输入用户名和密码'
    return
  }

  if (isRegisterMode.value && !verifyCode.value.trim()) {
    errorMessage.value = '请输入注册口令'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const response = await $fetch<{ ok: boolean; user: { id: string; username: string } }>(
      isRegisterMode.value ? '/api/auth/register' : '/api/auth/login',
      {
        method: 'POST',
        body: {
          username: username.value,
          password: password.value,
          verifyCode: verifyCode.value
        }
      }
    )

    session.value = {
      authenticated: true,
      user: response.user
    }

    await navigateTo(redirectTo.value)
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || (isRegisterMode.value ? '注册失败' : '登录失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const response = await $fetch<{ authenticated: boolean; user?: { id: string; username: string } }>('/api/auth/session')
    session.value = response

    if (response.authenticated) {
      await navigateTo(redirectTo.value)
    }
  } catch {
    session.value = { authenticated: false }
  }
})
</script>

<template>
  <main class="login-shell">
    <section class="login-panel">
      <div class="login-copy">
        <p class="login-kicker">Stock Board</p>
        <h1>{{ isRegisterMode ? '注册账户' : '登录看板' }}</h1>
        <p>{{ isRegisterMode ? '注册需要管理员提供的专用口令。' : '登录后即可进入你的云端看板。' }}</p>
      </div>

      <div class="login-mode-switch" role="tablist" aria-label="登录方式">
        <button
          class="login-mode-btn"
          :class="{ 'is-active': mode === 'login' }"
          type="button"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          class="login-mode-btn"
          :class="{ 'is-active': mode === 'register' }"
          type="button"
          @click="switchMode('register')"
        >
          注册
        </button>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label class="login-field">
          <span>用户名</span>
          <input v-model="username" type="text" autocomplete="username" placeholder="请输入用户名" />
        </label>

        <label class="login-field">
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" />
        </label>

        <label v-if="isRegisterMode" class="login-field">
          <span>注册口令</span>
          <input v-model="verifyCode" type="password" autocomplete="off" placeholder="请输入管理员口令" />
        </label>

        <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>

        <button class="primary-btn login-submit" type="submit" :disabled="loading">
          {{ loading ? (isRegisterMode ? '注册中...' : '登录中...') : (isRegisterMode ? '注册并进入' : '登录') }}
        </button>
      </form>
    </section>
  </main>
</template>
