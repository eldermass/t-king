import { readBody } from 'h3'
import { requireUser } from '~/server/utils/auth'
import { saveSentimentSnapshot, type SentimentSnapshot } from '~/server/utils/sentiment'

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody<Partial<SentimentSnapshot>>(event)

  if (!body?.tradeDate || !body.updatedAt || !isRecord(body.market)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid sentiment snapshot' })
  }

  const market = body.market as SentimentSnapshot['market']
  const snapshot: SentimentSnapshot = {
    tradeDate: String(body.tradeDate), updatedAt: String(body.updatedAt), totalAmount: body.totalAmount ?? market.totalAmount ?? null, marketSentiment: body.marketSentiment ?? null,
    profitScore: body.profitScore ?? null, speculationScore: body.speculationScore ?? null, breadthScore: body.breadthScore ?? null,
    riskScore: body.riskScore ?? null, limitScore: body.limitScore ?? null, liquidityScore: body.liquidityScore ?? null,
    momentum: body.momentum ?? null, phase: String(body.phase || 'UNKNOWN'), stale: false, error: null,
    market: {
      advancers: market.advancers ?? null, decliners: market.decliners ?? null, unchanged: market.unchanged ?? null,
      limitUp: market.limitUp ?? null, limitDown: market.limitDown ?? null, brokenBoard: market.brokenBoard ?? null,
      brokenBoardRate: market.brokenBoardRate ?? null, maxBoard: market.maxBoard ?? null, board2: market.board2 ?? null,
      board3: market.board3 ?? null, board4Plus: market.board4Plus ?? null, totalAmount: market.totalAmount ?? null,
      totalStocks: market.totalStocks ?? null, board1: market.board1 ?? null, board5: market.board5 ?? null,
      board6: market.board6 ?? null, board7Plus: market.board7Plus ?? null, advanceToSecond: market.advanceToSecond ?? null,
      secondToThird: market.secondToThird ?? null, thirdToFourth: market.thirdToFourth ?? null, fourthToFifth: market.fourthToFifth ?? null,
      yesterdayLimitUpReturn: market.yesterdayLimitUpReturn ?? null, yesterdayLimitUpMedianReturn: market.yesterdayLimitUpMedianReturn ?? null,
      yesterdayLimitUpRiseRatio: market.yesterdayLimitUpRiseRatio ?? null, yesterdayLadderReturn: market.yesterdayLadderReturn ?? null,
      leaderReturn: market.leaderReturn ?? null, amountChange: market.amountChange ?? null,
      limitUpCodes: Array.isArray(market.limitUpCodes) ? market.limitUpCodes.map(String) : []
    }
  }

  await saveSentimentSnapshot(event, snapshot)
  return { tradeDate: snapshot.tradeDate, updatedAt: snapshot.updatedAt }
})
