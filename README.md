# sporty

PWA с планом тренировок к 70.3 Ironman (лето 2027) для двух атлетов: общий каркас и персональные модули.

**Сайт:** https://72-56-96-233.sslip.io. Ссылка сразу под атлета: `?a=nikita` или `?a=vanya`.

Контекст и требования лежат в [docs/context.md](docs/context.md). На чём построен план (принципы, прогрессия, этапы после операции, источники) — в [docs/coaching.md](docs/coaching.md).

## Как править план

План лежит в папке [`plan/`](plan/). Контракт, справочник полей и рецепты описаны в [`plan/README.md`](plan/README.md). Интерфейс только читает эти данные.

- `plan/settings.yaml` — атлеты, гонка, выходной, зоны.
- `plan/workouts.yaml` — библиотека тренировок.
- `plan/templates.yaml` — шаблоны недели.
- `plan/calendar.yaml` — фазы, недели, события, разовые замены дней (`overrides`) и вехи.

После правки запусти `npm run validate`: он проверяет схемы, ссылки и даты. Push в `main` сам собирает и выкладывает сайт (GitHub Actions → rsync на сервер), поэтому сначала проверка. Агентам — [AGENTS.md](AGENTS.md).

## Разработка

```sh
npm install
npm run dev       # http://localhost:5173
npm run build     # validate + сборка в dist/
```

Стек: Vite + Preact, vite-plugin-pwa (офлайн, установка на телефон), план в YAML.
