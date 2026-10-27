<script setup lang="ts">
import type { MarketGuideInterval } from '~/shared/market-guide'

const { notificationSettings, boardReady } = useStockBoard()
const open = ref(false)
const draftText = ref('')
const draftInterval = ref<MarketGuideInterval>(0)

const openDialog = () => {
  draftText.value = notificationSettings.value.marketGuide.text
  draftInterval.value = notificationSettings.value.marketGuide.intervalMinutes
  open.value = true
}

const save = () => {
  const guide = notificationSettings.value.marketGuide
  const text = draftText.value.trim()
  const intervalMinutes = draftInterval.value
  notificationSettings.value.marketGuide = {
    text,
    intervalMinutes,
    lastSentSlot: text === guide.text && intervalMinutes === guide.intervalMinutes ? guide.lastSentSlot : null
  }
  open.value = false
}
</script>

<template>
  <span class="market-guide-entry">
    <button class="market-guide-trigger" type="button" :disabled="!boardReady" @click="openDialog">指南</button>

    <Teleport to="body">
      <div v-if="open" class="settings-modal-overlay" @click.self="open = false" @keydown.esc="open = false">
        <section class="settings-modal market-guide-modal" role="dialog" aria-modal="true" aria-labelledby="market-guide-title">
          <header class="settings-modal-head">
            <h2 id="market-guide-title">市场指南</h2>
            <button class="ghost-btn" type="button" @click="open = false">关闭</button>
          </header>

          <label class="settings-field" for="market-guide-text">
            <span>指南内容</span>
            <textarea id="market-guide-text" v-model="draftText" class="settings-input market-guide-text" maxlength="2000" placeholder="输入市场指南" />
          </label>

          <fieldset class="market-guide-interval">
            <legend>提醒间隔</legend>
            <div class="market-guide-options">
              <label v-for="option in [{ value: 0, label: '不提醒' }, { value: 30, label: '隔30分钟' }, { value: 60, label: '隔60分钟' }]" :key="option.value">
                <input v-model="draftInterval" type="radio" name="market-guide-interval" :value="option.value">
                <span>{{ option.label }}</span>
              </label>
            </div>
          </fieldset>

          <p v-if="!notificationSettings.pushDeerKey.trim()" class="market-guide-hint">发送提醒前，请在提醒配置中填写 PushDeer Key。</p>

          <footer class="settings-modal-actions">
            <button class="primary-btn" type="button" @click="save">保存</button>
          </footer>
        </section>
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.market-guide-entry { display:inline-flex; align-items:center; }
.market-guide-trigger { padding:0; border:0; background:transparent; color:#1f1d1a; font:inherit; font-weight:700; white-space:nowrap; cursor:pointer; }
.market-guide-trigger:hover { text-decoration:underline; text-underline-offset:4px; }
.market-guide-trigger:disabled { opacity:.5; cursor:default; }
.market-guide-modal { max-height:calc(100vh - 40px); overflow:auto; border-radius:8px; }
.market-guide-text { min-height:150px; resize:vertical; font:inherit; line-height:1.5; }
.market-guide-interval { min-width:0; margin:18px 0 0; padding:0; border:0; }
.market-guide-interval legend { margin-bottom:9px; color:var(--muted); font-size:.98rem; font-weight:700; }
.market-guide-options { display:flex; gap:0; }
.market-guide-options label { flex:1; min-width:0; cursor:pointer; }
.market-guide-options input { position:absolute; opacity:0; }
.market-guide-options span { display:flex; min-height:40px; align-items:center; justify-content:center; padding:6px; border:1px solid var(--line); color:var(--muted); text-align:center; font-size:.88rem; }
.market-guide-options label:first-child span { border-radius:7px 0 0 7px; }
.market-guide-options label:last-child span { border-radius:0 7px 7px 0; }
.market-guide-options label + label span { border-left:0; }
.market-guide-options input:checked + span { border-color:var(--accent-2); background:rgba(31,111,98,.12); color:var(--accent-2); font-weight:700; }
.market-guide-options input:focus-visible + span { outline:2px solid var(--accent-2); outline-offset:2px; }
.market-guide-hint { margin:12px 0 0; color:var(--muted); font-size:.82rem; }
</style>
