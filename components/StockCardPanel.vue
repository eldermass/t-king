<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { stockBoardKey, type BuyEntry, type StockCard, type TradeRecord } from '~/composables/useStockBoard'
import { emptyStockScore, scoreForSelections, stockScoreRules, type ScoreDimension, type StockScore } from '~/shared/stock-score'

type TradeRecordGroup = {
  id: string
  opening: TradeRecord
  operations: TradeRecord[]
}

const props = withDefaults(defineProps<{
  stock: StockCard
  mode?: 'desktop' | 'h5'
  isDragging?: boolean
  isPressed?: boolean
  isDropTarget?: boolean
  customStyle?: CSSProperties
  canMovePrev?: boolean
  canMoveNext?: boolean
}>(), {
  mode: 'desktop',
  isDragging: false,
  isPressed: false,
  isDropTarget: false,
  customStyle: undefined,
  canMovePrev: false,
  canMoveNext: false
})

const emit = defineEmits<{
  dragPointerDown: [event: PointerEvent, stockId: string]
  movePrev: [stockId: string]
  moveNext: [stockId: string]
}>()

const stockBoard = inject<ReturnType<typeof useStockBoard>>(stockBoardKey)

if (!stockBoard) {
  throw new Error('StockCardPanel requires stock board context')
}

const {
  formatPrice,
  formatSellPrice,
  formatPercent,
  formatAmount,
  plannedSellPrice,
  dipPrice,
  referencePrice,
  dipAlertSpreadRate,
  latestAddProfit,
  latestAddProfitRate,
  latestAddProfitAmountTone,
  latestAddProfitRateTone,
  entryCurrentProfit,
  entryCurrentProfitTone,
  isRiskWarningTriggered,
  priceMarkerSpread,
  priceMarkerRate,
  investedAmount,
  totalMarketValue,
  profitAmount,
  profitTone,
  profitSign,
  quoteFor,
  quoteTone,
  holdingCycle,
  holdingCycleLabel,
  profileText,
  quoteLabel,
  cardAlertClass,
  isExitAlertTriggered,
  isSellTriggered,
  dipAlertClass,
  handleMarkerPriceInput,
  handleExitAlertPriceInput,
  handleDipAlertPriceInput,
  addBuyEntry,
  offsetBuyEntry,
  closeStock,
  discardBuyEntry,
  removeStock,
  addDipAlert,
  removeDipAlert
} = stockBoard

const cycleValue = (stock: StockCard) => holdingCycle(stock) ?? 0

const cycleAdvisoryText = (stock: StockCard) => {
  const cycle = cycleValue(stock)

  if (cycle > 20) {
    return '\u62e9\u673a\u5272\u8089'
  }

  if (cycle > 10) {
    return '\u8c28\u614e\u8865\u4ed3'
  }

  return ''
}

const hasCycleAdvisory = (stock: StockCard) => cycleValue(stock) > 10

const isPriceMarkerRateAlert = (stock: StockCard, field: 'riseStartPrice' | 'pullbackStartPrice') => {
  const rate = priceMarkerRate(stock, field)

  return rate !== null && Math.abs(rate) > 15
}

const onDragPointerDown = (event: PointerEvent) => emit('dragPointerDown', event, props.stock.id)
const onMovePrev = () => emit('movePrev', props.stock.id)
const onMoveNext = () => emit('moveNext', props.stock.id)
const onDeleteStock = () => removeStock(props.stock.id)

const scoreOpen = ref(false)
const scoreDraft = ref<StockScore>(emptyStockScore())
const scoreDimensions: ScoreDimension[] = ['quality', 'form']
const starredScoreCriteria = new Set([
  'popularity',
  'initiative',
  'rank',
  'gameValue',
  'newHigh15d',
  'rebound15d',
  'holdingDays',
  'stopLoss'
])
const scoreSelections = (dimension: ScoreDimension) => scoreDraft.value[`${dimension}Selections`]
const scoreValue = (dimension: ScoreDimension) => scoreForSelections(dimension, scoreSelections(dimension))
const displayedScore = (dimension: ScoreDimension) => props.stock.score?.[dimension] ?? scoreValue(dimension)
const scoreTone = (value: number | null) => {
  if (value !== null && value >= 40) return 'is-high'
  if (value !== null && value <= 20) return 'is-low'
  return 'is-neutral'
}
const setScoreSelection = (dimension: ScoreDimension, key: string, value: string) => {
  scoreSelections(dimension)[key] = value
}

const openScore = () => {
  const current = props.stock.score ?? emptyStockScore()
  scoreDraft.value = {
    quality: current.quality,
    form: current.form,
    qualitySelections: { ...current.qualitySelections },
    formSelections: { ...current.formSelections },
    updatedAt: current.updatedAt
  }
  scoreOpen.value = true
}

const saveScore = () => {
  props.stock.score = {
    quality: scoreValue('quality'),
    form: scoreValue('form'),
    qualitySelections: { ...scoreDraft.value.qualitySelections },
    formSelections: { ...scoreDraft.value.formSelections },
    updatedAt: new Date().toISOString()
  }
  scoreOpen.value = false
}

const closeScore = () => { scoreOpen.value = false }

const recordsOpen = ref(false)
const closeRecords = () => { recordsOpen.value = false }
const tradeRecords = computed(() => [...(props.stock.tradeRecords ?? [])].sort((left, right) => {
  const dateOrder = right.tradeDate.localeCompare(left.tradeDate)
  return dateOrder || right.id.localeCompare(left.id)
}))
const tradeRecordOpening = (record: TradeRecord) => {
  const relatedRecords = (props.stock.tradeRecords ?? [])
    .filter((item) => item.entryId === record.entryId)
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate) || left.id.localeCompare(right.id))

  const opening = relatedRecords[0]
  return opening?.id === record.id ? null : opening ?? null
}
const tradeRecordProfit = (record: TradeRecord) => {
  const opening = tradeRecordOpening(record)

  if (!opening || opening.price <= 0 || record.price <= 0) {
    return null
  }

  const direction = opening.type === 'sell' ? -1 : 1
  return (record.price - opening.price) * record.lots * 100 * direction
}
const tradeRecordProfitTone = (value: number | null) => {
  if (value === null || Math.abs(value) < 0.005) return 'is-flat'
  return value > 0 ? 'is-profit' : 'is-loss'
}
const tradeRecordGroups = computed<TradeRecordGroup[]>(() => {
  const groups = new Map<string, TradeRecord[]>()

  for (const record of props.stock.tradeRecords ?? []) {
    const key = record.entryId ?? `record:${record.id}`
    const records = groups.get(key) ?? []
    records.push(record)
    groups.set(key, records)
  }

  return [...groups.entries()]
    .map(([id, records]) => {
      const orderedRecords = records.sort((left, right) => left.tradeDate.localeCompare(right.tradeDate) || left.id.localeCompare(right.id))
      return {
        id,
        opening: orderedRecords[0],
        operations: orderedRecords.slice(1)
      }
    })
    .sort((left, right) => {
      const leftLatest = left.operations[left.operations.length - 1] ?? left.opening
      const rightLatest = right.operations[right.operations.length - 1] ?? right.opening
      return rightLatest.tradeDate.localeCompare(leftLatest.tradeDate) || rightLatest.id.localeCompare(leftLatest.id)
    })
})
const tradeRecordGroupProfit = (group: TradeRecordGroup) => {
  if (!group.operations.length) return null

  const profits = group.operations.map((record) => tradeRecordProfit(record))

  if (profits.every((value) => value === null)) return null
  return profits.reduce((total, value) => total + (value ?? 0), 0)
}
const tradeRecordTotalProfit = computed(() => {
  const profits = tradeRecordGroups.value.map((group) => tradeRecordGroupProfit(group)).filter((value): value is number => value !== null)
  return profits.length ? profits.reduce((total, value) => total + value, 0) : null
})

const tradeModal = ref<'buy' | 'offset' | 'close' | 'discard' | null>(null)
const selectedEntry = ref<BuyEntry | null>(null)
const tradeError = ref('')
const buyDraft = ref({ price: null as number | null, targetRate: 4, lots: 1, sign: 1 as 1 | -1 })
const offsetDraft = ref({ price: null as number | null, lots: 1 })
const closeDraft = ref({ price: null as number | null })

const openBuy = () => {
  const livePrice = quoteFor(props.stock.code).price
  const initialPrice = typeof livePrice === 'number' && Number.isFinite(livePrice) && livePrice > 0
    ? livePrice
    : null

  buyDraft.value = { price: initialPrice, targetRate: 4, lots: 1, sign: 1 }
  tradeError.value = ''
  tradeModal.value = 'buy'
}

const openOffset = (entry: BuyEntry) => {
  selectedEntry.value = entry
  offsetDraft.value = { price: null, lots: Math.abs(entry.lots ?? 1) }
  tradeError.value = ''
  tradeModal.value = 'offset'
}

const openClose = () => {
  closeDraft.value = { price: null }
  tradeError.value = ''
  tradeModal.value = 'close'
}

const closeTradeModal = () => {
  tradeModal.value = null
  selectedEntry.value = null
  tradeError.value = ''
}

const openDiscard = (entry: BuyEntry) => {
  selectedEntry.value = entry
  tradeError.value = ''
  tradeModal.value = 'discard'
}

const submitTrade = () => {
  if (tradeModal.value === 'buy') {
    const { price, targetRate, lots, sign } = buyDraft.value

    if (!Number.isFinite(price) || (price as number) <= 0 || !Number.isFinite(targetRate) || !Number.isInteger(lots) || lots <= 0) {
      tradeError.value = '请输入有效的价格、预期涨幅和手数。'
      return
    }

    addBuyEntry(props.stock, price as number, targetRate, lots * sign)
    closeTradeModal()
    return
  }

  if (tradeModal.value === 'offset') {
    const entry = selectedEntry.value
    const { price, lots } = offsetDraft.value

    if (!entry || !offsetBuyEntry(props.stock, entry.id, price as number, lots)) {
      tradeError.value = `请输入有效的价格和手数，手数不能超过 ${Math.abs(entry?.lots ?? 0)}。`
      return
    }

    closeTradeModal()
    return
  }

  if (tradeModal.value === 'discard' && selectedEntry.value) {
    discardBuyEntry(props.stock, selectedEntry.value.id)
    closeTradeModal()
    return
  }

  if (tradeModal.value === 'close' && closeStock(props.stock, closeDraft.value.price as number)) {
    closeTradeModal()
    return
  }

  tradeError.value = '请输入有效的清仓价格，且当前需要有持仓记录。'
}
</script>

<template>
  <article
    class="stock-card"
    :class="[
      cardAlertClass(stock),
      {
        'is-dragging': isDragging,
        'is-pressed': isPressed,
        'is-drop-target': isDropTarget,
        'stock-card-h5': mode === 'h5',
        'stock-card-cycle-aged': hasCycleAdvisory(stock)
      }
    ]"
    :data-stock-id="stock.id"
    :style="customStyle"
  >
    <div v-if="isExitAlertTriggered(stock.id)" class="exit-alert-banner">
      立即割肉
    </div>
    <div v-if="isExitAlertTriggered(stock.id)" class="exit-alert-mask" aria-hidden="true"></div>
    <div v-if="hasCycleAdvisory(stock)" class="cycle-advisory">
      {{ cycleAdvisoryText(stock) }}
    </div>
    <button
      v-if="mode === 'desktop'"
      class="drag-handle"
      type="button"
      aria-label="拖动排序"
      @pointerdown="onDragPointerDown"
    >
      <span></span>
      <span></span>
      <span></span>
    </button>

    <header class="card-header">
      <div v-if="mode === 'h5'" class="title-wrap title-wrap-h5">
        <div class="title-main-line title-main-line-h5">
          <div class="title-stack-h5">
            <div class="title-line title-line-h5">
              <div class="title-name-row title-name-row-h5">
                <input
                  v-model="stock.name"
                  class="title-input title-input-h5"
                  type="text"
                  placeholder="????"
                />
                <span v-if="holdingCycleLabel(stock)" class="cycle-badge">{{ holdingCycleLabel(stock) }}</span>
              </div>
              <span class="quote-pill" :class="quoteTone(stock.code)">
                {{ quoteLabel(stock.code) }}
              </span>
            </div>
            <input
              v-model="stock.code"
              class="code-input code-input-h5"
              type="text"
              inputmode="numeric"
              maxlength="6"
              placeholder="股票代码"
            />
          </div>
          <div class="card-trade-actions">
            <button class="delete-stock-btn" type="button" @click="onDeleteStock">删除</button>
            <button class="ghost-btn" type="button" @click="openClose">
            清仓
            </button>
          </div>
        </div>
      </div>

      <div v-else class="title-wrap">
        <div class="title-line">
          <div class="title-name-row">
            <input v-model="stock.name" class="title-input" type="text" placeholder="????" />
            <span v-if="holdingCycleLabel(stock)" class="cycle-badge">{{ holdingCycleLabel(stock) }}</span>
          </div>
          <span class="quote-pill" :class="quoteTone(stock.code)">
            {{ quoteLabel(stock.code) }}
          </span>
        </div>
        <div class="code-line">
          <input
            v-model="stock.code"
            class="code-input"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="股票代码"
          />
          <div class="card-trade-actions">
            <button class="delete-stock-btn" type="button" @click="onDeleteStock">删除</button>
            <button class="ghost-btn" type="button" @click="openClose">
            清仓
            </button>
          </div>
        </div>
      </div>
    </header>

    <section class="summary-strip">
      <div class="summary-box">
        <span>总市值</span>
        <strong>{{ formatAmount(totalMarketValue(stock)) }}</strong>
        <small class="summary-breakdown">
          <span>{{ formatAmount(investedAmount(stock)) }}</span>
          <span :class="profitTone(stock)">{{ profitSign(stock) }} {{ formatAmount(Math.abs(profitAmount(stock) ?? 0)) }}</span>
        </small>
      </div>
      <div class="summary-box">
        <span>均价</span>
        <span class="score-label">评分</span>
        <strong class="score-pair" role="button" tabindex="0" @click="openScore" @keydown.enter="openScore">
          <span>质 <i :class="scoreTone(displayedScore('quality'))">{{ displayedScore('quality') ?? '--' }}</i></span>
          <span>形 <i :class="scoreTone(displayedScore('form'))">{{ displayedScore('form') ?? '--' }}</i></span>
        </strong>
      </div>
      <div class="summary-box">
        <span>上次补仓盈亏</span>
        <strong class="recommended-add-text" :class="latestAddProfitAmountTone(stock)">
          {{ formatAmount(latestAddProfit(stock)) }}
          <small :class="latestAddProfitRateTone(stock)">{{ formatPercent(latestAddProfitRate(stock)) }}</small>
        </strong>
      </div>
    </section>

    <section class="table-section">
      <div class="section-head">
        <h2>买入</h2>
        <div class="section-head-actions">
          <button class="ghost-btn record-btn" type="button" @click="recordsOpen = true">记录</button>
          <button class="mini-btn" type="button" @click="openBuy">
          + 买入
          </button>
        </div>
      </div>

      <div class="table-wrap buy-table-wrap">
        <table class="buy-table">
          <thead>
            <tr>
              <th>买入价</th>
              <th>涨幅</th>
              <th>卖价</th>
              <th>手数</th>
              <th>当前盈亏</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!stock.buyEntries.length">
              <td colspan="6">暂无持仓记录</td>
            </tr>
            <tr v-for="entry in stock.buyEntries" :key="entry.id">
              <td><span class="entry-readonly">{{ formatPrice(entry.buyPrice) }}</span></td>
              <td>
                <div class="inline-field">
                  <input v-model.number="entry.targetRate" type="number" step="0.5" />
                  <span>%</span>
                </div>
              </td>
              <td
                class="accent-text sell-text"
                :class="{
                  'sell-text-negative': entry.targetRate < 0,
                  'number-alert-green': isSellTriggered(stock.id, entry.id)
                }"
              >
                {{ formatSellPrice(plannedSellPrice(entry)) }}
              </td>
              <td><span class="entry-readonly">{{ entry.lots ?? '--' }}</span></td>
              <td
                class="current-profit-text"
                :class="[
                  entryCurrentProfitTone(stock, entry),
                  { 'number-alert-red-1': isRiskWarningTriggered(stock, entry) }
                ]"
              >
                {{ entryCurrentProfit(stock, entry) === null ? '--' : `${entryCurrentProfit(stock, entry) > 0 ? '+' : ''}${formatAmount(entryCurrentProfit(stock, entry))}` }}
              </td>
              <td class="action-cell" style="transform: translateX(-10px);">
                <button class="icon-btn trade-action-btn" :class="entry.lots && entry.lots > 0 ? 'sell-action-btn' : 'buy-action-btn'" type="button" :aria-label="entry.lots && entry.lots > 0 ? '卖出' : '买入'" @click="openOffset(entry)">
                  {{ entry.lots && entry.lots > 0 ? '卖' : '买' }}
                </button>
                <button class="icon-btn delete-entry-btn" type="button" aria-label="删除误录记录" @click="openDiscard(entry)">删</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="table-section dip-section">
      <div class="section-head">
        <h2>补仓提醒</h2>
        <button class="mini-btn" type="button" @click="addDipAlert(stock)">
          + 提醒
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>跌幅</th>
              <th>提醒价</th>
              <th>上次差率</th>
              <th>删</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="alert in stock.dipAlerts" :key="alert.id">
              <td>
                <div class="inline-field">
                  <input v-model.number="alert.dropRate" type="number" step="0.1" />
                  <span>%</span>
                </div>
              </td>
              <td>
                <input
                  :value="dipPrice(referencePrice(stock), alert.dropRate) ?? ''"
                  class="warn-input"
                  :class="dipAlertClass(stock.id, alert)"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  @input="handleDipAlertPriceInput(stock, alert, (($event.target as HTMLInputElement)?.value ?? ''))"
                />
              </td>
              <td class="warn-text">
                {{ formatPercent(dipAlertSpreadRate(stock, alert)) }}
              </td>
              <td class="action-cell">
                <button class="icon-btn" type="button" @click="removeDipAlert(stock, alert.id)">
                  删
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="table-section dip-section">
      <div class="section-head">
        <h2>拉升/回调</h2>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>起涨价</th>
              <th>上涨差价</th>
              <th>上涨幅度</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  :value="stock.riseStartPrice ?? ''"
                  class="warn-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  @input="handleMarkerPriceInput(stock, 'riseStartPrice', (($event.target as HTMLInputElement)?.value ?? ''))"
                />
              </td>
              <td>
                {{ formatSellPrice(priceMarkerSpread(stock, 'riseStartPrice')) }}
              </td>
              <td class="warn-text">
                <span :class="{ 'marker-rate-alert': isPriceMarkerRateAlert(stock, 'riseStartPrice') }">
                  {{ formatPercent(priceMarkerRate(stock, 'riseStartPrice')) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>起调价</th>
              <th>回调差价</th>
              <th>回调幅度</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  :value="stock.pullbackStartPrice ?? ''"
                  class="warn-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  @input="handleMarkerPriceInput(stock, 'pullbackStartPrice', (($event.target as HTMLInputElement)?.value ?? ''))"
                />
              </td>
              <td>
                {{ formatSellPrice(priceMarkerSpread(stock, 'pullbackStartPrice')) }}
              </td>
              <td class="warn-text">
                <span :class="{ 'marker-rate-alert': isPriceMarkerRateAlert(stock, 'pullbackStartPrice') }">
                  {{ formatPercent(priceMarkerRate(stock, 'pullbackStartPrice')) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="table-section info-section risk-warning-section">
      <div class="section-head risk-warning-head">
        <h2>风险警告</h2>
        <div class="risk-warning-toggle">
          <input v-model="stock.riskWarningEnabled" type="checkbox" />
          <span>开启提醒</span>
        </div>
      </div>
      <textarea
        v-model="stock.riskWarning"
        class="info-textarea risk-warning-textarea"
        rows="3"
        placeholder="输入需要在 worker 调用时推送到 PushDeer 的风险提醒"
      />
    </section>

    <section class="table-section dip-section exit-alert-section">
      <div class="section-head">
        <h2>离场提醒</h2>
        <span v-if="isExitAlertTriggered(stock.id)" class="exit-alert-status">已跌破</span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>离场价</th>
              <th>离场原因</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  :value="stock.exitAlertPrice ?? ''"
                  class="warn-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="跌破此价位触发"
                  @input="handleExitAlertPriceInput(stock, (($event.target as HTMLInputElement)?.value ?? ''))"
                />
              </td>
              <td>
                <input
                  v-model="stock.exitAlertReason"
                  class="warn-input"
                  type="text"
                  placeholder="填写离场原因"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="table-section info-section">
      <div class="section-head">
        <h2>重点信息</h2>
      </div>

      <div class="info-stack">
        <label class="info-field info-field-wide">
          <span>细分行业</span>
          <input
            v-model="stock.subIndustry"
            class="info-input"
            type="text"
            :placeholder="profileText('', stock.code)"
          />
        </label>

        <label class="info-field info-field-wide">
          <span>热点题材</span>
          <div class="theme-edit-grid">
            <input
              v-model="stock.primaryTheme"
              class="info-input"
              type="text"
              :placeholder="profileText('', stock.code)"
            />
            <input
              v-model="stock.secondaryTheme"
              class="info-input"
              type="text"
              :placeholder="profileText('', stock.code)"
            />
          </div>
        </label>

        <label class="info-field info-field-wide">
          <span>主营业务</span>
          <textarea
            v-model="stock.coreBusiness"
            class="info-textarea"
            rows="2"
            :placeholder="profileText('', stock.code)"
          />
        </label>

      </div>
    </section>

    <footer v-if="mode === 'h5'" class="h5-card-actions">
      <button class="ghost-btn" type="button" :disabled="!canMovePrev" @click="onMovePrev">
        前移
      </button>
      <button class="ghost-btn" type="button" :disabled="!canMoveNext" @click="onMoveNext">
        后移
      </button>
    </footer>
  </article>

  <div v-if="tradeModal" class="settings-modal-overlay" @click.self="closeTradeModal">
    <section class="settings-modal trade-modal" role="dialog" aria-modal="true" aria-labelledby="trade-modal-title">
      <header class="settings-modal-head">
        <div>
          <h2 id="trade-modal-title">{{ tradeModal === 'buy' ? '记录买入' : tradeModal === 'offset' ? (selectedEntry?.lots && selectedEntry.lots > 0 ? '记录卖出' : '记录买入') : tradeModal === 'discard' ? '删除误录' : '清仓' }}</h2>
          <p>{{ stock.name || stock.code || '当前股票' }}</p>
        </div>
        <button class="ghost-btn" type="button" @click="closeTradeModal">关闭</button>
      </header>

      <div v-if="tradeModal === 'buy'" class="trade-form">
        <label class="settings-field">
          <span>价格</span>
          <input v-model.number="buyDraft.price" class="settings-input" type="number" min="0" step="0.01" placeholder="0.00" />
        </label>
        <label class="settings-field">
          <span>预期涨幅</span>
          <div class="trade-input-group">
            <input v-model.number="buyDraft.targetRate" class="settings-input" type="number" step="0.1" />
            <span>%</span>
          </div>
        </label>
        <label class="settings-field">
          <span>手数</span>
          <div class="trade-input-group">
            <input v-model.number="buyDraft.lots" class="settings-input" type="number" min="1" step="1" />
            <button class="sign-toggle-btn" type="button" :class="buyDraft.sign > 0 ? 'is-positive' : 'is-negative'" @click="buyDraft.sign = buyDraft.sign > 0 ? -1 : 1">
              {{ buyDraft.sign > 0 ? '+ 正' : '- 负' }}
            </button>
          </div>
        </label>
      </div>

      <div v-else-if="tradeModal === 'offset'" class="trade-form">
        <label class="settings-field">
          <span>价格</span>
          <input v-model.number="offsetDraft.price" class="settings-input" type="number" min="0" step="0.01" placeholder="0.00" />
        </label>
        <label class="settings-field">
          <span>手数</span>
          <input v-model.number="offsetDraft.lots" class="settings-input" type="number" min="1" :max="Math.abs(selectedEntry?.lots ?? 0)" step="1" />
        </label>
      </div>

      <p v-else-if="tradeModal === 'discard'" class="trade-confirm-text">确认删除这条误录的买入记录吗？关联的操作记录也会一并删除。</p>

      <div v-else class="trade-form">
        <label class="settings-field">
          <span>清仓价</span>
          <input v-model.number="closeDraft.price" class="settings-input" type="number" min="0" step="0.01" placeholder="0.00" />
        </label>
      </div>

      <p v-if="tradeError" class="trade-error" role="alert">{{ tradeError }}</p>

      <div class="settings-modal-actions">
        <button class="ghost-btn" type="button" @click="closeTradeModal">取消</button>
        <button class="primary-btn" type="button" @click="submitTrade">确认</button>
      </div>
    </section>
  </div>

  <div v-if="recordsOpen" class="settings-modal-overlay" @click.self="closeRecords">
    <section class="settings-modal trade-records-modal" role="dialog" aria-modal="true" aria-labelledby="trade-records-title">
      <header class="settings-modal-head">
        <div>
          <h2 id="trade-records-title">交易记录</h2>
          <p>{{ stock.name || stock.code || '当前股票' }}</p>
        </div>
        <button class="ghost-btn" type="button" aria-label="关闭交易记录" @click="closeRecords">关闭</button>
      </header>

      <div class="table-wrap trade-records-table-wrap">
        <table class="trade-records-table trade-records-grouped-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>开仓</th>
              <th>后续操作</th>
              <th>累计盈亏</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!tradeRecordGroups.length">
              <td colspan="4">暂无交易记录</td>
            </tr>
            <tr v-for="group in tradeRecordGroups" :key="group.id">
              <td>{{ group.opening.tradeDate }}</td>
              <td>
                <span class="trade-record-type" :class="group.opening.type === 'buy' ? 'is-buy' : 'is-sell'">
                  {{ group.opening.type === 'buy' ? '买入' : '卖出' }}
                </span>
                <span class="trade-record-detail">{{ formatPrice(group.opening.price) }} × {{ group.opening.lots }}手</span>
              </td>
              <td>
                <div v-if="group.operations.length" class="trade-record-operations">
                  <span v-for="operation in group.operations" :key="operation.id" class="trade-record-operation">
                    <span class="trade-record-type" :class="operation.type === 'buy' ? 'is-buy' : 'is-sell'">
                      {{ operation.type === 'buy' ? '买入' : '卖出' }}
                    </span>
                    <span class="trade-record-detail">{{ formatPrice(operation.price) }} × {{ operation.lots }}手</span>
                    <strong :class="['trade-record-profit', tradeRecordProfitTone(tradeRecordProfit(operation))]">
                      {{ formatAmount(tradeRecordProfit(operation)) }}
                    </strong>
                  </span>
                </div>
                <span v-else class="trade-record-empty">--</span>
              </td>
              <td :class="['trade-record-profit', tradeRecordProfitTone(tradeRecordGroupProfit(group))]">
                {{ formatAmount(tradeRecordGroupProfit(group)) }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th colspan="3">总盈亏</th>
              <th :class="['trade-record-profit', tradeRecordProfitTone(tradeRecordTotalProfit)]">
                {{ formatAmount(tradeRecordTotalProfit) }}
              </th>
            </tr>
          </tfoot>
        </table>

        <table v-if="false" class="trade-records-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>方向</th>
              <th>价格</th>
              <th>手数</th>
              <th>成交额</th>
              <th>盈亏</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!tradeRecords.length">
              <td colspan="6">暂无交易记录</td>
            </tr>
            <tr v-for="record in tradeRecords" :key="record.id">
              <td>{{ record.tradeDate }}</td>
              <td>
                <span class="trade-record-type" :class="record.type === 'buy' ? 'is-buy' : 'is-sell'">
                  {{ record.type === 'buy' ? '买入' : '卖出' }}
                </span>
              </td>
              <td>{{ formatPrice(record.price) }}</td>
              <td>{{ record.lots }}</td>
              <td>{{ formatAmount(record.price * record.lots * 100) }}</td>
              <td :class="['trade-record-profit', tradeRecordProfitTone(tradeRecordProfit(record))]">
                {{ formatAmount(tradeRecordProfit(record)) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <div v-if="scoreOpen" class="settings-modal-overlay" @click.self="closeScore">
    <section class="settings-modal score-modal" role="dialog" aria-modal="true" aria-labelledby="score-modal-title">
      <header class="settings-modal-head">
        <div>
          <h2 id="score-modal-title">股票评分</h2>
          <p>{{ stock.name || stock.code || '当前股票' }} · 选择各项后自动计算</p>
        </div>
        <button class="ghost-btn" type="button" aria-label="关闭评分弹窗" @click="closeScore">关闭</button>
      </header>

      <div v-for="dimension in scoreDimensions" :key="dimension" class="score-dimension">
        <div class="score-dimension-head">
          <h3>{{ stockScoreRules[dimension].label }}</h3>
          <strong :class="scoreTone(scoreValue(dimension))">{{ scoreValue(dimension) ?? '--' }}<small> 分</small></strong>
        </div>
        <label v-for="criterion in stockScoreRules[dimension].criteria" :key="criterion.key" class="score-field">
          <span>{{ criterion.label }}<em v-if="starredScoreCriteria.has(criterion.key)" class="score-required-star" aria-hidden="true">*</em></span>
          <input
            v-if="criterion.input"
            class="settings-input"
            type="number"
            :min="criterion.input.min"
            :max="criterion.input.max"
            :placeholder="criterion.input.placeholder"
            :value="scoreSelections(dimension)[criterion.key] ?? ''"
            @input="setScoreSelection(dimension, criterion.key, (($event.target as HTMLInputElement)?.value ?? ''))"
          />
          <select
            v-else
            class="settings-input"
            :value="scoreSelections(dimension)[criterion.key] ?? ''"
            @change="setScoreSelection(dimension, criterion.key, (($event.target as HTMLSelectElement)?.value ?? ''))"
          >
            <option value="">请选择</option>
            <option v-for="option in criterion.options ?? []" :key="option.value" :value="option.value">
              {{ option.label }}（{{ option.score }}分）
            </option>
          </select>
        </label>
      </div>

      <div class="settings-modal-actions">
        <button class="ghost-btn" type="button" @click="closeScore">取消</button>
        <button class="primary-btn" type="button" @click="saveScore">保存评分</button>
      </div>
    </section>
  </div>
</template>
