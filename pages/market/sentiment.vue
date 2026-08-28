<script setup lang="ts">
import { StockSDK, type FullQuote, type SimpleQuote, type ZTPoolItem } from 'stock-sdk'

type MetricKey = 'profitScore' | 'speculationScore' | 'breadthScore' | 'limitScore' | 'liquidityScore' | 'riskScore'
type MarketMetrics = {
  advancers: number | null; decliners: number | null; unchanged: number | null; limitUp: number | null; limitDown: number | null
  brokenBoard: number | null; brokenBoardRate: number | null; maxBoard: number | null; board2: number | null; board3: number | null
  board4Plus: number | null; totalAmount: number | null; totalStocks: number | null; board1: number | null; board5: number | null
  board6: number | null; board7Plus: number | null; advanceToSecond: number | null; secondToThird: number | null
  thirdToFourth: number | null; fourthToFifth: number | null; yesterdayLimitUpReturn: number | null
  yesterdayLimitUpMedianReturn: number | null; yesterdayLimitUpRiseRatio: number | null; yesterdayLadderReturn: number | null
  leaderReturn: number | null; amountChange: number | null; limitUpCodes: string[]
}
type Sentiment = {
  tradeDate: string; updatedAt: string; marketSentiment: number | null; profitScore: number | null; speculationScore: number | null
  breadthScore: number | null; limitScore: number | null; liquidityScore: number | null; riskScore: number | null; momentum: number | null
  phase: string; stale: boolean; error: string | null; market: MarketMetrics
}
type HistoryItem = Pick<Sentiment, 'tradeDate' | 'marketSentiment' | 'profitScore' | 'speculationScore' | 'breadthScore' | 'riskScore' | 'phase' | 'momentum'> & { totalAmount: number | null }
type DetailItem = { label: string; value: string }
type MarketStock = { changePercent: number; amount: number }
type PreviousLimitUpPerformance = {
  averageReturn: number | null
  medianReturn: number | null
  riseRatio: number | null
  ladderReturn: number | null
  leaderReturn: number | null
}
type MarketDataSnapshot = {
  tradeDate: string
  updatedAt: string
  shIndexChange: number
  chinextIndexChange: number
  sci50IndexChange: number
  volume: number | null
  volumeChange: number | null
  advancers: number | null
  decliners: number | null
  limitUpCount: number | null
  limitDownCount: number | null
  sentimentScore: number | null
}

const sdk = new StockSDK({ timeout: 15_000, retry: { maxRetries: 2, baseDelay: 500 }, rateLimit: { requestsPerSecond: 2, maxBurst: 1 } })

const emptyMarket = (): MarketMetrics => ({
  advancers: null, decliners: null, unchanged: null, limitUp: null, limitDown: null, brokenBoard: null, brokenBoardRate: null,
  maxBoard: null, board2: null, board3: null, board4Plus: null, totalAmount: null, totalStocks: null, board1: null, board5: null,
  board6: null, board7Plus: null, advanceToSecond: null, secondToThird: null, thirdToFourth: null, fourthToFifth: null,
  yesterdayLimitUpReturn: null, yesterdayLimitUpMedianReturn: null, yesterdayLimitUpRiseRatio: null, yesterdayLadderReturn: null,
  leaderReturn: null, amountChange: null, limitUpCodes: []
})
const emptySentiment = (): Sentiment => ({
  tradeDate: '--', updatedAt: '', marketSentiment: null, profitScore: null, speculationScore: null, breadthScore: null,
  limitScore: null, liquidityScore: null, riskScore: null, momentum: null, phase: 'UNKNOWN', stale: false, error: null, market: emptyMarket()
})

const data = ref<Sentiment>(emptySentiment())
const history = ref<HistoryItem[]>([])
const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
const metricDefinitions: Array<{ key: MetricKey; label: string; note: string }> = [
  { key: 'profitScore', label: '赚钱效应', note: '当前市场涨跌表现' }, { key: 'speculationScore', label: '投机情绪', note: '涨停与连板活跃度' },
  { key: 'breadthScore', label: '市场宽度', note: '上涨广度与中位数' }, { key: 'limitScore', label: '涨跌停情绪', note: '涨停、跌停的强弱差' },
  { key: 'liquidityScore', label: '市场活跃度', note: '两市成交金额' }, { key: 'riskScore', label: '市场风险', note: '数值越高风险越大' }
]
const phaseLabels: Record<string, string> = { PANIC: '极度冰点', COLD: '冰点', WEAK: '弱势', RECOVERY: '修复', STRONG: '强势', HOT: '高潮', EUPHORIC: '极度亢奋', UNKNOWN: '暂无数据' }
const phaseLabel = computed(() => phaseLabels[data.value.phase] ?? '暂无数据')
const scoreText = (value: number | null) => value === null ? '--' : value.toFixed(1)
const integerText = (value: number | null) => value === null ? '--' : Math.round(value).toLocaleString('zh-CN')
const amountText = (value: number | null) => value === null ? '--' : `${(value / 100000000).toFixed(0)} 亿`
const momentumText = computed(() => data.value.momentum === null ? '--' : `${data.value.momentum >= 0 ? '+' : ''}${data.value.momentum.toFixed(1)}`)
const historyHigh = computed(() => history.value.length ? Math.max(...history.value.map((item) => item.marketSentiment ?? 0)) : null)
const momentumTone = computed(() => data.value.momentum === null ? '' : data.value.momentum >= 0 ? 'is-up' : 'is-down')
const scoreTone = (value: number | null, risk = false) => { if (value === null) return ''; const adjusted = risk ? 100 - value : value; return adjusted >= 60 ? 'is-strong' : adjusted <= 40 ? 'is-weak' : 'is-neutral' }
const historyBarColor = (value: number | null) => {
  if (value === null) return 'rgb(180, 180, 180)'
  const score = Math.min(100, Math.max(0, value))
  const greenSteps = [
    'rgb(0, 150, 0)', 'rgb(35, 165, 35)', 'rgb(70, 180, 70)',
    'rgb(105, 195, 105)', 'rgb(140, 210, 140)', 'rgb(175, 225, 175)'
  ]
  const redSteps = [
    'rgb(255, 210, 210)', 'rgb(250, 190, 190)', 'rgb(245, 170, 170)',
    'rgb(240, 150, 150)', 'rgb(235, 130, 130)', 'rgb(230, 110, 110)',
    'rgb(220, 80, 80)', 'rgb(210, 50, 50)', 'rgb(195, 20, 20)'
  ]
  if (score < 60) {
    if (score <= 30) return greenSteps[0]
    return greenSteps[Math.min(greenSteps.length - 1, Math.floor((score - 30) / 5))]
  }
  return redSteps[Math.min(redSteps.length - 1, Math.floor((score - 60) / 5))]
}
const metricWidth = (value: number | null) => `${value === null ? 0 : Math.min(100, Math.max(0, value))}%`
const marketValue = (key: string) => { const value = data.value.market[key as keyof MarketMetrics]; return typeof value === 'number' ? value : null }
const percentText = (value: number | null) => value === null ? '--' : `${(value * 100).toFixed(1)}%`
const modeLabel = '实时行情'
const metricDetails = (key: MetricKey): DetailItem[] => {
  const value = (field: string, label: string, formatter: (item: number | null) => string = integerText): DetailItem => ({ label, value: formatter(marketValue(field)) })
  const percent = (field: string, label: string) => value(field, label, percentText)
  if (key === 'profitScore') return [percent('yesterdayLimitUpReturn', '涨停平均收益'), percent('yesterdayLimitUpMedianReturn', '涨停中位数'), percent('yesterdayLimitUpRiseRatio', '涨停上涨比例'), percent('yesterdayLadderReturn', '连板收益'), percent('leaderReturn', '最高板收益')]
  if (key === 'speculationScore') return [value('limitUp', '涨停家数'), value('maxBoard', '最高连板'), value('board1', '一板'), value('board2', '二板'), value('board3', '三板'), value('board4Plus', '四板+'), value('board5', '五板'), value('board6', '六板'), value('board7Plus', '七板+')]
  if (key === 'breadthScore') return [value('totalStocks', '股票总数'), value('advancers', '上涨家数'), value('decliners', '下跌家数'), value('unchanged', '平盘家数')]
  if (key === 'limitScore') return [value('limitUp', '涨停家数'), value('limitDown', '跌停家数'), value('brokenBoard', '炸板家数'), percent('brokenBoardRate', '炸板率')]
  if (key === 'liquidityScore') return [value('totalAmount', '两市成交额', amountText), percent('amountChange', '成交额变化')]
  return [value('limitDown', '跌停家数'), percent('brokenBoardRate', '炸板率'), percent('leaderReturn', '高位股收益')]
}

const clamp = (value: number) => Math.min(100, Math.max(0, value))
const average = (values: Array<number | null>) => { const usable = values.filter((value): value is number => value !== null); return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null }
const ratioScore = (value: number | null, min: number, max: number) => value === null || max <= min ? null : clamp(((value - min) / (max - min)) * 100)
const phaseFor = (score: number | null) => score === null ? 'UNKNOWN' : score < 15 ? 'PANIC' : score < 30 ? 'COLD' : score < 45 ? 'WEAK' : score < 60 ? 'RECOVERY' : score < 75 ? 'STRONG' : score < 85 ? 'HOT' : 'EUPHORIC'
const tradeDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const asHistory = (snapshot: Sentiment): HistoryItem => ({ tradeDate: snapshot.tradeDate, marketSentiment: snapshot.marketSentiment, profitScore: snapshot.profitScore, speculationScore: snapshot.speculationScore, breadthScore: snapshot.breadthScore, riskScore: snapshot.riskScore, phase: snapshot.phase, momentum: snapshot.momentum, totalAmount: snapshot.market.totalAmount })

const median = (values: number[]) => values.length ? [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] : null
const calculatePreviousLimitUpPerformance = (pool: ZTPoolItem[], quotes: SimpleQuote[]): PreviousLimitUpPerformance => {
  const quoteByCode = new Map(quotes.map((quote) => [quote.code, quote]))
  const returns = pool.map((item) => quoteByCode.get(item.code)?.changePercent).filter((value): value is number => Number.isFinite(value))
  const ladderReturns = pool.filter((item) => (item.continuousBoardCount ?? 1) > 1).map((item) => quoteByCode.get(item.code)?.changePercent).filter((value): value is number => Number.isFinite(value))
  const leader = [...pool].sort((left, right) => (right.continuousBoardCount ?? 1) - (left.continuousBoardCount ?? 1))[0]
  const leaderReturn = leader ? quoteByCode.get(leader.code)?.changePercent : null
  return {
    averageReturn: returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length / 100 : null,
    medianReturn: median(returns) === null ? null : median(returns)! / 100,
    riseRatio: returns.length ? returns.filter((value) => value > 0).length / returns.length : null,
    ladderReturn: ladderReturns.length ? ladderReturns.reduce((sum, value) => sum + value, 0) / ladderReturns.length / 100 : null,
    leaderReturn: Number.isFinite(leaderReturn) ? leaderReturn! / 100 : null
  }
}
const normalizeCode = (code: string) => code.toLowerCase().replace(/^(sh|sz|bj)/, '')
const indexChange = (quotes: SimpleQuote[], code: string) => {
  const quote = quotes.find((item) => normalizeCode(item.code) === normalizeCode(code))
  if (!quote || !Number.isFinite(quote.changePercent)) throw new Error(`stock-sdk missing index quote: ${code}`)
  return quote.changePercent / 100
}
const marketDataFromSnapshot = (snapshot: Sentiment, indexQuotes: SimpleQuote[]): MarketDataSnapshot => ({
  tradeDate: snapshot.tradeDate,
  updatedAt: snapshot.updatedAt,
  shIndexChange: indexChange(indexQuotes, 'sh000001'),
  chinextIndexChange: indexChange(indexQuotes, 'sz399006'),
  sci50IndexChange: indexChange(indexQuotes, 'sh000688'),
  volume: snapshot.market.totalAmount === null ? null : snapshot.market.totalAmount / 10000,
  volumeChange: null,
  advancers: snapshot.market.advancers,
  decliners: snapshot.market.decliners,
  limitUpCount: snapshot.market.limitUp,
  limitDownCount: snapshot.market.limitDown,
  sentimentScore: snapshot.marketSentiment
})

const calculateSnapshot = (quotes: FullQuote[], limitUps: ZTPoolItem[], limitDowns: ZTPoolItem[], brokenBoards: ZTPoolItem[], previous?: HistoryItem, previousLimitUp?: PreviousLimitUpPerformance): Sentiment => {
  const stocks: MarketStock[] = quotes.filter((quote) => quote.code && Number.isFinite(quote.changePercent)).map((quote) => ({ changePercent: quote.changePercent, amount: Number.isFinite(quote.amount) ? quote.amount * 10000 : 0 }))
  if (stocks.length < 3000) throw new Error(`stock-sdk returned only ${stocks.length} valid quotes`)
  const changes = stocks.map((stock) => stock.changePercent), advancers = changes.filter((value) => value > 0).length, decliners = changes.filter((value) => value < 0).length, unchanged = changes.filter((value) => value === 0).length, total = changes.length
  const upRatio = total ? advancers / total * 100 : null, downRatio = total ? decliners / total * 100 : null, medianChange = changes.length ? [...changes].sort((a, b) => a - b)[Math.floor(changes.length / 2)] : null
  const strongRatio = total ? changes.filter((value) => value >= 5).length / total * 100 : null, weakRatio = total ? changes.filter((value) => value <= -5).length / total * 100 : null
  const limitUp = limitUps.length, limitDown = limitDowns.length, totalAmount = stocks.reduce((sum, stock) => sum + stock.amount, 0)
  const breadthScore = average([upRatio, ratioScore(upRatio === null || downRatio === null ? null : upRatio - downRatio, -100, 100), ratioScore(medianChange, -5, 5), ratioScore(strongRatio, 0, 20), weakRatio === null ? null : 100 - ratioScore(weakRatio, 0, 20)!])
  const limitScore = average([ratioScore(limitUp, 0, Math.max(limitUp, limitDown, 100)), ratioScore(limitUp - limitDown, -100, 100), limitDown === 0 ? 100 : 100 - ratioScore(limitDown, 0, 100)!, total ? 100 - limitDown / total * 1000 : null])
  const speculationScore = average([ratioScore(limitUp, 0, 100), ratioScore(strongRatio, 0, 20), breadthScore, limitScore])
  const profitScore = previousLimitUp?.averageReturn === null || previousLimitUp?.averageReturn === undefined
    ? null
    : average([ratioScore(previousLimitUp.averageReturn * 100, -10, 10), ratioScore(previousLimitUp.medianReturn === null ? null : previousLimitUp.medianReturn * 100, -10, 10), previousLimitUp.riseRatio === null ? null : previousLimitUp.riseRatio * 100, ratioScore(previousLimitUp.ladderReturn === null ? null : previousLimitUp.ladderReturn * 100, -10, 10), ratioScore(previousLimitUp.leaderReturn === null ? null : previousLimitUp.leaderReturn * 100, -10, 10)])
  const liquidityScore = ratioScore(totalAmount, 300_000_000_000, 3_000_000_000_000), riskScore = average([ratioScore(limitDown, 0, 100), weakRatio === null ? null : ratioScore(weakRatio, 0, 20), medianChange === null ? null : 100 - ratioScore(medianChange, -5, 5)!])
  const baseScore = [profitScore, speculationScore, breadthScore, limitScore, liquidityScore].every((value) => value !== null) ? profitScore! * 0.3 + speculationScore! * 0.25 + breadthScore! * 0.2 + limitScore! * 0.15 + liquidityScore! * 0.1 : average([profitScore, speculationScore, breadthScore, limitScore, liquidityScore])
  const marketSentiment = baseScore === null ? null : clamp(baseScore - (riskScore ?? 0) * 0.15)
  const boards = new Map<number, number>(); for (const item of limitUps) { const board = Math.max(1, Math.round(item.continuousBoardCount ?? 1)); boards.set(board, (boards.get(board) ?? 0) + 1) }
  const boardCount = (min: number, max = min) => [...boards.entries()].filter(([board]) => board >= min && board <= max).reduce((sum, [, count]) => sum + count, 0)
  const brokenBoardRate = limitUps.length + brokenBoards.length ? brokenBoards.length / (limitUps.length + brokenBoards.length) : null, amountChange = previous?.totalAmount && previous.totalAmount > 0 ? (totalAmount - previous.totalAmount) / previous.totalAmount : null
  const momentum = marketSentiment === null || previous?.marketSentiment === null || previous?.marketSentiment === undefined ? null : marketSentiment - previous.marketSentiment
  return { tradeDate: tradeDate(), updatedAt: new Date().toISOString(), marketSentiment, profitScore, speculationScore, breadthScore, riskScore, limitScore, liquidityScore, momentum, phase: phaseFor(marketSentiment), stale: false, error: null, market: { ...emptyMarket(), advancers, decliners, unchanged, limitUp, limitDown, brokenBoard: brokenBoards.length, brokenBoardRate, maxBoard: limitUps.reduce((max, item) => Math.max(max, Math.round(item.continuousBoardCount ?? 1)), 0), board1: boardCount(1), board2: boardCount(2), board3: boardCount(3), board4Plus: boardCount(4, 99), board5: boardCount(5), board6: boardCount(6), board7Plus: boardCount(7, 99), totalAmount, totalStocks: total, amountChange, yesterdayLimitUpReturn: previousLimitUp?.averageReturn ?? null, yesterdayLimitUpMedianReturn: previousLimitUp?.medianReturn ?? null, yesterdayLimitUpRiseRatio: previousLimitUp?.riseRatio ?? null, yesterdayLadderReturn: previousLimitUp?.ladderReturn ?? null, leaderReturn: previousLimitUp?.leaderReturn ?? null, limitUpCodes: limitUps.map((item) => item.code) } }
}

const load = async (initial = false) => {
  if (initial) loading.value = true
  else refreshing.value = true
  loadError.value = ''
  try {
    let readError = ''
    // Load the persisted snapshot first so a refresh failure never blanks the last good view.
    try {
      const persisted = await $fetch<{ snapshot: Sentiment | null; history: HistoryItem[] }>('/api/market/sentiment')
      if (persisted.snapshot) data.value = persisted.snapshot
      history.value = persisted.history ?? []
    } catch (error) {
      readError = error instanceof Error ? error.message : '最近一次成功数据读取失败'
    }
    const today = tradeDate()
    const previous = history.value.find((item) => item.tradeDate !== today)
    const previousTradeDate = await sdk.calendar.prevTradingDay()
    const [quotes, limitUps, limitDowns, brokenBoards, previousLimitUps, indexQuotes] = await Promise.all([
      sdk.batch.cn({ batchSize: 500, concurrency: 1 }), sdk.marketEvent.ztPool('zt'), sdk.marketEvent.ztPool('dt'), sdk.marketEvent.ztPool('broken'), sdk.marketEvent.ztPool('zt', previousTradeDate), sdk.quotes.cnSimple(['sh000001', 'sz399006', 'sh000688'])
    ])
    const previousCodes = [...new Set(previousLimitUps.map((item) => item.code).filter(Boolean))]
    const previousQuotes = previousCodes.length ? await sdk.quotes.cnSimple(previousCodes) : []
    const previousLimitUp = calculatePreviousLimitUpPerformance(previousLimitUps, previousQuotes)
    const snapshot = calculateSnapshot(quotes, limitUps, limitDowns, brokenBoards, previous, previousLimitUp)
    // Make the SDK result visible immediately. Persistence is best-effort and must not
    // discard a valid live snapshot when D1 is temporarily unavailable.
    data.value = snapshot
    history.value = [asHistory(snapshot), ...history.value.filter((item) => item.tradeDate !== snapshot.tradeDate)].slice(0, 60)
    const persistenceTasks: Promise<unknown>[] = [$fetch('/api/market/sentiment', { method: 'POST', body: snapshot })]
    try {
      persistenceTasks.push($fetch('/api/market/data', { method: 'POST', body: marketDataFromSnapshot(snapshot, indexQuotes) }))
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : '指数行情暂不可用，情绪数据已更新'
    }
    const persistence = await Promise.allSettled(persistenceTasks)
    const failed = persistence.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failed && !loadError.value) {
      const reason = failed.reason
      const statusMessage = reason?.data?.statusMessage || reason?.statusMessage
      loadError.value = statusMessage || (reason instanceof Error ? reason.message : '行情已更新，但保存失败')
    }
    if (!loadError.value && readError) loadError.value = readError
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'stock-sdk 行情获取失败'
  } finally { loading.value = false; refreshing.value = false }
}
const refresh = () => load()
const logout = async () => { await $fetch('/api/auth/logout', { method: 'POST' }); await navigateTo('/login') }
onMounted(() => load(true))
</script>

<template>
  <main class="page-shell sentiment-page">
    <section class="topbar sentiment-topbar"><div><p class="sentiment-eyebrow">MARKET STATUS</p><h1>A股市场情绪</h1></div><div class="topbar-actions"><span class="market-tip">实时行情</span><button class="refresh-btn" type="button" :disabled="loading || refreshing" @click="refresh"><span aria-hidden="true">↻</span>{{ refreshing ? '读取中' : '刷新行情' }}</button><span class="market-tip" :class="{ 'is-busy': refreshing }">{{ refreshing ? '正在读取 stock-sdk' : data.updatedAt ? `更新于 ${new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待数据' }}</span><NuxtLink class="ghost-link" to="/">看板</NuxtLink><NuxtLink class="ghost-link" to="/market/limit">涨跌停</NuxtLink><NuxtLink class="ghost-link" to="/market/data">市场</NuxtLink><button class="ghost-btn" type="button" @click="logout">退出</button></div></section>
    <p v-if="loadError" class="sentiment-alert">{{ loadError }}，保留最近一次成功数据</p>
    <section class="sentiment-card-grid">
      <article class="sentiment-panel overview-card"><header class="panel-heading"><div><span class="section-label">SENTIMENT OVERVIEW</span><h2>综合情绪与历史评分</h2></div><span class="panel-date">{{ data.tradeDate }}</span></header><div class="overview-main"><div class="sentiment-score-line"><strong>{{ scoreText(data.marketSentiment) }}</strong><span>/ 100</span></div><div class="sentiment-phase"><i></i>{{ phaseLabel }}</div><p>情绪变化 <strong :class="momentumTone">{{ data.momentum === null ? '--' : `${data.momentum >= 0 ? '↑' : '↓'} ${momentumText}` }}</strong></p></div><div v-if="history.length" class="history-chart"><div v-for="item in history.slice().reverse()" :key="`${item.tradeDate}-${item.marketSentiment}`" class="history-bar" :title="`${item.tradeDate} ${scoreText(item.marketSentiment)}`"><i :class="scoreTone(item.marketSentiment)" :style="{ height: `${item.marketSentiment ?? 0}%`, backgroundColor: historyBarColor(item.marketSentiment) }"></i></div></div><p v-else class="empty-state">暂无历史评分</p><div class="history-latest"><span>{{ modeLabel }}</span><span>交易日 {{ data.tradeDate }}</span><span>最高 {{ scoreText(historyHigh) }}</span></div></article>
      <article v-for="metric in metricDefinitions" :key="metric.key" class="sentiment-panel metric-detail-card" :class="scoreTone(data[metric.key], metric.key === 'riskScore')"><header class="panel-heading"><div><span class="section-label">{{ metric.key.replace('Score', '').toUpperCase() }}</span><h2>{{ metric.label }}</h2></div><strong class="detail-score">{{ scoreText(data[metric.key]) }}</strong></header><div class="metric-track"><i :style="{ width: metricWidth(data[metric.key]) }"></i></div><p class="metric-note">{{ metric.note }}</p><div class="detail-grid"><div v-for="item in metricDetails(metric.key)" :key="item.label"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div></div></article>
    </section>
  </main>
</template>
