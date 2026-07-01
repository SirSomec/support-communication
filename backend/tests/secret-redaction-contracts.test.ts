import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOutboxEvent, InMemoryOutboxStore } from "@support-communication/events";
import { createEnvelope, redactExportedDescriptor } from "@support-communication/envelope";
import { formatStructuredLog } from "@support-communication/observability";
import { InMemoryBillingSyncJobStore } from "@support-communication/database";
import {
  assertLogRecordsDoNotLeakCanonicalSecrets,
  canonicalSecretBearingFixtures,
  canonicalSecretNeedles,
  type CanonicalSecretCategory
} from "../packages/testing/src/index.ts";
import { OperationsReadinessService } from "../apps/api-gateway/src/operations/operations-readiness.service.ts";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.ts";
import { ReportService } from "../apps/api-gateway/src/reports/report.service.ts";

describe("secret redaction verification contracts", () => {
  it("exposes canonical secret-bearing fixtures for every redaction gate", () => {
    const requiredCategories: CanonicalSecretCategory[] = [
      "api_key",
      "provider_token",
      "webhook_signature",
      "object_key"
    ];
    const fixtures = Object.values(canonicalSecretBearingFixtures);

    assert.deepEqual(new Set(fixtures.map((fixture) => fixture.category)), new Set(requiredCategories));
    assert.equal(fixtures.length, requiredCategories.length);
    assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);

    for (const fixture of fixtures) {
      assert.equal(typeof fixture.raw, "string");
      assert.ok(fixture.raw.length >= 24, `${fixture.id} raw secret must be long enough to avoid accidental matches`);
      assert.notEqual(fixture.redacted, fixture.raw);
      assert.match(fixture.redacted, /\[REDACTED:[a-z_]+\]/);
    }
  });

  it("provides raw needles and secret-bearing carriers for upcoming log, envelope and export checks", () => {
    const fixtures = Object.values(canonicalSecretBearingFixtures);

    for (const fixture of fixtures) {
      assert.ok(canonicalSecretNeedles.includes(fixture.raw), `${fixture.id} raw value must be a canonical needle`);
      assert.equal(fixture.carriers.some((carrier) => carrier.value.includes(fixture.raw)), true);
      assert.equal(fixture.carriers.some((carrier) => carrier.surface === "log"), true);
      assert.equal(fixture.carriers.some((carrier) => carrier.surface === "envelope"), true);
      assert.equal(fixture.carriers.some((carrier) => carrier.surface === "provider_failure"), true);
      assert.equal(fixture.carriers.some((carrier) => carrier.surface === "export_descriptor"), true);
    }

    assert.equal(canonicalSecretNeedles.length, new Set(canonicalSecretNeedles).size);
  });

  it("redacts every canonical carrier in structured log free text while preserving ordinary routes", () => {
    const line = formatStructuredLog("warn", "canonical redaction coverage", {
      carriers: Object.values(canonicalSecretBearingFixtures).flatMap((fixture) =>
        fixture.carriers.map((carrier) => carrier.value)
      ),
      operation: "redactionCoverage",
      reportRoute: "/api/v1/reports/export-2418/download",
      reportUrl: "https://app.local/reports/usage",
      service: "observability"
    });

    assertLogRecordsDoNotLeakCanonicalSecrets([line]);
    const parsed = JSON.parse(line) as { reportRoute: string; reportUrl: string };
    assert.equal(parsed.reportRoute, "/api/v1/reports/export-2418/download");
    assert.equal(parsed.reportUrl, "https://app.local/reports/usage");
  });

  it("redacts worker and adapter failure persistence before storing lastError", async () => {
    const rawFailure = Object.values(canonicalSecretBearingFixtures)
      .flatMap((fixture) => fixture.carriers.map((carrier) => carrier.value))
      .join(" | ");
    const outboxStore = new InMemoryOutboxStore();
    const outboxEvent = await outboxStore.append(createOutboxEvent({
      aggregateId: "failure-redaction",
      aggregateType: "messageDelivery",
      payload: {},
      queue: "message-delivery",
      traceId: "trc_failure_redaction",
      type: "message.delivery.requested"
    }));
    const billingStore = new InMemoryBillingSyncJobStore([{
      actor: "system",
      actorName: "System",
      attempts: 0,
      auditEventId: "audit_failure_redaction",
      createdAt: new Date("2026-06-29T00:00:00.000Z").toISOString(),
      deadLetteredAt: null,
      deadLetterReplayAuditEvents: [],
      fromPlanId: "starter",
      id: "billing_failure_redaction",
      lastError: null,
      lockedAt: null,
      nextAttemptAt: null,
      payload: {},
      publishedAt: null,
      queue: "billing-provider-sync",
      reason: "provider sync",
      status: "pending",
      tenantId: "tenant-volga",
      toPlanId: "pro",
      traceId: "trc_billing_failure_redaction"
    }]);

    const failedOutbox = await outboxStore.markFailed(outboxEvent.id, new Error(rawFailure));
    const failedBilling = await billingStore.markFailed("billing_failure_redaction", rawFailure);

    assertLogRecordsDoNotLeakCanonicalSecrets([
      failedOutbox.lastError ?? "",
      failedBilling.lastError ?? ""
    ]);
    assert.match(failedOutbox.lastError ?? "", /\[REDACTED:api_key\]/);
    assert.match(failedBilling.lastError ?? "", /\[REDACTED:object_key\]/);
  });

  it("verifies runtime bootstrap, worker failure and provider adapter logs against canonical secret needles", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const logs: string[] = [];
    const writeLog = (level: string, message: string, context: Record<string, unknown>) => {
      logs.push(formatStructuredLog(level as "debug" | "info" | "warn" | "error", message, {
        service: String(context.service ?? "outbox-worker"),
        ...context
      }));
    };

    logs.push(formatStructuredLog("info", "runtime bootstrap", {
      configuration: {
        OUTBOX_TELEGRAM_BOT_TOKEN: canonicalSecretBearingFixtures.providerToken.raw
      },
      operation: "loadRuntimeConfig",
      service: "outbox-worker"
    }));
    const bootstrapHandlers = worker.createRuntimeOutboxHandlers({
      env: {
        OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
        OUTBOX_TELEGRAM_BOT_TOKEN: canonicalSecretBearingFixtures.providerToken.raw,
        OUTBOX_TELEGRAM_ENABLED: "true"
      },
      writeLog
    });
    const bootstrapStore = new InMemoryOutboxStore();
    const bootstrapEvent = await bootstrapStore.append(createOutboxEvent({
      aggregateId: "tenant-log-bootstrap",
      aggregateType: "tenant",
      payload: {},
      traceId: "trc_log_bootstrap",
      type: "tenant.status.changed"
    }));
    await bootstrapHandlers["tenant.status.changed"]?.(bootstrapEvent);

    logs.push(formatStructuredLog("error", "worker handler failed", {
      authorization: canonicalSecretBearingFixtures.publicApiKey.carriers[0].value,
      operation: "handleOutboxEvent",
      payload: { signature: canonicalSecretBearingFixtures.webhookSignature.raw },
      service: "outbox-worker"
    }));

    logs.push(formatStructuredLog("error", "export descriptor failed", {
      objectKey: canonicalSecretBearingFixtures.objectKey.raw,
      operation: "writeExportDescriptor",
      service: "outbox-worker"
    }));

    logs.push(formatStructuredLog("error", "provider adapter exception", {
      detail: canonicalSecretBearingFixtures.providerToken.carriers[0].value,
      failure: canonicalSecretBearingFixtures.providerToken.carriers[2].value,
      operation: "deliverMessage",
      service: "outbox-worker"
    }));

    const providerFailureStore = new InMemoryOutboxStore();
    await providerFailureStore.append(createOutboxEvent({
      aggregateId: "tg-runtime-chat",
      aggregateType: "conversation",
      payload: { descriptorId: "canonical_provider_log_failure" },
      queue: "message-delivery",
      traceId: "trc_log_provider_failure",
      type: "message.delivery.requested"
    }));
    const providerHandlers = worker.createRuntimeOutboxHandlers({
      env: {
        OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
        OUTBOX_TELEGRAM_BOT_TOKEN: canonicalSecretBearingFixtures.providerToken.raw,
        OUTBOX_TELEGRAM_ENABLED: "true"
      },
      fetcher: async () => {
        throw new Error(canonicalSecretBearingFixtures.providerToken.carriers[2].value);
      },
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "Telegram",
          conversationId: "tg-runtime-chat",
          id: "canonical_provider_log_failure",
          idempotencyKey: "canonical-provider-log-failure",
          kind: "message_delivery",
          messageId: "msg_canonical_provider_log_failure",
          payload: { text: "Runtime Telegram failure" }
        })
      },
      writeLog
    });
    await worker.runOutboxWorker({
      handlers: providerHandlers,
      once: true,
      queue: "message-delivery",
      store: providerFailureStore
    });

    assertLogRecordsDoNotLeakCanonicalSecrets(logs);
    const serializedLogs = logs.join("\n");
    assert.equal(logs.some((entry) => entry.includes("channel connector dispatch failed")), true);
    assert.match(serializedLogs, /\[REDACTED:api_key\]/);
    assert.match(serializedLogs, /\[REDACTED:object_key\]/);
    assert.match(serializedLogs, /\[REDACTED:provider_token\]/);
    assert.match(serializedLogs, /\[REDACTED:webhook_signature\]/);
  });

  it("redacts canonical secrets from API, public API and service-admin denial envelopes", () => {
    const envelopes = [
      createEnvelope({
        service: "apiGateway",
        operation: "uploadFile",
        status: "error",
        meta: {
          objectKey: canonicalSecretBearingFixtures.objectKey.raw
        },
        data: {
          uploadUrl: canonicalSecretBearingFixtures.objectKey.carriers[3].value
        },
        error: {
          code: "api_storage_error",
          details: { objectKey: canonicalSecretBearingFixtures.objectKey.raw },
          message: `Storage rejected objectKey=${canonicalSecretBearingFixtures.objectKey.raw}`
        }
      }),
      createEnvelope({
        service: "publicApi",
        operation: "identifyPublicClient",
        status: "denied",
        meta: {
          authorization: canonicalSecretBearingFixtures.publicApiKey.carriers[0].value
        },
        data: {
          rawKeyExposed: false,
          rejectedAuthorization: canonicalSecretBearingFixtures.publicApiKey.carriers[0].value
        },
        error: {
          code: "public_api_key_invalid",
          details: { authorization: canonicalSecretBearingFixtures.publicApiKey.carriers[0].value },
          message: `Public API key ${canonicalSecretBearingFixtures.publicApiKey.raw} is invalid.`
        }
      }),
      createEnvelope({
        service: "serviceAdmin",
        operation: "validatePermission",
        status: "denied",
        meta: {
          providerToken: canonicalSecretBearingFixtures.providerToken.carriers[0].value
        },
        data: {
          auditContext: {
            signature: canonicalSecretBearingFixtures.webhookSignature.raw
          }
        },
        error: {
          code: "permission_denied",
          details: {
            providerToken: canonicalSecretBearingFixtures.providerToken.carriers[0].value,
            signature: canonicalSecretBearingFixtures.webhookSignature.raw
          },
          message: `Service-admin denied with ${canonicalSecretBearingFixtures.providerToken.carriers[0].value} and ${canonicalSecretBearingFixtures.webhookSignature.raw}.`
        }
      })
    ];

    const serialized = JSON.stringify(envelopes);
    assertLogRecordsDoNotLeakCanonicalSecrets([serialized]);
    assert.match(serialized, /\[REDACTED:api_key\]/);
    assert.match(serialized, /\[REDACTED:object_key\]/);
    assert.match(serialized, /\[REDACTED:provider_token\]/);
    assert.match(serialized, /\[REDACTED:webhook_signature\]/);
  });

  it("preserves successful envelopes while redacting only denial and error surfaces", () => {
    const okEnvelope = createEnvelope({
      service: "apiGateway",
      operation: "debugEcho",
      status: "ok",
      meta: {
        objectKey: canonicalSecretBearingFixtures.objectKey.raw
      },
      data: {
        authorization: canonicalSecretBearingFixtures.publicApiKey.carriers[0].value
      }
    });

    assert.equal(JSON.stringify(okEnvelope).includes(canonicalSecretBearingFixtures.objectKey.raw), true);
    assert.equal(JSON.stringify(okEnvelope).includes(canonicalSecretBearingFixtures.publicApiKey.raw), true);
  });

  it("redacts provider failures for channel, webhook, status-page and scanner adapters", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const providerEvents = [
      {
        channel: "Telegram",
        descriptorId: "telegram_provider_failure",
        expectedUrl: `https://telegram.provider.example.test/bot${canonicalSecretBearingFixtures.providerToken.raw}/sendMessage`,
        queue: "message-delivery",
        type: "message.delivery.requested"
      },
      {
        channel: "VK",
        descriptorId: "vk_provider_failure",
        expectedUrl: "https://vk.provider.example.test/messages.send",
        queue: "message-delivery",
        type: "message.delivery.requested"
      },
      {
        channel: "MAX",
        descriptorId: "max_provider_failure",
        expectedUrl: "https://max.provider.example.test/messages",
        queue: "message-delivery",
        type: "message.delivery.requested"
      },
      {
        channel: "WEBHOOK",
        descriptorId: "webhook_provider_failure",
        expectedUrl: "https://webhook.provider.example.test/deliver",
        queue: "message-delivery",
        type: "message.delivery.requested"
      },
      {
        channel: "STATUS_PAGE",
        descriptorId: "status_page_provider_failure",
        expectedUrl: "https://status-page.provider.example.test/update",
        queue: "message-delivery",
        type: "message.delivery.requested"
      },
      {
        channel: "SCANNER",
        descriptorId: "scanner_provider_failure",
        expectedUrl: "https://scanner.provider.example.test/scan",
        queue: "file-scan",
        type: "attachment.upload.requested"
      }
    ] as const;
    for (const event of providerEvents) {
      await store.append(createOutboxEvent({
        aggregateId: `${event.channel.toLowerCase()}-failure`,
        aggregateType: event.type === "attachment.upload.requested" ? "workspace-file" : "conversation",
        payload: { descriptorId: event.descriptorId },
        queue: event.queue,
        traceId: `trc_${event.descriptorId}`,
        type: event.type
      }));
    }

    const logs: string[] = [];
    const fetchCalls: Array<{ body: string; url: string }> = [];
    const failureBody = [
      canonicalSecretBearingFixtures.providerToken.carriers[0].value,
      canonicalSecretBearingFixtures.providerToken.carriers[2].value,
      canonicalSecretBearingFixtures.webhookSignature.carriers[2].value,
      canonicalSecretBearingFixtures.objectKey.raw
    ].join(" ");
    logs.push(formatStructuredLog("error", "bare object-key provider failure", {
      failure: canonicalSecretBearingFixtures.objectKey.raw,
      operation: "providerFailure",
      service: "outbox-worker"
    }));
    const handlers = worker.createRuntimeOutboxHandlers({
      env: {
        OUTBOX_CHANNEL_CONNECTORS: [
          "WEBHOOK=https://webhook.provider.example.test/deliver",
          "STATUS_PAGE=https://status-page.provider.example.test/update"
        ].join(";"),
        OUTBOX_FILE_SCAN_URL: "https://scanner.provider.example.test/scan",
        OUTBOX_MAX_ENABLED: "true",
        OUTBOX_MAX_ENDPOINT: "https://max.provider.example.test/messages",
        OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
        OUTBOX_TELEGRAM_BOT_TOKEN: canonicalSecretBearingFixtures.providerToken.raw,
        OUTBOX_TELEGRAM_ENABLED: "true",
        OUTBOX_VK_ENABLED: "true",
        OUTBOX_VK_ENDPOINT: "https://vk.provider.example.test/messages.send"
      },
      fetcher: async (url: string, init: { body?: string }) => {
        fetchCalls.push({ body: init.body ?? "", url });
        throw new Error(failureBody);
      },
      outboundDescriptorStore: {
        findOutboundDescriptorById: async (descriptorId: string) => {
          if (descriptorId === "scanner_provider_failure") {
            return {
              channel: "SCANNER",
              conversationId: null,
              id: descriptorId,
              idempotencyKey: "scanner-provider-failure-key",
              kind: "attachment_upload",
              messageId: null,
              payload: {
                fileId: "file_scanner_provider_failure",
                fileName: "provider-failure.pdf",
                sizeBytes: 1024
              }
            };
          }

          const channel = providerEvents.find((event) => event.descriptorId === descriptorId)?.channel ?? "WEBHOOK";
          return {
            channel,
            conversationId: `${channel.toLowerCase()}-conversation`,
            id: descriptorId,
            idempotencyKey: `${descriptorId}-key`,
            kind: "message_delivery",
            messageId: `msg_${descriptorId}`,
            payload: { text: "Provider failure redaction" }
          };
        }
      },
      writeLog: (level: string, message: string, context: Record<string, unknown>) => {
        logs.push(formatStructuredLog(level as "debug" | "info" | "warn" | "error", message, {
          service: String(context.service ?? "outbox-worker"),
          ...context
        }));
      }
    });

    const channelResult = await worker.runOutboxWorker({
      handlers,
      limit: providerEvents.filter((event) => event.queue === "message-delivery").length,
      once: true,
      queue: "message-delivery",
      store
    });
    const scannerResult = await worker.runOutboxWorker({
      handlers,
      limit: providerEvents.filter((event) => event.queue === "file-scan").length,
      once: true,
      queue: "file-scan",
      store
    });

    assert.equal(channelResult.failed + scannerResult.failed, providerEvents.length);
    const failed = await store.list({ statuses: ["failed"] });
    assert.equal(failed.length, providerEvents.length);
    assert.deepEqual(
      [...new Set(fetchCalls.map((call) => call.url))].sort(),
      providerEvents.map((event) => event.expectedUrl).sort()
    );
    assertLogRecordsDoNotLeakCanonicalSecrets([
      ...logs,
      ...failed.map((event) => event.lastError ?? "")
    ]);
    assert.equal(logs.filter((entry) => entry.includes("channel connector dispatch failed")).length, 5);
    assert.equal(logs.filter((entry) => entry.includes("file scan dispatch failed")).length, 1);
  });

  it("preserves ordinary API route paths while redacting object-key-like provider paths", () => {
    const routeLog = formatStructuredLog("error", "api route failed", {
      operation: "routeFailure",
      route: "POST /api/v1/integrations/webhooks/deliveries/dlv_1/replay",
      service: "api-gateway"
    });
    const objectKeyLog = formatStructuredLog("error", "storage provider failed", {
      failure: canonicalSecretBearingFixtures.objectKey.raw,
      operation: "storageProviderFailure",
      service: "outbox-worker"
    });

    assert.equal(routeLog.includes("/api/v1/integrations/webhooks/deliveries/dlv_1/replay"), true);
    assert.equal(objectKeyLog.includes(canonicalSecretBearingFixtures.objectKey.raw), false);
    assert.match(objectKeyLog, /\[REDACTED:object_key\]/);
  });

  it("redacts exported report, audit and restore-check descriptors", async () => {
    const reportDescriptor = await new ReportService().getExportFileDescriptor("export-2418", { canDownload: true });
    const restoreDescriptor = await new OperationsReadinessService(OperationsRepository.inMemory()).queueRestoreCheck({
      confirmed: true,
      drillId: "backup-postgres-nightly",
      idempotencyKey: "restore-redaction-live-descriptor",
      reason: "Validate restore artifact descriptor redaction"
    });
    const descriptors = [
      reportDescriptor,
      redactExportedDescriptor({
        surface: "audit_export",
        authorization: canonicalSecretBearingFixtures.publicApiKey.carriers[3].value,
        descriptorText: canonicalSecretBearingFixtures.publicApiKey.carriers[3].value,
        objectKey: "reports/audit/canonical-audit-export.csv",
        providerToken: canonicalSecretBearingFixtures.providerToken.carriers[0].value,
        signature: canonicalSecretBearingFixtures.webhookSignature.raw
      }),
      restoreDescriptor
    ];

    const serialized = JSON.stringify(descriptors);
    assertLogRecordsDoNotLeakCanonicalSecrets([serialized]);
    assert.match(serialized, /\[REDACTED:object_key\]/);
    assert.match(serialized, /\[REDACTED:provider_token\]/);
    assert.match(serialized, /\[REDACTED:webhook_signature\]/);
    assert.equal(reportDescriptor.data.objectKeyExposed, false);
    assert.equal(String(reportDescriptor.data.downloadUrl).includes("reports.local/download"), true);
    const restoreCheck = restoreDescriptor.data.restoreCheck as Record<string, unknown>;
    const artifactDescriptor = restoreCheck.artifactDescriptor as Record<string, unknown>;
    assert.deepEqual(restoreCheck.targets, ["postgres", "object-storage-metadata"]);
    assert.equal(String(artifactDescriptor.artifactUrl).includes("/operations/restore-checks/backup-postgres-nightly/artifact"), true);
    assert.equal(artifactDescriptor.objectKey, "[REDACTED:object_key]");
    assert.equal(artifactDescriptor.objectKeyExposed, false);
    assert.equal(
      JSON.stringify(restoreCheck).includes("restore-checks/backup-postgres-nightly/artifact.json"),
      false
    );
  });
});
