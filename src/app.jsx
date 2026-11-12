import { useEffect, useState } from 'preact/hooks'
import { ATHLETES, mondayOf, plan, today, weeksToRace } from './lib/plan'
import { Today } from './screens/Today'
import { Week } from './screens/Week'
import { Plan } from './screens/Plan'
import { Workout } from './screens/Workout'

const KEY = 'sporty.athlete'
const load = () => {
  try { return localStorage.getItem(KEY) } catch { return null }
}
const save = (v) => {
  try { localStorage.setItem(KEY, v) } catch { /* приватный режим */ }
}

// Маршруты: #/  #/day/YYYY-MM-DD  #/week/YYYY-MM-DD  #/plan  #/d/YYYY-MM-DD/N
function parseRoute(hash) {
  const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const dateOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '')
  if (p[0] === 'week' && dateOk(p[1])) return { tab: 'week', date: mondayOf(p[1]) }
  if (p[0] === 'week') return { tab: 'week', date: null }
  if (p[0] === 'plan') return { tab: 'plan' }
  if (p[0] === 'day' && dateOk(p[1])) return { tab: 'today', date: p[1] }
  if (p[0] === 'd' && dateOk(p[1])) return { tab: 'workout', date: p[1], idx: Number(p[2]) || 0 }
  return { tab: 'today', date: null }
}

function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  useEffect(() => {
    const on = () => { setRoute(parseRoute(location.hash)); window.scrollTo(0, 0) }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

// «Сегодня» меняется, если приложение открыто через полночь или вернулось из фона.
function useToday() {
  const [d, setD] = useState(today)
  useEffect(() => {
    const tick = () => setD(today())
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
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
  const route = useRoute()
  const now = useToday()

  const pick = (a) => { setAthlete(a); save(a) }

  if (!athlete)
    return (
      <div class="pick">
        <div class="eyebrow mono">{plan.race.title} · {weeksToRace(now)} недель</div>
        <h1 class="display">Кто тренируется?</h1>
        <div class="pick-list">
          {ATHLETES.map((a) => (
            <button class="pick-btn" key={a} onClick={() => pick(a)}>{plan.athletes[a].name}</button>
          ))}
        </div>
        <p class="muted small">Запомним на этом устройстве. Сменить можно вверху экрана.</p>
      </div>
    )

  let screen
  if (route.tab === 'week') screen = <Week monday={route.date || mondayOf(now)} athlete={athlete} todayDate={now} />
  else if (route.tab === 'plan') screen = <Plan athlete={athlete} todayDate={now} />
  else if (route.tab === 'workout') screen = <Workout date={route.date} idx={route.idx} athlete={athlete} />
  else screen = <Today date={route.date || now} athlete={athlete} isToday={!route.date || route.date === now} />

  const tab = route.tab === 'workout' ? null : route.tab

  return (
    <div class="app">
      <header class="top">
        <a class="brand mono" href="#/">sporty</a>
        <div class="switch" role="tablist" aria-label="Атлет">
          {ATHLETES.map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={a === athlete}
              class={a === athlete ? 'on' : ''}
              onClick={() => pick(a)}
            >
              {plan.athletes[a].name}
            </button>
          ))}
        </div>
      </header>

      {screen}

      <nav class="tabs mono">
        <a href="#/" class={tab === 'today' ? 'on' : ''}>Сегодня</a>
        <a href="#/week" class={tab === 'week' ? 'on' : ''}>Неделя</a>
        <a href="#/plan" class={tab === 'plan' ? 'on' : ''}>План</a>
      </nav>
    </div>
  )
}
