import { ChevronRight, LoaderCircle } from 'lucide-preact'
import { LEVEL, recColor } from '../lib/readiness'
import { factorsLine } from '../lib/coach'

const LEVEL_WORD = { green: 'зелёная', yellow: 'жёлтая', red: 'красная' }

/** Кольцо recovery в цветах WHOOP. score = null — пустое кольцо с «—». */
export function Ring({ score, size = 44, stroke = 4 }) {
  const R = (size - stroke) / 2, C = 2 * Math.PI * R, c = size / 2
  const empty = score == null
  return (
    <svg class="vd-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={R} fill="none" stroke="var(--ring-track)" stroke-width={stroke} />
      {!empty && (
        <circle cx={c} cy={c} r={R} fill="none" stroke={LEVEL[recColor(score)].color} stroke-width={stroke} stroke-linecap="round"
          stroke-dasharray={`${(C * Math.max(2, score)) / 100} ${C}`} transform={`rotate(-90 ${c} ${c})`} />
      )}
      <text x={c} y={c} dy="0.35em" text-anchor="middle" class={`rn${empty ? ' is-empty' : ''}`}>{empty ? '—' : Math.round(score)}</text>
    </svg>
  )
}

/**
 * Вердикт дня: одна строка над списком тренировок — кольцо, решение тренера, главный фактор.
 * Подробности — на экране #/coach/<date>.
 */
export function VerdictRow({ st, date }) {
  const { mode, data, dec, flags, coach } = st
  if (mode === 'none') return null
  const score = data?.recovery?.score ?? null
  const fresh = mode !== 'waiting' && mode !== 'off'

  let title, sub, href = `#/coach/${date}`, trailing = 'chev', muted = false
  if (mode === 'off') {
    title = 'Подключи WHOOP'
    sub = 'Тренер подстроит план под твоё восстановление'
    href = '#/me'
  } else if (mode === 'waiting') {
    title = 'Ждём данные WHOOP'
    sub = 'Открой WHOOP, чтобы он досчитал сон'
    href = null; trailing = null; muted = true
  } else if (mode === 'thinking') {
    title = 'Тренер смотрит данные'
    sub = factorsLine(data, flags) || 'Обычно около минуты'
    href = null; trailing = 'spin'
  } else if (mode === 'reverted') {
    title = 'По плану, без правок тренера'
    sub = 'Совет тренера отключён'
  } else if (mode === 'rules') {
    title = dec?.headline || 'Тренируйся по плану'
    sub = data?.stale ? 'Нет связи с WHOOP — цифры могут быть вчерашние' : coach?.enabled ? 'Тренер не ответил — правки по базовым правилам' : factorsLine(data, flags)
  } else {
    title = dec.headline
    sub = factorsLine(data, flags)
  }

  const aria = [
    fresh && score != null && `Восстановление ${Math.round(score)} процентов, ${LEVEL_WORD[recColor(score)]} зона`,
    title, sub, href && 'Подробнее',
  ].filter(Boolean).join('. ')

  const body = (
    <>
      <Ring score={fresh ? score : null} />
      <span class="vd-text">
        <span class="vd-title">{title}</span>
        {sub && <span class="vd-sub">{sub}</span>}
      </span>
      {trailing === 'chev' && <ChevronRight class="chev" size={18} strokeWidth={2.5} />}
      {trailing === 'spin' && <LoaderCircle class="vd-spin" size={18} strokeWidth={2.25} />}
    </>
  )
  const cls = `card vd${muted ? ' is-muted' : ''}`
  return href
    ? <a class={cls} href={href} aria-label={aria}>{body}</a>
    : <div class={cls} role="status" aria-label={aria} aria-busy={mode === 'thinking'}>{body}</div>
}
