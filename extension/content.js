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
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    if (typeof element.click === 'function') element.click()
    return true
  }

  const isUnsafeClickTarget = (el) => {
    if (!el) return true
    if (el.closest('#schooler-importer-panel')) return true
    if (el.closest('.tox, .mce-tinymce, .tox-tinymce, [id*="tinymce"], .mce-content-body')) return true
    if (el.closest('iframe')) return true
    // Avoid accidental TOC navigation while hunting content-type UI
    if (el.closest('li.toc-item') && !el.closest(SELECTORS.createLessonBtn)) return true
    return false
  }

  const waitFor = async (getter, { timeout = 20000, interval = 250, label = 'אלמנט' } = {}) => {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      if (state.stopRequested) throw new Error('הייבוא נעצר')
      const value = getter()
      if (value) return value
      await sleep(interval)
    }
    throw new Error(`המתנה לזמן ארוך מדי: ${label}`)
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
        width: 300px;
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
      #schooler-importer-panel .sip-message { font-size: 12px; min-height: 40px; color: #a7b8e6; white-space: pre-wrap; }
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

  const getLessonHref = (item) => {
    const link = item?.querySelector?.('a[href*="/edit"]')
    return link?.getAttribute('href') || ''
  }

  const getLessonNameTarget = (item) => {
    if (!item) return null
    return qs(SELECTORS.lessonNameInItem, item) || qs('.lesson-item', item)
  }

  const waitForLessonStable = async (beforeCount, beforeUrl) => {
    await waitFor(() => getTocItems().length > beforeCount, {
      timeout: 25000,
      label: 'שיעור חדש בתוכן העניינים',
    })

    // Schooler briefly creates lessons without lesson_id — wait for URL / href to settle.
    await waitFor(
      () => {
        const active = getActiveLessonItem()
        if (!active) return null
        const href = getLessonHref(active)
        const urlChanged = window.location.href !== beforeUrl && /\/edit\/?$/.test(window.location.pathname)
        const hasEditHref = Boolean(href && href.includes('/edit'))
        const nameEl = getLessonNameTarget(active)
        const hasName = Boolean(nameEl && (nameEl.textContent || '').trim())
        return (urlChanged || hasEditHref) && hasName ? active : null
      },
      { timeout: 25000, label: 'יציבות שיעור חדש (lesson_id/URL)' },
    )

    // Extra settle time for Redux sync / TinyMCE init race
    await sleep(1800)
    return getActiveLessonItem()
  }

  const createNewLesson = async () => {
    const before = getTocItems().length
    const beforeUrl = window.location.href
    const btn = getCreateButton()
    if (!btn) throw new Error('לא נמצא כפתור "שיעור חדש"')
    click(btn)
    return waitForLessonStable(before, beforeUrl)
  }

  const renameActiveLesson = async (title) => {
    const item = getActiveLessonItem()
    const target = getLessonNameTarget(item)
    if (!target) throw new Error('לא נמצא שם שיעור לשינוי')

    // Prefer focusing active lesson first with a single click
    click(target)
    await sleep(300)
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }))
    await sleep(400)

    const input = await waitFor(() => qs(SELECTORS.renameInput) || qs('input, textarea', item), {
      timeout: 10000,
      label: 'שדה שינוי שם',
    })
    input.focus()
    setNativeValue(input, title)
    await sleep(200)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
    )
    input.dispatchEvent(
      new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
    )
    input.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
    )
    input.blur()
    await sleep(900)

    await waitFor(
      () => {
        const active = getActiveLessonItem()
        const text = (getLessonNameTarget(active)?.textContent || '').trim()
        return text.includes(title.slice(0, Math.min(12, title.length))) ? active : null
      },
      { timeout: 8000, label: 'אישור שם שיעור' },
    ).catch(() => null)
  }

  const contentTypePopupVisible = () =>
    qs(SELECTORS.radioWww) ||
    qs(SELECTORS.contentTypePopup) ||
    (qs(SELECTORS.popup) && (qs(SELECTORS.popup)?.textContent || '').includes('אתר מוטמע'))

  const findByExactTexts = (texts) => {
    const nodes = qsa('button, a, span, div, label')
    return nodes.filter((el) => {
      if (isUnsafeClickTarget(el)) return false
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text || text.length > 40) return false
      return texts.some((t) => text === t || text.includes(t))
    })
  }

  const openContentTypePopup = async () => {
    if (contentTypePopupVisible()) return true

    const textCandidates = findByExactTexts([
      'סוג תוכן',
      'בחר תוכן',
      'הוסף תוכן',
      'ערוך תוכן',
      'שנה תוכן',
      'אתר מוטמע',
      'בחר סוג תוכן',
    ])

    const selectorCandidates = qsa(SELECTORS.contentTypeTriggers).filter((el) => !isUnsafeClickTarget(el))

    const ordered = [...textCandidates, ...selectorCandidates]
    for (const el of ordered) {
      click(el)
      await sleep(600)
      if (contentTypePopupVisible()) return true
    }

    // Empty-state placeholders in the main lesson pane (not TinyMCE)
    const emptyStates = qsa(
      '.edit-lesson-root .content-placeholder, .edit-lesson-root .empty-state, .edit-lesson-root [class*="placeholder"]',
    ).filter((el) => !isUnsafeClickTarget(el))
    for (const el of emptyStates) {
      click(el)
      await sleep(600)
      if (contentTypePopupVisible()) return true
    }

    throw new Error('לא הצלחתי לפתוח את חלון בחירת סוג התוכן (נמנע מלחיצות על TinyMCE)')
  }

  const selectWwwAndFillEmbed = async (embedUrl) => {
    await openContentTypePopup()

    const radio = await waitFor(() => qs(SELECTORS.radioWww), {
      timeout: 12000,
      label: 'רדיו אתר מוטמע',
    }).catch(() => null)

    if (radio) {
      click(radio)
      const label = qs(SELECTORS.radioWwwLabel)
      if (label) click(label)
      await sleep(500)
    } else {
      const wwwLabel = findByExactTexts(['אתר מוטמע'])[0]
      if (!wwwLabel) throw new Error('לא נמצאה אפשרות "אתר מוטמע"')
      click(wwwLabel)
      await sleep(500)
    }

    const textarea = await waitFor(
      () => qs(SELECTORS.popupTextarea) || qs('.popup textarea') || qs('textarea.nm-textarea'),
      { timeout: 12000, label: 'שדה קישור הטמעה' },
    )
    textarea.focus()
    setNativeValue(textarea, embedUrl)
    await sleep(300)

    const submit =
      qs(SELECTORS.popupSubmit) ||
      qsa('.popup input, .popup button').find((el) => {
        const text = `${el.value || ''} ${el.textContent || ''}`.trim()
        return text.includes('שמור') || text.includes('אישור') || el.type === 'submit'
      })

    if (!submit) throw new Error('לא נמצא כפתור שמירה בפופאפ')
    click(submit)

    await waitFor(() => !contentTypePopupVisible(), {
      timeout: 15000,
      label: 'סגירת פופאפ אחרי שמירה',
    }).catch(() => null)

    await sleep(1200)
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
    if (state.running) return { ok: false, error: 'ייבוא כבר רץ' }
    if (!payload?.lessons?.length) return { ok: false, error: 'אין שיעורים לייבוא' }
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
        await sleep(1200)
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
        if (state.running) return { ok: false, error: 'ייבוא כבר רץ' }
        if (!message.payload?.lessons?.length) return { ok: false, error: 'אין שיעורים לייבוא' }
        if (!getCreateButton()) {
          return { ok: false, error: 'לא בדף עריכת קורס של Schooler (חסר כפתור שיעור חדש)' }
        }

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
