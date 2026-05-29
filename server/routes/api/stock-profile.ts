type CompanySurveyItem = {
  SECURITY_NAME_ABBR?: string
  EM2016?: string
  ORG_PROFILE?: string
  BUSINESS_SCOPE?: string
}

type CompanySurveyResponse = {
  jbzl?: CompanySurveyItem[]
}

type CoreConceptItem = {
  KEYWORD?: string
  KEY_CLASSIF?: string
  IS_POINT?: string
  MAINPOINT?: number
  MAINPOINT_CONTENT?: string
}

type BoardItem = {
  BOARD_NAME?: string
  BOARD_RANK?: number
}

type CoreConceptResponse = {
  ssbk?: BoardItem[]
  hxtc?: CoreConceptItem[]
}

type StockProfile = {
  name: string
  subIndustry: string
  primaryTheme: string
  secondaryTheme: string
  coreBusiness: string
  updatedAt: string
}

type ThemeRule = {
  label: string
  patterns: RegExp[]
}

const BOARD_BLACKLIST = [
  /板块$/,
  /沪股通|深股通|融资融券|富时罗素|MSCI|创业板综|标普道琼斯|转融券标的/,
  /中盘|小盘|大盘/,
  /预盈预增|连续亏损|扭亏|高股息|低市盈率/,
  /昨日涨停|昨日连板|昨日触板/
]

const HOT_THEME_RULES: ThemeRule[] = [
  { label: 'AI', patterns: [/AI|AIGC|人工智能|大模型|生成式|智能营销|数字人/i] },
  { label: '算力', patterns: [/算力|智算|数据中心|GPU|服务器|东数西算|算力服务/i] },
  { label: '出海', patterns: [/出海|海外营销|全球营销|跨境|国际化|海外市场/i] },
  { label: '汽车电子', patterns: [/汽车电子|车载|智能座舱|车联网|汽车显示|新能源车/i] },
  { label: '消费电子', patterns: [/消费电子|智能手机|可穿戴|折叠屏|UTG/i] },
  { label: '面板', patterns: [/面板|显示器件|显示模组|触控显示|光学光电子|LCD|OLED|MiniLED/i] },
  { label: '营销', patterns: [/营销|广告|品牌传播|投放|营销代理|互联网营销/i] },
  { label: '元宇宙', patterns: [/元宇宙|虚拟人|虚拟空间|XR|AR|VR/i] },
  { label: '跨境电商', patterns: [/跨境电商|电商出海|跨境卖家/i] }
]

const normalizeCode = (code: string) => code.trim().replace(/[^\d]/g, '').slice(0, 6)

const isValidCode = (code: string) => /^(0|3|6)\d{5}$/.test(code)

const toEastmoneyCode = (code: string) => `${code.startsWith('6') ? 'SH' : 'SZ'}${code}`

const cleanText = (value: string | null | undefined) =>
  (value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

const simplifyTheme = (value: string) =>
  value
    .replace(/相关业务$/u, '')
    .replace(/业务$/u, '')
    .replace(/行业$/u, '')
    .trim()

const unique = <T>(list: T[]) => [...new Set(list)]

const simplifyBusinessTerm = (value: string) =>
  cleanText(value)
    .replace(/相关业务$/u, '')
    .replace(/业务$/u, '')
    .replace(/服务$/u, '')
    .trim()

const BUSINESS_GENERIC_TERMS = new Set(['主营', '主营业务', '主要业务', '业务'])

const normalizeBusinessSummary = (value: string) =>
  cleanText(value)
    .replace(/^公司(主营业务|主要业务)(包括|为)?/u, '')
    .replace(/^公司主要从事/u, '')
    .replace(/^主营业务(包括|为)?/u, '')
    .replace(/^主要业务(包括|为)?/u, '')
    .replace(/^主要从事/u, '')
    .replace(/^、+/u, '')
    .replace(/[。；;，,]+$/u, '')
    .trim()

const extractBusinessSummaryFromText = (value: string) => {
  const text = cleanText(value)

  if (!text) {
    return ''
  }

  const patterns = [
    /主营业务(?:包括|为)?([^。；;]+?)(?:领域|方向|板块|。|；|;)/u,
    /主要业务(?:包括|为)?([^。；;]+?)(?:领域|方向|板块|。|；|;)/u,
    /主要从事([^。；;]+?)(?:。|；|;|，并|,并|，属于|,属于)/u,
    /主营产品(?:为|包括)?([^。；;]+?)(?:。|；|;)/u
  ]

  for (const pattern of patterns) {
    const matched = text.match(pattern)?.[1]
    const summary = normalizeBusinessSummary(matched ?? '')

    if (summary) {
      return summary
    }
  }

  return normalizeBusinessSummary(text.split(/[。；;]/)[0] ?? '')
}

const summarizeCoreBusiness = (survey: CompanySurveyItem | undefined, concepts: CoreConceptItem[] = []) => {
  const mainBusinessItems = concepts.filter((item) => item.KEY_CLASSIF === '主营业务')
  const keywordPool = unique(
    mainBusinessItems
      .flatMap((item) => cleanText(item.KEYWORD).split(/[、,，/]/))
      .map((item) => simplifyBusinessTerm(item))
      .filter((item) => item && !BUSINESS_GENERIC_TERMS.has(item))
  )

  if (keywordPool.length >= 2) {
    return `${keywordPool.slice(0, 3).join('、')}等业务`
  }

  if (keywordPool.length === 1) {
    const first = keywordPool[0]
    return /业务$/u.test(first) ? first : `${first}等业务`
  }

  const contentSummary = mainBusinessItems
    .map((item) => extractBusinessSummaryFromText(item.MAINPOINT_CONTENT ?? ''))
    .find(Boolean)

  if (contentSummary) {
    return contentSummary
  }

  const profile = cleanText(survey?.ORG_PROFILE)
  const scope = cleanText(survey?.BUSINESS_SCOPE)
  const fallbackText = extractBusinessSummaryFromText(profile) || extractBusinessSummaryFromText(scope)

  if (!fallbackText) {
    return ''
  }

  return fallbackText
}

const isBoardTheme = (name: string) => !BOARD_BLACKLIST.some((pattern) => pattern.test(name))

const rankConceptTheme = (item: CoreConceptItem) => {
  const keyword = cleanText(item.KEYWORD)

  if (!keyword || keyword === '经营范围') {
    return -100
  }

  let score = 0

  if (item.KEY_CLASSIF === '主营业务') {
    score += 6
  } else if (item.KEY_CLASSIF === '行业背景') {
    score += 4
  } else if (item.KEY_CLASSIF === '核心竞争力') {
    score -= 2
  }

  if (item.IS_POINT === '1') {
    score += 2
  }

  if (/优势|能力|经验|品牌|资源|团队/u.test(keyword)) {
    score -= 3
  }

  if (/AI|人工智能|元宇宙|出海|算力|汽车电子|消费电子|光学|面板|营销|广告|跨境/u.test(keyword)) {
    score += 2
  }

  if (keyword.length <= 10) {
    score += 1
  }

  return score
}

const pickThemes = (boards: BoardItem[] = [], concepts: CoreConceptItem[] = []) => {
  const candidates = new Map<string, number>()

  for (const item of concepts) {
    const keyword = simplifyTheme(cleanText(item.KEYWORD))
    const score = rankConceptTheme(item)

    if (!keyword || score < 0) {
      continue
    }

    candidates.set(keyword, Math.max(candidates.get(keyword) ?? Number.NEGATIVE_INFINITY, score))
  }

  for (const [index, board] of boards.entries()) {
    const name = cleanText(board.BOARD_NAME)

    if (!name || !isBoardTheme(name)) {
      continue
    }

    const score = 3 - Math.min(index, 2)
    candidates.set(name, Math.max(candidates.get(name) ?? Number.NEGATIVE_INFINITY, score))
  }

  return [...candidates.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].length - right[0].length)
    .map(([name]) => name)
    .filter((name, index, list) => list.findIndex((item) => item.includes(name) || name.includes(item)) === index)
    .slice(0, 2)
}

const pickHotThemes = (survey: CompanySurveyItem | undefined, boards: BoardItem[] = [], concepts: CoreConceptItem[] = []) => {
  const texts = [
    survey?.EM2016,
    survey?.ORG_PROFILE,
    survey?.BUSINESS_SCOPE,
    ...boards.map((item) => item.BOARD_NAME),
    ...concepts.flatMap((item) => [item.KEYWORD, item.KEY_CLASSIF])
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)

  const scoredThemes = HOT_THEME_RULES
    .map((rule, index) => {
      let score = 0

      for (const text of texts) {
        for (const pattern of rule.patterns) {
          if (pattern.test(text)) {
            score += text.length <= 16 ? 3 : 2
          }
        }
      }

      return {
        label: rule.label,
        score,
        index
      }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.label)

  const fallbackThemes = pickThemes(boards, concepts)

  return unique([...scoredThemes, ...fallbackThemes]).slice(0, 2)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawCodes = typeof query.codes === 'string' ? query.codes : ''
  const codes = [...new Set(rawCodes.split(',').map(normalizeCode).filter(isValidCode))]

  if (!codes.length) {
    return {}
  }

  const result = await Promise.all(
    codes.map(async (code) => {
      const eastmoneyCode = toEastmoneyCode(code)

      try {
        const [surveyResponse, conceptResponse] = await Promise.all([
          $fetch<CompanySurveyResponse>('https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax', {
            headers: {
              referer: 'https://emweb.securities.eastmoney.com/',
              'user-agent': 'Mozilla/5.0'
            },
            query: {
              code: eastmoneyCode
            }
          }),
          $fetch<CoreConceptResponse>('https://emweb.securities.eastmoney.com/PC_HSF10/CoreConception/PageAjax', {
            headers: {
              referer: 'https://emweb.securities.eastmoney.com/',
              'user-agent': 'Mozilla/5.0'
            },
            query: {
              code: eastmoneyCode
            }
          })
        ])

        const survey = surveyResponse.jbzl?.[0]
        const themes = pickHotThemes(survey, conceptResponse.ssbk, conceptResponse.hxtc)

        return [
          code,
          {
            name: cleanText(survey?.SECURITY_NAME_ABBR) || code,
            subIndustry: cleanText(survey?.EM2016),
            primaryTheme: themes[0] ?? '',
            secondaryTheme: themes[1] ?? '',
            coreBusiness: summarizeCoreBusiness(survey, conceptResponse.hxtc),
            updatedAt: new Date().toISOString()
          } satisfies StockProfile
        ] as const
      } catch (error) {
        console.error(`stock profile route failed for ${code}`, error)

        return [
          code,
          {
            name: code,
            subIndustry: '',
            primaryTheme: '',
            secondaryTheme: '',
            coreBusiness: '',
            updatedAt: new Date().toISOString()
          } satisfies StockProfile
        ] as const
      }
    })
  )

  return Object.fromEntries(result)
})
