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

export const buildLessonsFromVideos = (videos = [], origin = null) => {
  const unsortedLessons = (Array.isArray(videos) ? videos : []).map((video, index) => {
    const order = Number(video.index) || index + 1
    return {
      order,
      title: resolveYoutubeLessonTitle(video, order),
      videoId: video.videoId,
      embedUrl: buildHostedEmbedUrl(video.videoId, origin),
    }
  })
  return sortLessonsByAscendingNumber(unsortedLessons)
}

/** Normalize legacy single-playlist courses into chapter-based bundles. */
export const normalizeBundleChapters = (course = {}) => {
  if (Array.isArray(course.chapters) && course.chapters.length) {
    return course.chapters.map((chapter, index) => ({
      id: chapter.id || chapter.playlistId || `${course.id || 'chapter'}-${index + 1}`,
      name: chapter.name || `פרק ${index + 1}`,
      playlistId: chapter.playlistId || null,
      total: Number(chapter.total) || chapter.videos?.length || 0,
      videos: Array.isArray(chapter.videos) ? chapter.videos : [],
    }))
  }

  if (Array.isArray(course.videos) && course.videos.length) {
    return [
      {
        id: course.playlistId || course.id || `chapter-${Date.now()}`,
        name: course.name || 'פרק 1',
        playlistId: course.playlistId || null,
        total: Number(course.total) || course.videos.length,
        videos: course.videos,
      },
    ]
  }

  return []
}

export const countBundleLessons = (course = {}) =>
  normalizeBundleChapters(course).reduce((sum, chapter) => sum + (chapter.videos?.length || 0), 0)

/**
 * Build extension import JSON.
 * version 2 = multi-chapter; still includes flattened lessons for older tooling.
 */
export const buildSchoolerImportPayload = (course, origin = null) => {
  const chaptersSource = normalizeBundleChapters(course)
  const chapters = chaptersSource.map((chapter, index) => ({
    order: index + 1,
    id: chapter.id,
    name: chapter.name,
    playlistId: chapter.playlistId,
    lessons: buildLessonsFromVideos(chapter.videos, origin),
  }))

  const flatLessons = chapters.flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({
      ...lesson,
      chapterOrder: chapter.order,
      chapterName: chapter.name,
    })),
  )

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    course: {
      id: course?.id || null,
      name: course?.name || 'קורס',
    },
    chapters,
    // Backward-compatible flat list (v1 importers ignore chapters).
    lessons: flatLessons.map((lesson, index) => ({
      order: index + 1,
      title: lesson.title,
      videoId: lesson.videoId,
      embedUrl: lesson.embedUrl,
      chapterOrder: lesson.chapterOrder,
      chapterName: lesson.chapterName,
    })),
  }
}

export const buildSchoolerImportFileName = (course) => {
  const raw = String(course?.id || course?.name || 'course')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80)
  return `schooler-course-${raw || 'course'}.json`
}
