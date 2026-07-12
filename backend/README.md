# Support Communication Backend

Phase 0 contains the backend monorepo foundation: shared envelope, config validation, observability helpers, local infrastructure and a bootable API Gateway with health/readiness/OpenAPI shell.

## Commands

```bash
npm install
npm run typecheck
npm test
npm run build
npm run prisma:validate
npm run prisma:generate
npm run prisma:seed
npm run identity:bootstrap:postgres
npm run tenant-isolation:verify
npm run audit-immutability:verify
npm run public-api:docs:verify
npm run public-api:docs:runtime-smoke
npm run smoke:postgres
npm run release:checklist
npm run start:api-gateway
npm run outbox:worker:once
npm run provider:telegram-live-smoke
npm run provider:vk-max-live-smoke
npm run file-scan:worker:once
npm run billing:worker:once
npm run notification:worker:once
npm run lead-notification:worker:once
npm run lead-notification:mailpit-smoke
npm run lead-notification:smtp-live-smoke
npm run report-digest:worker:once
npm run file-scan:api-callback-smoke
npm run file-scan:external-scanner-smoke
npm run start:outbox-worker
npm run start:notification-delivery-worker
npm run start:lead-notification-worker
npm run start:report-digest-worker
npm run start:file-scan-scanner-worker
npm run start:outbox-bullmq-worker
npm run start:billing-bullmq-worker
```

`start:api-gateway` loads `.env.example` through Node's `--env-file` flag for local smoke runs. For real environments, pass environment variables through the deployment platform instead of using `.env.example`. `RUNTIME_PROFILE=local` keeps JSON fallbacks available for development and tests. `RUNTIME_PROFILE=production-like` turns them into startup blockers unless the product-critical repository is explicitly Prisma-backed. Automation, identity, billing, conversation, workspace, notifications, operations, platform, routing and reports persistence default to JSON stores; set `AUTOMATION_REPOSITORY=prisma`, `IDENTITY_REPOSITORY=prisma`, `BILLING_REPOSITORY=prisma`, `CONVERSATION_REPOSITORY=prisma`, `WORKSPACE_REPOSITORY=prisma`, `NOTIFICATION_REPOSITORY=prisma`, `OPERATIONS_REPOSITORY=prisma`, `PLATFORM_REPOSITORY=prisma`, `ROUTING_REPOSITORY=prisma` and/or `REPORT_REPOSITORY=prisma` with `DATABASE_URL` to use the Prisma-backed repository adapters that are available for the current slices. Automation Prisma mode stores bot scenarios, runtime versions, publish audit rows, publish idempotency keys, bot test runs, proactive rules, execution windows, frequency caps, experiment assignments, delivery attempts, delivery idempotency keys and delivery attributions in PostgreSQL. Operations Prisma mode stores load-test, restore-check, dead-letter replay, migration rollback-check and idempotency runtime records in PostgreSQL. Platform Prisma mode stores telemetry samples, health rollups, alert routing rules, feature flag rules, platform audit/outbox rows and platform runtime descriptors in PostgreSQL. The current workspace Prisma adapter stores file metadata, antivirus scan-result metadata, scan-result callback idempotency records, client profiles, client export jobs, template records/versions/audit rows, knowledge articles, knowledge draft versions and knowledge approval decisions in PostgreSQL. Notifications Prisma mode stores inbox notifications, tenant/user preferences, browser push subscriptions, delivery descriptors and immutable preference audit events in PostgreSQL. Routing Prisma mode stores rules, queue memberships, capacity records, analytics rows, assignment/SLA/rescue job descriptors, and the conversation/operator/queue/rescue-report runtime snapshot in PostgreSQL. Reports Prisma mode stores metric definitions, metric versions, tenant overrides, saved templates, idempotency keys, export jobs, query executions, file descriptors, notification descriptors, scheduled digest descriptors and retry audit events in PostgreSQL. File upload and download policy descriptors use a server-side object storage signer: local tests fall back to `storage.local`, while runtime S3/MinIO config (`S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) produces SigV4 presigned URLs over opaque object keys, without returning tenant/file-name-derived raw `objectKey` fields in API responses. The files API exposes a guarded scan-result ingress that records `clean`, `infected` or `error` verdicts, keeps downloads fail-closed until clean results, returns `file_scan_blocked` for blocked files and replays scanner callbacks by `idempotency-key`.

`prisma:validate`, `prisma:generate`, `prisma:migrate:deploy`, `prisma:seed`, `identity:bootstrap:postgres`, `smoke:postgres` and `release:checklist` also load `.env.example` for local defaults. The Prisma schema covers the identity foundation, tenant metadata preservation, tenant users, permission roles, service-admin audit rows, service-admin impersonation/break-glass state, billing tenant state, billing-sync job descriptors, idempotent billing quota ledger entries, conversation state, workspace file metadata, workspace file scan results, scan callback idempotency, automation runtime descriptors, notification runtime descriptors, operations runtime descriptors, platform runtime descriptors, report export/runtime descriptors and transactional outbox tables. `prisma:seed` idempotently seeds tenant rows, tenant users, permission roles, billing tenant states and baseline tenant audit events while preserving live tenant status/custom metadata, live user state and live billing tariff/usage state. Prisma tenant reads normalize sparse metadata, unsupported statuses and string-array fields before returning the API read model. Confirmed service-admin user actions persist tenant user mutations and immutable audit rows through the identity repository; confirmed service-admin impersonation/break-glass state persists through the identity repository, including approve/reject/expire decision audit rows and approval-bound `break_glass_write` impersonation sessions linked by `approval_id`; confirmed billing tariff changes persist billing tenant state and pending `billing-sync` descriptors through the billing repository. Legacy quota checks remain read-only; explicit quota `record` checks require an idempotency key and persist allow/deny ledger entries across JSON and Prisma billing repositories. The outbox worker app can run bounded PostgreSQL-backed batches with `outbox:worker:once`, skip-safe provider runtime batches with `provider:outbox:smoke`, file scan batches with `file-scan:worker:once` and billing batches with `billing:worker:once`; it includes durable retry backoff/dead-letter state, atomic dead-letter replay transitions guarded by queue ownership, uses default handler registries for known identity/billing descriptors and can be driven continuously through `start:outbox-worker`, `start:file-scan-scanner-worker`, `start:outbox-bullmq-worker` or `start:billing-bullmq-worker`. Unknown event types fail closed instead of being silently published. `provider:outbox:smoke` skips unless `OUTBOX_PROVIDER_SMOKE_ENABLED=true`; backend `release:checklist` sets that env for the provider step, so local release verification seeds one Telegram, VK and MAX descriptor, runs `outbox-worker --once` through the provider-specific runtime env, and verifies three provider dispatches. `provider:telegram-live-smoke` skips unless `OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED=true`; when enabled with `OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID` and either `OUTBOX_TELEGRAM_BOT_TOKEN` or a Prisma telegram connection token, it sends one real Telegram message and verifies the outbox event is published. `provider:vk-max-live-smoke` skips unless `OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED=true`; when enabled with staged `OUTBOX_VK_ENDPOINT`/`OUTBOX_MAX_ENDPOINT` provider proxy URLs and target peer/dialog ids, it sends one VK and one MAX message through the existing HTTP proxy adapters and verifies outbox publication. Direct official VK/MAX auth, API-version and random-id semantics are still expected to live in that provider proxy or a future dedicated adapter. File-scan descriptors carry `fileId` through the scanner dispatch request; runtime scanner execution is enabled by `OUTBOX_SCANNER_ENABLED=true`, uses deterministic local mode by default (`OUTBOX_SCANNER_PROVIDER_MODE=local`), can call an external scanner with `OUTBOX_SCANNER_PROVIDER_MODE=http` plus `OUTBOX_SCANNER_URL`, supports scanner bearer auth with `OUTBOX_SCANNER_BEARER_TOKEN`, forwards optional descriptor `signedFile` access without raw `objectKey`, and posts scanner results through the configured `/files/:fileId/scan-result` callback adapter. `file-scan:api-callback-smoke` verifies that callback path through the live production-like API route and Prisma persistence when `FILE_SCAN_API_CALLBACK_SMOKE_ENABLED=true`; `file-scan:external-scanner-smoke` verifies the same live callback path with a real HTTP scanner when `FILE_SCAN_EXTERNAL_SCANNER_SMOKE_ENABLED=true` and `OUTBOX_SCANNER_URL` are supplied, and can seed optional signed-file access with `FILE_SCAN_EXTERNAL_SCANNER_SIGNED_FILE_URL`. Public demo lead notification runtime supports deterministic local mode and SMTP mode through `PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE=smtp`; SMTP mode now supports optional `AUTH PLAIN` credentials and implicit TLS/SMTPS config for external providers, `lead-notification:worker:once` verifies the SMTP path by delivering one queued descriptor through an embedded SMTP endpoint and persisting a `smtp-*` provider message id, `lead-notification:mailpit-smoke` verifies the same path against compose Mailpit when `LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED=true`, and `lead-notification:smtp-live-smoke` is a skip-safe external SMTP acceptance check gated by `LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_ENABLED=true`. `tenant-isolation:verify` runs the tenant isolation verifier contracts for tenant-owned repository/API gates. `audit-immutability:verify` runs immutable audit verifier contracts for privileged mutations, replay paths and durable audit evidence. `redaction:runtime-smoke` runs bootstrap/config, provider, scanner and export descriptor redaction smoke fixtures. `smoke:postgres` runs migration deploy and the identity seed as one PostgreSQL smoke command. `release:checklist` runs the release verification checklist: `npm run prisma:validate` for schema validation, `npm run prisma:migrate:deploy` for migrations, `npm run prisma:seed` for seed data, `npm run tenant-isolation:verify` for tenant isolation gates, `npm run audit-immutability:verify` for immutable audit gates, `npm run migration-rollback-check:verify` for migration rollback-check tooling gates, `npm run redaction:runtime-smoke` for secret redaction runtime smoke, plus `npm run outbox:worker:once`, `npm run provider:outbox:smoke`, `npm run file-scan:worker:once`, `npm run billing:worker:once`, `npm run notification:worker:once` and `npm run lead-notification:worker:once` for worker smoke coverage. Root `npm run release:gate` starts local Mailpit, runs `lead-notification:mailpit-smoke` before the product build, and runs `file-scan:api-callback-smoke`, skip-safe `file-scan:external-scanner-smoke`, skip-safe `provider:telegram-live-smoke`, skip-safe `provider:vk-max-live-smoke` and skip-safe `lead-notification:smtp-live-smoke` after production-like API readiness. Remaining provider-runtime work is executing public SDK/external SMTP smokes with real target credentials, plus direct official VK/MAX adapter work if the staging proxy is not the target integration boundary.

## Local Infrastructure

```bash
docker compose up -d postgres redis minio mailpit
```

The root `docker-compose.yml` is the fast local, non-production mode: it starts PostgreSQL, Redis, MinIO and Mailpit, but the API Gateway uses JSON-backed domain stores by default. For the guarded production-like PostgreSQL slice, use the named `prisma-postgres` compose profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres up -d --build
```

That overlay sets `RUNTIME_PROFILE=production-like`, disables demo service-admin header auth, and switches automation, identity, billing, conversation, workspace, integrations, notifications, operations, platform, quality, routing and reports repositories to Prisma. It should start without JSON fallback store blockers when those repository modes are active.

## Frontend Real API Mode

Run the API Gateway:

```bash
cd backend
npm run start:api-gateway
```

In another terminal, run the frontend:

```bash
npm run dev
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:4100`, and frontend service adapters call `/api/v1/*` by default. To call a different API host from the browser, set `VITE_API_BASE_URL`, for example:

```bash
VITE_API_BASE_URL=http://127.0.0.1:4100 npm run dev
```

Local privileged demo actions are no longer injected automatically by the frontend. Service-admin screens require a bearer session from `POST /api/v1/auth/login`. See `docs/runtime-configuration.md` for environment-specific auth and seed requirements.
