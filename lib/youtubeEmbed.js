const DEFAULT_ORIGIN = 'https://my.schooler.biz'

/** iframe query params that reduce visible YouTube chrome */
export const YOUTUBE_EMBED_QUERY = {
  rel: '0',
  modestbranding: '1',
  iv_load_policy: '3',
  disablekb: '1',
  fs: '0',
  controls: '0',
  playsinline: '1',
  autoplay: '0',
  cc_load_policy: '1',
  enablejsapi: '1',
  showinfo: '0',
}

/** Plyr `youtube` provider options (mirrors query params where supported) */
export const YOUTUBE_PLYR_OPTIONS = {
  noCookie: true,
  customControls: true,
  rel: 0,
  modestbranding: 1,
  iv_load_policy: 3,
  playsinline: 1,
  cc_load_policy: 1,
  enablejsapi: 1,
  disablekb: 1,
  fs: 0,
  controls: 0,
  showinfo: 0,
  html5: 1,
}

/** Click + pause-cover shields over common YouTube watermark zones */
export const YOUTUBE_SHIELD_ZONES = [
  { key: 'top', className: 'plyr-yt-shield--top' },
  { key: 'topRight', className: 'plyr-yt-shield--top-right' },
  { key: 'brWatch', className: 'plyr-yt-shield--br-watch' },
  { key: 'brLogo', className: 'plyr-yt-shield--br-logo' },
  // YouTube watermark often appears bottom-left when paused
  { key: 'blLogo', className: 'plyr-yt-shield--bl-logo plyr-yt-shield--logo-cover' },
]

export const buildYouTubeEmbedUrl = (videoId, origin = DEFAULT_ORIGIN) => {
  const params = new URLSearchParams({
    ...YOUTUBE_EMBED_QUERY,
    origin,
    widget_referrer: origin,
  })

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

const shieldBlocker = (event) => {
  event.preventDefault()
  event.stopPropagation()
}

export const attachYouTubeShields = (container) => {
  if (!container || container.querySelector('.plyr-yt-shields')) return

  const shields = document.createElement('div')
  shields.className = 'plyr-yt-shields'
  shields.setAttribute('aria-hidden', 'true')

  YOUTUBE_SHIELD_ZONES.forEach(({ className }) => {
    const zone = document.createElement('div')
    zone.className = `plyr-yt-shield ${className}`
    if (className.includes('logo')) {
      zone.classList.add('plyr-yt-shield--logo-cover')
    }
    zone.addEventListener('click', shieldBlocker)
    zone.addEventListener('mousedown', shieldBlocker)
    zone.addEventListener('mouseup', shieldBlocker)
    zone.addEventListener('dblclick', shieldBlocker)
    zone.addEventListener('contextmenu', shieldBlocker)
    shields.appendChild(zone)
  })

  container.appendChild(shields)
}

const inlineShieldStyle = (css) =>
  Object.entries(css)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${value}`)
    .join(';')

export const buildYouTubeShieldMarkup = () => {
  const wrapperStyle = inlineShieldStyle({
    position: 'absolute',
    inset: '0',
    zIndex: '2',
    pointerEvents: 'none',
  })

  const zone = (css) =>
    `<div aria-hidden="true" style="${inlineShieldStyle({ position: 'absolute', pointerEvents: 'auto', background: 'transparent', ...css })}"></div>`

  return `<div style="${wrapperStyle}">
    ${zone({ top: '0', left: '0', right: '0', height: '72px' })}
    ${zone({ top: '0', right: '0', width: '96px', height: '56px' })}
    ${zone({ bottom: '58px', right: '0', width: '130px', height: '36px' })}
    ${zone({ bottom: '0', right: '0', width: '72px', height: '40px' })}
    ${zone({ bottom: '0', left: '0', width: '120px', height: '48px' })}
  </div>`
}

export const buildProtectedEmbedWrapper = (iframeHtml) =>
  `<div style="position:relative;width:100%;padding-bottom:56.25%;height:0;overflow:hidden;background:#000;border-radius:8px;" oncontextmenu="return false;">
  <div style="position:absolute;inset:0;">
    ${iframeHtml}
  </div>
  ${buildYouTubeShieldMarkup()}
</div>`
