#!/usr/bin/env node
/**
 * בדיקת הזדהות לרב מסר API V2.
 * דורש ב-.env: RESPONDER_CLIENT_ID, RESPONDER_CLIENT_SECRET, RESPONDER_USER_TOKEN
 *
 * שימוש: node scripts/responder-oauth.mjs
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import {
  buildResponderOAuthBody,
  parseResponderOAuthResponse,
  readResponderEnvCredentials,
  RESPONDER_OAUTH_URL,
} from '../lib/responderApi.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
dotenv.config({ path: path.join(root, '.env') })

const creds = readResponderEnvCredentials()
if (!creds) {
  console.error('חסרים משתני סביבה: RESPONDER_CLIENT_ID, RESPONDER_CLIENT_SECRET, RESPONDER_USER_TOKEN')
  process.exit(1)
}

const body = buildResponderOAuthBody(creds)
console.log(`POST ${RESPONDER_OAUTH_URL}`)

const response = await fetch(RESPONDER_OAUTH_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const rawText = await response.text()
let raw = null
try {
  raw = rawText ? JSON.parse(rawText) : null
} catch {
  console.error('תגובה לא תקינה:', rawText)
  process.exit(1)
}

if (!response.ok) {
  console.error(`שגיאה HTTP ${response.status}:`, raw || rawText)
  process.exit(1)
}

const oauth = parseResponderOAuthResponse(raw)
const snapshotPath = path.join(root, '.responder-oauth.json')
await writeFile(snapshotPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')

console.log('הצלחה:', raw.message || 'logged in')
console.log('משתמש:', oauth.username)
console.log('שם:', oauth.name)
console.log('account_id:', oauth.accountId)
console.log('תוקף עד:', new Date(oauth.expiresAt).toISOString())
console.log('Bearer token (ראשית):', `${oauth.accessToken.slice(0, 24)}…`)
console.log(`תגובה מלאה נשמרה ב: ${snapshotPath}`)
