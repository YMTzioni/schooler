import {
  YOUTUBE_PLYR_OPTIONS,
  buildYouTubeEmbedUrl,
  buildYouTubeShieldMarkup,
} from '../../lib/youtubeEmbed.js'

const SCHOOLER_ORIGIN = 'https://my.schooler.biz'

const escapeHtml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const buildPlyrEmbedUrl = (videoId, origin = SCHOOLER_ORIGIN) =>
  buildYouTubeEmbedUrl(videoId, origin)

export const buildPlyrEmbedCode = (videoId, title, origin = SCHOOLER_ORIGIN) => {
  const safeTitle = escapeHtml(title)
  const embedUrl = buildPlyrEmbedUrl(videoId, origin)
  const playerId = `plyr-${videoId}`
  const plyrYoutubeOptions = JSON.stringify(YOUTUBE_PLYR_OPTIONS)

  return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css" />
<style>
  .plyr-yt-shell{position:relative;width:100%;padding-bottom:56.25%;height:0;overflow:hidden;background:#000;border-radius:8px}
  .plyr-yt-shell__stage{position:absolute;inset:0;overflow:hidden}
  .plyr-yt-shell .plyr__video-embed iframe{width:118%!important;height:118%!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important}
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
