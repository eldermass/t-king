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
  addStock,
  reorderStocks
} = stockBoard

const draggedStockId = ref<string | null>(null)
const pressedStockId = ref<string | null>(null)
const dropTargetStockId = ref<string | null>(null)
const dragOffset = ref({ x: 0, y: 0 })
const dragCardRect = ref({ left: 0, top: 0, width: 0, height: 0 })

let activePointerId: number | null = null
let dragStartX = 0
let dragStartY = 0

const cloudStatusText = computed(() => {
  if (boardLoading.value) {
    return '加载中'
  }

  if (saveStatus.value === 'saving') {
    return '保存中'
  }

  if (saveStatus.value === 'saved') {
    return '已同步'
  }

  if (quoteLoading.value) {
    return '行情刷新中'
  }

  return '云端已连接'
})

const resetDragState = () => {
  activePointerId = null
  dragStartX = 0
  dragStartY = 0
  dragOffset.value = { x: 0, y: 0 }
  dragCardRect.value = { left: 0, top: 0, width: 0, height: 0 }
  draggedStockId.value = null
  pressedStockId.value = null
  dropTargetStockId.value = null
  document.body.classList.remove('is-dragging-stock')
}

const handleDragHandlePointerDown = (event: PointerEvent, stockId: string) => {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) {
    return
  }

  resetDragState()
  event.preventDefault()
  const cardElement = event.currentTarget.closest<HTMLElement>('[data-stock-id]')

  if (!cardElement) {
    return
  }

  const rect = cardElement.getBoundingClientRect()
  activePointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragCardRect.value = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }
  event.currentTarget.setPointerCapture(event.pointerId)
  draggedStockId.value = stockId
  pressedStockId.value = stockId
  dropTargetStockId.value = null
  document.body.classList.add('is-dragging-stock')
}

const handleGlobalPointerMove = (event: PointerEvent) => {
  if (activePointerId !== event.pointerId || !draggedStockId.value) {
    return
  }

  event.preventDefault()
  dragOffset.value = {
    x: event.clientX - dragStartX,
    y: event.clientY - dragStartY
  }

  const target = document.elementFromPoint(event.clientX, event.clientY)

  if (!(target instanceof Element)) {
    return
  }

  const targetCard = target.closest<HTMLElement>('[data-stock-id]')
  const targetId = targetCard?.dataset.stockId

  if (!targetId || targetId === draggedStockId.value) {
    dropTargetStockId.value = null
    return
  }

  dropTargetStockId.value = targetId
}

const handleGlobalPointerUp = (event: PointerEvent) => {
  if (activePointerId !== event.pointerId) {
    return
  }

  if (draggedStockId.value && dropTargetStockId.value) {
    reorderStocks(draggedStockId.value, dropTargetStockId.value)
  }

  resetDragState()
}

const cardStyle = (stockId: string) => {
  if (draggedStockId.value !== stockId) {
    return undefined
  }

  return {
    position: 'fixed',
    left: `${dragCardRect.value.left + dragOffset.value.x}px`,
    top: `${dragCardRect.value.top + dragOffset.value.y}px`,
    width: `${dragCardRect.value.width}px`,
    height: `${dragCardRect.value.height}px`,
    transform: 'scale(1.03)',
    zIndex: '30',
    boxSizing: 'border-box'
  }
}

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  session.value = { authenticated: false }
  await navigateTo('/login')
}

onMounted(() => {
  window.addEventListener('pointermove', handleGlobalPointerMove, { passive: false })
  window.addEventListener('pointerup', handleGlobalPointerUp)
  window.addEventListener('pointercancel', handleGlobalPointerUp)
})

onBeforeUnmount(() => {
  resetDragState()
  window.removeEventListener('pointermove', handleGlobalPointerMove)
  window.removeEventListener('pointerup', handleGlobalPointerUp)
  window.removeEventListener('pointercancel', handleGlobalPointerUp)
})
</script>

<template>
  <main class="page-shell">
    <section class="topbar">
      <h1>T王做T助手</h1>

      <div class="topbar-actions">
        <span class="market-tip">{{ session?.user?.username }}</span>
        <span class="market-tip" :class="{ 'is-busy': boardLoading || saveStatus === 'saving' }">
          {{ cloudStatusText }}
        </span>
        <NuxtLink class="ghost-link" to="/market/sentiment">情绪</NuxtLink>
        <NuxtLink class="ghost-link" to="/h5">H5</NuxtLink>
        <NuxtLink class="ghost-link" to="/ruler">刻度</NuxtLink>
        <PushDeerSettingsButton />
        <button class="primary-btn" type="button" @click="addStock">
          新增股票
        </button>
        <button class="ghost-btn" type="button" @click="logout">
          退出
        </button>
      </div>
    </section>

    <TransitionGroup name="card-move" tag="section" class="stock-grid">
      <StockCardPanel
        v-for="stock in stocks"
        :key="stock.id"
        :stock="stock"
        :is-dragging="draggedStockId === stock.id"
        :is-pressed="pressedStockId === stock.id"
        :is-drop-target="dropTargetStockId === stock.id"
        :custom-style="cardStyle(stock.id)"
        @drag-pointer-down="handleDragHandlePointerDown"
      />
    </TransitionGroup>
  </main>
</template>