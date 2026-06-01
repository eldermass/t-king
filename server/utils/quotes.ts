type EastmoneyResponse = {
  data?: {
    f43?: number
    f58?: string
    f60?: number
    f169?: number
    f170?: number
  }
}

export type QuoteSnapshot = {
  name: string
  price: number | null
  previousClose: number | null
  change: number | null
  changePercent: number | null
  updatedAt: string | null
}

export const normalizeCode = (code: string) => code.trim().replace(/[^\d]/g, '').slice(0, 6)

export const isValidCode = (code: string) => /^(0|3|6)\d{5}$/.test(code)

const toSecid = (code: string) => code.startsWith('6') ? `1.${code}` : `0.${code}`
const toPrice = (value?: number) => (typeof value === 'number' ? value / 100 : null)

export const fetchQuotes = async (codes: string[]) => {
  const normalizedCodes = [...new Set(codes.map(normalizeCode).filter(isValidCode))]

  if (!normalizedCodes.length) {
    return {}
  }

  const result = await Promise.all(
    normalizedCodes.map(async (code) => {
      try {
        const response = await $fetch<EastmoneyResponse>('https://push2.eastmoney.com/api/qt/stock/get', {
          headers: {
            referer: 'https://quote.eastmoney.com/',
            'user-agent': 'Mozilla/5.0'
          },
          query: {
            secid: toSecid(code),
            fields: 'f43,f58,f60,f169,f170'
          }
        })

        const data = response.data
        const price = toPrice(data?.f43)
        const previousClose = toPrice(data?.f60)
        const change = typeof data?.f169 === 'number'
          ? data.f169 / 100
          : price !== null && previousClose !== null
            ? price - previousClose
            : null
        const changePercent = typeof data?.f170 === 'number'
          ? data.f170 / 100
          : change !== null && previousClose
            ? (change / previousClose) * 100
            : null

        return [
          code,
          {
            name: data?.f58 ?? code,
            price,
            previousClose,
            change,
            changePercent,
            updatedAt: new Date().toISOString()
          }
        ] as const
      } catch (error) {
        console.error(`quote fetch failed for ${code}`, error)

        return [
          code,
          {
            name: code,
            price: null,
            previousClose: null,
            change: null,
            changePercent: null,
            updatedAt: null
          }
        ] as const
      }
    })
  )

  return Object.fromEntries(result) as Record<string, QuoteSnapshot>
}
