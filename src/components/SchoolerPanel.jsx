import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildPlyrEmbedCode } from '../utils/plyrEmbed.js'
import { extractYouTubeVideoId } from '../../lib/schoolerApi.js'
import {
  getSchoolerAuthConfig,
  getSchoolerAuthStatus,
  getSchoolerCourseLessons,
  listSchoolerCourses,
  loginSchooler,
  loginSchoolerFromEnv,
  logoutSchooler,
  proxySchoolerRequest,
  refreshSchoolerToken,
} from '../utils/schoolerClient.js'

const AUTH_STORAGE_KEY = 'schooler-auth-form-v1'

const loadSavedAuth = () => {
  try {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY)
    return saved
      ? JSON.parse(saved)
      : { userId: '', userSecret: '' }
  } catch {
    return { userId: '', userSecret: '' }
  }
}

function LessonRow({ lesson, onCopyEmbed }) {
  const videoId = extractYouTubeVideoId(lesson.lesson_content_link)
  const isEmbed = lesson.type_of_lesson === 'embed' || lesson.type_of_lesson === 'video'

  return (
    <tr>
      <td>{lesson.lesson_name}</td>
      <td>{lesson.type_of_lesson}</td>
      <td className="schooler-lesson-link">
        {lesson.lesson_content_link ? (
          <a href={lesson.lesson_content_link} target="_blank" rel="noreferrer">
            {videoId ? `YouTube ${videoId}` : 'קישור'}
          </a>
        ) : (
          '—'
        )}
      </td>
      <td>
        {videoId && isEmbed ? (
          <button type="button" className="schooler-btn-sm" onClick={() => onCopyEmbed(lesson, videoId)}>
            העתק Plyr
          </button>
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}

export default function SchoolerPanel({ onCopy, playlistVideos = [] }) {
  const [authStatus, setAuthStatus] = useState({ loading: true, loggedIn: false })
  const [envConfig, setEnvConfig] = useState({ envReady: false })
  const [authForm, setAuthForm] = useState(loadSavedAuth)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [courses, setCourses] = useState([])
  const [coursesLoading, setCoursesLoading] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [lessons, setLessons] = useState(null)
  const [lessonsLoading, setLessonsLoading] = useState(false)

  const [apiOutput, setApiOutput] = useState(null)
  const [apiError, setApiError] = useState('')
  const [apiLoading, setApiLoading] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getSchoolerAuthStatus()
      setAuthStatus({ loading: false, ...status })
    } catch {
      setAuthStatus({ loading: false, loggedIn: false })
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    getSchoolerAuthConfig()
      .then(setEnvConfig)
      .catch(() => setEnvConfig({ envReady: false }))
  }, [refreshStatus])

  const persistAuthForm = (next) => {
    setAuthForm(next)
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      await loginSchooler(authForm)
      await refreshStatus()
      persistAuthForm(authForm)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleEnvLogin = async () => {
    setAuthLoading(true)
    setAuthError('')
    try {
      await loginSchoolerFromEnv()
      await refreshStatus()
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await logoutSchooler()
    setCourses([])
    setLessons(null)
    setSelectedCourseId('')
    setAuthStatus({ loading: false, loggedIn: false })
  }

  const loadCourses = async () => {
    setCoursesLoading(true)
    setApiError('')
    try {
      const data = await listSchoolerCourses({ per_page: 50 })
      const list = data?.data || []
      setCourses(list)
      setApiOutput({ action: 'courses', data })
      if (list.length && !selectedCourseId) {
        const firstId = String(list[0].id || list[0].course_id)
        setSelectedCourseId(firstId)
      }
    } catch (error) {
      setApiError(error.message)
    } finally {
      setCoursesLoading(false)
    }
  }

  const loadLessons = useCallback(async (courseId) => {
    if (!courseId) return
    setLessonsLoading(true)
    setApiError('')
    try {
      const data = await getSchoolerCourseLessons(courseId, { per_page: 100 })
      setLessons(data?.data || data)
      setApiOutput({ action: 'lessons', courseId, data })
    } catch (error) {
      setApiError(error.message)
      setLessons(null)
    } finally {
      setLessonsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authStatus.loggedIn) return
    loadCourses()
  }, [authStatus.loggedIn])

  useEffect(() => {
    if (!selectedCourseId || !authStatus.loggedIn) return
    loadLessons(selectedCourseId)
  }, [selectedCourseId, authStatus.loggedIn, loadLessons])

  const lessonItems = useMemo(() => {
    if (!lessons) return []
    if (Array.isArray(lessons.lessons)) return lessons.lessons
    if (Array.isArray(lessons)) return lessons
    return []
  }, [lessons])

  const playlistByVideoId = useMemo(() => {
    const map = new Map()
    playlistVideos.forEach((video) => {
      if (video?.videoId) map.set(video.videoId, video)
    })
    return map
  }, [playlistVideos])

  const matchedLessons = useMemo(
    () =>
      lessonItems.filter((lesson) => {
        const videoId = extractYouTubeVideoId(lesson.lesson_content_link)
        return videoId && playlistByVideoId.has(videoId)
      }),
    [lessonItems, playlistByVideoId],
  )

  const copyEmbedForLesson = (lesson, videoId) => {
    const code = buildPlyrEmbedCode(videoId, lesson.lesson_name || 'שיעור')
    onCopy?.(code, `Plyr לשיעור ${lesson.lesson_name}`)
  }

  const runProxy = async ({ method, path, query = {}, body = {} }) => {
    setApiLoading(true)
    setApiError('')
    try {
      const data = await proxySchoolerRequest({ method, path, query, body })
      setApiOutput({ action: `${method} ${path}`, data })
    } catch (error) {
      setApiError(error.message)
    } finally {
      setApiLoading(false)
    }
  }

  if (authStatus.loading) {
    return (
      <section className="panel schooler-panel">
        <h2>Schooler API</h2>
        <p className="note">טוען חיבור…</p>
      </section>
    )
  }

  if (!authStatus.loggedIn) {
    return (
      <section className="panel schooler-panel">
        <h2>Schooler API</h2>
        <p className="note">
          התחברות עם אימייל Schooler ומפתח API לפי{' '}
          <a href="https://app.swaggerhub.com/apis/Responder/SchoolerAPI/1.0.0" target="_blank" rel="noreferrer">
            תיעוד Schooler API
          </a>
          .
        </p>

        {envConfig.envReady && (
          <div className="schooler-env-banner">
            <p>משתני סביבה מוגדרים בשרת ({envConfig.userId})</p>
            <button type="button" disabled={authLoading} onClick={handleEnvLogin}>
              התחבר מהשרת (.env)
            </button>
          </div>
        )}

        <form onSubmit={handleLogin} className="grid schooler-login">
          <label>
            אימייל (User ID)
            <input
              value={authForm.userId}
              onChange={(e) => persistAuthForm({ ...authForm, userId: e.target.value })}
              required
              autoComplete="username"
              placeholder="support@successcollege.co.il"
            />
          </label>
          <label>
            מפתח API (User Secret)
            <input
              type="password"
              value={authForm.userSecret}
              onChange={(e) => persistAuthForm({ ...authForm, userSecret: e.target.value })}
              required
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={authLoading}>
            {authLoading ? 'מתחבר…' : 'התחבר'}
          </button>
        </form>
        {authError && <p className="error">{authError}</p>}
      </section>
    )
  }

  return (
    <section className="panel schooler-panel">
      <div className="row">
        <h2>Schooler API</h2>
        <button type="button" className="schooler-btn-sm" onClick={handleLogout}>
          ניתוק
        </button>
      </div>
      <p className="note ok">מחובר כ־{authStatus.userId}</p>

      <div className="actions">
        <button type="button" disabled={coursesLoading} onClick={loadCourses}>
          {coursesLoading ? 'טוען…' : 'רענן קורסים'}
        </button>
        <button
          type="button"
          onClick={async () => {
            setApiLoading(true)
            try {
              await refreshSchoolerToken()
              setApiOutput({ action: 'refresh', data: { refreshed: true } })
            } catch (error) {
              setApiError(error.message)
            } finally {
              setApiLoading(false)
            }
          }}
        >
          רענון טוקן
        </button>
      </div>

      <label>
        קורס
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          disabled={!courses.length}
        >
          {!courses.length && <option value="">אין קורסים</option>}
          {courses.map((course) => {
            const id = String(course.id || course.course_id)
            return (
              <option key={id} value={id}>
                {course.course_name || course.name} ({id})
              </option>
            )
          })}
        </select>
      </label>

      {lessonsLoading && <p className="note">טוען שיעורים…</p>}

      {lessonItems.length > 0 && (
        <div className="schooler-lessons-wrap">
          <h3>
            שיעורים בקורס
            {lessons?.lesson_name ? `: ${lessons.lesson_name}` : ''}
            <span className="schooler-badge">{lessonItems.length}</span>
          </h3>

          {matchedLessons.length > 0 && (
            <p className="ok note">
              {matchedLessons.length} שיעורים תואמים לפלייליסט YouTube שנטען
            </p>
          )}

          <table className="schooler-table">
            <thead>
              <tr>
                <th>שם</th>
                <th>סוג</th>
                <th>תוכן</th>
                <th>Plyr</th>
              </tr>
            </thead>
            <tbody>
              {lessonItems.map((lesson) => (
                <LessonRow
                  key={lesson.lesson_id}
                  lesson={lesson}
                  onCopyEmbed={copyEmbedForLesson}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="schooler-advanced">
        <summary>פעולות API מתקדמות</summary>
        <div className="actions">
          <button
            type="button"
            disabled={apiLoading}
            onClick={() => runProxy({ method: 'GET', path: '/api/v1/schools' })}
          >
            בתי ספר
          </button>
          <button
            type="button"
            disabled={apiLoading || !selectedCourseId}
            onClick={() =>
              runProxy({
                method: 'GET',
                path: `/api/v1/courses/${selectedCourseId}/students`,
              })
            }
          >
            סטודנטים בקורס
          </button>
        </div>
      </details>

      {apiError && <p className="error">{apiError}</p>}
      {apiOutput && (
        <pre className="schooler-output">{JSON.stringify(apiOutput, null, 2)}</pre>
      )}
    </section>
  )
}
