import type { H3Event } from 'h3'

type PushDeerResponse = {
  code: number
  error?: string | null
  content?: {
    result?: Array<unknown>
  }
}

export type PushDeerConfig = {
  pushKey: string
}

const readConfig = (source: Record<string, unknown> | undefined): PushDeerConfig | null => {
  const pushKey = source?.PUSHDEER_PUSHKEY

  if (!pushKey) {
    return null
  }

  return {
    pushKey: String(pushKey)
  }
}

export const getPushDeerConfig = (event?: H3Event) => {
  const cloudflareEnv = event?.context.cloudflare?.env as Record<string, unknown> | undefined
  const cloudflareConfig = readConfig(cloudflareEnv)

  if (cloudflareConfig) {
    return cloudflareConfig
  }

  const runtimeConfig = event ? useRuntimeConfig(event) as Record<string, unknown> : undefined
  const runtimePushConfig = readConfig(runtimeConfig)

  if (runtimePushConfig) {
    return runtimePushConfig
  }

  if (typeof process !== 'undefined' && process?.env) {
    return readConfig(process.env as Record<string, unknown>)
  }

  return null
}

export const sendPushDeerMarkdownMessage = async (config: PushDeerConfig, text: string, desp: string) => {
  const response = await $fetch<PushDeerResponse>('https://api2.pushdeer.com/message/push', {
    method: 'POST',
    body: {
      pushkey: config.pushKey,
      text,
      desp,
      type: 'markdown'
    }
  })

  if (response.code !== 0) {
    throw createError({
      statusCode: 502,
      statusMessage: `PushDeer send failed: ${response.error || `code ${response.code}`}`
    })
  }
}
