import { ChevronRight, Sparkles, ThumbsDown, ThumbsUp, Undo2 } from 'lucide-preact'
import { DAY_SHORT, dayIndex, fmtHM, getDay, parse } from '../lib/plan'
import { activeDecision } from '../lib/coach'
import { coachFeedback } from '../lib/whoop'
import { LEVEL, adjustDay, isFresh, recColor } from '../lib/readiness'

// Кольцо recovery, как в WHOOP: процент в центре, дуга цветом зоны.
function Ring({ score }) {
  const R = 26, C = 2 * Math.PI * R
  const color = LEVEL[recColor(score)].color
  return (
    <svg class="ring" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={R} fill="none" stroke="var(--glass-strong)" stroke-width="6" />
      <circle cx="32" cy="32" r={R} fill="none" stroke={color} stroke-width="6" stroke-linecap="round"
        stroke-dasharray={`${(C * Math.max(2, score)) / 100} ${C}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" text-anchor="middle" class="ring-num">{Math.round(score)}</text>
    </svg>
  )
}

function Stat({ label, value, sub, warn }) {
  return (
    <div class="rd-stat">
      <span class="rd-stat-label">{label}</span>
      <span class={`rd-stat-value num${warn ? ' is-warn' : ''}`}>{value ?? '—'}</span>
      {sub && <span class="rd-stat-sub">{sub}</span>}
    </div>
  )
}

const pctDiff = (v, b) => (v && b ? Math.round((v / b - 1) * 100) : null)
const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

/** Корректировка дня по WHOOP или null (нет данных / не сегодня / recovery не свежая). */
export function dayAdjustment(day, whoop) {
  const r = whoop?.data?.recovery
  return r && isFresh(r) ? adjustDay(day, whoop.data) : null
}

/** Карточка «Готовность» на сегодня: показатели WHOOP + как скорректирован план. */
export function Readiness({ day, whoop, adj, coach, athlete }) {
  const { data, state } = whoop

  if (state === 'off' || (state === 'error' && !data))
    return state === 'off' ? (
      <a class="card rd-connect" href="#/me">
        <span class="rd-connect-dot" aria-hidden="true" />
        <span class="cell-text">
          <span class="cell-title" style="display:block">Подключи WHOOP</span>
          <span class="cell-sub" style="display:block">План будет подстраиваться под восстановление</span>
        </span>
        <ChevronRight class="chev" size={18} strokeWidth={2.5} />
      </a>
    ) : null
  if (!data) return null

  const r = data.recovery
  const fresh = isFresh(r)
  if (!r || !fresh || !adj)
    return (
      <div class="card rd">
        <div class="rd-head">
          <div>
            <h2 class="rd-title">Ждём восстановление</h2>
            <p class="rd-summary">WHOOP ещё не посчитал сегодняшнее восстановление — открой приложение WHOOP, чтобы синхронизировать. План пока без изменений</p>
          </div>
        </div>
      </div>
    )

  const b = data.baseline || {}
  const s = data.sleep
  const hrvD = b.days >= 4 ? pctDiff(r.hrv, b.hrv) : null
  const rhrD = b.days >= 4 && r.rhr && b.rhr ? Math.round(r.rhr - b.rhr) : null
  const flag = new Set(adj.flags.map((f) => f.key))
  const dec = activeDecision(coach)
  const reverted = coach?.status === 'ok' && coach.feedback?.reverted
  const thinking = coach?.enabled && !dec && !reverted && (coach.running || coach.status === 'none')

  const headline = dec ? dec.headline : reverted ? 'План без изменений' : adj.headline
  const summary = dec ? dec.summary : reverted ? 'Ты вернул план как было. Совет тренера можно вернуть кнопкой ниже' : adj.summary

  return (
    <section class="card rd" aria-label="Готовность по WHOOP">
      <div class="rd-head">
        <Ring score={r.score} />
        <div class="rd-head-text">
          <span class="rd-kicker">
            {dec ? <><Sparkles size={13} strokeWidth={2.25} class="rd-spark" /> ИИ-тренер · </> : null}
            Восстановление · {LEVEL[recColor(r.score)].label.toLowerCase()}
          </span>
          <h2 class="rd-title">{headline}</h2>
          {summary && <p class="rd-summary">{summary}</p>}
        </div>
      </div>

      <div class="rd-stats">
        <Stat label="HRV" value={r.hrv ? Math.round(r.hrv) : null} sub={hrvD != null ? `${signed(hrvD)}% к норме` : 'мс'} warn={flag.has('hrv')} />
        <Stat label="Пульс покоя" value={r.rhr} sub={rhrD != null ? `${signed(rhrD)} к норме` : 'уд/мин'} warn={flag.has('rhr')} />
        <Stat label="Сон" value={s?.hours != null ? fmtHM(s.hours * 60) : null} sub={s?.performance != null ? `${s.performance}% нужного` : null} warn={flag.has('sleep')} />
        <Stat label="Strain вчера" value={data.strain?.yesterday ?? null} sub={data.strain?.today != null ? `сегодня ${data.strain.today}` : null} warn={flag.has('strain')} />
      </div>

      {dec ? <CoachChanges dec={dec} athlete={athlete} today={day.date} /> : !reverted && adj.changes.size > 0 && (
        <ul class="rd-changes">
          {day.items.filter((it) => adj.changes.has(it.key)).map((it) => {
            const c = adj.changes.get(it.key)
            return (
              <li key={it.key}>
                <span class="rd-ch-title">{it.workout?.title}</span>
                <span class="rd-ch-how">
                  {c.to === 0 ? 'отменить' : c.to !== c.from ? <><s>{fmtHM(c.from)}</s> → {fmtHM(c.to)} · </> : null}
                  {c.to === 0 ? '' : c.how}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {dec ? (
        <>
          {dec.reasons?.length > 0 && <p class="rd-why">Почему: {dec.reasons.join('; ')}.</p>}
          {dec.week_note && <p class="rd-why">{dec.week_note}</p>}
        </>
      ) : !reverted && (adj.reasons.length > 0 || data.stale) && (
        <p class="rd-why">
          {adj.reasons.length > 0 && <>Почему: {adj.reasons.join(', ')}.</>}
          {data.stale && ' Данные могли устареть — нет связи с WHOOP.'}
        </p>
      )}
      {thinking && <p class="rd-why rd-thinking"><Sparkles size={13} strokeWidth={2.25} class="rd-spark" /> ИИ-тренер разбирает твои данные — через минуту здесь будет его решение</p>}

      {(dec || reverted) && (
        <div class="rd-actions">
          {dec && (
            <>
              <button class={`rd-vote${coach.feedback?.vote === 1 ? ' is-on' : ''}`} aria-pressed={coach.feedback?.vote === 1} aria-label="Хороший совет" onClick={() => coachFeedback(athlete, { vote: 1 })}><ThumbsUp size={17} strokeWidth={2} /></button>
              <button class={`rd-vote${coach.feedback?.vote === -1 ? ' is-on' : ''}`} aria-pressed={coach.feedback?.vote === -1} aria-label="Плохой совет" onClick={() => coachFeedback(athlete, { vote: -1 })}><ThumbsDown size={17} strokeWidth={2} /></button>
            </>
          )}
          <button class="rd-revert" onClick={() => coachFeedback(athlete, { reverted: !reverted })}>
            <Undo2 size={16} strokeWidth={2} />{reverted ? 'Вернуть совет тренера' : 'Вернуть как было'}
          </button>
        </div>
      )}
    </section>
  )
}

const dayLabel = (date, today) => (date === today ? 'Сегодня' : `${DAY_SHORT[dayIndex(date)]} ${parse(date).getDate()}`)

// Список правок тренера по всей неделе: «Сегодня · Вел — суб-порог: 1:13 → 0:45 · …», «Ср 18 ↔ Чт 19».
function CoachChanges({ dec, athlete, today }) {
  if (!dec.changes?.length) return null
  return (
    <ul class="rd-changes">
      {dec.changes.map((c, i) => {
        if (c.action === 'swap')
          return (
            <li key={i}>
              <span class="rd-ch-title">{dayLabel(c.date, today)} ↔ {dayLabel(c.swap_with, today).toLowerCase()}</span>
              <span class="rd-ch-how">{c.how}</span>
            </li>
          )
        const it = getDay(c.date, athlete).items.find((x) => x.key === c.key)
        return (
          <li key={i}>
            <span class="rd-ch-title">{c.date !== today && <span class="rd-ch-date">{dayLabel(c.date, today)} · </span>}{c.title || it?.workout?.title}</span>
            <span class="rd-ch-how">
              {c.action === 'cancel' ? 'отменить · ' : c.minutes != null && c.minutes !== c.from ? <><s>{fmtHM(c.from)}</s> → {fmtHM(c.minutes)} · </> : null}
              {c.how}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
