import { DAY_SHORT, addDays, fmtHM, fmtRange, getWeek, keyZone, parse, plan, weekNumber } from '../lib/plan'
import { goDay, useSwipe } from '../lib/nav'
import { Icon } from './Icon'

const CARDIO = new Set(['z1', 'z2', 'z3', 'z4', 'z5'])

// Лента недели: 7 дней, у каждого — квадратики сессий в цвете ключевой зоны.
export function WeekStrip({ monday, selected, todayDate, athlete }) {
  const { days, week, stats } = getWeek(monday, athlete)
  const n = weekNumber(monday)
  const template = week && plan.templates[week.template]
  const dow = (selected && days.findIndex((d) => d.date === selected)) || 0
  const shiftWeek = (k) => goDay(addDays(monday, 7 * k + Math.max(0, dow)))
  const swipe = useSwipe(() => shiftWeek(1), () => shiftWeek(-1))

  return (
    <div class="strip" {...swipe}>
      <div class="strip-bar">
        <button class="strip-arrow" onClick={() => shiftWeek(-1)} aria-label="Предыдущая неделя"><Icon name="chevron-left" size={18} /></button>
        <div class={`strip-label${template?.draft ? ' is-draft' : ''}`}>
          <span>{fmtRange(monday, addDays(monday, 6))}</span>
          {n && <span class="dim"> · нед {n}/{plan.weeks.length}</span>}
          {template && <span class="dim"> · {template.title}</span>}
          {week?.kind === 'deload' && <span class="dim"> · −30%</span>}
        </div>
        {stats.total > 0 && <span class="strip-total num">{fmtHM(stats.total)}</span>}
        <button class="strip-arrow" onClick={() => shiftWeek(1)} aria-label="Следующая неделя"><Icon name="chevron-right" size={18} /></button>
      </div>

      <ol class="strip-days">
        {days.map((d, i) => {
          const cls = [
            'cell',
            d.date === selected && 'is-selected',
            d.date === todayDate && 'is-today',
            d.date < todayDate && 'is-past',
            d.rest && 'is-rest',
            d.event?.kind === 'trip' && 'is-trip',
          ].filter(Boolean).join(' ')
          return (
            <li key={d.date}>
              <button class={cls} onClick={() => goDay(d.date)} aria-current={d.date === selected ? 'date' : undefined}>
                <span class="cell-dow">{DAY_SHORT[i].toLowerCase()}</span>
                <span class="cell-num num">{parse(d.date).getDate()}</span>
                <span class="cell-marks">
                  {d.rest ? (
                    <span class="cell-off">—</span>
                  ) : (
                    d.items.slice(0, 3).map((it) => {
                      const z = keyZone(it.workout)
                      return <span key={it.key} class={`mk ${CARDIO.has(z) ? `sq-${z}` : z === 'alt' ? 'sq-alt' : 'mk-out'}`} />
                    })
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
