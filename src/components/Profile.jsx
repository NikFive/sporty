import { flatSegments } from '../lib/plan'

const LEVEL = { z1: 0.22, z2: 0.42, z3: 0.62, z4: 0.82, z5: 1, str: 0.72, plyo: 0.9, mob: 0.16, alt: 0.5 }
export const SCALE_MIN = 120 // общая шкала времени в строках: 120 мин = вся ширина

/**
 * Профиль тренировки: ширина = время, высота и цвет = зона.
 * minutes — если задано, профиль занимает minutes/120 ширины (общая шкала для всех строк).
 */
export function Profile({ segments, height = 8, minutes, axis = false }) {
  const flat = flatSegments(segments)
  const total = flat.reduce((a, [m]) => a + m, 0) || 1
  const frac = minutes ? Math.min(1, minutes / SCALE_MIN) : 1
  const long = minutes && minutes > SCALE_MIN
  return (
    <div class="profile-wrap">
      <div class={`profile${long ? ' profile-long' : ''}`} style={{ height: `${height}px`, width: `${frac * 100}%` }} aria-hidden="true">
        {flat.map(([m, z], i) => (
          <span key={i} class={`seg seg-${z}`} style={{ flexGrow: m, height: `${(LEVEL[z] ?? 0.3) * 100}%` }} />
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
