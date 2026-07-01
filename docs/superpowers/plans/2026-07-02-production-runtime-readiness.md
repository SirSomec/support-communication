# Production Runtime Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the application from demo-seeded runtime to a working production-like state: authenticated sessions, tenant-scoped data, backend-owned settings and workspaces, durable repositories, auditability, and frontend screens that render API data instead of local static datasets.

**Architecture:** Keep the existing React service-adapter boundary and NestJS API Gateway, but move remaining runtime state behind backend repositories and tenant/session guards. Frontend screens load through `src/services/*Service.js` adapters, route guards validate `auth/tenant/state`, privileged service-admin flows use bearer service-admin sessions, and backend services read durable repository state seeded through explicit seed scripts rather than fixture imports in request paths.

**Tech Stack:** React 19, Vite 6, browser `fetch`, Node test runner, Playwright, NestJS API Gateway, Prisma/PostgreSQL, repository bootstrap helpers under `@support-communication/database`, Docker Compose.

---

## Current Runtime Gaps

These are the runtime gaps found in the current workspace and used as the basis for the tasks below:

- `src/data.js` exports static frontend data used by app shell navigation and product screens.
- Product screens still import local datasets from `../../data.js`: `PanelScreen`, `ReportsScreen`, `TemplatesScreen`, `VisitorsScreen`, `QualityScreen`, `AutomationScreen`, `AuditScreen`, `SdkConsolePanel`, and several service-admin workspaces.
- `src/services/mockBackend.js` remains in the tree even though service adapters were moved to API calls.
- `src/services/apiClient.js` can send `x-demo-service-admin-*` headers automatically in non-production runtime.
- `src/features/auth/AuthPage.jsx` can complete SSO, 2FA, invite, and organization selection by writing `demo-ui-*` session tokens.
- `src/features/onboarding/OrganizationOnboarding.jsx` can complete onboarding with an `onboarding-ui-*` token when backend tenant login does not return a real token.
- `src/services/auditService.js` returns `api_route_missing` for audit export and redaction.
- `src/services/backendIntegrationService.js` is a static readiness registry rather than a backend-derived capability snapshot.
- Backend request services still import fixture modules in runtime code paths, including identity, service-admin, billing, automation, quality, reports, integrations, routing, operations, and platform monitoring.
- Some backend services expose durable repositories but still use fixture arrays for default lists, fallback tenants, static metrics, or type ownership.
- Tests still allow static UI datasets and fixture-backed backend imports outside explicit seed/test paths.

## Target Runtime Contract

- A browser session is valid only when `GET /api/v1/auth/tenant/state` returns `status: "ok"` and `data.authenticated: true`.
- Service-admin screens use bearer service-admin sessions from `POST /api/v1/auth/login` and never rely on `x-demo-service-admin-*` headers from the frontend.
- Every tenant-scoped product screen loads data from an API adapter and sends a tenant operator bearer token.
- Every backend read/write path gets `tenantId` from `TenantOperatorAuthGuard` or an explicit service-admin context, not from a hardcoded default.
- Fixture files may remain only as seed/test inputs under explicit seed scripts and tests; request services do not import fixture modules for runtime data.
- Static frontend `src/data/*` modules are removed from app runtime imports after their screens are migrated.
- Empty states, denied states, loading states, and backend errors are visible and test-covered for each migrated screen.

## Work Ownership Map

| Area | Current runtime source | Target runtime source | Main files |
| --- | --- | --- | --- |
| Auth/session | Demo headers and local UI tokens | Tenant operator and service-admin bearer sessions | `src/services/apiClient.js`, `src/app/sessionStore.js`, `src/features/auth/AuthPage.jsx`, `backend/apps/api-gateway/src/identity/*` |
| Onboarding | Provisioning plus local token fallback | Provisioning returns usable admin session or blocks finish | `src/features/onboarding/OrganizationOnboarding.jsx`, `src/services/tenantProvisionService.js`, `backend/apps/api-gateway/src/identity/tenant-provision.service.ts` |
| App shell/navigation | `src/data/navigation.js` | Static route metadata plus permission model from backend | `src/app/access.js`, `src/features/app-shell/AppShell.jsx`, `backend/apps/api-gateway/src/identity/permission.service.ts` |
| Dialog workspace | API adapter with backend repository | Tenant-scoped repository and realtime fanout | `src/app/useConversationInbox.js`, `backend/apps/api-gateway/src/conversation/*` |
| Panel/workload | `src/data/operations.js` | Routing workload API | `src/features/panel/PanelScreen.jsx`, `backend/apps/api-gateway/src/routing/*` |
| Reports | `src/data/reports.js` plus report API actions | Report workspace API with export jobs and metrics | `src/features/reports/ReportsScreen.jsx`, `backend/apps/api-gateway/src/reports/*` |
| Templates | `src/data/templates.js` | Templates API | `src/features/templates/TemplatesScreen.jsx`, `backend/apps/api-gateway/src/workspace/templates.controller.ts` |
| Visitors/proactive | `src/data/visitors.js` | Automation workspace and proactive APIs | `src/features/visitors/VisitorsScreen.jsx`, `backend/apps/api-gateway/src/automation/*` |
| Quality/knowledge | `src/data/quality.js` | Quality and knowledge APIs | `src/features/quality/*`, `backend/apps/api-gateway/src/quality/*`, `backend/apps/api-gateway/src/workspace/knowledge.controller.ts` |
| Automation | `src/data/automation.js` | Automation repository | `src/features/automation/AutomationScreen.jsx`, `backend/apps/api-gateway/src/automation/*` |
| Audit | `src/data/audit.js` plus missing routes | Service-admin audit search, export, redaction | `src/features/audit/AuditScreen.jsx`, `src/services/auditService.js`, `backend/apps/api-gateway/src/service-admin/*` |
| Settings | Backend-connected UI, some fallback arrays | Backend-only employees, roles, groups, topics, rules, channels | `src/features/settings/*`, `backend/apps/api-gateway/src/identity/settings-*`, `backend/apps/api-gateway/src/integrations/*` |
| Service admin | `src/data/serviceAdmin.js` plus service APIs | Service-admin APIs with bearer session and durable repositories | `src/features/service-admin/*`, `backend/apps/api-gateway/src/service-admin/*`, `backend/apps/api-gateway/src/platform/*`, `backend/apps/api-gateway/src/billing/*` |
| Platform/operations | Fixture-backed monitoring and readiness | Telemetry, incidents, operation runs, dead-letter records | `backend/apps/api-gateway/src/platform/*`, `backend/apps/api-gateway/src/operations/*` |

## Task 1: Add Runtime Demo Guards

**Files:**
- Create: `tests/no-demo-runtime-imports.test.js`
- Modify: `package.json`

- [ ] Add a Node test that scans frontend runtime files and fails on imports from `src/data.js`, `src/data/*`, and `src/services/mockBackend.js` outside explicitly allowed model/config files.
- [ ] Add a backend scan in the same test that fails when files under `backend/apps/api-gateway/src/**/*.service.ts`, `*.controller.ts`, `*.route.ts`, and worker files import `*.fixtures.ts`.
- [ ] Allow `*.fixtures.ts` imports only from repository seed/bootstrap files and backend tests while this migration is running.
- [ ] Add a check that frontend runtime code does not write access tokens matching `demo-ui-` or `onboarding-ui-`.
- [ ] Add `test:no-demo-runtime` to `package.json`.
- [ ] Run `npm run test:no-demo-runtime` and confirm it fails before migration with the current runtime imports.

Suggested scanner shape:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const root = new URL("..", import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

describe("runtime demo-data guard", () => {
  it("does not allow frontend runtime imports from src/data", () => {
    const files = [
      "src/App.jsx",
      "src/app/access.js",
      "src/features/app-shell/AppShell.jsx",
      "src/features/panel/PanelScreen.jsx",
      "src/features/reports/ReportsScreen.jsx",
      "src/features/templates/TemplatesScreen.jsx",
      "src/features/visitors/VisitorsScreen.jsx",
      "src/features/quality/QualityScreen.jsx",
      "src/features/automation/AutomationScreen.jsx",
      "src/features/audit/AuditScreen.jsx",
      "src/features/settings/SdkConsolePanel.jsx",
      "src/features/service-admin/ServiceAdminDashboard.jsx"
    ];

    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /from\s+["'](?:\.\.\/)+data(?:\.js)?["']/);
      assert.doesNotMatch(source, /from\s+["'](?:\.\.\/)+data\/[^"']+["']/);
      assert.doesNotMatch(source, /mockBackend\.js/);
    }
  });

  it("does not allow local UI access tokens", () => {
    for (const file of ["src/features/auth/AuthPage.jsx", "src/features/onboarding/OrganizationOnboarding.jsx"]) {
      const source = read(file);
      assert.doesNotMatch(source, /demo-ui-/);
      assert.doesNotMatch(source, /onboarding-ui-/);
    }
  });
});
```

## Task 2: Replace Frontend Demo Header Auth With Real Session Modes

**Files:**
- Modify: `src/services/apiClient.js`
- Modify: `src/app/sessionStore.js`
- Modify: `src/services/authService.js`
- Modify: `tests/api-client.test.js`
- Modify: `tests/session-store.test.js`

- [ ] Remove `DEFAULT_DEMO_SERVICE_ADMIN_KEY` and automatic browser injection of `x-demo-service-admin-*` headers from `apiRequest`.
- [ ] Keep `authMode: "service-admin"` but require a stored service-admin bearer token; return a client error envelope when the token is absent.
- [ ] Split tenant operator session and service-admin session storage keys in `sessionStore.js`.
- [ ] Add `setTenantSession`, `getTenantAccessToken`, `clearTenantSession`, `setServiceAdminSession`, `getServiceAdminAccessToken`, and `clearServiceAdminSession`.
- [ ] Keep backward-compatible `setSession`, `getAccessToken`, and `clearSession` as tenant-session aliases until all callers are updated.
- [ ] Update `apiRequest` token selection: tenant routes use tenant access token, service-admin routes use service-admin access token, and public onboarding/provisioning routes use no token unless the caller passes one.
- [ ] Update tests to assert no `x-demo-service-admin-key` header is sent by default in development, test, or production mode.
- [ ] Update service-admin adapter tests to seed a service-admin token before calling privileged routes.

Expected API-client behavior:

```js
const token = authMode === "service-admin"
  ? getServiceAdminAccessToken()
  : getTenantAccessToken();

if (token) {
  requestHeaders.authorization = `Bearer ${token}`;
}

if (authMode === "service-admin" && !token) {
  return createApiErrorEnvelope({
    code: "service_admin_session_required",
    message: "Service-admin bearer session is required.",
    operation,
    service
  });
}
```

## Task 3: Replace Demo Service-Admin Guard With Session-First Guard

**Files:**
- Rename: `backend/apps/api-gateway/src/identity/demo-service-admin.guard.ts` to `backend/apps/api-gateway/src/identity/service-admin-session.guard.ts`
- Modify: all imports currently referencing `DemoServiceAdminGuard`
- Modify: `backend/apps/api-gateway/src/identity/auth.service.ts`
- Modify: `backend/apps/api-gateway/src/identity/auth.controller.ts`
- Modify: `backend/apps/api-gateway/src/identity/identity.module.ts`
- Modify: `backend/apps/api-gateway/src/service-admin/service-admin.module.ts`
- Modify: `backend/apps/api-gateway/src/platform/platform.module.ts`
- Modify: `backend/apps/api-gateway/src/billing/billing.module.ts`
- Modify: `backend/apps/api-gateway/src/feature-flags/feature-flag.module.ts`
- Modify: backend auth and privileged-route tests under `backend/tests`

- [ ] Rename the guard class to `ServiceAdminSessionGuard`.
- [ ] Make bearer service-admin session the normal path for privileged endpoints.
- [ ] Move the current demo-header path behind `ALLOW_DEMO_SERVICE_ADMIN_HEADERS=true` and `NODE_ENV` in `["development", "test"]`.
- [ ] Ensure production rejects requests without a valid bearer session even when demo env vars are present.
- [ ] Update `AuthService.getAuthState` so absent service-admin session returns `authenticated: false` instead of the fixture `serviceAdminSession`.
- [ ] Update `AuthService.login` so successful MFA completion creates a persisted service-admin session without requiring a demo header.
- [ ] Keep OIDC/SAML descriptors as provider flows, but do not issue a completed local session until the backend has a validated subject and role mapping.
- [ ] Record permission denials through `IdentityRepository.recordPermissionDenialEvent` for both bearer and denied demo-header attempts.
- [ ] Add backend tests for production rejection, test-mode demo opt-in, bearer success, missing permission denial, and revoked session denial.

## Task 4: Make Auth UI Fully Backend-Driven

**Files:**
- Modify: `src/features/auth/AuthPage.jsx`
- Modify: `src/features/auth/authModel.js`
- Modify: `src/services/authService.js`
- Modify: `tests/pilot-flow.spec.js`
- Modify: `tests/smoke.spec.js`

- [ ] Remove email substring branches for blocked, maintenance, multi-organization, and agent 2FA simulation from `handleLoginSubmit`.
- [ ] Wire SSO buttons to existing `POST /auth/oidc/start`, `GET /auth/oidc/callback`, and `POST /auth/saml/acs` routes.
- [ ] Add `POST /auth/invites/accept`, `POST /auth/recovery/request`, `POST /auth/recovery/complete`, and `POST /auth/tenant/select` routes in `auth.controller.ts`.
- [ ] Persist invite tokens, recovery tokens, tenant membership choices, token expiry, token consumption, and auth audit events in `IdentityRepository`.
- [ ] Replace `setDemoUiSession` with backend session creation or backend denial states.
- [ ] Use `authService.loginTenantOperator` as the only password-login success path.
- [ ] Display backend `error.code` states for blocked tenant, inactive user, expired invite, required MFA, and maintenance.
- [ ] Update Playwright auth tests so they create or seed real tenant operator credentials, log in, and verify the app shell only after `auth/tenant/state` confirms the session.

## Task 5: Make Onboarding Produce Real Tenant State

**Files:**
- Modify: `backend/apps/api-gateway/src/identity/tenant-provision.service.ts`
- Modify: `backend/apps/api-gateway/src/identity/tenant-provision.controller.ts`
- Modify: `backend/apps/api-gateway/src/identity/identity.repository.ts`
- Modify: `backend/apps/api-gateway/src/integrations/integration.repository.ts`
- Modify: `backend/apps/api-gateway/src/billing/billing.repository.ts`
- Modify: `src/features/onboarding/OrganizationOnboarding.jsx`
- Modify: `src/services/tenantProvisionService.js`
- Modify: `tests/tenant-provision-service.test.js`
- Add backend test: `backend/tests/tenant-provision-session.test.ts`

- [ ] Extend provision response with `session.accessToken`, `session.refreshToken`, `session.expiresAt`, `operator`, `tenantId`, seeded role grants, and default workspace identifiers.
- [ ] Add `IdentityRepository.provisionTenantBundle` that persists tenant, first owner, password credential, default topic directory, default groups, default settings rules, billing tenant state, public API key, and default SDK channel inside one Prisma transaction.
- [ ] Persist invited employees from onboarding rather than keeping them in local React state after finish.
- [ ] Replace onboarding test-message local queue with an API call that writes an outbox event and a webhook/channel test record.
- [ ] Remove `onboarding-ui-*` fallback from `OrganizationOnboarding.jsx`; if login after provision fails, show backend error and keep the user on onboarding.
- [ ] Add backend rollback behavior or compensation when tenant creation fails after partial persistence.
- [ ] Add tests for duplicate slug, duplicate admin email, invalid channel domain, provisioned owner login, and seeded tenant settings visibility.

## Task 6: Enforce Tenant State At App Entry

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/app/useWorkspaceRoute.js`
- Modify: `src/app/useConversationInbox.js`
- Modify: `src/app/useTemplateLibrary.js`
- Modify: `src/app/useDialogActions.js`
- Modify: `src/app/useOutboundConversation.js`
- Add: `src/app/useTenantSessionState.js`
- Modify: `tests/session-store.test.js`
- Modify: `tests/smoke.spec.js`

- [ ] Add `useTenantSessionState` that calls `authService.getTenantOperatorState` on app load and exposes `loading`, `authenticated`, `operator`, `tenantId`, `permissions`, and denial reason.
- [ ] Block product workspace rendering until tenant state is loaded.
- [ ] Redirect unauthenticated users to auth instead of letting hooks operate with no real backend session.
- [ ] Replace `hasSession()` checks that only inspect local storage with confirmed tenant state.
- [ ] Ensure every app-level mutation surfaces `401` and `403` by clearing session or showing an access-denied state.
- [ ] Update route tests to verify stale local tokens do not open the workspace.

## Task 7: Move Navigation And Access From Static Data To Permission Model

**Files:**
- Modify: `src/app/access.js`
- Modify: `src/features/app-shell/AppShell.jsx`
- Create: `src/app/navigationModel.js`
- Modify: `src/App.jsx`
- Modify: `backend/apps/api-gateway/src/identity/permission.service.ts`
- Modify: `backend/apps/api-gateway/src/identity/permission.controller.ts`
- Modify: `backend/tests/permission-contracts.test.ts`

- [ ] Move local route labels/icons into `src/app/navigationModel.js` as UI metadata without tenant/demo metrics.
- [ ] Load role actions and section availability from `permissionService.fetchPermissionModel`.
- [ ] Map backend actions to app sections with a deterministic table, for example `reports.read -> reports`, `settings.integrations.write -> settings`.
- [ ] Remove import of `navItems` from `src/data.js`.
- [ ] Add backend permissions for all sections: dialogs, panel, clients, templates, visitors, reports, quality, automation, audit, settings, service-admin.
- [ ] Add tests that each seeded role has a clear section access profile and that denied roles do not see restricted navigation items.

## Task 8: Make Panel And Routing Workload API-Owned

**Files:**
- Modify: `src/features/panel/PanelScreen.jsx`
- Add: `src/services/routingService.js`
- Modify: `src/services/index.js`
- Modify: `backend/apps/api-gateway/src/routing/routing.service.ts`
- Modify: `backend/apps/api-gateway/src/routing/routing.repository.ts`
- Modify: `backend/apps/api-gateway/src/routing/routing.controller.ts`
- Modify: `backend/tests/routing-contracts.test.ts`
- Modify: `tests/backend-services.test.js`

- [ ] Add frontend `routingService.fetchWorkload`, `simulateAssignment`, `createAssignment`, `pauseSla`, `startRescue`, and `resolveRescue`.
- [ ] Replace `operators` and `queues` imports in `PanelScreen.jsx` with `routingService.fetchWorkload`.
- [ ] Render backend loading, empty, partial, and error states through `ProductScreen`.
- [ ] Ensure `routing.controller.ts` uses `TenantOperatorAuthGuard` for tenant workload reads/writes.
- [ ] Replace any hardcoded `tenant-demo` fallback in routing service/repository with tenant ID from request context.
- [ ] Persist queue/operator workload state and rescue reports per tenant.
- [ ] Add contract tests that two tenants see isolated queues and operators.

## Task 9: Make Reports Screen Render Report Workspace Data

**Files:**
- Modify: `src/features/reports/ReportsScreen.jsx`
- Modify: `src/services/reportService.js`
- Modify: `backend/apps/api-gateway/src/reports/report.service.ts`
- Modify: `backend/apps/api-gateway/src/reports/report.repository.ts`
- Modify: `backend/apps/api-gateway/src/reports/report.controller.ts`
- Modify: `backend/tests/report-contracts.test.ts`
- Modify: `tests/backend-services.test.js`

- [ ] Load `metrics`, `bars`, `chartBlocks`, `columnOptions`, `rows`, `rescueOutcomeSummary`, `rescueReportRows`, and `exportJobs` from `reportService.fetchReportWorkspace`.
- [ ] Remove imports from `src/data.js` in `ReportsScreen.jsx`.
- [ ] Build filter option lists from backend workspace payload instead of local arrays when backend provides them.
- [ ] Keep export creation, retry, and download flows on `reportService`, but update UI state from returned backend job records.
- [ ] Move report fixtures into repository seed input and remove fixture imports from `report.service.ts`.
- [ ] Persist export jobs, descriptors, idempotency keys, retry audits, and digest jobs per tenant.
- [ ] Add tests for export idempotency, expired descriptor regeneration, denied export without permission, and tenant-isolated report rows.

## Task 10: Make Templates Backend-Owned

**Files:**
- Modify: `src/features/templates/TemplatesScreen.jsx`
- Modify: `src/app/useTemplateLibrary.js`
- Modify: `src/services/templateService.js`
- Modify: `backend/apps/api-gateway/src/workspace/templates.controller.ts`
- Modify: `backend/apps/api-gateway/src/workspace/workspace.service.ts`
- Modify: `backend/apps/api-gateway/src/workspace/workspace.repository.ts`
- Modify: `backend/tests/workspace-template-contracts.test.ts`

- [ ] Remove `initialTemplates` import from `TemplatesScreen.jsx`.
- [ ] Load templates from `templateService.fetchTemplates`.
- [ ] Save template drafts through `templateService.saveTemplate`.
- [ ] Ensure templates are stored with `tenantId`, `topicId`, `channel`, author, status, version, and audit event.
- [ ] Add empty state for tenants with no templates.
- [ ] Add tests for create, update, archive, tenant isolation, and permission denial.

## Task 11: Make Visitors And Proactive Rules Backend-Owned

**Files:**
- Modify: `src/features/visitors/VisitorsScreen.jsx`
- Modify: `src/services/visitorService.js`
- Modify: `backend/apps/api-gateway/src/automation/automation.service.ts`
- Modify: `backend/apps/api-gateway/src/automation/automation.repository.ts`
- Modify: `backend/apps/api-gateway/src/automation/automation.controller.ts`
- Modify: `backend/tests/automation-proactive-contracts.test.ts`

- [ ] Replace imports of `activeVisitors`, `proactiveRules`, and `rescueChats` with `visitorService.fetchVisitorWorkspace`.
- [ ] Persist proactive rules, execution windows, frequency caps, experiment assignments, handoff events, and rescue outcomes per tenant.
- [ ] Replace local UI updates after rule save with backend response records.
- [ ] Enforce tenant operator permission on proactive rule save and rescue trigger routes.
- [ ] Add tests for rule save, handoff event creation, rescue return timer, frequency cap enforcement, and tenant isolation.

## Task 12: Make Quality And Knowledge Workspaces Backend-Owned

**Files:**
- Modify: `src/features/quality/QualityScreen.jsx`
- Modify: `src/features/quality/AiQualityWorkspace.jsx`
- Modify: `src/features/quality/KnowledgeBaseWorkspace.jsx`
- Modify: `src/services/qualityService.js`
- Add: `src/services/knowledgeService.js`
- Modify: `src/services/index.js`
- Modify: `backend/apps/api-gateway/src/quality/quality.service.ts`
- Modify: `backend/apps/api-gateway/src/quality/quality.repository.ts`
- Modify: `backend/apps/api-gateway/src/workspace/knowledge.controller.ts`
- Modify: `backend/apps/api-gateway/src/workspace/workspace.repository.ts`
- Modify: `backend/tests/quality-contracts.test.ts`
- Modify: `backend/tests/knowledge-contracts.test.ts`

- [ ] Replace imports of quality metrics, suggestions, checks, coaching queue, effectiveness metrics, and knowledge articles with API workspace payloads.
- [ ] Add `knowledgeService.fetchArticles`, `fetchArticle`, and `saveArticleDraft` to match existing knowledge controller routes.
- [ ] Wire `KnowledgeBaseWorkspace` draft/version state to backend article data.
- [ ] Persist quality ratings, manual reviews, AI scoring audits, coaching queue, and knowledge article versions per tenant.
- [ ] Move quality fixture arrays into seed scripts and repository defaults.
- [ ] Add tests for draft scoring, manual review, article draft creation, version selection, tenant isolation, and provider audit records.

## Task 13: Make Automation Screen Backend-Owned

**Files:**
- Modify: `src/features/automation/AutomationScreen.jsx`
- Modify: `src/features/automation/automationModel.js`
- Modify: `src/services/automationService.js`
- Modify: `backend/apps/api-gateway/src/automation/automation.service.ts`
- Modify: `backend/apps/api-gateway/src/automation/automation.repository.ts`
- Modify: `backend/apps/api-gateway/src/automation/bot-runtime.worker.ts`
- Modify: `backend/tests/automation-contracts.test.ts`

- [ ] Replace imports of `auditEvents`, `botScenarios`, and `proactiveRules` with `automationService.fetchAutomationWorkspace`.
- [ ] Keep `createDraftScenario` as a UI-only empty flow factory, but persist newly created scenarios through a backend create/update route.
- [ ] Add `POST /api/v1/automation/bot-scenarios` and `PATCH /api/v1/automation/bot-scenarios/:scenarioId` routes for saving scenario drafts.
- [ ] Persist bot scenarios, versions, publish audit events, runtime test runs, and bot handoff events per tenant.
- [ ] Ensure publish creates immutable version and runtime worker can execute the published version.
- [ ] Add tests for import validation, draft save, publish idempotency, test run output, handoff event, and tenant isolation.

## Task 14: Complete Audit Export And Redaction Routes

**Files:**
- Modify: `src/services/auditService.js`
- Modify: `src/features/audit/AuditScreen.jsx`
- Modify: `backend/apps/api-gateway/src/service-admin/service-admin.controller.ts`
- Modify: `backend/apps/api-gateway/src/service-admin/service-admin.service.ts`
- Modify: `backend/apps/api-gateway/src/identity/identity.repository.ts`
- Modify: `backend/prisma/schema.prisma`
- Add migration under `backend/prisma/migrations`
- Add backend test: `backend/tests/service-admin-audit-export-contracts.test.ts`
- Modify: `tests/backend-services.test.js`

- [ ] Add `POST /api/v1/service-admin/audit-events/exports` route that calls `ServiceAdminService.requestAuditExport`.
- [ ] Add `POST /api/v1/service-admin/audit-events/:eventId/redactions` route.
- [ ] Persist audit export descriptors, requested filters, source event IDs, requester, expiry, redaction policy, and object key.
- [ ] Persist redaction records separately from immutable original audit events.
- [ ] Ensure read-side audit events apply redaction overlays without mutating original rows.
- [ ] Update `auditService.exportAuditEvents` and `auditService.redactAuditEvent` to call the new routes.
- [ ] Replace `AuditScreen.jsx` local audit data with `auditService.fetchAuditEvents`.
- [ ] Add tests for permission denial, export descriptor redaction, cursor pagination, redaction overlay, immutable original record, and expired export descriptor.

## Task 15: Finish Settings Runtime Wiring

**Files:**
- Modify: `src/features/settings/SettingsScreen.jsx`
- Modify: `src/features/settings/ConnectionsSettingsPage.jsx`
- Modify: `src/features/settings/EmployeeManagementPanel.jsx`
- Modify: `src/features/settings/TopicDirectoryPanel.jsx`
- Modify: `src/features/settings/RulesPanel.jsx`
- Modify: `src/features/settings/SdkConsolePanel.jsx`
- Modify: `src/features/settings/BackendIntegrationPanel.jsx`
- Modify: `backend/apps/api-gateway/src/identity/settings-employee.service.ts`
- Modify: `backend/apps/api-gateway/src/identity/settings-rules.service.ts`
- Modify: `backend/apps/api-gateway/src/integrations/integration.service.ts`
- Modify: `backend/apps/api-gateway/src/integrations/integration.repository.ts`
- Modify: `backend/tests/settings-contracts.test.ts`

- [ ] Remove fallback arrays for channels, roles, and groups from settings UI.
- [ ] Ensure settings subpages block mutations when their backend fetch failed instead of rendering local defaults.
- [ ] Load SDK events and connection test logs from integration APIs rather than `src/data.js`.
- [ ] Persist multiple channel connections of the same provider type, including Telegram and MAX, with unique display name, credentials, status, webhook state, and last test result.
- [ ] Persist employee groups and roles per tenant through identity repository tables or existing metadata with explicit schema.
- [ ] Persist settings rules and rule audit events with tenant ID and actor.
- [ ] Update `BackendIntegrationPanel` to fetch a backend capability endpoint instead of static `backendIntegrationService`.
- [ ] Add tests for two Telegram channels in one tenant, channel credential redaction, role update, employee deactivation, group update, topic archive/restore, rule test, and tenant isolation.

## Task 16: Make Service-Admin Workspaces Backend-Owned

**Files:**
- Modify: `src/features/service-admin/ServiceAdminDashboard.jsx`
- Modify: `src/features/service-admin/BillingTariffWorkspace.jsx`
- Modify: `src/features/service-admin/FeatureFlagWorkspace.jsx`
- Modify: `src/features/service-admin/IncidentMonitoringWorkspace.jsx`
- Modify: `src/features/service-admin/ServiceAdminAuditStream.jsx`
- Modify: `src/features/service-admin/ServiceUserSupportWorkspace.jsx`
- Modify: `src/features/service-admin/TenantManagementWorkspace.jsx`
- Modify: `src/services/supportAdminService.js`
- Modify: `src/services/tenantService.js`
- Modify: `src/services/billingService.js`
- Modify: `src/services/platformMonitoringService.js`
- Modify: `src/services/incidentService.js`
- Modify: `src/services/featureFlagService.js`
- Modify: `backend/apps/api-gateway/src/service-admin/service-admin.service.ts`
- Modify: `backend/apps/api-gateway/src/platform/platform-monitoring.service.ts`
- Modify: `backend/apps/api-gateway/src/incidents/incident.service.ts`
- Modify: `backend/apps/api-gateway/src/feature-flags/feature-flag.service.ts`
- Modify: `backend/tests/service-admin-contracts.test.ts`

- [ ] Remove all imports from `src/data/serviceAdmin.js` in service-admin screens.
- [ ] Load dashboard metrics from platform, tenant, billing, support user, incident, audit, and feature flag APIs.
- [ ] Use service-admin bearer auth mode for all service-admin adapters.
- [ ] Persist impersonation sessions, break-glass approvals, privileged actions, and audit events in identity repository.
- [ ] Replace fixture tenant/user lists in service-admin service with repository queries.
- [ ] Add tests for user MFA reset, forced logout, block/unblock, invite resend, impersonation start/stop, break-glass decision, audit stream, and denied permission.

## Task 17: Remove Runtime Fixture Imports From Backend Services

**Files:**
- Modify service/repository pairs under:
  - `backend/apps/api-gateway/src/identity`
  - `backend/apps/api-gateway/src/service-admin`
  - `backend/apps/api-gateway/src/billing`
  - `backend/apps/api-gateway/src/automation`
  - `backend/apps/api-gateway/src/quality`
  - `backend/apps/api-gateway/src/reports`
  - `backend/apps/api-gateway/src/integrations`
  - `backend/apps/api-gateway/src/routing`
  - `backend/apps/api-gateway/src/platform`
  - `backend/apps/api-gateway/src/operations`
- Add seed modules under `backend/apps/api-gateway/src/**/seed.ts` where each context needs default rows.
- Modify backend tests under `backend/tests`

- [ ] Convert fixture-exported TypeScript types into local repository/service types or shared DTO files so runtime code does not import `*.fixtures.ts` for types.
- [ ] Move initial data arrays into seed scripts consumed by `backend/scripts/seed-identity.ts` or context-specific bootstrap scripts.
- [ ] Ensure repositories can start empty and still return valid empty envelopes.
- [ ] Remove default `tenant-demo` behavior from runtime services.
- [ ] Add per-context tests proving empty repository state returns empty UI-safe payloads.
- [ ] Add per-context tests proving seeded state is created only by explicit seed/bootstrap commands.

## Task 18: Harden Billing Provider Runtime

**Files:**
- Modify: `backend/apps/api-gateway/src/billing/billing.service.ts`
- Modify: `backend/apps/api-gateway/src/billing/billing.repository.ts`
- Add: `backend/apps/api-gateway/src/billing/billing-provider.port.ts`
- Add: `backend/apps/api-gateway/src/billing/billing-provider.sandbox.ts`
- Modify: `backend/apps/api-gateway/src/billing/billing.controller.ts`
- Modify: `backend/tests/billing-provider-contracts.test.ts`

- [ ] Introduce a billing provider port for customer, subscription, invoice, payment retry, provider sync, and reconciliation operations.
- [ ] Use a sandbox provider in local/dev/test that persists provider IDs and events in repository records.
- [ ] Remove hardcoded provider naming from service responses except where stored on real provider records.
- [ ] Add idempotency for provider sync and tariff change operations.
- [ ] Add tests for tariff preview, tariff change approval, quota check, reservation commit/release, provider sync conflict, retry schedule, and reconciliation conflict.

## Task 19: Make Platform And Operations Runtime Observability Real

**Files:**
- Modify: `backend/apps/api-gateway/src/platform/platform-monitoring.service.ts`
- Modify: `backend/apps/api-gateway/src/platform/platform.repository.ts`
- Modify: `backend/apps/api-gateway/src/operations/operations-readiness.service.ts`
- Modify: `backend/apps/api-gateway/src/operations/operations.repository.ts`
- Modify: `backend/apps/api-gateway/src/operations/operations-runtime.ts`
- Modify: `backend/tests/platform-contracts.test.ts`
- Modify: `backend/tests/operations-contracts.test.ts`

- [ ] Build platform snapshot from telemetry samples, health rollups, incidents, alert routing rules, and feature flags rather than fixture arrays.
- [ ] Persist acknowledgements and status-page publish audits through platform repository.
- [ ] Build operations readiness from load-test runs, restore checks, dead-letter records, migration rollback checks, and security review records.
- [ ] Ensure operation execution workers write result rows and audit records.
- [ ] Add tests for component drilldown, acknowledgement idempotency, alert routing rule, dead-letter replay, restore check, migration rollback check, and security review export.

## Task 20: Add Notifications And Realtime Backend Source

**Files:**
- Modify: `src/features/notifications/NotificationCenter.jsx`
- Modify: `src/app/notificationModel.js`
- Add: `src/services/notificationService.js`
- Modify: `backend/apps/api-gateway/src/conversation/realtime.controller.ts`
- Add: `backend/apps/api-gateway/src/notifications/notification.controller.ts`
- Add: `backend/apps/api-gateway/src/notifications/notification.service.ts`
- Add: `backend/apps/api-gateway/src/notifications/notification.repository.ts`
- Modify: `backend/apps/api-gateway/src/app.module.ts`
- Add backend test: `backend/tests/notification-contracts.test.ts`

- [ ] Add notification repository records for SLA risk, channel failures, export completion, invite events, and privileged service-admin events.
- [ ] Add `GET /api/v1/notifications` and mutation route for mark-as-read.
- [ ] Stream new notifications through existing realtime SSE/WebSocket fanout.
- [ ] Replace local notification model events with API data.
- [ ] Add tests for notification creation, mark-as-read, unread count, realtime delivery, and tenant isolation.

## Task 21: Remove Static Frontend Data Modules

**Files:**
- Delete after migrations pass: `src/data.js`
- Delete after migrations pass: `src/data/conversations.js`
- Delete after migrations pass: `src/data/navigation.js`
- Delete after migrations pass: `src/data/topics.js`
- Delete after migrations pass: `src/data/operations.js`
- Delete after migrations pass: `src/data/reports.js`
- Delete after migrations pass: `src/data/templates.js`
- Delete after migrations pass: `src/data/settings.js`
- Delete after migrations pass: `src/data/visitors.js`
- Delete after migrations pass: `src/data/quality.js`
- Delete after migrations pass: `src/data/automation.js`
- Delete after migrations pass: `src/data/audit.js`
- Delete after migrations pass: `src/data/serviceAdmin.js`
- Delete after migrations pass: `src/services/mockBackend.js`
- Modify: `tests/no-demo-runtime-imports.test.js`
- Modify: `tests/backend-services.test.js`

- [ ] Run `rg -n "from .*data|src/data|mockBackend" src tests` and verify no runtime imports remain.
- [ ] Delete the static data modules.
- [ ] Remove test allowances for frontend static data imports.
- [ ] Keep pure UI model files such as `dialogModel.js`, `automationModel.js`, and `navigationModel.js` only when they contain labels, mappings, and empty object factories rather than tenant records.
- [ ] Run `npm run test:no-demo-runtime`, `npm run test:services`, and `npm run build`.

## Task 22: Convert Backend Fixture Files To Seed/Test Inputs

**Files:**
- Move or delete runtime fixture files after services no longer import them:
  - `backend/apps/api-gateway/src/identity/identity.fixtures.ts`
  - `backend/apps/api-gateway/src/service-admin/service-admin.fixtures.ts`
  - `backend/apps/api-gateway/src/billing/billing.fixtures.ts`
  - `backend/apps/api-gateway/src/automation/automation.fixtures.ts`
  - `backend/apps/api-gateway/src/quality/quality.fixtures.ts`
  - `backend/apps/api-gateway/src/reports/report.fixtures.ts`
  - `backend/apps/api-gateway/src/integrations/integration.fixtures.ts`
  - `backend/apps/api-gateway/src/routing/routing.fixtures.ts`
  - `backend/apps/api-gateway/src/platform/platform.fixtures.ts`
  - `backend/apps/api-gateway/src/operations/operations.fixtures.ts`
- Add seed files under `backend/scripts/seeds`
- Modify: `backend/scripts/seed-identity.ts`
- Modify: `backend/scripts/pilot-bootstrap.mjs`
- Modify backend tests under `backend/tests`

- [ ] Move reusable seed records to `backend/scripts/seeds/*.ts`.
- [ ] Export seed functions that write through repositories rather than being imported by services.
- [ ] Update tests to create their own seed rows through repositories or factory helpers.
- [ ] Delete runtime fixture files once imports are gone.
- [ ] Update `tests/no-demo-runtime-imports.test.js` so backend fixture imports are rejected outside `backend/tests` and `backend/scripts`.

## Task 23: Production Configuration And Docker Hardening

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`
- Modify: `docker/nginx.conf`
- Modify: `backend/packages/config/src/index.ts`
- Modify: `backend/apps/api-gateway/src/main.ts`
- Modify: `backend/README.md`
- Add: `docs/runtime-configuration.md`

- [ ] Split local, test, staging, and production env descriptions.
- [ ] Make production startup fail when demo header auth is enabled.
- [ ] Require `DATABASE_URL`, JWT/session secrets, public API key secret, object storage credentials, and billing provider mode outside local/test.
- [ ] Ensure frontend build does not bake a service-admin demo key.
- [ ] Document Docker Compose local mode and production env requirements.
- [ ] Add backend config tests for fail-closed production settings.

## Task 24: End-To-End Scenario Coverage

**Files:**
- Modify: `tests/pilot-flow.spec.js`
- Modify: `tests/smoke.spec.js`
- Add: `tests/settings-runtime.spec.js`
- Add: `tests/service-admin-runtime.spec.js`
- Modify backend tests under `backend/tests`

- [ ] Create a real tenant through onboarding and verify owner session opens the workspace.
- [ ] Connect two Telegram channels and one MAX channel in settings, then verify both are listed and independently testable.
- [ ] Invite an employee, assign a role/group, log in as that employee, and verify section access.
- [ ] Create and archive a topic, then verify dialogs/templates/rules reference the updated directory.
- [ ] Change a rule, run its test, and verify an audit event.
- [ ] Create outbound SDK dialog and verify it appears in dialogs, panel workload, reports, and audit.
- [ ] Create report export, retry failed export, and download descriptor.
- [ ] Publish bot scenario and run a bot test.
- [ ] Score a draft response and save a knowledge article draft.
- [ ] Use service-admin bearer login for user support, tenant status change, feature flag preview/update, incident update, and audit export.

## Task 25: Final Verification And Release Checklist

**Files:**
- Modify: `docs/runtime-configuration.md`
- Modify: `docs/frontend-development-plan.md`
- Modify: `backend/README.md`
- Modify this plan with completion checkmarks

- [ ] Run frontend unit/contract checks:

```bash
npm run test:api-client
npm run test:session-store
npm run test:services
npm run test:tenant-provision-service
npm run test:no-demo-runtime
npm run build
```

- [ ] Run backend checks:

```bash
npm run backend:typecheck
npm run backend:test
npm run backend:test:integration
npm run backend:tenant-isolation:verify
npm run backend:audit-immutability:verify
npm run backend:test:runtime
```

- [ ] Run browser scenarios:

```bash
npm run test:pilot-flow
npm run test:smoke
npm run test:backend-api-smoke
```

- [ ] Rebuild containers:

```bash
docker compose build frontend api-gateway
docker compose up -d frontend api-gateway
```

- [ ] Verify local container endpoints:

```bash
curl http://127.0.0.1:8080/
curl http://127.0.0.1:8080/api/v1/health
curl http://127.0.0.1:4101/api/v1/health
```

- [ ] Run `rg -n "demo-ui-|onboarding-ui-|mockBackend|from .*src/data|from .*\\.\\./data|tenant-demo|x-demo-service-admin" src backend/apps/api-gateway/src tests` and classify any remaining matches as test-only, seed-only, or a blocker.
- [ ] Update docs with the final runtime state, seed process, auth modes, and known local-only switches.
- [ ] Confirm production runtime has no frontend path that can mint a session without backend authentication.

## Parallelization Plan

Use subagents only after Task 1 creates the failing guard, because the guard makes independent work converge safely.

- Agent A: Auth/session/onboarding tasks 2-6.
- Agent B: Tenant product screens tasks 7-13.
- Agent C: Audit/settings/service-admin tasks 14-16.
- Agent D: Backend fixture-to-seed conversion tasks 17-19 and 22-23.
- Agent E: Realtime notifications and E2E tests tasks 20 and 24-25.

Merge order should be A first, then B and C, then D, then E. D depends on B and C because deleting fixture/runtime data before screen migrations will break existing flows.

## Self-Review

- Scope coverage: auth, onboarding, app entry, navigation, all tenant product sections, settings, service-admin, backend repository ownership, audit, billing, platform, operations, notifications, tests, Docker, and docs are covered.
- File coverage: every current static frontend data import class and every fixture-backed backend context found in inventory has an owning task.
- Runtime safety: early failing guards prevent new local data imports and local UI token paths from surviving unnoticed.
- Migration order: tasks first add guards and real sessions, then migrate screens, then remove static data and fixture runtime imports, then harden production config.
- Verification coverage: unit, service adapter, backend contract, tenant isolation, audit immutability, browser, and Docker checks are included.
