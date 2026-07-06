import axios from 'axios'

const PUBPROXY_API = 'http://pubproxy.com/api/proxy'
const PROXYSCRAPE_API =
  'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http&format=json'
const FLOPPYDATA_PAGE = 'https://floppydata.com/free-proxy/'
const GEOXY_API = 'https://geoxy.io/proxies'
const PROXY_LOOKUP_TIMEOUT_MS = 8_000
const FLOPPYDATA_PAGE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}
const COMMON_HTTP_PORTS = new Set([80, 81, 443, 808, 8080, 8081, 3128, 8888, 53281])

const buildPubProxyQuery = () => {
  const params = new URLSearchParams({
    format: 'json',
    type: 'http',
    limit: '1',
    last_check: '120',
    speed: '25',
    post: 'true',
    user_agent: 'true',
  })

  if (process.env.PUBPROXY_API_KEY) {
    params.set('api', process.env.PUBPROXY_API_KEY)
  }

  return params.toString()
}

const normalizeProxy = ({ host, port, protocol = 'http', country = null, source = null }) => {
  if (!host || !port) return null
  return {
    host,
    port: Number(port),
    protocol,
    country,
    source,
  }
}

export const fetchPubProxy = async () => {
  try {
    const response = await axios.get(`${PUBPROXY_API}?${buildPubProxyQuery()}`, {
      timeout: PROXY_LOOKUP_TIMEOUT_MS,
      validateStatus: () => true,
    })

    const payload = response.data
    if (typeof payload === 'string') {
      if (payload.toLowerCase().includes('no proxy')) return null
      try {
        const entry = JSON.parse(payload)?.data?.[0]
        return normalizeProxy({
          host: entry?.ip,
          port: entry?.port,
          country: entry?.country,
          source: 'pubproxy',
        })
      } catch {
        return null
      }
    }

    const entry = payload?.data?.[0]
    return normalizeProxy({
      host: entry?.ip,
      port: entry?.port,
      country: entry?.country,
      source: 'pubproxy',
    })
  } catch {
    return null
  }
}

const readFloppyDataAuthToken = (html) => {
  const match =
    html.match(/'Authorization'\s*:\s*'([^']+)'/) ||
    html.match(/Authorization\s*:\s*['"`]([^'"`]+)['"`]/i)
  return match?.[1] || null
}

const isFloppyHttpProxy = (entry) => {
  const protocols = entry?.protocols || []
  const hasHttp = protocols.some((protocol) => /^https?$/i.test(protocol))
  const hasSocks = protocols.some((protocol) => /socks/i.test(protocol))
  const [host, portRaw] = String(entry?.address || '').split(':')
  const port = Number(portRaw)
  if (!host || !port || !hasHttp || hasSocks || port === 1080) return null
  return { host, port }
}

export const fetchFloppyDataBatch = async (limit = 20) => {
  try {
    const page = await axios.get(FLOPPYDATA_PAGE, {
      headers: FLOPPYDATA_PAGE_HEADERS,
      timeout: PROXY_LOOKUP_TIMEOUT_MS,
      validateStatus: () => true,
    })
    if (page.status !== 200) return []

    const authToken = readFloppyDataAuthToken(page.data)
    if (!authToken) return []

    const response = await axios.get(`${GEOXY_API}?count=${Math.max(limit * 4, 80)}`, {
      headers: {
        ...FLOPPYDATA_PAGE_HEADERS,
        authorization: authToken,
        'content-type': 'application/json',
      },
      timeout: PROXY_LOOKUP_TIMEOUT_MS,
      validateStatus: () => true,
    })

    if (!Array.isArray(response.data)) return []

    return response.data
      .map((entry) => {
        const parsed = isFloppyHttpProxy(entry)
        if (!parsed) return null
        return normalizeProxy({
          host: parsed.host,
          port: parsed.port,
          country: entry.country || null,
          source: 'floppydata',
          score: COMMON_HTTP_PORTS.has(parsed.port) ? 1 : 0,
        })
      })
      .filter(Boolean)
      .sort((left, right) => (right.score || 0) - (left.score || 0))
      .slice(0, limit)
  } catch {
    return []
  }
}

export const fetchProxyScrapeBatch = async (limit = 12) => {
  try {
    const response = await axios.get(`${PROXYSCRAPE_API}&limit=${limit}`, {
      timeout: PROXY_LOOKUP_TIMEOUT_MS,
      validateStatus: () => true,
    })

    const proxies = response.data?.proxies
    if (!Array.isArray(proxies)) return []

    return proxies
      .filter((entry) => entry?.alive && entry?.protocol === 'http' && entry?.ip && entry?.port)
      .sort((left, right) => {
        const hostingPenalty = (entry) => (entry.ip_data?.hosting ? 1 : 0)
        const hostingDiff = hostingPenalty(left) - hostingPenalty(right)
        if (hostingDiff !== 0) return hostingDiff
        return (right.uptime || 0) - (left.uptime || 0)
      })
      .map((entry) =>
        normalizeProxy({
          host: entry.ip,
          port: entry.port,
          country: entry.ip_data?.countryCode || entry.ip_data?.country || null,
          source: 'proxyscrape',
        }),
      )
      .filter(Boolean)
  } catch {
    return []
  }
}

export const fetchFreeProxyPool = async ({ max = 15 } = {}) => {
  const pubProxySlots = Math.min(2, max)
  const floppyLimit = Math.min(10, Math.max(max - pubProxySlots, 6))
  const scrapeLimit = Math.max(max - pubProxySlots - floppyLimit, 4)

  const [scrapeBatch, floppyBatch, ...pubProxies] = await Promise.all([
    fetchProxyScrapeBatch(scrapeLimit),
    fetchFloppyDataBatch(floppyLimit),
    ...Array.from({ length: pubProxySlots }, () => fetchPubProxy()),
  ])

  const seen = new Set()
  const pool = []

  const addProxy = (proxy) => {
    if (!proxy) return
    const key = `${proxy.host}:${proxy.port}`
    if (seen.has(key)) return
    seen.add(key)
    pool.push(proxy)
  }

  floppyBatch.forEach(addProxy)
  scrapeBatch.forEach(addProxy)
  pubProxies.forEach(addProxy)

  return pool.slice(0, max)
}

let cachedPool = []
let cachedPoolAt = 0
const POOL_TTL_MS = 45_000

export const getFreeProxyPool = async ({ max = 15, forceRefresh = false } = {}) => {
  const freshEnough = cachedPool.length && Date.now() - cachedPoolAt < POOL_TTL_MS
  if (!forceRefresh && freshEnough) {
    return cachedPool.slice(0, max)
  }

  cachedPool = await fetchFreeProxyPool({ max })
  cachedPoolAt = Date.now()
  return cachedPool.slice(0, max)
}

export const toAxiosProxy = (proxy) => {
  if (!proxy?.host || !proxy?.port) return null
  return {
    host: proxy.host,
    port: proxy.port,
    protocol: proxy.protocol || 'http',
  }
}
