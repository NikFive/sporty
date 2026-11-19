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
    headline: { type: 'string', description: 'Вердикт на сегодня, 2–5 слов, до 30 символов, без точки: «Сегодня только лёгкий вел», «Тренируйся по плану»' },
    summary: { type: 'string', description: 'Что делать сегодня, 1 предложение до 100 символов (+ до 40 про сон/самочувствие). Без минут и причин' },
    reasons: { type: 'array', items: { type: 'string' }, description: '1–3 пункта до 60 символов, начинаются с показателя и цифры, без точки: «Сон 6.1 ч из 10 нужных»' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'key', 'action', 'minutes', 'swap_with', 'title', 'how', 'workout'],
        properties: {
          date: { type: 'string', format: 'date' },
          key: { type: ['integer', 'null'], description: 'key тренировки из плана этой даты; null для swap' },
          action: { type: 'string', enum: ['easier', 'shorten', 'replace', 'cancel', 'swap'] },
          minutes: { type: ['integer', 'null'], description: 'новая длительность; не больше плановой' },
          swap_with: { type: ['string', 'null'], description: 'для swap — дата, с которой меняемся' },
          title: { type: ['string', 'null'], description: 'Для replace — название в стиле плана, до 24 символов: «Мобилити»' },
          how: { type: 'string', description: 'Отличие от плана, 1 строка до 50 символов, без минут: «5×6 мин суб-порог → ровный Z2»' },
          workout: {
            anyOf: [{ type: 'null' }, {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'warmup', 'main', 'cooldown', 'segments'],
              description: 'Новая версия тренировки целиком, в стиле плана. Обязательна для easier/shorten/replace, null для cancel/swap',
              properties: {
                title: { type: 'string' },
                warmup: { type: ['string', 'null'] },
                main: { type: 'string', description: 'силовая/мобилити: упражнения через « · », «Название 3×8 (2 в запасе)»; кардио — короткая инструкция' },
                cooldown: { type: ['string', 'null'] },
                segments: {
                  type: 'array',
                  description: 'профиль по порядку: отрезки [минуты, зона]; сумма минут = minutes',
                  items: {
                    type: 'object', additionalProperties: false, required: ['min', 'zone'],
                    properties: { min: { type: 'number' }, zone: { type: 'string', enum: ['z1', 'z2', 'z3', 'z4', 'z5', 'str', 'plyo', 'mob', 'alt'] } },
                  },
                },
              },
            }],
          },
        },
      },
    },
    week_note: { type: ['string', 'null'], description: 'null по умолчанию. Только если решение меняет дни после сегодня и этого нет в changes. До 120 символов' },
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
- Тренировки сегодня с done: true уже сделаны — не меняй и не переставляй их.

Формат изменений (changes):
- key — это key тренировки в плане этой даты (из контекста). date — от сегодня до +6 дней.
- easier — та же тренировка без интенсивности (minutes можно оставить или сократить); shorten — сократить (minutes обязателен); replace — заменить на другую (title + minutes); cancel — убрать.
- swap — поменять местами всё содержимое двух дней (key = null, swap_with = другая дата). Даты swap не трогай другими изменениями. Не ставь swap на понедельник и дни событий.
Как писать. Атлет читает это с телефона утром, за 5 секунд.

Голос
- На «ты», в повелительном наклонении: «делай», «едешь», «ложись». Без «мы», «давай», «предлагаю», «рекомендуется».
- Пиши как тренер в мессенджере: коротко, конкретно, очевидное не объясняй.
- Каждый факт — в одном поле. Что уже сказано в одном поле, в другом не повторяй.
- Не меняешь — молчи. Не пиши «оставляем как есть», «пока не трогаем», «остальное по плану». Если о дне ничего не сказано, он идёт по плану.
- Цифры пиши как в плане: «6.1 ч», «−10%», «3×6», «Z2», «43 → 25 → 60%». Без восклицательных знаков и эмодзи.

Поля
- headline — вердикт на сегодня: 2–5 слов, до 30 символов, без точки. Пиши, что делать, а не что с атлетом: «Сегодня только лёгкий вел», «Бег по плану, ноги полегче», «Суб-порог — на завтра», «Тренируйся по плану». Процент восстановления не пиши, он на кольце.
- summary — что делать сегодня, одно предложение до 100 символов. Минут и подходов здесь нет, они в строках тренировок. Причин тоже нет, они в reasons. Пиши только про сегодня: другие дни — в changes и week_note. Второе короткое предложение (всего до 140 символов) можно добавить только про сон или самочувствие сегодня, и только если это главная причина решения.
- reasons — от 1 до 3 пунктов, каждый до 60 символов, без точки в конце. Пункт начинается с показателя и цифры: «Сон 6.1 ч из 10 нужных», «HRV 31 — на 28% ниже нормы», «43 → 25 → 60% — третий день не зелёный». Сравнивай с нормой атлета или показывай тренд. Без советов и без выводов о здоровье. Сегодняшний процент восстановления не повторяй, он допустим только внутри тренда. Если level строже цвета WHOOP (например, 60% и level orange), первый пункт объясняет почему: «Сон 6.1 ч из 10 нужных — поэтому строже жёлтого».
- changes[].how — чем правка отличается от плана: одна строка до 50 символов, без минут (приложение само покажет «было → стало»). Примеры: «5×6 мин суб-порог → ровный Z2», «Минус подход, вес −10%, 2–3 в запасе», «Вместо прыжков — мобилити», «Вел на суб-порог — в четверг».
- changes[].title (для replace) — название в стиле плана, до 24 символов: «Мобилити», «Вел Z2».
- changes[].workout (для easier/shorten/replace) — тренировка целиком, как атлет увидит её в приложении, в стиле workouts из контекста:
  · title — как у исходной, если суть та же: силовая полегче остаётся «Силовая B — ноги и задняя цепь». Новое — если суть поменялась: интервалы → «Вел Z2», прыжки → «Мобилити». Без «облегчённая», «лайт», «версия тренера».
  · warmup и cooldown — коротко, с точкой: «10 мин Z1.», «10 мин вел + суставная.», «5 мин растяжка.». Если у исходной их нет — null.
  · main для кардио — 1–2 предложения до 160 символов: время и зона, ориентир атлета из notes (ватты, км/ч) и одна подсказка, как держать зону. Пример: «30 мин ровно в Z2, каденс 85–95. Ориентир ≈ 120–140 Вт.»
  · main для силовой и мобилити — упражнения через « · », каждое в виде «Название N×M (уточнение)»: «Hip thrust в тренажёре 3×6 (вес −10%, 2–3 в запасе)». Без вступления и без вывода в конце. Ограничения атлета из notes оставь прямо в упражнениях: «на локте здоровой руки», «руки на груди».
  · Не пиши, что убрал и почему. Это есть в how и reasons, а сравнение с планом приложение показывает само.
  · segments — сумма min равна minutes. Зоны как у исходной: силовая — mob/str/mob, мобилити — mob.
- week_note — по умолчанию null. Пиши, только если решение меняет что-то после сегодняшнего дня и этого не видно в changes. Например: пропущенную ключевую не догоняешь; неделя разгрузочная из-за тренда; завтра надо следить за признаками простуды. 1–2 предложения, до 120 символов. План на остальные дни не пересказывай.

Особые темы
- Партнёр. Называй по имени («с Ваней», «с Никитой») и только если тренировка общая, а у атлета своя версия: «С Ваней едете вместе, но ты — ровно в Z2». Восстановление и другие данные партнёра не упоминай. Если партнёр в отъезде или на событии, приложение само напишет «делаешь сам».
- Операция и другие события medical. Упоминай, только если событие меняет решение, и не больше одного раза за ответ. Дату и день недели бери из контекста (milestones), не из начала события: «до операции 4 дня», «операция в понедельник». Советов про подготовку к операции и восстановление после неё не давай, это к хирургу.
- Сон. Цифры бери из данных: «6.1 ч из 10 нужных». Совет один, конкретный, в summary: «Сегодня спи 8+ ч». Зачем спать — не объясняй.
- Здоровье. Не ставь диагнозов и не делай медицинских выводов: «это не болезнь», «ты заболеваешь», «перетренированность». Описывай данные и своё решение: «Температура кожи +0.7 к норме, дыхание чаще обычного». При признаках болезни можно одну фразу: «Если плохо себя чувствуешь — сегодня полный отдых».
- Выходной или день события. headline — «Выходной» или «Восстановление», changes — только по следующим дням. В день события medical советов нет, summary: «Сегодня без тренировок».

Нельзя
- Вода и связки: «главное —», «важно», «помни», «стоит», «по сути», «в целом», «так что», «это нормально», «лучшая подготовка к …», «чтобы прийти свежим».
- Нравоучения и объяснения физиологии. Методичка — для тебя, а не для атлета. «Зачем» у каждой тренировки уже есть в приложении.
- «ИИ», «данные WHOOP показывают», «по моим расчётам», названия уровней («уровень orange»).
- Англицизмы, когда есть русское слово. HRV, strain, Z2, FTP, hip thrust можно: это язык плана.

Уровень level: green — recovery ≥67 без флагов; yellow — 50–66; orange — 34–49 или жёлтый с флагами; red — ≤33 или несколько сильных флагов.

Примеры хороших ответов (цифры условные, не копируй):

Красный — Никита, ср 18 ноября, 25%:
{"level":"red","headline":"Сегодня только лёгкий вел","summary":"С Ваней едете вместе, но ты — ровно и легко, без интервалов.","reasons":["HRV 31 — на 28% ниже твоей нормы","Пульс покоя 63, обычно 57","43 → 25% — второй день вниз"],"changes":[{"date":"2026-11-18","key":0,"action":"easier","minutes":45,"swap_with":null,"title":null,"how":"5×6 мин суб-порог → ровный Z2","workout":{"title":"Вел Z2","warmup":"10 мин Z1.","main":"30 мин ровно в Z2, каденс 85–95. Ориентир ≈ 120–140 Вт, к 150 не подходи.","cooldown":"5 мин Z1.","segments":[{"min":10,"zone":"z1"},{"min":30,"zone":"z2"},{"min":5,"zone":"z1"}]}}],"week_note":"Суб-порог на этой неделе не переноси: до операции он не нужен.","confidence":"high"}

Жёлтый с перестановкой — Ваня, ср 25 ноября, 54%:
{"level":"yellow","headline":"Суб-порог — на завтра","summary":"Сегодня бег Z2 и силовая из четверга.","reasons":["HRV третий день вниз: 71 → 66 → 62","Пульс покоя 52 — на 3 выше обычного"],"changes":[{"date":"2026-11-25","key":null,"action":"swap","minutes":null,"swap_with":"2026-11-26","title":null,"how":"Вел на суб-порог — в четверг","workout":null}],"week_note":null,"confidence":"medium"}

Зелёный без изменений — Никита, пт 20 ноября, 74%:
{"level":"green","headline":"Тренируйся по плану","summary":"Вел Z2 с Ваней как в плане, держи ниже 150 Вт.","reasons":["Сон 8.2 ч из 9 нужных","25 → 60 → 74% — третий день вверх"],"changes":[],"week_note":null,"confidence":"high"}`

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
const ZR = { z1: 1, z2: 2, z3: 3, z4: 4, z5: 5 }
const maxRank = (segs) => Math.max(0, ...segs.map(([, z]) => ZR[z] || 0))
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
          ...(i <= 0 ? { done: done[`${date}:${it.id}`]?.d === 1 } : {}),
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
      return [id, w && { title: w.title, sport: w.sport, zone: w.zone, formula: w.formula, minutes: w.minutes, warmup: w.warmup, main: w.main, cooldown: w.cooldown, segments: w.segments, why: w.why, note: w.notes?.[athlete] }]
    }))
    const partner = athletes.find((a) => a !== athlete)
    const pRec = db.athletes[partner]?.lastToday?.recovery
    return {
      athlete: { id: athlete, ...plan.athletes[athlete] },
      today, today_dow: dow(today),
      race: plan.race,
      // вехи рядом (операция, тесты, допуски) — даты берём отсюда, а не из начала события
      milestones: (plan.milestones || []).filter((m) => (!m.athlete || m.athlete === athlete) && m.date >= addDays(today, -14) && m.date <= addDays(today, 30)).map((m) => ({ date: m.date, dow: dow(m.date), title: m.title, note: m.note })),
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
        const bad = !other || other.date === day.date || [day, other].some((d) => d.dow === 'Пн' || d.rest || d.event || !d.items.length) || [day, other].some((d) => d.items.some((i) => i.done))
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
      let workout = null
      if (c.action !== 'cancel' && c.workout?.main) {
        const segs = (c.workout.segments || []).filter((x) => x.min > 0).map((x) => [Math.round(x.min * 100) / 100, x.zone])
        const sum = segs.reduce((a, [m]) => a + m, 0)
        const orig = ctx.workouts[it.id]?.segments || []
        // новая версия не может быть интенсивнее исходной
        if (segs.length && maxRank(segs) > Math.max(maxRank(orig), 2)) { issues.push(`интенсивнее плана: ${c.date} key=${c.key}`); continue }
        if (sum) minutes = Math.round(sum)
        workout = { title: c.workout.title || it.title, warmup: c.workout.warmup || null, main: c.workout.main, cooldown: c.workout.cooldown || null, segments: segs }
      } else if (c.action !== 'cancel') issues.push(`нет содержания тренировки: ${c.date} key=${c.key}`)
      if (minutes > it.minutes) { minutes = it.minutes; if (workout) issues.push(`длиннее плана, обрезано: ${c.date} key=${c.key}`) }
      if (it.done) { issues.push(`уже сделана: ${c.date} key=${c.key}`); continue }
      ok.push({ ...c, id: it.id, minutes, from: it.minutes, swap_with: null, workout })
    }
    // изменения внутри дней, которые меняются местами, — убираем
    const final = ok.filter((c) => c.action === 'swap' || !swapped.has(c.date) || (issues.push(`изменение на дне swap отброшено: ${c.date}`), false))
    // безопасность: в красный/оранжевый день сегодняшний интенсив не может остаться как есть
    const todayDay = byDate.get(ctx.today)
    if ((dec.level === 'red' || dec.level === 'orange') && todayDay && !swapped.has(ctx.today)) {
      const untouchedHard = todayDay.items.filter((i) => HARD.has(i.zone) && !final.some((c) => c.date === ctx.today && c.key === i.key && (c.action === 'cancel' || !c.workout?.segments?.some(([, z]) => HARD.has(z)))))
      if (untouchedHard.length) return { valid: false, issues: [...issues, 'интенсив сегодня не снят при красном/оранжевом'] }
    }
    // мягкие лимиты длины (в логи, не обрезаем)
    const lim = { headline: 30, summary: 140, week_note: 120 }
    for (const [f, n] of Object.entries(lim)) if ((dec[f] || '').length > n * 1.5) issues.push(`длинно: ${f} ${dec[f].length}`)
    for (const r of dec.reasons || []) if (r.length > 90) issues.push(`длинно: reason ${r.length}`)
    for (const c of final) if ((c.how || '').length > 75) issues.push(`длинно: how ${c.how.length}`)
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
    c.feedback = { vote: 'vote' in body ? ([1, -1].includes(body.vote) ? body.vote : null) : c.feedback?.vote ?? null, reverted: typeof body.reverted === 'boolean' ? body.reverted : !!c.feedback?.reverted, at: new Date().toISOString() }
    persist()
    return c.feedback
  }

  return { run, today, feedback, startScheduler, enabled: !!client }
}
