<script setup lang="ts">
withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false
})

const { notificationSettings } = useStockBoard()

const open = ref(false)
const draftKey = ref('')
const draftNoticeText = ref('')

const hasKey = computed(() => notificationSettings.value.pushDeerKey.trim().length > 0)
const statusText = computed(() => hasKey.value ? '已配置' : '未配置')

const openDialog = () => {
  draftKey.value = notificationSettings.value.pushDeerKey
  draftNoticeText.value = notificationSettings.value.noticeText
  open.value = true
}

const closeDialog = () => {
  open.value = false
}

const saveSettings = () => {
  notificationSettings.value.pushDeerKey = draftKey.value.trim()
  notificationSettings.value.noticeText = draftNoticeText.value.trim()
  open.value = false
}

const clearSettings = () => {
  draftKey.value = ''
  draftNoticeText.value = ''
}

watch(open, (value) => {
  if (!value) {
    draftKey.value = ''
    draftNoticeText.value = ''
  }
})
</script>

<template>
  <div class="settings-entry">
    <button
      class="ghost-btn settings-trigger"
      :class="{ 'settings-trigger-compact': compact, 'is-configured': hasKey }"
      type="button"
      @click="openDialog"
    >
      {{ compact ? '提醒' : `提醒配置 ${statusText}` }}
    </button>

    <Teleport to="body">
      <div v-if="open" class="settings-modal-overlay" @click.self="closeDialog">
        <section class="settings-modal" :class="{ 'settings-modal-compact': compact }">
          <header class="settings-modal-head">
            <div>
              <h2>提醒配置</h2>
              <p>填写当前账号专属的 PushDeer Key，未配置时不会发送提醒。</p>
            </div>
            <button class="ghost-btn" type="button" @click="closeDialog">关闭</button>
          </header>

          <label class="settings-field">
            <span>PushDeer Key</span>
            <input
              v-model.trim="draftKey"
              class="settings-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="PDU..."
            >
          </label>

          <label class="settings-field">
            <span>注意事项</span>
            <input
              v-model.trim="draftNoticeText"
              class="settings-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="做T操作提醒"
            >
          </label>

          <p class="settings-hint">
            留空并保存即可关闭当前账号的推送提醒。
          </p>

          <footer class="settings-modal-actions">
            <button class="ghost-btn" type="button" @click="clearSettings">清空</button>
            <button class="primary-btn" type="button" @click="saveSettings">保存</button>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>
