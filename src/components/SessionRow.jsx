import { SPORT, TIME_LABEL, fmtHM, formula, keyZone } from '../lib/plan'
import { Profile } from './Profile'

export const sportLabel = (w) => (SPORT[w.sport] || w.sport).toLowerCase()

export function ZoneSquare({ zone, size = 10 }) {
  return <span class={`sq sq-${zone}`} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true" />
}

// Компактная строка тренировки: зона, название, время; ниже — вид, общая/личная, утро/вечер, формула.
export function SessionRow({ item, date }) {
  const w = item.workout
  if (!w) return <div class="row row-missing">Нет тренировки «{item.id}» в библиотеке</div>
  const meta = [sportLabel(w), item.together ? 'общая' : 'личная', TIME_LABEL[item.time], formula(w)].filter(Boolean)
  return (
    <a class="row" href={`#/d/${date}/${item.key}`}>
      <span class="row-head">
        <ZoneSquare zone={keyZone(w)} />
        <span class="row-title">{w.title}</span>
        <span class="row-min num">{fmtHM(item.minutes)}</span>
      </span>
      <span class="row-meta">
        {meta.map((m, i) => (
          <span key={i} class={m === 'личная' ? 'is-solo' : ''}>{i > 0 && ' · '}{m}</span>
        ))}
      </span>
      <Profile segments={w.segments} minutes={item.minutes} height={6} />
    </a>
  )
}
