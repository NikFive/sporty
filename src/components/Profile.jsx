import { flatSegments } from '../lib/plan'

const LEVEL = { z1: 0.22, z2: 0.42, z3: 0.62, z4: 0.82, z5: 1, str: 0.72, plyo: 0.9, mob: 0.16, alt: 0.5 }

// Профиль тренировки: ширина = время, высота и цвет = зона.
export function Profile({ segments, height = 28, axis = false }) {
  const flat = flatSegments(segments)
  const total = flat.reduce((a, [m]) => a + m, 0) || 1
  return (
    <div class="profile-wrap">
      <div class="profile" style={{ height: `${height}px` }} aria-hidden="true">
        {flat.map(([m, z], i) => (
          <span
            key={i}
            class={`seg seg-${z}`}
            style={{ flexGrow: m, height: `${(LEVEL[z] ?? 0.3) * 100}%` }}
          />
        ))}
      </div>
      {axis && (
        <div class="profile-axis">
          <span>0</span>
          <span>{Math.round(total / 2)}′</span>
          <span>{Math.round(total)}′</span>
        </div>
      )}
    </div>
  )
}

export function ZoneMix({ stats }) {
  const { easy, grey, hard, cardio } = stats
  if (!cardio) return null
  const pct = (v) => Math.round((v / cardio) * 100)
  return (
    <div class="mix">
      <div class="mix-bar">
        <span class="mix-easy" style={{ flexGrow: easy }} />
        {grey > 0 && <span class="mix-grey" style={{ flexGrow: grey }} />}
        {hard > 0 && <span class="mix-hard" style={{ flexGrow: hard }} />}
      </div>
      <div class="mix-legend mono">
        <span><i class="dot dot-easy" />Z1–2 {pct(easy)}%</span>
        <span><i class="dot dot-grey" />Z3 {pct(grey)}%</span>
        <span><i class="dot dot-hard" />Z4–5 {pct(hard)}%</span>
      </div>
    </div>
  )
}
