import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateRedisUrlPolicy, verifyRedisRuntimeTopology } from "../scripts/production-redis-policy.mjs";

const internalPlaintextEnv = Object.freeze({
  REDIS_ALLOW_PLAINTEXT_ON_INTERNAL_DOCKER_NETWORK: "true",
  REDIS_INTERNAL_DOCKER_NETWORK: "support-communication-backend",
  REDIS_URL: "redis://:never-print-this-password@redis:6379"
});

function result(stdout, status = 0) {
  return { status, stdout };
}

function createDockerFixture({ publishedPorts = false } = {}) {
  return (args) => {
    const command = args.join(" ");
    if (command.startsWith("network inspect ")) {
      return result(JSON.stringify([{ Attachable: false, Driver: "bridge", Ingress: false, Internal: true }]));
    }
    if (command.startsWith("ps --filter ")) return result("redis-id\napi-id\n");
    if (command.includes(".Config.Labels") && command.endsWith("redis-id")) {
      return result(JSON.stringify({ "com.docker.compose.service": "redis" }));
    }
    if (command.includes(".Config.Labels") && command.endsWith("api-id")) {
      return result(JSON.stringify({ "com.docker.compose.service": "api-gateway" }));
    }
    if (command.includes(".NetworkSettings.Networks") && command.endsWith("redis-id")) {
      return result(JSON.stringify({
        "support-communication-backend": { Aliases: ["redis", "redis-id"] }
      }));
    }
    if (command.includes(".NetworkSettings.Networks") && command.endsWith("api-id")) {
      return result(JSON.stringify({
        "support-communication-backend": { Aliases: ["api-gateway", "api-id"] }
      }));
    }
    if (command.includes(".HostConfig.PortBindings") && command.endsWith("redis-id")) {
      return result(JSON.stringify(publishedPorts ? { "6379/tcp": [{ HostIp: "127.0.0.1", HostPort: "6379" }] } : {}));
    }
    return result("", 1);
  };
}

describe("production Redis transport policy", () => {
  it("accepts TLS without a local exception", () => {
    assert.deepEqual(validateRedisUrlPolicy({ REDIS_URL: "rediss://:secret@redis.example.internal:6379" }), []);
  });

  it("requires an explicit runtime proof for plaintext Redis", () => {
    const issues = validateRedisUrlPolicy(internalPlaintextEnv);
    assert.ok(issues.some((issue) => issue.includes("--verify-runtime")));
  });

  it("accepts only the exact flag, Docker hostname, credentials and port", () => {
    assert.deepEqual(validateRedisUrlPolicy(internalPlaintextEnv, { verifyRuntime: true }), []);
    const issues = validateRedisUrlPolicy({
      ...internalPlaintextEnv,
      REDIS_ALLOW_PLAINTEXT_ON_INTERNAL_DOCKER_NETWORK: "TRUE",
      REDIS_URL: "redis://10.0.0.4:6380"
    }, { verifyRuntime: true });
    assert.ok(issues.some((issue) => issue.includes("exactly true")));
    assert.ok(issues.some((issue) => issue.includes("Docker DNS hostname redis")));
    assert.ok(issues.some((issue) => issue.includes("requires credentials")));
    assert.ok(issues.some((issue) => issue.includes("port 6379")));
  });

  it("proves the current internal, non-published Docker topology", () => {
    assert.deepEqual(verifyRedisRuntimeTopology(internalPlaintextEnv, createDockerFixture()), []);
  });

  it("rejects any published Redis binding without leaking credentials", () => {
    const issues = verifyRedisRuntimeTopology(internalPlaintextEnv, createDockerFixture({ publishedPorts: true }));
    assert.ok(issues.some((issue) => issue.includes("published host ports")));
    assert.doesNotMatch(issues.join("\n"), /never-print-this-password|redis:\/\//);
  });

  it("fails closed when Docker inspection is unavailable", () => {
    const issues = verifyRedisRuntimeTopology(internalPlaintextEnv, () => result("", 1));
    assert.deepEqual(issues, ["Docker network inspection failed"]);
  });
});
