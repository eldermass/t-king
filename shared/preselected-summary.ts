export type PreselectedSummary = {
  code: string
  averageRiseRank: number | null
  averageFallRank: number | null
  marketDifferenceSum: number | null
  updatedAt: string
}

export type PreselectedRankPoint = {
  rank: number | null
  totalStocks: number
  changePercent: number | null
  differencePercent: number | null
}

export const summarizePreselectedRank = (code: string, points: PreselectedRankPoint[]): PreselectedSummary => {
  const rises = points.filter((point) => point.changePercent !== null && point.changePercent > 0 && point.rank !== null)
  const falls = points.filter((point) => point.changePercent !== null && point.changePercent < 0 && point.rank !== null)
  const differences = points.map((point) => point.differencePercent).filter((value): value is number => value !== null && Number.isFinite(value))
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
  return {
    code,
    averageRiseRank: average(rises.map((point) => point.rank!)),
    averageFallRank: average(falls.map((point) => point.rank!)),
    marketDifferenceSum: differences.length ? Math.round(differences.reduce((sum, value) => sum + value, 0) * 100) / 100 : null,
    updatedAt: new Date().toISOString()
  }
}
