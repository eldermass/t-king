<script setup lang="ts">
import { normalizeCode } from '~/shared/reminder-core'

type RankPoint = {
  tradeDate: string
  rank: number | null
  totalStocks: number
  boardRank: number | null
  boardTotalStocks: number
  changePercent: number | null
  benchmarkChangePercent: number | null
  differencePercent: number | null
}
type RankResponse = { code: string; board: string; benchmarkName: string | null; maxStocks: number; boardMaxStocks: number; points: RankPoint[] }
type RefreshResponse = { tradeDate: string; updatedAt: string; quoteCount: number }

const props = withDefaults(defineProps<{
  stockCode: string
  stockName: string
  variant?: 'board' | 'archive'
}>(), { variant: 'board' })

const open = ref(false)
const loading = ref(false)
const refreshing = ref(false)
const error = ref('')
const refreshMessage = ref('')
const refreshFailed = ref(false)
const points = ref<RankPoint[]>([])
const maxStocks = ref(0)
const boardMaxStocks = ref(0)
const board = ref('')
const benchmarkName = ref<string | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
let requestId = 0

const chartLeft = 68
const chartRight = 24
const chartTop = 54
const chartBottom = 288
const chartHeight = 350
const chartWidth = computed(() => Math.max(720, points.value.length * 68 + chartLeft + chartRight))
const plotWidth = computed(() => chartWidth.value - chartLeft - chartRight)
const plotHeight = chartBottom - chartTop
const differenceZero = (chartTop + chartBottom) / 2
const formatPercent = (value: number) => `${Math.abs(value) < 0.005 ? '0.00' : `${value > 0 ? '+' : ''}${value.toFixed(2)}`}%`
const formatDifference = (value: number) => Math.abs(value) < 0.005 ? '0.00' : `${value > 0 ? '+' : ''}${value.toFixed(2)}`
const buildBars = (rankPoints: Array<{ tradeDate: string; rank: number | null; totalStocks: number; changePercent: number | null }>, chartMaxStocks: number) => rankPoints.map((point, index) => {
  const slotWidth = plotWidth.value / rankPoints.length
  const center = chartLeft + slotWidth * (index + 0.5)
  const height = point.rank === null || !chartMaxStocks ? 0 : point.rank / chartMaxStocks * plotHeight
  const rankRatio = point.rank === null || !point.totalStocks ? null : point.rank / point.totalStocks
  const rankLabel = point.rank === null ? '—' : `第${point.rank}名`
  const rearRankLabel = point.rank !== null && rankRatio !== null && rankRatio > 0.75
    ? `后${point.totalStocks - point.rank + 1}名`
    : ''
  const quartileClass = rankRatio === null
    ? ''
    : rankRatio <= 0.25
      ? 'is-first-quartile'
      : rankRatio <= 0.5
        ? 'is-second-quartile'
        : rankRatio <= 0.75
          ? 'is-third-quartile'
          : 'is-fourth-quartile'
  return {
    ...point,
    rankLabel,
    rearRankLabel,
    quartileClass,
    center,
    x: center - Math.min(28, slotWidth * 0.48) / 2,
    width: Math.min(28, slotWidth * 0.48),
    y: chartBottom - Math.max(2, height),
    height: Math.max(2, height)
  }
})
const charts = computed(() => [
  { title: '全市场次序', scope: '全市场', maxStocks: maxStocks.value, rankPoints: points.value.map(({ tradeDate, rank, totalStocks, changePercent }) => ({ tradeDate, rank, totalStocks, changePercent })) },
  { title: `${board.value}次序`, scope: board.value, maxStocks: boardMaxStocks.value, rankPoints: points.value.map(({ tradeDate, boardRank, boardTotalStocks, changePercent }) => ({ tradeDate, rank: boardRank, totalStocks: boardTotalStocks, changePercent })) }
].map((chart) => ({
  ...chart,
  ticks: [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
    value: Math.round(chart.maxStocks * fraction),
    y: chartBottom - fraction * plotHeight
  })),
  bars: buildBars(chart.rankPoints, chart.maxStocks)
})))
const differenceMax = computed(() => Math.max(0.01, ...points.value.map((point) => Math.abs(point.differencePercent ?? 0))))
const differenceTicks = computed(() => [-1, -0.5, 0, 0.5, 1].map((fraction) => ({
  value: fraction * differenceMax.value,
  y: differenceZero - fraction * plotHeight / 2
})))
const differenceBars = computed(() => points.value.map((point, index) => {
  const slotWidth = plotWidth.value / points.value.length
  const center = chartLeft + slotWidth * (index + 0.5)
  const difference = point.differencePercent
  const height = difference === null ? 0 : Math.abs(difference) / differenceMax.value * plotHeight / 2
  return {
    ...point,
    center,
    x: center - Math.min(28, slotWidth * 0.48) / 2,
    width: Math.min(28, slotWidth * 0.48),
    y: difference !== null && difference > 0 ? differenceZero - Math.max(2, height) : differenceZero,
    height: difference === null || difference === 0 ? 0 : Math.max(2, height),
    labelY: difference === null || difference >= 0
      ? differenceZero - Math.max(2, height) - 8
      : differenceZero + Math.max(2, height) + 15
  }
}))
const hasRank = computed(() => points.value.some((point) => point.rank !== null))

const close = async () => {
  requestId += 1
  open.value = false
  refreshing.value = false
  await nextTick()
  trigger.value?.focus()
}

const show = async () => {
  open.value = true
  loading.value = true
  error.value = ''
  refreshMessage.value = ''
  refreshFailed.value = false
  points.value = []
  maxStocks.value = 0
  boardMaxStocks.value = 0
  board.value = ''
  benchmarkName.value = null
  const currentRequest = ++requestId
  await nextTick()
  dialog.value?.focus()

  const code = normalizeCode(props.stockCode)
  if (!/^\d{6}$/.test(code)) {
    error.value = '请先填写有效的 6 位股票代码'
    loading.value = false
    return
  }

  try {
    const result = await $fetch<RankResponse>('/api/market/rank', { query: { code } })
    if (currentRequest !== requestId) return
    points.value = result.points
    maxStocks.value = result.maxStocks
    boardMaxStocks.value = result.boardMaxStocks
    board.value = result.board
    benchmarkName.value = result.benchmarkName
  } catch (cause: any) {
    if (currentRequest !== requestId) return
    error.value = cause?.data?.statusMessage || cause?.statusMessage || '次序数据读取失败'
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

const refreshQuotes = async () => {
  if (loading.value || refreshing.value) return
  const code = normalizeCode(props.stockCode)
  if (!/^\d{6}$/.test(code)) return

  const currentRequest = ++requestId
  refreshing.value = true
  refreshMessage.value = '正在重新获取并保存全市场行情...'
  refreshFailed.value = false
  let saved: RefreshResponse | null = null

  try {
    saved = await $fetch<RefreshResponse>('/api/market/rank/refresh', { method: 'POST' })
    if (currentRequest !== requestId) return
    const result = await $fetch<RankResponse>('/api/market/rank', { query: { code } })
    if (currentRequest !== requestId) return
    points.value = result.points
    maxStocks.value = result.maxStocks
    boardMaxStocks.value = result.boardMaxStocks
    board.value = result.board
    benchmarkName.value = result.benchmarkName
    error.value = ''
    refreshMessage.value = `${saved.tradeDate} 已保存 ${saved.quoteCount.toLocaleString('zh-CN')} 只股票行情，次序已更新`
  } catch (cause: any) {
    if (currentRequest !== requestId) return
    const message = cause?.data?.statusMessage || cause?.statusMessage || '行情刷新失败'
    refreshMessage.value = saved ? `行情已保存，但次序读取失败：${message}` : message
    refreshFailed.value = true
  } finally {
    if (currentRequest === requestId) refreshing.value = false
  }
}
</script>

<template>
  <button ref="trigger" :class="[variant === 'archive' ? 'mini-btn' : 'ghost-btn', 'stock-rank-trigger']" type="button" :aria-label="`查看 ${stockName || stockCode || '当前股票'} 的次序`" @click.stop="show" @keydown.enter.stop>次序</button>
  <Teleport to="body">
    <div v-if="open" class="settings-modal-overlay" @click.self="close">
      <section ref="dialog" class="settings-modal stock-rank-modal" role="dialog" aria-modal="true" :aria-label="`${stockName || stockCode || '当前股票'} 的次序`" tabindex="-1" @keydown.esc="close">
        <header class="settings-modal-head">
          <div><h2>涨跌幅次序</h2><p>{{ stockName || '当前股票' }} · {{ normalizeCode(stockCode) || '--' }} · 最近 20 个已保存交易日</p></div>
          <div class="stock-rank-head-actions">
            <button class="ghost-btn" type="button" :disabled="loading || refreshing || !/^\d{6}$/.test(normalizeCode(stockCode))" @click="refreshQuotes">{{ refreshing ? '刷新中...' : '刷新行情' }}</button>
            <button class="ghost-btn" type="button" @click="close">关闭</button>
          </div>
        </header>
        <p v-if="refreshMessage" class="stock-rank-refresh-message" :class="{ 'is-error': refreshFailed }" role="status">{{ refreshMessage }}</p>
        <p v-if="loading" class="stock-rank-state">正在计算次序...</p>
        <p v-else-if="error" class="stock-rank-state is-error">{{ error }}</p>
        <p v-else-if="!points.length" class="stock-rank-state">暂无已保存的每日股票行情，请先在情绪页完成一次行情保存。</p>
        <template v-else>
          <p class="stock-rank-note">每日按涨跌幅从高到低排列，第 1 名最高；横轴日期由近到远。</p>
          <p v-if="!hasRank" class="stock-rank-state">最近 20 日的行情里没有找到这只股票的有效涨跌幅。</p>
          <section v-for="chart in charts" :key="chart.title" class="stock-rank-section" :aria-label="chart.title">
            <h3>{{ chart.title }}</h3>
            <p class="stock-rank-note">{{ chart.scope }}每日股票总数最多 {{ chart.maxStocks.toLocaleString('zh-CN') }} 只；纵轴按这个数量固定。</p>
            <div class="stock-rank-chart-wrap">
              <svg class="stock-rank-chart" :width="chartWidth" :height="chartHeight" :viewBox="`0 0 ${chartWidth} ${chartHeight}`" role="img" :aria-label="`${stockName || stockCode} 最近 20 日${chart.title}柱状图`">
                <title>{{ stockName || stockCode }} 最近 20 日{{ chart.title }}</title>
                <text class="stock-rank-axis-title" :x="chartLeft" y="24">次序（名）</text>
                <g v-for="tick in chart.ticks" :key="tick.y">
                  <line class="stock-rank-grid" :x1="chartLeft" :x2="chartWidth - chartRight" :y1="tick.y" :y2="tick.y" />
                  <text class="stock-rank-tick" :x="chartLeft - 10" :y="tick.y + 4" text-anchor="end">{{ tick.value }}</text>
                </g>
                <g v-for="bar in chart.bars" :key="bar.tradeDate">
                  <title>{{ bar.tradeDate }}：{{ bar.rank === null ? '无有效排名' : `${bar.rankLabel}${bar.rearRankLabel ? ` ${bar.rearRankLabel}` : ''}（共${bar.totalStocks}名），涨跌幅 ${bar.changePercent?.toFixed(2)}%` }}</title>
                  <rect v-if="bar.rank !== null" class="stock-rank-bar" :class="bar.quartileClass" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" rx="3" />
                  <text class="stock-rank-value" :x="bar.center" :y="bar.rank === null ? chartBottom - 9 : Math.max(bar.rearRankLabel ? 27 : 40, bar.y - (bar.rearRankLabel ? 21 : 8))" text-anchor="middle">
                    <tspan :x="bar.center">{{ bar.rankLabel }}</tspan>
                    <tspan v-if="bar.rearRankLabel" :x="bar.center" dy="13">{{ bar.rearRankLabel }}</tspan>
                  </text>
                  <text class="stock-rank-date" :x="bar.center" :y="chartBottom + 24" text-anchor="middle">{{ bar.tradeDate }}</text>
                </g>
                <text class="stock-rank-axis-title" :x="chartWidth - chartRight" :y="chartHeight - 8" text-anchor="end">时间</text>
              </svg>
            </div>
          </section>
          <section class="stock-rank-section" aria-label="涨跌幅差值">
            <h3>涨跌幅差值</h3>
            <p class="stock-rank-note">个股涨跌幅减去{{ benchmarkName || '对应指数' }}涨跌幅，单位为百分点；正值表示跑赢指数。缺少同日指数数据时显示 —。</p>
            <div class="stock-rank-chart-wrap">
              <svg class="stock-rank-chart" :width="chartWidth" height="380" :viewBox="`0 0 ${chartWidth} 380`" role="img" :aria-label="`${stockName || stockCode} 最近 20 日相对${benchmarkName || '对应指数'}的涨跌幅差值柱状图`">
                <title>{{ stockName || stockCode }} 最近 20 日涨跌幅差值</title>
                <text class="stock-rank-axis-title" :x="chartLeft" y="24">差值（百分点）</text>
                <g v-for="tick in differenceTicks" :key="tick.y">
                  <line :class="tick.value === 0 ? 'stock-rank-zero-axis' : 'stock-rank-grid'" :x1="chartLeft" :x2="chartWidth - chartRight" :y1="tick.y" :y2="tick.y" />
                  <text class="stock-rank-tick" :x="chartLeft - 10" :y="tick.y + 4" text-anchor="end">{{ formatDifference(tick.value) }}</text>
                </g>
                <g v-for="bar in differenceBars" :key="bar.tradeDate">
                  <title>{{ bar.tradeDate }}：{{ bar.differencePercent === null ? '缺少个股或指数涨跌幅，无法计算差值' : `差值 ${formatDifference(bar.differencePercent)} 个百分点；个股涨跌幅 ${formatPercent(bar.changePercent ?? 0)}；${benchmarkName}涨跌幅 ${formatPercent(bar.benchmarkChangePercent ?? 0)}` }}</title>
                  <rect v-if="bar.height" class="stock-rank-difference-bar" :class="bar.differencePercent! > 0 ? 'is-positive' : 'is-negative'" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" rx="3" />
                  <text class="stock-rank-value" :x="bar.center" :y="bar.labelY" text-anchor="middle">{{ bar.differencePercent === null ? '—' : formatDifference(bar.differencePercent) }}</text>
                  <text class="stock-rank-date" :x="bar.center" y="344" text-anchor="middle">{{ bar.tradeDate }}</text>
                </g>
                <text class="stock-rank-axis-title" :x="chartWidth - chartRight" y="372" text-anchor="end">时间</text>
              </svg>
            </div>
          </section>
        </template>
      </section>
    </div>
  </Teleport>
</template>
