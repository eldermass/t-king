import type { BuyEntry, DipAlert, StockCard, AlertState, NotificationSettings, ActiveReminder, ReminderKind } from '~/composables/useStockBoard'

export type BoardPayload = {
  stocks: StockCard[]
  alerts: Record<string, AlertState>
  notifications: NotificationSettings
}

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const estimateLots = (buyPrice: number | null, budget: number) => {
  if (buyPrice === null || buyPrice <= 0) {
    return null
  }

  return Math.floor(budget / (buyPrice * 100))
}

const INITIAL_POSITION_BUDGET = 30_000
const ADD_POSITION_BUDGET = 10_000
const UNNAMED_STOCK_NAME = '未命名股票'

const createBuyEntry = (
  buyPrice: number | null = null,
  targetRate = 3,
  lots: number | null = null,
  autoBudget = ADD_POSITION_BUDGET,
  lotsManual = false
): BuyEntry => ({
  id: createId(),
  buyPrice,
  targetRate,
  lots: lots ?? estimateLots(buyPrice, autoBudget),
  autoBudget,
  lotsManual
})

const createDipAlert = (dropRate = -3): DipAlert => ({
  id: createId(),
  dropRate
})

export const defaultBoardPayload = (): BoardPayload => ({
  stocks: [
    {
      id: createId(),
      name: '长信科技',
      code: '300088',
      subIndustry: '车载显示 / 触控显示材料',
      primaryTheme: '汽车电子',
      secondaryTheme: 'UTG / 折叠屏',
      coreBusiness: '研发、生产和销售触控显示器件材料、车载显示模组、超薄玻璃盖板（UTG）等电子显示器件与材料。',
      recommendedDipAlertId: null,
      profileInitializedCode: '300088',
      buyEntries: [createBuyEntry(7.85, 3, null, INITIAL_POSITION_BUDGET)],
      dipAlerts: [createDipAlert(-3), createDipAlert(-4), createDipAlert(-7)]
    },
    {
      id: createId(),
      name: '蓝色光标',
      code: '300058',
      subIndustry: '营销科技 / 出海广告',
      primaryTheme: 'AIGC营销',
      secondaryTheme: '出海营销',
      coreBusiness: '提供全案推广、全案广告代理、出海广告投放及 AI 营销等一站式营销科技服务，覆盖品牌传播与效果投放。',
      recommendedDipAlertId: null,
      profileInitializedCode: '300058',
      buyEntries: [createBuyEntry(17, 3, null, INITIAL_POSITION_BUDGET), createBuyEntry(16.1, 3, null, ADD_POSITION_BUDGET)],
      dipAlerts: [createDipAlert(-3), createDipAlert(-4), createDipAlert(-7)]
    },
    {
      id: createId(),
      name: '易点天下',
      code: '301171',
      subIndustry: '出海营销 / 互联网广告',
      primaryTheme: 'AIGC',
      secondaryTheme: '跨境电商',
      coreBusiness: '为企业提供出海整合营销、数字营销、广告变现，以及 AI 数字创意、BI 决策、CI 智能化多云管理等出海数字化服务。',
      recommendedDipAlertId: null,
      profileInitializedCode: '301171',
      buyEntries: [
        createBuyEntry(43.7, 3, null, INITIAL_POSITION_BUDGET),
        createBuyEntry(42, 3, null, ADD_POSITION_BUDGET),
        createBuyEntry(39.8, 3, null, ADD_POSITION_BUDGET),
        createBuyEntry(38.4, 3, null, ADD_POSITION_BUDGET)
      ],
      dipAlerts: [createDipAlert(-3), createDipAlert(-4), createDipAlert(-7)]
    }
  ],
  alerts: {},
  notifications: {
    enabled: true,
    activeReminders: {}
  }
})

const entryIndexBudget = (entries: any[], currentEntry: any) => {
  const index = entries.indexOf(currentEntry)
  return index <= 0 ? INITIAL_POSITION_BUDGET : ADD_POSITION_BUDGET
}

const deriveBudgetFromEntry = (entry: any, fallbackBudget: number) => {
  if (typeof entry.buyPrice === 'number' && entry.buyPrice > 0 && typeof entry.lots === 'number' && entry.lots > 0) {
    return Math.round(entry.buyPrice * entry.lots * 100)
  }

  return fallbackBudget
}

const normalizeReminderKind = (value: unknown): ReminderKind => value === 'sell' ? 'sell' : 'dip'

const normalizeActiveReminder = (input: any): ActiveReminder | null => {
  if (!input || typeof input !== 'object' || typeof input.key !== 'string') {
    return null
  }

  return {
    key: input.key,
    kind: normalizeReminderKind(input.kind),
    stockId: typeof input.stockId === 'string' ? input.stockId : '',
    stockName: typeof input.stockName === 'string' ? input.stockName : '',
    stockCode: typeof input.stockCode === 'string' ? input.stockCode : '',
    triggerId: typeof input.triggerId === 'string' ? input.triggerId : '',
    stockFingerprint: typeof input.stockFingerprint === 'string' ? input.stockFingerprint : '',
    triggerPrice: typeof input.triggerPrice === 'number' ? input.triggerPrice : null,
    lastSentAt: typeof input.lastSentAt === 'string' ? input.lastSentAt : null
  }
}

export const normalizeBoardPayload = (input: unknown): BoardPayload => {
  if (!input || typeof input !== 'object') {
    return defaultBoardPayload()
  }

  const payload = input as Record<string, unknown>
  const rawStocks = payload.stocks
  const rawAlerts = payload.alerts

  const stocks = Array.isArray(rawStocks) && rawStocks.length
    ? rawStocks.map((stock: any) => ({
        id: typeof stock.id === 'string' ? stock.id : createId(),
        name: typeof stock.name === 'string' ? stock.name : UNNAMED_STOCK_NAME,
        code: typeof stock.code === 'string' ? stock.code : '',
        subIndustry: typeof stock.subIndustry === 'string' ? stock.subIndustry : '',
        primaryTheme: typeof stock.primaryTheme === 'string' ? stock.primaryTheme : '',
        secondaryTheme: typeof stock.secondaryTheme === 'string' ? stock.secondaryTheme : '',
        coreBusiness: typeof stock.coreBusiness === 'string' ? stock.coreBusiness : '',
        recommendedDipAlertId: typeof stock.recommendedDipAlertId === 'string' ? stock.recommendedDipAlertId : null,
        profileInitializedCode: typeof stock.profileInitializedCode === 'string' ? stock.profileInitializedCode : null,
        buyEntries: Array.isArray(stock.buyEntries) && stock.buyEntries.length
          ? stock.buyEntries.map((entry: any) => ({
              id: typeof entry.id === 'string' ? entry.id : createId(),
              buyPrice: typeof entry.buyPrice === 'number' ? entry.buyPrice : null,
              targetRate: typeof entry.targetRate === 'number' ? entry.targetRate : 3,
              lots: typeof entry.lots === 'number' ? entry.lots : null,
              autoBudget: typeof entry.autoBudget === 'number'
                ? entry.autoBudget
                : deriveBudgetFromEntry(entry, entryIndexBudget(stock.buyEntries, entry)),
              lotsManual: typeof entry.lotsManual === 'boolean'
                ? entry.lotsManual
                : typeof entry.lots === 'number'
            }))
          : [createBuyEntry()],
        dipAlerts: Array.isArray(stock.dipAlerts) && stock.dipAlerts.length
          ? stock.dipAlerts.map((alert: any) => ({
              id: typeof alert.id === 'string' ? alert.id : createId(),
              dropRate: typeof alert.dropRate === 'number' ? alert.dropRate : -3
            }))
          : [createDipAlert(-3), createDipAlert(-4), createDipAlert(-7)]
      }))
    : defaultBoardPayload().stocks

  const alerts: Record<string, AlertState> = {}

  if (rawAlerts && typeof rawAlerts === 'object') {
    for (const [stockId, state] of Object.entries(rawAlerts as Record<string, any>)) {
      if (!state || typeof state !== 'object') {
        continue
      }

      alerts[stockId] = {
        fingerprint: typeof state.fingerprint === 'string' ? state.fingerprint : '',
        redLevel: [0, 1, 2, 3].includes(state.redLevel) ? state.redLevel : 0,
        greenActive: Boolean(state.greenActive),
        triggeredDipAlertIds: Array.isArray(state.triggeredDipAlertIds) ? state.triggeredDipAlertIds.filter((id) => typeof id === 'string') : [],
        triggeredSellEntryIds: Array.isArray(state.triggeredSellEntryIds) ? state.triggeredSellEntryIds.filter((id) => typeof id === 'string') : []
      }
    }
  }

  const rawNotifications = payload.notifications
  const notifications: NotificationSettings = {
    enabled: typeof (rawNotifications as any)?.enabled === 'boolean' ? (rawNotifications as any).enabled : true,
    activeReminders: {}
  }

  if (rawNotifications && typeof rawNotifications === 'object' && (rawNotifications as any).activeReminders && typeof (rawNotifications as any).activeReminders === 'object') {
    for (const [key, reminder] of Object.entries((rawNotifications as any).activeReminders as Record<string, any>)) {
      const normalizedReminder = normalizeActiveReminder({ ...reminder, key })

      if (normalizedReminder) {
        notifications.activeReminders[key] = normalizedReminder
      }
    }
  }

  return { stocks, alerts, notifications }
}
