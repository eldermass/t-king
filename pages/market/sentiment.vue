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
  market: Record<string, number | null>
}
type HistoryItem = Pick<Sentiment, 'tradeDate' | 'marketSentiment' | 'profitScore' | 'speculationScore' | 'breadthScore' | 'riskScore' | 'phase' | 'momentum'>

const emptySentiment = (): Sentiment => ({
  tradeDate: '--', updatedAt: '', marketSentiment: null, profitScore: null, speculationScore: null,
  breadthScore: null, limitScore: null, liquidityScore: null, riskScore: null, momentum: null,
  phase: 'UNKNOWN', stale: false, error: null,
  market: { advancers: null, decliners: null, unchanged: null, limitUp: null, limitDown: null, brokenBoard: null, brokenBoardRate: null, maxBoard: null, board2: null, board3: null, board4Plus: null, totalAmount: null }
})

const data = ref<Sentiment>(emptySentiment())
const history = ref<HistoryItem[]>([])
const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
let timer: ReturnType<typeof setInterval> | undefined

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
const momentumTone = computed(() => data.value.momentum === null ? '' : data.value.momentum >= 0 ? 'is-up' : 'is-down')
const scoreTone = (value: number | null, risk = false) => {
  if (value === null) return ''
  const adjusted = risk ? 100 - value : value
  return adjusted >= 60 ? 'is-strong' : adjusted <= 40 ? 'is-weak' : 'is-neutral'
}
const metricWidth = (value: number | null) => `${value === null ? 0 : Math.min(100, Math.max(0, value))}%`
const marketValue = (key: string) => data.value.market[key] ?? null

const load = async (initial = false) => {
  if (initial) loading.value = true
  else refreshing.value = true
  try {
    const [snapshot, records] = await Promise.all([
      $fetch<Sentiment>('/api/market/sentiment'),
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

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

onMounted(() => {
  load(true)
  timer = setInterval(() => load(), 10_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <main class="page-shell sentiment-page">
    <section class="topbar sentiment-topbar">
      <div>
        <p class="sentiment-eyebrow">MARKET STATUS</p>
        <h1>A股市场情绪</h1>
      </div>
      <div class="topbar-actions">
        <span class="market-tip" :class="{ 'is-busy': refreshing }">{{ refreshing ? '更新中' : data.updatedAt ? `更新于 ${new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待数据' }}</span>
        <NuxtLink class="ghost-link" to="/">看板</NuxtLink>
        <NuxtLink class="ghost-link" to="/ruler">刻度</NuxtLink>
        <button class="ghost-btn" type="button" @click="logout">退出</button>
      </div>
    </section>

    <p v-if="loadError" class="sentiment-alert">{{ loadError }}，保留最近一次成功数据</p>

    <section class="sentiment-hero" :class="scoreTone(data.marketSentiment)">
      <div class="sentiment-hero-copy">
        <span class="section-label">综合情绪</span>
        <div class="sentiment-score-line"><strong>{{ scoreText(data.marketSentiment) }}</strong><span>/ 100</span></div>
        <div class="sentiment-phase"><i></i>{{ phaseLabel }}</div>
        <p>今天市场的整体温度与风险反馈</p>
      </div>
      <div class="sentiment-hero-side">
        <div><span>情绪变化</span><strong :class="momentumTone">{{ data.momentum === null ? '暂无变化' : `${data.momentum >= 0 ? '↑' : '↓'} ${momentumText}` }}</strong></div>
        <div><span>交易日</span><strong>{{ data.tradeDate }}</strong></div>
      </div>
    </section>

    <section class="sentiment-metrics">
      <article v-for="metric in metricDefinitions" :key="metric.key" class="metric-card" :class="scoreTone(data[metric.key], metric.key === 'riskScore')">
        <div class="metric-card-head"><span>{{ metric.label }}</span><strong>{{ scoreText(data[metric.key]) }}</strong></div>
        <div class="metric-track"><i :style="{ width: metricWidth(data[metric.key]) }"></i></div>
        <small>{{ metric.note }}</small>
      </article>
    </section>

    <section class="sentiment-grid">
      <article class="sentiment-panel market-panel">
        <header class="panel-heading"><div><span class="section-label">MARKET SNAPSHOT</span><h2>市场实时数据</h2></div><span class="panel-date">{{ data.tradeDate }}</span></header>
        <div class="market-balance"><div class="balance-side is-up"><span>上涨家数</span><strong>{{ integerText(marketValue('advancers')) }}</strong></div><div class="balance-line"><i :style="{ width: `${(marketValue('advancers') ?? 0) / Math.max((marketValue('advancers') ?? 0) + (marketValue('decliners') ?? 0) + (marketValue('unchanged') ?? 0), 1) * 100}%` }"></i></div><div class="balance-side is-down"><span>下跌家数</span><strong>{{ integerText(marketValue('decliners')) }}</strong></div></div>
        <div class="market-inline"><span>平盘 {{ integerText(marketValue('unchanged')) }}</span><span>涨跌比 {{ marketValue('advancers') !== null && marketValue('decliners') ? `${(marketValue('advancers')! / marketValue('decliners')!).toFixed(2)}` : '--' }}</span></div>
        <div class="market-stat-grid"><div><span>涨停</span><strong>{{ integerText(marketValue('limitUp')) }}</strong></div><div><span>跌停</span><strong>{{ integerText(marketValue('limitDown')) }}</strong></div><div><span>炸板</span><strong>{{ integerText(marketValue('brokenBoard')) }}</strong></div><div><span>炸板率</span><strong>{{ marketValue('brokenBoardRate') === null ? '--' : `${(marketValue('brokenBoardRate')! * 100).toFixed(1)}%` }}</strong></div><div><span>最高连板</span><strong>{{ integerText(marketValue('maxBoard')) }}</strong></div><div><span>两市成交额</span><strong>{{ amountText(marketValue('totalAmount')) }}</strong></div></div>
      </article>

      <article class="sentiment-panel board-panel"><header class="panel-heading"><div><span class="section-label">LIMIT-UP LADDER</span><h2>连板结构</h2></div><span class="panel-note">无数据以 -- 展示</span></header><div class="ladder-list"><div><span>二板</span><b>{{ integerText(marketValue('board2')) }}</b></div><div><span>三板</span><b>{{ integerText(marketValue('board3')) }}</b></div><div><span>四板+</span><b>{{ integerText(marketValue('board4Plus')) }}</b></div></div><div class="ladder-foot"><span>涨停家数</span><strong>{{ integerText(marketValue('limitUp')) }}</strong></div></article>
    </section>

    <section class="sentiment-panel history-panel"><header class="panel-heading"><div><span class="section-label">60 TRADING DAYS</span><h2>情绪历史</h2></div><span class="panel-note">实时保存的交易日数据</span></header><div v-if="history.length" class="history-chart"><div v-for="item in history.slice().reverse()" :key="`${item.tradeDate}-${item.marketSentiment}`" class="history-bar" :title="`${item.tradeDate} ${scoreText(item.marketSentiment)}`"><i :class="scoreTone(item.marketSentiment)" :style="{ height: `${item.marketSentiment ?? 0}%` }"></i></div></div><p v-else class="empty-state">暂无历史记录，首次行情成功后将开始记录。</p><div v-if="history.length" class="history-latest"><span>{{ history[history.length - 1]?.tradeDate }}</span><span>最高 {{ scoreText(Math.max(...history.map((item) => item.marketSentiment ?? 0))) }}</span><span>当前 {{ scoreText(data.marketSentiment) }}</span></div></section>
  </main>
</template>
