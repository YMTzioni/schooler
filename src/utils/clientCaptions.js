import { API_BASE } from '../config/api.js'
import { parseVtt } from './vtt.js'
import { PREFETCH_TRANSLATION_LANGS } from '../constants/subtitleLanguages.js'
import {
  getPrefetchPromise,
  setCachedCaption,
  setPrefetchPromise,
} from './captionCache.js'

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'

const normalizeLang = (lang) => {
  if (!lang || lang === 'none' || lang === 'auto') return ''
  if (lang === 'he' || lang === 'iw') return 'he'
  return lang
}

const shouldSkipTranslation = (sourceLang, targetLang) => {
  if (!targetLang || targetLang === 'none') return true
  return normalizeLang(sourceLang) === normalizeLang(targetLang)
}

const translationLooksApplied = (sourceContent, translatedContent) => {
  const sourceCues = parseVtt(sourceContent)
  const translatedCues = parseVtt(translatedContent)
  if (!sourceCues.length || !translatedCues.length) return false

  const sampleSize = Math.min(sourceCues.length, translatedCues.length, 24)
  let sameCount = 0

  for (let index = 0; index < sampleSize; index += 1) {
    if (sourceCues[index].text.trim() === translatedCues[index].text.trim()) {
      sameCount += 1
    }
  }

  return sameCount / sampleSize < 0.65
}

const pickTrack = (tracks, lang) => {
  if (!tracks.length) return null
  if (lang && lang !== 'auto') {
    if (lang === 'he' || lang === 'iw') {
      return (
        tracks.find((track) => track.languageCode === 'he') ||
        tracks.find((track) => track.languageCode === 'iw') ||
        null
      )
    }
    return tracks.find((track) => track.languageCode === lang) || null
  }

  return (
    tracks.find((track) => track.languageCode === 'iw' || track.languageCode === 'he') ||
    tracks.find((track) => track.languageCode === 'en') ||
    tracks[0]
  )
}

const buildBrowserStatus = ({ sourceLang, targetLang, translatedLocally, cueCount }) => {
  const parts = [`${cueCount} שורות`, 'מהדפדפן שלך']
  if (sourceLang) parts.push(`מקור: ${sourceLang}`)
  if (targetLang && targetLang !== 'none' && !shouldSkipTranslation(sourceLang, targetLang)) {
    parts.push(translatedLocally ? `תרגום מקומי ל${targetLang}` : `תרגום ל${targetLang}`)
  }
  return {
    state: 'ready',
    message: parts.join(' · '),
    cueCount,
    sourceLang: sourceLang || null,
    targetLang: targetLang && targetLang !== 'none' ? targetLang : null,
    translatedLocally: Boolean(translatedLocally),
    delivery: 'browser',
    checkedAt: new Date().toISOString(),
  }
}

export async function fetchTracksFromBrowser(videoId) {
  const response = await fetch(INNERTUBE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
        },
      },
      videoId,
    }),
  })

  if (!response.ok) {
    throw new Error(`YouTube חסם או לא זמין (${response.status})`)
  }

  const data = await response.json()
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
  if (!tracks.length) {
    throw new Error('לא נמצאו כתוביות לסרטון זה')
  }
  return tracks
}

export async function fetchVttFromBrowser(track, { tlang = null } = {}) {
  if (!track?.baseUrl) {
    throw new Error('מסלול כתוביות לא זמין')
  }

  const subtitleUrl = new URL(track.baseUrl.replace(/\\u0026/g, '&'))
  subtitleUrl.searchParams.set('fmt', 'vtt')
  if (tlang && !shouldSkipTranslation(track.languageCode, tlang)) {
    subtitleUrl.searchParams.set('tlang', tlang === 'he' ? 'iw' : tlang)
  }

  const vttResponse = await fetch(subtitleUrl.toString())
  if (!vttResponse.ok) {
    throw new Error(`שגיאה בהורדת כתוביות (${vttResponse.status})`)
  }

  const content = await vttResponse.text()
  if (!content.includes('WEBVTT')) {
    throw new Error('קובץ הכתוביות לא תקין')
  }

  return content
}

async function translateCaptionsViaServer(content, sourceLang, targetLang) {
  const response = await fetch(`${API_BASE}/youtube/subtitles/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      content,
      sourceLang,
      targetLang,
    }),
  })

  const rawText = await response.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    throw new Error('תגובת שרת לא תקינה לתרגום')
  }

  if (!response.ok) {
    throw new Error(data?.message || `שגיאה בתרגום (${response.status})`)
  }

  return {
    content: data.content,
    translatedLocally: Boolean(data.translatedLocally),
    status: data.status || null,
  }
}

export async function fetchCaptionsInBrowser(
  videoId,
  { lang = 'auto', tlang = 'none' } = {},
) {
  const tracks = await fetchTracksFromBrowser(videoId)
  const track = pickTrack(tracks, lang)
  if (!track) {
    throw new Error('לא נמצאו כתוביות בשפה המבוקשת')
  }

  const effectiveTlang = tlang && tlang !== 'none' ? tlang : 'none'
  let content = ''
  let translatedLocally = false

  const sourceContent = await fetchVttFromBrowser(track)

  if (shouldSkipTranslation(track.languageCode, effectiveTlang)) {
    content = sourceContent
  } else {
    let tlangContent = null
    try {
      tlangContent = await fetchVttFromBrowser(track, { tlang: effectiveTlang })
    } catch {
      tlangContent = null
    }

    if (tlangContent && translationLooksApplied(sourceContent, tlangContent)) {
      content = tlangContent
    } else {
      const translated = await translateCaptionsViaServer(
        sourceContent,
        track.languageCode,
        effectiveTlang,
      )
      content = translated.content
      translatedLocally = translated.translatedLocally
    }
  }

  const cueCount = parseVtt(content).length
  if (!cueCount) {
    throw new Error('לא נמצאו שורות כתוביות')
  }

  return {
    content,
    translatedLocally,
    status: buildBrowserStatus({
      sourceLang: track.languageCode,
      targetLang: effectiveTlang,
      translatedLocally,
      cueCount,
    }),
  }
}

export function prefetchCaptionsInBrowser({
  videoId,
  sourceLang = 'auto',
  langs = PREFETCH_TRANSLATION_LANGS,
  priorityLang = 'he',
}) {
  const existing = getPrefetchPromise(videoId)
  if (existing) return existing

  const promise = (async () => {
    const uniqueLangs = [...new Set(langs)]
    const orderedLangs = [...uniqueLangs]
    if (priorityLang && orderedLangs.includes(priorityLang)) {
      orderedLangs.sort((a, b) => {
        if (a === priorityLang) return -1
        if (b === priorityLang) return 1
        return 0
      })
    }

    const subtitles = {}
    let readyCount = 0

    for (const targetLang of orderedLangs) {
      try {
        const subtitle = await fetchCaptionsInBrowser(videoId, {
          lang: sourceLang,
          tlang: targetLang,
        })
        subtitles[targetLang] = subtitle
        setCachedCaption(videoId, targetLang, subtitle)
        readyCount += 1
      } catch (error) {
        subtitles[targetLang] = {
          content: '',
          translatedLocally: false,
          status: {
            state: 'error',
            message: error.message,
            cueCount: 0,
            delivery: 'browser',
          },
        }
      }
    }

    return {
      videoId,
      subtitles,
      status: {
        state: readyCount ? (readyCount === uniqueLangs.length ? 'ready' : 'partial') : 'failed',
        message: readyCount
          ? `מוכנות ${readyCount}/${uniqueLangs.length} שפות מהדפדפן`
          : 'לא הצלחנו להכין כתוביות מהדפדפן',
        readyCount,
        totalLangs: uniqueLangs.length,
      },
    }
  })()

  return setPrefetchPromise(videoId, promise)
}
