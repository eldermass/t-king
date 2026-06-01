import { fetchQuotes, isValidCode, normalizeCode } from '~/server/utils/quotes'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawCodes = typeof query.codes === 'string' ? query.codes : ''
  const codes = [...new Set(rawCodes.split(',').map(normalizeCode).filter(isValidCode))]

  return fetchQuotes(codes)
})
