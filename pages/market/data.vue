<script setup lang="ts">
type MarketRow = {
  tradeDate: string; shIndexChange: number; chinextIndexChange: number; sci50IndexChange: number
  volume: number | null; volumeChange: number | null; advancers: number | null; decliners: number | null
  limitUpCount: number | null; limitDownCount: number | null; sentimentScore: number | null; updatedAt: string
}

const rows = ref<MarketRow[]>([])
const loading = ref(true)
const refreshingDate = ref('')
const error = ref('')
const formatPercent = (value: number | null) => value === null ? '--' : `${(value * 100).toFixed(2)}%`
const formatVolume = (value: number | null) => value === null ? '--' : `${(value / 10000).toFixed(0)} 亿`
const formatVolumeChange = (value: number | null) => {
  if (value === null) return '--'
  const rounded = Number((value / 10000).toFixed(0))
  return `${rounded > 0 ? '+' : ''}${rounded} 亿`
}
const formatNumber = (value: number | null) => value === null ? '--' : value.toLocaleString('zh-CN')
const changeClass = (value: number | null) => value === null ? '' : value >= 0 ? 'is-rise' : 'is-fall'
const thresholdClass = (value: number | null, high: number, low: number, highClass: string, lowClass: string) => value === null ? '' : value > high ? highClass : value < low ? lowClass : ''
const advancersClass = (value: number | null) => thresholdClass(value, 4000, 1000, 'is-rise', 'is-fall')
const declinersClass = (value: number | null) => thresholdClass(value, 4000, 1000, 'is-fall', 'is-rise')
const limitUpClass = (value: number | null) => thresholdClass(value, 100, 30, 'is-rise', 'is-fall')
const limitDownClass = (value: number | null) => thresholdClass(value, 20, 10, 'is-fall', 'is-rise')
const scoreClass = (value: number | null) => value === null ? 'score-unknown' : value < 20 ? 'score-cold' : value < 40 ? 'score-weak' : value < 55 ? 'score-repair' : value < 70 ? 'score-neutral' : value < 85 ? 'score-strong' : 'score-hot'
const scoreLabel = (value: number | null) => value === null ? '暂无' : value < 20 ? '冰点' : value < 40 ? '弱势' : value < 55 ? '修复' : value < 70 ? '中性' : value < 85 ? '强势' : '高潮'
const pageSize = 15
const currentPage = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize)))
const visibleRows = computed(() => rows.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
const setPage = (page: number) => { currentPage.value = Math.min(pageCount.value, Math.max(1, page)) }
const shanghaiDate = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
const formatUpdatedAt = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--:--' : date.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false })
}
const canRefresh = (row: MarketRow) => {
  const date = new Date(row.updatedAt)
  if (Number.isNaN(date.getTime()) || shanghaiDate(date) !== row.tradeDate) return false
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  return Number.isFinite(hour) && Number.isFinite(minute) && hour * 60 + minute < 15 * 60
}

const load = async () => {
  loading.value = true
  try { rows.value = await $fetch<MarketRow[]>('/api/market/data?days=60'); currentPage.value = 1; error.value = '' }
  catch { error.value = '市场数据读取失败' }
  finally { loading.value = false }
}
const refreshRow = async (row: MarketRow) => {
  if (refreshingDate.value) return
  refreshingDate.value = row.tradeDate
  error.value = ''
  try {
    const refreshed = await $fetch<MarketRow>('/api/market/data/refresh', { method: 'POST', body: { tradeDate: row.tradeDate } })
    rows.value = rows.value.map((item) => item.tradeDate === row.tradeDate ? refreshed : item)
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.statusMessage || (cause instanceof Error ? cause.message : '市场数据更新失败')
  } finally {
    refreshingDate.value = ''
  }
}
onMounted(load)
</script>

<template>
  <main class="page-shell market-data-page">
    <section class="topbar market-data-topbar"><div><p class="sentiment-eyebrow">MARKET DATA</p><h1>市场数据</h1></div><div class="topbar-actions"><NuxtLink class="ghost-link" to="/market/sentiment">情绪</NuxtLink><NuxtLink class="ghost-link" to="/market/limit">涨跌停</NuxtLink><NuxtLink class="ghost-link" to="/">看板</NuxtLink><button class="ghost-btn" type="button" @click="$fetch('/api/auth/logout', { method: 'POST' }).then(() => navigateTo('/login'))">退出</button></div></section>
    <p v-if="error" class="sentiment-alert">{{ error }}</p>
    <section class="market-data-panel">
      <div v-if="loading" class="market-data-empty">正在读取市场数据...</div>
      <div v-else-if="!rows.length" class="market-data-empty">暂无数据库记录，请先打开情绪页面读取行情。</div>
      <div v-else class="market-data-table-wrap"><table class="market-data-table"><thead><tr><th>日期</th><th>更新时间</th><th>上证指数涨跌幅</th><th>创业板指数涨跌幅</th><th>科创50涨跌幅</th><th>成交量</th><th>成交量变化</th><th>上涨家数</th><th>下跌家数</th><th>涨停数</th><th>跌停数</th><th>情绪评分</th></tr></thead><tbody><tr v-for="row in visibleRows" :key="row.tradeDate"><td>{{ row.tradeDate }}</td><td><span>{{ formatUpdatedAt(row.updatedAt) }}</span><button v-if="canRefresh(row)" class="market-data-update" type="button" :disabled="Boolean(refreshingDate)" :aria-label="`更新 ${row.tradeDate} 市场数据`" @click="refreshRow(row)"><span aria-hidden="true">↻</span>{{ refreshingDate === row.tradeDate ? '更新中' : '更新' }}</button></td><td :class="changeClass(row.shIndexChange)">{{ formatPercent(row.shIndexChange) }}</td><td :class="changeClass(row.chinextIndexChange)">{{ formatPercent(row.chinextIndexChange) }}</td><td :class="changeClass(row.sci50IndexChange)">{{ formatPercent(row.sci50IndexChange) }}</td><td>{{ formatVolume(row.volume) }}</td><td :class="changeClass(row.volumeChange)">{{ formatVolumeChange(row.volumeChange) }}</td><td :class="advancersClass(row.advancers)">{{ formatNumber(row.advancers) }}</td><td :class="declinersClass(row.decliners)">{{ formatNumber(row.decliners) }}</td><td :class="limitUpClass(row.limitUpCount)">{{ formatNumber(row.limitUpCount) }}</td><td :class="limitDownClass(row.limitDownCount)">{{ formatNumber(row.limitDownCount) }}</td><td><strong class="score-chip" :class="scoreClass(row.sentimentScore)" :title="scoreLabel(row.sentimentScore)">{{ row.sentimentScore === null ? '--' : row.sentimentScore.toFixed(0) }}</strong></td></tr></tbody></table></div>
      <div v-if="!loading && rows.length" class="market-data-pagination"><button type="button" :disabled="currentPage === 1" @click="setPage(currentPage - 1)">上一页</button><span>第 {{ currentPage }} / {{ pageCount }} 页，共 {{ rows.length }} 条</span><button type="button" :disabled="currentPage === pageCount" @click="setPage(currentPage + 1)">下一页</button></div>
    </section>
  </main>
</template>
