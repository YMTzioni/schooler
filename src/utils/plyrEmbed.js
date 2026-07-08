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
  const safeTitle = escapeHtml(title)
  const embedUrl = buildPlyrEmbedUrl(videoId, origin)
  return `<iframe
  src="${embedUrl}"
  title="${safeTitle}"
  width="100%"
  height="405"
  frameborder="0"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
  allow="autoplay; encrypted-media; picture-in-picture"
  allowfullscreen
></iframe>`
}
