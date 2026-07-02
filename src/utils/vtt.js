const parseVttTime = (value) => {
  const clean = value.trim().split(/\s+/)[0].replace(',', '.')
  const parts = clean.split(':').map(Number)
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return parts[0] * 60 + parts[1]
}

const decodeCueText = (text) =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()

export const parseVtt = (vtt) => {
  const cues = []
  const blocks = vtt.replace(/\r/g, '').split(/\n\n+/)

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || trimmed.startsWith('WEBVTT') || trimmed.startsWith('NOTE')) continue

    const lines = trimmed.split('\n')
    const timeLine = lines.find((line) => line.includes('-->'))
    if (!timeLine) continue

    const [startRaw, endRaw] = timeLine.split('-->')
    const text = decodeCueText(
      lines
        .filter((line) => line !== timeLine && !/^\d+$/.test(line.trim()))
        .join('\n'),
    )

    if (!text) continue

    cues.push({
      start: parseVttTime(startRaw),
      end: parseVttTime(endRaw),
      text,
    })
  }

  return cues
}

export const getActiveCue = (cues, currentTime) =>
  cues.find((cue) => currentTime >= cue.start && currentTime < cue.end)
