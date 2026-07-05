export const normalizeYoutubeLang = (lang) => {
  if (!lang || lang === 'none' || lang === 'auto') return ''
  if (lang === 'he') return 'iw'
  return lang
}

export const youtubeLangsMatch = (a, b) => {
  const left = normalizeYoutubeLang(a)
  const right = normalizeYoutubeLang(b)
  if (!left || !right) return false
  if ((left === 'iw' || left === 'he') && (right === 'iw' || right === 'he')) return true
  return left === right
}

const readTracklist = (embed) => {
  try {
    const tracklist = embed.getOption?.('captions', 'tracklist')
    return Array.isArray(tracklist) ? tracklist : []
  } catch {
    return []
  }
}

export const pickYouTubeCaptionTrack = (tracks, { targetLang = 'none', sourceLang = 'auto' } = {}) => {
  if (!tracks.length) return null

  const wantsTranslation = targetLang && targetLang !== 'none'

  if (wantsTranslation) {
    const translated = tracks.find((track) => youtubeLangsMatch(track.languageCode, targetLang))
    if (translated) return { track: translated, mode: 'translated' }
  }

  if (sourceLang && sourceLang !== 'auto') {
    const source = tracks.find((track) => youtubeLangsMatch(track.languageCode, sourceLang))
    if (source) return { track: source, mode: 'source' }
  }

  const hebrew = tracks.find((track) => youtubeLangsMatch(track.languageCode, 'iw'))
  if (hebrew) return { track: hebrew, mode: 'source' }

  const english = tracks.find((track) => youtubeLangsMatch(track.languageCode, 'en'))
  if (english) return { track: english, mode: 'source' }

  return { track: tracks[0], mode: 'source' }
}

export async function enableNativeYouTubeCaptions(
  player,
  { targetLang = 'none', sourceLang = 'auto' } = {},
  { maxAttempts = 20, delayMs = 300 } = {},
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const embed = player?.embed
    if (!embed?.loadModule || !embed?.setOption) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs))
      continue
    }

    try {
      embed.loadModule('captions')
      const tracklist = readTracklist(embed)
      const selection = pickYouTubeCaptionTrack(tracklist, { targetLang, sourceLang })

      if (selection?.track) {
        embed.setOption('captions', 'track', selection.track)
      } else {
        const languageCode =
          normalizeYoutubeLang(targetLang !== 'none' ? targetLang : sourceLang) || 'iw'
        embed.setOption('captions', 'track', { languageCode })
      }

      try {
        embed.setOption('captions', 'reload', true)
      } catch {
        // Optional in some players.
      }

      const wantsTranslation = targetLang && targetLang !== 'none'
      const translated =
        wantsTranslation &&
        selection?.mode === 'translated' &&
        !youtubeLangsMatch(selection.track?.languageCode, sourceLang)

      return {
        ok: true,
        translated,
        track: selection?.track || null,
        tracklist,
        mode: selection?.mode || 'fallback',
      }
    } catch {
      // iframe still warming up
    }

    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
  }

  return { ok: false, translated: false, track: null, tracklist: [], mode: 'failed' }
}
