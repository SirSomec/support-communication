# Pilot Runbook — First Client

Операционная инструкция для команды при запуске пилота с первым клиентом.

Связанный план: [First Client Pilot Plan](superpowers/plans/2026-07-01-first-client-pilot.md).

## 1. Prerequisites

- Docker Desktop / Docker Compose v2
- Node.js 20+
- PostgreSQL доступен на `127.0.0.1:56432` (через compose) или локально на `:5432` для bootstrap с хоста
- Переменные окружения (можно задать в shell или `backend/.env`):

| Переменная | Назначение | Значение по умолчанию |
| --- | --- | --- |
| `PILOT_TENANT_SLUG` | slug клиента в metadata tenant | `pilot-client` |
| `PILOT_OPERATOR_EMAIL` | email оператора пилота | `operator@pilot-client.test` |
| `PILOT_OPERATOR_PASSWORD` | пароль оператора | `Pilot-Operator-2026!` |
| `DEMO_SERVICE_ADMIN_KEY` | service-admin ключ (staging) | **не** `dev-service-admin-key` |
| `DATABASE_URL` | Postgres для bootstrap с хоста | см. `backend/.env.example` |
| `INTEGRATION_STORE_FILE` | JSON store для public API key и Telegram | `.runtime/integration-store.json` |
| `PUBLIC_WEBHOOK_BASE_URL` | публичный URL API для webhook-инструкций | `https://<your-host>` |
| `TELEGRAM_WEBHOOK_ENABLED` | приём webhook в API Gateway | `true` в pilot overlay |
| `OUTBOX_TELEGRAM_ENABLED` | исходящая доставка в Telegram | `true` + worker |

Для staging через Docker overlay также нужны S3/MinIO credentials из базового `docker-compose.yml`.

## 2. Поднятие стенда

Pilot overlay переключает `api-gateway` на Prisma-репозитории и включает Redis fan-out для realtime:

```bash
docker compose -f docker-compose.yml -f docker-compose.pilot.yml up -d --build
```

После healthy Postgres выполните bootstrap (с хоста, из каталога `backend`):

```bash
cd backend
npm run pilot:bootstrap
```

Скрипт выполняет `prisma migrate deploy` + seed, создаёт tenant `tenant-pilot-001`, оператора и stage public API key. Полный ключ печатается **один раз** в stderr; в stdout — JSON `{ tenantId, operatorEmail, publicApiKeyPrefix }`.

Проверка health (через frontend proxy на `:8080`):

```bash
curl -s http://127.0.0.1:8080/api/v1/health
curl -s http://127.0.0.1:8080/api/v1/ready
```

Прямой доступ к API Gateway (если нужен): `http://127.0.0.1:4101/api/v1/health`.

## 3. Создание tenant клиента

**Вариант A — bootstrap script** (фиксированный pilot tenant, рекомендуется для Task 1):

```bash
cd backend && npm run pilot:bootstrap
```

Результат: tenant `tenant-pilot-001`, operator credential и stage SDK key. Сохраните ключ из stderr.

**Вариант B — onboarding UI** (после Task 9 плана):

1. Открыть `#/onboarding`
2. Пройти wizard до конца
3. Сохранить выданный `publicApiKey` и embed snippet

## 4. Установка виджета у клиента

Минимальный embed snippet для сайта клиента:

```html
<script src="https://cdn.example.com/support-widget.js"></script>
<script>
  SupportWidget.init({
    apiBase: "https://support.example.com/api/v1",
    publicKey: "sk_test_...",
    externalId: "client-user-123",
    environment: "stage"
  });
</script>
```

Для локального стенда:

- Сборка виджета: `npm run widget:build`
- Локальная demo-страница: `packages/web-widget/demo.html`
- Рекомендуемый `apiBase` для пилота через frontend proxy: `http://127.0.0.1:8080/api/v1`
- Если proxy не используется: `http://127.0.0.1:4101/api/v1`

Проверка после установки:

1. Открыть страницу клиента и убедиться, что видна кнопка чата.
2. Отправить сообщение из виджета.
3. Проверить, что сообщение попало в операторский inbox.
4. Отправить reply оператором и убедиться, что ответ появился в виджете.

## 4.1. Подключение Telegram

Токен бота настраивается **клиентом в личном кабинете**, не через env сервера.

1. Войдите в ЛК как **администратор** организации.
2. Откройте **Настройки → Подключения → Telegram Bot**.
3. Вставьте `Bot Token` от [@BotFather](https://t.me/BotFather) и нажмите **Сохранить токен**.
4. Скопируйте из панели:
   - `Webhook URL` — `https://<your-host>/api/v1/webhooks/telegram`
   - `secret_token` — уникальный секрет вашего tenant
5. Зарегистрируйте webhook (подставьте токен бота и значения из ЛК):

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-host>/api/v1/webhooks/telegram" \
  -d "secret_token=<secret_token_из_ЛК>"
```

6. Для **исходящих** ответов оператора запустите outbox worker (токен берётся из `INTEGRATION_STORE_FILE` по tenant):

```bash
cd backend
OUTBOX_TELEGRAM_ENABLED=true \
INTEGRATION_STORE_FILE=.runtime/integration-store.json \
npm run outbox:worker:once
```

В production worker должен работать постоянно (`start:outbox-bullmq-worker` или аналог) с тем же `INTEGRATION_STORE_FILE`, что и api-gateway.

Проверка:

1. Напишите боту в Telegram.
2. Диалог с `channel: Telegram` и `id = chat_id` появится в inbox оператора.
3. Ответ оператора уйдёт в Telegram после обработки outbox worker.

API для ЛК:

- `GET /api/v1/integrations/channels/telegram` — статус подключения (токен маскируется)
- `POST /api/v1/integrations/channels/telegram` — сохранить `{ "botToken": "..." }`
- `DELETE /api/v1/integrations/channels/telegram` — отключить

Webhook ingress: `POST /api/v1/webhooks/telegram`  
Заголовок: `X-Telegram-Bot-Api-Secret-Token: <secret_token_из_ЛК>`

## 5. Чеклист дня запуска

- [ ] `GET /health` и `GET /ready` возвращают 200
- [ ] Выполнен `npm run pilot:bootstrap`, сохранены `operator` credentials и `PILOT_PUBLIC_API_KEY`
- [ ] Оператор успешно логинится через `POST /api/v1/auth/tenant/login`
- [ ] Виджет на клиентской странице отправляет тестовое сообщение
- [ ] Диалог появляется у оператора в inbox не позднее 3 секунд
- [ ] Reply оператора возвращается в виджет через poll не позднее 10 секунд
- [ ] (опционально) Telegram: сообщение боту → inbox; reply оператора → чат в Telegram
- [ ] `RUN_PILOT_SMOKE=1 PILOT_PUBLIC_API_KEY=... npm run test:pilot-smoke` проходит
- [ ] После restart API диалог и сообщения сохраняются (PostgreSQL persistence)
- [ ] Канал поддержки знает owner'а релиза и контакт on-call

## 6. Rollback

Порядок отката при инциденте:

1. Приостановить tenant в service-admin (`tenant status = suspended`) или заблокировать public key.
2. Выключить pilot overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.pilot.yml down
```

3. Если нужен быстрый возврат на предыдущий образ/конфиг, поднять базовый compose без pilot overlay.
4. Данные диалогов остаются в volume `postgres-data`; удалять volume только при осознанном destructive rollback.
5. После стабилизации выполнить smoke-проверку (`health`, `ready`, login, test dialog) и зафиксировать incident note.

## 7. Known limitations (pilot)

- Web SDK + **Telegram** (без VK/MAX)
- Виджет получает ответы через poll, не push
- Telegram: исходящая доставка требует работающего outbox worker с `OUTBOX_TELEGRAM_ENABLED=true`
- Realtime inbox оператора через SSE, но для production нужен отдельный hardening токен/сессия
- MFA для операторов может быть отключена флагом `PILOT_SKIP_MFA` на staging
- Integration repository в runtime пока JSON (`INTEGRATION_STORE_FILE`); bootstrap дублирует ключ в Prisma для будущей миграции
- Остальные разделы UI (отчёты, боты, proactive) на seed-данных

## 8. Support

- План реализации пилота: [2026-07-01-first-client-pilot.md](superpowers/plans/2026-07-01-first-client-pilot.md)
- API примеры SDK: [backend/docs/public-api-examples.md](../backend/docs/public-api-examples.md)
- Виджет и демо: `packages/web-widget/`
- Smoke и E2E тесты: `tests/pilot-smoke.test.js`, `tests/pilot-flow.spec.js`
- Эскалация инцидентов: on-call backend + on-call frontend + owner пилота (назначается в launch-day checklist)
