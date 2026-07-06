import axios from 'axios'

const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' }
const COMMON_HTTP_PORTS = new Set([80, 81, 443, 591, 800, 808, 8080, 8081, 8888, 3128, 53281])

const page = await axios.get('https://floppydata.com/free-proxy/', { headers, timeout: 15000 })
const m = page.data.match(/'Authorization'\s*:\s*'([^']+)'/)
const r = await axios.get('https://geoxy.io/proxies?count=200', {
  headers: { authorization: m[1], 'content-type': 'application/json' },
  timeout: 20000,
})

const proxies = r.data
  .map((item) => {
    const [host, portRaw] = String(item.address || '').split(':')
    const port = Number(portRaw)
    const protocols = item.protocols || []
    const isHttp = protocols.some((p) => /^https?$/i.test(p))
    if (!host || !port || !isHttp) return null
    if (port === 1080 || protocols.some((p) => /socks/i.test(p))) return null
    return {
      host,
      port,
      country: item.country,
      ping: item.ping,
      anonymity: item.anonymityLevel,
      protocols,
      score: COMMON_HTTP_PORTS.has(port) ? 1 : 0,
    }
  })
  .filter(Boolean)
  .sort((a, b) => b.score - a.score)

console.log('http candidates', proxies.length)

const testOne = (p) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 6000)
    axios
      .get('https://www.youtube.com/watch?v=8w8M9GZobyI', {
        proxy: { host: p.host, port: p.port, protocol: 'http' },
        headers,
        timeout: 5000,
        validateStatus: () => true,
      })
      .then((yt) => {
        clearTimeout(timer)
        const ok = yt.status === 200 && String(yt.data).includes('ytInitialData')
        resolve({ ok, status: yt.status })
      })
      .catch((e) => {
        clearTimeout(timer)
        resolve({ ok: false, error: e.code || e.message })
      })
  })

let ok = 0
for (let i = 0; i < Math.min(25, proxies.length); i += 1) {
  const p = proxies[i]
  const result = await testOne(p)
  const label = `${p.host}:${p.port} ${p.country} ${p.ping}`
  if (result.ok) {
    ok += 1
    console.log('OK ', label)
  } else {
    console.log('BAD', label, result.status || result.error)
  }
}
console.log('summary', ok, '/', Math.min(25, proxies.length))
