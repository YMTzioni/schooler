const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'

const pickTrack = (tracks, lang) => {
  if (!tracks.length) return null
  if (lang && lang !== 'auto') {
    const match = tracks.find((track) => track.languageCode === lang)
    if (lang === 'he') {
      return match || tracks.find((track) => track.languageCode === 'iw') || null
    }
    return match
  }

  return (
    tracks.find((track) => track.languageCode === 'iw' || track.languageCode === 'he') ||
    tracks.find((track) => track.languageCode === 'en') ||
    tracks[0]
  )
}

export async function fetchCaptionsInBrowser(videoId, { lang = 'auto' } = {}) {
  const response = await fetch(INNERTUBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
    throw new Error(`YouTube InnerTube (${response.status})`)
  }

  const data = await response.json()
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
  const track = pickTrack(tracks, lang)

  if (!track?.baseUrl) {
    throw new Error('לא נמצאו כתוביות לסרטון זה')
  }

  const subtitleUrl = new URL(track.baseUrl.replace(/\\u0026/g, '&'))
  subtitleUrl.searchParams.set('fmt', 'vtt')

  const vttResponse = await fetch(subtitleUrl.toString())
  if (!vttResponse.ok) {
    throw new Error(`שגיאה בהורדת קובץ כתוביות (${vttResponse.status})`)
  }

  const content = await vttResponse.text()
  if (!content.includes('WEBVTT')) {
    throw new Error('קובץ הכתוביות לא תקין')
  }

  return {
    content,
    translatedLocally: false,
    status: {
      state: 'ready',
      message: `${track.languageCode} · נטען מהדפדפן שלך (ללא שרת)`,
      cueCount: 0,
      sourceLang: track.languageCode,
      delivery: 'browser',
      checkedAt: new Date().toISOString(),
    },
  }
}
