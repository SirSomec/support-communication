import { expect, test } from "@playwright/test";

async function loginTenantOperator(request) {
  const loginResponse = await request.post("/api/v1/auth/tenant/login", {
    data: {
      email: "sergey@volga.example",
      password: "correct-password"
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();
  expect(loginPayload.status).toBe("ok");
  return loginPayload.data;
}

async function openAppShell(page, session) {
  if (page.url() === "about:blank") {
    await page.goto("/#/landing");
  }

  await page.evaluate((storedSession) => {
    sessionStorage.setItem("sc_access_token", storedSession.accessToken);
    sessionStorage.setItem("sc_tenant_id", storedSession.tenantId);
    sessionStorage.setItem("sc_operator", JSON.stringify(storedSession.operator));
  }, session);
  await page.goto(`/?e2eSession=${Date.now()}#/app`);
  await expect(page.getByTestId("route-app-shell")).toBeVisible();
}

async function openSection(page, label) {
  await page.locator("nav button").filter({ hasText: label }).click();
  await expect(page.getByTestId("route-app-shell")).toBeVisible();
}

async function openSettingsTab(page, tabId) {
  await page.locator(`#settings-tab-${tabId}`).click();
}

async function fetchTopicById(request, session, topicId) {
  const response = await request.get("/api/v1/workspace/topics", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.status).toBe("ok");
  return payload.data.topics.find((topic) => topic.id === topicId);
}

async function fetchTopicByName(request, session, topicName) {
  const response = await request.get("/api/v1/workspace/topics", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.status).toBe("ok");
  return payload.data.topics.find((topic) => topic.name === topicName);
}

test("settings runtime loads channel connections from API", async ({ page, request }) => {
  const session = await loginTenantOperator(request);
  const channelsResponse = await request.get("/api/v1/integrations/channels", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(channelsResponse.ok()).toBeTruthy();
  const channelsPayload = await channelsResponse.json();
  expect(channelsPayload.status).toBe("ok");
  expect(Array.isArray(channelsPayload.data.connections)).toBeTruthy();

  await openAppShell(page, session);
  await page.locator(".role-switcher select").selectOption({ label: "Администратор" });
  await openSection(page, "Настройки");

  const channelPanel = page.locator(".channel-connections-panel");
  await expect(channelPanel).toBeVisible();
  if (channelsPayload.data.connections.length === 0) {
    await expect(channelPanel.locator(".channel-log-empty")).toBeVisible();
  } else {
    await expect(channelPanel.locator(".connection-row.connection-picker").first()).toBeVisible();
  }
});

test("settings runtime creates telegram and max channels independently", async ({ page, request }) => {
  const session = await loginTenantOperator(request);
  await openAppShell(page, session);
  await page.locator(".role-switcher select").selectOption({ label: "Администратор" });
  await openSection(page, "Настройки");

  const channelPanel = page.locator(".channel-connections-panel");
  const runId = Date.now().toString(36);
  const telegramName = `Runtime Telegram ${runId}`;
  const maxName = `Runtime MAX ${runId}`;
  const createForm = channelPanel.locator(".channel-create-form");

  await createForm.locator("select").first().selectOption("telegram");
  await createForm.locator("input").nth(0).fill(telegramName);
  await createForm.locator("input[type='password']").fill("123:qa-telegram-token");
  await createForm.getByRole("button", { name: "Создать" }).click();
  await expect(channelPanel.locator(".connection-row.connection-picker").filter({ hasText: telegramName })).toBeVisible();

  await createForm.locator("select").first().selectOption("max");
  await createForm.locator("input").nth(0).fill(maxName);
  await createForm.locator("input[type='password']").fill("runtime-max-token");
  await createForm.getByRole("button", { name: "Создать" }).click();
  await expect(channelPanel.locator(".connection-row.connection-picker").filter({ hasText: maxName })).toBeVisible();

  const channelsResponse = await request.get("/api/v1/integrations/channels", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  const channelsPayload = await channelsResponse.json();
  const names = channelsPayload.data.connections.map((connection) => connection.name);
  expect(names).toEqual(expect.arrayContaining([telegramName, maxName]));

  await channelPanel.locator(".connection-row.connection-picker").filter({ hasText: telegramName }).click();
  await channelPanel.locator(".channel-test-grid button").filter({ hasText: "Запустить" }).click();
  await expect(channelPanel.locator(".channel-test-result")).toContainText("accepted_to_queue");
});

test("settings runtime exposes employees roles and rules from backend", async ({ page, request }) => {
  const session = await loginTenantOperator(request);

  const employeesResponse = await request.get("/api/v1/settings/employees", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(employeesResponse.ok()).toBeTruthy();
  const employeesPayload = await employeesResponse.json();
  expect(employeesPayload.status).toBe("ok");
  expect(employeesPayload.data.employees.length).toBeGreaterThan(0);

  const rulesResponse = await request.get("/api/v1/settings/rules", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(rulesResponse.ok()).toBeTruthy();
  const rulesPayload = await rulesResponse.json();
  expect(rulesPayload.status).toBe("ok");
  expect(rulesPayload.data.rules.length).toBeGreaterThan(0);

  await openAppShell(page, session);
  await page.locator(".role-switcher select").selectOption({ label: "Администратор" });
  await openSection(page, "Настройки");
  await openSettingsTab(page, "employees");
  await expect(page.locator(".employee-rules-panel")).toBeVisible();
  await openSettingsTab(page, "rules");
  await expect(page.locator("#settings-panel-rules .settings-rules-workspace")).toBeVisible();
});

test("settings runtime invite can be accepted and employee receives restricted workspace access", async ({ page, request }) => {
  const session = await loginTenantOperator(request);
  await openAppShell(page, session);
  await page.locator(".role-switcher select").selectOption({ label: "Администратор" });
  await openSection(page, "Настройки");
  await openSettingsTab(page, "employees");

  const runId = Date.now().toString(36);
  const email = `runtime-employee-${runId}@volga.example`;
  const employeeName = `Runtime Employee ${runId}`;
  const password = "correct-password";
  const inviteForm = page.locator(".employee-invite-form");

  await inviteForm.locator("input").first().fill(employeeName);
  await inviteForm.locator("input[type='email']").fill(email);
  await inviteForm.locator("select").first().selectOption("employee");
  await inviteForm.locator("select").nth(1).selectOption("group-line-1");

  const inviteResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/settings/employees/invites") && response.request().method() === "POST"
  );
  await inviteForm.getByRole("button", { name: "Пригласить" }).click();
  const inviteResponse = await inviteResponsePromise;
  expect(inviteResponse.ok()).toBeTruthy();
  const invitePayload = await inviteResponse.json();
  expect(invitePayload.status).toBe("ok");
  expect(invitePayload.data.employee).toMatchObject({
    email,
    groupId: "group-line-1",
    roleKey: "employee",
    status: "invited"
  });
  expect(invitePayload.data.inviteDescriptor?.code).toBeTruthy();
  await expect(page.locator(".employee-selector-list").getByText(employeeName)).toBeVisible();

  const acceptResponse = await request.post("/api/v1/auth/invites/accept", {
    data: {
      code: invitePayload.data.inviteDescriptor.code,
      email,
      password
    }
  });
  expect(acceptResponse.ok()).toBeTruthy();
  const acceptPayload = await acceptResponse.json();
  expect(acceptPayload.status).toBe("ok");
  expect(acceptPayload.data.authenticated).toBe(true);
  expect(acceptPayload.data.operator).toMatchObject({
    email,
    role: "Сотрудник"
  });
  expect(acceptPayload.data.permissions).toEqual(expect.arrayContaining(["dialogs.read", "templates.read"]));
  expect(acceptPayload.data.permissions).not.toContain("settings.manage");
  expect(acceptPayload.data.permissions).not.toContain("reports.export");

  await openAppShell(page, acceptPayload.data);
  const nav = page.locator(".nav-list");
  await expect(nav.getByRole("button", { name: "Диалоги" })).toBeEnabled();
  await expect(nav.getByRole("button", { name: /Настройки:/ })).toBeDisabled();
  await expect(nav.getByRole("button", { name: /Отчеты:/ })).toBeDisabled();
  await expect(page.locator(".quick-action")).toBeDisabled();
});

test("settings runtime topic directory and rule test stay backend-backed", async ({ page, request }) => {
  const session = await loginTenantOperator(request);
  await openAppShell(page, session);
  await page.locator(".role-switcher select").selectOption({ label: "Администратор" });
  await openSection(page, "Настройки");
  await openSettingsTab(page, "topics");
  await expect(page.locator(".topic-directory-panel")).toBeVisible();

  await openSettingsTab(page, "rules");
  const rulesPanel = page.locator("#settings-panel-rules");
  const firstRule = rulesPanel.locator(".settings-rule-card").first();
  await expect(firstRule).toBeVisible();
  await firstRule.getByRole("button", { name: "Проверить" }).click();
  await expect(page.locator(".toast")).toContainText("Аудит");

  const auditResponse = await request.get("/api/v1/service-admin/audit-events?tenantId=tenant-volga", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(auditResponse.ok()).toBeTruthy();
});

test("settings runtime creates archives and restores topics while refreshing runtime topic options", async ({ page, request }) => {
  const session = await loginTenantOperator(request);
  await openAppShell(page, session);
  await page.locator(".role-switcher select").selectOption({ label: "Администратор" });
  await openSection(page, "Настройки");
  await openSettingsTab(page, "topics");

  const runId = Date.now().toString(36);
  const topicName = `Runtime Topic ${runId}`;
  const topicForm = page.locator(".topic-editor-form");
  await topicForm.locator("input").nth(0).fill("Runtime Group");
  await topicForm.locator("input").nth(1).fill("Runtime Branch");
  await topicForm.locator("input").nth(2).fill(topicName);
  await topicForm.locator("input").nth(3).fill("Line 1");
  await topicForm.locator("select").selectOption("all");

  await topicForm.getByRole("button", { name: "Сохранить тематику" }).click();
  const createdTopicRow = page.locator(".topic-row").filter({ hasText: topicName });
  await expect(createdTopicRow).toBeVisible();
  await expect(page.locator(".toast")).toContainText("Audit");
  const createdTopic = await fetchTopicByName(request, session, topicName);
  expect(createdTopic).toBeTruthy();
  expect(createdTopic.archived).toBe(false);
  const topicId = createdTopic.id;

  await openSection(page, "Диалоги");
  await page.getByRole("button", { name: /Расширенные фильтры/ }).click();
  const dialogTopicSelect = page.locator(".queue-filter-panel select").nth(1);
  await expect(dialogTopicSelect.locator("option", { hasText: topicName })).toHaveCount(1);

  await openSection(page, "Настройки");
  await openSettingsTab(page, "topics");
  const restoredCreatedRow = page.locator(".topic-row").filter({ hasText: topicName });
  await restoredCreatedRow.getByRole("button", { name: /В архив:/ }).click();
  await expect(restoredCreatedRow).toHaveClass(/archived/);
  const archivedTopic = await fetchTopicById(request, session, topicId);
  expect(archivedTopic.archived).toBe(true);

  await openSection(page, "Диалоги");
  await page.getByRole("button", { name: /Расширенные фильтры/ }).click();
  await expect(page.locator(".queue-filter-panel select").nth(1).locator("option", { hasText: topicName })).toHaveCount(0);

  await openSection(page, "Настройки");
  await openSettingsTab(page, "topics");
  await page.locator(".topic-filter button").filter({ hasText: "Архив" }).click();
  const archivedTopicRow = page.locator(".topic-row.archived").filter({ hasText: topicName });
  await expect(archivedTopicRow).toBeVisible();
  await archivedTopicRow.getByRole("button", { name: /Вернуть:/ }).click();
  await expect(page.locator(".toast")).toContainText("восстановлена");
  const restoredTopic = await fetchTopicById(request, session, topicId);
  expect(restoredTopic.archived).toBe(false);

  await openSection(page, "Диалоги");
  await page.getByRole("button", { name: /Расширенные фильтры/ }).click();
  await expect(page.locator(".queue-filter-panel select").nth(1).locator("option", { hasText: topicName })).toHaveCount(1);
});

test("reports runtime creates export retries failed jobs and downloads file bytes from API", async ({ page, request }) => {
  const session = await loginTenantOperator(request);
  await openAppShell(page, session);
  await page.locator(".role-switcher select").selectOption({ label: "Администратор" });
  await openSection(page, "Отчеты");
  await expect(page.locator(".export-queue-panel")).toBeVisible();

  const createExportPromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/reports/exports") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Экспорт XLSX" }).click();
  const createExportResponse = await createExportPromise;
  expect(createExportResponse.ok()).toBeTruthy();
  const createExportPayload = await createExportResponse.json();
  expect(createExportPayload.status).toBe("ok");
  expect(createExportPayload.data.job.backendQueueId).toBeTruthy();
  expect(createExportPayload.data.job.auditId).toBeTruthy();
  await expect(page.locator(".export-job").filter({ hasText: createExportPayload.data.job.name }).first()).toBeVisible();

  const retryableJobs = await request.get("/api/v1/reports/workspace", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(retryableJobs.ok()).toBeTruthy();
  const retryablePayload = await retryableJobs.json();
  const retryableJob = retryablePayload.data.exportJobs.find((job) => ["error", "expired"].includes(job.statusKey));
  expect(retryableJob).toBeTruthy();
  const retryButtonName = retryableJob.statusKey === "expired" ? "Сгенерировать" : "Retry";
  const retryJobRow = page.locator(".export-job").filter({ hasText: retryableJob.name }).first();
  const retryExportPromise = page.waitForResponse((response) =>
    response.url().includes(`/api/v1/reports/exports/${encodeURIComponent(retryableJob.id)}/retry`) && response.request().method() === "POST"
  );
  await retryJobRow.getByRole("button", { name: retryButtonName }).click();
  const retryExportResponse = await retryExportPromise;
  expect(retryExportResponse.ok()).toBeTruthy();
  const retryExportPayload = await retryExportResponse.json();
  expect(retryExportPayload.status).toBe("ok");
  expect(retryExportPayload.data.auditEvent?.id).toBeTruthy();
  expect(retryExportPayload.data.job.statusKey).toBe("running");
  await expect(retryJobRow).toContainText("Повторная подготовка");

  const readyJobs = await request.get("/api/v1/reports/workspace", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  expect(readyJobs.ok()).toBeTruthy();
  const readyPayload = await readyJobs.json();
  const readyJob = readyPayload.data.exportJobs.find((job) => job.statusKey === "ready");
  expect(readyJob).toBeTruthy();
  const readyJobRow = page.locator(".export-job").filter({ hasText: readyJob.name }).first();
  const downloadResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/v1/reports/exports/${encodeURIComponent(readyJob.id)}/download`) && response.request().method() === "GET"
  );
  const browserDownloadPromise = page.waitForEvent("download");
  await readyJobRow.getByRole("button", { name: "Скачать" }).click();
  const [downloadResponse, browserDownload] = await Promise.all([downloadResponsePromise, browserDownloadPromise]);
  expect(downloadResponse.ok()).toBeTruthy();
  expect(downloadResponse.headers()["content-disposition"]).toContain("attachment");
  expect(browserDownload.suggestedFilename()).toContain(readyJob.id);
  await expect(page.locator(".toast")).toContainText(browserDownload.suggestedFilename());
});
