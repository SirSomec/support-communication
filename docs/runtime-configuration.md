# Runtime Configuration

This document describes how to run Support Communication in local, test, staging, and production-like modes after the production runtime readiness migration.

## Auth Modes

### Tenant operator session

- Login: `POST /api/v1/auth/tenant/login`
- Session validation: `GET /api/v1/auth/tenant/state`
- Frontend storage keys: `sc_access_token`, `sc_tenant_id`, `sc_operator`
- Product screens send `Authorization: Bearer <tenant-access-token>`

A browser workspace is valid only when `GET /api/v1/auth/tenant/state` returns `status: "ok"` and `data.authenticated: true`.

### Service-admin session

- Login: `POST /api/v1/auth/login` with MFA completion
- Frontend storage key: `sc_service_admin_access_token`
- Service-admin screens use `authMode: "service-admin"` in frontend adapters
- Demo header auth (`x-demo-service-admin-*`) is opt-in only in `development` and `test` through `ALLOW_DEMO_SERVICE_ADMIN_HEADERS=true`
- Production startup fails when demo header auth is enabled

### MFA email OTP

- Outside `development` and `test`, tenant and service-admin password login always requires a one-time email code; `PILOT_SKIP_MFA` is not a runtime bypass.
- Challenges persist only an HMAC (`otp_hash`), expire after 10 minutes, allow five failed attempts, and are consumed atomically once.
- `MFA_OTP_DELIVERY_MODE=smtp` is mandatory in `staging` and `production`. SMTP settings use `MFA_OTP_SMTP_FROM`, `MFA_OTP_SMTP_HOST`, `MFA_OTP_SMTP_PORT`, `MFA_OTP_SMTP_USERNAME`, `MFA_OTP_SMTP_PASSWORD`, `MFA_OTP_SMTP_SECURE`, and `MFA_OTP_SMTP_TLS_REJECT_UNAUTHORIZED`, with `MAIL_*` fallbacks.
- OTP HMAC uses `MFA_OTP_HASH_KEY`, or `JWT_ACCESS_SECRET` when a dedicated key is not supplied. No OTP value is written to logs or API responses.
- The production-like local compose routes OTP mail to Mailpit. Live release smokes retrieve the message by recipient and challenge reference instead of using a fixed OTP.

The frontend no longer mints `demo-ui-*` or `onboarding-ui-*` tokens.

## Local Development

```bash
# infrastructure
docker compose up -d postgres redis minio mailpit

# backend
cd backend
npm run start:api-gateway

# frontend
npm run dev
```

Vite proxies `/api/*` to `http://127.0.0.1:4100` by default. Override with:

```bash
VITE_API_BASE_URL=http://127.0.0.1:4100 npm run dev
```

### Local-only switches

| Variable | Purpose |
| --- | --- |
| `RUNTIME_PROFILE=local` | Keep local/test JSON fallbacks enabled. Set `RUNTIME_PROFILE=production-like` only for the guarded PostgreSQL profile. |
| `LOCAL_DEVELOPMENT_SEED_ENABLED=true` | Explicitly load sample users and workspace data for the local JSON profile. Startup rejects this switch outside local development/test. |
| `ALLOW_DEMO_SERVICE_ADMIN_HEADERS=true` | Allow demo service-admin headers in dev/test only |
| `VITE_ENABLE_SERVICE_ADMIN=true` | Expose service-admin route in frontend dev builds |
| `REALTIME_REDIS_FANOUT_ENABLED=true` | Enable Redis-backed realtime fanout |
| `REDIS_URL` | Redis connection for realtime fanout |
| `AUTH_ALLOW_PARTIAL_SSO_FLOWS=true` | Разрешить частичные OIDC/SAML flows вне dev/test. По умолчанию вне dev/test эндпоинты `/auth/oidc/*` и `/auth/saml/acs` отвечают `denied sso_flow_unavailable`, потому что token exchange (OIDC) и проверка подписи assertion (SAML) ещё не реализованы и сессия не выдается. Флаг предназначен только для контрактного тестирования. |
| `BOT_SANDBOX_STORE_FILE` | Путь к JSON-хранилищу sandbox-сессий тест-чата ботов (по умолчанию `.runtime/bot-sandbox-sessions.json`). Сессии эфемерны (TTL 2 часа) и не являются продакшен-диалогами. |
| `BOT_SANDBOX_MONTHLY_TOKEN_BUDGET` | Месячный лимит токенов на живой тест-чат для tenant, если у AI-подключения не задан `limits.sandboxMonthlyTokenBudget` (по умолчанию 100000). Расход песочницы дополнительно учитывается в общем месячном бюджете подключения. |

Repository defaults:

| Variable | Default local behavior |
| --- | --- |
| `AUTOMATION_REPOSITORY` | JSON store unless set to `prisma` |
| `IDENTITY_REPOSITORY` | JSON store unless set to `prisma` |
| `CONVERSATION_REPOSITORY` | JSON store unless set to `prisma` |
| `BILLING_REPOSITORY` | JSON store unless set to `prisma` |
| `WORKSPACE_REPOSITORY` | JSON store unless set to `prisma` |
| `INTEGRATION_REPOSITORY` | JSON store unless set to `prisma` |
| `NOTIFICATION_REPOSITORY` | JSON store unless set to `prisma` |
| `OPERATIONS_REPOSITORY` | JSON store unless set to `prisma` |
| `PLATFORM_REPOSITORY` | JSON store unless set to `prisma` |
| `QUALITY_REPOSITORY` | JSON store unless set to `prisma` |
| `PRESENCE_REPOSITORY` | JSON store unless set to `prisma`; operator presence statuses that gate routing (`PRESENCE_STORE_FILE` overrides the JSON path). Workers that auto-assign (telegram polling) must use the same repository mode as the api-gateway. |
| `ROUTING_REPOSITORY` | JSON store unless set to `prisma` |
| `REPORT_REPOSITORY` | JSON store unless set to `prisma` |

The root `docker-compose.yml` is the fast local, non-production mode. It starts PostgreSQL, Redis, MinIO and Mailpit, but the API Gateway uses JSON-backed domain stores by default so local UI checks can be reset quickly.

For the guarded production-like PostgreSQL slice, use the named `prisma-postgres` compose profile through the pilot overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres up -d --build
```

That overlay sets `RUNTIME_PROFILE=production-like`, disables demo service-admin header auth, and requires product-critical repositories to run with Prisma: automation, identity, billing, conversation, workspace, integrations, notifications, operations, platform, routing and reports. Automation Prisma mode stores bot scenarios, runtime versions, publish audit rows, publish idempotency keys, bot test runs, proactive rules, execution windows, frequency caps, experiment assignments, delivery attempts, delivery idempotency keys and delivery attributions in PostgreSQL. Integrations Prisma mode stores public API keys/reveal state/rotation audit, key rotation jobs, public demo request leads/audit/notification descriptors, webhook replay journal/audit, webhook delivery journal, security sessions, channel connections/events/audit, and Telegram connection runtime state in PostgreSQL. Operations Prisma mode stores load-test, restore-check, dead-letter replay, migration rollback-check and idempotency runtime records in PostgreSQL, using dedicated restore-result tables plus `operations_runtime_records` for queued operation descriptors. Platform Prisma mode stores telemetry samples, health rollups, alert routing rules, feature flag rules, immutable platform audit/outbox rows, and platform runtime descriptors in `platform_runtime_records`. Workspace Prisma mode stores file metadata, scan-result idempotency records, client profiles, client export jobs, template records and knowledge records in PostgreSQL. Notifications Prisma mode stores inbox notifications, preferences, browser push subscriptions, delivery descriptors and preference audit events in PostgreSQL. Routing Prisma mode persists rules, queue membership, capacity records, analytics rows, assignment/SLA/rescue job descriptors, and the conversation/operator/queue/rescue-report runtime snapshot in PostgreSQL. Reports Prisma mode persists metric definitions, metric versions, tenant overrides, saved templates, idempotency keys, export jobs, query executions, file descriptors, notification descriptors, scheduled digest descriptors and retry audit events in PostgreSQL. Use the root local compose file for runnable JSON-mode development.

## Test Mode

Backend contract tests run against in-memory repositories. Browser smoke tests seed tenant sessions through `POST /api/v1/auth/tenant/login`.

`npm run test:pilot-flow` is the backend-dependent browser E2E path. Playwright starts both `npm run backend:start:e2e` on `http://127.0.0.1:4100/api/v1/health` and Vite on `http://127.0.0.1:5173` before running `tests/pilot-flow.spec.js`. The widget demo check remains explicitly skippable when `PILOT_WIDGET_DEMO_URL` is unavailable; tenant login, onboarding, and notification checks must use the real API Gateway. Keep `npm run test:smoke` for the faster frontend smoke path.

Useful commands:

```bash
npm run test:no-demo-runtime
npm run test:services
npm run backend:test
npm run test:smoke
npm run test:pilot-flow
playwright test tests/settings-runtime.spec.js
playwright test tests/service-admin-runtime.spec.js
```

Live API smoke:

```bash
RUN_BACKEND_API_SMOKE=1 npm run test:backend-api-smoke
```

## Staging / Production Requirements

Production-like startup requires:

- `RUNTIME_PROFILE=production-like`
- `DATABASE_URL`
- JWT/session secrets
- public API key secret
- object storage credentials (`S3_*`)
- billing provider mode outside sandbox/local
- `NODE_ENV=production`
- demo header auth disabled

Recommended verification before release:

```bash
npm run release:gate
```

`release:gate` runs the frontend demo/stub guards, frontend service/API/smoke tests, backend release checklist, production build, production-like Prisma/PostgreSQL compose startup, and HTTP health checks in one sequence.

## Seed Process

Runtime request paths do not import fixture modules. Seed data is loaded through explicit scripts:

```bash
cd backend
npm run prisma:seed
npm run identity:bootstrap:postgres
```

Pilot/local bootstrap helpers live under `backend/scripts/`.

## Notifications Runtime

- API: `GET /api/v1/notifications`, `POST /api/v1/notifications/mark-read`
- Preferences API: `GET/PATCH /api/v1/notifications/preferences`
- Browser push API: `GET /api/v1/notifications/push-subscriptions/public-key`, `POST /api/v1/notifications/push-subscriptions`, `DELETE /api/v1/notifications/push-subscriptions/:subscriptionId`
- Permission: `notifications.read`
- Realtime fanout event names: `notification.created`, `notification.read`
- Frontend adapter: `src/services/notificationService.js`
- UI metadata only in `src/app/notificationModel.js`
- Service worker: `/browser-push-service-worker.js`
- Worker command: `npm run backend:notification:worker:once` or compose service `notification-delivery-worker`
- Local deterministic delivery: `NOTIFICATION_DELIVERY_PROVIDER_MODE=local`
- Real web-push delivery: `NOTIFICATION_DELIVERY_PROVIDER_MODE=web-push` with `BROWSER_PUSH_PUBLIC_KEY`, `BROWSER_PUSH_PRIVATE_KEY`, and `BROWSER_PUSH_SUBJECT`
- Production-like provider gate: browser push is disabled only when `BROWSER_PUSH_ENABLED` is not `true` and no VAPID key material is present. Enabling the feature or supplying either key requires `NOTIFICATION_DELIVERY_PROVIDER_MODE=web-push` and a complete public/private VAPID pair before the worker scans descriptors. `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` remain supported aliases.

## Proactive Delivery Runtime

- Once smoke: `npm run backend:proactive-delivery:worker:once`
- Long-running command: `cd backend && npm run start:proactive-delivery-worker`
- Compose service: `proactive-delivery-worker`
- Source state: configured automation `activeVisitors`; when that snapshot is empty, active durable conversation rows are used so the production-like Prisma profile has a real visitor source.
- Eligibility: enabled rule, exact channel, exact configured segment, tenant execution window, tenant frequency cap and deterministic experiment assignment.
- Persistence: queued conversation outbound descriptor plus `message-delivery` outbox event, delivery attempt, idempotency fingerprint and experiment attribution. A successful queue operation consumes active frequency caps once; replay does not consume them again.
- Runtime variables: `PROACTIVE_DELIVERY_INTERVAL_MS`, `PROACTIVE_DELIVERY_LIMIT`, `PROACTIVE_DELIVERY_ACTIVE_VARIANTS`, and `PROACTIVE_DELIVERY_VISITOR_TTL_MS` (default 15 minutes); `PROACTIVE_DELIVERY_EVALUATED_AT` and `PROACTIVE_DELIVERY_TRACE_ID` are intended for deterministic smoke/replay runs.
- Production-like repositories: set both `AUTOMATION_REPOSITORY=prisma` and `CONVERSATION_REPOSITORY=prisma`. The regular `outbox-worker` consumes the resulting `message-delivery` event.
- Scaling constraint: run one `proactive-delivery-worker` replica. Duplicate polling is idempotent, but horizontal replicas remain blocked until frequency-cap reservation and cross-domain evidence are moved behind one PostgreSQL claim/transaction boundary.

## Public Demo Lead Notification Runtime

- Worker command: `cd backend && npm run lead-notification:worker:once`
- Long-running command: `cd backend && npm run start:lead-notification-worker`
- Local deterministic delivery: `PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE=local`
- SMTP delivery: `PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE=smtp` with `PUBLIC_DEMO_NOTIFICATION_SMTP_HOST` or `MAIL_HOST`, `PUBLIC_DEMO_NOTIFICATION_SMTP_PORT` or `MAIL_PORT`, `PUBLIC_DEMO_NOTIFICATION_SMTP_FROM`, and `PUBLIC_DEMO_NOTIFICATION_SMTP_TO`. External SMTP credentials are optional but must be supplied as a pair through `PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME`/`PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD` or `MAIL_USERNAME`/`MAIL_PASSWORD`; when present, the worker authenticates with `AUTH PLAIN` before delivery. Implicit TLS for SMTPS endpoints is enabled with `PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE=true`; self-signed staging endpoints can set `PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED=false`.
- Release smoke: `lead-notification:worker:once` seeds one public demo notification descriptor, starts an embedded SMTP endpoint, runs the worker in `smtp` mode, and verifies one delivered SMTP message plus a persisted `smtp-*` provider message id.
- Compose Mailpit smoke: `cd backend && npm run lead-notification:mailpit-smoke` skips unless `LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED=true`. Root `npm run release:gate` enables it after starting `postgres`, `redis`, `minio` and `mailpit`, points the worker at Mailpit SMTP `127.0.0.1:11025`, polls Mailpit API `http://127.0.0.1:18025`, and verifies the unique lead email plus persisted `smtp-*` provider message id.
- External SMTP acceptance smoke: `cd backend && npm run lead-notification:smtp-live-smoke` skips unless `LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_ENABLED=true`. Root `npm run release:gate` includes it after production-like API readiness with host PostgreSQL; set `PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE=smtp`, SMTP host/port/from/to, optional username/password pair, and TLS flags to verify one queued public-demo notification is accepted by the external SMTP endpoint and persisted as delivered with a `smtp-*` provider message id. This smoke does not prove inbox placement, async provider bounces, SPF/DKIM/DMARC alignment, or STARTTLS endpoints; use a mailbox API/IMAP contract if those must be release blockers.
- Production-like fallback: provider dispatch is disabled unless a real lead notification provider is configured; failed attempts are stored with redacted error evidence on the lead notification descriptor.

## Outbox And Billing Sync Runtime

- Webhook delivery worker command: `cd backend && npm run webhook:worker:once`
- Webhook delivery long-running command: `cd backend && npm run start:webhook-delivery-worker`
- Compose service: `webhook-delivery-worker`
- Local deterministic webhook delivery: `WEBHOOK_DELIVERY_PROVIDER_MODE=local`.
- HTTP webhook delivery: `WEBHOOK_DELIVERY_PROVIDER_MODE=http` with `WEBHOOK_DELIVERY_SIGNING_SECRET`; the worker posts each claimed delivery to the row-owned `targetUrl`, sends idempotency and trace headers plus `x-webhook-timestamp` and an HMAC-SHA256 `x-webhook-signature` over `timestamp.body`, and persists delivered, retry-scheduled, or dead-lettered state with redacted provider errors.
- Webhook delivery smoke: `cd backend && npm run webhook:worker:once` seeds one Prisma `webhookDeliveryJournalEntry`, starts a local HTTP fake provider, runs the compiled worker main once, verifies exactly one provider request, and asserts the row is delivered. The smoke requires `DATABASE_URL`.
- Outbound channel worker command: `cd backend && npm run outbox:worker:once`
- Outbound channel long-running command: `cd backend && npm run start:outbox-worker`
- Compose service: `outbox-worker`
- Billing sync worker command: `cd backend && npm run billing:worker:once`
- Billing sync long-running command: `cd backend && npm run start:outbox-worker -- --billing-sync`
- Compose service: `billing-sync-worker`
- Production-like compose runs both workers against `DATABASE_URL=postgresql://support:support@postgres:5432/support_communication`.
- File scan API callback smoke: `cd backend && npm run file-scan:api-callback-smoke` skips unless `FILE_SCAN_API_CALLBACK_SMOKE_ENABLED=true`. Root `npm run release:gate` runs it only after the production-like Prisma compose API is ready, seeds one Prisma-backed file scan job, logs in as service-admin, runs the scanner worker once, posts the scan result through the live `/files/:fileId/scan-result` API route, and verifies Prisma outbox, file scan state and idempotency persistence.
- External scanner smoke: `cd backend && npm run file-scan:external-scanner-smoke` skips unless `FILE_SCAN_EXTERNAL_SCANNER_SMOKE_ENABLED=true`. Root `npm run release:gate` includes it after production-like API readiness with the host API and PostgreSQL URLs; set `OUTBOX_SCANNER_URL` to a real scanner endpoint to verify HTTP scanner dispatch plus the live `/files/:fileId/scan-result` callback path. Optional `FILE_SCAN_EXTERNAL_SCANNER_EXPECTED_SCANNER` pins the expected scanner name returned by the provider.
- `outbox-worker` is scoped to the `message-delivery` queue; `billing-sync-worker` is scoped to the `billing-sync` queue.
- Local deterministic billing sync: `BILLING_SYNC_PROVIDER_MODE=local`.
- External billing provider dispatch: set `BILLING_SYNC_PROVIDER_MODE=http` and `BILLING_SYNC_PROVIDER_URL`; production-like pilot defaults to `disabled` without an explicit provider so queued jobs fail/retry instead of being silently published.
- External channel delivery still requires configured provider env such as `OUTBOX_CHANNEL_CONNECTORS` or `OUTBOX_TELEGRAM_ENABLED=true`. In production-like Prisma mode, Telegram bot tokens resolve from active `telegram_connections` rows by tenant, with `OUTBOX_TELEGRAM_BOT_TOKEN` as an env fallback.
- Provider runtime smoke: `cd backend && npm run provider:outbox:smoke` is skip-safe unless `OUTBOX_PROVIDER_SMOKE_ENABLED=true`. Backend `release:checklist` enables it with local provider endpoints by default. When enabled it seeds one queued descriptor each for Telegram, VK and MAX, starts local provider endpoints, runs `outbox-worker --once` through `OUTBOX_TELEGRAM_*`, `OUTBOX_VK_*` and `OUTBOX_MAX_*` runtime env, and verifies 3 published dispatches. Disable individual providers with `OUTBOX_PROVIDER_SMOKE_TELEGRAM_ENABLED=false`, `OUTBOX_PROVIDER_SMOKE_VK_ENABLED=false` or `OUTBOX_PROVIDER_SMOKE_MAX_ENABLED=false`.
- Telegram live provider smoke: `cd backend && npm run provider:telegram-live-smoke` skips unless `OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED=true`. Root `npm run release:gate` includes it after production-like API readiness with host PostgreSQL and `INTEGRATION_REPOSITORY=prisma`; set `OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID` plus either `OUTBOX_TELEGRAM_BOT_TOKEN` or an active Prisma `telegram_connections` token for `OUTBOX_PROVIDER_LIVE_SMOKE_TENANT_ID` to send one real Telegram message and verify the outbox event is published.
- VK/MAX live official-provider smoke: `cd backend && npm run provider:vk-max-live-smoke` skips unless `OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED=true`. It requires the ids of existing encrypted tenant connections (`..._VK_CONNECTION_ID`, `..._MAX_CONNECTION_ID`) plus a real VK peer id and MAX chat id. The worker resolves each saved credential, sends through the official API and verifies durable outbox delivery state. Disable either provider explicitly with its `..._ENABLED=false` flag.

```bash
OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED=true OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID=123456789 OUTBOX_TELEGRAM_BOT_TOKEN=123456:token DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication INTEGRATION_REPOSITORY=prisma npm run --prefix backend provider:telegram-live-smoke
```

```bash
OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED=true OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_CONNECTION_ID=vk-connection-id OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_PEER_ID=123456 OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_CONNECTION_ID=max-connection-id OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_DIALOG_ID=chat-123 DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication npm run --prefix backend provider:vk-max-live-smoke
```

## Public SDK Pilot Smoke

- Release gate command: `npm run release:gate`
- Direct command: `npm run test:pilot-smoke`
- Root `release:gate` starts local infrastructure before backend release checklist and scrubs live provider env from compose startup steps so local verification does not accidentally dispatch to external providers.
- The release gate runs the public SDK pilot smoke after compose readiness with `BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1`, host PostgreSQL `DATABASE_URL`, and `PILOT_PUBLIC_API_ENVIRONMENT=stage`.
- The smoke completes production-like MFA from the Mailpit message generated for its ephemeral operator; it has no static OTP bypass.

## Release Database Preflight

- `npm run --prefix backend release:database:preflight` validates `DATABASE_URL` before migrations or seed.
- Local hosts (`localhost`, `127.0.0.1`, `::1`, and the compose `postgres` service) are accepted by default.
- A remote database is rejected unless both `RELEASE_ALLOW_REMOTE_DATABASE=true` and a non-empty `RELEASE_TARGET_ENVIRONMENT` are supplied.
- Root `npm run release:gate` pins its own local PostgreSQL URL and runs the preflight before `prisma:migrate:deploy`.
- The local smoke never skips and does not require an externally supplied public key. It creates an ephemeral tenant operator, password credential and stage `PublicApiKey` in Prisma, verifies public SDK identify, widget message send, operator reply and widget polling against the live API, then removes its key, auth session/challenge and conversation evidence.

## File Scan Scanner Runtime

- Worker command: `cd backend && npm run file-scan:worker:once`
- Long-running command: `cd backend && npm run start:file-scan-scanner-worker`
- Runtime scanner execution requires `OUTBOX_SCANNER_ENABLED=true`, `OUTBOX_FILE_SCAN_RESULT_BASE_URL`, and `OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN`.
- The production-like compose stack starts ClamAV, `clamav-scanner`, and `file-scan-scanner-worker` by default. The worker uses `OUTBOX_SCANNER_PROVIDER_MODE=http` and the internal `http://clamav-scanner:4120/scan` endpoint; local deterministic verdicts remain test-only.
- External scanner: set `OUTBOX_SCANNER_PROVIDER_MODE=http` and provide `OUTBOX_SCANNER_URL`. If the scanner endpoint requires authentication, set `OUTBOX_SCANNER_BEARER_TOKEN`; the worker sends it as `Authorization: Bearer ...` only on scanner dispatch. Scanner requests forward safe descriptor metadata plus optional `signedFile` access (`method`, `url`, `expiresAt`, optional headers) when the queued descriptor payload provides it; raw object storage keys are not sent to the scanner. Dialog attachment uploads now create a `workspaceFile`, return a client `signedUpload` policy, seed the scan descriptor with `signedFile` access for the scanner, finalize uploaded bytes through `POST /api/v1/dialogs/attachments/:fileId/finalize`, and expose scan readiness through `GET /api/v1/dialogs/attachments/:fileId/status` without exposing `objectKey`.
- External scanner smoke command for a production-like compose API:

```bash
FILE_SCAN_EXTERNAL_SCANNER_SMOKE_ENABLED=true OUTBOX_SCANNER_URL=https://scanner.example.test/runtime OUTBOX_SCANNER_BEARER_TOKEN=scanner-token FILE_SCAN_EXTERNAL_SCANNER_SIGNED_FILE_URL=https://storage.example.test/signed/file.txt FILE_SCAN_EXTERNAL_SCANNER_SIGNED_FILE_EXPIRES_AT=2026-07-09T12:00:00.000Z BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 DATABASE_URL=postgresql://support:support@127.0.0.1:56432/support_communication npm run --prefix backend file-scan:external-scanner-smoke
```

- Compose service: enable the optional `scanner-runtime` profile. By default it uses the deterministic local scanner so the profile does not depend on an undeclared `scanner` container; set HTTP mode only when a reachable scanner service is configured.

## Quality AI Runtime

External quality scoring uses an OpenAI-compatible `chat/completions` endpoint. It is disabled unless all of `QUALITY_AI_ENABLED=true`, `QUALITY_AI_BASE_URL`, `QUALITY_AI_API_KEY`, and `QUALITY_AI_MODEL` are set. `QUALITY_AI_TIMEOUT_MS`, `QUALITY_AI_MAX_RETRIES`, and `QUALITY_AI_RATE_LIMIT_PER_MINUTE` bound provider calls. The UI requires explicit per-session consent; email and phone values are redacted before transmission, and failures fall back to local rules.

## Docker Compose

Fast local JSON-mode containers:

```bash
docker compose build frontend api-gateway notification-delivery-worker lead-notification-worker webhook-delivery-worker report-digest-worker outbox-worker billing-sync-worker
docker compose up -d frontend api-gateway notification-delivery-worker lead-notification-worker webhook-delivery-worker report-digest-worker outbox-worker billing-sync-worker
```

Production-like Prisma/PostgreSQL profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres up -d --build
```

Optional scanner worker profile with deterministic local scanner:

```bash
docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres --profile scanner-runtime up -d --build file-scan-scanner-worker
```

Optional scanner worker profile with an external scanner:

```bash
OUTBOX_SCANNER_PROVIDER_MODE=http OUTBOX_SCANNER_URL=https://scanner.example.test/runtime OUTBOX_SCANNER_BEARER_TOKEN=scanner-token docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres --profile scanner-runtime up -d --build file-scan-scanner-worker
```

This command is the production-like Prisma/PostgreSQL gate. It should start without JSON fallback store blockers when every product-critical repository variable is set to `prisma`.
The pilot overlay also runs `notification-delivery-worker` with `RUNTIME_PROFILE=production-like`, `NOTIFICATION_REPOSITORY=prisma`, and browser push fully disabled by default on both API and worker. Supplying `BROWSER_PUSH_ENABLED=true` or VAPID key material activates the fail-fast live-provider gate; set `NOTIFICATION_DELIVERY_PROVIDER_MODE=web-push` with complete credentials. It runs `lead-notification-worker` with `INTEGRATION_REPOSITORY=prisma` and provider dispatch disabled unless a real lead notification provider is configured. It runs `webhook-delivery-worker` with `INTEGRATION_REPOSITORY=prisma`; set `WEBHOOK_DELIVERY_PROVIDER_MODE=http` when replay/delivery rows should call their `targetUrl`, otherwise the pilot default is disabled. It also runs `outbox-worker`, `billing-sync-worker`, ClamAV and the persistent file scanner worker backed by PostgreSQL. An external scanner remains available by overriding `OUTBOX_SCANNER_URL` and the HTTP provider credentials.
The pilot overlay passes `PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME`, `PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD`, `PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE`, and `PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED` into `lead-notification-worker` so production-like SMTP auth/SMTPS settings match the live smoke contract.

Health checks:

```bash
curl http://127.0.0.1:8080/
curl http://127.0.0.1:8080/api/v1/health
curl http://127.0.0.1:4101/api/v1/health
node scripts/compose-health-check.mjs
```

## Removed Demo Runtime Paths

The following are no longer part of app runtime:

- `src/data.js` and `src/data/*`
- `src/services/mockBackend.js`
- frontend-written `demo-ui-*` / `onboarding-ui-*` tokens
- automatic browser injection of `x-demo-service-admin-*` headers

Use repository seed scripts and authenticated API sessions instead.
