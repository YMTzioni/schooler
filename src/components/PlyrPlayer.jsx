import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'
import { getActiveCue, parseVtt } from '../utils/vtt.js'
import { PLAYER_TRANSLATION_LANGUAGES } from '../constants/subtitleLanguages.js'
import { prefetchCaptionsForVideo, readCachedCaption } from '../utils/captionPrefetch.js'
import { getPrefetchPromise, setCachedCaption } from '../utils/captionCache.js'
import {
  buildErrorCaptionStatus,
  buildLoadingCaptionStatus,
  buildPrefetchCaptionStatus,
  normalizeApiCaptionStatus,
} from '../utils/subtitleStatus.js'
import { fetchCaptions } from '../utils/clientCaptions.js'
import { isCloudHostedApp, isYouTubeBlockedError } from '../utils/cloudHost.js'
import { enableNativeYouTubeCaptions, youtubeLangsMatch } from '../utils/youtubeNativeCaptions.js'
import { YOUTUBE_PLYR_OPTIONS, attachYouTubeShields } from '../../lib/youtubeEmbed.js'

const YT_QUALITY_LABELS = {
  auto: 'אוטומטי',
  highres: '4K',
  hd2160: '2160p',
  hd1440: '1440p',
  hd1080: '1080p',
  hd720: '720p',
  large: '480p',
  medium: '360p',
  small: '240p',
  tiny: '144p',
}

// YouTube events can arrive slightly late; show cue a bit earlier for smoother sync.
const CAPTION_LEAD_SECONDS = 0.18

function resolvePreferredTranslateLang(targetLang, captionLang) {
  if (targetLang && targetLang !== 'none') return targetLang
  if (captionLang && captionLang !== 'auto') return captionLang
  return 'none'
}

const buildPlyrOptions = () => ({
  captions: { active: true, update: false },
  youtube: {
    ...YOUTUBE_PLYR_OPTIONS,
    origin: window.location.origin,
  },
  controls: [
    'play-large',
    'play',
    'progress',
    'current-time',
    'mute',
    'volume',
    'settings',
    'fullscreen',
  ],
  settings: ['captions', 'quality', 'speed'],
  speed: {
    selected: 1,
    options: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  },
  i18n: {
    speed: 'מהירות',
    quality: 'איכות',
    captions: 'כתוביות',
    settings: 'הגדרות',
    disabled: 'כבוי',
    normal: 'רגיל',
    menuBack: 'חזרה',
  },
  hideControls: false,
  resetOnEnd: true,
  clickToPlay: true,
})

function updateSettingsValue(player, type, value) {
  const button = player.elements.settings?.buttons?.[type]
  const valueEl = button?.querySelector('.plyr__menu__value')
  if (valueEl) valueEl.textContent = value
}

function showSettingsSection(player, type, visible) {
  const button = player.elements.settings?.buttons?.[type]
  if (button) button.hidden = !visible
}

function createSettingsMenuItem({ title, checked, onClick }) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'plyr__control'
  button.setAttribute('role', 'menuitemradio')
  button.setAttribute('aria-checked', String(checked))
  button.innerHTML = `<span>${title}</span>`
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick(button)
  })
  return button
}

function getTranslationLabel(lang, options = PLAYER_TRANSLATION_LANGUAGES) {
  const match = options.find((item) => item.value === lang)
  return match?.label || lang?.toUpperCase() || 'ללא תרגום'
}

function setupYouTubeQualityMenu(player) {
  const embed = player.embed
  const panel = player.elements.settings?.panels?.quality
  const list = panel?.querySelector('[role="menu"]')
  if (!embed?.getAvailableQualityLevels || !list) return

  const levels = embed
    .getAvailableQualityLevels()
    .filter((level) => level && level !== 'unknown')

  list.innerHTML = ''

  if (levels.length <= 1) {
    showSettingsSection(player, 'quality', false)
    return
  }

  const current = embed.getPlaybackQuality?.() || levels[0]

  levels.forEach((level) => {
    const label = YT_QUALITY_LABELS[level] || level
    const item = createSettingsMenuItem({
      title: label,
      checked: level === current,
      onClick: (button) => {
        list.querySelectorAll('[role="menuitemradio"]').forEach((node) => {
          node.setAttribute('aria-checked', 'false')
        })
        button.setAttribute('aria-checked', 'true')
        embed.setPlaybackQuality(level)
        updateSettingsValue(player, 'quality', label)
      },
    })
    list.appendChild(item)
  })

  showSettingsSection(player, 'quality', true)
  updateSettingsValue(player, 'quality', YT_QUALITY_LABELS[current] || current)
}

function normalizeCueTimesForPlayback(cues, playerDuration) {
  if (!cues.length) return cues
  const maxEnd = cues[cues.length - 1]?.end || 0
  const durations = cues
    .map((cue) => Math.max(0, cue.end - cue.start))
    .filter((value) => Number.isFinite(value))
  const avgDuration = durations.length
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : 0

  const looksLikeMillisecondsAsSeconds =
    // Typical broken case from transcript fallback: huge cue durations.
    avgDuration > 25 ||
    // Or full timeline is unrealistically large for in-app lesson videos.
    maxEnd > 30_000 ||
    // Keep existing duration-based guard when player metadata is already ready.
    (playerDuration > 0 && maxEnd > Math.max(playerDuration * 5, 600))

  if (!looksLikeMillisecondsAsSeconds) return cues

  return cues.map((cue) => ({
    ...cue,
    start: cue.start / 1000,
    end: cue.end / 1000,
  }))
}

async function applyNativeCaptionFallback({
  player,
  targetLang,
  sourceLang = 'auto',
  error = null,
  playerRef,
  nativeCaptionsRef,
  captionsOnRef,
  setCaptionsOn,
  cuesRef,
  syncCaptionOverlay,
  refreshCaptionsSettingsMenu,
  emitCaptionStatus,
  translatedLocallyRef,
  pendingNativeCaptionLangRef,
}) {
  const resolvedPlayer = player || playerRef.current
  const result = await enableNativeYouTubeCaptions(resolvedPlayer, {
    targetLang,
    sourceLang,
  })

  const wantsTranslation = targetLang && targetLang !== 'none'
  const targetLabel = getTranslationLabel(targetLang, PLAYER_TRANSLATION_LANGUAGES)

  if (result.needsPlayback) {
    pendingNativeCaptionLangRef.current = targetLang
    nativeCaptionsRef.current = true
    translatedLocallyRef.current = false
    cuesRef.current = []
    captionsOnRef.current = true
    setCaptionsOn(true)
    refreshCaptionsSettingsMenu()
    if (resolvedPlayer) {
      updateSettingsValue(
        resolvedPlayer,
        'captions',
        wantsTranslation ? `תרגום YouTube: ${targetLabel}` : 'שפת מקור',
      )
    }
    emitCaptionStatus({
      state: 'partial',
      message: wantsTranslation
        ? `לחצו Play — תרגום YouTube ל${targetLabel} ייטען עם תחילת הנגינה`
        : 'לחצו Play כדי לטעון כתוביות מובנות של YouTube',
      delivery: 'youtube-native',
      cueCount: 0,
      targetLang: wantsTranslation ? targetLang : null,
      translatedLocally: false,
    })
    return 'pending-playback'
  }

  if (!result.ok) return false
  const gotTranslation = wantsTranslation && result.translated
  const sameLanguageOnly =
    result.sameLanguageOnly ||
    (wantsTranslation &&
      result.track &&
      youtubeLangsMatch(result.track.languageCode, sourceLang))

  pendingNativeCaptionLangRef.current = null
  nativeCaptionsRef.current = true
  translatedLocallyRef.current = false
  cuesRef.current = []
  captionsOnRef.current = true
  setCaptionsOn(true)
  syncCaptionOverlay()
  refreshCaptionsSettingsMenu()

  let message = 'כתוביות מובנות של YouTube'
  if (gotTranslation) {
    message = `תרגום YouTube ל${targetLabel}`
  } else if (wantsTranslation && sameLanguageOnly) {
    message = `שפת מקור (${targetLabel}) — אין תרגום נפרד לסרטון זה`
  } else if (wantsTranslation) {
    message = `מנסה ${targetLabel} — ייתכן שיוצגו כתוביות מקור בלבד`
  } else if (isYouTubeBlockedError(error)) {
    message = 'כתוביות מובנות של YouTube (השרת בענן חסום)'
  }

  if (resolvedPlayer) {
    updateSettingsValue(
      resolvedPlayer,
      'captions',
      gotTranslation ? `תרגום YouTube: ${targetLabel}` : wantsTranslation ? targetLabel : 'שפת מקור',
    )
  }

  emitCaptionStatus({
    state: gotTranslation ? 'ready' : sameLanguageOnly ? 'partial' : 'ready',
    message,
    delivery: 'youtube-native',
    cueCount: 0,
    targetLang: wantsTranslation ? targetLang : null,
    translatedLocally: false,
  })
  return true
}

async function loadCaptionsFromApi({ videoId, sourceLang, targetLang }) {
  return fetchCaptions(videoId, {
    lang: sourceLang,
    tlang: targetLang,
  })
}

function applyCaptionContent({ content, translatedLocally, playerDuration }) {
  const parsedCues = parseVtt(content)
  const cues = normalizeCueTimesForPlayback(parsedCues, playerDuration)
  if (!cues.length) {
    throw new Error('לא נמצאו כתוביות לפרק זה')
  }
  return { cues, translatedLocally: Boolean(translatedLocally) }
}

function CaptionStatusBar({ status }) {
  if (!status?.state || status.state === 'idle') return null

  return (
    <div className={`caption-status-bar caption-status-bar--${status.state}`} role="status" aria-live="polite">
      <span className="caption-status-bar__dot" aria-hidden="true" />
      <div className="caption-status-bar__body">
        <strong className="caption-status-bar__title">
          {status.state === 'loading' && 'טוען כתוביות'}
          {status.state === 'prefetching' && 'מכין כתוביות'}
          {status.state === 'ready' && status.delivery === 'youtube-native' && 'כתוביות YouTube'}
          {status.state === 'ready' && status.delivery !== 'browser' && status.delivery !== 'youtube-native' && 'כתוביות פעילות'}
          {status.state === 'cached' && 'כתוביות מהזיכרון'}
          {(status.state === 'ready' || status.state === 'cached') && status.delivery === 'browser' && 'כתוביות מהדפדפן'}
          {status.state === 'partial' && 'כתוביות חלקיות'}
          {status.state === 'error' && 'שגיאת כתוביות'}
          {status.state === 'blocked' && 'כתוביות חסומות'}
        </strong>
        <p className="caption-status-bar__message">{status.message}</p>
        {status.cueCount > 0 && (
          <p className="caption-status-bar__meta">
            {status.cueCount} שורות
            {status.delivery === 'pubproxy'
              ? ` · PubProxy${status.proxyCountry ? ` (${status.proxyCountry})` : ''}`
              : status.delivery === 'browser'
                ? ' · מהדפדפן'
                : ''}
            {status.checkedAt ? ` · ${new Date(status.checkedAt).toLocaleTimeString('he-IL')}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

function PlyrEmbed({
  videoId,
  title,
  episodeIndex,
  showCaptions,
  captionLang,
  sourceLang,
  targetLang,
  format,
  onCaptionStatusChange,
}) {
  const reactId = useId().replace(/:/g, '')
  const playerId = `plyr-player-${videoId}-${reactId}`
  const playerRef = useRef(null)
  const overlayRef = useRef(null)
  const cuesRef = useRef([])
  const captionsOnRef = useRef(showCaptions)
  const videoIdRef = useRef(videoId)
  const captionSyncTimerRef = useRef(null)
  const captionRequestIdRef = useRef(0)
  const prefetchRequestIdRef = useRef(0)
  const translationOptionsRef = useRef(PLAYER_TRANSLATION_LANGUAGES)
  const captionsMenuModeRef = useRef('main')
  const translatedLocallyRef = useRef(false)
  const nativeCaptionsRef = useRef(false)
  const subtitlePropsRef = useRef({ targetLang, captionLang })
  const captionApiSyncTimerRef = useRef(null)
  const pendingNativeCaptionLangRef = useRef(null)
  const applyPendingNativeCaptionsRef = useRef(async () => {})
  const playerTranslateLangRef = useRef(resolvePreferredTranslateLang(targetLang, captionLang))
  const [captionsOn, setCaptionsOn] = useState(showCaptions)

  const emitCaptionStatus = useCallback(
    (status) => {
      onCaptionStatusChange?.(status)
    },
    [onCaptionStatusChange],
  )

  const getCaptionLabel = useCallback(() => {
    const currentTranslateLang = playerTranslateLangRef.current
    if (currentTranslateLang && currentTranslateLang !== 'none') {
      const prefix = translatedLocallyRef.current
        ? 'תרגום מקומי'
        : nativeCaptionsRef.current
          ? 'תרגום YouTube'
          : 'תרגום'
      return `${prefix}: ${getTranslationLabel(currentTranslateLang, translationOptionsRef.current)}`
    }
    return 'שפת מקור'
  }, [])

  const syncCaptionOverlay = useCallback(() => {
    const overlay = overlayRef.current
    const player = playerRef.current
    if (!overlay) return

    if (!captionsOnRef.current || !cuesRef.current.length || !player) {
      overlay.textContent = ''
      overlay.hidden = true
      return
    }

    const cue = getActiveCue(cuesRef.current, player.currentTime + CAPTION_LEAD_SECONDS)
    overlay.textContent = cue?.text || ''
    overlay.hidden = !cue?.text
  }, [])

  const refreshCaptionsSettingsMenuRef = useRef(() => {})
  const switchNativeCaptionsRef = useRef(async () => false)

  const switchNativeCaptions = useCallback(
    async (targetLang, { error = null } = {}) =>
      applyNativeCaptionFallback({
        player: playerRef.current,
        targetLang,
        sourceLang,
        error,
        playerRef,
        nativeCaptionsRef,
        captionsOnRef,
        setCaptionsOn,
        cuesRef,
        syncCaptionOverlay,
        refreshCaptionsSettingsMenu: () => refreshCaptionsSettingsMenuRef.current?.(),
        emitCaptionStatus,
        translatedLocallyRef,
        pendingNativeCaptionLangRef,
      }),
    [emitCaptionStatus, sourceLang, syncCaptionOverlay],
  )

  const applyPendingNativeCaptions = useCallback(async () => {
    const lang =
      pendingNativeCaptionLangRef.current ||
      (captionsOnRef.current ? playerTranslateLangRef.current : null)
    if (!lang || lang === 'none') return
    if (!(isCloudHostedApp() || nativeCaptionsRef.current || captionsOnRef.current)) return
    await switchNativeCaptionsRef.current(lang)
  }, [])

  useEffect(() => {
    switchNativeCaptionsRef.current = switchNativeCaptions
    applyPendingNativeCaptionsRef.current = applyPendingNativeCaptions
  }, [switchNativeCaptions, applyPendingNativeCaptions])

  const refreshCaptionsSettingsMenu = useCallback(() => {
    const player = playerRef.current
    if (!player?.elements?.settings?.panels?.captions) return

    const panel = player.elements.settings.panels.captions
    const list = panel.querySelector('[role="menu"]')
    if (!list) return

    const activeLabel = getCaptionLabel()
    list.innerHTML = ''

    if (captionsMenuModeRef.current === 'translate') {
      const backButton = document.createElement('button')
      backButton.type = 'button'
      backButton.className = 'plyr__control'
      backButton.innerHTML = '<span>⬅ חזרה</span>'
      backButton.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
      })
      backButton.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        captionsMenuModeRef.current = 'main'
        refreshCaptionsSettingsMenu()
      })
      list.appendChild(backButton)

      translationOptionsRef.current.forEach((langOption) => {
        const item = createSettingsMenuItem({
          title: langOption.label,
          checked: playerTranslateLangRef.current === langOption.value,
          onClick: async (button) => {
            list.querySelectorAll('[role="menuitemradio"]').forEach((node) => {
              node.setAttribute('aria-checked', 'false')
            })
            button.setAttribute('aria-checked', 'true')
            playerTranslateLangRef.current = langOption.value
            cuesRef.current = []
            syncCaptionOverlay()
            if (captionsOnRef.current) {
              if (isCloudHostedApp() || nativeCaptionsRef.current) {
                const loaded = await switchNativeCaptionsRef.current(langOption.value)
                if (!loaded) return
              } else {
                const loaded = await loadCaptionsRef.current?.(langOption.value, { awaitPrefetch: true })
                if (!loaded) return
              }
            }
            updateSettingsValue(
              player,
              'captions',
              langOption.value === 'none'
                ? 'שפת מקור'
                : `${nativeCaptionsRef.current ? 'תרגום YouTube' : translatedLocallyRef.current ? 'תרגום מקומי' : 'תרגום'}: ${langOption.label}`,
            )
          },
        })
        list.appendChild(item)
      })
    } else {
      const offItem = createSettingsMenuItem({
        title: 'כבוי',
        checked: !captionsOnRef.current,
        onClick: (button) => {
          list.querySelectorAll('[role="menuitemradio"]').forEach((node) => {
            node.setAttribute('aria-checked', 'false')
          })
          button.setAttribute('aria-checked', 'true')
          captionsOnRef.current = false
          setCaptionsOn(false)
          syncCaptionOverlay()
          updateSettingsValue(player, 'captions', 'כבוי')
        },
      })

      const onItem = createSettingsMenuItem({
        title: activeLabel,
        checked: captionsOnRef.current,
        onClick: async (button) => {
          if (!cuesRef.current.length) {
            const loaded = await loadCaptionsRef.current?.(playerTranslateLangRef.current, {
              awaitPrefetch: true,
            })
            if (!loaded) return
          }
          list.querySelectorAll('[role="menuitemradio"]').forEach((node) => {
            node.setAttribute('aria-checked', 'false')
          })
          button.setAttribute('aria-checked', 'true')
          captionsOnRef.current = true
          setCaptionsOn(true)
          syncCaptionOverlay()
          updateSettingsValue(player, 'captions', activeLabel)
        },
      })

      const translateItem = document.createElement('button')
      translateItem.type = 'button'
      translateItem.className = 'plyr__control'
      translateItem.innerHTML = `<span>תרגום אוטומטי: ${getTranslationLabel(playerTranslateLangRef.current, translationOptionsRef.current)}</span>`
      translateItem.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
      })
      translateItem.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        captionsMenuModeRef.current = 'translate'
        refreshCaptionsSettingsMenu()
      })

      list.appendChild(offItem)
      list.appendChild(onItem)
      list.appendChild(translateItem)
    }

    showSettingsSection(player, 'captions', true)
    updateSettingsValue(player, 'captions', captionsOnRef.current ? activeLabel : 'כבוי')
  }, [getCaptionLabel, syncCaptionOverlay])

  const loadCaptionsRef = useRef(null)

  const loadCaptions = useCallback(async (
    selectedTargetLang = playerTranslateLangRef.current,
    { awaitPrefetch = false } = {},
  ) => {
    const currentVideoId = videoIdRef.current
    const requestId = captionRequestIdRef.current + 1
    captionRequestIdRef.current = requestId
    const player = playerRef.current
    const playerTargetLang = selectedTargetLang && selectedTargetLang !== 'none'
      ? selectedTargetLang
      : 'none'
    const needsTranslation = playerTargetLang !== 'none'

    emitCaptionStatus(
      buildLoadingCaptionStatus(
        isCloudHostedApp() ? 'מפעיל כתוביות מובנות של YouTube…' : 'טוען כתוביות מהשרת…',
      ),
    )

    if (isCloudHostedApp()) {
      const nativeReady = await switchNativeCaptions(playerTargetLang)
      if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false
      if (nativeReady) return true
    }

    const applyLoadedCaptions = (subtitle, { cached = false } = {}) => {
      const playerDuration = Number(playerRef.current?.duration) || 0
      const applied = applyCaptionContent({
        content: subtitle.content,
        translatedLocally: subtitle.translatedLocally,
        playerDuration,
      })
      translatedLocallyRef.current = applied.translatedLocally
      cuesRef.current = applied.cues
      refreshCaptionsSettingsMenu()
      syncCaptionOverlay()
      emitCaptionStatus(
        normalizeApiCaptionStatus(subtitle.status, { cached }) || {
          state: 'ready',
          message: `${applied.cues.length} שורות כתוביות נטענו`,
          cueCount: applied.cues.length,
        },
      )
      return true
    }

    const cached = readCachedCaption(currentVideoId, playerTargetLang)
    if (cached?.content) {
      if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false
      return applyLoadedCaptions(cached, { cached: true })
    }

    const inflightPrefetch = isCloudHostedApp() ? null : getPrefetchPromise(currentVideoId)
    if (inflightPrefetch && awaitPrefetch) {
      if (player) {
        updateSettingsValue(player, 'captions', 'מכין כתוביות…')
      }
      emitCaptionStatus(buildLoadingCaptionStatus('מכין כתוביות מהשרת…'))
      try {
        const prefetchResult = await inflightPrefetch
        emitCaptionStatus(buildPrefetchCaptionStatus(prefetchResult?.status))
        const prefetched = readCachedCaption(currentVideoId, playerTargetLang)
        if (prefetched?.content) {
          if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false
          return applyLoadedCaptions(prefetched, { cached: true })
        }
      } catch (error) {
        if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false
        const nativeReady = await switchNativeCaptions(playerTargetLang, { error })
        if (nativeReady) return true
        emitCaptionStatus(buildErrorCaptionStatus(error.message))
        console.warn('כתוביות:', error.message)
        return false
      }
    }

    if (player && needsTranslation) {
      updateSettingsValue(player, 'captions', 'מתרגם כתוביות…')
    }
    emitCaptionStatus(
      buildLoadingCaptionStatus(needsTranslation ? 'מתרגם כתוביות…' : 'מוריד כתוביות מהשרת…'),
    )

    try {
      const subtitle = await loadCaptionsFromApi({
        videoId: currentVideoId,
        sourceLang,
        targetLang: playerTargetLang,
      })

      if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false

      nativeCaptionsRef.current = false
      setCachedCaption(currentVideoId, playerTargetLang, {
        content: subtitle.content,
        translatedLocally: subtitle.translatedLocally,
        status: subtitle.status,
      })

      return applyLoadedCaptions(subtitle)
    } catch (error) {
      if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false

      const nativeReady = await switchNativeCaptions(playerTargetLang, { error })
      if (nativeReady) return true

      cuesRef.current = []
      captionsOnRef.current = false
      setCaptionsOn(false)
      syncCaptionOverlay()
      refreshCaptionsSettingsMenu()
      emitCaptionStatus(buildErrorCaptionStatus(error.message))
      console.warn('כתוביות:', error.message)
      return false
    }
  }, [
    emitCaptionStatus,
    refreshCaptionsSettingsMenu,
    sourceLang,
    switchNativeCaptions,
    syncCaptionOverlay,
  ])

  useEffect(() => {
    loadCaptionsRef.current = loadCaptions
  }, [loadCaptions])

  useEffect(() => {
    if (!videoId) return
    videoIdRef.current = videoId

    const propsChanged =
      subtitlePropsRef.current.targetLang !== targetLang ||
      subtitlePropsRef.current.captionLang !== captionLang

    if (propsChanged) {
      playerTranslateLangRef.current = resolvePreferredTranslateLang(targetLang, captionLang)
      subtitlePropsRef.current = { targetLang, captionLang }
    } else if (
      !playerTranslateLangRef.current ||
      playerTranslateLangRef.current === 'none'
    ) {
      playerTranslateLangRef.current = resolvePreferredTranslateLang(targetLang, captionLang)
    }

    captionRequestIdRef.current += 1
    captionsMenuModeRef.current = 'main'
    captionsOnRef.current = showCaptions
    setCaptionsOn(showCaptions)
    cuesRef.current = []
    translatedLocallyRef.current = false
    nativeCaptionsRef.current = false
    emitCaptionStatus(
      buildLoadingCaptionStatus(
        isCloudHostedApp() ? 'מפעיל כתוביות מובנות של YouTube…' : 'מכין כתוביות מהשרת…',
      ),
    )

    translationOptionsRef.current = PLAYER_TRANSLATION_LANGUAGES
    refreshCaptionsSettingsMenu()

    const prefetchId = prefetchRequestIdRef.current + 1
    prefetchRequestIdRef.current = prefetchId
    const priorityLang =
      playerTranslateLangRef.current && playerTranslateLangRef.current !== 'none'
        ? playerTranslateLangRef.current
        : captionLang && captionLang !== 'auto'
          ? captionLang
          : 'he'

    if (!isCloudHostedApp()) {
      const prefetchPromise = prefetchCaptionsForVideo({
        videoId,
        sourceLang,
        priorityLang,
      })

      prefetchPromise
        .then((prefetchResult) => {
          if (prefetchId !== prefetchRequestIdRef.current || videoIdRef.current !== videoId) return
          emitCaptionStatus(buildPrefetchCaptionStatus(prefetchResult?.status))
          if (!showCaptions || !captionsOnRef.current) return
          if (cuesRef.current.length) return
          loadCaptionsRef.current?.(playerTranslateLangRef.current)
        })
        .catch(async (error) => {
          if (prefetchId !== prefetchRequestIdRef.current) return
          const nativeReady = await switchNativeCaptions(playerTranslateLangRef.current, { error })
          if (!nativeReady) {
            emitCaptionStatus(buildErrorCaptionStatus(error.message))
            console.warn('הכנת כתוביות:', error.message)
          }
        })
    }

    if (showCaptions) {
      const runLoadCaptions = loadCaptionsRef.current
      if (!runLoadCaptions) return
      runLoadCaptions().then((loaded) => {
        if (loaded) {
          captionsOnRef.current = true
          setCaptionsOn(true)
          syncCaptionOverlay()
        }
      })
    } else {
      syncCaptionOverlay()
      refreshCaptionsSettingsMenu()
    }
  }, [
    videoId,
    sourceLang,
    targetLang,
    format,
    showCaptions,
    captionLang,
    emitCaptionStatus,
    refreshCaptionsSettingsMenu,
    syncCaptionOverlay,
  ])

  const syncCaptionOverlayRef = useRef(syncCaptionOverlay)

  useEffect(() => {
    refreshCaptionsSettingsMenuRef.current = refreshCaptionsSettingsMenu
    syncCaptionOverlayRef.current = syncCaptionOverlay
  }, [refreshCaptionsSettingsMenu, syncCaptionOverlay])

  useEffect(() => {
    if (!videoId) return

    const element = document.getElementById(playerId)
    if (!element) return

    const player = new Plyr(`#${playerId}`, buildPlyrOptions())
    playerRef.current = player

    const ensureOverlay = () => {
      if (!overlayRef.current) {
        const overlay = document.createElement('div')
        overlay.className = 'plyr-caption-overlay'
        overlay.hidden = true
        overlayRef.current = overlay
      }

      const container = player.elements.container
      const videoSurface =
        player.elements.wrapper ||
        container?.querySelector('.plyr__video-wrapper') ||
        container?.querySelector('.plyr__video-embed')

      if (container) {
        container.classList.add('plyr--yt-branded')
        container.addEventListener('contextmenu', (event) => event.preventDefault())
      }
      if (container && overlayRef.current.parentElement !== container) {
        container.appendChild(overlayRef.current)
      }
      if (videoSurface) {
        attachYouTubeShields(videoSurface)
      }
    }

    const startCaptionSync = () => {
      if (captionSyncTimerRef.current) return
      captionSyncTimerRef.current = window.setInterval(() => {
        syncCaptionOverlayRef.current()
      }, 200)
    }

    const stopCaptionSync = () => {
      if (!captionSyncTimerRef.current) return
      window.clearInterval(captionSyncTimerRef.current)
      captionSyncTimerRef.current = null
    }

    const onReady = () => {
      ensureOverlay()
      refreshCaptionsSettingsMenuRef.current()
      window.setTimeout(() => setupYouTubeQualityMenu(player), 300)
    }

    const scheduleNativeCaptionSync = () => {
      if (captionApiSyncTimerRef.current) {
        window.clearTimeout(captionApiSyncTimerRef.current)
      }
      captionApiSyncTimerRef.current = window.setTimeout(() => {
        captionApiSyncTimerRef.current = null
        if (!captionsOnRef.current) return
        const lang =
          pendingNativeCaptionLangRef.current || playerTranslateLangRef.current
        if (!lang || lang === 'none') return
        if (!(isCloudHostedApp() || nativeCaptionsRef.current)) return
        switchNativeCaptionsRef.current(lang)
      }, 200)
    }

    const onApiChange = () => scheduleNativeCaptionSync()

    if (player.embed?.addEventListener) {
      player.embed.addEventListener('onApiChange', onApiChange)
    }

    const onPlaying = () => {
      startCaptionSync()
      applyPendingNativeCaptionsRef.current?.()
      scheduleNativeCaptionSync()
    }

    const onTimeUpdate = () => syncCaptionOverlayRef.current()
    const onSeeked = () => syncCaptionOverlayRef.current()

    player.on('ready', onReady)
    player.on('timeupdate', onTimeUpdate)
    player.on('playing', onPlaying)
    player.on('pause', stopCaptionSync)
    player.on('ended', stopCaptionSync)
    player.on('seeked', onSeeked)

    return () => {
      stopCaptionSync()
      if (captionApiSyncTimerRef.current) {
        window.clearTimeout(captionApiSyncTimerRef.current)
        captionApiSyncTimerRef.current = null
      }
      if (player.embed?.removeEventListener) {
        player.embed.removeEventListener('onApiChange', onApiChange)
      }
      player.off('ready', onReady)
      player.off('timeupdate', onTimeUpdate)
      player.off('playing', onPlaying)
      player.off('pause', stopCaptionSync)
      player.off('ended', stopCaptionSync)
      player.off('seeked', onSeeked)
      if (overlayRef.current) {
        overlayRef.current.remove()
        overlayRef.current = null
      }
      player.destroy()
      playerRef.current = null
    }
  }, [playerId, videoId])

  useEffect(() => {
    refreshCaptionsSettingsMenu()
    syncCaptionOverlay()
  }, [captionsOn, refreshCaptionsSettingsMenu, syncCaptionOverlay])

  useEffect(() => {
    const propsChanged =
      subtitlePropsRef.current.targetLang !== targetLang ||
      subtitlePropsRef.current.captionLang !== captionLang
    if (!propsChanged) return

    subtitlePropsRef.current = { targetLang, captionLang }
    playerTranslateLangRef.current = resolvePreferredTranslateLang(targetLang, captionLang)
    refreshCaptionsSettingsMenu()

    if (!showCaptions || !captionsOnRef.current) return
    loadCaptionsRef.current?.(playerTranslateLangRef.current)
  }, [targetLang, captionLang, showCaptions, refreshCaptionsSettingsMenu])

  if (!videoId) return null

  return (
    <div className="plyr-stage">
      <div
        id={playerId}
        className="plyr__video-embed"
        data-plyr-provider="youtube"
        data-plyr-embed-id={videoId}
        title={title}
      />
    </div>
  )
}

export default function PlyrPlayer(props) {
  const { onCaptionStatusChange, ...embedProps } = props
  const [captionStatus, setCaptionStatus] = useState(null)

  const handleCaptionStatus = useCallback(
    (status) => {
      setCaptionStatus(status)
      onCaptionStatusChange?.(status)
    },
    [onCaptionStatusChange],
  )

  return (
    <div className="plyr-player-shell">
      <div className="plyr-player-wrap">
        <PlyrEmbed key={embedProps.videoId} {...embedProps} onCaptionStatusChange={handleCaptionStatus} />
      </div>
      <CaptionStatusBar status={captionStatus} />
    </div>
  )
}
