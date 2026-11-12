import {
  DAY_LONG, DAY_SHORT, dayIndex, fmtDate, fmtMin, getDay, nextTraining, plan, weekNumber, addDays, PLAN_START,
} from '../lib/plan'
import { SessionCard, SessionLine } from '../components/SessionCard'
import { DayBanner } from '../components/Banner'

export function Today({ date, athlete, isToday }) {
  const day = getDay(date, athlete)
  const total = day.items.reduce((a, it) => a + it.minutes, 0)
  const n = weekNumber(date)
  const next = nextTraining(date, athlete)
  const nextIsTomorrow = next && next.date === addDays(date, 1)

  return (
    <main class="screen">
      <div class="eyebrow mono">
        {isToday ? 'сегодня' : DAY_SHORT[dayIndex(date)]} · {fmtDate(date)}
        {n && <> · неделя {n}/{plan.weeks.length}</>}
      </div>

      {day.outside ? (
        <>
          <h1 class="display">{date < PLAN_START ? 'Скоро старт' : 'Вне плана'}</h1>
          <p class="lede">
            {date < PLAN_START ? `План начинается ${fmtDate(PLAN_START)}.` : 'На эти даты план ещё не расписан.'}
          </p>
        </>
      ) : day.rest ? (
        <div class="rest">
          <h1 class="display">Выходной.</h1>
          <p class="lede">Ничего не надо. Сон, еда, прогулка — восстановление тоже часть плана.</p>
        </div>
      ) : (
        <>
          <h1 class="display">{DAY_LONG[dayIndex(date)]}</h1>
          <div class="meta mono">
            {day.phase?.title}
            {day.template && !day.event && <> · {day.template.title}</>}
            {' · '}
            {day.items.length} {plural(day.items.length, 'сессия', 'сессии', 'сессий')} · {fmtMin(total)}
          </div>
        </>
      )}

      <DayBanner day={day} />

      {!day.rest && day.items.length > 0 && (
        <div class="stack">
          {day.items.map((it) => <SessionCard key={it.key} item={it} date={date} />)}
        </div>
      )}

      {next && (
        <section class="section">
          <h2 class="label mono">
            {nextIsTomorrow ? 'завтра' : `дальше · ${DAY_SHORT[dayIndex(next.date)]}, ${fmtDate(next.date)}`}
          </h2>
          <div class="lines">
            {next.items.map((it) => <SessionLine key={it.key} item={it} date={next.date} />)}
          </div>
        </section>
      )}
    </main>
  )
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
