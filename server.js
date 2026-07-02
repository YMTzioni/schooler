import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import cookieParser from 'cookie-parser'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { YoutubeTranscript } from 'youtube-transcript'
import {
  parseVttCues,
  shouldSkipTranslation,
  translateVttContent,
  youtubeTranslationLooksApplied,
} from './lib/subtitleTranslate.js'

const app = express()
const PORT = process.env.PORT || 3030
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const BASE_URL = 'https://api.schooler.biz'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, 'dist')
const isProduction = process.env.NODE_ENV === 'production'

const isAllowedOrigin = (origin) => {
  if (!origin) return true
  if (origin === FRONTEND_ORIGIN) return true
  try {
    const { hostname, protocol } = new URL(origin)
    return (
      protocol === 'https:' &&
      (hostname === 'localhost' ||
        hostname.endsWith('.github.io') ||
        hostname.endsWith('.onrender.com'))
    )
  } catch {
    return false
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

const sessions = new Map()
const VIDEO_TRANSLATION_CACHE = new Map()
const VIDEO_TRANSLATION_CACHE_LIMIT = 40

const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  maxAge: 1000 * 60 * 60 * 24 * 14,
}

const buildClient = (session) =>
  axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
  })

const createSession = (data) => {
  const id = crypto.randomUUID()
  const session = {
    id,
    clientId: data.clientId,
    clientSecret: data.clientSecret,
    userId: data.userId,
    userSecret: data.userSecret,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    tokenType: data.tokenType,
    expiresIn: data.expiresIn,
    createdAt: Date.now(),
  }
  sessions.set(id, session)
  return session
}

const getSession = (req) => {
  const sessionId = req.cookies.schooler_session_id
  if (!sessionId) return null
  return sessions.get(sessionId) || null
}

const requireSession = (req, res, next) => {
  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ message: 'No active session. Please login.' })
  }
  req.session = session
  return next()
}

const handleApiError = (res, error) => {
  if (error.response) {
    return res.status(error.response.status).json(error.response.data)
  }
  return res.status(500).json({ message: error.message || 'Unexpected server error' })
}

const extractPlaylistId = (playlistUrl) => {
  try {
    const parsed = new URL(playlistUrl)
    if (parsed.searchParams.get('list')) {
      return parsed.searchParams.get('list')
    }
  } catch {
    // Continue with fallback regex.
  }

  const match = playlistUrl.match(/list=([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

const decodeTitle = (value) =>
  value
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .trim()

const YOUTUBE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+667',
}

const extractYtInitialData = (html) => {
  const marker = 'var ytInitialData = '
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

const collectPlaylistVideos = (node, videos = [], seen = new Set()) => {
  if (!node || typeof node !== 'object') return videos

  if (node.playlistVideoRenderer) {
    const renderer = node.playlistVideoRenderer
    const videoId = renderer.videoId
    if (videoId && !seen.has(videoId)) {
      seen.add(videoId)
      const title =
        renderer.title?.simpleText ||
        renderer.title?.runs?.[0]?.text ||
        `פרק ${videos.length + 1}`
      videos.push({ videoId, title: decodeTitle(title) })
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectPlaylistVideos(item, videos, seen))
    } else if (value && typeof value === 'object') {
      collectPlaylistVideos(value, videos, seen)
    }
  }

  return videos
}

const extractVideosFromHtml = (html) => {
  const titleById = new Map()
  const initialData = extractYtInitialData(html)
  if (initialData) {
    collectPlaylistVideos(initialData).forEach((video) => {
      titleById.set(video.videoId, video.title)
    })
  }

  const idPattern = /"videoId":"([a-zA-Z0-9_-]{11})"/g
  const ids = []
  const uniqueIds = new Set()

  let idMatch
  while ((idMatch = idPattern.exec(html)) !== null) {
    const videoId = idMatch[1]
    if (!uniqueIds.has(videoId)) {
      uniqueIds.add(videoId)
      ids.push(videoId)
    }
  }

  if (!ids.length && titleById.size) {
    return [...titleById.entries()].map(([videoId, title]) => ({ videoId, title }))
  }

  return ids.map((videoId, index) => ({
    videoId,
    title: titleById.get(videoId) || `פרק ${index + 1}`,
  }))
}

const formatEpisodeName = (index, title) => `פרק ${index}: ${title}`

const sanitizeFileName = (name) =>
  name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()

const findCaptionTracks = (node) => {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node.captionTracks)) return node.captionTracks
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findCaptionTracks(item)
        if (found) return found
      }
    } else if (value && typeof value === 'object') {
      const found = findCaptionTracks(value)
      if (found) return found
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

const normalizeTrack = (track) => ({
  lang: track.languageCode,
  name: track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode,
  baseUrl: track.baseUrl?.replace(/\\u0026/g, '&'),
  isAuto: Boolean(track.kind === 'asr' || track.vssId?.startsWith?.('a.')),
})

const normalizeTranslationLanguage = (language) => ({
  lang: language.languageCode,
  name: language.languageName?.simpleText || language.languageName?.runs?.[0]?.text || language.languageCode,
})

const fetchCaptionTracksInnertube = async (videoId) => {
  const response = await axios.post(
    'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    {
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
        },
      },
      videoId,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
      },
    },
  )

  const renderer = response.data?.captions?.playerCaptionsTracklistRenderer || {}
  const tracks = renderer.captionTracks || []
  const translationLanguages = renderer.translationLanguages || []
  return {
    tracks: tracks.map(normalizeTrack),
    translationLanguages: translationLanguages.map(normalizeTranslationLanguage),
  }
}

const getCaptionTrackInfo = async (videoId) => {
  try {
    const innertubeInfo = await fetchCaptionTracksInnertube(videoId)
    if (innertubeInfo.tracks.length) return innertubeInfo
  } catch {
    // Fall back to watch page parsing.
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const response = await axios.get(watchUrl, { headers: YOUTUBE_HEADERS })
  const html = response.data

  const playerResponse = extractJsonMarker(html, 'var ytInitialPlayerResponse = ')
  const playerRenderer = playerResponse?.captions?.playerCaptionsTracklistRenderer || {}
  const playerTracks = playerRenderer.captionTracks || []
  const playerTranslationLanguages = playerRenderer.translationLanguages || []

  if (playerTracks.length) {
    return {
      tracks: playerTracks.map(normalizeTrack),
      translationLanguages: playerTranslationLanguages.map(normalizeTranslationLanguage),
    }
  }

  const initialData = extractYtInitialData(html)
  const tracks = findCaptionTracks(initialData) || []
  return {
    tracks: tracks.map(normalizeTrack),
    translationLanguages: [],
  }
}

const getCaptionTracks = async (videoId) => {
  const info = await getCaptionTrackInfo(videoId)
  return info.tracks
}

const formatVttTime = (seconds) => {
  const totalMs = Math.round(seconds * 1000)
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

const transcriptToVtt = (segments) => {
  let vtt = 'WEBVTT\n\n'
  // youtube-transcript returns offset/duration in milliseconds.
  // Some sources may already be seconds, so detect unit from cue duration scale.
  const usesMilliseconds = segments.some((segment) => Number(segment.duration) > 50)

  segments.forEach((segment, index) => {
    const offset = Number(segment.offset) || 0
    const duration = Number(segment.duration) || 0
    const startSeconds = usesMilliseconds ? offset / 1000 : offset
    const endSeconds = usesMilliseconds ? (offset + duration) / 1000 : offset + duration
    const start = formatVttTime(startSeconds)
    const end = formatVttTime(endSeconds)
    vtt += `${index + 1}\n${start} --> ${end}\n${segment.text}\n\n`
  })
  return vtt.trim()
}

const pickSourceTrack = (tracks, lang) => {
  if (!tracks.length) return null
  if (lang && lang !== 'auto') {
    return tracks.find((track) => track.lang === lang) || null
  }

  const manualHebrew = tracks.find((track) => track.lang === 'he' && !track.isAuto)
  if (manualHebrew) return manualHebrew

  const manualEnglish = tracks.find((track) => track.lang === 'en' && !track.isAuto)
  if (manualEnglish) return manualEnglish

  const anyManual = tracks.find((track) => !track.isAuto)
  return anyManual || tracks[0]
}

const vttToSrt = (vtt) => {
  const blocks = vtt.replace(/\r/g, '').split(/\n\n+/)
  let srt = ''
  let counter = 1

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || trimmed.startsWith('WEBVTT') || trimmed.startsWith('NOTE')) continue

    const lines = trimmed.split('\n')
    const timeLine = lines.find((line) => line.includes('-->'))
    if (!timeLine) continue

    const text = lines
      .filter((line) => line !== timeLine && !/^\d+$/.test(line))
      .join('\n')
      .trim()
    if (!text) continue

    srt += `${counter}\n${timeLine.replace(/\./g, ',')}\n${text}\n\n`
    counter += 1
  }

  return srt.trim()
}

const fetchTrackSubtitleContent = async (sourceTrack, { tlang, fmt = 'vtt' } = {}) => {
  if (!sourceTrack?.baseUrl) return ''

  const subtitleUrl = new URL(sourceTrack.baseUrl)
  subtitleUrl.searchParams.set('fmt', fmt === 'srt' ? 'srt' : 'vtt')
  if (tlang && tlang !== 'none') {
    subtitleUrl.searchParams.set('tlang', tlang)
  }

  try {
    const response = await axios.get(subtitleUrl.toString(), {
      headers: YOUTUBE_HEADERS,
      responseType: 'text',
    })
    return response.data
  } catch {
    return ''
  }
}

const storeTranslatedSubtitle = (videoId, sourceLang, tlang, content) => {
  const cacheKey = `${videoId}:${sourceLang}:${tlang}`
  if (VIDEO_TRANSLATION_CACHE.size >= VIDEO_TRANSLATION_CACHE_LIMIT) {
    const firstKey = VIDEO_TRANSLATION_CACHE.keys().next().value
    VIDEO_TRANSLATION_CACHE.delete(firstKey)
  }
  VIDEO_TRANSLATION_CACHE.set(cacheKey, content)
}

const resolveSubtitleVariant = async (source, videoId, tlang = 'none') => {
  const targetLang = tlang && tlang !== 'none' ? tlang : 'none'
  let content = source.content
  let translatedLocally = false
  const wantsTranslation =
    targetLang !== 'none' && !shouldSkipTranslation(source.sourceLang, targetLang)

  if (!wantsTranslation) {
    return {
      content,
      translatedLocally: false,
      targetLang: targetLang === 'none' ? null : targetLang,
    }
  }

  const cacheKey = `${videoId}:${source.sourceLang}:${targetLang}`
  const cachedTranslation = VIDEO_TRANSLATION_CACHE.get(cacheKey)
  if (cachedTranslation) {
    return {
      content: cachedTranslation,
      translatedLocally: true,
      targetLang,
    }
  }

  if (source.sourceTrack?.baseUrl) {
    const youtubeTranslated = await fetchTrackSubtitleContent(source.sourceTrack, {
      tlang: targetLang,
      fmt: 'vtt',
    })

    if (youtubeTranslated && String(youtubeTranslated).trim()) {
      const sourceCues = parseVttCues(source.content)
      const translatedCues = parseVttCues(youtubeTranslated)
      if (youtubeTranslationLooksApplied(sourceCues, translatedCues)) {
        return {
          content: youtubeTranslated,
          translatedLocally: false,
          targetLang,
        }
      }
    }
  }

  const localTranslation = await translateVttContent(source.content, source.sourceLang, targetLang)
  content = localTranslation.content
  translatedLocally = localTranslation.translatedLocally
  if (translatedLocally) {
    storeTranslatedSubtitle(videoId, source.sourceLang, targetLang, content)
  }

  return {
    content,
    translatedLocally,
    targetLang,
  }
}

const DEFAULT_PREFETCH_LANGS = ['none', 'he', 'en', 'ar', 'ru', 'fr']

const prefetchSubtitleLanguages = async (
  videoId,
  { lang = 'auto', langs = DEFAULT_PREFETCH_LANGS, priorityLang } = {},
) => {
  const source = await fetchSubtitleSourceContent(videoId, { lang, fmt: 'vtt' })
  const subtitles = {}
  const uniqueLangs = [...new Set(langs)]
  const instantLangs = []
  const translateLangs = []

  uniqueLangs.forEach((tlang) => {
    if (tlang === 'none' || shouldSkipTranslation(source.sourceLang, tlang)) {
      instantLangs.push(tlang)
    } else {
      translateLangs.push(tlang)
    }
  })

  instantLangs.forEach((tlang) => {
    subtitles[tlang] = {
      content: source.content,
      translatedLocally: false,
      targetLang: tlang === 'none' ? null : tlang,
    }
  })

  const orderedTranslateLangs = [...translateLangs]
  if (priorityLang && orderedTranslateLangs.includes(priorityLang)) {
    orderedTranslateLangs.sort((a, b) => {
      if (a === priorityLang) return -1
      if (b === priorityLang) return 1
      return 0
    })
  }

  const priorityQueue = orderedTranslateLangs.filter((tlang) => tlang === priorityLang)
  const parallelQueue = orderedTranslateLangs.filter((tlang) => tlang !== priorityLang)

  for (const tlang of priorityQueue) {
    subtitles[tlang] = await resolveSubtitleVariant(source, videoId, tlang)
  }

  if (parallelQueue.length) {
    const parallelResults = await Promise.all(
      parallelQueue.map(async (tlang) => [tlang, await resolveSubtitleVariant(source, videoId, tlang)]),
    )
    parallelResults.forEach(([tlang, result]) => {
      subtitles[tlang] = result
    })
  }

  return {
    videoId,
    sourceLang: source.sourceLang,
    subtitles,
  }
}

const fetchSubtitleSourceContent = async (videoId, { lang = 'auto', fmt = 'vtt' } = {}) => {
  const tracks = await getCaptionTracks(videoId)
  const sourceTrack = pickSourceTrack(tracks, lang)
  let content = ''
  let sourceLang = sourceTrack?.lang || lang
  let sourceName = sourceTrack?.name || sourceLang

  if (sourceTrack?.baseUrl) {
    content = await fetchTrackSubtitleContent(sourceTrack, { fmt })
  }

  if (!content || !String(content).trim()) {
    try {
      const transcriptLang = lang && lang !== 'auto' ? { lang } : {}
      const segments = await YoutubeTranscript.fetchTranscript(videoId, transcriptLang)
      if (!segments?.length) {
        throw new Error('לא נמצאו כתוביות לסרטון זה')
      }
      sourceLang = segments[0]?.lang || sourceLang
      content = transcriptToVtt(segments)
    } catch {
      throw new Error('לא נמצאו כתוביות לסרטון זה')
    }
  }

  if (!content || !String(content).trim()) {
    throw new Error('כתוביות ריקות או לא זמינות לסרטון זה')
  }

  return {
    content: String(content),
    sourceLang,
    sourceName,
    tracks,
    sourceTrack,
  }
}

const fetchSubtitleContent = async (videoId, { lang = 'auto', tlang, fmt = 'vtt' } = {}) => {
  const source = await fetchSubtitleSourceContent(videoId, { lang, fmt: 'vtt' })
  const effectiveTlang = tlang && tlang !== 'none' ? tlang : 'none'
  const variant = await resolveSubtitleVariant(source, videoId, effectiveTlang)
  let content = variant.content

  if (fmt === 'srt' && String(content).includes('WEBVTT')) {
    content = vttToSrt(String(content))
  }

  return {
    content,
    sourceLang: source.sourceLang,
    sourceName: source.sourceName,
    targetLang: variant.targetLang,
    translatedLocally: variant.translatedLocally,
    format: fmt,
    availableTracks: source.tracks,
  }
}

const buildSubtitleFileName = (index, title, fmt) => {
  const extension = fmt === 'srt' ? 'srt' : 'vtt'
  return sanitizeFileName(`${formatEpisodeName(index, title)}.${extension}`)
}

const escapeHtml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const SCHOOLER_ORIGIN = 'https://my.schooler.biz'

const buildEmbedUrl = (videoId) => {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
    disablekb: '1',
    fs: '0',
    controls: '1',
    playsinline: '1',
    autoplay: '0',
    cc_load_policy: '0',
    origin: SCHOOLER_ORIGIN,
    widget_referrer: SCHOOLER_ORIGIN,
  })

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

const buildEmbedPayload = (video, index) => {
  const episodeIndex = index + 1
  const displayName = formatEpisodeName(episodeIndex, video.title)
  const embedUrl = buildEmbedUrl(video.videoId)
  const safeTitle = escapeHtml(video.title)
  const iframeAttrs = `src="${embedUrl}" title="${safeTitle}" width="100%" height="405" frameborder="0" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" allow="encrypted-media; picture-in-picture"`

  const embedCode = `<iframe ${iframeAttrs}></iframe>`
  const protectedEmbedCode = `<div style="position:relative;width:100%;padding-bottom:56.25%;height:0;overflow:hidden;background:#000;border-radius:8px;" oncontextmenu="return false;">
  <iframe style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" ${iframeAttrs}></iframe>
  <div aria-hidden="true" style="position:absolute;top:0;left:0;width:100%;height:48px;z-index:2;"></div>
  <div aria-hidden="true" style="position:absolute;bottom:0;right:0;width:110px;height:56px;z-index:2;"></div>
  <div aria-hidden="true" style="position:absolute;bottom:52px;right:0;width:130px;height:40px;z-index:2;"></div>
</div>`

  return {
    index: episodeIndex,
    title: video.title,
    displayName,
    fileName: sanitizeFileName(displayName),
    videoId: video.videoId,
    embedUrl,
    embedCode,
    protectedEmbedCode,
    schoolerEmbedLink: embedUrl,
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'schooler-local-bridge',
    version: '1.2.0',
    features: ['youtube-playlist', 'youtube-subtitles'],
  })
})

app.get('/api/auth/status', (req, res) => {
  const session = getSession(req)
  if (!session) {
    return res.json({ loggedIn: false })
  }

  return res.json({
    loggedIn: true,
    userId: session.userId,
    tokenType: session.tokenType,
    expiresIn: session.expiresIn,
    createdAt: session.createdAt,
  })
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { clientId, clientSecret, userId, userSecret } = req.body
    if (!clientId || !clientSecret || !userId || !userSecret) {
      return res.status(400).json({ message: 'Missing authentication fields' })
    }

    const response = await axios.post(`${BASE_URL}/oauth/token`, {
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      user_id: userId,
      user_secret: userSecret,
    })

    const session = createSession({
      clientId,
      clientSecret,
      userId,
      userSecret,
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      tokenType: response.data.token_type,
      expiresIn: response.data.expires_in,
    })

    res.cookie('schooler_session_id', session.id, authCookieOptions)
    return res.json({ loggedIn: true, userId, tokenType: session.tokenType })
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.post('/api/auth/refresh', requireSession, async (req, res) => {
  try {
    const session = req.session
    const response = await axios.post(`${BASE_URL}/oauth/token`, {
      grant_type: 'refresh_token',
      client_id: session.clientId,
      client_secret: session.clientSecret,
      refresh_token: session.refreshToken,
    })

    const updatedSession = {
      ...session,
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      tokenType: response.data.token_type,
      expiresIn: response.data.expires_in,
      createdAt: Date.now(),
    }
    sessions.set(session.id, updatedSession)
    req.session = updatedSession

    return res.json({ refreshed: true, tokenType: updatedSession.tokenType })
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.post('/api/auth/logout', requireSession, (req, res) => {
  sessions.delete(req.session.id)
  res.clearCookie('schooler_session_id')
  return res.json({ loggedOut: true })
})

app.get('/api/courses', requireSession, async (req, res) => {
  try {
    const client = buildClient(req.session)
    const response = await client.get('/api/v1/courses', { params: req.query })
    return res.json(response.data)
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.get('/api/schools', requireSession, async (req, res) => {
  try {
    const client = buildClient(req.session)
    const response = await client.get('/api/v1/schools', { params: req.query })
    return res.json(response.data)
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.get('/api/students/search', requireSession, async (req, res) => {
  try {
    const client = buildClient(req.session)
    const response = await client.get('/api/v1/students/search', { params: req.query })
    return res.json(response.data)
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.post('/api/proxy', requireSession, async (req, res) => {
  try {
    const { method = 'GET', path, query, body } = req.body
    if (!path || !path.startsWith('/')) {
      return res.status(400).json({ message: 'path is required and must start with /' })
    }

    const client = buildClient(req.session)
    const response = await client.request({
      method,
      url: path,
      params: query,
      data: body,
    })
    return res.json(response.data)
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.post('/api/youtube/extract-playlist', async (req, res) => {
  try {
    const { playlistUrl } = req.body
    if (!playlistUrl) {
      return res.status(400).json({ message: 'חסר קישור פלייליסט' })
    }

    const playlistId = extractPlaylistId(playlistUrl)
    if (!playlistId) {
      return res.status(400).json({
        message: 'לא נמצא מזהה פלייליסט בקישור. ודא שהעתקת קישור מלא עם פרמטר list=',
      })
    }

    const canonicalUrl = `https://www.youtube.com/playlist?list=${playlistId}`
    const response = await axios.get(canonicalUrl, { headers: YOUTUBE_HEADERS })

    const rawVideos = extractVideosFromHtml(response.data)
    if (!rawVideos.length) {
      return res.status(404).json({
        message:
          'לא נמצאו סרטונים בפלייליסט. בדוק שהפלייליסט ציבורי/לא רשום, שהקישור מלא, ושיש בו סרטונים.',
        playlistId,
        playlistUrl: canonicalUrl,
      })
    }

    const videos = rawVideos.map((video, index) => buildEmbedPayload(video, index))

    return res.json({
      playlistId,
      playlistUrl: canonicalUrl,
      total: videos.length,
      videos,
      note: 'השתמש בקוד המוגן ל-Schooler. חסימה מלאה של יוטיוב אינה אפשרית רשמית, אבל המצב המוגן חוסם לחיצות על לוגו/קישורים נפוצים.',
    })
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.get('/api/youtube/subtitles/:videoId/tracks', async (req, res) => {
  try {
    const info = await getCaptionTrackInfo(req.params.videoId)
    return res.json(info)
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.post('/api/youtube/subtitles/prefetch', async (req, res) => {
  try {
    const {
      videoId,
      lang = 'auto',
      langs = DEFAULT_PREFETCH_LANGS,
      priorityLang,
    } = req.body

    if (!videoId) {
      return res.status(400).json({ message: 'חסר videoId' })
    }

    const payload = await prefetchSubtitleLanguages(videoId, { lang, langs, priorityLang })
    return res.json(payload)
  } catch (error) {
    if (error.message?.includes('לא נמצאו') || error.message?.includes('ריקות')) {
      return res.status(404).json({ message: error.message })
    }
    return handleApiError(res, error)
  }
})

app.post('/api/youtube/subtitles', async (req, res) => {
  try {
    const { videoId, index, title, lang = 'auto', tlang = 'none', fmt = 'vtt' } = req.body
    if (!videoId) {
      return res.status(400).json({ message: 'חסר videoId' })
    }

    const subtitle = await fetchSubtitleContent(videoId, { lang, tlang, fmt })
    const episodeIndex = index || 1
    const episodeTitle = title || `פרק ${episodeIndex}`
    const fileName = buildSubtitleFileName(episodeIndex, episodeTitle, fmt)

    return res.json({
      fileName,
      displayName: formatEpisodeName(episodeIndex, episodeTitle),
      ...subtitle,
    })
  } catch (error) {
    if (error.message?.includes('לא נמצאו') || error.message?.includes('ריקות')) {
      return res.status(404).json({ message: error.message })
    }
    return handleApiError(res, error)
  }
})

app.post('/api/youtube/subtitles/bulk', async (req, res) => {
  try {
    const { videos = [], lang = 'auto', tlang = 'none', fmt = 'vtt' } = req.body
    if (!videos.length) {
      return res.status(400).json({ message: 'לא סופקו סרטונים לייבוא כתוביות' })
    }

    const results = []
    const errors = []

    for (const video of videos) {
      try {
        const subtitle = await fetchSubtitleContent(video.videoId, { lang, tlang, fmt })
        const fileName = buildSubtitleFileName(video.index, video.title, fmt)
        results.push({
          videoId: video.videoId,
          index: video.index,
          title: video.title,
          displayName: formatEpisodeName(video.index, video.title),
          fileName,
          ...subtitle,
        })
      } catch (error) {
        errors.push({
          videoId: video.videoId,
          index: video.index,
          title: video.title,
          displayName: formatEpisodeName(video.index, video.title),
          message: error.message || 'שגיאה בייבוא כתוביות',
        })
      }
    }

    return res.json({ results, errors, total: videos.length })
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.use('/api', (req, res) => {
  res.status(404).json({
    message: `נתיב API לא נמצא: ${req.method} ${req.originalUrl}. הרץ מחדש npm start`,
  })
})

if (isProduction) {
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  const mode = isProduction ? 'production' : 'development'
  console.log(`Schooler listening on port ${PORT} (${mode})`)
})
