import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'
import { getActiveCue, parseVtt } from '../utils/vtt.js'
import { PLAYER_TRANSLATION_LANGUAGES } from '../constants/subtitleLanguages.js'
import { API_BASE } from '../config/api.js'
import { prefetchCaptionsForVideo, readCachedCaption } from '../utils/captionPrefetch.js'
import { getPrefetchPromise, setCachedCaption } from '../utils/captionCache.js'

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

const buildPlyrOptions = () => ({
  youtube: {
    noCookie: true,
    customControls: true,
    rel: 0,
    modestbranding: 1,
    iv_load_policy: 3,
    playsinline: 1,
    cc_load_policy: 0,
    enablejsapi: 1,
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

async function fetchCaptionsFromApi({ videoId, index, title, sourceLang, targetLang, format }) {
  const response = await fetch(`${API_BASE}/youtube/subtitles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      videoId,
      index,
      title,
      lang: sourceLang,
      tlang: targetLang,
      fmt: format,
    }),
  })

  const rawText = await response.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    throw new Error('תגובת שרת לא תקינה לכתוביות')
  }

  if (!response.ok) {
    throw new Error(data?.message || `שגיאה בטעינת כתוביות (${response.status})`)
  }

  return {
    content: data.content,
    translatedLocally: Boolean(data.translatedLocally),
  }
}

function applyCaptionContent({ content, translatedLocally, playerDuration }) {
  const parsedCues = parseVtt(content)
  const cues = normalizeCueTimesForPlayback(parsedCues, playerDuration)
  if (!cues.length) {
    throw new Error('לא נמצאו כתוביות לפרק זה')
  }
  return { cues, translatedLocally: Boolean(translatedLocally) }
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
}) {
  const reactId = useId().replace(/:/g, '')
  const playerId = `plyr-player-${videoId}-${reactId}`
  const playerRef = useRef(null)
  const overlayRef = useRef(null)
  const topLeftShieldRef = useRef(null)
  const cuesRef = useRef([])
  const captionsOnRef = useRef(showCaptions)
  const videoIdRef = useRef(videoId)
  const captionSyncTimerRef = useRef(null)
  const captionRequestIdRef = useRef(0)
  const prefetchRequestIdRef = useRef(0)
  const translationOptionsRef = useRef(PLAYER_TRANSLATION_LANGUAGES)
  const captionsMenuModeRef = useRef('main')
  const translatedLocallyRef = useRef(false)
  const playerTranslateLangRef = useRef(
    targetLang && targetLang !== 'none'
      ? targetLang
      : captionLang && captionLang !== 'auto'
        ? captionLang
        : 'none',
  )
  const [captionsOn, setCaptionsOn] = useState(showCaptions)

  const getCaptionLabel = useCallback(() => {
    const currentTranslateLang = playerTranslateLangRef.current
    if (currentTranslateLang && currentTranslateLang !== 'none') {
      const prefix = translatedLocallyRef.current ? 'תרגום מקומי' : 'תרגום'
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
            // Clear old-language cues immediately so the switch feels instant.
            cuesRef.current = []
            syncCaptionOverlay()
            if (captionsOnRef.current) {
              const loaded = await loadCaptionsRef.current?.(langOption.value, { awaitPrefetch: true })
              if (!loaded) return
            }
            updateSettingsValue(
              player,
              'captions',
              langOption.value === 'none'
                ? 'שפת מקור'
                : `${translatedLocallyRef.current ? 'תרגום מקומי' : 'תרגום'}: ${langOption.label}`,
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

    const applyLoadedCaptions = (subtitle) => {
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
      return true
    }

    const cached = readCachedCaption(currentVideoId, playerTargetLang)
    if (cached?.content) {
      if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false
      return applyLoadedCaptions(cached)
    }

    const inflightPrefetch = getPrefetchPromise(currentVideoId)
    if (inflightPrefetch && awaitPrefetch) {
      if (player) {
        updateSettingsValue(player, 'captions', 'מכין כתוביות…')
      }
      try {
        await inflightPrefetch
        const prefetched = readCachedCaption(currentVideoId, playerTargetLang)
        if (prefetched?.content) {
          if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false
          return applyLoadedCaptions(prefetched)
        }
      } catch (error) {
        if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false
        console.warn('כתוביות:', error.message)
        return false
      }
    }

    if (player && needsTranslation) {
      updateSettingsValue(player, 'captions', 'מתרגם כתוביות…')
    }

    try {
      const subtitle = await fetchCaptionsFromApi({
        videoId: currentVideoId,
        index: episodeIndex,
        title,
        sourceLang,
        targetLang: playerTargetLang,
        format: 'vtt',
      })

      if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false

      setCachedCaption(currentVideoId, playerTargetLang, {
        content: subtitle.content,
        translatedLocally: subtitle.translatedLocally,
      })

      return applyLoadedCaptions(subtitle)
    } catch (error) {
      if (videoIdRef.current !== currentVideoId || requestId !== captionRequestIdRef.current) return false

      cuesRef.current = []
      captionsOnRef.current = false
      setCaptionsOn(false)
      syncCaptionOverlay()
      refreshCaptionsSettingsMenu()
      console.warn('כתוביות:', error.message)
      return false
    }
  }, [episodeIndex, refreshCaptionsSettingsMenu, sourceLang, syncCaptionOverlay, title])

  useEffect(() => {
    loadCaptionsRef.current = loadCaptions
  }, [loadCaptions])

  useEffect(() => {
    if (!videoId) return
    videoIdRef.current = videoId
    const preferredTranslateLang =
      targetLang && targetLang !== 'none'
        ? targetLang
        : captionLang && captionLang !== 'auto'
          ? captionLang
          : 'none'
    playerTranslateLangRef.current = preferredTranslateLang
    captionRequestIdRef.current += 1
    captionsMenuModeRef.current = 'main'
    captionsOnRef.current = showCaptions
    setCaptionsOn(showCaptions)
    cuesRef.current = []
    translatedLocallyRef.current = false

    translationOptionsRef.current = PLAYER_TRANSLATION_LANGUAGES
    refreshCaptionsSettingsMenu()

    const prefetchId = prefetchRequestIdRef.current + 1
    prefetchRequestIdRef.current = prefetchId
    const priorityLang =
      preferredTranslateLang && preferredTranslateLang !== 'none'
        ? preferredTranslateLang
        : captionLang && captionLang !== 'auto'
          ? captionLang
          : 'he'

    const prefetchPromise = prefetchCaptionsForVideo({
      videoId,
      sourceLang,
      priorityLang,
    })

    prefetchPromise
      .then(() => {
        if (prefetchId !== prefetchRequestIdRef.current || videoIdRef.current !== videoId) return
        if (!showCaptions || !captionsOnRef.current) return
        if (cuesRef.current.length) return
        loadCaptionsRef.current?.(playerTranslateLangRef.current)
      })
      .catch((error) => {
        if (prefetchId !== prefetchRequestIdRef.current) return
        console.warn('הכנת כתוביות:', error.message)
      })

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
    refreshCaptionsSettingsMenu,
    syncCaptionOverlay,
  ])

  const refreshCaptionsSettingsMenuRef = useRef(refreshCaptionsSettingsMenu)
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

      if (!topLeftShieldRef.current) {
        const shield = document.createElement('div')
        shield.className = 'plyr-top-left-shield'
        shield.setAttribute('aria-hidden', 'true')
        shield.title = ''
        shield.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
        })
        topLeftShieldRef.current = shield
      }

      const container = player.elements.container
      if (container && overlayRef.current.parentElement !== container) {
        container.appendChild(overlayRef.current)
      }
      if (container && topLeftShieldRef.current.parentElement !== container) {
        container.appendChild(topLeftShieldRef.current)
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

    const onTimeUpdate = () => syncCaptionOverlayRef.current()
    const onSeeked = () => syncCaptionOverlayRef.current()

    player.on('ready', onReady)
    player.on('timeupdate', onTimeUpdate)
    player.on('playing', startCaptionSync)
    player.on('pause', stopCaptionSync)
    player.on('ended', stopCaptionSync)
    player.on('seeked', onSeeked)

    return () => {
      stopCaptionSync()
      player.off('ready', onReady)
      player.off('timeupdate', onTimeUpdate)
      player.off('playing', startCaptionSync)
      player.off('pause', stopCaptionSync)
      player.off('ended', stopCaptionSync)
      player.off('seeked', onSeeked)
      if (overlayRef.current) {
        overlayRef.current.remove()
        overlayRef.current = null
      }
      if (topLeftShieldRef.current) {
        topLeftShieldRef.current.remove()
        topLeftShieldRef.current = null
      }
      player.destroy()
      playerRef.current = null
    }
  }, [playerId, videoId])

  useEffect(() => {
    refreshCaptionsSettingsMenu()
    syncCaptionOverlay()
  }, [captionsOn, refreshCaptionsSettingsMenu, syncCaptionOverlay])

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
  return (
    <div className="plyr-player-wrap">
      <PlyrEmbed key={props.videoId} {...props} />
    </div>
  )
}
