import { SPORT, fmtMin } from '../lib/plan'
import { Profile } from './Profile'

export function SessionCard({ item, date }) {
  const w = item.workout
  if (!w) return <div class="card card-missing">Нет тренировки «{item.id}» в библиотеке</div>
  return (
    <a class="card" href={`#/d/${date}/${item.key}`}>
      <div class="card-top mono">
        <span class="card-sport">{SPORT[w.sport] || w.sport}</span>
        <span class={item.together ? 'tag tag-together' : 'tag tag-solo'}>{item.together ? 'вместе' : 'личное'}</span>
        <span class="card-min">{fmtMin(item.minutes)}</span>
      </div>
      <div class="card-title">{w.title}</div>
      <div class="card-main">{w.main}</div>
      <Profile segments={w.segments} height={22} />
    </a>
  )
}

export function SessionLine({ item, date }) {
  const w = item.workout
  if (!w) return null
  return (
    <a class="line" href={`#/d/${date}/${item.key}`}>
      <span class="line-sport mono">{SPORT[w.sport] || w.sport}</span>
      <span class="line-title">
        {w.title}
        {!item.together && <span class="line-solo mono"> · личное</span>}
      </span>
      <span class="line-min mono">{fmtMin(item.minutes)}</span>
      <span class="line-profile">
        <Profile segments={w.segments} height={10} />
      </span>
    </a>
  )
}
