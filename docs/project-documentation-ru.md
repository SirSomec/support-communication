# Документация проекта Support Communication

Документ описывает backend-часть, базу данных и API проекта простым языком. Он рассчитан на двух читателей:

- технический специалист сможет понять границы сервисов, точки API и таблицы;
- нетехнический читатель сможет понять, за какую часть продукта отвечает каждый блок.

## 1. Что делает система

Support Communication - платформа для клиентской поддержки. Она принимает обращения клиентов из разных каналов, показывает их операторам, помогает маршрутизировать диалоги, подключает ботов, хранит историю, считает качество работы, управляет тарифами и дает администраторам инструменты контроля.

Простыми словами: это "центр управления поддержкой", где компания видит клиентов, переписки, сотрудников, настройки, отчеты, интеграции и техническое состояние платформы.

## 2. Основные понятия

| Понятие | Простое объяснение | Техническое значение |
| --- | --- | --- |
| Тенант | Отдельная компания-клиент, которая пользуется платформой | `tenantId`, запись в `tenants`, изоляция данных по клиенту платформы |
| Оператор | Сотрудник компании, который отвечает клиентам | tenant operator session, права через роли и permissions |
| Service-admin | Внутренний администратор платформы | отдельная сессия, MFA, расширенные права, аудит действий |
| Диалог | Переписка клиента с поддержкой | `conversations`, `conversation_messages` |
| Канал | Источник общения: виджет, Telegram, VK, MAX и т.п. | channel connectors, webhooks, outbound descriptors |
| Outbox | Очередь надежной отправки событий | `outbox_events`, worker, retry/dead-letter |
| Envelope | Единый формат ответа API | поля `service`, `operation`, `status`, `traceId`, `data`, `error` |

## 3. Как проект реально запускается

Проект сейчас устроен как монорепозиторий:

| Компонент | Где находится | Роль |
| --- | --- | --- |
| Frontend | `src/` | React/Vite-интерфейс операторов, администраторов и настроек |
| Web widget | `packages/web-widget/` | Встраиваемый клиентский виджет для сайта |
| API Gateway | `backend/apps/api-gateway/` | Основное HTTP API, внутри которого подключены доменные модули |
| Outbox worker | `backend/apps/outbox-worker/` | Фоновая обработка очередей: отправка событий, биллинг-синхронизация, проверка файлов |
| Shared packages | `backend/packages/*` | Общие библиотеки: конфиг, база, envelope, события, observability, redaction |
| PostgreSQL | `backend/prisma/schema.prisma` | Основное долговременное хранилище |
| Redis | Docker/runtime config | Fan-out realtime и BullMQ-режим воркеров |
| MinIO/S3 | Docker/runtime config | Хранилище файлов и экспортов |
| Mailpit | Docker/runtime config | Локальная почта для разработки |

Важно: в коде есть логические "сервисы" вроде `billing-service`, `conversation-service`, `routing-sla-service`. Сейчас большинство из них не запускаются как отдельные процессы. Они реализованы как модули внутри `api-gateway`, а таблицы уже спроектированы так, чтобы в будущем сервисы можно было разделять.

## 4. Работа сервисов

### 4.1. `api-gateway`

`api-gateway` - входная точка для HTTP API. Он принимает запросы от frontend, web widget, внешних webhooks и внутренних инструментов.

Что делает:

- подключает все доменные модули через `AppModule`;
- добавляет общий префикс API: `/api/v1`;
- отдает health/readiness endpoints;
- включает OpenAPI/Swagger по `/api/docs`;
- оборачивает ошибки в единый envelope;
- добавляет trace id к запросам;
- на старте выбирает, какие репозитории использовать: JSON-файлы или Prisma/PostgreSQL.

Простое объяснение: это главный ресепшн системы. Он принимает запрос, проверяет доступ, передает его нужному внутреннему отделу и возвращает результат в едином формате.

### 4.2. `identity`, `auth-service`, `tenant-service`, `rbac-service`

Эти части отвечают за вход, пользователей, компании и права доступа.

Что делает:

- вход service-admin через `POST /api/v1/auth/login`;
- вход оператора тенанта через `POST /api/v1/auth/tenant/login`;
- проверка состояния сессии;
- выход из системы;
- принятие приглашений;
- восстановление доступа;
- OIDC/SAML flows;
- список тенантов и изменение статуса тенанта;
- provisioning нового тенанта;
- модель прав и проверка permissions;
- управление сотрудниками, ролями, группами и правилами в настройках.

Простое объяснение: этот блок решает, кто зашел в систему, к какой компании он относится и что ему разрешено делать.

### 4.3. `conversation-service` и realtime

Отвечает за диалоги, сообщения, события каналов и realtime-обновления.

Что делает:

- показывает список диалогов;
- открывает карточку конкретного диалога;
- меняет статус диалога;
- добавляет сообщения;
- создает исходящие обращения;
- принимает входящие события от каналов;
- принимает delivery receipts;
- отдает realtime events через HTTP и SSE;
- поддерживает WebSocket replay на уровне HTTP server.

Простое объяснение: это центр переписки. Он хранит, кто написал, что ответил оператор, в каком статусе обращение и какие обновления надо показать в интерфейсе без перезагрузки страницы.

### 4.4. `workspace`, `file-service`, `client-profile-service`, `template-knowledge-service`

Отвечает за рабочее пространство оператора: темы, клиенты, шаблоны, база знаний и файлы.

Что делает:

- ведет справочник тем обращений;
- показывает и объединяет профили клиентов;
- хранит шаблоны ответов;
- хранит статьи базы знаний и черновики;
- выдает upload/download policies для файлов;
- фиксирует результат антивирусной проверки файла;
- блокирует скачивание файла, пока он не признан безопасным.

Простое объяснение: это библиотека и картотека поддержки. В ней лежат карточки клиентов, готовые ответы, статьи для операторов и вложения.

### 4.5. `integration-webhook-service` и публичный SDK API

Отвечает за внешние подключения: каналы, публичные ключи, SDK и webhooks.

Что делает:

- управляет подключениями каналов;
- проверяет возможности каналов;
- тестирует подключения;
- ведет события каналов;
- ротирует публичные API-ключи;
- принимает сообщения из SDK;
- отдает сообщения SDK-диалога;
- принимает Telegram webhook;
- содержит проверку подписанных webhooks с защитой от повтора nonce; в текущем `api-gateway` явно опубликованный webhook-контроллер есть для Telegram, а signed webhook logic оформлена как route helper и покрыта контрактными тестами.

Простое объяснение: это шлюз наружу. Через него сайт, мессенджеры и внешние системы безопасно передают сообщения в платформу.

### 4.6. `routing-sla-service`

Отвечает за распределение обращений между операторами и соблюдение SLA.

Что делает:

- показывает нагрузку операторов;
- создает назначения;
- симулирует назначение до применения;
- ставит SLA на паузу;
- запускает и завершает rescue-процессы;
- формирует отчеты по rescue.

Простое объяснение: это диспетчер. Он помогает понять, кому отдать обращение, не перегружен ли оператор и не нарушается ли срок ответа.

### 4.7. `automation-bot-service`

Отвечает за ботов, сценарии и проактивные сообщения.

Что делает:

- показывает workspace автоматизации;
- валидирует bot flow;
- создает и обновляет bot scenarios;
- публикует сценарии;
- запускает тестовые прогоны;
- создает proactive rules;
- фиксирует handoff от бота к человеку.

Простое объяснение: это блок автоматических помощников. Он проверяет сценарии бота, публикует их и передает диалог оператору, если бот не справился.

### 4.8. `quality-ai-service`

Отвечает за оценку качества диалогов и AI scoring.

Что делает:

- показывает workspace качества;
- оценивает черновики сообщений;
- сохраняет оценки;
- создает ручные QA-проверки;
- хранит аудит AI scoring.

Простое объяснение: это контроль качества. Он помогает понять, насколько хорошо оператор или бот ответил клиенту.

### 4.9. `report-service`

Отвечает за отчеты, экспорт и шаблоны отчетов.

Что делает:

- показывает workspace отчетности;
- создает export jobs;
- создает и читает шаблоны отчетов;
- повторяет экспорт;
- выдает descriptor файла экспорта.

Простое объяснение: это генератор отчетов. Он готовит выгрузки и сохраняет настройки отчетов, чтобы их можно было запускать повторно.

### 4.10. `billing-service`

Отвечает за тарифы, подписки, счета, квоты и синхронизацию с платежным провайдером.

Что делает:

- показывает тарифы;
- считает preview смены тарифа;
- меняет тариф тенанта;
- показывает подписку и счета;
- запускает provider sync;
- проверяет квоты;
- резервирует квоту и подтверждает или освобождает резерв;
- ведет платежные retry/dunning состояния;
- хранит юридические лица и налоговые документы.

Простое объяснение: это финансовый блок. Он знает, на каком тарифе клиент, сколько он использует, можно ли дать ему еще ресурс и что происходит с оплатой.

### 4.11. `platform-admin-service` и `service-admin`

Отвечает за внутреннее администрирование платформы и аудит privileged-действий.

Что делает:

- показывает support users;
- сбрасывает MFA;
- принудительно завершает сессии;
- блокирует и разблокирует пользователей;
- запускает impersonation;
- управляет break-glass approvals;
- показывает audit events;
- создает экспорт audit events;
- добавляет redaction overlays для audit events.

Простое объяснение: это панель внутренней поддержки платформы. Она дает администраторам сильные инструменты, поэтому каждое важное действие записывается в аудит.

### 4.12. `platform-monitoring-service`

Отвечает за техническое состояние платформы.

Что делает:

- показывает snapshot платформы;
- показывает состояние компонента;
- принимает acknowledgement алерта;
- принимает telemetry samples;
- записывает health rollups;
- управляет alert routing rules.

Простое объяснение: это мониторинг. Он показывает, какие части системы работают нормально, где есть сбои и куда отправлять оповещения.

### 4.13. `incident-service`

Отвечает за инциденты и обновления по ним.

Что делает:

- показывает список инцидентов;
- показывает карточку инцидента;
- добавляет update к инциденту.

Простое объяснение: это журнал аварий и важных технических событий.

### 4.14. `feature-flag-service`

Отвечает за включение и проверку функций по правилам.

Что делает:

- показывает feature flags;
- preview rollout для конкретного флага;
- обновляет флаг;
- запускает internal tests.

Простое объяснение: это переключатели функций. Они позволяют включать новую возможность не всем сразу, а по клиентам, процентам или условиям.

### 4.15. `notification-service`

Отвечает за уведомления пользователей.

Что делает:

- отдает список уведомлений;
- помечает уведомления прочитанными;
- использует tenant/user контекст для операторов.

Простое объяснение: это центр уведомлений в интерфейсе.

### 4.16. `operations-service`

Отвечает за эксплуатационные проверки и служебные операции.

Что делает:

- показывает readiness status;
- ставит load test run в очередь;
- запускает restore checks;
- показывает dead-letter messages;
- переигрывает dead-letter message;
- проверяет rollback миграции;
- показывает security review.

Простое объяснение: это инструменты инженеров эксплуатации. Они помогают проверять, что система готова к релизу, восстановлению и аварийным ситуациям.

### 4.17. `outbox-worker`, `billing-sync-worker`, `file-scan-scanner-worker`

Это отдельный backend-процесс для фоновой работы.

Режимы:

- `outbox-worker` - обрабатывает `outbox_events`;
- `billing-sync-worker` - обрабатывает `billing_sync_jobs`;
- `file-scan-scanner-worker` - забирает задания проверки файлов;
- BullMQ-режим - запускает обработку через Redis/BullMQ;
- `--once` - один ограниченный проход, удобен для smoke-проверок.

Простое объяснение: это курьерская служба системы. API быстро записывает задачу в очередь, а воркер позже надежно доставляет сообщение, синхронизирует биллинг или проверяет файл.

## 5. База данных

Основная схема описана в `backend/prisma/schema.prisma`. Физическая база - PostgreSQL. Часть runtime-репозиториев еще может работать через JSON-хранилища в локальном режиме, но таблицы уже заданы для production-like хранения.

### 5.1. Общие правила владения таблицами

- У каждой таблицы есть один сервис-владелец.
- Сервис не должен напрямую читать таблицы другого сервиса.
- Обмен между сервисами должен идти через API, события или read models.
- Аудит и outbox используются для надежности и расследования инцидентов.

### 5.2. Таблицы identity, tenant и RBAC

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `tenants` | Компании-клиенты платформы |
| `tenant_users` | Пользователи внутри компаний-клиентов |
| `tenant_audit_events` | История важных действий по тенанту |
| `permission_roles` | Роли и наборы действий, которые разрешены роли |
| `rbac_policy_versions` | Версии политики доступа |
| `rbac_role_grants` | Конкретные разрешения роли в рамках политики |
| `permission_denial_events` | Записи о запретах доступа |
| `mfa_challenges` | Проверки второго фактора |
| `service_admin_sessions` | Сессии внутренних администраторов |
| `service_admin_token_pairs` | Пары access/refresh token для service-admin |
| `service_admin_token_rotations` | История ротации токенов |
| `service_admin_token_revocations` | Отзыв токенов |
| `password_credentials` | Парольные учетные данные |
| `password_policies` | Правила паролей |
| `credential_audit_events` | Аудит действий с учетными данными |
| `oidc_provider_configs` | Настройки OIDC-провайдеров |
| `oidc_callback_descriptors` | Данные callback для OIDC-login |
| `saml_provider_metadata` | Метаданные SAML-провайдеров |
| `saml_acs_request_descriptors` | SAML ACS-запросы |
| `saml_assertion_replays` | Защита от повторного использования SAML assertion |

### 5.3. Таблицы service-admin и platform-admin

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `service_admin_audit_events` | Неизменяемый журнал действий внутренних администраторов |
| `service_admin_audit_exports` | Запросы на выгрузку audit-журнала |
| `service_admin_audit_redactions` | Маскировка чувствительных данных в audit-выгрузках |
| `service_admin_impersonations` | Сессии входа администратора от имени клиента/пользователя |
| `break_glass_approvals` | Одобрения аварийного доступа |

### 5.4. Таблицы billing

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `billing_tenant_states` | Текущий тариф, использование и финансовое состояние тенанта |
| `billing_sync_jobs` | Задачи синхронизации с платежным провайдером |
| `billing_quota_ledger_entries` | История решений по квотам |
| `billing_quota_reservations` | Временные резервы квоты до подтверждения |
| `billing_subscriptions` | Подписки у платежного провайдера |
| `billing_invoices` | Счета |
| `billing_provider_sync_events` | События синхронизации с платежным провайдером |
| `billing_payment_retry_schedules` | Расписание повторных попыток оплаты |
| `billing_payment_dunning_states` | Состояние просроченных оплат и напоминаний |
| `billing_reconciliation_conflicts` | Конфликты сверки платежных данных |
| `billing_payment_retry_keys` | Ключи идемпотентности повторных платежных операций |
| `billing_approvals` | Согласования биллинговых действий |
| `billing_legal_entities` | Юридические лица клиента |
| `billing_tax_documents` | Налоговые документы |

### 5.5. Таблицы диалогов, сообщений и каналов

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `conversations` | Диалоги с клиентами |
| `conversation_messages` | Сообщения внутри диалогов |
| `conversation_inbound_events` | Входящие события от каналов |
| `conversation_outbound_descriptors` | Описания исходящих отправок |
| `conversation_realtime_events` | События для realtime-обновлений интерфейса |
| `channel_delivery_receipts` | Подтверждения доставки/прочтения от каналов |

### 5.6. Таблицы workspace, файлов, клиентов, шаблонов и базы знаний

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `workspace_files` | Метаданные загруженных файлов |
| `workspace_file_scan_result_idempotency` | Защита от повторной записи результата проверки файла |
| `client_profiles` | Карточки клиентов |
| `client_merge_events` | История объединения клиентских профилей |
| `client_merge_conflicts` | Конфликты при объединении профилей |
| `template_records` | Шаблоны ответов |
| `template_versions` | Версии шаблонов |
| `template_audit_events` | Аудит изменений шаблонов |
| `knowledge_articles` | Статьи базы знаний |
| `knowledge_draft_versions` | Черновики статей |
| `knowledge_approval_decisions` | Решения по публикации/одобрению статей |

### 5.7. Таблицы routing и SLA

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `routing_rules` | Правила маршрутизации обращений |
| `queue_memberships` | Принадлежность операторов к очередям |
| `operator_capacities` | Доступная емкость операторов |
| `routing_analytics_rows` | Данные для аналитики маршрутизации |

### 5.8. Таблицы отчетности

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `metric_definitions` | Описания метрик |
| `metric_versions` | Версии метрик |
| `metric_tenant_overrides` | Переопределения метрик для конкретного тенанта |
| `saved_report_templates` | Сохраненные шаблоны отчетов |
| `report_export_jobs` | Задания на экспорт отчетов |
| `report_idempotency_keys` | Защита от повторного запуска одного и того же экспорта |

### 5.9. Таблицы интеграций и webhooks

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `public_api_keys` | Публичные API-ключи клиентов |
| `public_api_key_reveal_states` | Состояние одноразового показа ключа |
| `public_api_key_rotation_audit_events` | Аудит ротации ключей |
| `signed_webhook_replay_nonces` | Защита подписанных webhooks от повтора |
| `webhook_delivery_journal` | Журнал доставки webhook-событий |

### 5.10. Таблицы автоматизации и ботов

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `bot_scenarios` | Сценарии ботов |
| `bot_scenario_versions` | Версии сценариев |
| `bot_publish_audit_events` | Аудит публикации ботов |
| `proactive_execution_windows` | Окна времени для проактивных сообщений |
| `proactive_frequency_caps` | Ограничения частоты проактивных сообщений |
| `proactive_experiment_assignments` | Распределение клиентов по вариантам эксперимента |

### 5.11. Таблицы качества и AI scoring

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `quality_ratings` | Оценки качества диалогов |
| `manual_qa_reviews` | Ручные проверки качества |
| `ai_scoring_audits` | Аудит AI-оценок |

### 5.12. Таблицы платформы, мониторинга, флагов и уведомлений

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `platform_telemetry_samples` | Сырые измерения технических метрик |
| `platform_health_rollups` | Сводки здоровья компонентов за период |
| `platform_alert_routing_rules` | Правила отправки алертов |
| `feature_flag_rules` | Правила включения функций |
| `platform_audit_rows` | Аудит платформенных изменений |
| `platform_outbox_rows` | Очередь платформенных событий |

### 5.13. Таблицы операций и outbox

| Таблица | Для чего нужна простыми словами |
| --- | --- |
| `operations_postgres_restore_check_results` | Результаты проверки восстановления PostgreSQL |
| `operations_object_storage_restore_check_results` | Результаты проверки восстановления объектного хранилища |
| `outbox_events` | Универсальная очередь надежных событий |

## 6. Как работает API

### 6.1. Общие правила

Базовый префикс runtime API: `/api/v1`.

Swagger/OpenAPI доступен по `/api/docs`.

Большинство ответов возвращаются в envelope:

```json
{
  "service": "conversationService",
  "operation": "fetchDialogs",
  "status": "ok",
  "partial": false,
  "traceId": "trc_conversationService_fetchDialogs_...",
  "updatedAt": "2026-07-02T00:00:00.000Z",
  "states": {
    "loading": false,
    "empty": false,
    "error": false,
    "partial": false
  },
  "meta": {},
  "data": {},
  "error": null
}
```

Простое объяснение: `traceId` - номер обращения в техподдержку для инженеров. Если запрос сломался, по нему проще найти логи.

### 6.2. Авторизация

| Тип доступа | Как используется |
| --- | --- |
| Tenant operator | Оператор входит через `/auth/tenant/login`, дальше frontend отправляет `Authorization: Bearer <tenant-access-token>` |
| Service-admin | Внутренний администратор входит через `/auth/login`, дальше отправляет `Authorization: Bearer <service-admin-token>` |
| Public API key | SDK и внешние клиенты отправляют `Authorization: Bearer sk_test_...` или `sk_live_...` |
| Signed webhook | Внешний webhook подписывает тело HMAC и передает timestamp/nonce/signature |

Для изменяющих операций часто используется заголовок `idempotency-key`. Он нужен, чтобы повтор запроса из-за сетевой ошибки не создал вторую одинаковую операцию.

## 7. Основные API endpoints

Ниже перечислены текущие endpoints из контроллеров `api-gateway`.

### 7.1. Health

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/health` | Проверить, что API Gateway жив |
| GET | `/api/v1/ready` | Проверить, что API Gateway готов принимать запросы |

### 7.2. Auth, tenants, permissions, settings

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/auth/state` | Состояние service-admin сессии |
| POST | `/api/v1/auth/login` | Вход service-admin |
| POST | `/api/v1/auth/tenant/login` | Вход оператора тенанта |
| GET | `/api/v1/auth/tenant/state` | Проверка сессии оператора |
| POST | `/api/v1/auth/tenant/logout` | Выход оператора |
| POST | `/api/v1/auth/tenant/select` | Выбор тенанта |
| POST | `/api/v1/auth/invites/accept` | Принять приглашение |
| POST | `/api/v1/auth/recovery/request` | Запросить восстановление доступа |
| POST | `/api/v1/auth/recovery/complete` | Завершить восстановление доступа |
| POST | `/api/v1/auth/oidc/start` | Начать OIDC-login |
| GET | `/api/v1/auth/oidc/callback` | Callback OIDC |
| POST | `/api/v1/auth/saml/acs` | SAML ACS endpoint |
| POST | `/api/v1/auth/logout` | Выход service-admin |
| GET | `/api/v1/tenants` | Список тенантов |
| GET | `/api/v1/tenants/:tenantId` | Детали тенанта |
| PATCH | `/api/v1/tenants/:tenantId/status` | Изменить статус тенанта |
| POST | `/api/v1/tenants/provision` | Создать нового тенанта |
| POST | `/api/v1/permissions/validate` | Проверить право |
| GET | `/api/v1/permissions/model` | Получить модель прав |
| GET | `/api/v1/settings/employees` | Сотрудники в настройках |
| POST | `/api/v1/settings/employees/invites` | Пригласить сотрудника |
| PATCH | `/api/v1/settings/employees/:employeeId` | Обновить сотрудника |
| POST | `/api/v1/settings/employees/:employeeId/password-reset` | Сбросить пароль |
| POST | `/api/v1/settings/employees/:employeeId/mfa-reset` | Сбросить MFA |
| POST | `/api/v1/settings/employees/:employeeId/deactivate` | Деактивировать сотрудника |
| GET | `/api/v1/settings/roles` | Список ролей |
| GET | `/api/v1/settings/groups` | Список групп |
| POST | `/api/v1/settings/groups` | Создать группу |
| PATCH | `/api/v1/settings/groups/:groupId` | Обновить группу |
| GET | `/api/v1/settings/rules` | Список правил |
| PATCH | `/api/v1/settings/rules/:ruleId` | Обновить правило |
| POST | `/api/v1/settings/rules/:ruleId/test` | Проверить правило |

### 7.3. Dialogs, channels, realtime

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/dialogs` | Список диалогов |
| GET | `/api/v1/dialogs/assignees` | Активные сотрудники организации, которым можно назначить диалог |
| POST | `/api/v1/dialogs/attachments` | Создать вложение для диалога |
| POST | `/api/v1/dialogs/outbound` | Начать исходящий диалог |
| GET | `/api/v1/dialogs/:conversationId` | Детали диалога |
| PATCH | `/api/v1/dialogs/:conversationId/assignment` | Назначить или передать диалог и записать фактическое событие для отчета |
| PATCH | `/api/v1/dialogs/:conversationId/status` | Изменить статус диалога |
| POST | `/api/v1/dialogs/:conversationId/messages` | Добавить сообщение |
| GET | `/api/v1/channels` | Список каналов |
| POST | `/api/v1/channels/:channel/inbound` | Входящее событие канала |
| POST | `/api/v1/channels/:channel/delivery-receipts` | Подтверждения доставки |
| GET | `/api/v1/realtime/events` | Получить realtime events |
| SSE | `/api/v1/realtime/events/stream` | Поток realtime events |

### 7.4. Workspace: topics, clients, files, templates, knowledge

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/workspace/topics` | Список тем |
| POST | `/api/v1/workspace/topics` | Создать тему |
| PATCH | `/api/v1/workspace/topics/:topicId` | Обновить тему |
| POST | `/api/v1/workspace/topics/:topicId/archive` | Архивировать тему |
| POST | `/api/v1/workspace/topics/:topicId/restore` | Восстановить тему |
| GET | `/api/v1/workspace/topics/:topicId/usage` | Использование темы |
| GET | `/api/v1/clients` | Список клиентов |
| POST | `/api/v1/clients/merge` | Объединить клиентов |
| POST | `/api/v1/clients/unmerge` | Отменить объединение |
| POST | `/api/v1/files/uploads` | Запросить upload policy |
| POST | `/api/v1/files/:fileId/finalize` | Завершить загрузку файла |
| POST | `/api/v1/files/:fileId/scan-result` | Записать результат проверки файла |
| GET | `/api/v1/files/:fileId/download-policy` | Получить download policy |
| GET | `/api/v1/templates` | Список шаблонов |
| POST | `/api/v1/templates` | Создать шаблон |
| GET | `/api/v1/knowledge` | Список статей |
| GET | `/api/v1/knowledge/:articleId` | Детали статьи |
| POST | `/api/v1/knowledge/:articleId/drafts` | Создать черновик |

### 7.5. Integrations and public API

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/integrations/workspace` | Workspace интеграций |
| GET | `/api/v1/integrations/capabilities` | Возможности интеграций |
| GET | `/api/v1/integrations/channels` | Список channel connections |
| POST | `/api/v1/integrations/channels` | Создать channel connection |
| PATCH | `/api/v1/integrations/channels/:connectionId` | Обновить channel connection |
| DELETE | `/api/v1/integrations/channels/:connectionId` | Удалить channel connection |
| POST | `/api/v1/integrations/channels/:connectionId/test` | Протестировать channel connection |
| GET | `/api/v1/integrations/channels/:connectionId/events` | События channel connection |
| POST | `/api/v1/integrations/channel-tests` | Запустить тест канала |
| POST | `/api/v1/integrations/api-keys/:keyId/rotate` | Ротировать API key |
| POST | `/api/v1/integrations/webhooks/deliveries/:deliveryId/replay` | Повторить доставку webhook |
| POST | `/api/v1/integrations/security/sessions/:sessionId/revoke` | Отозвать security session |
| GET | `/api/v1/integrations/channels/telegram` | Получить Telegram connection |
| POST | `/api/v1/integrations/channels/telegram` | Настроить Telegram connection |
| DELETE | `/api/v1/integrations/channels/telegram` | Удалить Telegram connection |
| POST | `/api/v1/public/sdk/identify` | Идентифицировать клиента через SDK |
| POST | `/api/v1/public/sdk/messages` | Отправить сообщение из SDK |
| GET | `/api/v1/public/sdk/conversations/:conversationId/messages` | Получить сообщения SDK-диалога |
| POST | `/api/v1/webhooks/telegram` | Принять Telegram webhook |

### 7.6. Routing, automation, quality, reports

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/routing/workload` | Нагрузка операторов |
| POST | `/api/v1/routing/assignments` | Создать назначение |
| POST | `/api/v1/routing/assignments/simulate` | Симуляция назначения |
| POST | `/api/v1/routing/sla/pause` | Поставить SLA на паузу |
| POST | `/api/v1/routing/rescue/start` | Запустить rescue |
| POST | `/api/v1/routing/rescue/resolve` | Завершить rescue |
| GET | `/api/v1/routing/reports/rescue` | Отчет по rescue |
| GET | `/api/v1/automation/workspace` | Workspace автоматизации |
| GET | `/api/v1/automation/visitor-workspace` | Workspace посетителей |
| POST | `/api/v1/automation/bot-flow/validate` | Проверить bot flow |
| POST | `/api/v1/automation/bot-flows/validate` | Проверить bot flows |
| POST | `/api/v1/automation/bot-scenarios` | Создать сценарий бота |
| PATCH | `/api/v1/automation/bot-scenarios/:scenarioId` | Обновить сценарий бота |
| POST | `/api/v1/automation/bots/:scenarioId/publish` | Опубликовать бота |
| POST | `/api/v1/automation/bot-scenarios/:scenarioId/publish` | Опубликовать сценарий |
| POST | `/api/v1/automation/bot-scenarios/:scenarioId/test-runs` | Тестовый прогон сценария |
| POST | `/api/v1/automation/proactive-rules` | Создать proactive rule |
| POST | `/api/v1/automation/handoff-events` | Записать handoff event |
| POST | `/api/v1/automation/bot-handoffs` | Записать bot handoff |
| GET | `/api/v1/quality/workspace` | Workspace качества |
| POST | `/api/v1/quality/draft-score` | Оценить черновик |
| POST | `/api/v1/quality/draft-scores` | Оценить несколько черновиков |
| POST | `/api/v1/quality/ratings` | Сохранить оценку качества |
| POST | `/api/v1/quality/manual-reviews` | Создать ручную QA-проверку |
| GET | `/api/v1/reports/workspace` | Workspace отчетов |
| POST | `/api/v1/reports/exports` | Создать export job |
| POST | `/api/v1/reports/templates` | Создать шаблон отчета |
| GET | `/api/v1/reports/templates/:templateId` | Получить шаблон отчета |
| POST | `/api/v1/reports/exports/:jobId/retry` | Повторить экспорт |
| GET | `/api/v1/reports/exports/:jobId/file` | Получить descriptor файла экспорта |

### 7.7. Billing and quotas

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/billing/tariffs` | Список тарифов |
| POST | `/api/v1/billing/tariff-preview` | Preview тарифа |
| POST | `/api/v1/billing/tenants/:tenantId/tariff-change/preview` | Preview смены тарифа |
| POST | `/api/v1/billing/tenants/:tenantId/tariff-change` | Запросить смену тарифа |
| PATCH | `/api/v1/billing/tenants/:tenantId/tariff` | Изменить тариф |
| GET | `/api/v1/billing/tenants/:tenantId/subscription` | Подписка тенанта |
| GET | `/api/v1/billing/tenants/:tenantId/invoices` | Счета тенанта |
| POST | `/api/v1/billing/provider-sync` | Запустить provider sync |
| POST | `/api/v1/billing/quota-checks` | Проверить квоту |
| POST | `/api/v1/billing/reservations` | Создать резерв квоты |
| POST | `/api/v1/billing/reservations/:reservationId/commit` | Подтвердить резерв |
| POST | `/api/v1/billing/reservations/:reservationId/release` | Освободить резерв |
| GET | `/api/v1/quotas/tenants/:tenantId` | Получить квоты тенанта |
| POST | `/api/v1/quotas/check` | Проверить квоту через legacy endpoint |

### 7.8. Service-admin, platform, incidents, flags, notifications, operations

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/service-admin/users` | Список support users |
| POST | `/api/v1/service-admin/users/:userId/2fa-reset` | Сбросить 2FA |
| POST | `/api/v1/service-admin/users/:userId/mfa/reset` | Сбросить MFA |
| POST | `/api/v1/service-admin/users/:userId/force-logout` | Принудительный logout |
| POST | `/api/v1/service-admin/users/:userId/sessions/logout` | Принудительный logout alias |
| POST | `/api/v1/service-admin/users/:userId/block` | Заблокировать пользователя |
| POST | `/api/v1/service-admin/users/:userId/unblock` | Разблокировать пользователя |
| POST | `/api/v1/service-admin/users/:userId/invite/resend` | Повторить приглашение |
| POST | `/api/v1/service-admin/impersonations/start` | Начать impersonation |
| POST | `/api/v1/service-admin/impersonations` | Начать impersonation alias |
| POST | `/api/v1/service-admin/impersonations/:impersonationId/stop` | Остановить impersonation |
| POST | `/api/v1/service-admin/break-glass/approvals` | Запросить break-glass approval |
| POST | `/api/v1/service-admin/break-glass-approvals` | Запросить break-glass approval alias |
| POST | `/api/v1/service-admin/break-glass/approvals/:approvalId/decision` | Решение по approval |
| POST | `/api/v1/service-admin/break-glass-approvals/:approvalId/decision` | Решение по approval alias |
| GET | `/api/v1/service-admin/audit-events` | Audit events |
| POST | `/api/v1/service-admin/audit-events/exports` | Создать audit export |
| POST | `/api/v1/service-admin/audit-events/:eventId/redactions` | Добавить redaction |
| GET | `/api/v1/platform/snapshot` | Snapshot платформы |
| GET | `/api/v1/platform/components/:componentId` | Компонент платформы |
| POST | `/api/v1/platform/components/:componentId/acknowledgements` | Подтвердить алерт |
| POST | `/api/v1/platform/telemetry/samples` | Записать telemetry sample |
| POST | `/api/v1/platform/health-rollups` | Записать health rollup |
| POST | `/api/v1/platform/alert-routing/rules` | Создать alert routing rule |
| GET | `/api/v1/platform-monitoring/snapshot` | Alias snapshot платформы |
| GET | `/api/v1/platform-monitoring/components/:componentId` | Alias компонента |
| POST | `/api/v1/platform-monitoring/components/:componentId/acknowledgements` | Alias acknowledgement |
| POST | `/api/v1/platform-monitoring/telemetry/samples` | Alias telemetry sample |
| POST | `/api/v1/platform-monitoring/health-rollups` | Alias health rollup |
| POST | `/api/v1/platform-monitoring/alert-routing/rules` | Alias alert routing rule |
| GET | `/api/v1/incidents` | Список инцидентов |
| GET | `/api/v1/incidents/:incidentId` | Детали инцидента |
| POST | `/api/v1/incidents/:incidentId/updates` | Добавить update к инциденту |
| GET | `/api/v1/feature-flags` | Список feature flags |
| POST | `/api/v1/feature-flags/:flagId/preview` | Preview флага |
| PATCH | `/api/v1/feature-flags/:flagId` | Обновить флаг |
| POST | `/api/v1/feature-flags/:flagId/internal-tests` | Внутренний тест флага |
| GET | `/api/v1/notifications` | Список уведомлений |
| POST | `/api/v1/notifications/mark-read` | Пометить уведомления прочитанными |
| GET | `/api/v1/operations/readiness` | Readiness операций |
| POST | `/api/v1/operations/load-tests/:scenarioId/runs` | Запустить load test run |
| POST | `/api/v1/operations/backup-drills/:drillId/restore-checks` | Запустить restore check |
| GET | `/api/v1/operations/dead-letter` | Dead-letter queue |
| POST | `/api/v1/operations/dead-letter/:messageId/replay` | Повторить dead-letter message |
| POST | `/api/v1/operations/migrations/:migrationId/rollback-check` | Проверить rollback миграции |
| GET | `/api/v1/operations/security-review` | Security review |

## 8. Типовые сценарии работы

### 8.1. Клиент пишет через виджет

1. Виджет вызывает `POST /api/v1/public/sdk/identify`, чтобы связать посетителя с клиентом.
2. Виджет отправляет сообщение через `POST /api/v1/public/sdk/messages`.
3. `integration-webhook-service` проверяет публичный API key.
4. `conversation-service` создает или обновляет диалог.
5. Оператор видит новое событие через realtime endpoint.

### 8.2. Оператор отвечает клиенту

1. Оператор входит через `POST /api/v1/auth/tenant/login`.
2. Frontend открывает `GET /api/v1/dialogs`.
3. Оператор отправляет сообщение через `POST /api/v1/dialogs/:conversationId/messages`.
4. Система пишет сообщение и создает outbound descriptor.
5. `outbox-worker` доставляет сообщение во внешний канал.

### 8.3. Файл проходит проверку

1. Frontend запрашивает upload policy через `POST /api/v1/files/uploads`.
2. Файл загружается в объектное хранилище.
3. Frontend вызывает `POST /api/v1/files/:fileId/finalize`.
4. Создается outbox-событие на проверку файла.
5. `file-scan-scanner-worker` вызывает сканер.
6. Результат записывается через `POST /api/v1/files/:fileId/scan-result`.
7. Скачивание доступно только если verdict безопасный.

### 8.4. Service-admin выполняет опасное действие

1. Service-admin входит через `/api/v1/auth/login` и проходит MFA.
2. Для действия проверяется конкретное право, например `service-admin.users.write`.
3. Операция выполняется.
4. В audit-таблицу записывается, кто, когда, что сделал и почему.
5. При необходимости audit можно экспортировать или частично замаскировать через redaction overlay.

## 9. Где смотреть исходники

| Что нужно найти | Путь |
| --- | --- |
| Сборка backend-модулей | `backend/apps/api-gateway/src/app.module.ts` |
| Старт API Gateway | `backend/apps/api-gateway/src/main.ts` |
| Контроллеры API | `backend/apps/api-gateway/src/*/*.controller.ts` |
| Публичные webhook route helpers | `backend/apps/api-gateway/src/*/*.route.ts` |
| Prisma-схема | `backend/prisma/schema.prisma` |
| Карта владения таблицами | `backend/docs/database-ownership-map.md` |
| Outbox worker | `backend/apps/outbox-worker/src/main.ts` |
| Общий формат ответа | `backend/packages/envelope/src/index.ts` |
| Runtime config | `docs/runtime-configuration.md` |
