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
    res.status(500).json({
      message: error?.message || 'API failed to start',
      code: 'API_BOOT_ERROR',
    })
  }
}
