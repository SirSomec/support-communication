import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import config from "../playwright.config.js";

describe("Playwright runtime configuration", () => {
  it("starts API Gateway before backend-dependent browser tests", () => {
    const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer].filter(Boolean);

    assert.equal(servers.length >= 2, true);
    assert.equal(
      servers.some((server) => String(server.url ?? "").includes("127.0.0.1:4100/api/v1/health")),
      true
    );
    assert.equal(
      servers.some((server) => String(server.url ?? "").includes("127.0.0.1:5173")),
      true
    );
  });

  it("isolates runtime state for browser tests through the dedicated smoke database", () => {
    const gatewayScript = readFileSync(new URL("./playwright-api-gateway.mjs", import.meta.url), "utf8");

    assert.match(gatewayScript, /smokeDatabaseUrl/);
    assert.doesNotMatch(gatewayScript, /_STORE_FILE/);
    assert.doesNotMatch(gatewayScript, /_REPOSITORY/);
  });
});
