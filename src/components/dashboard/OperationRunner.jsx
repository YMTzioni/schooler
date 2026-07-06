import { useEffect, useMemo, useState } from 'react'
import { buildQuery, fillPath, formatJson, formatTime, parseJsonBody } from './operationUtils.js'

export default function OperationRunner({
  operation,
  onExecute,
  loading,
  result,
  error,
  defaultPathValues = {},
}) {
  const [pathValues, setPathValues] = useState({})
  const [queryValues, setQueryValues] = useState({})
  const [bodyText, setBodyText] = useState('')
  const [customMethod, setCustomMethod] = useState('GET')
  const [customPath, setCustomPath] = useState('/api/v1/courses')

  useEffect(() => {
    if (!operation) return
    const nextPath = {}
    operation.pathFields?.forEach((field) => {
      nextPath[field.name] = defaultPathValues[field.name] || ''
    })
    setPathValues(nextPath)

    const nextQuery = {}
    operation.queryFields?.forEach((field) => {
      nextQuery[field.name] = field.placeholder || ''
    })
    setQueryValues(nextQuery)

    setBodyText(operation.bodyTemplate ? formatJson(operation.bodyTemplate) : '')
    if (operation.customProxy) {
      setCustomMethod(operation.method || 'GET')
      setCustomPath(operation.path || '/api/v1/courses')
    }
  }, [operation, defaultPathValues])

  const needsBody = useMemo(
    () =>
      operation?.customProxy ||
      operation?.bodyTemplate != null ||
      ['POST', 'PUT', 'PATCH'].includes(operation?.method),
    [operation],
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!operation) return

    const method = operation.customProxy ? customMethod : operation.method
    const path = operation.customProxy ? customPath : fillPath(operation.path, pathValues)
    const query = buildQuery(operation.queryFields, queryValues)
    const body = needsBody ? parseJsonBody(bodyText) : undefined

    await onExecute({ method, path, query, body })
  }

  if (!operation) {
    return <p className="note">בחרו פעולה מהתפריט.</p>
  }

  return (
    <form className="op-runner" onSubmit={handleSubmit}>
      <div className="op-runner__head">
        <span className={`op-method op-method--${(operation.customProxy ? customMethod : operation.method).toLowerCase()}`}>
          {operation.customProxy ? customMethod : operation.method}
        </span>
        <code className="op-path">
          {operation.customProxy ? customPath : operation.path}
        </code>
      </div>
      <h3>{operation.label}</h3>

      {operation.customProxy && (
        <div className="op-runner__grid">
          <label>
            שיטה
            <select value={customMethod} onChange={(e) => setCustomMethod(e.target.value)}>
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            נתיב API
            <input
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="/api/v1/courses"
              dir="ltr"
            />
          </label>
        </div>
      )}

      {operation.pathFields?.length > 0 && (
        <div className="op-runner__grid">
          {operation.pathFields.map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                value={pathValues[field.name] || ''}
                onChange={(e) =>
                  setPathValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
                required={field.required}
                dir="ltr"
              />
            </label>
          ))}
        </div>
      )}

      {operation.queryFields?.length > 0 && (
        <div className="op-runner__grid">
          {operation.queryFields.map((field) => (
            <label key={field.name}>
              {field.label}
              <input
                value={queryValues[field.name] || ''}
                onChange={(e) =>
                  setQueryValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
                placeholder={field.placeholder}
                dir="ltr"
              />
            </label>
          ))}
        </div>
      )}

      {needsBody && (
        <label>
          גוף הבקשה (JSON)
          <textarea
            rows={12}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            dir="ltr"
            className="op-runner__body"
          />
        </label>
      )}

      <div className="actions">
        <button type="submit" disabled={loading}>
          {loading ? 'מריץ…' : 'הרץ פעולה'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="op-result">
          <div className="op-result__meta">
            <span className="ok">{result.ok ? 'הצלחה' : 'שגיאה'}</span>
            {result.durationMs != null && <span> · {result.durationMs}ms</span>}
            {result.at && <span> · {formatTime(result.at)}</span>}
          </div>
          <pre>{formatJson(result.data)}</pre>
        </div>
      )}
    </form>
  )
}
