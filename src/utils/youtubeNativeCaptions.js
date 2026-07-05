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

const isServedSourceTrack = (track) =>
  Boolean(track) && (track.is_servable !== false || track.kind === 'asr')

const pickSourceCaptionTrack = (tracks, { sourceLang = 'auto' } = {}) => {
  if (!tracks.length) return null

  if (sourceLang && sourceLang !== 'auto') {
    const source = tracks.find(
      (track) => isServedSourceTrack(track) && youtubeLangsMatch(track.languageCode, sourceLang),
    )
    if (source) return source
  }

  const hebrew = tracks.find(
    (track) => isServedSourceTrack(track) && youtubeLangsMatch(track.languageCode, 'iw'),
  )
  if (hebrew) return hebrew

  const english = tracks.find(
    (track) => isServedSourceTrack(track) && youtubeLangsMatch(track.languageCode, 'en'),
  )
  if (english) return english

  return tracks.find(isServedSourceTrack) || tracks[0]
}

export const pickYouTubeCaptionTrack = (tracks, { targetLang = 'none', sourceLang = 'auto' } = {}) => {
  const wantsTranslation = targetLang && targetLang !== 'none'
  const normalizedTarget = normalizeYoutubeLang(targetLang)

  if (wantsTranslation && normalizedTarget) {
    const matches = tracks.filter((track) => youtubeLangsMatch(track.languageCode, targetLang))

    if (matches.length) {
      const served = matches.find((track) => track.is_servable !== false && track.kind !== 'asr')
      if (served) return { track: served, mode: 'translated' }

      const translateable = matches.find((track) => track.is_translateable)
      if (translateable) return { track: translateable, mode: 'translated' }

      const asr = matches.find((track) => track.kind === 'asr')
      if (asr) return { track: asr, mode: 'translated' }

      const virtual = matches.find((track) => track.is_servable === false)
      if (virtual) return { track: virtual, mode: 'translated' }

      return { track: matches[0], mode: 'translated' }
    }

    const sourceTrack = pickSourceCaptionTrack(tracks, { sourceLang })
    if (sourceTrack && youtubeLangsMatch(sourceTrack.languageCode, targetLang)) {
      return { track: sourceTrack, mode: 'source-same-language', sourceTrack }
    }

    return {
      track: { languageCode: normalizedTarget },
      mode: 'youtube-translate',
      sourceTrack,
    }
  }

  const sourceTrack = pickSourceCaptionTrack(tracks, { sourceLang })
  if (sourceTrack) return { track: sourceTrack, mode: 'source', sourceTrack }

  if (normalizedTarget) {
    return { track: { languageCode: normalizedTarget }, mode: 'fallback', sourceTrack: null }
  }

  return null
}

const applyCaptionSelection = (embed, selection) => {
  embed.loadModule('captions')

  if (selection.mode === 'youtube-translate' && selection.sourceTrack) {
    try {
      embed.setOption('captions', 'track', selection.sourceTrack)
    } catch {
      // Source track may be optional before requesting translation.
    }
  }

  embed.setOption('captions', 'track', selection.track)

  try {
    embed.setOption('captions', 'reload', true)
  } catch {
    // Optional in some players.
  }
}

export async function enableNativeYouTubeCaptions(
  player,
  { targetLang = 'none', sourceLang = 'auto' } = {},
  { maxAttempts = 24, delayMs = 300 } = {},
) {
  const wantsTranslation = targetLang && targetLang !== 'none'

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const embed = player?.embed
    if (!embed?.loadModule || !embed?.setOption) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs))
      continue
    }

    try {
      const tracklist = readTracklist(embed)
      const selection = pickYouTubeCaptionTrack(tracklist, { targetLang, sourceLang })

      if (!selection?.track) {
        if (!tracklist.length && wantsTranslation) {
          await new Promise((resolve) => window.setTimeout(resolve, delayMs))
          continue
        }

        const languageCode =
          normalizeYoutubeLang(targetLang !== 'none' ? targetLang : sourceLang) || 'iw'
        embed.loadModule('captions')
        embed.setOption('captions', 'track', { languageCode })
        try {
          embed.setOption('captions', 'reload', true)
        } catch {
          // Optional in some players.
        }

        return {
          ok: true,
          translated: wantsTranslation,
          track: { languageCode },
          tracklist,
          mode: 'fallback',
          sameLanguageOnly: false,
        }
      }

      applyCaptionSelection(embed, selection)

      const translated =
        wantsTranslation &&
        (selection.mode === 'translated' || selection.mode === 'youtube-translate') &&
        selection.mode !== 'source-same-language'

      return {
        ok: true,
        translated,
        track: selection.track,
        tracklist,
        mode: selection.mode,
        sameLanguageOnly: selection.mode === 'source-same-language',
      }
    } catch {
      // iframe still warming up
    }

    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
  }

  return {
    ok: false,
    translated: false,
    track: null,
    tracklist: [],
    mode: 'failed',
    sameLanguageOnly: false,
  }
}
