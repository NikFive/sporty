import { fmtRange } from '../lib/plan'

// Особые состояния дня/недели: поездка, гонка, разгрузка, черновик.
export function DayBanner({ day }) {
  const out = []
  if (day.event)
    out.push(
      <div class={`banner banner-${day.event.kind}`} key="ev">
        <b>{day.event.title}</b>
        <span class="mono"> · {fmtRange(day.event.start, day.event.end)}</span>
        {day.event.note && <p>{day.event.note}</p>}
      </div>,
    )
  else if (day.week?.kind === 'deload')
    out.push(
      <div class="banner banner-deload" key="dl">
        <b>Разгрузочная неделя</b>
        <p>Объём −30%, интенсивность та же. Длительности уже уменьшены.</p>
      </div>,
    )
  if (day.template?.draft && !day.event)
    out.push(
      <div class="banner banner-draft" key="dr">
        <b>Черновик</b>
        <p>Шаблон этой фазы ещё обсуждаем — детали могут поменяться.</p>
      </div>,
    )
  return out.length ? <div class="banners">{out}</div> : null
}
