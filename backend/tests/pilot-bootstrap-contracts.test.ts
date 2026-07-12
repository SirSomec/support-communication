import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

describe("pilot bootstrap", () => {
  it("defines pilot compose overlay with prisma repositories", () => {
    const compose = readFileSync(new URL("../../docker-compose.pilot.yml", import.meta.url), "utf8");
    assert.match(compose, /profiles:\s*\[\s*"prisma-postgres"\s*\]/);
    assert.match(compose, /IDENTITY_REPOSITORY:\s*prisma/);
    assert.match(compose, /BILLING_REPOSITORY:\s*prisma/);
    assert.match(compose, /CONVERSATION_REPOSITORY:\s*prisma/);
    assert.match(compose, /WORKSPACE_REPOSITORY:\s*prisma/);
    assert.match(compose, /ROUTING_REPOSITORY:\s*prisma/);
    assert.match(compose, /OPERATIONS_REPOSITORY:\s*prisma/);
    assert.match(compose, /PLATFORM_REPOSITORY:\s*prisma/);
    assert.match(compose, /RUNTIME_PROFILE:\s*production-like/);
    assert.doesNotMatch(compose, /ALLOW_DEMO_SERVICE_ADMIN_HEADERS:\s*"true"/);
  });

  it("runs pilot bootstrap before the API gateway starts in the pilot compose overlay", () => {
    const compose = readFileSync(new URL("../../docker-compose.pilot.yml", import.meta.url), "utf8");

    assert.match(compose, /pilot-bootstrap:/);
    assert.match(compose, /command:\s*\[\s*"npm",\s*"run",\s*"pilot:bootstrap"\s*\]/);
    assert.match(compose, /api-gateway:[\s\S]*pilot-bootstrap:[\s\S]*condition:\s*service_completed_successfully/);
    assert.match(compose, /pilot-bootstrap:[\s\S]*DATABASE_URL:\s*postgresql:\/\/support:support@postgres:5432\/support_communication/);
  });

  it("exposes pilot-bootstrap script in package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.scripts["pilot:bootstrap"], "node --env-file=.env.example scripts/pilot-bootstrap.mjs");
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
