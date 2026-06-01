type WecomTokenResponse = {
  errcode: number
  errmsg: string
  access_token?: string
  expires_in?: number
}

type WecomSendResponse = {
  errcode: number
  errmsg: string
}

export type WecomConfig = {
  corpId: string
  agentId: string
  secret: string
  userId: string
}

const readConfig = (source: Record<string, any> | undefined): WecomConfig | null => {
  const corpId = source?.WECOM_CORP_ID
  const agentId = source?.WECOM_AGENT_ID
  const secret = source?.WECOM_SECRET
  const userId = source?.WECOM_USER_ID

  if (!corpId || !agentId || !secret || !userId) {
    return null
  }

  return {
    corpId: String(corpId),
    agentId: String(agentId),
    secret: String(secret),
    userId: String(userId)
  }
}

export const getWecomConfigFromEnv = (source?: Record<string, any>) =>
  readConfig(source ?? (process.env as Record<string, any>))

export const fetchWecomAccessToken = async (config: WecomConfig) => {
  const response = await $fetch<WecomTokenResponse>('https://qyapi.weixin.qq.com/cgi-bin/gettoken', {
    query: {
      corpid: config.corpId,
      corpsecret: config.secret
    }
  })

  if (response.errcode !== 0 || !response.access_token) {
    throw new Error(`WeCom gettoken failed: ${response.errcode} ${response.errmsg}`)
  }

  return response.access_token
}

export const sendWecomMarkdownMessage = async (config: WecomConfig, markdown: string) => {
  const accessToken = await fetchWecomAccessToken(config)
  const response = await $fetch<WecomSendResponse>('https://qyapi.weixin.qq.com/cgi-bin/message/send', {
    method: 'POST',
    query: {
      access_token: accessToken
    },
    body: {
      touser: config.userId,
      msgtype: 'markdown',
      agentid: Number(config.agentId),
      markdown: {
        content: markdown
      },
      safe: 0
    }
  })

  if (response.errcode !== 0) {
    throw new Error(`WeCom send failed: ${response.errcode} ${response.errmsg}`)
  }
}
