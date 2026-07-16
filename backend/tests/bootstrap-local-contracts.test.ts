import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";

describe("local stack bootstrap", () => {
  it("keeps the single compose file prisma-only without pilot overlays or repository-selection envs", () => {
    const compose = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");
    assert.equal(existsSync(new URL("../../docker-compose.pilot.yml", import.meta.url)), false);
    assert.doesNotMatch(compose, /profiles:/);
    assert.doesNotMatch(compose, /_REPOSITORY:/);
    assert.doesNotMatch(compose, /_STORE_FILE:/);
    assert.match(compose, /RUNTIME_PROFILE:\s*production-like/);
    assert.doesNotMatch(compose, /ALLOW_DEMO_SERVICE_ADMIN_HEADERS:\s*"true"/);
  });

  it("runs the bootstrap before the API gateway starts", () => {
    const compose = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");

    assert.match(compose, /^  bootstrap:/m);
    assert.match(compose, /command:\s*\[\s*"npm",\s*"run",\s*"bootstrap:local"\s*\]/);
    assert.match(compose, /api-gateway:[\s\S]*bootstrap:[\s\S]*condition:\s*service_completed_successfully/);
    assert.match(compose, /bootstrap:[\s\S]*DATABASE_URL:\s*postgresql:\/\/support:support@postgres:5432\/support_communication/);
  });

  it("exposes the bootstrap:local script in package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.scripts["bootstrap:local"], "node --env-file=.env.example scripts/bootstrap-local.mjs");
    assert.equal(pkg.scripts["pilot:bootstrap"], undefined);
  });

  it("keeps the TypeScript seed runner available after Docker production pruning", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    assert.match(pkg.scripts["prisma:seed"], /--import tsx/);
    assert.equal(typeof pkg.dependencies?.tsx, "string");
    assert.equal(pkg.devDependencies?.tsx, undefined);
  });

  it("points local backend env defaults at the docker compose PostgreSQL host port", () => {
    const compose = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");
    const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

    const [, hostPort] = compose.match(/"(\d+):5432"/) ?? [];
    assert.equal(hostPort, "56432");
    assert.match(envExample, new RegExp(`^DATABASE_URL=postgresql://support:support@127\\.0\\.0\\.1:${hostPort}/support_communication$`, "m"));
  });
});
