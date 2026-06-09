import {
  dipPrice,
  evaluateStockTriggers,
  normalizeCode,
  plannedSellPrice,
  referencePrice
} from '../shared/reminder-core'

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
  NOTIFIER_RUN_TOKEN?: string
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

type PagesQuoteSnapshot = {
  name?: string
  price: number | null
  previousClose?: number | null
  change?: number | null
  changePercent: number | null
  updatedAt?: string | null
}

type PagesQuoteResponse = Record<string, PagesQuoteSnapshot>

type NotifierSummary = {
  boards: number
  quotes: number
  quoteReady: number
  quoteMissing: number
  changedBoards: number
  activeReminders: number
  dueReminders: number
}

type NotifierRunRow = {
  id: number
  source: string
  status: string
  summary_json: string | null
  error_message: string | null
  created_at: string
}

const REPEAT_MS = 2 * 60 * 1000
const ENFORCE_TRADING_WINDOW = false

const isValidCode = (code: string) => /^(0|3|6)\d{5}$/.test(code)
const toSecid = (code: string) => code.startsWith('6') ? `1.${code}` : `0.${code}`
const toSinaSymbol = (code: string) => code.startsWith('6') ? `sh${code}` : `sz${code}`
const toPrice = (value?: number) => typeof value === 'number' ? value / 100 : null

const formatPrice = (value: number | null) => value === null ? '--' : value.toFixed(2)
const formatPercent = (value: number | null) => value === null ? '--' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`

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

const fetchPagesQuotes = async (codes: string[]) => {
  if (!codes.length) {
    return {}
  }

  try {
    const response = await fetch(`https://t-king.pages.dev/api/quotes?codes=${codes.join(',')}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      throw new Error(`Pages quotes request failed: ${response.status}`)
    }

    const json = await response.json() as PagesQuoteResponse
    const result: Record<string, QuoteSnapshot> = {}

    for (const code of codes) {
      const item = json[code]

      result[code] = {
        name: item?.name?.trim() || code,
        price: typeof item?.price === 'number' ? item.price : null,
        changePercent: typeof item?.changePercent === 'number' ? item.changePercent : null
      }
    }

    return result
  } catch (error) {
    console.log('pages quote fetch failed', error)
    return {}
  }
}

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
  const pagesQuotes = await fetchPagesQuotes(normalizedCodes)
  const fallbackCodes = normalizedCodes.filter((code) => pagesQuotes[code]?.price == null)

  if (!fallbackCodes.length) {
    return pagesQuotes
  }

  const eastmoneyEntries = await Promise.all(
    fallbackCodes.map(async (code) => [code, await fetchEastmoneyQuote(code)] as const)
  )
  const eastmoneyQuotes = Object.fromEntries(eastmoneyEntries) as Record<string, QuoteSnapshot>
  const sinaFallbackCodes = fallbackCodes.filter((code) => eastmoneyQuotes[code]?.price === null)
  const sinaQuotes = await fetchSinaFallbackQuotes(sinaFallbackCodes)

  for (const code of sinaFallbackCodes) {
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

  return {
    ...pagesQuotes,
    ...eastmoneyQuotes
  }
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
    const evaluation = evaluateStockTriggers(stock, quote?.price)

    if (!quote || quote.price === null || quote.price <= 0) {
      continue
    }

    for (const alert of evaluation.triggeredDipAlerts) {
      const key = `${stock.id}:dip:${alert.id}`
      next.activeReminders[key] = createReminder('dip', stock, quote, alert.id, alert.triggerPrice, current.activeReminders[key])
    }

    for (const entry of evaluation.triggeredSellEntries) {
      const key = `${stock.id}:sell:${entry.id}`
      next.activeReminders[key] = createReminder('sell', stock, quote, entry.id, entry.triggerPrice, current.activeReminders[key])
    }
  }

  const due = !next.enabled || (ENFORCE_TRADING_WINDOW && !isTradingTime(now))
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
  const titleMap = new Map<string, Set<'买入' | '卖出'>>()

  for (const reminder of reminders) {
    const stockName = reminder.stockName.trim() || normalizeCode(reminder.stockCode)
    const action = reminder.kind === 'dip' ? '买入' : '卖出'
    const actions = titleMap.get(stockName) ?? new Set<'买入' | '卖出'>()

    actions.add(action)
    titleMap.set(stockName, actions)
  }

  const parts = [...titleMap.entries()].map(([stockName, actions]) => {
    const actionText = [...actions].join('/')
    return `${stockName} ${actionText}`
  })

  return parts.length ? parts.join('，') : '做T操作提醒'
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
    return { changed: false, reminders: 0, due: 0 }
  }

  if (!parsed) {
    return { changed: false, reminders: 0, due: 0 }
  }

  const { next, due } = reconcileNotifications(parsed, quotes, now)
  let changed = JSON.stringify(parsed.notifications ?? {}) !== JSON.stringify(next)
  const pushDeerKey = next.pushDeerKey.trim()
  const reminderCount = Object.keys(next.activeReminders).length

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
    return { changed: false, reminders: reminderCount, due: due.length }
  }

  const nextPayload: BoardPayload = {
    ...parsed,
    notifications: next
  }

  await env.DB
    .prepare('INSERT OR REPLACE INTO boards (user_id, payload, updated_at) VALUES (?, ?, ?)')
    .bind(row.user_id, JSON.stringify(nextPayload), now.toISOString())
    .run()

  return { changed: true, reminders: reminderCount, due: due.length }
}

const ensureRunLogTable = async (env: Env) => {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS notifier_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      summary_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    )
  `).run()
}

const logNotifierRun = async (
  env: Env,
  source: 'scheduled' | 'manual',
  status: 'success' | 'failed',
  createdAt: string,
  summary?: NotifierSummary,
  error?: unknown
) => {
  await ensureRunLogTable(env)

  const errorMessage = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : error
        ? JSON.stringify(error)
        : null

  await env.DB
    .prepare('INSERT INTO notifier_runs (source, status, summary_json, error_message, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(
      source,
      status,
      summary ? JSON.stringify(summary) : null,
      errorMessage,
      createdAt
    )
    .run()
}

const runNotifier = async (env: Env) => {
  const result = await env.DB.prepare('SELECT user_id, payload, updated_at FROM boards').all<BoardRow>()
  const rows = result.results ?? []

  if (!rows.length) {
    return {
      boards: 0,
      quotes: 0,
      quoteReady: 0,
      quoteMissing: 0,
      changedBoards: 0,
      activeReminders: 0,
      dueReminders: 0
    }
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
  let changedBoards = 0
  let activeReminderCount = 0
  let dueReminderCount = 0

  const quoteReadyCount = Object.values(quotes).filter((quote) => quote.price !== null && quote.price > 0).length
  const quoteMissingCount = Object.values(quotes).filter((quote) => quote.price === null || quote.price <= 0).length

  for (const row of rows) {
    const summary = await processBoard(env, row, quotes, now)

    if (summary.changed) {
      changedBoards += 1
    }

    activeReminderCount += summary.reminders
    dueReminderCount += summary.due
  }

  return {
    boards: rows.length,
    quotes: Object.keys(quotes).length,
    quoteReady: quoteReadyCount,
    quoteMissing: quoteMissingCount,
    changedBoards,
    activeReminders: activeReminderCount,
    dueReminders: dueReminderCount
  }
}

const runNotifierWithHeartbeat = async (env: Env, source: 'scheduled' | 'manual') => {
  const createdAt = new Date().toISOString()

  try {
    const summary = await runNotifier(env)
    await logNotifierRun(env, source, 'success', createdAt, summary)
    return summary
  } catch (error) {
    await logNotifierRun(env, source, 'failed', createdAt, undefined, error)
    throw error
  }
}

const getRunStatus = async (env: Env) => {
  await ensureRunLogTable(env)
  const result = await env.DB
    .prepare('SELECT id, source, status, summary_json, error_message, created_at FROM notifier_runs ORDER BY id DESC LIMIT 10')
    .all<NotifierRunRow>()

  return (result.results ?? []).map((row) => ({
    id: row.id,
    source: row.source,
    status: row.status,
    summary: row.summary_json ? JSON.parse(row.summary_json) : null,
    error: row.error_message,
    createdAt: row.created_at
  }))
}

const unauthorizedResponse = () =>
  new Response(JSON.stringify({ ok: false, message: 'Unauthorized' }), {
    status: 401,
    headers: {
      'content-type': 'application/json'
    }
  })

const isAuthorizedRunRequest = (request: Request, env: Env) => {
  const token = env.NOTIFIER_RUN_TOKEN?.trim()

  if (!token) {
    return true
  }

  const url = new URL(request.url)
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const queryToken = url.searchParams.get('token')?.trim()

  return bearer === token || queryToken === token
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === '/__run') {
      if (!isAuthorizedRunRequest(request, env)) {
        return unauthorizedResponse()
      }

      const summary = await runNotifierWithHeartbeat(env, 'manual')
      return new Response(JSON.stringify({ ok: true, ...summary }), {
        headers: {
          'content-type': 'application/json'
        }
      })
    }

    if (url.pathname === '/__status') {
      if (!isAuthorizedRunRequest(request, env)) {
        return unauthorizedResponse()
      }

      const runs = await getRunStatus(env)
      return new Response(JSON.stringify({ ok: true, runs }), {
        headers: {
          'content-type': 'application/json'
        }
      })
    }

    return new Response('t-king notifier ready')
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runNotifierWithHeartbeat(env, 'scheduled'))
  }
}
