/** Shared caption track selection — server + browser */

export const youtubeLangsMatch = (a, b) => {
  if (!a || !b) return false
  const left = a === 'he' || a === 'iw' ? 'he' : a
  const right = b === 'he' || b === 'iw' ? 'he' : b
  return left === right
}

export const normalizeTrackLang = (lang) => {
  if (!lang) return ''
  if (lang === 'iw') return 'he'
  return lang
}

const matchesLang = (track, requestedLang) => {
  if (!track?.lang) return false
  if (requestedLang === 'he' || requestedLang === 'iw') {
    return track.lang === 'he' || track.lang === 'iw'
  }
  return youtubeLangsMatch(track.lang, requestedLang)
}

/**
 * Pick the best source caption track.
 * When preferredLang is "auto", prefers manual tracks over auto-generated,
 * then Hebrew / English, then any manual, then first available.
 */
export const pickBestSourceTrack = (tracks, preferredLang = 'auto') => {
  if (!tracks?.length) return null

  if (preferredLang && preferredLang !== 'auto') {
    const exact = tracks.find((track) => matchesLang(track, preferredLang))
    if (exact) return exact
    const autoVariant = tracks.find(
      (track) => matchesLang(track, preferredLang) && track.isAuto,
    )
    if (autoVariant) return autoVariant
  }

  const manualHebrew = tracks.find(
    (track) => (track.lang === 'he' || track.lang === 'iw') && !track.isAuto,
  )
  if (manualHebrew) return manualHebrew

  const autoHebrew = tracks.find((track) => track.lang === 'he' || track.lang === 'iw')
  if (autoHebrew) return autoHebrew

  const manualEnglish = tracks.find((track) => track.lang === 'en' && !track.isAuto)
  if (manualEnglish) return manualEnglish

  const autoEnglish = tracks.find((track) => track.lang === 'en')
  if (autoEnglish) return autoEnglish

  const anyManual = tracks.find((track) => !track.isAuto)
  if (anyManual) return anyManual

  const anyAuto = tracks.find((track) => track.isAuto)
  return anyAuto || tracks[0]
}

export const pickYoutubeTranslationCode = (translationLanguages, targetLang) => {
  if (!targetLang || targetLang === 'none' || !translationLanguages?.length) return null
  const normalized = normalizeTrackLang(targetLang)

  const exact = translationLanguages.find((entry) => {
    const code = entry?.languageCode || entry?.code || entry?.lang
    return youtubeLangsMatch(code, normalized)
  })
  if (exact) return exact.languageCode || exact.code || exact.lang

  return null
}

export const canYoutubeTranslateTo = (translationLanguages, targetLang) =>
  Boolean(pickYoutubeTranslationCode(translationLanguages, targetLang))
