chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ ok: true })
    return false
  }

  if (message?.type === 'FORWARD_TO_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ ok: false, error: 'לא נמצא טאב פעיל' })
        return
      }
      chrome.tabs.sendMessage(tab.id, message.payload, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError.message || 'אין חיבור לדף העריכה. ודא שאתה בדף /edit של Schooler.',
          })
          return
        }
        sendResponse(response || { ok: true })
      })
    })
    return true
  }

  return false
})
