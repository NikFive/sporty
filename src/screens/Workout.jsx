import {
  DAY_SHORT, TIME_LABEL, ZONE_NAME, dayIndex, fmtDate, fmtHM, fmtMin, formula, getDay, keyZone, mainSegment,
  neighborSession, parse, plan,
} from '../lib/plan'
import { useSwipe } from '../lib/nav'
import { Profile } from '../components/Profile'
import { ZoneSquare, sportLabel } from '../components/SessionRow'
import { plural } from './Day'
import { Icon } from '../components/Icon'

const dayLabel = (date) => `${DAY_SHORT[dayIndex(date)]}, ${fmtDate(date)}`
const openSession = (s) => s && location.replace(`#/d/${s.date}/${s.key}`)

// «Присед со штангой 4×4–6 (2 повтора в запасе)» → ['Присед со штангой', '4×4–6 (2 повтора в запасе)']
function splitExercise(s) {
  const m = s.match(/^(.*?)\s+(\d+\s*[×x].*)$/)
  return m ? [m[1], m[2]] : [s, '']
}

export function Workout({ date, idx, athlete }) {
  const day = getDay(date, athlete)
  const item = day.items.find((it) => it.key === idx)
  const back = date ? `#/day/${date}` : '#/'
  const prev = item && neighborSession(date, idx, athlete, -1)
  const next = item && neighborSession(date, idx, athlete, 1)
  const swipe = useSwipe(() => openSession(next), () => openSession(prev))

  if (!item?.workout)
    return (
      <main class="wo">
        <a class="wo-back" href={back}><Icon name="arrow-left" /> {dayLabel(date)}</a>
        <h1 class="wo-title">Нет такой тренировки</h1>
        <p class="muted">Возможно, её нет у этого атлета</p>
      </main>
    )

  const w = item.workout
  const zone = keyZone(w)
  const note = w.notes?.[athlete]
  const isList = w.main && w.main.includes(' · ')
  const deload = day.scale && day.scale !== 1
  const meta = [sportLabel(w), item.together ? 'общая' : 'личная', TIME_LABEL[item.time]].filter(Boolean).join(' · ')

  return (
    <main class="wo" key={`${date}/${idx}`} {...swipe}>
      <div class="wo-top">
        <a class="wo-back" href={back}><Icon name="arrow-left" /> {dayLabel(date)}</a>
        {day.items.length > 1 && <span class="wo-count num">{day.items.indexOf(item) + 1} из {day.items.length}</span>}
      </div>

      <div class="wo-meta">{meta}</div>
      <h1 class="wo-title">{w.title}</h1>

      <dl class="stats">
        <div>
          <dt>Время</dt>
          <dd class="num">{fmtHM(item.minutes)}</dd>
          {deload && <dd class="stats-sub">было {fmtHM(w.minutes)}</dd>}
        </div>
        <div>
          <dt>Основная</dt>
          <dd class="num">
            {formula(w) ||
              (isList
                ? `${w.main.split(' · ').length} ${plural(w.main.split(' · ').length, 'упражнение', 'упражнения', 'упражнений')}`
                : mainSegment(w))}
          </dd>
        </div>
        <div>
          <dt>Зона</dt>
          <dd><ZoneSquare zone={zone} size={9} /> {ZONE_NAME[zone]}{plan.zones[zone] ? ` ${plan.zones[zone].name}` : ''}</dd>
        </div>
      </dl>

      {note && (
        <section class="note">
          <h2 class="label">{plan.athletes[athlete].name}, тебе</h2>
          <p>{note}</p>
        </section>
      )}

      <div class="wo-chart">
        <Profile segments={w.segments} height={88} axis />
      </div>

      <dl class="structure">
        {w.warmup && (<><dt>Разминка</dt><dd>{w.warmup}</dd></>)}
        {w.main && (
          <>
            <dt>Основная</dt>
            <dd>
              {isList ? (
                <ul class="ex">
                  {w.main.split(' · ').map((s) => {
                    const [name, sets] = splitExercise(s.trim())
                    return (
                      <li key={s}>
                        <span>{name}</span>
                        {sets && <span class="ex-sets num">{sets}</span>}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                w.main
              )}
            </dd>
          </>
        )}
        {w.cooldown && (<><dt>Заминка</dt><dd>{w.cooldown}</dd></>)}
      </dl>

      {w.why && (
        <section class="why">
          <h2 class="label">Зачем</h2>
          <p>{w.why}</p>
          {w.ref && <p class="why-ref">{w.ref}</p>}
        </section>
      )}

      <nav class="wo-nav">
        {prev ? (
          <button onClick={() => openSession(prev)}>
            <span class="wo-nav-dir"><Icon name="arrow-left" size={14} /> Предыдущая</span>
            <span class="wo-nav-title">{prev.item.workout?.title}</span>
            <span class="wo-nav-sub">{DAY_SHORT[dayIndex(prev.date)].toLowerCase()} {parse(prev.date).getDate()} · {fmtHM(prev.item.minutes)}</span>
          </button>
        ) : <span />}
        {next ? (
          <button class="is-next" onClick={() => openSession(next)}>
            <span class="wo-nav-dir">Следующая <Icon name="arrow-right" size={14} /></span>
            <span class="wo-nav-title">{next.item.workout?.title}</span>
            <span class="wo-nav-sub">{DAY_SHORT[dayIndex(next.date)].toLowerCase()} {parse(next.date).getDate()} · {fmtHM(next.item.minutes)}</span>
          </button>
        ) : <span />}
      </nav>
      {deload && <p class="muted small">Разгрузочная неделя: длительность уже уменьшена на 30% ({fmtMin(item.minutes)})</p>}
    </main>
  )
}
