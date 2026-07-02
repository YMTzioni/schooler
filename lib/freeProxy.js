import axios from 'axios'

const PUBPROXY_API = 'http://pubproxy.com/api/proxy'
const PROXYSCRAPE_API =
  'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http&format=json'
const PROXY_LOOKUP_TIMEOUT_MS = 8_000

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
  const pubProxySlots = Math.min(3, max)
  const scrapeLimit = Math.max(max - pubProxySlots, 8)

  const [scrapeBatch, ...pubProxies] = await Promise.all([
    fetchProxyScrapeBatch(scrapeLimit),
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
