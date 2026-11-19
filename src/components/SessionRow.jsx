import { Bike, Check, Dumbbell, Flag, Footprints, MountainSnow, PersonStanding, Repeat, Waves, Zap } from 'lucide-preact'
import { SPORT, TIME_LABEL, fmtHM, formula, keyZone } from '../lib/plan'
import { isDone, toggleDone } from '../lib/done'
import { changeWord } from '../lib/coach'

const SPORT_ICON = { run: Footprints, bike: Bike, swim: Waves, brick: Repeat, strength: Dumbbell, plyo: Zap, mobility: PersonStanding, alt: MountainSnow, race: Flag }

export const sportLabel = (w) => SPORT[w.sport] || w.sport

// Цветной квадрат с иконкой вида спорта; цвет — ключевая зона тренировки.
export function SportBadge({ workout, large = false }) {
  const I = SPORT_ICON[workout.sport] || Footprints
  return (
    <span class={`badge${large ? ' badge-lg' : ''} bg-${keyZone(workout)}`} aria-hidden="true">
      <I size={large ? 24 : 18} strokeWidth={2} />
    </span>
  )
}

// Круглая галочка «Сделано», как в Напоминаниях iOS.
export function DoneToggle({ athlete, date, item, large = false }) {
  const done = isDone(athlete, date, item.id)
  return (
    <button
      class={`done-btn${done ? ' is-done' : ''}${large ? ' is-large' : ''}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleDone(athlete, date, item.id) }}
      {...(large
        ? {} // у большой кнопки видимый текст сам говорит о состоянии
        : { 'aria-pressed': done, 'aria-label': `Сделано: ${item.workout?.title || ''}` })}
    >
      <span class="done-ring">{done && <Check size={large ? 18 : 15} strokeWidth={3} />}</span>
      {large && <span>{done ? 'Сделано' : 'Отметить как сделано'}</span>}
    </button>
  )
}

/** Время в строке: новое значение, под ним зачёркнутое плановое. */
export function TimeVal({ now, was, label }) {
  if (was == null || was === now) return <span class="cell-value num">{fmtHM(now)}</span>
  return (
    <span class="val num" aria-label={label}>
      <span class="val-now">{now ? fmtHM(now) : '—'}</span>
      <s class="was" aria-hidden="true">{fmtHM(was)}</s>
    </span>
  )
}

const minutesWord = (m) => `${m} ${m % 10 === 1 && m % 100 !== 11 ? 'минута' : [2, 3, 4].includes(m % 10) && ![12, 13, 14].includes(m % 100) ? 'минуты' : 'минут'}`

/**
 * Строка тренировки: иконка, название, теги, время и галочка.
 * solo — общая по шаблону, но партнёра в этот день нет: пишем «Сам».
 * Правка тренера: новое название и вид спорта, первое слово подписи — что поменялось, время «стало / было».
 */
export function SessionRow({ item, date, athlete, solo = false }) {
  const w = item.workout
  if (!w) return <div class="cell">Нет тренировки «{item.id}»</div>
  const who = item.together ? (solo ? 'Сам' : 'Общая') : 'Личная'
  const word = changeWord(item)
  const tags = [word ? null : who, TIME_LABEL[item.time], word ? null : formula(w)].filter(Boolean).join(' · ')
  const done = isDone(athlete, date, item.id)
  const changed = !!item.coach
  const title = item.cancelled ? item.planned?.title || w.title : w.title
  const label = changed
    ? item.cancelled ? `${title}, отменена тренером` : `${minutesWord(item.minutes)} вместо ${minutesWord(item.plannedMinutes)}, изменено тренером`
    : undefined
  return (
    <div class={`cell session${done ? ' is-done' : ''}${changed ? ' is-changed' : ''}${item.cancelled ? ' is-cancelled' : ''}`}>
      <a class="session-link" href={`#/d/${date}/${item.key}`}>
        <SportBadge workout={w} />
        <span class="cell-text">
          <span class="cell-title" style="display:block">{title}</span>
          <span class="cell-sub" style="display:block">
            {word && <span class="chg">{word}</span>}
            {word && tags && ' · '}
            {tags}
          </span>
        </span>
        <TimeVal now={item.minutes} was={changed ? item.plannedMinutes : null} label={label} />
      </a>
      {item.cancelled ? <span class="done-slot" /> : <DoneToggle athlete={athlete} date={date} item={item} />}
    </div>
  )
}
