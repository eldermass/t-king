<script setup lang="ts">
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
  buyEntries: BuyEntry[]
  dipAlerts: DipAlert[]
}

type QuoteState = {
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

type AlertState = {
  fingerprint: string
  redLevel: 0 | 1 | 2 | 3
  greenActive: boolean
  triggeredDipAlertIds: string[]
  triggeredSellEntryIds: string[]
}

const STORAGE_KEY = 'stock-t-helper-data'
const ALERT_STORAGE_KEY = 'stock-t-helper-alerts'
const REFRESH_MS = 10_000
const RECOMMENDED_ADD_RATE = -4
const INITIAL_POSITION_BUDGET = 30_000
const ADD_POSITION_BUDGET = 10_000
const DEFAULT_STOCK_NAME = '新股票'
const UNNAMED_STOCK_NAME = '未命名股票'

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const estimateLots = (buyPrice: number | null, budget: number) => {
  if (buyPrice === null || buyPrice <= 0) {
    return null
  }

  return Math.floor(budget / (buyPrice * 100))
}

const createBuyEntry = (
  buyPrice: number | null = null,
  targetRate = 3,
  lots: number | null = null,
  autoBudget = ADD_POSITION_BUDGET,
  lotsManual = false
): BuyEntry => ({
  id: createId(),
  buyPrice,
  targetRate,
  lots: lots ?? estimateLots(buyPrice, autoBudget),
  autoBudget,
  lotsManual
})

const createDipAlert = (dropRate = -3): DipAlert => ({
  id: createId(),
  dropRate
})

const defaultStocks = (): StockCard[] => [
  {
    id: createId(),
    name: '长信科技',
    code: '300088',
    subIndustry: '车载显示 / 触控显示材料',
    primaryTheme: '汽车电子',
    secondaryTheme: 'UTG / 折叠屏',
    coreBusiness: '研发、生产和销售触控显示器件材料、车载显示模组、超薄玻璃盖板（UTG）等电子显示器件与材料。',
    buyEntries: [createBuyEntry(7.85, 3, null, INITIAL_POSITION_BUDGET)],
    dipAlerts: [createDipAlert(-3), createDipAlert(-4), createDipAlert(-7)]
  },
  {
    id: createId(),
    name: '蓝色光标',
    code: '300058',
    subIndustry: '营销科技 / 出海广告',
    primaryTheme: 'AIGC营销',
    secondaryTheme: '出海营销',
    coreBusiness: '提供全案推广、全案广告代理、出海广告投放及AI营销等一站式营销科技服务，覆盖品牌传播与效果投放。',
    buyEntries: [createBuyEntry(17, 3, null, INITIAL_POSITION_BUDGET), createBuyEntry(16.1, 3, null, ADD_POSITION_BUDGET)],
    dipAlerts: [createDipAlert(-3), createDipAlert(-4), createDipAlert(-7)]
  },
  {
    id: createId(),
    name: '易点天下',
    code: '301171',
    subIndustry: '出海营销 / 互联网广告',
    primaryTheme: 'AIGC',
    secondaryTheme: '跨境电商',
    coreBusiness: '为企业提供出海整合营销、数字营销、广告变现，以及AI数字创意、BI决策、CI智能化多云管理等出海数字化服务。',
    buyEntries: [
      createBuyEntry(43.7, 3, null, INITIAL_POSITION_BUDGET),
      createBuyEntry(42, 3, null, ADD_POSITION_BUDGET),
      createBuyEntry(39.8, 3, null, ADD_POSITION_BUDGET),
      createBuyEntry(38.4, 3, null, ADD_POSITION_BUDGET)
    ],
    dipAlerts: [createDipAlert(-3), createDipAlert(-4), createDipAlert(-7)]
  }
]

const stocks = ref<StockCard[]>(defaultStocks())
const quotes = ref<Record<string, QuoteState>>({})
const profileStatuses = ref<Record<string, RequestStatus>>({})
const alertStates = ref<Record<string, AlertState>>({})
const hydrated = ref(false)
const quoteLoading = ref(false)
const draggedStockId = ref<string | null>(null)
const pressedStockId = ref<string | null>(null)
const dropTargetStockId = ref<string | null>(null)
const dragOffset = ref({ x: 0, y: 0 })
const dragCardRect = ref({ left: 0, top: 0, width: 0, height: 0 })

let refreshTimer: ReturnType<typeof setInterval> | null = null
let quoteInputTimer: ReturnType<typeof setTimeout> | null = null
let profileInputTimer: ReturnType<typeof setTimeout> | null = null
let activePointerId: number | null = null
let dragStartX = 0
let dragStartY = 0
const lastCodeSnapshot = ref<Record<string, string>>({})

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

const normalizeCode = (code: string) => code.trim().replace(/[^\d]/g, '').slice(0, 6)

const isValidCode = (code: string) => /^(0|3|6)\d{5}$/.test(normalizeCode(code))

const plannedSellPrice = (entry: BuyEntry) => {
  if (entry.buyPrice === null || entry.buyPrice <= 0) {
    return null
  }

  return roundPrice(entry.buyPrice * (1 + entry.targetRate / 100))
}

const dipPrice = (basePrice: number | null, dropRate: number) => {
  if (basePrice === null || basePrice <= 0) {
    return null
  }

  return roundPrice(basePrice * (1 + dropRate / 100))
}

const referencePrice = (stock: StockCard) => {
  const prices = stock.buyEntries
    .map((entry) => entry.buyPrice)
    .filter((price): price is number => price !== null && price > 0)

  if (!prices.length) {
    return null
  }

  return Math.min(...prices)
}

const recommendedAddPrice = (stock: StockCard) => dipPrice(referencePrice(stock), RECOMMENDED_ADD_RATE)

const minimumSellPrice = (stock: StockCard) => {
  const prices = stock.buyEntries
    .map((entry) => plannedSellPrice(entry))
    .filter((price): price is number => price !== null && price > 0)

  if (!prices.length) {
    return null
  }

  return Math.min(...prices)
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

  const totalShares = validEntries.reduce((sum, entry) => sum + (entry.lots as number), 0)
  const totalCost = validEntries.reduce((sum, entry) => sum + (entry.buyPrice as number) * (entry.lots as number), 0)

  return roundPrice(totalCost / totalShares)
}

const stockFingerprint = (stock: StockCard) =>
  JSON.stringify({
    name: stock.name.trim(),
    code: normalizeCode(stock.code),
    buyEntries: stock.buyEntries.map((entry) => ({
      buyPrice: entry.buyPrice,
      targetRate: entry.targetRate,
      lots: entry.lots
    })),
    dipAlerts: stock.dipAlerts.map((alert) => ({
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
}

const syncStockProfile = (stock: StockCard, profile: StockProfile) => {
  if (profile.name && shouldAutofillStockName(stock)) {
    stock.name = profile.name
  }

  stock.subIndustry = profile.subIndustry
  stock.primaryTheme = profile.primaryTheme
  stock.secondaryTheme = profile.secondaryTheme
  stock.coreBusiness = profile.coreBusiness
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

const themeList = (stock: StockCard) => [stock.primaryTheme, stock.secondaryTheme].map((value) => value.trim()).filter(Boolean)

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

const redAlertLevel = (stock: StockCard, price: number) => {
  const basePrice = referencePrice(stock)

  if (basePrice === null) {
    return 0 as const
  }

  let nextLevel: 0 | 1 | 2 | 3 = 0

  for (const alert of stock.dipAlerts) {
    const triggerPrice = dipPrice(basePrice, alert.dropRate)

    if (triggerPrice === null || price > triggerPrice) {
      continue
    }

    if (alert.dropRate <= -7) {
      nextLevel = Math.max(nextLevel, 3) as 0 | 1 | 2 | 3
    } else if (alert.dropRate <= -4) {
      nextLevel = Math.max(nextLevel, 2) as 0 | 1 | 2 | 3
    } else if (alert.dropRate <= -3) {
      nextLevel = Math.max(nextLevel, 1) as 0 | 1 | 2 | 3
    }
  }

  return nextLevel
}

const evaluateAlerts = () => {
  const nextStates: Record<string, AlertState> = { ...alertStates.value }
  let changed = false

  for (const stock of stocks.value) {
    const current = nextStates[stock.id] ?? emptyAlertState(stock)
    const quote = quoteFor(stock.code)

    if (quote.price === null) {
      nextStates[stock.id] = current
      continue
    }

    const nextRedLevel = redAlertLevel(stock, quote.price)
    const sellFloor = minimumSellPrice(stock)
    const greenTriggered = sellFloor !== null && quote.price >= sellFloor
    const triggeredDipAlertIds = new Set(current.triggeredDipAlertIds)
    const triggeredSellEntryIds = new Set(current.triggeredSellEntryIds)

    for (const alert of stock.dipAlerts) {
      const triggerPrice = dipPrice(referencePrice(stock), alert.dropRate)

      if (triggerPrice !== null && quote.price <= triggerPrice) {
        triggeredDipAlertIds.add(alert.id)
      }
    }

    for (const entry of stock.buyEntries) {
      const triggerPrice = plannedSellPrice(entry)

      if (triggerPrice !== null && quote.price >= triggerPrice) {
        triggeredSellEntryIds.add(entry.id)
      }
    }

    const updated: AlertState = {
      fingerprint: current.fingerprint,
      redLevel: Math.max(current.redLevel, nextRedLevel) as 0 | 1 | 2 | 3,
      greenActive: current.greenActive || greenTriggered,
      triggeredDipAlertIds: [...triggeredDipAlertIds],
      triggeredSellEntryIds: [...triggeredSellEntryIds]
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

const isSellTriggered = (stockId: string, entryId: string) =>
  alertStates.value[stockId]?.triggeredSellEntryIds.includes(entryId) ?? false

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

  const targetAlert = stock.dipAlerts.find((alert) => alert.dropRate === RECOMMENDED_ADD_RATE)

  if (!targetAlert) {
    return ''
  }

  return dipAlertClass(stockId, targetAlert)
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

      if (item) {
        nextQuotes[code] = {
          ...item,
          status: 'ready'
        }
      } else {
        nextQuotes[code] = {
          price: null,
          previousClose: null,
          change: null,
          changePercent: null,
          updatedAt: null,
          status: 'error'
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

  syncEntryLots(entry)
}

const handleLotsInput = (entry: BuyEntry) => {
  if (entry.lots === null || entry.lots <= 0) {
    entry.lotsManual = false
    syncEntryLots(entry)
    return
  }

  entry.lotsManual = true
}

const resetDragState = () => {
  activePointerId = null
  dragStartX = 0
  dragStartY = 0
  dragOffset.value = { x: 0, y: 0 }
  dragCardRect.value = { left: 0, top: 0, width: 0, height: 0 }
  draggedStockId.value = null
  pressedStockId.value = null
  dropTargetStockId.value = null
  document.body.classList.remove('is-dragging-stock')
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

const handleDragHandlePointerDown = (event: PointerEvent, stockId: string) => {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) {
    return
  }

  resetDragState()
  event.preventDefault()
  const cardElement = event.currentTarget.closest<HTMLElement>('[data-stock-id]')

  if (!cardElement) {
    return
  }

  const rect = cardElement.getBoundingClientRect()
  activePointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragCardRect.value = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }
  event.currentTarget.setPointerCapture(event.pointerId)
  draggedStockId.value = stockId
  pressedStockId.value = stockId
  dropTargetStockId.value = null
  document.body.classList.add('is-dragging-stock')
}

const handleGlobalPointerMove = (event: PointerEvent) => {
  if (activePointerId !== event.pointerId) {
    return
  }

  if (!draggedStockId.value) {
    return
  }

  event.preventDefault()
  dragOffset.value = {
    x: event.clientX - dragStartX,
    y: event.clientY - dragStartY
  }
  const target = document.elementFromPoint(event.clientX, event.clientY)

  if (!(target instanceof Element)) {
    return
  }

  const targetCard = target.closest<HTMLElement>('[data-stock-id]')
  const targetId = targetCard?.dataset.stockId

  if (!targetId || targetId === draggedStockId.value) {
    dropTargetStockId.value = null
    return
  }

  dropTargetStockId.value = targetId
}

const handleGlobalPointerUp = (event: PointerEvent) => {
  if (activePointerId !== event.pointerId) {
    return
  }

  if (draggedStockId.value && dropTargetStockId.value) {
    reorderStocks(draggedStockId.value, dropTargetStockId.value)
  }

  resetDragState()
}

const cardStyle = (stockId: string) => {
  if (draggedStockId.value !== stockId) {
    return undefined
  }

  return {
    position: 'fixed',
    left: `${dragCardRect.value.left + dragOffset.value.x}px`,
    top: `${dragCardRect.value.top + dragOffset.value.y}px`,
    width: `${dragCardRect.value.width}px`,
    height: `${dragCardRect.value.height}px`,
    transform: 'scale(1.03)',
    zIndex: '30',
    boxSizing: 'border-box'
  }
}

const addStock = () => {
  stocks.value.unshift({
    id: createId(),
    name: DEFAULT_STOCK_NAME,
    code: '',
    subIndustry: '',
    primaryTheme: '',
    secondaryTheme: '',
    coreBusiness: '',
    buyEntries: [createBuyEntry(null, 3, null, INITIAL_POSITION_BUDGET)],
    dipAlerts: [createDipAlert(-3), createDipAlert(-4), createDipAlert(-7)]
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
  stock.buyEntries.push(createBuyEntry(null, 3, null, ADD_POSITION_BUDGET))
}

const removeBuyEntry = (stock: StockCard, entryId: string) => {
  if (stock.buyEntries.length === 1) {
    return
  }

  if (!confirmDelete('确认删除这条买入记录吗？')) {
    return
  }

  stock.buyEntries = stock.buyEntries.filter((entry) => entry.id !== entryId)
}

const addDipAlert = (stock: StockCard) => {
  stock.dipAlerts.push(createDipAlert(-3))
}

const removeDipAlert = (stock: StockCard, alertId: string) => {
  if (stock.dipAlerts.length === 1) {
    return
  }

  if (!confirmDelete('确认删除这条补仓提醒吗？')) {
    return
  }

  stock.dipAlerts = stock.dipAlerts.filter((alert) => alert.id !== alertId)
}

const normalizeLoadedStocks = (input: unknown): StockCard[] | null => {
  if (!Array.isArray(input)) {
    return null
  }

  return input.map((stock: any) => ({
    id: typeof stock.id === 'string' ? stock.id : createId(),
    name: typeof stock.name === 'string' ? stock.name : UNNAMED_STOCK_NAME,
    code: typeof stock.code === 'string' ? stock.code : '',
    subIndustry: typeof stock.subIndustry === 'string' ? stock.subIndustry : '',
    primaryTheme: typeof stock.primaryTheme === 'string' ? stock.primaryTheme : '',
    secondaryTheme: typeof stock.secondaryTheme === 'string' ? stock.secondaryTheme : '',
    coreBusiness: typeof stock.coreBusiness === 'string' ? stock.coreBusiness : '',
    buyEntries: Array.isArray(stock.buyEntries) && stock.buyEntries.length
      ? stock.buyEntries.map((entry: any) => ({
          id: typeof entry.id === 'string' ? entry.id : createId(),
          buyPrice: typeof entry.buyPrice === 'number' ? entry.buyPrice : null,
          targetRate: typeof entry.targetRate === 'number' ? entry.targetRate : 3,
          lots: typeof entry.lots === 'number' ? entry.lots : null,
          autoBudget: typeof entry.autoBudget === 'number'
            ? entry.autoBudget
            : deriveBudgetFromEntry(entry, entryIndexBudget(stock.buyEntries, entry)),
          lotsManual: typeof entry.lotsManual === 'boolean'
            ? entry.lotsManual
            : typeof entry.lots === 'number'
        }))
      : [createBuyEntry()],
    dipAlerts: Array.isArray(stock.dipAlerts) && stock.dipAlerts.length
      ? stock.dipAlerts.map((alert: any) => ({
          id: typeof alert.id === 'string' ? alert.id : createId(),
          dropRate: typeof alert.dropRate === 'number' ? alert.dropRate : -3
        }))
      : [createDipAlert(-3), createDipAlert(-4), createDipAlert(-7)]
  }))
}

const entryIndexBudget = (entries: any[], currentEntry: any) => {
  const index = entries.indexOf(currentEntry)
  return index <= 0 ? INITIAL_POSITION_BUDGET : ADD_POSITION_BUDGET
}

const deriveBudgetFromEntry = (entry: any, fallbackBudget: number) => {
  if (typeof entry.buyPrice === 'number' && entry.buyPrice > 0 && typeof entry.lots === 'number' && entry.lots > 0) {
    return Math.round(entry.buyPrice * entry.lots * 100)
  }

  return fallbackBudget
}

const normalizeLoadedAlerts = (input: unknown): Record<string, AlertState> => {
  if (!input || typeof input !== 'object') {
    return {}
  }

  const entries = Object.entries(input as Record<string, any>)
  const normalized: Record<string, AlertState> = {}

  for (const [stockId, state] of entries) {
    if (!state || typeof state !== 'object') {
      continue
    }

    normalized[stockId] = {
      fingerprint: typeof state.fingerprint === 'string' ? state.fingerprint : '',
      redLevel: [0, 1, 2, 3].includes(state.redLevel) ? state.redLevel : 0,
      greenActive: Boolean(state.greenActive),
      triggeredDipAlertIds: Array.isArray(state.triggeredDipAlertIds) ? state.triggeredDipAlertIds.filter((id) => typeof id === 'string') : [],
      triggeredSellEntryIds: Array.isArray(state.triggeredSellEntryIds) ? state.triggeredSellEntryIds.filter((id) => typeof id === 'string') : []
    }
  }

  return normalized
}

onMounted(() => {
  const rawStocks = localStorage.getItem(STORAGE_KEY)
  const rawAlerts = localStorage.getItem(ALERT_STORAGE_KEY)

  if (rawStocks) {
    try {
      const parsed = JSON.parse(rawStocks)
      const normalized = normalizeLoadedStocks(parsed)

      if (normalized?.length) {
        stocks.value = normalized
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  if (rawAlerts) {
    try {
      alertStates.value = normalizeLoadedAlerts(JSON.parse(rawAlerts))
    } catch {
      localStorage.removeItem(ALERT_STORAGE_KEY)
    }
  }

  syncAlertStates()
  lastCodeSnapshot.value = Object.fromEntries(stocks.value.map((stock) => [stock.id, normalizeCode(stock.code)]))
  hydrated.value = true
  refreshQuotes()
  refreshProfiles()
  refreshTimer = setInterval(refreshQuotes, REFRESH_MS)
  window.addEventListener('pointermove', handleGlobalPointerMove, { passive: false })
  window.addEventListener('pointerup', handleGlobalPointerUp)
  window.addEventListener('pointercancel', handleGlobalPointerUp)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }

  if (quoteInputTimer) {
    clearTimeout(quoteInputTimer)
  }

  if (profileInputTimer) {
    clearTimeout(profileInputTimer)
  }

  resetDragState()
  window.removeEventListener('pointermove', handleGlobalPointerMove)
  window.removeEventListener('pointerup', handleGlobalPointerUp)
  window.removeEventListener('pointercancel', handleGlobalPointerUp)
})

watch(
  stocks,
  (value) => {
    if (!hydrated.value) {
      return
    }

    syncAlertStates()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  },
  { deep: true }
)

watch(
  alertStates,
  (value) => {
    if (!hydrated.value) {
      return
    }

    localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(value))
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

    if (hydrated.value) {
      scheduleQuoteRefresh()
      scheduleProfileRefresh()
    }
  }
)
</script>

<template>
  <main class="page-shell">
    <section class="topbar">
      <h1>T王神器</h1>

      <div class="topbar-actions">
        <span class="market-tip" :class="{ 'is-busy': quoteLoading }">行情每10秒刷新</span>
        <button class="primary-btn" type="button" @click="addStock">
          新增股票
        </button>
      </div>
    </section>

    <TransitionGroup name="card-move" tag="section" class="stock-grid">
      <article
        v-for="stock in stocks"
        :key="stock.id"
        class="stock-card"
        :class="[
          cardAlertClass(stock),
          {
            'is-dragging': draggedStockId === stock.id,
            'is-pressed': pressedStockId === stock.id,
            'is-drop-target': dropTargetStockId === stock.id
          }
        ]"
        :data-stock-id="stock.id"
        :style="cardStyle(stock.id)"
      >
        <button
          class="drag-handle"
          type="button"
          aria-label="拖动排序"
          @pointerdown="handleDragHandlePointerDown($event, stock.id)"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <header class="card-header">
          <div class="title-wrap">
            <div class="title-line">
              <input v-model="stock.name" class="title-input" type="text" placeholder="股票名称" />
              <span class="quote-pill" :class="quoteTone(stock.code)">
                {{ quoteLabel(stock.code) }}
              </span>
            </div>

            <div class="code-line">
              <input
                v-model="stock.code"
                class="code-input"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="股票代码"
              />
              <button class="ghost-btn" type="button" @click="removeStock(stock.id)">
                删除
              </button>
            </div>
          </div>
        </header>

        <section class="summary-strip">
          <div class="summary-box">
            <span>总市值</span>
            <strong>{{ formatAmount(totalMarketValue(stock)) }}</strong>
            <small class="summary-breakdown">
              <span>{{ formatAmount(investedAmount(stock)) }}</span>
              <span :class="profitTone(stock)">{{ profitSign(stock) }} {{ formatAmount(Math.abs(profitAmount(stock) ?? 0)) }}</span>
            </small>
          </div>
          <div class="summary-box">
            <span>均价</span>
            <strong>{{ formatPrice(averageCost(stock)) }}</strong>
          </div>
          <div class="summary-box">
            <span>推荐补仓</span>
            <strong class="recommended-add-text" :class="recommendedAddClass(stock.id)">{{ formatPrice(recommendedAddPrice(stock)) }}</strong>
          </div>
        </section>

        <section class="table-section">
          <div class="section-head">
            <h2>买入</h2>
            <button class="mini-btn" type="button" @click="addBuyEntry(stock)">
              + 买入
            </button>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>买入价</th>
                  <th>涨幅</th>
                  <th>卖价</th>
                  <th>手数</th>
                  <th>删</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in stock.buyEntries" :key="entry.id">
                  <td>
                    <input
                      v-model.number="entry.buyPrice"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0.00"
                      @input="handleBuyPriceInput(entry)"
                    />
                  </td>
                  <td>
                    <div class="inline-field">
                      <input v-model.number="entry.targetRate" type="number" step="0.5" />
                      <span>%</span>
                    </div>
                  </td>
                  <td class="accent-text sell-text" :class="{ 'number-alert-green': isSellTriggered(stock.id, entry.id) }">
                    {{ formatSellPrice(plannedSellPrice(entry)) }}
                  </td>
                  <td>
                    <input
                      v-model.number="entry.lots"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      @input="handleLotsInput(entry)"
                    />
                  </td>
                  <td class="action-cell">
                    <button class="icon-btn" type="button" @click="removeBuyEntry(stock, entry.id)">
                      删
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="table-section dip-section">
          <div class="section-head">
            <h2>补仓提醒</h2>
            <button class="mini-btn" type="button" @click="addDipAlert(stock)">
              + 提醒
            </button>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>跌幅</th>
                  <th>提醒价</th>
                  <th>删</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="alert in stock.dipAlerts" :key="alert.id">
                  <td>
                    <div class="inline-field">
                      <input v-model.number="alert.dropRate" type="number" step="0.1" />
                      <span>%</span>
                    </div>
                  </td>
                  <td class="warn-text" :class="dipAlertClass(stock.id, alert)">
                    {{ formatPrice(dipPrice(referencePrice(stock), alert.dropRate)) }}
                  </td>
                  <td class="action-cell">
                    <button class="icon-btn" type="button" @click="removeDipAlert(stock, alert.id)">
                      删
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="table-section info-section">
          <div class="section-head">
            <h2>重点信息</h2>
          </div>

          <div class="info-stack">
            <label class="info-field info-field-wide">
              <span>细分行业</span>
              <strong class="info-readonly">{{ profileText(stock.subIndustry, stock.code) }}</strong>
            </label>

            <label class="info-field info-field-wide">
              <span>热点题材</span>
              <div v-if="themeList(stock).length" class="theme-pills">
                <strong v-for="theme in themeList(stock)" :key="theme" class="info-readonly theme-chip">{{ theme }}</strong>
              </div>
              <strong v-else class="info-readonly">{{ profileText('', stock.code) }}</strong>
            </label>

            <label class="info-field info-field-wide">
              <span>主营业务</span>
              <p class="info-description">{{ profileText(stock.coreBusiness, stock.code) }}</p>
            </label>
          </div>
        </section>
      </article>
    </TransitionGroup>
  </main>
</template>
