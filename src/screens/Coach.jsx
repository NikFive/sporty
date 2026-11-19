import { useEffect, useRef, useState } from 'preact/hooks'
import { ArrowLeftRight, ChevronLeft, ChevronRight, ThumbsDown, ThumbsUp, Undo2 } from 'lucide-preact'
import { DAY_SHORT, dayIndex, fmtHM, getDay, getPlanDay, parse } from '../lib/plan'
import { LEVEL, recColor } from '../lib/readiness'
import { overlayDay, useCoachCtx } from '../lib/coach'
import { coachFeedback } from '../lib/whoop'
import { Ring } from '../components/Readiness'
import { SportBadge } from '../components/SessionRow'

const REC_WORD = { green: 'Зелёное', yellow: 'Жёлтое', red: 'Красное' }
const ORD = ['', 'Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый', 'Шестой', 'Седьмой']
const dayLabel = (date, today) => (date === today ? 'Сегодня' : `${DAY_SHORT[dayIndex(date)]} ${parse(date).getDate()}`)
const hm = (iso) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` }
const fmtH = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }

// Серия по истории recovery (новые сначала): «Третий день подряд не зелёный»
function streakNote(hist) {
  if (!hist?.length) return null
  const green = (s) => recColor(s) === 'green'
  const g0 = green(hist[0].score)
  let n = 1
  while (n < hist.length && green(hist[n].score) === g0) n++
  if (n >= 2) return `${ORD[Math.min(n, 7)]} день подряд ${g0 ? 'зелёный' : 'не зелёный'}`
  if (g0 && hist.length > 1) return 'Первый зелёный день после спада'
  return null
}

function Trend({ hist, today }) {
  const days = (hist || []).slice(0, 7).reverse()
  if (days.length < 3) return null
  const label = days.map((d) => `${DAY_SHORT[dayIndex(new Date(d.at).toLocaleDateString('en-CA'))]} ${d.score}`).join(', ')
  return (
    <div class="trend" role="img" aria-label={`Восстановление за ${days.length} дней: ${label}`}>
      {days.map((d) => {
        const date = new Date(d.at).toLocaleDateString('en-CA')
        const c = recColor(d.score)
        return (
          <div class={`tr${date === today ? ' is-today' : ''}`} key={d.at}>
            <span class="tr-n num">{d.score}</span>
            <span class="tr-plot"><span class={`tr-bar bar-${c[0]}`} style={{ height: `${Math.max(4, d.score) * 0.56}px` }} /></span>
            <span class="tr-d">{DAY_SHORT[dayIndex(date)]}</span>
          </div>
        )
      })}
    </div>
  )
}

function Stats({ data, flags }) {
  const r = data.recovery, b = data.baseline || {}, s = data.sleep
  const warn = new Set(flags.map((f) => f.key))
  const items = [
    ['HRV', r.hrv ? Math.round(r.hrv) : '—', b.days >= 4 && b.hrv ? `норма ${Math.round(b.hrv)}` : 'мс', warn.has('hrv')],
    ['Пульс покоя', r.rhr ?? '—', b.days >= 4 && b.rhr ? `норма ${Math.round(b.rhr)}` : 'уд/мин', warn.has('rhr')],
    ['Сон', s?.hours != null ? fmtH(s.hours) : '—', s?.needHours ? `из ${fmtH(s.needHours)}` : null, warn.has('sleep')],
    ['Strain вчера', data.strain?.yesterday ?? '—', data.strain?.today != null ? `сегодня ${data.strain.today}` : null, warn.has('strain')],
  ]
  return (
    <div class="cd-stats">
      {items.map(([l, v, sub, w]) => (
        <div class="cd-stat" key={l}>
          <span class="cd-stat-l">{l}</span>
          <span class={`cd-stat-v num${w ? ' is-warn' : ''}`}>{v}</span>
          {sub && <span class="cd-stat-s">{sub}</span>}
        </div>
      ))}
    </div>
  )
}

/** Строки «Что меняем»: каждая ведёт в тренировку. */
function Changes({ dec, athlete, today }) {
  const list = [...dec.changes].sort((a, b) => a.date.localeCompare(b.date) || (a.key ?? -1) - (b.key ?? -1))
  if (!list.length) return null
  return (
    <>
      <h2 class="section-title">Что меняем</h2>
      <div class="card list ch">
        {list.map((c, i) => {
          if (c.action === 'swap')
            return (
              <a class="cell" key={i} href={`#/day/${c.date}`}>
                <span class="badge note-badge"><ArrowLeftRight size={18} strokeWidth={2} /></span>
                <span class="cell-text">
                  <span class="ch-title">{dayLabel(c.date, today)} ⇄ {dayLabel(c.swap_with, today).toLowerCase()}</span>
                  <span class="ch-how">{c.how}</span>
                </span>
                <ChevronRight class="chev ch-chev" size={18} strokeWidth={2.5} />
              </a>
            )
          // строим из решения напрямую: после «Вернуть как было» наложения в getDay нет
          const it = overlayDay(getPlanDay(c.date, athlete), athlete, dec).items.find((x) => x.key === c.key)
          const planned = getPlanDay(c.date, athlete).items.find((x) => x.key === c.key)
          if (!it) return null
          return (
            <a class="cell" key={i} href={`#/d/${c.date}/${c.key}`}>
              <SportBadge workout={c.action === 'cancel' ? planned.workout : it.workout} />
              <span class="cell-text">
                {c.date !== today && <span class="ch-day">{dayLabel(c.date, today)}</span>}
                <span class="ch-title">{c.action === 'cancel' ? planned.workout?.title : it.workout?.title}</span>
                <span class="ch-meta num">
                  {c.action === 'cancel' ? 'Отменена' : fmtHM(it.minutes)}
                  {it.plannedMinutes != null && it.minutes !== it.plannedMinutes && <span class="was-i"> · было {fmtHM(it.plannedMinutes)}</span>}
                </span>
                {c.how && <span class="ch-how">{c.how}</span>}
              </span>
              <ChevronRight class="chev ch-chev" size={18} strokeWidth={2.5} />
            </a>
          )
        })}
      </div>
    </>
  )
}

function Feedback({ st }) {
  const [vote, setVote] = useState(st.coach?.feedback?.vote ?? null) // сразу, не дожидаясь ответа сервера
  const [ack, setAck] = useState(null)
  const t = useRef(null)
  useEffect(() => () => clearTimeout(t.current), [])
  const send = (v) => {
    const next = vote === v ? null : v
    setVote(next)
    coachFeedback(st.athlete, { vote: next ?? 0 })
    clearTimeout(t.current)
    setAck(next === 1 ? 'Спасибо, записал' : next === -1 ? (st.dec?.changes.length ? 'Понял. Можно вернуть как было' : 'Понял') : null)
    t.current = setTimeout(() => setAck(null), 2600)
  }
  return (
    <div class="card fb">
      <span class="fb-q" role="status">{ack || 'Совет подходит?'}</span>
      <button class={`vote${vote === 1 ? ' is-on' : ''}`} aria-pressed={vote === 1} aria-label="Совет подходит" onClick={() => send(1)}><ThumbsUp size={18} strokeWidth={2} /></button>
      <button class={`vote${vote === -1 ? ' is-on' : ''}`} aria-pressed={vote === -1} aria-label="Совет не подходит" onClick={() => send(-1)}><ThumbsDown size={18} strokeWidth={2} /></button>
    </div>
  )
}

export function Coach({ athlete, todayDate }) {
  const st = useCoachCtx()
  const back = (
    <div class="nav">
      <a class="back" href="#/" onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back() } }}><ChevronLeft size={26} strokeWidth={2.25} />Сегодня</a>
    </div>
  )
  const data = st?.data
  if (!st || !data?.recovery || st.mode === 'waiting' || st.mode === 'off')
    return (
      <main>
        {back}
        <h1 class="cd-title" tabindex="-1" style="margin:8px 4px 0">Тренер</h1>
        <p class="cd-lead">{st?.mode === 'off' ? 'Подключи WHOOP в профиле — тренер начнёт подстраивать план' : 'Ждём данные WHOOP за сегодня'}</p>
      </main>
    )

  const { mode, coach, flags } = st
  const reverted = mode === 'reverted'
  // при откате показываем совет тренера приглушённо — его можно вернуть
  const dec = st.dec || (reverted ? coach.decision : null)
  const r = data.recovery
  const hist = data.history
  const rc = recColor(r.score)
  const meta = mode === 'rules' ? 'Совет по правилам · тренер не ответил' : mode === 'thinking' ? 'Тренер смотрит данные…' : coach?.at ? `Тренер · сегодня в ${hm(coach.at)}` : 'Тренер'

  return (
    <main>
      {back}
      <div class="cd-head">
        <h1 class="cd-title" tabindex="-1">{reverted ? 'По плану, без правок тренера' : dec?.headline || 'Тренер смотрит данные'}</h1>
        <p class="cd-meta">{meta}</p>
      </div>

      <div class={reverted ? 'cd-off' : ''}>
        {dec?.summary && <p class="cd-lead">{dec.summary}</p>}
        {dec && <Changes dec={dec} athlete={athlete} today={todayDate} />}
      </div>

      <h2 class="section-title">Почему</h2>
      <div class="card cd-rec">
        <div class="cd-rec-top">
          <Ring score={r.score} size={64} stroke={6} />
          <div>
            <div class="cd-rec-label">Восстановление</div>
            <div class="cd-rec-val">{REC_WORD[rc]}</div>
            {streakNote(hist) && <div class="cd-rec-note">{streakNote(hist)}</div>}
          </div>
        </div>
        <Trend hist={hist} today={todayDate} />
        <Stats data={data} flags={flags} />
      </div>
      {dec?.reasons?.length > 0 && (
        <div class={`card list rs${reverted ? ' cd-off' : ''}`} style="margin-top:12px">
          {dec.reasons.map((x, i) => <div class="cell" key={i}>{x}</div>)}
        </div>
      )}

      {dec?.week_note && (
        <>
          <h2 class="section-title">До конца недели</h2>
          <div class={`card cd-note${reverted ? ' cd-off' : ''}`}>{dec.week_note}</div>
        </>
      )}

      {(mode === 'coach' || reverted) && (
        <>
          <div style="height:32px" />
          {mode === 'coach' && <Feedback st={st} />}
          <div class="card act-wrap" style="margin-top:12px">
            <button class="act" onClick={() => { coachFeedback(athlete, { reverted: !reverted }); dispatchEvent(new CustomEvent('sporty:toast', { detail: reverted ? 'Совет тренера снова в силе' : 'План как был' })) }} aria-label={reverted ? 'Применить правки тренера' : 'Вернуть план без правок тренера'}>
              <Undo2 size={18} strokeWidth={2} />{reverted ? 'Применить совет тренера' : 'Вернуть как было'}
            </button>
          </div>
          <p class="cd-foot">{reverted ? 'Тренировки идут по исходному плану' : 'Тренировки вернутся к исходному плану. Совет можно будет включить обратно'}</p>
        </>
      )}
      <p class="cd-foot" style="margin-top:20px">Совет пишет ИИ по данным WHOOP и твоему плану. Если самочувствие говорит другое — слушай самочувствие</p>
    </main>
  )
}
