# Service Admin Separate Entry — Design

**Date:** 2026-07-12  
**Status:** Approved for planning  
**Goal:** Remove service-admin from the tenant operator UI and expose it only as an independent path-based frontend entry on the same origin, with a shared backend.

## Problem

Service administration is already logically separate (own login, session token, API guards), but physically embedded in the tenant SPA:

- TopBar button «Админ сервиса» appears in the operator shell (DEV or `VITE_ENABLE_SERVICE_ADMIN`)
- Routes live as hash paths: `#/service-admin`, `#/service-admin/login`
- Admin UI is lazy-loaded from the same Vite bundle and reuses the tenant `AppShell`

Operators should not see or enter platform admin from the product workspace. Entry must be independent and URL-based.

## Decisions

| Decision | Choice |
|----------|--------|
| Separation depth | Separate frontend entry; shared backend |
| URL shape | Path on same host: `/service-admin` |
| Routing model | Path-only for admin; remove hash admin routes (redirect to path) |
| Path prefix | `/service-admin` |
| TopBar button | Remove everywhere, including DEV |
| Build shape | Vite multi-page app (MPA): two HTML entries |

## Architecture

Two independent frontend entries on one origin; one api-gateway.

| Entry | Canonical URLs | Role |
|-------|----------------|------|
| Tenant / product | `/` + existing hash routes (`#/landing`, `#/login`, `#/app`, …) | Organization operator work |
| Service-admin | `/service-admin`, `/service-admin/login` | Platform operator work |

### Build

- Keep `index.html` → `src/main.jsx` for the product SPA.
- Add `service-admin/index.html` → `src/service-admin/main.jsx` for the admin SPA.
- Configure Vite `build.rollupOptions.input` for both entries.
- Dev server and static hosting must rewrite `/service-admin` and `/service-admin/*` (except assets) to the admin HTML entry so deep links do not 404.

### Isolation rules

- Product `App.jsx` must not import or render service-admin dashboard/login.
- Remove `canServiceAdmin` TopBar entry, `VITE_ENABLE_SERVICE_ADMIN` UI gate, and `openServiceAdmin` route actions from the tenant shell.
- Admin shell lives only in the admin entry (no tenant Sidebar/section router).
- Backend contracts stay unchanged: `POST /api/v1/auth/login` (service-admin subjects), `ServiceAdminSessionGuard`, existing `/service-admin/*` APIs.
- Sessions stay separate: `sc_service_admin_access_token` vs tenant `sc_access_token`.

### Route migration

| Legacy | Canonical |
|--------|-----------|
| `#/service-admin` | `/service-admin` |
| `#/service-admin/login` | `/service-admin/login` |

When the product app detects a legacy hash admin URL, it must `location.replace` to the canonical path and must not render admin UI.

Inside the admin entry, routing is pathname-based (not hash).

## Components

### New

- `service-admin/index.html` — admin document root
- `src/service-admin/main.jsx` — mounts admin root
- `src/service-admin/ServiceAdminApp.jsx` — path router + session gate:
  - no token → `/service-admin/login`
  - token present → `/service-admin` dashboard
  - logout → clear service-admin session → login path

### Reused (admin entry only)

- `src/features/service-admin/*` workspaces and CSS
- `src/features/service-admin/ServiceAdminLogin.jsx` (adjust «Назад»: remove tenant back-navigation; link to public `/` / landing only if a secondary action is needed)
- Shared clients: `authService`, `apiClient` (`authMode: "service-admin"`), `sessionStore` service-admin helpers

### Removed from product app

- TopBar «Админ сервиса» button and related props
- Lazy imports of `ServiceAdminDashboard` / `ServiceAdminLogin` from `App.jsx`
- `service-admin` namespace handling in `useWorkspaceRoute` (except legacy redirect)
- Product overrides that force `canServiceAdmin: true` via env/DEV

### Login flow

1. Open `/service-admin` or `/service-admin/login`
2. Without service-admin token → login form (email/password → OTP → access token)
3. Persist token via existing `setServiceAdminSession`
4. Navigate to `/service-admin` dashboard
5. Logout clears only the service-admin session and returns to `/service-admin/login`
6. Tenant session is ignored by the admin entry

## Error handling

- Missing session or API `401` on service-admin calls → redirect to `/service-admin/login`
- Login/MFA failures → inline form errors (unchanged behavior)
- Unknown `/service-admin/*` deep links → admin SPA rewrite, then app-level login/dashboard gate
- Tenant-app notifications targeting `namespace: "service-admin"` are unavailable in the product app: do not navigate, do not restore TopBar admin entry. Platform operators open `/service-admin` directly.

## Testing

Update frontend/e2e coverage; leave backend contract tests as-is unless URLs in fixtures need path changes.

- Playwright `tests/service-admin-runtime.spec.js` (and related): `goto("/service-admin")` instead of `/#/service-admin`
- Assert product `#/app` never shows «Админ сервиса» (including DEV)
- Assert `#/service-admin` redirects to `/service-admin`
- Keep existing API bearer/session assertions for support-admin flows

## Scope

### In scope

- Vite MPA admin entry and path routing
- Removal of admin entry points from tenant UI
- Legacy hash → path redirects
- E2E/unit adaptations for new URLs
- Minimal admin-shell cleanup so admin does not depend on tenant navigation

### Out of scope

- Separate backend service or separate deploy topology
- Subdomain / cross-origin cookie isolation
- Migrating the entire product app from hash to History API
- Visual redesign of login or dashboard
- Changes to tenant RBAC «Администратор организации»

## Success criteria

1. No service-admin control is visible in the operator product UI (any environment).
2. Platform admin is reachable only via `/service-admin` (+ login path).
3. Product and admin frontends are separate Vite entries; product bundle does not mount admin routes.
4. Existing service-admin auth and API guards continue to work without contract changes.
5. Legacy hash admin URLs redirect to canonical paths.
`)