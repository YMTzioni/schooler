/** Selectors for Schooler course edit page. Keep in one place. */
const SELECTORS = {
  createLessonBtn: 'a.teacher__create-new-lesson',
  createChapterText: 'פרק חדש',
  tocItem: 'li.toc-item',
  tocHeader: 'li.toc-header',
  activeTocItem: 'li.toc-item.lesson-active',
  lessonNameInItem:
    '.lesson-item .lesson.caption, .lesson-item .colored-item, .lesson-item a span, .lesson-item a, .lesson-item span',
  chapterNameInHeader:
    '.colored-item, .caption, .section-caption, a span, span, a',
  renameInput:
    '.teacher__edit-lesson-in-toc input, .teacher__edit-lesson-in-toc textarea, li.toc-item.lesson-active input, li.toc-item.lesson-active textarea, li.toc-header input, li.toc-header textarea',
  radioWww: '#radio_www',
  radioWwwLabel: 'label[for="radio_www"]',
  popup: '.popup',
  contentTypePopup: '.popup.select-content-type, .popup .select-content-type, .select-content-type',
  popupEmbedInput:
    '.popup input.nm-input[type="url"], .popup input[type="url"].nm-input, input.nm-input[type="url"], input[type="url"][placeholder="https://"]',
  popupTextarea: '.popup textarea.nm-textarea, .popup textarea',
  popupSubmit: '.popup input.nm-btn[type="submit"], .popup button.nm-btn[type="submit"]',
  // Prefer precise triggers — overlay pencil on player, not TinyMCE / random .nm-btn
  contentTypeTriggers: [
    'button.cta-btn',
    '.edit-lesson-root button.cta-btn',
    '.edit-lesson-root .video-responsive-wrap.edit-content .button_play',
    '.edit-lesson-root .video-responsive-wrap.edit-content .button-edit',
    '.edit-lesson-root .button_play',
    '.edit-lesson-root .button-edit',
    '.edit-lesson-root .button_play_wrap',
    '.edit-lesson-root .pencil',
    '.video-responsive-wrap.edit-content a',
    'img[src*="lesson-edit-icon"]',
    'img[src*="lesson-edit"]',
    '.custom-edit-icon',
  ].join(', '),
  editContentBtnText: 'עריכת תוכן שיעור',
}
