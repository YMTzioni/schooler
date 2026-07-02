import axios from 'axios'

const PUBPROXY_API = 'http://pubproxy.com/api/proxy'
const PUBPROXY_TIMEOUT_MS = 10_000

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

export const fetchPubProxy = async () => {
  try {
    const response = await axios.get(`${PUBPROXY_API}?${buildPubProxyQuery()}`, {
      timeout: PUBPROXY_TIMEOUT_MS,
      validateStatus: () => true,
    })

    const payload = response.data
    if (typeof payload === 'string') {
      if (payload.toLowerCase().includes('no proxy')) return null
      try {
        return parsePubProxyEntry(JSON.parse(payload)?.data?.[0])
      } catch {
        return null
      }
    }

    return parsePubProxyEntry(payload?.data?.[0])
  } catch {
    return null
  }
}

const parsePubProxyEntry = (entry) => {
  if (!entry?.ip || !entry?.port) return null

  return {
    host: entry.ip,
    port: Number(entry.port),
    protocol: 'http',
    country: entry.country || null,
    level: entry.proxy_level || null,
  }
}

export const toAxiosProxy = (proxy) => {
  if (!proxy?.host || !proxy?.port) return null
  return {
    host: proxy.host,
    port: proxy.port,
    protocol: proxy.protocol || 'http',
  }
}
