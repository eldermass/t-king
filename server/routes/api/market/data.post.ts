import { updateMarketData } from '~/server/utils/marketData'

export default defineEventHandler(async (event) => updateMarketData(event))
