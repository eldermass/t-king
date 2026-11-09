<script setup lang="ts">
import { stockBoardKey, type StockCard, type TradeRecord } from '~/composables/useStockBoard'
import { emptyStockScore, scoreForSelections, stockScoreRules, type ScoreDimension, type StockScore } from '~/shared/stock-score'
import { tradeGroupFee } from '~/shared/trade-fee'
import { normalizeCode } from '~/shared/reminder-core'
import type { PreselectedSummary } from '~/shared/preselected-summary'

const stockBoard = useStockBoard()
const session = useState<{ authenticated: boolean; user?: { id: string; username: string } } | null>('auth-session', () => null)
provide(stockBoardKey, stockBoard)

const {
  preselectedStocks,
  archivedStocks,
  addPreselectedStock,
  removePreselectedStock,
  removeArchivedStock,
  movePreselectedToBoard,
  formatPrice,
  formatAmount,
  formatPercent,
  quoteFor,
  quoteTone
} = stockBoard
const scoreOpen = ref(false)
const recordsOpen = ref(false)
const listOpen = ref(false)
const listRefreshing = ref(false)
const listError = ref('')
const listMessage = ref('')
type ListSortKey = 'name' | 'changePercent' | 'form' | 'quality' | 'averageRiseRank' | 'averageFallRank' | 'marketDifferenceSum'
const listSortColumns: { key: ListSortKey; label: string }[] = [
  { key: 'name', label: '票名' },
  { key: 'changePercent', label: '今日涨跌幅' },
  { key: 'form', label: '形态分' },
  { key: 'quality', label: '质量分' },
  { key: 'averageRiseRank', label: '平均涨时次序' },
  { key: 'averageFallRank', label: '平均跌时次序' },
  { key: 'marketDifferenceSum', label: '与所属大盘涨跌差' }
]
const listSortKey = ref<ListSortKey>('averageRiseRank')
const listSortDirection = ref<'asc' | 'desc'>('asc')
const openList = () => { listSortKey.value = 'averageRiseRank'; listSortDirection.value = 'asc'; listOpen.value = true }
const sortListBy = (key: ListSortKey) => {
  if (listSortKey.value === key) listSortDirection.value = listSortDirection.value === 'asc' ? 'desc' : 'asc'
  else { listSortKey.value = key; listSortDirection.value = 'asc' }
}
const selectedStock = ref<StockCard | null>(null)
const scoreDraft = ref<StockScore>(emptyStockScore())
const scoreDimensions: ScoreDimension[] = ['quality', 'form']

const scoreSelections = (dimension: ScoreDimension) => scoreDraft.value[`${dimension}Selections`]
const scoreValue = (dimension: ScoreDimension) => scoreForSelections(dimension, scoreSelections(dimension))
const displayedScore = (stock: StockCard, dimension: ScoreDimension) => stock.score?.[dimension] ?? null
const recordCount = (stock: StockCard) => Array.isArray(stock.tradeRecords) ? stock.tradeRecords.length : 0
const scoreTone = (value: number | null) => value === null ? 'is-neutral' : value >= 40 ? 'is-high' : value <= 20 ? 'is-low' : 'is-neutral'
const summaryFor = (stock: StockCard) => stock.preselectedSummary?.code === normalizeCode(stock.code) ? stock.preselectedSummary : null
const formatRank = (value: number | null | undefined) => value === null || value === undefined ? '--' : String(Math.round(value))
const formatDifferenceSum = (value: number | null | undefined) => value === null || value === undefined ? '--' : `${value > 0 ? '+' : ''}${value.toFixed(2)} %`
const differenceTone = (stock: StockCard) => {
  const value = summaryFor(stock)?.marketDifferenceSum
  return value === null || value === undefined ? '' : value > 0 ? 'is-up' : value < 0 ? 'is-down' : ''
}
const listSortValue = (stock: StockCard, key: ListSortKey): string | number | null => {
  if (key === 'name') return stock.name || normalizeCode(stock.code) || '未命名股票'
  if (key === 'changePercent') return quoteFor(stock.code).changePercent
  if (key === 'form' || key === 'quality') return displayedScore(stock, key)
  const value = summaryFor(stock)?.[key] ?? null
  return value === null ? null : key === 'marketDifferenceSum' ? value : Math.round(value)
}
const sortedPreselectedStocks = computed(() => preselectedStocks.value.map((stock, index) => ({ stock, index })).sort((left, right) => {
  const leftValue = listSortValue(left.stock, listSortKey.value)
  const rightValue = listSortValue(right.stock, listSortKey.value)
  if (leftValue === null) return rightValue === null ? left.index - right.index : 1
  if (rightValue === null) return -1
  const comparison = typeof leftValue === 'string' && typeof rightValue === 'string'
    ? leftValue.localeCompare(rightValue, 'zh-CN')
    : Number(leftValue) - Number(rightValue)
  return comparison ? (listSortDirection.value === 'asc' ? comparison : -comparison) : left.index - right.index
}).map(({ stock }) => stock))
const refreshList = async () => {
  if (listRefreshing.value) return
  const codes = [...new Set(preselectedStocks.value.map((stock) => normalizeCode(stock.code)).filter((code) => /^\d{6}$/.test(code)))]
  if (!codes.length) { listMessage.value = '请先填写有效的 6 位股票代码'; return }
  listRefreshing.value = true
  listError.value = ''
  listMessage.value = ''
  try {
    const result = await $fetch<{ summaries: PreselectedSummary[] }>('/api/market/preselected-summary', { method: 'POST', body: { codes } })
    const summaries = new Map(result.summaries.map((summary) => [summary.code, summary]))
    for (const stock of preselectedStocks.value) {
      const summary = summaries.get(normalizeCode(stock.code))
      if (summary) stock.preselectedSummary = summary
    }
    await nextTick()
    if (!await stockBoard.saveBoardNow()) throw new Error('预选票数据已计算，但保存失败，请重试更新')
    listMessage.value = `已更新并保存 ${summaries.size} 只预选票的近 20 日数据`
  } catch (cause: any) {
    listError.value = cause?.data?.statusMessage || cause?.statusMessage || cause?.message || '预选票数据更新失败'
  } finally { listRefreshing.value = false }
}

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

const groupFee = (group: TradeGroup) => tradeGroupFee([group.opening, ...group.operations])
const totalProfit = (stock: StockCard) => {
  const values = tradeGroups(stock).map((group) => groupProfit(stock, group)).filter((value): value is number => value !== null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}
const totalFee = (stock: StockCard) => {
  const values = tradeGroups(stock).map(groupFee).filter((value): value is number => value !== null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}
const netProfit = (stock: StockCard) => {
  const profit = totalProfit(stock)
  return profit === null ? null : profit - (totalFee(stock) ?? 0)
}
const formatMoney = (value: number | null) => value === null ? '--' : value.toFixed(2)

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
      <header class="archive-section-head"><div><span class="archive-section-kicker">WATCHLIST</span><h2>预选票</h2></div><div class="archive-section-head-actions"><span>{{ preselectedStocks.length }} 只</span><button class="ghost-btn" type="button" @click="openList">列表</button><button class="primary-btn" type="button" @click="addPreselectedStock">+ 新增预选</button></div></header>
      <div v-if="preselectedStocks.length" class="archive-card-grid">
        <article v-for="stock in preselectedStocks" :key="stock.id" class="archive-stock-card" role="button" tabindex="0" @click="openScore(stock)" @keydown.enter="openScore(stock)">
          <div class="archive-stock-name-row">
            <span class="archive-stock-name">{{ stock.name || (stock.code ? '查询中' : '未命名股票') }}</span>
            <small v-if="quoteFor(stock.code).changePercent !== null" class="archive-stock-change" :class="quoteTone(stock.code)">{{ formatPercent(quoteFor(stock.code).changePercent) }}</small>
          </div>
          <input v-model="stock.code" class="archive-stock-input archive-stock-code" type="text" inputmode="numeric" maxlength="6" placeholder="股票代码" aria-label="预选股票代码" @input="stock.name = ''" @click.stop />
          <span class="archive-stock-score"><i :class="scoreTone(displayedScore(stock, 'quality'))">质 {{ displayedScore(stock, 'quality') ?? '--' }}</i><i :class="scoreTone(displayedScore(stock, 'form'))">形 {{ displayedScore(stock, 'form') ?? '--' }}</i></span>
          <div class="archive-stock-actions" @click.stop>
            <button class="mini-btn archive-buy-btn" type="button" @click="buyPreselected(stock)">买入</button>
            <StockRankButton :stock-code="stock.code" :stock-name="stock.name" variant="archive" />
            <button class="icon-btn archive-delete-btn" type="button" aria-label="删除预选股票" @click="removePreselectedStock(stock.id)">删</button>
          </div>
        </article>
      </div>
      <p v-else class="archive-empty">暂无预选股票</p>
    </section>

    <section class="archive-section">
      <header class="archive-section-head"><div><span class="archive-section-kicker">CLOSED TRADES</span><h2>归档票</h2></div><span>{{ archivedStocks.length }} 只</span></header>
      <div v-if="archivedStocks.length" class="archive-card-grid">
        <article v-for="stock in archivedStocks" :key="stock.id" class="archive-stock-card archive-stock-card-closed" role="button" tabindex="0" @click="openRecords(stock)" @keydown.enter="openRecords(stock)">
          <span class="archive-stock-name">{{ stock.name || stock.code || '未命名股票' }}</span>
          <span class="archive-stock-code">{{ stock.code || '--' }}</span>
          <span class="archive-stock-score">{{ recordCount(stock) }} 条交易记录</span>
          <span class="archive-stock-net-profit" :class="profitTone(netProfit(stock))">净盈亏 {{ formatMoney(netProfit(stock)) }}</span>
          <div class="archive-stock-actions" @click.stop>
            <button class="icon-btn archive-delete-btn" type="button" aria-label="删除归档股票" @click="removeArchivedStock(stock.id)">删</button>
          </div>
        </article>
      </div>
      <p v-else class="archive-empty">暂无归档股票</p>
    </section>
  </main>

  <div v-if="listOpen" class="settings-modal-overlay" @click.self="listOpen = false">
    <section class="settings-modal archive-list-modal" role="dialog" aria-modal="true" aria-labelledby="archive-list-title" @keydown.esc="listOpen = false">
      <header class="settings-modal-head archive-list-head"><div class="archive-list-head-main"><button class="ghost-btn" type="button" :disabled="listRefreshing" @click="refreshList">{{ listRefreshing ? '更新中...' : '更新' }}</button><div><h2 id="archive-list-title">预选票列表</h2><p>次序及大盘差值取最近 20 个已记录交易日；上涨日和下跌日均按正向次序计算。</p></div></div><button class="ghost-btn" type="button" @click="listOpen = false">关闭</button></header>
      <p v-if="listError" class="archive-list-status is-error" role="alert">{{ listError }}</p><p v-else-if="listMessage" class="archive-list-status" role="status">{{ listMessage }}</p>
      <div class="archive-list-table-wrap"><table class="archive-list-table"><thead><tr><th v-for="column in listSortColumns" :key="column.key" :aria-sort="listSortKey === column.key ? (listSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"><button class="archive-list-sort-button" type="button" :aria-label="`按${column.label}${listSortKey === column.key && listSortDirection === 'asc' ? '降序' : '升序'}排序`" @click="sortListBy(column.key)">{{ column.label }}<span class="archive-list-sort-indicator" aria-hidden="true">{{ listSortKey === column.key ? (listSortDirection === 'asc' ? '▲' : '▼') : '↕' }}</span></button></th><th>K线图</th></tr></thead><tbody><tr v-if="!preselectedStocks.length"><td colspan="8">暂无预选票</td></tr><tr v-for="stock in sortedPreselectedStocks" :key="stock.id"><td><strong>{{ stock.name || stock.code || '未命名股票' }}</strong><small>{{ normalizeCode(stock.code) || '--' }}</small></td><td :class="quoteTone(stock.code)">{{ formatPercent(quoteFor(stock.code).changePercent) }}</td><td>{{ displayedScore(stock, 'form') ?? '--' }}</td><td>{{ displayedScore(stock, 'quality') ?? '--' }}</td><td>{{ formatRank(summaryFor(stock)?.averageRiseRank) }}</td><td>{{ formatRank(summaryFor(stock)?.averageFallRank) }}</td><td :class="differenceTone(stock)">{{ formatDifferenceSum(summaryFor(stock)?.marketDifferenceSum) }}</td><td><StockKlineButton :stock-code="stock.code" :stock-name="stock.name" /></td></tr></tbody></table></div>
    </section>
  </div>

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
          <thead><tr><th>日期</th><th>开仓</th><th>后续操作</th><th>累计盈亏</th><th>交易费用</th></tr></thead>
          <tbody>
            <tr v-if="!selectedStock || !tradeGroups(selectedStock).length"><td colspan="5">暂无交易记录</td></tr>
            <tr v-for="group in selectedStock ? tradeGroups(selectedStock) : []" :key="group.id">
              <td>{{ group.opening.tradeDate }}</td>
              <td><span class="trade-record-type" :class="group.opening.type === 'buy' ? 'is-buy' : 'is-sell'">{{ group.opening.type === 'buy' ? '买入' : '卖出' }}</span><span class="trade-record-detail">{{ formatPrice(group.opening.price) }} × {{ group.opening.lots }}手</span></td>
              <td><div v-if="group.operations.length" class="trade-record-operations"><span v-for="operation in group.operations" :key="operation.id" class="trade-record-operation"><span class="trade-record-type" :class="operation.type === 'buy' ? 'is-buy' : 'is-sell'">{{ operation.type === 'buy' ? '买入' : '卖出' }}</span><span class="trade-record-detail">{{ formatPrice(operation.price) }} × {{ operation.lots }}手</span><strong :class="['trade-record-profit', profitTone(tradeRecordProfit(selectedStock as StockCard, operation))]">{{ formatAmount(tradeRecordProfit(selectedStock as StockCard, operation)) }}</strong></span></div><span v-else class="trade-record-empty">--</span></td>
              <td :class="['trade-record-profit', profitTone(groupProfit(selectedStock as StockCard, group))]">{{ formatAmount(groupProfit(selectedStock as StockCard, group)) }}</td>
              <td>{{ formatMoney(groupFee(group)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer v-if="selectedStock" class="trade-records-summary" aria-label="交易记录汇总">
        <span>总盈亏 <strong :class="['trade-record-profit', profitTone(totalProfit(selectedStock))]">{{ formatMoney(totalProfit(selectedStock)) }}</strong></span>
        <span>总交易费用 <strong>{{ formatMoney(totalFee(selectedStock)) }}</strong></span>
        <span>净盈亏 <strong :class="['trade-record-profit', profitTone(netProfit(selectedStock))]">{{ formatMoney(netProfit(selectedStock)) }}</strong></span>
      </footer>
    </section>
  </div>
</template>
