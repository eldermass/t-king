import type { H3Event } from 'h3'

export type SentimentHistoryItem = {
  tradeDate: string
  marketSentiment: number | null
  profitScore: number | null
  speculationScore: number | null
  breadthScore: number | null
  riskScore: number | null
  limitScore: number | null
  liquidityScore: number | null
  phase: string
  momentum: number | null
}

export type SentimentSnapshot = SentimentHistoryItem & {
  updatedAt: string
  stale: boolean
  error: string | null
  market: {
    advancers: number | null
    decliners: number | null
    unchanged: number | null
    limitUp: number | null
    limitDown: number | null
    brokenBoard: number | null
    brokenBoardRate: number | null
    maxBoard: number | null
    board2: number | null
    board3: number | null
    board4Plus: number | null
    totalAmount: number | null
  }
}

type MarketStock = {
  price: number | null
  changePercent: number | null
  amount: number | null
}

type MarketCache = {
  expiresAt: number
  snapshot: SentimentSnapshot
}

type EastmoneyListResponse = {
  data?: {
    total?: number
    diff?: Array<Record<string, number | string | null>>
  }
}

let marketCache: MarketCache | null = null
let previousSentiment: number | null = null
const sentimentHistory: SentimentHistoryItem[] = []

const CACHE_MS = 8_000
const LIMIT_RATE = 9.8

const asNumber = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

const clamp = (value: number) => Math.min(100, Math.max(0, value))

const ratioScore = (value: number | null, min: number, max: number) => {
  if (value === null || max <= min) {
    return null
  }

  return clamp(((value - min) / (max - min)) * 100)
}

const average = (values: Array<number | null>) => {
  const usable = values.filter((value): value is number => value !== null)
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null
}

const phaseFor = (score: number | null) => {
  if (score === null) return 'UNKNOWN'
  if (score < 15) return 'PANIC'
  if (score < 30) return 'COLD'
  if (score < 45) return 'WEAK'
  if (score < 60) return 'RECOVERY'
  if (score < 75) return 'STRONG'
  if (score < 85) return 'HOT'
  return 'EUPHORIC'
}

const emptyMarket = (): SentimentSnapshot['market'] => ({
  advancers: null,
  decliners: null,
  unchanged: null,
  limitUp: null,
  limitDown: null,
  brokenBoard: null,
  brokenBoardRate: null,
  maxBoard: null,
  board2: null,
  board3: null,
  board4Plus: null,
  totalAmount: null
})

const toTradeDate = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const createUnavailableSnapshot = (error: string): SentimentSnapshot => ({
  tradeDate: toTradeDate(),
  updatedAt: new Date().toISOString(),
  marketSentiment: null,
  profitScore: null,
  speculationScore: null,
  breadthScore: null,
  riskScore: null,
  limitScore: null,
  liquidityScore: null,
  momentum: null,
  phase: 'UNKNOWN',
  stale: true,
  error,
  market: emptyMarket()
})

const fetchMarketStocks = async () => {
  const response = await $fetch<EastmoneyListResponse>('https://push2.eastmoney.com/api/qt/clist/get', {
    headers: {
      referer: 'https://quote.eastmoney.com/center/gridlist.html',
      'user-agent': 'Mozilla/5.0'
    },
    query: {
      pn: 1,
      pz: 6000,
      po: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: 'f3',
      fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
      fields: 'f2,f3,f5,f6,f12'
    },
    timeout: 6000
  })

  return (response.data?.diff ?? [])
    .map((item): MarketStock => ({
      price: asNumber(item.f2),
      changePercent: asNumber(item.f3),
      amount: asNumber(item.f6)
    }))
    .filter((item) => item.price !== null || item.changePercent !== null)
}

const calculateSnapshot = (stocks: MarketStock[]): SentimentSnapshot => {
  const validChanges = stocks
    .map((stock) => stock.changePercent)
    .filter((value): value is number => value !== null)
  const advancers = validChanges.filter((value) => value > 0).length
  const decliners = validChanges.filter((value) => value < 0).length
  const unchanged = validChanges.filter((value) => value === 0).length
  const total = advancers + decliners + unchanged
  const upRatio = total ? (advancers / total) * 100 : null
  const downRatio = total ? (decliners / total) * 100 : null
  const medianChange = validChanges.length
    ? [...validChanges].sort((a, b) => a - b)[Math.floor(validChanges.length / 2)]
    : null
  const strongRatio = total ? (validChanges.filter((value) => value >= 5).length / total) * 100 : null
  const weakRatio = total ? (validChanges.filter((value) => value <= -5).length / total) * 100 : null
  const limitUp = validChanges.filter((value) => value >= LIMIT_RATE).length
  const limitDown = validChanges.filter((value) => value <= -LIMIT_RATE).length
  const amounts = stocks.map((stock) => stock.amount).filter((value): value is number => value !== null)
  const totalAmount = amounts.length ? amounts.reduce((sum, value) => sum + value, 0) : null

  const breadthScore = average([
    upRatio,
    ratioScore((upRatio === null || downRatio === null) ? null : upRatio - downRatio, -100, 100),
    ratioScore(medianChange, -5, 5),
    ratioScore(strongRatio, 0, 20),
    weakRatio === null ? null : 100 - ratioScore(weakRatio, 0, 20)!
  ])
  const limitScore = average([
    ratioScore(limitUp, 0, Math.max(limitUp, limitDown, 100)),
    ratioScore(limitUp - limitDown, -100, 100),
    limitDown === 0 ? 100 : 100 - ratioScore(limitDown, 0, 100)!,
    total ? 100 - (limitDown / total) * 1000 : null
  ])
  const speculationScore = average([
    ratioScore(limitUp, 0, 100),
    ratioScore(strongRatio, 0, 20),
    breadthScore,
    limitScore
  ])
  const profitScore = average([
    ratioScore(medianChange, -5, 5),
    breadthScore,
    ratioScore(upRatio, 0, 100)
  ])
  const liquidityScore = totalAmount === null ? null : ratioScore(totalAmount, 300_000_000_000, 3_000_000_000_000)
  const riskScore = average([
    ratioScore(limitDown, 0, 100),
    weakRatio === null ? null : ratioScore(weakRatio, 0, 20),
    medianChange === null ? null : 100 - ratioScore(medianChange, -5, 5)!
  ])
  const baseScore = [profitScore, speculationScore, breadthScore, limitScore, liquidityScore].every((value) => value !== null)
    ? (profitScore! * 0.3) + (speculationScore! * 0.25) + (breadthScore! * 0.2) + (limitScore! * 0.15) + (liquidityScore! * 0.1)
    : average([profitScore, speculationScore, breadthScore, limitScore, liquidityScore])
  const marketSentiment = baseScore === null ? null : clamp(baseScore - (riskScore ?? 0) * 0.15)
  const momentum = marketSentiment === null || previousSentiment === null ? null : marketSentiment - previousSentiment
  previousSentiment = marketSentiment

  return {
    tradeDate: toTradeDate(),
    updatedAt: new Date().toISOString(),
    marketSentiment,
    profitScore,
    speculationScore,
    breadthScore,
    riskScore,
    limitScore,
    liquidityScore,
    momentum,
    phase: phaseFor(marketSentiment),
    stale: false,
    error: null,
    market: {
      advancers,
      decliners,
      unchanged,
      limitUp,
      limitDown,
      brokenBoard: null,
      brokenBoardRate: null,
      maxBoard: null,
      board2: null,
      board3: null,
      board4Plus: null,
      totalAmount
    }
  }
}

export const getSentimentSnapshot = async (): Promise<SentimentSnapshot> => {
  if (marketCache && marketCache.expiresAt > Date.now()) {
    return marketCache.snapshot
  }

  try {
    const snapshot = calculateSnapshot(await fetchMarketStocks())
    marketCache = { expiresAt: Date.now() + CACHE_MS, snapshot }
    return snapshot
  } catch (error) {
    console.error('market sentiment fetch failed', error)
    const snapshot = createUnavailableSnapshot('行情获取失败')
    marketCache = { expiresAt: Date.now() + CACHE_MS, snapshot }
    return snapshot
  }
}

export const getSentimentHistory = async (event: H3Event, days: number) => {
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as {
    prepare?: (sql: string) => { bind: (...params: any[]) => { all: <T = any>() => Promise<{ results?: T[] }> } }
  } | undefined

  if (db?.prepare) {
    const result = await db.prepare(`
      SELECT trade_date AS tradeDate, market_sentiment AS marketSentiment,
        profit_score AS profitScore, speculation_score AS speculationScore,
        breadth_score AS breadthScore, risk_score AS riskScore,
        phase, momentum
      FROM market_sentiment ORDER BY trade_date DESC LIMIT ?
    `).bind(days).all<SentimentHistoryItem>()
    return result.results ?? []
  }

  return sentimentHistory.slice(0, days)
}

export const saveSentimentSnapshot = async (event: H3Event, snapshot: SentimentSnapshot) => {
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as {
    prepare?: (sql: string) => { bind: (...params: any[]) => { run: () => Promise<unknown> } }
  } | undefined

  if (db?.prepare) {
    await db.prepare(`
      INSERT OR REPLACE INTO market_sentiment (
        trade_date, market_sentiment, profit_score, speculation_score, breadth_score,
        limit_score, liquidity_score, risk_score, momentum, phase, advancers, decliners,
        unchanged, limit_up_count, limit_down_count, broken_board_count, broken_board_rate,
        max_board_height, board_2_count, board_3_count, board_4_plus_count, total_amount,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      snapshot.tradeDate, snapshot.marketSentiment, snapshot.profitScore, snapshot.speculationScore,
      snapshot.breadthScore, snapshot.limitScore, snapshot.liquidityScore, snapshot.riskScore,
      snapshot.momentum, snapshot.phase, snapshot.market.advancers, snapshot.market.decliners,
      snapshot.market.unchanged, snapshot.market.limitUp, snapshot.market.limitDown,
      snapshot.market.brokenBoard, snapshot.market.brokenBoardRate, snapshot.market.maxBoard,
      snapshot.market.board2, snapshot.market.board3, snapshot.market.board4Plus,
      snapshot.market.totalAmount, snapshot.updatedAt, snapshot.updatedAt
    ).run()
    return
  }

  const item: SentimentHistoryItem = { tradeDate: snapshot.tradeDate, marketSentiment: snapshot.marketSentiment, profitScore: snapshot.profitScore, speculationScore: snapshot.speculationScore, breadthScore: snapshot.breadthScore, riskScore: snapshot.riskScore, phase: snapshot.phase, momentum: snapshot.momentum }
  const existing = sentimentHistory.findIndex((entry) => entry.tradeDate === item.tradeDate)
  if (existing >= 0) sentimentHistory[existing] = item
  else sentimentHistory.unshift(item)
  sentimentHistory.splice(60)
}
