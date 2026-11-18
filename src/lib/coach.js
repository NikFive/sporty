import { addDays, getDay } from './plan'

// Наложение решения ИИ-тренера на план (YAML не меняется): перестановки дней и правки тренировок.

/** Действующее решение: тренер ответил и атлет не нажал «вернуть как было». */
export const activeDecision = (coach) =>
  coach?.status === 'ok' && coach.decision && !coach.feedback?.reverted ? coach.decision : null

const ACTION = { easier: 'легче', shorten: 'короче', replace: 'замена', cancel: 'отменить' }

/**
 * День с учётом решения: { day, changes: Map<key, {from,to,how,action,title}>, swappedWith: date|null }
 * changes относятся к ключам исходного дня; дни, переставленные местами, другими правками не трогаются.
 */
export function coachDay(date, athlete, day, dec) {
  if (!dec) return { day, changes: new Map(), swappedWith: null }
  const sw = dec.changes.find((c) => c.action === 'swap' && (c.date === date || c.swap_with === date))
  if (sw) {
    const other = sw.date === date ? sw.swap_with : sw.date
    const od = getDay(other, athlete)
    return { day: { ...day, items: od.items }, changes: new Map(), swappedWith: other }
  }
  const changes = new Map()
  for (const c of dec.changes)
    if (c.date === date && c.key != null) changes.set(c.key, { from: c.from, to: c.minutes ?? c.from, how: c.how, action: c.action, title: c.title, label: ACTION[c.action] })
  return { day, changes, swappedWith: null }
}

export const inWindow = (date, today) => date >= today && date <= addDays(today, 6)
