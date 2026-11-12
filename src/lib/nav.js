import { useRef } from 'preact/hooks'
import { today } from './plan'

// Смена дня не копит историю: системное «назад» не листает 20 дней подряд.
export function goDay(date) {
  location.replace(!date || date === today() ? '#/' : `#/day/${date}`)
}

/**
 * Горизонтальный свайп. Срабатывает при |dx| > 48 и |dx| > 1.5·|dy|.
 * Игнорирует старт у краёв экрана (жест «назад» в Android/iOS).
 */
export function useSwipe(onLeft, onRight) {
  const s = useRef(null)
  return {
    onTouchStart(e) {
      const t = e.touches[0]
      const edge = t.clientX < 16 || t.clientX > window.innerWidth - 16
      s.current = edge ? null : { x: t.clientX, y: t.clientY }
    },
    onTouchEnd(e) {
      if (!s.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - s.current.x, dy = t.clientY - s.current.y
      s.current = null
      if (Math.abs(dx) > 48 && Math.abs(dx) > 1.5 * Math.abs(dy)) (dx < 0 ? onLeft : onRight)()
    },
  }
}
