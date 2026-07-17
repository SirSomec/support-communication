import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import config from "../playwright.config.js";

describe("Playwright runtime configuration", () => {
  it("discovers only Playwright spec files", () => {
    assert.equal(config.testMatch, "**/*.spec.@(js|jsx|ts|tsx|mjs)");
  });

  it("starts API Gateway before backend-dependent browser tests", () => {
    const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer].filter(Boolean);

    assert.equal(servers.length >= 3, true);
    assert.equal(servers.every((server) => server.reuseExistingServer === false), true);
    assert.equal(
      servers.some((server) => String(server.url ?? "").includes("127.0.0.1:4100/api/v1/health")),
      true
    );
    assert.equal(
      servers.some((server) => String(server.url ?? "").includes("127.0.0.1:5173")),
      true
    );
    assert.equal(
      servers.some((server) => String(server.url ?? "").includes("127.0.0.1:5174/demo.html")),
      true
    );
  });

  it("does not silently skip the widget demo when its managed server fails", () => {
    const pilotFlow = readFileSync(new URL("./pilot-flow.spec.js", import.meta.url), "utf8");

    assert.doesNotMatch(pilotFlow, /test\.skip\([^\n]*demoReachable/);
    assert.doesNotMatch(pilotFlow, /function isUrlReachable/);
  });

  it("fails settings smoke when required API fixtures are missing", () => {
    const smoke = readFileSync(new URL("./smoke.spec.js", import.meta.url), "utf8");

    assert.match(smoke, /expect\(productionKey\)\.toHaveCount\(1\)/);
    assert.match(smoke, /expect\(vkWebhook\)\.toHaveCount\(1\)/);
    assert.doesNotMatch(smoke, /if \(await productionKey\.count\(\)\)/);
    assert.doesNotMatch(smoke, /if \(await vkWebhook\.count\(\)\)/);
  });

  it("isolates runtime state for browser tests through the dedicated smoke database", () => {
    const gatewayScript = readFileSync(new URL("./playwright-api-gateway.mjs", import.meta.url), "utf8");
    const resetScript = readFileSync(new URL("../backend/scripts/smoke-db-reset.mjs", import.meta.url), "utf8");
    const viteConfig = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");

    assert.match(gatewayScript, /smokeDatabaseUrl/);
    assert.match(resetScript, /new URL\(BASE_URL\)/);
    assert.match(resetScript, /host\.docker\.internal/);
    assert.doesNotMatch(resetScript, /docker[^\n]+compose[^\n]+exec/);
    assert.match(viteConfig, /process\.env\.DEV_API_PROXY_TARGET \|\| env\.DEV_API_PROXY_TARGET/);
    assert.doesNotMatch(gatewayScript, /_STORE_FILE/);
    assert.doesNotMatch(gatewayScript, /_REPOSITORY/);
  });
});
