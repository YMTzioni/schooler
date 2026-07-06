/** Schooler API — https://app.swaggerhub.com/apis/Responder/SchoolerAPI/1.0.0 */

export const SCHOOLER_API_BASE = 'https://api.schooler.biz'
export const SCHOOLER_OAUTH_URL = `${SCHOOLER_API_BASE}/oauth/token`

export const SCHOOLER_ENDPOINTS = [
  { group: 'אימות', method: 'POST', path: '/oauth/token', auth: false, label: 'קבלת טוקן' },
  { group: 'קורסים', method: 'GET', path: '/api/v1/courses', label: 'רשימת קורסים' },
  { group: 'קורסים', method: 'GET', path: '/api/v1/courses/{id}', label: 'פרטי קורס' },
  { group: 'קורסים', method: 'GET', path: '/api/v1/courses/{course_id}/lessons', label: 'שיעורי קורס' },
  { group: 'קורסים', method: 'GET', path: '/api/v1/courses/{course_id}/students', label: 'סטודנטים בקורס' },
  { group: 'קורסים', method: 'POST', path: '/api/v1/courses/{course_id}/enroll_students', label: 'הוספת סטודנטים לקורס' },
  { group: 'קורסים', method: 'PUT', path: '/api/v1/courses/{course_id}/update_students', label: 'עדכון סטודנטים בקורס' },
  { group: 'קורסים', method: 'POST', path: '/api/v1/courses/{course_id}/delete_students', label: 'הסרת סטודנטים מקורס' },
  { group: 'בתי ספר', method: 'GET', path: '/api/v1/schools', label: 'רשימת בתי ספר' },
  { group: 'בתי ספר', method: 'GET', path: '/api/v1/schools/{id}', label: 'פרטי בית ספר' },
  { group: 'בתי ספר', method: 'GET', path: '/api/v1/schools/{school_id}/students', label: 'סטודנטים בבית ספר' },
  { group: 'בתי ספר', method: 'POST', path: '/api/v1/schools/{school_id}/enroll_students', label: 'הוספת סטודנטים לבית ספר' },
  { group: 'בתי ספר', method: 'PUT', path: '/api/v1/schools/{school_id}/update_students', label: 'עדכון סטודנטים בבית ספר' },
  { group: 'בתי ספר', method: 'POST', path: '/api/v1/schools/{school_id}/delete_students', label: 'הסרת סטודנטים מבית ספר' },
  { group: 'סטודנטים', method: 'GET', path: '/api/v1/students/search', label: 'חיפוש סטודנט' },
  { group: 'סטודנטים', method: 'POST', path: '/api/v1/students/reset_ip', label: 'איפוס הגבלת IP' },
  { group: 'סטודנטים', method: 'POST', path: '/api/v1/students/resend_access', label: 'שליחת פרטי גישה מחדש' },
  { group: 'סטודנטים', method: 'GET', path: '/api/v1/students/{student_id}/unique_link', label: 'קישור אישי לסטודנט' },
  { group: 'סטודנטים', method: 'POST', path: '/api/v1/students/{student_id}/activate_in_school', label: 'הפעלה בבית ספר' },
  { group: 'סטודנטים', method: 'POST', path: '/api/v1/students/{student_id}/activate_in_course', label: 'הפעלה בקורס' },
  { group: 'סטודנטים', method: 'POST', path: '/api/v1/students/{student_id}/inactivate_in_school', label: 'השבתה בבית ספר' },
  { group: 'סטודנטים', method: 'POST', path: '/api/v1/students/{student_id}/inactivate_in_course', label: 'השבתה בקורס' },
]

export const extractYouTubeVideoId = (url) => {
  if (!url || typeof url !== 'string') return null
  const match = url.match(
    /(?:youtu\.be\/|v\/|embed\/|watch\?v=|&v=)([a-zA-Z0-9_-]{11})/,
  )
  return match?.[1] || null
}

export const readSchoolerEnvUserCredentials = () => {
  const userId = process.env.SCHOOLER_USER_ID?.trim()
  const userSecret = process.env.SCHOOLER_USER_SECRET?.trim()
  if (!userId || !userSecret) return null
  return { userId, userSecret }
}

export const readSchoolerEnvClientCredentials = () => {
  const clientId = process.env.SCHOOLER_CLIENT_ID?.trim()
  const clientSecret = process.env.SCHOOLER_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export const readSchoolerEnvCredentials = () => {
  const user = readSchoolerEnvUserCredentials()
  const client = readSchoolerEnvClientCredentials()
  if (!user || !client) return null
  return { ...user, ...client }
}

/** גוף בקשת OAuth — grant_type: password */
export const buildSchoolerPasswordOAuthBody = ({ userId, userSecret, clientId, clientSecret }) => ({
  grant_type: 'password',
  client_id: clientId,
  client_secret: clientSecret,
  user_id: userId,
  user_secret: userSecret,
})

/** גוף בקשת OAuth — grant_type: refresh_token */
export const buildSchoolerRefreshOAuthBody = ({ refreshToken, clientId, clientSecret }) => ({
  grant_type: 'refresh_token',
  client_id: clientId,
  client_secret: clientSecret,
  refresh_token: refreshToken,
})

/**
 * מפרק תגובת OAuth של Schooler.
 * מחזיר access_token, refresh_token, expires_in ו-created_at (Unix).
 */
export const parseSchoolerOAuthResponse = (data) => {
  const accessToken = data?.access_token || data?.token
  if (!accessToken) {
    const error = new Error('תגובת OAuth ללא access_token — ודאו ש-user_id ו-user_secret תקינים')
    error.status = 502
    throw error
  }

  const expiresIn = Number(data?.expires_in) || 7200
  const createdAtUnix = Number(data?.created_at)
  const expiresAt =
    Number.isFinite(createdAtUnix) && createdAtUnix > 0
      ? (createdAtUnix + expiresIn) * 1000
      : Date.now() + expiresIn * 1000

  return {
    accessToken,
    refreshToken: data?.refresh_token || null,
    tokenType: data?.token_type || 'Bearer',
    expiresIn,
    expiresAt,
    createdAt: Number.isFinite(createdAtUnix) ? createdAtUnix * 1000 : Date.now(),
    raw: data,
  }
}
