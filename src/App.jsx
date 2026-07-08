import { useEffect, useState } from 'react'
import PlyrPlayer from './components/PlyrPlayer.jsx'
import ApiDashboard from './components/ApiDashboard.jsx'
import {
  buildHostedEmbedUrl,
} from './utils/plyrEmbed.js'
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

  const activeEpisode = playlistResult?.videos?.[activeEpisodeIndex] ?? null

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

  if (hostedPlayerVideoId) {
    return (
      <main className={`layout ${hostedEmbedVideoId ? 'layout--embed' : ''}`}>
        <section className={hostedEmbedVideoId ? 'embed-player-shell' : 'panel'}>
          {!hostedEmbedVideoId && <h2>צפייה דרך Schooler Course Studio</h2>}
          <PlyrPlayer
            videoId={hostedPlayerVideoId}
            title={`Video ${hostedPlayerVideoId}`}
            showCaptions
            captionLang="he"
            sourceLang="auto"
            targetLang="he"
            format="vtt"
            onCaptionStatusChange={setLiveCaptionStatus}
          />
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
              <div className="playlist-results">
                <div className="row">
                  <p>
                    נמצאו {playlistResult.total} פרקים בפלייליסט {playlistResult.playlistId}
                  </p>
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
                        {video.displayName || `פרק ${video.index}: ${video.title}`}
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
          </section>
        </section>
      </div>
      )}
    </main>
  )
}

export default App
