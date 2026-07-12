/** Selectors for Schooler course edit page. Keep in one place. */
const SELECTORS = {
  createLessonBtn: 'a.teacher__create-new-lesson',
  tocItem: 'li.toc-item',
  activeTocItem: 'li.toc-item.lesson-active',
  lessonNameInItem: '.lesson-item .colored-item, .lesson-item a, .lesson-item .caption, .lesson-item span',
  renameInput: '.teacher__edit-lesson-in-toc input, .teacher__edit-lesson-in-toc textarea, li.toc-item input, li.toc-item textarea',
  radioWww: '#radio_www',
  radioWwwLabel: 'label[for="radio_www"]',
  popup: '.popup',
  popupTextarea: '.popup textarea.nm-textarea, .popup textarea',
  popupSubmit: '.popup input.nm-btn[type="submit"], .popup button[type="submit"], .popup .nm-btn',
  contentTypeTrigger: [
    '.select-content-type',
    '[class*="content-type"]',
    '.lesson-content-edit',
    '.edit-content',
    'button[class*="content"]',
    '.sch-webpage',
    '.nm-btn',
  ].join(', '),
}
