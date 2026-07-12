import { expect, test } from "@playwright/test";

async function loginServiceAdmin(request) {
  const challengeResponse = await request.post("/api/v1/auth/login", {
    data: {
      email: "service-admin@example.com",
      password: "correct-password"
    }
  });
  expect(challengeResponse.ok()).toBeTruthy();
  const challengePayload = await challengeResponse.json();
  expect(challengePayload.status).toBe("ok");
  expect(challengePayload.data.mfaChallengeId).toBeTruthy();

  const loginResponse = await request.post("/api/v1/auth/login", {
    data: {
      email: "service-admin@example.com",
      mfaChallengeId: challengePayload.data.mfaChallengeId,
      otp: "123456",
      password: "correct-password"
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();
  expect(loginPayload.status).toBe("ok");
  expect(loginPayload.data.accessToken).toBeTruthy();
  return loginPayload.data;
}

async function openServiceAdmin(page, session) {
  await page.addInitScript((accessToken) => {
    window.sessionStorage.setItem("sc_service_admin_access_token", accessToken);
  }, session.accessToken);
  await page.goto("/service-admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-service-admin")).toBeVisible();
}

const tenantShellEndpoints = new Set([
  "/api/v1/integrations/channels",
  "/api/v1/notifications",
  "/api/v1/notifications/preferences",
  "/api/v1/permissions/model",
  "/api/v1/workspace/topics"
]);

function collectTenantShellRequests(page) {
  const requests = [];

  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (tenantShellEndpoints.has(pathname)) {
      requests.push(`${request.method()} ${pathname}`);
    }
  });

  return requests;
}

test("legacy hash redirects to path entry", async ({ page }) => {
  await page.goto("/#/service-admin/login", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/service-admin\/login/);
  await expect(page.getByTestId("route-service-admin-login")).toBeVisible();
});

test("service-admin runtime uses bearer session for support users", async ({ page, request }) => {
  const session = await loginServiceAdmin(request);
  const usersResponse = await request.get("/api/v1/service-admin/users?tenantId=tenant-volga", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(usersResponse.ok()).toBeTruthy();
  const usersPayload = await usersResponse.json();
  expect(usersPayload.status).toBe("ok");
  expect(Array.isArray(usersPayload.data.items)).toBeTruthy();

  await openServiceAdmin(page, session);
  await expect(page.getByTestId("service-admin-worker-observability")).toBeVisible();
  await page.locator(".service-admin-tabs button").filter({ hasText: "Пользователи" }).click();
  await expect(page.locator(".user-support-workspace")).toContainText("Личность клиента");
});

test("service-admin runtime renders durable database worker observability rows", async ({ page, request }) => {
  const session = await loginServiceAdmin(request);
  await page.route("**/api/v1/operations/readiness**", (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get("domain") !== "delivery") {
      return route.fallback();
    }

    return route.fulfill({
      body: JSON.stringify({
        service: "operationsReadinessService",
        operation: "fetchReadinessDashboard",
        status: "ok",
        partial: false,
        traceId: "trc_operations_test_database_workers",
        updatedAt: "2026-07-05T00:00:00.000Z",
        states: { loading: false, empty: false, error: false, partial: false },
        meta: { source: "api", apiVersion: "v1" },
        data: {
          workerObservability: [
            {
              workerId: "outbox-worker",
              queue: "message-delivery",
              evidenceSource: "database.outboxEvents",
              queueDepth: 0,
              deadLetterCount: 0,
              updatedAt: "2026-07-05T00:00:00.000Z",
              health: { status: "healthy" },
              lastDelivery: null
            },
            {
              workerId: "billing-sync-worker",
              queue: "billing-sync",
              evidenceSource: "database.billingSyncJobs",
              queueDepth: 0,
              deadLetterCount: 0,
              updatedAt: "2026-07-05T00:00:00.000Z",
              health: { status: "healthy" },
              lastDelivery: null
            },
            {
              workerId: "file-scan-scanner-worker",
              queue: "file-scan",
              evidenceSource: "database.outboxEvents",
              queueDepth: 1,
              deadLetterCount: 0,
              updatedAt: "2026-07-05T00:01:00.000Z",
              health: { status: "degraded" },
              lastDelivery: {
                attemptedAt: "2026-07-05T00:01:00.000Z",
                deliveryId: "outbox-file-scan-runtime",
                eventType: "attachment.upload.requested",
                status: "pending",
                traceId: "trc_file_scan_runtime"
              }
            }
          ]
        },
        error: null
      }),
      contentType: "application/json",
      status: 200
    });
  });

  await openServiceAdmin(page, session);
  const panel = page.getByTestId("service-admin-worker-observability");
  await expect(panel).toContainText("outbox-worker");
  await expect(panel).toContainText("billing-sync-worker");
  await expect(panel).toContainText("file-scan-scanner-worker");
  await expect(panel).toContainText("file-scan");
  await expect(panel).toContainText("database.outboxEvents");
  await expect(panel).toContainText("database.billingSyncJobs");
  await expect(panel).toContainText("attachment.upload.requested");
  await expect(panel).toContainText("pending");
  await expect(panel).toContainText("trc_file_scan_runtime");
});

test("service-admin runtime does not start tenant shell loaders", async ({ page, request }) => {
  const session = await loginServiceAdmin(request);
  const tenantShellRequests = collectTenantShellRequests(page);

  await openServiceAdmin(page, session);
  await expect(page.getByTestId("service-admin-worker-observability")).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(tenantShellRequests).toEqual([]);
});

test("service-admin runtime updates tenant status and feature flags", async ({ page, request }) => {
  const session = await loginServiceAdmin(request);

  const flagsResponse = await request.get("/api/v1/feature-flags", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(flagsResponse.ok()).toBeTruthy();
  const flagsPayload = await flagsResponse.json();
  expect(flagsPayload.status).toBe("ok");

  await openServiceAdmin(page, session);
  await page.locator(".service-admin-tabs button").filter({ hasText: "Флаги" }).click();
  await expect(page.locator(".flag-workspace")).toBeVisible();
  await page.locator(".service-admin-flag-list button").first().click();
  await page.locator(".service-admin-action-buttons button").filter({ hasText: "Предпросмотр" }).click();
  await expect(page.locator(".service-admin-preview")).toBeVisible();

  await page.locator(".service-admin-tabs button").filter({ hasText: "Организации" }).click();
  await expect(page.locator(".tenant-workspace")).toBeVisible();
});

test("service-admin runtime covers incidents and audit export", async ({ page, request }) => {
  const session = await loginServiceAdmin(request);

  const incidentsResponse = await request.get("/api/v1/incidents", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(incidentsResponse.ok()).toBeTruthy();
  const incidentsPayload = await incidentsResponse.json();
  expect(incidentsPayload.status).toBe("ok");

  const exportResponse = await request.post("/api/v1/service-admin/audit-events/exports", {
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json"
    },
    data: {
      format: "CSV",
      source: "channels"
    }
  });
  expect(exportResponse.ok()).toBeTruthy();
  const exportPayload = await exportResponse.json();
  expect(exportPayload.status).toBe("ok");

  await openServiceAdmin(page, session);
  await page.locator(".service-admin-tabs button").filter({ hasText: "Инциденты" }).click();
  await expect(page.locator(".incident-workspace")).toBeVisible();
  await page.locator(".service-admin-tabs button").filter({ hasText: "Аудит" }).click();
  await expect(page.locator(".audit-workspace")).toBeVisible();
});
