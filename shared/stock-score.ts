export type ScoreDimension = 'quality' | 'form'
export type ScoreSelection = Record<string, string>

export type StockScore = {
  quality: number | null
  form: number | null
  qualitySelections: ScoreSelection
  formSelections: ScoreSelection
  updatedAt: string | null
}

export type ScoreOption = { value: string; label: string; score: number }
export type ScoreCriterion = {
  key: string
  label: string
  options?: ScoreOption[]
  input?: { min: number; max: number; placeholder: string }
}

const options = (labels: string[], scores: number[]): ScoreOption[] => labels.map((label, index) => ({ value: String(index), label, score: scores[index] ?? 0 }))

export const stockScoreRules: Record<ScoreDimension, { label: string; criteria: ScoreCriterion[] }> = {
  quality: {
    label: '质',
    criteria: [
      { key: 'theme', label: '题材', options: options(['主线', '核心', '热门', '杂毛（扣）'], [8, 5, 3, -3]) },
      { key: 'popularity', label: '人气', options: options(['200以内', '200-500', '500-1000', '1000以上（0）', '2000以上（扣）'], [8, 5, 2, 0, -6]) },
      { key: 'marketPosition', label: '市场地位', options: options(['龙头', '核心', '前排', '跟风', '杂毛（0）'], [8, 6, 4, 0, -2]) },
      { key: 'initiative', label: '主动性', options: options(['领涨', '优于板块', '落后板块（扣）', '跟跌不跟涨（扣）', '领跌（扣）'], [10, 8, 2, -4, -8]) },
      { key: 'stockNature', label: '股性评分', input: { min: 0, max: 100, placeholder: '输入 0-100' } },
      { key: 'trend60', label: '60日线趋势', options: options(['趋势向上', '逆转向上', '走平', '逆转向下（扣）', '趋势向下（扣）'], [7, 3, 0, -3, -7]) },
      { key: 'weekly', label: '周K线', options: options(['新高', '趋势向上', '震荡', '趋势反转（扣）', '趋势向下（扣）'], [7, 5, 2, -2, -4]) },
      { key: 'rank', label: '涨跌次序', options: options(['前500', '500-2000', '倒数2000（0分）', '倒数500（扣）'], [6, 2, -3, -8]) },
      { key: 'delistRisk', label: '退市风险', options: options(['无（0）', '亏损', '曾经ST', '退市风险（重大扣分）'], [0, -3, -10, -20]) },
      { key: 'shareIssue', label: '是否增发', options: options(['无', '有（扣）', '低价定增/大额解禁压力（额外扣分）'], [0, -4, -8]) },
      { key: 'marketCap', label: '市值', options: options(['500+亿', '300-500亿', '100-300亿', '小于100亿（0分）', '小于50亿（扣）'], [8, 6, 4, 0, -3]) },
      { key: 'gameValue', label: '博弈价值（主力在否）', options: options(['在', '不确定（0）', '主力流出', '不在（扣）'], [5, 2, -3, -8]) }
    ]
  },
  form: {
    label: '形',
    criteria: [
      { key: 'mainPosition', label: '主力持仓', options: options(['趋势增加', '震荡暴增', '下跌反弹新高（0）', '长期下跌（扣）'], [8, 6, 2, -5]) },
      { key: 'volume30m', label: '30分钟量柱', options: options(['3+根倍量阳', '2根倍量阳', '1根倍量阳', '无倍量阳（0）', '放量阴线（扣）'], [8, 6, 0, -3, -8]) },
      { key: 'ma520', label: '520均线', options: options(['蜻蜓点水', '5日内金叉', '5日+金叉（0）', '5日线在20日下（扣）', '20日线下拐'], [10, 8, 4, -10, -12]) },
      { key: 'maDeviation', label: '均线偏离度', options: options(['横穿5日', '沿5日线', '偏离5日（0）', '偏离20日（扣）'], [10, 8, 2, -5]) },
      { key: 'volumeRatio', label: '量', options: options(['量比2.5+', '量比1.5-2.5', '量比1-1.5', '量比小于1（扣）'], [6, 4, 3, -5]) },
      { key: 'largeOrder', label: '分时大单承接', options: options(['10亿+', '5-10亿', '2-5亿', '1亿左右', '跑大单（扣）', '大单流出'], [10, 8, 6, 4, -3, -10]) },
      { key: 'newHigh15d', label: '15日内新高次数', options: options(['无', '1次（0）', '2次（扣）', '3次及以上（扣）'], [0, -5, -10, -15]) },
      { key: 'rebound15d', label: '15日内反弹次数', options: options(['无（0）', '1次（扣）', '2次（扣）', '3次及以上（重扣）'], [0, -5, -10, -15]) },
      { key: 'holdingDays', label: '持仓时长', input: { min: 0, max: 3650, placeholder: '输入持仓天数' } },
      { key: 'stopLoss', label: '触发止损（严重）', options: options(['无（0分）', '破支撑位', '破趋势线', '反弹后新低', '520死叉', '多项止损'], [0, -30, -30, -25, -10, -30]) },
      { key: 'patternMatch', label: '是否符合模式', options: options(['是', '弱匹配', '否'], [10, 2, -15]) },
      { key: 'breakout', label: '新高突破方式', options: options(['横盘新高（优）', '反弹新高', '趋势新高', '收盘未站上（扣）'], [10, 8, 4, -5]) }
    ]
  }
}

export const emptyStockScore = (): StockScore => ({ quality: null, form: null, qualitySelections: {}, formSelections: {}, updatedAt: null })

const manualScore = (criterion: ScoreCriterion, raw: string) => {
  const value = Number(raw)
  if (!Number.isFinite(value) || !criterion.input) return null
  const bounded = Math.min(criterion.input.max, Math.max(criterion.input.min, value))
  if (criterion.key === 'stockNature') return Math.round((bounded - 20) * 0.4 * 100) / 100
  if (criterion.key === 'holdingDays') return bounded <= 10 ? 0 : 10 - bounded
  return bounded
}

export const scoreForSelections = (dimension: ScoreDimension, selections: ScoreSelection) => {
  const selected = stockScoreRules[dimension].criteria.map((criterion) => criterion.input
    ? manualScore(criterion, selections[criterion.key] ?? '')
    : criterion.options?.find((option) => option.value === selections[criterion.key])?.score ?? null)
  if (selected.some((score) => score === null)) return null
  return Math.round(selected.reduce((total, score) => total + (score ?? 0), 0) * 100) / 100
}
