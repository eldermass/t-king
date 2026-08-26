export type BuyEntry = {
  id: string
  buyPrice: number | null
  buyDate: string | null
  targetRate: number
  lots: number | null
  autoBudget: number
  lotsManual: boolean
}

export type DipAlert = {
  id: string
  dropRate: number
}

export type StockCard = {
  id: string
  name: string
  code: string
  subIndustry: string
  primaryTheme: string
  secondaryTheme: string
  coreBusiness: string
  riskWarning: string
  riskWarningEnabled: boolean
  riseStartPrice: number | null
  pullbackStartPrice: number | null
  recommendedDipAlertId?: string | null
  profileInitializedCode?: string | null
  buyEntries: BuyEntry[]
  dipAlerts: DipAlert[]
}

export type QuoteState = {
  name?: string
  price: number | null
  previousClose: number | null
  change: number | null
  changePercent: number | null
  updatedAt: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

type QuoteResponse = Record<string, Omit<QuoteState, 'status'>>

type StockProfile = {
  name: string
  subIndustry: string
  primaryTheme: string
  secondaryTheme: string
  coreBusiness: string
  updatedAt: string
}

type ProfileResponse = Record<string, StockProfile>

type RequestStatus = 'idle' | 'loading' | 'ready' | 'error'

export type AlertState = {
  fingerprint: string
  redLevel: 0 | 1 | 2 | 3
  greenActive: boolean
  triggeredDipAlertIds: string[]
  triggeredSellEntryIds: string[]
}

export type ReminderKind = 'dip' | 'sell'

export type ActiveReminder = {
  key: string
  kind: ReminderKind
  stockId: string
  stockName: string
  stockCode: string
  triggerId: string
  stockFingerprint: string
  triggerPrice: number | null
  lastSentAt: string | null
}

export type NotificationSettings = {
  enabled: boolean
  pushDeerKey: string
  noticeText: string
  activeReminders: Record<string, ActiveReminder>
}

import {
  dipPrice,
  evaluateStockTriggers,
  minimumSellPrice,
  normalizeCode,
  plannedSellPrice,
  referencePrice
} from '~/shared/reminder-core'

type BoardPayload = {
  stocks: StockCard[]
  alerts: Record<string, AlertState>
  notifications: NotificationSettings
}

export const stockBoardKey = Symbol('stock-board')

const REFRESH_MS = 10_000
const RECOMMENDED_ADD_RATE = -4
const DEFAULT_DIP_INTERVAL = 0
const INITIAL_POSITION_BUDGET = 30_000
const ADD_POSITION_BUDGET = 10_000
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const TRADE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_STOCK_NAME = '新股票'
const UNNAMED_STOCK_NAME = '未命名股票'

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const toShanghaiDate = (date: Date) => new Date(date.getTime() + SHANGHAI_OFFSET_MS)

const formatTradeDatePart = (value: number) => String(value).padStart(2, '0')

const currentTradeDate = () => {
  const shanghaiDate = toShanghaiDate(new Date())

  return `${shanghaiDate.getUTCFullYear()}-${formatTradeDatePart(shanghaiDate.getUTCMonth() + 1)}-${formatTradeDatePart(shanghaiDate.getUTCDate())}`
}

const parseTradeDate = (value: string) => {
  if (!TRADE_DATE_PATTERN.test(value)) {
    return null
  }

  const [yearText, monthText, dayText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return parsed
}

const normalizeTradeDate = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  return parseTradeDate(trimmed) ? trimmed : null
}

const preserveBuyDate = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null
  }

  return value
}

const isWeekdayTradingDay = (date: Date) => {
  const weekday = date.getUTCDay()
  return weekday !== 0 && weekday !== 6
}

const countTradingDays = (startDate: string, endDate = currentTradeDate()) => {
  const start = parseTradeDate(startDate)
  const end = parseTradeDate(endDate)

  if (!start || !end || start.getTime() > end.getTime()) {
    return null
  }

  let tradingDays = 0

  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += DAY_MS) {
    if (isWeekdayTradingDay(new Date(cursor))) {
      tradingDays += 1
    }
  }

  return Math.max(tradingDays, 1)
}

const estimateLots = (buyPrice: number | null, budget: number) => {
  if (buyPrice === null || buyPrice <= 0) {
    return null
  }

  return Math.floor(budget / (buyPrice * 100))
}

const createBuyEntry = (
  buyPrice: number | null = null,
  buyDate: string | null = null,
  targetRate = 3,
  lots: number | null = null,
  autoBudget = ADD_POSITION_BUDGET,
  lotsManual = false
): BuyEntry => ({
  id: createId(),
  buyPrice,
  buyDate: preserveBuyDate(buyDate),
  targetRate,
  lots: lots ?? estimateLots(buyPrice, autoBudget),
  autoBudget,
  lotsManual
})

const createDipAlert = (dropRate = -3): DipAlert => ({
  id: createId(),
  dropRate
})

const defaultDipAlerts = () => [
  createDipAlert(-4),
  createDipAlert(-8),
  createDipAlert(-12)
]

const defaultStocks = (): StockCard[] => [
  {
    id: createId(),
    name: '长信科技',
    code: '300088',
    subIndustry: '车载显示 / 触控显示材料',
    primaryTheme: '汽车电子',
    secondaryTheme: 'UTG / 折叠屏',
    coreBusiness: '研发、生产和销售触控显示器件材料、车载显示模组、超薄玻璃盖板（UTG）等电子显示器件与材料。',
    riskWarning: '',
    riskWarningEnabled: false,
    riseStartPrice: null,
    pullbackStartPrice: null,
    recommendedDipAlertId: null,
    profileInitializedCode: '300088',
    buyEntries: [createBuyEntry(7.85, null, 3, null, INITIAL_POSITION_BUDGET)],
    dipAlerts: defaultDipAlerts()
  },
  {
    id: createId(),
    name: '蓝色光标',
    code: '300058',
    subIndustry: '营销科技 / 出海广告',
    primaryTheme: 'AIGC营销',
    secondaryTheme: '出海营销',
    coreBusiness: '提供全案推广、全案广告代理、出海广告投放及 AI 营销等一站式营销科技服务，覆盖品牌传播与效果投放。',
    riskWarning: '',
    riskWarningEnabled: false,
    riseStartPrice: null,
    pullbackStartPrice: null,
    recommendedDipAlertId: null,
    profileInitializedCode: '300058',
    buyEntries: [createBuyEntry(17, null, 3, null, INITIAL_POSITION_BUDGET), createBuyEntry(16.1, null, 3, null, ADD_POSITION_BUDGET)],
    dipAlerts: defaultDipAlerts()
  },
  {
    id: createId(),
    name: '易点天下',
    code: '301171',
    subIndustry: '出海营销 / 互联网广告',
    primaryTheme: 'AIGC',
    secondaryTheme: '跨境电商',
    coreBusiness: '为企业提供出海整合营销、数字营销、广告变现，以及 AI 数字创意、BI 决策、CI 智能化多云管理等出海数字化服务。',
    riskWarning: '',
    riskWarningEnabled: false,
    riseStartPrice: null,
    pullbackStartPrice: null,
    recommendedDipAlertId: null,
    profileInitializedCode: '301171',
    buyEntries: [
      createBuyEntry(43.7, null, 3, null, INITIAL_POSITION_BUDGET),
      createBuyEntry(42, null, 3, null, ADD_POSITION_BUDGET),
      createBuyEntry(39.8, null, 3, null, ADD_POSITION_BUDGET),
      createBuyEntry(38.4, null, 3, null, ADD_POSITION_BUDGET)
    ],
    dipAlerts: defaultDipAlerts()
  }
]

const defaultBoardPayload = (): BoardPayload => ({
  stocks: defaultStocks(),
  alerts: {},
  notifications: {
    enabled: true,
    pushDeerKey: '',
    noticeText: '',
    activeReminders: {}
  }
})

export const useStockBoard = () => {
  const stocks = useState<StockCard[]>('stock-board-stocks', () => defaultBoardPayload().stocks)
  const quotes = useState<Record<string, QuoteState>>('stock-board-quotes', () => ({}))
  const profileStatuses = useState<Record<string, RequestStatus>>('stock-board-profile-statuses', () => ({}))
  const alertStates = useState<Record<string, AlertState>>('stock-board-alert-states', () => ({}))
  const notificationSettings = useState<NotificationSettings>('stock-board-notification-settings', () => defaultBoardPayload().notifications)
  const hydrated = useState<boolean>('stock-board-hydrated', () => false)
  const quoteLoading = useState<boolean>('stock-board-quote-loading', () => false)
  const boardLoading = useState<boolean>('stock-board-data-loading', () => false)
  const boardReady = useState<boolean>('stock-board-data-ready', () => false)
  const saveStatus = useState<'idle' | 'saving' | 'saved' | 'error'>('stock-board-save-status', () => 'idle')
  const lastCodeSnapshot = useState<Record<string, string>>('stock-board-last-code-snapshot', () => ({}))

  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let quoteInputTimer: ReturnType<typeof setTimeout> | null = null
  let profileInputTimer: ReturnType<typeof setTimeout> | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let saveDoneTimer: ReturnType<typeof setTimeout> | null = null

  const roundPrice = (value: number) => Math.round(value * 10000) / 10000
  const roundMoneyPrice = (value: number) => Math.round(value * 100) / 100

  const formatPrice = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '--'
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  }

  const formatSellPrice = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '--'
    }

    return value.toFixed(2)
  }

  const formatAmount = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '--'
    }

    return String(Math.round(value))
  }

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '--'
    }

    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}%`
  }

  const isValidCode = (code: string) => /^(0|3|6)\d{5}$/.test(normalizeCode(code))

  const nextDipAlertRate = (stock: StockCard) => {
    const rates = stock.dipAlerts
      .map((alert) => alert.dropRate)
      .filter((rate) => Number.isFinite(rate))

    if (!rates.length) {
      return -DEFAULT_DIP_INTERVAL
    }

    const minRate = Math.min(...rates)
    return Math.min(minRate - DEFAULT_DIP_INTERVAL, -DEFAULT_DIP_INTERVAL)
  }

  const shiftDipAlerts = (stock: StockCard, delta: number) => {
    stock.dipAlerts = stock.dipAlerts.map((alert) => ({
      ...alert,
      dropRate: Math.min(alert.dropRate + delta, -DEFAULT_DIP_INTERVAL)
    }))
  }

  const selectedRecommendedDipAlert = (stock: StockCard) => {
    const manualAlert = stock.recommendedDipAlertId
      ? stock.dipAlerts.find((alert) => alert.id === stock.recommendedDipAlertId)
      : null

    if (manualAlert) {
      return manualAlert
    }

    return stock.dipAlerts.find((alert) => alert.dropRate === RECOMMENDED_ADD_RATE) ?? null
  }

  const recommendedAddPrice = (stock: StockCard) => {
    const alert = selectedRecommendedDipAlert(stock)

    return dipPrice(referencePrice(stock), alert?.dropRate ?? RECOMMENDED_ADD_RATE)
  }

  const latestBuyEntry = (stock: StockCard) => {
    for (let index = stock.buyEntries.length - 1; index >= 0; index -= 1) {
      const entry = stock.buyEntries[index]
      const price = entry?.buyPrice

      if (price !== null && price !== undefined && price > 0) {
        return entry
      }
    }

    return null
  }

  const firstBuyDate = (stock: StockCard) => {
    const dates = stock.buyEntries
      .filter((entry) => entry.buyPrice !== null && entry.buyPrice > 0)
      .map((entry) => normalizeTradeDate(entry.buyDate) ?? currentTradeDate())
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))

    return dates[0] ?? null
  }

  const holdingCycle = (stock: StockCard) => {
    const buyDate = firstBuyDate(stock)

    if (!buyDate) {
      return null
    }

    return countTradingDays(buyDate)
  }

  const holdingCycleLabel = (stock: StockCard) => {
    const cycle = holdingCycle(stock)

    if (cycle === null) {
      return null
    }

    return `${cycle}\u5468\u671f`
  }

  const dipAlertSpreadRate = (stock: StockCard, alert: DipAlert) => {
    const triggerPrice = dipPrice(referencePrice(stock), alert.dropRate)
    const recentBuyPrice = latestBuyEntry(stock)?.buyPrice ?? null

    if (triggerPrice === null || recentBuyPrice === null || recentBuyPrice <= 0) {
      return null
    }

    return ((triggerPrice - recentBuyPrice) / recentBuyPrice) * 100
  }

  const latestAddProfit = (stock: StockCard) => {
    const entry = latestBuyEntry(stock)
    const livePrice = quoteFor(stock.code).price

    if (!entry || entry.buyPrice === null || entry.buyPrice <= 0 || entry.lots === null || entry.lots <= 0) {
      return null
    }

    if (livePrice === null || livePrice <= 0) {
      return null
    }

    return (livePrice - entry.buyPrice) * entry.lots * 100
  }

  const latestAddProfitRate = (stock: StockCard) => {
    const entry = latestBuyEntry(stock)
    const livePrice = quoteFor(stock.code).price

    if (!entry || entry.buyPrice === null || entry.buyPrice <= 0) {
      return null
    }

    if (livePrice === null || livePrice <= 0) {
      return null
    }

    return ((livePrice - entry.buyPrice) / entry.buyPrice) * 100
  }

  const toneByValue = (
    value: number | null | undefined,
    negativeTone: 'is-loss' | 'is-soft-loss' = 'is-loss'
  ) => {
    if (value === null || value === undefined || Number.isNaN(value) || Math.abs(value) < 0.005) {
      return 'is-flat'
    }

    return value > 0 ? 'is-profit' : negativeTone
  }

  const latestAddProfitAmountTone = (stock: StockCard) => toneByValue(latestAddProfit(stock), 'is-loss')

  const latestAddProfitRateTone = (stock: StockCard) => toneByValue(latestAddProfitRate(stock), 'is-soft-loss')

  const entryCurrentProfit = (stock: StockCard, entry: BuyEntry) => {
    if (entry.buyPrice === null || entry.buyPrice <= 0 || entry.lots === null || entry.lots === 0) {
      return null
    }

    const livePrice = quoteFor(stock.code).price

    if (livePrice === null || livePrice <= 0) {
      return null
    }

    if (entry.lots < 0) {
      const sellPrice = plannedSellPrice(entry)

      return sellPrice === null
        ? null
        : (sellPrice - livePrice) * Math.abs(entry.lots) * 100
    }

    return (livePrice - entry.buyPrice) * entry.lots * 100
  }

  const entryCurrentProfitTone = (stock: StockCard, entry: BuyEntry) =>
    toneByValue(entryCurrentProfit(stock, entry), 'is-loss')

  const isRiskWarningTriggered = (stock: StockCard, entry: BuyEntry) => {
    if (!stock.riskWarningEnabled || entry.lots === null || entry.lots >= 0) {
      return false
    }

    const livePrice = quoteFor(stock.code).price
    const sellPrice = plannedSellPrice(entry)

    return livePrice !== null && livePrice > 0 && sellPrice !== null && livePrice < sellPrice
  }

  const markerStartPrice = (stock: StockCard, field: 'riseStartPrice' | 'pullbackStartPrice') => {
    const value = stock[field]

    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
  }

  const priceMarkerSpread = (stock: StockCard, field: 'riseStartPrice' | 'pullbackStartPrice') => {
    const livePrice = quoteFor(stock.code).price
    const startPrice = markerStartPrice(stock, field)

    if (livePrice === null || livePrice <= 0 || startPrice === null) {
      return null
    }

    return roundPrice(livePrice - startPrice)
  }

  const priceMarkerRate = (stock: StockCard, field: 'riseStartPrice' | 'pullbackStartPrice') => {
    const spread = priceMarkerSpread(stock, field)
    const startPrice = markerStartPrice(stock, field)

    if (spread === null || startPrice === null) {
      return null
    }

    return roundPrice((spread / startPrice) * 100)
  }

  const syncEntryLots = (entry: BuyEntry) => {
    if (entry.lotsManual) {
      return
    }

    entry.lots = estimateLots(entry.buyPrice, entry.autoBudget)
  }

  const investedAmount = (stock: StockCard) =>
    stock.buyEntries.reduce((sum, entry) => {
      if (entry.buyPrice === null || entry.buyPrice <= 0 || entry.lots === null || entry.lots <= 0) {
        return sum
      }

      return sum + entry.buyPrice * entry.lots * 100
    }, 0)

  const totalShares = (stock: StockCard) =>
    stock.buyEntries.reduce((sum, entry) => sum + (entry.lots && entry.lots > 0 ? entry.lots * 100 : 0), 0)

  const quoteFor = (code: string) => {
    const normalizedCode = normalizeCode(code)

    return (
      quotes.value[normalizedCode] ?? {
        price: null,
        previousClose: null,
        change: null,
        changePercent: null,
        updatedAt: null,
        status: normalizedCode ? 'idle' : 'error'
      }
    )
  }

  const totalMarketValue = (stock: StockCard) => {
    const cost = investedAmount(stock)
    const shares = totalShares(stock)

    if (!shares) {
      return null
    }

    const livePrice = quoteFor(stock.code).price

    if (livePrice === null || livePrice <= 0) {
      return cost || null
    }

    return livePrice * shares
  }

  const profitAmount = (stock: StockCard) => {
    const cost = investedAmount(stock)
    const marketValue = totalMarketValue(stock)

    if (!cost || marketValue === null) {
      return null
    }

    return marketValue - cost
  }

  const profitTone = (stock: StockCard) => {
    const value = profitAmount(stock)

    if (value === null || Math.abs(value) < 0.005) {
      return 'is-flat'
    }

    return value > 0 ? 'is-profit' : 'is-loss'
  }

  const profitSign = (stock: StockCard) => {
    const value = profitAmount(stock)

    if (value === null || Math.abs(value) < 0.005) {
      return '+'
    }

    return value > 0 ? '+' : '-'
  }

  const averageCost = (stock: StockCard) => {
    const validEntries = stock.buyEntries.filter(
      (entry) => entry.buyPrice !== null && entry.buyPrice > 0 && entry.lots !== null && entry.lots > 0
    )

    if (!validEntries.length) {
      return null
    }

    const totalLots = validEntries.reduce((sum, entry) => sum + (entry.lots as number), 0)
    const totalCost = validEntries.reduce((sum, entry) => sum + (entry.buyPrice as number) * (entry.lots as number), 0)

    return roundPrice(totalCost / totalLots)
  }

  const stockFingerprint = (stock: StockCard) =>
    JSON.stringify({
      name: stock.name.trim(),
      code: normalizeCode(stock.code),
      riskWarningEnabled: stock.riskWarningEnabled,
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

  const emptyAlertState = (stock: StockCard): AlertState => ({
    fingerprint: stockFingerprint(stock),
    redLevel: 0,
    greenActive: false,
    triggeredDipAlertIds: [],
    triggeredSellEntryIds: []
  })

  const syncAlertStates = () => {
    const next: Record<string, AlertState> = {}

    for (const stock of stocks.value) {
      const fingerprint = stockFingerprint(stock)
      const existing = alertStates.value[stock.id]

      next[stock.id] = existing && existing.fingerprint === fingerprint
        ? existing
        : {
            fingerprint,
            redLevel: 0,
            greenActive: false,
            triggeredDipAlertIds: [],
            triggeredSellEntryIds: []
          }
    }

    alertStates.value = next
  }

  const quoteTone = (code: string) => {
    const quote = quoteFor(code)

    if (quote.changePercent === null) {
      return 'is-flat'
    }

    if (quote.changePercent > 0) {
      return 'is-up'
    }

    if (quote.changePercent < 0) {
      return 'is-down'
    }

    return 'is-flat'
  }

  const shouldAutofillStockName = (stock: StockCard) => {
    const trimmedName = stock.name.trim()
    const normalizedCode = normalizeCode(stock.code)

    return !trimmedName || trimmedName === DEFAULT_STOCK_NAME || trimmedName === UNNAMED_STOCK_NAME || trimmedName === normalizedCode
  }

  const resetStockProfile = (stock: StockCard) => {
    stock.subIndustry = ''
    stock.primaryTheme = ''
    stock.secondaryTheme = ''
    stock.coreBusiness = ''
    stock.profileInitializedCode = null
  }

  const syncStockProfile = (stock: StockCard, profile: StockProfile) => {
    if (profile.name && shouldAutofillStockName(stock)) {
      stock.name = profile.name
    }

    const normalizedCode = normalizeCode(stock.code)
    const hasInitializedProfile = stock.profileInitializedCode === normalizedCode

    if (!hasInitializedProfile) {
      stock.subIndustry = profile.subIndustry
      stock.primaryTheme = profile.primaryTheme
      stock.secondaryTheme = profile.secondaryTheme
      stock.coreBusiness = profile.coreBusiness
      stock.profileInitializedCode = normalizedCode
    }
  }

  const syncStockNamesFromQuotes = (response: QuoteResponse) => {
    for (const stock of stocks.value) {
      const code = normalizeCode(stock.code)

      if (!code || !shouldAutofillStockName(stock)) {
        continue
      }

      const quoteName = response[code]?.name?.trim()

      if (quoteName) {
        stock.name = quoteName
      }
    }
  }

  const profileStatusFor = (code: string) => {
    const normalizedCode = normalizeCode(code)

    if (!normalizedCode) {
      return 'idle' as const
    }

    return profileStatuses.value[normalizedCode] ?? 'idle'
  }

  const profileText = (value: string, code: string) => {
    const normalizedCode = normalizeCode(code)
    const status = profileStatusFor(code)

    if (value.trim()) {
      return value
    }

    if (!normalizedCode) {
      return '待输入'
    }

    if (!isValidCode(normalizedCode)) {
      return '代码无效'
    }

    if (status === 'loading') {
      return '获取中'
    }

    if (status === 'error') {
      return '获取失败'
    }

    return '暂无资料'
  }

  const themeList = (stock: StockCard) =>
    [stock.primaryTheme, stock.secondaryTheme].map((value) => value.trim()).filter(Boolean)

  const quoteLabel = (code: string) => {
    const normalizedCode = normalizeCode(code)

    if (!normalizedCode) {
      return '待填代码'
    }

    if (!isValidCode(normalizedCode)) {
      return '代码无效'
    }

    const quote = quoteFor(normalizedCode)

    if (quote.status === 'loading' && quote.price === null) {
      return '加载中'
    }

    if (quote.status === 'error') {
      return '行情失败'
    }

    if (quote.price === null) {
      return '暂无行情'
    }

    return `${formatPrice(quote.price)} ${formatPercent(quote.changePercent)}`
  }

  const evaluateAlerts = () => {
    const nextStates: Record<string, AlertState> = { ...alertStates.value }
    let changed = false

    for (const stock of stocks.value) {
      const current = nextStates[stock.id] ?? emptyAlertState(stock)
      const quote = quoteFor(stock.code)
      const nextFingerprint = stockFingerprint(stock)

      if (quote.price === null) {
        const updated: AlertState = {
          fingerprint: nextFingerprint,
          redLevel: 0,
          greenActive: false,
          triggeredDipAlertIds: [],
          triggeredSellEntryIds: []
        }

        nextStates[stock.id] = updated

        if (
          updated.redLevel !== current.redLevel ||
          updated.greenActive !== current.greenActive ||
          updated.fingerprint !== current.fingerprint ||
          updated.triggeredDipAlertIds.join('|') !== current.triggeredDipAlertIds.join('|') ||
          updated.triggeredSellEntryIds.join('|') !== current.triggeredSellEntryIds.join('|')
        ) {
          changed = true
        }

        continue
      }

      const evaluation = evaluateStockTriggers(stock, quote.price)

      const updated: AlertState = {
        fingerprint: nextFingerprint,
        redLevel: evaluation.redLevel,
        greenActive: evaluation.greenActive,
        triggeredDipAlertIds: evaluation.triggeredDipAlerts.map((alert) => alert.id),
        triggeredSellEntryIds: evaluation.triggeredSellEntries.map((entry) => entry.id)
      }

      nextStates[stock.id] = updated

      if (
        updated.redLevel !== current.redLevel ||
        updated.greenActive !== current.greenActive ||
        updated.fingerprint !== current.fingerprint ||
        updated.triggeredDipAlertIds.join('|') !== current.triggeredDipAlertIds.join('|') ||
        updated.triggeredSellEntryIds.join('|') !== current.triggeredSellEntryIds.join('|')
      ) {
        changed = true
      }
    }

    if (changed) {
      alertStates.value = nextStates
    }
  }

  const cardAlertClass = (stock: StockCard) => {
    const state = alertStates.value[stock.id]

    if (!state) {
      return ''
    }

    if (state.redLevel === 3) {
      return 'alert-red-3'
    }

    if (state.redLevel === 2) {
      return 'alert-red-2'
    }

    if (state.redLevel === 1) {
      return 'alert-red-1'
    }

    if (state.greenActive) {
      return 'alert-green'
    }

    return ''
  }

  const dipAlertLevel = (dropRate: number) => {
    if (dropRate <= -7) {
      return 3
    }

    if (dropRate <= -4) {
      return 2
    }

    if (dropRate <= -3) {
      return 1
    }

    return 0
  }

  const isSellTriggered = (stockId: string, entryId: string) => {
    const stock = stocks.value.find((item) => item.id === stockId)
    const entry = stock?.buyEntries.find((item) => item.id === entryId)

    if (entry?.lots !== null && entry?.lots !== undefined && entry.lots < 0) {
      return false
    }

    return alertStates.value[stockId]?.triggeredSellEntryIds.includes(entryId) ?? false
  }

  const dipAlertClass = (stockId: string, alert: DipAlert) => {
    const triggered = alertStates.value[stockId]?.triggeredDipAlertIds.includes(alert.id) ?? false

    if (!triggered) {
      return ''
    }

    const level = dipAlertLevel(alert.dropRate)

    if (level === 3) {
      return 'number-alert-red-3'
    }

    if (level === 2) {
      return 'number-alert-red-2'
    }

    return 'number-alert-red-1'
  }

  const recommendedAddClass = (stockId: string) => {
    const stock = stocks.value.find((item) => item.id === stockId)

    if (!stock) {
      return ''
    }

    const targetAlert = selectedRecommendedDipAlert(stock)

    if (!targetAlert) {
      return ''
    }

    return dipAlertClass(stockId, targetAlert)
  }

  const isRecommendedDipAlert = (stock: StockCard, alertId: string) =>
    selectedRecommendedDipAlert(stock)?.id === alertId

  const applyRecommendedDipAlert = (stock: StockCard, alertId: string) => {
    stock.recommendedDipAlertId = alertId
  }

  const loadBoard = async () => {
    boardLoading.value = true

    try {
      const payload = await $fetch<BoardPayload>('/api/board')
      stocks.value = payload.stocks?.length ? payload.stocks : defaultBoardPayload().stocks
      alertStates.value = payload.alerts ?? {}
      notificationSettings.value = payload.notifications ?? defaultBoardPayload().notifications
      syncAlertStates()
      lastCodeSnapshot.value = Object.fromEntries(stocks.value.map((stock) => [stock.id, normalizeCode(stock.code)]))
      hydrated.value = true
      boardReady.value = true
    } finally {
      boardLoading.value = false
    }
  }

  const persistBoard = async () => {
    if (!boardReady.value) {
      return
    }

    saveStatus.value = 'saving'

    try {
      await $fetch('/api/board', {
        method: 'PUT',
        body: {
          stocks: stocks.value,
          alerts: alertStates.value,
          notifications: notificationSettings.value
        }
      })

      saveStatus.value = 'saved'

      if (saveDoneTimer) {
        clearTimeout(saveDoneTimer)
      }

      saveDoneTimer = setTimeout(() => {
        saveStatus.value = 'idle'
      }, 1200)
    } catch (error) {
      console.error('board save failed', error)
      saveStatus.value = 'error'
    }
  }

  const scheduleBoardSave = () => {
    if (!boardReady.value) {
      return
    }

    if (saveTimer) {
      clearTimeout(saveTimer)
    }

    saveTimer = setTimeout(() => {
      persistBoard()
    }, 300)
  }

  const refreshQuotes = async () => {
    const codes = [...new Set(stocks.value.map((stock) => normalizeCode(stock.code)).filter((code) => isValidCode(code)))]

    if (!codes.length) {
      quotes.value = {}
      return
    }

    quoteLoading.value = true

    for (const code of codes) {
      const current = quotes.value[code]
      quotes.value[code] = {
        ...current,
        price: current?.price ?? null,
        previousClose: current?.previousClose ?? null,
        change: current?.change ?? null,
        changePercent: current?.changePercent ?? null,
        updatedAt: current?.updatedAt ?? null,
        status: 'loading'
      }
    }

    try {
      const response = await $fetch<QuoteResponse>('/api/quotes', {
        query: { codes: codes.join(',') }
      })

      const nextQuotes: Record<string, QuoteState> = {}

      for (const code of codes) {
        const item = response[code]

        if (item && item.price !== null) {
          nextQuotes[code] = {
            ...item,
            status: 'ready'
          }
        } else {
          const current = quotes.value[code]
          nextQuotes[code] = {
            price: current?.price ?? null,
            previousClose: current?.previousClose ?? null,
            change: current?.change ?? null,
            changePercent: current?.changePercent ?? null,
            updatedAt: current?.updatedAt ?? null,
            status: current?.price !== null && current?.price !== undefined ? 'ready' : 'error'
          }
        }
      }

      quotes.value = nextQuotes
      syncStockNamesFromQuotes(response)
      evaluateAlerts()
    } catch (error) {
      console.error('quote fetch failed', error)

      for (const code of codes) {
        const current = quotes.value[code]
        quotes.value[code] = {
          price: current?.price ?? null,
          previousClose: current?.previousClose ?? null,
          change: current?.change ?? null,
          changePercent: current?.changePercent ?? null,
          updatedAt: current?.updatedAt ?? null,
          status: 'error'
        }
      }
    } finally {
      quoteLoading.value = false
    }
  }

  const scheduleQuoteRefresh = () => {
    if (quoteInputTimer) {
      clearTimeout(quoteInputTimer)
    }

    quoteInputTimer = setTimeout(() => {
      refreshQuotes()
    }, 500)
  }

  const refreshProfiles = async () => {
    const codes = [...new Set(stocks.value.map((stock) => normalizeCode(stock.code)).filter((code) => isValidCode(code)))]

    if (!codes.length) {
      profileStatuses.value = {}
      return
    }

    for (const code of codes) {
      profileStatuses.value[code] = 'loading'
    }

    try {
      const response = await $fetch<ProfileResponse>('/api/stock-profile', {
        query: { codes: codes.join(',') }
      })

      for (const stock of stocks.value) {
        const code = normalizeCode(stock.code)

        if (!isValidCode(code)) {
          continue
        }

        const profile = response[code]

        if (profile) {
          syncStockProfile(stock, profile)
          profileStatuses.value[code] = 'ready'
        } else {
          resetStockProfile(stock)
          profileStatuses.value[code] = 'error'
        }
      }
    } catch (error) {
      console.error('profile fetch failed', error)

      for (const code of codes) {
        profileStatuses.value[code] = 'error'
      }
    }
  }

  const scheduleProfileRefresh = () => {
    if (profileInputTimer) {
      clearTimeout(profileInputTimer)
    }

    profileInputTimer = setTimeout(() => {
      refreshProfiles()
    }, 500)
  }

  const handleBuyPriceInput = (entry: BuyEntry) => {
    if (typeof entry.buyPrice === 'number' && Number.isFinite(entry.buyPrice)) {
      entry.buyPrice = roundMoneyPrice(entry.buyPrice)
    }

    if (entry.buyPrice !== null && entry.buyPrice > 0 && !normalizeTradeDate(entry.buyDate)) {
      entry.buyDate = currentTradeDate()
    }

    syncEntryLots(entry)
  }

  const handleLotsInput = (entry: BuyEntry) => {
    if (entry.lots === null || entry.lots === 0) {
      entry.lotsManual = false
      syncEntryLots(entry)
      return
    }

    entry.lotsManual = true
  }

  const handleMarkerPriceInput = (stock: StockCard, field: 'riseStartPrice' | 'pullbackStartPrice', rawValue: string) => {
    const trimmedValue = rawValue.trim()
    const nextPrice = Number(trimmedValue)

    stock[field] = trimmedValue && Number.isFinite(nextPrice) && nextPrice > 0
      ? roundMoneyPrice(nextPrice)
      : null
  }

  const handleDipAlertPriceInput = (stock: StockCard, alert: DipAlert, rawValue: string) => {
    const basePrice = referencePrice(stock)

    if (basePrice === null || basePrice <= 0) {
      return
    }

    const nextPrice = Number(rawValue)

    if (!rawValue.trim() || !Number.isFinite(nextPrice) || nextPrice <= 0) {
      return
    }

    const roundedPrice = roundMoneyPrice(nextPrice)
    alert.dropRate = roundPrice(((roundedPrice - basePrice) / basePrice) * 100)
  }

  const reorderStocks = (fromId: string, toId: string) => {
    const fromIndex = stocks.value.findIndex((stock) => stock.id === fromId)
    const toIndex = stocks.value.findIndex((stock) => stock.id === toId)

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return
    }

    const nextStocks = [...stocks.value]
    const [movedStock] = nextStocks.splice(fromIndex, 1)
    nextStocks.splice(toIndex, 0, movedStock)
    stocks.value = nextStocks
  }

  const moveStockByOffset = (stockId: string, offset: -1 | 1) => {
    const currentIndex = stocks.value.findIndex((stock) => stock.id === stockId)
    const targetIndex = currentIndex + offset

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= stocks.value.length) {
      return
    }

    reorderStocks(stockId, stocks.value[targetIndex].id)
  }

  const addStock = () => {
    stocks.value.unshift({
      id: createId(),
      name: DEFAULT_STOCK_NAME,
      code: '',
      subIndustry: '',
      riskWarning: '',
      riskWarningEnabled: false,
      riseStartPrice: null,
      pullbackStartPrice: null,
      primaryTheme: '',
      secondaryTheme: '',
      coreBusiness: '',
      recommendedDipAlertId: null,
      profileInitializedCode: null,
      buyEntries: [createBuyEntry(null, null, 3, null, INITIAL_POSITION_BUDGET)],
      dipAlerts: defaultDipAlerts()
    })
  }

  const confirmDelete = (message: string) => window.confirm(message)

  const removeStock = (stockId: string) => {
    if (stocks.value.length === 1) {
      return
    }

    if (!confirmDelete('确认删除这只股票吗？')) {
      return
    }

    stocks.value = stocks.value.filter((stock) => stock.id !== stockId)
  }

  const addBuyEntry = (stock: StockCard) => {
    stock.buyEntries.push(createBuyEntry(null, null, 4, null, ADD_POSITION_BUDGET))
    shiftDipAlerts(stock, -DEFAULT_DIP_INTERVAL)
  }

  const removeBuyEntry = (stock: StockCard, entryId: string) => {
    if (stock.buyEntries.length === 1) {
      return
    }

    if (!confirmDelete('确认删除这条买入记录吗？')) {
      return
    }

    stock.buyEntries = stock.buyEntries.filter((entry) => entry.id !== entryId)
    shiftDipAlerts(stock, DEFAULT_DIP_INTERVAL)
  }

  const addDipAlert = (stock: StockCard) => {
    stock.dipAlerts.push(createDipAlert(nextDipAlertRate(stock)))
  }

  const removeDipAlert = (stock: StockCard, alertId: string) => {
    if (stock.dipAlerts.length === 1) {
      return
    }

    stock.dipAlerts = stock.dipAlerts.filter((alert) => alert.id !== alertId)

    if (stock.recommendedDipAlertId === alertId) {
      stock.recommendedDipAlertId = null
    }
  }

  onMounted(async () => {
    if (!boardReady.value) {
      await loadBoard()
    }

    refreshQuotes()
    refreshProfiles()

    if (!refreshTimer) {
      refreshTimer = setInterval(refreshQuotes, REFRESH_MS)
    }
  })

  onBeforeUnmount(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }

    if (quoteInputTimer) {
      clearTimeout(quoteInputTimer)
    }

    if (profileInputTimer) {
      clearTimeout(profileInputTimer)
    }

    if (saveTimer) {
      clearTimeout(saveTimer)
    }

    if (saveDoneTimer) {
      clearTimeout(saveDoneTimer)
    }
  })

  watch(
    stocks,
    () => {
      if (!boardReady.value) {
        return
      }

      syncAlertStates()
      scheduleBoardSave()
    },
    { deep: true }
  )

  watch(
    alertStates,
    () => {
      if (!boardReady.value) {
        return
      }

      scheduleBoardSave()
    },
    { deep: true }
  )

  watch(
    notificationSettings,
    () => {
      if (!boardReady.value) {
        return
      }

      scheduleBoardSave()
    },
    { deep: true }
  )

  watch(
    () => stocks.value.map((stock) => normalizeCode(stock.code)).join('|'),
    () => {
      const nextSnapshot = Object.fromEntries(stocks.value.map((stock) => [stock.id, normalizeCode(stock.code)]))

      for (const stock of stocks.value) {
        const previousCode = lastCodeSnapshot.value[stock.id]
        const nextCode = nextSnapshot[stock.id]

        if (previousCode !== undefined && previousCode !== nextCode) {
          resetStockProfile(stock)
          delete profileStatuses.value[previousCode]
        }

        if (!isValidCode(nextCode)) {
          resetStockProfile(stock)
          delete profileStatuses.value[nextCode]
        }
      }

      lastCodeSnapshot.value = nextSnapshot

      if (boardReady.value) {
        scheduleQuoteRefresh()
        scheduleProfileRefresh()
      }
    }
  )

  return {
    stocks,
    quotes,
    profileStatuses,
    alertStates,
    notificationSettings,
    hydrated,
    quoteLoading,
    boardLoading,
    boardReady,
    saveStatus,
    loadBoard,
    formatPrice,
    formatSellPrice,
    formatAmount,
    formatPercent,
    normalizeCode,
    isValidCode,
    plannedSellPrice,
    dipPrice,
    referencePrice,
    recommendedAddPrice,
    latestAddProfit,
    latestAddProfitRate,
    latestAddProfitAmountTone,
    latestAddProfitRateTone,
    entryCurrentProfit,
    entryCurrentProfitTone,
    isRiskWarningTriggered,
    priceMarkerSpread,
    priceMarkerRate,
    holdingCycle,
    holdingCycleLabel,
    dipAlertSpreadRate,
    minimumSellPrice,
    investedAmount,
    totalMarketValue,
    profitAmount,
    profitTone,
    profitSign,
    averageCost,
    quoteFor,
    quoteTone,
    profileText,
    themeList,
    quoteLabel,
    cardAlertClass,
    isSellTriggered,
    dipAlertClass,
    recommendedAddClass,
    isRecommendedDipAlert,
    applyRecommendedDipAlert,
    refreshQuotes,
    refreshProfiles,
    handleBuyPriceInput,
    handleLotsInput,
    handleMarkerPriceInput,
    handleDipAlertPriceInput,
    reorderStocks,
    moveStockByOffset,
    addStock,
    removeStock,
    addBuyEntry,
    removeBuyEntry,
    addDipAlert,
    removeDipAlert
  }
}
