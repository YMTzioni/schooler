let appPromise = null

const loadApp = () => {
  if (!appPromise) {
    appPromise = import('../server.js').then((mod) => mod.default)
  }
  return appPromise
}

module.exports = async (req, res) => {
  try {
    const app = await loadApp()
    return app(req, res)
  } catch (error) {
    console.error('API handler failed:', error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        message: error?.message || 'API failed to start',
        code: 'API_BOOT_ERROR',
      }),
    )
  }
}
