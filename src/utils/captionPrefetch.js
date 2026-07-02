import { PREFETCH_TRANSLATION_LANGS } from '../constants/subtitleLanguages.js'
import { API_BASE } from '../config/api.js'
import {
  getCachedCaption,
  getPrefetchPromise,
  setCachedCaption,
  setPrefetchPromise,
} from './captionCache.js'

export async function prefetchCaptionsForVideo({
  videoId,
  sourceLang = 'auto',
  priorityLang = 'he',
}) {
  const existing = getPrefetchPromise(videoId)
  if (existing) return existing

  const promise = fetch(`${API_BASE}/youtube/subtitles/prefetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      videoId,
      lang: sourceLang,
      langs: PREFETCH_TRANSLATION_LANGS,
      priorityLang: priorityLang && priorityLang !== 'auto' ? priorityLang : 'he',
    }),
  }).then(async (response) => {
    const rawText = await response.text()
    let data = null
    try {
      data = rawText ? JSON.parse(rawText) : null
    } catch {
      throw new Error('תגובת שרת לא תקינה להכנת כתוביות')
    }

    if (!response.ok) {
      throw new Error(data?.message || `שגיאה בהכנת כתוביות (${response.status})`)
    }

    Object.entries(data.subtitles || {}).forEach(([targetLang, subtitle]) => {
      setCachedCaption(videoId, targetLang, {
        content: subtitle.content,
        translatedLocally: Boolean(subtitle.translatedLocally),
      })
    })

    return data
  })

  return setPrefetchPromise(videoId, promise)
}

export function readCachedCaption(videoId, targetLang) {
  const normalizedLang = targetLang && targetLang !== 'none' ? targetLang : 'none'
  return getCachedCaption(videoId, normalizedLang)
}
