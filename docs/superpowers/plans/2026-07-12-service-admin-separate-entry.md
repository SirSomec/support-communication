# Service Admin Separate Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split platform service-admin into a separate Vite MPA entry at `/service-admin`, remove all entry points from the tenant operator UI, and redirect legacy `#/service-admin*` hashes to path URLs.

**Architecture:** Add `service-admin/index.html` + `src/service-admin/*` as an independent React root with pathname routing and the existing service-admin session/API. Strip service-admin rendering and TopBar entry from the product `App.jsx`. Keep the NestJS api-gateway contracts unchanged.

**Tech Stack:** React 19, Vite 6 MPA, hash routing (product) + pathname routing (admin), Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-12-service-admin-separate-entry-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| Create: `service-admin/index.html` | Admin document root for Vite MPA |
| Create: `src/service-admin/main.jsx` | Mount `ServiceAdminApp` |
| Create: `src/service-admin/ServiceAdminApp.jsx` | Path router, session gate, login/dashboard |
| Create: `src/service-admin/serviceAdminPath.js` | Parse/build `/service-admin` paths; legacy hash redirect helper |
| Create: `vite.service-admin-fallback.js` | Dev/preview middleware rewrite for `/service-admin/*` |
| Modify: `vite.config.js` | Dual rollup input + fallback plugin + existing API proxy |
| Modify: `src/main.jsx` | Redirect legacy `#/service-admin*` before mounting product App |
| Modify: `src/App.jsx` | Remove service-admin lazy routes, env gate, TopBar admin wiring |
| Modify: `src/app/useWorkspaceRoute.js` | Remove service-admin namespace/actions; keep product hashes only |
| Modify: `src/features/app-shell/AppShell.jsx` | Remove «Админ сервиса» button and `onOpenServiceAdmin` |
| Modify: `src/features/service-admin/ServiceAdminLogin.jsx` | Drop tenant `onBack`; optional link to product landing `/#/landing` |
| Modify: `src/app/notificationNavigation.js` | Service-admin notification targets always unavailable in product app |
| Modify: `tests/service-admin-path.test.js` | Unit tests for path helpers + legacy redirect |
| Modify: `tests/service-admin-runtime.spec.js` | Playwright uses `/service-admin` |
| Modify: `tests/smoke.spec.js` | No TopBar entry; path entry; notification unavailable |
| Modify: `tests/ui-mutation-guards.test.js` | Drop `openServiceAdmin` / canServiceAdmin wiring expectations |
| Reuse unchanged: `src/features/service-admin/*` workspaces, `sessionStore`, `authService`, backend |

---

### Task 1: Path helpers (TDD)

**Files:**
- Create: `src/service-admin/serviceAdminPath.js`
- Create: `tests/service-admin-path.test.js`
- Modify: `package.json` (add script)

- [ ] **Step 1: Write the failing test**

```js
// tests/service-admin-path.test.js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  legacyServiceAdminHashToPath,
  parseServiceAdminPath,
  serviceAdminPathForView
} from "../src/service-admin/serviceAdminPath.js";

describe("serviceAdminPath", () => {
  it("parses canonical pathnames", () => {
    assert.deepEqual(parseServiceAdminPath("/service-admin"), { view: "dashboard" });
    assert.deepEqual(parseServiceAdminPath("/service-admin/"), { view: "dashboard" });
    assert.deepEqual(parseServiceAdminPath("/service-admin/login"), { view: "login" });
    assert.equal(parseServiceAdminPath("/app"), null);
  });

  it("builds pathnames for views", () => {
    assert.equal(serviceAdminPathForView("login"), "/service-admin/login");
    assert.equal(serviceAdminPathForView("dashboard"), "/service-admin");
  });

  it("maps legacy hashes to pathnames", () => {
    assert.equal(legacyServiceAdminHashToPath("#/service-admin"), "/service-admin");
    assert.equal(legacyServiceAdminHashToPath("#/service-admin/login"), "/service-admin/login");
    assert.equal(legacyServiceAdminHashToPath("#/app"), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/service-admin-path.test.js`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```js
// src/service-admin/serviceAdminPath.js
export function parseServiceAdminPath(pathname = "") {
  const normalized = String(pathname).replace(/\/+$/, "") || "/";
  if (normalized === "/service-admin/login") {
    return { view: "login" };
  }
  if (normalized === "/service-admin") {
    return { view: "dashboard" };
  }
  return null;
}

export function serviceAdminPathForView(view) {
  return view === "login" ? "/service-admin/login" : "/service-admin";
}

export function legacyServiceAdminHashToPath(hash = "") {
  if (hash === "#/service-admin/login") {
    return "/service-admin/login";
  }
  if (hash === "#/service-admin") {
    return "/service-admin";
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/service-admin-path.test.js`

Expected: PASS

- [ ] **Step 5: Add npm script and commit**

In `package.json` scripts add:

```json
"test:service-admin-path": "node --test tests/service-admin-path.test.js"
```

```bash
git add src/service-admin/serviceAdminPath.js tests/service-admin-path.test.js package.json
git commit -m "feat: add service-admin path helpers"
```

---

### Task 2: Vite MPA entry + SPA fallback

**Files:**
- Create: `service-admin/index.html`
- Create: `vite.service-admin-fallback.js`
- Modify: `vite.config.js`

- [ ] **Step 1: Add admin HTML entry**

```html
<!-- service-admin/index.html -->
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Администрирование сервиса — Support Communication</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/service-admin/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Add fallback middleware plugin**

```js
// vite.service-admin-fallback.js
export function serviceAdminSpaFallback() {
  return {
    name: "service-admin-spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "";
        if (url.startsWith("/service-admin") && !url.includes(".")) {
          req.url = "/service-admin/index.html";
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "";
        if (url.startsWith("/service-admin") && !url.includes(".")) {
          req.url = "/service-admin/index.html";
        }
        next();
      });
    }
  };
}
```

- [ ] **Step 3: Wire Vite config**

```js
// vite.config.js
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { serviceAdminSpaFallback } from "./vite.service-admin-fallback.js";

export default defineConfig({
  plugins: [react(), serviceAdminSpaFallback()],
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "service-admin": resolve(__dirname, "service-admin/index.html")
      }
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4100",
        changeOrigin: true
      }
    }
  }
});
```

- [ ] **Step 4: Add temporary main stub so Vite can resolve the entry**

```js
// src/service-admin/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <main data-testid="route-service-admin-login">service-admin entry</main>
  </React.StrictMode>
);
```

- [ ] **Step 5: Smoke-check build input**

Run: `npm run build`

Expected: build succeeds; `dist/service-admin/index.html` (or equivalent) exists alongside `dist/index.html`

- [ ] **Step 6: Commit**

```bash
git add service-admin/index.html vite.service-admin-fallback.js vite.config.js src/service-admin/main.jsx
git commit -m "build: add service-admin Vite MPA entry"
```

---

### Task 3: ServiceAdminApp shell (login + dashboard gate)

**Files:**
- Create: `src/service-admin/ServiceAdminApp.jsx`
- Modify: `src/service-admin/main.jsx`
- Modify: `src/features/service-admin/ServiceAdminLogin.jsx`

- [ ] **Step 1: Implement ServiceAdminApp**

```jsx
// src/service-admin/ServiceAdminApp.jsx
import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { clearServiceAdminSession, hasServiceAdminSession } from "../app/sessionStore.js";
import { RouteLoading } from "../app/RouteLoading.jsx";
import { Toast } from "../ui.jsx";
import { parseServiceAdminPath, serviceAdminPathForView } from "./serviceAdminPath.js";
import "../styles.css";

const ServiceAdminDashboard = lazy(() =>
  import("../features/service-admin/index.js").then((module) => ({
    default: module.ServiceAdminDashboard
  }))
);
const ServiceAdminLogin = lazy(() =>
  import("../features/service-admin/ServiceAdminLogin.jsx").then((module) => ({
    default: module.ServiceAdminLogin
  }))
);

export function ServiceAdminApp() {
  const [view, setView] = useState(() => resolveInitialView());
  const [toast, setToast] = useState("");

  useEffect(() => {
    function syncFromLocation() {
      setView(resolveInitialView());
    }

    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const navigate = useCallback((nextView) => {
    const path = serviceAdminPathForView(nextView);
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState(null, "", path);
    }
    setView(nextView);
  }, []);

  function handleLoginSuccess() {
    navigate("dashboard");
  }

  function handleLogoutOrBack() {
    clearServiceAdminSession();
    navigate("login");
  }

  if (view === "login") {
    return (
      <>
        <Suspense fallback={<RouteLoading label="Загрузка входа администратора сервиса" />}>
          <ServiceAdminLogin onSuccess={handleLoginSuccess} />
        </Suspense>
        {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
      </>
    );
  }

  return (
    <div data-testid="route-service-admin" className="app-shell service-admin-app">
      <main className="workspace">
        <Suspense fallback={<RouteLoading label="Загрузка администрирования сервиса" />}>
          <ServiceAdminDashboard onBack={handleLogoutOrBack} onToast={setToast} />
        </Suspense>
      </main>
      {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
    </div>
  );
}

function resolveInitialView() {
  const parsed = parseServiceAdminPath(window.location.pathname);
  const requested = parsed?.view === "login" ? "login" : "dashboard";
  if (requested === "dashboard" && !hasServiceAdminSession()) {
    const loginPath = serviceAdminPathForView("login");
    if (window.location.pathname !== loginPath) {
      window.history.replaceState(null, "", loginPath);
    }
    return "login";
  }
  return requested;
}
```

- [ ] **Step 2: Mount ServiceAdminApp from main**

```jsx
// src/service-admin/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { ServiceAdminApp } from "./ServiceAdminApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ServiceAdminApp />
  </React.StrictMode>
);
```

- [ ] **Step 3: Simplify ServiceAdminLogin props**

Remove `onBack` usage. Replace the secondary button with navigation to the product landing (not the tenant app shell):

```jsx
<button
  className="secondary-button"
  onClick={() => { window.location.href = "/#/landing"; }}
  type="button"
>
  На сайт
</button>
<button className="primary-button" disabled={submitting} type="submit">
  {awaitingOtp ? "Подтвердить" : "Продолжить"}
</button>
```

Update the component signature to `export function ServiceAdminLogin({ onSuccess })` (drop `onBack`).

- [ ] **Step 4: Manual/dev check**

Run: `npm run dev`

Open `http://127.0.0.1:5173/service-admin/login` — login page renders with `data-testid="route-service-admin-login"`.

Open `http://127.0.0.1:5173/service-admin` without token — replaces URL to `/service-admin/login`.

- [ ] **Step 5: Commit**

```bash
git add src/service-admin/ServiceAdminApp.jsx src/service-admin/main.jsx src/features/service-admin/ServiceAdminLogin.jsx
git commit -m "feat: mount independent service-admin app shell"
```

---

### Task 4: Legacy hash redirect in product entry

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 1: Redirect before mount**

```jsx
// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { legacyServiceAdminHashToPath } from "./service-admin/serviceAdminPath.js";
import "./styles.css";

const legacyAdminPath = legacyServiceAdminHashToPath(window.location.hash);
if (legacyAdminPath) {
  window.location.replace(legacyAdminPath);
} else {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
```

Note: importing `serviceAdminPath.js` into the product entry is acceptable (tiny shared helper, no React admin UI). Do **not** import `ServiceAdminApp` or dashboard modules from `main.jsx`.

- [ ] **Step 2: Commit**

```bash
git add src/main.jsx
git commit -m "feat: redirect legacy service-admin hashes to path"
```

---

### Task 5: Remove service-admin from product UI

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/app/useWorkspaceRoute.js`
- Modify: `src/features/app-shell/AppShell.jsx`
- Modify: `src/app/notificationNavigation.js`

- [ ] **Step 1: Strip TopBar admin button**

In `src/features/app-shell/AppShell.jsx`:
- Remove `ServerCog` import if unused
- Remove `onOpenServiceAdmin` prop
- Remove the `{access.canServiceAdmin ? (...Админ сервиса...) : null}` block

- [ ] **Step 2: Strip workspace route service-admin namespace**

In `src/app/useWorkspaceRoute.js`:
- Remove `#/service-admin` and `#/service-admin/login` from `routeByHash`
- Remove `isServiceAdminDenied` state/effect
- Remove `openServiceAdmin` from actions
- Remove `hashForRoute` branch for `service-admin`
- Remove unused `hasServiceAdminSession` import

- [ ] **Step 3: Strip App.jsx admin rendering**

In `src/App.jsx`:
- Remove `SERVICE_ADMIN_DEMO_ENABLED` and `appShellAccess` override (`canServiceAdmin: true`)
- Remove lazy imports of `ServiceAdminDashboard` / `ServiceAdminLogin`
- Remove imports used only for service-admin shell (`serviceAdminAccessProfile`, `serviceAdminRole`) if unused
- Remove `if (route.namespace === "service-admin" ...)` branches
- Pass `access` (not `appShellAccess`) to TopBar
- Remove `onOpenServiceAdmin={routeActions.openServiceAdmin}`
- In notification navigation handler: if target namespace is `service-admin`, do not navigate; optionally toast that the target is unavailable in the product app

- [ ] **Step 4: Make service-admin notifications unavailable in product**

In `src/app/notificationNavigation.js`, change availability guard to always deny:

```js
if (resolvedTarget.namespace === "service-admin") {
  return unavailableNotificationAction(
    "Откройте /service-admin — этот раздел недоступен из рабочего места организации."
  );
}
```

Keep `resolveNotificationNavigationTarget` mapping for clarity/tests, but product UI must not act on it.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/app/useWorkspaceRoute.js src/features/app-shell/AppShell.jsx src/app/notificationNavigation.js
git commit -m "feat: remove service-admin entry from tenant UI"
```

---

### Task 6: Update unit guards

**Files:**
- Modify: `tests/ui-mutation-guards.test.js`

- [ ] **Step 1: Update expectations**

Replace assertions that require `routeActions.openServiceAdmin` in `App.jsx` with assertions that product App does **not** reference service-admin routes/actions:

```js
assert.doesNotMatch(appSource, /routeActions\.openServiceAdmin/);
assert.doesNotMatch(appSource, /ServiceAdminDashboard/);
assert.doesNotMatch(appSource, /VITE_ENABLE_SERVICE_ADMIN/);
```

Update the service-admin notification availability test so **both** `canServiceAdmin: false` and `canServiceAdmin: true` return `disabled: true` with the new reason string (match production text exactly).

Remove assertions that product shell must wire `onOpenServiceAdmin` / `.service-admin-entry`; assert product shell source does **not** contain `service-admin-entry`.

- [ ] **Step 2: Run**

Run: `node --test tests/ui-mutation-guards.test.js`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/ui-mutation-guards.test.js
git commit -m "test: update guards for separated service-admin entry"
```

---

### Task 7: Update Playwright service-admin runtime

**Files:**
- Modify: `tests/service-admin-runtime.spec.js`

- [ ] **Step 1: Point helper at path entry**

```js
async function openServiceAdmin(page, session) {
  await page.addInitScript((accessToken) => {
    window.sessionStorage.setItem("sc_service_admin_access_token", accessToken);
  }, session.accessToken);
  await page.goto("/service-admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-service-admin")).toBeVisible();
}
```

Add a small test:

```js
test("legacy hash redirects to path entry", async ({ page }) => {
  await page.goto("/#/service-admin/login", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/service-admin\/login/);
  await expect(page.getByTestId("route-service-admin-login")).toBeVisible();
});
```

- [ ] **Step 2: Run**

Run: `npm run test:service-admin-runtime`

Expected: PASS (requires local API on `:4100` as today)

- [ ] **Step 3: Commit**

```bash
git add tests/service-admin-runtime.spec.js
git commit -m "test: run service-admin e2e against path entry"
```

---

### Task 8: Update Playwright smoke coverage

**Files:**
- Modify: `tests/smoke.spec.js`

- [ ] **Step 1: Route/visibility test (~1201)**

Replace the block that expects `.service-admin-entry` and clicks it with:

```js
await openAppShell(page);
await selectRole(page, "Администратор");
await expect(page.locator(".service-admin-entry")).toHaveCount(0);

await page.goto("/service-admin/login");
await expect(page.getByTestId("route-service-admin-login")).toBeVisible();
await expect(page.locator(".role-switcher")).toHaveCount(0);
await expectHealthyPage(page);
```

- [ ] **Step 2: Notification navigation test (~538)**

For «Service-admin audit export» notification, expect the action button **disabled**, and that the tenant shell does **not** open `route-service-admin`. Keep VK settings navigation assertions unchanged. Drop `serviceAdmin: true` from `openAppShell` for that test if it was only used to enable admin navigation.

- [ ] **Step 3: Critical actions test (~1301) and responsive overflow (~1353)**

Replace TopBar click with session seed + path navigation:

```js
const session = await loginServiceAdmin(page);
await page.addInitScript((accessToken) => {
  window.sessionStorage.setItem("sc_service_admin_access_token", accessToken);
}, session.accessToken);
await page.goto("/service-admin");
await expect(page.getByTestId("route-service-admin")).toBeVisible();
```

Reuse the existing `loginServiceAdmin` helper in `smoke.spec.js`; do not reintroduce TopBar entry.

- [ ] **Step 4: Run focused smoke subsets**

Run:

```bash
npx playwright test tests/smoke.spec.js -g "service admin|notification navigation|landing auth onboarding and service admin"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/smoke.spec.js
git commit -m "test: align smoke coverage with separate service-admin entry"
```

---

### Task 9: Final verification

**Files:** none new

- [ ] **Step 1: Unit suite**

Run:

```bash
npm run test:service-admin-path
npm run test:service-admin-utils
node --test tests/ui-mutation-guards.test.js
npm run test:access
```

Expected: all PASS

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: both entries emit; product bundle does not mount admin routes at startup

- [ ] **Step 3: E2E**

Run:

```bash
npm run test:service-admin-runtime
```

Expected: PASS

- [ ] **Step 4: Spec checklist self-check**

Confirm against the design spec:
1. No «Админ сервиса» in product UI (incl. DEV)
2. Canonical URLs `/service-admin` + `/service-admin/login`
3. Separate Vite entry
4. Backend auth unchanged
5. Legacy hash redirects

- [ ] **Step 5: Final commit only if leftover fixes remain**

```bash
git status
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Vite MPA `/service-admin` entry | Task 2–3 |
| Path routing + session gate | Task 1, 3 |
| Remove TopBar/button everywhere | Task 5 |
| Remove product lazy admin routes | Task 5 |
| Legacy hash → path redirect | Task 4, 7 |
| Notifications unavailable in product | Task 5, 8 |
| Shared backend / unchanged API | (no backend task) |
| E2E/unit updates | Tasks 6–9 |
| Login «Назад» not to tenant app | Task 3 |

No TBD placeholders. Names used consistently: `parseServiceAdminPath`, `serviceAdminPathForView`, `legacyServiceAdminHashToPath`, `ServiceAdminApp`.
