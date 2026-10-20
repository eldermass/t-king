<script setup lang="ts">
import { StockSDK } from 'stock-sdk'
import { calcATR, calcBIAS, calcCCI, calcKC, calcOBV, calcROC, calcRSI, calcSAR, calcWR, type ATRResult, type BIASResult, type CCIResult, type KCResult, type OBVResult, type ROCResult, type RSIResult, type SARResult, type WRResult } from 'stock-sdk/indicators'
import { normalizeCode } from '~/shared/reminder-core'

type Kline = { date: string; open: number | null; high: number | null; low: number | null; close: number | null }
type ChartPoint = Kline & { atr: ATRResult; bias: BIASResult; cci: CCIResult; kc: KCResult; obv: OBVResult; roc: ROCResult; sar: SARResult; wr: WRResult; rsi: RSIResult }
type Indicator = 'kc' | 'atr' | 'bias' | 'cci' | 'obv' | 'roc' | 'sar' | 'wr' | 'rsi'
type ChartSeries = { label: string; color: string; values: (number | null)[] }

const indicatorOptions: { key: Indicator; label: string }[] = [
  { key: 'kc', label: 'KC通道' },
  { key: 'atr', label: '真实波幅' },
  { key: 'bias', label: '乖离率' },
  { key: 'cci', label: '顺势指标' },
  { key: 'obv', label: '能量潮' },
  { key: 'roc', label: '变动率' },
  { key: 'sar', label: '抛物线转向' },
  { key: 'wr', label: '威廉指标' },
  { key: 'rsi', label: '相对强弱' }
]

const props = defineProps<{ stockCode: string; stockName: string }>()
const sdk = new StockSDK({ timeout: 15_000, retry: { maxRetries: 2, baseDelay: 500 } })
const open = ref(false)
const loading = ref(false)
const error = ref('')
const codeInput = ref('')
const queriedCode = ref('')
const queriedName = ref('')
const indicator = ref<Indicator>('kc')
const points = ref<ChartPoint[]>([])
const trigger = ref<HTMLButtonElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
let requestId = 0

const plot = { width: 900, height: 400, left: 62, right: 22, top: 28, bottom: 354 }
const plotWidth = plot.width - plot.left - plot.right
const plotHeight = plot.bottom - plot.top
const visiblePoints = computed(() => points.value.slice(-90))
const indicatorLabel = computed(() => indicatorOptions.find((option) => option.key === indicator.value)?.label ?? '')
const series = computed<ChartSeries[]>(() => {
  const make = (label: string, color: string, select: (point: ChartPoint) => number | null): ChartSeries => ({ label, color, values: visiblePoints.value.map(select) })
  switch (indicator.value) {
    case 'kc': return [make('上轨', '#b34230', (point) => point.kc.upper), make('中轨', '#36658b', (point) => point.kc.mid), make('下轨', '#258370', (point) => point.kc.lower)]
    case 'atr': return [make('ATR(14)', '#b34230', (point) => point.atr.atr), make('真实波幅', '#80909a', (point) => point.atr.tr)]
    case 'bias': return [make('BIAS(6)', '#b34230', (point) => point.bias.bias6), make('BIAS(12)', '#36658b', (point) => point.bias.bias12), make('BIAS(24)', '#258370', (point) => point.bias.bias24)]
    case 'cci': return [make('CCI(14)', '#b34230', (point) => point.cci.cci)]
    case 'obv': return [make('OBV', '#b34230', (point) => point.obv.obv), make('MA(20)', '#36658b', (point) => point.obv.obvMa)]
    case 'roc': return [make('ROC(12)', '#b34230', (point) => point.roc.roc), make('信号线(6)', '#36658b', (point) => point.roc.signal)]
    case 'sar': return [make('SAR', visiblePoints.value.at(-1)?.sar.trend === -1 ? '#258370' : '#b34230', (point) => point.sar.sar)]
    case 'wr': return [make('WR(6)', '#b34230', (point) => point.wr.wr6), make('WR(10)', '#36658b', (point) => point.wr.wr10)]
    case 'rsi': return [make('RSI(6)', '#b34230', (point) => point.rsi.rsi6), make('RSI(12)', '#36658b', (point) => point.rsi.rsi12), make('RSI(24)', '#258370', (point) => point.rsi.rsi24)]
  }
})
const referenceValues = computed(() => {
  if (indicator.value === 'cci') return [-100, 100]
  if (indicator.value === 'wr') return [20, 80]
  if (indicator.value === 'rsi') return [30, 70]
  if (indicator.value === 'bias' || indicator.value === 'roc' || indicator.value === 'obv') return [0]
  return []
})
const values = computed(() => [
  ...series.value.flatMap((item) => item.values),
  ...referenceValues.value,
  ...(indicator.value === 'kc' || indicator.value === 'sar' ? visiblePoints.value.flatMap((point) => [point.low, point.high]) : [])
].filter((value): value is number => value !== null && Number.isFinite(value)))
const bounds = computed(() => {
  const low = Math.min(...values.value)
  const high = Math.max(...values.value)
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { min: 0, max: 1 }
  const padding = Math.max((high - low) * 0.08, high * 0.01, 0.001)
  if (indicator.value === 'rsi' || indicator.value === 'wr') return { min: 0, max: 100 }
  return { min: indicator.value === 'atr' ? 0 : low - padding, max: high + padding }
})
const xAt = (index: number) => plot.left + (index + 0.5) * plotWidth / visiblePoints.value.length
const yAt = (value: number) => plot.bottom - (value - bounds.value.min) / (bounds.value.max - bounds.value.min) * plotHeight
const linePath = (values: (number | null)[]) => values.map((value, index) => {
  const previous = values[index - 1]
  return value !== null && Number.isFinite(value) ? `${index === 0 || previous === null || !Number.isFinite(previous) ? 'M' : 'L'}${xAt(index).toFixed(2)},${yAt(value).toFixed(2)}` : ''
}).join(' ')
const candles = computed(() => visiblePoints.value.flatMap((point, index) => {
  if (point.open === null || point.close === null || point.high === null || point.low === null) return []
  const rising = point.close >= point.open
  return [{ date: point.date, x: xAt(index), high: yAt(point.high), low: yAt(point.low), top: yAt(Math.max(point.open, point.close)), height: Math.max(1, Math.abs(yAt(point.open) - yAt(point.close))), color: rising ? '#c64f34' : '#1f6f62', open: point.open, close: point.close }]
}))
const ticks = computed(() => Array.from({ length: 5 }, (_, index) => {
  const value = bounds.value.min + (bounds.value.max - bounds.value.min) * index / 4
  return { y: yAt(value), label: formatValue(value, true) }
}).reverse())
const dateTicks = computed(() => visiblePoints.value.filter((_, index) => index === 0 || index === visiblePoints.value.length - 1 || index % 15 === 0).map((point) => ({ date: point.date, x: xAt(visiblePoints.value.indexOf(point)) })))
const latest = computed(() => visiblePoints.value.at(-1))
function formatValue(value: number | null | undefined, axis = false) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  if (indicator.value === 'obv') return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: axis ? 1 : 2 }).format(value)
  return value.toFixed(axis ? indicator.value === 'atr' ? 3 : 2 : 3)
}

const close = async () => {
  requestId += 1
  open.value = false
  await nextTick()
  trigger.value?.focus()
}

const query = async () => {
  const code = normalizeCode(codeInput.value)
  const currentRequest = ++requestId
  points.value = []
  error.value = ''
  if (!/^\d{6}$/.test(code) || !/^\d{6}$/.test(codeInput.value.trim())) {
    error.value = '请输入有效的 6 位股票代码'
    loading.value = false
    return
  }
  codeInput.value = code
  if (code !== queriedCode.value) queriedName.value = ''
  queriedCode.value = code
  loading.value = true
  try {
    const startDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
    const [klineResult, quoteResult] = await Promise.allSettled([
      sdk.kline.cn(code, { period: 'daily', adjust: 'qfq', startDate }),
      sdk.quotes.cnSimple([code])
    ])
    if (currentRequest !== requestId) return
    if (klineResult.status === 'rejected') throw klineResult.reason
    const klines = klineResult.value
    const klineName = klines.find((row) => 'name' in row && typeof row.name === 'string' && row.name.trim())
    const quoteName = quoteResult.status === 'fulfilled' ? quoteResult.value.find((quote) => normalizeCode(quote.code) === code)?.name : undefined
    queriedName.value = klineName && 'name' in klineName ? String(klineName.name).trim() : quoteName?.trim() || (code === normalizeCode(props.stockCode) ? props.stockName : '')
    const atr = calcATR(klines)
    const bias = calcBIAS(klines.map((row) => row.close))
    const cci = calcCCI(klines)
    const kc = calcKC(klines)
    const obv = calcOBV(klines, { maPeriod: 20 })
    const roc = calcROC(klines, { signalPeriod: 6 })
    const sar = calcSAR(klines)
    const wr = calcWR(klines)
    const rsi = calcRSI(klines.map((row) => row.close))
    points.value = klines.map((row, index) => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, atr: atr[index], bias: bias[index], cci: cci[index], kc: kc[index], obv: obv[index], roc: roc[index], sar: sar[index], wr: wr[index], rsi: rsi[index] }))
  } catch (cause) {
    if (currentRequest === requestId) error.value = cause instanceof Error ? cause.message : '日 K 线读取失败'
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

const show = async () => {
  codeInput.value = normalizeCode(props.stockCode)
  queriedCode.value = codeInput.value
  queriedName.value = props.stockName
  indicator.value = 'kc'
  open.value = true
  await nextTick()
  dialog.value?.focus()
  await query()
}
</script>

<template>
  <button ref="trigger" class="ghost-btn stock-indicator-trigger" type="button" :aria-label="`查看 ${stockName || stockCode || '当前股票'} 的指标`" @click.stop="show">指标</button>
  <Teleport to="body">
    <div v-if="open" class="settings-modal-overlay" @click.self="close">
      <section ref="dialog" class="settings-modal stock-indicator-modal" role="dialog" aria-modal="true" aria-label="股票指标图" tabindex="-1" @keydown.esc="close">
        <header class="settings-modal-head stock-indicator-head">
          <div><h2>股票指标</h2></div>
          <button class="ghost-btn" type="button" @click="close">关闭</button>
        </header>
        <form class="stock-indicator-query" @submit.prevent="query">
          <strong v-if="queriedName" class="stock-indicator-name">{{ queriedName }}</strong>
          <label for="indicator-stock-code">股票代码</label>
          <input id="indicator-stock-code" v-model="codeInput" class="settings-input" type="text" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="6 位股票代码" />
          <button class="primary-btn" type="submit" :disabled="loading">{{ loading ? '查询中' : '查询' }}</button>
        </form>
        <div class="stock-indicator-chart-wrap">
          <p v-if="loading" class="stock-indicator-state" role="status">正在读取日 K 线...</p>
          <p v-else-if="error" class="stock-indicator-state is-error" role="alert">{{ error }}</p>
          <p v-else-if="!visiblePoints.length" class="stock-indicator-state">暂无日 K 线数据</p>
          <template v-else>
            <div class="stock-indicator-legend">
              <span v-if="indicator === 'kc' || indicator === 'sar'">日 K</span>
              <span v-for="item in series" :key="item.label"><i :style="{ backgroundColor: item.color }"></i>{{ item.label }} {{ formatValue(item.values.at(-1)) }}</span>
              <span v-if="indicator === 'sar' && latest?.sar.trend">{{ latest.sar.trend === 1 ? '上升趋势' : '下降趋势' }}</span>
            </div>
            <svg class="stock-indicator-chart" :viewBox="`0 0 ${plot.width} ${plot.height}`" role="img" :aria-label="`${queriedCode} ${indicatorLabel}近 90 个交易日日线图`">
              <g v-for="tick in ticks" :key="tick.y"><line class="stock-indicator-grid" :x1="plot.left" :x2="plot.width - plot.right" :y1="tick.y" :y2="tick.y" /><text class="stock-indicator-axis" :x="plot.left - 8" :y="tick.y + 4" text-anchor="end">{{ tick.label }}</text></g>
              <line v-for="value in referenceValues" :key="`reference-${value}`" class="stock-indicator-reference" :x1="plot.left" :x2="plot.width - plot.right" :y1="yAt(value)" :y2="yAt(value)" />
              <template v-if="indicator === 'kc' || indicator === 'sar'">
                <g v-for="candle in candles" :key="candle.date"><title>{{ candle.date }} 开 {{ candle.open }} 收 {{ candle.close }}</title><line :x1="candle.x" :x2="candle.x" :y1="candle.high" :y2="candle.low" :stroke="candle.color" /><rect :x="candle.x - 3" :y="candle.top" width="6" :height="candle.height" :fill="candle.color" /></g>
              </template>
              <template v-if="indicator === 'sar'">
                <circle v-for="(point, index) in visiblePoints" :key="point.date" :cx="xAt(index)" :cy="point.sar.sar === null ? -10 : yAt(point.sar.sar)" r="2.8" :fill="point.sar.trend === 1 ? '#b34230' : '#258370'"><title>{{ point.date }} SAR {{ formatValue(point.sar.sar) }}</title></circle>
              </template>
              <template v-else>
                <path v-for="(item, index) in series" :key="item.label" class="stock-indicator-line" :class="{ 'is-secondary': indicator === 'atr' && index === 1 }" :d="linePath(item.values)" :stroke="item.color" />
              </template>
              <text v-for="tick in dateTicks" :key="tick.date" class="stock-indicator-axis" :x="tick.x" :y="plot.height - 16" text-anchor="middle">{{ tick.date.slice(5) }}</text>
            </svg>
          </template>
        </div>
        <div class="stock-indicator-switch" role="group" aria-label="切换指标">
          <button v-for="option in indicatorOptions" :key="option.key" type="button" :class="{ 'is-active': indicator === option.key }" :aria-pressed="indicator === option.key" @click="indicator = option.key">{{ option.label }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
