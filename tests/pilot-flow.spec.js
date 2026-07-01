import { expect, test } from "@playwright/test";

const demoUrl = process.env.PILOT_WIDGET_DEMO_URL ?? "http://127.0.0.1:5174/demo.html";
const appUrl = process.env.PILOT_OPERATOR_APP_URL ?? "http://127.0.0.1:5173/#/app";

test("widget demo page loads and SupportWidget.init is available", async ({ page }) => {
  const demoReachable = await isUrlReachable(demoUrl);
  test.skip(!demoReachable, `Widget demo is unavailable: ${demoUrl}`);

  await page.goto(demoUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Support Widget/i })).toBeVisible();

  const hasInit = await page.evaluate(() => {
    const widget = globalThis.SupportWidget;
    return Boolean(widget && typeof widget.init === "function");
  });
  expect(hasInit).toBeTruthy();
});

test("operator app route opens with seeded session", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("sc_access_token", "pilot-e2e-token");
    sessionStorage.setItem("sc_tenant_id", "tenant-pilot-001");
    sessionStorage.setItem("sc_operator", JSON.stringify({
      email: "operator@pilot-client.test",
      id: "usr-pilot-operator",
      name: "Pilot Operator",
      tenantId: "tenant-pilot-001"
    }));
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-app-shell")).toBeVisible();
  await expect(page.locator(".conversation-list")).toBeVisible();
});

async function isUrlReachable(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}
