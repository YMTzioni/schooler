export const formatEpisodeName = (index, title) => `פרק ${index}: ${title}`

export const sanitizeFileName = (name) =>
  name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()

export const buildEpisodeFileName = (index, title, extension) =>
  sanitizeFileName(`${formatEpisodeName(index, title)}.${extension}`)
