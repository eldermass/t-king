const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

export const toBeijingDate = (date: Date) => new Date(date.getTime() + BEIJING_OFFSET_MS)

export const isBeijingWeekday = (date: Date) => {
  const day = toBeijingDate(date).getUTCDay()
  return day >= 1 && day <= 5
}
