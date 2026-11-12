import { useEffect, useState } from 'preact/hooks'

// Отметки «Сделано»: хранятся только на этом телефоне (localStorage), без синхронизации.
// Ключ: атлет:дата:id тренировки — переживает перестановку тренировок внутри дня.
const KEY = 'sporty.done'
const EVT = 'sporty:done'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
function write(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* приватный режим */ }
}

const k = (athlete, date, id) => `${athlete}:${date}:${id}`

export const isDone = (athlete, date, id) => !!read()[k(athlete, date, id)]

export function toggleDone(athlete, date, id) {
  const map = read()
  const key = k(athlete, date, id)
  if (map[key]) delete map[key]
  else map[key] = Date.now()
  write(map)
  dispatchEvent(new Event(EVT))
  try { navigator.vibrate?.(10) } catch { /* нет вибро */ }
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
