# First Client Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Запустить управляемый пилот с первым реальным клиентом: посетитель пишет через Web SDK на сайте клиента, оператор видит диалог в inbox, отвечает, клиент получает ответ — с персистентным хранением в PostgreSQL и без зависимости от seed-данных `src/data.js`.

**Architecture:** Пилот строится вокруг одного сквозного потока (SDK → inbound API → conversation store → realtime SSE → operator UI → appendMessage → outbound descriptor → SDK poll). Инфраструктура переключается на Prisma-репозитории. Для операторов добавляется tenant-user auth (отдельно от service-admin demo headers). Frontend переводит только критичный контур (auth, inbox, чат, onboarding provisioning) на живые API; остальные экраны остаются на seed-данных до post-pilot.

**Tech Stack:** React 19, Vite 6, NestJS API Gateway, PostgreSQL/Prisma, Redis (realtime fan-out), MinIO/S3, Docker Compose, Node test runner, Playwright.

**Связанные документы:**
- [connect-frontend-real-api](../2026-07-01-connect-frontend-real-api.md) — адаптеры уже подключены; этот план закрывает runtime-разрыв UI ↔ API.
- [frontend-development-plan](../../frontend-development-plan.md) — матрица покрытия UI.
- [backend-development-plan](../../backend-development-plan.md) — полный backend backlog (~104 suffix items); пилот берёт только subset.

**Критерии успеха пилота (acceptance):**
1. Service-admin или onboarding создаёт tenant клиента с SDK public key и operator credential.
2. Оператор входит через `AuthPage` → bearer session, без ручной подстановки demo headers.
3. Inbox загружает диалоги из `GET /api/v1/dialogs`, не из `src/data/conversations.js`.
4. Виджет на тестовой HTML-странице отправляет сообщение → оператор видит его ≤ 3 с (SSE) без reload.
5. Ответ оператора появляется в виджете ≤ 10 с (poll) или через SSE виджета.
6. Данные переживают restart API Gateway (PostgreSQL, не JSON store).
7. `npm run test:pilot-smoke` и Playwright `pilot-flow` проходят в CI/local.

**Вне scope пилота (post-pilot):** боты, proactive, rescue auto-return, AI scoring, биллинг/payments, VK/MAX, audit export/redaction, полная миграция всех экранов с seed-данных.

**Добавлено post-pilot slice:** Telegram webhook ingress (`POST /api/v1/webhooks/telegram`) + outbox delivery через существующий Telegram connector.

---

## Gap Summary (текущее состояние → цель)

| Область | Сейчас | Нужно для пилота |
| --- | --- | --- |
| Операторский inbox | `App.jsx` → `conversations` seed | `dialogService.fetchDialogs` + mapper |
| Отправка ответа | локальный `appendMessage` | `dialogService.appendMessage` → `POST /dialogs/:id/messages` |
| Auth UI | `onAuthSuccess` без API | `authService.login` + session store + bearer в `apiClient` |
| Onboarding | локальный wizard | `POST /tenants/provision` + SDK key в ответе |
| Operator auth | только service-admin / demo headers | tenant-user login + `TenantOperatorGuard` |
| SDK на сайте клиента | только playground в Settings | embeddable `packages/web-widget` |
| Inbound с сайта | `public/sdk/identify` (lookup пустой) | `public/sdk/messages` + key lookup из integration repo |
| Persistence | Docker → JSON files | `*_REPOSITORY=prisma` + bootstrap script |
| Realtime | backend SSE есть, UI нет | `useRealtimeInbox` → `EventSource /realtime/events/stream` |

---

## File Structure

- Create: `docker-compose.pilot.yml`
  - Pilot overlay: Prisma repos, `NODE_ENV=staging`, secrets from env file.
- Create: `backend/scripts/pilot-bootstrap.mjs`
  - Idempotent: tenant, admin user, password credential, public SDK key, empty conversation store.
- Create: `backend/apps/api-gateway/src/identity/tenant-operator-auth.ts`
  - Bearer guard для operator routes (dialogs, realtime).
- Create: `backend/apps/api-gateway/src/identity/tenant-provision.controller.ts`
  - `POST /api/v1/tenants/provision` для onboarding/service-admin.
- Create: `backend/apps/api-gateway/src/integrations/public-sdk-messages.route.ts`
  - `POST /api/v1/public/sdk/messages`, `GET /api/v1/public/sdk/conversations/:id/messages`.
- Modify: `backend/apps/api-gateway/src/integrations/public-api.controller.ts`
  - Wire runtime key lookup (не пустой `listActiveKeys`).
- Modify: `backend/apps/api-gateway/src/conversation/dialog.controller.ts`
  - Dual guard: `TenantOperatorGuard` OR `DemoServiceAdminGuard` для pilot routes.
- Modify: `backend/apps/api-gateway/src/identity/auth.controller.ts`
  - `POST /auth/tenant/login`, `POST /auth/tenant/logout`.
- Create: `src/app/sessionStore.js`
  - Persist access token, tenantId, operator profile in `sessionStorage`.
- Modify: `src/services/apiClient.js`
  - Send `Authorization: Bearer` when session exists; skip demo headers when bearer present.
- Modify: `src/services/authService.js`
  - Add `loginTenantOperator`, `getTenantAuthState`, `logoutTenant`.
- Modify: `src/services/dialogService.js`
  - Add `fetchDialogDetail`, `appendMessage`.
- Create: `src/app/conversationApiMapper.js`
  - Map API envelope items → UI conversation shape used by `DialogWorkspace`.
- Create: `src/app/useConversationInbox.js`
  - Load, refresh, merge realtime, append via API.
- Create: `src/app/useRealtimeInbox.js`
  - `EventSource` subscription with reconnect + `last-event-id`.
- Modify: `src/App.jsx`
  - Replace seed `conversations` with `useConversationInbox`; gate app on auth session.
- Modify: `src/features/auth/AuthPage.jsx`
  - Call `authService.loginTenantOperator` on login submit.
- Modify: `src/features/onboarding/OrganizationOnboarding.jsx`
  - Final step calls provision API.
- Create: `packages/web-widget/`
  - Minimal IIFE bundle: identify, open chat, send, poll replies.
- Create: `packages/web-widget/demo.html`
  - Local demo page for pilot QA.
- Create: `tests/pilot-smoke.test.js`
  - End-to-end API flow without browser.
- Create: `tests/pilot-flow.spec.js`
  - Playwright: widget message → operator reply → widget sees reply.
- Modify: `package.json`
  - Scripts: `test:pilot-smoke`, `test:pilot-flow`, `widget:build`.
- Create: `docs/pilot-runbook.md`
  - Операционная инструкция для запуска пилота с клиентом.

---

## API Route Mapping (pilot additions)

| Consumer | Method | Route | Auth |
| --- | --- | --- | --- |
| Onboarding / service-admin | `POST` | `/api/v1/tenants/provision` | service-admin bearer or demo (staging) |
| Operator login | `POST` | `/api/v1/auth/tenant/login` | public |
| Operator logout | `POST` | `/api/v1/auth/tenant/logout` | tenant bearer |
| Operator inbox | `GET` | `/api/v1/dialogs` | tenant bearer |
| Operator detail | `GET` | `/api/v1/dialogs/:conversationId` | tenant bearer |
| Operator reply | `POST` | `/api/v1/dialogs/:conversationId/messages` | tenant bearer |
| Operator status | `PATCH` | `/api/v1/dialogs/:conversationId/status` | tenant bearer |
| Operator realtime | `GET` | `/api/v1/realtime/events/stream` | tenant bearer |
| Widget identify | `POST` | `/api/v1/public/sdk/identify` | public API key |
| Widget send | `POST` | `/api/v1/public/sdk/messages` | public API key |
| Widget history | `GET` | `/api/v1/public/sdk/conversations/:conversationId/messages` | public API key + session token |

---

## Task 1: Pilot Infrastructure (PostgreSQL + Bootstrap)

**Files:**
- Create: `docker-compose.pilot.yml`
- Create: `backend/scripts/pilot-bootstrap.mjs`
- Modify: `backend/package.json`
- Create: `docs/pilot-runbook.md` (sections: prerequisites, bootstrap, verify)
- Test: `backend/tests/pilot-bootstrap-contracts.test.ts`

- [x] **Step 1: Write failing bootstrap contract test**

Create `backend/tests/pilot-bootstrap-contracts.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

describe("pilot bootstrap", () => {
  it("defines pilot compose overlay with prisma repositories", () => {
    const compose = readFileSync(new URL("../../docker-compose.pilot.yml", import.meta.url), "utf8");
    assert.match(compose, /IDENTITY_REPOSITORY:\s*prisma/);
    assert.match(compose, /CONVERSATION_REPOSITORY:\s*prisma/);
  });

  it("exposes pilot-bootstrap script in package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.scripts["pilot:bootstrap"], "node --env-file=.env.example scripts/pilot-bootstrap.mjs");
  });
});
```

- [x] **Step 2: Run test — expect FAIL**

Run: `cd backend && npm run backend:test -- --test-name-pattern=pilot bootstrap`

Expected: FAIL — files missing.

- [x] **Step 3: Add `docker-compose.pilot.yml`**

```yaml
services:
  api-gateway:
    environment:
      NODE_ENV: staging
      IDENTITY_REPOSITORY: prisma
      BILLING_REPOSITORY: prisma
      CONVERSATION_REPOSITORY: prisma
      WORKSPACE_REPOSITORY: prisma
      REALTIME_REDIS_FANOUT: enabled
```

Extend base `docker-compose.yml` via `docker compose -f docker-compose.yml -f docker-compose.pilot.yml`.

- [x] **Step 4: Add `backend/scripts/pilot-bootstrap.mjs`**

Script must:
1. Run `prisma migrate deploy` + `prisma seed`.
2. Upsert tenant `tenant-pilot-001` with slug from `PILOT_TENANT_SLUG` env (default `pilot-client`).
3. Create operator user + password credential (`PILOT_OPERATOR_EMAIL`, `PILOT_OPERATOR_PASSWORD`).
4. Create stage public API key via integration repository adapter; print key once to stdout (not logged in audit).
5. Exit 0 with JSON summary: `{ tenantId, operatorEmail, publicApiKeyPrefix }`.

- [x] **Step 5: Add npm script and run checklist**

```json
"pilot:bootstrap": "node --env-file=.env.example scripts/pilot-bootstrap.mjs"
```

Run: `cd backend && npm run pilot:bootstrap` (with local Postgres).

Expected: summary JSON printed, `release:checklist` gates still pass.

- [x] **Step 6: Document runbook prerequisites**

Add `docs/pilot-runbook.md` §1–3: env vars, `docker compose -f docker-compose.yml -f docker-compose.pilot.yml up`, bootstrap command, health URLs.

- [x] **Step 7: Commit**

```bash
git add docker-compose.pilot.yml backend/scripts/pilot-bootstrap.mjs backend/package.json backend/tests/pilot-bootstrap-contracts.test.ts docs/pilot-runbook.md
git commit -m "chore: add pilot infrastructure bootstrap"
```

---

## Task 2: Tenant Operator Auth (Backend)

**Files:**
- Create: `backend/apps/api-gateway/src/identity/tenant-operator-auth.ts`
- Create: `backend/apps/api-gateway/src/identity/tenant-operator-auth.guard.ts`
- Modify: `backend/apps/api-gateway/src/identity/auth.controller.ts`
- Modify: `backend/apps/api-gateway/src/identity/auth.service.ts`
- Modify: `backend/apps/api-gateway/src/identity/identity.repository.ts` (tenant session persistence)
- Test: `backend/tests/tenant-operator-auth-contracts.test.ts`

- [x] **Step 1: Write failing auth contract**

```ts
it("tenant login returns bearer tokens for pilot operator", async () => {
  const response = await fetch(`${baseUrl}/auth/tenant/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "operator@pilot-client.test", password: "Pilot-Operator-2026!" })
  });
  assert.equal(response.status, 200);
  const envelope = await response.json();
  assert.equal(envelope.data.authenticated, true);
  assert.ok(envelope.data.accessToken);
  assert.equal(envelope.data.tenantId, "tenant-pilot-001");
});
```

- [x] **Step 2: Run test — expect FAIL**

- [x] **Step 3: Implement tenant session model**

Add to identity repository:
- `createTenantOperatorSession({ userId, tenantId })` → `{ accessToken, refreshToken, expiresAt }`
- `findTenantOperatorSessionByAccessToken(token)` → session + user + permissions[]

Reuse existing password credential lookup by email (same as service-admin path) but bind session to `tenantUser.tenantId` and role permissions from `permissionRoles`.

- [x] **Step 4: Add routes**

`POST /auth/tenant/login` — email/password, optional OTP skip for pilot (`PILOT_SKIP_MFA=true` in staging only).

`POST /auth/tenant/logout` — revoke token.

`GET /auth/tenant/state` — current operator session.

- [x] **Step 5: Add `TenantOperatorGuard`**

Reads `Authorization: Bearer`, loads session, sets `request.tenantContext = { tenantId, userId, permissions }`.

Fail closed outside development if demo headers used without bearer.

- [x] **Step 6: Run contract tests**

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git commit -m "feat: add tenant operator authentication for pilot"
```

---

## Task 3: Tenant Provisioning API

**Files:**
- Create: `backend/apps/api-gateway/src/identity/tenant-provision.controller.ts`
- Create: `backend/apps/api-gateway/src/identity/tenant-provision.service.ts`
- Modify: `backend/apps/api-gateway/src/identity/identity.module.ts`
- Test: `backend/tests/tenant-provision-contracts.test.ts`

- [x] **Step 1: Write failing provision contract**

```ts
it("provisions tenant with admin and sdk key", async () => {
  const response = await postAsServiceAdmin("/tenants/provision", {
    tenant: { name: "Acme Pilot", slug: "acme-pilot", region: "ru-1" },
    admin: { name: "Owner", email: "owner@acme-pilot.test", password: "Owner-2026!" },
    channel: { type: "sdk", domain: "acme.example" },
    plan: { id: "trial", trial: true }
  });
  assert.equal(response.status, 200);
  assert.ok(response.data.tenant.id);
  assert.ok(response.data.publicApiKey);
  assert.match(response.data.publicApiKey, /^sk_stage_/);
});
```

- [x] **Step 2: Implement provision service**

Atomic steps (single transaction where Prisma allows):
1. Create tenant row.
2. Create tenant admin user + password credential.
3. Create billing tenant state (trial).
4. Create integration public API key (stage environment) scoped to tenant.
5. Emit immutable audit event `tenant.provision`.

Return: `{ tenant, admin, publicApiKey, embedSnippet }`.

- [x] **Step 3: Run tests + commit**

---

## Task 4: Public SDK Message Ingress + Widget Poll API

**Files:**
- Create: `backend/apps/api-gateway/src/integrations/public-sdk-messages.route.ts`
- Modify: `backend/apps/api-gateway/src/integrations/public-api.controller.ts`
- Modify: `backend/apps/api-gateway/src/integrations/public-api-auth.ts`
- Modify: `backend/apps/api-gateway/src/integrations/integration.repository.ts`
- Test: `backend/tests/public-sdk-messages-contracts.test.ts`

- [x] **Step 1: Write failing public message contract**

```ts
it("accepts sdk message and returns conversationId", async () => {
  const identify = await publicPost("/public/sdk/identify", { externalId: "visitor-001" }, apiKey);
  const send = await publicPost("/public/sdk/messages", {
    externalId: "visitor-001",
    text: "Нужна помощь с заказом",
    pageUrl: "https://acme.example/checkout"
  }, apiKey);
  assert.equal(send.data.conversationId, identify.data.conversationId);
  assert.equal(send.data.accepted, true);
});
```

- [x] **Step 2: Wire runtime public API key lookup**

Replace empty `runtimePublicApiKeyLookup()` with integration repository `listActivePublicApiKeys(tenantId, environment)`.

- [x] **Step 3: Implement `POST /public/sdk/messages`**

Flow:
1. Validate API key → `tenantId`.
2. Resolve or create conversation for `externalId` on channel `sdk`.
3. Call `conversationService.normalizeInboundEvent("sdk", { eventId, text, conversationId })`.
4. Return `{ conversationId, messageId, visitorSessionToken }`.

`visitorSessionToken` — short-lived HMAC for poll endpoint (not a user password).

- [x] **Step 4: Implement `GET /public/sdk/conversations/:id/messages`**

Query: `visitorSessionToken`, `since` (message id or timestamp).

Return operator replies only (not internal notes).

- [x] **Step 5: Run tests + commit**

---

## Task 5: Dialog Routes — Tenant Operator Guard

**Files:**
- Modify: `backend/apps/api-gateway/src/conversation/dialog.controller.ts`
- Modify: `backend/apps/api-gateway/src/conversation/realtime.controller.ts`
- Test: extend `backend/tests/tenant-operator-auth-contracts.test.ts`

- [x] **Step 1: Write failing test — operator can read dialogs with bearer, not demo header**

- [x] **Step 2: Apply `@UseGuards(TenantOperatorOrServiceAdminGuard)` on dialog + realtime controllers**

Guard logic:
- If `Authorization: Bearer` valid tenant session → allow, scope `tenantId` from session.
- Else fall back to existing `DemoServiceAdminGuard` (development/staging only).

Repository queries must filter conversations by `tenantContext.tenantId`.

- [x] **Step 3: Verify tenant isolation — operator of tenant A cannot read tenant B conversation**

- [x] **Step 4: Commit**

---

## Task 6: Frontend Session + Auth Wiring

**Files:**
- Create: `src/app/sessionStore.js`
- Modify: `src/services/apiClient.js`
- Modify: `src/services/authService.js`
- Modify: `src/features/auth/AuthPage.jsx`
- Modify: `src/app/useWorkspaceRoute.js`
- Test: `tests/session-store.test.js`, extend `tests/backend-services.test.js`

- [x] **Step 1: Write failing session store test**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAccessToken, setSession, clearSession } from "../src/app/sessionStore.js";

describe("sessionStore", () => {
  it("round-trips access token", () => {
    setSession({ accessToken: "tok_123", tenantId: "tenant-pilot-001" });
    assert.equal(getAccessToken(), "tok_123");
    clearSession();
    assert.equal(getAccessToken(), null);
  });
});
```

- [x] **Step 2: Implement `sessionStore.js`**

Use `sessionStorage` keys: `sc_access_token`, `sc_tenant_id`, `sc_operator`.

- [x] **Step 3: Update `apiClient.js`**

```js
const accessToken = getAccessToken();
if (accessToken) {
  requestHeaders.authorization = `Bearer ${accessToken}`;
} else if (demoServiceAdminKey && getRuntimeMode() !== "production") {
  // existing demo headers
}
```

- [x] **Step 4: Extend `authService.js`**

```js
async loginTenantOperator(payload = {}) {
  return apiRequest("/auth/tenant/login", {
    body: payload,
    method: "POST",
    operation: "loginTenantOperator",
    service: SERVICE
  });
}
```

On success in `AuthPage`, call `setSession` from envelope `data.accessToken`, `data.tenantId`.

- [x] **Step 5: Gate `#/app` route — redirect to `#/login` if no session**

In `useWorkspaceRoute`, on `app` namespace mount, call `authService.getTenantAuthState()` or check `getAccessToken()`.

- [x] **Step 6: Run `npm run test:api-client && npm run test:services`**

- [x] **Step 7: Commit**

---

## Task 7: Live Inbox + Chat API Integration

**Files:**
- Create: `src/app/conversationApiMapper.js`
- Create: `src/app/useConversationInbox.js`
- Create: `src/app/useRealtimeInbox.js`
- Modify: `src/services/dialogService.js`
- Modify: `src/app/useConversationMutations.js`
- Modify: `src/app/useDialogActions.js`
- Modify: `src/App.jsx`
- Test: `tests/conversation-inbox.test.js`

- [x] **Step 1: Write failing mapper test**

Map API item:

```json
{ "id": "conv_1", "client": "Maria", "preview": "Hello", "messages": [...] }
```

to UI shape expected by `ConversationList` (fields: `id`, `name`, `channel`, `preview`, `time`, `messages`, `status`).

- [x] **Step 2: Add `dialogService` methods**

```js
async fetchDialogDetail(conversationId) {
  return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}`, {
    operation: "fetchDialogDetail",
    service: SERVICE
  });
},

async appendMessage({ conversationId, ...payload }) {
  return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/messages`, {
    body: payload,
    method: "POST",
    operation: "appendMessage",
    service: SERVICE
  });
}
```

- [x] **Step 3: Implement `useConversationInbox`**

On mount:
1. `dialogService.fetchDialogs({ page: 1, pageSize: 50 })`.
2. Map via `conversationApiMapper`.
3. Expose `refresh`, `appendMessageToServer`, `transitionStatusOnServer`.

- [x] **Step 4: Implement `useRealtimeInbox`**

```js
const source = new EventSource("/api/v1/realtime/events/stream", { withCredentials: false });
// Pass Authorization via polyfill or fetch-based SSE if needed — document limitation;
// preferred: add `?accessToken=` short-lived query for pilot staging only, remove before production.
```

On `message.created` / `conversation.updated`: merge into inbox state.

- [x] **Step 5: Wire `App.jsx`**

Replace:

```js
} = useConversationMutations({ initialConversations: conversations });
```

with:

```js
} = useConversationInbox();
```

Keep `useConversationMutations` internals for optimistic UI but persist via API first.

- [x] **Step 6: Update `useDialogActions` send handler**

On reply send: `await appendMessageToServer({ conversationId, text, mode: "reply" })` then optimistic append on success envelope.

- [x] **Step 7: Run tests + `npm run build`**

- [x] **Step 8: Commit**

---

## Task 8: Web Widget Package

**Files:**
- Create: `packages/web-widget/package.json`
- Create: `packages/web-widget/src/index.js`
- Create: `packages/web-widget/vite.config.js`
- Create: `packages/web-widget/demo.html`
- Modify: root `package.json` (`widget:build`)
- Test: `tests/widget-bundle.test.js`

- [x] **Step 1: Write failing bundle test**

Assert `packages/web-widget/dist/widget.js` exports `SupportWidget.init`.

- [x] **Step 2: Implement minimal widget**

```js
export function init({ apiBase, publicKey, externalId }) {
  // 1. POST /public/sdk/identify
  // 2. Render floating button + panel
  // 3. On send → POST /public/sdk/messages
  // 4. setInterval poll GET /public/sdk/conversations/:id/messages
}
```

Bundle as IIFE via Vite `build.lib` + `formats: ['iife']`.

- [x] **Step 3: Add `demo.html` for local QA**

```html
<script src="/dist/widget.js"></script>
<script>
  SupportWidget.init({
    apiBase: "/api/v1",
    publicKey: "sk_stage_...",
    externalId: "demo-visitor-1"
  });
</script>
```

- [x] **Step 4: Document embed snippet in `docs/pilot-runbook.md` §4**

- [x] **Step 5: Commit**

---

## Task 9: Onboarding → Provision API

**Files:**
- Modify: `src/features/onboarding/OrganizationOnboarding.jsx`
- Create: `src/services/tenantProvisionService.js`
- Test: `tests/tenant-provision-service.test.js`

- [x] **Step 1: Add `tenantProvisionService.provisionOrganization(payload)`**

Calls `POST /tenants/provision` with onboarding form shape.

- [x] **Step 2: Wire final onboarding step**

On success:
- `setSession` with returned operator token OR redirect to login with prefilled email.
- Show embed snippet with `publicApiKey`.
- `onFinish({ tenant, publicApiKey })`.

- [x] **Step 3: Mocked fetch contract test**

- [x] **Step 4: Commit**

---

## Task 10: Pilot Smoke + E2E + Runbook Completion

**Files:**
- Create: `tests/pilot-smoke.test.js`
- Create: `tests/pilot-flow.spec.js`
- Modify: `package.json`
- Modify: `docs/pilot-runbook.md` (full runbook)
- Modify: `docs/frontend-development-plan.md` (link to this plan)

- [x] **Step 1: API pilot smoke (gated)**

`RUN_PILOT_SMOKE=1 npm run test:pilot-smoke`

Steps in test:
1. Bootstrap fixtures assume `tenant-pilot-001` exists.
2. Widget identify + send message.
3. Operator login + fetch dialogs includes new conversation.
4. Operator appendMessage reply.
5. Widget poll returns reply text.

- [x] **Step 2: Playwright `pilot-flow.spec.js`**

1. Open `packages/web-widget/demo.html`.
2. Send widget message.
3. Open `#/app` as operator (storage session seed).
4. Assert conversation visible; send reply.
5. Assert widget shows reply.

- [x] **Step 3: Add npm scripts**

```json
"test:pilot-smoke": "node --test tests/pilot-smoke.test.js",
"test:pilot-flow": "playwright test tests/pilot-flow.spec.js",
"widget:build": "npm run build --prefix packages/web-widget"
```

- [x] **Step 4: Complete `docs/pilot-runbook.md`**

Sections:
- Подготовка окружения
- Создание tenant (bootstrap vs onboarding)
- Установка виджета у клиента
- Чеклист дня запуска
- Rollback / support contacts
- Known limitations

- [x] **Step 5: Link from `docs/frontend-development-plan.md`**

Add §7.3:

```markdown
### 7.3. First client pilot

См. [First Client Pilot Plan](superpowers/plans/2026-07-01-first-client-pilot.md).
```

- [x] **Step 6: Full verification**

```bash
cd backend && npm run release:checklist
cd .. && npm run test:pilot-smoke  # with stack up + RUN_PILOT_SMOKE=1
npm run test:pilot-flow
npm run build
```

- [x] **Step 7: Commit**

```bash
git commit -m "test: add pilot smoke coverage and runbook"
```

---

## Execution Order & Estimates

| Task | Зависимости | Оценка |
| --- | --- | --- |
| 1. Infrastructure | — | 0.5–1 д |
| 2. Tenant operator auth | 1 | 1–2 д |
| 3. Tenant provisioning | 1, 2 | 1 д |
| 4. Public SDK messages | 1, 3 | 1–2 д |
| 5. Dialog tenant guard | 2 | 0.5–1 д |
| 6. Frontend auth | 2 | 1 д |
| 7. Live inbox | 5, 6 | 2–3 д |
| 8. Web widget | 4 | 1–2 д |
| 9. Onboarding wire | 3, 6 | 0.5–1 д |
| 10. Smoke + runbook | all | 1 д |

**Итого:** ~10–14 рабочих дней одного full-stack разработчика.

Рекомендуемый порядок: **1 → 2 → 5 → 4 → 7 → 6 → 8 → 3 → 9 → 10**.

---

## Risks & Mitigations

| Риск | Митигация |
| --- | --- |
| SSE не поддерживает `Authorization` header в браузере | Pilot-only query token с коротким TTL; production — cookie session |
| `production_identity_provider_required` в auth | Пилот только на `NODE_ENV=staging` или `development` |
| Outbound delivery в виджет только через poll | Документировать latency; post-pilot — widget SSE |
| Tenant isolation regression | Обязательный contract test task 5 step 3 |
| Demo headers остаются в коде | `apiClient` приоритет bearer; lint rule в pilot smoke |

---

## Self-Review

- **Spec coverage:** все 7 acceptance criteria покрыты задачами 1–10.
- **Placeholder scan:** нет TBD/TODO в шагах; конкретные файлы, маршруты, команды.
- **Type consistency:** `appendMessage`, `loginTenantOperator`, `conversationId` единообразны across tasks.
- **Scope check:** боты, биллинг, мессенджеры явно вынесены в post-pilot.
