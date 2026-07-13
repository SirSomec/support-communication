# Аудит проекта Support Communication — 2026-07-13

Сводка по состоянию проекта, конечной цели, найденным багам и недоработкам. Источники: документация в `docs/`, чтение кода `src/`, `backend/`, `packages/web-widget/`.

## 1. Цель проекта

Омниканальная мультитенантная SaaS-платформа клиентской поддержки уровня Usedesk/Jivo: каналы (web-виджет/SDK, Telegram, VK, MAX), диалоги, маршрутизация и SLA, клиентские профили, шаблоны и база знаний, боты и проактивные сообщения, качество/AI scoring, отчёты, биллинг и квоты, service-admin контур, мониторинг платформы. Frontend — React 19/Vite (`src/`), backend — NestJS/Prisma/PostgreSQL/Redis/BullMQ/MinIO монорепозиторий (`backend/`).

## 2. Текущее состояние

Проект близок к состоянию production-like pilot: все продуктовые экраны работают на реальном API (demo-fixtures удалены и заблокированы guard-тестами), backend проходил 1227/1227 тестов (аудит 2026-07-11), работают PostgreSQL/Redis/MinIO/Mailpit, авторизация пароль + email-OTP, Public SDK, Telegram polling, ClamAV-проверка файлов (EICAR подтверждён), backup/restore gate, транзакционный outbox с воркерами. Пилотный контур ограничен: только Web SDK + Telegram; виджет получает ответы poll'ом, а не push.

Главный источник правды по готовности — `docs/superpowers/plans/2026-07-02-100-percent-working-state-plan.md` и `docs/product-completeness-register.md`.

## 3. Найденные баги в коде (frontend)

| # | Приоритет | Где | Суть |
| --- | --- | --- | --- |
| F1 | ИСПРАВЛЕНО 2026-07-13 | `src/App.jsx` | Бесконечный рефетч детали выбранного диалога устранён: эффект загружает деталь один раз на выбранный id (`loadedDetailIdRef`), realtime-обновления идут прежним путём через `scheduleConversationDetailRefresh`. |
| F2 | ИСПРАВЛЕНО 2026-07-13 | `src/app/useDialogActions.js`, `src/app/dialogModel.js`, `src/app/conversationApiMapper.js`, `src/App.jsx` | Захардкоженный «Иван П.» заменён на реального оператора из `tenantSession.operator` (fallback «Оператор»). |
| F3 | ИСПРАВЛЕНО 2026-07-13 | `src/app/useConversationInbox.js` | При ошибке сервера теперь откатывается и карта `topics` (вместе со статусом и `closedIds`). |
| F4 | ИСПРАВЛЕНО (частично) 2026-07-13 | `src/app/useRealtimeInbox.js` | Polling приостанавливается, пока SSE-соединение живо (`onopen`/`onerror`), и автоматически возобновляется при обрыве — двойная доставка и гонка курсора устранены. Токен в query URL SSE остаётся (ограничен пилотным флагом) — перенос в cookie/заголовок требует изменений backend, отмечено в hardening realtime. |
| F5 | ИСПРАВЛЕНО 2026-07-13 | `src/app/conversationApiMapper.js` | Сортировка таймлайна стала детерминированной: элементы без `createdAt` (оптимистичные локальные сообщения) идут в конец с сохранением исходного порядка. |
| F6 | Низкий | `src/features/section-router.jsx:79-119` | Мёртвый fallback-блок с хардкод-метриками («18», «4», «126», мок-каналы `42 - index*7`) — недостижимый скаффолд; кнопки без `type="button"` и обработчиков. |
| F7 | Низкий | `src/app/useConversationInbox.js:91` | `temporaryId = local-${Date.now()}` — возможна коллизия при двух отправках в одну миллисекунду. |
| F8 | Низкий | `src/App.jsx:233,252,261`, `src/app/useComposerAttachments.js`, `src/services/apiClient.js` | Смешение языков в пользовательских сообщениях: часть ошибок на английском («Attachment blocked by antivirus scan.» и т.п.) при русском UI. |

## 4. Найденные баги и риски (backend)

| # | Приоритет | Где | Суть |
| --- | --- | --- | --- |
| B1 | ИСПРАВЛЕНО 2026-07-13 | `backend/apps/api-gateway/src/identity/*` | Пароли теперь хешируются scrypt (N=16384, r=8, p=1, случайная соль 16 байт, формат `scrypt:N:r:p:salt:key`). Легаси `sha256:`-хеши продолжают проверяться и прозрачно апгрейдятся до scrypt при успешном входе (`upgradeLegacyPasswordCredential`). Новые записи (invite accept, recovery, tenant provisioning, seed) — сразу scrypt. Миграция БД не требуется (колонка `hash_algorithm` — String). |
| B2 | ЗАКРЫТО (fail-closed) 2026-07-13 | `backend/.../identity/auth.service.ts` | OIDC-flow по-прежнему без token exchange, но теперь вне dev/test эндпоинты явно отвечают `denied sso_flow_unavailable` вместо вводящего в заблуждение partial-состояния. Обход только через `AUTH_ALLOW_PARTIAL_SSO_FLOWS=true` (для контрактных тестов). Полная реализация (token endpoint + JWKS-проверка ID token + выдача сессии) остаётся в backlog SSO. |
| B3 | ЗАКРЫТО (fail-closed) 2026-07-13 | `backend/.../identity/auth.service.ts` | Аналогично OIDC: SAML ACS вне dev/test отвечает `denied sso_flow_unavailable`. Выдавать сессию сейчас было бы небезопасно — endpoint принимает распарсенные поля assertion без криптографической проверки XML-подписи. Полная реализация остаётся в backlog SSO. |
| B4 | Высокий | `backend/apps/api-gateway/src/identity/auth.service.ts:345`, `identity.repository.ts:4700` | Тип сессии (service-admin vs tenant operator) определяется по строковому префиксу `svc-admin` в `subjectId` — хрупко; явного поля `session_kind` нет (известный gap `product-gap:session-kind-totp`). |
| B5 | Средний | `backend/apps/api-gateway/src/identity/` | TOTP-аутентификатор и одноразовые recovery-коды не реализованы — MFA только email-OTP (задокументировано как partial). |
| B6 | Низкий | `backend/apps/api-gateway/src/conversation/conversation.service.ts:198` | `void this.realtimeFanout.subscribe(...)` — fire-and-forget: ошибки async-подписки не обрабатываются, риск unhandled rejection. |
| B7 | Низкий | `backend/apps/api-gateway/src/identity/auth.service.ts:383-387,1578-1582`, `mfa-otp.ts:81` | Ослабления в dev/test: пропуск MFA у tenant-оператора по умолчанию, детерминированный OTP `123456`, потребление MFA-challenge при `challengeId: undefined`. В production заблокировано конфиг-гвардами, но хрупко. |

Позитив по безопасности: строгие production-гварды конфигурации (`backend/packages/config/src/index.ts:81-130`), fail-closed верификатор изоляции тенантов, HMAC-OTP, защита SMTP от header-injection, immutable-аудит.

## 5. Недоработки и незакрытые направления (по документации и коду)

| # | Направление | Статус |
| --- | --- | --- |
| G1 | `packages/web-widget` — пакет пуст: только `package.json`, нет `src/`, `index.html`, `test/`; скрипты `build`/`test`/`preview` упадут | не начат |
| G2 | Реальный AI-провайдер: quality scoring работает на простых правилах; bot runtime не вызывает LLM и не ищет знания. Программа «Боты и AI-агент» (`2026-07-12-bots-ai-agent-*`) — весь backlog в `[ ]` | не начато |
| G3 | VK и MAX: функциональная реализация есть, но финальная приёмка на живых кредах не пройдена; в пилоте каналы выключены | external-acceptance-required |
| G4 | Биллинг: нет подключённого реального платёжного провайдера; payment retry/dunning не закрыты live-приёмкой | external-acceptance-required |
| G5 | Browser push: код есть, но выключен до реальных VAPID-ключей, HTTPS-домена и browser permission | external-acceptance-required |
| G6 | Полная ролевая браузерная приёмка на пересобранных production-like контейнерах (`test:pilot-flow`, `test:smoke`, `test:backend-api-smoke`, Task 25 в `2026-07-02-production-runtime-readiness.md`) | не выполнена |
| G7 | Отчёты: событийный слой готов, но полная история статусов/тем/SLA/rescue/CSAT и приёмка сгенерированных файлов — partial (`product-gap:reports-live-data`) | partial |
| G8 | Вынос service-admin в отдельный вход `/service-admin` (план `2026-07-12-service-admin-separate-entry.md`, 9 задач; есть worktree `.worktrees/service-admin-separate-entry`) | утверждён, не начат |
| G9 | UX-долги из `docs/design/ux-audit-2026-07-01/audit-report.md`: P0 — не разделены empty/error/selected в диалогах, сырой «Internal Server Error» на экране входа, застревающий onboarding «5 из 6»; P1/P2 — перегруженные настройки, смешение мониторинга и организаций в service-admin, матрица ролей без таблицы | частично открыты |
| G10 | Несогласованность статусов между документами: bot runtime и AI-контур помечены `[x]` в одних разделах и `[ ]` в сводке/P0-пакете того же `100-percent-working-state-plan.md`; Milestone 8.1 в `backend-development-plan.md` — complete и `[ ]` одновременно | требует ревизии |
| G11 | Multi-instance resilience (routing/SLA/rescue на двух экземплярах API/workers) — single-stack приёмка пройдена, многоэкземплярная нет | не выполнена |

## 6. Рекомендуемый порядок работ

1. Проверить и исправить F1 (бесконечный рефетч) — прямой runtime-дефект.
2. B1 — миграция хеширования паролей на argon2/bcrypt с ре-хешем при входе.
3. F2 — прокинуть реального оператора из сессии в аудит-события.
4. B2/B3 — довести OIDC/SAML до выдачи сессии либо явно отключить эндпоинты.
5. Закрыть G6 (браузерная приёмка) — она же обязательное условие релиза по плану.
6. Далее по P0-пакету из `100-percent-working-state-plan.md`: AI-провайдер, VK/MAX live-приёмка, staging-режимы доставки, TOTP/recovery-коды.
