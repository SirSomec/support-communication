import { expect, test } from "@playwright/test";

async function openAppShell(page) {
  const loginResponse = await page.request.post("/api/v1/auth/tenant/login", {
    data: {
      email: "sergey@volga.example",
      password: "correct-password"
    }
  });
  expect(loginResponse.ok()).toBeTruthy();
  const loginPayload = await loginResponse.json();
  expect(loginPayload.status).toBe("ok");

  await page.addInitScript((session) => {
    sessionStorage.setItem("sc_access_token", session.accessToken);
    sessionStorage.setItem("sc_tenant_id", session.tenantId);
    sessionStorage.setItem("sc_operator", JSON.stringify(session.operator));
  }, loginPayload.data);

  await page.goto("/#/app", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-app-shell")).toBeVisible({ timeout: 15_000 });
}

async function openPanelAsAdmin(page) {
  await openAppShell(page);
  await page.locator(".role-switcher select").selectOption({ label: "Администратор" });
  await page.locator("nav button").filter({ hasText: "Панель" }).click();
  await expect(page.getByRole("heading", { name: "Панель смены" })).toBeVisible();
}

test("shift panel makes roster, workload period and status date explicit", async ({ page }) => {
  await openPanelAsAdmin(page);

  await expect(page.getByText("Смена пока не определена")).toBeVisible();
  await page.getByRole("button", { name: "Определить смену" }).click();
  await expect(page.getByRole("heading", { name: "Управление текущей сменой" })).toBeVisible();

  const firstOperator = page.locator(".shift-roster-item input").first();
  await expect(firstOperator).toBeVisible();
  await firstOperator.check();
  await page.getByRole("button", { name: "Сохранить смену" }).click();

  await expect(page.getByRole("button", { name: "Управлять сменой" })).toBeVisible();
  await expect(page.locator(".shift-summary-strip")).toContainText("В смене");
  await expect(page.getByRole("columnheader", { name: "На линии с" })).toHaveCount(2);

  const workloadRefresh = page.waitForResponse((response) => (
    response.url().includes("/api/v1/routing/workload")
    && new URL(response.url()).searchParams.get("period") === "7days"
  ));
  await page.getByLabel("Период нагрузки операторов").selectOption("7days");
  await workloadRefresh;
  await expect(page.locator(".panel-definition-strip")).toContainText("за последние 7 дней");

  const dateInput = page.getByLabel("Дата времени в статусах");
  const presenceRefresh = page.waitForResponse((response) => response.url().includes("/api/v1/presence/team"));
  await dateInput.fill("2026-08-19");
  await presenceRefresh;
  await expect(dateInput).toHaveValue("2026-08-19");
  await expect(page.getByTestId("presence-summary-panel")).toContainText("Время в статусах");
});
