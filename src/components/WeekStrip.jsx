import { ChevronLeft, ChevronRight, Moon } from 'lucide-preact'
import { DAY_SHORT, addDays, fmtRange, getWeek, keyZone, parse, weekOf } from '../lib/plan'
import { goDay, useSwipe } from '../lib/nav'
import { isDone } from '../lib/done'

// Лента недели как в Календаре iOS. Под датой: точки тренировок в цвете зоны
// (полая — запланирована, закрашенная — сделана), луна — выходной, красное кольцо — восстановление.
export function WeekStrip({ monday, selected, todayDate, athlete }) {
  const { days } = getWeek(monday, athlete)
  const deload = weekOf(monday)?.kind === 'deload'
  const dow = Math.max(0, days.findIndex((d) => d.date === selected))
  const shiftWeek = (k) => goDay(addDays(monday, 7 * k + dow))
  const swipe = useSwipe(() => shiftWeek(1), () => shiftWeek(-1))

  return (
    <div class="card week" {...swipe}>
      <div class="week-bar">
        <span class="week-range">
          {fmtRange(monday, addDays(monday, 6))}
          {deload && <span class="week-tag">разгрузка −30%</span>}
        </span>
        <span class="week-arrows">
          <button onClick={() => shiftWeek(-1)} aria-label="Предыдущая неделя"><ChevronLeft size={22} strokeWidth={2.25} /></button>
          <button onClick={() => shiftWeek(1)} aria-label="Следующая неделя"><ChevronRight size={22} strokeWidth={2.25} /></button>
        </span>
      </div>
      <ol class="week-days">
        {days.map((d, i) => {
          const medical = d.rest && d.event?.kind === 'medical'
          const cls = [
            'wd',
            d.date === selected && 'is-selected',
            d.date === todayDate && 'is-today',
            d.date < todayDate && 'is-past',
            d.event?.kind === 'trip' && 'is-trip',
          ].filter(Boolean).join(' ')
          return (
            <li key={d.date}>
              <button class={cls} onClick={() => goDay(d.date)} aria-current={d.date === selected ? 'date' : undefined}>
                <span class="wd-dow">{DAY_SHORT[i]}</span>
                <span class="wd-num num">{parse(d.date).getDate()}</span>
                <span class="wd-dots">
                  {medical ? (
                    <span class="dot dot-medical" title="Восстановление" />
                  ) : d.rest ? (
                    <Moon class="wd-moon" size={9} strokeWidth={2.5} />
                  ) : (
                    d.items.slice(0, 3).map((it) => (
                      <span
                        key={it.key}
                        class={`dot zc-${keyZone(it.workout)}${isDone(athlete, d.date, it.id) ? ' is-done' : ''}`}
                      />
                    ))
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
