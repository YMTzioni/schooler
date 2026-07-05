export const formatCaptionStatusLine = (status) => {
  if (!status?.message) return ''
  return status.message
}

export const normalizeApiCaptionStatus = (status, { cached = false } = {}) => {
  if (!status && cached) {
    return {
      state: 'cached',
      message: 'נטען מהזיכרון המקומי',
      cueCount: 0,
    }
  }

  if (!status) {
    return {
      state: 'error',
      message: 'לא התקבל סטטוס כתוביות מהשרת',
      cueCount: 0,
    }
  }

  if (cached) {
    return {
      ...status,
      state: 'cached',
      message: status.message ? `מהזיכרון · ${status.message}` : 'נטען מהזיכרון המקומי',
    }
  }

  return status
}

export const buildLoadingCaptionStatus = (message = 'טוען כתוביות…') => ({
  state: 'loading',
  message,
  cueCount: 0,
})

export const buildPrefetchCaptionStatus = (status) => {
  if (!status) {
    return {
      state: 'prefetching',
      message: 'מכין כתוביות לכל השפות…',
      cueCount: 0,
    }
  }

  return {
    state: status.state === 'ready' ? 'ready' : status.state === 'partial' ? 'partial' : 'prefetching',
    message: status.message,
    cueCount: 0,
    prefetch: status,
  }
}

export const buildErrorCaptionStatus = (message) => ({
  state:
    message?.includes('חוסם') ||
    message?.includes('PubProxy') ||
    message?.includes('YOUTUBE_BLOCKED') ||
    (message?.includes('YouTube') && message?.includes('חסום'))
      ? 'blocked'
      : 'error',
  message: message || 'שגיאה בטעינת כתוביות',
  cueCount: 0,
})
