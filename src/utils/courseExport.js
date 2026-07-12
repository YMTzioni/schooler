import { buildHostedEmbedUrl } from './plyrEmbed.js'

const EPISODE_PREFIX_RE = /^פרק\s*\d+\s*[:：\-–]\s*/u
const EPISODE_ONLY_RE = /^פרק\s*\d+$/u

/** Strip "פרק 12: " style prefixes so we keep the raw YouTube title. */
export const stripEpisodePrefix = (value) =>
  String(value || '')
    .trim()
    .replace(EPISODE_PREFIX_RE, '')
    .trim()

/**
 * Prefer the original YouTube video title for Schooler lesson names.
 * Falls back through known fields and strips accidental "פרק N:" prefixes.
 */
export const resolveYoutubeLessonTitle = (video = {}, order = 1) => {
  const candidates = [
    video.youtubeTitle,
    video.originalTitle,
    video.title,
    video.displayName,
    video.name,
  ]

  for (const candidate of candidates) {
    const raw = String(candidate || '').trim()
    if (!raw) continue
    if (EPISODE_ONLY_RE.test(raw)) continue

    const stripped = stripEpisodePrefix(raw)
    if (stripped) return stripped
  }

  return `שיעור ${order}`
}

const extractLessonSortKey = (title) => {
  const raw = String(title || '').trim()
  const hebrewEpisode = raw.match(/^פרק\s*(\d+)/u)
  if (hebrewEpisode) return [Number(hebrewEpisode[1])]

  const leading = raw.match(/^(\d+(?:[.\s_-]+\d+){0,4})\b/)
  if (!leading) return null

  const parts = leading[1]
    .split(/[.\s_-]+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part))
  return parts.length ? parts : null
}

const compareLessonSortKeys = (a, b) => {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left - right
  }
  return 0
}

/** Sort lessons ascending by leading numbers in title (1 1 → 1 2 → 1 3…). */
export const sortLessonsByAscendingNumber = (lessons) => {
  if (!Array.isArray(lessons) || lessons.length < 2) return lessons

  const keyed = lessons.map((lesson, index) => ({
    lesson,
    index,
    key: extractLessonSortKey(lesson.title),
  }))
  const numberedCount = keyed.filter((item) => item.key).length
  if (numberedCount < Math.ceil(lessons.length / 2)) return lessons

  return keyed
    .slice()
    .sort((a, b) => {
      if (a.key && b.key) {
        const compared = compareLessonSortKeys(a.key, b.key)
        if (compared !== 0) return compared
      } else if (a.key && !b.key) return -1
      else if (!a.key && b.key) return 1
      return a.index - b.index
    })
    .map((item, orderIndex) => ({
      ...item.lesson,
      order: orderIndex + 1,
    }))
}

export const buildSchoolerImportPayload = (course, origin = null) => {
  const videos = Array.isArray(course?.videos) ? course.videos : []
  const unsortedLessons = videos.map((video, index) => {
    const order = Number(video.index) || index + 1
    return {
      order,
      title: resolveYoutubeLessonTitle(video, order),
      videoId: video.videoId,
      embedUrl: buildHostedEmbedUrl(video.videoId, origin),
    }
  })
  const lessons = sortLessonsByAscendingNumber(unsortedLessons)

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    course: {
      id: course?.id || null,
      name: course?.name || 'קורס',
      playlistId: course?.playlistId || null,
    },
    lessons,
  }
}

export const buildSchoolerImportFileName = (course) => {
  const raw = String(course?.id || course?.name || 'course')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80)
  return `schooler-course-${raw || 'course'}.json`
}
