import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? 4100);
const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? 5173);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.@(js|jsx|ts|tsx|mjs)",
  timeout: 45_000,
  workers: process.env.CI ? 1 : undefined,
  expect: {
    timeout: 8_000
  },
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "node tests/playwright-api-gateway.mjs",
      reuseExistingServer: false,
      timeout: 180_000,
      url: `http://127.0.0.1:${apiPort}/api/v1/health`
    },
    {
      command: `npm run dev -- --port ${webPort}`,
      // Local .env.development.local may point the dev proxy at the docker pilot
      // (4101, MFA enforced); smokes must always talk to their own gateway on 4100.
      env: { DEV_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `http://127.0.0.1:${webPort}`
    },
    {
      command: "npm run widget:preview:e2e",
      reuseExistingServer: false,
      timeout: 120_000,
      url: "http://127.0.0.1:5174/demo.html"
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
