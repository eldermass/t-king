<script setup lang="ts">
import { StockSDK, type ZTPoolItem } from 'stock-sdk'

type PoolItem = ZTPoolItem
type ViewMode = 'ladder' | 'industry' | 'down'
type StockItem = PoolItem & { board: number; isStrong: boolean; isBroken: boolean }
type GroupItem = { key: string; label: string; stocks: StockItem[] }

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
const isLargeAmount = (value: number | null | undefined) => numberValue(value) > 200000000
const ztStatisticsText = (value: string | null | undefined) => {
  const matched = value?.trim().match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!matched) return ''
  const limitCount = Number(matched[1])
  const dayCount = Number(matched[2])
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
    const brokenStocks = previousUpPool
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
    limitUps.value = [...currentStocks, ...brokenStocks]
    limitDowns.value = downPool.filter((stock) => stock.code && stock.name)
    todayLimitUpCount.value = currentStocks.length
    brokenCodes.value = new Set(brokenStocks.map((stock) => stock.code))
    strongCodes.value = new Set(strongPool.filter((stock) => stock.code).map((stock) => stock.code))
    updatedAt.value = new Date().toISOString()
    tradeDate.value = displayDate(currentDate)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '涨跌停数据获取失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

onMounted(() => load())
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
            <article v-for="stock in group.stocks" :key="stock.code" class="limit-stock" :class="{ 'is-broken': stock.isBroken }">
              <div class="limit-stock-meta">
                <span>{{ formatTime(stock.firstBoardTime) }}</span>
                <em class="limit-stock-amount" :class="{ 'is-large': isLargeAmount(viewMode === 'down' ? stock.sealAmount : stock.boardAmount) }">{{ formatAmount(viewMode === 'down' ? stock.sealAmount : stock.boardAmount) }}</em>
                <em class="limit-stock-change" :class="{ 'is-down': viewMode === 'down' }">{{ formatChange(stock.changePercent) }}</em>
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
</template>
