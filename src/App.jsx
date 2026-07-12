import { useEffect, useState } from 'react'
import PlyrPlayer from './components/PlyrPlayer.jsx'
import ApiDashboard from './components/ApiDashboard.jsx'
import {
  buildHostedEmbedUrl,
} from './utils/plyrEmbed.js'
import {
  buildSchoolerImportFileName,
  buildSchoolerImportPayload,
  countBundleLessons,
  normalizeBundleChapters,
  resolveYoutubeLessonTitle,
  sortLessonsByAscendingNumber,
} from './utils/courseExport.js'
import { downloadTextFile } from './utils/downloads.js'
import {
  SUBTITLE_SOURCE_LANGUAGES,
  SUBTITLE_TARGET_LANGUAGES,
} from './constants/subtitleLanguages.js'
import { API_BASE, isGitHubPagesHost } from './config/api.js'
import { isCloudHostedApp, isLocalDevApp } from './utils/cloudHost.js'
import './App.css'

const apiBase = API_BASE

const SUBTITLE_LANGUAGES = SUBTITLE_SOURCE_LANGUAGES
const TRANSLATION_LANGUAGES = SUBTITLE_TARGET_LANGUAGES

const DEFAULT_SUBTITLE_SETTINGS = {
  sourceLang: 'auto',
  targetLang: 'he',
  format: 'vtt',
  showInPlayer: true,
  playerLang: 'he',
}

const loadSubtitleSettings = () => {
  try {
    const saved = localStorage.getItem('schooler-subtitle-settings')
    return saved ? { ...DEFAULT_SUBTITLE_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SUBTITLE_SETTINGS
  } catch {
    return DEFAULT_SUBTITLE_SETTINGS
  }
}


async function apiRequest(path, options = {}) {
  let response
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      credentials: 'include',
    })
  } catch {
    const ghPagesHint = isGitHubPagesHost()
      ? ' האתר ב-GitHub Pages דורש שרת API נפרד (הגדר VITE_API_BASE ב-GitHub Actions).'
      : isLocalDevApp()
        ? ' הרץ בטרמינל: npm run api (או npm start להרצה משולבת).'
        : ' שירות ה-API בענן לא מגיב — נסו לרענן בעוד דקה.'
    throw new Error(`לא ניתן להתחבר לשרת.${ghPagesHint}`)
  }

  let data = null
  const rawText = await response.text()
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    if (response.status === 404) {
      throw new Error(
        'הפעולה לא נמצאה בשרת. עצור והרץ מחדש: npm start (יש להפעיל מחדש אחרי עדכונים)',
      )
    }
    throw new Error(`תגובת שרת לא תקינה (HTTP ${response.status})`)
  }

  if (!response.ok) {
    throw new Error(data?.message || `HTTP ${response.status}`)
  }

  return data
}

function App() {
  const hostedWatchVideoId =
    typeof window !== 'undefined'
      ? window.location.pathname.match(/^\/watch\/([a-zA-Z0-9_-]{11})\/?$/)?.[1] || null
      : null
  const hostedEmbedVideoId =
    typeof window !== 'undefined'
      ? window.location.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})\/?$/)?.[1] || null
      : null
  const forceNativeEmbed =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('native') === '1'
      : false
  const hostedPlayerVideoId = hostedEmbedVideoId || hostedWatchVideoId
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''

  const [playlistUrl, setPlaylistUrl] = useState('')
  const [playlistResult, setPlaylistResult] = useState(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [playlistError, setPlaylistError] = useState('')
  const [copiedText, setCopiedText] = useState('')
  const [apiOnline, setApiOnline] = useState(null)
  const [activeEpisodeIndex, setActiveEpisodeIndex] = useState(0)
  const [subtitleSettings, setSubtitleSettings] = useState(loadSubtitleSettings)
  const [subtitleLoading, setSubtitleLoading] = useState(false)
  const [subtitleStatus, setSubtitleStatus] = useState('')
  const [view, setView] = useState('youtube')
  const [liveCaptionStatus, setLiveCaptionStatus] = useState(null)
  const [courseLibrary, setCourseLibrary] = useState([])
  const [courseNameInput, setCourseNameInput] = useState('')
  const [chapterNameInput, setChapterNameInput] = useState('')
  const [activeCourseId, setActiveCourseId] = useState(null)

  const activeEpisode = playlistResult?.videos?.[activeEpisodeIndex] ?? null
  const activeCourse = courseLibrary.find((course) => course.id === activeCourseId) || null
  const activeCourseChapters = activeCourse ? normalizeBundleChapters(activeCourse) : []

  useEffect(() => {
    setLiveCaptionStatus(null)
  }, [activeEpisode?.videoId])

  useEffect(() => {
    const checkApi = async () => {
      try {
        const data = await apiRequest('/health', { method: 'GET' })
        setApiOnline(data.features?.includes('youtube-subtitles') ? true : 'outdated')
      } catch {
        setApiOnline(false)
      }
    }
    checkApi()
  }, [])

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedText(`הועתק: ${label}`)
      setTimeout(() => setCopiedText(''), 2000)
    } catch {
      setCopiedText('לא הצלחתי להעתיק ללוח')
    }
  }

  const getEpisodeTitle = (video, fallbackIndex = 1) =>
    resolveYoutubeLessonTitle(video, Number(video?.index) || fallbackIndex)

  const isGenericEpisodeTitle = (title) => /^פרק\s*\d+$/u.test(String(title || '').trim())

  const refreshVideosTitles = async (videos) => {
    if (!Array.isArray(videos) || !videos.length) return videos
    const needsRefresh = videos.some(
      (video) => !video?.title || isGenericEpisodeTitle(video.title),
    )
    if (!needsRefresh) {
      // Still re-number/sort by title numbers for display consistency
      return sortLessonsByAscendingNumber(
        videos.map((video, index) => ({
          ...video,
          order: Number(video.index) || index + 1,
          title: getEpisodeTitle(video, index + 1),
        })),
      ).map((lesson, index) => {
        const source = videos.find((video) => video.videoId === lesson.videoId) || videos[index]
        return {
          ...source,
          index: index + 1,
          title: lesson.title,
          youtubeTitle: lesson.title,
          displayName: lesson.title,
        }
      })
    }

    const data = await apiRequest('/youtube/resolve-titles', {
      method: 'POST',
      body: JSON.stringify({ videoIds: videos.map((video) => video.videoId) }),
    })
    const titles = data.titles || {}
    const withTitles = videos.map((video, index) => {
      const resolved = titles[video.videoId] || getEpisodeTitle(video, index + 1)
      return {
        ...video,
        title: resolved,
        youtubeTitle: resolved,
        displayName: resolved,
      }
    })

    return sortLessonsByAscendingNumber(
      withTitles.map((video, index) => ({
        ...video,
        order: Number(video.index) || index + 1,
        title: video.title,
      })),
    ).map((lesson, index) => {
      const source = withTitles.find((video) => video.videoId === lesson.videoId) || withTitles[index]
      return {
        ...source,
        index: index + 1,
        title: lesson.title,
        youtubeTitle: lesson.title,
        displayName: lesson.title,
      }
    })
  }

  const extractPlaylist = async (event) => {
    event.preventDefault()
    setPlaylistLoading(true)
    setPlaylistError('')
    setPlaylistResult(null)
    try {
      const data = await apiRequest('/youtube/extract-playlist', {
        method: 'POST',
        body: JSON.stringify({ playlistUrl }),
      })
      const videos = await refreshVideosTitles(data.videos || [])
      setPlaylistResult({ ...data, videos, total: videos.length })
      setActiveEpisodeIndex(0)
    } catch (error) {
      setPlaylistError(error.message)
    } finally {
      setPlaylistLoading(false)
    }
  }

  useEffect(() => {
    localStorage.setItem('schooler-subtitle-settings', JSON.stringify(subtitleSettings))
  }, [subtitleSettings])

  useEffect(() => {
    if (!courseLibrary.length) {
      setActiveCourseId(null)
      return
    }
    if (!activeCourseId || !courseLibrary.some((course) => course.id === activeCourseId)) {
      setActiveCourseId(courseLibrary[0].id)
    }
  }, [courseLibrary, activeCourseId])

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const data = await apiRequest('/library/courses', { method: 'GET' })
        setCourseLibrary(Array.isArray(data.courses) ? data.courses : [])
      } catch (error) {
        setSubtitleStatus(error.message)
      }
    }
    loadCourses()
  }, [])

  const updateSubtitleSettings = (field, value) => {
    setSubtitleSettings((current) => ({ ...current, [field]: value }))
  }

  const downloadSubtitleForVideo = async (video) => {
    const data = await apiRequest('/youtube/subtitles', {
      method: 'POST',
      body: JSON.stringify({
        videoId: video.videoId,
        index: video.index,
        title: video.title,
        lang: subtitleSettings.sourceLang,
        tlang: subtitleSettings.targetLang,
        fmt: subtitleSettings.format,
      }),
    })
    downloadTextFile(data.content, data.fileName)
    return { fileName: data.fileName, status: data.status }
  }

  const downloadCurrentSubtitle = async () => {
    if (!activeEpisode) return
    setSubtitleLoading(true)
    setSubtitleStatus('')
    try {
      const result = await downloadSubtitleForVideo(activeEpisode)
      setSubtitleStatus(result.status?.message || `הורדה הושלמה: ${result.fileName}`)
    } catch (error) {
      setSubtitleStatus(error.message)
    } finally {
      setSubtitleLoading(false)
    }
  }

  const downloadAllSubtitles = async () => {
    if (!playlistResult?.videos?.length) return
    setSubtitleLoading(true)
    setSubtitleStatus('מוריד כתוביות...')
    let successCount = 0
    const failed = []

    try {
      for (const video of playlistResult.videos) {
        try {
          const result = await downloadSubtitleForVideo(video)
          successCount += 1
          setSubtitleStatus(
            result.status?.message ||
              `הורד ${result.fileName} (${successCount}/${playlistResult.videos.length})`,
          )
          await new Promise((resolve) => setTimeout(resolve, 150))
        } catch (error) {
          failed.push({
            name: video.displayName || `פרק ${video.index}`,
            message: error.message,
          })
        }
      }

      if (!successCount) {
        throw new Error('לא הורדו כתוביות. ייתכן שאין כתוביות זמינות לסרטונים בפלייליסט.')
      }

      setSubtitleStatus(
        `הורדו ${successCount} קבצי כתוביות` +
          (failed.length ? `, ${failed.length} פרקים נכשלו` : ''),
      )
    } catch (error) {
      setSubtitleStatus(error.message)
    } finally {
      setSubtitleLoading(false)
    }
  }

  const persistCourse = async (nextCourse) => {
    const data = await apiRequest('/library/courses', {
      method: 'POST',
      body: JSON.stringify(nextCourse),
    })
    const savedCourse = data.course
    setCourseLibrary((current) => {
      const exists = current.some((course) => course.id === savedCourse.id)
      if (exists) return current.map((course) => (course.id === savedCourse.id ? savedCourse : course))
      return [savedCourse, ...current]
    })
    setActiveCourseId(savedCourse.id)
    return savedCourse
  }

  /** Save extracted playlist as a chapter (optionally create a new course bundle). */
  const savePlaylistAsChapter = async ({ asNewBundle }) => {
    if (!playlistResult?.videos?.length) return

    const chapterName =
      chapterNameInput.trim() ||
      playlistResult.title ||
      `פרק ${playlistResult.playlistId || ''}`.trim() ||
      'פרק חדש'
    const videos = await refreshVideosTitles(playlistResult.videos)
    const chapter = {
      id: playlistResult.playlistId || `chapter-${Date.now()}`,
      name: chapterName,
      playlistId: playlistResult.playlistId || null,
      total: videos.length,
      videos,
    }

    try {
      let nextCourse
      if (asNewBundle || !activeCourse) {
        const bundleName = courseNameInput.trim() || chapterName
        nextCourse = {
          id: `bundle-${Date.now()}`,
          name: bundleName,
          playlistId: chapter.playlistId,
          total: videos.length,
          videos,
          chapters: [chapter],
        }
      } else {
        const existingChapters = normalizeBundleChapters(activeCourse)
        const samePlaylistIndex = existingChapters.findIndex(
          (item) => item.playlistId && chapter.playlistId && item.playlistId === chapter.playlistId,
        )
        const chapters =
          samePlaylistIndex >= 0
            ? existingChapters.map((item, index) => (index === samePlaylistIndex ? chapter : item))
            : [...existingChapters, chapter]
        const flatVideos = chapters.flatMap((item) => item.videos || [])
        nextCourse = {
          ...activeCourse,
          name: courseNameInput.trim() || activeCourse.name,
          playlistId: chapters[0]?.playlistId || activeCourse.playlistId || null,
          chapters,
          videos: flatVideos,
          total: flatVideos.length,
        }
      }

      await persistCourse(nextCourse)
      setChapterNameInput('')
      if (asNewBundle || !activeCourse) setCourseNameInput('')
      setCopiedText(
        asNewBundle || !activeCourse
          ? `נוצר קורס עם הפרק "${chapterName}"`
          : `הפרק "${chapterName}" נוסף לקורס`,
      )
      setTimeout(() => setCopiedText(''), 2500)
    } catch (error) {
      setSubtitleStatus(error.message)
    }
  }

  const loadCourseIntoPlayer = async (course, chapter = null) => {
    try {
      const chapters = normalizeBundleChapters(course)
      const sourceChapter = chapter || chapters[0] || null
      const sourceVideos = sourceChapter?.videos || course.videos || []
      const videos = await refreshVideosTitles(sourceVideos)
      setPlaylistResult({
        playlistId: sourceChapter?.playlistId || course.playlistId || course.id,
        total: videos.length,
        videos,
        title: sourceChapter?.name || course.name,
      })
      setActiveEpisodeIndex(0)
      setActiveCourseId(course.id)
      if (sourceChapter?.name) setChapterNameInput(sourceChapter.name)
      if (course.name) setCourseNameInput(course.name)

      const refreshedChapters = chapters.map((item) =>
        item.id === sourceChapter?.id ? { ...item, videos, total: videos.length } : item,
      )
      const titlesChanged = videos.some(
        (video, index) => video.title !== sourceVideos?.[index]?.title,
      )
      if (titlesChanged) {
        const flatVideos = refreshedChapters.flatMap((item) => item.videos || [])
        const nextCourse = {
          ...course,
          chapters: refreshedChapters,
          videos: flatVideos,
          total: flatVideos.length,
        }
        await persistCourse(nextCourse)
      }
    } catch (error) {
      setSubtitleStatus(error.message)
    }
  }

  const deleteCourse = async (courseId) => {
    try {
      await apiRequest(`/library/courses/${encodeURIComponent(courseId)}`, { method: 'DELETE' })
      setCourseLibrary((current) => current.filter((course) => course.id !== courseId))
    } catch (error) {
      setSubtitleStatus(error.message)
    }
  }

  const removeChapterFromCourse = async (course, chapterId) => {
    const chapters = normalizeBundleChapters(course).filter((chapter) => chapter.id !== chapterId)
    if (!chapters.length) {
      await deleteCourse(course.id)
      return
    }
    const flatVideos = chapters.flatMap((chapter) => chapter.videos || [])
    try {
      await persistCourse({
        ...course,
        chapters,
        videos: flatVideos,
        total: flatVideos.length,
        playlistId: chapters[0]?.playlistId || null,
      })
      setCopiedText('הפרק הוסר מהקורס')
      setTimeout(() => setCopiedText(''), 2000)
    } catch (error) {
      setSubtitleStatus(error.message)
    }
  }

  const exportCourseForExtension = async (course) => {
    const chapters = normalizeBundleChapters(course)
    if (!chapters.length) return
    try {
      const refreshedChapters = []
      for (const chapter of chapters) {
        const videos = await refreshVideosTitles(chapter.videos || [])
        refreshedChapters.push({ ...chapter, videos, total: videos.length })
      }
      const flatVideos = refreshedChapters.flatMap((chapter) => chapter.videos || [])
      const nextCourse = {
        ...course,
        chapters: refreshedChapters,
        videos: flatVideos,
        total: flatVideos.length,
      }
      const payload = buildSchoolerImportPayload(nextCourse, appOrigin)
      downloadTextFile(JSON.stringify(payload, null, 2), buildSchoolerImportFileName(course))
      setCopiedText(
        `יוצא JSON לתוסף · ${payload.chapters.length} פרקים · ${payload.lessons.length} שיעורים`,
      )
      setTimeout(() => setCopiedText(''), 2500)
      setCourseLibrary((current) =>
        current.map((item) => (item.id === course.id ? { ...item, ...nextCourse } : item)),
      )
      await persistCourse(nextCourse)
    } catch (error) {
      setSubtitleStatus(error.message)
    }
  }

  if (hostedPlayerVideoId) {
    return (
      <main className={`layout ${hostedEmbedVideoId ? 'layout--embed' : ''}`}>
        <section className={hostedEmbedVideoId ? 'embed-player-shell' : 'panel'}>
          {!hostedEmbedVideoId && <h2>צפייה דרך Schooler Course Studio</h2>}
          {hostedEmbedVideoId && forceNativeEmbed ? (
            <div className="embed-player-frame-wrap">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${hostedPlayerVideoId}?rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&autoplay=0&fs=1&controls=1&disablekb=0&cc_load_policy=1&enablejsapi=0`}
                title={`Video ${hostedPlayerVideoId}`}
                className="embed-player-frame"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="origin-when-cross-origin"
              />
            </div>
          ) : (
            <PlyrPlayer
              videoId={hostedPlayerVideoId}
              title={`Video ${hostedPlayerVideoId}`}
              autoPlay={hostedEmbedVideoId}
              showCaptionStatusBar={!hostedEmbedVideoId}
              showCaptions={!hostedEmbedVideoId}
              captionLang={hostedEmbedVideoId ? 'none' : 'he'}
              sourceLang="auto"
              targetLang={hostedEmbedVideoId ? 'none' : 'he'}
              format="vtt"
              onCaptionStatusChange={setLiveCaptionStatus}
            />
          )}
          {!hostedEmbedVideoId && liveCaptionStatus?.message && (
            <p className={`note caption-live-status caption-live-status--${liveCaptionStatus.state}`}>
              {liveCaptionStatus.message}
            </p>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className={`layout ${view === 'youtube' ? 'layout--split' : 'layout--dashboard'}`}>
      <header className="layout-header">
        <div className="row">
          <div>
            <h1>Schooler Course Studio</h1>
            <p>
              {view === 'youtube'
                ? 'יוטיוב · Plyr · כתוביות'
                : 'דשבורד ביצוע פעולות Schooler ורב מסר'}
            </p>
          </div>
          <nav className="dash-tabs dash-tabs--main app-view-tabs">
            <button
              type="button"
              className={view === 'youtube' ? 'active' : ''}
              onClick={() => setView('youtube')}
            >
              כלים
            </button>
            <button
              type="button"
              className={view === 'api' ? 'active' : ''}
              onClick={() => setView('api')}
            >
              דשבורד API
            </button>
          </nav>
        </div>
      </header>

      {view === 'api' ? (
        <ApiDashboard playlistVideos={playlistResult?.videos || []} />
      ) : (
      <div className="split-columns">
        <section className="column column--youtube">
          <section className="panel">
            <h2>דשבורד יוטיוב קורסים</h2>
          <p>הדבק פלייליסט, צפה בפרקים דרך נגן Plyr, והעתק קוד embed ל-Schooler.</p>
          {apiOnline === false && isLocalDevApp() && (
            <p className="error">
              השרת המקומי לא פעיל. הרץ בטרמינל: <code>npm run api</code> או <code>npm start</code>
            </p>
          )}
          {apiOnline === false && !isLocalDevApp() && (
            <p className="error">
              שירות ה-API בענן לא זמין כרגע. נסו לרענן את הדף בעוד דקה.
            </p>
          )}
          {apiOnline === 'outdated' && (
            <p className="error">
              {isCloudHostedApp()
                ? 'הפריסה בענן מיושנת — המתן לסיום build ב-Vercel ורענן.'
                : 'השרת פועל בגרסה ישנה. עצור והרץ מחדש: npm start'}
            </p>
          )}
          {apiOnline === true && (
            <p className="ok">
              {isCloudHostedApp()
                ? 'שירות API בענן מחובר (כולל כתוביות)'
                : 'שרת מקומי מחובר ומוכן (כולל כתוביות)'}
            </p>
          )}

          <section className="settings-box grid">
            <h3>הגדרות כתוביות</h3>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={subtitleSettings.showInPlayer}
                onChange={(e) => updateSubtitleSettings('showInPlayer', e.target.checked)}
              />
              הפעל כתוביות בתוך נגן Plyr
            </label>
            <label>
              שפת כתוביות בנגן
              <select
                value={subtitleSettings.playerLang}
                onChange={(e) => updateSubtitleSettings('playerLang', e.target.value)}
                disabled={!subtitleSettings.showInPlayer}
              >
                {TRANSLATION_LANGUAGES.filter((lang) => lang.value !== 'none').map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
                <option value="auto">אוטומטי</option>
              </select>
            </label>
            <label>
              שפת מקור (להורדה)
              <select
                value={subtitleSettings.sourceLang}
                onChange={(e) => updateSubtitleSettings('sourceLang', e.target.value)}
              >
                {SUBTITLE_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              תרגום אוטומטי ל (להורדה)
              <select
                value={subtitleSettings.targetLang}
                onChange={(e) => updateSubtitleSettings('targetLang', e.target.value)}
              >
                {TRANSLATION_LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              פורמט קובץ
              <select
                value={subtitleSettings.format}
                onChange={(e) => updateSubtitleSettings('format', e.target.value)}
              >
                <option value="vtt">VTT</option>
                <option value="srt">SRT</option>
              </select>
            </label>
            {playlistResult?.videos?.length ? (
              <div className="actions">
                <button type="button" disabled={subtitleLoading} onClick={downloadCurrentSubtitle}>
                  הורד כתוביות לפרק הנוכחי
                </button>
                <button type="button" disabled={subtitleLoading} onClick={downloadAllSubtitles}>
                  הורד כתוביות לכל הפלייליסט
                </button>
              </div>
            ) : null}
            {subtitleStatus && <p className="note">{subtitleStatus}</p>}
            {liveCaptionStatus?.message && (
              <p className={`note caption-live-status caption-live-status--${liveCaptionStatus.state}`}>
                מעקב נגן: {liveCaptionStatus.message}
              </p>
            )}
            <p className="note">
              כתוביות, מהירות ואיכות וידאו נמצאים בתפריט ההגדרות (⚙) של הנגן.
            </p>
          </section>

          <form onSubmit={extractPlaylist} className="grid playlist-box">
            <label>
              קישור פלייליסט מהערוץ שלך
              <input
                placeholder="https://www.youtube.com/playlist?list=..."
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={playlistLoading}>
              {playlistLoading ? 'מחלץ פרקים...' : 'חלץ פלייליסט והצג בנגן Plyr'}
            </button>
            {playlistError && <p className="error">{playlistError}</p>}
            {copiedText && <p className="ok">{copiedText}</p>}
            {playlistResult?.videos?.length ? (
              <section className="settings-box grid course-save-box">
                <h3>שמירה כפרק בקורס</h3>
                <p className="note">
                  כל פלייליסט = פרק אחד. אפשר לבנות קורס עם כמה פרקים ואז לייצא JSON אחד לתוסף.
                </p>
                <label>
                  שם הפרק
                  <input
                    placeholder={playlistResult.title || 'לדוגמה: מבוא לבינה מלאכותית'}
                    value={chapterNameInput}
                    onChange={(e) => setChapterNameInput(e.target.value)}
                  />
                </label>
                <label>
                  שם הקורס (חבילת פרקים)
                  <input
                    placeholder={
                      activeCourse?.name || 'לדוגמה: קורס בינה מלאכותית מלא'
                    }
                    value={courseNameInput}
                    onChange={(e) => setCourseNameInput(e.target.value)}
                  />
                </label>
                {courseLibrary.length ? (
                  <label>
                    קורס קיים להוספת הפרק
                    <select
                      value={activeCourseId || ''}
                      onChange={(e) => setActiveCourseId(e.target.value || null)}
                    >
                      <option value="">— בחר קורס —</option>
                      {courseLibrary.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} ({normalizeBundleChapters(course).length} פרקים)
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="actions">
                  <button type="button" onClick={() => savePlaylistAsChapter({ asNewBundle: true })}>
                    צור קורס חדש עם הפרק הזה
                  </button>
                  <button
                    type="button"
                    disabled={!activeCourse}
                    onClick={() => savePlaylistAsChapter({ asNewBundle: false })}
                  >
                    הוסף פרק לקורס הנבחר
                  </button>
                </div>
                <p className="note">
                  אם אותו פלייליסט כבר קיים בקורס — הפרק יעודכן במקום ליצור כפילות.
                </p>
              </section>
            ) : null}
            {playlistResult?.videos?.length ? (
              <div className="playlist-results">
                <div className="row">
                  <p>
                    נמצאו {playlistResult.total} פרקים בפלייליסט {playlistResult.playlistId}
                  </p>
                </div>

                {activeEpisode && (
                  <section className="course-player">
                    <h3>{getEpisodeTitle(activeEpisode)}</h3>
                    <PlyrPlayer
                      videoId={activeEpisode.videoId}
                      title={activeEpisode.title}
                      episodeIndex={activeEpisode.index}
              autoPlay={false}
                      showCaptions={subtitleSettings.showInPlayer}
                      captionLang={subtitleSettings.playerLang}
                      sourceLang={subtitleSettings.sourceLang}
                      targetLang={subtitleSettings.targetLang}
                      format={subtitleSettings.format}
                      onCaptionStatusChange={setLiveCaptionStatus}
                    />
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() =>
                          copyText(
                            buildHostedEmbedUrl(activeEpisode.videoId, appOrigin),
                            `קישור הטמעה לדף לימודים · פרק ${activeEpisode.index}`,
                          )
                        }
                      >
                        העתק קישור הטמעה לדף לימודים (פרק נוכחי)
                      </button>
                    </div>
                  </section>
                )}

                <p className="note">
                  הדבק בשדה ההטמעה של Schooler את קישור ההטמעה (ולא קוד iframe מלא).
                </p>

                <ul className="episode-list">
                  {playlistResult.videos.map((video, index) => (
                    <li
                      key={video.videoId}
                      className={index === activeEpisodeIndex ? 'episode-item active' : 'episode-item'}
                    >
                      <button
                        type="button"
                        className="episode-play"
                        onClick={() => setActiveEpisodeIndex(index)}
                      >
                        {getEpisodeTitle(video, index + 1)}
                      </button>
                      <p className="episode-file">
                        קובץ: {video.fileName}.{subtitleSettings.format}
                      </p>
                      <div className="actions">
                        <button
                          type="button"
                          disabled={subtitleLoading}
                          onClick={async () => {
                            setSubtitleLoading(true)
                            setSubtitleStatus('')
                            try {
                              const result = await downloadSubtitleForVideo(video)
                              setSubtitleStatus(result.status?.message || `הורדה הושלמה: ${result.fileName}`)
                            } catch (error) {
                              setSubtitleStatus(error.message)
                            } finally {
                              setSubtitleLoading(false)
                            }
                          }}
                        >
                          הורד כתוביות
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </form>

          <section className="settings-box grid course-library-box">
            <h3>ספריית קורסים במערכת שלנו</h3>
            {!courseLibrary.length ? (
              <p className="note">
                עדיין אין קורסים שמורים. חלץ פלייליסט, תן שם לפרק ושמור אותו כקורס חדש או הוסף לקורס קיים.
              </p>
            ) : (
              <>
                <div className="course-library-list">
                  {courseLibrary.map((course) => {
                    const chapters = normalizeBundleChapters(course)
                    const lessonCount = countBundleLessons(course)
                    return (
                      <div
                        key={course.id}
                        className={`course-library-item ${course.id === activeCourseId ? 'active' : ''}`}
                      >
                        <div>
                          <strong>{course.name}</strong>
                          <p className="note">
                            {chapters.length} פרקים · {lessonCount} שיעורים · מזהה: {course.id}
                          </p>
                        </div>
                        <div className="actions">
                          <button type="button" onClick={() => loadCourseIntoPlayer(course)}>
                            טען פרק ראשון לנגן
                          </button>
                          <button type="button" onClick={() => setActiveCourseId(course.id)}>
                            נהל פרקים
                          </button>
                          <button type="button" onClick={() => exportCourseForExtension(course)}>
                            ייצא לתוסף Schooler
                          </button>
                          <button type="button" onClick={() => deleteCourse(course.id)}>
                            מחק קורס
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {activeCourseChapters.length ? (
                  <div className="course-links-grid">
                    <h4>פרקים בקורס · {activeCourse.name}</h4>
                    <p className="note">
                      ייצוא JSON אחד כולל את כל הפרקים. בתוסף: לכל פרק נוצר «פרק חדש» ב-Schooler ואז השיעורים שבו.
                    </p>
                    <div className="actions">
                      <button type="button" onClick={() => exportCourseForExtension(activeCourse)}>
                        ייצא לתוסף Schooler
                      </button>
                    </div>
                    <ul className="chapter-list">
                      {activeCourseChapters.map((chapter, chapterIndex) => (
                        <li key={chapter.id} className="chapter-item">
                          <div className="chapter-item-head">
                            <strong>
                              פרק {chapterIndex + 1}: {chapter.name}
                            </strong>
                            <p className="note">{chapter.videos?.length || 0} שיעורים</p>
                          </div>
                          <div className="actions">
                            <button
                              type="button"
                              onClick={() => loadCourseIntoPlayer(activeCourse, chapter)}
                            >
                              טען לנגן
                            </button>
                            <button
                              type="button"
                              onClick={() => removeChapterFromCourse(activeCourse, chapter.id)}
                            >
                              הסר פרק
                            </button>
                          </div>
                          <ul className="episode-list">
                            {(chapter.videos || []).map((video) => (
                              <li
                                key={`${chapter.id}-${video.videoId}`}
                                className="episode-item"
                              >
                                <p>{getEpisodeTitle(video)}</p>
                                <div className="actions">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyText(
                                        buildHostedEmbedUrl(video.videoId, appOrigin),
                                        `קישור הטמעה קבוע · ${getEpisodeTitle(video)}`,
                                      )
                                    }
                                  >
                                    העתק קישור הטמעה
                                  </button>
                                </div>
                                <code className="code-line">
                                  {buildHostedEmbedUrl(video.videoId, appOrigin)}
                                </code>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </section>
          </section>
        </section>
      </div>
      )}
    </main>
  )
}

export default App
