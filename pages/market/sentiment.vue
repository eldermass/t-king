<script setup lang="ts">
type MetricKey = 'profitScore' | 'speculationScore' | 'breadthScore' | 'limitScore' | 'liquidityScore' | 'riskScore'
type Sentiment = {
  tradeDate: string
  updatedAt: string
  marketSentiment: number | null
  profitScore: number | null
  speculationScore: number | null
  breadthScore: number | null
  limitScore: number | null
  liquidityScore: number | null
  riskScore: number | null
  momentum: number | null
  phase: string
  stale: boolean
  error: string | null
  market: Record<string, number | string[] | null>
}
type HistoryItem = Pick<Sentiment, 'tradeDate' | 'marketSentiment' | 'profitScore' | 'speculationScore' | 'breadthScore' | 'riskScore' | 'phase' | 'momentum'>
type DetailItem = { label: string; value: string }

const emptySentiment = (): Sentiment => ({
  tradeDate: '--', updatedAt: '', marketSentiment: null, profitScore: null, speculationScore: null,
  breadthScore: null, limitScore: null, liquidityScore: null, riskScore: null, momentum: null,
  phase: 'UNKNOWN', stale: false, error: null,
  market: { advancers: null, decliners: null, unchanged: null, limitUp: null, limitDown: null, brokenBoard: null, brokenBoardRate: null, maxBoard: null, board2: null, board3: null, board4Plus: null, totalAmount: null, limitUpCodes: [] }
})

const data = ref<Sentiment>(emptySentiment())
const history = ref<HistoryItem[]>([])
const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
const viewMode = ref<'live' | 'close'>('live')

const metricDefinitions: Array<{ key: MetricKey; label: string; note: string }> = [
  { key: 'profitScore', label: '赚钱效应', note: '昨日强势股今日表现' },
  { key: 'speculationScore', label: '投机情绪', note: '涨停与连板活跃度' },
  { key: 'breadthScore', label: '市场宽度', note: '上涨广度与中位数' },
  { key: 'limitScore', label: '涨跌停情绪', note: '涨停、跌停的强弱差' },
  { key: 'liquidityScore', label: '市场活跃度', note: '两市成交金额' },
  { key: 'riskScore', label: '市场风险', note: '数值越高风险越大' }
]

const phaseLabels: Record<string, string> = { PANIC: '极度冰点', COLD: '冰点', WEAK: '弱势', RECOVERY: '修复', STRONG: '强势', HOT: '高潮', EUPHORIC: '极度亢奋', UNKNOWN: '暂无数据' }
const phaseLabel = computed(() => phaseLabels[data.value.phase] ?? '暂无数据')
const scoreText = (value: number | null) => value === null ? '--' : value.toFixed(1)
const integerText = (value: number | null) => value === null ? '--' : Math.round(value).toLocaleString('zh-CN')
const amountText = (value: number | null) => value === null ? '--' : `${(value / 100000000).toFixed(0)} 亿`
const momentumText = computed(() => data.value.momentum === null ? '--' : `${data.value.momentum >= 0 ? '+' : ''}${data.value.momentum.toFixed(1)}`)
const historyHigh = computed(() => history.value.length ? Math.max(...history.value.map((item) => item.marketSentiment ?? 0)) : null)
const momentumTone = computed(() => data.value.momentum === null ? '' : data.value.momentum >= 0 ? 'is-up' : 'is-down')
const scoreTone = (value: number | null, risk = false) => {
  if (value === null) return ''
  const adjusted = risk ? 100 - value : value
  return adjusted >= 60 ? 'is-strong' : adjusted <= 40 ? 'is-weak' : 'is-neutral'
}
const metricWidth = (value: number | null) => `${value === null ? 0 : Math.min(100, Math.max(0, value))}%`
const marketValue = (key: string) => {
  const value = data.value.market[key]
  return typeof value === 'number' ? value : null
}
const limitUpCodes = computed(() => Array.isArray(data.value.market.limitUpCodes) ? data.value.market.limitUpCodes as string[] : [])
const percentText = (value: number | null) => value === null ? '--' : `${(value * 100).toFixed(1)}%`
const modeLabel = computed(() => viewMode.value === 'live' ? '实时行情' : '上个交易日收盘')
const metricDetails = (key: MetricKey): DetailItem[] => {
  const value = (field: string, label: string, formatter: (item: number | null) => string = integerText): DetailItem => ({ label, value: formatter(marketValue(field)) })
  const percent = (field: string, label: string) => value(field, label, percentText)
  if (key === 'profitScore') return [percent('yesterdayLimitUpReturn', '昨日涨停平均收益'), percent('yesterdayLimitUpMedianReturn', '昨日涨停中位数'), percent('yesterdayLimitUpRiseRatio', '昨日涨停上涨比例'), percent('yesterdayLadderReturn', '昨日连板收益'), percent('leaderReturn', '昨日最高板收益')]
  if (key === 'speculationScore') return [value('limitUp', '涨停家数'), value('maxBoard', '最高连板'), value('board1', '一板'), value('board2', '二板'), value('board3', '三板'), value('board4Plus', '四板+'), value('board5', '五板'), value('board6', '六板'), value('board7Plus', '七板+')]
  if (key === 'breadthScore') return [value('totalStocks', '股票总数'), value('advancers', '上涨家数'), value('decliners', '下跌家数'), value('unchanged', '平盘家数')]
  if (key === 'limitScore') return [value('limitUp', '涨停家数'), value('limitDown', '跌停家数'), value('brokenBoard', '炸板家数'), percent('brokenBoardRate', '炸板率')]
  if (key === 'liquidityScore') return [value('totalAmount', '两市成交额', amountText), percent('amountChange', '成交额变化')]
  return [value('limitDown', '跌停家数'), percent('brokenBoardRate', '炸板率'), percent('leaderReturn', '高位股收益')]
}

const load = async (initial = false) => {
  if (initial) loading.value = true
  else refreshing.value = true
  try {
    const [snapshot, records] = await Promise.all([
      $fetch<Sentiment>(`/api/market/sentiment${viewMode.value === 'close' ? '?mode=close' : ''}`),
      $fetch<HistoryItem[]>('/api/market/sentiment/history?days=60')
    ])
    data.value = snapshot
    history.value = records
    loadError.value = snapshot.error ?? ''
  } catch {
    loadError.value = '行情获取失败'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const setMode = (mode: 'live' | 'close') => { if (viewMode.value !== mode) { viewMode.value = mode; load(true) } }
const refresh = () => load()

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

onMounted(() => {
  load(true)
})
</script>

<template>
  <main class="page-shell sentiment-page">
    <section class="topbar sentiment-topbar">
      <div>
        <p class="sentiment-eyebrow">MARKET STATUS</p>
        <h1>A股市场情绪</h1>
      </div>
      <div class="topbar-actions">
        <button class="refresh-btn" type="button" :disabled="refreshing" @click="refresh"><span aria-hidden="true">↻</span>{{ refreshing ? '刷新中' : '刷新行情' }}</button>
        <div class="mode-switch" role="group" aria-label="行情模式"><button type="button" :class="{ 'is-active': viewMode === 'live' }" @click="setMode('live')">实时行情</button><button type="button" :class="{ 'is-active': viewMode === 'close' }" @click="setMode('close')">上个交易日收盘</button></div>
        <span class="market-tip" :class="{ 'is-busy': refreshing }">{{ refreshing ? '更新中' : data.updatedAt ? `更新于 ${new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待数据' }}</span>
        <NuxtLink class="ghost-link" to="/">看板</NuxtLink>
        <NuxtLink class="ghost-link" to="/ruler">刻度</NuxtLink>
        <button class="ghost-btn" type="button" @click="logout">退出</button>
      </div>
    </section>

    <p v-if="loadError" class="sentiment-alert">{{ loadError }}，保留最近一次成功数据</p>

    <section class="sentiment-card-grid">
      <article class="sentiment-panel overview-card">
        <header class="panel-heading"><div><span class="section-label">SENTIMENT OVERVIEW</span><h2>综合情绪与历史评分</h2></div><span class="panel-date">{{ data.tradeDate }}</span></header>
        <div class="overview-main"><div class="sentiment-score-line"><strong>{{ scoreText(data.marketSentiment) }}</strong><span>/ 100</span></div><div class="sentiment-phase"><i></i>{{ phaseLabel }}</div><p>情绪变化 <strong :class="momentumTone">{{ data.momentum === null ? '--' : `${data.momentum >= 0 ? '↑' : '↓'} ${momentumText}` }}</strong></p></div>
        <div v-if="history.length" class="history-chart"><div v-for="item in history.slice().reverse()" :key="`${item.tradeDate}-${item.marketSentiment}`" class="history-bar" :title="`${item.tradeDate} ${scoreText(item.marketSentiment)}`"><i :class="scoreTone(item.marketSentiment)" :style="{ height: `${item.marketSentiment ?? 0}%` }"></i></div></div><p v-else class="empty-state">暂无历史评分</p>
        <div class="history-latest"><span>{{ modeLabel }}</span><span>交易日 {{ data.tradeDate }}</span><span>最高 {{ scoreText(historyHigh) }}</span></div>
      </article>
      <article v-for="metric in metricDefinitions" :key="metric.key" class="sentiment-panel metric-detail-card" :class="scoreTone(data[metric.key], metric.key === 'riskScore')">
        <header class="panel-heading"><div><span class="section-label">{{ metric.key.replace('Score', '').toUpperCase() }}</span><h2>{{ metric.label }}</h2></div><strong class="detail-score">{{ scoreText(data[metric.key]) }}</strong></header>
        <div class="metric-track"><i :style="{ width: metricWidth(data[metric.key]) }"></i></div><p class="metric-note">{{ metric.note }}</p>
        <div class="detail-grid"><div v-for="item in metricDetails(metric.key)" :key="item.label"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div></div>
      </article>
    </section>

    <section class="sentiment-panel limit-up-codes-panel"><header class="panel-heading"><div><span class="section-label">LIMIT-UP STOCKS</span><h2>当前涨停股票</h2></div><span class="panel-note">{{ limitUpCodes.length }} 只</span></header><div v-if="limitUpCodes.length" class="limit-up-code-list"><span v-for="code in limitUpCodes" :key="code">{{ code }}</span></div><p v-else class="empty-state">暂无涨停股票代码，刷新实时行情后自动更新。</p></section>

  </main>
</template>
