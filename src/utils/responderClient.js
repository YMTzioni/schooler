import { API_BASE } from '../config/api.js'

async function responderRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
  })

  const rawText = await response.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    throw new Error(`תגובת רב מסר לא תקינה (HTTP ${response.status})`)
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `שגיאת רב מסר (${response.status})`)
  }

  return data
}

export const getResponderAuthConfig = () =>
  responderRequest('/responder/auth/config', { method: 'GET' })

export const getResponderAuthStatus = () =>
  responderRequest('/responder/auth/status', { method: 'GET' })

export const loginResponder = (credentials) =>
  responderRequest('/responder/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })

export const loginResponderFromEnv = () =>
  responderRequest('/responder/auth/login-env', { method: 'POST', body: '{}' })

export const logoutResponder = () =>
  responderRequest('/responder/auth/logout', { method: 'POST', body: '{}' })

export const refreshResponderToken = () =>
  responderRequest('/responder/auth/refresh', { method: 'POST', body: '{}' })

export const listResponderLists = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return responderRequest(`/responder/lists${query ? `?${query}` : ''}`, { method: 'GET' })
}

export const searchResponderSubscribers = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return responderRequest(`/responder/subscribers/search${query ? `?${query}` : ''}`, {
    method: 'GET',
  })
}

export const proxyResponderRequest = ({ method, path, query, body }) =>
  responderRequest('/responder/proxy', {
    method: 'POST',
    body: JSON.stringify({ method, path, query, body }),
  })
