<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { stockBoardKey, type StockCard } from '~/composables/useStockBoard'

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
  priceMarkerSpread,
  priceMarkerRate,
  investedAmount,
  totalMarketValue,
  profitAmount,
  profitTone,
  profitSign,
  averageCost,
  quoteTone,
  holdingCycle,
  holdingCycleLabel,
  profileText,
  quoteLabel,
  cardAlertClass,
  isSellTriggered,
  dipAlertClass,
  recommendedAddClass,
  isRecommendedDipAlert,
  applyRecommendedDipAlert,
  handleBuyPriceInput,
  handleLotsInput,
  handleMarkerPriceInput,
  handleDipAlertPriceInput,
  removeStock,
  addBuyEntry,
  removeBuyEntry,
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
          <button class="ghost-btn" type="button" @click="removeStock(stock.id)">
            删除
          </button>
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
          <button class="ghost-btn" type="button" @click="removeStock(stock.id)">
            删除
          </button>
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
        <strong>{{ formatSellPrice(averageCost(stock)) }}</strong>
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
        <button class="mini-btn" type="button" @click="addBuyEntry(stock)">
          + 买入
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>买入价</th>
              <th>涨幅</th>
              <th>卖价</th>
              <th>手数</th>
              <th>删</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in stock.buyEntries" :key="entry.id">
              <td>
                <input
                  v-model.number="entry.buyPrice"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0.00"
                  @input="handleBuyPriceInput(entry)"
                />
              </td>
              <td>
                <div class="inline-field">
                  <input v-model.number="entry.targetRate" type="number" step="0.5" />
                  <span>%</span>
                </div>
              </td>
              <td class="accent-text sell-text" :class="{ 'number-alert-green': isSellTriggered(stock.id, entry.id) }">
                {{ formatSellPrice(plannedSellPrice(entry)) }}
              </td>
              <td>
                <input
                  v-model.number="entry.lots"
                  type="number"
                  step="1"
                  placeholder="0"
                  @input="handleLotsInput(entry)"
                />
              </td>
              <td class="action-cell">
                <button class="icon-btn" type="button" @click="removeBuyEntry(stock, entry.id)">
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
                <button
                  class="icon-btn recommend-btn"
                  :class="{ 'is-active': isRecommendedDipAlert(stock, alert.id) }"
                  type="button"
                  @click="applyRecommendedDipAlert(stock, alert.id)"
                >
                  推
                </button>
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

        <label class="info-field info-field-wide risk-warning-field">
          <span>风险警告</span>
          <textarea
            v-model="stock.riskWarning"
            class="info-textarea risk-warning-textarea"
            rows="3"
            placeholder="输入需要在 worker 调用时推送到 PushDeer 的风险提醒"
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
</template>
