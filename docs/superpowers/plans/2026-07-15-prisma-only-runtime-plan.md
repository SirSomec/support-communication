# План: единый Prisma-рантайм и уход от понятия «пилот»

> **Статус:** утверждённый план (решения зафиксированы владельцем 15.07.2026).
> **Дата:** 15 июля 2026.
> **Продолжает:** [первый клиентский пилот](2026-07-01-first-client-pilot.md) (закрывает его переходный режим), [production runtime readiness](2026-07-02-production-runtime-readiness.md).
> **Причина:** «пилот» перестал быть временным этапом и стал вторым режимом работы продукта. Двойной рантайм (json/prisma, per-worker env) — источник целого класса дефектов «данные молча теряются между процессами»; 11 доменов вообще не имеют Prisma-персистентности и живут в json-файлах даже в production-like профиле.

## 1. Проблемы и их причины в текущем коде

| # | Проблема | Фактическая причина | Направление |
| --- | --- | --- | --- |
| P1 | Данные «теряются» между сервисами | 13 доменов выбирают хранилище через env `*_REPOSITORY` (json|prisma, дефолт json) в каждом процессе отдельно; пилотный оверлей обязан переопределять env для КАЖДОГО воркера. Уже болело: цепочка бота, CSAT, presence | Фазы B, D |
| P2 | Часть данных эфемерна даже в «production-like» | 11 доменов JSON-only (без Prisma вовсе): знания, MCP, AI-подключения, AI-usage, сессии агента, песочница бота, вопросы без ответа, url-политики, фидбек бота, open-channel, quality-scoring; плюс слайс `webhookEndpointRecords` в integration — store-only (InMemory в prisma-режиме) | Фаза A |
| P3 | Три таблицы-«сироты» в схеме | `ai_connections`, `knowledge_sources`, `mcp_connectors` есть в `schema.prisma`, но ни один репозиторий их не использует | Фаза A1 |
| P4 | «Пилот» расползся по всему репо | Оверлей `docker-compose.pilot.yml` + профиль `prisma-postgres`; `pilot-bootstrap.mjs` + `PILOT_*` env; секреты `pilot-local-*`; рантайм-флаги `PILOT_SSE_QUERY_TOKEN`/`PILOT_VISITOR_TOKEN_SECRET`/`PILOT_TELEGRAM_TENANT_ID`/`BOT_AI_AGENTS_PILOT_ENFORCE`; фичефлаг «AI agents v1 (pilot)»; 5 инфраскриптов собирают команды с оверлеем; доки и сотни fixture-упоминаний | Фазы B, E, F |
| P5 | Локальная разработка и смоки живут в третьем режиме | Playwright-стаб (`tests/playwright-api-gateway.mjs`) и dev — json-file-store; поведение отличается от Postgres-стека (queue directory уже Prisma-only и в стабе не работает) | Фаза C |

## 2. Зафиксированные решения (15.07.2026)

- [x] **Один режим рантайма: Prisma/Postgres везде** — dev-стек, смоки, e2e. JSON-file-store выпиливается полностью; `InMemoryStore` остаётся только внутри юнит/контракт-тестов backend (это тестовый инструмент, а не режим рантайма).
- [x] **Данные текущего пилотного стека не мигрируем** — после перехода стек пересевается с нуля bootstrap-скриптом (mygig-источники и AI-подключения заводятся заново руками).
- [x] **`ai_agents_v1` остаётся rollout-флагом с kill switch** — из имени/сида уходит слово «pilot», allowlist тенантов остаётся штатным механизмом раскатки.
- Терминология: «пилот» → «локальный стек» (compose) / «bootstrap» (сид). Единственный `docker-compose.yml` без оверлеев и профилей; `pilot:bootstrap` → `bootstrap:local`; секреты `pilot-local-*` → `local-dev-*`.

## 3. Целевое состояние

```text
docker compose up -d                  ← один файл, без -f оверлеев и --profile
  postgres + redis + minio + mailpit  ← инфраструктура всегда
  api-gateway + воркеры               ← все на Prisma, без *_REPOSITORY env
  bootstrap (one-shot)                ← миграции + сид: тенант, оператор, ключ

Playwright-смоки                      ← gateway на выделенной Postgres-БД,
                                        пересоздание схемы на прогон
Юнит/контракт-тесты backend           ← InMemoryStore (как сейчас)
.runtime/*.json                       ← не создаются вообще
grep -ri pilot по коду/конфигам       ← 0 (кроме архивных планов в docs)
```

## 4. Фаза A — Prisma-паритет для JSON-only доменов (P0, самый большой объём)

Для каждого домена: модель+миграция (если нет), Prisma-ветка репозитория, контракт-тесты. Новые домены делаются сразу **prisma-only** (без переключателя `*_REPOSITORY` — переключатели выпиливаются, см. фазу D); `InMemoryStore`-конструктор остаётся для юнитов.

**A1 — таблицы уже есть, подключить репозитории (3):**
- `knowledge-sources/knowledge-source.repository.ts` → `knowledge_sources`
- `knowledge-sources/mcp-connector.repository.ts` → `mcp_connectors`
- `ai-connections/ai-connection.repository.ts` → `ai_connections` (внимание: секреты шифрованы `AI_CONNECTIONS_MASTER_KEY` — формат шифртекста переносится как есть; сверить поля модели с фактическими записями стора до включения)

**A2 — новые таблицы + миграции (продуктово-критичные, 5):**
- `agent-session-state` (сессии AI-агента; без неё диалоговый контекст бота теряется при рестарте)
- `unanswered-questions` («дообучение», копится из диалогов)
- `ai-usage` (учёт токенов/лимиты)
- `webhook_endpoints` (слайс `webhookEndpointRecords` из integration; закрывает известное ограничение «endpoint'ы не переживают рестарт», см. вкладку «API и webhooks»)
- `bot-feedback` (оценки операторов ботy; сейчас пишет в свой FS-файл мимо JsonFileStore)

**A3 — хвост (4):**
- `bot-sandbox-sessions` (решить: возможно, достаточно TTL-хранения в Postgres с очисткой)
- `url-source-policies`
- `open-channel` (стор Open Channel API)
- `quality-scoring` → влить в домен quality (отдельная таблица только при реальной необходимости)

Попутно в A: убрать гибрид «prisma + InMemoryStore» в `integration.repository.ts` и `platform.repository.ts` — статичный workspace-каталог читать из сид-констант кода, мутируемые слайсы перевести на таблицы.

## 5. Фаза B — Единый compose и бутстрап (P0)

- Влить пилотный оверлей в `docker-compose.yml`: prisma-env всех воркеров становится безусловным, профиль `prisma-postgres` и файл `docker-compose.pilot.yml` удаляются. Убрать из compose все `*_REPOSITORY` и `*_STORE_FILE` (после фазы D env перестают существовать; на переходе — дефолт prisma в конфиге).
- `backend/scripts/pilot-bootstrap.mjs` → `scripts/bootstrap-local.mjs`; скрипт `pilot:bootstrap` → `bootstrap:local`; env `PILOT_TENANT_SLUG|OPERATOR_EMAIL|OPERATOR_PASSWORD` → `BOOTSTRAP_*`; удалить дуал-райт публичного ключа в json-стор (остаётся только Prisma); тенант по умолчанию `tenant-local-001` вместо `tenant-pilot-001`.
- Секреты `pilot-local-*` → `local-dev-*` (JWT, service-admin key, webhook signing, public API key secret).
- `packages/config`: Zod-enum `json|prisma` и `productCriticalRepositoryEnvs`/`superRefine` упрощаются до «prisma всегда» (сначала предупреждение при обнаружении json-env, через релиз — удаление).
- Инфраскрипты `scripts/compose-health-check.mjs`, `runtime-watchdog.mjs`, `runtime-backup.mjs`, `runtime-restore-drill.mjs`, `release-gate.mjs`: убрать `-f docker-compose.pilot.yml --profile prisma-postgres` из сборки команд.

## 6. Фаза C — Тестовая инфраструктура на Postgres (P0, после B и волны A2)

- `tests/playwright-api-gateway.mjs`: вместо json-`*_STORE_FILE` — поднятие/использование Postgres (сервис `postgres` из compose или отдельный контейнер на нестандартном порту), `prisma migrate deploy` + пересоздание выделенной схемы/БД на прогон, затем сид.
- **Сид демо-данных в Postgres** — ключевая работа фазы: сейчас fixture-тенант (tenant-volga: диалоги, каналы, отчёты, правила и т.д.) сидится json-каталогами (`seed-catalog.ts` каждого домена) при старте стора. Нужны идемпотентные сид-скрипты в БД поверх тех же каталогов (расширение `identity:bootstrap:postgres` до `bootstrap:test-fixtures`). Ожидания смоков (id, даты, тексты) сохраняются — источником остаются те же seed-catalog.
- Изоляция прогонов: drop/create schema перед каждым запуском стаба (замена сегодняшнего `rmSync(runtimeDir)`); ритуал `git checkout -- .playwright-runtime` уходит вместе с каталогом.
- `tests/pilot-smoke.test.js` → `tests/stack-smoke.test.js`, `tests/pilot-flow.spec.js` → `tests/product-flow.spec.js`; env `PILOT_TENANT_ID` и др. → `SMOKE_*`; обновить `release-gate.test.js`/`release-gate.mjs` под новые имена.
- Юнит/контракт-тесты backend не трогаем (InMemory); кейсы «persists … in the JSON store across reopen» удаляются вместе с json-ветками (фаза D).

## 7. Фаза D — Выпиливание json-веток (P1, волнами после C)

- Из 13 дуальных репозиториев удалить `.open()`/JsonFileStore-ветки, json-путь `configureRepositoryBootstrap`, env `*_REPOSITORY`/`*_STORE_FILE` — домен за доменом, начиная с наименее связанных (operations, platform, report) к ядру (conversation, identity).
- `JsonFileStore` в `packages/database` удалить, когда уйдёт последний потребитель.
- Prisma-only адаптеры (`queue-directory`, `provider-message-binding`) перестают быть особым случаем — точечные `process.env.*_REPOSITORY === "prisma"` проверки (integration.service.ts:97, routing.module.ts:24) упрощаются до безусловных.

## 8. Фаза E — Переименование рантайм-«пилота» (P1, можно параллельно A)

- Env с обратной совместимостью на один релиз (читать старое имя с warning):
  `PILOT_SSE_QUERY_TOKEN` → `REALTIME_SSE_QUERY_TOKEN` (+ `VITE_PILOT_SSE_QUERY_TOKEN` → `VITE_REALTIME_SSE_QUERY_TOKEN` в `useRealtimeInbox.js`); `PILOT_VISITOR_TOKEN_SECRET` → `SDK_VISITOR_TOKEN_SECRET`; `PILOT_TELEGRAM_TENANT_ID` → `TELEGRAM_LEGACY_TENANT_ID`; `BOT_AI_AGENTS_PILOT_ENFORCE` → `BOT_AI_AGENTS_FLAG_ENFORCE`.
- `automation/ai-agents-pilot.ts` → `ai-agents-rollout.ts`; сид флага «AI agents v1 (pilot)» → «AI agents v1» (оба seed-catalog: platform и identity); причина handoff `bot_ai_pilot_disabled` → `bot_ai_flag_disabled` (строка видна операторам и закреплена тестами — обновить `bai-706-*`, `bot-sandbox.service.ts:513`).
- `packages/web-widget/demo.html`: инструкции «поднимите pilot stack» → «поднимите локальный стек, ключ выдаёт bootstrap:local».
- Fixture-id `tenant-pilot-001` в юнит-тестах backend (сотни упоминаний) — переименовывать **не обязательно**: это инертные тестовые данные; меняем только в бутстрапе, скриптах, доках и seed-catalog. Опциональная зачистка — отдельным механическим PR в конце.

## 9. Фаза F — Документация и закрытие (P2)

- `docs/pilot-runbook.md` → `docs/local-stack-runbook.md` (переписать команды: один compose, bootstrap:local, без PILOT_*); `docs/runtime-configuration.md` — таблица env без json-режима; `backend/README.md:57`; `docs/frontend-development-plan.md` §7.3; `docs/product-completeness-register.md` (формулировки «production-like pilot»).
- План `2026-07-01-first-client-pilot.md` пометить закрытым со ссылкой сюда.
- Прогон-финал: `npm run typecheck` + backend `node --test` (сверка с базовой линией pre-existing падений), полный Playwright на Postgres-стабе, `stack-smoke` на живом стеке, `release-gate`.

## 10. Порядок, зависимости, объём

```text
A1/A2 (prisma-паритет) ──┐
B (compose+бутстрап) ────┼──► C (смоки на Postgres) ──► D (выпил json-веток)
E (переименование) ──────┘                                       │
A3 (хвост доменов) ──────────────────────────────────────────────┤
F (доки, закрытие) ◄─────────────────────────────────────────────┘
```

- **A** — самая большая фаза (12 доменов × схема+репозиторий+тесты); A2 блокирует C (смоки зависят от знаний/AI-доменов).
- **C** — вторая по объёму (сид fixture-данных в Postgres).
- **B и E** — компактные, можно делать первыми для быстрой видимой отдачи.
- **D** — большой по diff, но механический; строго после C.

## 11. Риски и ловушки

- **Сид смоков**: ожидания 39 смоков закреплены на json-сидах (id/даты/тексты) — сид в Postgres обязан производить байт-в-байт те же сущности, иначе каскад правок тестов. Держать seed-catalog единственным источником истины.
- **Время смоков** вырастет на migrate+seed (~10–30 с на прогон) — приемлемо, но заложить в таймауты webServer.
- **AI-подключения**: перенос шифртекста в таблицу без расшифровки; сверить `AI_CONNECTIONS_KEY_VERSION`.
- **Пересев живого стека**: postgres-volume сохраняет prisma-домены (identity, диалоги); json-домены исчезнут — по решению владельца пересеваем, mygig-источники заводятся заново.
- **Append-only триггеры** (`conversation_lifecycle_events`) не мешают тестовой изоляции при drop schema, но запрещают точечную очистку — для смоков только полное пересоздание схемы.
- **Кириллица в файлах** — правки только Write/Edit инструментами (PS 5.1 Get/Set-Content портит UTF-8 без BOM).
- **Ложные срабатывания grep «pilot»**: строка «AI copilot» (`AiAssistModal.jsx`, `useAiSuggestions.js`), кэш-префикс `copilot:` (`operator-ai-suggestion.service.ts`), S3-фикстура `/pilot/objects/` в тесте виджета — не трогать.

## 12. Критерии приёмки

1. `docker compose up -d` (один файл, без профилей) поднимает рабочий стек; `bootstrap:local` создаёт тенант/оператора/ключ.
2. Ни один процесс не создаёт `.runtime/**/*.json`; все 24 домена читают/пишут Postgres.
3. `grep -ri "pilot"` по коду/конфигам/скриптам — 0 совпадений (исключения: архивные планы в `docs/superpowers/plans`, опционально — fixture-id в юнит-тестах, «copilot»-строки).
4. Полный Playwright зелёный против Postgres-стаба; backend `node --test` — не хуже базовой линии; `release-gate` проходит без пилотного оверлея.
5. В `packages/database` нет `JsonFileStore`; в репозитории нет env `*_REPOSITORY`/`*_STORE_FILE`.
