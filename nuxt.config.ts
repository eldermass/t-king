export default defineNuxtConfig({
  compatibilityDate: '2026-05-29',
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  runtimeConfig: {
    WECOM_CORP_ID: '',
    WECOM_AGENT_ID: '',
    WECOM_SECRET: '',
    WECOM_USER_ID: ''
  },
  nitro: {
    preset: 'cloudflare_pages'
  }
})
