import axios from 'axios'
import { getCaptionTrackInfo } from '../lib/youtubeCaptions.js'

const VIDEO_ID = '8w8M9GZobyI'
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}

const fetchFloppyDataProxies = async (limit = 80) => {
  const page = await axios.get('https://floppydata.com/free-proxy/', {
    headers,
    timeout: 15000,
  })

  const authMatch =
    page.data.match(/'Authorization'\s*:\s*'([^']+)'/) ||
    page.data.match(/Authorization\s*:\s*['"`]([^'"`]+)['"`]/i)

  if (!authMatch?.[1]) {
    throw new Error('לא נמצא authorization token בדף FloppyData')
  }

  const response = await axios.get(`https://geoxy.io/proxies?count=${limit}`, {
    headers: {
      ...headers,
      authorization: authMatch[1],
      'content-type': 'application/json',
    },
    timeout: 20000,
  })

  return (response.data || [])
    .map((item) => {
      const [host, port] = String(item.address || '').split(':')
      const protocol = (item.protocols || []).find((p) => /https?/i.test(p)) || 'http'
      if (!host || !port) return null
      return {
        host,
        port: Number(port),
        protocol: protocol.toLowerCase().includes('https') ? 'https' : 'http',
        country: item.country || null,
        ping: item.ping || null,
        anonymity: item.anonymityLevel || null,
        source: 'floppydata',
      }
    })
    .filter(Boolean)
}

const testProxyOnYouTube = async (proxy) => {
  try {
    const response = await axios.get(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
      proxy: { host: proxy.host, port: proxy.port, protocol: proxy.protocol },
      headers,
      timeout: 8000,
      validateStatus: () => true,
    })
    const ok = response.status === 200 && String(response.data).includes('ytInitialData')
    return { ok, status: response.status }
  } catch (error) {
    return { ok: false, error: error.code || error.message }
  }
}

const main = async () => {
  console.log('מוריד רשימת FloppyData...')
  const proxies = await fetchFloppyDataProxies(120)
  console.log(`נמצאו ${proxies.length} פרוקסי HTTP/HTTPS`)

  const sample = proxies.slice(0, 20)
  console.log('sample size', sample.length, 'first', sample[0])
  console.log('\nבודק 20 ראשונים מול YouTube watch page...')
  let working = 0
  for (const proxy of sample) {
    process.stdout.write('.')
    const result = await testProxyOnYouTube(proxy)
    const label = `${proxy.host}:${proxy.port} (${proxy.country}, ${proxy.ping || '?'})`
    if (result.ok) {
      working += 1
      console.log('OK  ', label)
    } else {
      console.log('FAIL', label, result.status || result.error)
    }
  }
  console.log(`\nעובדים: ${working}/${sample.length}`)

  if (working) {
    const winner = sample.find(async (p) => (await testProxyOnYouTube(p)).ok)
    const firstOk = sample[0]
    for (const proxy of sample) {
      const r = await testProxyOnYouTube(proxy)
      if (!r.ok) continue
      console.log('\nבודק caption-tracks דרך פרוקסי', `${proxy.host}:${proxy.port}`)
      process.env.YOUTUBE_PROXY_URL = `${proxy.protocol}://${proxy.host}:${proxy.port}`
      try {
        const info = await getCaptionTrackInfo(VIDEO_ID)
        console.log('caption-tracks OK:', info.tracks?.length, 'tracks')
      } catch (error) {
        console.log('caption-tracks FAIL:', error.message)
      }
      break
    }
  }
}

main().catch((error) => {
  console.error('שגיאה:', error.message)
  process.exit(1)
})
