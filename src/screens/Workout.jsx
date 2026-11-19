import { useEffect, useState } from 'preact/hooks'
import { ChevronLeft, ChevronRight } from 'lucide-preact'
import {
  DAY_SHORT, TIME_LABEL, ZONE_NAME, dayIndex, fmtHM, formula, getDay, keyZone, parse,
  daysBetween, DAY_LONG,
} from '../lib/plan'
import { useSwipe } from '../lib/nav'
import { Profile } from '../components/Profile'
import { DoneToggle, SportBadge } from '../components/SessionRow'
import { useDoneVersion } from '../lib/done'
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

// Разгрузка: подсказываем, что именно убрать, а не только «меньше минут».
function deloadHint(w) {
  const block = (w.segments || []).find((s) => !Array.isArray(s))
  if (block && block.x > 1) {
    const n = Math.max(1, Math.floor(block.x * 0.7))
    return `Разгрузка: ${n} ${n === 1 ? 'повтор' : n < 5 ? 'повтора' : 'повторов'} вместо ${block.x}, разминка и заминка как есть`
  }
  if (w.sport === 'strength' || w.sport === 'plyo') return 'Разгрузка: на один подход меньше в каждом упражнении, вес тот же'
  return 'Разгрузка: основная часть на треть короче, интенсивность та же'
}

export function Workout({ date, idx, athlete, todayDate }) {
  const day = getDay(date, athlete) // с поправками тренера
  const item = day.items.find((it) => it.key === idx)
  // правка тренера: «С поправкой» (по умолчанию) или «По плану»; на другой тренировке — снова «С поправкой»
  const [view, setView] = useState('coach')
  useEffect(() => setView('coach'), [date, idx])
  const back = date === todayDate ? '#/' : `#/day/${date}`
  const prev = item && neighborSession(date, idx, athlete, -1)
  const next = item && neighborSession(date, idx, athlete, 1)
  const swipe = useSwipe(() => openSession(next), () => openSession(prev))
  useDoneVersion()

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

  const changed = !!item.coach
  const cancelled = !!item.cancelled
  const asPlan = changed && (view === 'plan' || cancelled)
  const w = asPlan ? item.planned : item.workout
  const minutes = asPlan ? item.plannedMinutes : item.minutes
  const hasContent = changed && !!item.coach.workout // у правок по правилам нового содержания нет
  const zone = keyZone(w)
  const parseEx = (main) => (main && main.includes(' · ') ? main.split(' · ').map((s) => splitExercise(s.trim())) : null)
  const exercises = parseEx(w.main)
  // «было 4×6» у упражнений, где тренер поменял подходы (сопоставляем по названию)
  const plannedEx = changed && !asPlan && hasContent ? parseEx(item.planned?.main) : null
  const wasSets = (name) => {
    if (!plannedEx) return null
    const n = name.toLowerCase()
    const hit = plannedEx.find(([pn]) => { const p = pn.toLowerCase(); return p === n || p.startsWith(n) || n.startsWith(p) })
    return hit && hit[1] && hit[1] !== '' ? hit[1] : null
  }
  const deload = day.scale && day.scale !== 1 && !(changed && !asPlan) // версия тренера уже посчитана от разгрузки
  const sub = [item.together ? 'Общая' : 'Личная', TIME_LABEL[item.time]].filter(Boolean).join(' · ')

  // Колонки статистики: только осмысленные. Для сноуборда и мобилити — одно время.
  const simple = w.sport === 'alt' || w.sport === 'mobility'
  const brick = w.split ? `${fmtHM(w.split.bike)} → ${fmtHM(w.split.run)}` : null
  const mainCol = brick || formula(w) || (exercises ? `${exercises.length} упр.` : null)
  const stats = [['Время', fmtHM(minutes), changed && !asPlan && minutes !== item.plannedMinutes ? `было ${fmtHM(item.plannedMinutes)}` : deload ? '−30% · разгрузка' : null]]
  if (!simple && mainCol) stats.push(['Основная', mainCol])
  if (!simple) stats.push(['Зона', <><span class={`dot bg-${zone}`} />{ZONE_NAME[zone]}</>])

  return (
    <main key={`${date}/${idx}`} {...swipe} style="touch-action:pan-y">
      {nav}

      <div class="wo-head">
        <SportBadge workout={w} large />
        <h1 class="wo-title" tabindex="-1">{w.title}</h1>
      </div>
      <p class="wo-sub">{sub}</p>

      {changed && !cancelled && hasContent && (
        <div class="seg seg-fill wo-seg" role="tablist" aria-label="Версия тренировки">
          {[['coach', 'С поправкой'], ['plan', 'По плану']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} class={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
      )}
      {changed && (
        <div class={`card wo-note${asPlan ? ' is-plan' : ''}`}>
          {cancelled ? (
            <><div class="wo-note-l">Тренер отменил эту тренировку</div>{item.coach.how && <p>{item.coach.how}</p>}</>
          ) : asPlan ? (
            <><div class="wo-note-l">Так было по плану</div><p>Сегодня тренер это поменял. <button class="link" onClick={() => setView('coach')}>Показать версию тренера</button></p></>
          ) : (
            <><div class="wo-note-l">Что поменял тренер</div><p>{item.coach.how}</p></>
          )}
        </div>
      )}

      <dl class={`card stats cols-${stats.length}`}>
        {stats.map(([label, value, extra]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd class="num">{value}</dd>
            {extra && <dd class="stats-extra">{extra}</dd>}
          </div>
        ))}
      </dl>

      {deload && <p class="deload-note">{deloadHint(w)}</p>}

      <div class={`card chart${cancelled ? ' is-off' : ''}`}>
        <Profile segments={w.segments} ghost={changed && !asPlan && hasContent ? item.planned?.segments : null} />
        {changed && !asPlan && hasContent && (
          <div class="pf-legend" aria-hidden="true">
            <span><i class={`lg-now seg-${zone}`} />Сегодня {fmtHM(minutes)}</span>
            <span><i class="lg-was" />По плану {fmtHM(item.plannedMinutes)}</span>
          </div>
        )}
      </div>

      <h2 class="section-title">Тренировка</h2>
      <div class={`card list steps${cancelled ? ' is-off' : ''}`}>
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
                {exercises.map(([name, sets]) => {
                  const was = wasSets(name)
                  // сравниваем суть подходов: без скобок и пунктуации («2×30 с» = «2×30 с.»)
                  const core = (x) => (x || '').replace(/\(.*?\)/g, '').replace(/[.,;\s]+/g, ' ').trim().toLowerCase()
                  const diff = was && core(was) !== core(sets)
                  return (
                    <li key={name} class={diff ? 'is-changed' : ''}>
                      <span>{name}</span>
                      {sets && (
                        <span class="sets">
                          <span class="ex-sets num">{sets}</span>
                          {diff && <span class="was num">было {was}</span>}
                        </span>
                      )}
                    </li>
                  )
                })}
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

      {!cancelled && (
        <div class="card done-card">
          <DoneToggle athlete={athlete} date={date} item={item} large />
        </div>
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
