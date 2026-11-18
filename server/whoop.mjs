// WHOOP-бэкенд Sporty: OAuth 2.0 + выдача «сегодняшних» показателей в PWA.
// Без зависимостей, Node ≥ 20. Запуск: node server/whoop.mjs (systemd: server/sporty-api.service).
//
// Окружение (/etc/sporty/whoop.env):
//   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET — из developer-dashboard.whoop.com
//   PUBLIC_URL=https://72-56-96-233.sslip.io  (redirect = PUBLIC_URL/api/whoop/callback)
//   PORT=8787, DATA_DIR=/var/lib/sporty
//
// Доступ: аккаунтов нет. Телефон генерирует случайный device-ключ и передаёт его при подключении;
// после успешного OAuth этот ключ (sha256) получает право читать данные атлета. Без ключа — 401.

import { createServer } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const {
  WHOOP_CLIENT_ID = '',
  WHOOP_CLIENT_SECRET = '',
  PUBLIC_URL = 'https://72-56-96-233.sslip.io',
  PORT = '8787',
  DATA_DIR = '/var/lib/sporty',
} = process.env

const ATHLETES = ['nikita', 'vanya']
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const API = 'https://api.prod.whoop.com/developer'
const SCOPES = 'offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement'
const REDIRECT_URI = `${PUBLIC_URL}/api/whoop/callback`
const CACHE_MS = 5 * 60_000

// ───────── хранилище: один JSON-файл, атомарная запись ─────────
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
const DB_FILE = join(DATA_DIR, 'whoop.json')
let db = { athletes: {} }
try { db = JSON.parse(readFileSync(DB_FILE, 'utf8')) } catch { /* первый запуск */ }
function persist() {
  const tmp = DB_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 })
  renameSync(tmp, DB_FILE)
}

const sha = (s) => createHash('sha256').update(String(s)).digest('hex')
const log = (...a) => console.log(new Date().toISOString(), ...a)

// state OAuth живёт 15 минут в памяти
const pending = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of pending) if (now - v.at > 15 * 60_000) pending.delete(k)
}, 60_000).unref()

function deviceAllowed(rec, device) {
  if (!rec || !device || device.length < 16) return false
  const h = Buffer.from(sha(device))
  return (rec.devices || []).some((d) => {
    const b = Buffer.from(d)
    return b.length === h.length && timingSafeEqual(b, h)
  })
}

// ───────── токены ─────────
async function tokenRequest(params) {
  const body = new URLSearchParams({ client_id: WHOOP_CLIENT_ID, client_secret: WHOOP_CLIENT_SECRET, ...params })
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  const text = await r.text()
  if (!r.ok) throw Object.assign(new Error(`token ${r.status}: ${text.slice(0, 300)}`), { status: r.status })
  const j = JSON.parse(text)
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000,
    scope: j.scope,
  }
}

const refreshing = new Map()
async function accessToken(athlete) {
  const rec = db.athletes[athlete]
  if (!rec?.tokens) throw Object.assign(new Error('not connected'), { status: 409 })
  if (rec.tokens.expires_at - Date.now() > 60_000) return rec.tokens.access_token
  if (!rec.tokens.refresh_token) throw Object.assign(new Error('token expired, reconnect'), { status: 409 })
  // WHOOP ротирует refresh_token — обновляем строго по одному на атлета
  if (!refreshing.has(athlete)) {
    refreshing.set(athlete, (async () => {
      try {
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: rec.tokens.refresh_token, scope: 'offline' })
        rec.tokens = { ...t, refresh_token: t.refresh_token || rec.tokens.refresh_token }
        persist()
        log('refreshed', athlete)
      } catch (e) {
        if (e.status === 400 || e.status === 401) { rec.tokens = null; rec.error = 'refresh failed'; persist() }
        throw e
      } finally { refreshing.delete(athlete) }
    })())
  }
  await refreshing.get(athlete)
  return db.athletes[athlete].tokens.access_token
}

async function whoop(athlete, path, query = {}) {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v)
  let token = await accessToken(athlete)
  let r = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  if (r.status === 401) {
    db.athletes[athlete].tokens.expires_at = 0
    token = await accessToken(athlete)
    r = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  }
  if (!r.ok) throw Object.assign(new Error(`whoop ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: 502 })
  return r.json()
}

// ───────── сводка «на сегодня» ─────────
const hours = (ms) => (ms == null ? null : Math.round((ms / 3_600_000) * 10) / 10)
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)

async function summary(athlete) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [rec1, sleeps, cycles] = await Promise.all([
    whoop(athlete, '/v2/recovery', { limit: 25, start: since }),
    whoop(athlete, '/v2/activity/sleep', { limit: 10 }),
    whoop(athlete, '/v2/cycle', { limit: 3 }),
  ])
  let recs = rec1.records || []
  if (rec1.next_token) {
    const more = await whoop(athlete, '/v2/recovery', { limit: 25, start: since, nextToken: rec1.next_token })
    recs = recs.concat(more.records || [])
  }
  const scored = recs.filter((r) => r.score_state === 'SCORED' && r.score)
  const last = scored[0] || null
  // базовые значения — по предыдущим дням (без сегодняшнего), чтобы сравнивать «сегодня vs обычно»
  const prev = scored.slice(1)
  const baseline = {
    hrv: round(mean(prev.map((r) => r.score.hrv_rmssd_milli).filter(Boolean)), 1),
    rhr: round(mean(prev.map((r) => r.score.resting_heart_rate).filter(Boolean)), 1),
    recovery: round(mean(prev.slice(0, 7).map((r) => r.score.recovery_score))),
    days: prev.length,
  }

  const sleep = (sleeps.records || []).find((s) => !s.nap && s.score_state === 'SCORED' && s.score) || null
  const st = sleep?.score?.stage_summary
  const need = sleep?.score?.sleep_needed
  const asleepMs = st ? st.total_light_sleep_time_milli + st.total_slow_wave_sleep_time_milli + st.total_rem_sleep_time_milli : null
  const needMs = need ? need.baseline_milli + need.need_from_sleep_debt_milli + need.need_from_recent_strain_milli - (need.need_from_recent_nap_milli || 0) : null

  const cyc = cycles.records || []
  const current = cyc[0] || null
  const yesterday = cyc.find((c) => c.end && c.score_state === 'SCORED') || null

  return {
    athlete,
    profile: db.athletes[athlete]?.profile || null,
    fetchedAt: new Date().toISOString(),
    recovery: last && {
      score: round(last.score.recovery_score),
      hrv: round(last.score.hrv_rmssd_milli, 1),
      rhr: round(last.score.resting_heart_rate),
      spo2: round(last.score.spo2_percentage, 1),
      skinTemp: round(last.score.skin_temp_celsius, 1),
      calibrating: !!last.score.user_calibrating,
      at: last.created_at,
      cycleStart: cyc.find((c) => c.id === last.cycle_id)?.start || null,
    },
    pendingRecovery: recs[0] && recs[0].score_state !== 'SCORED' ? recs[0].score_state : null,
    baseline,
    history: scored.slice(0, 14).map((r) => ({ at: r.created_at, score: round(r.score.recovery_score), hrv: round(r.score.hrv_rmssd_milli, 1) })),
    sleep: sleep && {
      performance: round(sleep.score.sleep_performance_percentage),
      efficiency: round(sleep.score.sleep_efficiency_percentage),
      consistency: round(sleep.score.sleep_consistency_percentage),
      respiratoryRate: round(sleep.score.respiratory_rate, 1),
      hours: hours(asleepMs),
      needHours: hours(needMs),
      deepHours: hours(st?.total_slow_wave_sleep_time_milli),
      remHours: hours(st?.total_rem_sleep_time_milli),
      start: sleep.start,
      end: sleep.end,
    },
    strain: {
      today: round(current?.score?.strain, 1),
      yesterday: yesterday && yesterday !== current ? round(yesterday.score?.strain, 1) : null,
    },
  }
}

// ───────── HTTP ─────────
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string'
  res.writeHead(status, {
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(isJson ? JSON.stringify(body) : body)
}
const redirect = (res, to) => send(res, 302, '', { location: to })
const back = (res, params) => redirect(res, `${PUBLIC_URL}/?${new URLSearchParams(params)}#/me`)

const cache = new Map()

function readJson(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy() }
      else chunks.push(c)
    })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch { reject(Object.assign(new Error('bad json'), { status: 400 })) } })
    req.on('error', reject)
  })
}

// Отметки «Сделано»: { "YYYY-MM-DD:workout_id": { d: 1|0, at: ms } }, слияние last-write-wins по at.
const DONE_KEY = /^\d{4}-\d{2}-\d{2}:[a-z0-9_]{1,80}$/
function mergeDone(rec, items) {
  const done = (rec.done ||= {})
  const now = Date.now()
  let changed = 0
  for (const [k, v] of Object.entries(items || {})) {
    if (!DONE_KEY.test(k) || !v || typeof v.at !== 'number') continue
    const at = Math.min(v.at, now + 60_000)
    if (!done[k] || at > done[k].at) { done[k] = { d: v.d ? 1 : 0, at }; changed++ }
  }
  if (changed) persist()
  return done
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname.replace(/\/+$/, '')
  const q = Object.fromEntries(url.searchParams)
  const device = req.headers['x-sporty-device'] || q.device
  const athlete = q.athlete

  if (p === '/api/health') return send(res, 200, { ok: true, configured: !!(WHOOP_CLIENT_ID && WHOOP_CLIENT_SECRET) })

  if (p === '/api/whoop/connect') {
    if (!WHOOP_CLIENT_ID) return send(res, 503, 'WHOOP ещё не настроен на сервере')
    if (!ATHLETES.includes(athlete) || !device || device.length < 16) return send(res, 400, 'bad athlete/device')
    const state = randomBytes(16).toString('hex')
    pending.set(state, { athlete, device, at: Date.now() })
    const u = new URL(AUTH_URL)
    u.search = new URLSearchParams({ response_type: 'code', client_id: WHOOP_CLIENT_ID, redirect_uri: REDIRECT_URI, scope: SCOPES, state }).toString()
    return redirect(res, u.toString())
  }

  if (p === '/api/whoop/callback') {
    const st = pending.get(q.state)
    pending.delete(q.state)
    if (q.error) return back(res, { whoop: 'error', reason: q.error_description || q.error })
    if (!st || !q.code) return back(res, { whoop: 'error', reason: 'state' })
    try {
      const tokens = await tokenRequest({ grant_type: 'authorization_code', code: q.code, redirect_uri: REDIRECT_URI })
      const rec = (db.athletes[st.athlete] ||= { devices: [] })
      rec.tokens = tokens
      rec.error = null
      rec.connectedAt = new Date().toISOString()
      const h = sha(st.device)
      if (!rec.devices.includes(h)) rec.devices.push(h)
      rec.devices = rec.devices.slice(-10)
      persist()
      try {
        const pr = await whoop(st.athlete, '/v2/user/profile/basic')
        rec.profile = { userId: pr.user_id, firstName: pr.first_name, lastName: pr.last_name }
        persist()
      } catch (e) { log('profile', e.message) }
      cache.delete(st.athlete)
      log('connected', st.athlete)
      return back(res, { whoop: 'ok' })
    } catch (e) {
      log('callback', e.message)
      return back(res, { whoop: 'error', reason: 'token' })
    }
  }

  if (!ATHLETES.includes(athlete)) return send(res, 400, { error: 'bad athlete' })
  const rec = db.athletes[athlete]

  if (p === '/api/whoop/status') {
    return send(res, 200, {
      configured: !!WHOOP_CLIENT_ID,
      connected: !!rec?.tokens,
      authorized: deviceAllowed(rec, device),
      profile: deviceAllowed(rec, device) ? rec?.profile || null : null,
      error: rec?.error || null,
    })
  }

  if (!deviceAllowed(rec, device)) return send(res, 401, { error: 'device not authorized' })

  if (p === '/api/whoop/today') {
    const c = cache.get(athlete)
    if (c && Date.now() - c.at < CACHE_MS && q.fresh !== '1') return send(res, 200, c.data)
    try {
      const data = await summary(athlete)
      cache.set(athlete, { at: Date.now(), data })
      return send(res, 200, data)
    } catch (e) {
      log('today', athlete, e.message)
      if (c) return send(res, 200, { ...c.data, stale: true })
      return send(res, e.status === 409 ? 409 : 502, { error: e.message })
    }
  }

  if (p === '/api/done') {
    if (req.method === 'POST') {
      const body = await readJson(req).catch((e) => e)
      if (body instanceof Error) return send(res, body.status || 400, { error: body.message })
      return send(res, 200, { items: mergeDone(rec, body.items) })
    }
    return send(res, 200, { items: rec.done || {} })
  }

  if (p === '/api/whoop/disconnect' && req.method === 'POST') {
    try {
      if (rec.tokens) await fetch(API + '/v2/user/access', { method: 'DELETE', headers: { authorization: `Bearer ${await accessToken(athlete)}` } })
    } catch (e) { log('revoke', e.message) }
    // отметки «Сделано» оставляем — это история тренировок, а не данные WHOOP
    db.athletes[athlete] = { devices: [], done: rec.done || {} }
    cache.delete(athlete)
    persist()
    return send(res, 200, { ok: true })
  }

  return send(res, 404, { error: 'not found' })
}

createServer((req, res) => {
  handle(req, res).catch((e) => { log('error', e); if (!res.headersSent) send(res, 500, { error: 'internal' }) })
}).listen(Number(PORT), '127.0.0.1', () => log(`sporty-api on :${PORT}, redirect ${REDIRECT_URI}, configured=${!!WHOOP_CLIENT_ID}`))
