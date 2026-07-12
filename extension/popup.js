let loadedPayload = null

const statusEl = document.getElementById('status')
const previewEl = document.getElementById('preview')
const fileInput = document.getElementById('fileInput')
const startFromInput = document.getElementById('startFrom')

const setStatus = (text, kind = '') => {
  statusEl.className = kind
  statusEl.textContent = text
}

const renderPreview = (payload) => {
  if (!payload?.lessons?.length) {
    previewEl.textContent = ''
    return
  }
  const lines = payload.lessons.slice(0, 8).map((lesson) => `${lesson.order}. ${lesson.title}`)
  const more =
    payload.lessons.length > 8 ? `\n… ועוד ${payload.lessons.length - 8} שיעורים` : ''
  previewEl.textContent = `קורס: ${payload.course?.name || 'ללא שם'}\n${lines.join('\n')}${more}`
}

const sendToContent = (payload) =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'FORWARD_TO_TAB', payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message })
        return
      }
      resolve(response || { ok: false, error: 'אין תגובה מהדף' })
    })
  })

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    if (!parsed?.lessons?.length) {
      throw new Error('הקובץ לא מכיל שיעורים')
    }
    if (Number(parsed.version) !== 1) {
      throw new Error('גרסת קובץ לא נתמכת (דרוש version: 1)')
    }
    loadedPayload = parsed
    setStatus(`נטען: ${parsed.course?.name || 'קורס'} · ${parsed.lessons.length} שיעורים`, 'ok')
    renderPreview(parsed)
    chrome.storage.local.set({ schoolerImportPayload: parsed })
  } catch (error) {
    loadedPayload = null
    setStatus(error.message || 'קובץ לא תקין', 'error')
    previewEl.textContent = ''
  }
})

document.getElementById('startBtn').addEventListener('click', async () => {
  if (!loadedPayload?.lessons?.length) {
    const stored = await chrome.storage.local.get('schoolerImportPayload')
    loadedPayload = stored.schoolerImportPayload || null
  }
  if (!loadedPayload?.lessons?.length) {
    setStatus('טען קובץ JSON לפני התחלה', 'error')
    return
  }

  const startFrom = Math.max(1, Number(startFromInput.value) || 1)
  setStatus('שולח לדף העריכה…')
  const response = await sendToContent({
    type: 'START_IMPORT',
    payload: loadedPayload,
    startFrom,
  })
  if (!response?.ok) {
    setStatus(response?.error || 'הייבוא לא התחיל', 'error')
    return
  }
  setStatus(response.message || 'הייבוא רץ בדף העריכה', 'ok')
})

document.getElementById('stopBtn').addEventListener('click', async () => {
  const response = await sendToContent({ type: 'STOP_IMPORT' })
  setStatus(response?.message || 'בקשת עצירה נשלחה', response?.ok ? 'ok' : 'error')
})

document.getElementById('refreshBtn').addEventListener('click', async () => {
  const response = await sendToContent({ type: 'GET_STATUS' })
  if (!response?.ok) {
    setStatus(response?.error || 'לא ניתן לקרוא סטטוס', 'error')
    return
  }
  setStatus(response.message || 'אין סטטוס', response.running ? '' : 'ok')
})

chrome.storage.local.get('schoolerImportPayload', (data) => {
  if (data.schoolerImportPayload?.lessons?.length) {
    loadedPayload = data.schoolerImportPayload
    setStatus(
      `שמור מהפעם הקודמת: ${loadedPayload.course?.name || 'קורס'} · ${loadedPayload.lessons.length} שיעורים`,
      'ok',
    )
    renderPreview(loadedPayload)
  }
})
