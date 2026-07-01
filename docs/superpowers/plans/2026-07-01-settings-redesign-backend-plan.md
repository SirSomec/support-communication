# Settings Redesign And Backend Integration Plan

> **For agentic workers:** implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully rebuild the Settings area into real subpages for channel connections, employees and roles, topic directory, and rules. Each subpage must support real operational workflows and be connected to backend API routes instead of local seed state.

**Current context:** The frontend Settings surface is split across `src/features/settings/*`, but the main `SettingsScreen` still renders a long combined page. Channel, employee, topic and rule workflows mostly read static data from `src/data/settings.js` and local component state. The backend has `GET /api/v1/integrations/workspace`, channel test routes, API key/webhook/security routes, and a single tenant Telegram connection route, but it does not yet expose generic multi-instance channel CRUD, tenant employee settings CRUD, topic directory CRUD, or configurable settings rules.

**Design direction:** Treat Settings as a dense admin workspace, not a marketing page. Use lists, tables, detail panes, drawers, confirmations, loading/error states, permission-aware disabled states and audit-facing save results. Avoid decorative cards except where a repeated entity genuinely benefits from a compact card.

---

## Target Subpages

- `settings/connections`: manage multiple channel connection instances for SDK, Telegram, MAX, VK and future channel types.
- `settings/employees`: manage tenant employees, roles, groups, channel access, chat limits and sensitive-data permissions.
- `settings/topics`: manage the hierarchical topic directory used by dialogs, routing, reports and close validation.
- `settings/rules`: manage operational rules for close validation, internal comments, routing, limits, masking, exports and escalation.

## Task 1: Settings Shell And Subpage Routing

**Files:**
- Modify: `src/features/settings/SettingsScreen.jsx`
- Create or modify: `src/features/settings/SettingsShell.jsx`
- Create or modify: `src/features/settings/settings.css`
- Modify if needed: `src/features/section-router.jsx`
- Modify if needed: `src/app/useWorkspaceRoute.js`

- [x] Replace the single long Settings page with a Settings shell that renders one active subpage at a time.
- [x] Add navigation for `РџРѕРґРєР»СЋС‡РµРЅРёСЏ`, `РЎРѕС‚СЂСѓРґРЅРёРєРё Рё СЂРѕР»Рё`, `РЎРїСЂР°РІРѕС‡РЅРёРє С‚РµРјР°С‚РёРє`, `РџСЂР°РІРёР»Р°`.
- [x] Support deep links or stable local route state for each subpage.
- [x] Show section summaries: connected channels, employees needing attention, active/archived topics, enabled/violated rules.
- [x] Preserve role-aware access via existing `access.canManageSettings`, `access.canResetPasswords` and permission reason strings.
- [x] Remove the global fake `РЎРѕС…СЂР°РЅРёС‚СЊ` button from Settings; each subpage must save concrete backend-backed entities.

## Task 2: Generic Multi-Instance Channel Connections Backend

**Files:**
- Modify: `backend/apps/api-gateway/src/integrations/integration.controller.ts`
- Modify: `backend/apps/api-gateway/src/integrations/integration.service.ts`
- Modify: `backend/apps/api-gateway/src/integrations/integration.repository.ts`
- Modify if needed: `backend/prisma/schema.prisma`
- Add migration if persistent schema changes are required.
- Test: `backend/tests/integration-contracts.test.ts`
- Test: `backend/tests/telegram-channel-contracts.test.ts`

- [x] Introduce a channel connection instance model with fields: `id`, `tenantId`, `type`, `name`, `environment`, `status`, `rawExternalId`, `routingQueueId`, `chatLimit`, `credentialsMasked`, `webhookUrl`, `lastSyncAt`, `createdAt`, `updatedAt`.
- [x] Support several instances per channel type, including two or more Telegram bots and two or more MAX connections for one tenant.
- [x] Add generic endpoints:
  - `GET /api/v1/integrations/channels`
  - `POST /api/v1/integrations/channels`
  - `PATCH /api/v1/integrations/channels/:connectionId`
  - `DELETE /api/v1/integrations/channels/:connectionId`
  - `POST /api/v1/integrations/channels/:connectionId/test`
  - `GET /api/v1/integrations/channels/:connectionId/events`
- [x] Keep existing Telegram-specific endpoints working or migrate them behind the generic model without breaking current tests.
- [x] Store secrets write-only and return only masked previews.
- [x] Persist audit events for create, update, pause, disconnect, secret rotation and test send/receive.
- [x] Return envelopes compatible with `apiClient`.

## Task 3: Connections Frontend

**Files:**
- Modify: `src/features/settings/ChannelConnectionsPanel.jsx`
- Modify: `src/features/settings/TelegramChannelSetupPanel.jsx`
- Modify: `src/services/integrationService.js`
- Modify: `src/features/settings/settings.css`
- Test: `tests/backend-services.test.js`
- Test: `tests/smoke.spec.js` or a focused Playwright settings spec

- [x] Replace static `channelDetails` usage with `integrationService` calls.
- [x] Add channel type picker for SDK, Telegram, MAX, VK and future types returned by backend.
- [x] Render a real list of connection instances with status, environment, routing queue, last event, health and traffic.
- [x] Add create/edit flow for connection name, type, environment, credentials, webhook secret, routing queue and limits.
- [x] Add pause/resume/disconnect actions with confirmation for destructive operations.
- [x] Add test receive/send action scoped to a concrete `connectionId`.
- [x] Add connection event log filtering by severity and time.
- [x] Show loading, empty, error and partial states.
- [x] Verify the UI can create and manage at least two Telegram connections and two MAX connections.

## Task 4: Tenant Employees, Roles And Groups Backend

**Files:**
- Modify or add under: `backend/apps/api-gateway/src/identity/*`
- Modify if needed: `backend/apps/api-gateway/src/identity/permission.controller.ts`
- Modify if needed: `backend/prisma/schema.prisma`
- Add migration if persistent schema changes are required.
- Test: `backend/tests/identity-contracts.test.ts`
- Test: `backend/tests/tenant-operator-auth-contracts.test.ts`

- [x] Expose tenant employee read model with role, groups, channel access, chat limit, password/MFA status, sensitive-data access and last login.
- [x] Add tenant-scoped endpoints:
  - [x] `GET /api/v1/settings/employees`
  - [x] `POST /api/v1/settings/employees/invites`
  - [x] `PATCH /api/v1/settings/employees/:employeeId`
  - [x] `POST /api/v1/settings/employees/:employeeId/password-reset`
  - [x] `POST /api/v1/settings/employees/:employeeId/mfa-reset`
  - [x] `POST /api/v1/settings/employees/:employeeId/deactivate`
  - [x] `GET /api/v1/settings/roles`
  - [x] `GET /api/v1/settings/groups`
  - [x] `POST /api/v1/settings/groups`
  - [x] `PATCH /api/v1/settings/groups/:groupId`
- [x] Enforce permission gates for settings management and password/MFA reset.
- [x] Persist immutable audit events for role, group, channel, limit and security mutations.
- [x] Prevent removing the last administrator from the tenant.

## Task 5: Employees And Roles Frontend

**Files:**
- Modify: `src/features/settings/EmployeeManagementPanel.jsx`
- Add or modify: `src/services/settingsService.js`
- Modify: `src/features/settings/settings.css`
- Test: `tests/backend-services.test.js`
- Test: `tests/smoke.spec.js` or a focused Playwright settings spec

- [x] Replace local `useState(employeeChannelRules)` with backend data.
- [x] Add employee table with search, role filter, group filter, channel filter and status filter.
- [x] Add detail editor for role, group, channel access, chat limit, override permission and sensitive-data permission.
- [x] Add invite employee flow.
- [x] Add password reset and MFA reset actions using permission-aware disabled states.
- [x] Add group management for name, members and channel scope.
- [x] Show save conflicts and backend validation errors inline.
- [x] Verify audit-facing success messages include trace or audit id when backend returns one.

## Task 6: Topic Directory Backend

**Files:**
- Modify or add under: `backend/apps/api-gateway/src/workspace/*`
- Modify if needed: `backend/prisma/schema.prisma`
- Add migration if persistent schema changes are required.
- Test: `backend/tests/workspace-contracts.test.ts`
- Test: `backend/tests/conversation-contracts.test.ts`
- Test: `backend/tests/routing-contracts.test.ts`

- [x] Add persistent topic directory with groups, branches and topics.
- [x] Add fields: `id`, `tenantId`, `groupName`, `branchName`, `name`, `channels`, `routingTarget`, `required`, `archived`, `sortOrder`, `accessScope`, `updatedAt`.
- [x] Add endpoints:
  - [x] `GET /api/v1/workspace/topics`
  - [x] `POST /api/v1/workspace/topics`
  - [x] `PATCH /api/v1/workspace/topics/:topicId`
  - [x] `POST /api/v1/workspace/topics/:topicId/archive`
  - [x] `POST /api/v1/workspace/topics/:topicId/restore`
  - [x] `GET /api/v1/workspace/topics/:topicId/usage`
- [x] Prevent hard delete for topics used by dialogs, reports, templates or routing history.
- [x] Make dialog close validation use the backend topic directory, not static frontend `topicOptions`.
- [x] Return active topics for dialogs, reports and templates through a shared read model.

## Task 7: Topic Directory Frontend

**Files:**
- Modify: `src/features/settings/TopicDirectoryPanel.jsx`
- Modify: `src/app/conversationApiMapper.js` or topic read model consumers if needed
- Modify: `src/features/dialogs/ChatHeader.jsx`
- Modify: `src/features/dialogs/CustomerPanel.jsx`
- Modify: `src/features/dialogs/ConversationList.jsx`
- Modify: `src/features/reports/ReportsScreen.jsx`
- Add or modify: `src/services/settingsService.js`
- Test: `tests/smoke.spec.js` or a focused Playwright settings spec

- [x] Replace `topicDirectorySeed` with backend topic directory.
- [x] Add create/edit drawer for group, branch, topic name, channels, required flag, routing target and access scope.
- [x] Add archive/restore with usage warning.
- [x] Add search and active/archive filters backed by server state.
- [x] Replace global static topic options in dialogs and reports with backend-loaded active topics.
- [x] Verify archived topics remain visible in historical dialogs but are not selectable for new classification.

## Task 8: Rules Backend

**Files:**
- Add or modify under: `backend/apps/api-gateway/src/workspace/*` or a new settings module
- Modify: `backend/apps/api-gateway/src/conversation/*`
- Modify: `backend/apps/api-gateway/src/routing/*`
- Modify: `backend/apps/api-gateway/src/reports/*`
- Test: `backend/tests/conversation-contracts.test.ts`
- Test: `backend/tests/routing-contracts.test.ts`
- Test: `backend/tests/report-contracts.test.ts`

- [x] Add settings rules read model and mutation endpoints:
  - `GET /api/v1/settings/rules`
  - `PATCH /api/v1/settings/rules/:ruleId`
  - `POST /api/v1/settings/rules/:ruleId/test`
- [x] Implement configurable rule definitions for:
  - close requires topic;
  - internal comments are never sent to clients;
  - operator active chat limit;
  - limit override only for allowed roles;
  - sensitive data masking by role;
  - report export audit;
  - routing by channel, topic, working time and group;
  - overload fallback and escalation.
- [x] Enforce critical rules server-side, not only through disabled UI.
- [x] Persist audit events for rule changes and critical rule violations.
- [x] Add test endpoint that explains which conversations or routing candidates would be affected by a rule change.

## Task 9: Rules Frontend

**Files:**
- Create or modify: `src/features/settings/RulesPanel.jsx`
- Modify: `src/features/settings/SettingsScreen.jsx`
- Add or modify: `src/services/settingsService.js`
- Modify: `src/features/settings/settings.css`
- Test: `tests/smoke.spec.js` or a focused Playwright settings spec

- [x] Replace static critical rules rows with backend-backed rule groups.
- [x] Show each rule with enabled state, scope, severity, last changed by, last violation and affected workflows.
- [x] Add editor for configurable rule parameters.
- [x] Add test/preview action where backend supports it.
- [x] Add confirmation for disabling critical rules.
- [x] Surface backend validation failures in dialogs/routing/export flows with user-readable messages.

## Task 10: Encoding And Copy Cleanup In Touched Settings Files

**Files:**
- Modify only files touched by this implementation.

- [x] Replace mojibake Russian strings in touched settings files with valid UTF-8 Russian copy.
- [x] Keep copy operational and specific: no placeholder labels, fake descriptions or feature-for-show text.
- [x] Do not do a broad repository-wide copy rewrite in this plan unless it blocks the Settings work.

## Task 11: Verification

**Commands:**
- `npm run test:services`
- `npm run test:smoke`
- `npm run build`
- `npm run backend:typecheck`
- `npm run backend:test`

- [x] Add frontend service adapter tests for new settings and integration routes.
- [x] Add backend contract tests for multi-instance channels, employee permissions, topic CRUD and server-side rules.
- [x] Run focused frontend tests during implementation.
- [x] Run backend typecheck and backend contract tests after API changes.
- [x] Run smoke tests against the real API mode.
  - Settings-focused smoke passed against the real API gateway: `npx playwright test tests/smoke.spec.js --grep "settings"` -> 5 passed.
  - Full `npm run test:smoke` was also run against the real API gateway and currently has unrelated legacy failures outside Settings: 15 passed, 14 failed across old dialog/auth/onboarding/service-admin expectations.
- [x] Manually verify the core scenario: admin creates a second Telegram bot, assigns it to a group, creates a topic routed to that group, enables close-with-topic rule, and sees the rule enforced in a dialog.
  - Verified by Playwright UI flow: `Telegram Core mr2kniwm`, group `QA routing mr2kniwm`, topic `Проверка закрытия mr2kniwm`, close without topic blocked.

## Implementation Order

1. Settings shell and route structure.
2. Generic multi-instance connections backend and frontend.
3. Tenant employees/roles backend and frontend.
4. Topic directory backend and frontend topic consumers.
5. Rules backend enforcement and frontend rule workspace.
6. Copy cleanup, smoke coverage and full verification.

## Open Decisions

- Whether generic channel credentials should be stored in the existing integration repository state first or moved immediately to Prisma-backed persistence.
- Whether topic directory belongs under `workspace` routes or a new tenant `settings` module. The frontend should not depend on this distinction beyond the service adapter.
- Whether MAX credentials require a provider-specific validation call now or can start with generic secret validation and channel test.
- Whether rule changes need approval workflow for critical rules or admin confirmation is enough for the first implementation slice.
