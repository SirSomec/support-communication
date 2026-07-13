import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "node tests/playwright-api-gateway.mjs",
      reuseExistingServer: false,
      timeout: 180_000,
      url: "http://127.0.0.1:4100/api/v1/health"
    },
    {
      command: "npm run dev -- --port 5173",
      // Local .env.development.local may point the dev proxy at the docker pilot
      // (4101, MFA enforced); smokes must always talk to their own gateway on 4100.
      env: { DEV_API_PROXY_TARGET: "http://127.0.0.1:4100" },
      reuseExistingServer: true,
      timeout: 120_000,
      url: "http://127.0.0.1:5173"
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
