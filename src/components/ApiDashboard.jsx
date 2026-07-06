import { useCallback, useEffect, useMemo, useState } from 'react'
import { SCHOOLER_OPERATION_GROUPS } from '../constants/schoolerOperations.js'
import { RESPONDER_OPERATION_GROUPS } from '../constants/responderOperations.js'
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
import {
  getResponderAuthConfig,
  getResponderAuthStatus,
  loginResponder,
  loginResponderFromEnv,
  logoutResponder,
  proxyResponderRequest,
  refreshResponderToken,
} from '../utils/responderClient.js'
import OperationRunner from './dashboard/OperationRunner.jsx'
import { findOpById, pickInitialOp } from './dashboard/operationUtils.js'

const SCHOOLER_AUTH_KEY = 'schooler-auth-form-v1'
const RESPONDER_AUTH_KEY = 'responder-auth-form-v1'

const loadAuth = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

function AuthCard({
  title,
  status,
  config,
  form,
  onFormChange,
  onLogin,
  onEnvLogin,
  onLogout,
  onRefresh,
  loading,
  error,
  fields,
}) {
  if (status.loading) return <p className="note">טוען {title}…</p>

  if (!status.loggedIn) {
    return (
      <div className="dash-auth-card">
        <h3>{title}</h3>
        {config.needsClientOnly && (
          <div className="dash-missing panel">
            <p className="note warn">
              חסרים <strong>Client ID/Secret</strong> ייעודיים ל-Schooler API (מפתחות רב מסר לא מתאימים).
              בקשו מ-<a href="mailto:support@responder.co.il?subject=בקשת%20Client%20ID%20ל-Schooler%20API">תמיכה</a> והזינו למטה.
            </p>
          </div>
        )}
        {config.envReady && (
          <button type="button" disabled={loading} onClick={onEnvLogin}>
            התחבר מהשרת (.env)
          </button>
        )}
        <form
          className="grid dash-auth-form"
          onSubmit={(e) => {
            e.preventDefault()
            onLogin()
          }}
        >
          {fields.map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                type={field.type || 'text'}
                value={form[field.name] || ''}
                onChange={(e) => onFormChange({ ...form, [field.name]: e.target.value })}
                required={field.required !== false}
                autoComplete="off"
                dir={field.ltr ? 'ltr' : undefined}
              />
            </label>
          ))}
          <button type="submit" disabled={loading}>
            {loading ? 'מתחבר…' : 'התחבר'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="dash-auth-card dash-auth-card--ok">
      <div className="row">
        <h3>{title}</h3>
        <div className="dash-auth-actions">
          <button type="button" className="schooler-btn-sm" onClick={onRefresh}>
            רענון טוקן
          </button>
          <button type="button" className="schooler-btn-sm" onClick={onLogout}>
            ניתוק
          </button>
        </div>
      </div>
      <p className="note ok">
        {status.label}
        {status.expiresAt ? ` · תוקף עד ${new Date(status.expiresAt).toLocaleString('he-IL')}` : ''}
      </p>
    </div>
  )
}

function SchoolerExplorer({ onPickCourse, playlistVideos = [] }) {
  const [courses, setCourses] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    listSchoolerCourses({ per_page: 100 })
      .then((data) => {
        const list = data?.data || []
        setCourses(list)
        if (list.length) {
          const id = String(list[0].id || list[0].course_id)
          setSelectedId(id)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    getSchoolerCourseLessons(selectedId, { per_page: 100 })
      .then((data) => setLessons(data?.data?.lessons || data?.lessons || data?.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [selectedId])

  const playlistIds = useMemo(() => new Set(playlistVideos.map((v) => v.videoId).filter(Boolean)), [playlistVideos])

  return (
    <section className="dash-explorer panel">
      <h3>סייר קורסים</h3>
      {loading && <p className="note">טוען…</p>}
      {error && <p className="error">{error}</p>}
      <label>
        קורס
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value)
            onPickCourse?.(e.target.value)
          }}
        >
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
      {Array.isArray(lessons) && lessons.length > 0 && (
        <table className="schooler-table">
          <thead>
            <tr>
              <th>שיעור</th>
              <th>סוג</th>
              <th>YouTube</th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((lesson) => {
              const videoId = extractYouTubeVideoId(lesson.lesson_content_link)
              const matched = videoId && playlistIds.has(videoId)
              return (
                <tr key={lesson.lesson_id} className={matched ? 'dash-row-match' : ''}>
                  <td>{lesson.lesson_name}</td>
                  <td>{lesson.type_of_lesson}</td>
                  <td>{videoId || '—'}{matched ? ' ✓' : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default function ApiDashboard({ playlistVideos = [] }) {
  const [mainTab, setMainTab] = useState('schooler')

  const [schoolerStatus, setSchoolerStatus] = useState({ loading: true, loggedIn: false })
  const [schoolerConfig, setSchoolerConfig] = useState({})
  const [schoolerForm, setSchoolerForm] = useState(() =>
    loadAuth(SCHOOLER_AUTH_KEY, { clientId: '', clientSecret: '', userId: '', userSecret: '' }),
  )
  const [schoolerAuthLoading, setSchoolerAuthLoading] = useState(false)
  const [schoolerAuthError, setSchoolerAuthError] = useState('')

  const [responderStatus, setResponderStatus] = useState({ loading: true, loggedIn: false })
  const [responderConfig, setResponderConfig] = useState({})
  const [responderForm, setResponderForm] = useState(() =>
    loadAuth(RESPONDER_AUTH_KEY, { clientId: '', clientSecret: '', userToken: '' }),
  )
  const [responderAuthLoading, setResponderAuthLoading] = useState(false)
  const [responderAuthError, setResponderAuthError] = useState('')

  const [selectedOpId, setSelectedOpId] = useState(() => pickInitialOp(SCHOOLER_OPERATION_GROUPS)?.id)
  const [opLoading, setOpLoading] = useState(false)
  const [opResult, setOpResult] = useState(null)
  const [opError, setOpError] = useState('')
  const [pickedCourseId, setPickedCourseId] = useState('')

  const groups = mainTab === 'schooler' ? SCHOOLER_OPERATION_GROUPS : RESPONDER_OPERATION_GROUPS
  const selectedOp = findOpById(groups, selectedOpId) || pickInitialOp(groups)

  const refreshSchooler = useCallback(async () => {
    try {
      const status = await getSchoolerAuthStatus()
      if (!status.loggedIn) {
        setSchoolerStatus({ loading: false, loggedIn: false })
        return
      }
      setSchoolerStatus({
        loading: false,
        loggedIn: true,
        label: `מחובר כ־${status.userId}`,
        expiresAt: status.expiresAt,
      })
    } catch {
      setSchoolerStatus({ loading: false, loggedIn: false })
    }
  }, [])

  const refreshResponder = useCallback(async () => {
    try {
      const status = await getResponderAuthStatus()
      if (!status.loggedIn) {
        setResponderStatus({ loading: false, loggedIn: false })
        return
      }
      setResponderStatus({
        loading: false,
        loggedIn: true,
        label: `${status.name || status.username || 'מחובר'}`,
        expiresAt: status.expiresAt,
      })
    } catch {
      setResponderStatus({ loading: false, loggedIn: false })
    }
  }, [])

  useEffect(() => {
    Promise.all([
      getSchoolerAuthConfig().then(setSchoolerConfig).catch(() => {}),
      getResponderAuthConfig().then(setResponderConfig).catch(() => {}),
    ]).finally(() => {
      refreshSchooler()
      refreshResponder()
    })
  }, [refreshSchooler, refreshResponder])

  useEffect(() => {
    if (!responderConfig.envReady || responderStatus.loggedIn || responderAuthLoading) return
    setResponderAuthLoading(true)
    loginResponderFromEnv()
      .then(() => refreshResponder())
      .catch(() => {})
      .finally(() => setResponderAuthLoading(false))
  }, [responderConfig.envReady, responderStatus.loggedIn, responderAuthLoading, refreshResponder])

  useEffect(() => {
    if (!schoolerConfig.envReady || schoolerStatus.loggedIn || schoolerAuthLoading) return
    setSchoolerAuthLoading(true)
    loginSchoolerFromEnv()
      .then(() => refreshSchooler())
      .catch((error) => setSchoolerAuthError(error.message))
      .finally(() => setSchoolerAuthLoading(false))
  }, [schoolerConfig.envReady, schoolerStatus.loggedIn, schoolerAuthLoading, refreshSchooler])

  useEffect(() => {
    if (!schoolerConfig.userId || schoolerForm.userId) return
    setSchoolerForm((current) => ({
      ...current,
      userId: schoolerConfig.userId || current.userId,
    }))
  }, [schoolerConfig.userId, schoolerForm.userId])

  useEffect(() => {
    const first = pickInitialOp(groups)
    setSelectedOpId(first?.id)
    setOpResult(null)
    setOpError('')
  }, [mainTab])

  useEffect(() => {
    if (!pickedCourseId || !selectedOp) return
    if (selectedOp.path?.includes('{course_id}')) {
      // no-op: user fills manually; explorer helps pick ID
    }
  }, [pickedCourseId, selectedOp])

  const runOperation = async ({ method, path, query, body }) => {
    setOpLoading(true)
    setOpError('')
    setOpResult(null)
    const started = performance.now()
    try {
      const data =
        mainTab === 'schooler'
          ? await proxySchoolerRequest({ method, path, query, body })
          : await proxyResponderRequest({ method, path, query, body })
      setOpResult({
        ok: true,
        data,
        durationMs: Math.round(performance.now() - started),
        at: Date.now(),
      })
    } catch (error) {
      setOpError(error.message)
      setOpResult({
        ok: false,
        data: { message: error.message },
        durationMs: Math.round(performance.now() - started),
        at: Date.now(),
      })
    } finally {
      setOpLoading(false)
    }
  }

  const schoolerFields = [
    ...(!schoolerConfig.hasClientCredentials
      ? [
          { name: 'clientId', label: 'Client ID (Schooler API)', ltr: true },
          { name: 'clientSecret', label: 'Client Secret (Schooler API)', type: 'password', ltr: true },
        ]
      : []),
    ...(!schoolerConfig.hasUserCredentials
      ? [
          { name: 'userId', label: 'אימייל (User ID)', ltr: true },
          { name: 'userSecret', label: 'מפתח API (User Secret)', type: 'password', ltr: true },
        ]
      : []),
  ]

  const responderFields = [
    ...(responderConfig.hasClientCredentials
      ? []
      : [
          { name: 'clientId', label: 'Client ID', ltr: true },
          { name: 'clientSecret', label: 'Client Secret', type: 'password', ltr: true },
        ]),
    { name: 'userToken', label: 'User Token', type: 'password', ltr: true },
  ]

  const connected = mainTab === 'schooler' ? schoolerStatus.loggedIn : responderStatus.loggedIn

  return (
    <div className="api-dashboard">
      <header className="dash-header">
        <div>
          <h1>דשבורד API</h1>
          <p className="note">
            ביצוע פעולות Schooler ורב מסר ישירות מול ה-API. יצירת קורסים חדשים אינה זמינה ב-API — רק שליפה וניהול סטודנטים.
          </p>
        </div>
        <div className="dash-tabs dash-tabs--main">
          <button
            type="button"
            className={mainTab === 'schooler' ? 'active' : ''}
            onClick={() => setMainTab('schooler')}
          >
            Schooler
          </button>
          <button
            type="button"
            className={mainTab === 'responder' ? 'active' : ''}
            onClick={() => setMainTab('responder')}
          >
            רב מסר V2
          </button>
        </div>
      </header>

      <div className="dash-auth-row">
        <AuthCard
          title="Schooler API"
          status={schoolerStatus}
          config={schoolerConfig}
          form={schoolerForm}
          onFormChange={(next) => {
            setSchoolerForm(next)
            localStorage.setItem(SCHOOLER_AUTH_KEY, JSON.stringify(next))
          }}
          loading={schoolerAuthLoading}
          error={schoolerAuthError}
          fields={schoolerFields}
          onLogin={async () => {
            setSchoolerAuthLoading(true)
            setSchoolerAuthError('')
            try {
              await loginSchooler(schoolerForm)
              await refreshSchooler()
            } catch (e) {
              setSchoolerAuthError(e.message)
            } finally {
              setSchoolerAuthLoading(false)
            }
          }}
          onEnvLogin={async () => {
            setSchoolerAuthLoading(true)
            try {
              await loginSchoolerFromEnv()
              await refreshSchooler()
            } catch (e) {
              setSchoolerAuthError(e.message)
            } finally {
              setSchoolerAuthLoading(false)
            }
          }}
          onLogout={async () => {
            await logoutSchooler()
            setSchoolerStatus({ loading: false, loggedIn: false })
          }}
          onRefresh={async () => {
            await refreshSchoolerToken()
            await refreshSchooler()
          }}
        />
        <AuthCard
          title="רב מסר API V2"
          status={responderStatus}
          config={responderConfig}
          form={responderForm}
          onFormChange={(next) => {
            setResponderForm(next)
            localStorage.setItem(RESPONDER_AUTH_KEY, JSON.stringify(next))
          }}
          loading={responderAuthLoading}
          error={responderAuthError}
          fields={responderFields}
          onLogin={async () => {
            setResponderAuthLoading(true)
            setResponderAuthError('')
            try {
              await loginResponder(responderForm)
              await refreshResponder()
            } catch (e) {
              setResponderAuthError(e.message)
            } finally {
              setResponderAuthLoading(false)
            }
          }}
          onEnvLogin={async () => {
            setResponderAuthLoading(true)
            try {
              await loginResponderFromEnv()
              await refreshResponder()
            } catch (e) {
              setResponderAuthError(e.message)
            } finally {
              setResponderAuthLoading(false)
            }
          }}
          onLogout={async () => {
            await logoutResponder()
            setResponderStatus({ loading: false, loggedIn: false })
          }}
          onRefresh={async () => {
            await refreshResponderToken()
            await refreshResponder()
          }}
        />
      </div>

      {!connected ? (
        <p className="note warn panel">התחברו ל-{mainTab === 'schooler' ? 'Schooler' : 'רב מסר'} כדי להריץ פעולות.</p>
      ) : (
        <div className="dash-workspace">
          <nav className="dash-sidebar panel">
            {groups.map((group) => (
              <div key={group.id} className="dash-sidebar__group">
                <h4>{group.label}</h4>
                <ul>
                  {group.ops.map((op) => (
                    <li key={op.id}>
                      <button
                        type="button"
                        className={selectedOpId === op.id ? 'active' : ''}
                        onClick={() => {
                          setSelectedOpId(op.id)
                          setOpResult(null)
                          setOpError('')
                        }}
                      >
                        <span className={`op-method op-method--${op.method.toLowerCase()}`}>
                          {op.method}
                        </span>
                        {op.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="dash-main">
            <OperationRunner
              key={`${selectedOpId}-${pickedCourseId}`}
              operation={selectedOp}
              onExecute={runOperation}
              loading={opLoading}
              result={opResult}
              error={opError}
              defaultPathValues={{
                course_id: pickedCourseId,
                id: pickedCourseId,
                school_id: pickedCourseId,
              }}
            />
            {mainTab === 'schooler' && schoolerStatus.loggedIn && (
              <SchoolerExplorer playlistVideos={playlistVideos} onPickCourse={setPickedCourseId} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
