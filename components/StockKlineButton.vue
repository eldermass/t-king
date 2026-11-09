<script setup lang="ts">
import { StockSDK } from 'stock-sdk'
import { normalizeCode } from '~/shared/reminder-core'

const props = defineProps<{ stockCode: string; stockName: string }>()
type Kline = { date: string; open: number | null; close: number | null; high: number | null; low: number | null; volume: number | null; ma?: Record<string, number | null> }
const sdk = new StockSDK({ timeout: 15_000, retry: { maxRetries: 2, baseDelay: 500 }, rateLimit: { requestsPerSecond: 2, maxBurst: 1 } })
const open = ref(false)
const loading = ref(false)
const error = ref('')
const rows = ref<Kline[]>([])
let requestId = 0
const chart = { width: 760, height: 320, left: 52, right: 16, top: 18, bottom: 30 }
const priceHeight = 188
const volumeTop = chart.top + priceHeight + 20
const volumeHeight = chart.height - chart.bottom - volumeTop
const colors: Record<number, string> = { 5: '#d23a32', 10: '#e28a1a', 20: '#4d8b5b', 60: '#286fa8' }
const model = computed(() => {
  const values = rows.value.filter((row) => [row.open, row.close, row.high, row.low].every((value) => value !== null && Number.isFinite(value))).slice(-90)
  if (!values.length) return null
  const prices = values.flatMap((row) => [row.high!, row.low!, ...Object.values(row.ma ?? {}).filter((value): value is number => value !== null && Number.isFinite(value))])
  let min = Math.min(...prices)
  let max = Math.max(...prices)
  const padding = min === max ? Math.max(1, Math.abs(min) * .01) : (max - min) * .08
  min -= padding; max += padding
  const width = chart.width - chart.left - chart.right
  const xAt = (index: number) => chart.left + (values.length === 1 ? width / 2 : index / (values.length - 1) * width)
  const yAt = (price: number) => chart.top + (max - price) / (max - min) * priceHeight
  const candleWidth = Math.max(3, Math.min(10, width / values.length * .62))
  const candles = values.map((row, index) => ({
    x: xAt(index), high: yAt(row.high!), low: yAt(row.low!), bodyY: yAt(Math.max(row.open!, row.close!)),
    bodyHeight: Math.max(2, Math.abs(yAt(row.open!) - yAt(row.close!))), width: candleWidth,
    color: row.close! >= row.open! ? '#c64f34' : '#1f6f62',
    title: `${row.date} 开 ${row.open!.toFixed(2)} 高 ${row.high!.toFixed(2)} 低 ${row.low!.toFixed(2)} 收 ${row.close!.toFixed(2)}`
  }))
  const lines = [5, 10, 20, 60].map((period) => {
    let path = ''; let connected = false
    values.forEach((row, index) => {
      const value = row.ma?.[`ma${period}`]
      if (value === null || value === undefined || !Number.isFinite(value)) { connected = false; return }
      path += `${connected ? 'L' : 'M'}${xAt(index).toFixed(2)},${yAt(value).toFixed(2)} `
      connected = true
    })
    return { period, path: path.trim(), color: colors[period] }
  }).filter((line) => line.path)
  const maxVolume = Math.max(0, ...values.map((row) => row.volume ?? 0))
  const volumeBars = maxVolume ? values.map((row, index) => ({
    x: xAt(index), y: volumeTop + volumeHeight - (row.volume ?? 0) / maxVolume * volumeHeight,
    height: Math.max(row.volume ? 1 : 0, (row.volume ?? 0) / maxVolume * volumeHeight),
    width: candleWidth, color: row.close! >= row.open! ? '#c64f34' : '#1f6f62'
  })) : []
  const grids = Array.from({ length: 5 }, (_, index) => ({ y: chart.top + index / 4 * priceHeight, label: (max - index / 4 * (max - min)).toFixed(2) }))
  const labels = [...new Set([0, Math.floor((values.length - 1) / 2), values.length - 1])].map((index) => ({ x: xAt(index), label: values[index].date.slice(5, 10) }))
  return { candles, lines, volumeBars, grids, labels }
})
const show = async () => {
  const code = normalizeCode(props.stockCode)
  open.value = true; loading.value = true; error.value = ''; rows.value = []
  const currentRequest = ++requestId
  if (!/^\d{6}$/.test(code)) { error.value = '请先填写有效的 6 位股票代码'; loading.value = false; return }
  try {
    const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() - 180 * 86400000))
    const dateFields = Object.fromEntries(dateParts.map((part) => [part.type, part.value]))
    const startDate = `${dateFields.year}${dateFields.month}${dateFields.day}`
    const result = await sdk.kline.withIndicators(code, { market: 'A', period: 'daily', adjust: '', startDate, indicators: { ma: { periods: [5, 10, 20, 60] } } })
    if (currentRequest === requestId) rows.value = result.map((row) => ({ date: row.date, open: row.open, close: row.close, high: row.high, low: row.low, volume: row.volume, ma: row.ma }))
  } catch (cause) {
    if (currentRequest === requestId) error.value = cause instanceof Error ? cause.message : '日 K 线读取失败'
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}
const close = () => { requestId += 1; open.value = false }
</script>

<template>
  <button class="mini-btn" type="button" :aria-label="`查看 ${stockName || stockCode || '当前股票'} 的K线图`" @click="show">K线图</button>
  <Teleport to="body">
    <div v-if="open" class="settings-modal-overlay stock-kline-overlay" @click.self="close">
      <section class="market-chart-window stock-kline-window" role="dialog" aria-modal="true" :aria-label="`${stockName || stockCode} 的90日日K线图`" @keydown.esc="close">
        <header class="market-chart-window-head"><div><span class="market-chart-eyebrow">90 DAYS · DAILY KLINE</span><h2>{{ stockName || stockCode }} · {{ normalizeCode(stockCode) }}</h2></div><button class="market-chart-close" type="button" aria-label="关闭日K线图" @click="close">×</button></header>
        <div class="market-chart-legend"><span><i class="market-chart-swatch market-chart-swatch-candle"></i>日 K</span><span v-for="period in [5, 10, 20, 60]" :key="period"><i class="market-chart-swatch" :style="{ background: colors[period] }"></i>MA{{ period }}</span></div>
        <div v-if="loading" class="market-chart-state">正在读取日 K 线...</div><div v-else-if="error" class="market-chart-state is-error">{{ error }}</div><div v-else-if="!model" class="market-chart-state">暂无日 K 线数据</div>
        <svg v-else class="market-chart-svg" :viewBox="`0 0 ${chart.width} ${chart.height}`" role="img" :aria-label="`${stockName || stockCode} 90 日日 K 线`">
          <g class="market-chart-grid"><line v-for="grid in model.grids" :key="grid.y" :x1="chart.left" :x2="chart.width - chart.right" :y1="grid.y" :y2="grid.y" /><text v-for="grid in model.grids" :key="grid.label" :x="chart.left - 8" :y="grid.y + 4" text-anchor="end">{{ grid.label }}</text></g>
          <g class="market-chart-candles"><g v-for="candle in model.candles" :key="candle.title"><title>{{ candle.title }}</title><line :x1="candle.x" :x2="candle.x" :y1="candle.high" :y2="candle.low" :stroke="candle.color" /><rect :x="candle.x - candle.width / 2" :y="candle.bodyY" :width="candle.width" :height="candle.bodyHeight" :fill="candle.color" /></g></g>
          <path v-for="line in model.lines" :key="line.period" class="market-chart-line" :d="line.path" :stroke="line.color" /><line class="market-chart-volume-axis" :x1="chart.left" :x2="chart.width - chart.right" :y1="volumeTop + volumeHeight" :y2="volumeTop + volumeHeight" /><g class="market-chart-volumes"><rect v-for="(bar, index) in model.volumeBars" :key="index" :x="bar.x - bar.width / 2" :y="bar.y" :width="bar.width" :height="bar.height" :fill="bar.color" /></g><g class="market-chart-labels"><text v-for="label in model.labels" :key="label.x" :x="label.x" :y="chart.height - 8" text-anchor="middle">{{ label.label }}</text></g>
        </svg>
      </section>
    </div>
  </Teleport>
</template>
