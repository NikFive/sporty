import { createContext } from 'preact'
import { useContext, useEffect } from 'preact/hooks'
import { addDays, getPlanDay, setDayOverlay } from './plan'
import { useCoach, useWhoop } from './whoop'
import { adjustDay, assess } from './readiness'
import { isDone } from './done'

// Решение тренера как наложение на план (YAML не меняется).
// Одна функция overlayDay для всех: getDay (plan.js) применяет её, поэтому лента недели, «Дальше»,
// экран тренировки, пейджер и итоги дня видят один и тот же поправленный план.
//
// Скорректированная тренировка подменяет исходную целиком (название, вид спорта, разминка, основная
// часть, заминка, зоны), исходник остаётся в item.planned. Отметка «Сделано» по-прежнему по item.id
// исходной тренировки — переживает «Вернуть как было».

export const inWindow = (date, today) => date >= today && date <= addDays(today, 6)

// «Вместо плиометрики»: родительный падеж по виду спорта исходной тренировки
const INSTEAD = { run: 'бега', bike: 'вела', swim: 'плавания', brick: 'брика', strength: 'силовой', plyo: 'плиометрики', mobility: 'мобилити', alt: 'тренировки', race: 'старта' }
export function changeWord(it) {
  const c = it.coach
  if (!c) return null
  if (c.action === 'cancel') return 'Отменена'
  if (c.action === 'replace') return `Вместо ${INSTEAD[it.planned?.sport] || 'тренировки'}`
  if (c.action === 'shorten') return 'Короче'
  return 'Облегчена'
}

function sportOf(title, base) {
  if (/мобил/i.test(title)) return 'mobility'
  if (/вел|станок/i.test(title)) return 'bike'
  if (/бег|ходьб/i.test(title)) return 'run'
  if (/плав/i.test(title)) return 'swim'
  if (/силов/i.test(title)) return 'strength'
  return base?.sport
}

/** Тренировка из правки тренера в формате плана (segments — [[мин, зона], …], как в YAML). */
function coachWorkout(base, c) {
  const w = c.workout
  if (!w) return base // правка по правилам: содержание то же, меняется время
  return {
    ...base,
    title: w.title || c.title || base?.title,
    sport: c.action === 'replace' ? sportOf(w.title || c.title || '', base) : base?.sport,
    warmup: w.warmup || null,
    main: w.main,
    cooldown: w.cooldown || null,
    segments: w.segments?.length ? w.segments : base?.segments,
    minutes: c.minutes ?? base?.minutes,
    formula: undefined, // формула исходника к новой версии не относится
    zone: undefined,
    split: undefined,
    why: c.action === 'replace' ? w.why : base?.why,
    ref: c.action === 'replace' ? undefined : base?.ref,
  }
}

/** День с решением. day — исходный день (getPlanDay). */
export function overlayDay(day, athlete, dec) {
  if (!dec || !day || day.outside) return day
  const sw = dec.changes.find((c) => c.action === 'swap' && (c.date === day.date || c.swap_with === day.date))
  // перестановка: берём тренировки другого дня, своё событие/отдых не трогаем (сервер такое не пропустит)
  // уже сделанные тренировки тренер задним числом не трогает
  const doneOn = (d) => getPlanDay(d, athlete).items.some((it) => isDone(athlete, d, it.id))
  if (sw && !day.event && !day.rest && !doneOn(sw.date) && !doneOn(sw.swap_with)) {
    const other = sw.date === day.date ? sw.swap_with : sw.date
    const od = getPlanDay(other, athlete)
    return { ...day, items: od.items.map((it) => ({ ...it, swappedFrom: other })), swappedWith: other, scale: od.scale }
  }
  const changes = dec.changes.filter((c) => c.date === day.date && c.key != null)
  if (!changes.length) return day
  return {
    ...day,
    coachTouched: true,
    items: day.items.map((it) => {
      // сверяем и позицию, и id: план мог поменяться после решения
      const c = changes.find((x) => x.key === it.key && (!x.id || x.id === it.id))
      if (!c || isDone(athlete, day.date, it.id)) return it
      return {
        ...it,
        coach: c,
        planned: it.workout,
        plannedMinutes: it.minutes,
        minutes: c.action === 'cancel' ? 0 : c.minutes ?? it.minutes,
        cancelled: c.action === 'cancel',
        workout: c.action === 'cancel' ? it.workout : coachWorkout(it.workout, c),
      }
    }),
  }
}

/** Правки по правилам v1 в формате решения тренера (только сегодня, без нового содержания). */
function rulesDecision(today, athlete, data) {
  const adj = adjustDay(getPlanDay(today, athlete), data)
  if (!adj) return null
  const items = getPlanDay(today, athlete).items
  const changes = [...adj.changes].map(([key, c]) => {
    const it = items.find((x) => x.key === key)
    const mob = /мобилити/i.test(c.how)
    const zone = mob ? 'mob' : it?.workout?.sport === 'strength' ? 'str' : 'z2'
    // содержание под правку, чтобы экран тренировки не показывал интервалы из плана
    const workout = c.to === 0 ? null : { title: mob ? 'Мобилити' : it?.workout?.title, warmup: null, main: c.how.charAt(0).toUpperCase() + c.how.slice(1), cooldown: null, segments: [[c.to, zone]] }
    return {
      date: today, key, id: it?.id, from: c.from, minutes: c.to, how: c.how, workout,
      action: c.to === 0 ? 'cancel' : mob ? 'replace' : c.to < c.from ? 'shorten' : 'easier',
    }
  })
  return { rules: true, level: adj.level, headline: adj.headline, summary: adj.summary, reasons: adj.reasons, changes, week_note: null }
}

/**
 * Состояние тренера на сегодня — один раз в App, дальше через контекст.
 * mode: off (WHOOP не подключён) · waiting (нет свежего recovery) · thinking · coach · reverted · rules · none
 */
export function useCoachState(athlete, today) {
  const whoop = useWhoop(athlete)
  const coach = useCoach(athlete)
  const data = whoop.data
  const rec = data?.recovery
  // свежее = посчитано сегодня (как на сервере): в полночь вчерашнее уже не в счёт
  const fresh = !!rec?.at && new Date(rec.at).toLocaleDateString('en-CA') === today

  let mode = 'none', dec = null
  if (whoop.state === 'off') mode = 'off'
  else if (!data) mode = 'none'
  else if (!fresh) mode = 'waiting'
  else if (coach?.status === 'ok' && coach.decision) {
    if (coach.feedback?.reverted) mode = 'reverted'
    else { mode = 'coach'; dec = coach.decision }
  } else if (coach === undefined || (coach?.enabled && !coach.stalled && (coach.running || coach.status === 'none'))) mode = 'thinking'
  else { mode = 'rules'; dec = rulesDecision(today, athlete, data) }

  const state = { athlete, today, whoop, coach, data, mode, dec, flags: fresh ? assess(data)?.flags || [] : [] }
  // наложение для getDay: только этот атлет и только окно «сегодня + 6 дней»
  setDayOverlay(dec ? (day, a) => (a === athlete && inWindow(day.date, today) ? overlayDay(day, a, dec) : day) : null)
  useEffect(() => () => setDayOverlay(null), [])
  return state
}

export const CoachCtx = createContext(null)
export const useCoachCtx = () => useContext(CoachCtx)

/** Изменил ли тренер этот день (не сегодня — для плашки на экране дня). */
export const dayTouched = (date, dec) => !!dec?.changes.some((c) => c.date === date || c.swap_with === date)

/** Строка факторов под вердиктом: собирается кодом, не моделью. «Сон 6:06 из 10:00 · HRV в норме» */
export function factorsLine(data, flags) {
  const fmt = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
  const r = data?.recovery, b = data?.baseline || {}, s = data?.sleep
  const has = new Set(flags.map((f) => f.key))
  const sleep = s?.hours != null ? `Сон ${fmt(s.hours)}${s.needHours ? ` из ${fmt(s.needHours)}` : ''}` : null
  const hrvPct = r?.hrv && b.hrv && b.days >= 4 ? Math.round((r.hrv / b.hrv - 1) * 100) : null
  const parts = []
  if (has.has('sleep') && sleep) parts.push(sleep)
  if (has.has('hrv') && hrvPct != null) parts.push(`HRV ${hrvPct > 0 ? '+' : ''}${hrvPct}%`)
  if (has.has('rhr') && r?.rhr && b.rhr) parts.push(`пульс +${Math.round(r.rhr - b.rhr)}`)
  if (has.has('strain') && data?.strain?.yesterday) parts.push(`strain вчера ${data.strain.yesterday}`)
  if (parts.length < 2 && !has.has('hrv') && r?.hrv) parts.push(hrvPct != null ? 'HRV в норме' : `HRV ${Math.round(r.hrv)}`)
  if (parts.length < 2 && !has.has('sleep') && sleep) parts.push(sleep.replace('Сон', 'сон'))
  const out = parts.slice(0, 2).join(' · ')
  return out.charAt(0).toUpperCase() + out.slice(1)
}
