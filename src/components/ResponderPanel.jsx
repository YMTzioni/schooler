import { useCallback, useEffect, useState } from 'react'
import {
  getResponderAuthConfig,
  getResponderAuthStatus,
  listResponderLists,
  loginResponder,
  loginResponderFromEnv,
  logoutResponder,
  proxyResponderRequest,
  refreshResponderToken,
} from '../utils/responderClient.js'

const AUTH_STORAGE_KEY = 'responder-auth-form-v1'

const loadSavedAuth = () => {
  try {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY)
    return saved
      ? JSON.parse(saved)
      : { clientId: '', clientSecret: '', userToken: '' }
  } catch {
    return { clientId: '', clientSecret: '', userToken: '' }
  }
}

const formatExpiry = (expiresAt) => {
  if (!expiresAt) return ''
  return new Date(expiresAt).toLocaleString('he-IL')
}

export default function ResponderPanel() {
  const [authStatus, setAuthStatus] = useState({ loading: true, loggedIn: false })
  const [envConfig, setEnvConfig] = useState({ envReady: false })
  const [authForm, setAuthForm] = useState(loadSavedAuth)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [lists, setLists] = useState([])
  const [listsLoading, setListsLoading] = useState(false)
  const [apiOutput, setApiOutput] = useState(null)
  const [apiError, setApiError] = useState('')

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getResponderAuthStatus()
      setAuthStatus({ loading: false, ...status })
    } catch {
      setAuthStatus({ loading: false, loggedIn: false })
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    getResponderAuthConfig()
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
      await loginResponder(authForm)
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
      await loginResponderFromEnv()
      await refreshStatus()
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await logoutResponder()
    setLists([])
    setAuthStatus({ loading: false, loggedIn: false })
  }

  const loadLists = async () => {
    setListsLoading(true)
    setApiError('')
    try {
      const data = await listResponderLists()
      const items = data?.data || data?.lists || (Array.isArray(data) ? data : [])
      setLists(items)
      setApiOutput({ action: 'lists', data })
    } catch (error) {
      setApiError(error.message)
    } finally {
      setListsLoading(false)
    }
  }

  useEffect(() => {
    if (!authStatus.loggedIn) return
    loadLists()
  }, [authStatus.loggedIn])

  if (authStatus.loading) {
    return (
      <section className="panel schooler-panel responder-panel">
        <h2>רב מסר API V2</h2>
        <p className="note">טוען חיבור…</p>
      </section>
    )
  }

  if (!authStatus.loggedIn) {
    return (
      <section className="panel schooler-panel responder-panel">
        <h2>רב מסר API V2</h2>
        <details className="schooler-advanced" open>
          <summary>תהליך התחברות</summary>
          <ol className="note responder-steps">
            <li>
              <strong>User Token</strong> — הגדרות חשבון &gt; חיבורים חיצוניים &gt; הפעל &quot;רב מסר&quot; &gt; העתק מהעין
            </li>
            <li>
              <strong>Client ID + Secret</strong> — מתמיכת רב מסר (
              <a href="mailto:support@responder.co.il">support@responder.co.il</a>)
            </li>
            <li>
              השרת שולח <code>POST graph.responder.live/v2/oauth/token</code> עם{' '}
              <code>grant_type: client_credentials</code>, <code>scope: *</code>
            </li>
            <li>
              התגובה מכילה <code>token</code> (JWT) — לא <code>access_token</code> כמו בתיעוד הישן
            </li>
            <li>בקשות API: <code>Authorization: Bearer &lt;token&gt;</code></li>
          </ol>
        </details>
        <p className="note">
          <a
            href="https://support.responder.co.il/portal/he/kb/articles/%D7%A8%D7%91-%D7%9E%D7%A1%D7%A8-%D7%97%D7%99%D7%91%D7%95%D7%A8-api"
            target="_blank"
            rel="noreferrer"
          >
            מדריך חיבור API
          </a>
          {' · '}
          <a
            href="https://app.swaggerhub.com/apis/Responder/responder/V2.0"
            target="_blank"
            rel="noreferrer"
          >
            Swagger
          </a>
        </p>

        {envConfig.envReady && (
          <div className="schooler-env-banner">
            <p>משתני סביבה מוגדרים בשרת</p>
            <button type="button" disabled={authLoading} onClick={handleEnvLogin}>
              התחבר מהשרת (.env)
            </button>
          </div>
        )}

        {envConfig.hasClientCredentials && !envConfig.envReady && (
          <p className="note">Client ID/Secret מוגדרים בשרת — הזינו רק User Token.</p>
        )}

        <form onSubmit={handleLogin} className="grid schooler-login">
          {!envConfig.hasClientCredentials && (
            <>
              <label>
                Client ID
                <input
                  value={authForm.clientId}
                  onChange={(e) => persistAuthForm({ ...authForm, clientId: e.target.value })}
                  required
                  autoComplete="off"
                />
              </label>
              <label>
                Client Secret
                <input
                  type="password"
                  value={authForm.clientSecret}
                  onChange={(e) => persistAuthForm({ ...authForm, clientSecret: e.target.value })}
                  required
                  autoComplete="off"
                />
              </label>
            </>
          )}
          <label>
            User Token
            <input
              type="password"
              value={authForm.userToken}
              onChange={(e) => persistAuthForm({ ...authForm, userToken: e.target.value })}
              required
              autoComplete="off"
              placeholder="מהגדרות > חיבורים חיצוניים"
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
    <section className="panel schooler-panel responder-panel">
      <div className="row">
        <h2>רב מסר API V2</h2>
        <button type="button" className="schooler-btn-sm" onClick={handleLogout}>
          ניתוק
        </button>
      </div>
      <p className="note ok">
        מחובר{authStatus.name ? ` כ־${authStatus.name}` : ''}
        {authStatus.username ? ` (${authStatus.username})` : ''}
        {authStatus.accountId ? ` · חשבון ${authStatus.accountId}` : ''}
        {authStatus.expiresAt ? ` · תוקף עד ${formatExpiry(authStatus.expiresAt)}` : ''}
      </p>
      <p className="note">Bearer token נשמר בשרת · תגובת OAuth אחרונה ב־<code>.responder-oauth.json</code></p>

      <div className="actions">
        <button type="button" disabled={listsLoading} onClick={loadLists}>
          {listsLoading ? 'טוען…' : 'רענן רשימות'}
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              const data = await refreshResponderToken()
              setApiOutput({ action: 'refresh', data })
              await refreshStatus()
            } catch (error) {
              setApiError(error.message)
            }
          }}
        >
          רענון טוקן
        </button>
      </div>

      {lists.length > 0 && (
        <div className="schooler-lessons-wrap">
          <h3>
            רשימות תפוצה
            <span className="schooler-badge">{lists.length}</span>
          </h3>
          <table className="schooler-table">
            <thead>
              <tr>
                <th>שם</th>
                <th>מזהה</th>
              </tr>
            </thead>
            <tbody>
              {lists.map((list) => (
                <tr key={list.id || list.list_id}>
                  <td>{list.name || list.list_name}</td>
                  <td>{list.id || list.list_id}</td>
                </tr>
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
            onClick={async () => {
              setApiError('')
              try {
                const data = await proxyResponderRequest({ method: 'GET', path: '/me' })
                setApiOutput({ action: 'GET /me', data })
              } catch (error) {
                setApiError(error.message)
              }
            }}
          >
            פרטי חשבון
          </button>
          <button
            type="button"
            onClick={async () => {
              setApiError('')
              try {
                const data = await proxyResponderRequest({ method: 'GET', path: '/tag' })
                setApiOutput({ action: 'GET /tag', data })
              } catch (error) {
                setApiError(error.message)
              }
            }}
          >
            תגיות
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
