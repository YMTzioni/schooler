/** Selectors for Schooler course edit page. Keep in one place. */
const SELECTORS = {
  createLessonBtn: 'a.teacher__create-new-lesson',
  tocItem: 'li.toc-item',
  activeTocItem: 'li.toc-item.lesson-active',
  lessonNameInItem:
    '.lesson-item .lesson.caption, .lesson-item .colored-item, .lesson-item a span, .lesson-item a, .lesson-item span',
  renameInput:
    '.teacher__edit-lesson-in-toc input, .teacher__edit-lesson-in-toc textarea, li.toc-item.lesson-active input, li.toc-item.lesson-active textarea',
  radioWww: '#radio_www',
  radioWwwLabel: 'label[for="radio_www"]',
  popup: '.popup',
  contentTypePopup: '.popup.select-content-type, .popup .select-content-type, .select-content-type',
  popupTextarea: '.popup textarea.nm-textarea, .popup textarea',
  popupSubmit: '.popup input.nm-btn[type="submit"], .popup button.nm-btn[type="submit"]',
  // Prefer precise triggers — avoid broad .nm-btn which opens TinyMCE.
  contentTypeTriggers: [
    '.custom-edit-icon',
    'img[src*="lesson-edit"]',
    '[class*="lesson-edit-icon"]',
    'a[href="#"][class*="edit"]',
    'button[class*="content-type"]',
    '.teacher__select-content-type',
  ].join(', '),
}
