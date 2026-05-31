<script setup lang="ts">
import { stockBoardKey } from '~/composables/useStockBoard'

const stockBoard = useStockBoard()
const session = useState<{ authenticated: boolean; user?: { id: string; username: string } } | null>('auth-session', () => null)

provide(stockBoardKey, stockBoard)

const {
  stocks,
  quoteLoading,
  boardLoading,
  saveStatus,
  quoteFor,
  quoteTone,
  formatPrice,
  formatPercent,
  addStock,
  moveStockByOffset
} = stockBoard

const route = useRoute()
const router = useRouter()
const sliderRef = ref<HTMLElement | null>(null)
const currentIndex = ref(0)
let syncingFromScroll = false

const totalCount = computed(() => stocks.value.length)

const cloudStatusText = computed(() => {
  if (boardLoading.value) {
    return '加载中'
  }

  if (saveStatus.value === 'saving') {
    return '保存中'
  }

  if (saveStatus.value === 'saved') {
    return '已保存'
  }

  if (quoteLoading.value) {
    return '行情刷新中'
  }

  return '已连接云端'
})

const stockShortName = (name: string, code: string) => {
  const trimmedName = name.trim()

  if (trimmedName) {
    return trimmedName
  }

  return code.trim() || '--'
}

const stockQuoteText = (code: string) => {
  const quote = quoteFor(code)

  if (quote.price === null) {
    return '暂无行情'
  }

  return `${formatPrice(quote.price)} ${formatPercent(quote.changePercent)}`
}

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  session.value = { authenticated: false }
  await navigateTo('/login')
}

const clampIndex = (value: number) => {
  if (!totalCount.value) {
    return 0
  }

  return Math.min(Math.max(value, 0), totalCount.value - 1)
}

const syncRoute = async (index: number, replace = true) => {
  const page = String(index + 1)

  if (route.query.page === page) {
    return
  }

  await router[replace ? 'replace' : 'push']({
    path: '/h5',
    query: { ...route.query, page }
  })
}

const scrollToIndex = (index: number, behavior: ScrollBehavior = 'smooth') => {
  const slider = sliderRef.value

  if (!slider) {
    return
  }

  syncingFromScroll = true
  slider.scrollTo({
    left: slider.clientWidth * index,
    behavior
  })
  window.setTimeout(() => {
    syncingFromScroll = false
  }, behavior === 'smooth' ? 360 : 0)
}

const updateIndexFromRoute = async (replace = true) => {
  const pageValue = Number(route.query.page ?? 1)
  const nextIndex = clampIndex(Number.isFinite(pageValue) && pageValue > 0 ? pageValue - 1 : 0)
  currentIndex.value = nextIndex
  await syncRoute(nextIndex, replace)
  nextTick(() => scrollToIndex(nextIndex, 'auto'))
}

const goToIndex = async (index: number) => {
  const nextIndex = clampIndex(index)

  if (nextIndex === currentIndex.value) {
    scrollToIndex(nextIndex)
    return
  }

  currentIndex.value = nextIndex
  await syncRoute(nextIndex)
  scrollToIndex(nextIndex)
}

const handleScroll = () => {
  const slider = sliderRef.value

  if (!slider || syncingFromScroll) {
    return
  }

  const nextIndex = clampIndex(Math.round(slider.scrollLeft / Math.max(slider.clientWidth, 1)))

  if (nextIndex === currentIndex.value) {
    return
  }

  currentIndex.value = nextIndex
  syncRoute(nextIndex)
}

const handleAddStock = async () => {
  addStock()
  await nextTick()
  goToIndex(0)
}

watch(
  () => route.query.page,
  () => {
    updateIndexFromRoute(false)
  }
)

watch(
  () => stocks.value.length,
  async () => {
    const nextIndex = clampIndex(currentIndex.value)

    if (nextIndex !== currentIndex.value) {
      currentIndex.value = nextIndex
      await syncRoute(nextIndex)
    }

    nextTick(() => scrollToIndex(currentIndex.value, 'auto'))
  }
)

onMounted(() => {
  updateIndexFromRoute()
})
</script>

<template>
  <main class="h5-shell">
    <section class="h5-toolbar">
      <div class="h5-toolbar-row">
        <div class="h5-toolbar-side h5-toolbar-side-left">
          <strong class="h5-page-indicator">{{ currentIndex + 1 }} / {{ totalCount }}</strong>
          <span class="market-tip">{{ session?.user?.username || '' }}</span>
        </div>

        <span class="market-tip h5-toolbar-center" :class="{ 'is-busy': boardLoading || saveStatus === 'saving' || quoteLoading }">
          {{ cloudStatusText }}
        </span>

        <div class="h5-toolbar-side h5-toolbar-actions">
          <button class="primary-btn" type="button" @click="handleAddStock">新增</button>
          <button class="ghost-btn" type="button" @click="logout">退出</button>
        </div>
      </div>
    </section>

    <section class="h5-ticker-row" aria-label="股票行情导航">
      <button
        v-for="(stock, index) in stocks"
        :key="stock.id"
        class="h5-ticker-chip"
        :class="[quoteTone(stock.code), { 'is-active': index === currentIndex }]"
        type="button"
        @click="goToIndex(index)"
      >
        <strong>{{ stockShortName(stock.name, stock.code) }}</strong>
        <span>{{ stockQuoteText(stock.code) }}</span>
      </button>
    </section>

    <section ref="sliderRef" class="h5-slider" @scroll.passive="handleScroll">
      <div v-for="(stock, index) in stocks" :key="stock.id" class="h5-slide">
        <StockCardPanel
          :stock="stock"
          mode="h5"
          :can-move-prev="index > 0"
          :can-move-next="index < stocks.length - 1"
          @move-prev="moveStockByOffset($event, -1)"
          @move-next="moveStockByOffset($event, 1)"
        />
      </div>
    </section>
  </main>
</template>
