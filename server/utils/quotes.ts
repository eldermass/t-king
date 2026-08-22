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
const toTencentSymbol = (code: string) => code.startsWith('6') ? `sh${code}` : `sz${code}`
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

const buildQuote = (code: string, name: string, price: number | null, previousClose: number | null): QuoteSnapshot => {
  const change = price !== null && previousClose !== null ? price - previousClose : null
  const changePercent = change !== null && previousClose ? (change / previousClose) * 100 : null

  return {
    name: name || code,
    price,
    previousClose,
    change,
    changePercent,
    updatedAt: price !== null ? new Date().toISOString() : null
  }
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
    } catch {
      // Continue to the next source after the retry window expires.
    }
  }

  return emptyQuote(code)
}

const fetchTencentQuotes = async (codes: string[]) => {
  if (!codes.length) {
    return {}
  }

  try {
    const response = await fetch(`https://qt.gtimg.cn/q=${codes.map(toTencentSymbol).join(',')}`, {
      headers: {
        referer: 'https://gu.qq.com/',
        'user-agent': 'Mozilla/5.0'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      return {}
    }

    const text = await response.text()
    const result: Record<string, QuoteSnapshot> = {}
    const linePattern = /v_(sh|sz)(\d{6})="([^"]*)";/g
    let match: RegExpExecArray | null = null

    while ((match = linePattern.exec(text))) {
      const code = match[2]
      const values = match[3].split('~')
      const name = values[1]?.trim() || code
      const price = parseNumber(values[3])
      const previousClose = parseNumber(values[4])
      result[code] = buildQuote(code, name, price, previousClose)
    }

    return result
  } catch {
    return {}
  }
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
      result[code] = buildQuote(code, name, price, previousClose)
    }

    return result
  } catch (error) {
    return {}
  }
}

export const fetchQuotes = async (codes: string[]) => {
  const normalizedCodes = [...new Set(codes.map(normalizeCode).filter(isValidCode))]

  if (!normalizedCodes.length) {
    return {}
  }

  const tencentQuotes = await fetchTencentQuotes(normalizedCodes)
  const fallbackCodes = normalizedCodes.filter((code) => tencentQuotes[code]?.price === null)
  const eastmoneyEntries = await Promise.all(
    fallbackCodes.map(async (code) => [code, await fetchEastmoneyQuote(code)] as const)
  )
  const quotes = { ...Object.fromEntries(eastmoneyEntries), ...tencentQuotes } as Record<string, QuoteSnapshot>
  const sinaCodes = fallbackCodes.filter((code) => quotes[code]?.price === null)
  const sinaQuotes = await fetchSinaFallbackQuotes(sinaCodes)

  for (const code of sinaCodes) {
    const fallbackQuote = sinaQuotes[code]

    if (fallbackQuote?.price !== null && fallbackQuote?.price !== undefined) {
      quotes[code] = {
        ...fallbackQuote,
        name: quotes[code]?.name && quotes[code].name !== code
          ? quotes[code].name
          : fallbackQuote.name
      }
    }
  }

  return Object.fromEntries(normalizedCodes.map((code) => [code, quotes[code] ?? emptyQuote(code)]))
}
