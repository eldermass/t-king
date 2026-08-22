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
  totalStocks: number | null
  board1: number | null
  board5: number | null
  board6: number | null
  board7Plus: number | null
  advanceToSecond: number | null
  secondToThird: number | null
  thirdToFourth: number | null
  fourthToFifth: number | null
  yesterdayLimitUpReturn: number | null
  yesterdayLimitUpMedianReturn: number | null
  yesterdayLimitUpRiseRatio: number | null
  yesterdayLadderReturn: number | null
  leaderReturn: number | null
  amountChange: number | null
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
    totalStocks: number | null
    board1: number | null
    board5: number | null
    board6: number | null
    board7Plus: number | null
    advanceToSecond: number | null
    secondToThird: number | null
    thirdToFourth: number | null
    fourthToFifth: number | null
    yesterdayLimitUpReturn: number | null
    yesterdayLimitUpMedianReturn: number | null
    yesterdayLimitUpRiseRatio: number | null
    yesterdayLadderReturn: number | null
    leaderReturn: number | null
    amountChange: number | null
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
  totalAmount: null,
  totalStocks: null, board1: null, board5: null, board6: null, board7Plus: null,
  advanceToSecond: null, secondToThird: null, thirdToFourth: null, fourthToFifth: null,
  yesterdayLimitUpReturn: null, yesterdayLimitUpMedianReturn: null, yesterdayLimitUpRiseRatio: null,
  yesterdayLadderReturn: null, leaderReturn: null, amountChange: null
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
    totalStocks: null, board1: null, board5: null, board6: null, board7Plus: null,
    advanceToSecond: null, secondToThird: null, thirdToFourth: null, fourthToFifth: null,
    yesterdayLimitUpReturn: null, yesterdayLimitUpMedianReturn: null, yesterdayLimitUpRiseRatio: null,
    yesterdayLadderReturn: null, leaderReturn: null, amountChange: null,
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
      , totalStocks: total
      , board1: null, board5: null, board6: null, board7Plus: null
      , advanceToSecond: null, secondToThird: null, thirdToFourth: null, fourthToFifth: null
      , yesterdayLimitUpReturn: null, yesterdayLimitUpMedianReturn: null, yesterdayLimitUpRiseRatio: null
      , yesterdayLadderReturn: null, leaderReturn: null, amountChange: null
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

export const getPreviousSentimentSnapshot = async (event: H3Event) => {
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as any
  if (!db?.prepare) return null
  const result = await db.prepare(`SELECT * FROM market_sentiment ORDER BY trade_date DESC LIMIT 1`).all()
  const row = result.results?.[0]
  if (!row) return null
  return {
    tradeDate: row.trade_date, updatedAt: row.updated_at, marketSentiment: row.market_sentiment,
    profitScore: row.profit_score, speculationScore: row.speculation_score, breadthScore: row.breadth_score,
    limitScore: row.limit_score, liquidityScore: row.liquidity_score, riskScore: row.risk_score,
    momentum: row.momentum, phase: row.phase, stale: true, error: null,
    market: {
      advancers: row.advancers, decliners: row.decliners, unchanged: row.unchanged,
      limitUp: row.limit_up_count, limitDown: row.limit_down_count, brokenBoard: row.broken_board_count,
      brokenBoardRate: row.broken_board_rate, maxBoard: row.max_board_height, board2: row.board_2_count,
      board3: row.board_3_count, board4Plus: row.board_4_plus_count, totalAmount: row.total_amount,
      totalStocks: row.total_stocks, board1: row.board_1_count, board5: row.board_5_count,
      board6: row.board_6_count, board7Plus: row.board_7_plus_count, advanceToSecond: row.advance_to_second,
      secondToThird: row.second_to_third, thirdToFourth: row.third_to_fourth, fourthToFifth: row.fourth_to_fifth,
      yesterdayLimitUpReturn: row.yesterday_limit_up_return, yesterdayLimitUpMedianReturn: row.yesterday_limit_up_median_return,
      yesterdayLimitUpRiseRatio: row.yesterday_limit_up_rise_ratio, yesterdayLadderReturn: row.yesterday_ladder_return,
      leaderReturn: row.leader_return, amountChange: row.amount_change
    }
  } as SentimentSnapshot
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
        created_at, updated_at, total_stocks, board_1_count, board_5_count, board_6_count, board_7_plus_count,
        advance_to_second, second_to_third, third_to_fourth, fourth_to_fifth, yesterday_limit_up_return,
        yesterday_limit_up_median_return, yesterday_limit_up_rise_ratio, yesterday_ladder_return, leader_return, amount_change
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      snapshot.tradeDate, snapshot.marketSentiment, snapshot.profitScore, snapshot.speculationScore,
      snapshot.breadthScore, snapshot.limitScore, snapshot.liquidityScore, snapshot.riskScore,
      snapshot.momentum, snapshot.phase, snapshot.market.advancers, snapshot.market.decliners,
      snapshot.market.unchanged, snapshot.market.limitUp, snapshot.market.limitDown,
      snapshot.market.brokenBoard, snapshot.market.brokenBoardRate, snapshot.market.maxBoard,
      snapshot.market.board2, snapshot.market.board3, snapshot.market.board4Plus,
      snapshot.market.totalAmount, snapshot.updatedAt, snapshot.updatedAt, snapshot.market.totalStocks,
      snapshot.market.board1, snapshot.market.board5, snapshot.market.board6, snapshot.market.board7Plus,
      snapshot.market.advanceToSecond, snapshot.market.secondToThird, snapshot.market.thirdToFourth,
      snapshot.market.fourthToFifth, snapshot.market.yesterdayLimitUpReturn, snapshot.market.yesterdayLimitUpMedianReturn,
      snapshot.market.yesterdayLimitUpRiseRatio, snapshot.market.yesterdayLadderReturn, snapshot.market.leaderReturn,
      snapshot.market.amountChange
    ).run()
    return
  }

  const item: SentimentHistoryItem = { tradeDate: snapshot.tradeDate, marketSentiment: snapshot.marketSentiment, profitScore: snapshot.profitScore, speculationScore: snapshot.speculationScore, breadthScore: snapshot.breadthScore, riskScore: snapshot.riskScore, phase: snapshot.phase, momentum: snapshot.momentum }
  const existing = sentimentHistory.findIndex((entry) => entry.tradeDate === item.tradeDate)
  if (existing >= 0) sentimentHistory[existing] = item
  else sentimentHistory.unshift(item)
  sentimentHistory.splice(60)
}
