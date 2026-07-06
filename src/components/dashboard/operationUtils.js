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
