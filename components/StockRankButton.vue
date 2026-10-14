<script setup lang="ts">
import { normalizeCode } from '~/shared/reminder-core'

type RankPoint = {
  tradeDate: string
  rank: number | null
  totalStocks: number
  changePercent: number | null
}
type RankResponse = { code: string; maxStocks: number; points: RankPoint[] }

const props = withDefaults(defineProps<{
  stockCode: string
  stockName: string
  variant?: 'board' | 'archive'
}>(), { variant: 'board' })

const open = ref(false)
const loading = ref(false)
const error = ref('')
const points = ref<RankPoint[]>([])
const maxStocks = ref(0)
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
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
  value: Math.round(maxStocks.value * fraction),
  y: chartBottom - fraction * plotHeight
})))
const bars = computed(() => points.value.map((point, index) => {
  const slotWidth = plotWidth.value / points.value.length
  const center = chartLeft + slotWidth * (index + 0.5)
  const height = point.rank === null || !maxStocks.value ? 0 : point.rank / maxStocks.value * plotHeight
  return {
    ...point,
    center,
    x: center - Math.min(28, slotWidth * 0.48) / 2,
    width: Math.min(28, slotWidth * 0.48),
    y: chartBottom - Math.max(2, height),
    height: Math.max(2, height)
  }
}))
const hasRank = computed(() => points.value.some((point) => point.rank !== null))

const close = async () => {
  requestId += 1
  open.value = false
  await nextTick()
  trigger.value?.focus()
}

const show = async () => {
  open.value = true
  loading.value = true
  error.value = ''
  points.value = []
  maxStocks.value = 0
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
  } catch (cause: any) {
    if (currentRequest !== requestId) return
    error.value = cause?.data?.statusMessage || cause?.statusMessage || '次序数据读取失败'
  } finally {
    if (currentRequest === requestId) loading.value = false
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
          <button class="ghost-btn" type="button" @click="close">关闭</button>
        </header>
        <p v-if="loading" class="stock-rank-state">正在计算次序...</p>
        <p v-else-if="error" class="stock-rank-state is-error">{{ error }}</p>
        <p v-else-if="!points.length" class="stock-rank-state">暂无已保存的每日股票行情，请先在情绪页完成一次行情保存。</p>
        <template v-else>
          <p class="stock-rank-note">每日按涨跌幅从高到低排列，第 1 名最高；纵轴固定到近 20 日股票总数的最大值 {{ maxStocks.toLocaleString('zh-CN') }}。</p>
          <p v-if="!hasRank" class="stock-rank-state">最近 20 日的行情里没有找到这只股票的有效涨跌幅。</p>
          <div class="stock-rank-chart-wrap">
            <svg class="stock-rank-chart" :width="chartWidth" :height="chartHeight" :viewBox="`0 0 ${chartWidth} ${chartHeight}`" role="img" :aria-label="`${stockName || stockCode} 最近 20 日涨跌幅次序柱状图`">
              <title>{{ stockName || stockCode }} 最近 20 日涨跌幅次序</title>
              <text class="stock-rank-axis-title" :x="chartLeft" y="24">次序（名）</text>
              <g v-for="tick in ticks" :key="tick.y">
                <line class="stock-rank-grid" :x1="chartLeft" :x2="chartWidth - chartRight" :y1="tick.y" :y2="tick.y" />
                <text class="stock-rank-tick" :x="chartLeft - 10" :y="tick.y + 4" text-anchor="end">{{ tick.value }}</text>
              </g>
              <g v-for="bar in bars" :key="bar.tradeDate">
                <title>{{ bar.tradeDate }}：{{ bar.rank === null ? '无有效排名' : `第 ${bar.rank} / ${bar.totalStocks} 名，涨跌幅 ${bar.changePercent?.toFixed(2)}%` }}</title>
                <rect v-if="bar.rank !== null" class="stock-rank-bar" :x="bar.x" :y="bar.y" :width="bar.width" :height="bar.height" rx="3" />
                <text class="stock-rank-value" :x="bar.center" :y="bar.rank === null ? chartBottom - 9 : Math.max(40, bar.y - 8)" text-anchor="middle">{{ bar.rank === null ? '—' : `第${bar.rank}名` }}</text>
                <text class="stock-rank-date" :x="bar.center" :y="chartBottom + 24" text-anchor="middle">{{ bar.tradeDate }}</text>
              </g>
              <text class="stock-rank-axis-title" :x="chartWidth - chartRight" :y="chartHeight - 8" text-anchor="end">时间</text>
            </svg>
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>
