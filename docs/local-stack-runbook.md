# Local Stack Runbook

Операционная инструкция для команды при запуске единого локального стенда на PostgreSQL.

Проект работает на едином Prisma-рантайме: отдельного «пилотного» контура и оверлея больше нет — базовый `docker-compose.yml` поднимает весь стек на Postgres. См. план перехода: [Prisma-only runtime plan](superpowers/plans/2026-07-15-prisma-only-runtime-plan.md).

## 1. Prerequisites

- Docker Desktop / Docker Compose v2
- Node.js 20+
- PostgreSQL доступен на `127.0.0.1:56432` (через compose) или локально на `:5432` для bootstrap с хоста
- Переменные окружения (можно задать в shell или `backend/.env`):

| Переменная | Назначение | Значение по умолчанию |
| --- | --- | --- |
| `BOOTSTRAP_OPERATOR_EMAIL` | email оператора локального стенда | `operator@local-client.test` |
| `BOOTSTRAP_OPERATOR_PASSWORD` | пароль оператора | `Local-Operator-2026!` |
| `DEMO_SERVICE_ADMIN_KEY` | service-admin ключ (staging) | **не** `dev-service-admin-key` |
| `DATABASE_URL` | Postgres для bootstrap с хоста | см. `backend/.env.example` |
| `PUBLIC_WEBHOOK_BASE_URL` | публичный URL API для webhook-инструкций | `https://<your-host>` |
| `TELEGRAM_WEBHOOK_ENABLED` | приём webhook в API Gateway | `true` |
| `TELEGRAM_POLLING_ENABLED` | получение входящих сообщений без публичного webhook | `true` |
| `TELEGRAM_POLLING_INTERVAL_MS` | период опроса Telegram Bot API | `5000` |
| `OUTBOX_TELEGRAM_ENABLED` | исходящая доставка в Telegram | `true` + worker |

Все репозитории рантайма работают на Prisma безусловно (`RUNTIME_PROFILE=production-like` в compose); отдельного `*_REPOSITORY`-переключателя на JSON для стенда больше нет. S3/MinIO credentials берутся из базового `docker-compose.yml`.

## 2. Поднятие стенда

Базовый compose уже включает Prisma-репозитории, Redis fan-out для realtime и одноразовый `bootstrap`-сервис:

```bash
docker compose up -d --build
```

Сервис `bootstrap` (`npm run bootstrap:local`) автоматически выполняет миграции и seed до старта API Gateway. Отдельный ручной bootstrap для обычного запуска не нужен.

Для намеренного пересоздания фиксированного локального аккаунта и ротации его stage API key выполните:

```bash
docker compose run --rm bootstrap
```

Bootstrap создаёт tenant `tenant-local-001`, оператора и stage public API key. Полный ключ печатается **один раз** в stderr; в stdout — JSON `{ tenantId, operatorEmail, publicApiKeyPrefix }`. Команда сбрасывает пароль фиксированного локального оператора к `BOOTSTRAP_OPERATOR_PASSWORD`, поэтому не запускайте её во время ручной сессии без необходимости.

Проверка health (через frontend proxy на `:8080`):

```bash
curl -s http://127.0.0.1:8080/api/v1/health
curl -s http://127.0.0.1:8080/api/v1/ready
```

Прямой доступ к API Gateway (если нужен): `http://127.0.0.1:4101/api/v1/health`.

### Вход оператора в локальном контуре

1. Откройте `http://127.0.0.1:8080` и войдите с существующим tenant-аккаунтом либо с bootstrap-аккаунтом `operator@local-client.test` / `Local-Operator-2026!`.
2. После проверки пароля API отправит случайный шестизначный код. Фиксированный код `123456` больше не используется в staging.
3. Откройте Mailpit на `http://127.0.0.1:18025`, найдите последнее письмо для email аккаунта и введите код до истечения десятиминутного срока.
4. На экране подтверждения при запуске через `localhost` или `127.0.0.1` доступна команда **Открыть тестовую почту**.

Такой flow сохраняет production-поведение MFA, но не требует доступа к реальному внешнему почтовому ящику во время разработки. Для автоматических проверок используйте `npm run test:pilot-smoke`: тест сам находит письмо по получателю и идентификатору challenge, не выводя OTP в лог.

## 3. Создание tenant клиента

**Вариант A — автоматический bootstrap compose** (фиксированный локальный tenant, рекомендуется для быстрого старта):

```bash
docker compose up -d --build
```

Локальный стенд использует `telegram-polling-worker`, потому что адреса `127.0.0.1` и `localhost` недоступны серверам Telegram для webhook-доставки. На публичном стенде можно использовать webhook, но одновременно должен быть активен только один способ получения обновлений для одного бота.

Результат: tenant `tenant-local-001`, operator credential и stage SDK key. Сохраните ключ из stderr.

**Вариант B — onboarding UI**:

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
- Рекомендуемый `apiBase` через frontend proxy: `http://127.0.0.1:8080/api/v1`
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

6. Для **исходящих** ответов оператора запустите outbox worker (токен берётся из Prisma-репозитория интеграций по tenant):

```bash
cd backend
OUTBOX_TELEGRAM_ENABLED=true \
npm run outbox:worker:once
```

В production worker должен работать постоянно (`start:outbox-bullmq-worker` или аналог).

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
- [ ] Выполнен `npm run bootstrap:local` (или сервис `bootstrap` в compose), сохранены `operator` credentials и публичный API key
- [ ] После обновления со статусами операторов выполнен повторный `npm run prisma:seed` (добавляет действия ролей `presence.write`/`presence.read`), операторы перелогинились и `PUT /api/v1/presence/me` отвечает `ok`
- [ ] Оператор успешно логинится через `POST /api/v1/auth/tenant/login`
- [ ] Виджет на клиентской странице отправляет тестовое сообщение
- [ ] Диалог появляется у оператора в inbox не позднее 3 секунд
- [ ] Reply оператора возвращается в виджет через poll не позднее 10 секунд
- [ ] (опционально) Telegram: сообщение боту → inbox; reply оператора → чат в Telegram
- [ ] `npm run test:pilot-smoke` проходит без skip и внешнего public API key
- [ ] После restart API диалог и сообщения сохраняются (PostgreSQL persistence)
- [ ] Канал поддержки знает owner'а релиза и контакт on-call

## 6. Rollback

Порядок отката при инциденте:

1. Приостановить tenant в service-admin (`tenant status = suspended`) или заблокировать public key.
2. Остановить стенд:

```bash
docker compose down
```

3. Если нужен быстрый возврат на предыдущий образ/конфиг, поднять стек из предыдущего git-тега/образа.
4. Данные диалогов остаются в volume `postgres-data`; удалять volume только при осознанном destructive rollback.
5. После стабилизации выполнить smoke-проверку (`health`, `ready`, login, test dialog) и зафиксировать incident note.

## 7. Known limitations

- Web SDK + **Telegram** (без VK/MAX)
- Виджет получает ответы через poll, не push
- Telegram: исходящая доставка требует работающего outbox worker с `OUTBOX_TELEGRAM_ENABLED=true`
- Realtime inbox оператора через SSE, но для production нужен отдельный hardening токен/сессия
- MFA для операторов обязательна на staging: код генерируется для каждого challenge, хранится только как HMAC и доставляется через SMTP в Mailpit (`http://127.0.0.1:18025`)
- Базовые отчеты по диалогам и отчет по назначениям/передачам используют данные PostgreSQL; исторические разрезы по темам, статусам, rescue и CSAT еще не завершены.
- Разделы ботов и proactive требуют отдельной проверки каждого сценария перед использованием на реальном трафике.

## 8. Support

- План перехода на единый Prisma-рантайм: [2026-07-15-prisma-only-runtime-plan.md](superpowers/plans/2026-07-15-prisma-only-runtime-plan.md)
- Исторический план первого клиента (архив): [2026-07-01-first-client-pilot.md](superpowers/plans/2026-07-01-first-client-pilot.md)
- API примеры SDK: [backend/docs/public-api-examples.md](../backend/docs/public-api-examples.md)
- Виджет и демо: `packages/web-widget/`
- Smoke и E2E тесты: `tests/pilot-smoke.test.js`, `tests/pilot-flow.spec.js`
- Эскалация инцидентов: on-call backend + on-call frontend + owner релиза (назначается в launch-day checklist)
