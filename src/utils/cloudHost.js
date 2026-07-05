export const isCloudHostedApp = () => {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  return (
    hostname.endsWith('.vercel.app') ||
    hostname.endsWith('.onrender.com') ||
    hostname.endsWith('.netlify.app') ||
    hostname.endsWith('.fly.dev') ||
    hostname.endsWith('.railway.app')
  )
}

export const isYouTubeBlockedError = (error) =>
  error?.code === 'YOUTUBE_BLOCKED' ||
  String(error?.message || '').includes('YouTube') ||
  String(error?.message || '').includes('פרוקסי')
