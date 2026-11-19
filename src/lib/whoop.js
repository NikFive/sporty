import { useEffect, useState } from 'preact/hooks'

// Клиент WHOOP-бэкенда (server/whoop.mjs, /api/whoop/*).
// Телефон получает случайный device-ключ; после OAuth сервер разрешает этому ключу читать данные атлета.
// Последний ответ кэшируем в localStorage — карточка видна сразу и офлайн.

const DEV_KEY = 'sporty.device'
const CACHE_KEY = (a) => `sporty.whoop.${a}`
const EVT = 'sporty:whoop'

export function deviceKey() {
  try {
    let k = localStorage.getItem(DEV_KEY)
    if (!k) {
      const b = new Uint8Array(24)
      crypto.getRandomValues(b)
      k = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
      localStorage.setItem(DEV_KEY, k)
    }
    return k
  } catch {
    return null
  }
}

const readCache = (a) => { try { return JSON.parse(localStorage.getItem(CACHE_KEY(a)) || 'null') } catch { return null } }
const writeCache = (a, v) => { try { v ? localStorage.setItem(CACHE_KEY(a), JSON.stringify(v)) : localStorage.removeItem(CACHE_KEY(a)) } catch { /* приватный режим */ } }

async function api(path, athlete, opts = {}) {
  const r = await fetch(`/api/whoop/${path}?athlete=${athlete}`, { ...opts, headers: { 'x-sporty-device': deviceKey() || '' }, cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data: j }
}

export const connectUrl = (athlete) => `/api/whoop/connect?athlete=${athlete}&device=${deviceKey()}`

export async function disconnect(athlete) {
  await api('disconnect', athlete, { method: 'POST' })
  writeCache(athlete, null)
  dispatchEvent(new Event(EVT))
}

/** Статус подключения: { configured, connected, authorized, profile } | null (нет сети/сервера). */
export function useWhoopStatus(athlete) {
  const [s, setS] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => api('status', athlete).then((r) => alive && setS(r.ok ? r.data : null)).catch(() => alive && setS(null))
    load()
    const vis = () => !document.hidden && load()
    document.addEventListener('visibilitychange', vis)
    addEventListener(EVT, load)
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); removeEventListener(EVT, load) }
  }, [athlete])
  return s
}

/**
 * Данные на сегодня: { data, state } где state = 'loading' | 'ok' | 'off' (не подключено) | 'error'.
 * Сначала отдаём кэш, потом обновляем с сервера; повторно — при возврате в приложение.
 */
export function useWhoop(athlete) {
  const [st, setSt] = useState(() => {
    const c = readCache(athlete)
    return { data: c, state: c ? 'ok' : 'loading' }
  })
  useEffect(() => {
    let alive = true
    let last = 0
    setSt(() => { const c = readCache(athlete); return { data: c, state: c ? 'ok' : 'loading' } })
    const load = async (fresh = false) => {
      if (Date.now() - last < 30_000 && !fresh) return
      last = Date.now()
      try {
        const r = await api('today', athlete + (fresh ? '&fresh=1' : ''))
        if (!alive) return
        if (r.ok) { writeCache(athlete, r.data); setSt({ data: r.data, state: 'ok' }) }
        else if (r.status === 401 || r.status === 409) { writeCache(athlete, null); setSt({ data: null, state: 'off' }) }
        else setSt((p) => ({ ...p, state: p.data ? 'ok' : 'error' }))
      } catch {
        if (alive) setSt((p) => ({ ...p, state: p.data ? 'ok' : 'error' }))
      }
    }
    load(true)
    const vis = () => !document.hidden && load()
    const on = () => load(true)
    document.addEventListener('visibilitychange', vis)
    addEventListener(EVT, on)
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); removeEventListener(EVT, on) }
  }, [athlete])
  return st
}

// ───────── ИИ-тренер ─────────
const COACH_EVT = 'sporty:coach'
const COACH_CACHE = (a) => `sporty.coach.${a}`

export async function coachFeedback(athlete, body) {
  await fetch(`/api/coach/feedback?athlete=${athlete}`, {
    method: 'POST', headers: { 'x-sporty-device': deviceKey() || '', 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => null)
  dispatchEvent(new Event(COACH_EVT))
}

/** Решение тренера на сегодня: { status: 'ok'|'none'|'error'|..., running, decision, feedback, recovery, costUsd } | null */
export function useCoach(athlete) {
  // undefined — ещё грузим (не рисуем правила раньше тренера), null — сервер ответил ошибкой.
  // Без сети держим последний ответ из кэша. stalled — тренер «думает» дольше 5 мин: показываем правила.
  const fromCache = (a) => { try { const v = JSON.parse(localStorage.getItem(COACH_CACHE(a)) || 'null'); return v ? { ...v, athlete: a } : undefined } catch { return undefined } }
  const [st, setSt] = useState(() => fromCache(athlete))
  useEffect(() => {
    let alive = true, timer = null, polls = 0
    setSt(fromCache(athlete))
    const load = async () => {
      clearTimeout(timer)
      const r = await fetch(`/api/coach/today?athlete=${athlete}`, { headers: { 'x-sporty-device': deviceKey() || '' }, cache: 'no-store' }).catch(() => null)
      if (!alive) return
      if (!r) { setSt((p) => (p === undefined ? null : p)); return } // нет сети — остаёмся на кэше, без кэша — правила
      if (!r.ok) { setSt(null); return }
      const j = await r.json().catch(() => null)
      if (!alive || !j) return
      const waiting = j.running || j.status === 'none'
      if (waiting && polls >= 20) { setSt({ ...j, athlete, stalled: true }); return }
      setSt({ ...j, athlete })
      try { localStorage.setItem(COACH_CACHE(athlete), JSON.stringify(j)) } catch { /* приватный режим */ }
      if (waiting) { polls++; timer = setTimeout(load, 15_000) }
    }
    load()
    const again = () => { polls = 0; load() }
    const vis = () => { if (!document.hidden) again() }
    document.addEventListener('visibilitychange', vis)
    addEventListener(COACH_EVT, load)
    addEventListener(EVT, again)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', vis); removeEventListener(COACH_EVT, load); removeEventListener(EVT, again) }
  }, [athlete])
  if (st && st.athlete !== athlete) return undefined // другой атлет: ждём его ответ
  // кэш вчерашнего дня не показываем
  return st && st.date !== new Date().toLocaleDateString('en-CA') ? { ...st, status: 'none', decision: null, at: null } : st
}
