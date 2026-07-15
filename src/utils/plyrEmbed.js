import {
  YOUTUBE_PLYR_OPTIONS,
  buildYouTubeEmbedUrl,
  buildYouTubeShieldMarkup,
} from '../../lib/youtubeEmbed.js'

const escapeHtml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const buildPlyrEmbedUrl = (videoId, origin = null) =>
  buildYouTubeEmbedUrl(videoId, origin)

export const buildPlyrEmbedCode = (videoId, title, origin = null) => {
  const safeTitle = escapeHtml(title)
  const embedUrl = buildPlyrEmbedUrl(videoId, origin)
  const playerId = `plyr-${videoId}`
  const plyrYoutubeOptions = JSON.stringify(YOUTUBE_PLYR_OPTIONS)

  return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css" />
<style>
  .plyr-yt-shell{position:relative;width:100%;padding-bottom:56.25%;height:0;overflow:hidden;background:#000;border-radius:8px}
  .plyr-yt-shell__stage{position:absolute;inset:0}
  .plyr-yt-shell .plyr__video-embed,.plyr-yt-shell .plyr__video-embed iframe{width:100%!important;height:100%!important}
</style>
<div class="plyr-yt-shell" oncontextmenu="return false">
  <div class="plyr-yt-shell__stage">
    <div id="${playerId}" class="plyr__video-embed">
      <iframe
        src="${embedUrl}"
        allowfullscreen
        allow="autoplay; encrypted-media; picture-in-picture"
        title="${safeTitle}"
      ></iframe>
    </div>
    ${buildYouTubeShieldMarkup()}
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.polyfilled.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    new Plyr('#${playerId}', {
      youtube: ${plyrYoutubeOptions}
    });
  });
</script>`
}

export const buildIframeEmbedCode = (videoId, title = 'YouTube video', origin = null) => {
  const embedUrl = buildHostedEmbedUrl(videoId, origin)
  const safeTitle = escapeHtml(title)
  return `<iframe
  src="${embedUrl}"
  title="${safeTitle}"
  width="100%"
  height="405"
  frameborder="0"
  loading="lazy"
  referrerpolicy="origin-when-cross-origin"
  allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *"
  allowfullscreen
  webkitallowfullscreen
  mozallowfullscreen
></iframe>`
}

export const buildHostedWatchUrl = (videoId, origin = null) => {
  const appOrigin = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${appOrigin}/watch/${videoId}`
}

export const buildHostedEmbedUrl = (videoId, origin = null) => {
  const appOrigin = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${appOrigin}/embed/${videoId}`
}

export const buildSchoolerOverlayLoaderJs = (origin = null) => {
  const appOrigin = (
    origin ||
    (typeof window !== 'undefined' ? window.location.origin : '') ||
    'https://schooler-z7x3.onrender.com'
  ).replace(/\/+$/, '')

  return `<script>
window.SchoolerPlayerConfig = Object.assign({
  auto: true
}, window.SchoolerPlayerConfig || {});
(function () {
  if (window.__SchoolerPlayerLoader) return;
  window.__SchoolerPlayerLoader = true;
  var s = document.createElement('script');
  s.src = ${JSON.stringify(`${appOrigin}/schooler-player-overlay.js`)} + '?v=4';
  s.async = true;
  (document.head || document.documentElement).appendChild(s);
})();
</script>`
}

export const buildSchoolerPlayerMountHtml = (videoId, origin = null) => {
  const appOrigin = (
    origin ||
    (typeof window !== 'undefined' ? window.location.origin : '') ||
    'https://schooler-z7x3.onrender.com'
  ).replace(/\/+$/, '')
  const id = String(videoId || '').trim()
  return `<div id="schooler-player" data-video-id="${id}"></div>
<script>
  window.SchoolerPlayerConfig = { origin: ${JSON.stringify(appOrigin)}, mode: 'hosted', auto: false };
</script>
<script src="${appOrigin}/schooler-player-overlay.js" async></script>`
}
