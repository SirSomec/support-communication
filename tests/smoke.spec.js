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

test("conversation queue filters remain actionable", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  await page.getByRole("button", { name: "Расширенные фильтры" }).click();
  await expect(page.locator(".queue-filter-panel")).toBeVisible();

  await page.locator(".queue-filter-panel select").nth(0).selectOption("Telegram");
  await page.locator(".queue-filter-panel select").nth(1).selectOption("none");
  await page.locator(".queue-filter-check input").check();
  await expect(page.locator(".active-filter-chips")).toContainText("Канал: Telegram");
  await expect(page.locator(".active-filter-chips")).toContainText("Без тематики");
  await expect(page.locator(".active-filter-chips")).toContainText("Внутренние комментарии");

  await page.locator(".queue-tab").filter({ hasText: "SLA" }).click();
  await expect(page.locator(".queue-tab").filter({ hasText: "SLA" })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".queue-filter-reset").click();
  await expect(page.locator(".active-filter-chips")).toHaveCount(0);
  await expectHealthyPage(page);
});

test("topbar notifications and live bot handoff summary are actionable", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  await expect(page.locator(".bot-handoff-summary")).toContainText("Handoff summary");
  await page.getByRole("button", { name: "Уведомления" }).click();
  await expect(page.locator(".notification-drawer")).toContainText("VK: рост ошибок webhook");
  await page.locator(".notification-filters button").filter({ hasText: "SLA" }).click();
  await expect(page.locator(".notification-list")).toContainText("Владимир Б. без тематики");
  await expect(page.locator(".notification-list")).not.toContainText("Ежедневный отчет готов");
  await page.locator(".notification-filters button").filter({ hasText: "Все" }).click();
  await page.locator(".notification-settings label").filter({ hasText: "Channel errors" }).locator("input").uncheck();
  await expect(page.locator(".notification-groups")).toContainText("выключено");
  await page.locator(".notification-item").filter({ hasText: "Ежедневный отчет готов" }).getByRole("button", { name: "Скачать" }).click();
  await expect(page.locator(".toast")).toContainText("Export: Скачать");
  await page.getByRole("button", { name: "Уведомления" }).click();
  await page.locator(".notification-drawer > header button").filter({ hasText: "Все прочитаны" }).click();
  await expect(page.locator(".notification-history")).toContainText("export queue завершила задачу");
  await expectHealthyPage(page);
});

test("composer exposes AI explainability and pre-send quality checks", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  await page.locator(".ai-explainability summary").click();
  await expect(page.locator(".ai-explainability")).toContainText("Совпадает с тематикой");
  await expect(page.locator(".pre-send-quality")).toContainText("Ответ пустой");

  await page.locator(".composer textarea").fill("Вы сами виноваты, невозможно помочь самостоятельно.");
  await expect(page.locator(".pre-send-quality")).toContainText("Риск формулировки");
  await expect(page.locator(".pre-send-quality")).toContainText("Не указан следующий шаг");

  await page.locator(".inline-ai-card button").filter({ hasText: "Редактировать" }).click();
  await expect(page.locator(".composer textarea")).toHaveValue(/Клиент ждет заказ/);
  await expectHealthyPage(page);
});

test("composer save-template modal keeps dialog semantics", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  await page.locator(".composer textarea").fill("Проверю заказ и вернусь с точным сроком доставки.");
  await page.locator(".composer-tools button[aria-label='Сохранить как шаблон']").click();

  await expect(page.getByRole("dialog", { name: "Сохранить как шаблон" })).toBeVisible();
  await expect(page.locator(".template-save-panel")).toHaveAttribute("aria-modal", "true");
  await page.locator(".template-save-panel .variable-row button").filter({ hasText: "{client_name}" }).click();
  await expect(page.locator(".template-save-text textarea")).toHaveValue(/client_name/);
  await page.locator(".template-save-panel > footer button").filter({ hasText: "Сохранить шаблон" }).click();
  await expect(page.locator(".toast")).toContainText("Шаблон сохранен");
  await expectHealthyPage(page);
});

test("knowledge editor supports article draft status and preview", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Качество");

  await page.locator(".knowledge-row").filter({ hasText: "Сроки возврата средств" }).click();
  await expect(page.locator(".knowledge-version-list")).toContainText("v2.0");
  await expect(page.locator(".knowledge-approval-list")).toContainText("Отправила на проверку");

  await page.locator(".knowledge-editor-form input").fill("Сроки возврата средств v2");
  await page.locator(".knowledge-editor-form button").filter({ hasText: "Сохранить" }).click();
  await expect(page.locator(".knowledge-version-list")).toContainText("draft");
  await expect(page.locator(".knowledge-approval-list")).toContainText("Сохранил версию");

  await page.locator(".knowledge-editor-form button").filter({ hasText: "На проверку" }).click();

  await expect(page.locator(".knowledge-preview")).toContainText("Сроки возврата средств v2");
  await expect(page.locator(".knowledge-preview")).toContainText("На проверке");
  await expect(page.locator(".knowledge-approval-list")).toContainText("Отправил на проверку");

  await page.locator(".knowledge-governance-panel").filter({ hasText: "Вложения" }).getByRole("button", { name: /Добавить/ }).click();
  await expect(page.locator(".knowledge-attachment-list")).toContainText("Регламент: Оплата.docx");
  await expect(page.locator(".knowledge-channel-picker button").filter({ hasText: "SDK" })).toHaveAttribute("aria-pressed", "true");

  await page.locator(".knowledge-preview-toolbar button").filter({ hasText: "Self-service" }).click();
  await page.locator(".knowledge-self-service-preview input").fill("возврат");
  await expect(page.locator(".knowledge-widget-results")).not.toContainText("Сроки возврата средств v2");
  await expect(page.locator(".knowledge-widget-results")).toContainText("Публичные статьи не найдены");
  await expect(page.locator(".knowledge-self-service-preview")).toContainText("Текущая статья скрыта до публикации");
  await page.locator(".knowledge-self-service-preview input").fill("заказ");
  await expect(page.locator(".knowledge-widget-results")).toContainText("Отслеживание заказа");
  await expect(page.locator(".knowledge-self-service-preview")).toContainText("Написать оператору");
  await expectHealthyPage(page);
});

test("quality AI workspace exposes real-time scoring and coaching", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Качество");

  await expect(page.locator(".ai-quality-workspace")).toContainText("Real-time scoring");
  await expect(page.locator(".ai-quality-workspace")).toContainText("Риск формулировки");
  await expect(page.locator(".ai-effectiveness-grid")).toContainText("Принято без правок");

  await page.locator(".ai-coaching-filters button").filter({ hasText: "SLA" }).click();
  await expect(page.locator(".ai-coaching-list")).toContainText("SLA риск");
  await expect(page.locator(".ai-coaching-list")).not.toContainText("Нужна статья");

  await page.locator(".ai-coaching-card button").filter({ hasText: "Применить исправление" }).click();
  await expect(page.locator(".toast")).toContainText("AI coaching: SLA риск");
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
