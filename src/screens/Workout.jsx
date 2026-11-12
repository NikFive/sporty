import { DAY_SHORT, SPORT, dayIndex, fmtDate, fmtMin, getDay, plan } from '../lib/plan'
import { Profile } from '../components/Profile'

export function Workout({ date, idx, athlete }) {
  const day = getDay(date, athlete)
  const item = day.items.find((it) => it.key === idx)
  const back = `#/day/${date}`

  if (!item?.workout)
    return (
      <main class="screen">
        <a class="back mono" href={back}>← {DAY_SHORT[dayIndex(date)]}, {fmtDate(date)}</a>
        <h1 class="display">Нет такой тренировки</h1>
        <p class="lede">Возможно, её нет у этого атлета. Переключи атлета вверху.</p>
      </main>
    )

  const w = item.workout
  const note = w.notes?.[athlete]
  const blocks = [
    ['Разминка', w.warmup],
    ['Основная часть', w.main],
    ['Заминка', w.cooldown],
  ].filter(([, t]) => t)

  return (
    <main class="screen">
      <a class="back mono" href={back}>← {DAY_SHORT[dayIndex(date)]}, {fmtDate(date)}</a>
      <div class="eyebrow mono">
        {SPORT[w.sport] || w.sport} · {item.together ? 'вместе' : 'личное'}
      </div>
      <h1 class="display display-sm">{w.title}</h1>
      <div class="meta mono">
        {fmtMin(item.minutes)}
        {day.scale && day.scale !== 1 && <> · разгрузка, было {fmtMin(w.minutes)}</>}
      </div>

      <div class="profile-big">
        <Profile segments={w.segments} height={84} axis />
      </div>

      <div class="blocks">
        {blocks.map(([t, txt]) => (
          <section class="block" key={t}>
            <h2 class="label mono">{t}</h2>
            <p>{txt}</p>
          </section>
        ))}
      </div>

      {note && (
        <section class="note">
          <h2 class="label mono">{plan.athletes[athlete].name}, тебе</h2>
          <p>{note}</p>
        </section>
      )}

      {w.why && (
        <section class="why">
          <h2 class="label mono">зачем</h2>
          <p>{w.why}</p>
          {w.ref && <p class="ref mono muted small">{w.ref}</p>}
        </section>
      )}
    </main>
  )
}
