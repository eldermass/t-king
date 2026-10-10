<script setup lang="ts">
type ScoreState = Record<string, string>

type ScoreOption = {
  label: string
  value: string
  score: number
}

type Criterion = {
  key: string
  label: string
  hint: string
  kind: 'number' | 'select'
  placeholder?: string
  options?: ScoreOption[]
}

const storageKey = 'stock-t-helper-market-score'

const criteria: Criterion[] = [
  { key: 'volume', label: '量能', hint: '输入近5天成交额,第5天作为当日', kind: 'number', placeholder: '成交额' },
  { key: 'volumeChange', label: '缩放量', hint: '正数为放量,负数为缩量', kind: 'number', placeholder: '变化值' },
  { key: 'breadth', label: '市场广度', hint: '输入上涨家数和下跌家数', kind: 'number', placeholder: '上涨,下跌' },
  {
    key: 'limitUp', label: '涨停家数', hint: '选择涨停数量区间', kind: 'select',
    options: [
      { label: '大于100', value: 'gt100', score: 10 }, { label: '80-100', value: '80_100', score: 8 },
      { label: '65-80', value: '65_80', score: 6 }, { label: '50-65', value: '50_65', score: 0 }, { label: '少于50', value: 'lt50', score: -10 }
    ]
  },
  {
    key: 'limitDown', label: '跌停家数', hint: '选择跌停数量区间', kind: 'select',
    options: [
      { label: '少于8', value: 'lt8', score: 10 }, { label: '8-15', value: '8_15', score: 2 },
      { label: '15-25', value: '15_25', score: -8 }, { label: '多于25', value: 'gt25', score: -16 }
    ]
  },
  { key: 'yesterdayLimitUp', label: '昨日涨停表现', hint: '输入涨跌幅度(%)', kind: 'number', placeholder: '涨跌幅度' },
  {
    key: 'capCompare', label: '大小盘对比', hint: '选择盘面强弱', kind: 'select',
    options: [{ label: '都强', value: 'bothStrong', score: 8 }, { label: '大盘强', value: 'largeStrong', score: 4 }, { label: '小盘强', value: 'smallStrong', score: 6 }, { label: '都弱', value: 'bothWeak', score: 2 }]
  },
  {
    key: 'trend', label: '趋势', hint: '选择当前趋势状态', kind: 'select',
    options: [{ label: '上升', value: 'up', score: 15 }, { label: '下降转震荡', value: 'downToRange', score: 10 }, { label: '震荡', value: 'range', score: 7 }, { label: '上升转震荡', value: 'upToRange', score: 9 }, { label: '下降', value: 'down', score: 2 }]
  },
  {
    key: 'cycle', label: '情绪周期', hint: '选择市场所处阶段', kind: 'select',
    options: [{ label: '启动', value: 'start', score: 6 }, { label: '发酵', value: 'ferment', score: 10 }, { label: '高潮', value: 'climax', score: 6 }, { label: '分歧', value: 'diverge', score: 2 }, { label: '退潮', value: 'ebb', score: -8 }, { label: '冰点', value: 'freeze', score: 4 }]
  },
  {
    key: 'pattern', label: '形态', hint: '选择市场整体形态', kind: 'select',
    options: [{ label: '牛市', value: 'bull', score: 10 }, { label: '强势震荡', value: 'strongRange', score: 8 }, { label: '震荡', value: 'range', score: 6 }, { label: '弱势震荡', value: 'weakRange', score: 2 }, { label: '熊市', value: 'bear', score: -4 }]
  }
]

const state = reactive<ScoreState>({})
const open = ref(false)
const hydrated = ref(false)

const numberValue = (key: string) => {
  const value = Number(state[key])
  return Number.isFinite(value) ? value : null
}

const rowScore = (criterion: Criterion) => {
  if (criterion.kind === 'select') {
    return criterion.options?.find((option) => option.value === state[criterion.key])?.score ?? null
  }

  if (criterion.key === 'volume') {
    const values = Array.from({ length: 5 }, (_, index) => numberValue(`volumeDay${index + 1}`))
    if (values.some((value) => value === null || value < 0)) return null
    const today = values[4] as number
    const average = (values as number[]).reduce((sum, value) => sum + value, 0) / 5
    if (average <= 0) return null
    const rate = (today / average - 1) * 100
    return rate > 10 ? 10 : rate >= 3 ? 8 : rate >= -3 ? 6 : rate >= -10 ? 4 : 2
  }

  if (criterion.key === 'volumeChange') {
    const value = numberValue('volumeChange')
    return value === null ? null : Math.round((value / 200) * 10) / 10
  }

  if (criterion.key === 'breadth') {
    const up = numberValue('breadthUp')
    const down = numberValue('breadthDown')
    if (up === null || down === null || up < 0 || down < 0 || up + down <= 0) return null
    const breadth = ((up - down) / (up + down)) * 100
    return breadth >= 60 ? 15 : breadth >= 30 ? 12 : breadth >= 10 ? 9 : breadth >= -10 ? 6 : breadth >= -30 ? 4 : breadth >= -60 ? 2 : 0
  }

  if (criterion.key === 'yesterdayLimitUp') {
    const value = numberValue('yesterdayLimitUp')
    return value === null ? null : Math.round(value * 3 * 10) / 10
  }

  return null
}

const scores = computed(() => criteria.map((criterion) => ({ criterion, score: rowScore(criterion) })))
const totalScore = computed(() => Math.round(scores.value.reduce((total, item) => total + (item.score ?? 0), 0) * 10) / 10)
const totalTone = computed(() => totalScore.value > 60 ? 'high' : totalScore.value < 20 ? 'low' : 'normal')

const scoreText = (score: number | null) => score === null ? '--' : `${score > 0 ? '+' : ''}${score}`

const inputKeys = (criterion: Criterion) => {
  if (criterion.key === 'volume') return Array.from({ length: 5 }, (_, index) => `volumeDay${index + 1}`)
  if (criterion.key === 'breadth') return ['breadthUp', 'breadthDown']
  return [criterion.key]
}

const inputLabel = (key: string) => ({
  volumeDay1: '第1天', volumeDay2: '第2天', volumeDay3: '第3天', volumeDay4: '第4天', volumeDay5: '当日', volumeChange: '变化值', breadthUp: '上涨家数', breadthDown: '下跌家数', yesterdayLimitUp: '涨跌幅度'
}[key] || '')

const shiftVolume = () => {
  for (let index = 1; index < 5; index += 1) {
    state[`volumeDay${index}`] = state[`volumeDay${index + 1}`] || ''
  }
  state.volumeDay5 = ''
}

const persist = () => {
  if (!hydrated.value) return
  localStorage.setItem(storageKey, JSON.stringify({ values: state, score: totalScore.value }))
}

const reset = () => {
  Object.keys(state).forEach((key) => delete state[key])
}

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
    if (saved && typeof saved === 'object') Object.assign(state, saved.values && typeof saved.values === 'object' ? saved.values : saved)
  } catch {
    // Ignore malformed local data and start with an empty score.
  }
  hydrated.value = true
})

watch(state, persist, { deep: true })
</script>

<template>
  <button class="market-score-trigger" type="button" @click="open = true">
    <span>市场评分：</span><strong :class="`score-tone-${totalTone}`">{{ totalScore }}</strong>
  </button>

  <Teleport to="body">
    <div v-if="open" class="market-score-overlay" @click.self="open = false">
      <section class="market-score-dialog" role="dialog" aria-modal="true" aria-labelledby="market-score-title">
        <header class="market-score-dialog-head">
          <div>
            <p class="market-score-eyebrow">MARKET SCORE</p>
            <h2 id="market-score-title">市场评分 <strong :class="`score-tone-${totalTone}`">{{ totalScore }}</strong></h2>
          </div>
          <button class="market-score-close" type="button" aria-label="关闭" @click="open = false">×</button>
        </header>

        <p class="market-score-note">填写或选择指标后会自动计算，数据仅保存在当前浏览器。</p>

        <div class="market-score-list">
          <article v-for="item in scores" :key="item.criterion.key" class="market-score-row">
            <div class="market-score-row-head">
              <div><strong>{{ item.criterion.label }}</strong><small>{{ item.criterion.hint }}</small></div>
              <b :class="{ positive: (item.score ?? 0) > 0, negative: (item.score ?? 0) < 0 }">{{ scoreText(item.score) }}</b>
            </div>
            <div v-if="item.criterion.kind === 'select'" class="market-score-options">
              <label v-for="option in item.criterion.options" :key="option.value" class="market-score-option">
                <input v-model="state[item.criterion.key]" type="radio" :name="item.criterion.key" :value="option.value">
                <span>{{ option.label }}</span>
              </label>
            </div>
            <div v-else class="market-score-inputs" :class="{ 'volume-inputs': item.criterion.key === 'volume' }">
              <label v-for="key in inputKeys(item.criterion)" :key="key">
                <span>{{ inputLabel(key) }}</span>
                <input v-model="state[key]" type="number" step="any" :placeholder="item.criterion.placeholder">
              </label>
              <button v-if="item.criterion.key === 'volume'" class="volume-shift-button" type="button" @click="shiftVolume">前移</button>
            </div>
          </article>
        </div>

        <footer class="market-score-dialog-foot">
          <button class="market-score-reset" type="button" @click="reset">清空评分</button>
          <button class="market-score-done" type="button" @click="open = false">完成</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.market-score-trigger { display:inline-flex; align-items:baseline; gap:3px; padding:0; border:0; background:transparent; color:var(--text); font:inherit; cursor:pointer; }
.market-score-trigger strong { color:#1f1d1a; }.market-score-trigger strong.score-tone-high, .market-score-dialog h2 strong.score-tone-high { color:var(--accent); }.market-score-trigger strong.score-tone-low, .market-score-dialog h2 strong.score-tone-low { color:var(--accent-2); }
.market-score-trigger:hover strong { text-decoration:underline; text-underline-offset:4px; }
.market-score-overlay { position:fixed; inset:0; z-index:100; display:grid; place-items:center; padding:18px; background:rgba(28,25,20,.46); }
.market-score-dialog { width:min(760px,100%); max-height:min(88vh,900px); overflow:auto; padding:24px; border:1px solid rgba(255,255,255,.75); border-radius:18px; background:var(--panel); box-shadow:0 24px 70px rgba(28,25,20,.26); }
.market-score-dialog-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.market-score-eyebrow { margin:0 0 5px; color:var(--accent-2); font-size:.7rem; font-weight:800; letter-spacing:.12em; }
.market-score-dialog h2 { margin:0; font-size:1.25rem; }
.market-score-dialog h2 strong { margin-left:7px; color:#1f1d1a; }
.market-score-close { width:32px; height:32px; border:1px solid var(--line); border-radius:8px; background:transparent; color:var(--muted); font-size:1.35rem; line-height:1; cursor:pointer; }
.market-score-note { margin:10px 0 18px; color:var(--muted); font-size:.8rem; }
.market-score-list { display:grid; gap:10px; }
.market-score-row { padding:13px 14px; border:1px solid var(--line); border-radius:12px; background:rgba(255,250,240,.66); }
.market-score-row-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.market-score-row-head div { display:grid; gap:3px; }
.market-score-row-head small { color:var(--muted); font-size:.73rem; }
.market-score-row-head b { min-width:40px; color:var(--muted); text-align:right; }
.market-score-row-head b.positive { color:var(--accent); }.market-score-row-head b.negative { color:var(--accent-2); }
.market-score-options { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
.market-score-option { position:relative; cursor:pointer; }.market-score-option input { position:absolute; opacity:0; pointer-events:none; }.market-score-option span { display:block; padding:6px 9px; border:1px solid var(--line); border-radius:7px; color:var(--muted); font-size:.78rem; }.market-score-option input:checked + span { border-color:var(--accent); background:rgba(31,111,98,.1); color:var(--accent); font-weight:700; }
.market-score-inputs { display:flex; flex-wrap:wrap; gap:9px; margin-top:10px; }.market-score-inputs label { display:grid; gap:4px; min-width:130px; flex:1; }.market-score-inputs span { color:var(--muted); font-size:.72rem; }.market-score-inputs input { width:100%; box-sizing:border-box; min-height:34px; padding:6px 9px; border:1px solid var(--line); border-radius:7px; background:var(--panel); color:var(--text); font:inherit; }
.volume-inputs { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)) auto; align-items:end; gap:7px; }.volume-inputs label { min-width:0; }.volume-inputs input { padding-inline:6px; }.volume-shift-button { min-height:34px; padding:0 9px; border:1px solid var(--line); border-radius:7px; background:transparent; color:var(--text); font:inherit; font-size:.78rem; cursor:pointer; white-space:nowrap; }.volume-shift-button:hover { border-color:var(--accent); color:var(--accent); }
.market-score-dialog-foot { display:flex; justify-content:flex-end; gap:9px; margin-top:18px; padding-top:15px; border-top:1px solid var(--line); }.market-score-dialog-foot button { min-height:36px; padding:0 13px; border-radius:8px; font:inherit; cursor:pointer; }.market-score-reset { border:1px solid var(--line); background:transparent; color:var(--muted); }.market-score-done { border:1px solid var(--accent); background:var(--accent); color:#fff; }
@media (max-width:640px) { .market-score-overlay { align-items:end; padding:0; }.market-score-dialog { max-height:92vh; padding:19px 14px 14px; border-radius:18px 18px 0 0; }.market-score-option span { padding:6px 7px; font-size:.73rem; } }
</style>
