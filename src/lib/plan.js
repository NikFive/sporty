import raw from '../data/plan.yaml'

// ── даты: всё в локальном времени, формат YYYY-MM-DD ──
const pad = (n) => String(n).padStart(2, '0')
export const iso = (d) =>
  d instanceof Date ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : String(d)
export const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
export const today = () => iso(new Date())
export const mondayOf = (s) => {
  const d = parse(s)
  const shift = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - shift)
  return iso(d)
}
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000)

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const DAY_LONG = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export const dayIndex = (s) => (parse(s).getDay() + 6) % 7

export const fmtDate = (s) => {
  const d = parse(s)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}
export const fmtRange = (a, b) => {
  const da = parse(a), db = parse(b)
  return da.getMonth() === db.getMonth()
    ? `${da.getDate()}–${db.getDate()} ${MONTHS_GEN[db.getMonth()]}`
    : `${da.getDate()} ${MONTHS_SHORT[da.getMonth()]} – ${db.getDate()} ${MONTHS_SHORT[db.getMonth()]}`
}
export const fmtMin = (m) => {
  m = Math.round(m)
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} ч ${r} мин` : `${h} ч`
}

// ── нормализация данных (YAML может отдать даты как Date) ──
const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)

export const plan = {
  ...raw,
  race: { ...raw.race, date: norm(raw.race.date) },
  phases: raw.phases.map((p) => ({ ...p, start: norm(p.start), end: norm(p.end) })),
  milestones: (raw.milestones || []).map((m) => ({ ...m, date: norm(m.date) })),
  events: (raw.events || []).map((e) => ({ ...e, start: norm(e.start), end: norm(e.end) })),
  weeks: raw.weeks.map((w) => ({ ...w, start: norm(w.start) })),
}

export const ATHLETES = Object.keys(plan.athletes)
export const PLAN_START = plan.weeks[0].start
export const PLAN_END = plan.race.date
export const DELOAD_SCALE = 0.7

// ── сегменты → плоский список [минуты, зона] ──
export function flatSegments(segments = []) {
  const out = []
  for (const s of segments) {
    if (Array.isArray(s)) out.push([s[0], s[1]])
    else for (let i = 0; i < s.x; i++) for (const t of s.set) out.push([t[0], t[1]])
  }
  return out
}
export const workoutMinutes = (w) => flatSegments(w.segments).reduce((a, [m]) => a + m, 0)

export function getWorkout(id) {
  const w = plan.workouts[id]
  if (!w) return null
  return { id, ...w, minutes: workoutMinutes(w) }
}

export const SPORT = {
  run: 'Бег',
  bike: 'Вел',
  swim: 'Плавание',
  brick: 'Брик',
  strength: 'Силовая',
  plyo: 'Плиометрика',
  mobility: 'Мобилити',
  alt: 'Альтернатива',
  race: 'Старт',
}

// ── лукапы ──
export const phaseOf = (date) => plan.phases.find((p) => date >= p.start && date <= p.end) || null
export const weekOf = (date) => {
  const m = mondayOf(date)
  return plan.weeks.find((w) => w.start === m) || null
}
export const eventOf = (date) => plan.events.find((e) => date >= e.start && date <= e.end) || null
export const weekNumber = (date) => {
  const i = plan.weeks.findIndex((w) => w.start === mondayOf(date))
  return i < 0 ? null : i + 1
}

/**
 * Что делать в этот день.
 * → { date, rest, outside, event, week, phase, template, items: [{ workout, together, key }] }
 */
export function getDay(date, athlete) {
  const week = weekOf(date)
  const phase = phaseOf(date)
  const event = eventOf(date)
  const base = { date, week, phase, event, template: week ? plan.templates[week.template] : null }

  let spec
  if (event?.day) spec = event.day
  else if (!week) return { ...base, outside: true, rest: false, items: [] }
  else spec = base.template.days[DAY_KEYS[dayIndex(date)]]

  if (spec === 'rest' || spec == null) return { ...base, rest: true, items: [] }

  const scale = week?.kind === 'deload' && !event ? DELOAD_SCALE : 1
  const items = []
  for (const id of spec.together || []) items.push({ id, together: true })
  for (const id of spec[athlete] || []) items.push({ id, together: false })

  return {
    ...base,
    rest: false,
    scale,
    items: items.map((it, i) => {
      const w = getWorkout(it.id)
      const minutes = !w ? 0 : scale === 1 ? Math.round(w.minutes) : Math.max(5, Math.round((w.minutes * scale) / 5) * 5)
      return { ...it, key: i, workout: w, minutes }
    }),
  }
}

export function getWeek(monday, athlete) {
  const days = DAY_KEYS.map((_, i) => getDay(addDays(monday, i), athlete))
  return { monday, days, week: weekOf(monday), stats: weekStats(days) }
}

// Распределение минут по зонам — проверяем 80/20 прямо на данных плана.
export function weekStats(days) {
  const z = { easy: 0, grey: 0, hard: 0, str: 0, other: 0 }
  let total = 0, sessions = 0
  for (const d of days)
    for (const it of d.items) {
      if (!it.workout) continue
      sessions++
      const k = d.scale || 1
      for (const [m, zone] of flatSegments(it.workout.segments)) {
        const mm = m * k
        total += mm
        if (zone === 'z1' || zone === 'z2') z.easy += mm
        else if (zone === 'z3') z.grey += mm
        else if (zone === 'z4' || zone === 'z5') z.hard += mm
        else if (zone === 'str' || zone === 'plyo') z.str += mm
        else z.other += mm
      }
    }
  const cardio = z.easy + z.grey + z.hard
  return { ...z, total, sessions, cardio, easyPct: cardio ? Math.round((z.easy / cardio) * 100) : 0 }
}

export const weeksToRace = (date) => Math.max(0, Math.ceil(daysBetween(date, plan.race.date) / 7))

export function nextTraining(date, athlete, limit = 14) {
  for (let i = 1; i <= limit; i++) {
    const d = getDay(addDays(date, i), athlete)
    if (d.items.length) return d
  }
  return null
}
