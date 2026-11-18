import { useEffect, useState } from 'preact/hooks'
import { deviceKey } from './whoop'

// Отметки «Сделано». Источник правды — сервер (/api/done), localStorage — кэш и офлайн-очередь.
// Ключ: атлет:дата:id тренировки — переживает перестановку тренировок внутри дня.
// Значение: { d: 1|0, at: ms, p?: 1 } — сделано/снято, когда, «ещё не отправлено на сервер».
// Слияние last-write-wins по at, поэтому снятая галочка тоже синхронизируется.
// Сервер принимает запись только с телефона, подключённого к WHOOP этого атлета;
// без подключения отметки живут только на телефоне, как раньше.
const KEY = 'sporty.done'
const EVT = 'sporty:done'

function read() {
  let map
  try { map = JSON.parse(localStorage.getItem(KEY) || '{}') } catch { map = {} }
  // старый формат: ключ → timestamp (только «сделано»)
  for (const [k, v] of Object.entries(map)) if (typeof v === 'number') map[k] = { d: 1, at: v, p: 1 }
  return map
}
function write(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* приватный режим */ }
}

const k = (athlete, date, id) => `${athlete}:${date}:${id}`

export const isDone = (athlete, date, id) => read()[k(athlete, date, id)]?.d === 1

export function toggleDone(athlete, date, id) {
  const map = read()
  const key = k(athlete, date, id)
  map[key] = { d: map[key]?.d === 1 ? 0 : 1, at: Date.now(), p: 1 }
  write(map)
  dispatchEvent(new Event(EVT))
  try { navigator.vibrate?.(10) } catch { /* нет вибро */ }
  scheduleSync(athlete)
}

// ───────── синхронизация ─────────
let timer = null
let running = null

function scheduleSync(athlete, delay = 400) {
  clearTimeout(timer)
  timer = setTimeout(() => syncDone(athlete), delay)
}

/** Отправить неотправленное и подтянуть серверные отметки атлета. Тихо ничего не делает без сети/доступа. */
export function syncDone(athlete) {
  if (running) return running.then(() => syncDone(athlete))
  running = (async () => {
    const dev = deviceKey()
    if (!dev || !navigator.onLine) return
    const prefix = `${athlete}:`
    const local = read()
    const pending = {}
    for (const [key, v] of Object.entries(local)) if (key.startsWith(prefix) && v.p) pending[key.slice(prefix.length)] = { d: v.d, at: v.at }
    const has = Object.keys(pending).length > 0
    const r = await fetch(`/api/done?athlete=${athlete}`, {
      method: has ? 'POST' : 'GET',
      headers: { 'x-sporty-device': dev, ...(has ? { 'content-type': 'application/json' } : {}) },
      body: has ? JSON.stringify({ items: pending }) : undefined,
      cache: 'no-store',
    }).catch(() => null)
    if (!r?.ok) return
    const { items = {} } = await r.json().catch(() => ({}))
    // сливаем: сервер уже учёл наши pending; локальные правки, сделанные во время запроса, не трогаем
    const now = read()
    let changed = false
    for (const [sk, sv] of Object.entries(items)) {
      const key = prefix + sk
      const lv = now[key]
      if (lv?.p && lv.at > sv.at) continue
      if (!lv || lv.d !== sv.d || lv.at !== sv.at || lv.p) { now[key] = { d: sv.d, at: sv.at }; changed = true }
    }
    if (changed) { write(now); dispatchEvent(new Event(EVT)) }
  })().finally(() => { running = null })
  return running
}

/** Синхронизация при старте, возврате в приложение и появлении сети. */
export function useDoneSync(athlete) {
  useEffect(() => {
    if (!athlete) return
    syncDone(athlete)
    const vis = () => !document.hidden && syncDone(athlete)
    const online = () => syncDone(athlete)
    const whoop = () => syncDone(athlete) // только что подключили WHOOP — можно залить накопленное
    document.addEventListener('visibilitychange', vis)
    addEventListener('online', online)
    addEventListener('sporty:whoop', whoop)
    return () => {
      document.removeEventListener('visibilitychange', vis)
      removeEventListener('online', online)
      removeEventListener('sporty:whoop', whoop)
    }
  }, [athlete])
}

// Перерисовать компонент, когда отметки изменились (в т. ч. в другой вкладке).
export function useDoneVersion() {
  const [v, setV] = useState(0)
  useEffect(() => {
    const on = () => setV((x) => x + 1)
    addEventListener(EVT, on)
    addEventListener('storage', on)
    return () => { removeEventListener(EVT, on); removeEventListener('storage', on) }
  }, [])
  return v
}
