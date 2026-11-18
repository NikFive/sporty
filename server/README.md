# server/ — Sporty API (WHOOP)

Маленький Node-сервис: OAuth WHOOP, сводка «на сегодня», отметки «Сделано» и ИИ-тренер дня (`coach.mjs`, единственная зависимость — `@anthropic-ai/sdk`).
Живёт на той же машине, что и сайт; nginx проксирует `/api/` → `127.0.0.1:8787`.

| Где | Что |
|---|---|
| `/opt/sporty-api/whoop.mjs` | код (копия `server/whoop.mjs`) |
| `/etc/systemd/system/sporty-api.service` | юнит, пользователь `sporty` |
| `/etc/sporty/whoop.env` | `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `PUBLIC_URL`, `PORT`, опц. `COACH_MODEL` (0640 root:sporty) |
| `/var/www/sporty/_coach/` | `plan.json` (развёрнутый план) + `coaching.md` — кладёт `scripts/export-coach.mjs` при деплое; nginx отдаёт 404 снаружи |
| `/var/lib/sporty/whoop.json` | токены, device-ключи (sha256) и отметки «Сделано», 0600 |

## WHOOP-приложение (developer-dashboard.whoop.com)
- Redirect URL: `https://72-56-96-233.sslip.io/api/whoop/callback`
- Privacy policy: `https://72-56-96-233.sslip.io/privacy.html`
- Scopes: все `read:*` (recovery, cycles, workout, sleep, profile, body_measurement). `offline` запрашивается в URL авторизации — он даёт refresh-токен.
- Ключи на сервер: `server/set-whoop-creds.sh <CLIENT_ID> <CLIENT_SECRET>`.

## API
- `GET /api/health` → `{ ok, configured }`
- `GET /api/whoop/connect?athlete=&device=` → редирект на WHOOP OAuth
- `GET /api/whoop/callback` → обмен кода, редирект на `/?whoop=ok#/me`
- `GET /api/whoop/status?athlete=` (заголовок `x-sporty-device`) → `{ configured, connected, authorized, profile }`
- `GET /api/whoop/today?athlete=` (`x-sporty-device`) → recovery, baseline (среднее за 30 дн), sleep, strain. Кэш 5 мин, `&fresh=1` — мимо кэша
- `GET|POST /api/done?athlete=` (`x-sporty-device`) → отметки «Сделано» `{ items: { 'YYYY-MM-DD:id': { d: 1|0, at } } }`, слияние last-write-wins. Пишет только телефон, подключённый к WHOOP атлета
- `GET /api/coach/today?athlete=` → решение тренера на сегодня `{ status, running, decision, feedback, costUsd, monthUsd }`
- `POST /api/coach/run?athlete=` → пересчитать (не чаще раза в 10 мин)
- `POST /api/coach/feedback?athlete=` `{ vote: 1|-1, reverted: bool }`
- `POST /api/whoop/disconnect?athlete=` → отзыв доступа в WHOOP и удаление токенов

Доступ без аккаунтов: телефон генерирует случайный device-ключ (localStorage) и передаёт его в `/connect`;
после успешного OAuth сервер разрешает этому ключу читать данные атлета.

## Деплой сервиса
GitHub Actions выкладывает только фронт. Сервис — вручную:
```sh
scp server/{whoop,coach}.mjs server/package.json root@72.56.96.233:/opt/sporty-api/ && ssh root@72.56.96.233 'cd /opt/sporty-api && npm install --omit=dev && systemctl restart sporty-api'
```
Логи: `ssh root@72.56.96.233 journalctl -u sporty-api -f`. Локально: `node server/whoop.mjs` + `npm run dev` (vite проксирует `/api`).

## Ключ Anthropic
Ключ создан в platform.claude.com 18.11.2026 **со сроком 30 дней — истекает 18.12.2026**. До этого заменить на бессрочный: новый ключ → `ANTHROPIC_API_KEY=` в `/etc/sporty/whoop.env` → `systemctl restart sporty-api`. Без ключа тренер выключается, работают правила v1.
