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
