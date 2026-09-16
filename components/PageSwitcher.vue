<script setup lang="ts">
const route = useRoute()

const pages = [
  { to: '/', label: '看板' },
  { to: '/market/sentiment', label: '情绪' },
  { to: '/market/limit', label: '涨跌停' },
  { to: '/market/data', label: '市场数据' },
  { to: '/h5', label: 'H5' },
  { to: '/ruler', label: '刻度' }
]
</script>

<template>
  <nav class="page-switcher" aria-label="页面切换">
    <NuxtLink
      v-for="page in pages"
      :key="page.to"
      :to="page.to"
      class="page-switcher-link"
      :class="{ 'is-active': route.path === page.to }"
      :aria-current="route.path === page.to ? 'page' : undefined"
    >
      {{ page.label }}
    </NuxtLink>
  </nav>
</template>
