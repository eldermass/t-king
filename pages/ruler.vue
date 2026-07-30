<script setup lang="ts">
import { stockBoardKey, type BuyEntry, type StockCard } from '~/composables/useStockBoard'
type RulerPoint = {
  id: string
  price: number
  position: number
  lane: 0 | 1
  lotsText: string
  dateText: string
}
type RulerPlanPoint = {
  id: string
  price: number
  position: number
  lane: 0 | 1
  dropRateText: string
}
type RulerGap = {
  id: string
  label: string
  detail: string
  start: number
  width: number
}
type RulerTick = {
  id: string
  position: number
  label: string
  major: boolean
}
type RulerModel = {
  buyCount: number
  start: number
  end: number
  ticks: RulerTick[]
  plannedBuyPoints: RulerPlanPoint[]
  buyPoints: RulerPoint[]
  gaps: RulerGap[]
}
const stockBoard = useStockBoard()
const session = useState<{ authenticated: boolean; user?: { id: string; username: string } } | null>('auth-session', () => null)
provide(stockBoardKey, stockBoard)
const {
  stocks,
  quoteLoading,
  boardLoading,
  saveStatus,
  quoteFor,
  formatPrice,
  formatPercent,
  averageCost,
  referencePrice,
  dipPrice
} = stockBoard
const cloudStatusText = computed(() => {
  if (boardLoading.value) {
    return '\u52a0\u8f7d\u4e2d'
  }
  if (saveStatus.value === 'saving') {
    return '\u4fdd\u5b58\u4e2d'
  }
  if (saveStatus.value === 'saved') {
    return '\u5df2\u540c\u6b65'
  }
  if (quoteLoading.value) {
    return '\u884c\u60c5\u5237\u65b0\u4e2d'
  }
  return '\u4e91\u7aef\u5df2\u8fde\u63a5'
})
const stockLabel = (stock: StockCard) => stock.name.trim() || stock.code.trim() || '--'
const isValidPrice = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
const clampPercent = (value: number) => Math.min(100, Math.max(0, value))
const formatBuyDate = (value: string) => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return value.trim()
  }
  return `${match[2]}-${match[3]}`
}
const formatEntryMeta = (entry: BuyEntry) => {
  const parts: string[] = []
  if (entry.lots && entry.lots > 0) {
    parts.push(`${entry.lots}手`)
  }
  if (entry.buyDate) {
    parts.push(formatBuyDate(entry.buyDate))
  }
  return parts.join(' · ')
}
const buildRulerModel = (stock: StockCard): RulerModel | null => {
  const entries = stock.buyEntries
    .filter((entry) => isValidPrice(entry.buyPrice))
    .slice()
    .sort((left, right) => (left.buyPrice as number) - (right.buyPrice as number))
  const basePrice = referencePrice(stock)
  const plannedBuyPoints: RulerPlanPoint[] = stock.dipAlerts
    .map((alert, index) => {
      const plannedPrice = dipPrice(basePrice, alert.dropRate)

      if (!isValidPrice(plannedPrice)) {
        return null
      }

      return {
        id: `${stock.id}-planned-buy-${alert.id}`,
        price: plannedPrice,
        position: 0,
        lane: (index % 2) as 0 | 1,
        dropRateText: formatPercent(alert.dropRate)
      }
    })
    .filter((point): point is RulerPlanPoint => point !== null)

  if (!entries.length && !plannedBuyPoints.length) {
    return null
  }

  const prices = [
    ...entries.map((entry) => entry.buyPrice as number),
    ...plannedBuyPoints.map((point) => point.price)
  ]
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const span = maxPrice - minPrice
  const padding = span === 0
    ? Math.max(maxPrice * 0.08, 0.5)
    : Math.max(span * 0.18, maxPrice * 0.02, 0.4)
  const start = Math.max(0, minPrice - padding)
  const end = maxPrice + padding
  const range = Math.max(end - start, 0.01)
  const project = (value: number) => ((value - start) / range) * 100
  const ticks: RulerTick[] = Array.from({ length: 17 }, (_, index) => {
    const position = (index / 16) * 100
    const price = start + range * (index / 16)
    return {
      id: `${stock.id}-tick-${index}`,
      position,
      label: formatPrice(price),
      major: index % 4 === 0
    }
  })
  const plannedBuyPointsWithPosition = plannedBuyPoints.map((point) => ({
    ...point,
    position: project(point.price)
  }))
  const buyPoints: RulerPoint[] = entries.map((entry, index) => ({
    id: entry.id,
    price: entry.buyPrice as number,
    position: project(entry.buyPrice as number),
    lane: (index % 2) as 0 | 1,
    lotsText: entry.lots && entry.lots > 0 ? `${entry.lots}手` : '0手',
    dateText: entry.buyDate ? formatBuyDate(entry.buyDate) : '--'
  }))
  const gaps: RulerGap[] = []
  for (let index = 1; index < entries.length; index += 1) {
    const lower = entries[index - 1].buyPrice as number
    const upper = entries[index].buyPrice as number
    const diff = upper - lower
    const rate = lower > 0 ? (diff / lower) * 100 : null
    gaps.push({
      id: `${stock.id}-gap-${index}`,
      label: `间距 ${formatPrice(diff)}`,
      detail: rate === null ? '--' : formatPercent(rate),
      start: project(lower),
      width: Math.max(project(upper) - project(lower), 0.5)
    })
  }
  return {
    buyCount: entries.length,
    start,
    end,
    ticks,
    plannedBuyPoints: plannedBuyPointsWithPosition,
    buyPoints,
    gaps
  }
}
const stockRulers = computed(() =>
  stocks.value.map((stock) => {
    const model = buildRulerModel(stock)
    const quote = quoteFor(stock.code)
    const quoteText = quote.price === null ? '价格不存在' : `${formatPrice(quote.price)} ${formatPercent(quote.changePercent)}`
    const currentPricePosition = model && isValidPrice(quote.price)
      ? clampPercent(((quote.price - model.start) / Math.max(model.end - model.start, 0.01)) * 100)
      : null
    return {
      stock,
      model,
      currentPricePosition,
      quoteText,
      averageText: formatPrice(averageCost(stock))
    }
  })
)
const rulerSummary = (item: { model: RulerModel | null; quoteText: string; averageText: string }) => {
  if (!item.model) {
    return `现价 ${item.quoteText} · 均价 ${item.averageText}`
  }
  return `现价 ${item.quoteText} · 均价 ${item.averageText}`
}
const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  session.value = { authenticated: false }
  await navigateTo('/login')
}
</script>
<template>
  <main class="page-shell ruler-page">
    <section class="topbar">
      <h1>买点刻度视图</h1>
      <div class="topbar-actions">
        <span class="market-tip">{{ session?.user?.username || '' }}</span>
        <span class="market-tip" :class="{ 'is-busy': boardLoading || saveStatus === 'saving' || quoteLoading }">
          {{ cloudStatusText }}
        </span>
        <NuxtLink class="ghost-link" to="/">看板</NuxtLink>
        <NuxtLink class="ghost-link" to="/h5">H5</NuxtLink>
        <button class="ghost-btn" type="button" @click="logout">退出</button>
      </div>
    </section>
    <section class="ruler-board">
      <article v-for="item in stockRulers" :key="item.stock.id" class="ruler-card">
        <header class="ruler-card-head">
          <div class="ruler-card-title">
            <div class="ruler-card-heading">
              <strong>{{ stockLabel(item.stock) }}</strong>
              <span class="ruler-card-code">{{ item.stock.code.trim() || '--' }}</span>
            </div>
            <p class="ruler-card-summary">{{ rulerSummary(item) }}</p>
          </div>
        </header>
        <div v-if="item.model" class="ruler-scroll">
          <div class="price-ruler">
            <div class="price-ruler-rail">
              <div class="price-ruler-track"></div>
              <div
                v-for="gap in item.model.gaps"
                :key="gap.id"
                class="price-gap-segment"
                :style="{ left: `${gap.start}%`, width: `${gap.width}%` }"
              >
                <span class="price-gap-line"></span>
                <div class="price-gap-chip">
                  <strong>{{ gap.label }}</strong>
                  <small>{{ gap.detail }}</small>
                </div>
              </div>
              <div
                v-for="tick in item.model.ticks"
                :key="tick.id"
                class="price-ruler-tick"
                :class="{ 'is-major': tick.major }"
                :style="{ left: `${tick.position}%` }"
              >
                <span v-if="tick.major" class="price-ruler-tick-label">{{ tick.label }}</span>
              </div>
              <span
                v-if="item.currentPricePosition !== null"
                aria-hidden="true"
                :style="{
                  position: 'absolute',
                  left: `${item.currentPricePosition}%`,
                  top: '50%',
                  width: '12px',
                  height: '12px',
                  borderRadius: '999px',
                  background: '#22c55e',
                  border: '2px solid #ffffff',
                  boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.18)',
                  transform: 'translate(-50%, -50%)',
                  zIndex: '3'
                }"
              ></span>
              <div
                v-for="point in item.model.plannedBuyPoints"
                :key="point.id"
                class="price-ruler-point is-plan"
                :class="`is-lane-${point.lane}`"
                :style="{ left: `${point.position}%`, '--lane-offset': `${point.lane * 44}px` }"
              >
                <span
                  class="price-ruler-dot is-plan"
                  :style="{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                    boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.2)'
                  }"
                ></span>
                <div class="price-ruler-point-label">
                  <strong>{{ formatPrice(point.price) }}</strong>
                  <small>{{ point.dropRateText }} 补仓</small>
                </div>
              </div>
              <div
                v-for="point in item.model.buyPoints"
                :key="point.id"
                class="price-ruler-point is-buy"
                :class="`is-lane-${point.lane}`"
                :style="{ left: `${point.position}%`, '--lane-offset': `${point.lane * 44}px` }"
              >
                <span class="price-ruler-dot is-buy"></span>
                <div class="price-ruler-point-label">
                  <strong>{{ formatPrice(point.price) }}</strong>
                  <!-- <span>{{ point.lotsText }}</span> -->
                  <small>{{ point.dateText }} {{ point.lotsText }}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="ruler-empty">无买入</p>
      </article>
    </section>
  </main>
</template>



