# Backend Platform Implementation Plan

> **For agentic workers:** implement this plan task-by-task. Keep checkboxes current. Use TDD for behavior changes and request review after each meaningful slice.

**Goal:** build a production backend for the omnichannel support communication platform, replacing frontend mock/service adapters with real APIs, events, queues, storage, security, audit and operations.

**Architecture:** microservice-oriented backend from the start, delivered through one backend monorepo, shared packages and bounded contexts. The web app and SDK enter through API Gateway, realtime gateway and public webhooks. Internal effects use transactional outbox, Redis/BullMQ jobs and explicit service boundaries.

**Tech Stack:** Node.js, TypeScript, NestJS, PostgreSQL, Prisma, Redis, BullMQ, S3-compatible object storage, OpenAPI, WebSocket/SSE, Docker Compose, structured logs and OpenTelemetry.

Version: 1.1
Updated: 2026-06-29
Status: approved backend plan after stack agreement. Contract slices through Phase 10 are implemented in the gateway; JSON-backed identity/billing/conversation/workspace persistence, runtime repository bootstrap for those durable stores, Prisma-backed identity/billing/conversation repository adapters, Prisma-backed workspace file metadata, scan-result and scan callback idempotency adapter foundation, S3-compatible object storage signed URL foundation, safe idempotent Prisma identity/billing seed scripts, PostgreSQL migrate+seed smoke verification, production bearer service-admin context, Prisma/PostgreSQL schema/migration foundation, tenant user directory/RBAC role read-side storage, durable service-admin user actions/audit rows, durable service-admin impersonation/break-glass state with approval-bound write impersonation, durable billing tariff-change state/job descriptors, conversation outbound descriptors with transactional outbox writes and idempotency fingerprint replay/conflict guards, idempotent billing quota ledger records, billing sync worker execution state and outbox publisher abstractions are implemented as the first durable foundation. Full service persistence and remaining workers remain follow-up work.

Basis: [functional-requirements-support-communication-platform.md](functional-requirements-support-communication-platform.md), [frontend-development-plan.md](frontend-development-plan.md), frontend service adapters in `src/services/`.

## 1. Agreed Decisions

- Backend is not a temporary BFF and not a modular monolith. It is designed as a microservice architecture from the first phase.
- Complexity is reduced by one backend monorepo, shared packages, one local Docker Compose and one observability style.
- PostgreSQL is the source of truth. Each service owns its own schemas/tables and migrations.
- Services do not use distributed transactions. External effects go through transactional outbox and BullMQ jobs.
- External API starts with REST + OpenAPI. GraphQL is not introduced in the first stage because the current frontend already uses service adapters and envelope responses.
- Realtime is required for chats, delivery status, notifications, presence, rescue countdown and bot handoff events.
- Privileged actions require server-side permission checks, reason/confirmation policy and immutable audit events.

## 2. Architecture Principles

1. **API Gateway is the only external entry point for the web app.**
   It validates auth/session, tenant context, request IDs, basic payload shape and routes requests to backend services.

2. **SDK/Public API is separate from operator/admin API.**
   SDK and public channels use separate keys, limits, signatures, sandbox/prod environments and idempotency keys.

3. **Tenant isolation is a backend invariant.**
   Tenant-owned data has `tenant_id`, repository-level filters and DB constraints for critical tables.

4. **Events do not replace the source of truth.**
   PostgreSQL stores canonical state; Redis/BullMQ handles queues, fan-out and retry.

5. **Outbox is required for external effects.**
   Message delivery, webhooks, export-ready notifications, bot handoff, quality scoring and billing state changes must be outbox-driven in production.

6. **Frontend envelope remains the contract.**
   Every response returns `service`, `operation`, `status`, `traceId`, `updatedAt`, `states`, `meta`, `data`, `error`.

7. **Microservices do not read each other's tables directly.**
   Read models are built through events or explicit internal APIs.

## 3. Backend Monorepo Structure

```text
backend/
  apps/
    api-gateway/
    realtime-gateway/
    auth-service/
    tenant-service/
    rbac-service/
    conversation-service/
    message-service/
    channel-service/
    client-profile-service/
    template-knowledge-service/
    routing-sla-service/
    report-service/
    integration-webhook-service/
    file-service/
    automation-bot-service/
    quality-ai-service/
    billing-service/
    audit-service/
    platform-admin-service/
    incident-service/
    feature-flag-service/
    notification-service/
  packages/
    contracts/
    database/
    events/
    envelope/
    auth-context/
    observability/
    testing/
    config/
  prisma/
  docker/
  docs/
```

Rules:

- `apps/*` contain NestJS applications or workers.
- `packages/contracts` contains DTOs, event contracts, shared enum definitions and OpenAPI helpers.
- `packages/envelope` contains the shared response/error envelope.
- `packages/events` contains outbox descriptor helpers, in-memory outbox store and publisher abstractions now and will grow into event names, idempotency helpers and queue names.
- `packages/auth-context` contains sync/async service-admin bearer session resolution now and will grow into tenant guards, role claims and policy helpers.
- `packages/database` contains durable store abstractions, JSON file adapter, Prisma client/transaction helpers and Prisma outbox store adapter now and will grow into full service repositories.

## 4. Service Boundaries

| Service | Responsibility | Primary state | Frontend surface |
| --- | --- | --- | --- |
| `api-gateway` | External REST API, auth/session checks, OpenAPI, request envelope normalization | no canonical domain state | all web app routes |
| `realtime-gateway` | WebSocket/SSE subscriptions, presence, typing, delivery updates | connection/session projections | dialogs, notifications |
| `auth-service` | Login, MFA, sessions, SSO hooks, recovery | credentials, sessions, auth events | `authService` |
| `tenant-service` | Organization provisioning, modules, limits, environments | tenants, environments, settings | `tenantService` |
| `rbac-service` | Roles, permissions, ABAC decisions, denial audit | roles, grants, policy versions | `permissionService` |
| `conversation-service` | Dialog lifecycle, statuses, topics, internal notes | conversations, status history | `dialogService` |
| `message-service` | Messages, drafts, read/delivery state, idempotent send API | messages, deliveries, drafts | `dialogService` |
| `channel-service` | SDK, Telegram, MAX, VK connectors and channel health | channels, credentials references | `integrationService`, `dialogService` |
| `client-profile-service` | Client profiles, identities, merge graph, masking | profiles, identities, merge graph | `clientService` |
| `template-knowledge-service` | Templates, knowledge base, article versions, approval | templates, articles, versions | `templateService`, quality UI |
| `routing-sla-service` | Operator workload, routing rules, SLA timers, rescue | queues, assignments, SLA events | dialogs, panel, visitors |
| `report-service` | Metric definitions, reports, async exports | metric definitions, report jobs | `reportService` |
| `integration-webhook-service` | API keys, webhooks, signatures, retry journal | key metadata, webhooks, deliveries | `integrationService` |
| `file-service` | Upload descriptors, scan state, signed download policies | attachment metadata, scan results | `dialogService` |
| `automation-bot-service` | Rule builder, bot flows, publish/runtime versions, handoff | automation rules, bot flows, runtime events | `automationService` |
| `quality-ai-service` | CSAT/CSI, manual QA, pre-send checks, AI scoring telemetry | quality checks, scores, AI audit references | `qualityService` |
| `billing-service` | Tariffs, subscriptions, quotas, invoices | plans, subscriptions, quota ledger | billing UI |
| `audit-service` | Append-only audit log, export, redaction overlays | audit events, redaction records | audit UI |
| `platform-admin-service` | Service-admin orchestration and impersonation | admin approvals, impersonation sessions | service admin |
| `incident-service` | Incidents, maintenance windows, postmortems | incidents, updates, windows | service admin |
| `feature-flag-service` | Rollouts, tenant targeting, internal tests | flags, rules, evaluations | service admin |
| `notification-service` | Notifications, subscriptions, browser push descriptors | notifications, delivery state | notification center |

## 5. API Contract

- Base path: `/api/v1`.
- API documentation: `/api/docs`.
- Every response uses the shared backend envelope.
- Error responses still use the envelope with `status` one of `invalid`, `denied`, `not_found`, `conflict`, `rate_limited`, `error`.
- Mutating requests use idempotency where repeated delivery is possible: message send, inbound events, webhook replay, report export, bot publish, invitation and upload finalize.
- `X-Request-Id` is accepted and normalized into `traceId`/logs.

API groups:

- `/api/v1/auth/*`
- `/api/v1/tenants/*`
- `/api/v1/permissions/*`
- `/api/v1/dialogs/*`
- `/api/v1/messages/*`
- `/api/v1/channels/*`
- `/api/v1/clients/*`
- `/api/v1/templates/*`
- `/api/v1/knowledge/*`
- `/api/v1/routing/*`
- `/api/v1/reports/*`
- `/api/v1/integrations/*`
- `/api/v1/webhooks/*`
- `/api/v1/files/*`
- `/api/v1/automation/*`
- `/api/v1/quality/*`
- `/api/v1/billing/*`
- `/api/v1/audit/*`
- `/api/v1/service-admin/*`
- `/api/v1/incidents/*`
- `/api/v1/feature-flags/*`
- `/api/v1/notifications/*`

Realtime events must include `eventId`, `tenantId`, `occurredAt`, `traceId`, `schemaVersion`, `resourceType`, `resourceId` and compact `data`.

Required realtime event families include `conversation.updated`, `message.created`, `message.delivery.updated`, `assignment.changed`, `sla.timer.updated`, `rescue.countdown.updated`, `bot.handoff.created`, `quality.score.updated`, `notification.created`, `export.ready`, `incident.updated`.

## 6. Data, Events and Security

- PostgreSQL stores canonical domain data, outbox rows, audit rows and reporting read models.
- Redis stores job queues, short-lived locks, realtime fan-out, throttling counters and presence.
- S3-compatible storage stores attachments, report exports, audit exports, knowledge attachments and generated public assets.
- Stable tenant/file-name-derived object storage keys are not exposed directly to frontend; download/upload flows return short-lived signed URLs over opaque storage locators only.
- Timestamps are UTC. User-facing timezone conversion happens in DTOs or frontend formatting.
- Sensitive fields are masked by policy before leaving service boundaries.
- Raw API key/token secrets are shown only once and otherwise stored hashed/encrypted.
- Service admin identity is separate from organization admin.
- Impersonation is read-only by default, time-limited, reason-required and audited.

Required queues:

- `message-delivery`
- `channel-inbound-normalization`
- `webhook-delivery`
- `report-export`
- `file-scan`
- `notification-delivery`
- `quality-ai-scoring`
- `bot-runtime`
- `proactive-delivery`
- `rescue-return`
- `billing-sync`
- `audit-export`
- `platform-metrics-rollup`

## 7. Phased Implementation Plan

### Phase 0. Foundation

Status 2026-06-28: implemented first backend monorepo foundation with shared config, envelope, observability, testing helpers, API Gateway shell, OpenAPI docs, local Docker Compose config, durable JSON store foundation, Prisma/PostgreSQL schema and migrations for identity/outbox/service-admin audit/impersonation/break-glass/billing/conversation/workspace file metadata state rows, approval-bound write impersonation session binding and idempotent billing quota ledger entries, runtime repository bootstrap behind `IDENTITY_REPOSITORY`/`BILLING_REPOSITORY`/`CONVERSATION_REPOSITORY`/`WORKSPACE_REPOSITORY`, a shared JSON/Prisma repository bootstrap helper, Prisma-backed identity, billing, conversation and workspace file metadata repository adapters with frontend-safe tenant/conversation projections, JSON-backed conversation repository for dialogs/messages/inbound idempotency/realtime/outbound descriptor events, safe idempotent Prisma identity/billing seed scripts, verified local PostgreSQL migrate+seed smoke command, release checklist command for schema validation, migration deploy, seed and worker smoke coverage, outbox descriptors/publisher abstractions, runnable outbox worker foundation, sync/async service-admin bearer context resolution, durable worker retry/backoff/dead-letter state for outbox plus billing sync jobs, atomic dead-letter replay transitions for outbox and billing sync queues guarded by `id` + `queue` + `dead_lettered` status, default production worker handler registries for known identity/billing/conversation/file descriptors, reusable fail-closed worker handler registry lookup for outbox and billing sync queues, a BullMQ worker bridge mode over the existing one-shot pollers and a database ownership map that assigns every current Prisma table to one service owner.

- [x] Create backend monorepo structure.
- [x] Implement shared envelope package.
- [x] Implement config validation and trace ID middleware.
- [x] Implement NestJS API Gateway shell, health/readiness and OpenAPI.
- [x] Add local Docker Compose config shell.
- [x] Add database/events/auth-context package foundations with JSON durable store, outbox descriptors and sync/async service-admin bearer context resolution.
- [x] Add Prisma/PostgreSQL foundation with identity/outbox schema, tenant metadata preservation, initial migration, schema-drift contract, validation/generation scripts, transaction helper, Prisma outbox store adapter and lease-based outbox publisher abstraction.
- [x] Add Prisma-backed identity repository adapter for tenants, MFA challenges, service-admin sessions, tenant audit events and identity outbox writes behind `IDENTITY_REPOSITORY=prisma`.
- [x] Add billing repository bootstrap for JSON and Prisma adapters behind `BILLING_REPOSITORY=prisma`.
- [x] Add Prisma service-admin impersonation and break-glass approval schema/migration plus JSON/Prisma repository coverage.
- [x] Add approval-bound `break_glass_write` impersonation mode with persisted `approval_id` binding across JSON and Prisma adapters.
- [x] Add frontend-safe Prisma tenant projection for sparse/malformed tenant metadata, unsupported statuses and sanitized string arrays.
- [x] Add safe idempotent Prisma identity seed/bootstrap scripts for tenant rows, tenant metadata and baseline tenant audit events while preserving live tenant status/custom metadata and healing malformed canonical metadata.
- [x] Add Prisma billing tenant state and billing-sync job schema/migration plus seed coverage that preserves live tariff, revenue, ARR and usage state.
- [x] Add explicit idempotent billing quota ledger records across JSON/Prisma adapters while preserving legacy read-only quota checks.
- [x] Add runnable outbox worker app with one-shot mode, queue/limit/lease configuration, non-overlapping publish loops and fail-safe unknown-handler behavior.
- [x] Add release smoke command wiring for PostgreSQL migration deploy plus identity seed verification.
- [x] Run migration deploy smoke against live PostgreSQL in local Docker and wire it into release verification command.
- [x] Complete live PostgreSQL seed execution in local Docker.
- [x] Add durable worker retry backoff and terminal dead-letter state for outbox events and billing sync jobs across in-memory/Prisma stores and worker runtime config.
- [x] Add default worker handler registries and CLI wiring for known identity outbox events and provider billing sync event families instead of empty production handler maps.
- [x] Add BullMQ worker bridge mode and scripts for outbox and billing sync polling jobs, with Redis config parsing and non-overlapping one-shot processors.
- [x] Add JSON-backed conversation repository and Prisma/PostgreSQL storage foundation for conversations, messages, inbound idempotency and realtime events.
- [x] Add API Gateway runtime bootstrap for the default JSON-backed conversation repository behind `CONVERSATION_REPOSITORY=json` and `CONVERSATION_STORE_FILE`.
- [x] Add Prisma-backed conversation repository adapter and runtime bootstrap behind `CONVERSATION_REPOSITORY=prisma`.
- [x] Add durable conversation outbound descriptors and transactional outbox writes for reply delivery, attachment upload and proactive outbound requests across JSON/Prisma adapters.
- [x] Add Prisma-backed workspace file metadata schema, migration and repository adapter foundation behind `WORKSPACE_REPOSITORY=prisma`.
- [x] Slice 0.1: add a database ownership map for every remaining service schema in `backend/docs/` and assert it from `backend/tests/prisma-outbox-contracts.test.ts`.
- [x] Slice 0.2: add shared repository bootstrap helpers for JSON/Prisma fallback selection and cover them in `backend/tests/persistent-foundation-contracts.test.ts`.
- [x] Slice 0.3: add a reusable worker handler registration contract for queue descriptors and cover fail-closed unknown descriptors in `backend/tests/outbox-worker-contracts.test.ts`.
- [x] Slice 0.4: add a common dead-letter replay helper for outbox-backed queues and cover retry/dead-letter state transitions in `backend/tests/outbox-worker-contracts.test.ts`.
- [x] Slice 0.5: add a release verification checklist command that runs schema validation, migrations, seed and worker smoke commands, then document it in `backend/README.md`.

### Phase 1. Identity, tenants and RBAC

Status 2026-06-29: implemented first gateway contract slice for auth, tenants and permission decisions, including password/MFA lifecycle descriptors, one-time MFA challenge consumption, persistent service-admin sessions, tenant status transitions, repository-backed tenant user detail projection, repository-backed permission-role read decisions, durable service-admin user action persistence/audit rows, fail-closed unknown role/session handling and JSON/Prisma identity repository adapters for the current slice. Slice 1.1 is complete: password credential hashes, password policy state and immutable credential audit events now persist across JSON and Prisma identity repositories, and service-admin password verification fails closed before MFA challenge creation while recording credential audit metadata. Slice 1.2 is complete: service-admin access/refresh token pairs, token rotations and token revocations now persist across JSON and Prisma identity repositories; HTTP and realtime production bearer paths resolve raw access tokens through hashed token storage while preserving session-id fallback; idempotency-key reuse and token-hash reuse fail closed. Slice 1.3 is complete: OIDC provider config and callback descriptors persist across JSON and Prisma identity repositories with schema, migration and ownership coverage; auth routes create replay-safe OIDC callback descriptors, validate state for success and provider-error callbacks, and reject replayed callbacks. Slice 1.4 is complete: SAML provider metadata, ACS descriptors and assertion replay rows persist across JSON and Prisma, ACS request descriptors are consumed once, assertion replay handles Prisma unique races and expired/duplicate SAML assertions return fail-closed envelopes. Slice 1.5 is complete: RBAC policy versions, role grants and permission denial events persist across JSON and Prisma, default policy/grants seed from existing roles, permission checks consume active grants fail-closed and service-admin guard denials write immutable denial rows. Slice 1.6 is complete: malformed persisted RBAC grant effects fail closed, active-policy selection is deterministic with previous active policies retired, seed bootstrap preserves one-active-policy invariant, PostgreSQL constrains grant effects and one active policy, and RBAC grant/denial tables enforce policy/tenant/role referential integrity plus immutable denial rows.

- [x] Implement auth/tenant/RBAC contract slice.
- [x] Add immutable audit metadata for login/logout and tenant status changes.
- [x] Add server-side RBAC denial envelope and unknown-role fail-closed behavior.
- [x] Add persistent identity repository for tenants, MFA challenges, service-admin sessions, tenant status audit events and identity outbox descriptors.
- [x] Add persistent tenant user directory and permission-role read-side storage for tenant detail/RBAC decisions across JSON and Prisma adapters.
- [x] Add persistent service-admin user actions and immutable service-admin audit rows for 2FA reset, forced logout, block/unblock and invite resend across JSON and Prisma adapters.
- [x] Slice 1.1: persist password credential hashes, password policy state and credential audit events across JSON/Prisma identity repositories.
- [x] Slice 1.2: persist refresh/session token lifecycle with revoke/rotate idempotency and cover production bearer validation paths.
- [x] Slice 1.3: persist OIDC provider config, login callback descriptors and issuer/audience validation metadata.
- [x] Slice 1.4: persist SAML provider metadata, ACS request descriptors and replay-safe assertion IDs.
- [x] Slice 1.5: persist RBAC policy versions, role grants and tenant-scoped permission denials with fail-closed fallback tests.
- [x] Slice 1.6: harden RBAC policy/grant constraints and referential integrity from review findings.

### Phase 2. Conversations, messages, channels and realtime

Status 2026-06-29: implemented first gateway contract slice for dialogs, messages, channel inbound/outbound descriptors and realtime event feeds. Dialog status changes, appended messages, inbound idempotency keys, realtime events and outbound delivery/upload/proactive request descriptors now persist through JSON-backed and Prisma-backed conversation repositories wired into API Gateway runtime defaults. PostgreSQL/Prisma table foundations exist for conversations, messages, inbound events, realtime events and conversation outbound descriptors. Reply delivery writes conversation/message/realtime state with its outbox event in one repository transaction, while reply/upload/proactive outbound requests support idempotency-key replay and conflict detection via request fingerprints. The realtime gateway now exposes authenticated SSE and WebSocket replay endpoints over persisted conversation realtime events at `/api/v1/realtime/events/stream` and `/api/v1/realtime/events/socket`, with canonical `(occurredAt, eventId)` ordering plus timestamp, relative `now-*` and `Last-Event-ID` cursor replay semantics. The outbox worker now has injectable external channel connector and file-scan worker foundations that resolve canonical outbound descriptors by `descriptorId`, propagate stable idempotency keys and fail closed on malformed connector payloads. Worker runtime wiring can now read Prisma-backed outbound descriptors, dispatch configured HTTP channel/file adapters with bounded sanitized failures, and fail closed instead of silently publishing external delivery events when runtime adapters are absent. Slice 2.1 is complete: Telegram delivery now has a dedicated connector port with sendMessage DTO validation, required idempotency/trace propagation, sanitized provider failures for non-OK and thrown errors, explicit runtime config parsing behind disabled-by-default `OUTBOX_TELEGRAM_*` settings, runtime message-delivery routing and repeated-dispatch idempotency coverage. Slice 2.2 is complete: VK/MAX connector ports now validate per-channel DTO/capability differences, runtime VK/MAX connectors are disabled by default with endpoint-required enabled config, provider failures/timeouts are bounded and sanitized, and worker dispatch fails before provider calls for unsupported MAX attachments or VK proactive delivery. Slice 2.3 is complete: channel delivery receipts now have Prisma schema, SQL migration, ownership mapping, JSON/Prisma repository storage with provider-event replay, Prisma unique-race handling, channel ingestion runtime mapping to persisted `message.delivery.updated` realtime events and duplicate replay hardening that avoids duplicate realtime updates. Slice 2.4 is complete: Redis realtime fan-out now has deterministic adapter contracts, disabled-by-default runtime env wiring, service-level fan-out for inbound/internal/reply/delivery realtime events, best-effort degraded publish behavior, malformed Redis message filtering and fail-closed Redis URL parsing. Slice 2.5 is complete: persisted replay and live Redis-delivered realtime events now merge through a shared canonical `(occurredAt, eventId)` helper with duplicate suppression, event-id/timestamp cursor filtering, SSE `Last-Event-ID` precedence and WebSocket replay parity across multi-instance scenarios.

- [x] Implement dialog list/detail and status transition contracts.
- [x] Add close guard requiring topic selection.
- [x] Add internal-comment filtering for outbound delivery.
- [x] Add idempotent inbound channel normalization descriptors.
- [x] Add realtime event feed shell.
- [x] Add JSON-backed persistent conversation/message/inbound/realtime repository foundation.
- [x] Add API Gateway runtime bootstrap for JSON-backed conversation persistence.
- [x] Add Prisma conversation storage schema and additive migration foundation.
- [x] Add Prisma-backed conversation repository adapter and runtime bootstrap for conversations, messages, inbound idempotency and realtime events.
- [x] Add persistent outbound delivery/upload/proactive descriptors with transactional outbox events for `message-delivery` and `file-scan` queues.
- [x] Add outbound idempotency-key replay and reused-key conflict detection with stored request fingerprints.
- [x] Add authenticated SSE replay stream for persisted conversation realtime events.
- [x] Add realtime replay cursor semantics for `since` timestamps, relative `now-*` windows and SSE `Last-Event-ID` over canonical `(occurredAt, eventId)` ordering.
- [x] Add authenticated WebSocket replay runtime for persisted conversation realtime events.
- [x] Add external channel connector worker foundation for message delivery/proactive outbound descriptor dispatch with typed validation and idempotency propagation.
- [x] Add attachment upload worker foundation for file-scan descriptors.
- [x] Add Prisma-backed runtime descriptor lookup plus HTTP channel/file adapter wiring with fail-closed missing-adapter behavior and API-boundary payload validation.
- [x] Slice 2.1: add provider adapter contracts for Telegram delivery with sanitized failures and idempotency propagation.
- [x] Slice 2.2: add provider adapter contracts for VK/MAX delivery with per-channel capability validation.
- [x] Slice 2.3: persist channel delivery receipts and map them into `message.delivery.updated` realtime events.
- [x] Slice 2.4: add Redis-backed realtime fan-out adapter behind the existing SSE/WebSocket replay API.
- [x] Slice 2.5: add multi-instance realtime cursor tests proving event ordering across persisted and Redis-delivered events.

### Phase 3. Files, clients, templates and knowledge base

Status 2026-06-29: implemented first gateway contract slice for clients, files, templates and knowledge. File download policy is server-owned/fail-closed, only issues signed URLs after uploaded+clean scan state, returns explicit `file_scan_blocked` denials for infected scan results, and client phone masking is server-side. Client profile read state, merge/unmerge descriptors, file upload metadata, saved templates and knowledge draft state now have a JSON-backed durable workspace repository and API Gateway runtime bootstrap via `WORKSPACE_STORE_FILE`, so client merge descriptors, upload descriptors, finalize state, scan-result state, scan callback idempotency, download-policy lookups, template saves and knowledge drafts survive service instances. Workspace file metadata, scan-result metadata and scan callback idempotency now also have tenant-owned Prisma/PostgreSQL schema, additive migrations and repository adapter foundation behind `WORKSPACE_REPOSITORY=prisma`; non-file workspace state still uses the configured JSON fallback in that mode until client/template/knowledge tables are implemented. Upload/download policy now signs server-owned opaque object URLs through an injectable object storage port with an S3-compatible SigV4 signer for MinIO/S3 runtime config, and tenant ownership comes from server context rather than upload request bodies. The guarded files API can record antivirus verdicts and download readiness with `idempotency-key` replay/conflict guards, attachment upload descriptors propagate `fileId` into file-scan requests, and the scanner execution worker now consumes `file-scan` descriptors, calls runtime scanner adapters, posts scan-result callbacks, and handles retry, dead-letter and sanitized failure state. Upload descriptor creation now enforces attachment channel capability, optional tenant quota checks and pending upload metadata-state limits before object-key generation, persistence or storage signing; all blocked upload responses include safe denial/audit descriptors without object-key exposure.

- [x] Implement client profile read model and merge/unmerge descriptors.
- [x] Add JSON-backed durable workspace client profile read state and merge/unmerge descriptor persistence.
- [x] Implement upload/finalize/download-policy descriptors.
- [x] Add JSON-backed durable workspace file metadata repository and runtime bootstrap for upload/finalize/download-policy state.
- [x] Add JSON-backed durable workspace template and knowledge article repository state for saved templates and draft versions.
- [x] Implement template save/version audit descriptors.
- [x] Implement knowledge article detail/draft contracts.
- [x] Add Prisma/PostgreSQL workspace file metadata schema, migration and repository adapter foundation.
- [x] Add S3-compatible object storage signed upload/download URL foundation.
- [x] Add guarded antivirus scan-result ingress with durable scan verdict metadata and blocked-download policy.
- [x] Add idempotent scanner callback replay/conflict guards for file scan results across JSON and Prisma workspace repositories.
- [x] Slice 3.1: persist client profile identities, merge graph edges and merge conflicts in Prisma workspace tables.
- [x] Slice 3.2: persist template records, versions and audit rows in Prisma with JSON fallback parity tests.
- [x] Slice 3.3: persist knowledge articles, draft versions, approval decisions and publication state in Prisma.
- [x] Slice 3.4: add object storage completion verification for upload finalize, including size/checksum mismatch denials.
- [x] Slice 3.5: add antivirus scanner execution worker that consumes `file-scan` requests and calls `/files/:fileId/scan-result`.
- [x] Slice 3.6: enforce channel attachment limits and quota checks before upload descriptor creation.

### Phase 4. Routing, SLA and rescue

Status 2026-06-29: implemented first gateway contract slice for operator workload, assignments, SLA pause/resume, rescue timers and rescue reports. Chat limits are server-enforced and override cannot bypass full operators. Routing conversations, operators, queues, assignment job descriptors, SLA timer jobs and rescue report rows now have a JSON-backed durable routing repository and API Gateway runtime bootstrap via `ROUTING_STORE_FILE`. Routing rules, queue membership rows and operator capacity records now also have tenant-owned Prisma/PostgreSQL schema, additive migrations and JSON/Prisma repository adapters behind `ROUTING_REPOSITORY=prisma`; assignment/SLA/rescue runtime state still uses the configured JSON fallback in that mode until those tables are implemented. Workload reads are side-effect free, rescue return descriptors use the `rescue-return` queue, rescue reports preserve the previous operator attribution after queue return/miss, and default local routing stores are isolated by service/environment/port. Update 2026-06-30: Phase 4 is complete; routing analytics rows cover assignment, transfer, rescue and auto-return runtime writes, Prisma persistence, workload aggregates and rescue report aggregates. Slice 4.4 review-hardening is also complete; rescue-return jobs preserve conversation ownership, claim/apply workers re-read current job state before mutation, resolveRescue rescue-return jobs carry worker-required fields, and partial routing repository seeds are type-aligned with runtime normalization.

- [x] Implement workload and queue health read model.
- [x] Implement assignment actions with channel access and chat limit checks.
- [x] Implement SLA pause descriptors and resume job shell.
- [x] Implement rescue start/resolve with server-owned timers and duplicate guard.
- [x] Implement rescue report descriptor and workload counter consistency checks.
- [x] Add JSON-backed durable routing state for assignments, SLA timer jobs and rescue report rows.
- [x] Slice 4.1: persist routing rules, queue membership and operator capacity in Prisma with JSON fallback parity.
- [x] Slice 4.2: add assignment simulation service for candidate ranking and explainable routing decisions.
- [x] Slice 4.3: add SLA timer BullMQ worker that resumes paused timers and emits overdue descriptors.
- [x] Slice 4.4: add rescue-return BullMQ worker that returns expired rescue assignments to the correct queue.
- [x] Slice 4.5: persist routing outcome analytics rows for assignment, transfer, rescue and auto-return events.

### Phase 5. Reports, exports and metric definitions

Status 2026-06-28: implemented first gateway contract slice for reports and exports: `/api/v1/reports/workspace`, `/api/v1/reports/exports`, `/api/v1/reports/exports/:jobId/retry`, `/api/v1/reports/exports/:jobId/file`. The slice covers `metrics/v1`, rescue report rows, idempotent export queue requests with request fingerprinting, retry guards and permission-aware file descriptors that do not expose object keys. Report export jobs and idempotency fingerprints now have a JSON-backed durable report repository and API Gateway runtime bootstrap via `REPORT_STORE_FILE`, so queued exports and retry state survive service instances.

- [x] Implement report workspace, metric version and export job contract slice.
- [x] Add async export queue descriptor through `report-export` queue shell.
- [x] Add idempotency fingerprint conflict handling.
- [x] Add retry status guard for failed/expired exports only.
- [x] Add fail-closed public file descriptor endpoint.
- [x] Add JSON-backed durable report export job and idempotency state with runtime bootstrap.
- [x] Milestone 5.1: metric definitions, versions and tenant overrides are complete after all one-approach items passed targeted tests and review-driven hardening.
- [x] Milestone 5.2: durable report query execution is complete after rescue/conversation metrics, execution status, parameters and failure envelopes passed targeted tests.
- [x] Milestone 5.3: report export worker and signed object descriptors are complete after export serialization, object writes, signed descriptors, persistence, retry/dead-letter and permission-scoped descriptor lookup passed targeted tests.
- [x] Milestone 5.4: saved report templates and scoped visibility are complete after template persistence, Prisma adapter coverage, role/permission visibility, hidden/cross-tenant denials and replay-safe idempotency passed targeted tests.
- [x] Milestone 5.5: scheduled digest descriptors and digest worker are complete after due-period claim, export job creation, run status persistence, notification descriptor emission and duplicate/conflict period-key hardening passed targeted tests and review.

### Phase 6. Public API, webhooks, integrations and SDK environments

Status 2026-06-28: implemented first gateway contract slice for integrations and security operations: `/api/v1/integrations/workspace`, `/api/v1/integrations/channel-tests`, `/api/v1/integrations/api-keys/:keyId/rotate`, `/api/v1/integrations/webhooks/deliveries/:deliveryId/replay`, `/api/v1/integrations/security/sessions/:sessionId/revoke`. API key rotation descriptors, webhook replay idempotency journal entries and revoked security session state now have a JSON-backed durable integration repository and API Gateway runtime bootstrap via `INTEGRATION_STORE_FILE`.

- [x] Implement integration workspace read model with masked API key previews.
- [x] Implement sandbox/prod channel test metadata.
- [x] Implement channel test validation and delivery descriptors.
- [x] Implement API key rotation descriptor without raw key material.
- [x] Implement webhook replay idempotency with original trace ID preservation.
- [x] Implement session revoke audit descriptor.
- [x] Add JSON-backed durable API key rotation, webhook replay journal and revoked security session state.
- [x] Milestone 6.1: hashed public API keys, reveal state and rotation audit are complete after the 14 one-approach items from `6.1.hashed-key-contract` through `6.1.reveal-replay-hardening`.
- [x] Slice 6.2: add request authentication middleware for public API keys with sandbox/prod environment isolation.
- [x] Milestone 6.3: signed inbound webhook verification and replay nonce storage are complete after the 11 one-approach items from `6.3.timestamp-contract` through `6.3.replay-envelope-runtime`.
- [x] Milestone 6.4: webhook delivery retry journal and worker execution are complete after the 11 one-approach items from `6.4.journal-contract` through `6.4.dead-letter-readside`.
- [x] Milestone 6.5: public OpenAPI docs and example contracts are complete after the 11 one-approach items from `6.5.api-key-openapi` through `6.5.runtime-smoke`.

### Phase 7. Automation, bots, proactive and quality

Status 2026-06-28: implemented first gateway contract slice for automation, bot runtime descriptors, proactive rules and quality scoring: `/api/v1/automation/workspace`, `/api/v1/automation/bot-flow/validate`, `/api/v1/automation/bot-flows/validate`, `/api/v1/automation/bots/:scenarioId/publish`, `/api/v1/automation/bot-scenarios/:scenarioId/publish`, `/api/v1/automation/bot-scenarios/:scenarioId/test-runs`, `/api/v1/automation/proactive-rules`, `/api/v1/automation/handoff-events`, `/api/v1/automation/bot-handoffs`, `/api/v1/quality/workspace`, `/api/v1/quality/draft-score`, `/api/v1/quality/draft-scores`, `/api/v1/quality/ratings`, `/api/v1/quality/manual-reviews`. Bot publish scenarios, publish idempotency fingerprints, proactive rules and bot test-run descriptors now have a JSON-backed durable automation repository and API Gateway runtime bootstrap via `AUTOMATION_STORE_FILE`.

- [x] Implement automation workspace with bot scenarios, proactive rules, runtime metrics and audit events.
- [x] Implement bot flow validation, import payload normalization and frontend-compatible route aliases.
- [x] Implement idempotent bot publish descriptors with runtime version, queue and audit metadata.
- [x] Implement bot test-run descriptors.
- [x] Implement proactive rule descriptors with targeting, frequency cap, experiment ID and audit metadata.
- [x] Implement bot handoff summary realtime event descriptors.
- [x] Implement quality workspace, pre-send draft scoring, explainability, repair actions and AI telemetry.
- [x] Implement client quality rating links to conversation, channel and operator.
- [x] Implement manual QA review descriptors with override audit metadata.
- [x] Add JSON-backed durable bot publish, proactive rule and bot test-run state with runtime bootstrap.
- [x] Milestone 7.1: bot scenario definitions, versions and publish audit rows are complete after the 14 one-approach items from `7.1.scenario-contract` through `7.1.version-visibility-hardening`.
- [x] Milestone 7.2: bot runtime worker step execution is complete after the 9 one-approach items from `7.2.state-contract` through `7.2.malformed-scenario-hardening`.
- [x] Milestone 7.3: proactive execution windows, caps and experiments are complete after the 12 one-approach items from `7.3.window-contract` through `7.3.cap-reset-hardening`.
- [x] Milestone 7.4: proactive delivery worker descriptors are complete after the 6 one-approach items from `7.4.contract` through `7.4.persistence-attribution`.
- [x] Milestone 7.5: quality scoring adapter and sanitized telemetry are complete after the 9 one-approach items from `7.5.provider-port-contract` through `7.5.persistence-failures`.
- [x] Milestone 7.6: quality ratings, manual QA and AI scoring audit rows are complete after the 21 one-approach items from `7.6.rating-contract` through `7.6.scoring-audit-immutability-hardening`.

### Phase 8. Billing, quotas and service administration

Status 2026-06-28: implemented first gateway contract slice for billing, quotas and service-admin privileged workflows: `/api/v1/billing/tariffs`, `/api/v1/billing/tariff-preview`, `/api/v1/billing/tenants/:tenantId/tariff-change/preview`, `/api/v1/billing/tenants/:tenantId/tariff-change`, `/api/v1/billing/tenants/:tenantId/tariff`, `/api/v1/billing/tenants/:tenantId/subscription`, `/api/v1/billing/tenants/:tenantId/invoices`, `/api/v1/billing/provider-sync`, `/api/v1/billing/quota-checks`, `/api/v1/quotas/tenants/:tenantId`, `/api/v1/quotas/check`, `/api/v1/quotas/reservations`, `/api/v1/quotas/reservations/:reservationId/commit`, `/api/v1/quotas/reservations/:reservationId/release`, `/api/v1/service-admin/users`, `/api/v1/service-admin/users/:userId/2fa-reset`, `/api/v1/service-admin/users/:userId/mfa/reset`, `/api/v1/service-admin/users/:userId/force-logout`, `/api/v1/service-admin/users/:userId/sessions/logout`, `/api/v1/service-admin/users/:userId/block`, `/api/v1/service-admin/users/:userId/unblock`, `/api/v1/service-admin/users/:userId/invite/resend`, `/api/v1/service-admin/impersonations/start`, `/api/v1/service-admin/impersonations`, `/api/v1/service-admin/impersonations/:impersonationId/stop`, `/api/v1/service-admin/break-glass/approvals`, `/api/v1/service-admin/break-glass/approvals/:approvalId/decision`, `/api/v1/service-admin/break-glass-approvals`, `/api/v1/service-admin/break-glass-approvals/:approvalId/decision`, `/api/v1/service-admin/audit-events`. Confirmed service-admin user actions now update repository-backed tenant users and write immutable service-admin audit rows across JSON and Prisma adapters. Confirmed service-admin impersonation start/stop, pending break-glass approval state and approve/reject/expire break-glass decisions now persist across JSON and Prisma adapters; write impersonation now fails closed unless a matching, unexpired, approved `impersonation.write` approval is supplied and the resulting `break_glass_write` session stores its `approval_id`. Active impersonation creates are guarded inside JSON repository updates and Prisma transactions, with PostgreSQL advisory transaction locks before the active-session check. Post-lookup denied service-admin attempts, pre-validation not-found probes, duplicate stop/start attempts and break-glass decision conflicts now write standalone immutable audit rows through JSON and Prisma adapters; service-admin write and audit persistence failures return shared error envelopes instead of leaking repository exceptions. Confirmed billing tariff changes now update repository-backed billing tenant state and create durable pending `billing-sync` job descriptors across JSON and Prisma adapters, with shared error envelopes for persistence failures after validation. Legacy quota checks remain read-only; explicit quota `record` checks require an idempotency key, return duplicate/conflict envelopes for replay safety and persist allow/deny ledger rows across JSON and Prisma adapters. Billing subscriptions, invoice/payment state and provider sync events now have durable JSON and Prisma-backed state, idempotent provider sync fingerprints, duplicate/conflict replay envelopes and additive PostgreSQL migration coverage. Quota reservations now persist across JSON and Prisma adapters; reservation commit mutates tenant usage once with idempotent replay, while release leaves usage unchanged. Billing sync jobs now have durable attempts/error/lease/published state, a Prisma SKIP LOCKED claim store, in-memory contract store and a runnable `billing:worker:once` mode that dispatches provider events through explicit handlers and fails closed on unknown job types. All `DemoServiceAdminGuard` routes now declare explicit service-admin action metadata, production demo-key login completion is denied instead of minting sessions, and empty bearer tokens cannot authenticate through fallback session headers.

- [x] Implement tariff catalog, tariff preview and audited tariff-change queue descriptors.
- [x] Implement explicit idempotent quota ledger records for allow/deny quota checks without changing legacy read-only checks.
- [x] Implement subscriptions, invoices and billing provider sync abstraction.
- [x] Implement quota enforcement hooks for channels, storage, webhooks, AI, bots, reports and operators.
- [x] Implement service-admin user lookup, invite resend, 2FA reset, forced logout, block/unblock and impersonation.
- [x] Implement break-glass approval model and read-only impersonation enforcement.
- [x] Add tariff change preview with confirmation text and audit event.
- [x] Add operation-level service-admin action checks, MFA/session header validation and named actor audit context for the gateway contract slice.
- [x] Add production bearer service-admin session validation for privileged identity/tenant gateway endpoints and disable spoofable demo headers outside development/test.
- [x] Add durable service-admin user action storage and immutable audit rows for confirmed user actions.
- [x] Add durable service-admin impersonation start/stop and pending break-glass approval storage.
- [x] Add durable break-glass approval approve/reject/expire decision workflow with immutable decision audit rows.
- [x] Add approval-bound write impersonation enforcement for `break_glass_write` sessions with tenant/user/action/expiry checks.
- [x] Add atomic active service-admin impersonation create guards across JSON and Prisma adapters.
- [x] Add durable post-lookup denied-attempt and duplicate/conflict service-admin audit rows across JSON and Prisma adapters.
- [x] Add durable pre-validation not-found/probe audit rows across JSON and Prisma adapters.
- [x] Return shared error envelopes when service-admin write or audit persistence fails.
- [x] Add durable billing tariff-change storage and pending `billing-sync` job descriptors for confirmed tariff changes.
- [x] Return shared error envelopes when confirmed billing tariff changes fail in the persistence layer.
- [x] Add durable billing quota ledger storage and idempotency contracts for explicit quota record checks.
- [x] Add durable billing subscription, invoice/payment and provider sync event state across JSON and Prisma adapters.
- [x] Add durable quota reservation, release and committed usage mutation state across JSON and Prisma adapters.
- [x] Complete billing provider sync worker execution with durable lease/retry fields, Prisma claim store and runnable worker mode.
- [x] Complete production privileged RBAC/session enforcement across all service-admin surfaces.
- [ ] Milestone 8.1: payment retry, dunning and reconciliation conflicts are complete after the 26 one-approach items from `8.1.retry-schedule-contract` through `8.1.reconciliation-conflict-conflict-replay-hardening`.
- [x] Milestone 8.2: billing approvals, legal/tax document state and decision audit are complete after the 20 one-approach items from `8.2.approval-contract` through `8.2.tax-document-redaction-hardening`.
- [x] Milestone 8.3: quota reservation leases, expiration worker and quota reports are complete.
- [x] Milestone 8.4: service-admin privileged RBAC policy consumption is complete.
- [x] Milestone 8.5: service-admin audit filters, export and redaction are complete after audit filters, pagination, redacted export descriptors and JSON/Prisma replay safety passed targeted tests.

### Phase 9. Platform monitoring, incidents and feature flags

Status 2026-06-28: implemented first gateway contract slice for platform monitoring, incidents and feature flags: `/api/v1/platform/snapshot`, `/api/v1/platform/components/:componentId`, `/api/v1/platform/components/:componentId/acknowledgements`, `/api/v1/platform-monitoring/snapshot`, `/api/v1/platform-monitoring/components/:componentId`, `/api/v1/platform-monitoring/components/:componentId/acknowledgements`, `/api/v1/incidents`, `/api/v1/incidents/:incidentId`, `/api/v1/incidents/:incidentId/updates`, `/api/v1/feature-flags`, `/api/v1/feature-flags/:flagId/preview`, `/api/v1/feature-flags/:flagId`, `/api/v1/feature-flags/:flagId/internal-tests`. Platform alert acknowledgements, incident update/idempotency state and feature flag rollout/outbox descriptors now have a JSON-backed durable platform repository and API Gateway runtime bootstrap via `PLATFORM_STORE_FILE`.

- [x] Implement platform snapshot metrics, component drilldown and alert acknowledgement descriptors.
- [x] Implement incidents with affected tenants/components, timelines, maintenance windows and postmortem descriptors.
- [x] Implement customer-visible and internal-only incident updates with realtime event, status page sync and idempotency guards.
- [x] Implement feature flags with rollout rules, tenant/segment targeting, preview, confirmation and internal tests.
- [x] Add status page sync queue descriptors for customer-visible incident and platform alert changes.
- [x] Add immutable audit event descriptors for incident and flag changes.
- [x] Add runtime validation for incident/flag statuses and strict service-admin reasons.
- [x] Add JSON-backed durable platform alert acknowledgement, incident update/idempotency and feature flag rollout state.
- [x] Milestone 9.1: platform telemetry samples and health rollups are complete after telemetry samples, health rollups, snapshot read sides and retention hardening passed targeted tests.
- [x] Milestone 9.2: alert routing, acknowledgement audit and notifications are complete after routing rules, acknowledgement audit rows, routed notification descriptors and duplicate suppression passed targeted tests.
- [x] Milestone 9.3: incident communication worker is complete after the 7 one-approach items from `9.3.customer-visible-contract` through `9.3.persistence-dead-letter`.
- [x] Milestone 9.4: status page publisher adapter is complete after the 8 one-approach items from `9.4.adapter-contract` through `9.4.alert-redaction-hardening`.
- [x] Milestone 9.5: feature flag rules and rollout engine are complete after the 14 one-approach items from `9.5.contract-persistence` through `9.5.segment-malformed-rule-hardening`.
- [x] Milestone 9.6: platform audit/outbox rows are complete after the 23 one-approach items from `9.6.incident-audit-contract` through `9.6.rollout-audit-immutability-hardening`.

### Phase 10. Hardening, scale and production readiness

Status 2026-06-28: implemented first gateway contract slice for operations hardening and production readiness: `/api/v1/operations/readiness`, `/api/v1/operations/load-tests/:scenarioId/runs`, `/api/v1/operations/backup-drills/:drillId/restore-checks`, `/api/v1/operations/dead-letter`, `/api/v1/operations/dead-letter/:messageId/replay`, `/api/v1/operations/migrations/:migrationId/rollback-check`, `/api/v1/operations/security-review`. API Gateway runtime smoke now uses isolated ports and the HTTP server guards client disconnect socket errors so cancelled SSE/realtime clients cannot crash the process. Load test run descriptors, restore check descriptors, dead-letter replay descriptors, rollback check records and queued-operation idempotency fingerprints now have a JSON-backed durable operations repository and API Gateway runtime bootstrap via `OPERATIONS_STORE_FILE`.

- [x] Add load test run descriptors for dialogs, message send, webhook delivery, report export and realtime fan-out.
- [x] Add backup/restore drill descriptors for PostgreSQL and object storage metadata.
- [x] Add dead-letter dashboards and replay queue descriptors.
- [x] Add migration rollback policy and contract compatibility checks.
- [x] Add security review controls for auth, tenant isolation, API keys, audit immutability and sensitive exports.
- [x] Add service-admin operation action guards, confirmation gates, strict reasons, immutable audit descriptors and idempotency guards for queued operations.
- [x] Add API Gateway runtime smoke isolation plus HTTP socket disconnect guard for cancelled SSE/realtime clients.
- [x] Add JSON-backed durable operations queue descriptors, rollback check records and idempotency state with runtime bootstrap.
- [x] Milestone 10.1: load-test runner worker and persisted run results are complete after the 15 one-approach items from `10.1.dialog-contract` through `10.1.run-error-summary-readside`.
- [x] Milestone 10.2: PostgreSQL restore-check automation is complete after the 9 one-approach items from `10.2.contract` through `10.2.audit-hardening`.
- [x] Milestone 10.3: object-storage restore-check automation is complete after the 12 one-approach items from `10.3.existence-contract` through `10.3.metadata-mismatch-hardening`.
- [x] Milestone 10.4: dead-letter replay worker validation and requeue are complete after the 9 one-approach items from `10.4.queue-ownership-contract` through `10.4.unknown-queue-hardening`.
- [x] Milestone 10.5: migration rollback-check tooling is complete after the 7 one-approach items from `10.5.migration-metadata-contract` through `10.5.persistence`.
- [x] Slice 10.6: add tenant isolation verification gates for tenant-owned repository methods and API routes.
- [x] Slice 10.7: add audit immutability verification gates for privileged mutations and replay workers.
- [x] Slice 10.8: add secret redaction verification gates for logs, envelopes, provider failures and exported descriptors.

### Remaining One-Approach Task Decomposition

Use this breakdown as the execution queue. Keep the parent phase-summary rows above as milestone checkboxes; mark a milestone complete only after all of its suffix-level subtasks pass tests and review.

Execution-unit rule: each `Slice N.M.x` must fit one focused approach: write or update the failing contract, implement the narrow production path, run the targeted tests/typecheck, update this plan and request review. If a slice needs more than one repository boundary, worker and API route at once, split it again before implementation.

Remaining workload estimate as of 2026-06-30:

- Open milestone containers with decomposed queues: 25 across phases 8-10.
- Open phase rollup checkpoints: 5. These are verification checkpoints only and are not executable development tasks.
- Open one-approach execution items already listed below: 116, excluding parent milestone checkboxes.
- Expected final execution items after decomposition: 116 currently open. Newly discovered review blockers must be added as new one-approach items instead of expanding the active slice.
- Near-term critical path: Phase 9 alert routing milestone 9.2 is complete; continue platform audit/outbox work from `9.6.incident-audit-contract`.
- Security gate before public/API-heavy rollout: complete; `6.2.a-c`, `10.6.a-i`, `10.7.a-h`, `10.8.a-g` and `10.8.h` are complete.
- Decomposition status: refreshed on 2026-07-01 after closing `9.2.duplicate-hardening`; 104 open suffix-level items remain. All remaining large rows are checkpoint-only milestone containers; execute only suffix-level rows such as `Slice 9.6.incident-audit-contract` or the next Phase 10 suffix.
- Large-block handling rule: if a row starts with `Milestone`, it is not a development task. Pick the next unchecked `Slice N.M.suffix` from that milestone, finish RED/GREEN/typecheck/review for that single suffix, then update the milestone only when the whole suffix queue is complete.

Open milestone decomposition map:

| Milestone | One-approach items | Executable range | Acceptance checkpoint |
| --- | ---: | --- | --- |
| 6.1 Public API keys | 0 | Complete | Hashed keys, one-time reveal state and rotation audit persist across JSON/Prisma with masked preview/replay tests. |
| 6.3 Inbound webhook verification | 0 | Complete | Timestamp/signature/nonce verification gates normalization descriptors and returns conflict/replay envelopes. |
| 7.2 Bot runtime worker | 0 | Complete | Worker handles one state transition, outbound/handoff descriptors, retry/dead-letter and malformed-scenario denial. |
| 7.3 Proactive eligibility | 0 | Complete | Execution windows, caps and experiments persist and drive replay-safe eligibility with targeting/cap-reset hardening. |
| 7.4 Proactive delivery worker | 0 | Complete | Eligible rule selection creates one outbound descriptor and persists attempts, idempotency and experiment attribution. |
| 7.5 Quality scoring adapter | 0 | Complete | Provider port, adapters, sanitized telemetry and failure envelopes are covered without prompt/secret leakage. |
| 7.6 Quality records and audit | 0 | Complete | Ratings, manual reviews and AI audit rows persist across JSON/Prisma with permission, isolation and immutability tests. |
| 8.1 Payment retry and reconciliation | 0 | complete | Retry schedules, dunning state, reconciliation conflicts and retry keys persist and drive replay-safe provider handling. |
| 8.2 Billing approvals and documents | 0 | Complete | Approvals, legal entities and tax documents persist with tariff/payment runtime hooks, audit and redaction hardening. |
| 8.3 Quota reservation leases | 0 | Complete | Expiration worker claims/releases reservations idempotently and exposes per-surface quota reports. |
| 8.4 Service-admin privileged RBAC | 0 | Complete | Shared resolver gates billing, tenant, impersonation and break-glass writes with denial audit coverage. |
| 8.5 Service-admin audit export | 0 | Complete | Audit filters, pagination, redacted export descriptors and JSON/Prisma replay safety are covered. |
| 9.1 Platform telemetry | 0 | Complete | Telemetry samples and health rollups persist, feed platform snapshots and enforce malformed/retention boundaries. |
| 9.2 Alert routing | 0 | Complete | Alert routing rules and acknowledgement audit rows persist and emit duplicate-safe notifications. |
| 9.3 Incident communication worker | 0 | Complete | Customer-visible/internal updates dispatch to the right descriptor ports and persist attempts, retries and dead letters. |
| 9.4 Status-page publisher | 0 | Complete | Publisher adapter, idempotent external keys, incident/alert runtime wiring and sanitized failures are covered. |
| 9.5 Feature flag rollout engine | 0 | Complete | Rule persistence and deterministic tenant/segment bucketing support preview/internal tests and malformed-rule hardening. |
| 9.6 Platform audit/outbox | 23 | `9.6.incident-audit-contract` -> `9.6.rollout-audit-immutability-hardening` | Incident, alert and rollout mutations write immutable audit/outbox rows with idempotency hardening. |
| 10.1 Load-test runner | 0 | Complete | Operation descriptors, deterministic runners, run status/metrics/error persistence, runtime config and read sides are covered. |
| 10.2 PostgreSQL restore-check | 0 | Complete | Restore-check command boundary executes once, persists result rows and handles failure, timeout and audit descriptors. |
| 10.3 Object-storage restore-check | 0 | Complete | Signed artifact existence/checksum/metadata verification persists results and returns denial envelopes for mismatches. |
| 10.4 Dead-letter replay worker | 0 | Complete | Replay validates queue ownership/idempotency, requeues through the helper and records denial/requeue/conflict outcomes. |
| 10.5 Rollback-check tooling | 0 | Complete | Migration metadata, API snapshots, compatibility tooling, release checklist wiring and persisted results are covered. |

Approach budget rule: treat one open execution item as one focused RED/GREEN/review pass. A normal pass should touch one dominant boundary only: repository, schema, adapter, runtime wiring, worker behavior, or hardening tests. If an item starts touching two dominant boundaries, split it before coding and keep only the first boundary in the current approach.

Large-block decomposition audit 2026-06-29: parent milestone checkboxes remain intentionally broad, but the executable queue below must not contain a task that spans multiple dominant boundaries. The remaining broad security gates have been split into repository-method, route-context, replay-worker, descriptor-redaction and release-checklist units so each task can be handled in one TDD approach plus review.

Second-pass decomposition audit 2026-06-29: remaining executable items that mixed JSON and Prisma adapters, deterministic and runtime adapters, worker execution and descriptor persistence, or docs and CI verification have been split into one-boundary subtasks. Treat any future task title containing `JSON/Prisma`, `plus runtime`, `and verify in CI`, or `worker with adapter` as a signal to split before implementation.

Third-pass decomposition audit 2026-06-29: remaining executable items that still bundled multiple scenarios, multiple service-admin surfaces, multiple replay outcomes, multiple report/export descriptor types, or runtime behavior plus redaction hardening have been split into suffix-level tasks. A suffix task may contain several assertions only when they exercise the same production boundary and can be completed in one RED/GREEN/review pass.

Fourth-pass decomposition audit 2026-06-29: remaining open executable items that bundled several domain records, several adapters, several scenario classes or several runtime surfaces have been split further. Parent milestone checkboxes stay broad by design; only the suffix-level items below are execution units.

Fifth-pass decomposition audit 2026-06-29: remaining open executable items that still bundled several visibility states, duplicate/conflict replay outcomes, success/denial runtime branches, retry/dead-letter pairs, service-admin audit filter families or platform incident/alert/rollout contract families have been split into scenario-level execution units. Keep future hardening items to one negative case family per pass.

Sixth-pass decomposition audit 2026-06-29: remaining open runtime items that still combined audit writes with outbox writes, or CI verification with runtime smoke verification, have been split by output surface. `schema/migration ownership coverage` remains a single schema-boundary task by convention because migration SQL and ownership-map tests are the acceptance criteria for one Prisma schema addition.

Seventh-pass decomposition audit 2026-06-29: remaining open execution items that still bundled several runtime branches, several visibility modes, retry/backoff/attempt handling, cross-surface privileged-denial checks, or platform replay hardening families have been split into one dominant scenario or output surface per pass. Leave parent milestone checkboxes broad; use only suffix-level items for implementation.

Eighth-pass decomposition audit 2026-06-29: remaining worker/tooling items that still combined claim, transition, adapter, persistence or multi-scenario execution have been split into single-output tasks. A worker task should now do only one of: claim/select input, perform the domain transition, emit one descriptor family, persist one result family or wire runtime config.

Ninth-pass decomposition audit 2026-06-29: remaining large executable items were split again where one checkbox still combined scanner claim and adapter invocation, webhook retry backoff calculation and scheduling, SDK and webhook documentation, payment retry and dunning state, load-test metrics and error summaries, restore-check execution and result persistence, object-storage metadata verification, or dead-letter validation and requeue behavior. Parent milestone rows above remain broad by design and are not execution units.

Tenth-pass decomposition audit 2026-06-29: remaining broad executable items were split where one checkbox still combined missing runtime config with scan execution, several upload denial/audit reasons, route wiring with non-mutating guarantees, signed descriptor persistence with signing policy, webhook verification with normalization enqueueing, approval audit families, quota worker claim/release contracts, audit export filtering with payload generation, platform snapshot read models, audit/outbox idempotency surfaces, or checksum and metadata mismatch restore checks. Every open suffix-level item below should now fit one RED/GREEN/review approach.

Eleventh-pass decomposition audit 2026-06-29: remaining broad executable items were split where one checkbox still combined several routing analytics families, SLA resume and overdue transitions, hidden/cross-tenant report-template denials, public OpenAPI surfaces, quality record permission/isolation/audit families, provider retry replay outcomes, telemetry retention surfaces, status-page redaction surfaces, feature-flag preview/internal-test edge classes, load-test read-side projections, restore-check result families or dead-letter audit outcomes. Parent milestone rows above remain broad by design; only suffix-level items below are implementation units.

Twelfth-pass decomposition audit 2026-06-29: the remaining parent blocks were reviewed again after Phase 4 started. `4.3` is split into realtime, retry and dead-letter finishing passes; `4.4` is split into rescue selection, transition, ownership, persistence, realtime and analytics passes; `4.5` is split by analytics event family and read-side output. Later phases remain decomposed by record family, adapter boundary, worker transition, descriptor output, read-side projection or single hardening scenario.

Thirteenth-pass decomposition audit 2026-06-30: rescue-return review findings were converted into separate one-approach blockers instead of reopening the broad `4.4.return-worker` item: scheduler conversation binding, claimed-state enforcement, stale claim revalidation and repository seed typing. Remaining open suffix tasks were scanned for multi-boundary wording; `schema/migration ownership coverage` stays one accepted Prisma-boundary task, while future review findings must be added as new suffix-level tasks.

Fourteenth-pass decomposition audit 2026-06-30: Phase 4 analytics review findings were closed as suffix-level hardening work: `resolveRescue()` now emits worker-claimable rescue-return jobs, and Prisma routing analytics rows use the real Prisma model port instead of JSON fallback. `4.5.rescue-runtime`, `4.5.auto-return-runtime`, `4.5.workload-readside` and `4.5.rescue-readside` are complete; continue with Phase 5 report metric definitions.

Fifteenth-pass decomposition audit 2026-06-30: metric schema review found tenant-consistency and malformed-status risks for future Prisma adapters. Added suffix hardening tasks for metric version tenant FK, tenant override tenant FK and Prisma status normalization instead of expanding the completed schema slices.

Sixteenth-pass decomposition audit 2026-06-30: open parent rows in Phase 5-10 summaries were converted from executable-looking `Slice N.M:` entries into explicit `Milestone N.M:` containers with one-approach item counts and suffix ranges. No new execution work was added; the executable queue count is tracked in the workload estimate above.

Seventeenth-pass decomposition audit 2026-06-30: added the open milestone decomposition map above so every remaining large parent block points to an explicit suffix-level queue, item count and acceptance checkpoint. The only executable units remain open `Slice N.M.suffix` rows; phase rollup milestones are verification-only checkpoints.

Eighteenth-pass decomposition audit 2026-06-30: rechecked the open backlog for executable parent slices and broad milestone rows. No unchecked `Slice N.M:` parent row remains; after `5.4.permission-visibility-runtime` the open queue is 343 suffix-level items. The 28 open milestone containers and 5 phase rollup checkpoints are intentionally non-executable. `schema/migration ownership coverage` stays one schema-boundary task only; if implementation also touches a repository adapter, runtime route, worker behavior or read side, split that work into a new `.prisma`, `.runtime`, `.worker`, `.readside` or `.hardening` suffix before coding.

If a remaining slice is still too broad at implementation time, split it in place with these suffixes and do not batch them:

- `.contract`: failing contract/API/worker test only.
- `.schema`: Prisma schema, migration SQL and migration contract only.
- `.json`: JSON repository parity or deterministic in-memory adapter only.
- `.prisma`: Prisma repository adapter only.
- `.adapter`: provider/client port plus deterministic adapter only.
- `.runtime`: API route, worker registry, config bootstrap or queue wiring only.
- `.hardening`: idempotency, tenant isolation, audit immutability, redaction or denial-envelope tests only.
- `.docs`: plan/status/OpenAPI/README update only.

Recommended execution order:

1. Continue Phase 9 platform audit/outbox work from `9.6.incident-audit-contract`.
2. Proceed by business dependency: Phase 8 billing/admin, Phase 9 operations and Phase 10 remaining release tooling.
3. Keep security gates `6.2`, `10.6`, `10.7` and `10.8` closed; if a future slice weakens tenant isolation, audit immutability or redaction, add a new suffix-level hardening task before continuing.

Remaining milestone blocks are decomposed into these one-approach queues:

- Phase 6: complete.
- Phase 7: complete.
- Phase 8: complete, excluding completed slices `8.1.retry-schedule-contract`, `8.1.dunning-state-contract`, `8.1.reconciliation-conflict-contract`, `8.1.idempotent-retry-contract`, `8.1.retry-schedule-schema`, `8.1.dunning-state-schema`, `8.1.reconciliation-conflict-schema`, `8.1.idempotent-retry-schema`, `8.1.retry-schedule-json`, `8.1.dunning-state-json`, `8.1.reconciliation-conflict-json`, `8.1.idempotent-retry-json`, `8.1.retry-schedule-prisma`, `8.1.dunning-state-prisma`, `8.1.reconciliation-conflict-prisma`, `8.1.idempotent-retry-prisma`, `8.1.retry-schedule-runtime`, `8.1.dunning-state-runtime`, `8.1.reconciliation-conflict-runtime`, `8.1.idempotent-retry-runtime`, `8.1.retry-schedule-duplicate-replay-hardening`, `8.1.dunning-state-duplicate-replay-hardening`, `8.1.reconciliation-conflict-duplicate-replay-hardening`, `8.1.retry-schedule-conflict-replay-hardening`, `8.1.dunning-state-conflict-replay-hardening`, `8.1.reconciliation-conflict-conflict-replay-hardening`, `8.2.approval-contract`, `8.2.legal-entity-contract`, `8.2.tax-document-contract`, `8.2.approval-schema`, `8.2.legal-entity-schema`, `8.2.tax-document-schema`, `8.2.approval-json`, `8.2.legal-entity-json`, `8.2.tax-document-json`, `8.2.approval-prisma`, `8.2.legal-entity-prisma`, `8.2.tax-document-prisma`, `8.2.tariff-runtime`, `8.2.payment-runtime`, `8.2.approval-audit-hardening`, `8.2.legal-entity-audit-hardening`, `8.2.tax-document-audit-hardening`, `8.2.approval-redaction-hardening`, `8.2.legal-entity-redaction-hardening`, `8.2.tax-document-redaction-hardening`, `8.3.reservation-lease-contract`, `8.3.expiration-claim-contract`, `8.3.expiration-release-contract`, `8.3.expiration-claim-worker`, `8.3.expiration-release-worker`, `8.3.expired-release-hardening`, `8.3.committed-release-hardening`, `8.3.released-release-hardening`, `8.3.channels-quota-readside`, `8.3.storage-quota-readside`, `8.3.webhooks-quota-readside`, `8.3.ai-quota-readside`, `8.3.bots-quota-readside`, `8.3.reports-quota-readside`, `8.3.operators-quota-readside`, `8.4.billing-contract`, `8.4.tenant-contract`, `8.4.impersonation-contract`, `8.4.break-glass-contract`, `8.4.resolver-unknown-action`, `8.4.resolver-unknown-role`, `8.4.billing-runtime`, `8.4.tenant-runtime`, `8.4.impersonation-runtime`, `8.4.break-glass-runtime`, `8.4.billing-denial-audit-hardening`, `8.4.tenant-denial-audit-hardening`, `8.4.impersonation-denial-audit-hardening`, `8.4.break-glass-denial-audit-hardening`, `8.5.actor-filter-contract`, `8.5.action-filter-contract`, `8.5.tenant-filter-contract`, `8.5.status-filter-contract`, `8.5.time-range-filter-contract`, `8.5.export-filter-contract`, `8.5.export-payload-contract`, `8.5.pagination-readside`, `8.5.redaction-readside`, `8.5.export-descriptor`, `8.5.export-redacted-payload`, `8.5.hardening-immutability`, `8.5.hardening-redaction`, `8.5.hardening-replay-json`, `8.5.hardening-replay-prisma`.
- Phase 9: `9.6.incident-audit-contract` through `9.6.rollout-audit-immutability-hardening`, excluding completed slices `9.1.telemetry-sample-contract`, `9.1.health-rollup-contract`, `9.1.telemetry-sample-schema`, `9.1.health-rollup-schema`, `9.1.ingestion-runtime`, `9.1.rollup-runtime`, `9.1.telemetry-snapshot-readside`, `9.1.health-rollup-readside`, `9.1.malformed-sample-hardening`, `9.1.telemetry-sample-retention-hardening`, `9.1.health-rollup-retention-hardening`, `9.2.routing-rule-contract`, `9.2.ack-audit-contract`, `9.2.routing-schema`, `9.2.ack-audit-schema`, `9.2.runtime-rules`, `9.2.runtime-ack-audit`, `9.2.notification-hardening`, `9.2.duplicate-hardening`.
- Phase 10: `10.1.dialog-contract` through `10.5.persistence`; `10.6`, `10.7` and `10.8` are already complete.

#### Completed Phase 2 execution queue

Historical queue retained for traceability. These items are intentionally smaller than the milestone slices above and each item was completed as one RED/GREEN approach.

- [x] Slice 2.1.a.contract: add Telegram adapter port, payload validation and sanitized provider failure contract tests.
- [x] Slice 2.1.a.adapter: implement the minimal Telegram HTTP connector with deterministic fetch injection and sanitized status-only failures.
- [x] Slice 2.1.a.docs: update Phase 2 status and run full backend verification after the Telegram connector review.
- [x] Slice 2.1.b.contract: add tests for Telegram runtime config parsing, disabled mode and missing endpoint/token fail-closed behavior.
- [x] Slice 2.1.b.runtime: wire Telegram connector factory into outbox worker config without changing message-delivery routing yet.
- [x] Slice 2.1.b.hardening: verify token redaction in thrown errors, logs and provider failure envelopes.
- [x] Slice 2.1.c.contract: add message-delivery worker tests for Telegram descriptors, idempotency key propagation and trace ID propagation.
- [x] Slice 2.1.c.runtime: route Telegram delivery descriptors through the Telegram connector from the worker handler registry.
- [x] Slice 2.1.c.hardening: add replay/conflict tests for repeated Telegram delivery descriptors.
- [x] Slice 2.2.a.contract: add VK/MAX adapter port tests for text, attachment and proactive capability differences.
- [x] Slice 2.2.a.adapter: implement deterministic VK/MAX adapter DTO validation without runtime HTTP wiring.
- [x] Slice 2.2.b.runtime: add VK/MAX runtime config parsing and connector factories behind disabled-by-default flags.
- [x] Slice 2.2.b.hardening: assert sanitized provider failures and per-provider timeout behavior.
- [x] Slice 2.2.c.contract: add denial envelope tests for unsupported attachments, proactive sends and delivery modes.
- [x] Slice 2.2.c.runtime: wire capability validation before worker provider dispatch.
- [x] Slice 2.3.a.schema: add delivery receipt Prisma schema, migration and database ownership contract.
- [x] Slice 2.3.a.contract: add repository contracts for receipt insert, duplicate provider event replay and tenant isolation.
- [x] Slice 2.3.b.json: implement JSON receipt storage with deterministic duplicate handling.
- [x] Slice 2.3.b.prisma: implement Prisma receipt storage and provider event idempotency constraints.
- [x] Slice 2.3.c.runtime: map stored receipts to `message.delivery.updated` realtime descriptors.
- [x] Slice 2.3.c.hardening: add replay tests proving duplicate receipts do not duplicate realtime events.
- [x] Slice 2.4.a.contract: add Redis fan-out publish/subscribe/fallback tests with deterministic fake Redis.
- [x] Slice 2.4.b.adapter: implement Redis realtime adapter behind the existing realtime port.
- [x] Slice 2.4.b.runtime: wire adapter into SSE/WebSocket replay endpoints behind config.
- [x] Slice 2.4.c.hardening: add degraded-mode publish failure, malformed Redis payload, invalid Redis URL and append/reply fan-out regression tests.
- [x] Slice 2.5.a.contract: add failing service-level fixtures mixing persisted replay events and live Redis events from two fake instances.
- [x] Slice 2.5.b.helper: implement a pure canonical merge helper over `(occurredAt, eventId)` with duplicate suppression and cursor filtering.
- [x] Slice 2.5.c.runtime-sse: wire SSE replay to the merged persisted/live source without changing WebSocket behavior.
- [x] Slice 2.5.d.runtime-ws: wire WebSocket replay to the same merged persisted/live source.
- [x] Slice 2.5.e.hardening: add `Last-Event-ID`, timestamp tie and duplicate live-event tests, then run Phase 2 verification and mark the milestone complete.

#### Phase 1 subtasks

- [x] Slice 1.1.a: add failing JSON repository contracts for password credential hashes, password policy state and credential audit persistence.
- [x] Slice 1.1.b: implement JSON identity repository credential/policy/audit state plus auth-service password verification and audit writes.
- [x] Slice 1.1.c: add Prisma schema/migration/repository support for password credential hashes, password policy state and credential audit rows.
- [x] Slice 1.2.a: add failing contracts for refresh token create/rotate/revoke idempotency and production bearer lookup.
- [x] Slice 1.2.b: implement JSON-backed refresh/session token lifecycle, replay-safe rotation and revoked-session fail-closed behavior.
- [x] Slice 1.2.c: implement Prisma refresh/session token lifecycle and update production bearer validation tests.
- [x] Slice 1.3.a: add failing repository contracts for OIDC provider config and callback descriptor persistence.
- [x] Slice 1.3.b: implement JSON/Prisma OIDC provider config storage with issuer, audience and JWKS metadata validation fields.
- [x] Slice 1.3.c: wire OIDC callback descriptor handling into auth routes with replay/conflict tests.
- [x] Slice 1.4.a: add failing contracts for SAML provider metadata, ACS request descriptors and assertion replay IDs.
- [x] Slice 1.4.b: implement JSON/Prisma SAML provider metadata and ACS descriptor persistence.
- [x] Slice 1.4.c: add replay-safe assertion ID validation and denial envelopes for duplicate/expired assertions.
- [x] Slice 1.5.a: add failing RBAC contracts for policy versions, role grants and tenant-scoped denial rows.
- [x] Slice 1.5.b: implement JSON/Prisma RBAC policy/grant persistence with unknown-policy fail-closed fallback.
- [x] Slice 1.5.c: wire tenant-scoped denial audit rows into permission checks and service-admin surfaces.
- [x] Slice 1.6.a: add negative contracts for malformed RBAC grant `effect` values and implement fail-closed parsing plus database check constraints.
- [x] Slice 1.6.b: add active-policy collision tests and enforce one active RBAC policy with deterministic active-policy selection.
- [x] Slice 1.6.c: add dangling-reference tests and enforce RBAC policy/grant/denial referential integrity for policy versions, tenant IDs and role keys.

#### Phase 2 subtasks

Phase 2 execution is complete and verified. Keep the Phase 2 parent milestone checkboxes in the main phase section as rollout status only. Security gate queue (`6.2`, `10.6`, `10.7`, `10.8`) is complete; next priority is the first open Phase 3 one-approach slice.

#### Phase 3 subtasks

- [x] Slice 3.1.identity-contract: add failing repository contracts for client identity records and tenant-scoped identity lookup.
- [x] Slice 3.1.merge-graph-contract: add failing repository contracts for merge graph edge create/read behavior.
- [x] Slice 3.1.merge-conflict-contract: add failing repository contracts for merge conflict rows and conflict-state transitions.
- [x] Slice 3.1.identity-schema: add Prisma identity table/migration and ownership-map coverage.
- [x] Slice 3.1.merge-graph-schema: add Prisma merge edge table/migration and ownership-map coverage.
- [x] Slice 3.1.merge-conflict-schema: add Prisma merge conflict table/migration and ownership-map coverage.
- [x] Slice 3.1.json: implement JSON client identity, merge edge and conflict persistence parity.
- [x] Slice 3.1.identity-prisma: implement Prisma client identity repository adapter.
- [x] Slice 3.1.merge-graph-prisma: implement Prisma client merge edge repository adapter.
- [x] Slice 3.1.merge-conflict-prisma: implement Prisma client merge conflict repository adapter.
- [x] Slice 3.1.identity-tenant-isolation-hardening: add tenant isolation tests for client identity reads.
- [x] Slice 3.1.merge-graph-tenant-isolation-hardening: add tenant isolation tests for merge edge reads.
- [x] Slice 3.1.merge-conflict-tenant-isolation-hardening: add tenant isolation tests for merge conflict reads.
- [x] Slice 3.1.duplicate-edge-hardening: add duplicate merge edge replay/conflict tests.
- [x] Slice 3.1.conflict-state-hardening: add malformed conflict-state fail-closed tests.
- [x] Slice 3.2.template-record-contract: add failing repository contracts for template records.
- [x] Slice 3.2.template-version-contract: add failing repository contracts for template versions.
- [x] Slice 3.2.template-audit-contract: add failing repository contracts for template audit rows.
- [x] Slice 3.2.template-record-schema: add Prisma template record schema, migration and ownership-map coverage.
- [x] Slice 3.2.template-version-schema: add Prisma template version schema, migration and ownership-map coverage.
- [x] Slice 3.2.template-audit-schema: add Prisma template audit schema, migration and ownership-map coverage.
- [x] Slice 3.2.template-record-json: implement JSON template record persistence parity.
- [x] Slice 3.2.template-version-json: implement JSON template version persistence parity.
- [x] Slice 3.2.template-audit-json: implement JSON template audit persistence parity.
- [x] Slice 3.2.template-record-prisma: implement Prisma template record repository adapter.
- [x] Slice 3.2.template-version-prisma: implement Prisma template version repository adapter.
- [x] Slice 3.2.template-audit-prisma: implement Prisma template audit repository adapter.
- [x] Slice 3.2.runtime: wire template audit rows into API responses without changing permission behavior.
- [x] Slice 3.2.visibility-permission-hardening: add permission denial tests for template visibility.
- [x] Slice 3.2.mutation-permission-hardening: add permission denial tests for template mutation.
- [x] Slice 3.2.tenant-visibility-hardening: add cross-tenant template visibility tests.
- [x] Slice 3.3.article-contract: add failing repository contracts for knowledge article records.
- [x] Slice 3.3.publication-state-contract: add failing repository contracts for article publication state.
- [x] Slice 3.3.draft-version-contract: add failing repository contracts for draft versions.
- [x] Slice 3.3.draft-transition-contract: add failing repository contracts for draft state transitions.
- [x] Slice 3.3.approval-contract: add failing repository contracts for approval decisions.
- [x] Slice 3.3.article-schema: add Prisma knowledge article schema, migration and ownership-map coverage.
- [x] Slice 3.3.draft-schema: add Prisma knowledge draft version schema, migration and ownership-map coverage.
- [x] Slice 3.3.approval-schema: add Prisma knowledge approval decision schema, migration and ownership-map coverage.
- [x] Slice 3.3.article-json: implement JSON article persistence parity.
- [x] Slice 3.3.publication-state-json: implement JSON publication-state persistence parity.
- [x] Slice 3.3.draft-json: implement JSON draft version persistence parity.
- [x] Slice 3.3.approval-json: implement JSON approval decision persistence parity.
- [x] Slice 3.3.article-prisma: implement Prisma article repository adapter.
- [x] Slice 3.3.publication-state-prisma: implement Prisma publication-state repository adapter.
- [x] Slice 3.3.draft-prisma: implement Prisma draft version repository adapter.
- [x] Slice 3.3.draft-transition-prisma: implement Prisma draft state transition repository adapter.
- [x] Slice 3.3.approval-prisma: implement Prisma approval decision repository adapter.
- [x] Slice 3.3.draft-visibility-hardening: add visibility tests for draft knowledge articles only.
- [x] Slice 3.3.published-visibility-hardening: add visibility tests for published knowledge articles only.
- [x] Slice 3.3.archived-visibility-hardening: add visibility tests for archived knowledge articles only.
- [x] Slice 3.3.draft-duplicate-replay-hardening: add duplicate replay tests for draft decisions.
- [x] Slice 3.3.draft-conflict-replay-hardening: add conflict replay tests for draft decisions.
- [x] Slice 3.3.approval-duplicate-replay-hardening: add duplicate replay tests for approval decisions.
- [x] Slice 3.3.approval-conflict-replay-hardening: add conflict replay tests for approval decisions.
- [x] Slice 3.3.article-tenant-isolation-hardening: add tenant-isolation tests for article reads.
- [x] Slice 3.3.draft-tenant-isolation-hardening: add tenant-isolation tests for draft reads.
- [x] Slice 3.3.approval-tenant-isolation-hardening: add tenant-isolation tests for approval reads.
- [x] Slice 3.4.missing-metadata-contract: add upload-finalize tests for missing object metadata.
- [x] Slice 3.4.size-mismatch-contract: add upload-finalize tests for object size mismatch.
- [x] Slice 3.4.checksum-mismatch-contract: add upload-finalize tests for object checksum mismatch.
- [x] Slice 3.4.port: implement object-storage metadata verification port.
- [x] Slice 3.4.deterministic-adapter: implement deterministic object-storage metadata adapter for tests.
- [x] Slice 3.4.runtime-success: wire successful upload finalize approval through the verification port and existing file metadata state.
- [x] Slice 3.4.runtime-denial: wire failed upload finalize denial through the verification port and existing file metadata state.
- [x] Slice 3.4.denial-envelope-hardening: add upload-finalize denial envelopes that never expose object keys.
- [x] Slice 3.4.audit-descriptor-hardening: add upload-finalize audit descriptors that never expose object keys.
- [x] Slice 3.5.descriptor-claim-contract: add file-scan worker tests for descriptor claim behavior.
- [x] Slice 3.5.scanner-call-contract: add file-scan worker tests for scanner call behavior.
- [x] Slice 3.5.callback-idempotency-contract: add file-scan worker tests for callback idempotency.
- [x] Slice 3.5.port: implement scanner adapter port for worker tests.
- [x] Slice 3.5.deterministic-adapter: implement deterministic scanner adapter for worker tests.
- [x] Slice 3.5.runtime-config: add runtime HTTP scanner adapter config behind disabled-by-default settings.
- [x] Slice 3.5.runtime-claim: wire scanner worker execution to claim one scan descriptor from the `file-scan` queue.
- [x] Slice 3.5.runtime-scan-call: wire claimed scanner worker execution to call the configured scanner adapter once.
- [x] Slice 3.5.runtime-callback: wire successful scanner worker output to the existing `/files/:fileId/scan-result` callback path.
- [x] Slice 3.5.callback-required-hardening: fail closed before claiming `file-scan` descriptors when scanner runtime config is enabled without scan-result callback config.
- [x] Slice 3.5.retry-hardening: add file-scan worker retry tests.
- [x] Slice 3.5.dead-letter-hardening: add file-scan worker dead-letter tests.
- [x] Slice 3.5.sanitized-failure-hardening: add sanitized scanner failure tests.
- [x] Slice 3.6.channel-capability-contract: add attachment-limit tests for channel capability.
- [x] Slice 3.6.tenant-quota-contract: add attachment-limit tests for tenant quota.
- [x] Slice 3.6.file-state-contract: add attachment-limit tests for file metadata state.
- [x] Slice 3.6.channel-capability-runtime: enforce channel attachment capability before upload descriptor creation.
- [x] Slice 3.6.tenant-quota-runtime: enforce tenant attachment quota before upload descriptor creation.
- [x] Slice 3.6.file-state-runtime: enforce file metadata state before upload descriptor creation.
- [x] Slice 3.6.channel-denial-hardening: add denial envelopes for unsupported channel upload attempts.
- [x] Slice 3.6.tenant-quota-denial-hardening: add denial envelopes for tenant quota upload attempts.
- [x] Slice 3.6.file-state-denial-hardening: add denial envelopes for invalid file-state upload attempts.
- [x] Slice 3.6.channel-audit-hardening: add audit descriptors for unsupported channel upload attempts without object-key exposure.
- [x] Slice 3.6.tenant-quota-audit-hardening: add audit descriptors for tenant quota upload attempts without object-key exposure.
- [x] Slice 3.6.file-state-audit-hardening: add audit descriptors for invalid file-state upload attempts without object-key exposure.

#### Phase 4 subtasks

- [x] Slice 4.1.routing-rule-contract: add failing repository contracts for routing rules.
- [x] Slice 4.1.queue-membership-contract: add failing repository contracts for queue membership.
- [x] Slice 4.1.operator-capacity-contract: add failing repository contracts for operator capacity.
- [x] Slice 4.1.routing-rule-schema: add Prisma routing rule schema/migration coverage.
- [x] Slice 4.1.queue-membership-schema: add Prisma queue membership schema/migration coverage.
- [x] Slice 4.1.operator-capacity-schema: add Prisma operator capacity schema/migration coverage.
- [x] Slice 4.1.routing-rule-json: implement JSON routing rule persistence parity.
- [x] Slice 4.1.queue-membership-json: implement JSON queue membership persistence parity.
- [x] Slice 4.1.operator-capacity-json: implement JSON operator capacity persistence parity.
- [x] Slice 4.1.routing-rule-prisma: implement Prisma routing rule repository adapter.
- [x] Slice 4.1.queue-membership-prisma: implement Prisma queue membership repository adapter.
- [x] Slice 4.1.operator-capacity-prisma: implement Prisma operator capacity repository adapter.
- [x] Slice 4.1.tenant-isolation-hardening: add tenant isolation tests for routing reads.
- [x] Slice 4.1.malformed-config-hardening: add malformed routing config fail-closed tests.
- [x] Slice 4.2.input-contract: add assignment simulation contract tests for candidate inputs.
- [x] Slice 4.2.explanation-contract: add assignment simulation contract tests for explanation shape.
- [x] Slice 4.2.workload-service: implement deterministic candidate ranking over workload.
- [x] Slice 4.2.access-service: implement deterministic candidate ranking over access rules.
- [x] Slice 4.2.membership-service: implement deterministic candidate ranking over queue membership.
- [x] Slice 4.2.chat-limit-service: implement deterministic candidate ranking over chat limits.
- [x] Slice 4.2.route-runtime: wire simulation output into assignment routes.
- [x] Slice 4.2.nonmutating-hardening: add assignment simulation tests proving live assignment state is not mutated.
- [x] Slice 4.3.paused-contract: add SLA timer worker tests for paused timer transitions.
- [x] Slice 4.3.resumed-contract: add SLA timer worker tests for resumed timer transitions.
- [x] Slice 4.3.overdue-contract: add SLA timer worker tests for overdue timer transitions.
- [x] Slice 4.3.claim-worker: implement BullMQ SLA timer worker claim over durable SLA timer jobs.
- [x] Slice 4.3.resume-transition-worker: implement SLA timer resume transition after a claimed paused timer job.
- [x] Slice 4.3.overdue-transition-worker: implement SLA timer overdue transition after a claimed active timer job.
- [x] Slice 4.3.overdue-descriptor-hardening: emit overdue descriptors for SLA timers.
- [x] Slice 4.3.overdue-realtime-hardening: emit realtime events for overdue SLA timers.
- [x] Slice 4.3.retry-hardening: cover retry behavior for SLA timer jobs.
- [x] Slice 4.3.dead-letter-hardening: cover dead-letter behavior for SLA timer jobs.
- [x] Slice 4.3.review-claimability-hardening: cover failed-without-next-attempt and stale-status SLA timer claim exclusions found in review.
- [x] Slice 4.4.contract: add rescue-return worker tests for expired rescue assignment selection.
- [x] Slice 4.4.selection-worker: implement expired rescue assignment selection for the rescue-return worker.
- [x] Slice 4.4.return-worker: implement queue return transition for one selected rescue assignment.
- [x] Slice 4.4.queue-ownership-hardening: add queue ownership validation tests for rescue-return worker.
- [x] Slice 4.4.outcome-persistence: persist rescue return outcomes.
- [x] Slice 4.4.realtime-hardening: emit realtime descriptors for rescue auto-return outcomes.
- [x] Slice 4.4.analytics-hardening: emit analytics descriptors for rescue auto-return outcomes.
- [x] Slice 4.4.scheduler-conversation-id-hardening: add an integration test proving `startRescue()` schedules rescue-return jobs with the required `conversationId`.
- [x] Slice 4.4.claimed-state-hardening: add worker tests proving rescue-return transitions apply only to repository-current claimed jobs.
- [x] Slice 4.4.stale-claim-hardening: re-read and revalidate rescue-return jobs before saving a claim.
- [x] Slice 4.4.repository-seed-type-hardening: align the in-memory routing repository seed type with partial-state test usage.
- [x] Slice 4.4.current-job-identity-hardening: apply rescue-return transitions from the repository-current claimed job identity, not stale caller snapshots.
- [x] Slice 4.4.resolve-rescue-job-hardening: persist worker-compatible rescue-return jobs from `resolveRescue()` queue outcomes.
- [x] Slice 4.5.assignment-contract: add repository contracts for assignment routing analytics rows.
- [x] Slice 4.5.transfer-contract: add repository contracts for transfer routing analytics rows.
- [x] Slice 4.5.rescue-contract: add repository contracts for rescue routing analytics rows.
- [x] Slice 4.5.auto-return-contract: add repository contracts for auto-return routing analytics rows.
- [x] Slice 4.5.schema: add Prisma routing analytics schema/migration and ownership-map coverage.
- [x] Slice 4.5.prisma-adapter-hardening: persist routing analytics rows through the Prisma routing repository port, not JSON fallback.
- [x] Slice 4.5.assignment-runtime: write analytics rows for assignment events.
- [x] Slice 4.5.transfer-runtime: write analytics rows for transfer events.
- [x] Slice 4.5.rescue-runtime: write analytics rows for rescue events.
- [x] Slice 4.5.auto-return-runtime: write analytics rows for auto-return events.
- [x] Slice 4.5.workload-readside: expose aggregation tests for workload reports.
- [x] Slice 4.5.rescue-readside: expose aggregation tests for rescue reports.

#### Phase 5 subtasks

- [x] Slice 5.1.metric-definition-contract: add failing repository contracts for metric definitions.
- [x] Slice 5.1.metric-version-contract: add failing repository contracts for metric versions.
- [x] Slice 5.1.tenant-override-contract: add failing repository contracts for tenant overrides.
- [x] Slice 5.1.metric-definition-schema: add Prisma metric definition schema, migration and ownership coverage.
- [x] Slice 5.1.metric-version-schema: add Prisma metric version schema, migration and ownership coverage.
- [x] Slice 5.1.tenant-override-schema: add Prisma tenant override schema, migration and ownership coverage.
- [x] Slice 5.1.metric-definition-json: implement JSON metric definition persistence parity.
- [x] Slice 5.1.metric-version-json: implement JSON metric version persistence parity.
- [x] Slice 5.1.tenant-override-json: implement JSON tenant override persistence parity.
- [x] Slice 5.1.metric-version-tenant-fk-hardening: enforce tenant consistency between metric versions and metric definitions before Prisma adapter work.
- [x] Slice 5.1.tenant-override-tenant-fk-hardening: enforce tenant consistency between metric tenant overrides, definitions and versions before Prisma adapter work.
- [x] Slice 5.1.metric-status-normalization-hardening: prove malformed Prisma metric statuses fail closed like JSON repository normalization.
- [x] Slice 5.1.metric-definition-prisma: implement Prisma metric definition repository adapter.
- [x] Slice 5.1.metric-version-prisma: implement Prisma metric version repository adapter.
- [x] Slice 5.1.tenant-override-prisma: implement Prisma tenant override repository adapter.
- [x] Slice 5.1.version-selection-hardening: add version selection tests.
- [x] Slice 5.1.override-resolution-hardening: add tenant override resolution tests.
- [x] Slice 5.1.malformed-metric-hardening: add malformed metric fail-closed tests.
- [x] Slice 5.2.rescue-contract: add report query execution contracts for current rescue metrics.
- [x] Slice 5.2.conversation-contract: add report query execution contracts for current conversation metrics.
- [x] Slice 5.2.rescue-service: implement deterministic rescue metric query service over existing repositories/read models.
- [x] Slice 5.2.conversation-service: implement deterministic conversation metric query service over existing repositories/read models.
- [x] Slice 5.2.unsupported-metric-hardening: add fail-closed contract coverage for unsupported report metric query keys.
- [x] Slice 5.2.execution-status-persistence: persist report query execution status.
- [x] Slice 5.2.execution-parameters-persistence: persist report query execution parameters.
- [x] Slice 5.2.failure-envelope-persistence: persist report query failure envelopes.
- [x] Slice 5.3.csv-format-contract: add report-export worker tests for CSV output serialization.
- [x] Slice 5.3.json-format-contract: add report-export worker tests for JSON output serialization.
- [x] Slice 5.3.object-storage-contract: add report-export tests for object storage writes.
- [x] Slice 5.3.signed-descriptor-contract: add report-export tests for signed descriptor creation.
- [x] Slice 5.3.object-storage-port: implement report object-storage adapter port for worker tests.
- [x] Slice 5.3.deterministic-object-storage-adapter: implement deterministic report object-storage adapter for worker tests.
- [x] Slice 5.3.csv-worker: implement export worker execution that writes CSV objects through the adapter.
- [x] Slice 5.3.json-worker: implement export worker execution that writes JSON objects through the adapter.
- [x] Slice 5.3.descriptor-persistence: store report file descriptors after successful object writes.
- [x] Slice 5.3.descriptor-signing-runtime: attach signed download policy to persisted report file descriptors.
- [x] Slice 5.3.retry-hardening: wire report export retry behavior.
- [x] Slice 5.3.dead-letter-hardening: wire report export dead-letter behavior.
- [x] Slice 5.3.permission-file-descriptor-hardening: wire permission-scoped report file descriptor lookup.
- [x] Slice 5.4.template-contract: add repository contracts for saved report templates.
- [x] Slice 5.4.visibility-contract: add repository contracts for saved report template visibility rules.
- [x] Slice 5.4.schema: add Prisma saved report template schema/migration and ownership coverage.
- [x] Slice 5.4.runtime-persistence: implement saved report template persistence.
- [x] Slice 5.4.role-visibility-runtime: implement role-scoped saved report template reads.
- [x] Slice 5.4.permission-visibility-runtime: implement permission-scoped saved report template reads.
- [x] Slice 5.4.hidden-deny-hardening: add denial tests for hidden saved report templates.
- [x] Slice 5.4.cross-tenant-deny-hardening: add denial tests for cross-tenant saved report templates.
- [x] Slice 5.4.duplicate-replay-hardening: add duplicate replay tests for saved report templates.
- [x] Slice 5.4.conflict-replay-hardening: add conflict replay tests for saved report templates.
- [x] Slice 5.5.descriptor-contract: add scheduled digest descriptor contracts for due periods.
- [x] Slice 5.5.period-key-contract: add scheduled digest idempotent period-key contracts.
- [x] Slice 5.5.due-period-worker: implement digest worker due-period selection.
- [x] Slice 5.5.export-job-worker: implement digest worker creation of one report export job for one due period.
- [x] Slice 5.5.run-status-hardening: persist digest run status.
- [x] Slice 5.5.notification-hardening: emit digest notification descriptors.
- [x] Slice 5.5.duplicate-period-hardening: add duplicate period-key replay tests for scheduled digests.
- [x] Slice 5.5.conflict-period-hardening: add conflicting period-key replay tests for scheduled digests.

#### Phase 6 subtasks

- [x] Slice 6.1.hashed-key-contract: add failing contracts for hashed public API keys.
- [x] Slice 6.1.reveal-state-contract: add failing contracts for one-time secret reveal state.
- [x] Slice 6.1.rotation-audit-contract: add failing contracts for public API key rotation audit rows.
- [x] Slice 6.1.hashed-key-schema: add Prisma public API key schema, migration and ownership coverage.
- [x] Slice 6.1.reveal-state-schema: add Prisma public API key reveal-state schema, migration and ownership coverage.
- [x] Slice 6.1.rotation-audit-schema: add Prisma public API key rotation audit schema, migration and ownership coverage.
- [x] Slice 6.1.hashed-key-json: implement JSON public API key hashing persistence parity.
- [x] Slice 6.1.reveal-state-json: implement JSON one-time reveal state persistence parity.
- [x] Slice 6.1.rotation-audit-json: implement JSON rotation audit persistence parity.
- [x] Slice 6.1.hashed-key-prisma: implement Prisma public API key hashing repository adapter.
- [x] Slice 6.1.reveal-state-prisma: implement Prisma one-time reveal state repository adapter.
- [x] Slice 6.1.rotation-audit-prisma: implement Prisma rotation audit repository adapter.
- [x] Slice 6.1.masked-preview-hardening: wire masked key preview tests.
- [x] Slice 6.1.reveal-replay-hardening: wire one-time reveal replay tests.
- [x] Slice 6.2.a.contract: add public API auth helper tests for sandbox/prod key isolation and missing scopes.
- [x] Slice 6.2.b.middleware: implement key lookup, hash verification, environment binding and request context.
- [x] Slice 6.2.c.runtime: wire middleware into SDK/public routes with rate-limit and denial envelope tests.
- [x] Slice 6.3.timestamp-contract: add signed inbound webhook tests for timestamp tolerance.
- [x] Slice 6.3.signature-contract: add signed inbound webhook tests for signature mismatch.
- [x] Slice 6.3.nonce-contract: add signed inbound webhook tests for replay nonce behavior.
- [x] Slice 6.3.timestamp-verifier: implement pure signed webhook timestamp tolerance verification.
- [x] Slice 6.3.signature-verifier: implement pure signed webhook signature mismatch verification.
- [x] Slice 6.3.json-nonce: implement JSON replay nonce persistence for verified inbound webhooks.
- [x] Slice 6.3.prisma-nonce: implement Prisma replay nonce persistence for verified inbound webhooks.
- [x] Slice 6.3.normalization-descriptor-runtime: create normalization descriptors for verified inbound webhooks.
- [x] Slice 6.3.normalization-route-runtime: wire inbound webhook routes to the verified normalization descriptor path.
- [x] Slice 6.3.conflict-envelope-runtime: wire conflict envelopes for verified inbound webhook processing.
- [x] Slice 6.3.replay-envelope-runtime: wire replay envelopes for verified inbound webhook processing.
- [x] Slice 6.4.journal-contract: add webhook delivery journal contracts.
- [x] Slice 6.4.retry-state-contract: add webhook delivery retry-state tests.
- [x] Slice 6.4.schema: add Prisma webhook delivery journal schema/migration and ownership coverage.
- [x] Slice 6.4.claim-worker: implement webhook delivery worker claim behavior for due journal rows.
- [x] Slice 6.4.backoff-calculation-worker: implement webhook delivery retry backoff calculation.
- [x] Slice 6.4.retry-schedule-worker: persist the next webhook delivery retry schedule after a failed attempt.
- [x] Slice 6.4.attempt-persistence-worker: persist webhook delivery attempt results without provider secret leakage.
- [x] Slice 6.4.redaction-hardening: verify webhook delivery worker provider failures are sanitized.
- [x] Slice 6.4.replay-readside: expose webhook delivery replay read-side behavior.
- [x] Slice 6.4.status-readside: expose webhook delivery status read-side behavior.
- [x] Slice 6.4.dead-letter-readside: expose webhook delivery dead-letter transitions.
- [x] Slice 6.5.api-key-openapi: generate public OpenAPI docs for API-key management endpoints.
- [x] Slice 6.5.sdk-openapi: generate public OpenAPI docs for SDK runtime endpoints.
- [x] Slice 6.5.webhook-openapi: generate public OpenAPI docs for signed webhook endpoints.
- [x] Slice 6.5.auth-header-contract: add example contract tests for public API auth headers.
- [x] Slice 6.5.webhook-signature-contract: add example contract tests for webhook signatures.
- [x] Slice 6.5.idempotency-contract: add example contract tests for idempotency keys.
- [x] Slice 6.5.sdk-sandbox-docs: document sandbox public API examples.
- [x] Slice 6.5.sdk-prod-docs: document production public API examples.
- [x] Slice 6.5.webhook-docs: document signed webhook examples.
- [x] Slice 6.5.ci-smoke: verify generated public API docs in CI smoke.
- [x] Slice 6.5.runtime-smoke: verify generated public API docs in runtime smoke.

#### Phase 7 subtasks

- [x] Slice 7.1.scenario-contract: add failing repository contracts for bot scenarios.
- [x] Slice 7.1.version-contract: add failing repository contracts for bot scenario versions.
- [x] Slice 7.1.publish-audit-contract: add failing repository contracts for bot publish audit rows.
- [x] Slice 7.1.scenario-schema: add Prisma bot scenario schema, migration and ownership coverage.
- [x] Slice 7.1.version-schema: add Prisma bot scenario version schema, migration and ownership coverage.
- [x] Slice 7.1.publish-audit-schema: add Prisma bot publish audit schema, migration and ownership coverage.
- [x] Slice 7.1.scenario-json: implement JSON bot scenario persistence parity.
- [x] Slice 7.1.version-json: implement JSON bot scenario version persistence parity.
- [x] Slice 7.1.publish-audit-json: implement JSON bot publish audit persistence parity.
- [x] Slice 7.1.scenario-prisma: implement Prisma bot scenario repository adapter.
- [x] Slice 7.1.version-prisma: implement Prisma bot scenario version repository adapter.
- [x] Slice 7.1.publish-audit-prisma: implement Prisma bot publish audit repository adapter.
- [x] Slice 7.1.publish-audit-hardening: wire bot publish audit row tests.
- [x] Slice 7.1.version-visibility-hardening: wire bot scenario version visibility tests.
- [x] Slice 7.2.state-contract: add bot runtime worker tests for one deterministic scenario state transition.
- [x] Slice 7.2.outbound-contract: add bot runtime worker tests for outbound descriptor emission from one scenario step.
- [x] Slice 7.2.handoff-contract: add bot runtime worker tests for handoff descriptor emission from one scenario step.
- [x] Slice 7.2.state-worker: implement scenario-step state transition.
- [x] Slice 7.2.outbound-worker: create outbound descriptors from bot runtime state transitions.
- [x] Slice 7.2.handoff-worker: emit handoff descriptors from bot runtime state transitions.
- [x] Slice 7.2.retry-hardening: add bot runtime retry tests.
- [x] Slice 7.2.dead-letter-hardening: add bot runtime dead-letter tests.
- [x] Slice 7.2.malformed-scenario-hardening: add malformed scenario fail-closed tests.
- [x] Slice 7.3.window-contract: add proactive execution window contracts.
- [x] Slice 7.3.frequency-cap-contract: add proactive frequency cap contracts.
- [x] Slice 7.3.experiment-contract: add proactive experiment assignment contracts.
- [x] Slice 7.3.execution-window-schema: add Prisma proactive execution window schema, migration and ownership coverage.
- [x] Slice 7.3.frequency-cap-schema: add Prisma proactive frequency cap schema, migration and ownership coverage.
- [x] Slice 7.3.experiment-assignment-schema: add Prisma proactive experiment assignment schema, migration and ownership coverage.
- [x] Slice 7.3.execution-window-runtime: implement replay-safe proactive rule eligibility for execution windows.
- [x] Slice 7.3.frequency-cap-runtime: implement replay-safe proactive rule eligibility for frequency caps.
- [x] Slice 7.3.experiment-assignment-runtime: implement replay-safe proactive rule eligibility for experiment assignment.
- [x] Slice 7.3.tenant-targeting-hardening: add proactive tenant targeting tests.
- [x] Slice 7.3.client-targeting-hardening: add proactive client targeting tests.
- [x] Slice 7.3.cap-reset-hardening: add cap reset tests.
- [x] Slice 7.4.contract: add proactive delivery worker tests for eligible rule to outbound conversation descriptor.
- [x] Slice 7.4.eligible-rule-worker: implement proactive worker selection of one eligible rule execution.
- [x] Slice 7.4.outbox-worker: implement proactive worker creation of one outbound conversation descriptor through the existing outbox path.
- [x] Slice 7.4.persistence-attempts: persist proactive delivery attempts.
- [x] Slice 7.4.persistence-idempotency: persist replay-safe proactive delivery idempotency keys.
- [x] Slice 7.4.persistence-attribution: persist proactive experiment attribution for delivered descriptors.
- [x] Slice 7.5.provider-port-contract: define quality scoring provider port contracts.
- [x] Slice 7.5.deterministic-provider-contract: define deterministic quality scoring test provider contracts.
- [x] Slice 7.5.request-adapter: implement model-backed quality scoring request mapping.
- [x] Slice 7.5.response-adapter: implement model-backed quality scoring response normalization.
- [x] Slice 7.5.request-telemetry-redaction: verify quality-scoring request telemetry is sanitized.
- [x] Slice 7.5.response-telemetry-redaction: verify quality-scoring response telemetry is sanitized.
- [x] Slice 7.5.request-telemetry-persistence: persist sanitized quality-scoring request telemetry.
- [x] Slice 7.5.response-telemetry-persistence: persist sanitized quality-scoring response telemetry.
- [x] Slice 7.5.persistence-failures: persist sanitized quality scoring failure envelopes without prompt or secret leakage.
- [x] Slice 7.6.rating-contract: add repository contracts for quality ratings.
- [x] Slice 7.6.manual-review-contract: add repository contracts for manual QA reviews.
- [x] Slice 7.6.scoring-audit-contract: add repository contracts for AI scoring audit rows.
- [x] Slice 7.6.rating-schema: add Prisma quality rating schema, migration and ownership coverage.
- [x] Slice 7.6.manual-review-schema: add Prisma manual QA review schema, migration and ownership coverage.
- [x] Slice 7.6.scoring-audit-schema: add Prisma AI scoring audit schema, migration and ownership coverage.
- [x] Slice 7.6.rating-json: implement JSON quality rating persistence parity.
- [x] Slice 7.6.manual-review-json: implement JSON manual QA review persistence parity.
- [x] Slice 7.6.scoring-audit-json: implement JSON AI scoring audit persistence parity.
- [x] Slice 7.6.rating-prisma: implement Prisma quality rating repository adapter.
- [x] Slice 7.6.manual-review-prisma: implement Prisma manual QA review repository adapter.
- [x] Slice 7.6.scoring-audit-prisma: implement Prisma AI scoring audit repository adapter.
- [x] Slice 7.6.rating-permission-hardening: add permission tests for quality ratings.
- [x] Slice 7.6.manual-review-permission-hardening: add permission tests for manual QA reviews.
- [x] Slice 7.6.scoring-audit-permission-hardening: add permission tests for AI scoring audit rows.
- [x] Slice 7.6.rating-tenant-isolation-hardening: add tenant isolation tests for quality ratings.
- [x] Slice 7.6.manual-review-tenant-isolation-hardening: add tenant isolation tests for manual QA reviews.
- [x] Slice 7.6.scoring-audit-tenant-isolation-hardening: add tenant isolation tests for AI scoring audit rows.
- [x] Slice 7.6.rating-audit-immutability-hardening: add audit immutability tests for quality ratings.
- [x] Slice 7.6.manual-review-audit-immutability-hardening: add audit immutability tests for manual QA reviews.
- [x] Slice 7.6.scoring-audit-immutability-hardening: add audit immutability tests for AI scoring audit rows.

#### Phase 8 subtasks

- [x] Slice 8.1.retry-schedule-contract: add failing contracts for payment retry schedules.
- [x] Slice 8.1.dunning-state-contract: add failing contracts for payment dunning state.
- [x] Slice 8.1.reconciliation-conflict-contract: add failing contracts for reconciliation conflicts.
- [x] Slice 8.1.idempotent-retry-contract: add failing contracts for idempotent retry keys.
- [x] Slice 8.1.retry-schedule-schema: add Prisma payment retry schedule schema, migration and ownership coverage.
- [x] Slice 8.1.dunning-state-schema: add Prisma payment dunning state schema, migration and ownership coverage.
- [x] Slice 8.1.reconciliation-conflict-schema: add Prisma reconciliation conflict schema, migration and ownership coverage.
- [x] Slice 8.1.idempotent-retry-schema: add Prisma idempotent retry key schema, migration and ownership coverage.
- [x] Slice 8.1.retry-schedule-json: implement JSON payment retry schedule storage with sanitized error fields.
- [x] Slice 8.1.dunning-state-json: implement JSON payment dunning state storage.
- [x] Slice 8.1.reconciliation-conflict-json: implement JSON reconciliation conflict storage with sanitized error fields.
- [x] Slice 8.1.idempotent-retry-json: implement JSON idempotent retry key storage.
- [x] Slice 8.1.retry-schedule-prisma: implement Prisma payment retry schedule storage with sanitized error fields.
- [x] Slice 8.1.dunning-state-prisma: implement Prisma payment dunning state storage.
- [x] Slice 8.1.reconciliation-conflict-prisma: implement Prisma reconciliation conflict storage with sanitized error fields.
- [x] Slice 8.1.idempotent-retry-prisma: implement Prisma idempotent retry key storage.
- [x] Slice 8.1.retry-schedule-runtime: wire billing sync retry schedule decisions into provider event handling.
- [x] Slice 8.1.dunning-state-runtime: wire payment dunning state transitions into provider event handling.
- [x] Slice 8.1.reconciliation-conflict-runtime: wire reconciliation conflict decisions into provider event handling.
- [x] Slice 8.1.idempotent-retry-runtime: wire idempotent retry-key decisions into provider event handling.
- [x] Slice 8.1.retry-schedule-duplicate-replay-hardening: add duplicate replay tests for payment retry schedule decisions.
- [x] Slice 8.1.dunning-state-duplicate-replay-hardening: add duplicate replay tests for payment dunning state decisions.
- [x] Slice 8.1.reconciliation-conflict-duplicate-replay-hardening: add duplicate replay tests for reconciliation conflict decisions.
- [x] Slice 8.1.retry-schedule-conflict-replay-hardening: add conflict replay tests for payment retry schedule decisions.
- [x] Slice 8.1.dunning-state-conflict-replay-hardening: add conflict replay tests for payment dunning state decisions.
- [x] Slice 8.1.reconciliation-conflict-conflict-replay-hardening: add conflict replay tests for reconciliation conflict decisions.
- [x] Slice 8.2.approval-contract: add failing contracts for billing approvals.
- [x] Slice 8.2.legal-entity-contract: add failing contracts for legal entity fields.
- [x] Slice 8.2.tax-document-contract: add failing contracts for tax document metadata.
- [x] Slice 8.2.approval-schema: add Prisma billing approval schema, migration and ownership coverage.
- [x] Slice 8.2.legal-entity-schema: add Prisma legal entity schema, migration and ownership coverage.
- [x] Slice 8.2.tax-document-schema: add Prisma tax document schema, migration and ownership coverage.
- [x] Slice 8.2.approval-json: implement JSON billing approval persistence.
- [x] Slice 8.2.legal-entity-json: implement JSON legal entity persistence without raw document secrets.
- [x] Slice 8.2.tax-document-json: implement JSON tax document persistence without raw document secrets.
- [x] Slice 8.2.approval-prisma: implement Prisma billing approval persistence.
- [x] Slice 8.2.legal-entity-prisma: implement Prisma legal entity persistence without raw document secrets.
- [x] Slice 8.2.tax-document-prisma: implement Prisma tax document persistence without raw document secrets.
- [x] Slice 8.2.tariff-runtime: wire approval decisions into tariff mutations.
- [x] Slice 8.2.payment-runtime: wire approval decisions into payment mutations.
- [x] Slice 8.2.approval-audit-hardening: add immutable decision audit tests for billing approvals.
- [x] Slice 8.2.legal-entity-audit-hardening: add immutable decision audit tests for legal entity changes.
- [x] Slice 8.2.tax-document-audit-hardening: add immutable decision audit tests for tax document changes.
- [x] Slice 8.2.approval-redaction-hardening: add billing approval redaction tests.
- [x] Slice 8.2.legal-entity-redaction-hardening: add legal entity redaction tests.
- [x] Slice 8.2.tax-document-redaction-hardening: add tax document redaction tests.
- [x] Slice 8.3.reservation-lease-contract: add quota reservation lease tests.
- [x] Slice 8.3.expiration-claim-contract: add quota reservation expiration worker claim tests.
- [x] Slice 8.3.expiration-release-contract: add quota reservation expiration worker release-transition tests.
- [x] Slice 8.3.expiration-claim-worker: implement quota expiration worker claim over durable reservation state.
- [x] Slice 8.3.expiration-release-worker: implement quota expiration worker release transition for one claimed reservation.
- [x] Slice 8.3.expired-release-hardening: add idempotent release tests for expired reservations.
- [x] Slice 8.3.committed-release-hardening: add idempotent release tests for committed reservations.
- [x] Slice 8.3.released-release-hardening: add idempotent release tests for already released reservations.
- [x] Slice 8.3.channels-quota-readside: expose cross-surface quota reports for channels.
- [x] Slice 8.3.storage-quota-readside: expose cross-surface quota reports for storage.
- [x] Slice 8.3.webhooks-quota-readside: expose cross-surface quota reports for webhooks.
- [x] Slice 8.3.ai-quota-readside: expose cross-surface quota reports for AI.
- [x] Slice 8.3.bots-quota-readside: expose cross-surface quota reports for bots.
- [x] Slice 8.3.reports-quota-readside: expose cross-surface quota reports for reports.
- [x] Slice 8.3.operators-quota-readside: expose cross-surface quota reports for operators.
- [x] Slice 8.4.billing-contract: add privileged RBAC policy-consumption contracts for service-admin billing writes.
- [x] Slice 8.4.tenant-contract: add privileged RBAC policy-consumption contracts for service-admin tenant writes.
- [x] Slice 8.4.impersonation-contract: add privileged RBAC policy-consumption contracts for service-admin impersonation writes.
- [x] Slice 8.4.break-glass-contract: add privileged RBAC policy-consumption contracts for service-admin break-glass writes.
- [x] Slice 8.4.resolver-unknown-action: implement shared privileged policy resolver fail-closed behavior for unknown actions.
- [x] Slice 8.4.resolver-unknown-role: implement shared privileged policy resolver fail-closed behavior for unknown roles.
- [x] Slice 8.4.billing-runtime: wire resolver into service-admin billing write paths.
- [x] Slice 8.4.tenant-runtime: wire resolver into service-admin tenant write paths.
- [x] Slice 8.4.impersonation-runtime: wire resolver into service-admin impersonation write paths.
- [x] Slice 8.4.break-glass-runtime: wire resolver into service-admin break-glass write paths.
- [x] Slice 8.4.billing-denial-audit-hardening: add denial audit tests for service-admin billing write denials.
- [x] Slice 8.4.tenant-denial-audit-hardening: add denial audit tests for service-admin tenant write denials.
- [x] Slice 8.4.impersonation-denial-audit-hardening: add denial audit tests for service-admin impersonation write denials.
- [x] Slice 8.4.break-glass-denial-audit-hardening: add denial audit tests for service-admin break-glass write denials.
- [x] Slice 8.5.actor-filter-contract: add service-admin audit read/filter contracts for actor filters.
- [x] Slice 8.5.action-filter-contract: add service-admin audit read/filter contracts for action filters.
- [x] Slice 8.5.tenant-filter-contract: add service-admin audit read/filter contracts for tenant filters.
- [x] Slice 8.5.status-filter-contract: add service-admin audit read/filter contracts for status filters.
- [x] Slice 8.5.time-range-filter-contract: add service-admin audit read/filter contracts for time range filters.
- [x] Slice 8.5.export-filter-contract: add service-admin audit export contracts over filtered audit rows.
- [x] Slice 8.5.export-payload-contract: add service-admin audit export payload shape contracts.
- [x] Slice 8.5.pagination-readside: implement service-admin audit pagination with stable cursor ordering.
- [x] Slice 8.5.redaction-readside: implement service-admin audit read-side redaction for paginated rows.
- [x] Slice 8.5.export-descriptor: implement service-admin audit export descriptor creation.
- [x] Slice 8.5.export-redacted-payload: implement redacted payload generation for service-admin audit exports.
- [x] Slice 8.5.hardening-immutability: verify service-admin audit export source rows remain immutable.
- [x] Slice 8.5.hardening-redaction: verify service-admin audit export payloads redact sensitive fields.
- [x] Slice 8.5.hardening-replay-json: verify service-admin audit export descriptors are replay-safe with the JSON adapter.
- [x] Slice 8.5.hardening-replay-prisma: verify service-admin audit export descriptors are replay-safe with the Prisma adapter.

#### Phase 9 subtasks

- [x] Slice 9.1.telemetry-sample-contract: add repository contracts for telemetry samples.
- [x] Slice 9.1.health-rollup-contract: add repository contracts for component health rollups.
- [x] Slice 9.1.telemetry-sample-schema: add Prisma telemetry sample schema, migration and ownership coverage.
- [x] Slice 9.1.health-rollup-schema: add Prisma health rollup schema, migration and ownership coverage.
- [x] Slice 9.1.ingestion-runtime: implement telemetry sample ingestion with bounded retention fields.
- [x] Slice 9.1.rollup-runtime: implement component health rollup writes with bounded retention fields.
- [x] Slice 9.1.telemetry-snapshot-readside: wire platform snapshot reads to persisted telemetry samples.
- [x] Slice 9.1.health-rollup-readside: wire platform snapshot reads to persisted health rollups.
- [x] Slice 9.1.malformed-sample-hardening: add malformed telemetry sample tests.
- [x] Slice 9.1.telemetry-sample-retention-hardening: add telemetry sample retention-boundary tests.
- [x] Slice 9.1.health-rollup-retention-hardening: add component health rollup retention-boundary tests.
- [x] Slice 9.2.routing-rule-contract: add alert routing rule contracts.
- [x] Slice 9.2.ack-audit-contract: add alert acknowledgement audit contracts.
- [x] Slice 9.2.routing-schema: add Prisma alert routing schema, migration and ownership coverage.
- [x] Slice 9.2.ack-audit-schema: add Prisma acknowledgement audit schema, migration and ownership coverage.
- [x] Slice 9.2.runtime-rules: implement alert routing rule persistence.
- [x] Slice 9.2.runtime-ack-audit: implement alert acknowledgement audit rows.
- [x] Slice 9.2.notification-hardening: emit notification descriptors for routed alerts.
- [x] Slice 9.2.duplicate-hardening: add duplicate suppression tests for routed alert notifications.
- [x] Slice 9.3.customer-visible-contract: add incident communication worker tests for customer-visible updates.
- [x] Slice 9.3.internal-contract: add incident communication worker tests for internal-only updates.
- [x] Slice 9.3.customer-visible-worker: implement incident communication dispatch to customer-visible status-page descriptor ports.
- [x] Slice 9.3.internal-worker: implement incident communication dispatch to internal notification descriptor ports.
- [x] Slice 9.3.persistence-attempts: persist incident communication attempts.
- [x] Slice 9.3.persistence-retries: persist incident communication retry state.
- [x] Slice 9.3.persistence-dead-letter: persist incident communication dead-letter state.
- [x] Slice 9.4.adapter-contract: add status-page publisher adapter contract tests.
- [x] Slice 9.4.idempotent-key-contract: add status-page publisher idempotent external key tests.
- [x] Slice 9.4.adapter: implement deterministic status-page publisher adapter.
- [x] Slice 9.4.runtime-http: implement runtime HTTP status-page publisher adapter boundary.
- [x] Slice 9.4.incident-runtime: wire incident publishing through the status-page publisher adapter.
- [x] Slice 9.4.alert-runtime: wire platform alert publishing through the status-page publisher adapter.
- [x] Slice 9.4.incident-redaction-hardening: verify incident status-page publishing failures are sanitized.
- [x] Slice 9.4.alert-redaction-hardening: verify platform alert status-page publishing failures are sanitized.
- [x] Slice 9.5.contract-persistence: add feature flag rule persistence contract tests.
- [x] Slice 9.5.tenant-targeting-contract: add feature flag rollout evaluation contract tests for tenant targeting.
- [x] Slice 9.5.segment-targeting-contract: add feature flag rollout evaluation contract tests for segment targeting.
- [x] Slice 9.5.schema: add Prisma feature flag rule schema, migration and ownership coverage.
- [x] Slice 9.5.tenant-targeting-engine: implement tenant targeting engine with deterministic bucketing.
- [x] Slice 9.5.segment-targeting-engine: implement segment targeting engine with deterministic bucketing.
- [x] Slice 9.5.tenant-preview-hardening: add preview coverage for tenant rollout edge cases.
- [x] Slice 9.5.segment-preview-hardening: add preview coverage for segment rollout edge cases.
- [x] Slice 9.5.bucket-preview-hardening: add preview coverage for deterministic bucket boundary cases.
- [x] Slice 9.5.tenant-internal-test-hardening: add internal-test coverage for tenant rollout edge cases.
- [x] Slice 9.5.segment-internal-test-hardening: add internal-test coverage for segment rollout edge cases.
- [x] Slice 9.5.bucket-internal-test-hardening: add internal-test coverage for deterministic bucket boundary cases.
- [x] Slice 9.5.tenant-malformed-rule-hardening: add malformed tenant-targeting feature-flag rule tests.
- [x] Slice 9.5.segment-malformed-rule-hardening: add malformed segment-targeting feature-flag rule tests.
- [x] Slice 9.6.incident-audit-contract: add platform audit contracts for incident changes.
- [x] Slice 9.6.alert-audit-contract: add platform audit contracts for alert changes.
- [x] Slice 9.6.rollout-audit-contract: add platform audit contracts for rollout changes.
- [x] Slice 9.6.incident-outbox-contract: add platform outbox contracts for incident changes.
- [x] Slice 9.6.alert-outbox-contract: add platform outbox contracts for alert changes.
- [x] Slice 9.6.rollout-outbox-contract: add platform outbox contracts for rollout changes.
- [x] Slice 9.6.audit-schema: add Prisma platform audit schema, migration and ownership coverage.
- [x] Slice 9.6.outbox-schema: add Prisma platform outbox schema, migration and ownership coverage.
- [x] Slice 9.6.incident-audit-runtime: implement audit writes in incident mutations.
- [x] Slice 9.6.incident-outbox-runtime: implement outbox writes in incident mutations.
- [x] Slice 9.6.alert-audit-runtime: implement audit writes in alert mutations.
- [x] Slice 9.6.alert-outbox-runtime: implement outbox writes in alert mutations.
- [x] Slice 9.6.rollout-audit-runtime: implement audit writes in rollout mutations.
- [x] Slice 9.6.rollout-outbox-runtime: implement outbox writes in rollout mutations.
- [x] Slice 9.6.incident-audit-idempotency-hardening: verify idempotency for incident audit replay paths.
- [x] Slice 9.6.incident-outbox-idempotency-hardening: verify idempotency for incident outbox replay paths.
- [x] Slice 9.6.alert-audit-idempotency-hardening: verify idempotency for alert audit replay paths.
- [x] Slice 9.6.alert-outbox-idempotency-hardening: verify idempotency for alert outbox replay paths.
- [x] Slice 9.6.rollout-audit-idempotency-hardening: verify idempotency for rollout audit replay paths.
- [x] Slice 9.6.rollout-outbox-idempotency-hardening: verify idempotency for rollout outbox replay paths.
- [x] Slice 9.6.incident-audit-immutability-hardening: verify immutable audit behavior across incident replay paths.
- [x] Slice 9.6.alert-audit-immutability-hardening: verify immutable audit behavior across alert replay paths.
- [x] Slice 9.6.rollout-audit-immutability-hardening: verify immutable audit behavior across rollout replay paths.

#### Phase 10 subtasks

- [x] Slice 10.1.dialog-contract: add load-test runner worker contracts for dialog operation descriptors.
- [x] Slice 10.1.message-send-contract: add load-test runner worker contracts for message-send operation descriptors.
- [x] Slice 10.1.webhook-delivery-contract: add load-test runner worker contracts for webhook-delivery operation descriptors.
- [x] Slice 10.1.report-export-contract: add load-test runner worker contracts for report-export operation descriptors.
- [x] Slice 10.1.realtime-fanout-contract: add load-test runner worker contracts for realtime fan-out operation descriptors.
- [x] Slice 10.1.http-runner-adapter: implement deterministic HTTP operation runner adapter.
- [x] Slice 10.1.realtime-runner-adapter: implement deterministic realtime fan-out runner adapter.
- [x] Slice 10.1.run-status-persistence: persist load-test run status transitions.
- [x] Slice 10.1.run-metrics-persistence: persist load-test run metrics.
- [x] Slice 10.1.run-error-summary-persistence: persist load-test run error summaries.
- [x] Slice 10.1.runtime-config: wire load-test runner runtime worker config.
- [x] Slice 10.1.failure-envelope-hardening: add load-test runner failure envelope tests.
- [x] Slice 10.1.run-status-readside: add load-test runner status read-side tests.
- [x] Slice 10.1.run-metrics-readside: add load-test runner metrics read-side tests.
- [x] Slice 10.1.run-error-summary-readside: add load-test runner error-summary read-side tests.
- [x] Slice 10.2.contract: add PostgreSQL restore-check result repository contracts.
- [x] Slice 10.2.schema: add Prisma restore-check result schema, migration and ownership coverage.
- [x] Slice 10.2.command-port: implement restore-check command adapter boundary.
- [x] Slice 10.2.deterministic-command-adapter: implement deterministic restore-check command adapter for tests.
- [x] Slice 10.2.execution-worker: execute one PostgreSQL restore-check command through the adapter.
- [x] Slice 10.2.result-persistence: persist PostgreSQL restore-check result rows.
- [x] Slice 10.2.failure-envelope-hardening: wire restore-check failure envelopes.
- [x] Slice 10.2.timeout-hardening: wire restore-check timeout handling.
- [x] Slice 10.2.audit-hardening: wire restore-check audit descriptors.
- [x] Slice 10.3.existence-contract: add object-storage restore-check artifact existence contracts.
- [x] Slice 10.3.checksum-contract: add object-storage restore-check artifact checksum contracts.
- [x] Slice 10.3.metadata-contract: add object-storage restore-check metadata shape contracts.
- [x] Slice 10.3.existence-adapter: implement signed artifact existence verification adapter.
- [x] Slice 10.3.checksum-adapter: implement signed artifact checksum verification adapter.
- [x] Slice 10.3.metadata-adapter: implement signed artifact metadata verification adapter.
- [x] Slice 10.3.existence-result-persistence: persist object-storage restore-check existence results.
- [x] Slice 10.3.checksum-result-persistence: persist object-storage restore-check checksum results.
- [x] Slice 10.3.metadata-result-persistence: persist object-storage restore-check metadata results.
- [x] Slice 10.3.missing-artifact-hardening: add denial envelopes for missing restore-check artifacts.
- [x] Slice 10.3.checksum-mismatch-hardening: add denial envelopes for mismatched restore-check artifact checksums.
- [x] Slice 10.3.metadata-mismatch-hardening: add denial envelopes for mismatched restore-check artifact metadata.
- [x] Slice 10.4.queue-ownership-contract: add dead-letter replay worker tests for queue ownership validation.
- [x] Slice 10.4.idempotency-contract: add dead-letter replay worker tests for idempotency validation.
- [x] Slice 10.4.queue-ownership-worker: implement queue ownership validation before dead-letter replay.
- [x] Slice 10.4.idempotency-worker: implement idempotency validation before dead-letter replay.
- [x] Slice 10.4.requeue-worker: implement dead-letter requeue through the common replay helper after validation.
- [x] Slice 10.4.validation-denial-audit-hardening: wire dead-letter replay validation-denial audit rows.
- [x] Slice 10.4.requeue-audit-hardening: wire dead-letter replay requeue audit rows.
- [x] Slice 10.4.conflict-hardening: wire dead-letter replay conflict envelopes.
- [x] Slice 10.4.unknown-queue-hardening: wire unknown-queue fail-closed behavior.
- [x] Slice 10.5.migration-metadata-contract: add rollback-check tooling contracts for migration metadata.
- [x] Slice 10.5.api-snapshot-contract: add rollback-check tooling contracts for API contract snapshots.
- [x] Slice 10.5.migration-tooling: implement compatibility checks for additive migrations.
- [x] Slice 10.5.envelope-tooling: implement compatibility checks for envelope contract diffs.
- [x] Slice 10.5.openapi-tooling: implement compatibility checks for OpenAPI contract diffs.
- [x] Slice 10.5.runtime: wire release checklist integration.
- [x] Slice 10.5.persistence: persist rollback-check result rows.
- [x] Slice 10.6.a.catalog: add a tenant-owned repository method catalog and failing verifier contract for cross-tenant leaks.
- [x] Slice 10.6.b.identity-repository: cover identity tenant users, tenant audit events, role grants and permission denials with isolation checks.
- [x] Slice 10.6.c.conversation-repository: cover conversation delivery receipts, outbound descriptors and realtime event reads with isolation checks.
- [x] Slice 10.6.d.workspace-repository: cover workspace file metadata and scan idempotency reads with tenant/file ownership isolation checks.
- [x] Slice 10.6.e.billing-repository: cover billing tenant, subscription, invoice, quota ledger and reservation reads with isolation checks.
- [x] Slice 10.6.f.tenant-api: add route tests proving authenticated tenant context cannot be overridden by request parameters.
- [x] Slice 10.6.g.public-api: add route tests proving public API key tenant/environment context scopes all public SDK reads and writes.
- [x] Slice 10.6.h.impersonation-api: add route tests proving service-admin impersonation stays bound to the approved tenant scope.
- [x] Slice 10.6.i.ci: wire tenant isolation verifier into the release checklist and CI smoke command.
- [x] Slice 10.7.a.tenant-mutations: add audit immutability verification for tenant status and tenant configuration privileged mutations.
- [x] Slice 10.7.b.billing-mutations: add audit immutability verification for billing approval, tariff and quota privileged mutations.
- [x] Slice 10.7.c.impersonation-mutations: add audit immutability verification for service-admin impersonation start, stop and break-glass writes.
- [x] Slice 10.7.d.dead-letter-replay: add replay-worker audit immutability checks for dead-letter replay attempts and requeue decisions.
- [x] Slice 10.7.e.webhook-replay: add replay-worker audit immutability checks for webhook retry, duplicate and dead-letter transitions.
- [x] Slice 10.7.f.export-replay: add replay-worker audit immutability checks for report/audit export descriptor retries.
- [x] Slice 10.7.g.billing-replay: add replay-worker audit immutability checks for billing reconciliation and provider event replay paths.
- [x] Slice 10.7.h.ci: wire immutable audit verifier into the release checklist and CI smoke command.
- [x] Slice 10.8.a.fixtures: add canonical secret-bearing fixtures for API keys, provider tokens, webhook signatures and object keys.
- [x] Slice 10.8.b.logs: add log redaction tests for runtime bootstrap, worker failures and provider adapter exceptions.
- [x] Slice 10.8.c.envelopes: add denial/error envelope redaction tests for API, public API and service-admin surfaces.
- [x] Slice 10.8.d.provider-failures: add provider failure redaction tests for Telegram, VK, MAX, scanner, webhook and status-page adapters.
- [x] Slice 10.8.e.report-descriptors: add exported descriptor redaction tests for report downloads while preserving usable download URLs.
- [x] Slice 10.8.e.audit-descriptors: add exported descriptor redaction tests for service-admin audit exports.
- [x] Slice 10.8.e.restore-descriptors: add exported descriptor redaction tests for restore-check artifacts while preserving usable artifact URLs.
- [x] Slice 10.8.f.package: extract the shared redaction helper into the lowest dependency boundary that avoids package cycles.
- [x] Slice 10.8.f.observability: migrate structured log redaction to the shared helper.
- [x] Slice 10.8.f.envelopes: migrate denial/error envelope and exported descriptor redaction to the shared helper.
- [x] Slice 10.8.f.adapters: migrate provider/worker failure sanitization to the shared helper.
- [x] Slice 10.8.g.bootstrap-smoke: add runtime smoke fixtures proving bootstrap/config failures do not expose raw secrets.
- [x] Slice 10.8.g.provider-smoke: add runtime smoke fixtures proving provider connector failures do not expose raw secrets.
- [x] Slice 10.8.g.scanner-smoke: add runtime smoke fixtures proving scanner/file failure paths do not expose raw secrets.
- [x] Slice 10.8.g.export-smoke: add runtime smoke fixtures proving report/audit/restore export paths do not expose raw secrets.
- [x] Slice 10.8.h.release-checklist: wire redaction verification into the release checklist command.
- [x] Slice 10.8.h.ci-smoke: wire redaction verification into the CI smoke command.

## 8. Backend Integration Backlog Coverage

- Persistent client merge graph and conflict handling.
- Real dialog pagination, saved filters and transition guards.
- Storage, antivirus/scan pipeline and channel attachment limits.
- Shared metric definitions and real export files.
- Real webhook/API operations, signature validation, retry delivery and token storage.
- Proactive delivery, experiments, targeting and effectiveness analytics.
- Rescue auto-return and backend outcome analytics.
- Bot runtime, publish/version API, real metrics and handoff events.
- Immutable audit storage, server-side filters and redaction enforcement beyond the current identity/service-admin user-action slice.
- IdP/SSO, token lifecycle, password policy and auth event stream.
- Tenant provisioning, tenant isolation, quota enforcement and tenant audit.
- Billing provider abstraction, invoices, payment retries, approvals and legal/tax state.
- Platform telemetry, alert routing, SLO burn-rate and status page sync.
- Privileged RBAC, break-glass approval consumption hardening and cross-surface write enforcement.
- Incident communications, postmortems, rollout engine and audit storage.

## 9. QA Gates

Each backend iteration must pass:

- Unit tests for service-level business rules.
- Contract tests for envelope shape and API DTO behavior.
- Integration/runtime tests for API Gateway routes and OpenAPI.
- Tenant isolation tests for tenant-owned APIs.
- Permission denial tests for sensitive operations.
- Idempotency tests for repeated external or mutating requests.
- Outbox/job descriptor tests for external effects.
- Audit tests for privileged actions.
- Migration apply/rollback smoke check when database migrations are introduced.
- Frontend adapter compatibility smoke for changed endpoints.

## 10. Definition of Done

A backend feature is done only when:

- OpenAPI contract is documented.
- DTO validation is server-side.
- Permission and tenant guards are covered where relevant.
- Mutations create audit events where required.
- External effects go through outbox/jobs in production implementation, or expose explicit queue descriptors in contract slices.
- Repeated requests are safe where idempotency is required.
- Error responses use the shared envelope.
- Logs include trace ID and operation name.
- Metrics/health checks expose service state.
- Frontend adapter or contract tests prove the UI can consume the response.

## 11. Executive Checklist

This checklist is a milestone summary. Execute the one-slice tasks in the phase sections above; mark these executive items only after their referenced slices are complete and verified.

- [x] Done milestone: Phase 0 monorepo, local infrastructure, shared envelope and OpenAPI shell are complete.
- [x] Done milestone: Phase 0 Prisma/PostgreSQL schema foundation, migrations, lease-based outbox publisher and runnable worker foundation are complete.
- [x] Done milestone: Phase 1 auth, tenant and RBAC contract slice plus JSON/Prisma-backed current persistence foundation are complete.
- [x] Done milestone: Phase 1 slices 1.1-1.5 are complete and verified.
- [x] Done milestone: Phase 1 slice 1.6 RBAC review hardening is complete and verified.
- [x] Done milestone: API Gateway shell guards, first frontend adapter contract slices and current production bearer service-admin guard are complete.
- [x] Milestone: Phase 6 slice 6.2 and Phase 10 slices 10.6-10.8 are complete and verified.
- [x] Done milestone: Phase 2 conversations, messages, channels and realtime contract slice plus JSON/Prisma current storage foundation are complete.
- [x] Done milestone: Phase 2 slices 2.1-2.5 are complete and verified.
- [x] Done milestone: Phase 3 files, client profiles, templates and knowledge base contract slice is complete.
- [x] Milestone: Phase 3 slices 3.1-3.6 are complete and verified.
- [x] Done milestone: Phase 4 routing, SLA and rescue contract slice is complete.
- [x] Milestone: Phase 4 slices 4.1-4.5 are complete and verified.
- [x] Done milestone: Phase 5 reports, metric definitions and export descriptor contract slice is complete.
- [x] Milestone: Phase 5 slices 5.1-5.5 are complete and verified.
- [x] Done milestone: Phase 6 public API keys, webhooks, signatures and replay contract slice is complete.
- [x] Milestone: Phase 6 slices 6.1-6.5 are complete and verified.
- [x] Done milestone: Phase 7 automation, bot runtime, proactive delivery and quality/AI scoring contract slice is complete.
- [ ] Milestone: Phase 7 slices 7.1-7.6 are complete and verified.
- [x] Done milestone: Phase 8 billing, quotas, service-admin privileged workflows and current impersonation/break-glass storage are complete.
- [x] Milestone: Phase 1 slice 1.6 and Phase 10 slices 10.6-10.8 are complete and verified for service-admin surfaces.
- [x] Done milestone: Phase 9 platform monitoring, incidents and feature flags contract slice is complete.
- [ ] Milestone: Phase 9 slices 9.1-9.6 are complete and verified.
- [x] Done milestone: Phase 10 tenant isolation, audit immutability, retries, observability and production operations contract slice is complete.
- [x] Milestone: Phase 0 slices 0.3-0.5 and Phase 10 slices 10.1-10.8 are complete and verified.
