import type { TradeRecord } from '~/composables/useStockBoard'

export const tradeGroupFee = (records: TradeRecord[]): number | null => {
  const sells = records.filter((record) => record.type === 'sell')
  if (!sells.length) return null

  return sells.reduce((total, record) => {
    const sellAmount = record.price * record.lots * 100
    const commission = sellAmount > 10000 ? sellAmount * 1.5 / 10000 : 5
    const fee = commission * 2 + sellAmount * 5 / 10000
    return total + Math.round(fee * 100) / 100
  }, 0)
}
