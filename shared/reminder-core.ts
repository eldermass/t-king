export type ReminderKind = 'dip' | 'sell'

export type BuyEntryLike = {
  id: string
  buyPrice: number | null
  targetRate: number
  lots: number | null
}

export type DipAlertLike = {
  id: string
  dropRate: number
}

export type StockLike = {
  id: string
  name: string
  code: string
  buyEntries: BuyEntryLike[]
  dipAlerts: DipAlertLike[]
}

export type TriggeredDipAlert = {
  id: string
  dropRate: number
  triggerPrice: number
}

export type TriggeredSellEntry = {
  id: string
  triggerPrice: number
}

export type StockTriggerEvaluation = {
  redLevel: 0 | 1 | 2 | 3
  greenActive: boolean
  triggeredDipAlerts: TriggeredDipAlert[]
  triggeredSellEntries: TriggeredSellEntry[]
}

const roundPrice = (value: number) => Math.round(value * 10000) / 10000

export const normalizeCode = (code: string) => code.trim().replace(/[^\d]/g, '').slice(0, 6)

export const plannedSellPrice = (entry: BuyEntryLike) => {
  if (entry.buyPrice === null || entry.buyPrice <= 0) {
    return null
  }

  return roundPrice(entry.buyPrice * (1 + entry.targetRate / 100))
}

export const referencePrice = (stock: StockLike) => {
  const initialEntry = stock.buyEntries[0]

  if (initialEntry?.buyPrice !== null && initialEntry?.buyPrice !== undefined && initialEntry.buyPrice > 0) {
    return initialEntry.buyPrice
  }

  const firstValidEntry = stock.buyEntries.find((entry) => entry.buyPrice !== null && entry.buyPrice > 0)

  return firstValidEntry?.buyPrice ?? null
}

export const dipPrice = (basePrice: number | null, dropRate: number) => {
  if (basePrice === null || basePrice <= 0) {
    return null
  }

  return roundPrice(basePrice * (1 + dropRate / 100))
}

export const minimumSellPrice = (stock: StockLike) => {
  const prices = stock.buyEntries
    .map((entry) => plannedSellPrice(entry))
    .filter((price): price is number => price !== null && price > 0)

  if (!prices.length) {
    return null
  }

  return Math.min(...prices)
}

export const evaluateStockTriggers = (stock: StockLike, livePrice: number | null | undefined): StockTriggerEvaluation => {
  if (livePrice === null || livePrice === undefined) {
    return {
      redLevel: 0,
      greenActive: false,
      triggeredDipAlerts: [],
      triggeredSellEntries: []
    }
  }

  const basePrice = referencePrice(stock)
  const sellFloor = minimumSellPrice(stock)
  let redLevel: 0 | 1 | 2 | 3 = 0

  const triggeredDipAlerts: TriggeredDipAlert[] = []
  const triggeredSellEntries: TriggeredSellEntry[] = []

  for (const alert of stock.dipAlerts) {
    const triggerPrice = dipPrice(basePrice, alert.dropRate)

    if (triggerPrice === null || livePrice > triggerPrice) {
      continue
    }

    triggeredDipAlerts.push({
      id: alert.id,
      dropRate: alert.dropRate,
      triggerPrice
    })

    if (alert.dropRate <= -7) {
      redLevel = Math.max(redLevel, 3) as 0 | 1 | 2 | 3
    } else if (alert.dropRate <= -4) {
      redLevel = Math.max(redLevel, 2) as 0 | 1 | 2 | 3
    } else if (alert.dropRate <= -3) {
      redLevel = Math.max(redLevel, 1) as 0 | 1 | 2 | 3
    }
  }

  for (const entry of stock.buyEntries) {
    const triggerPrice = plannedSellPrice(entry)

    if (triggerPrice === null || livePrice < triggerPrice) {
      continue
    }

    triggeredSellEntries.push({
      id: entry.id,
      triggerPrice
    })
  }

  return {
    redLevel,
    greenActive: sellFloor !== null && livePrice >= sellFloor,
    triggeredDipAlerts,
    triggeredSellEntries
  }
}
