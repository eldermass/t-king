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
const toSinaSymbol = (code: string) => code.startsWith('6') ? `sh${code}` : `sz${code}`
const toPrice = (value?: number) => (typeof value === 'number' ? value / 100 : null)

const emptyQuote = (code: string): QuoteSnapshot => ({
  name: code,
  price: null,
  previousClose: null,
  change: null,
  changePercent: null,
  updatedAt: null
})

const parseNumber = (value: string | undefined) => {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const decodeSinaQuoteText = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)

  for (const encoding of ['gb18030', 'gbk']) {
    try {
      return new TextDecoder(encoding).decode(bytes)
    } catch {
      continue
    }
  }

  return new TextDecoder().decode(bytes)
}

const fetchEastmoneyQuote = async (code: string): Promise<QuoteSnapshot> => {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await $fetch<EastmoneyResponse>('https://push2.eastmoney.com/api/qt/stock/get', {
        headers: {
          referer: 'https://quote.eastmoney.com/',
          'user-agent': 'Mozilla/5.0'
        },
        query: {
          secid: toSecid(code),
          fields: 'f43,f58,f60,f169,f170'
        },
        timeout: 3500
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

      if (price !== null) {
        return {
          name: data?.f58 ?? code,
          price,
          previousClose,
          change,
          changePercent,
          updatedAt: new Date().toISOString()
        }
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    console.error(`eastmoney quote fetch failed for ${code}`, lastError)
  }

  return emptyQuote(code)
}

const fetchSinaFallbackQuotes = async (codes: string[]) => {
  if (!codes.length) {
    return {}
  }

  try {
    const response = await fetch(`https://hq.sinajs.cn/list=${codes.map(toSinaSymbol).join(',')}`, {
      headers: {
        referer: 'https://finance.sina.com.cn/',
        'user-agent': 'Mozilla/5.0'
      }
    })

    const text = decodeSinaQuoteText(await response.arrayBuffer())
    const result: Record<string, QuoteSnapshot> = {}
    const linePattern = /var hq_str_(sh|sz)(\d{6})="([^"]*)";/g
    let match: RegExpExecArray | null = null

    while ((match = linePattern.exec(text))) {
      const code = match[2]
      const values = match[3].split(',')
      const name = values[0]?.trim() || code
      const previousClose = parseNumber(values[2])
      const price = parseNumber(values[3])
      const change = price !== null && previousClose !== null ? price - previousClose : null
      const changePercent = change !== null && previousClose ? (change / previousClose) * 100 : null

      result[code] = {
        name,
        price,
        previousClose,
        change,
        changePercent,
        updatedAt: price !== null ? new Date().toISOString() : null
      }
    }

    return result
  } catch (error) {
    console.error('sina fallback quote fetch failed', error)
    return {}
  }
}

export const fetchQuotes = async (codes: string[]) => {
  const normalizedCodes = [...new Set(codes.map(normalizeCode).filter(isValidCode))]

  if (!normalizedCodes.length) {
    return {}
  }

  const eastmoneyEntries = await Promise.all(
    normalizedCodes.map(async (code) => [code, await fetchEastmoneyQuote(code)] as const)
  )
  const eastmoneyQuotes = Object.fromEntries(eastmoneyEntries) as Record<string, QuoteSnapshot>
  const fallbackCodes = normalizedCodes.filter((code) => eastmoneyQuotes[code]?.price === null)
  const sinaQuotes = await fetchSinaFallbackQuotes(fallbackCodes)

  for (const code of fallbackCodes) {
    const fallbackQuote = sinaQuotes[code]

    if (fallbackQuote?.price !== null && fallbackQuote?.price !== undefined) {
      eastmoneyQuotes[code] = {
        ...fallbackQuote,
        name: eastmoneyQuotes[code]?.name && eastmoneyQuotes[code].name !== code
          ? eastmoneyQuotes[code].name
          : fallbackQuote.name
      }
    }
  }

  return eastmoneyQuotes
}
