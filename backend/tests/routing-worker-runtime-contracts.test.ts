import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { bootstrapRoutingState } from "../apps/api-gateway/src/routing/seed.js";
import { RoutingRepository } from "../apps/api-gateway/src/routing/routing.repository.js";
import { executeRescueReturnWorkerOnce } from "../apps/api-gateway/src/routing/rescue-return.main.js";
import {
  loadRoutingWorkerRuntimeConfig,
  runRoutingWorkerRuntime
} from "../apps/api-gateway/src/routing/routing-worker.runtime.js";
import { executeSlaTimerWorkerOnce } from "../apps/api-gateway/src/routing/sla-timer.main.js";

describe("routing worker runtime contracts", () => {
  it("claims and applies one due SLA timer job", async () => {
    const state = bootstrapRoutingState();
    state.jobs = [{
      action: "resume_sla",
      conversationId: "maria",
      id: "job_sla_runtime",
      queue: "sla-timers",
      runAt: "2026-07-11T09:00:00.000Z",
      status: "pending",
      tenantId: "tenant-volga"
    }];
    state.conversations = state.conversations.map((conversation) => conversation.id === "maria"
      ? { ...conversation, status: "paused" as const }
      : conversation);
    const repository = RoutingRepository.inMemory(state);

    const result = await executeSlaTimerWorkerOnce(repository, {
      limit: 10,
      maxAttempts: 3,
      retryBackoffMs: 1_000
    }, new Date("2026-07-11T09:01:00.000Z"));

    assert.deepEqual(result, { applied: 1, claimed: 1, deadLettered: 0, failed: 0, skipped: 0 });
    assert.equal((await repository.listJobs())[0]?.status, "completed");
    assert.equal(repository.readState().conversations.find((item) => item.id === "maria")?.status, "active");
  });

  it("dead-letters an SLA job after its attempt budget is exhausted", async () => {
    const repository = RoutingRepository.inMemory({
      ...bootstrapRoutingState(),
      conversations: [],
      jobs: [{
        action: "resume_sla",
        conversationId: "missing-conversation",
        id: "job_sla_runtime_dead_letter",
        queue: "sla-timers",
        runAt: "2026-07-11T09:00:00.000Z",
        status: "pending",
        tenantId: "tenant-volga"
      }]
    });

    const result = await executeSlaTimerWorkerOnce(repository, {
      limit: 10,
      maxAttempts: 1,
      retryBackoffMs: 1_000
    }, new Date("2026-07-11T09:01:00.000Z"));

    assert.equal(result.failed, 1);
    assert.equal(result.deadLettered, 1);
    assert.equal((await repository.listJobs())[0]?.status, "dead_lettered");
  });

  it("claims and applies one expired rescue-return job", async () => {
    const state = bootstrapRoutingState();
    const conversation = state.conversations[0];
    const operator = state.operators[0];
    assert.ok(conversation && operator);
    state.conversations = [{
      ...conversation,
      id: "rescue-runtime-conversation",
      operatorId: operator.id,
      rescue: {
        deadlineAt: new Date("2026-07-11T09:00:00.000Z").getTime(),
        durationSeconds: 240,
        nextAction: "reply_or_return_to_sla_queue",
        reason: "No operator reply during rescue",
        source: "manual",
        startedAt: new Date("2026-07-11T08:56:00.000Z").getTime(),
        state: "active"
      },
      status: "assigned",
      tenantId: "tenant-volga"
    }];
    state.jobs = [{
      action: "return_to_sla_queue",
      conversationId: "rescue-runtime-conversation",
      id: "job_rescue_runtime",
      queue: "rescue-return",
      runAt: "2026-07-11T09:00:00.000Z",
      status: "pending",
      tenantId: "tenant-volga"
    }];
    const repository = RoutingRepository.inMemory(state);

    const result = await executeRescueReturnWorkerOnce(repository, {
      limit: 10,
      maxAttempts: 3,
      retryBackoffMs: 1_000
    }, new Date("2026-07-11T09:01:00.000Z"));

    assert.deepEqual(result, { applied: 1, claimed: 1, deadLettered: 0, failed: 0, skipped: 0 });
    assert.equal((await repository.listJobs())[0]?.status, "completed");
  });

  it("dead-letters a rescue-return job after its attempt budget is exhausted", async () => {
    const state = bootstrapRoutingState();
    state.jobs = [{
      action: "return_to_sla_queue",
      conversationId: state.conversations[0]?.id,
      id: "job_rescue_runtime_dead_letter",
      queue: "rescue-return",
      runAt: "2026-07-11T09:00:00.000Z",
      status: "pending",
      tenantId: "tenant-volga"
    }];
    const repository = RoutingRepository.inMemory(state);
    repository.applyRescueReturnTransition = async () => {
      throw new Error("database_unavailable");
    };

    const result = await executeRescueReturnWorkerOnce(repository, {
      limit: 10,
      maxAttempts: 1,
      retryBackoffMs: 1_000
    }, new Date("2026-07-11T09:01:00.000Z"));

    assert.equal(result.failed, 1);
    assert.equal(result.deadLettered, 1);
    assert.equal((await repository.listJobs())[0]?.status, "dead_lettered");
  });

  it("stops the sequential runtime promptly when aborted", async () => {
    const controller = new AbortController();
    let runs = 0;
    await runRoutingWorkerRuntime({
      config: { healthPort: 0, intervalMs: 60_000, leaseMs: 30_000, once: false, workerId: "runtime-abort-test" },
      executeOnce: async () => {
        runs += 1;
        controller.abort();
        return { applied: 0, claimed: 0, deadLettered: 0, failed: 0, skipped: 0 };
      },
      serviceName: "routing-worker-test",
      signal: controller.signal
    });
    assert.equal(runs, 1);
  });

  it("loads bounded defaults and explicit environment settings", () => {
    assert.deepEqual(loadRoutingWorkerRuntimeConfig({
      SLA_TIMER_WORKER_HEALTH_PORT: "4120",
      SLA_TIMER_WORKER_INTERVAL_MS: "2500",
      SLA_TIMER_WORKER_LEASE_MS: "45000",
      SLA_TIMER_WORKER_ID: "sla-worker-test",
      SLA_TIMER_WORKER_ONCE: "true"
    }, [], "SLA_TIMER"), { healthPort: 4120, intervalMs: 2500, leaseMs: 45_000, once: true, workerId: "sla-worker-test" });
  });

  it("registers both workers in scripts and compose runtime", () => {
    const root = resolve(import.meta.dirname, "../..");
    const packageJson = readFileSync(resolve(root, "backend/package.json"), "utf8");
    const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");

    assert.match(packageJson, /start:sla-timer-worker/);
    assert.match(packageJson, /start:rescue-return-worker/);
    assert.match(compose, /sla-timer-worker:[\s\S]*sla-timer\.main\.js[\s\S]*\/health/);
    assert.match(compose, /rescue-return-worker:[\s\S]*rescue-return\.main\.js[\s\S]*\/health/);
    assert.doesNotMatch(compose, /ROUTING_REPOSITORY/);
  });
});
