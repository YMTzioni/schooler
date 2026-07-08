#!/usr/bin/env node
/**
 * בדיקת הזדהות ל-Schooler API.
 * דורש ב-.env: SCHOOLER_USER_ID, SCHOOLER_USER_SECRET, SCHOOLER_CLIENT_ID, SCHOOLER_CLIENT_SECRET
 *
 * שימוש: node scripts/schooler-oauth.mjs
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import {
  buildSchoolerPasswordOAuthBody,
  parseSchoolerOAuthResponse,
  readSchoolerEnvCredentials,
  SCHOOLER_OAUTH_URL,
} from '../lib/schoolerApi.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
dotenv.config({ path: path.join(root, '.env') })

const creds = readSchoolerEnvCredentials()
if (!creds) {
  console.error(
    'חסרים משתני סביבה: SCHOOLER_USER_ID, SCHOOLER_USER_SECRET, SCHOOLER_CLIENT_ID, SCHOOLER_CLIENT_SECRET',
  )
  process.exit(1)
}

const body = buildSchoolerPasswordOAuthBody(creds)
console.log(`POST ${SCHOOLER_OAUTH_URL}`)
console.log(`User ID: ${creds.userId}`)

const response = await fetch(SCHOOLER_OAUTH_URL, {
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

const oauth = parseSchoolerOAuthResponse(raw)
const snapshotPath = path.join(root, '.schooler-oauth.json')
await writeFile(snapshotPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')

console.log('הצלחה')
console.log('token_type:', oauth.tokenType)
console.log('expires_in:', oauth.expiresIn, 'שניות')
console.log('תוקף עד:', new Date(oauth.expiresAt).toISOString())
console.log('refresh_token (ראשית):', oauth.refreshToken ? `${oauth.refreshToken.slice(0, 20)}…` : '—')
console.log('access_token (ראשית):', `${oauth.accessToken.slice(0, 24)}…`)
console.log(`תגובה מלאה נשמרה ב: ${snapshotPath}`)
