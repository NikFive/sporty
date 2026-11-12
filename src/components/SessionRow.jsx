import { Bike, Check, Dumbbell, Flag, Footprints, MountainSnow, PersonStanding, Repeat, Waves, Zap } from 'lucide-preact'
import { SPORT, TIME_LABEL, fmtHM, formula, keyZone } from '../lib/plan'
import { isDone, toggleDone } from '../lib/done'

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

/**
 * Строка тренировки: иконка, название, теги, время и галочка.
 * solo — общая по шаблону, но партнёра в этот день нет: пишем «Сам».
 */
export function SessionRow({ item, date, athlete, solo = false }) {
  const w = item.workout
  if (!w) return <div class="cell">Нет тренировки «{item.id}»</div>
  const who = item.together ? (solo ? 'Сам' : 'Общая') : 'Личная'
  const tags = [who, TIME_LABEL[item.time], formula(w)].filter(Boolean).join(' · ')
  const done = isDone(athlete, date, item.id)
  return (
    <div class={`cell session${done ? ' is-done' : ''}`}>
      <a class="session-link" href={`#/d/${date}/${item.key}`}>
        <SportBadge workout={w} />
        <span class="cell-text">
          <span class="cell-title" style="display:block">{w.title}</span>
          <span class="cell-sub" style="display:block">{tags}</span>
        </span>
        <span class="cell-value num">{fmtHM(item.minutes)}</span>
      </a>
      <DoneToggle athlete={athlete} date={date} item={item} />
    </div>
  )
}
