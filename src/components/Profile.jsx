import { flatSegments } from '../lib/plan'

const LEVEL = { z1: 0.22, z2: 0.42, z3: 0.62, z4: 0.82, z5: 1, str: 0.72, plyo: 0.9, mob: 0.16, alt: 0.5 }

// Профиль тренировки: ширина = время, высота и цвет = зона.
export function Profile({ segments, height = 88 }) {
  const flat = flatSegments(segments)
  const total = flat.reduce((a, [m]) => a + m, 0) || 1
  return (
    <div>
      <div class="profile" style={{ height: `${height}px` }} aria-hidden="true">
        {flat.map(([m, z], i) => (
          <span key={i} class={`seg-bar seg-${z}`} style={{ flexGrow: m, height: `${(LEVEL[z] ?? 0.3) * 100}%` }} />
        ))}
      </div>
      <div class="profile-axis num">
        <span>0</span>
        <span>{Math.round(total / 2)} мин</span>
        <span>{Math.round(total)} мин</span>
      </div>
    </div>
  )
}
