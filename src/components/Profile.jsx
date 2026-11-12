import { flatSegments } from '../lib/plan'

const LEVEL = { z1: 0.22, z2: 0.42, z3: 0.62, z4: 0.82, z5: 1, str: 0.72, plyo: 0.9, mob: 0.16, alt: 0.5 }

// Шаг сетки по длительности: подписи всегда на «круглых» минутах.
function tickStep(total) {
  if (total <= 30) return 5
  if (total <= 60) return 10
  if (total <= 120) return 20
  if (total <= 180) return 30
  return 60
}
const fmtTick = (m) => (m >= 60 && m % 60 === 0 ? `${m / 60} ч` : m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : `${m}′`)

/**
 * Профиль тренировки. Сегменты и подписи позиционируются в одних и тех же процентах
 * (минута / общее время), поэтому отметки времени точно совпадают с границами зон.
 */
export function Profile({ segments, height = 88 }) {
  const flat = flatSegments(segments)
  const total = flat.reduce((a, [m]) => a + m, 0) || 1
  const pct = (m) => `${(m / total) * 100}%`

  let at = 0
  const bars = flat.map(([m, z]) => {
    const b = { start: at, m, z }
    at += m
    return b
  })

  const step = tickStep(total)
  const ticks = []
  for (let t = 0; t <= total + 0.001; t += step) ticks.push(t)
  // последняя подпись — ровно конец тренировки, если не совпала с шагом
  if (total - ticks[ticks.length - 1] > step * 0.35) ticks.push(total)
  else ticks[ticks.length - 1] = Math.min(ticks[ticks.length - 1], total)

  return (
    <div class="pf">
      <div class="pf-plot" style={{ height: `${height}px` }} aria-hidden="true">
        {ticks.map((t) => <span key={`g${t}`} class="pf-grid" style={{ left: pct(t) }} />)}
        {bars.map((b, i) => (
          <span
            key={i}
            class={`pf-bar seg-${b.z}`}
            style={{ left: pct(b.start), width: pct(b.m), height: `${(LEVEL[b.z] ?? 0.3) * 100}%` }}
          />
        ))}
      </div>
      <div class="pf-axis num" aria-hidden="true">
        {ticks.map((t, i) => (
          <span
            key={`t${t}`}
            class={i === 0 ? 'is-first' : i === ticks.length - 1 ? 'is-last' : ''}
            style={{ left: pct(t) }}
          >
            {fmtTick(Math.round(t))}
          </span>
        ))}
      </div>
    </div>
  )
}
