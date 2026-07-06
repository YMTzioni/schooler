import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import cookieParser from 'cookie-parser'
import crypto from 'node:crypto'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  parseVttCues,
  shouldSkipTranslation,
  translateVttContent,
  youtubeTranslationLooksApplied,
} from './lib/subtitleTranslate.js'
import {
  YOUTUBE_HEADERS,
  YouTubeBlockedError,
  createSubtitleFetchMeta,
  fetchTrackSubtitleContent,
  fetchTranscriptSegments,
  getCaptionTrackInfo,
  isBlockedYouTubeResponse,
  runWithYouTubeProxySession,
} from './lib/youtubeCaptions.js'
import { buildPrefetchStatus, buildSubtitleStatus } from './lib/subtitleStatus.js'
import {
  buildProtectedEmbedWrapper,
  buildYouTubeEmbedUrl,
} from './lib/youtubeEmbed.js'
import {
  buildSchoolerPasswordOAuthBody,
  buildSchoolerRefreshOAuthBody,
  parseSchoolerOAuthResponse,
  readSchoolerEnvClientCredentials,
  readSchoolerEnvCredentials,
  readSchoolerEnvUserCredentials,
  SCHOOLER_API_BASE,
} from './lib/schoolerApi.js'
import {
  buildResponderOAuthBody,
  parseResponderOAuthResponse,
  readResponderEnvCredentials,
  RESPONDER_API_BASE,
} from './lib/responderApi.js'

const app = express()
const PORT = process.env.PORT || 3030
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const BASE_URL = SCHOOLER_API_BASE
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, 'dist')
const isProduction = process.env.NODE_ENV === 'production'
const isVercel = Boolean(process.env.VERCEL)
const isCloudHost = Boolean(process.env.RENDER || isVercel)
const preferYouTubePubProxy = isCloudHost && process.env.USE_PUBPROXY !== 'false'

const isAllowedOrigin = (origin) => {
  if (!origin) return true
  if (origin === FRONTEND_ORIGIN) return true
  try {
    const { hostname, protocol } = new URL(origin)
    return (
      protocol === 'https:' &&
      (hostname === 'localhost' ||
        hostname.endsWith('.github.io') ||
        hostname.endsWith('.onrender.com') ||
        hostname.endsWith('.vercel.app') ||
        hostname.endsWith('.schooler.biz') ||
        hostname === 'schooler.biz')
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
const responderSessions = new Map()
const VIDEO_TRANSLATION_CACHE = new Map()
const VIDEO_TRANSLATION_CACHE_LIMIT = 40

const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction || isVercel,
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
    expiresAt: data.expiresAt,
    createdAt: data.createdAt || Date.now(),
  }
  sessions.set(id, session)
  return session
}

const saveSchoolerOAuthSnapshot = async (raw) => {
  const snapshotPath = path.join(__dirname, '.schooler-oauth.json')
  await writeFile(snapshotPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
}

const schoolerPasswordLogin = async (credentials) => {
  const { clientId, clientSecret } = credentials
  if (!clientId || !clientSecret) {
    const error = new Error('חסרים Client ID / Client Secret — פנו לתמיכת Schooler (support@responder.co.il)')
    error.status = 400
    throw error
  }

  const response = await axios.post(
    `${BASE_URL}/oauth/token`,
    buildSchoolerPasswordOAuthBody(credentials),
    { headers: { 'Content-Type': 'application/json' } },
  )
  return parseSchoolerOAuthResponse(response.data)
}

const schoolerRefreshToken = async ({ refreshToken, clientId, clientSecret }) => {
  if (!clientId || !clientSecret) {
    const error = new Error('חסרים Client ID / Client Secret לרענון טוקן')
    error.status = 400
    throw error
  }

  const response = await axios.post(
    `${BASE_URL}/oauth/token`,
    buildSchoolerRefreshOAuthBody({ refreshToken, clientId, clientSecret }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  return parseSchoolerOAuthResponse(response.data)
}

const buildSchoolerSessionFromOAuth = (credentials, oauth) =>
  createSession({
    ...credentials,
    accessToken: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    tokenType: oauth.tokenType,
    expiresIn: oauth.expiresIn,
    expiresAt: oauth.expiresAt,
    createdAt: oauth.createdAt,
  })

const refreshSchoolerSessionToken = async (session) => {
  const oauth = await schoolerRefreshToken({
    refreshToken: session.refreshToken,
    clientId: session.clientId,
    clientSecret: session.clientSecret,
  })
  await saveSchoolerOAuthSnapshot(oauth.raw).catch(() => {})
  const updated = {
    ...session,
    accessToken: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    tokenType: oauth.tokenType,
    expiresIn: oauth.expiresIn,
    expiresAt: oauth.expiresAt,
    createdAt: oauth.createdAt,
  }
  sessions.set(session.id, updated)
  return updated
}

const withSchoolerSession = async (req, res, handler) => {
  try {
    let session = req.session
    if (session.expiresAt && session.expiresAt <= Date.now()) {
      session = await refreshSchoolerSessionToken(session)
      req.session = session
    }
    return await handler(buildClient(session), session)
  } catch (error) {
    if (error.response?.status === 401 && req.session?.refreshToken) {
      try {
        const session = await refreshSchoolerSessionToken(req.session)
        req.session = session
        return await handler(buildClient(session), session)
      } catch (retryError) {
        return handleApiError(res, retryError)
      }
    }
    return handleApiError(res, error)
  }
}

const resolveSchoolerCredentials = (body = {}) => {
  const envUser = readSchoolerEnvUserCredentials()
  const envClient = readSchoolerEnvClientCredentials()
  const userId = body.userId?.trim() || body.user_id?.trim() || envUser?.userId
  const userSecret = body.userSecret?.trim() || body.user_secret?.trim() || envUser?.userSecret
  const clientId = body.clientId?.trim() || body.client_id?.trim() || envClient?.clientId
  const clientSecret =
    body.clientSecret?.trim() || body.client_secret?.trim() || envClient?.clientSecret
  if (!userId || !userSecret || !clientId || !clientSecret) return null
  return { userId, userSecret, clientId, clientSecret }
}

const getSession = (req) => {
  const sessionId = req.cookies.schooler_session_id
  if (!sessionId) return null
  return sessions.get(sessionId) || null
}

const getResponderSession = (req) => {
  const sessionId = req.cookies.responder_session_id
  if (!sessionId) return null
  return responderSessions.get(sessionId) || null
}

const requireSession = (req, res, next) => {
  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ message: 'No active session. Please login.' })
  }
  req.session = session
  return next()
}

const requireResponderSession = (req, res, next) => {
  const session = getResponderSession(req)
  if (!session) {
    return res.status(401).json({ message: 'אין חיבור פעיל לרב מסר. התחברו מחדש.' })
  }
  req.responderSession = session
  return next()
}

const handleApiError = (res, error) => {
  if (error.response) {
    const { status, data } = error.response
    if (status === 500 && (!data || data === '')) {
      return res.status(502).json({
        message:
          'Schooler API החזיר שגיאת שרת (500). ודאו ש-Client ID/Client Secret ו-User ID/User Secret תקינים — פנו לתמיכת Schooler.',
        error: 'schooler_server_error',
      })
    }
    return res.status(status).json(data || { message: 'Schooler API error' })
  }
  return res.status(500).json({ message: error.message || 'Unexpected server error' })
}

const handleSubtitleApiError = (res, error) => {
  if (error instanceof YouTubeBlockedError || error.code === 'YOUTUBE_BLOCKED') {
    return res.status(503).json({ message: error.message, code: 'YOUTUBE_BLOCKED' })
  }
  if (error.message?.includes('לא נמצאו') || error.message?.includes('ריקות')) {
    return res.status(404).json({ message: error.message })
  }
  if (error.response) {
    const data = error.response.data
    if (typeof data === 'string' && isBlockedYouTubeResponse(data)) {
      return res.status(503).json({
        message:
          'YouTube חוסם בקשות כתוביות משרתי ענן. נסו להריץ מקומית (npm start) או הגדירו YOUTUBE_PROXY_URL ב-Render.',
        code: 'YOUTUBE_BLOCKED',
      })
    }
    if (typeof data === 'object' && data !== null) {
      return res.status(error.response.status).json(data)
    }
    return res.status(error.response.status).json({
      message: 'שגיאה בקבלת כתוביות מ-YouTube',
      code: 'YOUTUBE_ERROR',
    })
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

import { pickBestSourceTrack } from './lib/captionTrackUtils.js'
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
      userAgent: source.clientUserAgent,
      preferPubProxy: preferYouTubePubProxy,
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
      status: buildSubtitleStatus({
        meta: source.fetchMeta,
        content: source.content,
        sourceLang: source.sourceLang,
        targetLang: tlang,
        translatedLocally: false,
      }),
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
    const variant = await resolveSubtitleVariant(source, videoId, tlang)
    subtitles[tlang] = {
      ...variant,
      status: buildSubtitleStatus({
        meta: source.fetchMeta,
        content: variant.content,
        sourceLang: source.sourceLang,
        targetLang: variant.targetLang,
        translatedLocally: variant.translatedLocally,
      }),
    }
  }

  if (parallelQueue.length) {
    const parallelResults = await Promise.all(
      parallelQueue.map(async (tlang) => [tlang, await resolveSubtitleVariant(source, videoId, tlang)]),
    )
    parallelResults.forEach(([tlang, variant]) => {
      subtitles[tlang] = {
        ...variant,
        status: buildSubtitleStatus({
          meta: source.fetchMeta,
          content: variant.content,
          sourceLang: source.sourceLang,
          targetLang: variant.targetLang,
          translatedLocally: variant.translatedLocally,
        }),
      }
    })
  }

  const status = buildPrefetchStatus({
    sourceLang: source.sourceLang,
    subtitles,
  })

  return {
    videoId,
    sourceLang: source.sourceLang,
    subtitles,
    status,
  }
}

const fetchSubtitleSourceContent = async (videoId, { lang = 'auto', fmt = 'vtt' } = {}) =>
  runWithYouTubeProxySession(async () => {
    const fetchMeta = createSubtitleFetchMeta()
    const trackInfo = await getCaptionTrackInfo(videoId, {
      preferPubProxy: preferYouTubePubProxy,
      meta: fetchMeta,
    })
    const tracks = trackInfo.tracks
    const sourceTrack = pickBestSourceTrack(tracks, lang)
    let content = ''
    let sourceLang = sourceTrack?.lang || lang
    let sourceName = sourceTrack?.name || sourceLang

    if (sourceTrack?.baseUrl) {
      content = await fetchTrackSubtitleContent(sourceTrack, {
        fmt,
        userAgent: trackInfo.clientUserAgent,
        preferPubProxy: preferYouTubePubProxy,
        meta: fetchMeta,
      })
    }

    if (!content || !String(content).trim()) {
      try {
        const segments = await fetchTranscriptSegments(videoId, { lang, meta: fetchMeta })
        if (!segments?.length) {
          throw new Error('לא נמצאו כתוביות לסרטון זה')
        }
        sourceLang = segments[0]?.lang || sourceLang
        content = transcriptToVtt(segments)
      } catch (error) {
        if (error instanceof YouTubeBlockedError) throw error
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
      clientUserAgent: trackInfo.clientUserAgent,
      fetchMeta,
    }
  }, { preferPubProxy: preferYouTubePubProxy })

const fetchSubtitleContent = async (videoId, { lang = 'auto', tlang, fmt = 'vtt' } = {}) => {
  const source = await fetchSubtitleSourceContent(videoId, { lang, fmt: 'vtt' })
  const effectiveTlang = tlang && tlang !== 'none' ? tlang : 'none'
  const variant = await resolveSubtitleVariant(source, videoId, effectiveTlang)
  let content = variant.content

  if (fmt === 'srt' && String(content).includes('WEBVTT')) {
    content = vttToSrt(String(content))
  }

  const status = buildSubtitleStatus({
    meta: source.fetchMeta,
    content,
    sourceLang: source.sourceLang,
    targetLang: variant.targetLang,
    translatedLocally: variant.translatedLocally,
  })

  return {
    content,
    sourceLang: source.sourceLang,
    sourceName: source.sourceName,
    targetLang: variant.targetLang,
    translatedLocally: variant.translatedLocally,
    format: fmt,
    availableTracks: source.tracks,
    status,
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

const buildEmbedUrl = (videoId) => buildYouTubeEmbedUrl(videoId, SCHOOLER_ORIGIN)

const buildEmbedPayload = (video, index) => {
  const episodeIndex = index + 1
  const displayName = formatEpisodeName(episodeIndex, video.title)
  const embedUrl = buildEmbedUrl(video.videoId)
  const safeTitle = escapeHtml(video.title)
  const iframeAttrs = `src="${embedUrl}" title="${safeTitle}" width="100%" height="405" frameborder="0" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" allow="encrypted-media; picture-in-picture"`

  const embedCode = `<iframe ${iframeAttrs}></iframe>`
  const protectedEmbedCode = buildProtectedEmbedWrapper(
    `<iframe style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" ${iframeAttrs}></iframe>`,
  )

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
    version: '1.3.6',
    features: ['youtube-playlist', 'youtube-subtitles', 'subtitle-status', 'subtitle-translate', 'schooler-api', 'responder-api-v2'],
  })
})

app.get('/api/auth/config', (req, res) => {
  const env = readSchoolerEnvCredentials()
  const envClient = readSchoolerEnvClientCredentials()
  const envUser = readSchoolerEnvUserCredentials()
  const missing = []
  if (!envUser?.userId) missing.push('SCHOOLER_USER_ID')
  if (!envUser?.userSecret) missing.push('SCHOOLER_USER_SECRET')
  if (!envClient?.clientId) missing.push('SCHOOLER_CLIENT_ID')
  if (!envClient?.clientSecret) missing.push('SCHOOLER_CLIENT_SECRET')

  return res.json({
    envReady: Boolean(env),
    hasClientCredentials: Boolean(envClient),
    hasUserCredentials: Boolean(envUser),
    userId: envUser?.userId || null,
    hasUserSecret: Boolean(envUser?.userSecret),
    missing,
    needsClientOnly: Boolean(envUser && !envClient),
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
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  })
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const creds = resolveSchoolerCredentials(req.body)
    if (!creds) {
      return res.status(400).json({
        message:
          'חסרים פרטי התחברות. נדרשים Client ID/Secret (מתמיכה) + User ID (אימייל) + User Secret (מפתח API).',
      })
    }

    const oauth = await schoolerPasswordLogin(creds)
    await saveSchoolerOAuthSnapshot(oauth.raw).catch(() => {})
    const session = buildSchoolerSessionFromOAuth(creds, oauth)

    res.cookie('schooler_session_id', session.id, authCookieOptions)
    return res.json({
      loggedIn: true,
      userId: session.userId,
      tokenType: session.tokenType,
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message })
    }
    return handleApiError(res, error)
  }
})

app.post('/api/auth/login-env', async (req, res) => {
  try {
    const env = readSchoolerEnvCredentials()
    if (!env) {
      return res.status(400).json({
        message:
          'הגדר ב-.env: SCHOOLER_USER_ID, SCHOOLER_USER_SECRET, SCHOOLER_CLIENT_ID, SCHOOLER_CLIENT_SECRET',
      })
    }

    const oauth = await schoolerPasswordLogin(env)
    await saveSchoolerOAuthSnapshot(oauth.raw).catch(() => {})
    const session = buildSchoolerSessionFromOAuth(env, oauth)

    res.cookie('schooler_session_id', session.id, authCookieOptions)
    return res.json({
      loggedIn: true,
      userId: env.userId,
      tokenType: session.tokenType,
      expiresAt: session.expiresAt,
      fromEnv: true,
    })
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.post('/api/auth/refresh', requireSession, async (req, res) => {
  try {
    const session = await refreshSchoolerSessionToken(req.session)
    req.session = session
    return res.json({
      refreshed: true,
      tokenType: session.tokenType,
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message })
    }
    return handleApiError(res, error)
  }
})

app.post('/api/auth/logout', requireSession, (req, res) => {
  sessions.delete(req.session.id)
  res.clearCookie('schooler_session_id')
  return res.json({ loggedOut: true })
})

app.get('/api/courses', requireSession, async (req, res) =>
  withSchoolerSession(req, res, async (client) => {
    const response = await client.get('/api/v1/courses', { params: req.query })
    return res.json(response.data)
  }),
)

app.get('/api/schools', requireSession, async (req, res) =>
  withSchoolerSession(req, res, async (client) => {
    const response = await client.get('/api/v1/schools', { params: req.query })
    return res.json(response.data)
  }),
)

app.get('/api/courses/:courseId', requireSession, async (req, res) =>
  withSchoolerSession(req, res, async (client) => {
    const response = await client.get(`/api/v1/courses/${req.params.courseId}`)
    return res.json(response.data)
  }),
)

app.get('/api/courses/:courseId/lessons', requireSession, async (req, res) =>
  withSchoolerSession(req, res, async (client) => {
    const response = await client.get(`/api/v1/courses/${req.params.courseId}/lessons`, {
      params: req.query,
    })
    return res.json(response.data)
  }),
)

app.get('/api/schools/:schoolId', requireSession, async (req, res) =>
  withSchoolerSession(req, res, async (client) => {
    const response = await client.get(`/api/v1/schools/${req.params.schoolId}`)
    return res.json(response.data)
  }),
)

app.get('/api/students/search', requireSession, async (req, res) =>
  withSchoolerSession(req, res, async (client) => {
    const response = await client.get('/api/v1/students/search', { params: req.query })
    return res.json(response.data)
  }),
)

app.post('/api/proxy', requireSession, async (req, res) =>
  withSchoolerSession(req, res, async (client) => {
    const { method = 'GET', path, query, body } = req.body
    if (!path || !path.startsWith('/')) {
      return res.status(400).json({ message: 'path is required and must start with /' })
    }
    const response = await client.request({
      method,
      url: path,
      params: query,
      data: body,
    })
    return res.json(response.data)
  }),
)

const createResponderSession = (data) => {
  const id = crypto.randomUUID()
  const session = {
    id,
    clientId: data.clientId,
    clientSecret: data.clientSecret,
    userToken: data.userToken,
    accessToken: data.accessToken,
    username: data.username || null,
    name: data.name || null,
    accountId: data.accountId ?? null,
    createdAt: Date.now(),
    expiresAt: data.expiresAt,
  }
  responderSessions.set(id, session)
  return session
}

const saveResponderOAuthSnapshot = async (raw) => {
  const snapshotPath = path.join(__dirname, '.responder-oauth.json')
  await writeFile(snapshotPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
}

const responderOAuthLogin = async (credentials) => {
  const response = await axios.post(
    `${RESPONDER_API_BASE}/oauth/token`,
    buildResponderOAuthBody(credentials),
    { headers: { 'Content-Type': 'application/json' } },
  )
  return parseResponderOAuthResponse(response.data)
}

const buildResponderSessionFromOAuth = (credentials, oauth) =>
  createResponderSession({
    ...credentials,
    accessToken: oauth.accessToken,
    username: oauth.username,
    name: oauth.name,
    accountId: oauth.accountId,
    expiresAt: oauth.expiresAt,
  })

const buildResponderClient = (session) =>
  axios.create({
    baseURL: RESPONDER_API_BASE,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
  })

const refreshResponderSessionToken = async (session) => {
  const oauth = await responderOAuthLogin({
    clientId: session.clientId,
    clientSecret: session.clientSecret,
    userToken: session.userToken,
  })
  await saveResponderOAuthSnapshot(oauth.raw).catch(() => {})
  const updated = {
    ...session,
    accessToken: oauth.accessToken,
    username: oauth.username || session.username,
    name: oauth.name || session.name,
    accountId: oauth.accountId ?? session.accountId,
    createdAt: Date.now(),
    expiresAt: oauth.expiresAt,
  }
  responderSessions.set(session.id, updated)
  return updated
}

const withResponderSession = async (req, res, handler) => {
  try {
    let session = req.responderSession
    if (session.expiresAt <= Date.now()) {
      session = await refreshResponderSessionToken(session)
      req.responderSession = session
    }
    return await handler(buildResponderClient(session), session)
  } catch (error) {
    if (error.response?.status === 401 && req.responderSession) {
      try {
        const session = await refreshResponderSessionToken(req.responderSession)
        req.responderSession = session
        return await handler(buildResponderClient(session), session)
      } catch (retryError) {
        return handleApiError(res, retryError)
      }
    }
    return handleApiError(res, error)
  }
}

const resolveResponderCredentials = (body = {}) => {
  const env = readResponderEnvCredentials()
  const clientId = body.clientId?.trim() || body.client_id?.trim() || env?.clientId
  const clientSecret =
    body.clientSecret?.trim() || body.client_secret?.trim() || env?.clientSecret
  const userToken = body.userToken?.trim() || body.user_token?.trim() || env?.userToken
  if (!clientId || !clientSecret || !userToken) return null
  return { clientId, clientSecret, userToken }
}

app.get('/api/responder/auth/config', (_req, res) => {
  const env = readResponderEnvCredentials()
  return res.json({
    envReady: Boolean(env),
    hasClientCredentials: Boolean(
      process.env.RESPONDER_CLIENT_ID?.trim() && process.env.RESPONDER_CLIENT_SECRET?.trim(),
    ),
    hasUserToken: Boolean(process.env.RESPONDER_USER_TOKEN?.trim()),
  })
})

app.get('/api/responder/auth/status', (req, res) => {
  const session = getResponderSession(req)
  if (!session) {
    return res.json({ loggedIn: false })
  }
  return res.json({
    loggedIn: true,
    username: session.username,
    name: session.name,
    accountId: session.accountId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  })
})

app.post('/api/responder/auth/login', async (req, res) => {
  try {
    const creds = resolveResponderCredentials(req.body)
    if (!creds) {
      return res.status(400).json({
        message:
          'חסרים client_id, client_secret או user_token. קבלו מפתחות מתמיכת רב מסר והעתיקו User Token מהגדרות > חיבורים חיצוניים.',
      })
    }

    const oauth = await responderOAuthLogin(creds)
    await saveResponderOAuthSnapshot(oauth.raw).catch(() => {})
    const session = buildResponderSessionFromOAuth(creds, oauth)

    res.cookie('responder_session_id', session.id, authCookieOptions)
    return res.json({
      loggedIn: true,
      username: session.username,
      name: session.name,
      accountId: session.accountId,
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.post('/api/responder/auth/login-env', async (req, res) => {
  try {
    const env = readResponderEnvCredentials()
    if (!env) {
      return res.status(400).json({
        message:
          'הגדר ב-.env: RESPONDER_CLIENT_ID, RESPONDER_CLIENT_SECRET, RESPONDER_USER_TOKEN',
      })
    }

    const oauth = await responderOAuthLogin(env)
    await saveResponderOAuthSnapshot(oauth.raw).catch(() => {})
    const session = buildResponderSessionFromOAuth(env, oauth)

    res.cookie('responder_session_id', session.id, authCookieOptions)
    return res.json({
      loggedIn: true,
      username: session.username,
      name: session.name,
      accountId: session.accountId,
      fromEnv: true,
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.post('/api/responder/auth/refresh', requireResponderSession, async (req, res) => {
  try {
    const session = await refreshResponderSessionToken(req.responderSession)
    return res.json({
      refreshed: true,
      username: session.username,
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    return handleApiError(res, error)
  }
})

app.post('/api/responder/auth/logout', requireResponderSession, (req, res) => {
  responderSessions.delete(req.responderSession.id)
  res.clearCookie('responder_session_id')
  return res.json({ loggedOut: true })
})

app.get('/api/responder/lists', requireResponderSession, async (req, res) => {
  return withResponderSession(req, res, async (client) => {
    const response = await client.get('/lists', { params: req.query })
    return res.json(response.data)
  })
})

app.get('/api/responder/subscribers/search', requireResponderSession, async (req, res) => {
  return withResponderSession(req, res, async (client) => {
    const response = await client.get('/subscribers/search', { params: req.query })
    return res.json(response.data)
  })
})

app.post('/api/responder/proxy', requireResponderSession, async (req, res) => {
  return withResponderSession(req, res, async (client) => {
    const { method = 'GET', path, query, body } = req.body
    if (!path || !path.startsWith('/')) {
      return res.status(400).json({ message: 'path is required and must start with /' })
    }
    const response = await client.request({
      method,
      url: path,
      params: query,
      data: body,
    })
    return res.json(response.data)
  })
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
    return handleSubtitleApiError(res, error)
  }
})

app.post('/api/youtube/subtitles/translate', async (req, res) => {
  try {
    const { content, sourceLang = 'auto', targetLang } = req.body
    if (!content) {
      return res.status(400).json({ message: 'חסר תוכן כתוביות' })
    }
    if (!targetLang || targetLang === 'none') {
      return res.status(400).json({ message: 'חסרה שפת יעד לתרגום' })
    }

    const result = await translateVttContent(content, sourceLang, targetLang)
    const cueCount = parseVttCues(result.content).length

    return res.json({
      content: result.content,
      translatedLocally: result.translatedLocally,
      status: {
        state: 'ready',
        message: result.translatedLocally
          ? `תרגום מקומי ל${targetLang} · ${cueCount} שורות`
          : `${cueCount} שורות ללא תרגום`,
        cueCount,
        targetLang,
        translatedLocally: result.translatedLocally,
        delivery: 'server-translate',
        checkedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    return handleSubtitleApiError(res, error)
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
    return handleSubtitleApiError(res, error)
  }
})

app.post('/api/youtube/caption-tracks', async (req, res) => {
  try {
    const { videoId } = req.body
    if (!videoId) {
      return res.status(400).json({ message: 'חסר videoId' })
    }

    const info = await getCaptionTrackInfo(videoId, { preferPubProxy: preferYouTubePubProxy })
    return res.json({
      tracks: info.tracks || [],
      translationLanguages: info.translationLanguages || [],
      clientUserAgent: info.clientUserAgent || null,
    })
  } catch (error) {
    return handleSubtitleApiError(res, error)
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
    return handleSubtitleApiError(res, error)
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

if (isProduction && !isVercel) {
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

if (!isVercel) {
  app.listen(PORT, () => {
    const mode = isProduction ? 'production' : 'development'
    console.log(`Schooler listening on port ${PORT} (${mode})`)
  })
}

export default app
