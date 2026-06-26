import { expect, test } from "@playwright/test";

async function selectRole(page, role) {
  await page.locator(".role-switcher select").selectOption({ label: role });
}

async function openSection(page, label) {
  await page.locator("nav button").filter({ hasText: label }).click();
  await expect(page.locator(".product-screen")).toBeVisible();
}

async function expectHealthyPage(page) {
  await expect(page.locator("vite-error-overlay, [data-nextjs-dialog-overlay]")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
}

test("product sections expose loading/data/error states", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  for (const section of ["Панель", "Клиенты", "Шаблоны", "Визиты", "Отчеты", "Качество", "Боты", "Настройки"]) {
    await openSection(page, section);
    await expect(page.locator(".screen-state-item")).toHaveCount(3);
    await expect(page.locator(".screen-state-strip")).toContainText("Загрузка");
    await expectHealthyPage(page);
  }
});

test("rescue timer starts from chat action and writes audit", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  await page.getByRole("button", { name: "Действия с диалогом" }).click();
  await page.locator(".chat-action-menu button").filter({ hasText: "Запустить спасение" }).click();

  await expect(page.locator(".rescue-timer-chip")).toContainText("Ответить клиенту");
  await page.locator(".transcript-filter-buttons button").filter({ hasText: "Audit" }).click();
  await expect(page.locator(".chat-transcript")).toContainText("Запущен rescue timer");
  await page.getByRole("button", { name: "Действия с диалогом" }).click();
  await expect(page.locator(".chat-action-menu button").filter({ hasText: "Запустить спасение" })).toBeDisabled();
  await expectHealthyPage(page);
});

test("topbar notifications and live bot handoff summary are actionable", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  await expect(page.locator(".bot-handoff-summary")).toContainText("Handoff summary");
  await page.getByRole("button", { name: "Уведомления" }).click();
  await expect(page.locator(".notification-drawer")).toContainText("VK: рост ошибок webhook");
  await page.locator(".notification-item").filter({ hasText: "Ежедневный отчет готов" }).getByRole("button", { name: "Скачать" }).click();
  await expect(page.locator(".toast")).toContainText("Export: Скачать");
  await expectHealthyPage(page);
});

test("knowledge editor supports article draft status and preview", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Качество");

  await page.locator(".knowledge-row").filter({ hasText: "Сроки возврата средств" }).click();
  await page.locator(".knowledge-editor-form input").fill("Сроки возврата средств v2");
  await page.locator(".knowledge-editor-form button").filter({ hasText: "На проверку" }).click();

  await expect(page.locator(".knowledge-preview")).toContainText("Сроки возврата средств v2");
  await expect(page.locator(".knowledge-preview")).toContainText("На проверке");
  await expectHealthyPage(page);
});

test("bot builder supports canonical nodes and import validation", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Боты");

  await expect(page.locator(".automation-insight-grid")).toContainText("Боты по каналам");
  await page.locator(".bot-assignment-list select").first().selectOption({ label: "Код подтверждения" });
  await expect(page.locator(".toast")).toContainText('SDK: назначен бот "Код подтверждения"');
  await expect(page.locator(".bot-handoff-card")).toContainText("Поля:");

  await expect(page.locator(".bot-flow-node")).toHaveCount(7);
  for (const label of ["Сообщение", "Быстрые ответы", "Условие", "Запрос контакта", "Webhook", "Handoff", "Fallback"]) {
    await expect(page.locator(".bot-flow-canvas")).toContainText(label);
  }

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
  await expect(page.locator(".bot-builder-panel .section-title")).toContainText("Импортированный сценарий");
  await expect(page.locator(".bot-flow-node.selected")).toContainText("Импортированная нода");
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
    await page.goto("/");
    await selectRole(page, "Администратор");

    for (const section of ["Отчеты", "Боты", "Визиты", "Качество"]) {
      await openSection(page, section);
      await expectHealthyPage(page);
    }
  }
});
