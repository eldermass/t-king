export default defineNuxtConfig({
  compatibilityDate: '2026-05-29',
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  runtimeConfig: {
    PUSHDEER_PUSHKEY: ''
  },
  nitro: {
    preset: 'cloudflare_pages'
  }
})
