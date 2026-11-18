// Экспорт плана для ИИ-тренера на сервере: развёрнутые дни сезона по атлетам + библиотека тренировок
// + методичка. Пишет dist/_coach/{plan.json,coaching.md}. nginx закрывает /_coach/ снаружи,
// сервер (server/coach.mjs) читает файлы с диска. Запускается в `npm run build` после vite build.
import { createServer } from 'vite'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const v = await createServer({ root: process.cwd(), server: { middlewareMode: true }, logLevel: 'error', appType: 'custom' })
try {
  const P = await v.ssrLoadModule('/src/lib/plan.js')
  const days = {}
  for (const a of P.ATHLETES) {
    days[a] = {}
    for (let d = P.addDays(P.PLAN_START, -7); d <= P.addDays(P.PLAN_END, 7); d = P.addDays(d, 1)) {
      const day = P.getDay(d, a)
      days[a][d] = {
        rest: day.rest || undefined,
        outside: day.outside || undefined,
        phase: day.phase?.id || day.phase?.title,
        week: day.week ? { kind: day.week.kind, template: day.week.template } : undefined,
        event: day.event ? { kind: day.event.kind, title: day.event.title, note: day.event.note } : undefined,
        items: day.items.map((it) => ({
          key: it.key, id: it.id, time: it.time, together: it.together, minutes: it.minutes,
          zone: P.keyZone(it.workout), sport: it.workout?.sport, title: it.workout?.title,
        })),
      }
    }
  }
  const workouts = {}
  for (const id of Object.keys(P.plan.workouts)) {
    const w = P.getWorkout(id)
    workouts[id] = { sport: w.sport, title: w.title, warmup: w.warmup, main: w.main, cooldown: w.cooldown, why: w.why, notes: w.notes, minutes: Math.round(w.minutes), zone: P.keyZone(w), formula: P.formula(w) || undefined }
  }
  const out = {
    builtAt: new Date().toISOString(),
    athletes: P.plan.athletes, race: P.plan.race, zones: P.plan.zones, restDay: P.plan.restDay,
    phases: P.plan.phases, milestones: P.plan.milestones, days, workouts,
  }
  mkdirSync('dist/_coach', { recursive: true })
  writeFileSync('dist/_coach/plan.json', JSON.stringify(out))
  writeFileSync('dist/_coach/coaching.md', readFileSync('docs/coaching.md', 'utf8'))
  console.log(`coach export: ${Object.keys(workouts).length} workouts, ${Object.keys(days[P.ATHLETES[0]]).length} days × ${P.ATHLETES.length}`)
} finally {
  await v.close()
}
