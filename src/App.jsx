import { useEffect, useState } from 'react'
import PlyrPlayer from './components/PlyrPlayer.jsx'
import ApiDashboard from './components/ApiDashboard.jsx'
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
  const [showChapterForm, setShowChapterForm] = useState(true)
  const [courseSaving, setCourseSaving] = useState(false)

  const activeEpisode = playlistResult?.videos?.[activeEpisodeIndex] ?? null
  const activeCourse = courseLibrary.find((course) => course.id === activeCourseId) || null
  const activeCourseChapters = activeCourse ? normalizeBundleChapters(activeCourse) : []
  const draftLessonCount = playlistResult?.videos?.length || 0

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

  const resetChapterDraft = () => {
    setChapterNameInput('')
    setPlaylistUrl('')
    setPlaylistResult(null)
    setPlaylistError('')
    setActiveEpisodeIndex(0)
    setShowChapterForm(true)
  }

  /** Step 1: create an empty named course, then add chapters. */
  const createCourse = async (event) => {
    event?.preventDefault?.()
    const name = courseNameInput.trim()
    if (!name) {
      setCopiedText('')
      setSubtitleStatus('יש לבחור שם לקורס')
      return
    }
    setCourseSaving(true)
    setSubtitleStatus('')
    try {
      const nextCourse = {
        id: `bundle-${Date.now()}`,
        name,
        playlistId: null,
        total: 0,
        videos: [],
        chapters: [],
      }
      await persistCourse(nextCourse)
      resetChapterDraft()
      setCopiedText(`הקורס "${name}" נוצר — אפשר להוסיף פרק`)
      setTimeout(() => setCopiedText(''), 2500)
    } catch (error) {
      setSubtitleStatus(error.message)
    } finally {
      setCourseSaving(false)
    }
  }

  const selectExistingCourse = (courseId) => {
    setActiveCourseId(courseId || null)
    const course = courseLibrary.find((item) => item.id === courseId)
    if (course) setCourseNameInput(course.name)
    resetChapterDraft()
  }

  const startAddingAnotherChapter = () => {
    resetChapterDraft()
    setCopiedText('מלא שם פרק וקישור פלייליסט')
    setTimeout(() => setCopiedText(''), 2000)
  }

  /** Step 2–3: attach playlist as a named chapter on the active course. */
  const saveChapterToActiveCourse = async () => {
    if (!activeCourse) {
      setSubtitleStatus('קודם צריך ליצור או לבחור קורס')
      return
    }
    if (!playlistResult?.videos?.length) {
      setSubtitleStatus('קודם חלץ פלייליסט כדי לראות את השיעורים')
      return
    }
    const chapterName = chapterNameInput.trim()
    if (!chapterName) {
      setSubtitleStatus('יש לבחור שם לפרק')
      return
    }

    setCourseSaving(true)
    setSubtitleStatus('')
    try {
      const videos = await refreshVideosTitles(playlistResult.videos)
      const chapter = {
        id: playlistResult.playlistId || `chapter-${Date.now()}`,
        name: chapterName,
        playlistId: playlistResult.playlistId || null,
        total: videos.length,
        videos,
      }
      const existingChapters = normalizeBundleChapters(activeCourse)
      const samePlaylistIndex = existingChapters.findIndex(
        (item) => item.playlistId && chapter.playlistId && item.playlistId === chapter.playlistId,
      )
      const chapters =
        samePlaylistIndex >= 0
          ? existingChapters.map((item, index) => (index === samePlaylistIndex ? chapter : item))
          : [...existingChapters, chapter]
      const flatVideos = chapters.flatMap((item) => item.videos || [])
      await persistCourse({
        ...activeCourse,
        playlistId: chapters[0]?.playlistId || activeCourse.playlistId || null,
        chapters,
        videos: flatVideos,
        total: flatVideos.length,
      })
      setCopiedText(`הפרק "${chapterName}" נשמר בקורס (${videos.length} שיעורים)`)
      setTimeout(() => setCopiedText(''), 2500)
      setShowChapterForm(false)
      setPlaylistResult(null)
      setPlaylistUrl('')
      setChapterNameInput('')
      setPlaylistError('')
    } catch (error) {
      setSubtitleStatus(error.message)
    } finally {
      setCourseSaving(false)
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
      setShowChapterForm(false)

      const refreshedChapters = chapters.map((item) =>
        item.id === sourceChapter?.id ? { ...item, videos, total: videos.length } : item,
      )
      const titlesChanged = videos.some(
        (video, index) => video.title !== sourceVideos?.[index]?.title,
      )
      if (titlesChanged) {
        const flatVideos = refreshedChapters.flatMap((item) => item.videos || [])
        await persistCourse({
          ...course,
          chapters: refreshedChapters,
          videos: flatVideos,
          total: flatVideos.length,
        })
      }
    } catch (error) {
      setSubtitleStatus(error.message)
    }
  }

  const deleteCourse = async (courseId) => {
    try {
      await apiRequest(`/library/courses/${encodeURIComponent(courseId)}`, { method: 'DELETE' })
      setCourseLibrary((current) => current.filter((course) => course.id !== courseId))
      if (activeCourseId === courseId) {
        setActiveCourseId(null)
        resetChapterDraft()
        setCourseNameInput('')
      }
    } catch (error) {
      setSubtitleStatus(error.message)
    }
  }

  const removeChapterFromCourse = async (course, chapterId) => {
    const chapters = normalizeBundleChapters(course).filter((chapter) => chapter.id !== chapterId)
    if (!chapters.length) {
      await persistCourse({
        ...course,
        chapters: [],
        videos: [],
        total: 0,
        playlistId: null,
      })
      setCopiedText('הפרק הוסר — הקורס ריק מפרקים')
      setTimeout(() => setCopiedText(''), 2000)
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
    if (!chapters.length) {
      setSubtitleStatus('אין פרקים לייצוא — הוסף לפחות פרק אחד')
      return
    }
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
            <h2>בניית קורס לייצוא</h2>
            <p>צור קורס → הוסף פרקים מפלייליסטים → ייצא JSON לתוסף Schooler.</p>
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
          {copiedText && <p className="ok">{copiedText}</p>}
          {subtitleStatus && <p className="note">{subtitleStatus}</p>}

          {!activeCourse ? (
            <section className="settings-box grid course-builder-step">
              <h3>1. יצירת קורס</h3>
              <p className="note">בחר שם לקורס. אחר כך תוכל להוסיף פרקים (כל פרק = פלייליסט).</p>
              <form onSubmit={createCourse} className="grid">
                <label>
                  שם הקורס
                  <input
                    placeholder="לדוגמה: בינה מלאכותית AI"
                    value={courseNameInput}
                    onChange={(e) => setCourseNameInput(e.target.value)}
                    required
                  />
                </label>
                <div className="actions">
                  <button type="submit" disabled={courseSaving || !courseNameInput.trim()}>
                    {courseSaving ? 'יוצר…' : 'צור קורס'}
                  </button>
                </div>
              </form>
              {courseLibrary.length ? (
                <label>
                  או המשך קורס קיים
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) selectExistingCourse(e.target.value)
                    }}
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
            </section>
          ) : (
            <section className="settings-box grid course-builder-step">
              <div className="course-builder-head">
                <div>
                  <h3>קורס: {activeCourse.name}</h3>
                  <p className="note">
                    {activeCourseChapters.length} פרקים · {countBundleLessons(activeCourse)} שיעורים
                  </p>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setActiveCourseId(null)
                      setCourseNameInput('')
                      resetChapterDraft()
                    }}
                  >
                    קורס חדש
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => deleteCourse(activeCourse.id)}>
                    מחק קורס
                  </button>
                </div>
              </div>

              {activeCourseChapters.length ? (
                <div className="course-chapters-preview">
                  <h4>פרקים בקורס</h4>
                  <ul className="chapter-list">
                    {activeCourseChapters.map((chapter, chapterIndex) => (
                      <li key={chapter.id} className="chapter-item">
                        <div className="chapter-item-head">
                          <strong>
                            פרק {chapterIndex + 1}: {chapter.name}
                          </strong>
                          <p className="note">{chapter.videos?.length || 0} שיעורים</p>
                        </div>
                        <ul className="lesson-preview-list">
                          {(chapter.videos || []).map((video, index) => (
                            <li key={`${chapter.id}-${video.videoId}`}>
                              {index + 1}. {getEpisodeTitle(video, index + 1)}
                            </li>
                          ))}
                        </ul>
                        <div className="actions">
                          <button
                            type="button"
                            onClick={() => loadCourseIntoPlayer(activeCourse, chapter)}
                          >
                            הצג בנגן
                          </button>
                          <button
                            type="button"
                            onClick={() => removeChapterFromCourse(activeCourse, chapter.id)}
                          >
                            הסר פרק
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="note">עדיין אין פרקים. הוסף את הפרק הראשון למטה.</p>
              )}

              {showChapterForm ? (
                <div className="grid chapter-add-form">
                  <h4>
                    {activeCourseChapters.length ? 'הוספת פרק נוסף' : '2. יצירת פרק'}
                  </h4>
                  <label>
                    שם הפרק
                    <input
                      placeholder="לדוגמה: שיעור 1 · מבוא"
                      value={chapterNameInput}
                      onChange={(e) => setChapterNameInput(e.target.value)}
                    />
                  </label>
                  <form onSubmit={extractPlaylist} className="grid">
                    <label>
                      קישור פלייליסט (השיעורים של הפרק)
                      <input
                        placeholder="https://www.youtube.com/playlist?list=..."
                        value={playlistUrl}
                        onChange={(e) => setPlaylistUrl(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" disabled={playlistLoading || !playlistUrl.trim()}>
                      {playlistLoading ? 'מחלץ שיעורים…' : 'חלץ והצג שיעורים בפרק'}
                    </button>
                  </form>
                  {playlistError && <p className="error">{playlistError}</p>}

                  {draftLessonCount ? (
                    <div className="chapter-draft-preview">
                      <h4>
                        שיעורים שיתווספו לפרק
                        {chapterNameInput.trim() ? ` "${chapterNameInput.trim()}"` : ''}
                      </h4>
                      <p className="note">
                        נמצאו {draftLessonCount} שיעורים בפלייליסט {playlistResult.playlistId}
                      </p>
                      <ul className="lesson-preview-list">
                        {playlistResult.videos.map((video, index) => (
                          <li key={video.videoId}>
                            {index + 1}. {getEpisodeTitle(video, index + 1)}
                          </li>
                        ))}
                      </ul>
                      <div className="actions">
                        <button
                          type="button"
                          disabled={courseSaving || !chapterNameInput.trim()}
                          onClick={saveChapterToActiveCourse}
                        >
                          {courseSaving ? 'שומר…' : 'שמור פרק בקורס'}
                        </button>
                      </div>
                      {!chapterNameInput.trim() && (
                        <p className="note">יש למלא שם לפרק לפני השמירה.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="actions">
                  <button type="button" onClick={startAddingAnotherChapter}>
                    יצירת פרק נוסף בקורס
                  </button>
                </div>
              )}

              {activeCourseChapters.length ? (
                <div className="course-export-box grid">
                  <h4>3. ייצוא</h4>
                  <p className="note">
                    קובץ JSON אחד עם כל הפרקים והשיעורים — לטעינה בתוסף Schooler.
                  </p>
                  <div className="actions">
                    <button type="button" onClick={() => exportCourseForExtension(activeCourse)}>
                      ייצא ל-JSON
                    </button>
                  </div>
                </div>
              ) : null}

              {courseLibrary.length > 1 ? (
                <label>
                  מעבר לקורס אחר
                  <select
                    value={activeCourseId || ''}
                    onChange={(e) => selectExistingCourse(e.target.value)}
                  >
                    {courseLibrary.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name} ({normalizeBundleChapters(course).length} פרקים)
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>
          )}

          {playlistResult?.videos?.length ? (
            <section className="playlist-results course-player-box">
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
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </section>
          ) : null}

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
                  הורד כתוביות לשיעור הנוכחי
                </button>
                <button type="button" disabled={subtitleLoading} onClick={downloadAllSubtitles}>
                  הורד כתוביות לכל הפלייליסט
                </button>
              </div>
            ) : null}
            {liveCaptionStatus?.message && (
              <p className={`note caption-live-status caption-live-status--${liveCaptionStatus.state}`}>
                מעקב נגן: {liveCaptionStatus.message}
              </p>
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
