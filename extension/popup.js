let loadedPayload = null

const statusEl = document.getElementById('status')
const previewEl = document.getElementById('preview')
const fileInput = document.getElementById('fileInput')
const startFromInput = document.getElementById('startFrom')

const setStatus = (text, kind = '') => {
  statusEl.className = kind
  statusEl.textContent = text
}

const countLessons = (payload) => {
  if (Array.isArray(payload?.chapters) && payload.chapters.length) {
    return payload.chapters.reduce((sum, chapter) => sum + (chapter.lessons?.length || 0), 0)
  }
  return payload?.lessons?.length || 0
}

const isSupportedPayload = (payload) => {
  const version = Number(payload?.version)
  if (version !== 1 && version !== 2) return false
  return countLessons(payload) > 0
}

const renderPreview = (payload) => {
  if (!isSupportedPayload(payload)) {
    previewEl.textContent = ''
    return
  }

  if (Array.isArray(payload.chapters) && payload.chapters.length) {
    const lines = payload.chapters.slice(0, 6).map((chapter) => {
      const lessons = chapter.lessons?.length || 0
      return `פרק ${chapter.order}: ${chapter.name} (${lessons} שיעורים)`
    })
    const more =
      payload.chapters.length > 6 ? `\n… ועוד ${payload.chapters.length - 6} פרקים` : ''
    previewEl.textContent = `קורס: ${payload.course?.name || 'ללא שם'}\n${lines.join('\n')}${more}`
    return
  }

  const lines = payload.lessons.slice(0, 8).map((lesson) => `${lesson.order}. ${lesson.title}`)
  const more = payload.lessons.length > 8 ? `\n… ועוד ${payload.lessons.length - 8} שיעורים` : ''
  previewEl.textContent = `קורס: ${payload.course?.name || 'ללא שם'}\n${lines.join('\n')}${more}`
}

const payloadSummary = (payload) => {
  const lessons = countLessons(payload)
  if (Array.isArray(payload?.chapters) && payload.chapters.length) {
    return `${payload.course?.name || 'קורס'} · ${payload.chapters.length} פרקים · ${lessons} שיעורים`
  }
  return `${payload?.course?.name || 'קורס'} · ${lessons} שיעורים`
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
    if (!isSupportedPayload(parsed)) {
      throw new Error('הקובץ לא מכיל שיעורים (דרוש version 1 או 2)')
    }
    loadedPayload = parsed
    setStatus(`נטען: ${payloadSummary(parsed)}`, 'ok')
    renderPreview(parsed)
    chrome.storage.local.set({ schoolerImportPayload: parsed })
  } catch (error) {
    loadedPayload = null
    setStatus(error.message || 'קובץ לא תקין', 'error')
    previewEl.textContent = ''
  }
})

document.getElementById('startBtn').addEventListener('click', async () => {
  if (!isSupportedPayload(loadedPayload)) {
    const stored = await chrome.storage.local.get('schoolerImportPayload')
    loadedPayload = stored.schoolerImportPayload || null
  }
  if (!isSupportedPayload(loadedPayload)) {
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
  if (isSupportedPayload(data.schoolerImportPayload)) {
    loadedPayload = data.schoolerImportPayload
    setStatus(`שמור מהפעם הקודמת: ${payloadSummary(loadedPayload)}`, 'ok')
    renderPreview(loadedPayload)
  }
})
