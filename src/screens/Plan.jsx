import { addDays, fmtHM, fmtRange, mondayOf, parse, plan, seasonWeeks, weeksToRace, MONTHS_GEN, MONTHS_SHORT } from '../lib/plan'
import './plan.css'
import { Icon } from '../components/Icon'

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

function Bar({ stats, max, trip, draft }) {
  const { easy, grey, hard, str, other, total } = stats
  const segs = [
    ['z2', easy],
    ['z3', grey],
    ['z5', hard],
    ['str', str],
    [trip ? 'alt' : 'mob', other],
  ].filter(([, m]) => m > 0)
  return (
    <span class={`pl-fill${draft ? ' is-draft' : ''}`} style={{ width: `${pct(total, max)}%` }}>
      {segs.map(([k, m]) => (
        <span key={k} class={`pl-seg pl-seg-${k}`} style={{ width: `${pct(m, total)}%` }} />
      ))}
    </span>
  )
}

export function Plan({ athlete, todayDate }) {
  const n = weeksToRace(todayDate)
  const race = parse(plan.race.date)
  const weeks = seasonWeeks(athlete)
  const max = Math.max(1, ...weeks.map((w) => w.stats.total))
  const thisMonday = mondayOf(todayDate)
  const current = weeks.find((w) => w.start === thisMonday) || null
  const currentPhase = plan.phases.find((p) => todayDate >= p.start && todayDate <= p.end) || null
  const milestones = plan.milestones.filter((m) => !athlete || !m.athlete || m.athlete === athlete)

  // 80/20 текущей недели: проценты от кардио, в сумме 100
  let split = null
  if (current && current.stats.cardio > 0) {
    const { easy, grey, cardio } = current.stats
    const e = Math.round(pct(easy, cardio))
    const g = Math.round(pct(grey, cardio))
    split = { easy: e, grey: g, hard: Math.max(0, 100 - e - g) }
  }

  const rows = []
  let prevPhase = null
  for (const w of weeks) {
    const ph = w.phase
    if (ph && ph.id !== prevPhase) {
      prevPhase = ph.id
      const now = currentPhase?.id === ph.id
      rows.push(
        <li class="pl-ph" key={`ph-${ph.id}`}>
          <div class="pl-ph-top">
            <h3 class="pl-ph-title">{ph.title}</h3>
            {now && <span class="pl-now">сейчас</span>}
            <span class="pl-ph-range">{fmtRange(ph.start, ph.end)}</span>
          </div>
          {ph.focus && <p class="pl-ph-focus">{ph.focus}</p>}
        </li>,
      )
    }

    const end = addDays(w.start, 6)
    const isNow = w.start === thisMonday
    const trips = w.events.filter((e) => e.kind !== 'race')
    const draft = !!w.template?.draft
    const deload = w.kind === 'deload'
    const ms = milestones.filter((m) => m.date >= w.start && m.date <= end)
    const href = isNow ? '#/' : `#/day/${w.start}`
    const cls = ['pl-wk', isNow && 'is-now', draft && 'is-draft'].filter(Boolean).join(' ')

    rows.push(
      <li key={w.start}>
        <a class={cls} href={href} aria-current={isNow ? 'date' : undefined}>
          <span class="pl-n">{w.n}</span>
          <span class="pl-when">
            <span class="pl-date">{shortDate(w.start)}</span>
            {trips.length > 0 && (
              <span class="pl-ev">
                <span class="pl-ev-sw" aria-hidden="true" />
                {trips.map((e) => e.title).join(', ')}
              </span>
            )}
          </span>
          <span class="pl-track">
            <Bar stats={w.stats} max={max} trip={trips.length > 0} draft={draft} />
            {deload && <span class="pl-deload">−30%</span>}
          </span>
          <span class="pl-total">{fmtHM(w.stats.total)}</span>
          {ms.map((m) => (
            <span class="pl-ms" key={m.date + m.title}>
              <span class="pl-ms-date">{shortDate(m.date)}</span>
              <span class="pl-ms-sep"> · </span>
              <span class="pl-ms-title">{m.title}</span>
              {m.tentative && <span class="pl-ms-sep"> · уточняется</span>}
            </span>
          ))}
        </a>
      </li>,
    )
  }

  rows.push(
    <li key="race">
      <a class="pl-wk pl-race" href={plan.race.date === todayDate ? '#/' : `#/day/${plan.race.date}`}>
        <span class="pl-n" />
        <span class="pl-when">
          <span class="pl-date">{shortDate(plan.race.date)}</span>
        </span>
        <span class="pl-race-title">70.3</span>
        <span class="pl-total" />
      </a>
    </li>,
  )

  return (
    <main class="plan">
      <a class="pl-back" href="#/"><Icon name="arrow-left" /> День</a>

      <section class="pl-count">
        <div class="pl-count-line">
          <span class="pl-count-num">{n}</span>
          <span class="pl-count-label">{plural(n, 'неделя', 'недели', 'недель')} до 70.3</span>
        </div>
        <div class="pl-count-date">
          {race.getDate()} {MONTHS_GEN[race.getMonth()]} {race.getFullYear()}
          {plan.race.tentative && ' · ориентир'}
        </div>
        {plan.race.distances && <p class="pl-count-dist">{plan.race.distances}</p>}
      </section>

      {split && (
        <section class="pl-split" aria-label="80/20 на этой неделе">
          <div class="pl-split-head">
            <span>80/20 · неделя {current.n}</span>
            <span class="pl-num">кардио {fmtHM(current.stats.cardio)}</span>
          </div>
          <div class="pl-split-bar">
            {split.easy > 0 && <span class="pl-seg pl-seg-z2" style={{ width: `${split.easy}%` }} />}
            {split.grey > 0 && <span class="pl-seg pl-seg-z3" style={{ width: `${split.grey}%` }} />}
            {split.hard > 0 && <span class="pl-seg pl-seg-z5" style={{ width: `${split.hard}%` }} />}
          </div>
          <div class="pl-split-legend">
            Z1–2 {split.easy}% · Z3 {split.grey}% · Z4–5 {split.hard}%
          </div>
        </section>
      )}

      <section class="pl-season">
        <h2 class="pl-h2">Сезон</h2>
        <ul class="pl-legend" aria-label="Обозначения">
          <li><span class="pl-sw pl-seg-z2" />Z1–2</li>
          <li><span class="pl-sw pl-seg-z3" />Z3</li>
          <li><span class="pl-sw pl-seg-z5" />Z4–5</li>
          <li><span class="pl-sw pl-seg-str" />сила</li>
          <li><span class="pl-sw pl-seg-alt" />выезд</li>
          <li><span class="pl-sw pl-sw-draft" />черновик</li>
        </ul>
        <ol class="pl-list">{rows}</ol>
      </section>

      <details class="pl-ref">
        <summary class="pl-ref-sum">
          <span class="pl-h2">Справка</span>
          <span class="pl-ref-hint">зоны и принципы</span>
          <Icon name="plus" class="pl-ref-icon" />
        </summary>

        <h3 class="pl-ref-h">Зоны</h3>
        <ul class="pl-zones">
          {Object.entries(plan.zones).map(([k, z]) => (
            <li key={k}>
              <span class={`pl-sw pl-seg-${k}`} />
              <span class="pl-zone-k">{k.toUpperCase()}</span>
              <span class="pl-zone-body">
                <span class="pl-zone-name">{z.name}</span>
                <span class="pl-zone-talk">
                  <span class="pl-num">RPE {z.rpe}</span> · {z.talk}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p class="pl-note">Цифры пульса, темпа и ватт у каждого свои — добавим, когда снимем тесты.</p>

        <h3 class="pl-ref-h">На чём стоит план</h3>
        <ul class="pl-principles">
          {PRINCIPLES.map(([t, d, r]) => (
            <li key={t}>
              <span class="pl-pr-title">{t}</span>
              <p class="pl-pr-text">{d}</p>
              {r && <span class="pl-pr-ref">{r}</span>}
            </li>
          ))}
        </ul>
      </details>
    </main>
  )
}
