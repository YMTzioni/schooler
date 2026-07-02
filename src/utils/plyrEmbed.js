const SCHOOLER_ORIGIN = 'https://my.schooler.biz'

const escapeHtml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const buildPlyrEmbedUrl = (videoId, origin = SCHOOLER_ORIGIN) => {
  const params = new URLSearchParams({
    origin,
    enablejsapi: '1',
    iv_load_policy: '3',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
  })

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

export const buildPlyrEmbedCode = (videoId, title, origin = SCHOOLER_ORIGIN) => {
  const safeTitle = escapeHtml(title)
  const embedUrl = buildPlyrEmbedUrl(videoId, origin)
  const playerId = `plyr-${videoId}`

  return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css" />
<div id="${playerId}" class="plyr__video-embed">
  <iframe
    src="${embedUrl}"
    allowfullscreen
    allow="autoplay; encrypted-media; picture-in-picture"
    title="${safeTitle}"
  ></iframe>
</div>
<script src="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.polyfilled.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    new Plyr('#${playerId}', {
      youtube: { noCookie: true, rel: 0, modestbranding: 1, iv_load_policy: 3, playsinline: 1 }
    });
  });
</script>`
}
