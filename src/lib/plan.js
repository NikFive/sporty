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
  for (const ref of spec.together || []) items.push({ ...parseRef(ref), together: true })
  for (const ref of spec[athlete] || []) items.push({ ...parseRef(ref), together: false })
  // утро → без времени → вечер; внутри — общие раньше личных (sort стабильный)
  const ORDER = { am: 0, undefined: 1, pm: 2 }
  items.sort((a, b) => ORDER[a.time] - ORDER[b.time])

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
        if (zone === 'alt') continue // сноуборд и т. п. — не тренировочный объём
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

// ── v2: время суток, ключевая зона, формула, ч:мм, соседние тренировки ──

// «run_z2@am» → { id: 'run_z2', time: 'am' }
export function parseRef(ref) {
  const [id, time] = String(ref).split('@')
  return { id, time: time === 'am' || time === 'pm' ? time : undefined }
}
export const TIME_LABEL = { am: 'утро', pm: 'вечер' }

// 0:40, 1:15
export const fmtHM = (m) => {
  m = Math.round(m)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

const ZRANK = { z1: 1, z2: 2, z3: 3, z4: 4, z5: 5 }
export const ZONE_NAME = { z1: 'Z1', z2: 'Z2', z3: 'Z3', z4: 'Z4', z5: 'Z5', str: 'Сила', plyo: 'Прыжки', mob: 'Мобилити', alt: 'Альтернатива' }

/**
 * Ключевая зона тренировки — для цветного квадрата в строке и ленте.
 * Если Z3–Z5 ≥ 15% времени — самая тяжёлая из них, иначе — зона с наибольшим временем.
 * Можно переопределить полем zone: в YAML.
 */
export function keyZone(w) {
  if (!w) return null
  if (w.zone) return w.zone
  const flat = flatSegments(w.segments)
  const total = flat.reduce((a, [m]) => a + m, 0) || 1
  const by = {}
  for (const [m, z] of flat) by[z] = (by[z] || 0) + m
  const hardMin = (by.z3 || 0) + (by.z4 || 0) + (by.z5 || 0)
  if (hardMin / total >= 0.15) return ['z5', 'z4', 'z3'].find((z) => by[z])
  // силовые и прыжки важнее разминочной мобилити
  if (by.str) return 'str'
  if (by.plyo) return 'plyo'
  return Object.entries(by).sort((a, b) => b[1] - a[1])[0][0]
}

const fmtDur = (min) => {
  const s = Math.round(min * 60)
  if (s < 60) return `${s}″`
  return s % 60 ? `${Math.floor(s / 60)}′${s % 60}″` : `${s / 60}′`
}

/** Короткая формула основной части: «5×4′ Z5». Поле formula: в YAML побеждает. */
export function formula(w) {
  if (!w) return ''
  if (w.formula) return w.formula
  const block = (w.segments || []).find((s) => !Array.isArray(s))
  if (!block) return ''
  const hardest = [...block.set].sort((a, b) => (ZRANK[b[1]] || 0) - (ZRANK[a[1]] || 0))[0]
  return `${block.x}×${fmtDur(hardest[0])} ${ZONE_NAME[hardest[1]] || ''}`.trim()
}

/** Самый длинный сегмент — для «основной» в деталях, если интервалов нет. */
export function mainSegment(w) {
  const flat = flatSegments(w?.segments)
  if (!flat.length) return ''
  const [m, z] = [...flat].sort((a, b) => b[0] - a[0])[0]
  return `${Math.round(m)}′ ${ZONE_NAME[z] || ''}`.trim()
}

/** Соседняя тренировка (dir = ±1), через дни. → { date, key, item } | null */
export function neighborSession(date, key, athlete, dir, limit = 21) {
  const day = getDay(date, athlete)
  const i = day.items.findIndex((it) => it.key === key)
  const j = i + dir
  if (i >= 0 && j >= 0 && j < day.items.length) return { date, key: day.items[j].key, item: day.items[j] }
  for (let n = 1; n <= limit; n++) {
    const d = getDay(addDays(date, dir * n), athlete)
    if (d.items.length) {
      const it = dir > 0 ? d.items[0] : d.items[d.items.length - 1]
      return { date: d.date, key: it.key, item: it }
    }
  }
  return null
}

/** Неделя для «Сезона»: минуты по группам зон. */
export function seasonWeeks(athlete) {
  return plan.weeks.map((w, i) => {
    const { days, stats } = getWeek(w.start, athlete)
    const events = [...new Set(days.map((d) => d.event).filter(Boolean))]
    return { n: i + 1, start: w.start, kind: w.kind, template: plan.templates[w.template], phase: phaseOf(w.start), events, stats }
  })
}
