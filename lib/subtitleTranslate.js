import axios from 'axios'

const HEBREW_CODES = new Set(['he', 'iw'])
const TRANSLATE_CACHE = new Map()
const TRANSLATE_CACHE_LIMIT = 8000

const GOOGLE_LANG_CODES = {
  he: 'he',
  iw: 'he',
  en: 'en',
  ar: 'ar',
  ru: 'ru',
  fr: 'fr',
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const toGoogleLang = (lang) => {
  if (!lang || lang === 'none' || lang === 'auto') return null
  return GOOGLE_LANG_CODES[lang] || lang
}

export const normalizeLangFamily = (lang) => {
  const google = toGoogleLang(lang)
  if (!google) return ''
  if (HEBREW_CODES.has(lang) || google === 'he') return 'he'
  return google.toLowerCase()
}

export const shouldSkipTranslation = (sourceLang, targetLang) => {
  const source = normalizeLangFamily(sourceLang)
  const target = normalizeLangFamily(targetLang)
  if (!target || targetLang === 'none') return true
  return source === target
}

const parseVttTime = (value) => {
  const clean = value.trim().split(/\s+/)[0].replace(',', '.')
  const parts = clean.split(':').map(Number)
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return parts[0] * 60 + parts[1]
}

const decodeCueText = (text) =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()

export const parseVttCues = (vtt) => {
  const cues = []
  const blocks = String(vtt).replace(/\r/g, '').split(/\n\n+/)

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || trimmed.startsWith('WEBVTT') || trimmed.startsWith('NOTE')) continue

    const lines = trimmed.split('\n')
    const timeLine = lines.find((line) => line.includes('-->'))
    if (!timeLine) continue

    const [startRaw, endRaw] = timeLine.split('-->')
    const text = decodeCueText(
      lines.filter((line) => line !== timeLine && !/^\d+$/.test(line.trim())).join('\n'),
    )
    if (!text) continue

    cues.push({
      start: parseVttTime(startRaw),
      end: parseVttTime(endRaw),
      text,
    })
  }

  return cues
}

const formatVttTime = (seconds) => {
  const totalMs = Math.round(seconds * 1000)
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export const cuesToVtt = (cues) => {
  let vtt = 'WEBVTT\n\n'
  cues.forEach((cue, index) => {
    vtt += `${index + 1}\n${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}\n${cue.text}\n\n`
  })
  return vtt.trim()
}

const cacheGet = (key) => TRANSLATE_CACHE.get(key)
const cacheSet = (key, value) => {
  if (TRANSLATE_CACHE.size >= TRANSLATE_CACHE_LIMIT) {
    const firstKey = TRANSLATE_CACHE.keys().next().value
    TRANSLATE_CACHE.delete(firstKey)
  }
  TRANSLATE_CACHE.set(key, value)
}

const translateBatchGoogle = async (texts, fromLang, toLang) => {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: fromLang,
    tl: toLang,
    dt: 't',
  })
  texts.forEach((text) => params.append('q', text))

  const response = await axios.get(
    `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
    { timeout: 20000 },
  )

  const translated = response.data?.[0]
  if (!Array.isArray(translated)) {
    throw new Error('תגובת תרגום לא תקינה')
  }

  if (translated.length === texts.length) {
    return translated.map((part) => part?.[0] || '')
  }

  // Some responses collapse multiple lines; fall back to per-line translation.
  if (texts.length === 1) {
    const joined = translated.map((part) => part?.[0] || '').join('')
    return [joined || texts[0]]
  }

  throw new Error('תגובת תרגום לא תקינה')
}

const translateTextGoogle = async (text, fromLang, toLang) => {
  const [translated] = await translateBatchGoogle([text], fromLang, toLang)
  return translated || text
}

const CHUNK_SEPARATOR = ' ⟦C⟧ '
const CHUNK_SIZE = 35

const translateTexts = async (texts, sourceLang, targetLang) => {
  const from = toGoogleLang(sourceLang)
  const to = toGoogleLang(targetLang)
  if (!from || !to) throw new Error('שפת תרגום לא נתמכת')

  const results = [...texts]

  for (let start = 0; start < texts.length; start += CHUNK_SIZE) {
    const chunkItems = []

    for (let index = start; index < Math.min(start + CHUNK_SIZE, texts.length); index += 1) {
      const trimmed = String(texts[index] || '').trim()
      if (!trimmed) continue

      const cacheKey = `${from}|${to}|${trimmed}`
      const cached = cacheGet(cacheKey)
      if (cached !== undefined) {
        results[index] = cached
        continue
      }

      chunkItems.push({
        index,
        text: trimmed.replace(/\n/g, ' '),
        cacheKey,
      })
    }

    if (!chunkItems.length) continue

    const applyChunkResults = (parts) => {
      chunkItems.forEach((item, partIndex) => {
        const value = parts[partIndex] || item.text
        results[item.index] = value
        cacheSet(item.cacheKey, value)
      })
    }

    try {
      const blob = chunkItems.map((item) => item.text).join(CHUNK_SEPARATOR)
      const translatedBlob = await translateTextGoogle(blob, from, to)
      const parts = translatedBlob.split('⟦C⟧').map((part) => part.trim())
      if (parts.length === chunkItems.length) {
        applyChunkResults(parts)
        await sleep(90)
        continue
      }
    } catch {
      // Fall through to per-line translation for this chunk.
    }

    const translated = await Promise.all(
      chunkItems.map(async (item) => {
        try {
          return await translateTextGoogle(item.text, from, to)
        } catch {
          return item.text
        }
      }),
    )
    applyChunkResults(translated)
    await sleep(90)
  }

  return results
}

export const youtubeTranslationLooksApplied = (sourceCues, translatedCues) => {
  if (!sourceCues.length || !translatedCues.length) return false
  const sampleSize = Math.min(sourceCues.length, translatedCues.length, 24)
  let sameCount = 0

  for (let i = 0; i < sampleSize; i += 1) {
    if (sourceCues[i].text.trim() === translatedCues[i].text.trim()) {
      sameCount += 1
    }
  }

  return sameCount / sampleSize < 0.65
}

export const translateVttContent = async (vttContent, sourceLang, targetLang) => {
  if (shouldSkipTranslation(sourceLang, targetLang)) {
    return { content: vttContent, translatedLocally: false }
  }

  const cues = parseVttCues(vttContent)
  if (!cues.length) {
    throw new Error('לא נמצאו רמזי כתוביות לתרגום')
  }

  const translatedTexts = await translateTexts(
    cues.map((cue) => cue.text),
    sourceLang,
    targetLang,
  )

  const translatedCues = cues.map((cue, index) => ({
    ...cue,
    text: translatedTexts[index] || cue.text,
  }))

  return {
    content: cuesToVtt(translatedCues),
    translatedLocally: true,
  }
}
