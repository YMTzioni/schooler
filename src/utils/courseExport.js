import { buildHostedEmbedUrl } from './plyrEmbed.js'

export const buildSchoolerImportPayload = (course, origin = null) => {
  const videos = Array.isArray(course?.videos) ? course.videos : []
  const lessons = videos.map((video, index) => {
    const order = Number(video.index) || index + 1
    const title = video.displayName || `פרק ${order}: ${video.title || `שיעור ${order}`}`
    return {
      order,
      title,
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
