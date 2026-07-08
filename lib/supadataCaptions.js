import axios from 'axios'

const SUPADATA_BASE = 'https://api.supadata.ai/v1'
const POLL_INTERVAL_MS = 1_000
const POLL_MAX_ATTEMPTS = 90

const formatVttTime = (seconds) => {
  const totalMs = Math.round(seconds * 1000)
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export const isSupadataConfigured = () => Boolean(process.env.SUPADATA_API_KEY?.trim())

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const segmentsToVtt = (segments) => {
  let vtt = 'WEBVTT\n\n'
  segments.forEach((segment, index) => {
    const offsetMs = Number(segment.offset) || 0
    const durationMs = Number(segment.duration) || 0
    const start = formatVttTime(offsetMs / 1000)
    const end = formatVttTime((offsetMs + Math.max(durationMs, 500)) / 1000)
    const text = String(segment.text || '').replace(/\n+/g, ' ').trim()
    if (!text) return
    vtt += `${index + 1}\n${start} --> ${end}\n${text}\n\n`
  })
  return vtt.trim()
}

const resolveJobResult = async (jobId, apiKey) => {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    const response = await axios.get(`${SUPADATA_BASE}/transcript/${jobId}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 30_000,
      validateStatus: (status) => status < 500,
    })

    if (response.status === 404) {
      throw new Error('משימת תמלול של Supadata פגה או לא נמצאה')
    }

    const data = response.data || {}
    if (data.status === 'completed') {
      return data
    }
    if (data.status === 'failed') {
      throw new Error(data.error || 'תמלול Supadata נכשל')
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('תמלול Supadata חרג ממגבלת הזמן')
}

/**
 * מביא כתוביות מ-Supadata ומחזיר VTT + מטא-דאטה.
 * @see https://docs.supadata.ai/get-transcript
 */
export const fetchSupadataSubtitleSource = async (videoId, { lang = 'auto' } = {}) => {
  const apiKey = process.env.SUPADATA_API_KEY?.trim()
  if (!apiKey) return null

  const params = {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    mode: 'auto',
    text: false,
  }
  if (lang && lang !== 'auto' && lang !== 'none') {
    params.lang = lang
  }

  let response = await axios.get(`${SUPADATA_BASE}/transcript`, {
    params,
    headers: { 'x-api-key': apiKey },
    timeout: 90_000,
    validateStatus: (status) => status < 500,
  })

  if (response.status === 202 && response.data?.jobId) {
    response = {
      status: 200,
      data: await resolveJobResult(response.data.jobId, apiKey),
    }
  }

  if (response.status === 206 || response.status === 404 || response.status === 403) {
    return null
  }

  if (response.status >= 400) {
    const message = response.data?.error || response.data?.message || `Supadata HTTP ${response.status}`
    throw new Error(message)
  }

  const data = response.data || {}
  const content = data.content
  let vtt = ''
  let sourceLang = data.lang || lang || 'auto'

  if (typeof content === 'string' && content.trim()) {
    // Plain text without cues — wrap as a single VTT cue for downstream tooling.
    vtt = `WEBVTT\n\n1\n00:00:00.000 --> 99:59:59.000\n${content.trim()}\n`
  } else if (Array.isArray(content) && content.length) {
    sourceLang = content[0]?.lang || sourceLang
    vtt = segmentsToVtt(content)
  }

  if (!vtt.trim()) return null

  const availableTracks = (data.availableLangs || []).map((code) => ({
    lang: code,
    name: code,
    baseUrl: null,
  }))

  return {
    content: vtt,
    sourceLang,
    sourceName: `supadata:${sourceLang}`,
    tracks: availableTracks,
    sourceTrack: availableTracks[0] || null,
    clientUserAgent: null,
    provider: 'supadata',
  }
}
