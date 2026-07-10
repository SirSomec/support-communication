# Plan: bring Support Communication to a fully working product state

> **For implementers:** REQUIRED SUB-SKILL: Use test-driven-development for each implementation phase below.

## Objective

Make the product release-ready by eliminating visible stubs, disabled planned controls, UI-only toast actions, and production-like runtime fallbacks for product-critical state.

Definition of "100% working" for this plan:

- Every visible primary action in the app either calls a real backend route and persists/audits the result, or is removed from the UI because it is outside product scope.
- Disabled controls remain only for access, validation, loading, closed-state, or genuinely unavailable external browser permissions.
- The production-like Docker profile uses durable repositories for product-critical domains, or blocks startup with an explicit configuration error.
- The release gate includes automated checks that prevent new visible stubs from entering the product.

## Current Baseline

- Local containers from the current branch were rebuilt and started through `docker compose up -d --build --force-recreate frontend api-gateway`.
- `http://127.0.0.1:8080/`, `http://127.0.0.1:8080/api/v1/health`, and `http://127.0.0.1:4101/api/v1/health` respond successfully.
- Current local verification covers full smoke, backend suite, backend build, service adapters, tenant isolation, audit immutability, quality, automation, UI mutation guards, and pilot flow tests.
- Quality manual QA / AI actions and Knowledge governance are implemented and tracked as completed in `docs/product-completeness-register.md`.
- Notification preference persistence, sound/type subscriptions, active external channel selection, critical-alert test notification creation, fail-closed channel validation, browser push subscription storage, service-worker registration, queued browser-push delivery descriptors, notification delivery worker execution, retry/failure state, and real `web-push` provider mode are implemented.
- The remaining risk is not basic startup; it is product completeness and production-like durability.

## Audit Snapshot

| Priority | Area | Evidence | Gap | Plan direction |
| --- | --- | --- | --- | --- |
| Done | Quality manual QA and AI batch actions | `src/features/quality/QualityScreen.jsx`; `src/services/qualityService.js`; `tests/quality-workflows.test.js` | Completed: controls call backend manual QA and draft-score APIs through service/action helpers with audit evidence. | Keep regression coverage in smoke and quality workflow tests. |
| Done | Knowledge review, publish, reject, status workflow, attachments | `src/features/quality/KnowledgeBaseWorkspace.jsx`; `src/services/knowledgeService.js`; `backend/apps/api-gateway/src/workspace/knowledge.controller.ts`; `backend/tests/knowledge-contracts.test.ts` | Completed: workflow and attachment controls call backend routes with persisted status transitions, immutable decision/audit evidence, and scan-policy publication checks. | Keep regression coverage in smoke, frontend workflow tests, and backend contracts. |
| Done | Notification preferences and active external channel settings | `src/features/notifications/NotificationCenter.jsx`; `src/services/notificationService.js`; `backend/apps/api-gateway/src/notifications/notification.controller.ts`; `backend/apps/api-gateway/src/integrations/seed.ts`; `backend/tests/notification-contracts.test.ts`; `backend/tests/integration-contracts.test.ts` | Completed: subscription and sound controls are backend-confirmed and audited; external critical channels load from active tenant channel connections; unknown/disabled/foreign channels fail closed; preferences persist through local JSON and production-like Prisma repositories. | Keep regression coverage in smoke, service tests, UI mutation guards, integration contracts, notification contracts, and Prisma notification repository contracts. |
| Done | Browser push subscription and notification delivery worker | `src/features/notifications/NotificationCenter.jsx`; `backend/apps/api-gateway/src/notifications/notification.service.ts`; `backend/apps/api-gateway/src/notifications/notification-delivery.worker.ts`; `backend/tests/notification-delivery-worker-contracts.test.ts` | Completed: browser push stores tenant/user PushSubscription records, registers a Vite-served service worker, uses VAPID public-key discovery, queues browser-push delivery descriptors, and `notification-delivery-worker` claims due descriptors with retry/failure state through local or real `web-push` provider mode. Browser push subscriptions and delivery descriptors have Prisma parity for production-like runtime. | Keep contract coverage for subscription storage, descriptor creation, provider adapter mapping, redacted failures, worker once command, and Prisma notification repository contracts. |
| Done | Client segmentation and export | `src/features/clients/ClientsScreen.jsx`; `backend/apps/api-gateway/src/workspace/clients.controller.ts`; `backend/tests/workspace-contracts.test.ts`; `tests/smoke.spec.js` | Completed: `/clients/segments` returns segment descriptors/counts, `/clients/exports` creates masked export descriptors with immutable audit evidence, the Clients screen applies backend segment ids plus export confirmation, and client export jobs have Prisma parity. | Keep regression coverage in workspace contracts, service route tests, UI mutation guards, and smoke. |
| Done | Shift panel mass redistribution | `src/features/panel/PanelScreen.jsx`; `backend/apps/api-gateway/src/routing/routing.service.ts`; `backend/tests/routing-contracts.test.ts`; `tests/smoke.spec.js` | Completed: panel uses backend preview/commit routes with idempotency key, capacity conflicts, immutable audit/job evidence, workload reload, and Prisma-backed batch job descriptors. | Keep regression coverage in routing contracts, service route tests, UI mutation guards, and smoke. |
| Done | Public demo/contact request | `src/features/public/LandingPage.jsx`; `src/App.jsx`; `src/services/publicLeadService.js`; `backend/apps/api-gateway/src/integrations/public-demo-request.controller.ts`; `backend/tests/public-demo-request-contracts.test.ts`; `tests/smoke.spec.js` | Completed: landing demo/contact buttons are enabled, open a real form, submit unauthenticated public requests, and backend persists sanitized lead metadata with immutable audit evidence, duplicate/rate-limit controls, and a queued notification descriptor. Lead notification worker delivery now has deterministic local coverage, embedded SMTP provider smoke through `lead-notification:worker:once`, compose Mailpit SMTP/API smoke through root `release:gate`, and skip-safe external SMTP acceptance smoke through `lead-notification:smtp-live-smoke`. | Keep backend contract, service adapter, no-visible-stubs, smoke, embedded SMTP worker-smoke, Mailpit release-gate coverage, and external SMTP acceptance smoke with target credentials. |
| Done | Settings aggregate channel status toggle | `src/features/settings/SettingsAccessPanel.jsx`; `src/app/settingsChannelActions.js`; `backend/apps/api-gateway/src/integrations/integration.controller.ts`; `backend/tests/integration-contracts.test.ts`; `tests/smoke.spec.js` | Completed: integration API owns aggregate channel type status, `PATCH /integrations/channels/types/:type/status` updates tenant connection records with immutable audit events, and Settings Access updates only after backend audit evidence. | Keep numeric limits read-only here; connection-specific edits remain in the channel connections panel. |
| Done | Audit/report deep links | `src/features/audit/AuditScreen.jsx`; `src/features/reports/ReportsScreen.jsx`; `tests/smoke.spec.js` | Completed: Audit related object opens a read-only panel with target, tenant, user, trace, and immutable status; Reports History opens backend export descriptors; Report Audit opens an embedded immutable audit descriptor panel with queue and metric-version evidence. | Keep focused smoke coverage for Reports history/audit and Audit related-object panels. |
| Done | Base reports from real tenant activity | `src/features/reports/ReportsScreen.jsx`; `backend/apps/api-gateway/src/reports/report-live-workspace.ts`; `backend/apps/api-gateway/src/reports/report.service.ts`; `backend/apps/api-gateway/src/reports/report-export.worker.ts` | Completed: new/closed conversations, first response, SLA, channel shares and charts are calculated from persisted conversations/messages for the authenticated tenant and selected period/channel. Export files use the same aggregation. Demo jobs, fake rescue rows and unsupported detailed filters are no longer shown. | Keep the live Public SDK to Reports smoke and tenant-isolation/export parity contracts in release verification. |
| Done | Direct dialog assignment and routing report bridge | `src/features/dialogs/ChatHeader.jsx`; `src/app/useConversationInbox.js`; `backend/apps/api-gateway/src/conversation/conversation.service.ts`; `backend/apps/api-gateway/src/conversation/conversation.repository.ts`; `tests/pilot-smoke.test.js` | Completed: the operator can assign or transfer any persisted SDK/Telegram dialog from the working chat screen to an active user in the same tenant. Conversation ownership, audit message, realtime event and routing analytics row commit together. The Reports screen then shows the factual assignment/transfer without fixture data. Desktop and mobile browser QA cover assignment, transfer, overflow and report counters. | Keep conversation/Prisma contracts, frontend service contracts, live pilot roundtrip and rendered desktop/mobile interaction coverage. |
| P1 | Advanced operational reports | Reports, routing, quality and conversation event models | First slice completed: the Reports screen now shows tenant-scoped operator assignment and transfer activity from `routing_analytics_rows`, with period/channel/operator/event filters and no fixture fallback. Team/topic/status/rescue/CSAT breakdowns still lack a complete historical event model. Current SLA uses the conversation's persisted outcome, not a transition ledger. | Persist topic/status, rescue outcome, SLA transition and quality events; aggregate them by historical period; then add the remaining filters, tables and export parity. |
| Done | SDK snippet and Audit JSON copy | `src/features/settings/SdkConsolePanel.jsx`; `src/features/audit/AuditScreen.jsx`; `src/services/clipboardService.js`; `tests/clipboard-service.test.js` | Completed: both buttons use Clipboard API with textarea fallback and browser smoke verifies clipboard contents. | Keep unit and smoke coverage. |
| Done | Sensitive integration admin actions | `backend/apps/api-gateway/src/integrations/integration.controller.ts`; `backend/apps/api-gateway/src/integrations/integration.module.ts`; `backend/apps/api-gateway/src/identity/seed-catalog.ts`; `src/app/integrationAdminActions.js`; `src/features/settings/AdminWorkspaces.jsx`; `backend/tests/integration-contracts.test.ts`; `backend/tests/settings-contracts.test.ts`; `tests/ui-mutation-guards.test.js` | Completed: API key rotation, webhook replay, and security-session revoke routes are guarded through tenant-operator or service-admin permissions; the seeded service-admin role and active RBAC policy include `settings.read`/`settings.manage`; Admin workspace updates local state only after backend `status: "ok"` plus rotation/replay/revoke audit evidence. Live production-like compose smoke confirms all three sensitive routes return backend audit evidence instead of `403 permission_denied`. | Keep settings/integration contracts, live service-admin route smoke, and UI mutation guards. |
| Done | Production-like persistence | `backend/packages/config/src/index.ts`, `docs/runtime-configuration.md:73`, `backend/README.md:29`, `docker-compose.pilot.yml:14` | Local compose intentionally uses JSON stores. `RUNTIME_PROFILE=production-like` now blocks explicit JSON fallback store files, and non-local runtime requires Prisma for automation, identity, billing, conversation, workspace, integrations, notifications, operations, platform, routing and reports. Automation, integrations, operations, workspace, notifications, routing, reports and platform Prisma parity are implemented for the current production-like slice. | Keep release-gate coverage for production-like startup and repository mode regressions. |
| Done | Webhook replay delivery runtime | `backend/apps/api-gateway/src/integrations/webhook-delivery.worker.ts`; `backend/apps/api-gateway/src/integrations/webhook-delivery.main.ts`; `backend/scripts/webhook-delivery-worker-smoke.mjs`; `backend/package.json`; `docker-compose.yml`; `docker-compose.pilot.yml`; `scripts/compose-health-check.mjs`; `backend/tests/integration-contracts.test.ts` | Completed: replay/delivery journal rows are claimed by `webhook-delivery-worker`, delivered through local or HTTP provider mode, and persisted as delivered, retry-scheduled, or dead-lettered with redacted failure evidence. `webhook:worker:once` seeds a Prisma row, starts a local HTTP fake provider, runs the compiled worker main, and verifies one real provider request plus delivered persistence. Production-like compose now includes `webhook-delivery-worker` and compose health requires it. | Keep the worker smoke in backend release checklist and compose health. Configure `WEBHOOK_DELIVERY_PROVIDER_MODE=http` where real webhook endpoints should be called; pilot defaults to disabled until provider dispatch is explicitly enabled. |
| Done | Telegram inbound and outbound pilot runtime | `backend/apps/api-gateway/src/integrations/telegram-polling.worker.ts`; `backend/apps/api-gateway/src/integrations/telegram-polling.main.ts`; `backend/apps/outbox-worker/src/index.ts`; `backend/scripts/telegram-polling-worker-smoke.mjs`; `docker-compose.yml`; `docker-compose.pilot.yml`; `scripts/compose-health-check.mjs` | Completed: one dedicated production-like worker reads active tenant bot connections from Prisma, persists a per-bot polling cursor across restarts, isolates provider ids by tenant and bot, and creates durable dialogs/messages. Outbound delivery is owned only by the outbox worker and persists descriptor delivery state. Live pilot evidence imported messages for `tenant-mygig` and published queued replies. | Keep polling/outbound contracts, the deterministic polling worker smoke, and the 15-service compose health check. Use a public webhook instead of polling only when a reachable HTTPS base URL is configured. |
| Done | Proactive delivery runtime | `backend/apps/api-gateway/src/automation/proactive-delivery.worker.ts`; `backend/apps/api-gateway/src/automation/proactive-delivery.main.ts`; `backend/scripts/proactive-delivery-worker-smoke.mjs`; `backend/scripts/proactive-delivery-prisma-concurrency-smoke.mjs`; `backend/tests/automation-proactive-contracts.test.ts`; `backend/tests/prisma-proactive-delivery-transaction-contracts.test.ts`; `backend/package.json`; `docker-compose.yml`; `docker-compose.pilot.yml`; `scripts/compose-health-check.mjs` | Completed for multi-replica scheduling: the compiled worker reads active visitor snapshots or fresh SDK conversation presence within TTL in Prisma mode, applies tenant-owned rules, windows, exact segment targeting, experiment assignment and frequency caps, and atomically reserves idempotency, consumes caps and writes descriptor/outbox/attempt/attribution evidence. Serializable retry handles Prisma transaction conflicts; assignment creation replays unique races. Four concurrent worker processes persist exactly one delivery and one cap use in PostgreSQL. Operations readiness exposes durable attempt evidence. | Keep both proactive worker smokes in the backend release checklist and require `proactive-delivery-worker` in compose health. Downstream provider dispatch remains owned by the existing outbox worker claim/lease boundary. |
| Done | Proactive delivery atomic reservation and multi-replica safety | `backend/apps/api-gateway/src/automation/proactive-delivery.worker.ts`; `backend/apps/api-gateway/src/automation/automation.repository.ts`; `backend/tests/prisma-proactive-delivery-transaction-contracts.test.ts`; `backend/scripts/proactive-delivery-prisma-concurrency-smoke.mjs` | Completed: one Serializable Prisma transaction reserves the tenant/rule/subject idempotency key, performs CAS cap updates, and writes outbound descriptor, outbox, attempt and attribution evidence. Unique and serialization races replay or retry safely; injected failure rolls the transaction back; two subjects competing for the final cap slot produce one queued delivery and one exhausted result. | Keep unit crash-recovery/cap-race contracts and the real PostgreSQL multi-process smoke in release verification. Revisit the idempotency scope only if product requirements allow repeat delivery after cooldown/reset. |
| Done | Public SDK non-skipping local smoke | `tests/pilot-smoke.test.js`; `scripts/release-gate.mjs`; `src/features/settings/SdkConsolePanel.jsx`; `tests/sdk-console-fail-closed.spec.js` | Completed: SDK playground is fail-closed, and the release-gate Public SDK smoke never skips or requires an external key. It creates an ephemeral Prisma operator/password/key, executes widget identify/message, operator login/reply and visitor polling against the live production-like API, then removes auth and conversation evidence. Repeated execution passes without stale state. | Keep the self-seeded live roundtrip and fail-closed browser scenarios in release verification. Use a separate environment-gated check for a real external SDK tenant/key when needed. |
| Done | Browser push production-like provider gate | `docker-compose.pilot.yml`; `tests/release-gate.test.js`; `backend/apps/api-gateway/src/notifications/notification-delivery.main.ts`; `backend/tests/browser-push-provider-gate-contracts.test.ts` | Completed: pilot disables browser push on both API and worker when no VAPID configuration exists. Explicit enablement or any VAPID key material requires `web-push` mode and a complete public/private pair before the worker can scan descriptors. Release config scrubs provider env for deterministic local verification and compose health catches worker fail-fast exits. | Keep provider-gate contracts and production-like compose health. Supply `BROWSER_PUSH_ENABLED=true`, `NOTIFICATION_DELIVERY_PROVIDER_MODE=web-push` and complete VAPID credentials together in live environments. |
| Done | MFA email OTP verification | `backend/apps/api-gateway/src/identity/auth.service.ts`; `backend/apps/api-gateway/src/identity/identity.repository.ts`; `backend/apps/api-gateway/src/identity/mfa-otp.ts`; `backend/apps/api-gateway/src/identity/mfa-otp-delivery.ts`; `backend/tests/mfa-otp-verification-contracts.test.ts`; `backend/tests/mfa-otp-delivery-contracts.test.ts`; `tests/pilot-smoke.test.js` | Completed: password login issues a cryptographically random six-digit code, persists only its HMAC, delivers it through fail-closed SMTP in production-like runtime, limits invalid attempts, consumes the challenge atomically and rejects replay. Staging no longer honors `PILOT_SKIP_MFA`; live release smokes retrieve the actual Mailpit message instead of using a fixed code. | Keep repository, delivery, tenant HTTP and live Mailpit contracts in release verification. |
| Done | Password recovery token delivery and old-session revocation | `backend/apps/api-gateway/src/identity/auth.service.ts`; `backend/apps/api-gateway/src/identity/identity.repository.ts`; `backend/apps/api-gateway/src/identity/mfa-otp.ts`; `backend/apps/api-gateway/src/identity/mfa-otp-delivery.ts`; `backend/tests/identity-contracts.test.ts`; `tests/pilot-smoke.test.js` | Completed: recovery requests do not disclose account existence or the one-time token. The token is delivered through the configured mail boundary and is single-use. Password replacement atomically revokes every older session/token pair for the account, and a new session is issued only after email OTP. | Keep deterministic delivery, SMTP staging, consume/replay, unknown-email, mandatory-OTP, repository revocation and live old-bearer rejection contracts. |
| Done | Tenant/service-admin bearer separation | `backend/apps/api-gateway/src/identity/service-admin-session.guard.ts`; `backend/tests/service-admin-session-guard.test.ts` | Completed for the current token/session model: a tenant operator bearer cannot enter service-admin routes even when its tenant permissions contain `*`; a valid service-admin bearer continues to work. | Replace the prefix-based distinction with an explicit persisted session kind when the identity schema is next revised. |
| P1 | Authenticator TOTP enrollment and recovery codes | `src/features/auth/AuthPage.jsx`; identity auth controller/service/schema | Email OTP and password-reset session revocation are operational, but authenticator-app enrollment, encrypted TOTP seeds, backup codes and self-service disable/regeneration are not implemented. | Add an encrypted MFA credential model, enrollment/verification/status endpoints, one-time recovery-code hashes and authenticated UI controls if authenticator TOTP is part of the target product. |
| Done | Release database target preflight | `backend/scripts/release-database-preflight.mjs`; `backend/scripts/release-checklist.mjs`; `scripts/release-gate.mjs`; `tests/release-gate.test.js` | Completed: migrations and seed cannot run until `DATABASE_URL` passes a local-host allowlist or a remote target is explicitly acknowledged with both an allow flag and environment name. Root release gate pins the local production-like PostgreSQL URL instead of inheriting an arbitrary caller URL. | Keep local, denied-remote and explicitly-approved-remote contracts in release verification. |
| P1 | Workers and provider runtime | `docker-compose.yml`; `docker-compose.pilot.yml`; `scripts/compose-health-check.mjs`; integration/outbox modules | Persistent compose runtime now includes `notification-delivery-worker`, `lead-notification-worker`, `webhook-delivery-worker`, `report-digest-worker`, `outbox-worker`, and `billing-sync-worker`; `file-scan-scanner-worker` is profile-gated but no longer depends on an undeclared scanner container because local deterministic scanner mode is the default. Telegram delivery in `outbox-worker` resolves active tenant bot tokens from Prisma integration state with env fallback. Operations readiness exposes queue depth, dead-letter count and last-delivery evidence for webhook, lead notification, browser push, report export, report digest, outbox, file-scan scanner and billing-sync workers. Public demo lead notification now supports SMTP provider mode with optional `AUTH PLAIN` credentials and implicit TLS/SMTPS config; `lead-notification:worker:once` verifies one SMTP delivery through an embedded SMTP endpoint, root `release:gate` verifies the same path through compose Mailpit SMTP/API, and `lead-notification:smtp-live-smoke` verifies external SMTP acceptance plus Prisma delivery persistence when target endpoint credentials are supplied. `webhook:worker:once` verifies one HTTP fake-provider delivery through the compiled worker and Prisma delivery journal. `provider:outbox:smoke` is now enabled by backend `release:checklist` and verifies Telegram, VK and MAX runtime adapters through local provider endpoints. File-scan HTTP scanner runtime now supports scanner bearer auth and safe descriptor `signedFile` access without raw object keys; dialog attachment upload now creates a real `workspaceFile`, returns client `signedUpload`, seeds scanner `signedFile` metadata, uploads bytes through the signed policy, finalizes the dialog attachment file, and polls dialog attachment status until scan-ready/blocked/failed. Root `release:gate` also verifies file-scan scanner callback delivery through the live production-like API route and Prisma persistence, plus skip-safe external scanner, Telegram live provider, VK/MAX live provider-proxy, and external SMTP acceptance smokes when their explicit env gates are enabled. Remaining provider-runtime work is executing live/staging public SDK and external SMTP checks with real credentials, adding mailbox/inbox validation only if required, direct official VK/MAX adapter work if provider proxy is not the target boundary, non-skipping scanner auth/signed-file execution against the chosen scanner endpoint, and stricter scan-worker finalize gating only if that endpoint cannot tolerate early scan retries. | Keep provider runtime smoke in the checklist, Mailpit smoke, webhook worker smoke, file-scan API callback smoke, skip-safe external scanner smoke, skip-safe Telegram live smoke, skip-safe VK/MAX proxy smoke, and skip-safe external SMTP acceptance smoke in the root release gate; add live/staging credentials for public SDK, external SMTP and the chosen scanner endpoint when target environments are available. |
| P1 | Security and release hardening | `backend/apps/api-gateway/src/main.ts:31`, runtime docs | Production blocks demo service-admin headers, but release still needs a single gate for env, secrets, audit, backups, and npm audit triage. | Add release checklist command that includes stub scan, production-like compose smoke, secret redaction, backup/restore smoke, and dependency triage. |

## Phase 0: Product Scope Lock And Stub Gate

Deliverables:

- Create `docs/product-completeness-register.md` with every current visible incomplete control, owner, desired user outcome, backend route, tests, and release status.
- Add an automated stub guard test, for example `tests/no-visible-stubs.test.js`, scanning production UI code for phrases such as `ожидает backend`, `ожидает API`, `будет доступ`, `не имеет готов`, `read-only preview`, `coming soon`, and permanently disabled primary actions.
- Maintain a small allowlist for legitimate disabled states: access denied, loading, form validation, closed conversations, browser permission denied.
- Add the guard to the regular verification command used before releases.

Acceptance:

- New visible stubs fail CI unless registered as intentionally out of scope.
- The register contains zero unclassified product-facing gaps.

Verification commands:

```bash
npm run test:no-demo-runtime
npm run test:services
npm run test:ui-mutation-guards
npm run test:smoke
```

## Phase 1: Connect Existing Quality APIs

Backend work:

- Confirm contracts for `POST /quality/manual-reviews`, `POST /quality/draft-score`, and `POST /quality/draft-scores` in `backend/apps/api-gateway/src/quality/quality.controller.ts`.
- Ensure manual QA review and AI batch scoring emit immutable audit evidence and refresh `GET /quality/workspace` data.

Frontend work:

- Extend `src/services/qualityService.js` with `recordManualQaReview(payload)` and `scoreDraftResponses(payload)` if the batch alias is needed by the screen.
- Replace disabled controls in `src/features/quality/QualityScreen.jsx` with real handlers:
  - "Низкие оценки" filters low-score/manual-review queue.
  - "AI-проверка" submits batch scoring for selected or visible conversations.
  - "Проверить" opens or submits a manual QA review.
  - AI suggestion actions call a backend mutation or are removed if not a committed feature.

Tests:

- Backend contract tests for manual review idempotency, tenant isolation, and audit rows.
- Frontend service tests for success/error envelopes.
- Smoke coverage proving the buttons are enabled for a permitted admin and disabled only for missing access.

Acceptance:

- No Quality button remains disabled because of missing backend.
- Manual review and AI scoring results survive reload and appear in audit/workspace data.

## Phase 2: Complete Knowledge Governance

Backend work:

- Extend `backend/apps/api-gateway/src/workspace/knowledge.controller.ts` with routes:
  - `POST /knowledge/:articleId/submit-review`
  - `POST /knowledge/:articleId/approve`
  - `POST /knowledge/:articleId/reject`
  - `POST /knowledge/:articleId/publish`
  - `POST /knowledge/:articleId/archive`
  - `POST /knowledge/:articleId/attachments`
  - `DELETE /knowledge/:articleId/attachments/:attachmentId`
- Persist article status transitions, approval history, version references, attachment descriptors, scan state, and audit events.
- Enforce allowed transitions: draft to review, review to approved/rejected, approved to published, published to archived.

Frontend work:

- Add knowledge service methods in `src/services/knowledgeService.js`.
- Enable status workflow controls in `src/features/quality/KnowledgeBaseWorkspace.jsx`.
- Keep direct status select disabled unless it becomes an explicit admin-only override with audit reason.
- Use the existing file descriptor/scan policy for article attachments.

Tests:

- Backend transition tests for valid/invalid status moves and tenant isolation.
- Frontend workflow tests for draft save, submit review, approve, publish, reject, and attachment delete.
- Playwright smoke for a complete article lifecycle.

Acceptance:

- Article governance works end to end without local-only approval history.
- Attachments cannot be published until clean scan status is confirmed.

## Phase 3: Notification Preferences And Delivery

Backend work:

- Add notification preference persistence:
  - muted notification types,
  - sound rule preferences,
  - external critical channel routes backed by active tenant channel connections,
  - test critical alert dispatch.
- Add routes under `backend/apps/api-gateway/src/notifications/notification.controller.ts`:
  - `GET /notifications/preferences`
  - `PATCH /notifications/preferences`
  - `POST /notifications/test-critical-alert`

Completed on 2026-07-03:

- `GET/PATCH /notifications/preferences` persist durable tenant/user preferences via `NOTIFICATION_STORE_FILE`.
- Preference updates emit immutable audit evidence.
- External critical channel ids are validated through tenant-owned active `IntegrationRepository` channel connections.
- NotificationCenter loads external delivery channels from `/integrations/channels` instead of a hard-coded list.
- Critical alert test creates a visible backend notification and fails closed for missing/disabled/foreign channels or browser push without a subscription.
- `GET /notifications/push-subscriptions/public-key`, `POST /notifications/push-subscriptions`, and `DELETE /notifications/push-subscriptions/:subscriptionId` are implemented.
- Browser push enablement registers `/browser-push-service-worker.js`, calls `PushManager.subscribe`, stores sanitized subscription/audit evidence in `NotificationRepository`, and updates UI state only after immutable backend audit evidence.
- Critical alert browser push no longer returns a synthetic queued result; it writes a queued `browser-push.critical-alert.test` delivery descriptor tied to the stored subscription id and endpoint hash.
- `notification-delivery-worker` claims due queued browser-push descriptors, resolves active PushSubscription records, calls a provider port, records delivered provider message ids, retries transient failures with redacted errors, and marks missing/revoked subscriptions failed.
- Runtime supports `NOTIFICATION_DELIVERY_PROVIDER_MODE=local` for deterministic local compose and `NOTIFICATION_DELIVERY_PROVIDER_MODE=web-push` with `BROWSER_PUSH_PRIVATE_KEY`/`BROWSER_PUSH_SUBJECT` for real provider dispatch.

Remaining provider-runtime work:

- Add staging/live provider smoke with real VAPID keys and browser endpoints when secrets and target environment are available.

Frontend work:

- Extend `src/services/notificationService.js`.
- Enable controls in `src/features/notifications/NotificationCenter.jsx`.
- Treat browser permission denial as a real browser state, not a product stub.

Tests:

- Preference persistence contract tests.
- UI tests for toggling subscriptions, sound rules, external routes, and test alert.
- Smoke test confirming preferences survive reload.

Acceptance:

- Notification settings alter actual backend state.
- Test critical alert creates a visible notification or outbound delivery descriptor.

## Phase 4: Clients Segmentation And Export

Backend work:

- Extend clients API in `backend/apps/api-gateway/src/workspace/clients.controller.ts`:
  - `GET /clients/segments` for available segment descriptors and counts.
  - `GET /clients/export` or `POST /clients/exports` for export jobs/descriptors.
- Persist export jobs with audit event, tenant ownership, status, file descriptor, and redacted sensitive fields.

Completed on 2026-07-03:

- Added `GET /clients/segments` and `POST /clients/exports`.
- Segment descriptors include channel/device/topic counts and `segmentId` filters are accepted by `GET /clients`.
- Export descriptors are saved in the durable workspace JSON repository with masked preview rows and immutable audit evidence.
- `clientService`, `submitClientExport`, and `ClientsScreen` now use backend-confirmed segment/export state.

Frontend work:

- Add `fetchClientSegments` and `createClientExport` to `src/services/clientService.js`.
- Enable Segment and Export controls in `src/features/clients/ClientsScreen.jsx`.
- Show export status using the same descriptor pattern as reports.

Tests:

- Backend tests for segment filters, export idempotency, masking, and tenant isolation.
- Frontend tests for segment selection, export creation, and error states.

Acceptance:

- Segment and Export controls perform real data operations and have deterministic empty/error states.

## Phase 5: Routing Batch Redistribution

Completed on 2026-07-03:

- Added `POST /routing/redistribution/preview` and `POST /routing/redistribution/commit`.
- Reused assignment candidate ranking for single simulation and batch redistribution with virtual planned capacity.
- Added idempotency-key based redistribution ids/job ids, conflict responses for capacity gaps, immutable audit descriptors, queue job descriptors, realtime descriptors, and assignment analytics rows.
- Replaced the disabled panel action with a backend-backed preview/confirm dialog and workload refresh after commit.

Backend work:

- Add batch routes to `backend/apps/api-gateway/src/routing/routing.controller.ts`:
  - `POST /routing/redistribution/preview`
  - `POST /routing/redistribution/commit`
- Use existing assignment/simulation logic as the core engine where possible.
- Require idempotency key, reason, selected queues, target rules, and operator capacity constraints.
- Persist audit events and assignment descriptors.

Frontend work:

- Add `previewRedistribution` and `commitRedistribution` to `src/services/routingService.js`.
- Replace the disabled button in `src/features/panel/PanelScreen.jsx` with a preview modal and confirm action.
- Show capacity conflicts and SLA impact before commit.

Tests:

- Backend tests for preview, commit, idempotency, capacity limits, and tenant isolation.
- UI tests for preview modal, confirm, conflict display, and reload persistence.

Acceptance:

- A permitted shift lead can redistribute workload from the panel and see the resulting queue/operator state refresh from API.

## Phase 6: Public Demo Request

Completed on 2026-07-03:

- Added unauthenticated `POST /api/v1/public/demo-requests` under the integrations/public boundary.
- Stored sanitized lead metadata in `IntegrationRepository` with request fingerprint, idempotency-key conflict detection, hashed IP/User-Agent context, immutable audit event, and queued `public.demo_request.notification.requested` descriptor.
- Added spam controls for honeypot payloads and duplicate fingerprints.
- Added `src/services/publicLeadService.js`, enabled landing demo/contact CTAs from `src/App.jsx`, and added a modal form in `src/features/public/LandingPage.jsx`.
- Added backend contract tests, frontend service adapter coverage, and public landing smoke coverage.

Remaining delivery note:

- The current product stores a queued notification descriptor and has deterministic plus SMTP `lead-notification:worker:once` provider boundaries that mark descriptors delivered or failed with redacted error evidence. The backend release smoke runs the worker in SMTP mode against an embedded SMTP endpoint and persists a `smtp-*` provider message id; the root release gate also runs `lead-notification:mailpit-smoke` against compose Mailpit SMTP/API and skip-safe `lead-notification:smtp-live-smoke` against an external SMTP endpoint when credentials are supplied.

Backend work:

- Done: add a public route, `POST /public/demo-requests`, with validation, rate limiting, spam controls, and audit/notification descriptor.
- Done: store lead metadata without sensitive overcollection: name, company, email, message, source, plan interest, consent flag, hashed request context, and request fingerprint.
- Done: deliver queued descriptors through `lead-notification:worker:once` with deterministic local provider evidence, SMTP provider evidence and redacted failure state.
- Done: run the same SMTP mode against compose Mailpit through `lead-notification:mailpit-smoke` in root `release:gate`.
- Done: support external SMTP credentials and implicit TLS/SMTPS through `PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME`, `PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD`, `PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE`, and `PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED`.
- Done: add skip-safe external SMTP acceptance smoke through `lead-notification:smtp-live-smoke` in root `release:gate`; it validates SMTP acceptance and Prisma delivery persistence when `LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_ENABLED=true` and target credentials are supplied.

Frontend work:

- Done: add a small request modal/form to `src/features/public/LandingPage.jsx`.
- Done: pass `demoRequestEnabled` and `onRequestDemo` from `src/App.jsx`.
- Done: add service method under `src/services/publicLeadService.js`.

Tests:

- Done: public API validation/rate-limit/idempotency tests.
- Done: landing page smoke for enabled button and successful submission. Validation/network error UI coverage remains a useful follow-up.

Acceptance:

- "Демо по запросу" and "Контакт по запросу" are enabled and create a backend lead/request.

## Phase 7: Settings, Audit, Reports, And Clipboard Actions

Completed on 2026-07-03:

- Added `src/services/clipboardService.js` with Clipboard API write, textarea fallback, and fail-closed unavailable state.
- Wired Audit event JSON and SDK snippet copy buttons to the real clipboard service.
- Added unit coverage for Clipboard API, fallback, and unavailable paths, plus smoke coverage that reads clipboard contents in Chromium.
- Replaced Audit related-object toast with an embedded read-only panel that preserves the selected event context and shows target, tenant, user, trace, and immutable evidence.
- Replaced Reports History and export Audit toasts with visible panels backed by report workspace export job descriptors, including backend queue id and metric definition version.
- Wired Settings aggregate channel status to integration-owned backend mutation `PATCH /integrations/channels/types/:type/status`; UI updates only after matching backend channel state plus immutable audit evidence.

Settings:

- Done: integration/channel management API owns aggregate channel status; Settings Access calls it through `integrationService.updateChannelTypeStatus`.
- Done: UI mutation guard requires immutable audit evidence before changing the aggregate toggle state.
- Done: numeric channel limits remain read-only in this panel because connection-specific settings own limit mutations.

Audit and reports:

- Done: `src/features/audit/AuditScreen.jsx` related-object action opens a read-only panel instead of a toast.
- Done: JSON copy uses actual clipboard write with fallback.
- Done: `src/features/reports/ReportsScreen.jsx` History and Audit actions open embedded panels from backend export descriptors instead of toasts.

SDK:

- Done: `src/features/settings/SdkConsolePanel.jsx` copy uses `navigator.clipboard.writeText` with fallback through `clipboardService`.

Tests:

- Done: UI tests for channel status mutation in `tests/smoke.spec.js` and `tests/ui-mutation-guards.test.js`.
- Done: Audit/report panel tests in `tests/smoke.spec.js`.
- Done: Clipboard success and fallback tests.

Acceptance:

- No primary UI action only displays a success toast without doing the claimed operation.

## Phase 8: Production-Like Persistence Parity

Completed on 2026-07-03:

- Added `RUNTIME_PROFILE=production-like` config validation.
- `NODE_ENV=staging|production` and production-like profile now require `AUTOMATION_REPOSITORY`, `IDENTITY_REPOSITORY`, `BILLING_REPOSITORY`, `CONVERSATION_REPOSITORY`, `WORKSPACE_REPOSITORY`, `INTEGRATION_REPOSITORY`, `NOTIFICATION_REPOSITORY`, `OPERATIONS_REPOSITORY`, `PLATFORM_REPOSITORY`, `ROUTING_REPOSITORY`, and `REPORT_REPOSITORY` to be `prisma`.
- Production-like startup no longer needs a JSON fallback store blocker for platform when `PLATFORM_REPOSITORY=prisma`.
- `docker-compose.pilot.yml` declares `RUNTIME_PROFILE=production-like`, supplies local pilot JWT/public API secrets, and no longer enables demo service-admin headers.
- Workspace Prisma parity now includes client export jobs.
- Routing Prisma parity now includes assignment/SLA/rescue job descriptors and a PostgreSQL-backed runtime snapshot for conversation/operator/queue state plus rescue report rows.
- Routing SLA/rescue workers now claim due jobs through repository-owned compare-and-set updates, so a completed or already-claimed job is not overwritten by a stale worker snapshot.
- Routing SLA/rescue apply workers now re-read the authoritative current job row and current conversation state before mutation, and Prisma `saveState()` fails snapshot-version races before writing side-table jobs/analytics/rules.
- Routing SLA/rescue apply outcomes now persist through repository-owned apply hooks. Prisma mode wraps job completion, snapshot state, rescue report rows, analytics rows, and returned descriptors in the routing transaction boundary. Rescue auto-return analytics resolve tenant ownership from the apply input or conversation snapshot before falling back for legacy snapshots.
- Reports Prisma parity now includes bootstrap via `REPORT_REPOSITORY=prisma`, metric definitions/versions/overrides, saved templates, idempotency keys, export jobs, query executions, export file descriptors, notification descriptors, scheduled digest descriptors, and immutable retry audit events.
- Notifications Prisma parity now includes bootstrap via `NOTIFICATION_REPOSITORY=prisma`, inbox notifications, tenant/user preferences, browser push subscriptions, delivery descriptors, and immutable preference audit events.
- Automation Prisma parity now includes bootstrap via `AUTOMATION_REPOSITORY=prisma`, bot scenarios, runtime versions, publish audit rows, publish idempotency keys, bot test runs, proactive rules, execution windows, frequency caps, experiment assignments, delivery attempts, delivery idempotency keys, delivery attributions, and async proactive eligibility/planning helpers.
- Integrations Prisma parity now includes bootstrap via `INTEGRATION_REPOSITORY=prisma`, public API keys/reveal state/rotation audit, rotation jobs, public demo request lead/audit/notification descriptors, webhook delivery/replay journals and audit events, security sessions, channel connections/events/audit events, Telegram connection state, and async runtime readers for notification, Telegram polling, Telegram webhook and outbound dispatch paths.
- Operations Prisma parity now includes bootstrap via `OPERATIONS_REPOSITORY=prisma`, load-test runs/executions/metrics/error summaries, restore checks/results, dead-letter replay records/audit/denials, migration rollback-check records/results and idempotency keys.
- Platform Prisma parity now includes bootstrap via `PLATFORM_REPOSITORY=prisma`, telemetry samples, health rollups, alert routing rules, feature flag rules, platform audit/outbox rows, incidents, incident idempotency keys, feature flag runtime state, alert acknowledgements and incident communication attempts/retries/dead letters.

Backend work:

- Continue hardening provider/runtime smoke for product-critical repositories now that production-like Prisma repository coverage is complete.

Runtime work:

- Update `docker-compose.pilot.yml` to use Prisma repositories for all product-critical state.
- Keep root `docker-compose.yml` clearly local-only.
- Update `docs/runtime-configuration.md` and `backend/README.md` only after the implementation is real.

Tests:

```bash
npm run backend:release:checklist
npm run backend:tenant-isolation:verify
npm run backend:audit-immutability:verify
docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres up -d --build
curl.exe -fsS http://127.0.0.1:8080/api/v1/health
curl.exe -fsS http://127.0.0.1:4101/api/v1/health
```

Acceptance:

- Production-like profile does not rely on JSON for product-critical mutable state.
- Release docs no longer describe repository gaps as follow-up work.

## Phase 9: Workers And External Provider Runtime

Completed on 2026-07-04:

- Added production-like compose services for `outbox-worker` and `billing-sync-worker`.
- `outbox-worker` runs `apps/outbox-worker/dist/main.js` continuously against PostgreSQL and is scoped to `OUTBOX_QUEUE=message-delivery`.
- `billing-sync-worker` runs `apps/outbox-worker/dist/main.js --billing-sync` continuously against PostgreSQL and is scoped to `OUTBOX_QUEUE=billing-sync`.
- `docker-compose.pilot.yml` now applies `RUNTIME_PROFILE=production-like` and durable database env to both workers.
- `scripts/compose-health-check.mjs` now fails release verification when either persistent worker is missing or stopped.
- `tests/release-gate.test.js` covers both compose services, their production-like env, and the health-check guard.
- `outbox-worker` Telegram delivery now supports async tenant credential resolution and reads active Prisma `telegram_connections` rows when `INTEGRATION_REPOSITORY=prisma`, with `OUTBOX_TELEGRAM_BOT_TOKEN` as fallback.
- `file-scan-scanner-worker` now supports `OUTBOX_SCANNER_PROVIDER_MODE=local` as the default scanner-runtime mode, using a deterministic local scanner without requiring an undeclared `scanner` compose service. Explicit `OUTBOX_SCANNER_PROVIDER_MODE=http` plus `OUTBOX_SCANNER_URL` keeps external scanner delivery available.

Completed on 2026-07-05:

- Operations readiness now exposes `report-digest-worker` from durable `reports.scheduledDigestDescriptors` evidence with queue depth, dead-letter count and last delivery status.
- Release gate now includes pilot-flow, settings runtime, service-admin runtime and live backend API smoke coverage.
- Live backend API smoke now authenticates through `POST /api/v1/auth/tenant/login` and bearer tenant routes instead of demo service-admin headers.
- Operations readiness now exposes `file-scan-scanner-worker` from durable `database.outboxEvents` queue `file-scan` evidence, and service-admin renders the worker row with queue depth, dead-letter count, evidence source and last-delivery event type/status/trace.

Remaining provider-runtime work:

- Done: add `provider:outbox:smoke` for Telegram, VK and MAX runtime adapters. Direct runs skip safely unless `OUTBOX_PROVIDER_SMOKE_ENABLED=true`; backend `release:checklist` sets that env and verifies provider-specific `OUTBOX_TELEGRAM_*`, `OUTBOX_VK_*` and `OUTBOX_MAX_*` dispatch against local endpoints.
- Done: add a non-skipping self-seeded `test:pilot-smoke` to `release:gate` after compose readiness. It creates its temporary Prisma operator/key, verifies the complete Public SDK roundtrip, and cleans up without external credentials.
- Done: add the production-like browser-push provider gate. Pilot disables the API feature when credentials are absent; explicit enablement or key material requires live `web-push` mode and complete VAPID credentials before worker scanning.
- Done: add compose Mailpit SMTP/API smoke through `lead-notification:mailpit-smoke` in root `release:gate` after local infrastructure startup.
- Done: add external SMTP auth and implicit TLS/SMTPS configuration support plus skip-safe `lead-notification:smtp-live-smoke` in root `release:gate`; non-skipping execution still requires real target credentials.
- Done: add `file-scan:api-callback-smoke` to root `release:gate` after production-like API readiness; it checks worker-to-API scan-result callback delivery and Prisma persistence.
- Done: add skip-safe `file-scan:external-scanner-smoke` to root `release:gate` after production-like API readiness; it runs only with `FILE_SCAN_EXTERNAL_SCANNER_SMOKE_ENABLED=true` and a real `OUTBOX_SCANNER_URL`.
- Done: add HTTP scanner provider auth through `OUTBOX_SCANNER_BEARER_TOKEN` plus safe descriptor `signedFile` payload forwarding without raw `objectKey`; external scanner smoke can seed `FILE_SCAN_EXTERNAL_SCANNER_SIGNED_FILE_URL` for real provider checks.
- Done: connect dialog attachment producer to real workspace file state and object-storage signing: `dialogs/attachments` returns `signedUpload`, stores the internal file record, seeds scanner `signedFile`, the composer uploads bytes to the signed policy, calls `dialogs/attachments/:fileId/finalize`, and polls `dialogs/attachments/:fileId/status` until the backend reports scan-ready, blocked, failed, or still pending.
- Done: add `webhook-delivery-worker` runtime with `webhook:worker:once`, compiled main, local/HTTP/disabled provider modes, retry/dead-letter persistence with redacted provider errors, production-like compose service, compose health requirement, and Prisma fake-provider smoke that verifies one real HTTP delivery attempt.
- Done: add skip-safe `provider:telegram-live-smoke` to root `release:gate`; it sends one real Telegram message only when `OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED=true`, `OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID` and a Telegram token source are supplied.
- Done: add skip-safe `provider:vk-max-live-smoke` to root `release:gate`; it sends one VK and one MAX message through staged HTTP provider proxy endpoints only when `OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED=true`, endpoint env and peer/dialog ids are supplied.
- Remaining: run live/staging public SDK and non-skipping external SMTP smokes with real target credentials; add mailbox/inbox validation only if required; add direct official VK/MAX adapter contracts if provider proxy is not the intended integration boundary; run scanner auth/signed-file smoke against the chosen scanner endpoint and add strict scan-worker finalize gating only if that endpoint cannot tolerate upload/scan retry timing.

Backend work:

- Add service-specific worker commands and Docker services for outbox, billing, scanner, notification delivery, report export, webhook replay, and channel outbound delivery.
- Add live/staging credentials for public SDK and external SMTP smoke execution; add direct official VK/MAX adapter contracts if the provider proxy is not the intended integration boundary; run external scanner smoke with provider auth/file-content access against the chosen scanner and add strict scan-worker finalize gating only if required.
- Ensure idempotent retries, dead-letter replay, redaction, and immutable audit evidence.

Frontend/admin work:

- Surface worker health, queue depth, dead-letter count, and last delivery evidence in operations/service-admin screens.

Tests:

- Worker once commands for every critical queue.
- Fake-provider integration tests for outbound, inbound webhook, retry, and replay.
- Optional sandbox smoke gated by environment variables.

Acceptance:

- Critical async workflows continue after API process restart and can be observed/replayed safely.

## Phase 10: Release Gate

Add a single release command or documented sequence that must pass before the product is called 100% working:

```bash
npm run test:no-demo-runtime
npm run test:services
npm run test:api-client
npm run test:ui-mutation-guards
npm run test:smoke
npm run test:pilot-flow
npm run test:settings-runtime
npm run test:service-admin-runtime
npm run backend:test
npm run backend:tenant-isolation:verify
npm run backend:audit-immutability:verify
npm run backend:release:checklist
npm run backend:notification:worker:once
npm run build
docker compose -f docker-compose.yml -f docker-compose.pilot.yml --profile prisma-postgres up -d --build
curl.exe -fsS http://127.0.0.1:8080/
curl.exe -fsS http://127.0.0.1:8080/api/v1/health
curl.exe -fsS http://127.0.0.1:4101/api/v1/health
RUN_BACKEND_API_SMOKE=1 BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1 npm run test:backend-api-smoke
```

The release gate also includes:

- Stub guard has zero findings outside the scope register.
- `npm audit` findings are triaged into fixed, accepted-with-reason, or blocked-with-owner.
- Backup/restore smoke exists for PostgreSQL and object storage metadata.
- Browser smoke covers admin, operator, landing/onboarding, clients, quality, notifications, panel, settings, reports, audit, and service-admin paths.

Completed on 2026-07-03:

- Backend `release:checklist` now includes `notification:worker:once` alongside outbox and billing worker once smokes.
- Root `npm run release:gate` now provides the single Phase 10 command for UI stub/demo guards, frontend service/API/smoke tests, backend release checklist, build, production-like compose startup, and HTTP health checks.
- Production-like compose now runs `notification-delivery-worker` with staging/production-like Prisma notification repository configuration instead of inheriting local JSON/dev worker settings.
- Backend `release:checklist` now includes `lead-notification:worker:once` for public demo request lead notification descriptors.

Completed on 2026-07-04:

- Release-gate compose contract now requires persistent `outbox-worker` and `billing-sync-worker` services.
- `node scripts/compose-health-check.mjs` now checks 11 production-like services, including `outbox-worker`, `billing-sync-worker`, `notification-delivery-worker`, `lead-notification-worker`, and `report-digest-worker`.

Completed on 2026-07-05:

- Root `npm run release:gate` now blocks on `npm run test:pilot-flow`, `npm run test:settings-runtime`, `npm run test:service-admin-runtime`, and live bearer-authenticated `npm run test:backend-api-smoke` after compose and HTTP readiness.
- The release-gate contract covers the new runtime suites and the env-enabled backend API smoke command.
- Operations readiness and service-admin runtime tests now cover `file-scan-scanner-worker` observability from durable outbox queue evidence.
- Backend `release:checklist` now includes `provider:outbox:smoke` with `OUTBOX_PROVIDER_SMOKE_ENABLED=true`; it seeds one Telegram, VK and MAX queued descriptor and verifies three provider-specific runtime dispatches through local provider endpoints.
- Root `npm run release:gate` now starts local infrastructure before backend release checklist, scrubs live provider env from compose startup, and includes skip-safe `npm run test:pilot-smoke` after compose readiness with `BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1` and `PILOT_PUBLIC_API_ENVIRONMENT=stage`.
- Root `npm run release:gate` now runs `lead-notification:mailpit-smoke` after backend `release:checklist` with `LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED=true`, Mailpit API `http://127.0.0.1:18025`, and SMTP `127.0.0.1:11025`.
- Public demo lead notification SMTP now supports optional external SMTP credentials and implicit TLS/SMTPS configuration, with backend contracts covering `AUTH PLAIN` command order and secure SMTP delivery against a local TLS SMTP server.
- Root `npm run release:gate` now includes skip-safe `lead-notification:smtp-live-smoke`; with `LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_ENABLED=true` and real SMTP endpoint credentials it verifies external SMTP acceptance plus persisted `smtp-*` delivery evidence.
- Root `npm run release:gate` now runs `file-scan:api-callback-smoke` after production-like API readiness with `FILE_SCAN_API_CALLBACK_SMOKE_ENABLED=true`, host PostgreSQL `DATABASE_URL`, and `BACKEND_API_BASE_URL=http://127.0.0.1:4101/api/v1`.
- Root `npm run release:gate` now also includes skip-safe `file-scan:external-scanner-smoke` after production-like API readiness; it only calls a real scanner when `FILE_SCAN_EXTERNAL_SCANNER_SMOKE_ENABLED=true` and `OUTBOX_SCANNER_URL` are supplied.
- Root `npm run release:gate` now also includes skip-safe `provider:telegram-live-smoke`; it only sends a real Telegram message when `OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED=true`, `OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID`, and a Telegram token source are supplied.
- Root `npm run release:gate` now also includes skip-safe `provider:vk-max-live-smoke`; it only calls staged VK/MAX provider proxy endpoints when `OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED=true`, endpoint env and peer/dialog ids are supplied.

Completed on 2026-07-10:

- Added the persistent `proactive-delivery-worker` runtime, compiled once entrypoint and JSON-store smoke. The worker reads configured active visitor snapshots and uses active durable conversation rows as the production-like Prisma source when automation state has no visitor rows.
- Eligible deliveries now persist outbound descriptor/outbox, attempt, idempotency and A/B attribution evidence, consume frequency caps once, reject segment and tenant mismatches, and replay without duplicate delivery records even when the polling timestamp changes. Production-like visitor fallback uses fresh SDK conversations within a configurable TTL.
- Proactive rules now carry tenant ownership in JSON and Prisma, API reads are tenant-filtered, foreign rule-id overwrites fail closed, and the worker is visible in Operations readiness through durable delivery-attempt evidence.
- Local and production-like Compose include the worker; compose health now requires 14 services and the backend release checklist runs `proactive-delivery:worker:once`.
- Proactive persistence now uses a Serializable Prisma transaction with bounded `P2034`/CAS retry. Idempotency reservation, cap consumption, descriptor, outbox, attempt and attribution commit or roll back together; concurrent assignment creation replays the winning row after `P2002`.
- Added fake-transaction crash-recovery and final-cap contention contracts plus `proactive-delivery:prisma-concurrency-smoke`, which runs four compiled workers against PostgreSQL and verifies one durable delivery. Backend release verification now explicitly regenerates Prisma Client before runtime smokes.
- SDK playground success is fail-closed on backend evidence. Focused Playwright coverage verifies ok, non-ok, rejected and malformed service responses.
- Public SDK release smoke is non-skipping and self-seeded through Prisma, including isolated operator auth and cleanup.
- Browser push production-like startup now fails closed when the feature is enabled without a live provider or complete VAPID pair; the default pilot profile disables the feature consistently on API and worker.

## Recommended Execution Order

1. Keep Phase 0 active, because it prevents new stubs while implementation proceeds.
2. Keep completed Phase 4-8 regression tests in the release gate.
3. Add authenticator TOTP enrollment and recovery codes only if they are part of the target authentication requirements; verified email OTP is complete.
4. Finish the remaining security/release hardening gaps, including real backup/restore execution, migration rollback coverage and dependency triage evidence.
5. Continue Phase 9 external provider work: live/staging external SMTP execution with target credentials, scanner auth/signed-file execution, and direct VK/MAX adapters only if the provider proxy is not the intended boundary.
6. Finish Phase 10 by making the release gate green end to end in the target environment, including Docker image pulls/builds, compose health and HTTP readiness.

## Product Decisions To Make Before Implementation

- Keep and implement every visible planned control, or remove the ones that are not in the committed product scope. Default for this plan is to implement all visible controls found in the audit.
- Decide whether Panel redistribution is truly batch redistribution or should become a smaller single-assignment workflow based on the existing routing API.
- Aggregate channel status belongs to the integration/channel management API and is surfaced in Settings Access as a backend-confirmed bulk toggle; connection-specific limits remain in the channel setup screens.
- Decide what "100% working" means for external providers without live credentials: sandbox/fake-provider passing is required; live smoke can be environment-gated.
- Decide whether proactive delivery is lifetime-once per tenant/rule/subject, as implemented now, or repeats after cooldown/frequency-period reset. Repeat delivery requires a period/cooldown scope in descriptor and idempotency keys.
