export type MarketGuideInterval = 0 | 30 | 60

export type MarketGuide = {
  text: string
  intervalMinutes: MarketGuideInterval
  lastSentSlot: string | null
}

export const defaultMarketGuide = (): MarketGuide => ({
  text: '',
  intervalMinutes: 0,
  lastSentSlot: null
})

export const normalizeMarketGuide = (input: unknown): MarketGuide => {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  return {
    text: typeof value.text === 'string' ? value.text.trim() : '',
    intervalMinutes: value.intervalMinutes === 30 || value.intervalMinutes === 60 ? value.intervalMinutes : 0,
    lastSentSlot: typeof value.lastSentSlot === 'string' ? value.lastSentSlot : null
  }
}

export const marketGuideSlot = (now: Date, intervalMinutes: MarketGuideInterval): string | null => {
  if (!intervalMinutes) return null

  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const day = local.getUTCDay()
  if (day === 0 || day === 6) return null

  const hour = local.getUTCHours()
  const minute = local.getUTCMinutes()
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const slots = intervalMinutes === 30
    ? ['09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00', '14:30']
    : ['09:30', '10:30', '13:00', '14:00']
  if (!slots.includes(time)) return null

  const date = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
  return `${date} ${time}`
}
