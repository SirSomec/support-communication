# Product Working State Audit And Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current production-readiness branch into a product that works through the real UI, real API routes, tenant-scoped runtime state, and repeatable local/container verification.

**Architecture:** Keep the current React service-adapter boundary and NestJS API Gateway. Close the remaining gaps by routing UI actions through existing service adapters, passing tenant/service-admin context into backend write paths, replacing local-only UI state with persisted API responses, and making E2E/container scripts start the required runtime instead of assuming it already exists.

**Tech Stack:** React 19, Vite 6, Playwright, Node test runner, NestJS API Gateway, Prisma/PostgreSQL, JSON local repositories, Docker Compose, Redis/MinIO/Mailpit for local runtime.

---

## Audit Summary

Static and contract checks are mostly green, but the product is not yet end-to-end operational. The migration removed the old `src/data/*` and `mockBackend` runtime imports, but several visible UI controls still update local React state, emit a toast, or create generated local records without calling the backend. Browser E2E also fails unless the backend is already running on `127.0.0.1:4100`.

Verified commands:

```bash
npm run test:no-demo-runtime
npm run test:services
npm run build
npm run backend:typecheck
```

Observed result: all four passed.

Failing command:

```bash
npm run test:pilot-flow
```

Observed result: 1 skipped, 3 failed. Vite proxy could not reach `http://127.0.0.1:4100`, so tenant login, onboarding, and notifications E2E paths failed before exercising product behavior.

## Findings

### P0: E2E Runtime Is Not Self-Contained

**Evidence:**
- `playwright.config.js` starts only Vite.
- `tests/pilot-flow.spec.js` calls `/api/v1/auth/tenant/login`, `/api/v1/notifications`, and onboarding paths through the Vite proxy.
- `npm run test:pilot-flow` failed with `ECONNREFUSED 127.0.0.1:4100`.

**Impact:** The branch can pass frontend build and adapter tests while the real browser product is unusable without a manually started API Gateway.

### P0: Main Outbound Dialog Path Is Local-Only

**Evidence:**
- `src/app/useOutboundConversation.js` creates a local conversation with `createOutboundConversation()` and inserts it through `setConversationItems`.
- `src/services/dialogService.js` already has `createOutboundConversationRequest()`, but the app-shell outbound modal does not use it.
- `src/features/settings/SdkConsolePanel.jsx` does call `dialogService.createOutboundConversationRequest()`, so outbound is only partially connected.

**Impact:** A primary user workflow can show a newly created dialog in the UI without a backend descriptor, audit event, queue item, report row, or delivery outbox record.

### P0: Conversation Backend Still Has Tenant Fallbacks

**Evidence:**
- `backend/apps/api-gateway/src/conversation/dialog.controller.ts` passes tenant context for list, detail, status, and messages, but not for `uploadAttachment()` or `createOutboundConversationRequest()`.
- `backend/apps/api-gateway/src/conversation/conversation.service.ts` still falls back to `tenant-volga` in delivery receipts, realtime events, outbound descriptors, and conversation tenant resolution.

**Impact:** Some writes can be stored under a default tenant instead of the authenticated tenant. This undermines tenant isolation and cross-surface consistency.

### P0: Attachments Are Simulated In The Composer

**Evidence:**
- `src/app/useComposerAttachments.js` marks uploads as `ready` after `window.setTimeout`.
- It does not call `dialogService.uploadAttachment()` or the files upload/finalize/scan API.
- Backend README states actual scanner execution and full antivirus callback delivery are still follow-up work.

**Impact:** Operators can send "ready" attachments that were never uploaded, scanned, finalized, or made downloadable by backend policy.

### P1: Several Visible Controls Are Toast-Only Or Local-Only

**Evidence:**
- Clients: `src/features/clients/ClientsScreen.jsx` calls merge/unmerge services but ignores response status and immediately mutates `mergedIds`; segment and export buttons have no backend action.
- Panel: `src/features/panel/PanelScreen.jsx` "Redistribute" only shows a toast.
- Visitors: `src/features/visitors/VisitorsScreen.jsx` "Start dialog" only shows a toast; proactive rule save assumes success data even on failure.
- Settings access: `src/features/settings/SettingsAccessPanel.jsx` toggles channel enabled state and limits locally without persistence.
- Notifications: `src/features/notifications/NotificationCenter.jsx` persists mark-read best-effort, then falls back to local read state on error; browser push, sound, external channels, and critical-alert test are local toggles/toasts.
- Templates: `src/features/templates/TemplatesScreen.jsx` and `src/app/useTemplateLibrary.js` synthesize `Date.now()` IDs when backend save responses do not contain a template.

**Impact:** The UI can represent successful product actions that did not persist, did not audit, and will disappear after reload.

### P1: Knowledge And AI Quality Actions Are Not Wired To Their Services

**Evidence:**
- `src/services/knowledgeService.js` exposes `saveArticleDraft()`.
- `src/features/quality/KnowledgeBaseWorkspace.jsx` saves versions, sends to review, publishes, rejects, and attaches files purely in local state plus toast.
- `src/services/qualityService.js` exposes `scoreDraftResponse()`, but `src/features/quality/QualityScreen.jsx` "AI check", review, AI suggestion actions, and coaching actions are toast-only.

**Impact:** Quality/knowledge reads are API-backed, but the write workflow remains a prototype.

### P1: Automation Builder Is Partially Connected

**Evidence:**
- `src/features/automation/AutomationScreen.jsx` creates new bot scenarios through `automationService.createBotScenario()`.
- Node edits, channel assignment, import application, and the save button are local-only.
- Test run calls `automationService.testBotScenario()` but does not check `response.status` before using `response.data.testRunId`.
- Bot metric rows are hardcoded in the component.

**Impact:** The bot builder looks editable but most edits are not durable, and runtime validation can appear successful even when the API failed.

### P1: Planned Cross-Surface Scenarios Remain Unverified

Open items in `docs/superpowers/plans/2026-07-02-production-runtime-readiness.md`:
- invite employee, assign role/group, log in as that employee, verify section access;
- create/archive topic and verify dialogs/templates/rules reference updated directory;
- create outbound SDK dialog and verify dialogs, panel workload, reports, and audit;
- create report export, retry failed export, and download descriptor;
- publish bot scenario and run bot test;
- score draft response and save knowledge article draft;
- run browser scenarios, rebuild containers, verify container endpoints.

**Impact:** Existing tests prove API adapter shape and many backend contracts, but not the product workflows a user would run.

### P2: Product Polish And Runtime Messaging Still Expose Prototype Language

**Evidence:**
- `src/App.jsx` handles demo request with only a toast.
- `src/features/settings/BackendIntegrationPanel.jsx` still displays "mock backend envelope".
- `docker-compose.yml` starts Postgres but configures API Gateway repositories as JSON stores by default; `docker-compose.pilot.yml` switches several repositories to Prisma.

**Impact:** The app can look less production-ready than the backend migration intends, and local Docker does not default to the strongest persistence path.

## Remediation Plan

### Task 1: Make Browser E2E Start A Real Runtime

**Files:**
- Modify: `playwright.config.js`
- Modify: `package.json`
- Modify: `tests/pilot-flow.spec.js`
- Modify: `docs/runtime-configuration.md`

- [x] Add an E2E script that starts API Gateway before Playwright or fails with a clear preflight message.
- [x] Keep the existing fast frontend-only smoke path separate from backend-dependent E2E.
- [x] Update `tests/pilot-flow.spec.js` setup so login/onboarding/notifications use seeded backend credentials from a known bootstrap path.
- [x] Run `npm run test:pilot-flow`; expected result: all tests pass or skip only the widget demo by explicit documented condition.

### Task 2: Wire Main Outbound Dialog To Backend

**Files:**
- Modify: `src/app/useOutboundConversation.js`
- Modify: `src/App.jsx`
- Modify: `src/features/dialogs/DialogModals.jsx`
- Modify: `tests/conversation-inbox.test.js`
- Modify: `tests/pilot-flow.spec.js`
- Modify: `backend/apps/api-gateway/src/conversation/dialog.controller.ts`
- Modify: `backend/apps/api-gateway/src/conversation/conversation.service.ts`

- [x] Replace local `createOutboundConversation()` success path with `dialogService.createOutboundConversationRequest()`.
- [x] Map backend descriptor response into a visible pending/queued conversation only after API success.
- [x] Show backend error state and keep the modal open on failure.
- [x] Pass tenant context from `TenantOperatorRequest` into backend outbound request handling.
- [x] Add E2E coverage proving outbound appears in dialogs and creates backend descriptor/audit/outbox evidence.

### Task 3: Remove Conversation Tenant Fallbacks

**Files:**
- Modify: `backend/apps/api-gateway/src/conversation/dialog.controller.ts`
- Modify: `backend/apps/api-gateway/src/conversation/conversation.service.ts`
- Modify: `backend/apps/api-gateway/src/conversation/conversation.repository.ts`
- Modify: `backend/tests/conversation-contracts.test.ts`
- Modify: `backend/tests/tenant-isolation-contracts.test.ts`

- [x] Require tenant context for attachment upload, outbound conversation creation, realtime record creation, and delivery receipt recording.
- [x] Replace remaining `tenant-volga` fallback behavior with fail-closed `tenant_context_required` envelopes for tenant-owned writes.
- [x] Keep seed records tenant-owned through explicit seed scripts only.
- [x] Run `npm run backend:test` and `npm run backend:tenant-isolation:verify`.

### Task 4: Replace Simulated Attachments With Upload Descriptors

**Files:**
- Modify: `src/app/useComposerAttachments.js`
- Modify: `src/app/useDialogActions.js`
- Modify: `src/services/dialogService.js`
- Modify: `backend/apps/api-gateway/src/conversation/dialog.controller.ts`
- Modify: `backend/apps/api-gateway/src/conversation/conversation.service.ts`
- Modify: `backend/apps/outbox-worker/src/index.ts`

- [x] On file select, call `dialogService.uploadAttachment()` and store backend `fileId`, `descriptorId`, scan state, and upload policy.
- [x] Remove timer-based automatic `ready` transitions.
- [x] Block send until backend returns an upload/scan state that allows delivery.
- [x] Wire worker scanner config or make local scan simulation an explicit dev-only adapter with visible state.
- [x] Add tests for upload failure, scan-pending send block, infected file block, clean file send, and reload persistence.

### Task 5: Convert Local-Only UI Controls Into API Mutations

**Files:**
- Modify: `src/features/clients/ClientsScreen.jsx`
- Modify: `src/features/panel/PanelScreen.jsx`
- Modify: `src/features/visitors/VisitorsScreen.jsx`
- Modify: `src/features/settings/SettingsAccessPanel.jsx`
- Modify: `src/features/notifications/NotificationCenter.jsx`
- Modify: relevant services under `src/services/`
- Modify: matching backend controllers/services under `backend/apps/api-gateway/src/`

- [x] For every button that changes business state, call a service adapter and update UI only from success response.
- [x] Add explicit error states for failed mutations instead of success toasts.
- [x] Remove fallback local success for notification mark-read failures.
- [x] Add missing routes or disable controls with a clear unavailable state where the backend capability is not ready.
- [x] Add adapter tests that assert no local state mutation occurs after error envelopes.

### Task 6: Wire Knowledge And AI Quality Writes

**Files:**
- Modify: `src/features/quality/KnowledgeBaseWorkspace.jsx`
- Modify: `src/features/quality/AiQualityWorkspace.jsx`
- Modify: `src/features/quality/QualityScreen.jsx`
- Modify: `src/services/knowledgeService.js`
- Modify: `src/services/qualityService.js`
- Modify: `backend/apps/api-gateway/src/workspace/knowledge.controller.ts`
- Modify: `backend/apps/api-gateway/src/quality/quality.controller.ts`

- [x] Save article drafts through `knowledgeService.saveArticleDraft()`.
- [x] Keep review submit, approve, reject, and knowledge attachment controls disabled with clear unavailable state until those state transitions become product requirements.
- [x] Wire draft scoring and AI coaching actions to `qualityService.scoreDraftResponse()` or new explicit routes.
- [x] Re-fetch or patch UI from backend responses after each action.
- [x] Add E2E for score draft response and save knowledge article draft.

### Task 7: Finish Automation Builder Persistence

**Files:**
- Modify: `src/features/automation/AutomationScreen.jsx`
- Modify: `src/services/automationService.js`
- Modify: `backend/apps/api-gateway/src/automation/automation.controller.ts`
- Modify: `backend/apps/api-gateway/src/automation/automation.service.ts`
- Modify: `backend/tests/automation-contracts.test.ts`

- [x] Persist node edits, channel assignments, import result, and save button through `PATCH /automation/bot-scenarios/:scenarioId`.
- [x] Check `response.status` for test runs before showing `testRunId`.
- [x] Load bot metrics from backend workspace payload instead of component constants.
- [x] Add browser test for publish scenario and run bot test.

### Task 8: Close Remaining Planned E2E Scenarios

**Files:**
- Modify: `tests/pilot-flow.spec.js`
- Modify: `tests/settings-runtime.spec.js`
- Modify: `tests/service-admin-runtime.spec.js`
- Modify: `tests/smoke.spec.js`
- Modify: `docs/superpowers/plans/2026-07-02-production-runtime-readiness.md`

- [x] Employee invite -> role/group -> employee login -> restricted section access.
- [x] Topic create/archive/restore -> dialogs/templates/rules refresh.
- [x] Outbound SDK dialog -> dialogs/panel/reports/audit consistency.
- [x] Report export -> failed retry -> download descriptor.
- [x] Bot publish -> test run -> audit/runtime evidence.
- [x] Draft score -> knowledge draft save.
- [x] Update the production readiness plan checkboxes only after each scenario passes.

### Task 9: Make Docker Profiles Match Runtime Claims

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.pilot.yml`
- Modify: `backend/README.md`
- Modify: `docs/runtime-configuration.md`

- [x] Keep `docker-compose.yml` as fast local JSON mode only if documented as non-production.
- [x] Add a named Prisma/PostgreSQL compose profile that sets all implemented repository env vars to `prisma`.
- [ ] Run container build and endpoint checks from the production-readiness plan.
- [x] Record which repositories still fall back to JSON in Prisma mode and track them as explicit backend backlog items.

Blocked: Docker daemon was not running in the local environment, so container build and endpoint checks could not be verified yet.
Rechecked 2026-07-02: Docker CLI and Compose are installed, but `docker info` cannot connect to `dockerDesktopLinuxEngine`; container build and endpoint checks remain externally blocked.

### Task 10: Clean Prototype Copy And Public Entry Points

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/features/public/LandingPage.jsx`
- Modify: `src/features/settings/BackendIntegrationPanel.jsx`

- [x] Replace demo-request toast with a backend lead/demo request endpoint or disable the button until the endpoint exists.
- [x] Replace "mock backend envelope" text with current API capability wording.
- [x] Ensure public landing CTAs either create a real lead/onboarding session or clearly route to implemented onboarding.

## Release Gate

Do not mark the product working until these pass from a clean checkout:

```bash
npm run test:no-demo-runtime
npm run test:services
npm run test:api-client
npm run test:session-store
npm run test:tenant-provision-service
npm run build
npm run backend:typecheck
npm run backend:test
npm run backend:tenant-isolation:verify
npm run backend:audit-immutability:verify
npm run test:pilot-flow
npm run test:smoke
docker compose build frontend api-gateway
docker compose up -d frontend api-gateway
```

Container endpoint checks:

```bash
curl http://127.0.0.1:8080/
curl http://127.0.0.1:8080/api/v1/health
curl http://127.0.0.1:4101/api/v1/health
```

Latest local verification, 2026-07-02:

- Passed: `npm run test:no-demo-runtime`
- Passed: `npm run test:services`
- Passed: `npm run test:api-client`
- Passed: `npm run test:session-store`
- Passed: `npm run test:tenant-provision-service`
- Passed: `npm run build`
- Passed: `npm run backend:typecheck`
- Passed: `npm run backend:test`
- Passed: `npm run backend:tenant-isolation:verify`
- Passed: `npm run backend:audit-immutability:verify`
- Passed: `npm run test:pilot-flow`
- Passed: `npm run test:smoke`
- Blocked: `docker compose build frontend api-gateway`, `docker compose up -d frontend api-gateway`, and endpoint curls because the Docker daemon is unavailable.
