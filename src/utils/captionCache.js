const captionStore = new Map()
const prefetchInflight = new Map()

export const captionCacheKey = (videoId, targetLang) =>
  `${videoId}:${targetLang && targetLang !== 'none' ? targetLang : 'none'}`

export const getCachedCaption = (videoId, targetLang) =>
  captionStore.get(captionCacheKey(videoId, targetLang))

export const setCachedCaption = (videoId, targetLang, entry) => {
  captionStore.set(captionCacheKey(videoId, targetLang), entry)
}

export const clearCaptionCacheForVideo = (videoId) => {
  const prefix = `${videoId}:`
  for (const key of captionStore.keys()) {
    if (key.startsWith(prefix)) captionStore.delete(key)
  }
}

export const getPrefetchPromise = (videoId) => prefetchInflight.get(videoId)

export const setPrefetchPromise = (videoId, promise) => {
  prefetchInflight.set(videoId, promise)
  promise.finally(() => {
    if (prefetchInflight.get(videoId) === promise) {
      prefetchInflight.delete(videoId)
    }
  })
  return promise
}
