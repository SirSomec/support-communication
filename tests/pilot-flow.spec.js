import { expect, test } from "@playwright/test";

const demoUrl = process.env.PILOT_WIDGET_DEMO_URL ?? "http://127.0.0.1:5174/demo.html";
const appUrl = process.env.PILOT_OPERATOR_APP_URL ?? "http://127.0.0.1:5173";

test("widget demo page loads and SupportWidget.init is available", async ({ page }) => {
  await page.goto(demoUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Support Widget/i })).toBeVisible();

  const hasInit = await page.evaluate(() => {
    const widget = globalThis.SupportWidget;
    return Boolean(widget && typeof widget.init === "function");
  });
  expect(hasInit).toBeTruthy();
});

test("operator app opens only after backend tenant state confirms session", async ({ page, request }) => {
  const loginResponse = await request.post("/api/v1/auth/tenant/login", {
    data: {
      email: "sergey@volga.example",
      password: "correct-password"
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();
  expect(loginPayload.status).toBe("ok");
  expect(loginPayload.data.accessToken).toBeTruthy();

  await seedTenantSession(page, loginPayload.data);
  await page.goto(`${appUrl}/#/app`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-app-shell")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".conversation-list")).toBeVisible();
});

test("outbound backend failure keeps launcher open with inline error", async ({ page, request }) => {
  const loginResponse = await request.post("/api/v1/auth/tenant/login", {
    data: {
      email: "sergey@volga.example",
      password: "correct-password"
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();

  await page.route("**/api/v1/dialogs/outbound", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        service: "dialogService",
        operation: "createOutboundConversationRequest",
        status: "invalid",
        data: null,
        error: {
          code: "topic_required",
          message: "Backend requires a topic before outbound delivery."
        },
        states: {
          loading: false,
          empty: true,
          error: true,
          partial: false
        },
        meta: { source: "api-gateway" },
        traceId: "trc_dialogService_createOutboundConversationRequest_test"
      })
    });
  });

  await seedTenantSession(page, loginPayload.data);
  await page.goto(`${appUrl}/#/app`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-app-shell")).toBeVisible({ timeout: 15000 });

  await page.locator(".quick-action").click();
  await expect(page.locator(".outbound-panel")).toBeVisible();
  await page.locator(".outbound-grid input").first().fill(uniqueOutboundPhone());
  await page.locator(".outbound-grid input").nth(1).fill("Backend Reject Client");
  await page.locator(".outbound-message textarea").fill("Outbound request should stay in the launcher.");
  await page.locator(".outbound-panel > footer button").filter({ hasText: "Создать диалог" }).click();

  await expect(page.locator(".outbound-panel")).toBeVisible();
  await expect(page.locator(".outbound-error")).toContainText("Backend requires a topic");
});

test("outbound quick action creates backend descriptor and visible queued dialog", async ({ page, request }) => {
  const loginResponse = await request.post("/api/v1/auth/tenant/login", {
    data: {
      email: "sergey@volga.example",
      password: "correct-password"
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();

  await seedTenantSession(page, loginPayload.data);
  await page.goto(`${appUrl}/#/app`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-app-shell")).toBeVisible({ timeout: 15000 });

  const runId = Date.now().toString(36);
  const phone = uniqueOutboundPhone();
  const clientName = `Outbound Client ${runId}`;
  await page.locator(".quick-action").click();
  await expect(page.locator(".outbound-panel")).toBeVisible();
  const topicField = page.locator('.outbound-grid .outbound-field:has(span:text-is("Тематика")) input');
  await expect(topicField).not.toHaveValue("");
  await page.locator(".outbound-grid input").first().fill(phone);
  await page.locator(".outbound-grid input").nth(1).fill(clientName);
  await page.locator(".outbound-message textarea").fill("Queue this outbound SDK dialog through the backend.");

  const outboundResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/dialogs/outbound") && response.request().method() === "POST"
  );
  await page.locator(".outbound-panel > footer button").filter({ hasText: "Создать диалог" }).click();
  const outboundResponse = await outboundResponsePromise;
  expect(outboundResponse.ok()).toBeTruthy();
  const outboundPayload = await outboundResponse.json();
  expect(outboundPayload.status).toBe("ok");
  expect(outboundPayload.data.descriptorId).toBeTruthy();
  expect(outboundPayload.data.conversationId).toBe(outboundPayload.data.descriptorId);
  expect(outboundPayload.data.auditId).toBeTruthy();
  expect(outboundPayload.data.outboxEventId).toBeTruthy();

  await expect(page.locator(".toast")).toContainText("поставлен в очередь");
  await expect(page.locator(".chat-identity")).toContainText(clientName);
  await expect(page.locator(".customer-panel")).toContainText(phone);

  const dialogsResponse = await request.get(`/api/v1/dialogs?query=${encodeURIComponent(clientName)}`, {
    headers: { authorization: `Bearer ${loginPayload.data.accessToken}` }
  });
  expect(dialogsResponse.ok()).toBeTruthy();
  const dialogsPayload = await dialogsResponse.json();
  expect(dialogsPayload.status).toBe("ok");
  expect(dialogsPayload.data.items).toHaveLength(1);
  expect(dialogsPayload.data.items[0].id).toBe(outboundPayload.data.conversationId);
  expect(dialogsPayload.data.items[0].status).toBe("queued");

  const detailResponse = await request.get(`/api/v1/dialogs/${encodeURIComponent(outboundPayload.data.conversationId)}`, {
    headers: { authorization: `Bearer ${loginPayload.data.accessToken}` }
  });
  expect(detailResponse.ok()).toBeTruthy();
  const detailPayload = await detailResponse.json();
  expect(detailPayload.status).toBe("ok");
  expect(JSON.stringify(detailPayload.data.messages)).toContain(outboundPayload.data.auditId);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-app-shell")).toBeVisible({ timeout: 15000 });
  await page.getByLabel("Поиск по диалогам").fill(clientName);
  const persistedRow = page.locator(".queue-row").filter({ hasText: clientName });
  await expect(persistedRow).toBeVisible();
  await persistedRow.click();
  await expect(page.locator(".chat-identity")).toContainText(clientName);
  await expect(page.locator(".customer-panel")).toContainText(phone);
});

test("onboarding creates tenant and owner session opens workspace", async ({ page }) => {
  await page.goto("/#/onboarding");
  await expect(page.getByTestId("route-onboarding")).toBeVisible();

  const runId = Date.now().toString(36);
  await page.locator(".onboarding-field").filter({ hasText: "Название организации" }).locator("input").fill(`Pilot Retail ${runId}`);
  await page.getByRole("button", { name: "Сгенерировать" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.locator(".onboarding-field").filter({ hasText: "Имя" }).locator("input").fill("Pilot Owner");
  await page.locator(".onboarding-field").filter({ hasText: "Email" }).locator("input").fill(`owner-${runId}@pilot.example`);
  await page.locator(".onboarding-field").filter({ hasText: "Пароль" }).locator("input").fill("correct-password");
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.locator(".onboarding-field").filter({ hasText: "Email сотрудника" }).locator("input").fill(`operator-${runId}@pilot.example`);
  await page.getByRole("button", { name: "Добавить" }).click();
  await expect(page.locator(".onboarding-employee-list").getByText(`operator-${runId}@pilot.example`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Завершить" }).click();
  await expect(page.getByTestId("route-app-shell")).toBeVisible({ timeout: 20000 });
});

test("notification center loads API-backed inbox", async ({ page, request }) => {
  const loginResponse = await request.post("/api/v1/auth/tenant/login", {
    data: {
      email: "sergey@volga.example",
      password: "correct-password"
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();
  const notificationsResponse = await request.get("/api/v1/notifications", {
    headers: { authorization: `Bearer ${loginPayload.data.accessToken}` }
  });
  expect(notificationsResponse.ok()).toBeTruthy();
  const notificationsPayload = await notificationsResponse.json();
  expect(notificationsPayload.status).toBe("ok");
  expect(Array.isArray(notificationsPayload.data.items)).toBeTruthy();

  await seedTenantSession(page, loginPayload.data);
  await page.goto(`${appUrl}/#/app`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-app-shell")).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "Уведомления" }).click();
  await expect(page.locator(".notification-drawer")).toBeVisible();
  await expect(page.locator(".notification-list .notification-item").first()).toBeVisible();
});

function uniqueOutboundPhone() {
  const suffix = String(Date.now()).slice(-7).padStart(7, "0");
  return `+7 998 ${suffix.slice(0, 3)}-${suffix.slice(3, 5)}-${suffix.slice(5, 7)}`;
}

async function seedTenantSession(page, storedSession) {
  await page.addInitScript((session) => {
    sessionStorage.setItem("sc_access_token", session.accessToken);
    sessionStorage.setItem("sc_tenant_id", session.tenantId);
    sessionStorage.setItem("sc_operator", JSON.stringify(session.operator));
  }, storedSession);
}
