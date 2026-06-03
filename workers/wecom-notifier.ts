type BuyEntry = {
  id: string
  buyPrice: number | null
  targetRate: number
  lots: number | null
  autoBudget: number
  lotsManual: boolean
}

type DipAlert = {
  id: string
  dropRate: number
}

type StockCard = {
  id: string
  name: string
  code: string
  subIndustry: string
  primaryTheme: string
  secondaryTheme: string
  coreBusiness: string
  recommendedDipAlertId?: string | null
  profileInitializedCode?: string | null
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
  pushDeerKey: string
  noticeText: string
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

type ReminderSummaryItem = {
  stockName: string
  quote: QuoteSnapshot | undefined
  triggerLabels: string[]
}

const REPEAT_MS = 3 * 60 * 1000

const normalizeCode = (code: string) => code.trim().replace(/[^\d]/g, '').slice(0, 6)
const isValidCode = (code: string) => /^(0|3|6)\d{5}$/.test(code)
const roundPrice = (value: number) => Math.round(value * 10000) / 10000
const toSecid = (code: string) => code.startsWith('6') ? `1.${code}` : `0.${code}`
const toSinaSymbol = (code: string) => code.startsWith('6') ? `sh${code}` : `sz${code}`
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
      id: entry.id,
      buyPrice: entry.buyPrice,
      targetRate: entry.targetRate,
      lots: entry.lots
    })),
    recommendedDipAlertId: stock.recommendedDipAlertId ?? null,
    profileInitializedCode: stock.profileInitializedCode ?? null,
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
    subIndustry: typeof input.subIndustry === 'string' ? input.subIndustry : '',
    primaryTheme: typeof input.primaryTheme === 'string' ? input.primaryTheme : '',
    secondaryTheme: typeof input.secondaryTheme === 'string' ? input.secondaryTheme : '',
    coreBusiness: typeof input.coreBusiness === 'string' ? input.coreBusiness : '',
    recommendedDipAlertId: typeof input.recommendedDipAlertId === 'string' ? input.recommendedDipAlertId : null,
    profileInitializedCode: typeof input.profileInitializedCode === 'string' ? input.profileInitializedCode : null,
    buyEntries: Array.isArray(input.buyEntries)
      ? input.buyEntries.map((entry: any) => ({
          id: typeof entry?.id === 'string' ? entry.id : crypto.randomUUID(),
          buyPrice: typeof entry?.buyPrice === 'number' ? entry.buyPrice : null,
          targetRate: typeof entry?.targetRate === 'number' ? entry.targetRate : 3,
          lots: typeof entry?.lots === 'number' ? entry.lots : null,
          autoBudget: typeof entry?.autoBudget === 'number' ? entry.autoBudget : 10_000,
          lotsManual: typeof entry?.lotsManual === 'boolean' ? entry.lotsManual : typeof entry?.lots === 'number'
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
    pushDeerKey: typeof input?.pushDeerKey === 'string' ? input.pushDeerKey : '',
    noticeText: typeof input?.noticeText === 'string' ? input.noticeText : '',
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

const parsePositiveNumber = (value: string | undefined) => {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const emptyQuote = (code: string): QuoteSnapshot => ({
  name: code,
  price: null,
  changePercent: null
})

const fetchEastmoneyQuote = async (code: string): Promise<QuoteSnapshot> => {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${toSecid(code)}&fields=f43,f58,f60,f169,f170`, {
        headers: {
          referer: 'https://quote.eastmoney.com/',
          'user-agent': 'Mozilla/5.0'
        },
        signal: AbortSignal.timeout(3500)
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

      if (price !== null) {
        return {
          name: data?.f58 ?? code,
          price,
          changePercent
        }
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    console.log(`eastmoney quote fetch failed for ${code}`, lastError)
  }

  return emptyQuote(code)
}

const fetchSinaFallbackQuotes = async (codes: string[]) => {
  if (!codes.length) {
    return {}
  }

  try {
    const response = await fetch(`https://hq.sinajs.cn/list=${codes.map(toSinaSymbol).join(',')}`, {
      headers: {
        referer: 'https://finance.sina.com.cn/',
        'user-agent': 'Mozilla/5.0'
      },
      signal: AbortSignal.timeout(3500)
    })

    const text = await response.text()
    const quotes: Record<string, QuoteSnapshot> = {}
    const linePattern = /var hq_str_(sh|sz)(\d{6})="([^"]*)";/g
    let match: RegExpExecArray | null = null

    while ((match = linePattern.exec(text))) {
      const code = match[2]
      const values = match[3].split(',')
      const name = values[0]?.trim() || code
      const previousClose = parsePositiveNumber(values[2])
      const price = parsePositiveNumber(values[3])
      const changePercent = price !== null && previousClose
        ? ((price - previousClose) / previousClose) * 100
        : null

      quotes[code] = {
        name,
        price,
        changePercent
      }
    }

    return quotes
  } catch (error) {
    console.log('sina fallback quote fetch failed', error)
    return {}
  }
}

const fetchQuotes = async (codes: string[]) => {
  const normalizedCodes = [...new Set(codes.map(normalizeCode).filter(isValidCode))]
  const eastmoneyEntries = await Promise.all(
    normalizedCodes.map(async (code) => [code, await fetchEastmoneyQuote(code)] as const)
  )
  const eastmoneyQuotes = Object.fromEntries(eastmoneyEntries) as Record<string, QuoteSnapshot>
  const fallbackCodes = normalizedCodes.filter((code) => eastmoneyQuotes[code]?.price === null)
  const sinaQuotes = await fetchSinaFallbackQuotes(fallbackCodes)

  for (const code of fallbackCodes) {
    const fallbackQuote = sinaQuotes[code]

    if (fallbackQuote?.price !== null && fallbackQuote?.price !== undefined) {
      eastmoneyQuotes[code] = {
        ...fallbackQuote,
        name: eastmoneyQuotes[code]?.name && eastmoneyQuotes[code].name !== code
          ? eastmoneyQuotes[code].name
          : fallbackQuote.name
      }
    }
  }

  return eastmoneyQuotes
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
    pushDeerKey: current.pushDeerKey,
    noticeText: current.noticeText,
    activeReminders: {}
  }
  const pushDeerKey = current.pushDeerKey.trim()

  if (!pushDeerKey) {
    return { next, due: [] }
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

const sendPushDeerMessage = async (pushKey: string, title: string, body: string) => {
  const response = await fetch('https://api2.pushdeer.com/message/push', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      pushkey: pushKey,
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

const comparePrice = (left: number | null, right: number | null) => {
  if (left === null && right === null) {
    return 0
  }

  if (left === null) {
    return 1
  }

  if (right === null) {
    return -1
  }

  return left - right
}

const formatTriggerPrices = (prices: Array<number | null>) => {
  const unique = [...new Set(prices.filter((price): price is number => price !== null))]

  if (!unique.length) {
    return '--'
  }

  return unique
    .sort((left, right) => comparePrice(left, right))
    .map((price) => formatPrice(price))
    .join(' / ')
}

const formatTriggerLabel = (price: number | null, percent: number | null) => {
  const priceText = formatPrice(price)
  const percentText = percent === null ? '' : `（${formatPercent(percent)}）`
  return `${priceText}${percentText}`
}

const formatTriggerLabels = (labels: string[]) => {
  const unique = [...new Set(labels.filter((label) => label.trim().length > 0))]
  return unique.length ? unique.join(' / ') : '--'
}

const buildBatchMessageTitle = (reminders: ActiveReminder[]) => {
  const stockCount = new Set(reminders.map((reminder) => reminder.stockId)).size
  return `做T操作提醒（${stockCount}只）`
}

const buildBatchMessageBody = (
  reminders: ActiveReminder[],
  quotes: Record<string, QuoteSnapshot>,
  now: Date,
  noticeText: string
) => {
  const buyMap = new Map<string, ReminderSummaryItem>()
  const sellMap = new Map<string, ReminderSummaryItem>()

  for (const reminder of reminders) {
    const quote = quotes[normalizeCode(reminder.stockCode)]
    const targetMap = reminder.kind === 'dip' ? buyMap : sellMap
    const current = targetMap.get(reminder.stockId)
    let percent: number | null = null

    try {
      const snapshot = JSON.parse(reminder.stockFingerprint) as {
        buyEntries?: Array<{ id?: string, targetRate?: number }>
        dipAlerts?: Array<{ id?: string, dropRate?: number }>
      }

      if (reminder.kind === 'dip') {
        percent = snapshot.dipAlerts?.find((alert) => alert.id === reminder.triggerId)?.dropRate ?? null
      } else {
        percent = snapshot.buyEntries?.find((entry) => entry.id === reminder.triggerId)?.targetRate ?? null
      }
    } catch {
      percent = null
    }

    const triggerLabel = formatTriggerLabel(reminder.triggerPrice, percent)

    if (current) {
      current.triggerLabels.push(triggerLabel)
      continue
    }

    targetMap.set(reminder.stockId, {
      stockName: reminder.stockName,
      quote,
      triggerLabels: [triggerLabel]
    })
  }

  const body: string[] = [
    `# ${noticeText.trim() || '做T操作提醒'}`,
    `> ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`
  ]

  if (buyMap.size) {
    body.push('', '## 买入')

    for (const item of [...buyMap.values()].sort((left, right) => left.stockName.localeCompare(right.stockName, 'zh-CN'))) {
      body.push(
        `- ${item.stockName}：现价 ${formatPrice(item.quote?.price ?? null)}（${formatPercent(item.quote?.changePercent ?? null)}），参考买入 ${formatTriggerLabels(item.triggerLabels)}`
      )
    }
  }

  if (sellMap.size) {
    body.push('', '## 卖出')

    for (const item of [...sellMap.values()].sort((left, right) => left.stockName.localeCompare(right.stockName, 'zh-CN'))) {
      body.push(
        `- ${item.stockName}：现价 ${formatPrice(item.quote?.price ?? null)}（${formatPercent(item.quote?.changePercent ?? null)}），参考卖出 ${formatTriggerLabels(item.triggerLabels)}`
      )
    }
  }

  return body.join('\n')
}

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
  const pushDeerKey = next.pushDeerKey.trim()

  if (due.length && pushDeerKey) {
    const activeReminders = Object.values(next.activeReminders)

    try {
      await sendPushDeerMessage(
        pushDeerKey,
        buildBatchMessageTitle(activeReminders),
        buildBatchMessageBody(activeReminders, quotes, now, next.noticeText)
      )

      for (const reminder of activeReminders) {
        next.activeReminders[reminder.key].lastSentAt = now.toISOString()
      }

      changed = true
    } catch (error) {
      console.log(`pushdeer batch send failed for ${row.user_id}`, error)
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
