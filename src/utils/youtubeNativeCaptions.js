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

const isTranslateableTrack = (track) =>
  Boolean(
    track &&
      (track.is_translateable === true ||
        track.is_translatable === 1 ||
        track.is_translatable === true),
  )

const isServedSourceTrack = (track) =>
  Boolean(track) && (track.is_servable !== false || track.kind === 'asr')

const getAvailableModules = (embed) => {
  try {
    const options = embed?.getOptions?.()
    if (!Array.isArray(options)) return []
    return options.filter((moduleName) => moduleName === 'captions' || moduleName === 'cc')
  } catch {
    return []
  }
}

const readTracklist = (embed, moduleName) => {
  try {
    const tracklist = embed.getOption?.(moduleName, 'tracklist')
    return Array.isArray(tracklist) ? tracklist : []
  } catch {
    return []
  }
}

const readTranslationLanguages = (embed) => {
  try {
    const languages = embed.getOption?.('captions', 'translationLanguages')
    return Array.isArray(languages) ? languages : []
  } catch {
    return []
  }
}

const readBestTracklist = (embed, modules) => {
  const order = modules.length ? modules : ['captions', 'cc']
  let best = { moduleName: order[0], tracklist: [] }

  for (const moduleName of order) {
    const tracklist = readTracklist(embed, moduleName)
    if (tracklist.length > best.tracklist.length) {
      best = { moduleName, tracklist }
    }
  }

  return best
}

const waitForCaptionModules = (embed, timeoutMs = 12000) =>
  new Promise((resolve) => {
    const pick = () => getAvailableModules(embed)

    const existing = pick()
    if (existing.length) {
      resolve(existing)
      return
    }

    const onApiChange = () => {
      const modules = pick()
      if (modules.length) {
        embed.removeEventListener('onApiChange', onApiChange)
        clearTimeout(timer)
        resolve(modules)
      }
    }

    embed.addEventListener('onApiChange', onApiChange)
    const timer = window.setTimeout(() => {
      embed.removeEventListener('onApiChange', onApiChange)
      resolve(pick())
    }, timeoutMs)
  })

export const hasYouTubePlaybackStarted = (embed) => {
  const state = embed?.getPlayerState?.()
  return state !== undefined && state !== -1
}

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

const buildTrackForLanguage = (languageCode, tracklist, translationLanguages) => {
  const normalized = normalizeYoutubeLang(languageCode)
  if (!normalized) return null

  const matches = tracklist.filter((track) => youtubeLangsMatch(track.languageCode, languageCode))
  if (matches.length) {
    const translateable = matches.find(isTranslateableTrack)
    if (translateable) return { ...translateable }

    const virtual = matches.find((track) => track.is_servable === false)
    if (virtual) return { ...virtual }

    const served = matches.find((track) => isServedSourceTrack(track))
    if (served) return { ...served }

    return { ...matches[0] }
  }

  const fromTranslations = translationLanguages.find((track) =>
    youtubeLangsMatch(track.languageCode, languageCode),
  )
  if (fromTranslations) {
    return {
      languageCode: normalizeYoutubeLang(fromTranslations.languageCode) || normalized,
      languageName: fromTranslations.languageName || fromTranslations.displayName,
      is_translateable: true,
      vss_id: fromTranslations.vss_id || `.${normalized}`,
    }
  }

  return {
    languageCode: normalized,
    vss_id: `.${normalized}`,
  }
}

export const pickYouTubeCaptionTrack = (
  tracks,
  { targetLang = 'none', sourceLang = 'auto', translationLanguages = [] } = {},
) => {
  const wantsTranslation = targetLang && targetLang !== 'none'
  const normalizedTarget = normalizeYoutubeLang(targetLang)
  const sourceTrack = pickSourceCaptionTrack(tracks, { sourceLang })

  if (wantsTranslation && normalizedTarget) {
    const built = buildTrackForLanguage(targetLang, tracks, translationLanguages)
    if (!built) return null

    if (
      sourceTrack &&
      youtubeLangsMatch(built.languageCode, targetLang) &&
      youtubeLangsMatch(built.languageCode, sourceTrack.languageCode) &&
      !isTranslateableTrack(built)
    ) {
      return { track: built, mode: 'source-same-language', sourceTrack }
    }

    const translatingFromDifferentSource =
      sourceTrack && !youtubeLangsMatch(sourceTrack.languageCode, targetLang)

    const mode = translatingFromDifferentSource
      ? isTranslateableTrack(built) || built.is_servable === false
        ? 'translated'
        : 'youtube-translate'
      : 'translated'

    return { track: built, mode, sourceTrack }
  }

  if (sourceTrack) return { track: sourceTrack, mode: 'source', sourceTrack }

  if (normalizedTarget) {
    const built = buildTrackForLanguage(targetLang, tracks, translationLanguages)
    if (built) return { track: built, mode: 'fallback', sourceTrack: null }
  }

  return null
}

const applyCaptionSelection = (embed, moduleName, track) => {
  embed.loadModule(moduleName)
  embed.setOption(moduleName, 'track', track)

  try {
    embed.setOption(moduleName, 'reload', true)
  } catch {
    // Optional in some players.
  }
}

const applyCaptionSelectionAcrossModules = (embed, modules, track) => {
  const order = [...new Set([...modules, 'captions', 'cc'])]
  for (const moduleName of order) {
    try {
      applyCaptionSelection(embed, moduleName, track)
      return moduleName
    } catch {
      // Try the next module.
    }
  }
  return null
}

export async function enableNativeYouTubeCaptions(
  player,
  { targetLang = 'none', sourceLang = 'auto' } = {},
  { maxAttempts = 30, delayMs = 250, waitForModulesMs = 12000 } = {},
) {
  const wantsTranslation = targetLang && targetLang !== 'none'
  const embed = player?.embed

  if (!embed?.setOption) {
    return {
      ok: false,
      translated: false,
      track: null,
      tracklist: [],
      mode: 'failed',
      sameLanguageOnly: false,
      needsPlayback: true,
    }
  }

  if (!hasYouTubePlaybackStarted(embed)) {
    return {
      ok: false,
      translated: false,
      track: null,
      tracklist: [],
      mode: 'needs-playback',
      sameLanguageOnly: false,
      needsPlayback: true,
    }
  }

  const modules = await waitForCaptionModules(embed, waitForModulesMs)
  if (!modules.length) {
    return {
      ok: false,
      translated: false,
      track: null,
      tracklist: [],
      mode: 'failed',
      sameLanguageOnly: false,
      needsPlayback: false,
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const { moduleName, tracklist } = readBestTracklist(embed, modules)
      const translationLanguages = readTranslationLanguages(embed)
      const selection = pickYouTubeCaptionTrack(tracklist, {
        targetLang,
        sourceLang,
        translationLanguages,
      })

      if (!selection?.track) {
        if (wantsTranslation && attempt < maxAttempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, delayMs))
          continue
        }

        const languageCode =
          normalizeYoutubeLang(targetLang !== 'none' ? targetLang : sourceLang) || 'iw'
        applyCaptionSelectionAcrossModules(embed, modules, { languageCode })
        return {
          ok: true,
          translated: wantsTranslation,
          track: { languageCode },
          tracklist,
          mode: 'fallback',
          sameLanguageOnly: false,
          needsPlayback: false,
        }
      }

      const appliedModule = applyCaptionSelectionAcrossModules(embed, modules, selection.track)
      if (!appliedModule && attempt < maxAttempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs))
        continue
      }

      const translated =
        wantsTranslation &&
        (selection.mode === 'translated' || selection.mode === 'youtube-translate') &&
        selection.mode !== 'source-same-language'

      return {
        ok: Boolean(appliedModule),
        translated,
        track: selection.track,
        tracklist,
        mode: selection.mode,
        sameLanguageOnly: selection.mode === 'source-same-language',
        needsPlayback: false,
        moduleName: appliedModule || moduleName,
        translationLanguages,
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
    needsPlayback: false,
  }
}
