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
  formatAmount,
  plannedSellPrice,
  dipPrice,
  referencePrice,
  recommendedAddPrice,
  investedAmount,
  totalMarketValue,
  profitAmount,
  profitTone,
  profitSign,
  averageCost,
  quoteTone,
  profileText,
  themeList,
  quoteLabel,
  cardAlertClass,
  isSellTriggered,
  dipAlertClass,
  recommendedAddClass,
  handleBuyPriceInput,
  handleLotsInput,
  removeStock,
  addBuyEntry,
  removeBuyEntry,
  addDipAlert,
  removeDipAlert
} = stockBoard

const onDragPointerDown = (event: PointerEvent) => emit('dragPointerDown', event, props.stock.id)
const onMovePrev = () => emit('movePrev', props.stock.id)
const onMoveNext = () => emit('moveNext', props.stock.id)

const titleInputStyle = (name: string) => {
  const length = Math.max((name.trim() || '股票名称').length + 1, 4)
  return {
    width: `${Math.min(length, 10)}ch`
  }
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
        'stock-card-h5': mode === 'h5'
      }
    ]"
    :data-stock-id="stock.id"
    :style="customStyle"
  >
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
              <input
                v-model="stock.name"
                class="title-input title-input-h5"
                type="text"
                placeholder="股票名称"
                :style="titleInputStyle(stock.name)"
              />
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
          <input v-model="stock.name" class="title-input" type="text" placeholder="股票名称" />
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
        <strong>{{ formatPrice(averageCost(stock)) }}</strong>
      </div>
      <div class="summary-box">
        <span>推荐补仓</span>
        <strong class="recommended-add-text" :class="recommendedAddClass(stock.id)">{{ formatPrice(recommendedAddPrice(stock)) }}</strong>
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
                  min="0"
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
              <td class="warn-text" :class="dipAlertClass(stock.id, alert)">
                {{ formatPrice(dipPrice(referencePrice(stock), alert.dropRate)) }}
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

    <section class="table-section info-section">
      <div class="section-head">
        <h2>重点信息</h2>
      </div>

      <div class="info-stack">
        <label class="info-field info-field-wide">
          <span>细分行业</span>
          <strong class="info-readonly">{{ profileText(stock.subIndustry, stock.code) }}</strong>
        </label>

        <label class="info-field info-field-wide">
          <span>热点题材</span>
          <div v-if="themeList(stock).length" class="theme-pills">
            <strong v-for="theme in themeList(stock)" :key="theme" class="info-readonly theme-chip">{{ theme }}</strong>
          </div>
          <strong v-else class="info-readonly">{{ profileText('', stock.code) }}</strong>
        </label>

        <label class="info-field info-field-wide">
          <span>主营业务</span>
          <p class="info-description">{{ profileText(stock.coreBusiness, stock.code) }}</p>
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
