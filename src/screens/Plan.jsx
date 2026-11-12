import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ChevronLeft, ChevronRight, Flag } from 'lucide-preact'
import {
  ATHLETES, fmtHM, hoursScale, parse, phaseSummary, plan, seasonSummary, weeklySeries, weeksToRace,
  MONTHS_GEN, MONTHS_SHORT,
} from '../lib/plan'
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
// «25–31 янв», «28 дек – 3 янв»
const shortRange = (a, b) => {
  const da = parse(a), db = parse(b)
  return da.getMonth() === db.getMonth()
    ? `${da.getDate()}–${db.getDate()} ${MONTHS_SHORT[db.getMonth()]}`
    : `${shortDate(a)} – ${shortDate(b)}`
}
// «Специфика» → «специфика», латиницу («Build») не трогаем
const lower = (s) => (/^[А-ЯЁ]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const hours = (m) => String(Math.round((m / 60) * 10) / 10).replace('.', ',')

// ───── «Нагрузка»: настройки видов ─────
const N = 36
const VIEWS = [
  ['volume', 'Объём'],
  ['zones', 'Зоны'],
  ['sport', 'Виды спорта'],
]
const ZONES = [
  ['z12', 'Z1–2', 'лёгкая', 'var(--z2)'],
  ['z3', 'Z3', 'серая', 'var(--z3)'],
  ['z45', 'Z4–5', 'тяжёлая', 'var(--z5)'],
]
const SPORTS = [
  ['swim', 'Плавание', 'Пл', 'var(--swim)'],
  ['bike', 'Вел', 'Вел', 'var(--bike)'],
  ['run', 'Бег', 'Бег', 'var(--run)'],
  ['strength', 'Сила', 'Сила', 'var(--str)'],
  ['other', 'Прочее', 'Прочее', 'var(--mob)'],
]
const VIEW_KEY = 'plan.view'
const loadView = () => {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return VIEWS.some(([k]) => k === v) ? v : 'volume'
  } catch {
    return 'volume'
  }
}
const saveView = (v) => {
  try { localStorage.setItem(VIEW_KEY, v) } catch { /* приватный режим */ }
}

// Положение колонки i на сетке repeat(36, 1fr) с column-gap 2px: шаг = (100% + 2px) / 36
const colLeft = (i, shift = 0) => `calc((100% + 2px) * ${i} / ${N}${shift ? ` - ${shift}px` : ''})`
const colWidth = (n, minus = 2) => `calc((100% + 2px) * ${n} / ${N} - ${minus}px)`
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const PH_SHORT = (t) => (t.length > 6 ? `${t.slice(0, 4)}.` : t)

/**
 * Строка 1 readout: варианты от полного к короткому — первый, что влезает в ширину.
 * Сначала уходит «черновик» (его видно по бледному столбцу), потом фаза (она подписана над графиком),
 * потом «разгрузка −30%» → «−30%». Полный текст всегда в aria-valuetext.
 */
function line1Variants(w) {
  const head = [`Неделя ${w.n}`, shortRange(w.start, w.end)]
  const ev = [...(w.trip ? [w.trip.title] : []), ...(w.race ? ['старт'] : []), ...w.milestones.map((m) => m.title)]
  const deload = w.kind === 'deload'
  const join = (phase, dl, draft) =>
    [...head, ...(phase ? [w.phaseTitle] : []), ...(deload ? [dl] : []), ...ev, ...(draft && w.draft ? ['черновик'] : [])].join(' · ')
  return [...new Set([
    join(true, 'разгрузка −30%', true),
    join(true, 'разгрузка −30%', false),
    join(false, 'разгрузка −30%', false),
    join(false, '−30%', false),
  ])]
}

let measureCtx = null
function fitText(variants, el, width) {
  if (!el || !width) return variants[0]
  try {
    measureCtx ??= document.createElement('canvas').getContext('2d')
    const cs = getComputedStyle(el) // shorthand font в Chrome бывает пустым — собираем сами
    measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    return variants.find((t) => measureCtx.measureText(t).width <= width) ?? variants[variants.length - 1]
  } catch {
    return variants[0]
  }
}

function readout(w, view) {
  const line1 = line1Variants(w)[0]

  if (view === 'zones') {
    const pct = w.cardio ? Math.round((w.byZone.z12 / w.cardio) * 100) : 0
    return {
      line1,
      value: `${pct}%`,
      unit: `лёгкой · ${fmtHM(w.cardio)} кардио`,
      line3: ZONES.map(([k, label]) => `${label} ${fmtHM(w.byZone[k])}`).join(' · '),
    }
  }
  if (view === 'sport') {
    return {
      line1,
      value: fmtHM(w.total),
      unit: 'в неделю',
      line3: SPORTS.filter(([k]) => Math.round(w.bySport[k]) > 0)
        .map(([k, , short]) => `${short} ${fmtHM(w.bySport[k])}`)
        .join(' · '),
    }
  }
  const parts = [`${w.sessions} ${plural(w.sessions, 'тренировка', 'тренировки', 'тренировок')}`]
  if (w.delta != null) {
    const d = Math.round(w.delta)
    parts.push(d === 0 ? 'как на прошлой' : `${d > 0 ? '+' : '−'}${fmtHM(Math.abs(d))} к прошлой`)
  }
  return { line1, value: fmtHM(w.total), unit: 'в неделю', line3: parts.join(' · ') }
}

function barOf(w, view, max) {
  if (view === 'zones')
    return { h: w.cardio > 0 ? 100 : 0, segs: ZONES.map(([k, , , c]) => [k, w.byZone[k], c]) }
  if (view === 'sport')
    return { h: (w.total / max) * 100, segs: SPORTS.map(([k, , , c]) => [k, w.bySport[k], c]) }
  return { h: (w.total / max) * 100, segs: [['v', w.total, w.isCurrent ? 'var(--accent)' : 'var(--label-2)']] }
}

function LoadCard({ series, scale, season, todayDate }) {
  const [view, setViewState] = useState(loadView)
  const [sel, setSel] = useState(null) // null — текущая неделя
  const barsRef = useRef()
  const r1Ref = useRef()
  const [r1W, setR1W] = useState(0)
  const phRowRef = useRef()
  const drag = useRef(null)

  const setView = (v) => { setViewState(v); saveView(v) }

  const curIdx = series.findIndex((w) => w.isCurrent)
  // до плана — первая неделя, после старта — последняя
  const defIdx = curIdx >= 0 ? curIdx : todayDate < series[0].start ? 0 : N - 1
  const selIdx = sel ?? defIdx
  const selRef = useRef(selIdx)
  selRef.current = selIdx
  const w = series[selIdx]
  const r = readout(w, view)
  const valueText = `${r.line1}. ${r.value} ${r.unit}. ${r.line3}`
  const href = w.isCurrent ? '#/' : `#/day/${w.start}`
  const line1 = fitText(line1Variants(w), r1Ref.current, r1W)

  // фазы → полосы
  const phases = []
  series.forEach((s, i) => {
    const last = phases[phases.length - 1]
    if (last && last.id === s.phaseId) last.n++
    else phases.push({ id: s.phaseId, title: s.phaseTitle, i, n: 1 })
  })
  // месяцы: первая неделя, чей понедельник в этом месяце
  const months = []
  series.forEach((s, i) => {
    const m = parse(s.start).getMonth()
    if (!months.length || months[months.length - 1].m !== m) months.push({ m, i })
  })
  // поездки: от недели начала до недели конца
  const trips = []
  series.forEach((s, i) => {
    if (!s.trip) return
    const last = trips[trips.length - 1]
    if (last && last.id === s.trip.id && last.to === i - 1) last.to = i
    else trips.push({ id: s.trip.id, from: i, to: i })
  })
  const raceIdx = series.findIndex((s) => s.race)

  // ширина строки 1 readout (минус шеврон) — для выбора варианта текста
  useLayoutEffect(() => {
    const el = r1Ref.current?.parentElement
    if (!el) return
    const upd = () => setR1W(el.clientWidth - 16)
    upd()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(upd) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  // подпись фазы — только если влезает в свою полосу
  useLayoutEffect(() => {
    const row = phRowRef.current
    if (!row) return
    const fit = () =>
      row.querySelectorAll('.ld-ph').forEach((el) => el.classList.toggle('is-hidden', el.scrollWidth > el.clientWidth + 0.5))
    fit()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    ro?.observe(row)
    return () => ro?.disconnect()
  }, [])

  const idxAt = (x) => {
    const b = barsRef.current.getBoundingClientRect()
    return clamp(Math.floor(((x - b.left) / b.width) * N), 0, N - 1)
  }
  const pick = (i) => {
    if (i === selRef.current) return
    selRef.current = i
    setSel(i)
  }
  const onDown = (e) => {
    if (e.button > 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* синтетические события */ }
    const i = idxAt(e.clientX)
    drag.current = { start: i, was: selRef.current, moved: false }
    pick(i)
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const i = idxAt(e.clientX)
    if (i !== d.start) d.moved = true
    pick(i)
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    // тап по уже выбранной неделе — назад к текущей
    if (d && !d.moved && d.start === d.was && d.start !== defIdx) setSel(null)
  }
  const onKey = (e) => {
    const k = e.key
    let i = null
    const cur = selRef.current
    if (k === 'ArrowRight' || k === 'ArrowUp') i = cur + 1
    else if (k === 'ArrowLeft' || k === 'ArrowDown') i = cur - 1
    else if (k === 'Home') i = 0
    else if (k === 'End') i = N - 1
    else if (k === 'Enter') { location.hash = href; return }
    if (i == null) return
    e.preventDefault()
    pick(clamp(i, 0, N - 1))
  }

  // шкала
  const ticks =
    view === 'zones'
      ? [[0, '0'], [50, '50'], [100, '100%']]
      : scale.ticks.map((t, j, a) => [(t / scale.max) * 100, `${hours(t)}${j === a.length - 1 ? ' ч' : ''}`])

  const desc =
    view === 'zones'
      ? `Доля лёгкой работы Z1–2 в кардио по неделям. За сезон ${season.easyPct}%, цель 80%.`
      : view === 'sport'
        ? `Часы по видам спорта за сезон: ${SPORTS.map(([k, label]) => `${label} ${Math.round(series.reduce((a, s) => a + s.bySport[k], 0) / 60)} ч`).join(', ')}.`
        : `Часы тренировок по неделям, без гонки и сноуборда. Пик ${fmtHM(season.peak.min)} на неделе ${season.peak.n}.`

  return (
    <section class="card ld" aria-label="Нагрузка">
      <div class="seg seg-fill" role="group" aria-label="Вид графика">
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" class={view === k ? 'on' : ''} aria-pressed={view === k} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </div>

      <a class="ld-readout" href={href}>
        <span class="ld-r1">
          <span class="ld-r1-text" ref={r1Ref}>{line1}</span>
          <ChevronRight class="ld-r1-chev" size={14} strokeWidth={2.25} />
        </span>
        <span class="ld-r2">
          <span class="ld-val">{r.value}</span>
          <span class="ld-unit">{r.unit}</span>
        </span>
        <span class="ld-r3">{r.line3}</span>
      </a>

      <div class="ld-body">
        <div class="ld-phases" ref={phRowRef} aria-hidden="true">
          {phases.map((p) => (
            <span key={p.id} class="ld-ph" style={{ left: colLeft(p.i), width: colWidth(p.n) }}>{PH_SHORT(p.title)}</span>
          ))}
        </div>

        <div
          class="ld-plot"
          role="slider"
          tabindex={0}
          aria-label="Неделя"
          aria-valuemin={1}
          aria-valuemax={N}
          aria-valuenow={selIdx + 1}
          aria-valuetext={valueText}
          aria-describedby="ld-desc"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => { drag.current = null }}
          onKeyDown={onKey}
        >
          <div class="ld-layer" aria-hidden="true">
            {phases.map((p, j) => j % 2 === 1 && (
              <span key={`b-${p.id}`} class="ld-band" style={{ left: colLeft(p.i, 1), width: colWidth(p.n, 0) }} />
            ))}
            {phases.slice(1).map((p) => (
              <span key={`h-${p.id}`} class="ld-hair" style={{ left: colLeft(p.i, 1.25) }} />
            ))}
            {ticks.slice(1).map(([y]) => (
              <span key={`g-${y}`} class="ld-grid" style={{ bottom: `${y}%` }} />
            ))}
            {view === 'zones' && <span class="ld-goal" style={{ bottom: '80%' }} />}
            {curIdx >= 0 && <span class="ld-tint is-now" style={{ left: colLeft(curIdx, 1), width: colWidth(1, 0) }} />}
            {selIdx !== curIdx && <span class="ld-tint is-sel" style={{ left: colLeft(selIdx, 1), width: colWidth(1, 0) }} />}
          </div>

          <div class="ld-bars" ref={barsRef} aria-hidden="true">
            {series.map((s) => {
              const b = barOf(s, view, scale.max)
              return (
                <div key={s.start} class={`ld-bar${s.draft ? ' is-draft' : ''}`} style={{ height: `${b.h}%` }}>
                  {b.segs.filter(([, v]) => v > 0).map(([k, v, c]) => (
                    <span key={k} style={{ flexGrow: v, background: c }} />
                  ))}
                </div>
              )
            })}
          </div>

          <div class="ld-y" aria-hidden="true">
            {ticks.map(([y, label]) => (
              <span key={`y-${y}`} style={{ bottom: `${y}%` }}>{label}</span>
            ))}
            {view === 'zones' && <span class="is-goal" style={{ bottom: '80%' }}>80%</span>}
          </div>
        </div>

        <div class="ld-events" aria-hidden="true">
          {trips.map((t) => (
            <span key={t.id} class="ld-trip" style={{ left: colLeft(t.from), width: colWidth(t.to - t.from + 1) }} />
          ))}
          {curIdx >= 0 && <span class="ld-cell" style={{ left: colLeft(curIdx), width: colWidth(1) }}><span class="ld-now" /></span>}
          {raceIdx >= 0 && (
            <span class="ld-race" style={{ left: colLeft(raceIdx + 1, 12) }}>
              <Flag size={10} strokeWidth={2.5} />
            </span>
          )}
        </div>

        <div class="ld-months" aria-hidden="true">
          {months.map(({ m, i }) => (
            <span key={`${m}-${i}`} style={{ left: colLeft(i) }}>{MONTHS_SHORT[m]}</span>
          ))}
        </div>
      </div>

      <p id="ld-desc" class="sr-only">{desc}</p>

      <div class="ld-legend">
        <div class="ld-lg-row">
          {view === 'volume' && <span class="ld-lg">Часы тренировок в неделю, без гонки и сноуборда</span>}
          {view === 'zones' && (
            <>
              {ZONES.map(([k, label, word, c]) => (
                <span key={k} class="ld-lg"><i class="ld-sw" style={{ background: c }} />{label} {word}</span>
              ))}
              <span class="ld-lg"><i class="ld-sw-dash" />цель 80/20</span>
            </>
          )}
          {view === 'sport' &&
            SPORTS.map(([k, label, , c]) => (
              <span key={k} class="ld-lg"><i class="ld-sw" style={{ background: c }} />{label}</span>
            ))}
        </div>
        <div class="ld-lg-row">
          <span class="ld-lg"><i class="ld-sw-now" />Сейчас</span>
          <span class="ld-lg"><i class="ld-sw-trip" />Поездка</span>
          <span class="ld-lg"><Flag class="ld-sw-race" size={10} strokeWidth={2.5} />Старт</span>
          <span class="ld-lg"><i class="ld-sw is-draft" />Черновик</span>
        </div>
      </div>
    </section>
  )
}

const LONG_LABEL = { bike: 'длинный вел', run: 'длинный бег', brick: 'длинный брик', swim: 'длинное плавание' }

function Tiles({ season }) {
  const { peak, remainingMin, easyPct, longest } = season
  const tiles = [
    ['Пик недели', fmtHM(peak.min), `неделя ${peak.n} · ${lower(peak.phaseTitle)}`],
    ['До старта', `${Math.round(remainingMin / 60)} ч`, 'по плану, без гонки'],
    ['Лёгкая работа', `${easyPct}%`, 'Z1–2 за сезон · цель 80%'],
    [
      'Самая длинная',
      fmtHM(longest.min),
      longest.firstDate
        ? `${LONG_LABEL[longest.sport] || lower(longest.title)} · с ${MONTHS_GEN[parse(longest.firstDate).getMonth()]}`
        : '',
    ],
  ]
  return (
    <div class="pl-tiles">
      {tiles.map(([label, value, sub]) => (
        <div key={label} class="card pl-tile">
          <p class="pl-tile-label">{label}</p>
          <p class="pl-tile-value num">{value}</p>
          <p class="pl-tile-sub">{sub}</p>
        </div>
      ))}
    </div>
  )
}

export function Plan({ athlete, todayDate }) {
  const n = weeksToRace(todayDate)
  const race = parse(plan.race.date)
  const raceName = plan.race.title.split(' ')[0]
  const nWord = plural(n, 'неделя', 'недели', 'недель')

  // все атлеты — ради общей шкалы: смена атлета не перемасштабирует график
  const all = useMemo(() => Object.fromEntries(ATHLETES.map((a) => [a, weeklySeries(a, todayDate)])), [todayDate])
  const series = all[athlete]
  const scale = useMemo(() => hoursScale(...Object.values(all)), [all])
  const season = useMemo(() => seasonSummary(series, athlete, todayDate), [series, athlete, todayDate])
  const phaseSums = useMemo(() => phaseSummary(series), [series])
  const currentPhaseId = series.find((w) => w.isCurrent)?.phaseId ?? null

  const groups = phaseSums.map((ph) => ({ ph, weeks: series.filter((w) => w.phaseId === ph.id) }))
  const draftNoteAt = groups.find((g) => g.weeks.some((w) => w.draft))?.ph.id
  const lastPhase = groups[groups.length - 1]?.ph.id

  const weekCell = (w) => {
    const tag = w.trip ? w.trip.title : w.kind === 'deload' ? '−30%' : null
    const cls = ['cell', 'pl-wk', w.isCurrent && 'is-now', w.draft && 'is-draft'].filter(Boolean).join(' ')
    return [
      <a key={w.start} class={cls} href={w.isCurrent ? '#/' : `#/day/${w.start}`} aria-current={w.isCurrent ? 'date' : undefined}>
        <span class="pl-n">{w.n}</span>
        <span class="pl-when">
          <span class="pl-date">{shortDate(w.start)}</span>
          {tag && <span class={`pl-tag${w.trip ? ' is-trip' : ''}`}>{tag}</span>}
        </span>
        <span class="pl-total">{fmtHM(w.total)}</span>
        <ChevronRight class="chev" size={18} strokeWidth={2} />
      </a>,
      ...w.milestones.map((m) => (
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

      <h2 class="section-title">Нагрузка</h2>
      <LoadCard series={series} scale={scale} season={season} todayDate={todayDate} />
      <Tiles season={season} />

      <section aria-label="Сезон">
        {groups.map(({ ph, weeks: ws }) => {
          const isCur = currentPhaseId === ph.id
          return (
            <div key={ph.id} class="pl-phase">
              <h2 class="section-title pl-ph-title">
                {ph.title}
                {isCur && <span class="pl-now">Сейчас</span>}
              </h2>
              <p class="footnote pl-ph-range num">
                {shortRange(ph.start, ph.end)} · {ph.weeks} {plural(ph.weeks, 'неделя', 'недели', 'недель')} · в среднем {fmtHM(ph.avgMin)} · {ph.easyPct}% лёгкой
              </p>
              <details class="card list pl-weeks" open={isCur}>
                <summary class="cell pl-wk pl-sum">
                  <span class="pl-sum-title">{ph.weeks} {plural(ph.weeks, 'неделя', 'недели', 'недель')}</span>
                  <ChevronRight class="chev pl-sum-chev" size={18} strokeWidth={2} />
                </summary>
                {ws.flatMap(weekCell)}
                {ph.id === lastPhase && (
                  <div class="cell pl-wk pl-race">
                    <span class="pl-n"><Flag size={15} strokeWidth={2} /></span>
                    <span class="pl-race-text num">{raceName} · {shortDate(plan.race.date)}</span>
                  </div>
                )}
              </details>
              {ph.id === draftNoteAt && <p class="footnote">Build, специфика и подводка — черновик</p>}
            </div>
          )
        })}
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
