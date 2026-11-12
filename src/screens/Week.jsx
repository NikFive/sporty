import { DAY_SHORT, addDays, fmtMin, fmtRange, getWeek, parse, plan, weekNumber, phaseOf } from '../lib/plan'
import { SessionLine } from '../components/SessionCard'
import { ZoneMix } from '../components/Profile'
import { plural } from './Today'

export function Week({ monday, athlete, todayDate }) {
  const { days, week, stats } = getWeek(monday, athlete)
  const n = weekNumber(monday)
  const phase = phaseOf(monday) || phaseOf(addDays(monday, 6))
  const template = week && plan.templates[week.template]
  const events = [...new Set(days.map((d) => d.event).filter(Boolean))]

  return (
    <main class="screen">
      <nav class="week-nav">
        <a class="icon-btn" href={`#/week/${addDays(monday, -7)}`} aria-label="Предыдущая неделя">←</a>
        <div class="week-nav-mid">
          <div class="week-range">{fmtRange(monday, addDays(monday, 6))}</div>
          <div class="eyebrow mono">
            {n ? `неделя ${n}/${plan.weeks.length}` : 'вне плана'}
            {phase && <> · {phase.title}</>}
            {template && <> · {template.title}</>}
          </div>
        </div>
        <a class="icon-btn" href={`#/week/${addDays(monday, 7)}`} aria-label="Следующая неделя">→</a>
      </nav>

      {(week?.kind === 'deload' || events.length > 0 || template?.draft) && (
        <div class="chips">
          {week?.kind === 'deload' && <span class="chip chip-deload mono">разгрузка −30%</span>}
          {events.map((e) => <span key={e.id} class={`chip chip-${e.kind} mono`}>{e.title}</span>)}
          {template?.draft && <span class="chip chip-draft mono">черновик</span>}
        </div>
      )}

      {stats.sessions > 0 && (
        <div class="week-stats">
          <div class="week-total">
            <span class="num">{fmtMin(stats.total)}</span>
            <span class="mono muted"> · {stats.sessions} {plural(stats.sessions, 'сессия', 'сессии', 'сессий')}</span>
            {stats.str > 0 && <span class="mono muted"> · сила {fmtMin(stats.str)}</span>}
          </div>
          <ZoneMix stats={stats} />
        </div>
      )}

      <ol class="days">
        {days.map((d, i) => {
          const isToday = d.date === todayDate
          const cls = ['day', d.rest && 'day-rest', isToday && 'day-today', d.event && 'day-event'].filter(Boolean).join(' ')
          return (
            <li class={cls} key={d.date}>
              <div class="day-head mono">
                <span class="day-dow">{DAY_SHORT[i]}</span>
                <span class="day-num">{parse(d.date).getDate()}</span>
              </div>
              <div class="day-body">
                {d.rest ? (
                  <span class="day-off">выходной</span>
                ) : d.outside ? (
                  <span class="day-off">—</span>
                ) : (
                  d.items.map((it) => <SessionLine key={it.key} item={it} date={d.date} />)
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
