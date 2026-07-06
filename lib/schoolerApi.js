/** Schooler API paths — https://app.swaggerhub.com/apis/Responder/SchoolerAPI/1.0.0 */

export const SCHOOLER_API_BASE = 'https://api.schooler.biz'

export const SCHOOLER_ENDPOINTS = [
  { group: 'אימות', method: 'POST', path: '/oauth/token', auth: false, label: 'קבלת טוקן' },
  { group: 'קורסים', method: 'GET', path: '/api/v1/courses', label: 'רשימת קורסים' },
  { group: 'קורסים', method: 'GET', path: '/api/v1/courses/{id}', label: 'פרטי קורס' },
  { group: 'קורסים', method: 'GET', path: '/api/v1/courses/{course_id}/lessons', label: 'שיעורי קורס' },
  { group: 'קורסים', method: 'GET', path: '/api/v1/courses/{course_id}/students', label: 'סטודנטים בקורס' },
  { group: 'בתי ספר', method: 'GET', path: '/api/v1/schools', label: 'רשימת בתי ספר' },
  { group: 'בתי ספר', method: 'GET', path: '/api/v1/schools/{id}', label: 'פרטי בית ספר' },
  { group: 'סטודנטים', method: 'GET', path: '/api/v1/students/search', label: 'חיפוש סטודנט' },
]

export const extractYouTubeVideoId = (url) => {
  if (!url || typeof url !== 'string') return null
  const match = url.match(
    /(?:youtu\.be\/|v\/|embed\/|watch\?v=|&v=)([a-zA-Z0-9_-]{11})/,
  )
  return match?.[1] || null
}

export const readSchoolerEnvCredentials = () => {
  const userId = process.env.SCHOOLER_USER_ID?.trim()
  const userSecret = process.env.SCHOOLER_USER_SECRET?.trim()
  const clientId = process.env.SCHOOLER_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.SCHOOLER_CLIENT_SECRET?.trim() || ''

  if (!userId || !userSecret) {
    return null
  }

  return { userId, userSecret, clientId, clientSecret }
}
