import { prefetchCaptionsInBrowser } from './clientCaptions.js'
import { getCachedCaption } from './captionCache.js'

export const prefetchCaptionsForVideo = prefetchCaptionsInBrowser

export function readCachedCaption(videoId, targetLang) {
  const normalizedLang = targetLang && targetLang !== 'none' ? targetLang : 'none'
  return getCachedCaption(videoId, normalizedLang)
}
