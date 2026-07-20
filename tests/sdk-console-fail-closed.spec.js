import { expect, test } from "@playwright/test";

async function openSdkConsole(page) {
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
  await page.locator(".role-switcher select").selectOption({ label: "Администратор" });
  await page.locator("nav button").filter({ hasText: "Настройки" }).click();
  await page.locator(".integration-view-switch button").filter({ hasText: "Каталог" }).click();
  await page.locator(".integration-catalog-row").filter({ hasText: "Виджет и SDK" }).getByRole("button", { name: "Открыть" }).click();

  const panel = page.locator(".sdk-console");
  await expect(panel).toBeVisible();
  return panel;
}

async function replaceSdkRequest(page, responseKind) {
  await page.evaluate(async (kind) => {
    const { integrationService } = await import("/src/services/integrationService.js");

    if (kind === "ok") {
      integrationService.testChannelConnectionInstance = async () => ({
        status: "ok",
        traceId: "trc_sdk_success",
        data: {
          delivery: { requestId: "req_sdk_success" }
        }
      });
      return;
    }

    if (kind === "non-ok") {
      integrationService.testChannelConnectionInstance = async () => ({
        status: "error",
        traceId: "trc_sdk_failure",
        data: {
          delivery: { requestId: "req_must_not_be_success" }
        },
        error: {
          code: "sdk_unavailable",
          message: "SDK service is unavailable"
        }
      });
      return;
    }

    if (kind === "rejected") {
      integrationService.testChannelConnectionInstance = async () => {
        throw new Error("SDK request rejected");
      };
      return;
    }

    integrationService.testChannelConnectionInstance = async () => null;
  }, responseKind);
}

async function runSdkEvent(panel) {
  await panel.locator(".sdk-playground-actions button").filter({ hasText: "Запустить событие" }).click();
}

test("SDK playground shows success only for an ok service envelope", async ({ page }) => {
  const panel = await openSdkConsole(page);
  await replaceSdkRequest(page, "ok");
  await runSdkEvent(panel);

  await expect(panel.locator(".sdk-playground-actions span.success")).toContainText("Payload принят тестовым стендом");
  await expect(panel.locator(".sdk-payload-preview code.success")).toContainText('"requestId": "req_sdk_success"');
  await expect(page.locator(".toast")).toContainText("SDK playground");
});

for (const failure of [
  { kind: "non-ok", message: "SDK service is unavailable", name: "a non-ok service envelope" },
  { kind: "rejected", message: "SDK request rejected", name: "a rejected service promise" },
  { kind: "malformed", message: "Некорректный ответ SDK сервиса", name: "a malformed service response" }
]) {
  test(`SDK playground fails closed for ${failure.name}`, async ({ page }) => {
    const panel = await openSdkConsole(page);
    await replaceSdkRequest(page, failure.kind);
    await runSdkEvent(panel);

    await expect(panel.locator(".sdk-playground-actions span.error")).toContainText("SDK событие не выполнено");
    await expect(panel.locator(".sdk-payload-preview code.error")).toContainText(failure.message);
    await expect(panel.locator(".sdk-playground-actions span.success")).toHaveCount(0);
    await expect(panel.locator(".sdk-payload-preview code.success")).toHaveCount(0);
    await expect(page.locator(".toast").filter({ hasText: "SDK playground" })).toHaveCount(0);
  });
}
