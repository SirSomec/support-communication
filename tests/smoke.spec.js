import { expect, test } from "@playwright/test";

async function selectRole(page, role) {
  await page.locator(".role-switcher select").selectOption({ label: role });
}

async function loginServiceAdmin(page) {
  const challengeResponse = await page.request.post("/api/v1/auth/login", {
    data: {
      email: "service-admin@example.com",
      password: "correct-password"
    }
  });
  expect(challengeResponse.ok()).toBeTruthy();
  const challengePayload = await challengeResponse.json();
  expect(challengePayload.status).toBe("ok");
  expect(challengePayload.data.mfaChallengeId).toBeTruthy();

  const loginResponse = await page.request.post("/api/v1/auth/login", {
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

async function openAppShell(page, { serviceAdmin = false } = {}) {
  const loginResponse = await page.request.post("/api/v1/auth/tenant/login", {
    data: {
      email: "sergey@volga.example",
      password: "correct-password"
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();
  const session = loginPayload.data;
  expect(loginPayload.status).toBe("ok");
  expect(session.accessToken).toBeTruthy();

  const serviceAdminSession = serviceAdmin ? await loginServiceAdmin(page) : null;

  const persistTenantSession = (storedSession) => {
    try {
      sessionStorage.setItem("sc_access_token", storedSession.tenant.accessToken);
      sessionStorage.setItem("sc_tenant_id", storedSession.tenant.tenantId);
      sessionStorage.setItem("sc_operator", JSON.stringify(storedSession.tenant.operator));

      if (storedSession.serviceAdminAccessToken) {
        sessionStorage.setItem("sc_service_admin_access_token", storedSession.serviceAdminAccessToken);
      }
    } catch {
      // about:blank blocks sessionStorage in Chromium; the script runs again on the app origin.
    }
  };

  await page.addInitScript(persistTenantSession, {
    serviceAdminAccessToken: serviceAdminSession?.accessToken ?? null,
    tenant: session
  });
  await page.goto("about:blank");
  await page.goto("/#/app", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-app-shell")).toBeVisible({ timeout: 15000 });
  return { serviceAdminSession, tenantSession: session };
}

async function openServiceAdminShell(page) {
  const session = await loginServiceAdmin(page);
  await page.goto("/service-admin/login", { waitUntil: "domcontentloaded" });
  await page.evaluate((accessToken) => {
    window.sessionStorage.setItem("sc_service_admin_access_token", accessToken);
  }, session.accessToken);
  await page.goto("/service-admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-service-admin")).toBeVisible();
  return session;
}

async function seedTenantTemplate(page, template) {
  const loginResponse = await page.request.post("/api/v1/auth/tenant/login", {
    data: {
      email: "sergey@volga.example",
      password: "correct-password"
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();
  expect(loginPayload.status).toBe("ok");
  expect(loginPayload.data.accessToken).toBeTruthy();

  const response = await page.request.post("/api/v1/templates", {
    data: template,
    headers: {
      authorization: `Bearer ${loginPayload.data.accessToken}`
    }
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.status).toBe("ok");
  return payload.data?.template;
}

async function openSection(page, label) {
  await page.locator("nav button").filter({ hasText: label }).click();
  await expect(page.getByTestId("route-app-shell")).toBeVisible();
}

async function expectHealthyPage(page) {
  await expect(page.locator("vite-error-overlay, [data-nextjs-dialog-overlay]")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
}

async function expectNoElementOverflow(page, selector) {
  await expect.poll(async () => page.locator(selector).evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy();
}

async function activeElementSnapshot(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const style = element ? window.getComputedStyle(element) : null;

    return {
      className: element?.className?.toString() ?? "",
      label: element?.getAttribute("aria-label") ?? element?.innerText ?? "",
      outlineStyle: style?.outlineStyle ?? "",
      outlineWidth: style?.outlineWidth ?? "",
      tagName: element?.tagName ?? ""
    };
  });
}

test("product sections expose loading/data/error states", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");

  for (const section of ["Панель", "Клиенты", "Шаблоны", "Визиты", "Отчеты", "Качество", "Боты", "Audit", "Настройки"]) {
    await openSection(page, section);
    const primaryStateStrip = page.locator(".product-screen > .screen-state-strip").first();
    await expect(primaryStateStrip.locator(".screen-state-item")).toHaveCount(3);
    await expect(primaryStateStrip).toContainText("Загрузка");
    await expectHealthyPage(page);
  }
});

test("app shell enforces role access and closes notifications on section change", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Сотрудник");

  await expect(page.locator(".quick-action")).toBeDisabled();
  await expect(page.locator(".topbar-access-note")).toContainText("Доступно старшему сотруднику или администратору");
  await expect(page.locator("nav button").filter({ hasText: "Панель" })).toBeDisabled();
  await expect(page.locator("nav button").filter({ hasText: "Audit" })).toBeDisabled();
  await expect(page.locator("nav button").filter({ hasText: "Клиенты" })).toBeEnabled();

  await selectRole(page, "Администратор");
  await page.locator(".quick-action").click();
  await expect(page.locator(".outbound-panel")).toBeVisible();
  await page.locator(".role-switcher select").selectOption({ label: "Сотрудник" }, { force: true });
  await expect(page.locator(".outbound-panel")).toHaveCount(0);
  await expect(page.locator(".quick-action")).toBeDisabled();

  await selectRole(page, "Администратор");
  await page.getByRole("button", { name: "Уведомления" }).click();
  await expect(page.locator(".notification-drawer")).toBeVisible();
  await openSection(page, "Клиенты");
  await expect(page.locator(".notification-drawer")).toHaveCount(0);
  await expectHealthyPage(page);
});

test("clients segment filter and export descriptor are backend backed", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Клиенты");

  const segmentSelect = page.getByLabel("Сегмент клиентов");
  await expect(segmentSelect).toBeEnabled();
  await segmentSelect.selectOption("channel:SDK");
  await expect(page.locator(".clients-table .entity-row")).toHaveCount(2);
  await expect(page.locator(".clients-table")).toContainText("SDK");
  await expect(page.locator(".clients-table")).not.toContainText("Telegram");

  const exportResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/clients/exports") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Экспорт" }).click();
  await expect((await exportResponse).ok()).toBeTruthy();
  await expect(page.locator(".toast")).toContainText("Экспорт клиентов поставлен в очередь");
  await expectHealthyPage(page);
});

test("public landing demo and contact request submit to backend", async ({ page }) => {
  await page.goto("/#/landing", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-public-landing")).toBeVisible({ timeout: 15000 });

  await expect(page.getByRole("button", { name: "Демо по запросу" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Контакт по запросу/ })).toBeEnabled();
  await page.getByRole("button", { name: "Демо по запросу" }).click();
  await expect(page.getByTestId("public-demo-request-dialog")).toBeVisible();

  await page.getByLabel("Имя").fill("Jane Owner");
  await page.getByLabel("Компания").fill("Acme Retail");
  await page.getByLabel("Email").fill("owner@acme.example");
  await page.getByLabel("Сообщение").fill("Need a demo for 20 operators and SDK migration.");
  await page.getByLabel("Согласие на обработку заявки").check();

  const submitResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/public/demo-requests") && response.request().method() === "POST"
  );
  await page.getByTestId("public-demo-request-submit").click();
  const payload = await (await submitResponse).json();
  expect(payload.status).toBe("ok");
  expect(payload.data.leadId).toBeTruthy();
  expect(payload.data.notificationDescriptor.status).toBe("queued");
  await expect(page.locator(".toast")).toContainText("Заявка на демо принята");
  await expectHealthyPage(page);
});

test("shift panel redistribution preview and commit are backend backed", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Панель");

  const previewResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/routing/redistribution/preview") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Перераспределить" }).click();
  expect((await previewResponse).ok()).toBeTruthy();
  await expect(page.getByRole("dialog", { name: "Предпросмотр перераспределения" })).toBeVisible();
  await expect(page.locator(".redistribution-plan")).toContainText("alexey");

  const commitResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/routing/redistribution/commit") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Применить" }).click();
  const commitPayload = await (await commitResponse).json();
  expect(commitPayload.status).toBe("ok");
  expect(commitPayload.data.auditEvent.immutable).toBeTruthy();
  expect(commitPayload.data.appliedAssignments.length).toBeGreaterThan(0);
  await expect(page.locator(".toast")).toContainText("Перераспределение применено");
  await expectHealthyPage(page);
});

test("reports metrics table exposes semantic headers and keyboard column controls", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Отчеты");

  const routingActivityReport = page.getByTestId("routing-activity-report");
  await expect(routingActivityReport).toBeVisible();
  await expect(routingActivityReport).toContainText("Назначения и передачи");
  await expect(routingActivityReport).toContainText("За выбранный период назначений и передач нет.");

  const reportTable = page.getByRole("table", { name: "Показатели отчета" });
  await expect(reportTable).toBeVisible();
  await expect(reportTable.getByRole("columnheader", { name: "Показатель" })).toBeVisible();
  await expect(reportTable.getByRole("columnheader", { name: "Текущий период" })).toBeVisible();
  const newDialogsRow = reportTable.getByRole("row").filter({ hasText: "Новые диалоги" });
  await expect(newDialogsRow.getByRole("rowheader", { name: "Новые диалоги" })).toBeVisible();
  await expect(newDialogsRow).toContainText("0");

  const previousPeriodToggle = page.getByRole("checkbox", { name: "Сравнение" });
  await previousPeriodToggle.focus();
  await expect(previousPeriodToggle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(reportTable.getByRole("columnheader", { name: "Сравнение" })).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(reportTable.getByRole("columnheader", { name: "Сравнение" })).toBeVisible();

  const exportResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/reports/exports") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Экспорт XLSX" }).click();
  const exportPayload = await (await exportResponse).json();
  expect(exportPayload.status).toBe("ok");
  expect(exportPayload.data.job.tenantId).toBeTruthy();

  await page.getByRole("button", { name: "История" }).click();
  await expect(page.getByTestId("report-export-history-panel")).toBeVisible();
  await expect(page.getByTestId("report-export-history-panel")).toContainText("История экспортов");
  await expect(page.getByTestId("report-export-history-panel")).toContainText("evt_report_");

  await expect(page.getByTestId("report-audit-panel")).toBeVisible();
  await expect(page.getByTestId("report-audit-panel")).toContainText("evt_report_");
  await expect(page.getByTestId("report-audit-panel")).toContainText("запись не изменяется");
  await expect(page.getByTestId("report-audit-panel")).toContainText("report_");
  await expect(page.getByTestId("report-audit-panel")).toContainText("metrics/v1");
  await expectHealthyPage(page);
});

test("keyboard navigation exposes focus states and modal trap", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await page.locator(".role-switcher select").blur();

  await page.keyboard.press("Tab");
  const firstFocus = await activeElementSnapshot(page);
  expect(firstFocus.className).toContain("nav-item");
  expect(firstFocus.label).toContain("Диалоги");
  expect(firstFocus.outlineStyle).not.toBe("none");
  expect(firstFocus.outlineWidth).not.toBe("0px");

  for (let step = 0; step < 20; step += 1) {
    const active = await activeElementSnapshot(page);
    if (active.label.includes("Уведомления")) {
      break;
    }
    await page.keyboard.press("Tab");
  }

  await expect(page.getByRole("button", { name: "Уведомления" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".notification-drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".notification-drawer")).toHaveCount(0);

  await page.locator(".quick-action").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Новый исходящий диалог" })).toBeVisible();
  await expect(page.locator(".outbound-panel").getByRole("button", { name: "Закрыть" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".outbound-panel > footer button").filter({ hasText: "Отмена" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".outbound-panel")).toHaveCount(0);
  await expect(page.locator(".quick-action")).toBeFocused();
  await expectHealthyPage(page);
});

test("rescue timer starts from chat action and writes audit", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");

  await page.getByRole("button", { name: "Действия с диалогом" }).click();
  await page.locator(".chat-action-menu button").filter({ hasText: "Запустить спасение" }).click();

  await expect(page.locator(".rescue-timer-chip")).toContainText("Ответить клиенту");
  await expect(page.locator(".queue-tab").filter({ hasText: "Спасти" })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".transcript-filter-buttons button").filter({ hasText: "Audit" }).click();
  await expect(page.locator(".chat-transcript")).toContainText("Запущен rescue timer");
  await page.getByRole("button", { name: "Действия с диалогом" }).click();
  await expect(page.locator(".chat-action-menu button").filter({ hasText: "Запустить спасение" })).toBeDisabled();
  await expectHealthyPage(page);
});

test("conversation queue filters remain actionable", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");

  await page.getByRole("button", { name: "Расширенные фильтры" }).click();
  await expect(page.locator(".queue-filter-panel")).toBeVisible();

  await page.locator('.queue-filter-panel label:has(span:text-is("Канал")) select').selectOption("Telegram");
  await page.locator('.queue-filter-panel label:has(span:text-is("Тематика")) select').selectOption("none");
  await expect(page.locator(".active-filter-chips")).toContainText("Канал: Telegram");
  await expect(page.locator(".active-filter-chips")).toContainText("Без тематики");
  await expect(page.locator(".queue-row")).toHaveCount(1);
  await expect(page.locator(".queue-row")).toContainText("Vladimir B.");
  await expect(page.locator(".queue-row")).not.toContainText("Dmitry S.");
  await page.locator(".queue-filter-check input").check();
  await expect(page.locator(".active-filter-chips")).toContainText("Внутренние комментарии");
  await expect(page.locator(".queue-empty")).toContainText("Нет диалогов");

  await page.locator(".queue-tab").filter({ hasText: "SLA" }).click();
  await expect(page.locator(".queue-tab").filter({ hasText: "SLA" })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".queue-filter-reset").click();
  await expect(page.locator(".active-filter-chips")).toHaveCount(0);
  await expectHealthyPage(page);
});

test("customer panel inserts templates and enforces close topic", async ({ page }) => {
  await seedTenantTemplate(page, {
    channel: "Telegram",
    scope: "shared",
    text: "I understand the wait. I will check the order and return with a clear delivery time.",
    title: "Delivery delay",
    topic: "Product / Mismatch"
  });
  await openAppShell(page);
  await selectRole(page, "Администратор");

  await page.locator(".queue-row").filter({ hasText: "Vladimir B." }).click();
  await expect(page.locator(".customer-panel")).toContainText("Для закрытия укажите тематику");
  await expect(page.locator(".customer-panel .close-button")).toBeDisabled();

  await page.locator('.customer-panel .close-topic:has(span:text-is("Тематика")) select').selectOption({ label: "Товар / Несоответствие" });
  await expect(page.locator(".customer-panel .close-button")).toBeEnabled();
  await expect(page.locator(".bot-handoff-summary")).toContainText("Товар / Несоответствие");

  await page.locator(".customer-panel .template-list button").filter({ hasText: "Delivery delay" }).click();
  await expect(page.locator(".composer textarea")).toHaveValue(/I understand the wait/);
  await page.locator(".customer-panel .close-button").click();
  await expect(page.locator(".customer-panel .close-button")).toContainText("Закрыт");
  await expect(page.locator(".toast")).toContainText("Диалог закрыт и попадет в ежедневный отчет.");
  await expectHealthyPage(page);
});

test("employee role masks phone in chat context", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Сотрудник");

  await expect(page.locator(".chat-identity")).toContainText("+7 *** ***-**-44");
  await expect(page.locator(".chat-identity")).not.toContainText("+7 999 204-18-44");
  await expect(page.locator(".bot-handoff-summary")).toContainText("+7 *** ***-**-44");
  await expect(page.locator(".bot-handoff-summary")).not.toContainText("+7 999 204-18-44");
  await expect(page.locator(".customer-panel")).toContainText("+7 *** ***-**-44");
  await expect(page.locator(".customer-panel")).not.toContainText("+7 999 204-18-44");
  await expectHealthyPage(page);
});

test("outbound SDK dialog can be created from quick actions", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");

  await page.locator(".quick-action").click();
  await expect(page.getByRole("dialog", { name: "Новый исходящий диалог" })).toBeVisible();
  await expect(page.locator(".outbound-panel")).toHaveAttribute("aria-modal", "true");

  const topicSelect = page.locator(".outbound-grid select").nth(1);
  await expect.poll(async () => topicSelect.locator("option").count()).toBeGreaterThan(1);
  await topicSelect.selectOption({ index: 1 });
  await page.locator(".outbound-grid input").first().fill("+7 999 777-66-55");
  await page.locator(".outbound-grid input").nth(1).fill("Тестовый клиент");
  await page.locator(".outbound-message textarea").fill("Здравствуйте! Проверяем исходящий SDK диалог.");
  await page.locator(".outbound-panel > footer button").filter({ hasText: "Создать диалог" }).click();

  await expect(page.locator(".toast")).toContainText("поставлен в очередь");
  await expect(page.locator(".chat-identity")).toContainText("Тестовый клиент");
  await expect(page.locator(".customer-panel")).toContainText("+7 999 777-66-55");
  await expectHealthyPage(page);
});

test("topbar notifications and live bot handoff summary are actionable", async ({ page }) => {
  await page.addInitScript(() => {
    const pushSubscription = {
      toJSON: () => ({
        endpoint: "https://push.playwright.test/subscription/topbar-notifications",
        expirationTime: null,
        keys: {
          auth: "playwright-auth-secret",
          p256dh: "playwright-p256dh-key"
        }
      }),
      unsubscribe: async () => true
    };
    const pushManager = {
      getSubscription: async () => null,
      subscribe: async () => pushSubscription
    };

    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        requestPermission: async () => "granted"
      }
    });
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function PushManager() {}
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: async () => ({ pushManager }),
        register: async () => ({ pushManager })
      }
    });
  });
  const { tenantSession } = await openAppShell(page);
  await page.request.patch("/api/v1/notifications/preferences", {
    data: {
      browserPushEnabled: false,
      browserPushEndpoint: null,
      browserPushPermission: "default",
      browserPushSubscriptionId: null
    },
    headers: {
      authorization: `Bearer ${tenantSession.accessToken}`
    }
  });
  await selectRole(page, "Администратор");

  await expect(page.locator(".bot-handoff-summary")).toContainText("Handoff summary");
  await page.getByRole("button", { name: "Уведомления" }).click();
  const channelErrorsSubscription = page.locator(".notification-settings label").filter({ hasText: "Channel errors" }).locator("input");
  const channelSoundRule = page.locator(".notification-sound-rules label").filter({ hasText: "Ошибки каналов" }).locator("input");
  const emailDigestChannel = page.locator(".notification-external-channels label").filter({ hasText: "Email digest" }).locator("input");
  await expect(channelErrorsSubscription).toBeEnabled();
  await expect(page.locator(".browser-push-card button")).toBeEnabled();
  await expect(channelSoundRule).toBeEnabled();
  await expect(emailDigestChannel).toBeEnabled();
  await ensureCheckboxState(page, channelErrorsSubscription, true);
  await expect(page.locator(".notification-drawer")).toContainText("VK: рост ошибок webhook");
  await page.locator(".notification-filters button").filter({ hasText: "SLA" }).click();
  await expect(page.locator(".notification-list")).toContainText("Владимир Б. без тематики");
  await expect(page.locator(".notification-list")).not.toContainText("Ежедневный отчет готов");
  await page.locator(".notification-filters button").filter({ hasText: "Все" }).click();
  await ensureCheckboxState(page, emailDigestChannel, false);
  await expect(emailDigestChannel).not.toBeChecked();

  const subscriptionUpdate = page.waitForResponse((response) =>
    response.url().includes("/api/v1/notifications/preferences") && response.request().method() === "PATCH"
  );
  await channelErrorsSubscription.click();
  await expect((await subscriptionUpdate).ok()).toBeTruthy();
  await expect(channelErrorsSubscription).not.toBeChecked();

  const externalChannelUpdate = page.waitForResponse((response) =>
    response.url().includes("/api/v1/notifications/preferences") && response.request().method() === "PATCH"
  );
  await emailDigestChannel.click();
  await expect((await externalChannelUpdate).ok()).toBeTruthy();
  await expect(emailDigestChannel).toBeChecked();

  const browserPushPublicKey = page.waitForResponse((response) =>
    response.url().includes("/api/v1/notifications/push-subscriptions/public-key") && response.request().method() === "GET"
  );
  const browserPushSubscription = page.waitForResponse((response) =>
    response.url().includes("/api/v1/notifications/push-subscriptions") && response.request().method() === "POST"
  );
  await page.locator(".browser-push-card button").click();
  await expect((await browserPushPublicKey).ok()).toBeTruthy();
  const browserPushPayload = await (await browserPushSubscription).json();
  expect(browserPushPayload.status).toBe("ok");
  expect(browserPushPayload.data.subscription.id).toBeTruthy();
  expect(browserPushPayload.data.subscription.endpointHash).toMatch(/^sha256:/);
  expect(browserPushPayload.data.auditEvent.immutable).toBeTruthy();
  await expect(page.locator(".notification-test-route")).toBeEnabled();

  const criticalRouteTest = page.waitForResponse((response) =>
    response.url().includes("/api/v1/notifications/test-critical-alert") && response.request().method() === "POST"
  );
  await page.locator(".notification-test-route").click();
  const criticalRoutePayload = await (await criticalRouteTest).json();
  expect(criticalRoutePayload.status).toBe("ok");
  expect(criticalRoutePayload.data.deliveryResults.some((result) =>
    result.type === "browser-push" && result.descriptorId && result.subscriptionId
  )).toBeTruthy();
  await expect(page.locator(".notification-list")).toContainText("Critical alert test");
  await page.locator(".notification-drawer > header button").filter({ hasText: "Все прочитаны" }).click();
  await ensureCheckboxState(page, channelErrorsSubscription, true);
  await expectHealthyPage(page);
});

test("notification navigation actions open concrete workspaces", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");

  await page.getByRole("button", { name: "Уведомления" }).click();
  const vkNotification = page.locator(".notification-item").filter({ hasText: "VK: рост ошибок webhook" });
  await expect(vkNotification.locator("button")).toBeEnabled();
  await vkNotification.locator("button").click();
  await expect(page.locator(".notification-drawer")).toHaveCount(0);
  await expect(page.locator(".channel-connections-panel")).toBeVisible();
  await expect(page.locator(".channel-detail-head")).toContainText("VK main community");

  await page.getByRole("button", { name: "Уведомления" }).click();
  const serviceAdminNotification = page.locator(".notification-item").filter({ hasText: "Service-admin audit export" });
  await expect(serviceAdminNotification.locator("button")).toBeDisabled();
  await expect(page.getByTestId("route-service-admin")).toHaveCount(0);
  await expect(page.locator(".channel-connections-panel")).toBeVisible();
  await expectHealthyPage(page);
});

async function ensureCheckboxState(page, locator, checked) {
  if ((await locator.isChecked()) === checked) {
    return;
  }

  const update = page.waitForResponse((response) =>
    response.url().includes("/api/v1/notifications/preferences") && response.request().method() === "PATCH"
  );
  await locator.click();
  await expect((await update).ok()).toBeTruthy();
  if (checked) {
    await expect(locator).toBeChecked();
  } else {
    await expect(locator).not.toBeChecked();
  }
}

test("composer exposes AI explainability and pre-send quality checks", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");

  await page.locator(".queue-row").filter({ hasText: "Maria K." }).click();
  await page.locator(".ai-explainability summary").click();
  await expect(page.locator(".ai-explainability")).toContainText("Совпадает с тематикой");
  await expect(page.locator(".pre-send-quality")).toContainText("Ответ пустой");

  await page.locator(".composer textarea").fill("Вы сами виноваты, невозможно помочь самостоятельно.");
  await expect(page.locator(".pre-send-quality")).toContainText("Риск формулировки");
  await expect(page.locator(".pre-send-quality")).toContainText("Не указан следующий шаг");

  await page.locator(".inline-ai-card button").filter({ hasText: "Редактировать" }).click();
  await expect(page.locator(".composer textarea")).toHaveValue(/Клиент ждет заказ/);
  await expect(page.locator(".toast")).toContainText("Решение по AI-подсказке сохранено");
  await page.locator(".transcript-filter-buttons button").filter({ hasText: "Audit" }).click();
  await expect(page.locator(".chat-transcript")).toContainText("AI-подсказка открыта на редактирование");
  await expectHealthyPage(page);
});

test("composer save-template modal keeps dialog semantics", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");

  await page.locator(".composer textarea").fill("Проверю заказ и вернусь с точным сроком доставки.");
  await page.locator(".composer-tools button[aria-label='Сохранить как шаблон']").click();

  await expect(page.getByRole("dialog", { name: "Сохранить как шаблон" })).toBeVisible();
  await expect(page.locator(".template-save-panel")).toHaveAttribute("aria-modal", "true");
  await page.locator(".template-save-panel .variable-row button").filter({ hasText: "{client_name}" }).click();
  await expect(page.locator(".template-save-text textarea")).toHaveValue(/client_name/);
  await page.locator(".template-save-panel > footer button").filter({ hasText: "Сохранить шаблон" }).click();
  await expect(page.locator(".toast")).toContainText("Шаблон сохранен");
  await page.locator(".composer-tabs button").filter({ hasText: "Шаблоны" }).click();
  const savedTemplate = page.locator(".composer-template-picker button").filter({ hasText: "Status" }).first();
  await expect(savedTemplate).toContainText("Delivery / Status");
  await savedTemplate.click();
  await expect(page.locator(".composer textarea")).toHaveValue(/Проверю заказ и вернусь с точным сроком доставки/);
  await expectHealthyPage(page);
});

test("composer attachment queue blocks scan-pending backend descriptors", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await page.route("**/*", async (route) => {
    const request = route.request();
    const signedObjectStorageRequest = request.url().includes("X-Amz-")
      && ["OPTIONS", "PUT"].includes(request.method());
    if (!signedObjectStorageRequest) {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: "",
      headers: {
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "PUT, OPTIONS",
        "access-control-allow-origin": "*"
      },
      status: 200
    });
  });

  const uploadResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/dialogs/attachments") && response.request().method() === "POST"
  );
  await page.getByLabel("Выбор вложений").setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("test attachment")
  });
  const uploadResponse = await uploadResponsePromise;
  expect(uploadResponse.ok()).toBeTruthy();
  const uploadPayload = await uploadResponse.json();
  expect(uploadPayload.status).toBe("ok");
  expect(uploadPayload.data.descriptorId).toBeTruthy();
  expect(uploadPayload.data.storageState).toBe("upload_queued");
  expect(uploadPayload.data.uploadPolicy.queue).toBe("file-scan");
  expect(uploadPayload.data.antivirusState).toBe("scan_pending");

  await expect(page.locator(".toast")).toContainText("Вложения добавлены в очередь: 1");
  await expect(page.locator(".attachment-queue")).toContainText("receipt.pdf");
  await expect(page.locator(".attachment-card").filter({ hasText: "receipt.pdf" })).toContainText(
    "Ожидание антивирусной проверки",
    { timeout: 15_000 }
  );
  await expect(page.locator(".send-button")).toBeDisabled();
  await expectHealthyPage(page);
});

test("draft switch warning preserves or discards unsent draft", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");

  await page.getByLabel("Выбор вложений").setInputFiles({
    name: "pending-switch.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("draft switch attachment")
  });
  await expect(page.locator(".attachment-queue")).toContainText("pending-switch.txt");

  await page.locator(".composer textarea").fill("Черновик перед переключением");
  await page.locator(".queue-row").filter({ hasText: "Vladimir B." }).click();

  await expect(page.getByRole("dialog", { name: "Перейти в другой диалог?" })).toBeVisible();
  await expect(page.locator(".draft-switch-panel")).toContainText("Черновик перед переключением");
  await expect(page.locator(".draft-switch-panel")).toContainText("1 в очереди");
  await page.locator(".draft-switch-panel > footer button").filter({ hasText: "Остаться" }).click();
  await expect(page.locator(".draft-switch-panel")).toHaveCount(0);
  await expect(page.locator(".chat-identity")).toContainText("Maria K.");
  await expect(page.locator(".composer textarea")).toHaveValue("Черновик перед переключением");
  await expect(page.locator(".attachment-queue")).toContainText("pending-switch.txt");

  await page.locator(".queue-row").filter({ hasText: "Vladimir B." }).click();
  await expect(page.getByRole("dialog", { name: "Перейти в другой диалог?" })).toBeVisible();
  await page.locator(".draft-switch-panel > footer button").filter({ hasText: "Сбросить и перейти" }).click();
  await expect(page.locator(".draft-switch-panel")).toHaveCount(0);
  await expect(page.locator(".chat-identity")).toContainText("Vladimir B.");
  await expect(page.locator(".composer textarea")).toHaveValue("");
  await expect(page.locator(".attachment-queue")).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("Черновик и очередь вложений сброшены.");
  await expectHealthyPage(page);
});

test("knowledge editor supports article draft status and preview", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Качество");

  await page.locator(".knowledge-row").filter({ hasText: "Delivery tracking" }).click();
  await expect(page.locator(".knowledge-preview")).toContainText("Delivery tracking");

  await page.locator(".knowledge-editor-form input").fill("Delivery tracking v5");
  const knowledgeDraftPromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/knowledge/")
    && response.url().includes("/drafts")
    && response.request().method() === "POST"
  );
  await page.locator(".knowledge-editor-form button").filter({ hasText: "Сохранить" }).click();
  const knowledgeDraftResponse = await knowledgeDraftPromise;
  expect(knowledgeDraftResponse.ok()).toBeTruthy();
  const knowledgeDraftPayload = await knowledgeDraftResponse.json();
  expect(knowledgeDraftPayload.status).toBe("ok");
  expect(knowledgeDraftPayload.data.article.status).toBe("draft");
  expect(knowledgeDraftPayload.data.auditEvent.id).toBeTruthy();
  await expect(page.locator(".toast")).toContainText("черновик сохранен в backend");
  await expect(page.locator(".knowledge-version-list")).toContainText("draft");
  await expect(page.locator(".knowledge-approval-list")).toContainText("Сохранил версию");

  const submitReviewPromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/knowledge/")
    && response.url().includes("/submit-review")
    && response.request().method() === "POST"
  );
  await page.locator(".knowledge-editor-form button").filter({ hasText: "На проверку" }).click();
  const submitReviewResponse = await submitReviewPromise;
  expect(submitReviewResponse.ok()).toBeTruthy();
  const submitReviewPayload = await submitReviewResponse.json();
  expect(submitReviewPayload.status).toBe("ok");
  expect(submitReviewPayload.data.article.status).toBe("review");
  expect(submitReviewPayload.data.approvalDecision.immutable).toBeTruthy();
  await expect(page.locator(".toast")).toContainText("отправлена на проверку");

  await expect(page.locator(".knowledge-preview")).toContainText("Delivery tracking v5");
  await expect(page.locator(".knowledge-preview")).toContainText("review");

  await expect(page.locator(".knowledge-governance-panel").filter({ hasText: "Вложения" }).getByRole("button", { name: /Добавить/ })).toBeEnabled();
  await expect(page.locator(".knowledge-attachment-list")).toContainText("delivery-status-map.pdf");
  const deleteAttachmentPromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/knowledge/")
    && response.url().includes("/attachments/")
    && response.request().method() === "DELETE"
  );
  await page.getByLabel("Удалить delivery-status-map.pdf").click();
  const deleteAttachmentResponse = await deleteAttachmentPromise;
  expect(deleteAttachmentResponse.ok()).toBeTruthy();
  const deleteAttachmentPayload = await deleteAttachmentResponse.json();
  expect(deleteAttachmentPayload.data.auditEvent.action).toBe("knowledge.article.attachment.deleted");
  await expect(page.locator(".knowledge-attachment-list")).not.toContainText("delivery-status-map.pdf");
  await expect(page.locator(".knowledge-channel-picker button").filter({ hasText: "SDK" })).toHaveAttribute("aria-pressed", "true");

  const publishPromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/knowledge/")
    && response.url().includes("/publish")
    && response.request().method() === "POST"
  );
  await page.locator(".knowledge-editor-form button").filter({ hasText: "Опубликовать" }).click();
  const publishResponse = await publishPromise;
  expect(publishResponse.ok()).toBeTruthy();
  const publishPayload = await publishResponse.json();
  expect(publishPayload.data.article.status).toBe("published");
  await expect(page.locator(".toast")).toContainText("опубликована");
  await expect(page.locator(".knowledge-preview")).toContainText("published");

  await page.locator(".knowledge-preview-toolbar button").filter({ hasText: "Self-service" }).click();
  await page.locator(".knowledge-self-service-preview input").fill("delivery");
  await expect(page.locator(".knowledge-widget-results")).toContainText("Delivery tracking v5");
  await expect(page.locator(".knowledge-self-service-preview")).toContainText("Текущая статья доступна клиенту");
  await expect(page.locator(".knowledge-self-service-preview")).toContainText("Написать оператору");
  await expectHealthyPage(page);
});

test("quality AI workspace exposes real-time scoring and coaching", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Качество");

  await expect(page.locator(".ai-quality-workspace")).toContainText("Проверка текста");
  await expect(page.locator(".ai-quality-workspace")).toContainText("Risky wording");
  await expect(page.locator(".ai-effectiveness-grid")).toContainText("Accepted without edits");

  await expect(page.locator(".ai-coaching-list")).toContainText("missing_next_step");

  const draftScorePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/quality/draft-score") && response.request().method() === "POST"
  );
  await page.locator(".ai-coaching-card button").filter({ hasText: "Проверить черновик" }).click();
  const draftScoreResponse = await draftScorePromise;
  expect(draftScoreResponse.ok()).toBeTruthy();
  const draftScorePayload = await draftScoreResponse.json();
  expect(draftScorePayload.status).toBe("ok");
  expect(draftScorePayload.data.score).toBeGreaterThan(0);
  expect(draftScorePayload.data.telemetry.auditId).toBeTruthy();
  const scoredCard = page.locator(".ai-coaching-card").filter({ hasText: "missing_next_step" });
  await expect(scoredCard).toContainText(`${draftScorePayload.data.score}/100`);
  await expect(scoredCard).toContainText(draftScorePayload.data.telemetry.auditId);
  await expect(page.locator(".toast")).toContainText("Проверка по правилам: missing_next_step");

  const batchScorePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/quality/draft-scores") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Проверить текст" }).click();
  const batchScoreResponse = await batchScorePromise;
  expect(batchScoreResponse.ok()).toBeTruthy();
  const batchScorePayload = await batchScoreResponse.json();
  expect(batchScorePayload.status).toBe("ok");
  expect(batchScorePayload.data.telemetry.auditId).toBeTruthy();
  await expect(page.locator(".toast")).toContainText("Проверка по правилам сохранена");

  await page.getByRole("button", { name: "Низкие оценки" }).click();
  const lowScoreRow = page.locator(".quality-row").filter({ hasText: "client-vladimir" });
  await expect(lowScoreRow).toBeVisible();
  await lowScoreRow.getByRole("button", { name: "Проверить", exact: true }).click();
  const reviewForm = lowScoreRow.locator(".qa-review-form");
  await expect(reviewForm).toBeVisible();
  const manualReviewPromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/quality/manual-reviews") && response.request().method() === "POST"
  );
  await reviewForm.getByRole("button", { name: "Сохранить проверку" }).click();
  const manualReviewResponse = await manualReviewPromise;
  expect(manualReviewResponse.ok()).toBeTruthy();
  const manualReviewPayload = await manualReviewResponse.json();
  expect(manualReviewPayload.status).toBe("ok");
  expect(manualReviewPayload.data.reviewId).toBeTruthy();
  expect(manualReviewPayload.data.auditId).toBeTruthy();
  await expect(page.locator(".toast")).toContainText("Ручная проверка сохранена");
  await expect(lowScoreRow).toContainText("Проверено");
  await expectHealthyPage(page);
});

test("bot builder supports canonical nodes and import validation", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Боты");

  // BAI-810: консоль сценария с вкладками — паспорт, результаты, версии.
  await expect(page.locator(".scenario-console")).toBeVisible();
  await expect(page.locator(".scenario-passport-grid")).toContainText("Когда запускается");
  await page.locator(".scenario-console-head .segmented-control button", { hasText: "Результаты" }).click();
  await expect(page.locator(".scenario-ops-panel")).toContainText("Эксплуатация сценария");
  await page.locator(".scenario-console-head .segmented-control button", { hasText: "Обзор" }).click();

  await page.locator(".bot-mode-toggle input[type='checkbox']").check();
  await expect(page.locator(".bot-builder-panel")).toBeVisible();
  await expect(page.locator(".bot-flow-node")).toHaveCount(3);
  for (const label of ["Сообщение", "Запрос контакта", "Handoff"]) {
    await expect(page.locator(".bot-flow-canvas")).toContainText(label);
  }

  await page.locator(".bot-node-editor input").first().fill("Backend saved node");
  await page.locator(".bot-node-editor button").filter({ hasText: "Сохранить" }).click();
  await expect(page.locator(".toast")).toContainText("сценарий сохранен на backend");
  await expect(page.locator(".bot-flow-node.selected")).toContainText("Backend saved node");

  // Import runs before publish: published scenarios are edit-locked by lifecycle governance.
  const exportValue = await page.locator(".bot-io-panel textarea").first().inputValue();
  const payload = JSON.parse(exportValue);
  expect(payload.schemaVersion).toBe("bot-flow/v1");
  expect(payload.flowEdges.length).toBeGreaterThan(0);

  await page.locator(".bot-io-panel textarea").nth(1).fill('{"name":"Broken","flowNodes":[{"id":"bad","type":"bad_type"}]}');
  await page.locator(".bot-io-panel button").filter({ hasText: "Импорт" }).click();
  await expect(page.locator(".bot-import-error")).toContainText("валидными type");

  payload.name = "Импортированный сценарий";
  payload.flowNodes[0].title = "Импортированная нода";
  await page.locator(".bot-io-panel textarea").nth(1).fill(JSON.stringify(payload));
  await page.locator(".bot-io-panel button").filter({ hasText: "Импорт" }).click();
  await expect(page.locator(".toast")).toContainText("сохранен на backend");
  await expect(page.locator(".bot-builder-panel .section-title")).toContainText("Импортированный сценарий");
  await expect(page.locator(".bot-flow-node.selected")).toContainText("Импортированная нода");

  const publishPromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/automation/bot-scenarios/")
    && response.url().includes("/publish")
    && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  const publishDialog = page.getByRole("dialog", { name: /Публикация/ });
  await expect(publishDialog).toBeVisible();
  await publishDialog.getByRole("button", { name: "Опубликовать", exact: true }).click();
  const publishResponse = await publishPromise;
  expect(publishResponse.ok()).toBeTruthy();
  const publishPayload = await publishResponse.json();
  expect(publishPayload.status).toBe("ok");
  expect(publishPayload.data.auditId).toBeTruthy();
  expect(publishPayload.data.runtimeVersion).toMatch(/^runtime-/);
  expect(publishPayload.data.versionState).toBe("published");
  await expect(page.locator(".toast")).toContainText("опубликован: runtime-");

  // BAI-812: правки опубликованного сценария копятся в черновике следующей версии.
  await page.locator(".scenario-console-head .segmented-control button", { hasText: "Настройка" }).click();
  await expect(page.locator(".scenario-settings-note").first()).toContainText("черновик");
  await page.locator(".scenario-settings-form input[type='text']").first().fill("Импортированный сценарий v2");
  await page.getByRole("button", { name: "Сохранить черновик изменений" }).click();
  await expect(page.locator(".toast")).toContainText("черновик");
  await expect(page.locator(".scenario-console-badges")).toContainText("неопубликованные изменения");
  await page.locator(".scenario-console-head .segmented-control button", { hasText: "Обзор" }).click();
  await page.getByRole("button", { name: "Отменить изменения" }).click();
  await expect(page.locator(".toast")).toContainText("отменён");
  await expect(page.locator(".scenario-console-badges")).not.toContainText("неопубликованные изменения");

  // BAI-813: вкладка версий показывает активную версию публикации.
  await page.locator(".scenario-console-head .segmented-control button", { hasText: "Версии" }).click();
  await expect(page.locator(".scenario-version-list")).toContainText("активная");

  // BAI-804: живой тест-чат — сообщение проходит настоящий runtime в изолированной sandbox-сессии.
  await page.getByRole("button", { name: "Тест-чат" }).click();
  const sandboxTurnPromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/automation/bot-scenarios/")
    && response.url().includes("/sandbox-sessions/")
    && response.url().includes("/messages")
    && response.request().method() === "POST"
  );
  await page.locator(".sandbox-composer input").fill("Здравствуйте, подскажите статус заказа");
  await page.locator(".sandbox-composer button[type='submit']").click();
  const sandboxTurnResponse = await sandboxTurnPromise;
  expect(sandboxTurnResponse.ok()).toBeTruthy();
  const sandboxTurnPayload = await sandboxTurnResponse.json();
  expect(sandboxTurnPayload.status).toBe("ok");
  expect(sandboxTurnPayload.data.session.id).toMatch(/^sbx_/);
  expect(sandboxTurnPayload.data.turn.trace).toBeTruthy();
  await expect(page.locator(".sandbox-bubble--client")).toContainText("статус заказа");
  await expect(page.locator(".sandbox-bubble--bot, .sandbox-event").first()).toBeVisible();
  await page.locator(".sandbox-trace > button").first().click();
  await expect(page.locator(".sandbox-trace-details")).toContainText("Шаг");
  await page.getByRole("button", { name: "Сохранить как проверку" }).click();
  await expect(page.locator(".toast")).toContainText("проверочный набор");
  await page.getByRole("button", { name: "Начать заново" }).click();
  await expect(page.locator(".sandbox-chat-empty")).toBeVisible();
  await expectHealthyPage(page);
});

test("scenario wizard keeps keyboard focus, aria steps and responsive layout", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await openAppShell(page);
    await selectRole(page, "Администратор");
    await openSection(page, "Боты");

    await expect(page.locator(".scenario-list-panel")).toBeVisible();
    await expect(page.locator(".scenario-console")).toBeVisible();
    await expectNoElementOverflow(page, ".automation-layout--console");
    await expectNoElementOverflow(page, ".scenario-console");

    // The wizard intentionally restores an unfinished draft (including the step),
    // so reset the persisted draft to observe the first step on every viewport.
    await page.evaluate(() => sessionStorage.removeItem("bot-scenario-wizard-draft-v1"));
    await page.getByRole("button", { name: "Создать в мастере" }).click();
    const wizard = page.getByRole("dialog", { name: "Мастер создания сценария" });
    await expect(wizard).toBeVisible();
    await expect(wizard).toHaveAttribute("aria-modal", "true");
    await expect(wizard.locator(".scenario-wizard-progress [role='progressbar']")).toHaveAttribute("aria-valuenow", "1");
    await expect(wizard.locator(".scenario-wizard-progress li[aria-current='step']")).toContainText("Задача");

    await wizard.getByRole("radio", { name: /Ответить на частый вопрос/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(wizard.getByRole("radio", { checked: true })).toContainText("Собрать данные для обращения");

    await wizard.getByRole("button", { name: "Далее" }).click();
    await expect(wizard.locator("#scenario-wizard-step-trigger")).toBeFocused();
    await expect(wizard.locator(".scenario-wizard-progress [role='progressbar']")).toHaveAttribute("aria-valuenow", "2");

    await page.keyboard.press("Escape");
    await expect(wizard).toHaveCount(0);
    await expectHealthyPage(page);
  }
});

test("audit screen filters events and exposes event detail", async ({ page }) => {
  const { serviceAdminSession } = await openAppShell(page, { serviceAdmin: true });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  const auditReason = "Smoke audit seed event for screen filters";
  const auditSeedResponse = await page.request.post("/api/v1/service-admin/users/usr-volga-admin/mfa/reset", {
    data: {
      confirmed: true,
      reason: auditReason
    },
    headers: {
      authorization: `Bearer ${serviceAdminSession.accessToken}`
    }
  });
  expect(auditSeedResponse.ok()).toBeTruthy();
  const auditSeedPayload = await auditSeedResponse.json();
  expect(auditSeedPayload.status).toBe("ok");
  const seededAuditEvent = auditSeedPayload.data.auditEvent;
  const seededAuditId = seededAuditEvent.id;
  expect(seededAuditEvent.immutable).toBeTruthy();
  expect(seededAuditEvent.tenantId).toBe("tenant-volga");
  expect(seededAuditEvent.userId).toBe("usr-volga-admin");
  expect(seededAuditEvent.traceId).toBeTruthy();

  await selectRole(page, "Администратор");
  await openSection(page, "Audit");

  await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();
  await page.locator(".product-actions select").selectOption("30 дней");
  await expect.poll(async () => page.locator(".audit-log-row").count()).toBeGreaterThan(0);
  await page.getByLabel("Поиск audit").fill(seededAuditId);
  await expect(page.locator(".audit-log-row")).toHaveCount(1);
  await expect(page.locator(".audit-event-detail")).toContainText(seededAuditId);
  await expect(page.locator(".audit-event-detail")).toContainText(auditReason);
  await page.getByRole("button", { name: "JSON" }).click();
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain(seededAuditId);
  await expect(page.locator(".toast")).toContainText("JSON события скопирован");
  await page.locator(".audit-event-detail footer button").filter({ hasText: "Открыть объект" }).click();
  await expect(page.getByTestId("audit-related-object-panel")).toBeVisible();
  await expect(page.getByTestId("audit-related-object-panel")).toContainText("usr-volga-admin");
  await expect(page.getByTestId("audit-related-object-panel")).toContainText(seededAuditId);
  await expect(page.getByTestId("audit-related-object-panel")).toContainText("tenant-volga");
  await expect(page.getByTestId("audit-related-object-panel")).toContainText(seededAuditEvent.traceId);
  await expect(page.getByTestId("audit-related-object-panel")).toContainText("immutable");
  await page.locator(".product-actions button").filter({ hasText: "Экспорт CSV" }).click();
  await expect(page.locator(".toast")).toContainText("Audit export:");
  await selectRole(page, "Сотрудник");
  await expect(page.locator(".audit-log-row")).toHaveCount(0);
  await expect(page.locator("nav button").filter({ hasText: "Audit" })).toBeDisabled();
  await expect(page.locator(".conversation-list")).toBeVisible();
  await expectHealthyPage(page);
});

test("settings expose webhooks api keys and security controls", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");

  await page.locator("#settings-tab-api").click();
  await expect(page.locator(".api-governance-panel")).toContainText("Webhooks / API keys");
  const productionKey = page.locator(".api-key-card").filter({ hasText: "Production SDK key" });
  if (await productionKey.count()) {
    await productionKey.locator("button").click();
    await expect(productionKey).toContainText("Rotation queued");
    await expect(page.locator(".toast")).toContainText("prod-key");
  } else {
    await expect(page.locator(".api-governance-panel")).toContainText("Webhook endpoints");
  }

  const vkWebhook = page.locator(".webhook-endpoint").filter({ hasText: "VK inbound" });
  if (await vkWebhook.count()) {
    await vkWebhook.click();
    await expect(page.locator(".webhook-detail")).toContainText("HMAC SHA-256");
    await page.locator(".webhook-delivery-row").filter({ hasText: "signature_failed" }).locator("button").click();
    await expect(page.locator(".webhook-delivery-row").filter({ hasText: "message_new" })).toContainText("replay_queued");
    await expect(page.locator(".toast")).toContainText("повтор доставки поставлен в очередь");
  } else {
    await expect(page.locator(".webhook-detail")).toContainText("Webhook endpoints");
  }
  await expectNoElementOverflow(page, ".admin-workspace-layout");
  await expectNoElementOverflow(page, ".api-governance-panel");
  await expectNoElementOverflow(page, ".webhook-workspace");

  await page.locator("#settings-tab-security").click();
  await expect(page.locator(".security-controls-panel")).toContainText("Security controls");
  await expect(page.locator(".backend-integration-panel")).toContainText("Backend integration");
  await expect(page.locator("[data-service-id='reportService']")).toContainText("exportReport");
  await expect(page.locator("[data-service-id='clientService']")).toContainText("updateClient");
  await expect(page.locator("[data-service-id='auditService']")).toContainText("redactAuditEvent");

  await page.locator(".security-session-row").filter({ hasText: "Сервисный ключ" }).locator("button").click();
  await expect(page.locator(".security-session-row").filter({ hasText: "Сервисный ключ" })).toContainText("Отозвана");
  await expect(page.locator(".toast")).toContainText("Аудит безопасности");
  await expectNoElementOverflow(page, ".admin-workspace-layout");
  await expectNoElementOverflow(page, ".backend-integration-panel");
  await expectNoElementOverflow(page, ".security-controls-panel");

  await selectRole(page, "Старший сотрудник");
  await page.locator("#settings-tab-security").click();
  await expect(page.locator(".admin-locked-panel")).toContainText("Админские настройки скрыты");
  await expect(page.locator(".api-governance-panel")).toHaveCount(0);
  await expect(page.locator(".backend-integration-panel")).toHaveCount(0);
  await expect(page.locator(".security-controls-panel")).toHaveCount(0);
  await expect(page.locator(".product-screen")).not.toContainText("sk_test_****_44ST");
  await expect(page.locator(".product-screen")).not.toContainText("https://api.support.local/webhooks/vk");
  await expect(page.locator(".product-screen")).not.toContainText("185.17.32.90");
  await expectHealthyPage(page);
});

test("settings access panel keeps role matrix and channel limit permissions", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");

  await expect(page.locator(".role-mode-panel")).toContainText("Полный доступ к общим настройкам");
  await expect(page.locator(".role-table")).toContainText("Администратор");
  await expect(page.locator(".role-table")).toContainText("Все");

  const telegramChannel = page.locator(".channel-settings article").filter({ hasText: "Telegram" });
  await expect(telegramChannel.locator("input")).toBeDisabled();

  const telegramToggle = telegramChannel.locator(".toggle-button");
  await expect(telegramToggle).toHaveAttribute("aria-pressed", "true");
  await expect(telegramToggle).toBeEnabled();
  await telegramToggle.click();
  await expect(telegramToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".toast")).toContainText("Telegram");
  await expect(page.locator(".toast")).toContainText("audit");
  await telegramToggle.click();
  await expect(telegramToggle).toHaveAttribute("aria-pressed", "true");

  await page.locator(".role-mode-panel .segmented-control button").filter({ hasText: "Старший сотрудник" }).click();
  await expect(page.locator(".role-mode-panel")).toContainText("Общие настройки доступны только на чтение");
  await expect(telegramChannel.locator("input")).toBeDisabled();
  await expect(telegramToggle).toBeDisabled();
  await expectNoElementOverflow(page, ".settings-layout");
  await expectHealthyPage(page);
});

test("settings employee management preserves edit and role permissions", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");
  await page.locator(".settings-subnav button").filter({ hasText: "Сотрудники" }).click();

  const employeePanel = page.locator(".employee-rules-panel");
  await expect(employeePanel).toContainText("Сотрудники и роли");
  await expect(employeePanel).toContainText("Sergey Markin");
  await employeePanel.getByLabel("Поиск сотрудника").fill("Sergey");
  await expect(employeePanel.locator("[data-employee-id='usr-volga-admin']")).toBeVisible();
  await expect(employeePanel.locator("[data-employee-id='usr-ns-owner']")).toHaveCount(0);
  await employeePanel.locator("[data-employee-id='usr-volga-admin']").click();

  await employeePanel.locator(".employee-editor-grid select").first().selectOption({ label: "Старший сотрудник" });
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Sergey Markin" })).toContainText("Старший сотрудник");
  await employeePanel.locator(".employee-editor-grid select").nth(1).selectOption({ label: "VIP support" });
  await employeePanel.locator(".employee-editor-grid input").fill("14");
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Sergey Markin" })).toContainText("14 чатов");
  await employeePanel.locator(".employee-channel-editor label").filter({ hasText: "SDK" }).locator("input").check();
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Sergey Markin" })).toContainText("SDK");
  await employeePanel.locator(".employee-permission-toggles label").filter({ hasText: "Override" }).locator("input").uncheck();
  await employeePanel.locator(".employee-permission-toggles label").filter({ hasText: "Чувствительные" }).locator("input").uncheck();
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Sergey Markin" })).toContainText("без override");
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Sergey Markin" })).toContainText("данные маскированы");
  await employeePanel.locator(".employee-editor footer button").filter({ hasText: "Сохранить" }).click();
  await expect(page.locator(".toast")).toContainText("Sergey Markin: настройки сохранены.");

  await employeePanel.locator(".employee-editor-grid select").first().selectOption({ label: "Администратор" });
  await employeePanel.locator(".employee-editor-grid select").nth(1).selectOption({ label: "Administrators" });
  await employeePanel.locator(".employee-editor-grid input").fill("20");
  await employeePanel.locator(".employee-permission-toggles label").filter({ hasText: "Override" }).locator("input").check();
  await employeePanel.locator(".employee-permission-toggles label").filter({ hasText: "Чувствительные" }).locator("input").check();
  await employeePanel.locator(".employee-editor footer button").filter({ hasText: "Сохранить" }).click();
  await expect(page.locator(".toast")).toContainText("Sergey Markin: настройки сохранены.");

  await page.locator(".role-mode-panel .segmented-control button").filter({ hasText: "Старший сотрудник" }).click();
  await expect(employeePanel.locator(".employee-editor-grid select").first()).toBeDisabled();
  await expect(employeePanel.locator(".employee-editor-grid input")).toBeDisabled();
  await expect(employeePanel.locator(".employee-channel-editor label").filter({ hasText: "VK" }).locator("input")).toBeDisabled();
  await expect(employeePanel.locator(".employee-editor footer button").filter({ hasText: "Сохранить" })).toBeDisabled();
  await expect(employeePanel.locator(".employee-editor header button").filter({ hasText: "Сбросить пароль" })).toBeEnabled();
  await expectNoElementOverflow(page, ".employee-rules-panel");
  await expectHealthyPage(page);
});

test("settings channel connections create multiple Telegram and MAX instances", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");

  const channelPanel = page.locator(".channel-connections-panel");
  const runId = Date.now().toString(36);
  const telegramName = `Telegram QA bot ${runId}`;
  const maxName = `MAX QA bot ${runId}`;
  await expect(channelPanel.locator(".connection-row.connection-picker").filter({ hasText: "Support main bot" })).toHaveCount(0);
  await expect(channelPanel.locator(".connection-row.connection-picker").filter({ hasText: "VIP bot" })).toHaveCount(0);
  await expect(channelPanel.locator(".connection-row.connection-picker").filter({ hasText: "MAX Business beta" })).toHaveCount(0);
  await expect(channelPanel.locator(".connection-row.connection-picker").filter({ hasText: "MAX backup webhook" })).toHaveCount(0);

  const createForm = channelPanel.locator(".channel-create-form");
  const createFormField = (label) => createForm.locator(`label:has(span:text-is("${label}"))`);
  const routingQueueSelect = createFormField("Очередь").locator("select");
  await expect.poll(async () => routingQueueSelect.locator("option").count()).toBeGreaterThan(0);
  if (await routingQueueSelect.locator("option[value='']").count()) {
    await channelPanel.getByLabel("Название новой очереди").fill(`QA queue ${runId}`);
    await channelPanel.getByRole("button", { name: "Создать очередь" }).click();
    await expect(page.locator(".toast")).toContainText("очередь создана");
    await expect.poll(async () => routingQueueSelect.locator("option:not([value=''])").count()).toBeGreaterThan(0);
  }

  await createFormField("Тип").locator("select").selectOption("telegram");
  await createFormField("Название").locator("input").fill(telegramName);
  await createFormField("Среда").locator("select").selectOption("sandbox");
  await routingQueueSelect.selectOption({ index: 0 });
  await createFormField("Лимит чатов").locator("input").fill("9");
  await createFormField("Секрет или token").locator("input").fill("900001:qa-telegram-token-smoke");
  await createForm.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(channelPanel.locator(".connection-row.connection-picker").filter({ hasText: telegramName })).toBeVisible();
  await expect(page.locator(".toast")).toContainText(`${telegramName}: подключение создано.`);

  await createFormField("Тип").locator("select").selectOption("max");
  await createFormField("Название").locator("input").fill(maxName);
  await createFormField("Лимит чатов").locator("input").fill("7");
  await createFormField("Секрет или token").locator("input").fill("qa-max-token");
  await createForm.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(channelPanel.locator(".connection-row.connection-picker").filter({ hasText: maxName })).toBeVisible();
  await expect(page.locator(".toast")).toContainText(`${maxName}: подключение создано.`);

  await channelPanel.locator(".connection-row.connection-picker").filter({ hasText: telegramName }).click();
  await channelPanel.locator(".channel-test-grid label").filter({ hasText: "Адресат" }).locator("input").fill("+7 900 123-45-67");
  await channelPanel.locator(".channel-test-message textarea").fill("Проверка Telegram QA bot");
  await channelPanel.locator(".channel-test-grid button").filter({ hasText: "Запустить" }).click();
  await expect(channelPanel.locator(".channel-test-result")).toContainText("accepted_to_queue");
  await expect(page.locator(".toast")).toContainText(`${telegramName}: тест выполнен.`);

  await page.locator(".role-mode-panel .segmented-control button").filter({ hasText: "Старший сотрудник" }).click();
  await expect(channelPanel.locator(".connection-row.connection-picker").filter({ hasText: telegramName })).toBeEnabled();
  await expect(channelPanel.locator(".channel-test-grid button").filter({ hasText: "Запустить" })).toBeDisabled();
  await expect(channelPanel.locator(".channel-detail-head button").filter({ hasText: "Проверить" })).toBeDisabled();
  await expectNoElementOverflow(page, ".channel-connections-panel");
  await expectHealthyPage(page);
});

test("settings sdk console keeps payload preview run states and permissions", async ({ page }) => {
  await openAppShell(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");

  const sdkPanel = page.locator(".sdk-console");
  await sdkPanel.locator(".sdk-code button").filter({ hasText: "Копировать" }).click();
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain("SupportSDK.init");
  await expect(page.locator(".toast")).toContainText("SDK snippet скопирован");
  await sdkPanel.getByLabel("Событие").selectOption("identifyUser");
  await sdkPanel.getByLabel("Канал").selectOption("VK");
  await sdkPanel.getByLabel("Окружение").selectOption("stage");
  await sdkPanel.getByLabel("User ID").fill("gig-test-100");
  await sdkPanel.getByLabel("Телефон").fill("");
  await sdkPanel.locator(".sdk-message-field textarea").fill("");
  await expect(sdkPanel.locator(".sdk-payload-preview")).toContainText('"appId": "gig-app-stage"');
  await expect(sdkPanel.locator(".sdk-payload-preview")).toContainText('"channel": "VK"');
  await expect(sdkPanel.locator(".sdk-payload-preview")).toContainText('"userId": "gig-test-100"');

  await sdkPanel.locator(".sdk-playground-actions button").filter({ hasText: "Запустить событие" }).click();
  await expect(sdkPanel.locator(".sdk-playground-actions")).toContainText("Payload не прошел валидацию");

  await sdkPanel.getByLabel("Телефон").fill("+7 900 333-22-11");
  await sdkPanel.locator(".sdk-playground-actions button").filter({ hasText: "Запустить событие" }).click();
  await expect(sdkPanel.locator(".sdk-playground-actions")).toContainText("Payload принят тестовым стендом");
  await expect(sdkPanel.locator(".sdk-payload-preview")).toContainText('"entryPoint": "VK"');
  await expect(page.locator(".toast")).toContainText("SDK playground: identifyUser выполнен в stage.");

  await page.locator(".role-mode-panel .segmented-control button").filter({ hasText: "Старший сотрудник" }).click();
  await expect(sdkPanel.locator(".sdk-code button").filter({ hasText: "Копировать" })).toBeDisabled();
  await expect(sdkPanel.locator(".sdk-playground-actions button").filter({ hasText: "Запустить событие" })).toBeDisabled();
  await expect(sdkPanel.getByLabel("Событие")).toBeDisabled();
  await expect(sdkPanel.locator(".sdk-event-list")).toContainText("identifyUser");
  await expectNoElementOverflow(page, ".sdk-console");
  await expectHealthyPage(page);
});

test("critical sections do not overflow responsive viewports", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await openAppShell(page);
    await selectRole(page, "Администратор");

    for (const section of ["Отчеты", "Боты", "Визиты", "Качество", "Audit", "Настройки"]) {
      await openSection(page, section);
      await expectHealthyPage(page);
    }
  }
});

test("route namespaces keep public auth and service admin isolated", async ({ page }) => {
  await page.goto("/#/landing");
  await expect(page.getByTestId("route-public-landing")).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.locator(".conversation-list")).toHaveCount(0);
  await expect(page.locator(".public-page")).toContainText("Support Communication");
  await expectHealthyPage(page);

  await page.getByRole("button", { name: "Войти" }).first().click();
  await expect(page.getByTestId("route-auth-login")).toBeVisible();
  await expect(page.locator(".auth-page")).toContainText("Support Communication");
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expectHealthyPage(page);

  await openAppShell(page);
  await selectRole(page, "Администратор");
  await expect(page.locator(".role-switcher select")).not.toContainText("Администратор сервиса");
  await expect(page.locator(".service-admin-entry")).toHaveCount(0);

  await page.goto("/service-admin/login");
  await expect(page.getByTestId("route-service-admin-login")).toBeVisible();
  await expect(page.locator(".role-switcher")).toHaveCount(0);
  await expectHealthyPage(page);
});

test("auth flow covers login 2fa recovery invite and organization selection", async ({ page }) => {
  await page.goto("/#/login");
  await expect(page.getByTestId("route-auth-login")).toBeVisible();

  await page.locator(".auth-input-with-icon input").first().fill("multi@example.com");
  await page.locator("input[type='password']").fill("correct-password");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.locator(".auth-organization-list")).toBeVisible();
  await page.locator(".auth-organization-list button").filter({ hasText: "Lumen Health" }).click();
  await page.locator(".auth-flow-footer .auth-primary-button").click();
  await expect(page.getByTestId("route-app-shell")).toBeVisible();
  await expect(page.locator(".toast")).toContainText("Lumen Health");

  await page.goto("/#/login");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await page.locator(".auth-field").filter({ hasText: "Email" }).locator("input").fill("nikolai@lumen.example");
  await page.locator(".auth-field").filter({ hasText: "Invite code" }).locator("input").fill("expired-token");
  await page.locator("input[type='password']").fill("correct-password");
  await page.getByRole("button", { name: "Активировать приглашение" }).click();
  await expect(page.locator(".auth-state-panel")).toContainText("Старый invite token");
  await page.getByRole("button", { name: "Начать onboarding" }).click();
  await expect(page.getByTestId("route-onboarding")).toBeVisible();

  await page.goto("/#/login");
  await page.getByRole("button", { name: "Login" }).click();
  await page.locator(".auth-input-with-icon input").first().fill("sergey@volga.example");
  await page.locator("input[type='password']").fill("correct-password");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByTestId("route-app-shell")).toBeVisible();
  await expectHealthyPage(page);
});

test("onboarding completes tenant setup and returns to app", async ({ page }) => {
  await page.goto("/#/onboarding");
  await expect(page.getByTestId("route-onboarding")).toBeVisible();

  await page.locator(".onboarding-field").filter({ hasText: "Название организации" }).locator("input").fill("QA Retail");
  await page.getByRole("button", { name: "Сгенерировать" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.locator(".onboarding-field").filter({ hasText: "Имя" }).locator("input").fill("QA Admin");
  await page.locator(".onboarding-field").filter({ hasText: "Email" }).locator("input").fill("admin@qa.example");
  await page.locator(".onboarding-field").filter({ hasText: "Пароль" }).locator("input").fill("correct-password");
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.locator(".onboarding-employee-form input").first().fill("operator@qa.example");
  await page.locator(".onboarding-employee-form button").click();
  await expect(page.locator(".onboarding-employee-list")).toContainText("operator@qa.example");
  await page.getByRole("button", { name: "Завершить" }).click();
  await expect(page.getByTestId("route-app-shell")).toBeVisible();
  await expect(page.locator(".toast")).toContainText("QA Retail");
  await expectHealthyPage(page);
});

test("dialog assignment persists from the responsive operator workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAppShell(page);
  await selectRole(page, "Администратор");

  await expect(page.locator(".chat-header")).toContainText("Не назначен");
  await page.getByRole("button", { name: "Назначить оператора" }).click();
  const assignmentPanel = page.getByTestId("dialog-assignment-panel");
  await expect(assignmentPanel).toBeVisible();
  await expect(assignmentPanel.getByLabel("Оператор")).toHaveValue("usr-volga-admin");
  await expectNoElementOverflow(page, "[data-testid='dialog-assignment-panel']");

  await assignmentPanel.getByLabel("Причина назначения").fill("Назначение из рабочего интерфейса");
  const assignmentResponse = page.waitForResponse((response) => (
    response.url().includes("/api/v1/dialogs/maria/assignment")
      && response.request().method() === "PATCH"
  ));
  await assignmentPanel.getByRole("button", { name: "Подтвердить назначение" }).click();
  const assignmentPayload = await (await assignmentResponse).json();

  expect(assignmentPayload.status).toBe("ok");
  expect(assignmentPayload.data.action).toBe("assignment");
  expect(assignmentPayload.data.analyticsEventId).toMatch(/^analytics_assignment_/);
  await expect(assignmentPanel).toHaveCount(0);
  await expect(page.locator(".chat-header")).toContainText("Sergey Markin");
  await expect(page.locator(".status-select-inline select")).toHaveValue("assigned");
  await expectHealthyPage(page);
});

test("service admin critical actions require reason confirmation and audit", async ({ page }) => {
  await openServiceAdminShell(page);

  await page.locator(".service-admin-tabs button").filter({ hasText: "Пользователи" }).click();
  await expect(page.locator(".user-support-workspace")).toContainText("Личность клиента");
  await page.getByLabel("Фильтр по организации").selectOption({ label: "Volga Logistics" });
  const userButton = page.locator(".service-admin-user-list button").filter({ hasText: "sergey@volga.example" });
  await expect(userButton).toBeVisible({ timeout: 15000 });
  await userButton.click();
  await expect(page.locator(".service-admin-detail-panel")).toContainText("Volga Logistics");
  await page.locator(".service-admin-action-box textarea").fill("Клиент согласовал проверку повторов вебхуков");
  await page.locator(".service-admin-action-picker button").filter({ hasText: "Войти от имени" }).click();
  await page.locator(".user-support-workspace .service-admin-confirm input").check();
  await page.locator(".user-support-workspace .service-admin-action-box footer button").click();
  await expect(page.locator(".service-admin-impersonation")).toContainText("только чтение");
  await expect(page.locator(".service-admin-feedback")).toContainText("Вход от имени пользователя");

  await page.locator(".service-admin-impersonation button").click();
  await expect(page.locator(".service-admin-impersonation")).toHaveCount(0);
  await expect(page.locator(".service-admin-feedback")).toContainText("Выход из режима доступа");

  await page.locator(".service-admin-tabs button").filter({ hasText: "Биллинг" }).click();
  await page.locator(".service-admin-tenant-list button").filter({ hasText: "Volga Logistics" }).click();
  await page.locator(".tariff-card-grid button").filter({ hasText: "Starter" }).click();
  await page.locator(".billing-workspace textarea").fill("QA проверка влияния понижения тарифа");
  await page.locator(".billing-workspace button").filter({ hasText: "Предпросмотр" }).click();
  await expect(page.locator(".service-admin-preview")).toContainText("Согласование");
  await page.locator(".billing-workspace input").fill("CHANGE tenant-volga TO starter");
  await page.locator(".billing-workspace button").filter({ hasText: "Применить" }).click();
  await expect(page.locator(".service-admin-feedback")).toContainText("Изменение тарифа");

  await page.locator(".service-admin-tabs button").filter({ hasText: "Аудит" }).click();
  await expect(page.locator(".audit-workspace")).toContainText("Вход от имени пользователя");
  await expect(page.locator(".audit-workspace")).toContainText("Изменение тарифа");
  await expectHealthyPage(page);
});

test("stale local tenant tokens do not open the workspace", async ({ page }) => {
  await page.goto("/#/app");
  await page.evaluate(() => {
    sessionStorage.setItem("sc_access_token", "stale-local-token");
    sessionStorage.setItem("sc_tenant_id", "tenant-stale");
    sessionStorage.setItem("sc_operator", JSON.stringify({
      email: "stale@example.test",
      id: "usr-stale",
      name: "Stale Operator"
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-auth-login")).toBeVisible();
  await expect(page.getByTestId("route-app-shell")).toHaveCount(0);
});

test("landing auth onboarding and service admin do not overflow responsive viewports", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);

    for (const route of ["/#/landing", "/#/login", "/#/onboarding"]) {
      await page.goto(route);
      await expectHealthyPage(page);
    }

    await openServiceAdminShell(page);
    await expectHealthyPage(page);
  }
});

test("operator presence selector updates distribution status and the shift panel tracks time in status", async ({ page }) => {
  await openAppShell(page);
  await selectRole(page, "Администратор");

  const presenceSelect = page.locator(".presence-select select");
  await expect(presenceSelect).toBeVisible();

  const presenceUpdate = page.waitForResponse((response) =>
    response.url().includes("/api/v1/presence/me") && response.request().method() === "PUT");
  await presenceSelect.selectOption("busy");
  const putResponse = await presenceUpdate;
  expect(putResponse.ok()).toBeTruthy();
  const putPayload = await putResponse.json();
  expect(putPayload.status).toBe("ok");
  expect(putPayload.data.presence.status).toBe("busy");
  expect(putPayload.data.realtimeEvent?.eventName).toBe("operator.presence.updated");

  await expect(page.locator(".operator-card")).toContainText("Занят");

  const teamPresence = page.waitForResponse((response) =>
    response.url().includes("/api/v1/presence/team") && response.ok());
  await openSection(page, "Панель");
  const teamPayload = await (await teamPresence).json();
  expect(teamPayload.status).toBe("ok");
  const sergey = teamPayload.data.operators.find((operator) => operator.name === "Sergey Markin");
  expect(sergey?.status).toBe("busy");

  const summaryPanel = page.getByTestId("presence-summary-panel");
  await expect(summaryPanel).toBeVisible();
  await expect(summaryPanel).toContainText("Sergey Markin");
  await expect(summaryPanel).toContainText("Занят");
  await expectHealthyPage(page);
});
