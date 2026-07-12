;(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const state = {
    running: false,
    stopRequested: false,
    current: 0,
    total: 0,
    message: 'מוכן',
    lastError: '',
  }

  const qs = (selector, root = document) => root.querySelector(selector)
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)]

  const setNativeValue = (element, value) => {
    const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
    descriptor?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const click = (element) => {
    if (!element) return false
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    element.click()
    return true
  }

  const waitFor = async (getter, { timeout = 15000, interval = 200 } = {}) => {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      if (state.stopRequested) throw new Error('הייבוא נעצר')
      const value = getter()
      if (value) return value
      await sleep(interval)
    }
    throw new Error('המתנה לזמן ארוך מדי')
  }

  const ensurePanel = () => {
    let panel = document.getElementById('schooler-importer-panel')
    if (panel) return panel

    panel = document.createElement('div')
    panel.id = 'schooler-importer-panel'
    panel.innerHTML = `
      <div class="sip-title">ייבוא Schooler</div>
      <div class="sip-progress" id="sip-progress">0/0</div>
      <div class="sip-message" id="sip-message">מוכן</div>
      <button type="button" id="sip-stop">עצור</button>
    `
    const style = document.createElement('style')
    style.textContent = `
      #schooler-importer-panel {
        position: fixed;
        z-index: 999999;
        left: 16px;
        bottom: 16px;
        width: 280px;
        background: #101727;
        color: #e8eefc;
        border: 1px solid #3d4d73;
        border-radius: 10px;
        padding: 12px;
        font-family: Arial, sans-serif;
        box-shadow: 0 8px 24px rgba(0,0,0,.35);
        direction: rtl;
      }
      #schooler-importer-panel .sip-title { font-weight: bold; margin-bottom: 6px; }
      #schooler-importer-panel .sip-progress { font-size: 18px; margin-bottom: 4px; }
      #schooler-importer-panel .sip-message { font-size: 12px; min-height: 34px; color: #a7b8e6; white-space: pre-wrap; }
      #schooler-importer-panel button {
        margin-top: 8px;
        background: #c23b3b;
        color: #fff;
        border: 0;
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
      }
    `
    document.documentElement.appendChild(style)
    document.documentElement.appendChild(panel)
    panel.querySelector('#sip-stop').addEventListener('click', () => {
      state.stopRequested = true
      updatePanel('מתבקשת עצירה…')
    })
    return panel
  }

  const updatePanel = (message) => {
    state.message = message
    ensurePanel()
    const progress = document.getElementById('sip-progress')
    const msg = document.getElementById('sip-message')
    if (progress) progress.textContent = `${state.current}/${state.total}`
    if (msg) msg.textContent = message + (state.lastError ? `\n${state.lastError}` : '')
  }

  const getCreateButton = () => qs(SELECTORS.createLessonBtn)

  const getTocItems = () => qsa(SELECTORS.tocItem)

  const getActiveLessonItem = () => qs(SELECTORS.activeTocItem) || getTocItems().at(-1) || null

  const getLessonNameTarget = (item) => {
    if (!item) return null
    return (
      qs('.lesson-item .lesson.caption, .lesson-item .colored-item, .lesson-item a, .lesson-item span', item) ||
      qs('.lesson-item', item)
    )
  }

  const createNewLesson = async () => {
    const before = getTocItems().length
    const btn = getCreateButton()
    if (!btn) throw new Error('לא נמצא כפתור "שיעור חדש"')
    click(btn)
    await waitFor(() => getTocItems().length > before || qs(SELECTORS.activeTocItem), {
      timeout: 20000,
    })
    await sleep(700)
    return getActiveLessonItem()
  }

  const renameActiveLesson = async (title) => {
    const item = getActiveLessonItem()
    const target = getLessonNameTarget(item)
    if (!target) throw new Error('לא נמצא שם שיעור לשינוי')

    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }))
    await sleep(250)

    const input = await waitFor(() => qs(SELECTORS.renameInput, item) || qs(SELECTORS.renameInput), {
      timeout: 8000,
    })
    input.focus()
    setNativeValue(input, title)
    await sleep(120)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
    )
    input.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
    )
    input.blur()
    await sleep(500)
  }

  const openContentTypePopup = async () => {
    if (qs(SELECTORS.radioWww) || qs(`${SELECTORS.popup} ${SELECTORS.popupTextarea}`)) {
      return true
    }

    const candidates = [
      ...qsa('button, a, div, span').filter((el) => {
        const text = (el.textContent || '').trim()
        return (
          text.includes('סוג תוכן') ||
          text.includes('בחר תוכן') ||
          text.includes('הוסף תוכן') ||
          text.includes('ערוך תוכן') ||
          text.includes('אתר מוטמע') ||
          text.includes('תוכן השיעור')
        )
      }),
      ...qsa(SELECTORS.contentTypeTrigger),
      ...qsa('.edit-lesson-root .nm-btn'),
      ...qsa('[class*="lesson-edit"]'),
      ...qsa('img[src*="lesson-edit"], .lesson-edit-icon, [class*="edit-icon"]'),
    ]

    for (const el of candidates) {
      if (!el || el.closest('#schooler-importer-panel')) continue
      click(el)
      await sleep(400)
      if (qs(SELECTORS.radioWww) || qs(SELECTORS.popup)) return true
    }

    // Fallback: try clicking main content area empty states
    const mainArea = qs('.edit-lesson-root .content, .lesson-body, .main-content, .wrapper.edit-lesson-root')
    if (mainArea) {
      click(mainArea)
      await sleep(400)
      if (qs(SELECTORS.radioWww) || qs(SELECTORS.popup)) return true
    }

    throw new Error('לא הצלחתי לפתוח את חלון בחירת סוג התוכן')
  }

  const selectWwwAndFillEmbed = async (embedUrl) => {
    await openContentTypePopup()

    const radio = await waitFor(() => qs(SELECTORS.radioWww), { timeout: 10000 }).catch(() => null)
    if (radio) {
      click(radio)
      const label = qs(SELECTORS.radioWwwLabel)
      if (label) click(label)
      await sleep(350)
    } else {
      const wwwLabel = qsa('label, div, span').find((el) => (el.textContent || '').includes('אתר מוטמע'))
      if (wwwLabel) {
        click(wwwLabel)
        await sleep(350)
      } else {
        throw new Error('לא נמצאה אפשרות "אתר מוטמע"')
      }
    }

    const textarea = await waitFor(() => qs(SELECTORS.popupTextarea) || qs('textarea.nm-textarea') || qs('.popup textarea'), {
      timeout: 10000,
    })
    textarea.focus()
    setNativeValue(textarea, embedUrl)
    await sleep(200)

    const submit =
      qs(SELECTORS.popupSubmit) ||
      qsa('input, button').find((el) => {
        const text = `${el.value || ''} ${el.textContent || ''}`.trim()
        return text.includes('שמור') || text.includes('אישור') || el.type === 'submit'
      })

    if (!submit) throw new Error('לא נמצא כפתור שמירה בפופאפ')
    click(submit)
    await sleep(900)
  }

  const importLesson = async (lesson) => {
    updatePanel(`יוצר שיעור: ${lesson.title}`)
    await createNewLesson()
    updatePanel(`משנה שם: ${lesson.title}`)
    await renameActiveLesson(lesson.title)
    updatePanel(`מדביק קישור הטמעה: ${lesson.title}`)
    await selectWwwAndFillEmbed(lesson.embedUrl)
  }

  const startImport = async ({ payload, startFrom = 1 }) => {
    if (state.running) {
      return { ok: false, error: 'ייבוא כבר רץ' }
    }
    if (!payload?.lessons?.length) {
      return { ok: false, error: 'אין שיעורים לייבוא' }
    }
    if (!getCreateButton()) {
      return { ok: false, error: 'לא בדף עריכת קורס של Schooler (חסר כפתור שיעור חדש)' }
    }

    const lessons = payload.lessons
      .slice()
      .sort((a, b) => Number(a.order) - Number(b.order))
      .filter((lesson) => Number(lesson.order) >= Number(startFrom))

    state.running = true
    state.stopRequested = false
    state.total = lessons.length
    state.current = 0
    state.lastError = ''
    ensurePanel()
    updatePanel('מתחיל ייבוא…')

    try {
      for (const lesson of lessons) {
        if (state.stopRequested) break
        state.current += 1
        try {
          await importLesson(lesson)
        } catch (error) {
          state.lastError = error.message || String(error)
          updatePanel(`שגיאה בשיעור ${lesson.order}: ${lesson.title}`)
          throw error
        }
        await sleep(600)
      }

      if (state.stopRequested) {
        updatePanel(`נעצר אחרי ${state.current}/${state.total}`)
        return { ok: true, message: `נעצר ב־${state.current}/${state.total}` }
      }

      updatePanel(`הושלם: ${state.current}/${state.total}`)
      return { ok: true, message: `יובאו ${state.current} שיעורים בהצלחה` }
    } catch (error) {
      return { ok: false, error: error.message || String(error) }
    } finally {
      state.running = false
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handle = async () => {
      if (message?.type === 'START_IMPORT') {
        if (state.running) {
          return { ok: false, error: 'ייבוא כבר רץ' }
        }
        if (!message.payload?.lessons?.length) {
          return { ok: false, error: 'אין שיעורים לייבוא' }
        }
        if (!getCreateButton()) {
          return { ok: false, error: 'לא בדף עריכת קורס של Schooler (חסר כפתור שיעור חדש)' }
        }

        // Long-running import continues after the response.
        startImport({ payload: message.payload, startFrom: message.startFrom || 1 }).then((result) => {
          if (!result.ok) updatePanel(result.error || 'ייבוא נכשל')
        })
        return { ok: true, message: 'הייבוא התחיל בדף' }
      }
      if (message?.type === 'STOP_IMPORT') {
        state.stopRequested = true
        updatePanel('מתבקשת עצירה…')
        return { ok: true, message: 'בקשת עצירה נשלחה' }
      }
      if (message?.type === 'GET_STATUS') {
        return {
          ok: true,
          running: state.running,
          message: `${state.current}/${state.total} · ${state.message}`,
        }
      }
      if (message?.type === 'PING') {
        return { ok: true, page: 'schooler-edit' }
      }
      return { ok: false, error: 'הודעה לא מוכרת' }
    }

    handle().then(sendResponse)
    return true
  })

  ensurePanel()
  updatePanel('תוסף ייבוא פעיל בדף העריכה')
})()
