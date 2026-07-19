# План подготовки к production-деплою

## Цель

Довести текущий локальный production-like Compose-стенд до безопасного, повторяемого развёртывания на внешнем сервере с контролируемыми обновлениями, наблюдаемостью и проверенным восстановлением.

## Статус выполнения

Обновлено: 19 июля 2026 года. Обозначения: ✅ реализовано в репозитории; 🟡 реализовано частично или требует проверки на реальной инфраструктуре; ⬜ требует отдельной доработки/решения.

| Этап | Статус | Что уже сделано | Что остаётся |
| --- | --- | --- | --- |
| 0. Исходное состояние | ✅ | Исправлены устаревшие eligibility, Prisma URL/outbox и browser-контракты; устранён дефект ротации созданных API-ключей; unit/backend/build проверки зелёные, четыре найденных browser-регрессии исправлены и перепроверены. | Поддерживать CI обязательным для merge. |
| 1. Production-конфигурация | ✅ | Добавлены standalone `deploy/compose/compose.production.yml`, Caddy edge, production env schema, non-root/read-only контейнеры, healthchecks, лимиты ресурсов и логов; наружу публикуются только 80/443; образы приложения задаются immutable SHA/digest. | Подставить реальные registry image references на сервере. |
| 2. Секреты и инициализация | 🟡 | Production startup и preflight отклоняют local/default credentials, короткие секреты и некорректные master keys; миграции вынесены в отдельный release profile; описан одноразовый bootstrap первого service-admin. | Выбрать внешний secret store, сгенерировать/загрузить реальные секреты, выполнить и проверить first-admin workflow и регламент ротации. |
| 3. Ingress и сеть | 🟡 | Caddy завершает TLS, перенаправляет HTTP→HTTPS, добавляет HSTS/security headers, ограничивает body 64 МБ, headers 64 КБ и slow-connection timeouts, скрывает API/метрики и внутренние порты; Swagger в production выключен; добавлена точная CORS allowlist. | Настроить DNS, ACME email, firewall/default-deny и проверить сертификат/CORS/timeouts с внешнего домена. |
| 4. Application security | 🟡 | Redis-backed rate limit покрывает login/invite/recovery/OIDC/SAML, public demo, Telegram/VK/MAX webhooks, Open Channel и External Bot ingress; ключи содержат только хэши IP/account, proxy headers доверяются только по флагу, staging/production работают fail-closed. Refresh-токены генерируются и хранятся только как хэши и не выдаются клиентскому JavaScript; API обрабатывает SIGTERM через Nest shutdown hooks. | Перевести access-токены из persistent `localStorage` на короткоживущую access + Secure/HttpOnly/SameSite refresh-cookie модель с rotation/CSRF; удалить 17 динамических inline-style и CSP `unsafe-inline`; подключить и проверить production log shipper. |
| 5. S3/SMTP/каналы | 🟡 | Production manifest требует внешние HTTPS S3, SMTP и scanner параметры и не содержит MinIO/Mailpit/Docker Desktop aliases. | Создать bucket/IAM/lifecycle/versioning, настроить SPF/DKIM/DMARC и выполнить live acceptance каждого включаемого канала на staging. |
| 6. Observability/workers | 🟡 | Добавлен закрытый от public ingress Prometheus endpoint `/api/v1/metrics`, request-id и JSON log rotation. Все production workers имеют внутренний healthcheck; общий Node preload runtime публикует event-loop heartbeat/start-time в `/health` и `/metrics` и ограничивает SIGTERM drain 40 секундами; специализированные SLA/rescue/ClamAV probes сохранены. | Инструментировать last-success и queue/DLQ/provider/backup метрики в бизнес-циклах; подключить централизованные логи/error tracking, Prometheus/dashboard/alerts и проверить drain/idempotent restart под реальной нагрузкой. |
| 7. Backup/DR | 🟡 | Добавлен `scripts/production-backup.mjs`: `pg_dump`, S3 mirror, SHA-256 manifest, проверка независимости offsite; добавлены hardened systemd service/timer и runbook. | Настроить immutable offsite storage, retention/RPO/RTO и alerts; выполнить и задокументировать реальный restore drill. |
| 8. CI/CD | 🟡 | CI запускает security audit и production schema preflight; отдельный workflow выполняет CodeQL `security-extended` и dependency review. Frontend/API/migration images до публикации проверяются закреплённым по SHA Anchore/Grype на исправимые high/critical CVE, публикуются по commit SHA с SBOM/provenance и получают Sigstore-backed GitHub attestation по digest; Dependabot следит за npm, Actions и Docker. | Настроить staging→manual approval→production deploy на конкретный сервер, включить обязательные branch protection checks и проверить автоматический halt/rollback. |
| 9. Staging gate | ⬜ | Подготовлены runbook и исполнимые production-артефакты. | Нужны сервер, домен, реальные провайдеры/секреты и владельцы эксплуатации; после этого пройти весь acceptance/checklist и оформить sign-off. |

### Реализованные артефакты

- `deploy/compose/compose.production.yml` — app-only production stack с TLS edge и отдельным migration job.
- `deploy/env/production.env.example` — несекретный контракт обязательных переменных.
- `scripts/production-config-preflight.mjs` — fail-fast проверка env, immutable image refs, URL/TLS, секретов, CORS и Compose.
- `docs/production-runbook.md` — установка, preflight, миграции, первый администратор, rollout, rollback и backup.
- `scripts/production-backup.mjs` и `deploy/systemd/` — расписание и проверяемые резервные копии PostgreSQL/S3.
- `.github/workflows/security.yml`, `.github/workflows/publish-images.yml` и `.github/dependabot.yml` — SAST, dependency review, закреплённое сканирование образов, SBOM/provenance/signing и обновление зависимостей.
- `backend/scripts/worker-health-runtime.mjs` — единый production heartbeat, Prometheus-метрики, liveness и ограниченный SIGTERM drain для worker-процессов.

### Проверки текущей итерации

- ✅ `node --test tests/worker-health-runtime.test.js tests/production-deployment.test.js` — 8/8, включая реальный health/metrics probe дочернего worker-процесса, edge limits и Compose-контракт всех workers.
- ✅ `node --test --import tsx tests/sensitive-rate-limit.test.ts` — 4/4, включая variable-path public webhook/SDK ingress.
- ✅ `npm run production:config:check -- --schema-only deploy/env/production.env.example`.
- ✅ `npm --prefix backend run typecheck`.
- ✅ `npm run test:unit` — 358/358.
- ✅ `cd backend && npm test` — 1764/1764, включая расширенный rate-limit regression; тест ротации созданного API-ключа также проходит.
- ✅ `npm run build` и `npm run widget:build`; frontend build сохраняет некритичное предупреждение о главном chunk около 682 КБ.
- ✅ Production Docker targets `frontend-production`, `api-gateway` и `backend-migrations` собраны локально; runtime users проверены как non-root.
- ✅ Полный `npm run test:smoke` выявил четыре регрессии (37/41 до исправлений); каждый из четырёх сценариев после исправления перепроверен и проходит: attachment scan-pending, API-key/security settings, employee permissions и onboarding.
- ✅ `docker compose --env-file deploy/env/production.env.example -f deploy/compose/compose.production.yml config --quiet` и `git diff --check`.
- ✅ Caddyfile проверен командой `caddy validate` внутри закреплённого production-образа `caddy:2.8-alpine@sha256:af32…`.

## Этап 0. Зафиксировать исходное состояние

- Разобрать и разделить текущие незакоммиченные изменения; не смешивать их с production-hardening.
- Исправить красные проверки:
  - синхронизировать `knowledge-source-hints` с текущими правилами eligibility;
  - обновить ожидания release-gate для Prisma connection string;
  - реализовать или подключить `resolveGroupId` в `SettingsEmployeeService`;
  - прогнать `npm run test:unit`, `cd backend && npm test` и Playwright.
- Ввести правило: изменения не попадают в `main`, пока CI не зелёный.

### Критерий готовности

Все unit-, backend- и browser-тесты, а также typecheck проходят локально и в GitHub Actions.

## Этап 1. Разделить local и production-конфигурации

Создать независимые production-артефакты:

- `deploy/compose/compose.production.yml`;
- `deploy/env/production.env.example` без секретных значений;
- `deploy/nginx/` или `deploy/caddy/`;
- `deploy/systemd/` для watchdog и backup jobs;
- `docs/production-runbook.md`.

В production manifest:

- убрать `bootstrap`, Mailpit, локальный MinIO и `kubernetes.docker.internal`;
- убрать публикацию портов PostgreSQL, Redis, MinIO и API;
- оставить публичным только edge-proxy на `80/443`;
- использовать отдельные private networks для edge, приложения и data-сервисов;
- заменить build-on-server на образы из registry с immutable tag или digest;
- задать `NODE_ENV=production`, restart policy, healthchecks, resource limits и log rotation.

### Критерий готовности

`docker compose -f deploy/compose/compose.production.yml config --quiet` проходит, а manifest не содержит локальных паролей, `localhost`, Mailpit или demo seed.

## Этап 2. Секреты и первичная инициализация

- Перенести секреты из Compose в Vault, Secrets Manager или Docker secrets:
  - PostgreSQL, Redis и MinIO;
  - JWT access/refresh;
  - public API secret;
  - provider/AI encryption keys;
  - SMTP, VAPID, scanner callback и webhook signing keys.
- Сгенерировать новые значения и считать все текущие local-dev значения скомпрометированными.
- Добавить проверку, запрещающую `local-dev-*`, `support/support`, `minio/minio-password` и пустые production secrets.
- Реализовать документированную ротацию ключей, особенно encryption master keys с версионированием.
- Заменить `bootstrap:local`:
  - отдельный migration job: `prisma migrate deploy`;
  - отдельная одноразовая процедура создания первого service-admin;
  - без demo tenant, тестового API key и предсказуемого пароля.

### Критерий готовности

Чистая production БД разворачивается миграциями, а первый администратор создаётся только через защищённый one-time workflow.

## Этап 3. Внешний ingress и сетевой hardening

- Настроить DNS и TLS:
  - автоматическое получение и renewal сертификатов;
  - redirect HTTP в HTTPS;
  - HSTS;
  - TLS 1.2+;
  - безопасные response headers.
- Исправить цепочку reverse proxy: сохранять исходный `X-Forwarded-Proto=https`.
- Закрыть Swagger в production: отключить либо открыть только через VPN, IP allowlist или service-admin auth.
- [x] Добавить ограничение request body 64 МБ, headers 64 КБ и read/write/idle timeouts в edge-proxy; endpoint-specific rate limits реализованы в API через общий Redis.
- Настроить host firewall по принципу default deny.
- Реализовать CORS allowlist для виджета: tenant/origin mapping, preflight и интеграционные тесты с внешним доменом.

### Критерий готовности

Снаружи доступны только HTTPS endpoints; DB, Redis и MinIO недостижимы; виджет работает с разрешённого домена и блокируется с неразрешённого.

## Этап 4. Application security

- [x] Ввести endpoint-specific rate limiting:
  - [x] IP и account/email для login, MFA и recovery;
  - [x] отдельные лимиты для SDK, public demo, Telegram/VK/MAX webhooks, Open Channel и External Bot;
  - [x] Redis-backed counters для нескольких инстансов с fail-closed поведением в production-like среде.
- Пересмотреть bearer-token модель:
  - access token — короткоживущий и, желательно, только в памяти;
  - refresh token — `Secure`, `HttpOnly`, `SameSite` cookie;
  - CSRF-защита для cookie-auth запросов;
  - session revoke и audit остаются обязательными.
- [ ] Усилить CSP: удалить 17 оставшихся динамических React `style` attributes, после чего убрать `style-src 'unsafe-inline'`; nonce не решает проблему style attributes и применим только к `<style>`/`<script>` блокам.
- Проверить audit/log redaction на production log shipper.
- [x] Добавить security regression tests для CORS, Swagger, throttling и production-конфигурации headers.
- [ ] Добавить cookie flags/CSRF regression tests одновременно с refresh-cookie flow.

### Критерий готовности

Автоматические security-тесты подтверждают, что публичные auth/webhook paths защищены от brute force, а privileged tokens не доступны JavaScript.

## Этап 5. Production S3, SMTP и внешние каналы

- Выбрать production object storage: managed S3 либо production MinIO.
- Настроить:
  - private bucket;
  - server-side encryption;
  - отдельные IAM credentials для API и workers;
  - lifecycle, retention и versioning;
  - TLS endpoint и корректную политику signed URL.
- Обновить API, nginx и scanner под production hostname без Docker Desktop aliases.
- Заменить Mailpit реальным SMTP-провайдером: TLS, credentials, SPF/DKIM/DMARC, bounce/complaint policy.
- Для каждого включаемого канала провести live acceptance:
  - Telegram webhook или polling — только один ingress mode на bot;
  - VK/MAX;
  - billing provider;
  - browser push с VAPID и публичным HTTPS.

### Критерий готовности

Upload → scan → delivery, MFA email, webhook и выбранные каналы проходят в staging на реальных credentials.

## Этап 6. Observability и worker reliability

- [x] Открыть защищённый от public ingress `/metrics` на базе существующего Prometheus renderer.
- Добавить метрики:
  - HTTP latency/error rate;
  - DB pool/connections;
  - Redis availability;
  - queue lag, retries и dead-letter;
  - [x] worker event-loop heartbeat и process start timestamp;
  - [ ] business-operation last-success timestamp;
  - SMTP/provider/scan errors;
  - backup age и restore drill result.
- Внедрить централизованные структурированные логи, error tracking и trace/request ID propagation.
- Для каждого критичного worker добавить:
  - [x] внутренний liveness/readiness probe;
  - [x] общий SIGTERM drain deadline; специализированный drain проверить нагрузочным тестом;
  - idempotent restart;
  - alert при отсутствии heartbeat.
- Настроить dashboards, Alertmanager и on-call routing.

### Критерий готовности

Искусственно остановленный worker, недоступный SMTP/S3 и рост DLQ вызывают наблюдаемый alert.

## Этап 7. Backup, восстановление и disaster recovery

- Автоматизировать ежедневный PostgreSQL и object-storage backup.
- Отправлять копии в зашифрованное offsite immutable storage.
- Зафиксировать RPO/RTO, retention, владельцев и escalation.
- Запускать restore drill минимум ежемесячно и после миграций.
- Добавить alert на пропущенный backup, ошибки checksum и превышение RPO.
- Описать полное восстановление на новом сервере.

### Критерий готовности

Restore drill поднимает из production-like копии PostgreSQL и объекты без перезаписи работающего окружения.

## Этап 8. CI/CD и релизный процесс

- Расширить GitHub Actions:
  - unit/backend/widget/Playwright;
  - `security:audit`;
  - `release:gate`;
  - [x] CodeQL SAST и dependency review;
  - [x] закреплённый полным SHA Anchore/Grype image scan до публикации;
  - [x] SBOM/provenance, сборка и публикация image по commit SHA;
  - [x] Sigstore-backed GitHub attestation по опубликованному digest;
  - [ ] verification attestation/digest непосредственно на production host перед rollout.
- Добавить stages: `test` → `staging` → manual approval → `production`.
- Production deploy должен выполнять:
  1. preflight и backup;
  2. migration job;
  3. rolling deploy API/workers;
  4. health/smoke checks;
  5. automatic halt/rollback при ошибке.
- Описать rollback: код откатывается образами, а миграции — только по заранее проверенной стратегии.

### Критерий готовности

Релиз воспроизводится из CI без ручной сборки на сервере; rollback проверен на staging.

## Этап 9. Финальный staging gate

Перед первым production rollout выполнить и подписать checklist:

- полное role-based browser acceptance;
- tenant isolation;
- MFA и recovery;
- web widget на внешнем домене;
- файлы/EICAR/ClamAV;
- выбранные каналы и webhook retries;
- очереди, DLQ replay, restart всех workers;
- нагрузочный тест на ожидаемый трафик;
- backup/restore drill;
- security scan и внешний penetration test;
- согласование on-call, владельцев и окна релиза.

## Условие запуска в production

Решение о production rollout принимается только после закрытия всех критических и высокоприоритетных пунктов, прохождения staging gate и подтверждённого sign-off ответственных за разработку, инфраструктуру и эксплуатацию.
