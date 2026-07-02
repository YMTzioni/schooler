const configuredBase = import.meta.env.VITE_API_BASE

export const API_BASE =
  configuredBase !== undefined && configuredBase !== ''
    ? configuredBase.replace(/\/$/, '')
    : '/api'

export const isGitHubPagesHost = () => {
  if (typeof window === 'undefined') return false
  return window.location.hostname.endsWith('github.io')
}
