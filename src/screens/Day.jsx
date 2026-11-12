import { useEffect } from 'preact/hooks'
import { HeartPulse, MountainSnow, Moon } from 'lucide-preact'
import {
  DAY_LONG, DAY_SHORT, MONTHS_GEN, PLAN_START, addDays, daysBetween, dayIndex, fmtDate, fmtHM,
  getDay, mondayOf, parse, plan,
} from '../lib/plan'
import { goDay, useSwipe } from '../lib/nav'
import { WeekStrip } from '../components/WeekStrip'
import { SessionRow } from '../components/SessionRow'

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const REL = { '-1': 'Вчера', 0: 'Сегодня', 1: 'Завтра' }
const dateLong = (date) => {
  const d = parse(date)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

// Что за день: кардио / силовая / отдых и их комбинации через «+».
const KIND = { run: 'Кардио', bike: 'Кардио', swim: 'Кардио', brick: 'Кардио', strength: 'Силовая', plyo: 'Силовая', mobility: 'Мобилити', race: 'Старт' }
export function dayKind(day) {
  if (day.event?.kind === 'medical' && day.rest) return 'Восстановление'
  if (day.rest) return 'Отдых'
  if (day.outside) return ''
  const kinds = []
  for (const it of day.items) {
    const w = it.workout
    if (!w) continue
    const k = w.sport === 'alt' ? w.title : KIND[w.sport] || w.title
    if (!kinds.includes(k)) kinds.push(k)
  }
  const t = kinds.join(' + ').toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function Day({ date, athlete, todayDate, dir }) {
  const day = getDay(date, athlete)
  const total = day.items.reduce((a, it) => a + it.minutes, 0)
  const swipe = useSwipe(() => goDay(addDays(date, 1)), () => goDay(addDays(date, -1)))

  useEffect(() => {
    const on = (e) => {
      if (e.key === 'ArrowRight') goDay(addDays(date, 1))
      if (e.key === 'ArrowLeft') goDay(addDays(date, -1))
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  }, [date])

  // Заголовок: «Чт, 12 ноября». Под ним — «Сегодня · Кардио + силовая».
  const rel = REL[daysBetween(todayDate, date)]
  const title = `${DAY_SHORT[dayIndex(date)]}, ${dateLong(date)}`
  const sub = [rel, dayKind(day)].filter(Boolean).join(' · ')

  const isRace = day.event?.kind === 'race'

  return (
    <>
      <div class="title-block">
        <h1 class="large-title">{title}</h1>
        <p class="subtitle">{sub}</p>
      </div>

      <WeekStrip monday={mondayOf(date)} selected={date} todayDate={todayDate} athlete={athlete} />

      <div class={`day-body anim-${dir || 'none'}`} key={date} {...swipe}>
        <div style="height:12px" />
        {day.event && !isRace && day.event.kind !== 'medical' && (
          <div class="card event">
            <span class="badge bg-alt"><MountainSnow size={18} strokeWidth={2} /></span>
            <div>
              <div class="event-title">{day.event.title} · день {daysBetween(day.event.start, date) + 1} из {daysBetween(day.event.start, day.event.end) + 1}</div>
              {day.event.note && <p>{day.event.note}</p>}
            </div>
          </div>
        )}

        {isRace ? (
          <div class="card race">
            <h2>{plan.race.title}</h2>
            <p>{plan.race.distances}</p>
          </div>
        ) : day.rest ? (
          day.event?.kind === 'medical' ? (
            <div class="card rest">
              <span class="rest-icon is-medical"><HeartPulse size={26} strokeWidth={2} /></span>
              <h2>{day.event.title} · восстановление</h2>
              {day.event.note && <p>{day.event.note}</p>}
            </div>
          ) : (
            <div class="card rest">
              <span class="rest-icon"><Moon size={26} strokeWidth={2} /></span>
              <h2>Выходной</h2>
              <p>Сон, еда, прогулка — восстановление тоже часть плана</p>
            </div>
          )
        ) : day.outside ? (
          <div class="card rest">
            <h2>{date < PLAN_START ? 'Скоро старт' : 'Пока не расписано'}</h2>
            {date < PLAN_START && <p>План начинается {fmtDate(PLAN_START)}</p>}
          </div>
        ) : (
          <div class="card list">
            {day.items.map((it) => <SessionRow key={it.key} item={it} date={date} />)}
          </div>
        )}
        {day.template?.draft && !day.event && !day.rest && <p class="footnote">Черновик — детали могут поменяться</p>}

        <Ahead date={date} athlete={athlete} />
      </div>

      {date !== todayDate && (
        <button class="to-today" onClick={() => goDay(todayDate)}>
          Сегодня
        </button>
      )}
    </>
  )
}

// «Дальше»: следующие 6 дней, одна строка на день.
function Ahead({ date, athlete }) {
  const days = Array.from({ length: 6 }, (_, i) => getDay(addDays(date, i + 1), athlete))
  if (days.every((d) => d.outside)) return null
  return (
    <section class="ahead">
      <h2 class="section-title">Дальше</h2>
      <div class="card list">
        {days.map((d) => {
          const total = d.items.reduce((a, it) => a + it.minutes, 0)
          const titles = d.items.map((it) => it.workout?.title).filter(Boolean).join(' + ')
          return (
            <button class="cell" key={d.date} onClick={() => goDay(d.date)}>
              <span class={`ahead-dow${dayIndex(d.date) === 0 ? ' is-week' : ''}`}>
                {DAY_SHORT[dayIndex(d.date)]} {parse(d.date).getDate()}
              </span>
              <span class={`ahead-title${d.rest || d.outside ? ' is-off' : ''}`}>
                {d.rest ? (d.event?.kind === 'medical' ? 'Восстановление' : 'Выходной') : d.outside ? '—' : titles}
              </span>
              {total > 0 && <span class="cell-value num">{fmtHM(total)}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
