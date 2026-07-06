import {
  cuesToVtt,
  parseVttCues,
  shouldSkipTranslation,
  toGoogleLang,
  youtubeTranslationLooksApplied,
} from '../../lib/subtitleTranslate.js'

const CACHE = new Map()
const CACHE_LIMIT = 4000

const cacheGet = (key) => CACHE.get(key)
const cacheSet = (key, value) => {
  if (CACHE.size >= CACHE_LIMIT) {
    const firstKey = CACHE.keys().next().value
    CACHE.delete(firstKey)
  }
  CACHE.set(key, value)
}

const translateBatchGoogle = async (texts, fromLang, toLang) => {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: fromLang,
    tl: toLang,
    dt: 't',
  })
  texts.forEach((text) => params.append('q', text))

  const response = await fetch(
    `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
  )
  if (!response.ok) {
    throw new Error(`תרגום נכשל (${response.status})`)
  }

  const data = await response.json()
  const translated = data?.[0]
  if (!Array.isArray(translated)) {
    throw new Error('תגובת תרגום לא תקינה')
  }

  if (translated.length === texts.length) {
    return translated.map((part) => part?.[0] || '')
  }

  const joined = translated.map((part) => part?.[0] || '').join('')
  if (joined.includes('⟦C⟧')) {
    return joined.split('⟦C⟧').map((part) => part.trim())
  }

  return texts.map((text, index) => translated[index]?.[0] || text)
}

const translationLooksApplied = (sourceVtt, translatedVtt) => {
  const sourceCues = parseVttCues(sourceVtt)
  const translatedCues = parseVttCues(translatedVtt)
  return youtubeTranslationLooksApplied(sourceCues, translatedCues)
}

const translateVttInternal = async (vttContent, sourceLang, targetLang) => {
  const from = toGoogleLang(sourceLang) || 'auto'
  const to = toGoogleLang(targetLang)
  if (!to) {
    return { content: vttContent, translatedLocally: false, detectedSourceLang: sourceLang }
  }

  const cues = parseVttCues(vttContent)
  if (!cues.length) {
    throw new Error('לא נמצאו כתוביות לתרגום')
  }

  const uniqueTexts = [...new Set(cues.map((cue) => cue.text))]
  const translatedByText = new Map()

  const chunkSize = 40
  for (let index = 0; index < uniqueTexts.length; index += chunkSize) {
    const chunk = uniqueTexts.slice(index, index + chunkSize)
    const cacheKey = `${from}:${to}:${chunk.join('⟦C⟧')}`
    let translatedChunk = cacheGet(cacheKey)
    if (!translatedChunk) {
      translatedChunk = await translateBatchGoogle(chunk, from, to)
      cacheSet(cacheKey, translatedChunk)
    }
    chunk.forEach((text, chunkIndex) => {
      translatedByText.set(text, translatedChunk[chunkIndex] || text)
    })
  }

  const translatedCues = cues.map((cue) => ({
    ...cue,
    text: translatedByText.get(cue.text) || cue.text,
  }))

  return {
    content: cuesToVtt(translatedCues),
    translatedLocally: true,
    detectedSourceLang: sourceLang,
  }
}

export async function translateVttInBrowser(vttContent, sourceLang, targetLang) {
  if (shouldSkipTranslation(sourceLang, targetLang)) {
    return { content: vttContent, translatedLocally: false, detectedSourceLang: sourceLang }
  }

  const attempts = []
  if (sourceLang && sourceLang !== 'auto') {
    attempts.push(sourceLang)
  }
  attempts.push('auto')

  let lastResult = null
  for (const attemptLang of attempts) {
    const result = await translateVttInternal(vttContent, attemptLang, targetLang)
    lastResult = result
    if (translationLooksApplied(vttContent, result.content)) {
      return {
        ...result,
        detectedSourceLang: attemptLang === 'auto' ? sourceLang || 'auto' : attemptLang,
      }
    }
  }

  return lastResult || { content: vttContent, translatedLocally: false, detectedSourceLang: sourceLang }
}

export { youtubeTranslationLooksApplied }
