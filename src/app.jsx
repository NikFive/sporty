import { useEffect, useRef, useState } from 'preact/hooks'
import { ATHLETES, mondayOf, plan, today, weeksToRace } from './lib/plan'
import { Day } from './screens/Day'
import { Profile } from './screens/Profile'
import { Plan } from './screens/Plan'
import { Workout } from './screens/Workout'
import { ChevronRight, Flag } from 'lucide-preact'

// Выбранный атлет: cookie на 400 дней + localStorage как запасной вариант.
const KEY = 'sporty.athlete'
const COOKIE = 'athlete'
const readCookie = () => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}
const load = () => {
  const c = readCookie()
  if (c) return c
  try { return localStorage.getItem(KEY) } catch { return null }
}
const save = (v) => {
  document.cookie = `${COOKIE}=${encodeURIComponent(v)}; max-age=${60 * 60 * 24 * 400}; path=/; SameSite=Lax; Secure`
  try { localStorage.setItem(KEY, v) } catch { /* приватный режим */ }
}

// Маршруты: #/  #/day/YYYY-MM-DD  #/d/YYYY-MM-DD/N  #/plan  (#/week/… → день)
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '')
function parseRoute(hash) {
  const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (p[0] === 'plan') return { view: 'plan' }
  if (p[0] === 'me') return { view: 'me' }
  if (p[0] === 'd' && isDate(p[1])) return { view: 'workout', date: p[1], idx: Number(p[2]) || 0 }
  if ((p[0] === 'day' || p[0] === 'week') && isDate(p[1])) return { view: 'day', date: p[0] === 'week' ? mondayOf(p[1]) : p[1] }
  return { view: 'day', date: null }
}

function useRoute(now) {
  const [route, setRoute] = useState(() => ({ ...parseRoute(location.hash), dir: null }))
  const last = useRef(route)
  useEffect(() => {
    const on = () => {
      const r = parseRoute(location.hash)
      const prev = last.current
      // направление анимации при смене дня
      let dir = null
      if (r.view === 'day' && prev.view === 'day') {
        const a = prev.date || today(), b = r.date || today()
        dir = b > a ? 'next' : b < a ? 'prev' : null
      }
      if (r.view !== prev.view || r.view === 'workout') window.scrollTo(0, 0)
      else if (dir) window.scrollTo({ top: 0 })
      last.current = { ...r, dir }
      setRoute({ ...r, dir })
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

// «Сегодня» сам переключается в полночь; после 30+ мин в фоне возвращаемся на сегодня.
function useToday() {
  const [d, setD] = useState(today)
  useEffect(() => {
    let hiddenAt = 0
    const tick = () => setD(today())
    const vis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return }
      tick()
      if (hiddenAt && Date.now() - hiddenAt > 30 * 60_000 && /^#\/day\//.test(location.hash)) location.replace('#/')
    }
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return d
}

export function App() {
  const [athlete, setAthlete] = useState(() => {
    // ?a=vanya — ссылка сразу под атлета
    const fromUrl = new URLSearchParams(location.search).get('a')
    if (ATHLETES.includes(fromUrl)) {
      save(fromUrl)
      history.replaceState(null, '', location.pathname + location.hash)
      return fromUrl
    }
    const v = load()
    return ATHLETES.includes(v) ? v : null
  })
  const now = useToday()
  const route = useRoute(now)
  const pick = (a) => { setAthlete(a); save(a) }
  const weeks = weeksToRace(now)

  if (!athlete)
    return (
      <div class="pick">
        <h1 class="large-title">Кто ты?</h1>
        <div class="card list">
          {ATHLETES.map((a) => (
            <button class="cell" key={a} onClick={() => pick(a)}>
              <span class="pick-name">{plan.athletes[a].name}</span>
              <ChevronRight class="chev" size={18} strokeWidth={2.5} />
            </button>
          ))}
        </div>
        <p class="footnote">Поменять можно в любой момент — вверху экрана</p>
      </div>
    )

  let screen
  if (route.view === 'plan') screen = <Plan athlete={athlete} todayDate={now} />
  else if (route.view === 'me') screen = <Profile athlete={athlete} onPick={pick} />
  else if (route.view === 'workout') screen = <Workout date={route.date} idx={route.idx} athlete={athlete} todayDate={now} />
  else screen = <Day date={route.date || now} athlete={athlete} todayDate={now} dir={route.dir} />

  return (
    <div class="app">
      {route.view === 'day' && (
        <header class="top">
          <a class="who" href="#/me" aria-label="Профиль">
            <span>{plan.athletes[athlete].name}</span>
            <ChevronRight size={20} strokeWidth={2.5} class="who-chev" />
          </a>
          <a class="capsule count" href="#/plan">
            <Flag size={15} strokeWidth={2.25} />
            <span class="num">{weeks} нед</span>
          </a>
        </header>
      )}
      {screen}
    </div>
  )
}
