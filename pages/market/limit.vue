<script setup lang="ts">
import { StockSDK, type ZTPoolItem } from 'stock-sdk'

type PoolItem = ZTPoolItem
type ViewMode = 'ladder' | 'industry' | 'down'
type StockItem = PoolItem & { board: number; isStrong: boolean; isBroken: boolean }
type GroupItem = { key: string; label: string; stocks: StockItem[] }
type DailyKlinePoint = {
  date: string
  open: number | null
  close: number | null
  high: number | null
  low: number | null
  volume: number | null
  ma?: Record<string, number | null>
}
type MinutePoint = { time: string; close: number | null; avgPrice: number | null; volume: number | null }
type ChartCandle = { date: string; x: number; high: number; low: number; bodyY: number; bodyHeight: number; width: number; color: string; title: string }
type ChartVolumeBar = { x: number; y: number; height: number; width: number; color: string }
type ChartLine = { period?: number; path: string; color: string }
type ChartGrid = { y: number; label: string; isZero?: boolean }
type ChartLabel = { x: number; label: string }
type DailyChartModel = { candles: ChartCandle[]; volumeBars: ChartVolumeBar[]; lines: ChartLine[]; grids: ChartGrid[]; labels: ChartLabel[]; min: number; max: number }
type MinuteChartModel = { lines: ChartLine[]; volumeBars: ChartVolumeBar[]; grids: ChartGrid[]; labels: ChartLabel[]; min: number; max: number }

const sdk = new StockSDK({
  timeout: 15_000,
  retry: { maxRetries: 2, baseDelay: 500 },
  rateLimit: { requestsPerSecond: 2, maxBurst: 1 }
})

const limitUps = ref<PoolItem[]>([])
const limitDowns = ref<PoolItem[]>([])
const strongCodes = ref<Set<string>>(new Set())
const brokenCodes = ref<Set<string>>(new Set())
const todayLimitUpCount = ref(0)
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const updatedAt = ref('')
const tradeDate = ref('')
const viewMode = ref<ViewMode>('ladder')
const selectedStock = ref<StockItem | null>(null)
const showDailyChart = ref(false)
const showMinuteChart = ref(false)
const chartLoading = ref(false)
const dailyError = ref('')
const minuteError = ref('')
const dailyKlines = ref<DailyKlinePoint[]>([])
const minuteKlines = ref<MinutePoint[]>([])
const chartRequestId = ref(0)
const marketTradeDate = ref('')
const minuteDate = ref('')
const minutePreviousClose = ref<number | null>(null)

const numberValue = (value: number | null | undefined, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback
const stockBoard = (stock: PoolItem): number => Math.max(1, Math.round(numberValue(stock.continuousBoardCount, 1)))
const stockItems = computed<StockItem[]>(() => limitUps.value.map((stock) => ({
  ...stock,
  board: stockBoard(stock),
  isStrong: strongCodes.value.has(stock.code),
  isBroken: brokenCodes.value.has(stock.code)
})))
const maxBoard = computed(() => stockItems.value.reduce((max, stock) => Math.max(max, stock.board), 0))

const ladderGroups = computed<GroupItem[]>(() => {
  const groups = new Map<number, StockItem[]>()
  for (const stock of stockItems.value) {
    const current = groups.get(stock.board) ?? []
    current.push(stock)
    groups.set(stock.board, current)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([board, stocks]) => ({ key: String(board), label: `${board}板`, stocks }))
})

const groupByIndustry = (stocks: StockItem[]): GroupItem[] => {
  const groups = new Map<string, StockItem[]>()
  for (const stock of stocks) {
    const key = stock.industry?.trim() || '其他'
    const current = groups.get(key) ?? []
    current.push(stock)
    groups.set(key, current)
  }
  return [...groups.entries()]
    .sort(([, left], [, right]) => right.length - left.length)
    .map(([label, stocks]) => ({ key: label, label, stocks: stocks.sort((left, right) => right.board - left.board) }))
}

const industryGroups = computed<GroupItem[]>(() => groupByIndustry(stockItems.value))
const downStockItems = computed<StockItem[]>(() => limitDowns.value.map((stock) => ({
  ...stock,
  board: 0,
  isStrong: false,
  isBroken: false
})))
const downIndustryGroups = computed<GroupItem[]>(() => groupByIndustry(downStockItems.value))

const activeGroups = computed(() => {
  if (viewMode.value === 'ladder') return ladderGroups.value
  if (viewMode.value === 'down') return downIndustryGroups.value
  return industryGroups.value
})
const totalBroken = computed(() => limitUps.value.reduce((total, stock) => total + numberValue(stock.failedCount), 0))

const formatTime = (value: string | null | undefined) => {
  if (!value) return '--:--'
  const text = String(value).replace(/[^0-9]/g, '').padStart(6, '0')
  return `${text.slice(0, 2)}:${text.slice(2, 4)}`
}
const formatAmount = (value: number | null | undefined) => {
  const amount = numberValue(value)
  if (!amount) return '--'
  return `${(amount / 100000000).toFixed(2)}亿`
}
const formatChange = (value: number | null | undefined) => value === null || value === undefined ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
const changeTone = (value: number | null | undefined) => value === null || value === undefined ? '' : value >= 0 ? 'is-rise' : 'is-fall'
const isLargeAmount = (value: number | null | undefined) => numberValue(value) > 200000000
const ztStatisticsText = (value: string | null | undefined) => {
  const matched = value?.trim().match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!matched) return ''
  const limitCount = Number(matched[2])
  const dayCount = Number(matched[1])
  return limitCount === dayCount ? '' : `${dayCount}天${limitCount}板`
}
const shanghaiDate = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const fields = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}
const displayDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'long' }).format(new Date(`${value}T00:00:00+08:00`))
const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

const chartPlot = { width: 760, height: 320, left: 52, right: 16, top: 18, bottom: 30 }
const chartWidth = chartPlot.width - chartPlot.left - chartPlot.right
const priceHeight = 188
const priceBottom = chartPlot.top + priceHeight
const volumeTop = priceBottom + 20
const volumeHeight = chartPlot.height - chartPlot.bottom - volumeTop
const maColors: Record<number, string> = { 5: '#d23a32', 10: '#e28a1a', 20: '#4d8b5b', 60: '#286fa8' }
const volumeColor = '#9aafa8'
const chartPriceText = (value: number) => value.toFixed(2)
const chartDateText = (value: string) => value.length >= 10 ? value.slice(5, 10) : value
const chartTimeText = (value: string) => value.length >= 5 ? value.slice(-5) : value
const chartPath = (values: Array<number | null>, xAt: (index: number) => number, yAt: (value: number) => number) => {
  let path = ''
  let connected = false
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      connected = false
      return
    }
    path += `${connected ? 'L' : 'M'}${xAt(index).toFixed(2)},${yAt(value).toFixed(2)} `
    connected = true
  })
  return path.trim()
}
const chartAxis = (values: number[]) => {
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.01)
    min -= padding
    max += padding
  } else {
    const padding = (max - min) * 0.08
    min -= padding
    max += padding
  }
  return { min, max }
}
const chartLabels = (length: number, formatter: (index: number) => string): ChartLabel[] => {
  if (!length) return []
  const indexes = [...new Set([0, Math.floor((length - 1) / 2), length - 1])]
  return indexes.map((index) => ({ x: chartPlot.left + (length === 1 ? chartWidth / 2 : (index / (length - 1)) * chartWidth), label: formatter(index) }))
}
const chartGrids = (min: number, max: number): ChartGrid[] => Array.from({ length: 5 }, (_, index) => {
  const ratio = index / 4
  return { y: chartPlot.top + ratio * priceHeight, label: chartPriceText(max - ratio * (max - min)) }
})
const chartPercentText = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
const chartPercentGrids = (maxAbs: number): ChartGrid[] => Array.from({ length: 7 }, (_, index) => {
  const ratio = index / 6
  return { y: chartPlot.top + ratio * priceHeight, label: chartPercentText(maxAbs - ratio * maxAbs * 2), isZero: index === 3 }
})
const minuteTimeValue = (value: string) => {
  const match = String(value).match(/(\d{2}):(\d{2})(?::\d{2})?$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}
const minuteChartLabels = (rows: MinutePoint[]): ChartLabel[] => {
  const targets = [570, 630, 690, 840, 900]
  const used = new Set<number>()
  return targets.flatMap((target) => {
    let bestIndex = -1
    let bestDistance = Infinity
    rows.forEach((row, index) => {
      const timeValue = minuteTimeValue(row.time)
      if (timeValue === null || used.has(index)) return
      const distance = Math.abs(timeValue - target)
      if (distance < bestDistance) {
        bestIndex = index
        bestDistance = distance
      }
    })
    if (bestIndex < 0 || bestDistance > 5) return []
    used.add(bestIndex)
    return [{
      x: chartPlot.left + (rows.length === 1 ? chartWidth / 2 : (bestIndex / (rows.length - 1)) * chartWidth),
      label: chartTimeText(rows[bestIndex].time)
    }]
  })
}
const volumeBars = (rows: Array<{ volume: number | null; color: string }>, xAt: (index: number) => number, width: number): ChartVolumeBar[] => {
  const maxVolume = Math.max(...rows.map((row) => row.volume ?? 0))
  if (!Number.isFinite(maxVolume) || maxVolume <= 0) return []
  return rows.map((row, index) => ({
    x: xAt(index), y: volumeTop + volumeHeight - ((row.volume ?? 0) / maxVolume) * volumeHeight,
    height: Math.max(row.volume ? 1 : 0, ((row.volume ?? 0) / maxVolume) * volumeHeight), width, color: row.color
  }))
}

const dailyChart = computed<DailyChartModel | null>(() => {
  const rows = dailyKlines.value.filter((row) => [row.open, row.close, row.high, row.low].every((value) => value !== null && Number.isFinite(value))).slice(-90)
  if (!rows.length) return null
  const prices = rows.flatMap((row) => [row.high!, row.low!, ...Object.values(row.ma ?? {}).filter((value): value is number => value !== null && Number.isFinite(value))])
  const axis = chartAxis(prices)
  if (!axis) return null
  const xAt = (index: number) => chartPlot.left + (rows.length === 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth)
  const yAt = (value: number) => chartPlot.top + ((axis.max - value) / (axis.max - axis.min)) * priceHeight
  const candleWidth = Math.max(3, Math.min(10, (chartWidth / rows.length) * 0.62))
  const candles = rows.map((row, index) => {
    const open = row.open!
    const close = row.close!
    const bodyY = yAt(Math.max(open, close))
    return {
      date: row.date,
      x: xAt(index), high: yAt(row.high!), low: yAt(row.low!), bodyY,
      bodyHeight: Math.max(2, Math.abs(yAt(open) - yAt(close))), width: candleWidth,
      color: close >= open ? '#c64f34' : '#1f6f62', title: `${row.date} 开 ${chartPriceText(open)} 高 ${chartPriceText(row.high!)} 低 ${chartPriceText(row.low!)} 收 ${chartPriceText(close)}`
    }
  })
  const lines = [5, 10, 20, 60].map((period) => ({
    period, path: chartPath(rows.map((row) => row.ma?.[`ma${period}`] ?? null), xAt, yAt), color: maColors[period]
  })).filter((line) => line.path)
  return { candles, volumeBars: volumeBars(rows.map((row) => ({ volume: row.volume, color: row.close! >= row.open! ? '#c64f34' : '#1f6f62' })), xAt, candleWidth), lines, grids: chartGrids(axis.min, axis.max), labels: chartLabels(rows.length, (index) => chartDateText(rows[index].date)), min: axis.min, max: axis.max }
})

const minuteChart = computed<MinuteChartModel | null>(() => {
  const rows = minuteKlines.value.filter((row) => row.close !== null && Number.isFinite(row.close))
  const previousClose = minutePreviousClose.value
  if (!rows.length || previousClose === null || !Number.isFinite(previousClose) || previousClose <= 0) return null
  const percentOfPreviousClose = (value: number | null) => value === null || !Number.isFinite(value) ? null : ((value - previousClose) / previousClose) * 100
  const changes = rows.flatMap((row) => [percentOfPreviousClose(row.close), percentOfPreviousClose(row.avgPrice)]).filter((value): value is number => value !== null)
  const maxChange = changes.length ? Math.max(...changes.map((value) => Math.abs(value))) : 0
  const maxAbs = maxChange > 0 ? maxChange : 1
  const xAt = (index: number) => chartPlot.left + (rows.length === 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth)
  const yAt = (value: number) => chartPlot.top + ((maxAbs - value) / (maxAbs * 2)) * priceHeight
  const lines = [
    { path: chartPath(rows.map((row) => percentOfPreviousClose(row.close)), xAt, yAt), color: '#c64f34' },
    { path: chartPath(rows.map((row) => percentOfPreviousClose(row.avgPrice)), xAt, yAt), color: '#e28a1a' }
  ].filter((line) => line.path)
  const pointWidth = Math.max(2, Math.min(8, (chartWidth / rows.length) * 0.7))
  return { lines, volumeBars: volumeBars(rows.map((row, index) => ({ volume: row.volume, color: index === 0 || (row.close ?? 0) >= (rows[index - 1].close ?? 0) ? '#c64f34' : '#1f6f62' })), xAt, pointWidth), grids: chartPercentGrids(maxAbs), labels: minuteChartLabels(rows), min: -maxAbs, max: maxAbs }
})

const dateDaysAgo = (days: number) => shanghaiDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000)).replace(/-/g, '')
const stockLabel = computed(() => selectedStock.value ? `${selectedStock.value.name} ${selectedStock.value.code}` : '')
const minuteIsToday = computed(() => Boolean(minuteDate.value) && minuteDate.value === marketTradeDate.value)
const minuteTitle = computed(() => minuteIsToday.value ? '当日分时图' : `${minuteDate.value} 分时图`)
const minuteRequestOptions = (date?: string) => date ? { period: '1' as const, startDate: `${date} 09:00`, endDate: `${date} 16:00` } : { period: '1' as const }
const readMinuteKlines = async (code: string, date: string) => (await sdk.kline.cnMinute(code, minuteRequestOptions(date))).map((row) => ({ time: row.time, close: row.close, avgPrice: 'avgPrice' in row ? row.avgPrice : null, volume: row.volume }))
const previousCloseForDate = (date: string, stock: StockItem | null = selectedStock.value) => {
  const rows = dailyKlines.value
    .filter((row) => row.close !== null && Number.isFinite(row.close))
    .sort((left, right) => left.date.localeCompare(right.date))
  const dateIndex = rows.findIndex((row) => row.date === date)
  const previousRow = dateIndex > 0 ? rows[dateIndex - 1] : rows.filter((row) => row.date < date).at(-1)
  const previousClose = previousRow?.close
  if (previousClose !== null && previousClose !== undefined && Number.isFinite(previousClose) && previousClose > 0) return previousClose
  if (date === marketTradeDate.value && stock?.price !== null && stock?.price !== undefined && stock?.changePercent !== null && stock?.changePercent !== undefined && Number.isFinite(stock.price) && Number.isFinite(stock.changePercent) && stock.price > 0 && 1 + stock.changePercent / 100 > 0) {
    return stock.price / (1 + stock.changePercent / 100)
  }
  return null
}
const openCharts = async (stock: StockItem) => {
  selectedStock.value = stock
  showDailyChart.value = true
  showMinuteChart.value = true
  chartLoading.value = true
  dailyError.value = ''
  minuteError.value = ''
  dailyKlines.value = []
  minuteKlines.value = []
  minutePreviousClose.value = null
  minuteDate.value = marketTradeDate.value
  const requestId = ++chartRequestId.value
  const [dailyResult, minuteResult] = await Promise.allSettled([
    sdk.kline.withIndicators(stock.code, { market: 'A', period: 'daily', adjust: '', startDate: dateDaysAgo(180), indicators: { ma: { periods: [5, 10, 20, 60] } } }),
    readMinuteKlines(stock.code, marketTradeDate.value)
  ])
  if (requestId !== chartRequestId.value) return
  if (dailyResult.status === 'fulfilled') {
    dailyKlines.value = dailyResult.value.map((row) => ({ date: row.date, open: row.open, close: row.close, high: row.high, low: row.low, volume: row.volume, ma: row.ma }))
  } else {
    dailyError.value = dailyResult.reason instanceof Error ? dailyResult.reason.message : '日 K 线读取失败'
  }
  minutePreviousClose.value = previousCloseForDate(marketTradeDate.value, stock)
  if (minuteResult.status === 'fulfilled') {
    minuteKlines.value = minuteResult.value
  } else {
    minuteError.value = minuteResult.reason instanceof Error ? minuteResult.reason.message : '分时数据读取失败'
  }
  chartLoading.value = false
}
const loadMinuteForDate = async (date: string) => {
  if (!selectedStock.value) return
  minuteDate.value = date
  minutePreviousClose.value = previousCloseForDate(date)
  minuteKlines.value = []
  minuteError.value = ''
  chartLoading.value = true
  const requestId = ++chartRequestId.value
  try {
    minuteKlines.value = await readMinuteKlines(selectedStock.value.code, date)
  } catch (cause) {
    if (requestId === chartRequestId.value) minuteError.value = cause instanceof Error ? cause.message : '分时数据读取失败'
  } finally {
    if (requestId === chartRequestId.value) chartLoading.value = false
  }
}
const returnToToday = () => loadMinuteForDate(marketTradeDate.value)
const closeChart = (type: 'daily' | 'minute') => {
  if (type === 'daily') showDailyChart.value = false
  else showMinuteChart.value = false
  if (!showDailyChart.value && !showMinuteChart.value) {
    selectedStock.value = null
    chartRequestId.value += 1
  }
}
const closeCharts = () => {
  showDailyChart.value = false
  showMinuteChart.value = false
  selectedStock.value = null
  chartRequestId.value += 1
}
const onChartPointerdown = (event: PointerEvent) => {
  if (!showDailyChart.value && !showMinuteChart.value) return
  const target = event.target
  if (!(target instanceof Element) || !target.closest('.market-chart-window')) closeCharts()
}
const onChartKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && (showDailyChart.value || showMinuteChart.value)) {
    showDailyChart.value = false
    showMinuteChart.value = false
    selectedStock.value = null
    chartRequestId.value += 1
  }
}

const load = async (isRefresh = false) => {
  if (isRefresh) refreshing.value = true
  else loading.value = true
  error.value = ''
  try {
    const today = shanghaiDate(new Date())
    const isTodayTradingDay = await sdk.calendar.isTradingDay(today)
    const currentDate = isTodayTradingDay ? today : await sdk.calendar.prevTradingDay(today)
    const previousDate = await sdk.calendar.prevTradingDay(currentDate)
    const [upPool, previousUpPool, downPool, strongPool] = await Promise.all([
      sdk.marketEvent.ztPool('zt', currentDate),
      sdk.marketEvent.ztPool('zt', previousDate),
      sdk.marketEvent.ztPool('dt', currentDate),
      sdk.marketEvent.ztPool('strong', currentDate)
    ])
    const currentStocks = upPool.filter((stock) => stock.code && stock.name)
    const currentCodes = new Set(currentStocks.map((stock) => stock.code))
    let brokenStocks = previousUpPool
      .filter((stock) => stock.code && stock.name && !currentCodes.has(stock.code) && stockBoard(stock) >= 2)
      .map((stock) => ({
        ...stock,
        continuousBoardCount: stockBoard(stock) + 1,
        firstBoardTime: null,
        lastBoardTime: null,
        boardAmount: null,
        sealAmount: null,
        changePercent: null,
        failedCount: null,
        ztStatistics: ''
      }))
    if (brokenStocks.length) {
      try {
        const brokenQuotes = await sdk.quotes.cn(brokenStocks.map((stock) => stock.code))
        const changeByCode = new Map(brokenQuotes.map((quote) => [quote.code, quote.changePercent]))
        brokenStocks = brokenStocks.map((stock) => ({
          ...stock,
          changePercent: changeByCode.get(stock.code) ?? stock.changePercent
        }))
      } catch (cause) {
        console.warn('[market limit] failed to refresh broken stock changes', cause)
      }
    }
    limitUps.value = [...currentStocks, ...brokenStocks]
    limitDowns.value = downPool.filter((stock) => stock.code && stock.name)
    todayLimitUpCount.value = currentStocks.length
    brokenCodes.value = new Set(brokenStocks.map((stock) => stock.code))
    strongCodes.value = new Set(strongPool.filter((stock) => stock.code).map((stock) => stock.code))
    updatedAt.value = new Date().toISOString()
    marketTradeDate.value = currentDate
    tradeDate.value = displayDate(currentDate)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '涨跌停数据获取失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onChartKeydown)
  document.addEventListener('pointerdown', onChartPointerdown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onChartKeydown)
  document.removeEventListener('pointerdown', onChartPointerdown)
})
</script>

<template>
  <main class="page-shell limit-analysis-page">
    <section class="topbar limit-analysis-topbar">
      <div>
        <p class="sentiment-eyebrow">LIMIT ANALYSIS</p>
        <h1>涨跌停分析</h1>
      </div>
      <div class="topbar-actions">
        <span class="market-tip">{{ tradeDate || '实时行情' }}</span>
        <button class="refresh-btn" type="button" :disabled="loading || refreshing" @click="load(true)">
          <span aria-hidden="true">↻</span>{{ refreshing ? '更新中' : '刷新行情' }}
        </button>
        <span class="market-tip" :class="{ 'is-busy': refreshing }">{{ refreshing ? '正在读取 stock-sdk' : updatedAt ? `更新于 ${new Date(updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待数据' }}</span>
        <NuxtLink class="ghost-link" to="/market/sentiment">情绪</NuxtLink>
        <NuxtLink class="ghost-link" to="/market/data">市场数据</NuxtLink>
        <NuxtLink class="ghost-link" to="/">看板</NuxtLink>
        <button class="ghost-btn" type="button" @click="logout">退出</button>
      </div>
    </section>

    <p v-if="error" class="sentiment-alert">{{ error }}</p>

    <section class="limit-summary">
      <article class="limit-summary-card limit-summary-up"><span>涨停</span><strong>{{ todayLimitUpCount }}</strong><small>当前封板股票</small></article>
      <article class="limit-summary-card limit-summary-down"><span>跌停</span><strong>{{ limitDowns.length }}</strong><small>当前跌停股票</small></article>
      <article class="limit-summary-card"><span>最高连板</span><strong>{{ maxBoard || '--' }}<i v-if="maxBoard">板</i></strong><small>连板高度</small></article>
      <article class="limit-summary-card"><span>炸板次数</span><strong>{{ totalBroken || '--' }}</strong><small>涨停池累计</small></article>
    </section>

    <section class="limit-analysis-panel">
      <header class="limit-analysis-heading">
        <div>
          <p class="section-label">{{ viewMode === 'down' ? 'LIMIT-DOWN POOL' : 'LIMIT-UP POOL' }}</p>
          <h2>{{ viewMode === 'ladder' ? '连板高度' : viewMode === 'down' ? '板块跌停数' : '板块涨停数' }}</h2>
        </div>
        <div class="mode-switch" aria-label="涨跌停排版">
          <button type="button" :class="{ 'is-active': viewMode === 'ladder' }" @click="viewMode = 'ladder'">连板高度</button>
          <button type="button" :class="{ 'is-active': viewMode === 'industry' }" @click="viewMode = 'industry'">板块涨停数</button>
          <button type="button" :class="{ 'is-active': viewMode === 'down' }" @click="viewMode = 'down'">板块跌停数</button>
        </div>
      </header>

      <div v-if="loading" class="limit-analysis-empty">正在读取涨跌停数据...</div>
      <div v-else-if="!activeGroups.length" class="limit-analysis-empty">暂无{{ viewMode === 'down' ? '跌停' : '涨停' }}股票数据</div>
      <div v-else class="limit-groups">
        <section v-for="group in activeGroups" :key="group.key" class="limit-group">
          <div class="limit-group-label">
            <strong>{{ group.label }}</strong>
            <span>{{ group.stocks.length }}只</span>
          </div>
          <div class="limit-stock-grid">
            <article v-for="stock in group.stocks" :key="stock.code" class="limit-stock" :class="{ 'is-broken': stock.isBroken }" role="button" tabindex="0" :aria-label="`查看 ${stock.name} ${stock.code} 的日K线和分时图`" @click="openCharts(stock)" @keydown.enter.prevent="openCharts(stock)" @keydown.space.prevent="openCharts(stock)">
              <div class="limit-stock-meta">
                <span>{{ formatTime(stock.firstBoardTime) }}</span>
                <em class="limit-stock-amount" :class="{ 'is-large': isLargeAmount(viewMode === 'down' ? stock.sealAmount : stock.boardAmount) }">{{ formatAmount(viewMode === 'down' ? stock.sealAmount : stock.boardAmount) }}</em>
                <em class="limit-stock-change" :class="[changeTone(stock.changePercent), { 'is-down': viewMode === 'down' }]">{{ formatChange(stock.changePercent) }}</em>
              </div>
              <div class="limit-stock-name-row">
                <strong class="limit-stock-name" :title="`${stock.name} ${stock.code}`">{{ stock.name }}</strong>
                <div class="limit-stock-signals">
                  <b v-if="stock.isStrong" class="limit-stock-badge limit-stock-badge-strong">高</b>
                  <b v-if="stock.failedCount" class="limit-stock-badge limit-stock-badge-broken">{{ stock.failedCount }}</b>
                </div>
              </div>
              <div class="limit-stock-foot"><span :class="{ 'limit-stock-board': viewMode === 'industry' }">{{ viewMode === 'ladder' || viewMode === 'down' ? stock.industry || '其他' : `${stock.board}板` }}</span><em v-if="ztStatisticsText(stock.ztStatistics)" class="limit-stock-statistics">{{ ztStatisticsText(stock.ztStatistics) }}</em></div>
            </article>
          </div>
        </section>
      </div>
    </section>
  </main>

  <Teleport to="body">
    <section v-if="showDailyChart" class="market-chart-window market-chart-window-daily" role="dialog" aria-label="90日日K线图">
      <header class="market-chart-window-head">
        <div>
          <span class="market-chart-eyebrow">90 DAYS · DAILY KLINE</span>
          <h2>{{ stockLabel }}</h2>
        </div>
        <button class="market-chart-close" type="button" aria-label="关闭日K线图" title="关闭日K线图" @click="closeChart('daily')"><span aria-hidden="true">×</span></button>
      </header>
      <div class="market-chart-legend">
        <span><i class="market-chart-swatch market-chart-swatch-candle"></i>日 K</span>
        <span v-for="period in [5, 10, 20, 60]" :key="period"><i class="market-chart-swatch" :style="{ background: maColors[period] }"></i>MA{{ period }}</span>
      </div>
      <div v-if="chartLoading && !dailyChart" class="market-chart-state">正在读取日 K 线...</div>
      <div v-else-if="dailyError" class="market-chart-state is-error">{{ dailyError }}</div>
      <div v-else-if="!dailyChart" class="market-chart-state">暂无日 K 线数据</div>
      <svg v-else class="market-chart-svg" :viewBox="`0 0 ${chartPlot.width} ${chartPlot.height}`" role="img" :aria-label="`${stockLabel} 90 日日 K 线`">
        <g class="market-chart-grid">
          <line v-for="grid in dailyChart.grids" :key="grid.y" :x1="chartPlot.left" :x2="chartPlot.width - chartPlot.right" :y1="grid.y" :y2="grid.y" />
          <text v-for="grid in dailyChart.grids" :key="`label-${grid.y}`" :x="chartPlot.left - 8" :y="grid.y + 4" text-anchor="end">{{ grid.label }}</text>
        </g>
        <g class="market-chart-candles">
          <g v-for="candle in dailyChart.candles" :key="candle.title" class="market-chart-candle" role="button" tabindex="0" :aria-label="`查看 ${candle.date} 分时图`" @click="loadMinuteForDate(candle.date)" @keydown.enter.prevent="loadMinuteForDate(candle.date)" @keydown.space.prevent="loadMinuteForDate(candle.date)">
            <title>{{ candle.title }}</title>
            <line :x1="candle.x" :x2="candle.x" :y1="candle.high" :y2="candle.low" :stroke="candle.color" />
            <rect :x="candle.x - candle.width / 2" :y="candle.bodyY" :width="candle.width" :height="candle.bodyHeight" :fill="candle.color" />
          </g>
        </g>
        <path v-for="line in dailyChart.lines" :key="line.period" class="market-chart-line" :d="line.path" :stroke="line.color" />
        <line class="market-chart-volume-axis" :x1="chartPlot.left" :x2="chartPlot.width - chartPlot.right" :y1="volumeTop + volumeHeight" :y2="volumeTop + volumeHeight" />
        <g class="market-chart-volumes"><rect v-for="(bar, index) in dailyChart.volumeBars" :key="`daily-volume-${index}`" :x="bar.x - bar.width / 2" :y="bar.y" :width="bar.width" :height="bar.height" :fill="bar.color" /></g>
        <g class="market-chart-labels"><text v-for="label in dailyChart.labels" :key="label.x" :x="label.x" :y="chartPlot.height - 8" text-anchor="middle">{{ label.label }}</text></g>
      </svg>
    </section>

    <section v-if="showMinuteChart" class="market-chart-window market-chart-window-minute" role="dialog" aria-label="当日分时图">
      <header class="market-chart-window-head">
        <div>
          <span class="market-chart-eyebrow">{{ minuteIsToday ? 'TODAY · INTRADAY' : 'HISTORY · INTRADAY' }}</span>
          <h2>{{ stockLabel }}</h2>
        </div>
        <div class="market-chart-window-head-actions">
          <button v-if="!minuteIsToday" class="market-chart-return" type="button" @click="returnToToday">切回当日</button>
          <button class="market-chart-close" type="button" aria-label="关闭分时图" title="关闭分时图" @click="closeChart('minute')"><span aria-hidden="true">×</span></button>
        </div>
      </header>
      <p class="market-chart-date">{{ minuteTitle }}</p>
      <div class="market-chart-legend"><span><i class="market-chart-swatch market-chart-swatch-price"></i>价格</span><span><i class="market-chart-swatch market-chart-swatch-average"></i>均价</span></div>
      <div v-if="chartLoading && !minuteChart" class="market-chart-state">正在读取分时数据...</div>
      <div v-else-if="minuteError" class="market-chart-state is-error">{{ minuteError }}</div>
      <div v-else-if="!minuteChart" class="market-chart-state">暂无当日分时数据</div>
      <svg v-else class="market-chart-svg" :viewBox="`0 0 ${chartPlot.width} ${chartPlot.height}`" role="img" :aria-label="`${stockLabel} 当日分时图`">
        <g class="market-chart-grid market-chart-grid-minute">
          <line v-for="grid in minuteChart.grids" :key="grid.y" :class="{ 'market-chart-grid-zero': grid.isZero }" :x1="chartPlot.left" :x2="chartPlot.width - chartPlot.right" :y1="grid.y" :y2="grid.y" />
          <text v-for="grid in minuteChart.grids" :key="`label-${grid.y}`" :x="chartPlot.left - 8" :y="grid.y + 4" text-anchor="end">{{ grid.label }}</text>
        </g>
        <path v-for="line in minuteChart.lines" :key="line.color" class="market-chart-line" :d="line.path" :stroke="line.color" />
        <line class="market-chart-volume-axis" :x1="chartPlot.left" :x2="chartPlot.width - chartPlot.right" :y1="volumeTop + volumeHeight" :y2="volumeTop + volumeHeight" />
        <g class="market-chart-volumes"><rect v-for="(bar, index) in minuteChart.volumeBars" :key="`minute-volume-${index}`" :x="bar.x - bar.width / 2" :y="bar.y" :width="bar.width" :height="bar.height" :fill="bar.color" /></g>
        <g class="market-chart-labels"><text v-for="label in minuteChart.labels" :key="label.x" :x="label.x" :y="chartPlot.height - 8" text-anchor="middle">{{ label.label }}</text></g>
      </svg>
    </section>
  </Teleport>
</template>
