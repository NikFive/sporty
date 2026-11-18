import { flatSegments, fmtHM, keyZone } from './plan'

/**
 * Модель готовности v1: WHOOP-показатели → уровень дня → корректировка сегодняшних тренировок.
 * Чистая функция, без сети. Правила и обоснование — docs/coaching.md, раздел «Готовность (WHOOP)».
 *
 * Уровни: green (по плану) · yellow (чуть мягче) · orange (без интенсивности) · red (лёгкий день).
 * Базово — recovery WHOOP (67+/34–66/≤33), затем «флаги» понижают уровень на ступень:
 * HRV < 85% от своей нормы, пульс покоя ≥ нормы + 5, сон < 6 ч или < 70% потребности, вчера strain ≥ 17.
 */

export const LEVEL = {
  green: { label: 'Зелёное', color: 'var(--rec-green)' },
  yellow: { label: 'Жёлтое', color: 'var(--rec-yellow)' },
  orange: { label: 'Жёлтое', color: 'var(--rec-yellow)' },
  red: { label: 'Красное', color: 'var(--rec-red)' },
}
const ORDER = ['green', 'yellow', 'orange', 'red']
const down = (lvl, n = 1) => ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(lvl) + n)]

export const recColor = (score) => (score >= 67 ? 'green' : score >= 34 ? 'yellow' : 'red')

/** Свежая ли recovery: посчитана сегодня (по локальному времени телефона) или в последние 18 ч. */
export function isFresh(rec, now = new Date()) {
  if (!rec?.at) return false
  const at = new Date(rec.at)
  const sameDay = at.toDateString() === now.toDateString()
  return sameDay || now - at < 18 * 3_600_000
}

export function assess(w) {
  const r = w?.recovery
  if (!r || r.score == null) return null
  const flags = []
  const b = w.baseline || {}
  if (r.hrv && b.hrv && b.days >= 4) {
    const k = r.hrv / b.hrv
    if (k < 0.85) flags.push({ key: 'hrv', text: `HRV ${Math.round(r.hrv)} мс — на ${Math.round((1 - k) * 100)}% ниже твоей нормы` })
  }
  if (r.rhr && b.rhr && b.days >= 4 && r.rhr - b.rhr >= 5)
    flags.push({ key: 'rhr', text: `пульс покоя ${r.rhr} — на ${Math.round(r.rhr - b.rhr)} выше обычного` })
  const s = w.sleep
  if (s?.hours != null && (s.hours < 6 || (s.needHours && s.hours / s.needHours < 0.7)))
    flags.push({ key: 'sleep', text: `сон ${fmtH(s.hours)}${s.needHours ? ` из ${fmtH(s.needHours)} нужных` : ''}` })
  if (w.strain?.yesterday >= 17) flags.push({ key: 'strain', text: `вчера strain ${w.strain.yesterday}` })

  const base = recColor(r.score)
  let level = base === 'green' ? 'green' : base === 'red' ? 'red' : r.score < 50 ? 'orange' : 'yellow'
  // один флаг — минус ступень, два и больше — минус две (но зелёное с одним флагом остаётся «по плану, аккуратно»)
  if (flags.length >= 2) level = down(level, 2)
  else if (flags.length === 1 && level !== 'green') level = down(level)
  return { level, base, score: r.score, flags, calibrating: r.calibrating }
}

export const fmtH = (h) => {
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`
}

// ───────── типы тренировок ─────────
function kindOf(w) {
  if (!w) return 'other'
  if (w.sport === 'race') return 'race'
  if (w.sport === 'strength') return 'strength'
  if (w.sport === 'plyo') return 'plyo'
  if (w.sport === 'mobility') return 'mobility'
  const z = keyZone(w)
  if (z === 'z3' || z === 'z4' || z === 'z5') return 'hard'
  return 'easy'
}
const hasSurges = (w) => flatSegments(w.segments).some(([, z]) => z === 'z4' || z === 'z5')
const r5 = (m) => Math.max(15, Math.round(m / 5) * 5)

/** Как поменять одну тренировку на заданном уровне → { to, how } (to — минуты, how — текст) или null. */
function adjustItem(item, level) {
  const w = item.workout
  const m = item.minutes
  const kind = kindOf(w)
  if (kind === 'race' || kind === 'mobility' || kind === 'other') return null
  if (level === 'green') return null

  if (level === 'yellow') {
    if (kind === 'hard') return { to: r5(m * 0.9), how: 'минус 1 повтор, держи низ зоны' }
    if (kind === 'plyo') return { to: m, how: 'вдвое меньше прыжков, только мягкие приземления' }
    if (kind === 'strength') return { to: m, how: 'вес как обычно, но без отказа — запас 2–3 повтора' }
    if (m >= 90) return { to: r5(m * 0.9), how: 'длинная — на 10% короче' }
    return null
  }
  if (level === 'orange') {
    if (kind === 'hard') return { to: r5(m * 0.8), how: 'интервалы → ровно Z2, без ускорений' }
    if (kind === 'plyo') return { to: Math.min(m, 15), how: 'вместо прыжков — мобилити' }
    if (kind === 'strength') return { to: r5(m * 0.8), how: 'минус подход в каждом упражнении, вес −10%' }
    return { to: r5(m * 0.85), how: hasSurges(w) ? 'строго Z1–Z2, без ускорений' : 'строго Z1–Z2, на 15% короче' }
  }
  // red
  if (kind === 'hard') return { to: Math.min(45, r5(m * 0.6)), how: 'вместо интервалов — лёгкая Z1–Z2' }
  if (kind === 'plyo') return { to: 0, how: 'отменить' }
  if (kind === 'strength') return { to: Math.min(20, m), how: 'вместо силовой — мобилити 20 мин' }
  return { to: Math.min(60, r5(m * 0.6)), how: hasSurges(w) ? 'только Z1–Z2, без ускорений' : 'только Z1–Z2, разговорный темп' }
}

const HEAD = {
  green: 'Тренируйся по плану',
  yellow: 'По плану, но чуть мягче',
  orange: 'Сегодня без интенсивности',
  red: 'Сегодня лёгкий день',
}

/**
 * Корректировка дня. day — результат getDay(). Возвращает:
 * { level, headline, summary, reasons[], changes: Map<key, {from,to,how}>, from, to, pct }
 */
export function adjustDay(day, whoopData) {
  const a = assess(whoopData)
  if (!a) return null
  const reasons = a.flags.map((f) => f.text)
  const items = day?.items || []
  const changes = new Map()
  let from = 0, to = 0
  for (const it of items) {
    from += it.minutes
    const c = a.calibrating ? null : adjustItem(it, a.level)
    if (c) { changes.set(it.key, { from: it.minutes, ...c }); to += c.to }
    else to += it.minutes
  }
  const pct = from ? Math.round((1 - to / from) * 100) : 0

  let summary
  if (a.calibrating) summary = 'WHOOP ещё калибруется (первые дни) — план не трогаем, просто слушай себя'
  else if (day?.event?.kind === 'race') summary = 'День старта — план не меняем. Удачи!'
  else if (day?.rest) summary = a.level === 'green' ? 'Выходной. Восстановление хорошее — можно прогулку' : 'Выходной — сон, еда и прогулка'
  else if (!items.length) summary = null
  else if (!changes.size) summary = a.level === 'green'
    ? (a.flags.length ? 'По плану, но следи за пульсом: не входит в зону — сделай легче' : a.score >= 85 ? 'Восстановление отличное — хороший день для ключевой работы' : 'Всё по плану')
    : 'Тренировки сегодня и так лёгкие — оставляем как есть'
  else if (pct > 0) summary = `Объём −${pct}%: ${fmtHM(from)} → ${fmtHM(to)}`
  else summary = 'Объём тот же, снижаем интенсивность'

  return {
    ...a,
    headline: day?.rest && !items.length ? 'Восстановление' : HEAD[a.level],
    summary,
    reasons,
    changes,
    from,
    to,
    pct,
  }
}
