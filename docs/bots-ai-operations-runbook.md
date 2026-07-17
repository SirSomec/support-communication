# Runbook: боты и AI-агент

Операционная инструкция для алертов Phase H (BAI-701). Метрики берутся из `bot_*` counters/histograms без PII.

Связанный план: [Bots AI Agent Execution Guide](superpowers/plans/2026-07-12-bots-ai-agent-execution-guide.md).

## Роли

| Роль | Ответственность |
| --- | --- |
| `service-admin` | AI-подключения, секреты, бюджеты, kill switch connection |
| `platform-ops` | runtime workers, dead-letter, ingestion, delivery |
| `tenant-admin` | сценарии, источники, фразы, publish/pause |
| `support-lead` | качество handoff, эскалация клиенту |
| `security` | SSRF/MCP deny, allowlist, audit review |

## Алерты и действия

### 1. AI provider outage (`provider_outage`)

**Owner:** service-admin  
**Сигнал:** `bot_ai_requests_total{status=error}` доминирует над ok.

1. Service Admin → AI connections → Test.
2. Если провайдер недоступен — отключить connection или поставить AI-сценарии на паузу.
3. Клиенты получают fallback/handoff; не повторять ключ в чатах/тикетах.
4. После восстановления — re-test, затем включить сценарии.

### 2. Ingestion backlog / source errors (`ingestion_backlog`)

**Owner:** platform-ops  
**Сигнал:** рост `bot_source_errors_total`.

1. Проверить worker refresh URL/document и `failureCode` источника.
2. Не обходить SSRF/private-IP checks.
3. Перезапустить worker; при backlog — временно запретить новые URL sources.
4. Сообщить tenant-admin о задержке знаний.

### 3. AI quota / cost spike (`quota_spike`)

**Owner:** service-admin  
**Сигнал:** ошибки `bot_ai_quota_exhausted` / rate / concurrency.

1. Сверить usage vs monthlyTokenBudget.
2. Снизить RPM/budget или пауза шумных сценариев.
3. Проверить cache hit и trigger match (лишние AI-вызовы).
4. Согласовать повышение бюджета или оставить kill switch.

### 4. Unsafe source / MCP denial (`unsafe_source_denial`)

**Owner:** security + service-admin  
**Сигнал:** `bot_source_errors_total` с кодами ssrf/private/unsafe/mcp denial.

1. Не расширять allowlist без review.
2. Отключить source/MCP connector и снять bindings из сценариев.
3. Зафиксировать immutable audit.
4. Эскалировать при cross-tenant повторах.

### 5. Runtime dead-letter (`runtime_dead_letter`)

**Owner:** platform-ops  
**Сигнал:** `bot_delivery_failures_total` или частые `bot_publish_failures_total`.

1. Взять redacted `lastError` из runtime journal.
2. Исправить webhook allowlist/timeout/node config.
3. Replay/retry; при массовости — pause сценариев.
4. Проверить reconciliation/outbox workers.

### 6. High fallback rate (`high_fallback_rate`)

**Owner:** tenant-admin + support-lead  
**Сигнал:** много `bot_handoff_total` относительно успешных AI-ответов.

1. Песочница: trigger + retrieval citations.
2. Обновить источники / фразы / fallback.
3. При сохранении — снизить priority или pause.
4. Support-lead контролирует очередь handoff.

### «Умный» LLM-поиск ищет не тем способом или дорого (BAI-873…879)

**Сигнал:** в trace песочницы `retrievalMode: llm_fallback`, либо метрика `bot_retrieval_requests_total{mode="llm_fallback"}` растёт; либо расход дорогой модели выше ожиданий.

1. `fallbackReason` в trace/«Проверить поиск»: `llm_retrieval_connection_not_ready` — у подключения нет «модели для поиска» или capability `retrieval`; `bot_ai_rate_limit_reached`/`monthly_budget` — бюджет; `provider_timeout`/`provider_unavailable` — провайдер; `llm_retrieval_invalid_response` — модель вернула не-JSON (проверить выбор модели).
2. Fallback безопасен: бот отвечает лексическим поиском, диалоги не падают.
3. Дорого: смотреть `cache_write_tokens` — постоянные прогревы означают нестабильный корпус (частые переиндексации источников) или превышение потолка `RETRIEVAL_CORPUS_MAX_TOKENS` (60k по умолчанию; `corpusTruncated: true` в результате — корпус фильтруется под вопрос и кеш не переиспользуется).
4. Отключить: режим «Быстрый» в «Рамках ответов» сценария (мгновенно, через черновик/публикацию) или флаг `ai_llm_retrieval` для tenant (см. Kill switch).

## Kill switch (кратко)

1. **Сценарий:** Automation → Пауза / архив.  
2. **AI connection:** Service Admin → Disable connection.  
3. **Источник:** отключить source / снять approval.  
4. **Feature flag (пилот):** выключить `ai_agents_v1` (status `off` или убрать tenant из `enabledTenantIds`). Runtime enforce включается опцией `featureFlags` / `BOT_AI_AGENTS_PILOT_ENFORCE=1`.
5. **LLM-поиск:** выключить флаг `ai_llm_retrieval` — сценарии с режимом «Умный» тихо возвращаются к лексическому поиску без пауз и ошибок.

## Пилот и расширение (BAI-706)

1. Внутренний tenant `tenant-pilot-001` в allowlist `ai_agents_v1`.
2. Собрать метрики `bot_*` и feedback (помогло / не помогло / неверный источник).
3. Расширять allowlist постепенно; при регрессии — kill switch выше.
4. Коммуникация: support-lead уведомляет tenant-admin о pause/restore без раскрытия ключей.

## Эскалация

1. Tenant-admin → support-lead (качество ответов/handoff).  
2. Support-lead → service-admin (provider/quota/secret).  
3. Platform-ops → security (SSRF/MCP).  
4. Incident с `traceId`/`scenarioId`/`tenantId` без текста диалога и секретов.

Пользовательская инструкция: [bots-ai-user-guide-ru.md](bots-ai-user-guide-ru.md).  
Security review: [bots-ai-security-privacy-review.md](bots-ai-security-privacy-review.md).
