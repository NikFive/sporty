import { Bike, ChevronRight, Dumbbell, Flag, Footprints, MountainSnow, PersonStanding, Repeat, Waves, Zap } from 'lucide-preact'
import { SPORT, TIME_LABEL, fmtHM, formula, keyZone } from '../lib/plan'

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

// Строка тренировки: иконка, название, теги (общая/личная · утро/вечер · формула), время.
export function SessionRow({ item, date }) {
  const w = item.workout
  if (!w) return <div class="cell">Нет тренировки «{item.id}»</div>
  const tags = [item.together ? 'Общая' : 'Личная', TIME_LABEL[item.time], formula(w)].filter(Boolean).join(' · ')
  return (
    <a class="cell" href={`#/d/${date}/${item.key}`}>
      <SportBadge workout={w} />
      <span class="cell-text">
        <span class="cell-title" style="display:block">{w.title}</span>
        <span class="cell-sub" style="display:block">{tags}</span>
      </span>
      <span class="cell-value num">{fmtHM(item.minutes)}</span>
      <ChevronRight class="chev" size={18} strokeWidth={2.5} />
    </a>
  )
}
