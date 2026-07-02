export const SUBTITLE_TARGET_LANGUAGES = [
  { value: 'none', label: 'ללא תרגום' },
  { value: 'he', label: 'עברית' },
  { value: 'en', label: 'אנגלית' },
  { value: 'ar', label: 'ערבית' },
  { value: 'ru', label: 'רוסית' },
  { value: 'fr', label: 'צרפתית' },
]

export const SUBTITLE_SOURCE_LANGUAGES = [
  { value: 'auto', label: 'אוטומטי (מומלץ)' },
  ...SUBTITLE_TARGET_LANGUAGES.filter((lang) => lang.value !== 'none'),
]

export const PLAYER_TRANSLATION_LANGUAGES = SUBTITLE_TARGET_LANGUAGES

export const PREFETCH_TRANSLATION_LANGS = SUBTITLE_TARGET_LANGUAGES.map((lang) => lang.value)
