import { PREFETCH_TRANSLATION_LANGS } from '../constants/subtitleLanguages.js'
import { API_BASE } from '../config/api.js'
import {
  getCachedCaption,
  getPrefetchPromise,
  setCachedCaption,
  setPrefetchPromise,
} from './captionCache.js'
import { isCloudHostedApp } from './cloudHost.js'
import { fetchCaptionsViaBrowser } from './browserCaptions.js'

async function prefetchViaServer({
  videoId,
  sourceLang = 'auto',
  priorityLang = 'he',
  langs = PREFETCH_TRANSLATION_LANGS,
}) {
  const response = await fetch(`${API_BASE}/youtube/subtitles/prefetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      videoId,
      lang: sourceLang,
      langs,
      priorityLang: priorityLang && priorityLang !== 'auto' ? priorityLang : 'he',
    }),
  })

  const rawText = await response.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    throw new Error('תגובת שרת לא תקינה להכנת כתוביות')
  }

  if (!response.ok) {
    const error = new Error(data?.message || `שגיאה בהכנת כתוביות (${response.status})`)
    error.code = data?.code || null
    throw error
  }

  Object.entries(data.subtitles || {}).forEach(([targetLang, subtitle]) => {
    setCachedCaption(videoId, targetLang, {
      content: subtitle.content,
      translatedLocally: Boolean(subtitle.translatedLocally),
      sourceLang: subtitle.sourceLang || data?.sourceLang || null,
      status: subtitle.status || null,
    })
  })

  return data
}

async function prefetchViaBrowser({
  videoId,
  sourceLang = 'auto',
  priorityLang = 'he',
}) {
  const langsToWarm = [...new Set(['none', priorityLang && priorityLang !== 'auto' ? priorityLang : 'he'])]
  const subtitles = {}
  let detectedSourceLang = null
  const errors = []

  for (const tlang of langsToWarm) {
    try {
      const subtitle = await fetchCaptionsViaBrowser(videoId, {
        lang: sourceLang,
        tlang,
      })
      if (subtitle.sourceLang) detectedSourceLang = subtitle.sourceLang
      setCachedCaption(videoId, tlang, {
        content: subtitle.content,
        translatedLocally: Boolean(subtitle.translatedLocally),
        sourceLang: subtitle.sourceLang || detectedSourceLang,
        status: subtitle.status || null,
      })
      subtitles[tlang] = subtitle
    } catch (error) {
      errors.push({ tlang, message: error.message })
    }
  }

  if (!Object.keys(subtitles).length) {
    throw new Error(errors[0]?.message || 'לא ניתן להכין כתוביות לפני הניגון')
  }

  return {
    videoId,
    subtitles,
    sourceLang: detectedSourceLang,
    status: {
      state: errors.length ? 'partial' : 'ready',
      message: detectedSourceLang
        ? `שפת מקור: ${detectedSourceLang}${priorityLang && priorityLang !== 'none' ? ` · תרגום ל${priorityLang} מוכן` : ''}`
        : 'כתוביות הוכנו לפני הניגון',
      delivery: 'browser-prefetch',
      sourceLang: detectedSourceLang,
    },
    errors,
  }
}

export async function prepareCaptionsForVideo({
  videoId,
  sourceLang = 'auto',
  priorityLang = 'he',
  langs = PREFETCH_TRANSLATION_LANGS,
}) {
  const existing = getPrefetchPromise(videoId)
  if (existing) return existing

  const promise = isCloudHostedApp()
    ? prefetchViaBrowser({ videoId, sourceLang, priorityLang })
    : prefetchViaServer({ videoId, sourceLang, priorityLang, langs })

  return setPrefetchPromise(videoId, promise)
}

/** @deprecated Use prepareCaptionsForVideo */
export async function prefetchCaptionsForVideo(options) {
  return prepareCaptionsForVideo(options)
}

export function readCachedCaption(videoId, targetLang) {
  const normalizedLang = targetLang && targetLang !== 'none' ? targetLang : 'none'
  return getCachedCaption(videoId, normalizedLang)
}
