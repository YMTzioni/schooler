import { getCaptionTrackInfo } from '../lib/youtubeCaptions.js'

const winners = [
  { host: '141.147.151.116', port: 3128, country: 'se' },
  { host: '45.133.107.234', port: 81, country: 'am' },
  { host: '45.95.233.237', port: 1081, country: 'ru' },
]

for (const proxy of winners) {
  process.env.YOUTUBE_PROXY_URL = `http://${proxy.host}:${proxy.port}`
  try {
    const info = await getCaptionTrackInfo('8w8M9GZobyI')
    console.log('OK captions', `${proxy.host}:${proxy.port}`, proxy.country, info.tracks?.length, info.tracks?.[0]?.lang)
  } catch (e) {
    console.log('FAIL captions', `${proxy.host}:${proxy.port}`, e.code || e.message)
  }
}
