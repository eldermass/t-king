import { requireUser } from '~/server/utils/auth'
import { normalizeBoardPayload } from '~/server/utils/board'
import { getPushDeerConfig, sendPushDeerMarkdownMessage } from '~/server/utils/pushdeer'
import { getBoardPayloadByUserId } from '~/server/utils/repo'

const buildTestMessage = (username: string, stockCount: number) => {
  const title = 'PushDeer 测试提醒'
  const desp = [
    `# ${title}`,
    `> 用户：${username}`,
    `监控股票数：${stockCount}`,
    `时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`,
    '这是一条手动测试消息，说明当前 PushDeer 推送链路可用。'
  ].join('\n')

  return { title, desp }
}

export default defineEventHandler(async (event) => {
  try {
    const user = await requireUser(event)
    const config = getPushDeerConfig(event)

    if (!config) {
      throw createError({
        statusCode: 500,
        statusMessage: 'PushDeer config missing'
      })
    }

    const row = await getBoardPayloadByUserId(event, user.id)
    const payload = row?.payload ? normalizeBoardPayload(JSON.parse(row.payload)) : null
    const stockCount = payload?.stocks.length ?? 0
    const message = buildTestMessage(user.username, stockCount)

    await sendPushDeerMarkdownMessage(config, message.title, message.desp)

    return {
      ok: true,
      sentAt: new Date().toISOString(),
      stockCount
    }
  } catch (error: any) {
    console.error('pushdeer test failed', error)

    if (error?.statusCode && error?.statusMessage) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'PushDeer test failed'
    })
  }
})
