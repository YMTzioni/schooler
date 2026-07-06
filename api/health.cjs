module.exports = (_req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(
    JSON.stringify({
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
    }),
  )
}
