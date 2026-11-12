#!/usr/bin/env node
// Проверка плана plan/*.yaml. Запуск: npm run validate   (или: node scripts/validate-plan.mjs <папка>)
//
// 1. Каждый файл — по своей JSON Schema из plan/schema/ (структура, типы, enum'ы, формат дат и ссылок).
// 2. Связи между файлами и инварианты, которые схемой не выразить (ссылки, календарь, пересечения).
// Контракт описан в plan/README.md — при изменении правил обновляй и его.
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { load as loadYaml } from 'js-yaml'

const DIR = resolve(process.argv[2] ?? fileURLToPath(new URL('../plan', import.meta.url)))
const FILES = ['settings', 'workouts', 'templates', 'calendar']
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const fileLabel = (name) => {
  const abs = join(DIR, `${name}.yaml`)
  const rel = relative(process.cwd(), abs)
  return rel.startsWith('..') ? abs : rel
}

// ── сбор ошибок: { file, path, msg } ──
const errors = []
const warnings = []
const err = (file, path, msg) => errors.push({ file, path, msg })
const warn = (file, path, msg) => warnings.push({ file, path, msg })

// ── чтение YAML (js-yaml 5: даты остаются строками) ──
const docs = {}
for (const name of FILES) {
  const path = join(DIR, `${name}.yaml`)
  if (!existsSync(path)) {
    err(name, '', 'файл не найден.')
    continue
  }
  try {
    docs[name] = loadYaml(readFileSync(path, 'utf8'))
  } catch (e) {
    err(name, '', `YAML не читается: ${e.message}`)
  }
}

// ── 1. JSON Schema ──
const ajv = new Ajv({ allErrors: true, verbose: true, strict: true, strictTypes: false })
ajv.addKeyword({ keyword: 'x-error', schemaType: 'string' }) // наш русский текст ошибки рядом с правилом

const TYPE_RU = { string: 'строка', number: 'число', integer: 'целое число', boolean: 'true/false', object: 'объект', array: 'список', null: 'пусто' }
const show = (v) => (v === undefined ? 'ничего' : v === null ? 'пусто (null)' : JSON.stringify(v))

function schemaMessage(e) {
  const custom = e.parentSchema?.['x-error']
  const p = e.params
  switch (e.keyword) {
    case 'required':
      return `не хватает обязательного поля «${p.missingProperty}».`
    case 'additionalProperties': {
      const allowed = Object.keys(e.parentSchema?.properties ?? {})
      return `неизвестное поле «${p.additionalProperty}»${allowed.length ? ` (допустимы: ${allowed.join(', ')})` : ''}.`
    }
    case 'type':
      return custom ? `${custom}, а получено ${show(e.data)}.` : `ожидается ${TYPE_RU[p.type] ?? p.type}, а получено ${show(e.data)}.`
    case 'const':
      return custom ? `${custom}, а получено ${show(e.data)}.` : `ожидается «${p.allowedValue}», а получено ${show(e.data)}.`
    case 'enum':
      return `${show(e.data)} — недопустимое значение (допустимы: ${p.allowedValues.join(', ')}).`
    case 'pattern':
    case 'not':
      return custom ? `${show(e.data)} — ${custom}.` : `${show(e.data)} не подходит под формат ${p.pattern}.`
    case 'minItems':
      return p.limit === 1 ? 'список не должен быть пустым.' : `в списке должно быть минимум ${p.limit} элемента.`
    case 'maxItems':
    case 'additionalItems':
      return custom ? `${custom}, а получено ${show(e.data)}.` : `слишком много элементов (максимум ${p.limit}).`
    case 'minProperties':
      return custom ? `${custom}, а получен пустой объект.` : 'не должно быть пустым.'
    case 'minLength':
      return 'не должно быть пустой строкой.'
    case 'minimum':
      return `должно быть ≥ ${p.limit}, а получено ${show(e.data)}.`
    case 'exclusiveMinimum':
      return `должно быть > ${p.limit}, а получено ${show(e.data)}.`
    case 'uniqueItems':
      return `элементы №${p.j + 1} и №${p.i + 1} повторяются.`
    default:
      return e.message
  }
}

// /events/0/day/nikita/1 → events[0] (sheregesh).day.nikita[1]
function fmtPath(doc, pointer, propertyName) {
  const parts = pointer.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  if (propertyName != null) parts.push(propertyName)
  let out = ''
  let node = doc
  parts.forEach((part, depth) => {
    if (Array.isArray(node) && /^\d+$/.test(part)) {
      const item = node[Number(part)]
      out += `[${part}]`
      const tag = depth === 1 && item && typeof item === 'object' ? (item.id ?? item.date ?? item.start) : null
      if (typeof tag === 'string') out += ` (${tag})`
    } else out += (out ? '.' : '') + part
    node = node?.[part]
  })
  return out
}

let schemaOk = true
for (const name of FILES) {
  if (!(name in docs)) {
    schemaOk = false
    continue
  }
  const schemaPath = join(DIR, 'schema', `${name}.schema.json`)
  let validate
  try {
    validate = ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')))
  } catch (e) {
    err(name, '', `не удалось загрузить схему ${relative(process.cwd(), schemaPath)}: ${e.message}`)
    schemaOk = false
    continue
  }
  if (validate(docs[name])) continue
  schemaOk = false
  const seen = new Set()
  for (const e of validate.errors) {
    // if/then/else и propertyNames дают служебную ошибку-обёртку — сама причина идёт отдельной записью
    if (e.keyword === 'if' || e.keyword === 'propertyNames') continue
    const path = fmtPath(docs[name], e.instancePath, e.propertyName)
    const msg = e.propertyName != null ? `недопустимый ключ: ${schemaMessage(e)}` : schemaMessage(e)
    const k = `${path}|${msg}`
    if (!seen.has(k)) seen.add(k), err(name, path, msg)
  }
}

// ── 2. Связи и инварианты (только если структура в порядке) ──
const pad = (n) => String(n).padStart(2, '0')
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null
}
const utc = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const isMonday = (s) => new Date(utc(s)).getUTCDay() === 1
const addDays = (s, n) => {
  const d = new Date(utc(s) + n * 86400000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const label = (arr, i, x) => `${arr}[${i}]${x?.id ?? x?.date ?? x?.start ? ` (${x.id ?? x.date ?? x.start})` : ''}`

if (schemaOk) semanticChecks()

function semanticChecks() {
  const { athletes, race, restDay } = docs.settings
  const { workouts } = docs.workouts
  const { templates } = docs.templates
  const cal = docs.calendar
  const ATHLETES = Object.keys(athletes)
  const SLOTS = ['together', ...ATHLETES]
  const used = { workouts: new Set(), templates: new Set() }

  const checkDate = (file, path, v) => {
    if (!validDate(v)) err(file, path, `«${v}» — такой даты нет в календаре.`)
    return validDate(v)
  }
  // athletes: [...] → кого касается; без поля — всех
  const scopeOf = (file, path, x) => {
    if (!x.athletes) return ATHLETES
    for (const a of x.athletes)
      if (!ATHLETES.includes(a)) err(file, `${path}.athletes`, `атлет «${a}» не найден в settings.yaml (есть: ${ATHLETES.join(', ')}).`)
    return x.athletes.filter((a) => ATHLETES.includes(a))
  }

  // ── день: rest | { together, <атлет>: [...] } ──
  function checkDaySpec(file, spec, where, scope = ATHLETES) {
    if (spec === 'rest') return
    const partial = scope.length < ATHLETES.length
    for (const key of Object.keys(spec)) {
      if (!SLOTS.includes(key)) err(file, `${where}.${key}`, `неизвестный слот (допустимы: ${SLOTS.join(', ')}).`)
      else if (key === 'together' && partial)
        err(file, `${where}.together`, `«together» — это «вместе», а здесь athletes = [${scope.join(', ')}]. Пиши тренировки в слот ${scope.join(' / ')}.`)
      else if (key !== 'together' && !scope.includes(key))
        err(file, `${where}.${key}`, `слот не сработает: athletes = [${scope.join(', ')}]. Убери его или добавь «${key}» в athletes.`)
    }
    for (const slot of SLOTS) {
      ;(spec[slot] ?? []).forEach((ref, i) => {
        const id = String(ref).split('@')[0]
        used.workouts.add(id)
        if (!Object.hasOwn(workouts, id)) err(file, `${where}.${slot}[${i}]`, `тренировка «${id}» не найдена в workouts.yaml.`)
      })
    }
    for (const a of scope)
      if (!(spec.together?.length || spec[a]?.length))
        err(file, where, `у «${a}» в этот день нет ни одной тренировки. Если это отдых — пиши day: rest${partial || ATHLETES.length === 1 ? '' : ' (или ограничь athletes)'}.`)
  }

  // ── settings ──
  if (!DAY_KEYS.includes(restDay)) err('settings', 'restDay', `«${restDay}» — не день недели.`)
  const raceDate = checkDate('settings', 'race.date', race.date)

  // ── workouts: заметки только существующим атлетам (сегменты и зоны проверяет схема) ──
  for (const [wid, w] of Object.entries(workouts))
    for (const a of Object.keys(w.notes ?? {}))
      if (!ATHLETES.includes(a)) err('workouts', `workouts.${wid}.notes.${a}`, `атлет «${a}» не найден в settings.yaml.`)

  // ── templates: 7 дней, ровно один rest = restDay ──
  for (const [tid, t] of Object.entries(templates)) {
    for (const key of DAY_KEYS) checkDaySpec('templates', t.days[key], `templates.${tid}.days.${key}`)
    const rests = DAY_KEYS.filter((k) => t.days[k] === 'rest')
    if (rests.length !== 1)
      err('templates', `templates.${tid}`, `должен быть ровно один день «rest», найдено ${rests.length}${rests.length ? ` (${rests.join(', ')})` : ''}. Разовый отдых — через overrides или events в calendar.yaml.`)
    else if (rests[0] !== restDay) err('templates', `templates.${tid}`, `выходной в «${rests[0]}», а restDay в settings.yaml = «${restDay}».`)
  }

  // ── weeks: понедельники подряд, шаблон существует ──
  let prev = null
  cal.weeks.forEach((w, i) => {
    const name = label('weeks', i, w)
    const s = checkDate('calendar', `${name}.start`, w.start)
    if (s && !isMonday(s)) err('calendar', `${name}.start`, 'неделя начинается не с понедельника.')
    used.templates.add(w.template)
    if (!Object.hasOwn(templates, w.template)) err('calendar', `${name}.template`, `шаблон «${w.template}» не найден в templates.yaml.`)
    if (s && prev) {
      const expected = addDays(prev, 7)
      if (s !== expected) {
        if (s <= prev) err('calendar', name, `даты недель идут не по порядку (предыдущая — ${prev}).`)
        else err('calendar', name, `пропуск в календаре — после ${prev} ожидалась неделя ${expected}.`)
      }
    }
    if (s) prev = s
  })
  const calStart = validDate(cal.weeks[0].start)
  const calEnd = validDate(cal.weeks.at(-1).start) && addDays(cal.weeks.at(-1).start, 6)
  const inCalendar = (d) => calStart && calEnd && d >= calStart && d <= calEnd
  const calRange = `${calStart} … ${calEnd}`

  if (raceDate && calEnd && !inCalendar(raceDate)) err('settings', 'race.date', `${raceDate} вне календаря weeks (${calRange}).`)

  // ── phases: даты, порядок без пересечений, каждая неделя внутри фазы ──
  const phases = []
  cal.phases.forEach((p, i) => {
    const name = label('phases', i, p)
    const s = checkDate('calendar', `${name}.start`, p.start)
    const e = checkDate('calendar', `${name}.end`, p.end)
    if (s && e && s > e) err('calendar', name, `start (${s}) позже end (${e}).`)
    if (s && e) {
      const last = phases.at(-1)
      if (last && s <= last.end) err('calendar', name, `пересекается с фазой «${last.id}» или идёт не по порядку (та заканчивается ${last.end}).`)
      phases.push({ id: p.id, start: s, end: e })
    }
  })
  cal.weeks.forEach((w, i) => {
    if (validDate(w.start) && phases.length && !phases.some((p) => w.start >= p.start && w.start <= p.end))
      err('calendar', label('weeks', i, w), 'понедельник недели не попадает ни в одну фазу из phases.')
  })

  // ── milestones ──
  ;(cal.milestones ?? []).forEach((m, i) => {
    const name = label('milestones', i, m)
    checkDate('calendar', `${name}.date`, m.date)
    scopeOf('calendar', name, m)
  })

  // ── events: id уникальны, даты, кого касается, day, гонка = race.date, без пересечений у одного атлета ──
  const events = []
  const ids = new Set()
  ;(cal.events ?? []).forEach((e, i) => {
    const name = label('events', i, e)
    if (ids.has(e.id)) err('calendar', `${name}.id`, `id «${e.id}» уже занят другим событием.`)
    ids.add(e.id)
    const s = checkDate('calendar', `${name}.start`, e.start)
    const en = checkDate('calendar', `${name}.end`, e.end)
    if (s && en && s > en) err('calendar', name, `start (${s}) позже end (${en}).`)
    const scope = scopeOf('calendar', name, e)
    if (e.day != null) checkDaySpec('calendar', e.day, `${name}.day`, scope)
    if (e.kind === 'race' && raceDate && s !== raceDate)
      err('calendar', `${name}.start`, `событие гонки ${s}, а race.date в settings.yaml — ${raceDate}. Меняй обе даты вместе.`)
    if (s && en) {
      for (const o of events)
        if (s <= o.end && en >= o.start && scope.some((a) => o.scope.includes(a)))
          err('calendar', name, `пересекается с событием «${o.id}» (${o.start} … ${o.end}) для ${scope.filter((a) => o.scope.includes(a)).join(', ')}. На один день атлета — одно событие.`)
      events.push({ id: e.id, start: s, end: en, scope })
    }
  })

  // ── overrides: дата в календаре, одна замена на дату и атлета, day ──
  const taken = new Map()
  ;(cal.overrides ?? []).forEach((o, i) => {
    const name = label('overrides', i, o)
    const d = checkDate('calendar', `${name}.date`, o.date)
    if (d && !inCalendar(d)) err('calendar', `${name}.date`, `${d} вне календаря weeks (${calRange}).`)
    const scope = scopeOf('calendar', name, o)
    checkDaySpec('calendar', o.day, `${name}.day`, scope)
    for (const a of scope) {
      const k = `${d}|${a}`
      if (taken.has(k)) err('calendar', name, `для «${a}» на ${d} уже есть замена — ${taken.get(k)}. Объедини их.`)
      else taken.set(k, `overrides[${i}]`)
    }
  })

  // ── предупреждения: неиспользуемое ──
  for (const wid of Object.keys(workouts)) if (!used.workouts.has(wid)) warn('workouts', `workouts.${wid}`, 'тренировка нигде не используется.')
  for (const tid of Object.keys(templates)) if (!used.templates.has(tid)) warn('templates', `templates.${tid}`, 'шаблон не используется ни в одной неделе.')
}

// ── итог ──
function print(list, stream) {
  let current = null
  for (const { file, path, msg } of list) {
    if (file !== current) stream(`\n  ${fileLabel(file)}`), (current = file)
    stream(`    • ${path ? `${path}: ` : ''}${msg}`)
  }
}
const byFile = (a, b) => FILES.indexOf(a.file) - FILES.indexOf(b.file)

if (warnings.length) {
  console.warn(`⚠ Предупреждения — ${warnings.length}:`)
  print(warnings.sort(byFile), console.warn)
  console.warn('')
}
if (errors.length) {
  console.error(`✗ План: найдено ошибок — ${errors.length}${schemaOk ? '' : ' (сначала структура по схемам; связи между файлами проверятся после её исправления)'}`)
  print(errors.sort(byFile), console.error)
  console.error('\n  Контракт и примеры: plan/README.md\n')
  process.exit(1)
}

const { workouts } = docs.workouts, { templates } = docs.templates, { weeks, events = [], overrides = [] } = docs.calendar
console.log(
  `✓ План в порядке: ${Object.keys(workouts).length} тренировок, ${Object.keys(templates).length} шаблонов, ` +
    `${weeks.length} недель (${weeks[0].start} → ${addDays(weeks.at(-1).start, 6)}), событий ${events.length}, замен ${overrides.length}.`,
)
