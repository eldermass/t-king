export type MarketScoreDataRow = {
  tradeDate: string
  volume: number | null
  volumeChange: number | null
  advancers: number | null
  decliners: number | null
  limitUpCount: number | null
  limitDownCount: number | null
}

export type MarketScoreData = {
  period: string
  tradeDate: string
  values: Record<string, string>
}

export const marketScorePeriod = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  const today = `${part('year')}-${part('month')}-${part('day')}`
  const afterClose = Number(part('hour')) * 60 + Number(part('minute')) >= 15 * 60
  return { today, afterClose, key: `${today}:${afterClose ? 'closed' : 'open'}` }
}

const limitUpBand = (count: number) => count > 100 ? 'gt100' : count >= 80 ? '80_100' : count >= 65 ? '65_80' : count >= 50 ? '50_65' : 'lt50'
const limitDownBand = (count: number) => count < 8 ? 'lt8' : count <= 15 ? '8_15' : count <= 25 ? '15_25' : 'gt25'

export const marketScoreDataFromRows = (rows: MarketScoreDataRow[], now: Date): MarketScoreData => {
  const { today, afterClose, key } = marketScorePeriod(now)
  const completed = rows
    .filter((row) => row.tradeDate < today || (afterClose && row.tradeDate === today))
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
  const latest = completed[0]
  const values: Record<string, string> = {}

  completed.slice(0, 5).reverse().forEach((row, index, days) => {
    // The fifth input must always be the latest day; fewer than five days leave
    // the five-day volume score unavailable instead of shifting the positions.
    const inputNumber = 5 - days.length + index + 1
    if (row.volume !== null && Number.isFinite(row.volume)) {
      values[`volumeDay${inputNumber}`] = String(row.volume / 10000) // 万元 → 亿元
    }
  })

  if (latest) {
    if (latest.volumeChange !== null && Number.isFinite(latest.volumeChange)) values.volumeChange = String(latest.volumeChange / 10000)
    if (latest.advancers !== null && Number.isFinite(latest.advancers)) values.breadthUp = String(latest.advancers)
    if (latest.decliners !== null && Number.isFinite(latest.decliners)) values.breadthDown = String(latest.decliners)
    if (latest.limitUpCount !== null && Number.isFinite(latest.limitUpCount)) {
      values.limitUp = limitUpBand(latest.limitUpCount)
      values.limitUpCount = String(latest.limitUpCount)
    }
    if (latest.limitDownCount !== null && Number.isFinite(latest.limitDownCount)) {
      values.limitDown = limitDownBand(latest.limitDownCount)
      values.limitDownCount = String(latest.limitDownCount)
    }
  }

  return { period: key, tradeDate: latest?.tradeDate ?? '', values }
}
