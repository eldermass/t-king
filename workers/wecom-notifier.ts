type BuyEntry = {
  id: string
  buyPrice: number | null
  targetRate: number
}

type DipAlert = {
  id: string
  dropRate: number
}

type StockCard = {
  id: string
  name: string
  code: string
  recommendedDipAlertId?: string | null
  buyEntries: BuyEntry[]
  dipAlerts: DipAlert[]
}

type ActiveReminder = {
  key: string
  kind: 'dip' | 'sell'
  stockId: string
  stockName: string
  stockCode: string
  triggerId: string
  stockFingerprint: string
  triggerPrice: number | null
  lastSentAt: string | null
}

type NotificationSettings = {
  enabled: boolean
  activeReminders: Record<string, ActiveReminder>
}

type BoardPayload = {
  stocks: StockCard[]
  alerts?: Record<string, unknown>
  notifications?: NotificationSettings
}

type QuoteSnapshot = {
  name: string
  price: number | null
  changePercent: number | null
}

type Env = {
  DB: D1Database
  PUSHDEER_PUSHKEY: string
}

type BoardRow = {
  user_id: string
  payload: string
  updated_at: string
}

type EastmoneyResponse = {
  data?: {
    f43?: number
    f58?: string
    f60?: number
    f169?: number
    f170?: number
  }
}

type PushDeerResponse = {
  code: number
  error?: string | null
}

const REPEAT_MS = 5 * 60 * 1000

const normalizeCode = (code: string) => code.trim().replace(/[^\d]/g, '').slice(0, 6)
const isValidCode = (code: string) => /^(0|3|6)\d{5}$/.test(code)
const roundPrice = (value: number) => Math.round(value * 10000) / 10000
const toSecid = (code: string) => code.startsWith('6') ? `1.${code}` : `0.${code}`
const toPrice = (value?: number) => typeof value === 'number' ? value / 100 : null

const formatPrice = (value: number | null) => value === null ? '--' : value.toFixed(2)
const formatPercent = (value: number | null) => value === null ? '--' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`

const plannedSellPrice = (entry: BuyEntry) => {
  if (entry.buyPrice === null || entry.buyPrice <= 0) {
    return null
  }

  return roundPrice(entry.buyPrice * (1 + entry.targetRate / 100))
}

const referencePrice = (stock: StockCard) => {
  const prices = stock.buyEntries
    .map((entry) => entry.buyPrice)
    .filter((price): price is number => price !== null && price > 0)

  return prices.length ? Math.min(...prices) : null
}

const dipPrice = (basePrice: number | null, dropRate: number) => {
  if (basePrice === null || basePrice <= 0) {
    return null
  }

  return roundPrice(basePrice * (1 + dropRate / 100))
}

const stockFingerprint = (stock: StockCard) =>
  JSON.stringify({
    name: stock.name.trim(),
    code: normalizeCode(stock.code),
    buyEntries: stock.buyEntries.map((entry) => ({
      buyPrice: entry.buyPrice,
      targetRate: entry.targetRate
    })),
    recommendedDipAlertId: stock.recommendedDipAlertId ?? null,
    dipAlerts: stock.dipAlerts.map((alert) => ({
      id: alert.id,
      dropRate: alert.dropRate
    }))
  })

const normalizeStock = (input: any): StockCard | null => {
  if (!input || typeof input !== 'object') {
    return null
  }

  return {
    id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
    name: typeof input.name === 'string' ? input.name : '',
    code: typeof input.code === 'string' ? input.code : '',
    recommendedDipAlertId: typeof input.recommendedDipAlertId === 'string' ? input.recommendedDipAlertId : null,
    buyEntries: Array.isArray(input.buyEntries)
      ? input.buyEntries.map((entry: any) => ({
          id: typeof entry?.id === 'string' ? entry.id : crypto.randomUUID(),
          buyPrice: typeof entry?.buyPrice === 'number' ? entry.buyPrice : null,
          targetRate: typeof entry?.targetRate === 'number' ? entry.targetRate : 3
        }))
      : [],
    dipAlerts: Array.isArray(input.dipAlerts)
      ? input.dipAlerts.map((alert: any) => ({
          id: typeof alert?.id === 'string' ? alert.id : crypto.randomUUID(),
          dropRate: typeof alert?.dropRate === 'number' ? alert.dropRate : -3
        }))
      : []
  }
}

const normalizeNotifications = (input: any): NotificationSettings => {
  const activeReminders: Record<string, ActiveReminder> = {}

  if (input && typeof input === 'object' && input.activeReminders && typeof input.activeReminders === 'object') {
    for (const [key, reminder] of Object.entries(input.activeReminders as Record<string, any>)) {
      if (!reminder || typeof reminder !== 'object') {
        continue
      }

      activeReminders[key] = {
        key,
        kind: reminder.kind === 'sell' ? 'sell' : 'dip',
        stockId: typeof reminder.stockId === 'string' ? reminder.stockId : '',
        stockName: typeof reminder.stockName === 'string' ? reminder.stockName : '',
        stockCode: typeof reminder.stockCode === 'string' ? reminder.stockCode : '',
        triggerId: typeof reminder.triggerId === 'string' ? reminder.triggerId : '',
        stockFingerprint: typeof reminder.stockFingerprint === 'string' ? reminder.stockFingerprint : '',
        triggerPrice: typeof reminder.triggerPrice === 'number' ? reminder.triggerPrice : null,
        lastSentAt: typeof reminder.lastSentAt === 'string' ? reminder.lastSentAt : null
      }
    }
  }

  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : true,
    activeReminders
  }
}

const normalizePayload = (input: unknown): BoardPayload | null => {
  if (!input || typeof input !== 'object') {
    return null
  }

  const payload = input as Record<string, any>
  const stocks = Array.isArray(payload.stocks)
    ? payload.stocks.map(normalizeStock).filter((item): item is StockCard => Boolean(item))
    : []

  return {
    ...payload,
    stocks,
    notifications: normalizeNotifications(payload.notifications)
  }
}

const isTradingTime = (now = new Date()) => {
  const weekday = now.getUTCDay()

  if (weekday === 0 || weekday === 6) {
    return false
  }

  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes()

  const morning = minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30
  const afternoon = minutes >= 13 * 60 && minutes <= 15 * 60

  return morning || afternoon
}

const fetchQuotes = async (codes: string[]) => {
  const normalizedCodes = [...new Set(codes.map(normalizeCode).filter(isValidCode))]
  const entries = await Promise.all(
    normalizedCodes.map(async (code) => {
      try {
        const response = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${toSecid(code)}&fields=f43,f58,f60,f169,f170`, {
          headers: {
            referer: 'https://quote.eastmoney.com/',
            'user-agent': 'Mozilla/5.0'
          }
        })

        const json = await response.json() as EastmoneyResponse
        const data = json.data
        const price = toPrice(data?.f43)
        const previousClose = toPrice(data?.f60)
        const changePercent = typeof data?.f170 === 'number'
          ? data.f170 / 100
          : price !== null && previousClose
            ? ((price - previousClose) / previousClose) * 100
            : null

        return [code, { name: data?.f58 ?? code, price, changePercent }] as const
      } catch (error) {
        console.log(`quote fetch failed for ${code}`, error)
        return [code, { name: code, price: null, changePercent: null }] as const
      }
    })
  )

  return Object.fromEntries(entries) as Record<string, QuoteSnapshot>
}

const createReminder = (
  kind: 'dip' | 'sell',
  stock: StockCard,
  quote: QuoteSnapshot | undefined,
  triggerId: string,
  triggerPrice: number | null,
  previous: ActiveReminder | undefined
): ActiveReminder => ({
  key: `${stock.id}:${kind}:${triggerId}`,
  kind,
  stockId: stock.id,
  stockName: stock.name.trim() || quote?.name || normalizeCode(stock.code),
  stockCode: normalizeCode(stock.code),
  triggerId,
  stockFingerprint: stockFingerprint(stock),
  triggerPrice,
  lastSentAt: previous?.lastSentAt ?? null
})

const reconcileNotifications = (payload: BoardPayload, quotes: Record<string, QuoteSnapshot>, now: Date) => {
  const current = normalizeNotifications(payload.notifications)
  const next: NotificationSettings = {
    enabled: current.enabled,
    activeReminders: {}
  }

  for (const stock of payload.stocks) {
    const code = normalizeCode(stock.code)
    const quote = quotes[code]

    if (!quote || quote.price === null) {
      continue
    }

    for (const alert of stock.dipAlerts) {
      const triggerPrice = dipPrice(referencePrice(stock), alert.dropRate)

      if (triggerPrice !== null && quote.price <= triggerPrice) {
        const key = `${stock.id}:dip:${alert.id}`
        next.activeReminders[key] = createReminder('dip', stock, quote, alert.id, triggerPrice, current.activeReminders[key])
      }
    }

    for (const entry of stock.buyEntries) {
      const triggerPrice = plannedSellPrice(entry)

      if (triggerPrice !== null && quote.price >= triggerPrice) {
        const key = `${stock.id}:sell:${entry.id}`
        next.activeReminders[key] = createReminder('sell', stock, quote, entry.id, triggerPrice, current.activeReminders[key])
      }
    }
  }

  const due = !next.enabled || !isTradingTime(now)
    ? []
    : Object.values(next.activeReminders).filter((reminder) => {
        if (!reminder.lastSentAt) {
          return true
        }

        return now.getTime() - new Date(reminder.lastSentAt).getTime() >= REPEAT_MS
      })

  return { next, due }
}

const sendPushDeerMessage = async (env: Env, title: string, body: string) => {
  const response = await fetch('https://api2.pushdeer.com/message/push', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      pushkey: env.PUSHDEER_PUSHKEY,
      text: title,
      desp: body,
      type: 'markdown'
    })
  })

  const json = await response.json() as PushDeerResponse

  if (json.code !== 0) {
    throw new Error(`PushDeer send failed: ${json.error ?? `code ${json.code}`}`)
  }
}

const buildMessageTitle = (reminder: ActiveReminder) => reminder.kind === 'dip' ? '补仓提醒' : '卖出提醒'

const buildMessageBody = (reminder: ActiveReminder, quote: QuoteSnapshot | undefined) => [
  `# ${buildMessageTitle(reminder)}`,
  `> ${reminder.stockName} ${reminder.stockCode}`,
  `当前价：${formatPrice(quote?.price ?? null)} (${formatPercent(quote?.changePercent ?? null)})`,
  `触发价：${formatPrice(reminder.triggerPrice)}`,
  `时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`
].join('\n')

const processBoard = async (env: Env, row: BoardRow, quotes: Record<string, QuoteSnapshot>, now: Date) => {
  let parsed: BoardPayload | null = null

  try {
    parsed = normalizePayload(JSON.parse(row.payload))
  } catch (error) {
    console.log(`board payload parse failed for ${row.user_id}`, error)
    return
  }

  if (!parsed) {
    return
  }

  const { next, due } = reconcileNotifications(parsed, quotes, now)
  let changed = JSON.stringify(parsed.notifications ?? {}) !== JSON.stringify(next)

  for (const reminder of due) {
    const quote = quotes[normalizeCode(reminder.stockCode)]

    try {
      await sendPushDeerMessage(env, buildMessageTitle(reminder), buildMessageBody(reminder, quote))
      next.activeReminders[reminder.key].lastSentAt = now.toISOString()
      changed = true
    } catch (error) {
      console.log(`pushdeer send failed for ${reminder.key}`, error)
    }
  }

  if (!changed) {
    return
  }

  const nextPayload: BoardPayload = {
    ...parsed,
    notifications: next
  }

  await env.DB
    .prepare('INSERT OR REPLACE INTO boards (user_id, payload, updated_at) VALUES (?, ?, ?)')
    .bind(row.user_id, JSON.stringify(nextPayload), now.toISOString())
    .run()
}

const runNotifier = async (env: Env) => {
  const result = await env.DB.prepare('SELECT user_id, payload, updated_at FROM boards').all<BoardRow>()
  const rows = result.results ?? []

  if (!rows.length) {
    return { boards: 0, reminders: 0 }
  }

  const codes = rows.flatMap((row) => {
    try {
      const payload = normalizePayload(JSON.parse(row.payload))
      return payload?.stocks.map((stock) => normalizeCode(stock.code)).filter(isValidCode) ?? []
    } catch {
      return []
    }
  })

  const quotes = await fetchQuotes(codes)
  const now = new Date()

  for (const row of rows) {
    await processBoard(env, row, quotes, now)
  }

  return { boards: rows.length, quotes: Object.keys(quotes).length }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === '/__run') {
      const summary = await runNotifier(env)
      return new Response(JSON.stringify({ ok: true, ...summary }), {
        headers: {
          'content-type': 'application/json'
        }
      })
    }

    return new Response('t-king notifier ready')
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runNotifier(env))
  }
}
