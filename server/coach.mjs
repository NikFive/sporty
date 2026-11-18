// ИИ-тренер дня: WHOOP + план недели + отметки «Сделано» + методичка → Claude → решение по неделе.
// Решение проверяется жёсткими правилами (validate) и хранится поверх плана; YAML не меняется.
// Архитектура и правила — docs/coaching.md § 7.2, server/README.md.

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MODEL = process.env.COACH_MODEL || 'claude-opus-5-5'
// $ за 1M токенов: вход, выход, запись в кэш (5 мин), чтение из кэша
const PRICE = {
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.1],
}
const TZ = 'Europe/Moscow'
const MAX_RUNS_PER_DAY = 4

const DAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const localDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
const localHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(d))
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dow = (s) => DAY_SHORT[new Date(s + 'T12:00:00Z').getUTCDay()]
const round = (x, k = 0) => (x == null ? null : Math.round(x * 10 ** k) / 10 ** k)

// ───────── схема ответа (structured outputs) ─────────
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['level', 'headline', 'summary', 'reasons', 'changes', 'week_note', 'confidence'],
  properties: {
    level: { type: 'string', enum: ['green', 'yellow', 'orange', 'red'] },
    headline: { type: 'string', description: 'Заголовок карточки, до 40 символов: «Сегодня лёгкий день», «Тренируйся по плану»' },
    summary: { type: 'string', description: 'Одно-два предложения: что делаем сегодня и на неделе' },
    reasons: { type: 'array', items: { type: 'string' }, description: '1–3 коротких причины на языке атлета, с цифрами' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'key', 'action', 'minutes', 'swap_with', 'title', 'how'],
        properties: {
          date: { type: 'string', format: 'date' },
          key: { type: ['integer', 'null'], description: 'key тренировки из плана этой даты; null для swap' },
          action: { type: 'string', enum: ['easier', 'shorten', 'replace', 'cancel', 'swap'] },
          minutes: { type: ['integer', 'null'], description: 'новая длительность; не больше плановой' },
          swap_with: { type: ['string', 'null'], description: 'для swap — дата, с которой меняемся' },
          title: { type: ['string', 'null'], description: 'для replace — короткое название новой тренировки' },
          how: { type: 'string', description: 'что конкретно делать, 1 фраза' },
        },
      },
    },
    week_note: { type: ['string', 'null'], description: 'замечание по неделе/тренду, если есть' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
}

const RULES = `Ты — тренер по триатлону (Ironman 70.3) для двух атлетов-любителей, Никиты и Вани. Каждое утро, когда WHOOP посчитал восстановление, ты решаешь, как поменять план на сегодня и ближайшие 6 дней для одного атлета.

Как решать:
- Опирайся на методичку ниже: 80/20, суб-порог «по-норвежски», 2–3 ключевые сессии в неделю, тяжёлые ноги и интенсивное кардио разнесены ≥ 6 ч (лучше в разные дни), понедельник — всегда отдых, в будни одна сессия или один заход в зал.
- Смотри на неделю, а не только на сегодня. Ключевую тренировку в плохой день лучше переставить на ближайший подходящий день (swap), чем урезать. Урезать — когда переставить некуда.
- Сначала снимай интенсивность (интервалы → Z2), объём Z2 трогай в последнюю очередь. Длинную Z2 в жёлтый день обычно оставляй.
- Тренд важнее одного дня: 1 красный день после тяжёлой тренировки — норма. 3+ дня подряд жёлтое/красное или HRV неделю ниже нормы — разгружай неделю (сокращай ключевые на неделе).
- Признаки болезни (частота дыхания выше нормы на 1+, температура кожи выше на 0.5+, резкий рост пульса покоя) — это не усталость: отменяй интенсивность, предложи отдых.
- Не наказывай за то, что уже заложено в плане: дни события medical, восстановление после операции, выходные и разгрузочные недели уже лёгкие — их не урезай повторно.
- Тренируются в основном вместе (together: true). Если у партнёра зелёный, а у атлета нет — общую тренировку можно оставить, но атлет делает её в своей лёгкой версии; не переставляй общие тренировки без нужды.
- Тесты (title содержит «тест») в красный/оранжевый день переноси.
- Зелёный день без флагов — ничего не меняй, changes пустой. Не придумывай изменения ради изменений.
- Никогда не увеличивай нагрузку относительно плана.

Формат изменений (changes):
- key — это key тренировки в плане этой даты (из контекста). date — от сегодня до +6 дней.
- easier — та же тренировка без интенсивности (minutes можно оставить или сократить); shorten — сократить (minutes обязателен); replace — заменить на другую (title + minutes); cancel — убрать.
- swap — поменять местами всё содержимое двух дней (key = null, swap_with = другая дата). Даты swap не трогай другими изменениями. Не ставь swap на понедельник и дни событий.
- how — конкретно и коротко: «4×8 мин → ровно 40 мин Z2», «без отказа, вес −10%».

Пиши по-русски, на «ты», коротко, как живой тренер. Уровень level: green ≥67 recovery без флагов; yellow 50–66; orange 34–49 или жёлтый с флагами; red ≤33 или несколько сильных флагов.`

// ───────── план с диска (dist/_coach) ─────────
let planCache = { mtime: 0, plan: null, coaching: '' }
function loadPlan(dir) {
  const f = join(dir, 'plan.json')
  const m = statSync(f).mtimeMs
  if (m !== planCache.mtime) {
    planCache = { mtime: m, plan: JSON.parse(readFileSync(f, 'utf8')), coaching: readFileSync(join(dir, 'coaching.md'), 'utf8') }
  }
  return planCache
}

const HARD = new Set(['z4', 'z5'])
const isLegs = (it) => it.sport === 'strength' && /ног/i.test(it.title || '')

export function createCoach({ db, persist, whoop, log, planDir, athletes }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const client = apiKey ? new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000 }) : null
  const running = new Map()

  // ───────── контекст ─────────
  async function whoopHistory(athlete) {
    const since = new Date(Date.now() - 15 * 86_400_000).toISOString()
    const since7 = new Date(Date.now() - 8 * 86_400_000).toISOString()
    const [rec, sleep, cyc, wk] = await Promise.all([
      whoop(athlete, '/v2/recovery', { limit: 25, start: since }),
      whoop(athlete, '/v2/activity/sleep', { limit: 25, start: since }),
      whoop(athlete, '/v2/cycle', { limit: 25, start: since }),
      whoop(athlete, '/v2/activity/workout', { limit: 25, start: since7 }).catch(() => ({ records: [] })),
    ])
    const cycles = new Map((cyc.records || []).map((c) => [c.id, c]))
    const sleeps = new Map((sleep.records || []).filter((s) => !s.nap).map((s) => [s.id, s]))
    const days = (rec.records || []).filter((r) => r.score_state === 'SCORED' && r.score).map((r) => {
      const c = cycles.get(r.cycle_id)
      const s = sleeps.get(r.sleep_id)
      const st = s?.score?.stage_summary
      const need = s?.score?.sleep_needed
      return {
        date: c?.start ? localDate(new Date(c.start)) : localDate(new Date(r.created_at)),
        recovery: round(r.score.recovery_score),
        hrv: round(r.score.hrv_rmssd_milli, 1),
        rhr: round(r.score.resting_heart_rate),
        skin_temp: round(r.score.skin_temp_celsius, 1),
        resp_rate: round(s?.score?.respiratory_rate, 1),
        sleep_h: st ? round((st.total_light_sleep_time_milli + st.total_slow_wave_sleep_time_milli + st.total_rem_sleep_time_milli) / 3.6e6, 1) : null,
        sleep_need_h: need ? round((need.baseline_milli + need.need_from_sleep_debt_milli + need.need_from_recent_strain_milli) / 3.6e6, 1) : null,
        sleep_perf: round(s?.score?.sleep_performance_percentage),
        day_strain: round(c?.score?.strain, 1),
        calibrating: r.score.user_calibrating || undefined,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }
    })
    const workouts = (wk.records || []).filter((w) => w.score_state === 'SCORED').map((w) => ({
      date: localDate(new Date(w.start)),
      sport: w.sport_name,
      minutes: Math.round((new Date(w.end) - new Date(w.start)) / 60000),
      strain: round(w.score?.strain, 1),
      avg_hr: w.score?.average_heart_rate,
      max_hr: w.score?.max_heart_rate,
    }))
    return { days, workouts }
  }

  function planWindow(athlete, today, back = 7, ahead = 6) {
    const { plan } = loadPlan(planDir)
    const done = db.athletes[athlete]?.done || {}
    const out = []
    for (let i = -back; i <= ahead; i++) {
      const date = addDays(today, i)
      const d = plan.days[athlete]?.[date]
      if (!d) continue
      out.push({
        date, dow: dow(date), rel: i === 0 ? 'сегодня' : i < 0 ? 'прошлое' : 'будущее',
        rest: d.rest, event: d.event, week_kind: d.week?.kind, phase: d.phase,
        items: d.items.map((it) => ({
          key: it.key, id: it.id, title: it.title, sport: it.sport, zone: it.zone, minutes: it.minutes,
          together: it.together, time: it.time,
          ...(i < 0 ? { done: done[`${date}:${it.id}`]?.d === 1 } : {}),
        })),
      })
    }
    return out
  }

  async function buildContext(athlete, today) {
    const { plan } = loadPlan(planDir)
    const hist = await whoopHistory(athlete)
    const window = planWindow(athlete, today)
    const usedIds = new Set(window.filter((d) => d.rel !== 'прошлое').flatMap((d) => d.items.map((i) => i.id)))
    const workouts = Object.fromEntries([...usedIds].map((id) => {
      const w = plan.workouts[id]
      return [id, w && { title: w.title, sport: w.sport, zone: w.zone, formula: w.formula, main: w.main, why: w.why, note: w.notes?.[athlete] }]
    }))
    const partner = athletes.find((a) => a !== athlete)
    const pRec = db.athletes[partner]?.lastToday?.recovery
    return {
      athlete: { id: athlete, ...plan.athletes[athlete] },
      today, today_dow: dow(today),
      race: plan.race,
      whoop_days: hist.days, // новые сначала
      whoop_workouts_7d: hist.workouts,
      plan_days: window,
      workouts,
      partner: partner && {
        id: partner, name: plan.athletes[partner]?.name,
        today_recovery: pRec && localDate(new Date(pRec.at)) === today ? pRec.score : null,
        today_plan: plan.days[partner]?.[today]?.items?.map((i) => ({ title: i.title, together: i.together, minutes: i.minutes })) || [],
      },
    }
  }

  // ───────── проверка решения ─────────
  function validate(dec, ctx) {
    const issues = []
    const byDate = new Map(ctx.plan_days.filter((d) => d.rel !== 'прошлое').map((d) => [d.date, d]))
    const last = addDays(ctx.today, 6)
    const swapped = new Set()
    const ok = []
    for (const c of dec.changes || []) {
      const day = byDate.get(c.date)
      if (!day || c.date < ctx.today || c.date > last) { issues.push(`дата вне окна: ${c.date}`); continue }
      if (c.action === 'swap') {
        const other = byDate.get(c.swap_with)
        const bad = !other || other.date === day.date || [day, other].some((d) => d.dow === 'Пн' || d.rest || d.event || !d.items.length)
          || swapped.has(day.date) || swapped.has(other?.date)
        if (bad) { issues.push(`swap отклонён: ${c.date}↔${c.swap_with}`); continue }
        // правило 6 часов: после перестановки в дне не должно быть интенсива и тяжёлых ног вместе
        const clash = (a, b) => a.items.some((i) => HARD.has(i.zone)) && b.items.some(isLegs)
        if (clash(day, other) || clash(other, day)) { issues.push(`swap нарушает 6 ч: ${c.date}↔${c.swap_with}`); continue }
        swapped.add(day.date); swapped.add(other.date)
        ok.push({ ...c, key: null, minutes: null, title: null })
        continue
      }
      const it = day.items.find((i) => i.key === c.key)
      if (!it) { issues.push(`нет тренировки key=${c.key} на ${c.date}`); continue }
      let minutes = c.action === 'cancel' ? 0 : c.minutes ?? it.minutes
      if (minutes > it.minutes) minutes = it.minutes // не увеличиваем
      ok.push({ ...c, minutes, from: it.minutes, swap_with: null })
    }
    // изменения внутри дней, которые меняются местами, — убираем
    const final = ok.filter((c) => c.action === 'swap' || !swapped.has(c.date) || (issues.push(`изменение на дне swap отброшено: ${c.date}`), false))
    // безопасность: в красный/оранжевый день сегодняшний интенсив не может остаться как есть
    const todayDay = byDate.get(ctx.today)
    if ((dec.level === 'red' || dec.level === 'orange') && todayDay && !swapped.has(ctx.today)) {
      const untouchedHard = todayDay.items.filter((i) => HARD.has(i.zone) && !final.some((c) => c.date === ctx.today && c.key === i.key))
      if (untouchedHard.length) return { valid: false, issues: [...issues, 'интенсив сегодня не снят при красном/оранжевом'] }
    }
    return { valid: true, issues, decision: { ...dec, changes: final } }
  }

  const cost = (u, model) => {
    const [i, o, cw, cr] = PRICE[model] || PRICE['claude-opus-5-5']
    return ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o + (u.cache_creation_input_tokens || 0) * cw + (u.cache_read_input_tokens || 0) * cr) / 1e6
  }

  // ───────── запуск ─────────
  async function run(athlete, { force = false, reason = 'auto' } = {}) {
    if (!client) return { status: 'disabled' }
    const rec = db.athletes[athlete]
    if (!rec?.tokens) return { status: 'not_connected' }
    if (running.has(athlete)) return running.get(athlete)
    const today = localDate()
    rec.coach ||= {}
    const prev = rec.coach[today]
    if (prev && (prev.runs || 0) >= MAX_RUNS_PER_DAY && !force) return prev

    const p = (async () => {
      const t0 = Date.now()
      try {
        const ctx = await buildContext(athlete, today)
        const fresh = ctx.whoop_days[0]
        if (!fresh || fresh.date !== today) return { status: 'waiting_recovery' }
        if (!force && prev?.status === 'ok' && prev.recoveryAt === fresh.updated_at) return prev
        const { coaching } = loadPlan(planDir)

        const msg = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
          system: [
            { type: 'text', text: RULES },
            { type: 'text', text: `Методичка тренера (docs/coaching.md):\n\n${coaching}`, cache_control: { type: 'ephemeral' } },
          ],
          messages: [{
            role: 'user',
            content: `Контекст на ${today} (${ctx.today_dow}), JSON:\n${JSON.stringify(ctx)}\n\nРеши, как скорректировать план ${ctx.athlete.name} на сегодня и ближайшие дни. Верни JSON по схеме.`,
          }],
        })
        if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') throw new Error(`stop_reason ${msg.stop_reason}`)
        const text = msg.content.find((b) => b.type === 'text')?.text
        const raw = JSON.parse(text)
        const v = validate(raw, ctx)
        const usd = cost(msg.usage, MODEL)
        const entry = {
          status: v.valid ? 'ok' : 'rejected',
          date: today,
          at: new Date().toISOString(),
          recoveryAt: fresh.updated_at,
          recovery: fresh.recovery,
          decision: v.valid ? v.decision : raw,
          issues: v.issues,
          model: msg.model,
          usage: msg.usage,
          costUsd: round(usd, 4),
          ms: Date.now() - t0,
          runs: (prev?.runs || 0) + 1,
          reason,
          feedback: prev?.feedback && prev.recoveryAt === fresh.updated_at ? prev.feedback : null,
        }
        rec.coach[today] = entry
        rec.coachLog ||= []
        rec.coachLog.push({ at: entry.at, date: today, status: entry.status, costUsd: entry.costUsd, usage: msg.usage, ms: entry.ms, reason })
        rec.coachLog = rec.coachLog.slice(-200)
        // храним решения за 60 дней
        for (const d of Object.keys(rec.coach)) if (d < addDays(today, -60)) delete rec.coach[d]
        persist()
        log('coach', athlete, entry.status, `$${entry.costUsd}`, `${entry.ms}ms`, JSON.stringify(msg.usage), v.issues.join('; '))
        return entry
      } catch (e) {
        log('coach error', athlete, e.message)
        const entry = { ...(prev || {}), status: prev?.status === 'ok' ? 'ok' : 'error', error: e.message, errorAt: new Date().toISOString(), date: today }
        rec.coach[today] = entry
        persist()
        return entry
      } finally {
        running.delete(athlete)
      }
    })()
    running.set(athlete, p)
    return p
  }

  // Утром каждые 10 минут проверяем, не появилось ли восстановление.
  function startScheduler() {
    const tick = () => {
      const h = localHour()
      if (h < 4 || h > 14) return
      for (const a of athletes) {
        const rec = db.athletes[a]
        if (!rec?.tokens) continue
        const today = localDate()
        const c = rec.coach?.[today]
        if (c?.status === 'ok' || (c?.runs || 0) >= MAX_RUNS_PER_DAY) continue
        if (c?.errorAt && Date.now() - new Date(c.errorAt) < 30 * 60_000) continue
        run(a, { reason: 'schedule' }).catch(() => {})
      }
    }
    setInterval(tick, 10 * 60_000).unref()
    setTimeout(tick, 15_000).unref()
  }

  function today(athlete) {
    const t = localDate()
    const c = db.athletes[athlete]?.coach?.[t]
    const month = t.slice(0, 7)
    const monthUsd = Object.values(db.athletes).flatMap((r) => r.coachLog || []).filter((l) => l.at.slice(0, 7) === month).reduce((s, l) => s + (l.costUsd || 0), 0)
    return {
      enabled: !!client,
      running: running.has(athlete),
      date: t,
      ...(c ? { status: c.status, decision: c.status === 'ok' ? c.decision : null, at: c.at, recovery: c.recovery, model: c.model, costUsd: c.costUsd, feedback: c.feedback, error: c.status === 'error' ? c.error : undefined } : { status: 'none' }),
      monthUsd: round(monthUsd, 2),
    }
  }

  function feedback(athlete, body) {
    const t = localDate()
    const c = db.athletes[athlete]?.coach?.[t]
    if (!c) return null
    c.feedback = { vote: [1, -1].includes(body.vote) ? body.vote : c.feedback?.vote ?? null, reverted: typeof body.reverted === 'boolean' ? body.reverted : !!c.feedback?.reverted, at: new Date().toISOString() }
    persist()
    return c.feedback
  }

  return { run, today, feedback, startScheduler, enabled: !!client }
}
