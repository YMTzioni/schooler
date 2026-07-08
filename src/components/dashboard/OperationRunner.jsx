import { useEffect, useMemo, useState } from 'react'
import {
  buildBodyFromSchemaFields,
  buildBodyFieldDefs,
  buildBodyFieldState,
  buildBodyFromFields,
  buildQuery,
  buildSchemaBodyFieldState,
  fillPath,
  formatJson,
  formatTime,
  parseJsonBody,
  validateSchemaBodyFields,
  validateBodyFieldValues,
} from './operationUtils.js'

export default function OperationRunner({
  operation,
  onExecute,
  loading,
  result,
  error,
  defaultPathValues = {},
  lookupOptions = {},
}) {
  const [pathValues, setPathValues] = useState({})
  const [queryValues, setQueryValues] = useState({})
  const [bodyText, setBodyText] = useState('')
  const [bodyValues, setBodyValues] = useState({})
  const [schemaBodyValues, setSchemaBodyValues] = useState({})
  const [bodyFieldsError, setBodyFieldsError] = useState('')
  const [customMethod, setCustomMethod] = useState('GET')
  const [customPath, setCustomPath] = useState('/api/v1/courses')

  const bodyFieldDefs = useMemo(
    () => buildBodyFieldDefs(operation?.bodyTemplate),
    [operation?.bodyTemplate],
  )
  const schemaBodyFields = operation?.bodyFields || []
  const previewBody = useMemo(() => {
    try {
      if (schemaBodyFields.length > 0) {
        return formatJson(buildBodyFromSchemaFields(schemaBodyFields, schemaBodyValues))
      }
      return formatJson(buildBodyFromFields(bodyFieldDefs, bodyValues))
    } catch {
      return 'JSON לא תקין באחד השדות'
    }
  }, [bodyFieldDefs, bodyValues, schemaBodyFields, schemaBodyValues])

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
    setBodyValues(buildBodyFieldState(bodyFieldDefs))
    setSchemaBodyValues(buildSchemaBodyFieldState(schemaBodyFields))
    setBodyFieldsError('')
    if (operation.customProxy) {
      setCustomMethod(operation.method || 'GET')
      setCustomPath(operation.path || '/api/v1/courses')
    }
  }, [operation, defaultPathValues, bodyFieldDefs, schemaBodyFields])

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
    let body
    if (needsBody) {
      if (schemaBodyFields.length > 0) {
        const schemaErrors = validateSchemaBodyFields(schemaBodyFields, schemaBodyValues)
        if (schemaErrors.length) {
          setBodyFieldsError(schemaErrors.join(' · '))
          return
        }
        setBodyFieldsError('')
        body = buildBodyFromSchemaFields(schemaBodyFields, schemaBodyValues)
      } else if (operation.bodyTemplate && !operation.customProxy && bodyFieldDefs.length > 0) {
        const validationErrors = validateBodyFieldValues(bodyFieldDefs, bodyValues)
        if (validationErrors.length) {
          setBodyFieldsError(validationErrors.join(' · '))
          return
        }
        setBodyFieldsError('')
        body = buildBodyFromFields(bodyFieldDefs, bodyValues)
      } else {
        body = parseJsonBody(bodyText)
      }
    }

    await onExecute({ method, path, query, body })
  }

  if (!operation) {
    return <p className="note">בחרו פעולה מהתפריט.</p>
  }

  const getLookupItems = (fieldName) => lookupOptions[fieldName] || []

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
              {getLookupItems(field.name).length > 0 ? (
                <select
                  value={pathValues[field.name] || ''}
                  onChange={(e) =>
                    setPathValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  required={field.required}
                >
                  <option value="">בחר...</option>
                  {getLookupItems(field.name).map((item) => (
                    <option key={`${field.name}-${item.value}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={pathValues[field.name] || ''}
                  onChange={(e) =>
                    setPathValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  required={field.required}
                  dir="ltr"
                />
              )}
            </label>
          ))}
        </div>
      )}

      {operation.queryFields?.length > 0 && (
        <div className="op-runner__grid">
          {operation.queryFields.map((field) => (
            <label key={field.name}>
              {field.label}
              {getLookupItems(field.name).length > 0 ? (
                <select
                  value={queryValues[field.name] || ''}
                  onChange={(e) =>
                    setQueryValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                >
                  <option value="">בחר...</option>
                  {getLookupItems(field.name).map((item) => (
                    <option key={`${field.name}-${item.value}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={queryValues[field.name] || ''}
                  onChange={(e) =>
                    setQueryValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  dir="ltr"
                />
              )}
            </label>
          ))}
        </div>
      )}

      {needsBody && (
        <>
          {schemaBodyFields.length > 0 ? (
            <div className="op-runner__grid">
              {schemaBodyFields.map((field) => (
                <label key={field.path}>
                  {field.label}
                  {field.type === 'boolean' ? (
                    <select
                      value={String(schemaBodyValues[field.path] ?? 'false')}
                      onChange={(e) =>
                        setSchemaBodyValues((prev) => ({ ...prev, [field.path]: e.target.value }))
                      }
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : field.type === 'json' ? (
                    <textarea
                      rows={4}
                      value={schemaBodyValues[field.path] || ''}
                      onChange={(e) =>
                        setSchemaBodyValues((prev) => ({ ...prev, [field.path]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                      dir="ltr"
                    />
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={schemaBodyValues[field.path] ?? ''}
                      onChange={(e) =>
                        setSchemaBodyValues((prev) => ({ ...prev, [field.path]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                      dir="ltr"
                    />
                  )}
                </label>
              ))}
              <label className="op-runner__full">
                תצוגת JSON סופי (לבדיקה)
                <textarea rows={8} value={previewBody} readOnly dir="ltr" className="op-runner__body" />
              </label>
            </div>
          ) : operation.bodyTemplate && !operation.customProxy && bodyFieldDefs.length > 0 ? (
            <div className="op-runner__grid">
              {bodyFieldDefs.map((field) => (
                <label key={field.key}>
                  {field.label}
                  {field.type === 'boolean' ? (
                    <select
                      value={String(bodyValues[field.key] ?? 'false')}
                      onChange={(e) =>
                        setBodyValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : field.type === 'json' ? (
                    <textarea
                      rows={4}
                      value={bodyValues[field.key] || ''}
                      onChange={(e) =>
                        setBodyValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      dir="ltr"
                    />
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={bodyValues[field.key] ?? ''}
                      onChange={(e) =>
                        setBodyValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                      dir="ltr"
                    />
                  )}
                </label>
              ))}
              <label className="op-runner__full">
                תצוגת JSON סופי (לבדיקה)
                <textarea
                  rows={8}
                  value={previewBody}
                  readOnly
                  dir="ltr"
                  className="op-runner__body"
                />
              </label>
            </div>
          ) : (
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
        </>
      )}

      <div className="actions">
        {operation.bodyTemplate && !operation.customProxy && bodyFieldDefs.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (schemaBodyFields.length > 0) {
                setSchemaBodyValues(buildSchemaBodyFieldState(schemaBodyFields))
              } else {
                setBodyValues(buildBodyFieldState(bodyFieldDefs))
              }
              setBodyFieldsError('')
            }}
          >
            איפוס ברירת מחדל
          </button>
        )}
        <button type="submit" disabled={loading}>
          {loading ? 'מריץ…' : 'הרץ פעולה'}
        </button>
      </div>

      {bodyFieldsError && <p className="error">{bodyFieldsError}</p>}
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
