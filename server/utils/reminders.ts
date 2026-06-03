import type { ActiveReminder, AlertState, BoardPayload, NotificationSettings, ReminderKind, StockCard } from '~/composables/useStockBoard'
import type { QuoteSnapshot } from '~/server/utils/quotes'

const RECOMMENDED_ADD_RATE = -4
const REMINDER_REPEAT_MS = 5 * 60 * 1000

const roundPrice = (value: number) => Math.round(value * 10000) / 10000
const normalizeCode = (code: string) => code.trim().replace(/[^\d]/g, '').slice(0, 6)

const stockFingerprint = (stock: StockCard) =>
  JSON.stringify({
    name: stock.name.trim(),
    code: normalizeCode(stock.code),
    buyEntries: stock.buyEntries.map((entry) => ({
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

export const plannedSellPrice = (entry: StockCard['buyEntries'][number]) => {
  if (entry.buyPrice === null || entry.buyPrice <= 0) {
    return null
  }

  return roundPrice(entry.buyPrice * (1 + entry.targetRate / 100))
}

export const referencePrice = (stock: StockCard) => {
  const prices = stock.buyEntries
    .map((entry) => entry.buyPrice)
    .filter((price): price is number => price !== null && price > 0)

  return prices.length ? Math.min(...prices) : null
}

export const dipPrice = (basePrice: number | null, dropRate: number) => {
  if (basePrice === null || basePrice <= 0) {
    return null
  }

  return roundPrice(basePrice * (1 + dropRate / 100))
}

const stockDisplayName = (stock: StockCard, quote: QuoteSnapshot | undefined) =>
  stock.name.trim() || quote?.name?.trim() || normalizeCode(stock.code) || '未命名股票'

const createReminder = (
  kind: ReminderKind,
  stock: StockCard,
  quote: QuoteSnapshot | undefined,
  triggerId: string,
  triggerPrice: number | null
): ActiveReminder => {
  const code = normalizeCode(stock.code)
  const name = stockDisplayName(stock, quote)
  const key = `${stock.id}:${kind}:${triggerId}`

  return {
    key,
    kind,
    stockId: stock.id,
    stockName: name,
    stockCode: code,
    triggerId,
    stockFingerprint: stockFingerprint(stock),
    triggerPrice,
    lastSentAt: null
  }
}

const isTradingSession = (date: Date) => {
  const weekday = date.getUTCDay()

  if (weekday === 0 || weekday === 6) {
    return false
  }

  const shanghaiNow = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const minutes = shanghaiNow.getUTCHours() * 60 + shanghaiNow.getUTCMinutes()

  const morningOpen = 9 * 60 + 30
  const morningClose = 11 * 60 + 30
  const afternoonOpen = 13 * 60
  const afternoonClose = 15 * 60

  return (minutes >= morningOpen && minutes <= morningClose) || (minutes >= afternoonOpen && minutes <= afternoonClose)
}

const isReminderStillTriggered = (stock: StockCard, quote: QuoteSnapshot | undefined, reminder: ActiveReminder) => {
  if (quote?.price === null || quote?.price === undefined) {
    return false
  }

  if (reminder.kind === 'dip') {
    const alert = stock.dipAlerts.find((item) => item.id === reminder.triggerId)

    if (!alert) {
      return false
    }

    const price = dipPrice(referencePrice(stock), alert.dropRate)
    return price !== null && quote.price <= price
  }

  const entry = stock.buyEntries.find((item) => item.id === reminder.triggerId)

  if (!entry) {
    return false
  }

  const price = plannedSellPrice(entry)
  return price !== null && quote.price >= price
}

const formatPrice = (value: number | null) => value === null ? '--' : value.toFixed(2)

const formatPercent = (value: number | null) => value === null ? '--' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`

export const buildTriggeredReminders = (payload: BoardPayload, quotes: Record<string, QuoteSnapshot>) => {
  const reminders: ActiveReminder[] = []

  for (const stock of payload.stocks) {
    const code = normalizeCode(stock.code)
    const quote = quotes[code]

    if (!quote || quote.price === null) {
      continue
    }

    for (const alert of stock.dipAlerts) {
      const triggerPrice = dipPrice(referencePrice(stock), alert.dropRate)

      if (triggerPrice !== null && quote.price <= triggerPrice) {
        reminders.push(createReminder('dip', stock, quote, alert.id, triggerPrice))
      }
    }

    for (const entry of stock.buyEntries) {
      const triggerPrice = plannedSellPrice(entry)

      if (triggerPrice !== null && quote.price >= triggerPrice) {
        reminders.push(createReminder('sell', stock, quote, entry.id, triggerPrice))
      }
    }
  }

  return reminders
}

export const reconcileNotificationSettings = (
  payload: BoardPayload,
  quotes: Record<string, QuoteSnapshot>,
  now = new Date()
) => {
  const nextSettings: NotificationSettings = {
    enabled: payload.notifications?.enabled ?? true,
    pushDeerKey: payload.notifications?.pushDeerKey ?? '',
    noticeText: payload.notifications?.noticeText ?? '',
    activeReminders: {}
  }

  const stockMap = new Map(payload.stocks.map((stock) => [stock.id, stock]))
  const existing = payload.notifications?.activeReminders ?? {}
  const triggered = buildTriggeredReminders(payload, quotes)

  for (const reminder of triggered) {
    const current = existing[reminder.key]
    nextSettings.activeReminders[reminder.key] = current
      ? {
          ...reminder,
          lastSentAt: current.lastSentAt
        }
      : reminder
  }

  for (const reminder of Object.values(existing)) {
    const stock = stockMap.get(reminder.stockId)
    const quote = quotes[normalizeCode(reminder.stockCode)]

    if (!stock || !isReminderStillTriggered(stock, quote, reminder)) {
      continue
    }

    if (!nextSettings.activeReminders[reminder.key]) {
      nextSettings.activeReminders[reminder.key] = reminder
    }
  }

  const shouldSend = nextSettings.enabled && isTradingSession(now)
  const dueReminders = shouldSend
    ? Object.values(nextSettings.activeReminders).filter((reminder) => {
        if (!reminder.lastSentAt) {
          return true
        }

        return now.getTime() - new Date(reminder.lastSentAt).getTime() >= REMINDER_REPEAT_MS
      })
    : []

  return {
    nextSettings,
    dueReminders
  }
}

export const buildReminderMessage = (reminder: ActiveReminder, quote: QuoteSnapshot | undefined) => {
  const actionText = reminder.kind === 'dip' ? '补仓提醒' : '卖出提醒'
  const livePrice = formatPrice(quote?.price ?? null)
  const changeText = formatPercent(quote?.changePercent ?? null)
  const triggerText = formatPrice(reminder.triggerPrice)

  return [
    `# ${actionText}`,
    `> ${reminder.stockName} ${reminder.stockCode}`,
    `当前价：${livePrice} (${changeText})`,
    `触发价：${triggerText}`,
    `时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`
  ].join('\n')
}

export const markReminderSent = (settings: NotificationSettings, reminderKey: string, sentAt: string) => {
  const reminder = settings.activeReminders[reminderKey]

  if (!reminder) {
    return
  }

  reminder.lastSentAt = sentAt
}

export const recommendedAddPrice = (stock: StockCard) => dipPrice(referencePrice(stock), RECOMMENDED_ADD_RATE)
