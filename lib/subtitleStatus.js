import { parseVttCues } from './subtitleTranslate.js'

const DELIVERY_LABELS = {
  direct: 'חיבור ישיר',
  static_proxy: 'פרוקסי קבוע',
  pubproxy: 'PubProxy',
}

const TRACK_SOURCE_LABELS = {
  innertube: 'InnerTube',
  watch_page: 'דף YouTube',
  timedtext: 'timedtext',
  transcript: 'תמלול',
}

const LANG_LABELS = {
  he: 'עברית',
  iw: 'עברית',
  en: 'אנגלית',
  ar: 'ערבית',
  ru: 'רוסית',
  fr: 'צרפתית',
}

const formatLang = (lang) => {
  if (!lang || lang === 'auto') return 'אוטומטי'
  return LANG_LABELS[lang] || lang
}

export const buildSubtitleStatus = ({
  meta = {},
  content = '',
  sourceLang,
  targetLang,
  translatedLocally = false,
  state = 'ready',
  errorMessage = '',
}) => {
  const cues = content ? parseVttCues(String(content)) : []
  const delivery = meta.delivery || null
  const trackSource = meta.trackSource || null

  let message = errorMessage

  if (state === 'ready' && cues.length) {
    const parts = [`${cues.length} שורות כתוביות`]
    parts.push(`מקור: ${formatLang(sourceLang)}`)

    if (targetLang && targetLang !== 'none') {
      parts.push(
        translatedLocally
          ? `תרגום מקומי ל${formatLang(targetLang)}`
          : `תרגום ל${formatLang(targetLang)}`,
      )
    }

    if (delivery === 'pubproxy') {
      const proxyPart = meta.proxyCountry
        ? `PubProxy (${meta.proxyCountry})`
        : 'PubProxy'
      parts.push(
        meta.proxyAttempts > 1 ? `${proxyPart}, ${meta.proxyAttempts} ניסיונות` : proxyPart,
      )
    } else if (delivery && DELIVERY_LABELS[delivery]) {
      parts.push(DELIVERY_LABELS[delivery])
    }

    if (trackSource && TRACK_SOURCE_LABELS[trackSource]) {
      parts.push(TRACK_SOURCE_LABELS[trackSource])
    }

    message = parts.join(' · ')
  }

  if (state === 'error' && !message) {
    message = 'שגיאה בטעינת כתוביות'
  }

  return {
    state,
    message,
    cueCount: cues.length,
    sourceLang: sourceLang || null,
    targetLang: targetLang && targetLang !== 'none' ? targetLang : null,
    translatedLocally: Boolean(translatedLocally),
    delivery,
    proxyAttempts: meta.proxyAttempts || 0,
    proxyCountry: meta.proxyCountry || null,
    trackSource,
    innertubeClient: meta.innertubeClient || null,
    checkedAt: new Date().toISOString(),
  }
}

export const buildPrefetchStatus = ({ sourceLang, subtitles = {} }) => {
  const languages = {}
  let readyCount = 0
  let failedCount = 0

  Object.entries(subtitles).forEach(([lang, subtitle]) => {
    const cueCount = subtitle?.status?.cueCount ?? 0
    const ready = cueCount > 0
    if (ready) readyCount += 1
    else failedCount += 1

    languages[lang] = {
      state: ready ? 'ready' : 'empty',
      cueCount,
      message: subtitle?.status?.message || (ready ? `${cueCount} שורות` : 'לא זמין'),
      translatedLocally: Boolean(subtitle?.translatedLocally),
    }
  })

  const totalLangs = Object.keys(languages).length
  let state = 'ready'
  if (!readyCount) state = 'failed'
  else if (failedCount) state = 'partial'

  const message =
    state === 'ready'
      ? `הוכנו ${readyCount} שפות · מקור ${formatLang(sourceLang)}`
      : state === 'partial'
        ? `מוכנות ${readyCount}/${totalLangs} שפות · מקור ${formatLang(sourceLang)}`
        : 'לא הצלחנו להכין כתוביות'

  return {
    state,
    message,
    readyCount,
    failedCount,
    totalLangs,
    languages,
    checkedAt: new Date().toISOString(),
  }
}
