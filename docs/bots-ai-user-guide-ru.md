# Руководство: боты и AI-агент (для администратора и поддержки)

Как настроить консультационного бота без кода: источник знаний, ключевая фраза, AI, handoff, удаление/восстановление и диагностика.

Связанные документы:

- [Operations runbook](bots-ai-operations-runbook.md)
- [Security / privacy review](bots-ai-security-privacy-review.md)
- [Execution guide](superpowers/plans/2026-07-12-bots-ai-agent-execution-guide.md)

## 1. Подготовка AI (Service Admin)

1. Выберите tenant.
2. Создайте AI connection (совместимый OpenAI-like endpoint), задайте budget/RPM.
3. Пройдите Test connection. Ключ после сохранения не читается — только маска.
4. При инциденте: Disable connection (kill switch уровня провайдера).

## 2. Источник знаний (tenant-admin)

1. Automation / Knowledge sources → добавить документ, URL или одобренный MCP (read-only).
2. Дождаться статуса `ready`. Не публикуйте сценарий на failed/disabled источник.
3. URL: только allowlist; private IP и опасные redirect отклоняются.
4. Отключение источника снимает его из ответов после следующего retrieval.

## 3. Ключевая фраза и сценарий

1. Создайте сценарий в мастере: задача → запуск → знания → проверка.
2. В шаге запуска добавьте фразы и режим совпадения (содержит / точно / токены).
3. Привяжите источники и правило handoff (очередь, fallback-текст).
4. Песочница: введите пример сообщения → увидите trigger, путь, citations, AI/handoff outcome.
5. Публикация через checklist. Пауза не удаляет опубликованную версию.

## 4. Handoff и оценка оператора

1. При низкой уверенности, ошибке провайдера или выключенном пилоте клиент получает fallback, диалог уходит оператору.
2. В чате оператора видна карточка: цель, state, AI outcome, citations, причина.
3. Оператор отмечает **Помогло / Не помогло / Неверный источник**. Feedback tenant-scoped и **не меняет** статьи/источники без отдельного review.

## 5. Удаление и восстановление

1. Удаление (архив) требует подтверждения названием.
2. Восстановление возвращает сценарий **выключенным** — проверьте и включите вручную.
3. Legal/audit hold блокирует purge.

## 6. Диагностика ошибок

| Симптом | Куда смотреть | Первое действие |
| --- | --- | --- |
| Бот не стартует | Trigger preview / priority conflict | Уточнить фразу и каналы |
| Нет ответа по знаниям | Source status, citations в sandbox | Переиндексировать / сменить binding |
| Частые handoff | Workspace telemetry + fallback reason | Обновить источники или pause |
| Provider errors | Service Admin connection test, alerts | Kill switch connection / quota |
| Пилот «молчит» для tenant | Flag `ai_agents_v1` allowlist | Добавить tenant или выключить enforce |

Метрики: `bot_*` в workspace telemetry. Алерты и owners: [runbook](bots-ai-operations-runbook.md).

## 7. Эскалация инцидента

1. Соберите `tenantId`, `scenarioId`, `traceId` (без текста диалога и секретов).
2. Tenant-admin → support-lead (качество).
3. Support-lead → service-admin (provider/quota).
4. Platform-ops → security (SSRF/MCP).
5. Коммуникация клиенту: кратко, без технических ключей; статус после kill switch / restore.
