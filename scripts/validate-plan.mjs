#!/usr/bin/env node
// Проверка src/data/plan.yaml на целостность. Запуск: npm run validate
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'

const FILE = fileURLToPath(new URL('../src/data/plan.yaml', import.meta.url))
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const ZONES = new Set(['z1', 'z2', 'z3', 'z4', 'z5', 'str', 'plyo', 'mob', 'alt'])
const SLOTS = ['together', 'nikita', 'vanya']

const errors = []
const err = (msg) => errors.push(msg)

let plan
try {
  plan = loadYaml(readFileSync(FILE, 'utf8'))
} catch (e) {
  console.error(`✗ Не удалось прочитать plan.yaml:\n  ${e.message}`)
  process.exit(1)
}

// ── даты: YAML может отдать Date, строку или мусор ──
const pad = (n) => String(n).padStart(2, '0')
function toISO(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) return v
  }
  return null
}
const utc = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const isMonday = (s) => new Date(utc(s)).getUTCDay() === 1
const addDays = (s, n) => toISO(new Date(utc(s) + n * 86400000))

const workouts = plan?.workouts ?? {}
const templates = plan?.templates ?? {}
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

if (!isObj(workouts)) err('Раздел «workouts» отсутствует или не является словарём.')
if (!isObj(templates)) err('Раздел «templates» отсутствует или не является словарём.')

// ── ссылки на тренировки в спецификации дня ──
function checkDaySpec(spec, where) {
  if (spec === 'rest' || spec == null) return
  if (!isObj(spec)) return err(`${where}: ожидается «rest» или объект { together, nikita, vanya }, а получено ${JSON.stringify(spec)}.`)
  for (const key of Object.keys(spec)) {
    if (!SLOTS.includes(key)) err(`${where}: неизвестный ключ «${key}» (допустимы: ${SLOTS.join(', ')}).`)
  }
  for (const slot of SLOTS) {
    const ids = spec[slot]
    if (ids == null) continue
    if (!Array.isArray(ids)) {
      err(`${where}.${slot}: ожидается список тренировок, а получено ${JSON.stringify(ids)}.`)
      continue
    }
    for (const id of ids) {
      if (!Object.hasOwn(workouts, id)) err(`${where}.${slot}: тренировка «${id}» не найдена в workouts.`)
    }
  }
}

// ── шаблоны ──
const restDay = plan?.restDay
if (!DAY_KEYS.includes(restDay)) err(`restDay: «${restDay}» — не день недели (ожидается одно из ${DAY_KEYS.join(', ')}).`)

for (const [tid, t] of Object.entries(templates)) {
  const days = t?.days
  if (!isObj(days)) {
    err(`templates.${tid}: нет раздела «days».`)
    continue
  }
  for (const key of Object.keys(days)) {
    if (!DAY_KEYS.includes(key)) err(`templates.${tid}.days: неизвестный день «${key}».`)
  }
  for (const key of DAY_KEYS) {
    if (!(key in days)) err(`templates.${tid}.days: не задан день «${key}».`)
    else checkDaySpec(days[key], `templates.${tid}.days.${key}`)
  }
  const rests = DAY_KEYS.filter((k) => days[k] === 'rest')
  if (rests.length !== 1) {
    err(`templates.${tid}: должен быть ровно один день «rest», найдено ${rests.length}${rests.length ? ` (${rests.join(', ')})` : ''}.`)
  } else if (rests[0] !== restDay) {
    err(`templates.${tid}: выходной в «${rests[0]}», а restDay = «${restDay}».`)
  }
}

// ── события ──
for (const [i, e] of (plan?.events ?? []).entries()) {
  const name = `events[${i}]${e?.id ? ` (${e.id})` : ''}`
  const s = toISO(e?.start), en = toISO(e?.end)
  if (!s) err(`${name}: некорректная дата start «${e?.start}».`)
  if (!en) err(`${name}: некорректная дата end «${e?.end}».`)
  if (s && en && s > en) err(`${name}: start (${s}) позже end (${en}).`)
  if (e?.day != null) checkDaySpec(e.day, `${name}.day`)
}

// ── сегменты тренировок ──
function checkSegments(segs, where) {
  if (!Array.isArray(segs)) return err(`${where}: «segments» должен быть списком.`)
  segs.forEach((s, i) => {
    const at = `${where}[${i}]`
    if (Array.isArray(s)) {
      const [min, zone] = s
      if (typeof min !== 'number' || !(min > 0)) err(`${at}: длительность должна быть положительным числом, а получено ${JSON.stringify(min)}.`)
      if (!ZONES.has(zone)) err(`${at}: неизвестная зона «${zone}» (допустимы: ${[...ZONES].join(', ')}).`)
    } else if (isObj(s)) {
      if (!Number.isInteger(s.x) || s.x < 1) err(`${at}: повтор «x» должен быть целым ≥ 1, а получено ${JSON.stringify(s.x)}.`)
      if (!Array.isArray(s.set)) err(`${at}: у повтора нет списка «set».`)
      else checkSegments(s.set, `${at}.set`)
    } else {
      err(`${at}: ожидается [минуты, зона] или { x, set }, а получено ${JSON.stringify(s)}.`)
    }
  })
}
for (const [wid, w] of Object.entries(workouts)) {
  if (w?.segments == null) err(`workouts.${wid}: нет «segments».`)
  else checkSegments(w.segments, `workouts.${wid}.segments`)
}

// ── фазы ──
for (const [i, p] of (plan?.phases ?? []).entries()) {
  const name = `phases[${i}]${p?.id ? ` (${p.id})` : ''}`
  const s = toISO(p?.start), e = toISO(p?.end)
  if (!s) err(`${name}: некорректная дата start «${p?.start}».`)
  if (!e) err(`${name}: некорректная дата end «${p?.end}».`)
  if (s && e && s > e) err(`${name}: start (${s}) позже end (${e}).`)
}

// ── недели ──
const weeks = plan?.weeks
if (!Array.isArray(weeks) || weeks.length === 0) {
  err('Раздел «weeks» пуст или отсутствует.')
} else {
  let prev = null
  weeks.forEach((w, i) => {
    const s = toISO(w?.start)
    const name = `weeks[${i}]${s ? ` (${s})` : ''}`
    if (!s) err(`${name}: некорректная дата start «${w?.start}».`)
    else if (!isMonday(s)) err(`${name}: неделя начинается не с понедельника.`)
    if (!Object.hasOwn(templates, w?.template)) err(`${name}: шаблон «${w?.template}» не найден в templates.`)
    if (s && prev) {
      const expected = addDays(prev, 7)
      if (s !== expected) {
        if (s <= prev) err(`${name}: даты недель идут не по порядку (предыдущая — ${prev}).`)
        else err(`${name}: пропуск в календаре — после ${prev} ожидалась неделя ${expected}.`)
      }
    }
    if (s) prev = s
  })
}

// ── итог ──
if (errors.length) {
  console.error(`✗ plan.yaml: найдено ошибок — ${errors.length}\n`)
  for (const e of errors) console.error(`  • ${e}`)
  console.error('')
  process.exit(1)
}

const nW = Object.keys(workouts).length, nT = Object.keys(templates).length, nWk = weeks.length
console.log(`✓ plan.yaml в порядке: ${nW} тренировок, ${nT} шаблонов, ${nWk} недель (${toISO(weeks[0].start)} → ${addDays(toISO(weeks.at(-1).start), 6)}).`)
