<script setup lang="ts">
import { stockBoardKey, type StockCard, type TradeRecord } from '~/composables/useStockBoard'
import { emptyStockScore, scoreForSelections, stockScoreRules, type ScoreDimension, type StockScore } from '~/shared/stock-score'

const stockBoard = useStockBoard()
const session = useState<{ authenticated: boolean; user?: { id: string; username: string } } | null>('auth-session', () => null)
provide(stockBoardKey, stockBoard)

const {
  preselectedStocks,
  archivedStocks,
  addPreselectedStock,
  removePreselectedStock,
  movePreselectedToBoard,
  formatPrice,
  formatAmount
} = stockBoard
const scoreOpen = ref(false)
const recordsOpen = ref(false)
const selectedStock = ref<StockCard | null>(null)
const scoreDraft = ref<StockScore>(emptyStockScore())
const scoreDimensions: ScoreDimension[] = ['quality', 'form']

const scoreSelections = (dimension: ScoreDimension) => scoreDraft.value[`${dimension}Selections`]
const scoreValue = (dimension: ScoreDimension) => scoreForSelections(dimension, scoreSelections(dimension))
const displayedScore = (stock: StockCard, dimension: ScoreDimension) => stock.score?.[dimension] ?? null
const recordCount = (stock: StockCard) => Array.isArray(stock.tradeRecords) ? stock.tradeRecords.length : 0
const scoreTone = (value: number | null) => value === null ? 'is-neutral' : value >= 40 ? 'is-high' : value <= 20 ? 'is-low' : 'is-neutral'

const openScore = (stock: StockCard) => {
  selectedStock.value = stock
  const current = stock.score ?? emptyStockScore()
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
  if (!selectedStock.value) return
  selectedStock.value.score = {
    quality: scoreValue('quality'),
    form: scoreValue('form'),
    qualitySelections: { ...scoreDraft.value.qualitySelections },
    formSelections: { ...scoreDraft.value.formSelections },
    updatedAt: new Date().toISOString()
  }
  scoreOpen.value = false
}

const closeScore = () => { scoreOpen.value = false; selectedStock.value = null }
const openRecords = (stock: StockCard) => { selectedStock.value = stock; recordsOpen.value = true }
const closeRecords = () => { recordsOpen.value = false; selectedStock.value = null }

const tradeRecordOpening = (stock: StockCard, record: TradeRecord) => {
  const related = (stock.tradeRecords ?? [])
    .filter((item) => item.entryId === record.entryId)
    .slice()
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate) || left.id.localeCompare(right.id))
  const opening = related[0]
  return opening?.id === record.id ? null : opening ?? null
}

const tradeRecordProfit = (stock: StockCard, record: TradeRecord) => {
  const opening = tradeRecordOpening(stock, record)
  if (!opening || opening.price <= 0 || record.price <= 0) return null
  const direction = opening.type === 'sell' ? -1 : 1
  return (record.price - opening.price) * record.lots * 100 * direction
}

type TradeGroup = { id: string; opening: TradeRecord; operations: TradeRecord[] }
const tradeGroups = (stock: StockCard): TradeGroup[] => {
  const groups = new Map<string, TradeRecord[]>()
  for (const record of stock.tradeRecords ?? []) {
    const key = record.entryId ?? `record:${record.id}`
    groups.set(key, [...(groups.get(key) ?? []), record])
  }
  return [...groups.entries()]
    .map(([id, records]) => {
      const ordered = records.slice().sort((left, right) => left.tradeDate.localeCompare(right.tradeDate) || left.id.localeCompare(right.id))
      return { id, opening: ordered[0], operations: ordered.slice(1) }
    })
    .sort((left, right) => right.opening.tradeDate.localeCompare(left.opening.tradeDate) || right.id.localeCompare(left.id))
}

const groupProfit = (stock: StockCard, group: TradeGroup) => {
  if (!group.operations.length) return null
  const values = group.operations.map((record) => tradeRecordProfit(stock, record))
  if (values.every((value) => value === null)) return null
  return values.reduce((total, value) => total + (value ?? 0), 0)
}

const totalProfit = computed(() => {
  if (!selectedStock.value) return null
  const values = tradeGroups(selectedStock.value).map((group) => groupProfit(selectedStock.value as StockCard, group)).filter((value): value is number => value !== null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
})

const profitTone = (value: number | null) => value === null || Math.abs(value) < 0.005 ? 'is-flat' : value > 0 ? 'is-profit' : 'is-loss'
const setScoreSelection = (dimension: ScoreDimension, key: string, value: string) => { scoreSelections(dimension)[key] = value }
const buyPreselected = (stock: StockCard) => {
  movePreselectedToBoard(stock.id)
  closeScore()
}
const buyFromScore = () => {
  if (!selectedStock.value) return
  saveScore()
  movePreselectedToBoard(selectedStock.value.id)
  closeScore()
}
const isPreselectedStock = (stock: StockCard | null) => Boolean(stock && preselectedStocks.value.some((item) => item.id === stock.id))
const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  session.value = { authenticated: false }
  await navigateTo('/login')
}
</script>

<template>
  <main class="archive-page page-shell">
    <section class="topbar archive-topbar">
      <div>
        <p class="archive-eyebrow">STOCK ARCHIVE</p>
        <h1>档案</h1>
      </div>
      <div class="topbar-actions">
        <span class="market-tip">{{ session?.user?.username || '' }}</span>
        <PageSwitcher />
        <button class="ghost-btn" type="button" @click="logout">退出</button>
      </div>
    </section>

    <section class="archive-section">
      <header class="archive-section-head"><div><span class="archive-section-kicker">WATCHLIST</span><h2>预选票</h2></div><div class="archive-section-head-actions"><span>{{ preselectedStocks.length }} 只</span><button class="primary-btn" type="button" @click="addPreselectedStock">+ 新增预选</button></div></header>
      <div v-if="preselectedStocks.length" class="archive-card-grid">
        <article v-for="stock in preselectedStocks" :key="stock.id" class="archive-stock-card" role="button" tabindex="0" @click="openScore(stock)" @keydown.enter="openScore(stock)">
          <input v-model="stock.name" class="archive-stock-input archive-stock-name" type="text" aria-label="预选股票名称" @click.stop />
          <input v-model="stock.code" class="archive-stock-input archive-stock-code" type="text" inputmode="numeric" maxlength="6" placeholder="股票代码" aria-label="预选股票代码" @click.stop />
          <span class="archive-stock-score"><i :class="scoreTone(displayedScore(stock, 'quality'))">质 {{ displayedScore(stock, 'quality') ?? '--' }}</i><i :class="scoreTone(displayedScore(stock, 'form'))">形 {{ displayedScore(stock, 'form') ?? '--' }}</i></span>
          <div class="archive-stock-actions" @click.stop>
            <button class="mini-btn archive-buy-btn" type="button" @click="buyPreselected(stock)">买入</button>
            <button class="icon-btn archive-delete-btn" type="button" aria-label="删除预选股票" @click="removePreselectedStock(stock.id)">删</button>
          </div>
        </article>
      </div>
      <p v-else class="archive-empty">暂无预选股票</p>
    </section>

    <section class="archive-section">
      <header class="archive-section-head"><div><span class="archive-section-kicker">CLOSED TRADES</span><h2>归档票</h2></div><span>{{ archivedStocks.length }} 只</span></header>
      <div v-if="archivedStocks.length" class="archive-card-grid">
        <button v-for="stock in archivedStocks" :key="stock.id" class="archive-stock-card archive-stock-card-closed" type="button" @click="openRecords(stock)">
          <span class="archive-stock-name">{{ stock.name || stock.code || '未命名股票' }}</span>
          <span class="archive-stock-code">{{ stock.code || '--' }}</span>
          <span class="archive-stock-score">{{ recordCount(stock) }} 条交易记录</span>
        </button>
      </div>
      <p v-else class="archive-empty">暂无归档股票</p>
    </section>
  </main>

  <div v-if="scoreOpen" class="settings-modal-overlay" @click.self="closeScore">
    <section class="settings-modal score-modal archive-score-modal" role="dialog" aria-modal="true" aria-labelledby="archive-score-title">
      <header class="settings-modal-head"><div><h2 id="archive-score-title">股票评分</h2><p>{{ selectedStock?.name || selectedStock?.code || '当前股票' }}</p></div><button class="ghost-btn" type="button" @click="closeScore">关闭</button></header>
      <div v-for="dimension in scoreDimensions" :key="dimension" class="score-dimension">
        <div class="score-dimension-head"><h3>{{ stockScoreRules[dimension].label }}</h3><strong :class="scoreTone(scoreValue(dimension))">{{ scoreValue(dimension) ?? '--' }}<small> 分</small></strong></div>
        <label v-for="criterion in stockScoreRules[dimension].criteria" :key="criterion.key" class="score-field">
          <span>{{ criterion.label }}</span>
          <select v-if="criterion.options" class="settings-input" :value="scoreSelections(dimension)[criterion.key] ?? ''" @change="setScoreSelection(dimension, criterion.key, (($event.target as HTMLSelectElement).value))">
            <option value="">请选择</option><option v-for="option in criterion.options" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <input v-else class="settings-input" type="number" :min="criterion.input?.min" :max="criterion.input?.max" :placeholder="criterion.input?.placeholder" :value="scoreSelections(dimension)[criterion.key] ?? ''" @input="setScoreSelection(dimension, criterion.key, (($event.target as HTMLInputElement).value))" />
        </label>
      </div>
      <div class="settings-modal-actions"><button class="ghost-btn" type="button" @click="closeScore">取消</button><button v-if="isPreselectedStock(selectedStock)" class="ghost-btn" type="button" @click="buyFromScore">买入看板</button><button class="primary-btn" type="button" @click="saveScore">保存评分</button></div>
    </section>
  </div>

  <div v-if="recordsOpen" class="settings-modal-overlay" @click.self="closeRecords">
    <section class="settings-modal trade-records-modal" role="dialog" aria-modal="true" aria-labelledby="archive-records-title">
      <header class="settings-modal-head"><div><h2 id="archive-records-title">交易记录</h2><p>{{ selectedStock?.name || selectedStock?.code || '当前股票' }}</p></div><button class="ghost-btn" type="button" @click="closeRecords">关闭</button></header>
      <div class="table-wrap trade-records-table-wrap">
        <table class="trade-records-table trade-records-grouped-table">
          <thead><tr><th>日期</th><th>开仓</th><th>后续操作</th><th>累计盈亏</th></tr></thead>
          <tbody>
            <tr v-if="!selectedStock || !tradeGroups(selectedStock).length"><td colspan="4">暂无交易记录</td></tr>
            <tr v-for="group in selectedStock ? tradeGroups(selectedStock) : []" :key="group.id">
              <td>{{ group.opening.tradeDate }}</td>
              <td><span class="trade-record-type" :class="group.opening.type === 'buy' ? 'is-buy' : 'is-sell'">{{ group.opening.type === 'buy' ? '买入' : '卖出' }}</span><span class="trade-record-detail">{{ formatPrice(group.opening.price) }} × {{ group.opening.lots }}手</span></td>
              <td><div v-if="group.operations.length" class="trade-record-operations"><span v-for="operation in group.operations" :key="operation.id" class="trade-record-operation"><span class="trade-record-type" :class="operation.type === 'buy' ? 'is-buy' : 'is-sell'">{{ operation.type === 'buy' ? '买入' : '卖出' }}</span><span class="trade-record-detail">{{ formatPrice(operation.price) }} × {{ operation.lots }}手</span><strong :class="['trade-record-profit', profitTone(tradeRecordProfit(selectedStock as StockCard, operation))]">{{ formatAmount(tradeRecordProfit(selectedStock as StockCard, operation)) }}</strong></span></div><span v-else class="trade-record-empty">--</span></td>
              <td :class="['trade-record-profit', profitTone(groupProfit(selectedStock as StockCard, group))]">{{ formatAmount(groupProfit(selectedStock as StockCard, group)) }}</td>
            </tr>
          </tbody>
          <tfoot><tr><th colspan="3">总盈亏</th><th :class="['trade-record-profit', profitTone(totalProfit)]">{{ formatAmount(totalProfit) }}</th></tr></tfoot>
        </table>
      </div>
    </section>
  </div>
</template>
