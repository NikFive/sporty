# server/ — Sporty API (WHOOP)

Маленький Node-сервис без зависимостей: OAuth WHOOP + сводка «на сегодня» для PWA.
Живёт на той же машине, что и сайт; nginx проксирует `/api/` → `127.0.0.1:8787`.

| Где | Что |
|---|---|
| `/opt/sporty-api/whoop.mjs` | код (копия `server/whoop.mjs`) |
| `/etc/systemd/system/sporty-api.service` | юнит, пользователь `sporty` |
| `/etc/sporty/whoop.env` | `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `PUBLIC_URL`, `PORT` (0640 root:sporty) |
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
- `POST /api/whoop/disconnect?athlete=` → отзыв доступа в WHOOP и удаление токенов

Доступ без аккаунтов: телефон генерирует случайный device-ключ (localStorage) и передаёт его в `/connect`;
после успешного OAuth сервер разрешает этому ключу читать данные атлета.

## Деплой сервиса
GitHub Actions выкладывает только фронт. Сервис — вручную:
```sh
scp server/whoop.mjs root@72.56.96.233:/opt/sporty-api/whoop.mjs && ssh root@72.56.96.233 systemctl restart sporty-api
```
Логи: `ssh root@72.56.96.233 journalctl -u sporty-api -f`. Локально: `node server/whoop.mjs` + `npm run dev` (vite проксирует `/api`).
