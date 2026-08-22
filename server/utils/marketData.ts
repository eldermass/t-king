import type { H3Event } from 'h3'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type MarketDataRow = {
  tradeDate: string
  shIndexChange: number
  chinextIndexChange: number
  sci50IndexChange: number
  volume: number | null
  volumeChange: number | null
  advancers: number | null
  decliners: number | null
  limitUpCount: number | null
  limitDownCount: number | null
  sentimentScore: number | null
  updatedAt: string
}

type Db = { prepare: (sql: string) => { bind: (...args: unknown[]) => { all: <T>() => Promise<{ results?: T[] }>; run: () => Promise<unknown> } } }
const dbFor = (event: H3Event) => (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB as Db | undefined
const localPath = join(process.cwd(), '.data', 'market-data.json')
let localWrite = Promise.resolve()
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : null }
const dateText = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())

const localSeed: MarketDataRow[] = [
  ['2026-08-21', .0058, .0126, .0105, 26340, .0925, 3020, 1850, 58, 10, 59],
  ['2026-08-20', -.0041, -.0110, -.0086, 24110, -.0720, 2204, 2670, 44, 12, 46],
  ['2026-08-19', .0025, .0094, .0061, 25980, .0347, 3310, 1560, 69, 5, 62],
  ['2026-08-18', .0064, .0220, .0188, 25110, .1362, 3572, 1240, 77, 3, 68],
  ['2026-08-17', -.0078, -.0162, -.0130, 22101, -.1024, 1830, 2801, 39, 15, 41],
  ['2026-08-14', .0011, .0038, .0049, 24620, -.0413, 2468, 204, 66, 2, 49],
  ['2026-08-13', -.0050, -.0045, -.0130, 25681, .1850, 1142, 51, 59, 4, 23],
  ['2026-08-12', .0032, .0149, .0111, 21673, -.1560, 4128, 78, 92, 0, 83],
  ['2026-08-11', -.0050, -.0045, -.0130, 25681, .1850, 1142, 51, 59, 4, 23],
  ['2026-08-10', .0032, .0149, .0111, 21673, -.0720, 4128, 78, 92, 0, 83],
  ['2026-08-07', -.0082, .0034, -.0027, 23357, -.0800, 1615, 51, 58, 1, 32],
  ['2026-08-06', .0067, -.0073, .0330, 25389, -.0540, 4068, 72, 99, 5, 81],
  ['2026-08-05', .0102, .0135, .0026, 26836, .0533, 2856, 63, 74, 4, 57],
  ['2026-08-04', .0057, -.0055, .0120, 25477, -.0494, 2789, 76, 79, 1, 56],
  ['2026-08-03', .0147, .0132, .0030, 26801, .2027, 3725, 95, 103, 1, 74],
  ['2026-07-31', .0033, .0564, .0158, 22287, .1081, 3642, 92, 138, 0, 73],
  ['2026-07-30', -.0059, -.0124, .0365, 20113, -.2144, 4005, 72, 26, 13, 63],
  ['2026-07-29', .0072, .0306, .0300, 25601, .0854, 4691, 0, 42, 91, 81],
  ['2026-07-28', -.0062, -.0397, -.0106, 23587, .0199, 1768, 49, 52, 74, 49],
  ['2026-07-27', .0040, .0155, .0217, 23120, .0085, 4253, 572, 81, 20, 72]
].map(([tradeDate, shIndexChange, chinextIndexChange, sci50IndexChange, volume, _volumeChange, advancers, decliners, limitUpCount, limitDownCount, sentimentScore]) => ({ tradeDate: tradeDate as string, shIndexChange: shIndexChange as number, chinextIndexChange: chinextIndexChange as number, sci50IndexChange: sci50IndexChange as number, volume: volume as number, volumeChange: null, advancers: advancers as number, decliners: decliners as number, limitUpCount: limitUpCount as number, limitDownCount: limitDownCount as number, sentimentScore: sentimentScore as number, updatedAt: `${tradeDate}T15:05:00+08:00` }))

localSeed.forEach((row, index) => {
  const previous = localSeed[index + 1]
  row.volumeChange = previous?.volume !== null && previous?.volume !== undefined && row.volume !== null ? row.volume - previous.volume : null
})

const readLocal = async () => {
  try {
    const parsed = JSON.parse(await readFile(localPath, 'utf8'))
    return Array.isArray(parsed) ? parsed as MarketDataRow[] : localSeed
  } catch {
    await mkdir(join(process.cwd(), '.data'), { recursive: true })
    await writeFile(localPath, JSON.stringify(localSeed, null, 2), 'utf8')
    return localSeed
  }
}

const writeLocal = async (row: MarketDataRow) => {
  localWrite = localWrite.then(async () => {
    const rows = (await readLocal()).filter((item) => item.tradeDate !== row.tradeDate)
    rows.unshift(row)
    await mkdir(join(process.cwd(), '.data'), { recursive: true })
    await writeFile(localPath, JSON.stringify(rows.slice(0, 60), null, 2), 'utf8')
  })
  return localWrite
}

const fetchIndex = async (code: string) => {
  const response = await $fetch<string>(`https://qt.gtimg.cn/q=${code}`, { headers: { referer: 'https://gu.qq.com/' }, timeout: 5000, retry: 1 }).catch(() => '')
  const parts = response.split('~')
  return { change: num(parts[32]), volume: num(parts[37]) }
}

const fetchStocks = async () => {
  const response = await $fetch<{ data?: { diff?: Array<Record<string, unknown>> } }>('https://push2.eastmoney.com/api/qt/clist/get', {
    headers: { referer: 'https://quote.eastmoney.com/center/gridlist.html', 'user-agent': 'Mozilla/5.0' },
    query: { pn: 1, pz: 6000, po: 1, np: 1, fltt: 2, invt: 2, fid: 'f3', fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23', fields: 'f3,f12' },
    timeout: 8000,
    retry: 1
  }).catch(() => null)
  return response?.data?.diff ?? []
}

const calculate = async (event: H3Event): Promise<MarketDataRow> => {
  const [sh, chinext, sci50, rows] = await Promise.all([fetchIndex('sh000001'), fetchIndex('sz399006'), fetchIndex('sh000688'), fetchStocks()])
  const previous = await getMarketDataHistory(event, 1).catch(() => localSeed.slice(0, 1))
  const fallback = previous[0] ?? localSeed[0]
  const changes = rows.map((row) => num(row.f3)).filter((value): value is number => value !== null)
  const advancers = changes.filter((value) => value > 0).length
  const decliners = changes.filter((value) => value < 0).length
  const total = changes.length || 1
  const limitUpCount = changes.length ? changes.filter((value) => value >= 9.8).length : fallback.limitUpCount
  const limitDownCount = changes.length ? changes.filter((value) => value <= -9.8).length : fallback.limitDownCount
  const breadth = (advancers / total) * 100
  const sentimentScore = Math.max(0, Math.min(100, breadth * 0.55 + Math.min(limitUpCount, 100) * 0.35 - Math.min(limitDownCount, 50) * 0.3))
  const volume = sh.volume ?? fallback.volume
  const previousVolume = fallback.volume
  return { tradeDate: dateText(), shIndexChange: (sh.change ?? fallback.shIndexChange * 100) / 100, chinextIndexChange: (chinext.change ?? fallback.chinextIndexChange * 100) / 100, sci50IndexChange: (sci50.change ?? fallback.sci50IndexChange * 100) / 100, volume, volumeChange: volume !== null && previousVolume !== null ? volume - previousVolume : fallback.volumeChange, advancers: changes.length ? advancers : fallback.advancers, decliners: changes.length ? decliners : fallback.decliners, limitUpCount, limitDownCount, sentimentScore: changes.length ? sentimentScore : fallback.sentimentScore, updatedAt: new Date().toISOString() }
}

export const getMarketDataHistory = async (event: H3Event, days = 60) => {
  const db = dbFor(event)
  if (!db) return (await readLocal()).slice(0, days)
  const result = await db.prepare('SELECT trade_date AS tradeDate, sh_index_change AS shIndexChange, chinext_index_change AS chinextIndexChange, sci50_index_change AS sci50IndexChange, volume, volume_change AS volumeChange, advancers, decliners, limit_up_count AS limitUpCount, limit_down_count AS limitDownCount, sentiment_score AS sentimentScore, updated_at AS updatedAt FROM market_data_daily ORDER BY trade_date DESC LIMIT ?').bind(days).all<MarketDataRow>()
  return result.results ?? []
}

export const updateMarketData = async (event: H3Event) => {
  const db = dbFor(event)
  const row = await calculate(event)
  if (!db) {
    await writeLocal(row)
    return row
  }
  await db.prepare('INSERT OR REPLACE INTO market_data_daily (trade_date, sh_index_change, chinext_index_change, sci50_index_change, volume, volume_change, advancers, decliners, limit_up_count, limit_down_count, sentiment_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM market_data_daily WHERE trade_date = ?), ?), ?)').bind(row.tradeDate, row.shIndexChange, row.chinextIndexChange, row.sci50IndexChange, row.volume, row.volumeChange, row.advancers, row.decliners, row.limitUpCount, row.limitDownCount, row.sentimentScore, row.tradeDate, row.updatedAt, row.updatedAt).run()
  return row
}
