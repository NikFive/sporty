import { ChevronLeft, ChevronRight } from 'lucide-preact'
import {
  DAY_SHORT, TIME_LABEL, ZONE_NAME, dayIndex, fmtHM, formula, getDay, keyZone, mainSegment, parse,
  daysBetween, DAY_LONG,
} from '../lib/plan'
import { useSwipe } from '../lib/nav'
import { Profile } from '../components/Profile'
import { SportBadge } from '../components/SessionRow'
import { neighborSession } from '../lib/plan'

const openSession = (s) => s && location.replace(`#/d/${s.date}/${s.key}`)
const REL = { '-1': 'Вчера', 0: 'Сегодня', 1: 'Завтра' }
const backLabel = (date, todayDate) => REL[daysBetween(todayDate, date)] || DAY_LONG[dayIndex(date)]
const shortDay = (date) => `${DAY_SHORT[dayIndex(date)]} ${parse(date).getDate()}`

// «Присед со штангой 4×4–6 (2 повтора в запасе)» → ['Присед со штангой', '4×4–6 (2 повтора в запасе)']
function splitExercise(s) {
  const m = s.match(/^(.*?)\s+(\d+\s*[×x].*)$/)
  return m ? [m[1], m[2]] : [s, '']
}

export function Workout({ date, idx, athlete, todayDate }) {
  const day = getDay(date, athlete)
  const item = day.items.find((it) => it.key === idx)
  const back = date === todayDate ? '#/' : `#/day/${date}`
  const prev = item && neighborSession(date, idx, athlete, -1)
  const next = item && neighborSession(date, idx, athlete, 1)
  const swipe = useSwipe(() => openSession(next), () => openSession(prev))

  const nav = (
    <div class="nav">
      <a class="back" href={back}><ChevronLeft size={26} strokeWidth={2.25} />{backLabel(date, todayDate)}</a>
      {item && day.items.length > 1 && <span class="nav-count num">{day.items.indexOf(item) + 1} из {day.items.length}</span>}
    </div>
  )

  if (!item?.workout)
    return (
      <main>
        {nav}
        <h1 class="large-title" style="margin:8px 4px">Нет такой тренировки</h1>
      </main>
    )

  const w = item.workout
  const zone = keyZone(w)
  const exercises = w.main && w.main.includes(' · ') ? w.main.split(' · ').map((s) => splitExercise(s.trim())) : null
  const deload = day.scale && day.scale !== 1
  const sub = [item.together ? 'Общая' : 'Личная', TIME_LABEL[item.time]].filter(Boolean).join(' · ')
  const mainValue = formula(w) || (exercises ? `${exercises.length} упр.` : mainSegment(w))

  return (
    <main key={`${date}/${idx}`} {...swipe} style="touch-action:pan-y">
      {nav}

      <div class="wo-head">
        <SportBadge workout={w} large />
        <h1 class="wo-title">{w.title}</h1>
      </div>
      <p class="wo-sub">{sub}</p>

      <dl class="card stats">
        <div>
          <dt>Время</dt>
          <dd class="num">{fmtHM(item.minutes)}{deload && <span class="was">было {fmtHM(w.minutes)}</span>}</dd>
        </div>
        <div>
          <dt>Основная</dt>
          <dd class="num">{mainValue}</dd>
        </div>
        <div>
          <dt>Зона</dt>
          <dd><span class={`dot bg-${zone}`} />{ZONE_NAME[zone]}</dd>
        </div>
      </dl>

      <div class="card chart">
        <Profile segments={w.segments} />
      </div>

      <h2 class="section-title">Тренировка</h2>
      <div class="card list steps">
        {w.warmup && (
          <div class="cell">
            <span class="step-label">Разминка</span>
            <span class="step-text">{w.warmup}</span>
          </div>
        )}
        {w.main && (
          <div class="cell">
            <span class="step-label">Основная часть</span>
            {exercises ? (
              <ul class="ex">
                {exercises.map(([name, sets]) => (
                  <li key={name}>
                    <span>{name}</span>
                    {sets && <span class="ex-sets num">{sets}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <span class="step-text">{w.main}</span>
            )}
          </div>
        )}
        {w.cooldown && (
          <div class="cell">
            <span class="step-label">Заминка</span>
            <span class="step-text">{w.cooldown}</span>
          </div>
        )}
      </div>

      {w.why && (
        <>
          <h2 class="section-title">Зачем</h2>
          <div class="card why">
            <p>{w.why}</p>
            {w.ref && <p class="ref">{w.ref}</p>}
          </div>
        </>
      )}

      {(prev || next) && (
        <nav class="pager">
          {prev ? (
            <button class="card" onClick={() => openSession(prev)}>
              <span class="pager-dir"><ChevronLeft size={16} strokeWidth={2.5} />Предыдущая</span>
              <span class="pager-title">{prev.item.workout?.title}</span>
              <span class="pager-sub num">{shortDay(prev.date)} · {fmtHM(prev.item.minutes)}</span>
            </button>
          ) : <span />}
          {next ? (
            <button class="card is-next" onClick={() => openSession(next)}>
              <span class="pager-dir">Следующая<ChevronRight size={16} strokeWidth={2.5} /></span>
              <span class="pager-title">{next.item.workout?.title}</span>
              <span class="pager-sub num">{shortDay(next.date)} · {fmtHM(next.item.minutes)}</span>
            </button>
          ) : <span />}
        </nav>
      )}
    </main>
  )
}
