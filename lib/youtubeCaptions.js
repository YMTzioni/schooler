import axios from 'axios'
import { YoutubeTranscript } from 'youtube-transcript'
import { getFreeProxyPool, toAxiosProxy } from './freeProxy.js'
import { createSubtitleFetchMeta, recordSubtitleDelivery } from './subtitleFetchMeta.js'

export { createSubtitleFetchMeta }

const INNERTUBE_PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'
const YOUTUBE_REQUEST_TIMEOUT_MS = 8_000
const YOUTUBE_DIRECT_TIMEOUT_MS = 4_000
const MAX_PUB_PROXY_ATTEMPTS = Number(process.env.PUBPROXY_MAX_ATTEMPTS || 8)
const PARALLEL_PROXY_BATCH = Number(process.env.PROXY_PARALLEL_BATCH || 4)

const INNERTUBE_CLIENTS = [
  {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
  },
  {
    clientName: 'IOS',
    clientVersion: '20.10.4',
    userAgent:
      'com.google.ios.youtube/20.10.4 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
  },
  {
    clientName: 'TVHTML5_SIMPLY',
    clientVersion: '2.0',
    userAgent: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
  },
  {
    clientName: 'WEB',
    clientVersion: '2.20250101.00.00',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
]

export const YOUTUBE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
  Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+667',
}

export class YouTubeBlockedError extends Error {
  constructor(meta = null) {
    const attempts = meta?.proxyAttempts ? ` (${meta.proxyAttempts} ניסיונות פרוקסי)` : ''
    super(
      `לא הצלחנו להוריד כתוביות מ-YouTube${attempts}. בענן (Vercel/Render) YouTube חוסם שרתים — הנגן יעבור אוטומטית לכתוביות מובנות של YouTube.`,
    )
    this.name = 'YouTubeBlockedError'
    this.code = 'YOUTUBE_BLOCKED'
    this.meta = meta
  }
}

const staticProxyUrl =
  process.env.YOUTUBE_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY

const parseStaticProxy = () => {
  if (!staticProxyUrl) return null
  try {
    const parsed = new URL(staticProxyUrl)
    const port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80)
    const config = {
      host: parsed.hostname,
      port,
      protocol: parsed.protocol.replace(':', ''),
    }
    if (parsed.username) {
      config.auth = {
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
      }
    }
    return config
  } catch {
    return null
  }
}

const staticAxiosProxy = parseStaticProxy()
const isCloudHost = Boolean(process.env.RENDER || process.env.VERCEL)
const pubProxyEnabled = process.env.USE_PUBPROXY !== 'false'

const shouldUsePubProxy = () => pubProxyEnabled && !staticAxiosProxy

let proxySession = null

export const runWithYouTubeProxySession = async (fn, { preferPubProxy = false } = {}) => {
  const wantsPool = shouldUsePubProxy() && (preferPubProxy || isCloudHost)
  const previous = proxySession

  proxySession = {
    directAttempted: false,
    staticAttempted: false,
    workingProxy: undefined,
    pool: wantsPool ? await getFreeProxyPool({ max: MAX_PUB_PROXY_ATTEMPTS }) : [],
    poolIndex: 0,
  }

  try {
    return await fn()
  } finally {
    proxySession = previous
  }
}

const resolveSessionProxy = async (configFactory, meta, markAttempt, acceptResponse) => {
  if (!proxySession) return null

  if (proxySession.workingProxy !== undefined) {
    markAttempt(proxySession.workingProxy)
    const response = await tryYouTubeRequest(
      configFactory,
      proxySession.workingProxy,
      proxySession.workingProxy ? YOUTUBE_REQUEST_TIMEOUT_MS : YOUTUBE_DIRECT_TIMEOUT_MS,
    )
    if (!isRetryableProxyResponse(response)) {
      return acceptResponse(proxySession.workingProxy, response)
    }
    proxySession.workingProxy = undefined
  }

  if (!proxySession.directAttempted) {
    proxySession.directAttempted = true
    try {
      markAttempt(null)
      const directResponse = await tryYouTubeRequest(configFactory, null, YOUTUBE_DIRECT_TIMEOUT_MS)
      if (!isRetryableProxyResponse(directResponse)) {
        proxySession.workingProxy = null
        return acceptResponse(null, directResponse)
      }
    } catch {
      // Continue to proxies.
    }
  }

  if (staticAxiosProxy && !proxySession.staticAttempted) {
    proxySession.staticAttempted = true
    try {
      markAttempt(staticAxiosProxy)
      const staticResponse = await tryYouTubeRequest(
        configFactory,
        staticAxiosProxy,
        YOUTUBE_REQUEST_TIMEOUT_MS,
      )
      if (!isRetryableProxyResponse(staticResponse)) {
        proxySession.workingProxy = staticAxiosProxy
        return acceptResponse(staticAxiosProxy, staticResponse)
      }
    } catch {
      // Continue to free proxy pool.
    }
  }

  while (proxySession.poolIndex < proxySession.pool.length) {
    const batch = proxySession.pool.slice(
      proxySession.poolIndex,
      proxySession.poolIndex + PARALLEL_PROXY_BATCH,
    )
    proxySession.poolIndex += PARALLEL_PROXY_BATCH

    const results = await Promise.allSettled(
      batch.map(async (proxy) => {
        markAttempt(proxy)
        const response = await tryYouTubeRequest(configFactory, proxy, YOUTUBE_REQUEST_TIMEOUT_MS)
        if (isRetryableProxyResponse(response)) {
          throw new Error('retryable proxy response')
        }
        return { proxy, response }
      }),
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        proxySession.workingProxy = result.value.proxy
        return acceptResponse(result.value.proxy, result.value.response)
      }
    }
  }

  return null
}

const mergeAxiosConfig = (extra = {}, proxy = null) => {
  const axiosProxy = toAxiosProxy(proxy) || staticAxiosProxy
  if (!axiosProxy) return extra
  return {
    ...extra,
    proxy: axiosProxy,
  }
}

const tryYouTubeRequest = async (configFactory, proxy, timeoutMs) =>
  axios.request(
    mergeAxiosConfig(
      {
        timeout: timeoutMs,
        validateStatus: () => true,
        ...configFactory(proxy),
      },
      proxy,
    ),
  )

const isRetryableProxyResponse = (response) => {
  if (!response) return true
  if (response.status === 429) return true
  if (response.status >= 500) return true
  return isBlockedYouTubeResponse(response.data)
}

export const isBlockedYouTubeResponse = (data) => {
  const text = String(data || '')
  return (
    text.includes('class="g-recaptcha"') ||
    text.includes('Sorry, you have been blocked') ||
    text.includes('solveSimpleChallenge') ||
    (text.trim().startsWith('<!DOCTYPE html') && !text.includes('WEBVTT'))
  )
}

export const isValidSubtitleContent = (data) => {
  const text = String(data || '').trim()
  if (!text || isBlockedYouTubeResponse(text)) return false
  return (
    text.startsWith('WEBVTT') ||
    text.startsWith('<?xml') ||
    text.startsWith('<transcript')
  )
}

const requestYouTube = async (configFactory, { preferPubProxy = false, meta = null } = {}) => {
  let pubProxyTries = 0

  const markAttempt = (proxy) => {
    if (proxy && proxy !== staticAxiosProxy) {
      pubProxyTries += 1
      if (meta) meta.proxyAttempts = pubProxyTries
    }
  }

  const acceptResponse = (proxy, response) => {
    recordSubtitleDelivery(meta, proxy, staticAxiosProxy)
    if (meta && proxy?.source) meta.proxySource = proxy.source
    return response
  }

  if (proxySession) {
    return resolveSessionProxy(configFactory, meta, markAttempt, acceptResponse)
  }

  try {
    markAttempt(null)
    const directResponse = await tryYouTubeRequest(configFactory, null, YOUTUBE_DIRECT_TIMEOUT_MS)
    if (!isRetryableProxyResponse(directResponse)) {
      return acceptResponse(null, directResponse)
    }
  } catch {
    // Fall through to proxy pool.
  }

  if (staticAxiosProxy) {
    try {
      markAttempt(staticAxiosProxy)
      const staticResponse = await tryYouTubeRequest(
        configFactory,
        staticAxiosProxy,
        YOUTUBE_REQUEST_TIMEOUT_MS,
      )
      if (!isRetryableProxyResponse(staticResponse)) {
        return acceptResponse(staticAxiosProxy, staticResponse)
      }
    } catch {
      // Fall through to free proxy pool.
    }
  }

  if (shouldUsePubProxy() && (preferPubProxy || isCloudHost)) {
    const pool = await getFreeProxyPool({ max: MAX_PUB_PROXY_ATTEMPTS })

    for (let index = 0; index < pool.length; index += PARALLEL_PROXY_BATCH) {
      const batch = pool.slice(index, index + PARALLEL_PROXY_BATCH)
      const results = await Promise.allSettled(
        batch.map(async (proxy) => {
          markAttempt(proxy)
          const response = await tryYouTubeRequest(configFactory, proxy, YOUTUBE_REQUEST_TIMEOUT_MS)
          if (isRetryableProxyResponse(response)) {
            throw new Error('retryable proxy response')
          }
          return { proxy, response }
        }),
      )

      for (const result of results) {
        if (result.status === 'fulfilled') {
          return acceptResponse(result.value.proxy, result.value.response)
        }
      }
    }
  }

  return null
}

export const createYouTubeFetch = ({ preferPubProxy = false, meta = null } = {}) => {
  return async (url, options = {}) => {
    const headers = {}
    if (options.headers) {
      const headerList = new Headers(options.headers)
      headerList.forEach((value, key) => {
        headers[key] = value
      })
    }

    const response = await requestYouTube(
      () => ({
        url: String(url),
        method: options.method || 'GET',
        headers,
        data: options.body,
        responseType: 'text',
        transformResponse: [(data) => data],
      }),
      { preferPubProxy, meta },
    )

    const body = String(response?.data ?? '')
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => body,
      json: async () => JSON.parse(body),
    }
  }
}

const normalizeTrack = (track) => ({
  lang: track.languageCode,
  name: track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode,
  baseUrl: track.baseUrl?.replace(/\\u0026/g, '&'),
  isAuto: Boolean(track.kind === 'asr' || track.vssId?.startsWith?.('a.')),
  kind: track.kind || (track.vssId?.startsWith?.('a.') ? 'asr' : 'standard'),
})

const normalizeTranslationLanguage = (language) => ({
  lang: language.languageCode,
  name:
    language.languageName?.simpleText ||
    language.languageName?.runs?.[0]?.text ||
    language.languageCode,
})

const fetchCaptionTracksInnertube = async (videoId, { preferPubProxy = false, meta = null } = {}) => {
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const response = await requestYouTube(
        () => ({
          method: 'POST',
          url: INNERTUBE_PLAYER_URL,
          data: {
            context: {
              client: {
                clientName: client.clientName,
                clientVersion: client.clientVersion,
              },
            },
            videoId,
          },
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': client.userAgent,
          },
        }),
        { preferPubProxy, meta },
      )

      if (!response || response.status >= 400 || isBlockedYouTubeResponse(response.data)) continue

      const renderer = response.data?.captions?.playerCaptionsTracklistRenderer || {}
      const tracks = renderer.captionTracks || []
      if (!tracks.length) continue

      if (meta) {
        meta.trackSource = 'innertube'
        meta.innertubeClient = client.clientName
      }

      return {
        tracks: tracks.map(normalizeTrack),
        translationLanguages: (renderer.translationLanguages || []).map(normalizeTranslationLanguage),
        clientUserAgent: client.userAgent,
      }
    } catch {
      // Try the next InnerTube client.
    }
  }

  return null
}

const extractJsonMarker = (html, marker) => {
  const start = html.indexOf(marker)
  if (start === -1) return null

  const jsonStart = start + marker.length
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth++
    if (char === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

const findCaptionTracks = (node, tracks = []) => {
  if (!node || typeof node !== 'object') return tracks

  if (Array.isArray(node.captionTracks) && node.captionTracks.length) {
    tracks.push(...node.captionTracks)
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((item) => findCaptionTracks(item, tracks))
    } else if (value && typeof value === 'object') {
      findCaptionTracks(value, tracks)
    }
  }

  return tracks
}

export const fetchCaptionTracksFromWatchPage = async (videoId, { preferPubProxy = false, meta = null } = {}) => {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const response = await requestYouTube(
      () => ({
        method: 'GET',
        url: watchUrl,
        headers: YOUTUBE_HEADERS,
        responseType: 'text',
      }),
      { preferPubProxy, meta },
    )

    if (!response || response.status === 429 || isBlockedYouTubeResponse(response.data)) {
      return null
    }

    const html = String(response.data || '')
    const playerResponse = extractJsonMarker(html, 'var ytInitialPlayerResponse = ')
    const playerRenderer = playerResponse?.captions?.playerCaptionsTracklistRenderer || {}
    const playerTracks = playerRenderer.captionTracks || []
    const playerTranslationLanguages = playerRenderer.translationLanguages || []

    if (playerTracks.length) {
      if (meta) meta.trackSource = 'watch_page'
      return {
        tracks: playerTracks.map(normalizeTrack),
        translationLanguages: playerTranslationLanguages.map(normalizeTranslationLanguage),
        clientUserAgent: YOUTUBE_HEADERS['User-Agent'],
      }
    }

    const initialData = extractJsonMarker(html, 'var ytInitialData = ')
    const tracks = findCaptionTracks(initialData) || []
    if (!tracks.length) return null

    if (meta) meta.trackSource = 'watch_page'
    return {
      tracks: tracks.map(normalizeTrack),
      translationLanguages: [],
      clientUserAgent: YOUTUBE_HEADERS['User-Agent'],
    }
  } catch {
    return null
  }
}

export const getCaptionTrackInfo = async (videoId, { preferPubProxy = false, meta = null } = {}) => {
  const innertubeInfo = await fetchCaptionTracksInnertube(videoId, { preferPubProxy, meta })
  if (innertubeInfo?.tracks?.length) return innertubeInfo

  const watchInfo = await fetchCaptionTracksFromWatchPage(videoId, { preferPubProxy, meta })
  if (watchInfo?.tracks?.length) return watchInfo

  return {
    tracks: [],
    translationLanguages: [],
    clientUserAgent: YOUTUBE_HEADERS['User-Agent'],
  }
}

export const fetchTrackSubtitleContent = async (
  sourceTrack,
  { tlang, fmt = 'vtt', userAgent, preferPubProxy = false, meta = null } = {},
) => {
  if (!sourceTrack?.baseUrl) return ''

  const subtitleUrl = new URL(sourceTrack.baseUrl)
  subtitleUrl.searchParams.set('fmt', fmt === 'srt' ? 'srt' : 'vtt')
  if (tlang && tlang !== 'none') {
    subtitleUrl.searchParams.set('tlang', tlang)
  }

  try {
    const response = await requestYouTube(
      () => ({
        method: 'GET',
        url: subtitleUrl.toString(),
        headers: {
          ...YOUTUBE_HEADERS,
          'User-Agent': userAgent || YOUTUBE_HEADERS['User-Agent'],
        },
        responseType: 'text',
      }),
      { preferPubProxy, meta },
    )

    if (!response || response.status >= 400 || !isValidSubtitleContent(response.data)) {
      return ''
    }

    if (meta) meta.trackSource = 'timedtext'
    return response.data
  } catch {
    return ''
  }
}

const parseTranscriptXml = (xml, lang = '') => {
  const results = []
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
  let match

  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = Number.parseInt(match[1], 10)
    const durMs = Number.parseInt(match[2], 10)
    const inner = match[3]
    let text = ''
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g
    let sMatch
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1]
    }
    if (!text) text = inner.replace(/<[^>]+>/g, '')
    text = text.trim()
    if (text) {
      results.push({ text, duration: durMs, offset: startMs, lang })
    }
  }

  if (results.length) return results

  const classicRegex = /<text start="([^"]+)" dur="([^"]+)">([^<]*)<\/text>/g
  while ((match = classicRegex.exec(xml)) !== null) {
    const text = match[3].trim()
    if (!text) continue
    results.push({
      text,
      duration: Number.parseFloat(match[2]) * 1000,
      offset: Number.parseFloat(match[1]) * 1000,
      lang,
    })
  }

  return results
}

export const subtitleContentToSegments = (content, lang = '') => {
  const text = String(content || '').trim()
  if (!text) return []
  if (text.startsWith('WEBVTT')) {
    const cues = []
    const blocks = text.replace(/^WEBVTT[^\n]*\n+/i, '').split(/\n{2,}/)
    blocks.forEach((block) => {
      const lines = block.trim().split('\n')
      const timeLine = lines.find((line) => line.includes('-->'))
      if (!timeLine) return
      const [startRaw, endRaw] = timeLine.split('-->').map((part) => part.trim().split(' ')[0])
      const toSeconds = (value) => {
        const [h, m, s] = value.replace(',', '.').split(':')
        return Number(h) * 3600 + Number(m) * 60 + Number(s)
      }
      const start = toSeconds(startRaw)
      const end = toSeconds(endRaw)
      const cueText = lines
        .filter((line) => line !== timeLine && !/^\d+$/.test(line))
        .join('\n')
        .trim()
      if (!cueText) return
      cues.push({
        text: cueText,
        offset: start * 1000,
        duration: Math.max(0, end - start) * 1000,
        lang,
      })
    })
    return cues
  }

  return parseTranscriptXml(text, lang)
}

export const fetchTranscriptSegments = async (videoId, { lang = 'auto', meta = null } = {}) => {
  const transcriptLang = lang && lang !== 'auto' ? { lang } : {}
  const preferPubProxy = shouldUsePubProxy() && isCloudHost
  let blocked = false

  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, {
      ...transcriptLang,
      fetch: createYouTubeFetch({ preferPubProxy, meta }),
    })
    if (segments?.length) {
      if (meta) meta.trackSource = 'transcript'
      return segments
    }
  } catch (error) {
    if (
      String(error?.message || '').includes('captcha') ||
      String(error?.message || '').includes('too many requests')
    ) {
      blocked = true
    }
  }

  const info = await getCaptionTrackInfo(videoId, { preferPubProxy, meta })
  for (const track of info.tracks || []) {
    const content = await fetchTrackSubtitleContent(track, {
      fmt: 'vtt',
      userAgent: info.clientUserAgent,
      preferPubProxy,
      meta,
    })
    if (!content) {
      blocked = true
      continue
    }
    const segments = subtitleContentToSegments(content, track.lang)
    if (segments.length) return segments
  }

  if (blocked || (preferPubProxy && !info.tracks.length)) {
    throw new YouTubeBlockedError(meta)
  }

  return []
}
