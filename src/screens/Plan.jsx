import { daysBetween, fmtDate, fmtRange, mondayOf, parse, plan, weeksToRace, MONTHS_GEN } from '../lib/plan'
import { plural } from './Today'

const PRINCIPLES = [
  ['80/20', '~80% объёма в Z1–2, ~20% тяжёлой работы, минимум «серой» Z3.', 'Seiler 2010; Stöggl & Sperlich 2014'],
  ['Сила + кардио', 'Совместимы. Тяжёлую силовую и интенсивное кардио разводим на 6+ ч или по разным дням.', 'Wilson 2012; Schumann 2022'],
  ['Силовая для выносливости', '2× в неделю тяжело: экономичность +2–8% и меньше травм. Ване — минимальная доза.', 'Rønnestad & Mujika 2014; Blagrove 2018'],
  ['Плиометрика', '1–2× в неделю — реактивность и экономичность бега.', 'Blagrove 2018'],
  ['Свои зоны', 'Вместе — значит общее время и структура. Пульс, темп и ватты у каждого свои.', ''],
]

export function Plan({ athlete, todayDate }) {
  const weeks = weeksToRace(todayDate)
  const race = parse(plan.race.date)
  const items = [
    ...plan.milestones.filter((m) => !m.athlete || m.athlete === athlete).map((m) => ({ ...m, start: m.date, type: 'milestone' })),
    ...plan.events.filter((e) => e.kind !== 'race').map((e) => ({ ...e, type: 'event' })),
  ].sort((a, b) => (a.start < b.start ? -1 : 1))

  return (
    <main class="screen">
      <div class="countdown">
        <span class="countdown-num">{weeks}</span>
        <span class="countdown-label">
          {plural(weeks, 'неделя', 'недели', 'недель')} до {plan.race.title}
          <span class="mono muted">
            {' '}
            {race.getDate()} {MONTHS_GEN[race.getMonth()]} {race.getFullYear()}
            {plan.race.tentative && ' · ориентир'}
          </span>
        </span>
      </div>
      <p class="muted small">{plan.race.distances}</p>

      <section class="section">
        <h2 class="label mono">фазы</h2>
        <ol class="timeline">
          {plan.phases.map((p) => {
            const state = todayDate > p.end ? 'past' : todayDate >= p.start ? 'now' : 'next'
            const len = daysBetween(p.start, p.end) + 1
            const done = state === 'now' ? Math.min(1, (daysBetween(p.start, todayDate) + 1) / len) : state === 'past' ? 1 : 0
            const inside = items.filter((it) => it.start >= p.start && it.start <= p.end)
            return (
              <li class={`phase phase-${state}`} key={p.id}>
                <div class="phase-rail"><span style={{ height: `${done * 100}%` }} /></div>
                <div class="phase-body">
                  <div class="phase-head">
                    <span class="phase-title">{p.title}</span>
                    <span class="mono muted">{fmtRange(p.start, p.end)}</span>
                  </div>
                  {state === 'now' && <div class="phase-now mono">сейчас · неделя {Math.floor(daysBetween(mondayOf(p.start), todayDate) / 7) + 1} из {Math.ceil(len / 7)}</div>}
                  <p class="phase-focus">{p.focus}</p>
                  {inside.length > 0 && (
                    <ul class="marks">
                      {inside.map((it) => (
                        <li class={`mark mark-${it.kind || it.type}`} key={it.title + it.start}>
                          <span class="mono">{it.type === 'event' ? fmtRange(it.start, it.end) : fmtDate(it.start)}</span>
                          <span>
                            {it.title}
                            {it.tentative && <span class="mono muted"> · уточняется</span>}
                            {it.note && <span class="mark-note">{it.note}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
          <li class="phase phase-race">
            <div class="phase-rail" />
            <div class="phase-body">
              <div class="phase-head">
                <span class="phase-title">{plan.race.title}</span>
                <span class="mono muted">{fmtDate(plan.race.date)}</span>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <section class="section">
        <h2 class="label mono">зоны</h2>
        <ul class="zones">
          {Object.entries(plan.zones).map(([k, z]) => (
            <li key={k}>
              <span class={`zone-sw seg-${k}`} />
              <span class="mono zone-k">{k.toUpperCase()}</span>
              <span class="zone-name">{z.name}</span>
              <span class="zone-talk muted">RPE {z.rpe} · {z.talk}</span>
            </li>
          ))}
        </ul>
        <p class="muted small">Цифры пульса, темпа и ватт у каждого свои — добавим, когда снимем тесты.</p>
      </section>

      <section class="section">
        <h2 class="label mono">на чём стоит план</h2>
        <ul class="principles">
          {PRINCIPLES.map(([t, d, r]) => (
            <li key={t}>
              <b>{t}</b> {d}
              {r && <span class="mono muted small"> {r}</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
