# План подготовки к production-деплою

## Цель

Довести текущий локальный production-like Compose-стенд до безопасного, повторяемого развёртывания на внешнем сервере с контролируемыми обновлениями, наблюдаемостью и проверенным восстановлением.

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
- Добавить ограничение размера request body, timeouts и rate limits в edge-proxy.
- Настроить host firewall по принципу default deny.
- Реализовать CORS allowlist для виджета: tenant/origin mapping, preflight и интеграционные тесты с внешним доменом.

### Критерий готовности

Снаружи доступны только HTTPS endpoints; DB, Redis и MinIO недостижимы; виджет работает с разрешённого домена и блокируется с неразрешённого.

## Этап 4. Application security

- Ввести global и endpoint-specific rate limiting:
  - IP и account/email для login, MFA и recovery;
  - отдельные лимиты для SDK, public demo и webhooks;
  - Redis-backed counters для нескольких инстансов.
- Пересмотреть bearer-token модель:
  - access token — короткоживущий и, желательно, только в памяти;
  - refresh token — `Secure`, `HttpOnly`, `SameSite` cookie;
  - CSRF-защита для cookie-auth запросов;
  - session revoke и audit остаются обязательными.
- Усилить CSP: составить план удаления `style-src 'unsafe-inline'`; при возможности внедрить nonce или Trusted Types.
- Проверить audit/log redaction на production log shipper.
- Добавить security regression tests для CORS, Swagger, throttling, headers и cookie flags.

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

- Открыть защищённый `/metrics` на базе существующего Prometheus renderer.
- Добавить метрики:
  - HTTP latency/error rate;
  - DB pool/connections;
  - Redis availability;
  - queue lag, retries и dead-letter;
  - worker heartbeat и last-success timestamp;
  - SMTP/provider/scan errors;
  - backup age и restore drill result.
- Внедрить централизованные структурированные логи, error tracking и trace/request ID propagation.
- Для каждого критичного worker добавить:
  - liveness/readiness;
  - SIGTERM drain;
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
  - SAST, dependency/image scan, SBOM;
  - сборка и публикация image по commit SHA;
  - подпись образов и digest verification.
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
