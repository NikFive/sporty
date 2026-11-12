import { useEffect, useRef } from 'preact/hooks'
import {
  DAY_LONG, DAY_SHORT, MONTHS_GEN, PLAN_START, addDays, daysBetween, dayIndex, fmtDate, fmtHM, fmtRange,
  getDay, mondayOf, parse, plan, weekNumber,
} from '../lib/plan'
import { goDay, useSwipe } from '../lib/nav'
import { WeekStrip } from '../components/WeekStrip'
import { SessionRow } from '../components/SessionRow'
import { Icon } from '../components/Icon'

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const REL = { '-1': 'Вчера', 0: 'Сегодня', 1: 'Завтра', 2: 'Послезавтра' }
function dayTitle(date, todayDate) {
  const rel = REL[daysBetween(todayDate, date)]
  const dow = DAY_LONG[dayIndex(date)]
  if (rel) return `${rel}, ${dow.toLowerCase()}`
  const d = parse(date)
  return `${dow}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

export function Day({ date, athlete, todayDate, dir }) {
  const day = getDay(date, athlete)
  const total = day.items.reduce((a, it) => a + it.minutes, 0)
  const swipe = useSwipe(() => goDay(addDays(date, 1)), () => goDay(addDays(date, -1)))
  const bodyRef = useRef(null)

  // ←/→ на десктопе
  useEffect(() => {
    const on = (e) => {
      if (e.target.closest?.('input,textarea')) return
      if (e.key === 'ArrowRight') goDay(addDays(date, 1))
      if (e.key === 'ArrowLeft') goDay(addDays(date, -1))
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [date])

  const isRace = day.event?.kind === 'race'
  const eventDay = day.event && daysBetween(day.event.start, date) + 1
  const eventLen = day.event && daysBetween(day.event.start, day.event.end) + 1

  return (
    <>
      <WeekStrip monday={mondayOf(date)} selected={date} todayDate={todayDate} athlete={athlete} />

      <main class={`day anim-${dir || 'none'}`} key={date} ref={bodyRef} {...swipe}>
        {isRace ? (
          <div class="race">
            <div class="race-title">{plan.race.title}</div>
            <p>{plan.race.distances}</p>
          </div>
        ) : day.rest ? (
          <div class="rest">
            <div class="rest-label">{dayTitle(date, todayDate)}</div>
            <h1 class="rest-title">Выходной</h1>
            <p>Ничего не надо. Сон, еда, прогулка — восстановление тоже часть плана.</p>
          </div>
        ) : (
          <header class="day-head">
            <h1 class="day-title">{dayTitle(date, todayDate)}</h1>
            {total > 0 && <span class="day-total num">{fmtHM(total)}</span>}
            <div class="day-meta">
              {day.outside
                ? date < PLAN_START
                  ? `План начинается ${fmtDate(PLAN_START)}`
                  : 'Дальше пока не расписано'
                : `${day.items.length} ${plural(day.items.length, 'сессия', 'сессии', 'сессий')}${day.week?.kind === 'deload' && !day.event ? ' · разгрузка −30%' : ''}`}
            </div>
          </header>
        )}

        {day.event && !isRace && (
          <div class="event">
            <div class="event-title">{day.event.title} · день {eventDay} из {eventLen}</div>
            {day.event.note && <p>{day.event.note}</p>}
          </div>
        )}
        {day.template?.draft && !day.event && !day.rest && <p class="draft">Черновик фазы — детали могут поменяться</p>}

        {day.items.length > 0 && (
          <div class="rows">
            {day.items.map((it) => <SessionRow key={it.key} item={it} date={date} />)}
          </div>
        )}

        <Ahead date={date} athlete={athlete} />
      </main>

      {date !== todayDate && (
        <button class="back-today" onClick={() => goDay(todayDate)}>
          {date > todayDate ? <><Icon name="arrow-left" /> Сегодня</> : <>Сегодня <Icon name="arrow-right" /></>}
        </button>
      )}
    </>
  )
}

// «Дальше»: следующие 6 дней одной строкой каждый, с разделителем недели.
function Ahead({ date, athlete }) {
  const days = Array.from({ length: 6 }, (_, i) => getDay(addDays(date, i + 1), athlete))
  if (days.every((d) => d.outside)) return null
  return (
    <section class="ahead">
      <h2 class="label">Дальше</h2>
      <ol>
        {days.map((d) => {
          const isMon = dayIndex(d.date) === 0
          const n = weekNumber(d.date)
          const total = d.items.reduce((a, it) => a + it.minutes, 0)
          const titles = d.items.map((it) => it.workout?.title).filter(Boolean).join(' + ')
          return (
            <li key={d.date}>
              {isMon && (
                <div class="ahead-week">
                  {n ? `нед ${n}` : 'вне плана'} · {fmtRange(d.date, addDays(d.date, 6))}
                  {d.week?.kind === 'deload' && ' · −30%'}
                </div>
              )}
              <button class="ahead-row" onClick={() => goDay(d.date)}>
                <span class="ahead-dow">{DAY_SHORT[dayIndex(d.date)].toLowerCase()} {parse(d.date).getDate()}</span>
                <span class={`ahead-title${d.rest || d.outside ? ' is-off' : ''}`}>
                  {d.rest ? 'выходной' : d.outside ? '—' : titles}
                </span>
                {total > 0 && <span class="ahead-min num">{fmtHM(total)}</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
