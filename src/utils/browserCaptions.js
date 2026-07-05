import { API_BASE } from '../config/api.js'
import { parseVtt } from './vtt.js'
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

const youtubeLangsMatch = (a, b) => {
  const left = a === 'he' ? 'iw' : a
  const right = b === 'he' ? 'iw' : b
  return left === right
}

const pickTrack = (tracks, lang = 'auto') => {
  if (!tracks?.length) return null
  if (lang && lang !== 'auto') {
    return tracks.find((track) => youtubeLangsMatch(track.lang, lang)) || null
  }
  return (
    tracks.find((track) => youtubeLangsMatch(track.lang, 'iw')) ||
    tracks.find((track) => youtubeLangsMatch(track.lang, 'he')) ||
    tracks.find((track) => track.isAuto) ||
    tracks[0]
  )
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

export async function fetchCaptionsViaBrowser(
  videoId,
  { lang = 'auto', tlang = 'none' } = {},
) {
  const trackInfo = await fetchCaptionTracks(videoId)
  const track = pickTrack(trackInfo.tracks, lang)
  if (!track?.baseUrl) {
    throw new Error('לא נמצאו מסלולי כתוביות לסרטון זה')
  }

  const sourceVtt = await fetchVttFromTrackUrl(track.baseUrl)
  const wantsTranslation = tlang && tlang !== 'none'

  if (!wantsTranslation) {
    return {
      content: sourceVtt,
      translatedLocally: false,
      status: {
        state: 'ready',
        message: 'כתוביות נטענו מהדפדפן',
        delivery: 'browser',
      },
    }
  }

  try {
    const youtubeTranslated = await fetchVttFromTrackUrl(track.baseUrl, { tlang })
    const sourceCues = parseVtt(sourceVtt)
    const translatedCues = parseVtt(youtubeTranslated)
    if (youtubeTranslationLooksApplied(sourceCues, translatedCues)) {
      return {
        content: youtubeTranslated,
        translatedLocally: false,
        status: {
          state: 'ready',
          message: `תרגום YouTube ל${tlang}`,
          delivery: 'browser-youtube',
        },
      }
    }
  } catch {
    // Fall back to browser Google Translate.
  }

  const localTranslation = await translateVttInBrowser(sourceVtt, track.lang, tlang)
  return {
    content: localTranslation.content,
    translatedLocally: localTranslation.translatedLocally,
    status: {
      state: 'ready',
      message: `תרגום בדפדפן ל${tlang}`,
      delivery: 'browser-translate',
    },
  }
}
