import { ChevronLeft, ChevronRight, Flag } from 'lucide-preact'
import { addDays, fmtHM, fmtRange, mondayOf, parse, plan, seasonWeeks, weeksToRace, MONTHS_GEN, MONTHS_SHORT } from '../lib/plan'
import './plan.css'

const PRINCIPLES = [
  ['80/20', '~80% объёма в Z1–2, ~20% тяжёлой работы, минимум «серой» Z3.', 'Seiler 2010; Stöggl & Sperlich 2014'],
  ['Сила + кардио', 'Совместимы. Тяжёлую силовую и интенсивное кардио разводим на 6+ ч или по разным дням.', 'Wilson 2012; Schumann 2022'],
  ['Силовая для выносливости', '2× в неделю тяжело: экономичность +2–8% и меньше травм. Ване — минимальная доза.', 'Rønnestad & Mujika 2014; Blagrove 2018'],
  ['Плиометрика', '1–2× в неделю — реактивность и экономичность бега.', 'Blagrove 2018'],
  ['Свои зоны', 'Вместе — значит общее время и структура. Пульс, темп и ватты у каждого свои.', ''],
]

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

const shortDate = (s) => {
  const d = parse(s)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

const pct = (part, whole) => (whole ? (part / whole) * 100 : 0)

/** Тонкая капсула объёма недели: ширина — от общего максимума сезона. */
function VolumeBar({ stats, max }) {
  const { easy, grey, hard, str, other, total } = stats
  const segs = [
    ['z2', easy],
    ['z3', grey],
    ['z5', hard],
    ['str', str],
    ['mob', other],
  ].filter(([, m]) => m > 0)
  return (
    <span class="pl-track" aria-hidden="true">
      <span class="pl-fill" style={{ width: `${pct(total, max)}%` }}>
        {segs.map(([k, m]) => (
          <span key={k} class={`pl-seg pl-${k}`} style={{ width: `${pct(m, total)}%` }} />
        ))}
      </span>
    </span>
  )
}

export function Plan({ athlete, todayDate }) {
  const n = weeksToRace(todayDate)
  const race = parse(plan.race.date)
  const raceName = plan.race.title.split(' ')[0]
  const weeks = seasonWeeks(athlete)
  const max = Math.max(1, ...weeks.map((w) => w.stats.total))
  const thisMonday = mondayOf(todayDate)
  const current = weeks.find((w) => w.start === thisMonday) || null
  const currentPhase = plan.phases.find((p) => todayDate >= p.start && todayDate <= p.end) || null
  const milestones = plan.milestones.filter((m) => !athlete || !m.athlete || m.athlete === athlete)
  const nWord = plural(n, 'неделя', 'недели', 'недель')

  // фазы → недели
  const phases = plan.phases.map((ph) => ({ ph, weeks: weeks.filter((w) => w.phase?.id === ph.id) })).filter((g) => g.weeks.length)
  const draftNoteAt = phases.find((g) => g.weeks.some((w) => w.template?.draft))?.ph.id
  const lastPhase = phases[phases.length - 1]?.ph.id

  const weekCell = (w) => {
    const end = addDays(w.start, 6)
    const isNow = w.start === thisMonday
    const trips = w.events.filter((e) => e.kind === 'trip')
    const draft = !!w.template?.draft
    const deload = w.kind === 'deload'
    const tag = trips.length ? trips.map((e) => e.title).join(', ') : deload ? '−30%' : null
    const ms = milestones.filter((m) => m.date >= w.start && m.date <= end)
    const cls = ['cell', 'pl-wk', isNow && 'is-now', draft && 'is-draft'].filter(Boolean).join(' ')
    return [
      <a key={w.start} class={cls} href={isNow ? '#/' : `#/day/${w.start}`} aria-current={isNow ? 'date' : undefined}>
        <span class="pl-n">{w.n}</span>
        <span class="pl-when">
          <span class="pl-date">{shortDate(w.start)}</span>
          {tag && <span class={`pl-tag${trips.length ? ' is-trip' : ''}`}>{tag}</span>}
        </span>
        <VolumeBar stats={w.stats} max={max} />
        <span class="pl-total">{fmtHM(w.stats.total)}</span>
        <ChevronRight class="chev" size={18} strokeWidth={2} />
      </a>,
      ...ms.map((m) => (
        <div key={`ms-${m.date}-${m.title}`} class="cell pl-wk pl-ms">
          <span class="pl-n"><Flag size={15} strokeWidth={2} /></span>
          <span class="pl-ms-text">
            <span class="num">{shortDate(m.date)}</span> · {m.title}
            {m.tentative && <span class="pl-ms-tent"> · уточняется</span>}
          </span>
        </div>
      )),
    ]
  }

  return (
    <main class="plan">
      <div class="nav">
        <a class="back" href="#/"><ChevronLeft size={24} strokeWidth={2} /> Сегодня</a>
      </div>

      <div class="title-block pl-title">
        <h1 class="large-title">План</h1>
        <p class="subtitle num">
          {n} {nWord} до {raceName} · {race.getDate()} {MONTHS_GEN[race.getMonth()]} {race.getFullYear()}
          {plan.race.tentative && ' · ориентир'}
        </p>
      </div>

      <section class="card pl-hero">
        <div class="pl-hero-line">
          <span class="pl-hero-num">{n}</span>
          <span class="pl-hero-label">{nWord} до старта</span>
        </div>
        {plan.race.distances && <p class="pl-hero-dist">{plan.race.distances}</p>}
      </section>

      {current && current.stats.cardio > 0 && (
        <section aria-label="Эта неделя">
          <h2 class="section-title">Эта неделя</h2>
          <div class="card pl-split">
            <div class="pl-split-bar" aria-hidden="true">
              {current.stats.easy > 0 && <span class="pl-z2" style={{ width: `${pct(current.stats.easy, current.stats.cardio)}%` }} />}
              {current.stats.grey > 0 && <span class="pl-z3" style={{ width: `${pct(current.stats.grey, current.stats.cardio)}%` }} />}
              {current.stats.hard > 0 && <span class="pl-z5" style={{ width: `${pct(current.stats.hard, current.stats.cardio)}%` }} />}
            </div>
            <p class="pl-split-line num">
              {current.stats.easyPct}% лёгкой работы · {fmtHM(current.stats.cardio)} кардио
            </p>
          </div>
        </section>
      )}

      <section aria-label="Сезон">
        {phases.map(({ ph, weeks: ws }) => (
          <div key={ph.id} class="pl-phase">
            <h2 class="section-title pl-ph-title">
              {ph.title}
              {currentPhase?.id === ph.id && <span class="pl-now">Сейчас</span>}
            </h2>
            <p class="footnote pl-ph-range num">{fmtRange(ph.start, ph.end)}</p>
            <div class="card list pl-weeks">
              {ws.flatMap(weekCell)}
              {ph.id === lastPhase && (
                <div class="cell pl-wk pl-race">
                  <span class="pl-n"><Flag size={15} strokeWidth={2} /></span>
                  <span class="pl-race-text num">{raceName} · {shortDate(plan.race.date)}</span>
                </div>
              )}
            </div>
            {ph.id === draftNoteAt && <p class="footnote">Build, специфика и подводка — черновик</p>}
          </div>
        ))}
      </section>

      <h2 class="section-title">Справка</h2>
      <details class="card list pl-ref">
        <summary class="cell pl-ref-sum">
          <span class="cell-title pl-ref-title">Зоны и принципы</span>
          <ChevronRight class="chev pl-ref-chev" size={18} strokeWidth={2} />
        </summary>
        {Object.entries(plan.zones).map(([k, z]) => (
          <div key={k} class="cell pl-zone">
            <span class={`pl-dot pl-${k}`} aria-hidden="true" />
            <span class="cell-text">
              <span class="cell-title">{k.toUpperCase()} · {z.name}</span>
              <span class="cell-sub"><span class="num">RPE {z.rpe}</span> · {z.talk}</span>
            </span>
          </div>
        ))}
        {PRINCIPLES.map(([t, d, r]) => (
          <div key={t} class="cell pl-pr">
            <span class="cell-text">
              <span class="cell-title">{t}</span>
              <span class="cell-sub pl-pr-text">{d}</span>
              {r && <span class="pl-pr-ref">{r}</span>}
            </span>
          </div>
        ))}
      </details>
    </main>
  )
}
