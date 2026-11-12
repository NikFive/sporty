# AGENTS.md

PWA (Vite + Preact) with a 70.3 Ironman training plan for two athletes (nikita, vanya). The UI is in Russian. Product context lives in `docs/context.md`. The coaching methodology (why the plan looks like this, progression rules, Nikita's shoulder protocol, sources) lives in `docs/coaching.md`; read it before changing training content.

## Repo map
- `plan/*.yaml`: the training plan. It is data only and is the single source of truth. The contract is in `plan/README.md`, and the JSON Schemas are in `plan/schema/`.
- `scripts/validate-plan.mjs`: checks the plan against the schemas and the cross-file invariants. Run it with `npm run validate`; `npm run build` also runs it first.
- `src/lib/plan.js`: loads and merges the four YAML files. It exposes `plan`, `getDay`, `getWeek`, `seasonWeeks`, and so on.
- `src/app.jsx`, `src/screens/`, `src/components/`, `src/styles.css`: the UI. It only reads `src/lib/plan.js`.
- `.github/workflows/deploy.yml`: on every push to `main`, it runs `npm ci && npm run build` and rsyncs `dist/` to the server.

## To edit the training plan
Only touch `plan/*.yaml`, and follow `plan/README.md`. It has a cookbook for common edits: overrides, events, deloads, templates, the race date, and extending the calendar. Run `npm run validate` and fix every error before you commit. Keep the UI untouched; plan changes never need code changes.

## Commit conventions
- Write the subject line in English, as a short summary, optionally with an area prefix. Examples: `Plan: Nikita's surgery recovery 22–25 Nov`, `Redesign: …`.
- If the change has several parts, the body is a bullet list of what changed.
- End the message with the `Co-Authored-By` trailer when an AI wrote the change.
- Commit only when asked. Never commit a plan that fails `npm run validate`.

## Deploy
Pushing to `main` deploys to production automatically. There is no staging. Run `npm run validate` (or `npm run build`) before you push.
