# ADR BAI-001: контракт сценариев и AI-консультанта

> **Статус:** принято для реализации.  
> **Дата:** 12 июля 2026.  
> **Область:** API Gateway, runtime, Service Admin, раздел «Боты».  
> **Связанный backlog:** [BAI-001](2026-07-12-bots-ai-agent-execution-guide.md#фаза-a--контракт-и-безопасный-фундамент-p0).  
> **Источник продуктовых решений:** [план продукта](2026-07-12-bots-ai-agent-product-plan.md), [руководство для агентов](2026-07-12-bots-ai-agent-execution-guide.md), [функциональные требования](../../functional-requirements-support-communication-platform.md).

## Решение

Первый релиз — это **консультационный** бот. Детерминированное правило выбирает сценарий, а AI отвечает только по разрешённым источникам. Бот не обращается к CRM клиента и не выполняет внешних write-операций. Все сущности, запросы, кэши и логи обязательно tenant-scoped.

Контракт ниже является целевым публичным контрактом v1. Существующие `flowNodes`/`flowEdges` остаются совместимым внутренним представлением до миграции; новый UI не должен требовать от пользователя JSON или canvas.

## 1. Сценарий и жизненный цикл

### 1.1. Ресурс

`Scenario` содержит как минимум: `id`, `tenantId` (только в ответе), `name`, `channels[]`, `priority`, `status`, `revision`, `triggerRules[]`, `responseMode`, `sourceBindings[]`, `handoffPolicy`, `activeVersionId`, `createdAt`, `updatedAt`, `archivedAt`, `deletedAt`.

`tenantId` никогда не принимается из body или query: он выводится из авторизованного контекста. Ответ другого tenant должен быть неотличим от отсутствующего ресурса (`404 scenario_not_found`).

| Статус | Значение | Допустимые переходы |
| --- | --- | --- |
| `draft` | Непубличный черновик; не запускается в канале. | `published`, `archived` |
| `published` | Есть неизменяемая активная версия; новые диалоги могут запускать сценарий. | `disabled` |
| `disabled` | Сценарий сохранён, но не выбирается для новых диалогов. | `published`, `archived` |
| `archived` | Скрыт из рабочего списка, не запускается и не редактируется. | `disabled`, soft-delete |

Публикация создаёт неизменяемый `ScenarioVersion`. Уже запущенный диалог остаётся закреплён за выбранной версией до завершения или handoff. Отключение немедленно прекращает выбор сценария для **новых** диалогов, но не обрывает закреплённые.

### 1.2. Архивирование, удаление и восстановление

Это три разных понятных действия в UI и API.

| Действие | Endpoint | Предусловие | Результат |
| --- | --- | --- | --- |
| Отключить | `POST /automation/bot-scenarios/{id}/disable` | `published` | статус `disabled`; правило больше не выбирается для новых диалогов |
| Архивировать | `POST /automation/bot-scenarios/{id}/archive` | `draft` или `disabled` | каналы снимаются атомарно, статус `archived`, сохраняются аудит и версии |
| Восстановить архив | `POST /automation/bot-scenarios/{id}/restore` | `archived` | статус `disabled`; повторная публикация — явное действие |
| Удалить | `DELETE /automation/bot-scenarios/{id}` | `archived`, нет активных runtime-инстансов и назначений канала | soft-delete: `deletedAt`, `deletedBy`, `deletionReason`; обычные списки не возвращают ресурс |
| Отменить удаление | `POST /automation/bot-scenarios/{id}/restore-deleted` | запись в retention-окне | возвращает `archived`, поэтому сценарий не включается неожиданно |

Удаление опубликованного или активного сценария возвращает `409 scenario_delete_not_allowed` с машинно-читаемыми `blockingReasons`. Постоянная очистка выполняется только фоновым retention-процессом после срока политики и никогда не удаляет неизменяемый аудит; публичного endpoint физического удаления нет.

### 1.3. Версии и конкурентное редактирование

- Любое изменение черновика увеличивает `revision` и возвращает `ETag: "scenario:{id}:{revision}"`.
- `PATCH` и все lifecycle-команды требуют `If-Match` с последней ревизией; несовпадение даёт `412 scenario_revision_conflict` и текущую ревизию.
- `publish` валидирует снимок, создаёт новую версию и делает её active атомарно. Редактирование опубликованной конфигурации происходит через черновик следующей версии, а не изменением активного snapshot.

## 2. Триггеры и выбор сценария

Поддерживаемые режимы v1: `new_conversation`, `phrase`, `manual`.

| Режим | Конфигурация | Правило |
| --- | --- | --- |
| `new_conversation` | канал, приоритет | только первое сообщение нового диалога |
| `phrase` | одна или несколько фраз, `matchMode`, locale, приоритет | запускается только при детерминированном совпадении входящего текста |
| `manual` | разрешённые роли | запускается оператором/администратором в тесте или в диалоге; не выбирается автоматически |

`matchMode` равен одному из `exact`, `contains`, `tokens`. Перед сравнением текст приводится к Unicode NFC, нижнему регистру и схлопнутым пробелам; исходный текст не перезаписывается. `tokens` сравнивает целые нормализованные слова. Семантическое распознавание намерений не входит в v1.

Выбор всегда выполняется так: tenant → канал → опубликованный сценарий → подходящий trigger → наибольший `priority` → стабильный tie-break по `scenarioId`. Две опубликованные правила с одинаковым каналом, режимом, нормализованной фразой/locale и priority запрещены (`409 trigger_conflict`). При отсутствии совпадения runtime не выбирает «первый опубликованный» сценарий.

## 3. Контракт AI, знаний и источников

### 3.1. Возможности

`responseMode` сценария: `rules` или `grounded_ai`. Для `grounded_ai` при публикации обязательны: включённый tenant feature flag, connection со статусом `ready`/`limited`, capability `chat_completion`, хотя бы один `ready` source binding, валидный handoff policy. Иначе `422 scenario_not_publishable` с `violations[]`.

Возможности AI-подключения задаются явно: `chat_completion`, `embeddings`, `retrieval`. Модель ответа и embedding-модель выбираются независимо. Ключ API принимается только при create/rotate и никогда не входит в response, audit, error или log.

### 3.2. Источники

Поддерживаемые типы: `document`, `url`, `mcp`. У каждого источника есть `status`: `draft`, `ingesting`, `ready`, `failed`, `disabled`, `archived`; в retrieval допускается только `ready`.

- `document` — загруженный и одобренный tenant-документ с версией и checksum;
- `url` — только после server-side allowlist, проверки DNS/IP/redirect, MIME/размера/timeout и аудита;
- `mcp` — только предварительно зарегистрированный Service Admin connector и только явно read-only tool allowlist.

Source binding ограничивает источник tenant, сценарием, каналом, языком и аудиторией **до** retrieval. В AI-запрос передаются только отфильтрованные фрагменты и их citation metadata, а не вся база знаний или transcript. Ответ AI должен включать `citations[]` либо перейти в заданный handoff/fallback при недостаточных источниках.

## 4. Роли и права

| Субъект | Разрешено | Запрещено |
| --- | --- | --- |
| Tenant admin (`automation.read/write`) | CRUD черновиков, тест, publish/disable/archive/restore, привязка готовых источников и очередь handoff в своём tenant | видеть/вводить ключ провайдера, межtenant-данные, write-MCP/CRM |
| Operator (`automation.read`, отдельное `automation.manual-run`) | просмотр, тест и ручной запуск в пределах назначенного tenant | publish, lifecycle, редактирование источников/сценария |
| Service Admin (`service-admin` action) | выбрать tenant, создать/ротировать/тестировать/отключить AI connection, регистрировать разрешённые source connector, feature flags | читать сохранённый секрет, обходить audit или tenant scope |
| Runtime identity | читать только опубликованный snapshot, разрешённые source bindings и connection secret через SecretStore | админские действия, запись в CRM или произвольный network access |

Новые permissions и feature flags реализуются в BAI-002. До их появления контракты не дают неявного доступа: capability/flag отсутствует — действие недоступно.

## 5. OpenAPI-ориентированные операции

Все ответы имеют envelope `{ "status": "ok", "data": ... }` или `{ "status": "invalid", "error": Error }`, чтобы соответствовать текущим automation-сервисам. Новые endpoints документируются декораторами Nest Swagger в `backend/apps/api-gateway/src/openapi.ts` и контроллере; body валидируются DTO/schema до service layer.

| Метод и путь | Назначение | Права |
| --- | --- | --- |
| `GET /automation/bot-scenarios` | список без soft-deleted; фильтры status/channel/responseMode/search | `automation.read` |
| `GET /automation/bot-scenarios/{id}` | карточка и последняя редактируемая ревизия | `automation.read` |
| `POST /automation/bot-scenarios` | создать draft | `automation.write` |
| `PATCH /automation/bot-scenarios/{id}` | изменить draft/следующую ревизию | `automation.write` |
| `POST /automation/bot-scenarios/{id}/publish` | проверить и опубликовать version snapshot | `automation.write` |
| `POST /automation/bot-scenarios/{id}/disable` | прекратить новые запуски | `automation.write` |
| `POST /automation/bot-scenarios/{id}/archive` | снять назначения и скрыть | `automation.write` |
| `POST /automation/bot-scenarios/{id}/restore` | восстановить в disabled | `automation.write` |
| `DELETE /automation/bot-scenarios/{id}` | soft-delete archived сценария | `automation.write` |
| `POST /automation/bot-scenarios/{id}/restore-deleted` | отменить soft-delete до окончания retention | `automation.write` |
| `POST /automation/bot-scenarios/{id}/test-runs` | изолированный test run без production side effects | `automation.read` |

Существующие alias `POST /automation/bots/{id}/publish` поддерживаются только как compatibility route до миграции клиентов и не получают новых возможностей.

## 6. Ошибки и идемпотентность

```json
{
  "status": "invalid",
  "error": {
    "code": "scenario_not_publishable",
    "message": "Scenario cannot be published until its configuration is complete.",
    "details": { "violations": [{ "path": "sourceBindings", "code": "ready_source_required" }] },
    "traceId": "..."
  }
}
```

`message` безопасен для показа пользователю; `details` не содержит secret, raw prompt, чужой tenant ID или внутренний stack trace. Коды: `scenario_not_found` (404), `scenario_revision_conflict` (412), `scenario_invalid_state` (409), `scenario_delete_not_allowed` (409), `trigger_conflict` (409), `scenario_not_publishable` (422), `feature_not_enabled` (403), `ai_connection_not_ready` (422), `source_not_ready` (422), `forbidden` (403), `idempotency_key_reused` (409), `rate_limited` (429).

Все изменяющие состояние запросы требуют заголовок `Idempotency-Key` (UUID/opaque string, 1–128 символов). Сервер хранит ключ минимум 24 часа в scope `(tenantId, actorId, operation, key)` вместе с hash тела и итоговым ответом:

- повтор с тем же ключом и тем же hash возвращает исходный итог и `Idempotency-Replayed: true`;
- тот же ключ с другим body возвращает `409 idempotency_key_reused`;
- runtime inbound events используют свой delivery event ID и не зависят от пользовательского HTTP-ключа.

Для write-операций, кроме create, обязателен также `If-Match`. Ошибка 429 содержит `Retry-After`; безопасные server/provider failures — нормализованные 502/503/504 с `traceId`, без раскрытия конфигурации.

## 7. Обязательные проверки реализации

Перед отметкой BAI-001 завершённым должны быть проверены документом и будущими контрактными тестами:

1. Переходы статусов, archive/restore/delete/restore-deleted и сохранение pinned runtime version.
2. Tenant isolation для списка, detail, обновления, source binding и idempotency key.
3. `phrase` для `exact`/`contains`/`tokens`, конфликт правил и отсутствие fallback на первый published сценарий.
4. Отказ публикации AI-сценария без ready connection/source/handoff и отсутствие секретов в любом response/audit.
5. Ошибки 404/403/409/412/422/429 и повтор write-запроса.

## Последствия

- BAI-002 реализует роли и flags в точности по этому ADR.
- BAI-003 добавляет миграции без переписывания существующих опубликованных версий.
- BAI-100+ реализуют endpoints и UI, не меняя семантику lifecycle/trigger.
- Расширение до semantic intent, CRM write или write-MCP требует нового ADR и отдельной угрозо-модели.
