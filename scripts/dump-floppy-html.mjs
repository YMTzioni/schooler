import axios from 'axios'
import fs from 'node:fs'

const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' }
const page = await axios.get('https://floppydata.com/free-proxy/', { headers, timeout: 15000 })
fs.writeFileSync('scripts/floppy-page.html', page.data)
const text = page.data
const patterns = ['geoxy', 'Authorization', 'authorization', 'Bearer', 'proxies?count']
for (const p of patterns) {
  const idx = text.indexOf(p)
  console.log(p, idx, idx >= 0 ? text.slice(Math.max(0, idx - 40), idx + 120).replace(/\s+/g, ' ') : 'not found')
}
