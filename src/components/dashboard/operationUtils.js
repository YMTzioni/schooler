export const fillPath = (template, pathValues) =>
  template.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = pathValues[key]?.trim()
    if (!value) throw new Error(`חסר ערך לנתיב: ${key}`)
    return encodeURIComponent(value)
  })

export const buildQuery = (fields, values) => {
  const query = {}
  fields?.forEach((field) => {
    const value = values[field.name]?.trim()
    if (value) query[field.name] = value
  })
  return query
}

export const parseJsonBody = (text) => {
  const trimmed = text?.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error('גוף הבקשה אינו JSON תקין')
  }
}

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

export const buildBodyFieldDefs = (template, basePath = []) => {
  if (!isPlainObject(template)) return []
  const defs = []
  Object.entries(template).forEach(([key, value]) => {
    const path = [...basePath, key]
    if (isPlainObject(value)) {
      defs.push(...buildBodyFieldDefs(value, path))
      return
    }

    const type = Array.isArray(value) ? 'json' : typeof value
    const lowerKey = key.toLowerCase()
    const inferredKind = lowerKey.includes('email')
      ? 'email'
      : lowerKey.includes('phone') || lowerKey.includes('mobile')
        ? 'phone'
        : 'text'

    defs.push({
      key: path.join('.'),
      path,
      label: path.join(' > '),
      type,
      defaultValue: value,
      inferredKind,
      placeholder:
        value == null || typeof value === 'boolean'
          ? ''
          : Array.isArray(value) || typeof value === 'object'
            ? formatJson(value)
            : String(value),
    })
  })
  return defs
}

export const buildBodyFieldState = (fieldDefs) => {
  const state = {}
  fieldDefs.forEach((field) => {
    if (field.type === 'json') {
      state[field.key] = formatJson(field.defaultValue)
      return
    }
    state[field.key] = field.defaultValue == null ? '' : String(field.defaultValue)
  })
  return state
}

const setDeepValue = (target, path, value) => {
  let current = target
  for (let i = 0; i < path.length - 1; i += 1) {
    const part = path[i]
    if (!isPlainObject(current[part])) current[part] = {}
    current = current[part]
  }
  current[path[path.length - 1]] = value
}

export const buildBodyFromFields = (fieldDefs, values) => {
  const result = {}
  for (const field of fieldDefs) {
    const rawValue = values[field.key]
    if (field.type === 'json') {
      const text = String(rawValue || '').trim()
      if (!text) {
        setDeepValue(result, field.path, field.defaultValue)
      } else {
        try {
          setDeepValue(result, field.path, JSON.parse(text))
        } catch {
          throw new Error(`השדה "${field.label}" חייב להיות JSON תקין`)
        }
      }
      continue
    }

    if (field.type === 'number') {
      const asNumber = Number(rawValue)
      if (Number.isNaN(asNumber)) {
        throw new Error(`השדה "${field.label}" חייב להיות מספר`)
      }
      setDeepValue(result, field.path, asNumber)
      continue
    }

    if (field.type === 'boolean') {
      setDeepValue(result, field.path, String(rawValue) === 'true')
      continue
    }

    setDeepValue(result, field.path, rawValue ?? '')
  }
  return result
}

export const validateBodyFieldValues = (fieldDefs, values) => {
  const errors = []
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const phoneRegex = /^[+()\-\s0-9]{7,20}$/

  for (const field of fieldDefs) {
    const rawValue = String(values[field.key] ?? '').trim()
    if (!rawValue) continue

    if (field.inferredKind === 'email' && !emailRegex.test(rawValue)) {
      errors.push(`השדה "${field.label}" חייב להכיל אימייל תקין`)
    }
    if (field.inferredKind === 'phone' && !phoneRegex.test(rawValue)) {
      errors.push(`השדה "${field.label}" חייב להכיל טלפון תקין`)
    }
  }

  return errors
}

const tokenizePath = (path) => {
  const tokens = []
  const regex = /([^[.\]]+)|\[(\d+)\]/g
  let match
  while ((match = regex.exec(path)) !== null) {
    if (match[1] != null) tokens.push(match[1])
    else tokens.push(Number(match[2]))
  }
  return tokens
}

const setByTokenPath = (target, tokenPath, value) => {
  let current = target
  for (let i = 0; i < tokenPath.length - 1; i += 1) {
    const token = tokenPath[i]
    const nextToken = tokenPath[i + 1]
    if (typeof token === 'number') {
      if (!Array.isArray(current)) return
      if (current[token] == null) {
        current[token] = typeof nextToken === 'number' ? [] : {}
      }
      current = current[token]
      continue
    }
    if (current[token] == null) {
      current[token] = typeof nextToken === 'number' ? [] : {}
    }
    current = current[token]
  }
  const leaf = tokenPath[tokenPath.length - 1]
  current[leaf] = value
}

export const buildSchemaBodyFieldState = (fields = []) => {
  const state = {}
  fields.forEach((field) => {
    if (field.type === 'json') {
      state[field.path] = formatJson(field.defaultValue ?? {})
      return
    }
    if (field.type === 'boolean') {
      state[field.path] = String(field.defaultValue ?? false)
      return
    }
    state[field.path] = field.defaultValue == null ? '' : String(field.defaultValue)
  })
  return state
}

export const validateSchemaBodyFields = (fields = [], values = {}) => {
  const errors = []
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const phoneRegex = /^[+()\-\s0-9]{7,20}$/
  fields.forEach((field) => {
    const raw = String(values[field.path] ?? '').trim()
    if (field.required && !raw) {
      errors.push(`השדה "${field.label}" הוא חובה`)
      return
    }
    if (!raw) return
    if (field.type === 'email' && !emailRegex.test(raw)) {
      errors.push(`השדה "${field.label}" חייב להכיל אימייל תקין`)
    }
    if (field.type === 'phone' && !phoneRegex.test(raw)) {
      errors.push(`השדה "${field.label}" חייב להכיל טלפון תקין`)
    }
  })
  return errors
}

export const buildBodyFromSchemaFields = (fields = [], values = {}) => {
  const body = {}
  fields.forEach((field) => {
    const raw = values[field.path]
    let finalValue = raw
    if (field.type === 'number') {
      const n = Number(raw)
      if (Number.isNaN(n)) throw new Error(`השדה "${field.label}" חייב להיות מספר`)
      finalValue = n
    } else if (field.type === 'boolean') {
      finalValue = String(raw) === 'true'
    } else if (field.type === 'json') {
      const text = String(raw ?? '').trim()
      finalValue = text ? JSON.parse(text) : field.defaultValue ?? null
    } else {
      finalValue = raw ?? ''
    }
    setByTokenPath(body, tokenizePath(field.path), finalValue)
  })
  return body
}

export const formatJson = (value) => {
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export const formatTime = (ts) => {
  if (!ts) return ''
  return new Date(ts).toLocaleString('he-IL')
}

export const pickInitialOp = (groups) => groups[0]?.ops[0] ?? null

export const findOpById = (groups, id) => {
  for (const group of groups) {
    const op = group.ops.find((item) => item.id === id)
    if (op) return op
  }
  return null
}
