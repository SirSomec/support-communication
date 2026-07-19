import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const composePath = "deploy/compose/compose.production.yml";
const exampleEnvPath = "deploy/env/production.env.example";

describe("production deployment contract", () => {
  it("validates the standalone production compose schema", () => {
    const result = spawnSync(process.execPath, ["scripts/production-config-preflight.mjs", "--schema-only", exampleEnvPath], {
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
  });

  it("keeps local infrastructure and credentials out of the production manifest", () => {
    const compose = readFileSync(composePath, "utf8");
    assert.doesNotMatch(compose, /kubernetes\.docker\.internal|mailpit|minio-password|support:support|bootstrap:local/i);
    assert.doesNotMatch(compose, /^\s+(postgres|redis|minio):\s*$/m);
    assert.match(compose, /NODE_ENV:\s*production/);
    assert.match(compose, /OPENAPI_ENABLED:\s*"false"/);
    assert.match(compose, /read_only:\s*true/);
    assert.match(compose, /cap_drop:\s*\["ALL"\]/);
  });

  it("bounds request bodies, headers and slow connections at the TLS edge", () => {
    const caddyfile = readFileSync("deploy/caddy/Caddyfile", "utf8");
    assert.match(caddyfile, /max_size\s+64MB/);
    assert.match(caddyfile, /max_header_size\s+64KB/);
    assert.match(caddyfile, /read_header\s+10s/);
    assert.match(caddyfile, /read_body\s+60s/);
    assert.match(caddyfile, /write\s+120s/);
  });

  it("publishes host ports only from the TLS edge service", () => {
    const result = spawnSync("docker", ["compose", "--env-file", exampleEnvPath, "-f", composePath, "config", "--format", "json"], {
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    const published = Object.entries(config.services).filter(([, service]) => Array.isArray(service.ports) && service.ports.length);
    assert.deepEqual(published.map(([name]) => name), ["edge"]);
  });

  it("gives every production worker an internal healthcheck", () => {
    const result = spawnSync("docker", ["compose", "--env-file", exampleEnvPath, "-f", composePath, "config", "--format", "json"], {
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    const workers = Object.entries(config.services).filter(([name]) => name.endsWith("-worker"));
    assert.ok(workers.length >= 10);
    for (const [name, service] of workers) {
      assert.ok(service.healthcheck?.test, `${name} must define a healthcheck`);
    }
    for (const name of ["notification-delivery-worker", "webhook-delivery-worker", "outbox-worker", "file-scan-scanner-worker"]) {
      assert.ok(config.services[name].command.includes("./scripts/worker-health-runtime.mjs"), `${name} must preload the common heartbeat runtime`);
    }
  });

  it("builds non-root production runtime and dedicated migration targets", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    assert.match(dockerfile, /AS frontend-production/);
    assert.match(dockerfile, /AS backend-migrations/);
    assert.match(dockerfile, /ENV NODE_ENV=production/);
    assert.match(dockerfile, /USER node/);
  });

  it("provides a scheduled production backup with checksums and independent offsite storage", () => {
    const backup = readFileSync("scripts/production-backup.mjs", "utf8");
    const service = readFileSync("deploy/systemd/support-communication-backup.service", "utf8");
    const timer = readFileSync("deploy/systemd/support-communication-backup.timer", "utf8");
    assert.match(backup, /pg_dump/);
    assert.match(backup, /sha256/);
    assert.match(backup, /BACKUP_OFFSITE_ENDPOINT/);
    assert.match(backup, /backup_offsite_destination_must_differ_from_source/);
    assert.match(service, /NoNewPrivileges=true/);
    assert.match(timer, /OnCalendar=/);
    assert.match(timer, /Persistent=true/);
  });
});
