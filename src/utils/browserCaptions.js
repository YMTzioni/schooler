import { API_BASE } from '../config/api.js'
import {
  canYoutubeTranslateTo,
  normalizeTrackLang,
  pickBestSourceTrack,
  pickYoutubeTranslationCode,
} from '../../lib/captionTrackUtils.js'
import { parseVtt } from './vtt.js'
import { setCachedCaption, setVideoTrackMeta } from './captionCache.js'
import { translateVttInBrowser, youtubeTranslationLooksApplied } from './clientTranslate.js'

const parseApiResponse = async (response) => {
  const rawText = await response.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    throw new Error('תגובת שרת לא תקינה לכתוביות')
  }

  if (!response.ok) {
    const error = new Error(data?.message || `שגיאה בטעינת כתוביות (${response.status})`)
    error.code = data?.code || null
    error.tracks = data?.availableTracks || data?.tracks || null
    throw error
  }

  return data
}

export async function fetchCaptionTracks(videoId) {
  const response = await fetch(`${API_BASE}/youtube/caption-tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ videoId }),
  })
  return parseApiResponse(response)
}

export async function fetchVttFromTrackUrl(baseUrl, { tlang, fmt = 'vtt' } = {}) {
  const url = new URL(baseUrl)
  url.searchParams.set('fmt', fmt === 'srt' ? 'srt' : 'vtt')
  if (tlang && tlang !== 'none') {
    url.searchParams.set('tlang', tlang === 'he' ? 'iw' : tlang)
  }

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`YouTube timedtext ${response.status}`)
  }

  const content = await response.text()
  if (!content.trim() || !content.includes('WEBVTT')) {
    throw new Error('כתוביות ריקות מ-YouTube')
  }

  return content
}

const cacheSourceAndMeta = (videoId, trackInfo, track, sourceVtt) => {
  const sourceLang = normalizeTrackLang(track.lang)
  setVideoTrackMeta(videoId, {
    sourceLang,
    sourceName: track.name || sourceLang,
    tracks: trackInfo.tracks || [],
    translationLanguages: trackInfo.translationLanguages || [],
  })
  setCachedCaption(videoId, 'none', {
    content: sourceVtt,
    translatedLocally: false,
    sourceLang,
    status: {
      state: 'ready',
      message: `שפת מקור: ${sourceLang}`,
      delivery: 'browser',
      sourceLang,
    },
  })
  return sourceLang
}

const tryYoutubeTranslation = async (track, trackInfo, sourceVtt, targetLang) => {
  if (!canYoutubeTranslateTo(trackInfo.translationLanguages, targetLang)) {
    return null
  }

  const youtubeCode = pickYoutubeTranslationCode(trackInfo.translationLanguages, targetLang)
  if (!youtubeCode) return null

  try {
    const youtubeTranslated = await fetchVttFromTrackUrl(track.baseUrl, {
      tlang: youtubeCode,
    })
    const sourceCues = parseVtt(sourceVtt)
    const translatedCues = parseVtt(youtubeTranslated)
    if (youtubeTranslationLooksApplied(sourceCues, translatedCues)) {
      return {
        content: youtubeTranslated,
        translatedLocally: false,
        status: {
          state: 'ready',
          message: `תרגום YouTube ל${targetLang}`,
          delivery: 'browser-youtube',
        },
      }
    }
  } catch {
    // Fall through to Google Translate.
  }

  return null
}

export async function fetchCaptionsViaBrowser(
  videoId,
  { lang = 'auto', tlang = 'none' } = {},
) {
  const trackInfo = await fetchCaptionTracks(videoId)
  const track = pickBestSourceTrack(trackInfo.tracks, lang)
  if (!track?.baseUrl) {
    throw new Error('לא נמצאו מסלולי כתוביות לסרטון זה')
  }

  const wantsTranslation = tlang && tlang !== 'none'
  const sourceVtt = await fetchVttFromTrackUrl(track.baseUrl)
  const sourceLang = cacheSourceAndMeta(videoId, trackInfo, track, sourceVtt)

  if (!wantsTranslation) {
    return {
      content: sourceVtt,
      translatedLocally: false,
      sourceLang,
      status: {
        state: 'ready',
        message: `כתוביות נטענו (${sourceLang})`,
        delivery: 'browser',
        sourceLang,
      },
    }
  }

  const youtubeResult = await tryYoutubeTranslation(track, trackInfo, sourceVtt, tlang)
  if (youtubeResult) {
    return {
      ...youtubeResult,
      sourceLang,
    }
  }

  const localTranslation = await translateVttInBrowser(sourceVtt, sourceLang, tlang)
  return {
    content: localTranslation.content,
    translatedLocally: localTranslation.translatedLocally,
    sourceLang: localTranslation.detectedSourceLang || sourceLang,
    status: {
      state: 'ready',
      message: `תרגום בדפדפן ל${tlang} (מקור: ${localTranslation.detectedSourceLang || sourceLang})`,
      delivery: 'browser-translate',
      sourceLang: localTranslation.detectedSourceLang || sourceLang,
    },
  }
}
