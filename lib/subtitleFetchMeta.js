export const createSubtitleFetchMeta = () => ({
  delivery: null,
  proxyAttempts: 0,
  proxyCountry: null,
  trackSource: null,
  innertubeClient: null,
})

export const recordSubtitleDelivery = (meta, proxy, staticProxy) => {
  if (!meta) return

  if (!proxy) {
    meta.delivery = staticProxy ? 'static_proxy' : 'direct'
    return
  }

  if (
    staticProxy &&
    proxy.host === staticProxy.host &&
    proxy.port === staticProxy.port
  ) {
    meta.delivery = 'static_proxy'
    return
  }

  meta.delivery = 'pubproxy'
  meta.proxyCountry = proxy.country || null
}
