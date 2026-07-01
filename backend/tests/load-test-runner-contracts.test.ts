import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLoadTestRunErrorSummary,
  buildLoadTestRunMetrics,
  claimQueuedLoadTestRuns,
  createDeterministicHttpLoadTestRunnerAdapter,
  createDeterministicRealtimeLoadTestRunnerAdapter,
  createLoadTestRunnerFailureEnvelope,
  executeLoadTestOperation,
  getLoadTestRunErrorSummary,
  getLoadTestRunMetrics,
  getLoadTestRunStatus,
  LOAD_TEST_OPERATION_SCHEMA_VERSION,
  makeLoadTestRunId,
  parseLoadTestRunnerRuntimeConfig,
  persistLoadTestRunErrorSummary,
  persistLoadTestRunMetrics,
  planLoadTestOperationDescriptor,
  planLoadTestOperationDescriptors,
  seedLoadTestRunExecution,
  transitionLoadTestRunStatus
} from "../apps/api-gateway/src/operations/load-test-runner.worker.ts";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.ts";

describe("load test runner worker contracts", () => {
  it("defines load-test runner worker contracts for dialog operation descriptors", () => {
    const descriptor = planLoadTestOperationDescriptor({
      runId: "load_test_dialogs_001",
      tenantId: "tenant-volga",
      traceId: "trc_load_test_dialogs",
      workflow: "dialogs"
    });

    assert.equal(descriptor.workflow, "dialogs");
    assert.equal(descriptor.method, "POST");
    assert.equal(descriptor.path, "/api/v1/dialogs");
    assert.equal(descriptor.transport, "http");
    assert.equal(descriptor.schemaVersion, LOAD_TEST_OPERATION_SCHEMA_VERSION);
    assert.equal(descriptor.status, "queued");
    assert.equal(descriptor.runId, "load_test_dialogs_001");
    assert.equal(descriptor.tenantId, "tenant-volga");
    assert.equal(descriptor.traceId, "trc_load_test_dialogs");
    assert.equal(descriptor.summary.operation, "dialog.create");
    assert.equal(descriptor.summary.channel, "SDK");
  });

  it("defines load-test runner worker contracts for message-send operation descriptors", () => {
    const descriptor = planLoadTestOperationDescriptor({
      runId: "load_test_message_send_001",
      tenantId: "tenant-volga",
      traceId: "trc_load_test_message_send",
      workflow: "message-send"
    });

    assert.equal(descriptor.workflow, "message-send");
    assert.equal(descriptor.method, "POST");
    assert.equal(descriptor.path, "/api/v1/dialogs/{conversationId}/messages");
    assert.equal(descriptor.summary.operation, "message.send");
  });

  it("defines load-test runner worker contracts for webhook-delivery operation descriptors", () => {
    const descriptor = planLoadTestOperationDescriptor({
      runId: "load_test_webhook_001",
      tenantId: "tenant-volga",
      traceId: "trc_load_test_webhook",
      workflow: "webhook-delivery"
    });

    assert.equal(descriptor.workflow, "webhook-delivery");
    assert.equal(descriptor.path, "/api/v1/integrations/webhooks/deliveries");
    assert.equal(descriptor.summary.operation, "webhook.delivery");
  });

  it("defines load-test runner worker contracts for report-export operation descriptors", () => {
    const descriptor = planLoadTestOperationDescriptor({
      runId: "load_test_report_export_001",
      tenantId: "tenant-volga",
      traceId: "trc_load_test_report_export",
      workflow: "report-export"
    });

    assert.equal(descriptor.workflow, "report-export");
    assert.equal(descriptor.path, "/api/v1/reports/exports");
    assert.equal(descriptor.summary.operation, "report.export");
  });

  it("defines load-test runner worker contracts for realtime fan-out operation descriptors", () => {
    const descriptor = planLoadTestOperationDescriptor({
      runId: "load_test_realtime_001",
      tenantId: "tenant-volga",
      traceId: "trc_load_test_realtime",
      workflow: "realtime-fanout"
    });

    assert.equal(descriptor.workflow, "realtime-fanout");
    assert.equal(descriptor.method, "GET");
    assert.equal(descriptor.path, "/api/v1/realtime/events/stream");
    assert.equal(descriptor.transport, "realtime");
    assert.equal(descriptor.summary.operation, "realtime.fanout");
  });

  it("defines load-test runner worker contracts for dead-letter replay operation descriptors", () => {
    const descriptor = planLoadTestOperationDescriptor({
      runId: "load_test_dead_letter_replay_001",
      tenantId: "tenant-volga",
      traceId: "trc_load_test_dead_letter_replay",
      workflow: "dead-letter-replay"
    });

    assert.equal(descriptor.workflow, "dead-letter-replay");
    assert.equal(descriptor.method, "POST");
    assert.equal(descriptor.path, "/api/v1/operations/dead-letter/replay");
    assert.equal(descriptor.transport, "http");
    assert.equal(descriptor.summary.operation, "dead_letter.replay");
  });

  it("implements deterministic HTTP operation runner adapter", async () => {
    const responses = new Map([
      ["webhook-delivery", { durationMs: 88, statusCode: 503 }]
    ]);
    const httpRunner = createDeterministicHttpLoadTestRunnerAdapter({ responses });
    const descriptor = planLoadTestOperationDescriptor({
      runId: "load_test_http_adapter",
      tenantId: "tenant-volga",
      traceId: "trc_load_test_http_adapter",
      workflow: "webhook-delivery"
    });

    const failed = await httpRunner.execute({
      baseUrl: "http://127.0.0.1:4100",
      descriptor
    });
    assert.equal(failed.durationMs, 88);
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.ok, false);

    const success = await httpRunner.execute({
      baseUrl: "http://127.0.0.1:4100",
      descriptor: planLoadTestOperationDescriptor({
        runId: "load_test_http_adapter",
        tenantId: "tenant-volga",
        traceId: "trc_load_test_http_adapter",
        workflow: "dialogs"
      })
    });
    assert.equal(success.ok, true);
    assert.equal(success.statusCode, 200);
    assert.ok(success.durationMs >= 40);
  });

  it("implements deterministic realtime fan-out runner adapter", async () => {
    const realtimeRunner = createDeterministicRealtimeLoadTestRunnerAdapter({
      deliveredEvents: 5,
      durationMs: 72,
      ok: true
    });
    const descriptor = planLoadTestOperationDescriptor({
      runId: "load_test_realtime_adapter",
      tenantId: "tenant-volga",
      traceId: "trc_load_test_realtime_adapter",
      workflow: "realtime-fanout"
    });

    const result = await realtimeRunner.execute({ descriptor });
    assert.equal(result.deliveredEvents, 5);
    assert.equal(result.durationMs, 72);
    assert.equal(result.ok, true);
  });

  it("persists load-test run status transitions", () => {
    const repository = OperationsRepository.inMemory();
    const runId = makeLoadTestRunId();
    seedLoadTestRunExecution({
      operationsRepository: repository,
      runId,
      scenarioId: "lt-critical-flows",
      targetRps: 420,
      tenantId: "tenant-volga",
      traceId: "trc_load_test_status",
      workflows: ["dialogs"]
    });

    const claimed = claimQueuedLoadTestRuns({
      limit: 1,
      now: new Date("2026-07-01T09:00:00.000Z"),
      operationsRepository: repository
    });
    assert.equal(claimed.claimed.length, 1);
    assert.equal(claimed.claimed[0].status, "running");
    assert.equal(claimed.claimed[0].startedAt, "2026-07-01T09:00:00.000Z");

    const completed = transitionLoadTestRunStatus(
      repository,
      runId,
      "completed",
      new Date("2026-07-01T09:30:00.000Z")
    );
    assert.equal(completed.status, "completed");
    assert.equal(completed.completedAt, "2026-07-01T09:30:00.000Z");
    assert.equal(getLoadTestRunStatus(repository, runId)?.status, "completed");
  });

  it("persists load-test run metrics", () => {
    const repository = OperationsRepository.inMemory();
    const runId = makeLoadTestRunId();
    const metrics = buildLoadTestRunMetrics({
      operationResults: [
        {
          descriptor: planLoadTestOperationDescriptor({
            runId,
            tenantId: "tenant-volga",
            traceId: "trc_metrics",
            workflow: "dialogs"
          }),
          durationMs: 120,
          errorCode: null,
          ok: true
        },
        {
          descriptor: planLoadTestOperationDescriptor({
            runId,
            tenantId: "tenant-volga",
            traceId: "trc_metrics",
            workflow: "webhook-delivery"
          }),
          durationMs: 240,
          errorCode: "http_status_503",
          ok: false
        }
      ],
      runId,
      targetRps: 420
    });

    persistLoadTestRunMetrics(repository, metrics);
    const persisted = getLoadTestRunMetrics(repository, runId);

    assert.equal(persisted?.totalOperations, 2);
    assert.equal(persisted?.completedOperations, 1);
    assert.equal(persisted?.failedOperations, 1);
    assert.equal(persisted?.targetRps, 420);
    assert.equal(persisted?.workflowBreakdown.dialogs.completed, 1);
    assert.equal(persisted?.workflowBreakdown["webhook-delivery"].failed, 1);
  });

  it("persists load-test run error summaries", () => {
    const repository = OperationsRepository.inMemory();
    const runId = makeLoadTestRunId();
    const errorSummary = buildLoadTestRunErrorSummary({
      operationResults: [
        {
          descriptor: planLoadTestOperationDescriptor({
            runId,
            tenantId: "tenant-volga",
            traceId: "trc_error_summary",
            workflow: "webhook-delivery"
          }),
          durationMs: 90,
          errorCode: "http_status_503",
          ok: false
        },
        {
          descriptor: planLoadTestOperationDescriptor({
            runId,
            tenantId: "tenant-volga",
            traceId: "trc_error_summary",
            workflow: "webhook-delivery"
          }),
          durationMs: 95,
          errorCode: "http_status_503",
          ok: false
        }
      ],
      runId
    });

    persistLoadTestRunErrorSummary(repository, errorSummary);
    const persisted = getLoadTestRunErrorSummary(repository, runId);

    assert.equal(persisted?.sanitized, true);
    assert.equal(persisted?.totalFailures, 2);
    assert.deepEqual(persisted?.topFailures, [{
      code: "http_status_503",
      count: 2,
      workflow: "webhook-delivery"
    }]);
  });

  it("wires load-test runner runtime worker config", () => {
    const config = parseLoadTestRunnerRuntimeConfig({
      LOAD_TEST_RUNNER_BASE_URL: "http://127.0.0.1:4200/",
      LOAD_TEST_RUNNER_ENABLED: "true",
      LOAD_TEST_RUNNER_MAX_OPERATIONS: "12",
      LOAD_TEST_RUNNER_TENANT_ID: "tenant-ops",
      LOAD_TEST_RUNNER_TIMEOUT_MS: "8000"
    });

    assert.equal(config.enabled, true);
    assert.equal(config.baseUrl, "http://127.0.0.1:4200");
    assert.equal(config.tenantId, "tenant-ops");
    assert.equal(config.timeoutMs, 8000);
    assert.equal(config.maxOperationsPerRun, 12);

    assert.throws(
      () => parseLoadTestRunnerRuntimeConfig({ LOAD_TEST_RUNNER_BASE_URL: "not-a-url" }),
      /load_test_runner_base_url_invalid/
    );
  });

  it("adds load-test runner failure envelope tests", () => {
    const envelope = createLoadTestRunnerFailureEnvelope(
      "executeLoadTestOperation",
      new Error("Bearer sk-live-secret failed for tenant-volga"),
      "trc_load_test_failure"
    );

    assert.equal(envelope.operation, "executeLoadTestOperation");
    assert.equal(envelope.sanitized, true);
    assert.equal(envelope.traceId, "trc_load_test_failure");
    assert.equal(envelope.code, "load_test_runner_failed");
    assert.match(envelope.message, /Bearer \[REDACTED:api_key\]/);
    assert.doesNotMatch(envelope.message, /sk-live-secret/);
  });

  it("adds load-test runner status read-side tests", async () => {
    const repository = OperationsRepository.inMemory();
    const runId = makeLoadTestRunId();
    seedLoadTestRunExecution({
      operationsRepository: repository,
      runId,
      scenarioId: "lt-critical-flows",
      targetRps: 420,
      tenantId: "tenant-volga",
      traceId: "trc_load_test_readside_status",
      workflows: ["dialogs", "message-send"]
    });

    const status = getLoadTestRunStatus(repository, runId);
    assert.equal(status?.runId, runId);
    assert.equal(status?.status, "queued");
    assert.equal(status?.operations.length, 2);
    assert.deepEqual(
      status?.operations.map((operation) => (operation as { workflow: string }).workflow),
      ["dialogs", "message-send"]
    );

    claimQueuedLoadTestRuns({
      limit: 1,
      now: new Date("2026-07-01T10:00:00.000Z"),
      operationsRepository: repository
    });
    assert.equal(getLoadTestRunStatus(repository, runId)?.status, "running");
  });

  it("adds load-test runner metrics read-side tests", () => {
    const repository = OperationsRepository.inMemory();
    const runId = makeLoadTestRunId();
    const metrics = buildLoadTestRunMetrics({
      operationResults: planLoadTestOperationDescriptors({
        runId,
        tenantId: "tenant-volga",
        traceId: "trc_load_test_readside_metrics",
        workflows: ["report-export"]
      }).map((descriptor) => ({
        descriptor,
        durationMs: 150,
        errorCode: null,
        ok: true
      })),
      runId,
      targetRps: 80
    });
    persistLoadTestRunMetrics(repository, metrics);

    const readside = getLoadTestRunMetrics(repository, runId);
    assert.equal(readside?.runId, runId);
    assert.equal(readside?.observedRps, 6.67);
    assert.equal(readside?.workflowBreakdown["report-export"].completed, 1);
  });

  it("adds load-test runner error-summary read-side tests", () => {
    const repository = OperationsRepository.inMemory();
    const runId = makeLoadTestRunId();
    const errorSummary = buildLoadTestRunErrorSummary({
      operationResults: [{
        descriptor: planLoadTestOperationDescriptor({
          runId,
          tenantId: "tenant-volga",
          traceId: "trc_load_test_readside_errors",
          workflow: "realtime-fanout"
        }),
        durationMs: 60,
        errorCode: "realtime_fanout_failed",
        ok: false
      }],
      runId
    });
    persistLoadTestRunErrorSummary(repository, errorSummary);

    const readside = getLoadTestRunErrorSummary(repository, runId);
    assert.equal(readside?.runId, runId);
    assert.equal(readside?.sanitized, true);
    assert.equal(readside?.topFailures[0]?.workflow, "realtime-fanout");
  });

  it("executes one HTTP and one realtime operation through the worker boundary", async () => {
    const repository = OperationsRepository.inMemory();
    const runId = makeLoadTestRunId();
    seedLoadTestRunExecution({
      operationsRepository: repository,
      runId,
      scenarioId: "lt-critical-flows",
      targetRps: 420,
      tenantId: "tenant-volga",
      traceId: "trc_load_test_execute",
      workflows: ["dialogs", "realtime-fanout"]
    });
    const descriptors = planLoadTestOperationDescriptors({
      runId,
      tenantId: "tenant-volga",
      traceId: "trc_load_test_execute",
      workflows: ["dialogs", "realtime-fanout"]
    });
    const httpRunner = createDeterministicHttpLoadTestRunnerAdapter();
    const realtimeRunner = createDeterministicRealtimeLoadTestRunnerAdapter();

    const httpResult = await executeLoadTestOperation({
      baseUrl: "http://127.0.0.1:4100",
      descriptor: descriptors[0],
      httpRunner,
      realtimeRunner
    });
    const realtimeResult = await executeLoadTestOperation({
      baseUrl: "http://127.0.0.1:4100",
      descriptor: descriptors[1],
      httpRunner,
      realtimeRunner
    });

    assert.equal(httpResult.ok, true);
    assert.equal(httpResult.descriptor.status, "completed");
    assert.equal(realtimeResult.ok, true);
    assert.equal(realtimeResult.descriptor.status, "completed");

    const metrics = persistLoadTestRunMetrics(repository, buildLoadTestRunMetrics({
      operationResults: [httpResult, realtimeResult],
      runId,
      targetRps: 420
    }));
    const errorSummary = persistLoadTestRunErrorSummary(repository, buildLoadTestRunErrorSummary({
      operationResults: [httpResult, realtimeResult],
      runId
    }));
    transitionLoadTestRunStatus(repository, runId, "completed");

    assert.equal(metrics.totalOperations, 2);
    assert.equal(errorSummary.totalFailures, 0);
    assert.equal(getLoadTestRunStatus(repository, runId)?.status, "completed");
  });
});
