import { requireUser } from '~/server/utils/auth'
import { normalizeBoardPayload } from '~/server/utils/board'
import { getBoardPayloadByUserId } from '~/server/utils/repo'
import { getWecomConfigFromEnv, sendWecomMarkdownMessage } from '~/server/utils/wecom'

const buildTestMessage = (username: string, stockCount: number) => [
  '# 企业微信测试提醒',
  `> 用户：${username}`,
  `监控股票数：${stockCount}`,
  `时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`,
  '这是一条手动测试消息，说明当前企业微信推送链路可用。'
].join('\n')

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const config = getWecomConfigFromEnv(useRuntimeConfig(event))

  if (!config) {
    throw createError({
      statusCode: 500,
      statusMessage: 'WeCom config missing'
    })
  }

  const row = await getBoardPayloadByUserId(event, user.id)
  const payload = row?.payload ? normalizeBoardPayload(JSON.parse(row.payload)) : null
  const stockCount = payload?.stocks.length ?? 0

  await sendWecomMarkdownMessage(config, buildTestMessage(user.username, stockCount))

  return {
    ok: true,
    sentAt: new Date().toISOString(),
    stockCount
  }
})
