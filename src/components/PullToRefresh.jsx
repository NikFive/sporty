import { useEffect, useRef, useState } from 'preact/hooks'
import { ArrowDown, RefreshCw } from 'lucide-preact'
import { refreshApp } from '../lib/update'

const THRESHOLD = 64 // px после «сопротивления»

/**
 * Потянуть вниз от верха экрана → проверить новую версию плана и перезагрузить.
 * Только вертикальный жест от самого верха; горизонтальные свайпы дней не мешают.
 */
export function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const st = useRef({ y: null, x: 0, active: false, pull: 0, busy: false })

  useEffect(() => {
    const s = st.current
    const set = (v) => { s.pull = v; setPull(v) }
    const onStart = (e) => {
      if (s.busy || window.scrollY > 0 || e.touches.length > 1) { s.y = null; return }
      s.y = e.touches[0].clientY
      s.x = e.touches[0].clientX
      s.active = false
    }
    const onMove = (e) => {
      if (s.y == null) return
      const t = e.touches[0]
      const dy = t.clientY - s.y
      const dx = Math.abs(t.clientX - s.x)
      if (!s.active) {
        if (dy > 10 && dy > dx * 1.5 && window.scrollY <= 0) s.active = true
        else if (dx > 10 || dy < -4) { s.y = null; return }
      }
      if (s.active) set(Math.min(110, dy * 0.5))
    }
    const onEnd = () => {
      if (s.active && s.pull >= THRESHOLD) {
        s.busy = true
        setBusy(true)
        set(THRESHOLD)
        refreshApp()
      } else if (s.active) set(0)
      s.y = null
      s.active = false
    }
    addEventListener('touchstart', onStart, { passive: true })
    addEventListener('touchmove', onMove, { passive: true })
    addEventListener('touchend', onEnd, { passive: true })
    addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      removeEventListener('touchstart', onStart)
      removeEventListener('touchmove', onMove)
      removeEventListener('touchend', onEnd)
      removeEventListener('touchcancel', onEnd)
    }
  }, [])

  if (!pull && !busy) return null
  const ready = pull >= THRESHOLD
  return (
    <div
      class={`ptr${busy ? ' is-busy' : ''}${ready ? ' is-ready' : ''}`}
      style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / 40) }}
      role="status"
      aria-live="polite"
    >
      {busy || ready ? <RefreshCw size={20} strokeWidth={2.5} /> : <ArrowDown size={20} strokeWidth={2.5} />}
      <span class="sr-only">{busy ? 'Обновляем план' : ready ? 'Отпусти, чтобы обновить' : ''}</span>
    </div>
  )
}
