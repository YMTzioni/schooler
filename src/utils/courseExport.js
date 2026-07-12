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

export const buildSchoolerImportPayload = (course, origin = null) => {
  const videos = Array.isArray(course?.videos) ? course.videos : []
  const lessons = videos.map((video, index) => {
    const order = Number(video.index) || index + 1
    return {
      order,
      title: resolveYoutubeLessonTitle(video, order),
      videoId: video.videoId,
      embedUrl: buildHostedEmbedUrl(video.videoId, origin),
    }
  })

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
