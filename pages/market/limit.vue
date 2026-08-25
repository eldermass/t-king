<script setup lang="ts">
import { StockSDK, type ZTPoolItem } from 'stock-sdk'

type PoolItem = ZTPoolItem
type ViewMode = 'ladder' | 'industry' | 'down'
type StockItem = PoolItem & { board: number }
type GroupItem = { key: string; label: string; stocks: StockItem[] }

const sdk = new StockSDK({
  timeout: 15_000,
  retry: { maxRetries: 2, baseDelay: 500 },
  rateLimit: { requestsPerSecond: 2, maxBurst: 1 }
})

const limitUps = ref<PoolItem[]>([])
const limitDowns = ref<PoolItem[]>([])
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const updatedAt = ref('')
const tradeDate = ref('')
const viewMode = ref<ViewMode>('ladder')

const numberValue = (value: number | null | undefined, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback
const stockBoard = (stock: PoolItem): number => Math.max(1, Math.round(numberValue(stock.continuousBoardCount, 1)))
const stockItems = computed<StockItem[]>(() => limitUps.value.map((stock) => ({ ...stock, board: stockBoard(stock) })))
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
const downStockItems = computed<StockItem[]>(() => limitDowns.value.map((stock) => ({ ...stock, board: 0 })))
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
  return amount >= 100000000 ? `${(amount / 100000000).toFixed(1)}亿` : `${(amount / 10000).toFixed(0)}万`
}
const formatChange = (value: number | null | undefined) => value === null || value === undefined ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
const boardText = (stock: PoolItem) => stock.continuousBoardCount === null || stock.continuousBoardCount === undefined ? '--' : `${stock.continuousBoardCount}板`
const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

const load = async (isRefresh = false) => {
  if (isRefresh) refreshing.value = true
  else loading.value = true
  error.value = ''
  try {
    const [upPool, downPool] = await Promise.all([
      sdk.marketEvent.ztPool('zt'),
      sdk.marketEvent.ztPool('dt')
    ])
    limitUps.value = upPool.filter((stock) => stock.code && stock.name)
    limitDowns.value = downPool.filter((stock) => stock.code && stock.name)
    updatedAt.value = new Date().toISOString()
    tradeDate.value = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'long' }).format(new Date())
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
      <article class="limit-summary-card limit-summary-up"><span>涨停</span><strong>{{ limitUps.length }}</strong><small>当前封板股票</small></article>
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
            <article v-for="stock in group.stocks" :key="stock.code" class="limit-stock">
              <div class="limit-stock-meta"><span>{{ formatTime(stock.firstBoardTime) }}</span><b v-if="stock.failedCount">炸{{ stock.failedCount }}</b><em :class="{ 'is-down': viewMode === 'down' }">{{ formatChange(stock.changePercent) }}</em></div>
              <strong class="limit-stock-name" :title="`${stock.name} ${stock.code}`">{{ stock.name }}</strong>
              <div class="limit-stock-foot"><span>{{ viewMode === 'ladder' ? stock.industry || '其他' : viewMode === 'down' ? stock.industry || '其他' : `${stock.board}板` }}</span><em>{{ boardText(stock) }} · {{ formatAmount(stock.boardAmount) }}</em></div>
            </article>
          </div>
        </section>
      </div>
    </section>
  </main>
</template>
