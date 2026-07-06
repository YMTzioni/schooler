import { API_BASE } from '../config/api.js'

async function schoolerRequest(path, options = {}) {
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
    throw new Error(`תגובת Schooler לא תקינה (HTTP ${response.status})`)
  }

  if (!response.ok) {
    throw new Error(data?.message || `שגיאת Schooler (${response.status})`)
  }

  return data
}

export const getSchoolerAuthConfig = () => schoolerRequest('/auth/config', { method: 'GET' })

export const getSchoolerAuthStatus = () => schoolerRequest('/auth/status', { method: 'GET' })

export const loginSchooler = (credentials) =>
  schoolerRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })

export const loginSchoolerFromEnv = () =>
  schoolerRequest('/auth/login-env', { method: 'POST', body: '{}' })

export const logoutSchooler = () =>
  schoolerRequest('/auth/logout', { method: 'POST', body: '{}' })

export const refreshSchoolerToken = () =>
  schoolerRequest('/auth/refresh', { method: 'POST', body: '{}' })

export const listSchoolerCourses = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return schoolerRequest(`/courses${query ? `?${query}` : ''}`, { method: 'GET' })
}

export const getSchoolerCourse = (courseId) =>
  schoolerRequest(`/courses/${courseId}`, { method: 'GET' })

export const getSchoolerCourseLessons = (courseId, params = {}) => {
  const query = new URLSearchParams(params).toString()
  return schoolerRequest(`/courses/${courseId}/lessons${query ? `?${query}` : ''}`, {
    method: 'GET',
  })
}

export const listSchoolerSchools = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return schoolerRequest(`/schools${query ? `?${query}` : ''}`, { method: 'GET' })
}

export const proxySchoolerRequest = ({ method, path, query, body }) =>
  schoolerRequest('/proxy', {
    method: 'POST',
    body: JSON.stringify({ method, path, query, body }),
  })
