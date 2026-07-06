/** Lightweight health check — avoids loading the full Express server bundle. */
export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    service: 'schooler-api',
    version: '1.3.7',
    features: [
      'youtube-playlist',
      'youtube-subtitles',
      'subtitle-status',
      'subtitle-translate',
      'schooler-api',
      'responder-api-v2',
    ],
  })
}
