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

async function expectNoElementOverflow(page, selector) {
  await expect.poll(async () => page.locator(selector).evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy();
}

test("product sections expose loading/data/error states", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  for (const section of ["Панель", "Клиенты", "Шаблоны", "Визиты", "Отчеты", "Качество", "Боты", "Audit", "Настройки"]) {
    await openSection(page, section);
    await expect(page.locator(".screen-state-item")).toHaveCount(3);
    await expect(page.locator(".screen-state-strip")).toContainText("Загрузка");
    await expectHealthyPage(page);
  }
});

test("app shell enforces role access and closes notifications on section change", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Сотрудник");

  await expect(page.locator(".quick-action")).toBeDisabled();
  await expect(page.locator(".topbar-access-note")).toContainText("Доступно старшему сотруднику или администратору");
  await expect(page.locator("nav button").filter({ hasText: "Панель" })).toBeDisabled();
  await expect(page.locator("nav button").filter({ hasText: "Audit" })).toBeDisabled();
  await expect(page.locator("nav button").filter({ hasText: "Клиенты" })).toBeEnabled();

  await selectRole(page, "Администратор");
  await page.getByRole("button", { name: "Уведомления" }).click();
  await expect(page.locator(".notification-drawer")).toBeVisible();
  await openSection(page, "Клиенты");
  await expect(page.locator(".notification-drawer")).toHaveCount(0);
  await expectHealthyPage(page);
});

test("rescue timer starts from chat action and writes audit", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/");
  await selectRole(page, "Администратор");

  await page.getByRole("button", { name: "Расширенные фильтры" }).click();
  await expect(page.locator(".queue-filter-panel")).toBeVisible();

  await page.locator(".queue-filter-panel select").nth(0).selectOption("Telegram");
  await page.locator(".queue-filter-panel select").nth(1).selectOption("none");
  await expect(page.locator(".active-filter-chips")).toContainText("Канал: Telegram");
  await expect(page.locator(".active-filter-chips")).toContainText("Без тематики");
  await expect(page.locator(".queue-row")).toHaveCount(1);
  await expect(page.locator(".queue-row")).toContainText("Владимир Б.");
  await expect(page.locator(".queue-row")).not.toContainText("Дмитрий С.");
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
  await page.goto("/");
  await selectRole(page, "Администратор");

  await page.locator(".queue-row").filter({ hasText: "Владимир Б." }).click();
  await expect(page.locator(".customer-panel")).toContainText("Для закрытия укажите тематику");
  await expect(page.locator(".customer-panel .close-button")).toBeDisabled();

  await page.locator(".customer-panel .close-topic select").selectOption({ label: "Товар / Несоответствие" });
  await expect(page.locator(".customer-panel .close-button")).toBeEnabled();

  await page.locator(".customer-panel .template-list button").filter({ hasText: "Передан курьеру" }).click();
  await expect(page.locator(".composer textarea")).toHaveValue(/Заказ передан курьеру/);
  await page.locator(".customer-panel .close-button").click();
  await expect(page.locator(".customer-panel .close-button")).toContainText("Закрыт");
  await expect(page.locator(".toast")).toContainText("Диалог закрыт и попадет в ежедневный отчет.");
  await expectHealthyPage(page);
});

test("employee role masks phone in chat context", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/");
  await selectRole(page, "Администратор");

  await page.locator(".quick-action").click();
  await expect(page.getByRole("dialog", { name: "Новый исходящий диалог" })).toBeVisible();
  await expect(page.locator(".outbound-panel")).toHaveAttribute("aria-modal", "true");

  await page.locator(".outbound-grid input").first().fill("+7 999 777-66-55");
  await page.locator(".outbound-grid input").nth(1).fill("Тестовый клиент");
  await page.locator(".outbound-message textarea").fill("Здравствуйте! Проверяем исходящий SDK диалог.");
  await page.locator(".outbound-panel > footer button").filter({ hasText: "Создать диалог" }).click();

  await expect(page.locator(".toast")).toContainText("Исходящий диалог создан: +7 999 777-66-55");
  await expect(page.locator(".chat-identity")).toContainText("Тестовый клиент");
  await expect(page.locator(".customer-panel")).toContainText("+7 999 777-66-55");
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
  await page.locator(".browser-push-card button").click();
  await expect(page.locator(".browser-push-card")).toContainText("Включено");
  await expect(page.locator(".toast")).toContainText("Browser push включен");
  await page.locator(".notification-sound-rules label").filter({ hasText: "Ошибки каналов" }).locator("input").uncheck();
  await expect(page.locator(".notification-sound-rules label").filter({ hasText: "Ошибки каналов" }).locator("input")).not.toBeChecked();
  await page.locator(".notification-external-channels label").filter({ hasText: "Email digest" }).locator("input").check();
  await expect(page.locator(".notification-external-channels label").filter({ hasText: "Email digest" }).locator("input")).toBeChecked();
  await page.locator(".notification-test-route").click();
  await expect(page.locator(".toast")).toContainText("внешних каналов получат тест critical alert");
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

test("composer attachment queue sends ready files", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  await page.getByLabel("Выбор вложений").setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("test attachment")
  });
  await expect(page.locator(".toast")).toContainText("Вложения добавлены в очередь: 1");
  await expect(page.locator(".attachment-queue")).toContainText("receipt.pdf");
  await page.locator(".attachment-card").filter({ hasText: "receipt.pdf" }).getByRole("button", { name: "Завершить" }).click();
  await expect(page.locator(".attachment-card").filter({ hasText: "receipt.pdf" })).toContainText("Готово");

  await page.locator(".send-button").click();
  await expect(page.locator(".attachment-queue")).toHaveCount(0);
  await expect(page.locator(".chat-transcript")).toContainText("receipt.pdf");
  await expect(page.locator(".toast")).toContainText("Ответ отправлен клиенту.");
  await expectHealthyPage(page);
});

test("draft switch warning preserves or discards unsent draft", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");

  await page.locator(".composer textarea").fill("Черновик перед переключением");
  await page.locator(".queue-row").filter({ hasText: "Владимир Б." }).click();

  await expect(page.getByRole("dialog", { name: "Перейти в другой диалог?" })).toBeVisible();
  await expect(page.locator(".draft-switch-panel")).toContainText("Черновик перед переключением");
  await page.locator(".draft-switch-panel > footer button").filter({ hasText: "Остаться" }).click();
  await expect(page.locator(".draft-switch-panel")).toHaveCount(0);
  await expect(page.locator(".chat-identity")).toContainText("Мария К.");
  await expect(page.locator(".composer textarea")).toHaveValue("Черновик перед переключением");

  await page.locator(".queue-row").filter({ hasText: "Владимир Б." }).click();
  await expect(page.getByRole("dialog", { name: "Перейти в другой диалог?" })).toBeVisible();
  await page.locator(".draft-switch-panel > footer button").filter({ hasText: "Сбросить и перейти" }).click();
  await expect(page.locator(".draft-switch-panel")).toHaveCount(0);
  await expect(page.locator(".chat-identity")).toContainText("Владимир Б.");
  await expect(page.locator(".composer textarea")).toHaveValue("");
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

test("audit screen filters events and exposes event detail", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Audit");

  await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();
  await expect(page.locator(".audit-log-row")).toHaveCount(3);
  await page.locator(".product-actions select").selectOption("30 дней");
  await expect(page.locator(".audit-log-row")).toHaveCount(6);
  await page.locator(".audit-toolbar select").first().selectOption("Каналы");
  await expect(page.locator(".audit-log-row")).toHaveCount(1);
  await expect(page.locator(".audit-event-detail")).toContainText("evt_hook_9006");
  await page.locator(".audit-log-row").click();
  await expect(page.locator(".audit-event-detail")).toContainText("Ошибка подписи");
  await page.locator(".audit-event-detail footer button").filter({ hasText: "Открыть объект" }).click();
  await expect(page.locator(".toast")).toContainText("channel/vk/main");
  await page.locator(".product-actions button").filter({ hasText: "Экспорт CSV" }).click();
  await expect(page.locator(".toast")).toContainText("Audit export: 1 событие");
  await selectRole(page, "Сотрудник");
  await expect(page.locator(".audit-log-row")).toHaveCount(0);
  await expect(page.locator("nav button").filter({ hasText: "Audit" })).toBeDisabled();
  await expect(page.locator(".conversation-list")).toBeVisible();
  await expectHealthyPage(page);
});

test("settings expose webhooks api keys and security controls", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");

  await expect(page.locator(".api-governance-panel")).toContainText("Webhooks / API keys");
  await expect(page.locator(".security-controls-panel")).toContainText("Security controls");
  await page.locator(".api-key-card").filter({ hasText: "Production SDK key" }).locator("button").click();
  await expect(page.locator(".api-key-card").filter({ hasText: "Production SDK key" })).toContainText("Rotation queued");
  await expect(page.locator(".toast")).toContainText("prod-key");

  await page.locator(".webhook-endpoint").filter({ hasText: "VK inbound" }).click();
  await expect(page.locator(".webhook-detail")).toContainText("HMAC SHA-256");
  await page.locator(".webhook-delivery-row").filter({ hasText: "signature_failed" }).locator("button").click();
  await expect(page.locator(".webhook-delivery-row").filter({ hasText: "message_new" })).toContainText("replay_queued");
  await expect(page.locator(".toast")).toContainText("manual replay");

  await page.locator(".security-session-row").filter({ hasText: "Сервисный ключ" }).locator("button").click();
  await expect(page.locator(".security-session-row").filter({ hasText: "Сервисный ключ" })).toContainText("Отозвана");
  await expect(page.locator(".toast")).toContainText("security audit");
  await expectNoElementOverflow(page, ".admin-workspace-layout");
  await expectNoElementOverflow(page, ".api-governance-panel");
  await expectNoElementOverflow(page, ".webhook-workspace");
  await expectNoElementOverflow(page, ".security-controls-panel");

  await selectRole(page, "Старший сотрудник");
  await expect(page.locator(".admin-locked-panel")).toContainText("Админские настройки скрыты");
  await expect(page.locator(".api-governance-panel")).toHaveCount(0);
  await expect(page.locator(".security-controls-panel")).toHaveCount(0);
  await expect(page.locator(".product-screen")).not.toContainText("sk_test_****_44ST");
  await expect(page.locator(".product-screen")).not.toContainText("https://api.support.local/webhooks/vk");
  await expect(page.locator(".product-screen")).not.toContainText("185.17.32.90");
  await expectHealthyPage(page);
});

test("settings access panel keeps role matrix and channel limit permissions", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");

  await expect(page.locator(".role-mode-panel")).toContainText("Полный доступ к общим настройкам");
  await expect(page.locator(".role-table")).toContainText("Администратор");
  await expect(page.locator(".role-table")).toContainText("Все");

  const telegramChannel = page.locator(".channel-settings article").filter({ hasText: "Telegram" });
  await telegramChannel.locator("input").fill("9");
  await expect(telegramChannel.locator("input")).toHaveValue("9");

  const maxToggle = page.getByRole("button", { name: "Переключить MAX" });
  await expect(maxToggle).toHaveAttribute("aria-pressed", "true");
  await maxToggle.click();
  await expect(maxToggle).toHaveAttribute("aria-pressed", "false");

  await page.locator(".role-mode-panel .segmented-control button").filter({ hasText: "Старший сотрудник" }).click();
  await expect(page.locator(".role-mode-panel")).toContainText("Общие настройки доступны только на чтение");
  await expect(telegramChannel.locator("input")).toBeDisabled();
  await expect(maxToggle).toBeDisabled();
  await expectNoElementOverflow(page, ".settings-layout");
  await expectHealthyPage(page);
});

test("settings employee management preserves edit and role permissions", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");

  const employeePanel = page.locator(".employee-rules-panel");
  await expect(employeePanel).toContainText("Каналы и лимиты по сотрудникам");
  await employeePanel.getByLabel("Поиск сотрудника").fill("Анна");
  await expect(employeePanel.locator("[data-employee-id='rule-anna']")).toBeVisible();
  await expect(employeePanel.locator("[data-employee-id='rule-ivan']")).toHaveCount(0);
  await employeePanel.locator("[data-employee-id='rule-anna']").click();

  await employeePanel.locator(".employee-editor-grid select").first().selectOption({ label: "Администратор" });
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Анна Р." })).toContainText("Администратор");
  await employeePanel.locator(".employee-editor-grid select").nth(1).selectOption({ label: "Финансы" });
  await employeePanel.locator(".employee-editor-grid input").fill("14");
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Анна Р." })).toContainText("14 чатов");
  await employeePanel.locator(".employee-channel-editor label").filter({ hasText: "SDK" }).locator("input").check();
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Анна Р." })).toContainText("SDK");
  await employeePanel.locator(".employee-permission-toggles label").filter({ hasText: "Override" }).locator("input").uncheck();
  await employeePanel.locator(".employee-permission-toggles label").filter({ hasText: "Чувствительные" }).locator("input").uncheck();
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Анна Р." })).toContainText("без override");
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Анна Р." })).toContainText("данные маскированы");
  await employeePanel.locator(".employee-editor footer button").filter({ hasText: "Сохранить" }).click();
  await expect(page.locator(".toast")).toContainText("Анна Р.: настройки сотрудника сохранены.");

  await page.locator(".role-mode-panel .segmented-control button").filter({ hasText: "Старший сотрудник" }).click();
  await expect(employeePanel.locator(".employee-editor-grid select").first()).toBeDisabled();
  await expect(employeePanel.locator(".employee-editor-grid input")).toBeDisabled();
  await expect(employeePanel.locator(".employee-channel-editor label").filter({ hasText: "VK" }).locator("input")).toBeDisabled();
  await expect(employeePanel.locator(".employee-editor footer button").filter({ hasText: "Сохранить" })).toBeDisabled();
  await expect(employeePanel.locator(".employee-editor header button").filter({ hasText: "Сбросить пароль" })).toBeEnabled();
  await employeePanel.locator(".employee-editor header button").filter({ hasText: "Сбросить пароль" }).click();
  await expect(employeePanel.locator(".employee-rule").filter({ hasText: "Анна Р." })).toContainText("Сброс отправлен");
  await expect(page.locator(".toast")).toContainText("Анна Р.: ссылка для смены пароля отправлена");
  await expectNoElementOverflow(page, ".employee-rules-panel");
  await expectHealthyPage(page);
});

test("settings channel connections keep logs tests and permissions", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");

  const channelPanel = page.locator(".channel-connections-panel");
  await channelPanel.locator("[data-channel-card='vk']").click();
  await expect(channelPanel.locator(".channel-detail-head")).toContainText("VK Сообщества");
  await expect(channelPanel.locator(".channel-detail-head")).toContainText("Требует внимания");

  await channelPanel.getByLabel("Фильтр логов по уровню").selectOption("error");
  await expect(channelPanel.locator(".channel-log-row")).toHaveCount(1);
  await expect(channelPanel.locator(".channel-log-list")).toContainText("Ошибка отправки вложения");
  await channelPanel.getByLabel("Фильтр логов по подключению").selectOption("vk-test");
  await expect(channelPanel.locator(".channel-log-empty")).toContainText("По выбранным фильтрам событий нет.");

  await channelPanel.getByLabel("Фильтр логов по подключению").selectOption("all");
  await channelPanel.getByLabel("Фильтр логов по уровню").selectOption("all");
  await channelPanel.locator(".channel-test-grid label").filter({ hasText: "Адресат" }).locator("input").fill("");
  await channelPanel.locator(".channel-test-message textarea").fill("");
  await channelPanel.locator(".channel-test-grid button").filter({ hasText: "Запустить тест" }).click();
  await expect(channelPanel.locator(".channel-test-result")).toContainText("Заполните адресата и сообщение");

  await channelPanel.locator(".channel-test-grid label").filter({ hasText: "Адресат" }).locator("input").fill("+7 900 123-45-67");
  await channelPanel.locator(".channel-test-message textarea").fill("Проверка канального теста");
  await channelPanel.locator(".channel-test-grid button").filter({ hasText: "Запустить тест" }).click();
  await expect(channelPanel.locator(".channel-test-result")).toContainText("Входящее тестовое сообщение принято");
  await expect(page.locator(".toast")).toContainText("VK: тест приема выполнен.");

  await page.locator(".role-mode-panel .segmented-control button").filter({ hasText: "Старший сотрудник" }).click();
  await expect(channelPanel.locator("[data-channel-card='telegram']")).toBeEnabled();
  await expect(channelPanel.locator(".channel-test-grid button").filter({ hasText: "Запустить тест" })).toBeDisabled();
  await expect(channelPanel.locator(".channel-detail-head button").filter({ hasText: "Проверить канал" })).toBeDisabled();
  await expectNoElementOverflow(page, ".channel-connections-panel");
  await expectHealthyPage(page);
});

test("settings sdk console keeps payload preview run states and permissions", async ({ page }) => {
  await page.goto("/");
  await selectRole(page, "Администратор");
  await openSection(page, "Настройки");

  const sdkPanel = page.locator(".sdk-console");
  await sdkPanel.getByLabel("Событие").selectOption("initConversation");
  await sdkPanel.getByLabel("Окружение").selectOption("stage");
  await sdkPanel.getByLabel("Канал").selectOption("Telegram");
  await sdkPanel.getByLabel("User ID").fill("gig-test-100");
  await sdkPanel.getByLabel("Телефон").fill("");
  await sdkPanel.locator(".sdk-message-field textarea").fill("");
  await expect(sdkPanel.locator(".sdk-payload-preview")).toContainText('"appId": "gig-app-stage"');
  await expect(sdkPanel.locator(".sdk-payload-preview")).toContainText('"channel": "Telegram"');
  await expect(sdkPanel.locator(".sdk-payload-preview")).toContainText('"userId": "gig-test-100"');

  await sdkPanel.locator(".sdk-playground-actions button").filter({ hasText: "Запустить событие" }).click();
  await expect(sdkPanel.locator(".sdk-playground-actions")).toContainText("Payload не прошел валидацию");

  await sdkPanel.getByLabel("Телефон").fill("+7 900 333-22-11");
  await sdkPanel.locator(".sdk-message-field textarea").fill("Проверка SDK initConversation.");
  await sdkPanel.locator(".sdk-playground-actions button").filter({ hasText: "Запустить событие" }).click();
  await expect(sdkPanel.locator(".sdk-playground-actions")).toContainText("Payload принят тестовым стендом");
  await expect(sdkPanel.locator(".sdk-payload-preview")).toContainText('"route": "outbound_queue"');
  await expect(page.locator(".toast")).toContainText("SDK playground: initConversation выполнен в stage.");

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
    await page.goto("/");
    await selectRole(page, "Администратор");

    for (const section of ["Отчеты", "Боты", "Визиты", "Качество", "Audit", "Настройки"]) {
      await openSection(page, section);
      await expectHealthyPage(page);
    }
  }
});
