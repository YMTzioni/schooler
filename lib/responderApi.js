/** Rav Messer API V2 — https://app.swaggerhub.com/apis/Responder/responder/V2.0 */

export const RESPONDER_API_BASE = 'https://graph.responder.live/v2'
export const RESPONDER_OAUTH_URL = `${RESPONDER_API_BASE}/oauth/token`

/** ברירת מחדל אם השרת לא מחזיר שדה expire (בפועל ~14 יום) */
export const RESPONDER_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14

export const RESPONDER_ENDPOINTS = [
  { group: 'אימות', method: 'POST', path: '/oauth/token', auth: false, label: 'קבלת טוקן' },
  { group: 'חשבון', method: 'GET', path: '/me', label: 'פרטי חשבון' },
  { group: 'רשימות', method: 'GET', path: '/lists', label: 'רשימת תפוצה' },
  { group: 'רשימות', method: 'GET', path: '/lists/{listid}', label: 'פרטי רשימה' },
  { group: 'רשימות', method: 'GET', path: '/lists/{listid}/subscribers', label: 'נמענים ברשימה' },
  { group: 'נמענים', method: 'GET', path: '/subscribers', label: 'כל הנמענים' },
  { group: 'נמענים', method: 'GET', path: '/subscribers/search', label: 'חיפוש נמען' },
  { group: 'תגיות', method: 'GET', path: '/tag', label: 'רשימת תגיות' },
  { group: 'תגיות', method: 'POST', path: '/tags/subscribers', label: 'הוספת תגית לנמענים' },
]

export const readResponderEnvCredentials = () => {
  const clientId = process.env.RESPONDER_CLIENT_ID?.trim()
  const clientSecret = process.env.RESPONDER_CLIENT_SECRET?.trim()
  const userToken = process.env.RESPONDER_USER_TOKEN?.trim()

  if (!clientId || !clientSecret || !userToken) {
    return null
  }

  return { clientId, clientSecret, userToken }
}

export const parseResponderClientId = (value) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const asNumber = Number(trimmed)
  return Number.isFinite(asNumber) && String(asNumber) === trimmed ? asNumber : trimmed
}

/** גוף בקשת OAuth לפי מדריך רב מסר V2 */
export const buildResponderOAuthBody = ({ clientId, clientSecret, userToken }) => ({
  grant_type: 'client_credentials',
  scope: '*',
  client_id: parseResponderClientId(clientId),
  client_secret: clientSecret,
  user_token: userToken,
})

/**
 * מפרק תגובת OAuth.
 * שים לב: בתיעוד כתוב access_token, אבל השרת מחזיר בפועל את השדה token (JWT).
 * תוקף: שדה expire (Unix timestamp בשניות).
 */
export const parseResponderOAuthResponse = (data) => {
  const accessToken = data?.token || data?.access_token
  if (!accessToken) {
    const error = new Error('תגובת OAuth ללא token — ודאו ש-user_token תקין')
    error.status = 502
    throw error
  }

  const expireUnix = Number(data?.expire)
  const expiresAt =
    Number.isFinite(expireUnix) && expireUnix > 0
      ? expireUnix * 1000
      : Date.now() + RESPONDER_TOKEN_TTL_MS

  return {
    accessToken,
    username: data?.username || null,
    name: data?.name || null,
    accountId: data?.account_id ?? null,
    userId: data?.id ?? null,
    expire: data?.expire ?? null,
    expiresAt,
    raw: data,
  }
}
