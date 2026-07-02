import { useEffect, useMemo, useState } from 'react'
import PlyrPlayer from './components/PlyrPlayer.jsx'
import { buildPlyrEmbedCode } from './utils/plyrEmbed.js'
import { downloadTextFile } from './utils/downloads.js'
import {
  SUBTITLE_SOURCE_LANGUAGES,
  SUBTITLE_TARGET_LANGUAGES,
} from './constants/subtitleLanguages.js'
import { API_BASE, isGitHubPagesHost } from './config/api.js'
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
      : ' הרץ בטרמינל: npm run api (או npm start להרצה משולבת).'
    throw new Error(`לא ניתן להתחבר לשרת המקומי.${ghPagesHint}`)
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
  const [mode, setMode] = useState('youtube')
  const [authStatus, setAuthStatus] = useState({ loading: true, loggedIn: false })
  const [authForm, setAuthForm] = useState({
    clientId: '',
    clientSecret: '',
    userId: '',
    userSecret: '',
  })
  const [dashboard, setDashboard] = useState({
    loading: false,
    error: '',
    response: null,
  })
  const [proxyForm, setProxyForm] = useState({
    method: 'GET',
    path: '/api/v1/courses',
    query: '{"page":1,"per_page":20}',
    body: '{}',
  })
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
  const [liveCaptionStatus, setLiveCaptionStatus] = useState(null)

  const activeEpisode = playlistResult?.videos?.[activeEpisodeIndex] ?? null

  useEffect(() => {
    setLiveCaptionStatus(null)
  }, [activeEpisode?.videoId])

  const prettyResponse = useMemo(() => {
    if (!dashboard.response) return ''
    return JSON.stringify(dashboard.response, null, 2)
  }, [dashboard.response])

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await apiRequest('/auth/status', { method: 'GET' })
        setAuthStatus({ loading: false, ...data })
      } catch {
        setAuthStatus({ loading: false, loggedIn: false })
      }
    }
    checkStatus()
  }, [])

  useEffect(() => {
    if (mode !== 'youtube') return
    const checkApi = async () => {
      try {
        const data = await apiRequest('/health', { method: 'GET' })
        setApiOnline(data.features?.includes('youtube-subtitles') ? true : 'outdated')
      } catch {
        setApiOnline(false)
      }
    }
    checkApi()
  }, [mode])

  const runAction = async (label, fn) => {
    setDashboard({ loading: true, error: '', response: { action: label } })
    try {
      const data = await fn()
      setDashboard({ loading: false, error: '', response: data })
    } catch (error) {
      setDashboard({ loading: false, error: error.message, response: null })
    }
  }

  const onLogin = async (event) => {
    event.preventDefault()
    await runAction('Authenticate', async () =>
      apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify(authForm),
      }),
    )
    const status = await apiRequest('/auth/status', { method: 'GET' })
    setAuthStatus({ loading: false, ...status })
  }

  const onLogout = async () => {
    await runAction('Logout', async () =>
      apiRequest('/auth/logout', { method: 'POST', body: '{}' }),
    )
    setAuthStatus({ loading: false, loggedIn: false })
  }

  const runProxy = async (event) => {
    event.preventDefault()
    let query = {}
    let body = {}
    try {
      query = proxyForm.query ? JSON.parse(proxyForm.query) : {}
      body = proxyForm.body ? JSON.parse(proxyForm.body) : {}
    } catch {
      setDashboard({
        loading: false,
        error: 'JSON לא תקין בשדות Query או Body',
        response: null,
      })
      return
    }

    await runAction('Custom API action', async () =>
      apiRequest('/proxy', {
        method: 'POST',
        body: JSON.stringify({
          method: proxyForm.method,
          path: proxyForm.path,
          query,
          body,
        }),
      }),
    )
  }

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedText(`הועתק: ${label}`)
      setTimeout(() => setCopiedText(''), 2000)
    } catch {
      setCopiedText('לא הצלחתי להעתיק ללוח')
    }
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
      setPlaylistResult(data)
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

  const copyAllEmbeds = () => {
    if (!playlistResult?.videos?.length) return
    const payload = playlistResult.videos.map((video) => ({
      index: video.index,
      displayName: video.displayName,
      fileName: video.fileName,
      title: video.title,
      videoId: video.videoId,
      plyrEmbedCode: buildPlyrEmbedCode(video.videoId, video.title),
      schoolerEmbedLink: video.schoolerEmbedLink,
    }))
    copyText(JSON.stringify(payload, null, 2), 'כל קודי Plyr')
  }

  return (
    <main className="layout">
      <header>
        <h1>Schooler Local Control</h1>
        <p>דשבורד YouTube לקורסים + חיבור אופציונלי ל-Schooler</p>
      </header>

      <section className="panel">
        <div className="actions">
          <button type="button" onClick={() => setMode('youtube')}>
            דשבורד יוטיוב קורסים
          </button>
          <button type="button" onClick={() => setMode('schooler')}>
            חיבור Schooler (אופציונלי)
          </button>
        </div>
      </section>

      {mode === 'youtube' ? (
        <section className="panel">
          <h2>דשבורד יוטיוב קורסים</h2>
          <p>הדבק פלייליסט, צפה בפרקים דרך נגן Plyr, והעתק קוד embed ל-Schooler.</p>
          {apiOnline === false && (
            <p className="error">
              השרת המקומי לא פעיל. הרץ בטרמינל: <code>npm run api</code> או <code>npm start</code>
            </p>
          )}
          {apiOnline === 'outdated' && (
            <p className="error">
              השרת פועל בגרסה ישנה. עצור והרץ מחדש: <code>npm start</code>
            </p>
          )}
          {apiOnline === true && <p className="ok">שרת מקומי מחובר ומוכן (כולל כתוביות)</p>}

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
              <div className="playlist-results">
                <div className="row">
                  <p>
                    נמצאו {playlistResult.total} פרקים בפלייליסט {playlistResult.playlistId}
                  </p>
                  <button type="button" onClick={copyAllEmbeds}>
                    העתק הכל כ-JSON
                  </button>
                </div>

                {activeEpisode && (
                  <section className="course-player">
                    <h3>{activeEpisode.displayName || `פרק ${activeEpisode.index}: ${activeEpisode.title}`}</h3>
                    <PlyrPlayer
                      videoId={activeEpisode.videoId}
                      title={activeEpisode.title}
                      episodeIndex={activeEpisode.index}
                      showCaptions={subtitleSettings.showInPlayer}
                      captionLang={subtitleSettings.playerLang}
                      sourceLang={subtitleSettings.sourceLang}
                      targetLang={subtitleSettings.targetLang}
                      format={subtitleSettings.format}
                      onCaptionStatusChange={setLiveCaptionStatus}
                    />
                  </section>
                )}

                <p className="note">
                  הנגן משתמש ב-Plyr עם youtube-nocookie. להדבקה ב-Schooler השתמש בקוד Plyr לכל פרק.
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
                        {video.displayName || `פרק ${video.index}: ${video.title}`}
                      </button>
                      <p className="episode-file">
                        קובץ: {video.fileName}.{subtitleSettings.format}
                      </p>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() =>
                            copyText(
                              buildPlyrEmbedCode(video.videoId, video.title),
                              `קוד Plyr לפרק ${video.index}`,
                            )
                          }
                        >
                          העתק קוד Plyr
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(video.schoolerEmbedLink, `קישור embed לפרק ${video.index}`)
                          }
                        >
                          העתק קישור embed
                        </button>
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
        </section>
      ) : authStatus.loading ? (
        <p>טוען סטטוס התחברות...</p>
      ) : !authStatus.loggedIn ? (
        <section className="panel">
          <h2>מסך התחברות ל-Schooler (אופציונלי)</h2>
          <form onSubmit={onLogin} className="grid">
            <label>
              Client ID
              <input
                value={authForm.clientId}
                onChange={(e) => setAuthForm({ ...authForm, clientId: e.target.value })}
                required
              />
            </label>
            <label>
              Client Secret
              <input
                type="password"
                value={authForm.clientSecret}
                onChange={(e) => setAuthForm({ ...authForm, clientSecret: e.target.value })}
                required
              />
            </label>
            <label>
              User ID (email)
              <input
                value={authForm.userId}
                onChange={(e) => setAuthForm({ ...authForm, userId: e.target.value })}
                required
              />
            </label>
            <label>
              User Secret
              <input
                type="password"
                value={authForm.userSecret}
                onChange={(e) => setAuthForm({ ...authForm, userSecret: e.target.value })}
                required
              />
            </label>
            <button type="submit">התחבר ל-API</button>
          </form>
        </section>
      ) : (
        <section className="panel">
          <div className="row">
            <h2>דשבורד פעולות Schooler</h2>
            <button type="button" onClick={onLogout}>
              ניתוק
            </button>
          </div>

          <div className="actions">
            <button
              type="button"
              onClick={() => runAction('List Courses', () => apiRequest('/courses', { method: 'GET' }))}
            >
              קבל קורסים
            </button>
            <button
              type="button"
              onClick={() => runAction('List Schools', () => apiRequest('/schools', { method: 'GET' }))}
            >
              קבל בתי ספר
            </button>
            <button
              type="button"
              onClick={() =>
                runAction('Refresh Token', () =>
                  apiRequest('/auth/refresh', { method: 'POST', body: '{}' }),
                )
              }
            >
              רענון טוקן
            </button>
          </div>

          <form onSubmit={runProxy} className="grid">
            <h3>פעולה מותאמת אישית</h3>
            <label>
              Method
              <select
                value={proxyForm.method}
                onChange={(e) => setProxyForm({ ...proxyForm, method: e.target.value })}
              >
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>DELETE</option>
              </select>
            </label>
            <label>
              Path
              <input
                value={proxyForm.path}
                onChange={(e) => setProxyForm({ ...proxyForm, path: e.target.value })}
              />
            </label>
            <label>
              Query (JSON)
              <textarea
                rows="3"
                value={proxyForm.query}
                onChange={(e) => setProxyForm({ ...proxyForm, query: e.target.value })}
              />
            </label>
            <label>
              Body (JSON)
              <textarea
                rows="5"
                value={proxyForm.body}
                onChange={(e) => setProxyForm({ ...proxyForm, body: e.target.value })}
              />
            </label>
            <button type="submit">הרץ פעולה</button>
          </form>
        </section>
      )}

      <section className="panel">
        <h2>פלט</h2>
        {dashboard.loading && <p>מריץ פעולה...</p>}
        {dashboard.error && <p className="error">{dashboard.error}</p>}
        {!dashboard.loading && !dashboard.error && prettyResponse && <pre>{prettyResponse}</pre>}
      </section>
    </main>
  )
}

export default App
