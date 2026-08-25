import type { H3Event } from 'h3'
import { getLimitUpStocks, saveLimitUpRawSnapshot } from './limitUp'

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
  totalAmount: number | null
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
    limitUpCodes: string[]
  }
}

type MarketStock = {
  code: string | null
  price: number | null
  changePercent: number | null
  amount: number | null
}

const LIMIT_RATE = 9.8
const MIN_VALID_MARKET_STOCKS = 3000
let previousSentiment: number | null = null
const sentimentHistory: SentimentHistoryItem[] = []
let refreshPromise: Promise<SentimentSnapshot> | null = null

const asNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const clamp = (value: number) => Math.min(100, Math.max(0, value))
const average = (values: Array<number | null>) => {
  const usable = values.filter((value): value is number => value !== null)
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null
}
const ratioScore = (value: number | null, min: number, max: number) =>
  value === null || max <= min ? null : clamp(((value - min) / (max - min)) * 100)

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

const tradeDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai'
}).format(new Date())

const emptyMarket = (): SentimentSnapshot['market'] => ({
  advancers: null, decliners: null, unchanged: null, limitUp: null, limitDown: null,
  brokenBoard: null, brokenBoardRate: null, maxBoard: null, board2: null, board3: null,
  board4Plus: null, totalAmount: null, totalStocks: null, board1: null, board5: null,
  board6: null, board7Plus: null, advanceToSecond: null, secondToThird: null,
  thirdToFourth: null, fourthToFifth: null, yesterdayLimitUpReturn: null,
  yesterdayLimitUpMedianReturn: null, yesterdayLimitUpRiseRatio: null,
  yesterdayLadderReturn: null, leaderReturn: null, amountChange: null, limitUpCodes: []
})

const marketStocksFromRows = (rows: Array<Record<string, unknown>>): MarketStock[] => rows.map((row) => ({
  code: typeof row.code === 'string' ? row.code : null,
  price: asNumber(row.price),
  changePercent: asNumber(row.changePercent),
  amount: asNumber(row.amount)
})).filter((stock) => stock.price !== null || stock.changePercent !== null)

const calculateSnapshot = (stocks: MarketStock[], limitUpCodes: string[]): SentimentSnapshot => {
  if (stocks.length < MIN_VALID_MARKET_STOCKS) {
    throw new Error(`stock-sdk returned only ${stocks.length} valid quotes`)
  }

  const changes = stocks.map((stock) => stock.changePercent).filter((value): value is number => value !== null)
  const advancers = changes.filter((value) => value > 0).length
  const decliners = changes.filter((value) => value < 0).length
  const unchanged = changes.filter((value) => value === 0).length
  const total = advancers + decliners + unchanged
  const upRatio = total ? (advancers / total) * 100 : null
  const downRatio = total ? (decliners / total) * 100 : null
  const medianChange = changes.length ? [...changes].sort((a, b) => a - b)[Math.floor(changes.length / 2)] : null
  const strongRatio = total ? (changes.filter((value) => value >= 5).length / total) * 100 : null
  const weakRatio = total ? (changes.filter((value) => value <= -5).length / total) * 100 : null
  const limitUp = changes.filter((value) => value >= LIMIT_RATE).length
  const limitDown = changes.filter((value) => value <= -LIMIT_RATE).length
  const amounts = stocks.map((stock) => stock.amount).filter((value): value is number => value !== null)
  const totalAmount = amounts.length ? amounts.reduce((sum, value) => sum + value, 0) : null

  const breadthScore = average([
    upRatio,
    ratioScore(upRatio === null || downRatio === null ? null : upRatio - downRatio, -100, 100),
    ratioScore(medianChange, -5, 5), ratioScore(strongRatio, 0, 20),
    weakRatio === null ? null : 100 - ratioScore(weakRatio, 0, 20)!
  ])
  const limitScore = average([
    ratioScore(limitUp, 0, Math.max(limitUp, limitDown, 100)),
    ratioScore(limitUp - limitDown, -100, 100),
    limitDown === 0 ? 100 : 100 - ratioScore(limitDown, 0, 100)!,
    total ? 100 - (limitDown / total) * 1000 : null
  ])
  const speculationScore = average([ratioScore(limitUp, 0, 100), ratioScore(strongRatio, 0, 20), breadthScore, limitScore])
  const profitScore = average([ratioScore(medianChange, -5, 5), breadthScore, ratioScore(upRatio, 0, 100)])
  const liquidityScore = totalAmount === null ? null : ratioScore(totalAmount, 300_000_000_000, 3_000_000_000_000)
  const riskScore = average([
    ratioScore(limitDown, 0, 100), weakRatio === null ? null : ratioScore(weakRatio, 0, 20),
    medianChange === null ? null : 100 - ratioScore(medianChange, -5, 5)!
  ])
  const baseScore = [profitScore, speculationScore, breadthScore, limitScore, liquidityScore].every((value) => value !== null)
    ? profitScore! * 0.3 + speculationScore! * 0.25 + breadthScore! * 0.2 + limitScore! * 0.15 + liquidityScore! * 0.1
    : average([profitScore, speculationScore, breadthScore, limitScore, liquidityScore])
  const marketSentiment = baseScore === null ? null : clamp(baseScore - (riskScore ?? 0) * 0.15)
  const momentum = marketSentiment === null || previousSentiment === null ? null : marketSentiment - previousSentiment
  previousSentiment = marketSentiment

  return {
    tradeDate: tradeDate(), updatedAt: new Date().toISOString(), marketSentiment,
    totalAmount,
    profitScore, speculationScore, breadthScore, riskScore, limitScore, liquidityScore,
    momentum, phase: phaseFor(marketSentiment), stale: false, error: null,
    market: {
      advancers, decliners, unchanged, limitUp, limitDown, brokenBoard: null,
      brokenBoardRate: null, maxBoard: null, board2: null, board3: null, board4Plus: null,
      totalAmount, totalStocks: total, board1: null, board5: null, board6: null,
      board7Plus: null, advanceToSecond: null, secondToThird: null, thirdToFourth: null,
      fourthToFifth: null, yesterdayLimitUpReturn: null, yesterdayLimitUpMedianReturn: null,
      yesterdayLimitUpRiseRatio: null, yesterdayLadderReturn: null, leaderReturn: null,
      amountChange: null, limitUpCodes
    }
  }
}

export const refreshSentimentSnapshot = async (event: H3Event): Promise<SentimentSnapshot> => {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const limitUp = await getLimitUpStocks()
    await saveLimitUpRawSnapshot(event, limitUp)
    const snapshot = calculateSnapshot(marketStocksFromRows(limitUp.rawRows), limitUp.stocks.map((stock) => stock.code))
    await saveSentimentSnapshot(event, snapshot)
    return snapshot
  })()
  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

export const getPreviousSentimentSnapshot = async (event: H3Event) => {
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as any
  if (!db?.prepare) return null
  const result = await db.prepare('SELECT * FROM market_sentiment ORDER BY trade_date DESC LIMIT 1').all()
  const row = result.results?.[0]
  if (!row || Number(row.total_stocks) < MIN_VALID_MARKET_STOCKS) return null
  return {
    tradeDate: row.trade_date, updatedAt: row.updated_at, marketSentiment: row.market_sentiment,
    totalAmount: row.total_amount,
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
      secondToThird: row.second_to_third, thirdToFourth: row.third_to_fourth,
      fourthToFifth: row.fourth_to_fifth, yesterdayLimitUpReturn: row.yesterday_limit_up_return,
      yesterdayLimitUpMedianReturn: row.yesterday_limit_up_median_return,
      yesterdayLimitUpRiseRatio: row.yesterday_limit_up_rise_ratio, yesterdayLadderReturn: row.yesterday_ladder_return,
      leaderReturn: row.leader_return, amountChange: row.amount_change,
      limitUpCodes: (() => { try { return JSON.parse(row.limit_up_codes || '[]') } catch { return [] } })()
    }
  } as SentimentSnapshot
}

export const getSentimentPageData = async (event: H3Event, days: number) => ({
  snapshot: await getPreviousSentimentSnapshot(event),
  history: await getSentimentHistory(event, days)
})

export const getSentimentHistory = async (event: H3Event, days: number) => {
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as any
  if (!db?.prepare) return sentimentHistory.slice(0, days)
  const result = await db.prepare(`
    SELECT trade_date AS tradeDate, market_sentiment AS marketSentiment,
      profit_score AS profitScore, speculation_score AS speculationScore,
      breadth_score AS breadthScore, risk_score AS riskScore, phase, momentum,
      total_amount AS totalAmount
    FROM market_sentiment ORDER BY trade_date DESC LIMIT ?
  `).bind(days).all<SentimentHistoryItem>()
  return result.results ?? []
}

export const saveSentimentSnapshot = async (event: H3Event, snapshot: SentimentSnapshot) => {
  const db = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as any
  if (!db?.prepare) throw new Error('D1 database binding is unavailable')
  await db.prepare(`
    INSERT OR REPLACE INTO market_sentiment (
      trade_date, market_sentiment, profit_score, speculation_score, breadth_score,
      limit_score, liquidity_score, risk_score, momentum, phase, advancers, decliners,
      unchanged, limit_up_count, limit_down_count, broken_board_count, broken_board_rate,
      max_board_height, board_2_count, board_3_count, board_4_plus_count, total_amount,
      created_at, updated_at, total_stocks, board_1_count, board_5_count, board_6_count, board_7_plus_count,
      advance_to_second, second_to_third, third_to_fourth, fourth_to_fifth, yesterday_limit_up_return,
      yesterday_limit_up_median_return, yesterday_limit_up_rise_ratio, yesterday_ladder_return, leader_return, amount_change, limit_up_codes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    snapshot.market.amountChange, JSON.stringify(snapshot.market.limitUpCodes)
  ).run()
}
