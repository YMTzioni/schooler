import { API_BASE } from '../config/api.js'

const parseApiResponse = async (response) => {
  const rawText = await response.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    throw new Error('תגובת שרת לא תקינה לכתוביות')
  }

  if (!response.ok) {
    const error = new Error(data?.message || `שגיאה בטעינת כתוביות (${response.status})`)
    error.code = data?.code || null
    throw error
  }

  return data
}

const wrapNetworkError = (error) => {
  const message = String(error?.message || '')
  if (
    error?.name === 'TypeError' &&
    (message.includes('Failed to fetch') || message.includes('NetworkError'))
  ) {
    return new Error(
      'לא ניתן להתחבר לשרת הכתוביות. YouTube לא מאפשר הורדה ישירה מהדפדפן (CORS) — הכתוביות חייבות לעבור דרך השרת.',
    )
  }
  return error
}

export async function fetchCaptions(
  videoId,
  { lang = 'auto', tlang = 'none' } = {},
) {
  try {
    const response = await fetch(`${API_BASE}/youtube/subtitles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        videoId,
        lang,
        tlang,
        fmt: 'vtt',
      }),
    })

    const data = await parseApiResponse(response)
    return {
      content: data.content,
      translatedLocally: Boolean(data.translatedLocally),
      status: data.status || null,
    }
  } catch (error) {
    throw wrapNetworkError(error)
  }
}

/** @deprecated Use fetchCaptions — browser cannot call YouTube APIs due to CORS. */
export const fetchCaptionsInBrowser = fetchCaptions
