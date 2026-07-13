import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createOutboxEvent, InMemoryOutboxStore } from "@support-communication/events";
import { InMemoryBillingSyncJobStore, type StoredBillingSyncJob } from "@support-communication/database";

describe("outbox worker runtime contracts", () => {
  it("is wired as a buildable backend worker app with start scripts", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
      workspaces: string[];
    };
    const tsconfig = JSON.parse(readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8")) as {
      references: Array<{ path: string }>;
    };

    assert.equal(packageJson.workspaces.includes("apps/outbox-worker"), true);
    assert.match(packageJson.scripts["start:outbox-worker"], /apps\/outbox-worker\/dist\/main\.js/);
    assert.match(packageJson.scripts["start:outbox-bullmq-worker"], /--bullmq/);
    assert.match(packageJson.scripts["start:billing-bullmq-worker"], /--bullmq --billing-sync/);
    assert.equal(packageJson.scripts["outbox:worker:once"], "npm run build && node --env-file=.env.example scripts/outbox-worker-smoke.mjs");
    assert.equal(existsSync(new URL("../scripts/outbox-worker-smoke.mjs", import.meta.url)), true);
    const outboxSmoke = readFileSync(new URL("../scripts/outbox-worker-smoke.mjs", import.meta.url), "utf8");
    assert.match(outboxSmoke, /conversationOutboundDescriptor\.create/);
    assert.match(outboxSmoke, /outboxEvent\.create/);
    assert.match(outboxSmoke, /OUTBOX_CHANNEL_CONNECTORS/);
    assert.match(outboxSmoke, /result\.scanned !== 1/);
    assert.match(outboxSmoke, /result\.published !== 1/);
    assert.match(outboxSmoke, /result\.failed !== 0/);
    assert.match(outboxSmoke, /event\.status !== "published"/);
    assert.equal(packageJson.scripts["billing:worker:once"], "npm run build && node --env-file=.env.example scripts/billing-sync-worker-smoke.mjs");
    assert.equal(existsSync(new URL("../scripts/billing-sync-worker-smoke.mjs", import.meta.url)), true);
    assert.match(packageJson.dependencies.bullmq, /^\^/);
    assert.equal(tsconfig.references.some((reference) => reference.path === "apps/outbox-worker"), true);

    const main = readFileSync(new URL("../apps/outbox-worker/src/main.ts", import.meta.url), "utf8");
    assert.doesNotMatch(main, /handlers:\s*\{\s*\}/);
    assert.match(main, /createRuntimeBillingSyncHandlers/);
    assert.match(main, /createPrismaConversationOutboundDescriptorStore/);
    assert.match(main, /createJsonConversationOutboxStore/);
    assert.match(main, /createJsonConversationOutboundDescriptorStore/);
    assert.match(main, /CONVERSATION_REPOSITORY/);
    assert.match(main, /createRuntimeOutboxHandlers/);
    assert.match(main, /queue:\s*config\.queue\s*\?\?\s*"file-scan"/);
    assert.doesNotMatch(main, /queue:\s*"file-scan"/);
  });

  it("skips provider outbox smoke without live credentials", () => {
    const backendRoot = fileURLToPath(new URL("..", import.meta.url));
    const result = spawnSync(process.execPath, ["scripts/provider-outbox-smoke.mjs"], {
      cwd: backendRoot,
      env: {
        ...process.env,
        DATABASE_URL: "",
        OUTBOX_PROVIDER_SMOKE_ENABLED: "false"
      },
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /provider outbox smoke skipped/);
    assert.doesNotMatch(result.stderr, /DATABASE_URL_required/);
  });

  it("processes one bounded batch with registered handlers", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    assert.equal(typeof worker.createOutboxDispatcher, "function");
    assert.equal(typeof worker.createDefaultOutboxHandlers, "function");
    assert.equal(typeof worker.createDefaultBillingSyncHandlers, "function");
    assert.equal(typeof worker.createWorkerHandlerRegistry, "function");
    assert.equal(typeof worker.createBullMqWorkerBridge, "function");
    assert.equal(typeof worker.loadBullMqWorkerConfig, "function");
    assert.equal(typeof worker.runOutboxWorker, "function");

    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_outbox_worker_known",
      type: "tenant.status.changed"
    }));
    await store.append(createOutboxEvent({
      aggregateId: "tenant-lumen",
      aggregateType: "billing-tenant",
      payload: { planId: "business" },
      queue: "billing-sync",
      traceId: "trc_outbox_worker_other_queue",
      type: "billing.tenant.plan_changed"
    }));
    const handled: string[] = [];

    const result = await worker.runOutboxWorker({
      handlers: {
        "tenant.status.changed": async (handledEvent) => {
          handled.push(handledEvent.id);
        }
      },
      leaseTimeoutMs: 60_000,
      limit: 5,
      once: true,
      queue: "identity-events",
      store
    });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 1,
      scanned: 1,
      stopped: false
    });
    assert.deepEqual(handled, [event.id]);
    assert.equal((await store.list({ statuses: ["published"] })).some((item) => item.id === event.id), true);
    assert.equal((await store.list({ queue: "billing-sync", statuses: ["pending"] })).length, 1);
  });

  it("registers queue descriptor handlers through a reusable fail-closed registry", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const handled: string[] = [];
    const inherited = Object.create({
      "tenant.inherited": () => {
        handled.push("inherited");
      }
    }) as Record<string, (descriptor: { id: string }) => void>;
    inherited["tenant.status.changed"] = (descriptor) => {
      handled.push(descriptor.id);
    };

    const registry = worker.createWorkerHandlerRegistry(inherited)
      .register("*.invoice.paid", (descriptor: { id: string }) => {
        handled.push(`billing:${descriptor.id}`);
      });
    const snapshot = registry.toRecord();

    assert.equal(Object.getPrototypeOf(snapshot), null);
    assert.equal(registry.resolve("tenant.inherited"), undefined);
    assert.equal(registry.resolve("toString"), undefined);
    assert.equal(registry.resolveFirst(["stripe.invoice.paid", "*.invoice.paid"])?.key, "*.invoice.paid");

    await registry.resolve("tenant.status.changed")?.({ id: "tenant_event" });
    await registry.resolveFirst(["stripe.invoice.paid", "*.invoice.paid"])?.handler({ id: "billing_event" });

    assert.deepEqual(Object.keys(snapshot).sort(), ["*.invoice.paid", "tenant.status.changed"]);
    assert.deepEqual(handled, ["tenant_event", "billing:billing_event"]);
  });

  it("publishes known identity outbox events through the default handler registry", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const tenant = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_default_handler_tenant",
      type: "tenant.status.changed"
    }));
    const login = await store.append(createOutboxEvent({
      aggregateId: "session-runtime",
      aggregateType: "service-admin-session",
      payload: { authState: "mfa_verified" },
      queue: "identity-events",
      traceId: "trc_default_handler_login",
      type: "service_admin.login"
    }));
    const logs: Array<{ context: Record<string, unknown>; level: string; message: string }> = [];

    const result = await worker.runOutboxWorker({
      handlers: worker.createDefaultOutboxHandlers({
        writeLog: (level: string, message: string, context: Record<string, unknown>) => {
          logs.push({ context, level, message });
        }
      }),
      once: true,
      queue: "identity-events",
      store
    });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 2,
      scanned: 2,
      stopped: false
    });
    assert.deepEqual((await store.list({ statuses: ["published"] })).map((event) => event.id).sort(), [login.id, tenant.id].sort());
    assert.deepEqual(logs.map((entry) => entry.context.type).sort(), ["service_admin.login", "tenant.status.changed"]);
    assert.equal(logs.every((entry) => entry.level === "info"), true);
  });

  it("publishes known conversation and file outbox events through the default handler registry", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const delivery = await store.append(createOutboxEvent({
      aggregateId: "maria",
      aggregateType: "conversation",
      payload: { descriptorId: "delivery_001" },
      queue: "message-delivery",
      traceId: "trc_default_handler_delivery",
      type: "message.delivery.requested"
    }));
    const outbound = await store.append(createOutboxEvent({
      aggregateId: "outbound_001",
      aggregateType: "conversation_outbound",
      payload: { descriptorId: "outbound_001" },
      queue: "message-delivery",
      traceId: "trc_default_handler_outbound",
      type: "conversation.outbound.requested"
    }));
    const upload = await store.append(createOutboxEvent({
      aggregateId: "attachment_001",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_001" },
      queue: "file-scan",
      traceId: "trc_default_handler_upload",
      type: "attachment.upload.requested"
    }));

    const messageDelivery = await worker.runOutboxWorker({
      handlers: worker.createDefaultOutboxHandlers({ writeLog: () => undefined }),
      once: true,
      queue: "message-delivery",
      store
    });
    const fileScan = await worker.runOutboxWorker({
      handlers: worker.createDefaultOutboxHandlers({ writeLog: () => undefined }),
      once: true,
      queue: "file-scan",
      store
    });

    assert.equal(messageDelivery.failed, 0);
    assert.equal(messageDelivery.published, 2);
    assert.equal(fileScan.failed, 0);
    assert.equal(fileScan.published, 1);
    assert.deepEqual((await store.list({ statuses: ["published"] })).map((event) => event.id).sort(), [delivery.id, outbound.id, upload.id].sort());
  });

  it("loads HTTP channel and file adapters from worker environment", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    assert.equal(typeof worker.createHttpWorkerAdaptersFromEnv, "function");

    const calls: Array<{ url: string; init: { body?: string; headers?: Record<string, string>; method?: string } }> = [];
    const adapters = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_CHANNEL_CONNECTORS: "WHATSAPP=https://provider.example.test/whatsapp",
      OUTBOX_FILE_SCAN_URL: "https://scanner.example.test/scan"
    }, async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string }) => {
      calls.push({ url, init });
      return { ok: true, status: 202, text: async () => "" };
    });

    await adapters.channelConnectors.WHATSAPP.deliverMessage({
      channel: "WHATSAPP",
      conversationId: "conv_http_adapter",
      descriptorId: "descriptor_http_delivery",
      idempotencyKey: "delivery-key-http",
      messageId: "msg_http_adapter",
      outboxEventId: "outbox_http_delivery",
      text: "Hello through HTTP",
      traceId: "trc_http_delivery"
    });
    await adapters.fileScanner.queueAttachmentScan({
      channel: "WHATSAPP",
      descriptorId: "descriptor_http_scan",
      fileId: "file_http_scan",
      fileName: "invoice.pdf",
      idempotencyKey: "scan-key-http",
      outboxEventId: "outbox_http_scan",
      sizeBytes: 4096,
      traceId: "trc_http_scan"
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://provider.example.test/whatsapp");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers?.["content-type"], "application/json");
    assert.equal(calls[0].init.headers?.["idempotency-key"], "delivery-key-http");
    assert.equal(calls[0].init.headers?.["x-trace-id"], "trc_http_delivery");
    assert.deepEqual(JSON.parse(calls[0].init.body ?? "{}"), {
      operation: "deliverMessage",
      request: {
        channel: "WHATSAPP",
        conversationId: "conv_http_adapter",
        descriptorId: "descriptor_http_delivery",
        idempotencyKey: "delivery-key-http",
        messageId: "msg_http_adapter",
        outboxEventId: "outbox_http_delivery",
        text: "Hello through HTTP",
        traceId: "trc_http_delivery"
      }
    });
    assert.equal(calls[1].url, "https://scanner.example.test/scan");
    assert.equal(calls[1].init.headers?.["idempotency-key"], "scan-key-http");
    assert.deepEqual(JSON.parse(calls[1].init.body ?? "{}"), {
      operation: "queueAttachmentScan",
      request: {
        channel: "WHATSAPP",
        descriptorId: "descriptor_http_scan",
        fileId: "file_http_scan",
        fileName: "invoice.pdf",
        idempotencyKey: "scan-key-http",
        outboxEventId: "outbox_http_scan",
        sizeBytes: 4096,
        traceId: "trc_http_scan"
      }
    });
  });

  it("loads runtime attachment scanner adapter only from explicit enabled config", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const disabled = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_SCANNER_URL: "https://scanner.example.test/runtime"
    });
    assert.equal(disabled.scanner, undefined);
    assert.throws(
      () => worker.createHttpWorkerAdaptersFromEnv({ OUTBOX_SCANNER_ENABLED: "true" }),
      /scanner_endpoint_required/
    );

    const calls: Array<{ url: string; init: { body?: string; headers?: Record<string, string>; method?: string } }> = [];
    const enabled = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_SCANNER_ENABLED: "true",
      OUTBOX_SCANNER_URL: "https://scanner.example.test/runtime"
    }, async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string }) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          checkedAt: "2026-06-29T09:20:00.000Z",
          reason: "runtime clean",
          scanner: "runtime-scanner",
          verdict: "clean"
        })
      };
    });

    const result = await enabled.scanner.scanAttachment({
      channel: "SDK",
      descriptorId: "attachment_runtime_scanner",
      fileId: "file_runtime_scanner",
      fileName: "runtime.pdf",
      idempotencyKey: "runtime-scanner-key",
      outboxEventId: "outbox_runtime_scanner",
      sizeBytes: 2048,
      traceId: "trc_runtime_scanner"
    });

    assert.deepEqual(result, {
      checkedAt: "2026-06-29T09:20:00.000Z",
      reason: "runtime clean",
      scanner: "runtime-scanner",
      verdict: "clean"
    });
    assert.equal(calls[0].url, "https://scanner.example.test/runtime");
    assert.equal(calls[0].init.headers?.["idempotency-key"], "runtime-scanner-key");
    assert.equal(calls[0].init.headers?.["x-trace-id"], "trc_runtime_scanner");
    assert.deepEqual(JSON.parse(calls[0].init.body ?? "{}"), {
      operation: "scanAttachment",
      request: {
        channel: "SDK",
        descriptorId: "attachment_runtime_scanner",
        fileId: "file_runtime_scanner",
        fileName: "runtime.pdf",
        idempotencyKey: "runtime-scanner-key",
        outboxEventId: "outbox_runtime_scanner",
        sizeBytes: 2048,
        traceId: "trc_runtime_scanner"
      }
    });
  });

  it("authenticates HTTP runtime scanner requests and forwards signed file access metadata without raw object keys", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_signed_payload",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_signed_payload" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_signed_payload",
      type: "attachment.upload.requested"
    }));
    const httpCalls: Array<{ url: string; init: { body?: string; headers?: Record<string, string>; method?: string } }> = [];

    const result = await worker.runRuntimeFileScanScannerWorker({
      env: {
        OUTBOX_FILE_SCAN_RESULT_BASE_URL: "https://api.example.test/api/v1",
        OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN: "service-admin-scan-token",
        OUTBOX_SCANNER_BEARER_TOKEN: "scanner-provider-token",
        OUTBOX_SCANNER_ENABLED: "true",
        OUTBOX_SCANNER_PROVIDER_MODE: "http",
        OUTBOX_SCANNER_URL: "https://scanner.example.test/runtime"
      },
      fetcher: async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string }) => {
        httpCalls.push({ url, init });
        return {
          ok: true,
          status: 200,
          text: async () => url.includes("scanner.example.test")
            ? JSON.stringify({
              checkedAt: "2026-06-29T09:37:00.000Z",
              reason: "runtime signed clean",
              scanner: "signed-runtime-scanner",
              verdict: "clean"
            })
            : JSON.stringify({ data: { scanState: "clean" } })
        };
      },
      now: new Date("2026-06-29T09:37:30.000Z"),
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "SDK",
          conversationId: null,
          id: "attachment_runtime_signed_payload",
          idempotencyKey: "runtime-signed-payload-key",
          kind: "attachment_upload",
          messageId: null,
          payload: {
            checksum: "sha256-runtime-signed",
            fileId: "file_runtime_signed_payload",
            fileName: "runtime-signed.pdf",
            mimeType: "application/pdf",
            objectKey: "tenant-volga/private/uploads/runtime-signed.pdf",
            signedFile: {
              expiresAt: "2026-06-29T09:47:00.000Z",
              headers: { "x-storage-scan": "runtime" },
              method: "GET",
              url: "https://storage.example.test/signed/runtime-signed.pdf?X-Amz-Signature=abc123"
            },
            sizeBytes: 8192
          }
        })
      },
      store
    });

    assert.equal(result.published, 1);
    assert.equal(httpCalls[0].url, "https://scanner.example.test/runtime");
    assert.equal(httpCalls[0].init.headers?.authorization, "Bearer scanner-provider-token");
    const scannerBody = JSON.parse(httpCalls[0].init.body ?? "{}");
    assert.deepEqual(scannerBody.request, {
      channel: "SDK",
      checksum: "sha256-runtime-signed",
      descriptorId: "attachment_runtime_signed_payload",
      fileId: "file_runtime_signed_payload",
      fileName: "runtime-signed.pdf",
      idempotencyKey: "runtime-signed-payload-key",
      mimeType: "application/pdf",
      outboxEventId: event.id,
      signedFile: {
        expiresAt: "2026-06-29T09:47:00.000Z",
        headers: { "x-storage-scan": "runtime" },
        method: "GET",
        url: "https://storage.example.test/signed/runtime-signed.pdf?X-Amz-Signature=abc123"
      },
      sizeBytes: 8192,
      traceId: "trc_file_scan_runtime_signed_payload"
    });
    assert.equal(JSON.stringify(scannerBody).includes("objectKey"), false);
    assert.equal(httpCalls[1].url, "https://api.example.test/api/v1/files/file_runtime_signed_payload/scan-result");
  });

  it("loads a local runtime attachment scanner without requiring an external scanner URL", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const adapters = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_SCANNER_ENABLED: "true",
      OUTBOX_SCANNER_LOCAL_VERDICT: "clean",
      OUTBOX_SCANNER_PROVIDER_MODE: "local"
    }, async () => {
      throw new Error("local scanner must not call external fetch");
    });

    assert.equal(typeof adapters.scanner?.scanAttachment, "function");
    const result = await adapters.scanner.scanAttachment({
      channel: "SDK",
      descriptorId: "attachment_local_scanner",
      fileId: "file_local_scanner",
      fileName: "local.pdf",
      idempotencyKey: "local-scanner-key",
      outboxEventId: "outbox_local_scanner",
      sizeBytes: 2048,
      traceId: "trc_local_scanner"
    });

    assert.equal(result?.verdict, "clean");
    assert.equal(result?.scanner, "local-deterministic-scanner");
    assert.equal(result?.reason, "local scanner clean");
  });

  it("keeps runtime scanner config isolated from legacy file-scan queue config", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const calls: Array<{ url: string; init: { body?: string; headers?: Record<string, string>; method?: string } }> = [];
    const adapters = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_FILE_SCAN_URL: "https://scanner.example.test/legacy-queue",
      OUTBOX_SCANNER_ENABLED: "true",
      OUTBOX_SCANNER_URL: "https://scanner.example.test/runtime-scan"
    }, async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string }) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => url.includes("runtime-scan") ? JSON.stringify({ verdict: "clean" }) : ""
      };
    });

    await adapters.fileScanner.queueAttachmentScan({
      channel: "SDK",
      descriptorId: "attachment_legacy_queue",
      fileId: "file_legacy_queue",
      fileName: "legacy.pdf",
      idempotencyKey: "legacy-queue-key",
      outboxEventId: "outbox_legacy_queue",
      sizeBytes: 1024,
      traceId: "trc_legacy_queue"
    });
    await adapters.scanner.scanAttachment({
      channel: "SDK",
      descriptorId: "attachment_runtime_scan",
      fileId: "file_runtime_scan",
      fileName: "runtime.pdf",
      idempotencyKey: "runtime-scan-key",
      outboxEventId: "outbox_runtime_scan",
      sizeBytes: 2048,
      traceId: "trc_runtime_scan"
    });

    assert.equal(calls[0].url, "https://scanner.example.test/legacy-queue");
    assert.equal(JSON.parse(calls[0].init.body ?? "{}").operation, "queueAttachmentScan");
    assert.equal(calls[1].url, "https://scanner.example.test/runtime-scan");
    assert.equal(JSON.parse(calls[1].init.body ?? "{}").operation, "scanAttachment");
  });

  it("fails runtime scanner adapter responses without a string verdict", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const adapters = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_SCANNER_ENABLED: "true",
      OUTBOX_SCANNER_URL: "https://scanner.example.test/runtime"
    }, async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ reason: "missing verdict" })
    }));

    await assert.rejects(
      () => adapters.scanner.scanAttachment({
        channel: "SDK",
        descriptorId: "attachment_runtime_missing_verdict",
        fileId: "file_runtime_missing_verdict",
        fileName: "runtime.pdf",
        idempotencyKey: "runtime-missing-verdict-key",
        outboxEventId: "outbox_runtime_missing_verdict",
        sizeBytes: 2048,
        traceId: "trc_runtime_missing_verdict"
      }),
      /scan_verdict_required/
    );
  });

  it("loads runtime scan-result callback adapter for the existing files API path", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    assert.throws(
      () => worker.createHttpWorkerAdaptersFromEnv({
        OUTBOX_FILE_SCAN_RESULT_BASE_URL: "https://api.example.test/api/v1"
      }),
      /file_scan_result_bearer_token_required/
    );

    const calls: Array<{ url: string; init: { body?: string; headers?: Record<string, string>; method?: string } }> = [];
    const adapters = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_FILE_SCAN_RESULT_BASE_URL: "https://api.example.test/api/v1",
      OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN: "service-admin-scan-token"
    }, async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string }) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { scanState: "clean" } })
      };
    });

    await adapters.fileScanResultCallback.recordScanResult({
      checkedAt: "2026-06-29T09:35:00.000Z",
      fileId: "file_callback_http",
      idempotencyKey: "scan-result-http-key",
      reason: "runtime clean",
      scanner: "runtime-scanner",
      traceId: "trc_scan_result_http",
      verdict: "clean"
    });

    assert.equal(calls[0].url, "https://api.example.test/api/v1/files/file_callback_http/scan-result");
    assert.deepEqual(calls[0].init.headers, {
      "x-file-scan-callback-token": "service-admin-scan-token",
      "content-type": "application/json",
      "idempotency-key": "scan-result-http-key",
      "x-trace-id": "trc_scan_result_http"
    });
    assert.deepEqual(JSON.parse(calls[0].init.body ?? "{}"), {
      checkedAt: "2026-06-29T09:35:00.000Z",
      reason: "runtime clean",
      scanner: "runtime-scanner",
      verdict: "clean"
    });
  });

  it("wires runtime scanner worker execution from environment adapters through scan-result callback", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_env_callback",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_env_callback" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_env_callback",
      type: "attachment.upload.requested"
    }));
    const httpCalls: Array<{ url: string; init: { body?: string; headers?: Record<string, string>; method?: string } }> = [];

    const result = await worker.runRuntimeFileScanScannerWorker({
      env: {
        OUTBOX_FILE_SCAN_RESULT_BASE_URL: "https://api.example.test/api/v1",
        OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN: "service-admin-scan-token",
        OUTBOX_SCANNER_ENABLED: "true",
        OUTBOX_SCANNER_URL: "https://scanner.example.test/runtime"
      },
      fetcher: async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string }) => {
        httpCalls.push({ url, init });
        return {
          ok: true,
          status: 200,
          text: async () => url.includes("scanner.example.test")
            ? JSON.stringify({
              checkedAt: "2026-06-29T09:36:00.000Z",
              reason: "runtime env clean",
              scanner: "runtime-env-scanner",
              verdict: "clean"
            })
            : JSON.stringify({ data: { scanState: "clean" } })
        };
      },
      now: new Date("2026-06-29T09:36:30.000Z"),
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "SDK",
          conversationId: null,
          id: "attachment_runtime_env_callback",
          idempotencyKey: "runtime-env-callback-key",
          kind: "attachment_upload",
          messageId: null,
          payload: {
            fileId: "file_runtime_env_callback",
            fileName: "runtime-env-callback.pdf",
            sizeBytes: 4096
          }
        })
      },
      store
    });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 1,
      scanned: 1,
      stopped: false
    });
    assert.equal(httpCalls[0].url, "https://scanner.example.test/runtime");
    assert.equal(JSON.parse(httpCalls[0].init.body ?? "{}").operation, "scanAttachment");
    assert.equal(httpCalls[1].url, "https://api.example.test/api/v1/files/file_runtime_env_callback/scan-result");
    assert.deepEqual(JSON.parse(httpCalls[1].init.body ?? "{}"), {
      checkedAt: "2026-06-29T09:36:00.000Z",
      reason: "runtime env clean",
      scanner: "runtime-env-scanner",
      verdict: "clean"
    });
    assert.deepEqual((await store.list({ queue: "file-scan", statuses: ["published"] })).map((item) => item.id), [event.id]);
  });

  it("fails closed before claiming runtime scanner work without scan-result callback config", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_missing_callback",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_missing_callback" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_missing_callback",
      type: "attachment.upload.requested"
    }));
    const httpCalls: string[] = [];

    await assert.rejects(
      async () => worker.runRuntimeFileScanScannerWorker({
        env: {
          OUTBOX_SCANNER_ENABLED: "true",
          OUTBOX_SCANNER_URL: "https://scanner.example.test/runtime"
        },
        fetcher: async (url: string) => {
          httpCalls.push(url);
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              checkedAt: "2026-06-29T09:37:00.000Z",
              reason: "runtime clean",
              scanner: "runtime-env-scanner",
              verdict: "clean"
            })
          };
        },
        outboundDescriptorStore: {
          findOutboundDescriptorById: async () => ({
            channel: "Email",
            conversationId: null,
            id: "attachment_runtime_missing_callback",
            idempotencyKey: "runtime-missing-callback-key",
            kind: "attachment_upload",
            messageId: null,
            payload: {
              fileId: "file_runtime_missing_callback",
              fileName: "runtime-missing-callback.pdf",
              sizeBytes: 4096
            }
          })
        },
        store
      }),
      /file_scan_result_callback_not_configured/
    );

    assert.deepEqual(httpCalls, []);
    assert.deepEqual((await store.list({ queue: "file-scan", statuses: ["pending"] })).map((item) => item.id), [event.id]);
    assert.deepEqual(await store.list({ queue: "file-scan", statuses: ["publishing"] }), []);
  });

  it("bounds HTTP adapter calls and sanitizes provider failure bodies", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const calls: Array<{ init: { body?: string; headers?: Record<string, string>; method?: string; signal?: AbortSignal }; url: string }> = [];
    const adapters = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_CHANNEL_CONNECTORS: "SDK=https://provider.example.test/sdk",
      OUTBOX_HTTP_TIMEOUT_MS: "25"
    }, async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string; signal?: AbortSignal }) => {
      calls.push({ url, init });
      return {
        ok: false,
        status: 502,
        text: async () => "raw provider secret token should not be persisted"
      };
    });

    await assert.rejects(
      adapters.channelConnectors.SDK.deliverMessage({
        channel: "SDK",
        conversationId: "maria",
        descriptorId: "descriptor_http_failure",
        idempotencyKey: "delivery-http-failure",
        messageId: "msg_http_failure",
        outboxEventId: "outbox_http_failure",
        text: "Hello",
        traceId: "trc_http_failure"
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "worker_http_dispatch_failed:502");
        assert.doesNotMatch(error.message, /secret|provider/i);
        return true;
      }
    );

    assert.equal(calls.length, 1);
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  });

  it("defines a Telegram connector adapter with DTO validation and sanitized provider failures", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    assert.equal(typeof worker.createTelegramChannelConnector, "function");
    const calls: Array<{ init: { body?: string; headers?: Record<string, string>; method?: string; signal?: AbortSignal }; url: string }> = [];
    const connector = worker.createTelegramChannelConnector({
      endpoint: "https://telegram.provider.example.test/bot/sendMessage",
      fetcher: async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string; signal?: AbortSignal }) => {
        calls.push({ url, init });
        return {
          ok: false,
          status: 429,
          text: async () => "telegram token 123:SECRET raw provider body"
        };
      },
      timeoutMs: 25
    });

    await assert.rejects(
      connector.deliverMessage({
        channel: "Telegram",
        conversationId: "tg-chat-100",
        descriptorId: "telegram_delivery_001",
        idempotencyKey: "telegram-key-001",
        messageId: "msg_telegram_001",
        outboxEventId: "outbox_telegram_001",
        text: "Telegram hello",
        traceId: "trc_telegram_delivery"
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "telegram_dispatch_failed:429");
        assert.doesNotMatch(error.message, /SECRET|token|provider body/i);
        return true;
      }
    );
    await assert.rejects(
      connector.deliverMessage({
        channel: "Telegram",
        conversationId: "",
        descriptorId: "telegram_delivery_invalid",
        idempotencyKey: "telegram-key-invalid",
        messageId: "msg_telegram_invalid",
        outboxEventId: "outbox_telegram_invalid",
        text: "Telegram hello",
        traceId: "trc_telegram_invalid"
      }),
      /telegram_chat_id_required/
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://telegram.provider.example.test/bot/sendMessage");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers?.["content-type"], "application/json");
    assert.equal(calls[0].init.headers?.["idempotency-key"], "telegram-key-001");
    assert.equal(calls[0].init.headers?.["x-trace-id"], "trc_telegram_delivery");
    assert.deepEqual(JSON.parse(calls[0].init.body ?? "{}"), {
      chat_id: "tg-chat-100",
      disable_web_page_preview: true,
      text: "Telegram hello"
    });
  });

  it("validates Telegram idempotency metadata and sanitizes thrown provider errors", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    let calls = 0;
    const connector = worker.createTelegramChannelConnector({
      endpoint: "https://telegram.provider.example.test/bot/SECRET/sendMessage",
      fetcher: async () => {
        calls += 1;
        throw new Error("raw telegram provider token SECRET body");
      },
      timeoutMs: 25
    });

    await assert.rejects(
      connector.deliverMessage({
        channel: "Telegram",
        conversationId: "tg-chat-100",
        descriptorId: "telegram_delivery_no_idempotency",
        idempotencyKey: "",
        messageId: "msg_telegram_no_idempotency",
        outboxEventId: "outbox_telegram_no_idempotency",
        text: "Telegram hello",
        traceId: "trc_telegram_no_idempotency"
      }),
      /telegram_idempotency_key_required/
    );
    await assert.rejects(
      connector.deliverMessage({
        channel: "Telegram",
        conversationId: "tg-chat-100",
        descriptorId: "telegram_delivery_no_trace",
        idempotencyKey: "telegram-key-no-trace",
        messageId: "msg_telegram_no_trace",
        outboxEventId: "outbox_telegram_no_trace",
        text: "Telegram hello",
        traceId: ""
      }),
      /telegram_trace_id_required/
    );
    await assert.rejects(
      connector.deliverMessage({
        channel: "Telegram",
        conversationId: "tg-chat-100",
        descriptorId: "telegram_delivery_throw",
        idempotencyKey: "telegram-key-throw",
        messageId: "msg_telegram_throw",
        outboxEventId: "outbox_telegram_throw",
        text: "Telegram hello",
        traceId: "trc_telegram_throw"
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "telegram_dispatch_failed");
        assert.doesNotMatch(error.message, /SECRET|token|provider body/i);
        return true;
      }
    );

    assert.equal(calls, 1);
  });

  it("loads Telegram runtime adapter from explicit environment config only", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const disabled = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_TELEGRAM_BOT_TOKEN: "123456:SECRET"
    }, async () => {
      throw new Error("disabled telegram adapter must not call fetch");
    });

    assert.equal(disabled.channelConnectors.Telegram, undefined);
    const enabledWithoutGlobalToken = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_TELEGRAM_ENABLED: "true",
      OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
      OUTBOX_HTTP_TIMEOUT_MS: "25"
    }, async () => {
      throw new Error("tenant-aware telegram adapter must not call fetch during registration");
    });
    assert.equal(typeof enabledWithoutGlobalToken.channelConnectors.Telegram?.deliverMessage, "function");

    const calls: Array<{ init: { body?: string; headers?: Record<string, string>; method?: string; signal?: AbortSignal }; url: string }> = [];
    const defaultChannelAdapters = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_TELEGRAM_BOT_TOKEN: "123456:SECRET",
      OUTBOX_TELEGRAM_ENABLED: "true"
    }, async () => {
      throw new Error("default channel assertion must not call fetch");
    });
    const adapters = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test/",
      OUTBOX_TELEGRAM_BOT_TOKEN: "123456:SECRET",
      OUTBOX_TELEGRAM_CHANNEL: "TG",
      OUTBOX_TELEGRAM_ENABLED: "true",
      OUTBOX_HTTP_TIMEOUT_MS: "25"
    }, async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string; signal?: AbortSignal }) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => "" };
    });

    assert.equal(typeof defaultChannelAdapters.channelConnectors.Telegram?.deliverMessage, "function");
    assert.equal(adapters.channelConnectors.Telegram, undefined);
    assert.equal(typeof adapters.channelConnectors.TG?.deliverMessage, "function");
    await adapters.channelConnectors.TG.deliverMessage({
      channel: "TG",
      conversationId: "tg-runtime-chat",
      descriptorId: "telegram_runtime_delivery",
      idempotencyKey: "telegram-runtime-key",
      messageId: "msg_telegram_runtime",
      outboxEventId: "outbox_telegram_runtime",
      tenantId: "tenant-volga",
      text: "Runtime Telegram hello",
      traceId: "trc_telegram_runtime"
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://telegram.provider.example.test/bot123456:SECRET/sendMessage");
    assert.equal(calls[0].init.headers?.["idempotency-key"], "telegram-runtime-key");
    assert.equal(calls[0].init.headers?.["x-trace-id"], "trc_telegram_runtime");
    assert.deepEqual(JSON.parse(calls[0].init.body ?? "{}"), {
      chat_id: "tg-runtime-chat",
      disable_web_page_preview: true,
      text: "Runtime Telegram hello"
    });
  });

  it("routes Telegram delivery through an async tenant credential resolver", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    await store.append(createOutboxEvent({
      aggregateId: "tg-prisma-chat",
      aggregateType: "conversation",
      payload: { descriptorId: "telegram_prisma_descriptor" },
      queue: "message-delivery",
      traceId: "trc_telegram_prisma_descriptor",
      type: "message.delivery.requested"
    }));
    const calls: Array<{ init: { body?: string; headers?: Record<string, string>; method?: string; signal?: AbortSignal }; url: string }> = [];
    const handlers = worker.createRuntimeOutboxHandlers({
      env: {
        OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
        OUTBOX_TELEGRAM_ENABLED: "true",
        OUTBOX_HTTP_TIMEOUT_MS: "25"
      },
      fetcher: async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string; signal?: AbortSignal }) => {
        calls.push({ url, init });
        return { ok: true, status: 200, text: async () => "" };
      },
      outboundDescriptorStore: {
        async findOutboundDescriptorById(descriptorId: string) {
          assert.equal(descriptorId, "telegram_prisma_descriptor");
          return {
            channel: "Telegram",
            conversationId: "tg-prisma-chat",
            id: descriptorId,
            idempotencyKey: "telegram-prisma-key",
            kind: "message_delivery",
            messageId: "msg_telegram_prisma",
            payload: { text: "Runtime Prisma Telegram hello" },
            phone: "",
            requestedBy: "operator-prisma",
            status: "queued",
            tenantId: "tenant-prisma",
            traceId: "trc_telegram_prisma_descriptor"
          };
        }
      },
      telegramBotTokenResolver: {
        async resolveBotToken(tenantId: string) {
          assert.equal(tenantId, "tenant-prisma");
          return "987654:PRISMA_SECRET";
        }
      }
    });

    const result = await worker.runOutboxWorker({
      handlers,
      once: true,
      store
    });

    assert.equal(result.published, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://telegram.provider.example.test/bot987654:PRISMA_SECRET/sendMessage");
    assert.equal(calls[0].init.headers?.["idempotency-key"], "telegram-prisma-key");
    assert.equal(calls[0].init.headers?.["x-trace-id"], "trc_telegram_prisma_descriptor");
  });

  it("resolves active Telegram bot tokens from Prisma integration state with env fallback", async () => {
    const tokenStore = await import("../apps/outbox-worker/src/integration-telegram-store.ts");
    const requestedConnections: string[] = [];
    const resolver = tokenStore.createPrismaIntegrationTelegramTokenResolver({
      telegramConnection: {
        async findUnique(input: { where: { channelConnectionId: string } }) {
          requestedConnections.push(input.where.channelConnectionId);
          if (input.where.channelConnectionId === "connection-active") {
            return { botToken: "111111:PRISMA_ACTIVE", status: "active", tenantId: "tenant-active" };
          }
          if (input.where.channelConnectionId === "connection-disabled") {
            return { botToken: "222222:DISABLED", status: "disabled", tenantId: "tenant-disabled" };
          }
          return null;
        }
      }
    }, "333333:ENV_FALLBACK");

    assert.equal(await resolver.resolveBotToken("tenant-active", "connection-active"), "111111:PRISMA_ACTIVE");
    assert.equal(await resolver.resolveBotToken("tenant-disabled", "connection-disabled"), "333333:ENV_FALLBACK");
    assert.equal(await resolver.resolveBotToken("tenant-missing", "connection-missing"), "333333:ENV_FALLBACK");
    assert.equal(await resolver.resolveBotToken(""), "333333:ENV_FALLBACK");
    assert.deepEqual(requestedConnections, ["connection-active", "connection-disabled", "connection-missing"]);
  });

  it("keeps Telegram runtime provider failures sanitized in worker state and logs", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const delivery = await store.append(createOutboxEvent({
      aggregateId: "tg-runtime-chat",
      aggregateType: "conversation",
      payload: { descriptorId: "telegram_runtime_failure" },
      queue: "message-delivery",
      traceId: "trc_telegram_runtime_failure",
      type: "message.delivery.requested"
    }));
    const logs: string[] = [];
    const deliveryStates: string[] = [];
    const handlers = worker.createRuntimeOutboxHandlers({
      env: {
        OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
        OUTBOX_TELEGRAM_BOT_TOKEN: "123456:SECRET",
        OUTBOX_TELEGRAM_ENABLED: "true"
      },
      fetcher: async () => {
        throw new Error("provider failure for https://telegram.provider.example.test/bot123456:SECRET/sendMessage with raw token body");
      },
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "Telegram",
          conversationId: "tg-runtime-chat",
          id: "telegram_runtime_failure",
          idempotencyKey: "telegram-runtime-failure-key",
          kind: "message_delivery",
          messageId: "msg_telegram_runtime_failure",
          payload: { text: "Runtime Telegram failure" },
          tenantId: "tenant-volga"
        }),
        markOutboundDescriptorDelivery: async (_descriptorId: string, deliveryState: string) => {
          deliveryStates.push(deliveryState);
          return null;
        }
      },
      writeLog: (_level: string, message: string, context: Record<string, unknown>) => {
        logs.push(JSON.stringify({ context, message }));
      }
    });

    const result = await worker.runOutboxWorker({
      handlers,
      once: true,
      queue: "message-delivery",
      store
    });

    assert.equal(result.failed, 1);
    assert.equal(result.published, 0);
    const failed = (await store.list({ statuses: ["failed"] })).find((event) => event.id === delivery.id);
    assert.equal(failed?.lastError, "telegram_dispatch_failed");
    assert.deepEqual(deliveryStates, ["failed"]);
    assert.doesNotMatch(failed?.lastError ?? "", /SECRET|token|bot123456/i);
    assert.equal(logs.some((entry) => /SECRET|token|bot123456/i.test(entry)), false);
  });

  it("routes Telegram message-delivery descriptors through runtime handlers with stable metadata", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const delivery = await store.append(createOutboxEvent({
      aggregateId: "tg-runtime-chat",
      aggregateType: "conversation",
      payload: { descriptorId: "telegram_runtime_descriptor" },
      queue: "message-delivery",
      traceId: "trc_telegram_runtime_descriptor",
      type: "message.delivery.requested"
    }));
    const calls: Array<{ init: { body?: string; headers?: Record<string, string>; method?: string }; url: string }> = [];
    const deliveryStates: string[] = [];
    const handlers = worker.createRuntimeOutboxHandlers({
      env: {
        OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
        OUTBOX_TELEGRAM_BOT_TOKEN: "123456:SECRET",
        OUTBOX_TELEGRAM_ENABLED: "true"
      },
      fetcher: async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string }) => {
        calls.push({ url, init });
        return { ok: true, status: 200, text: async () => "" };
      },
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "Telegram",
          conversationId: "tg-runtime-chat",
          id: "telegram_runtime_descriptor",
          idempotencyKey: "telegram-runtime-descriptor-key",
          kind: "message_delivery",
          messageId: "msg_telegram_runtime_descriptor",
          payload: { text: "Runtime descriptor hello" },
          tenantId: "tenant-volga"
        }),
        markOutboundDescriptorDelivery: async (_descriptorId: string, deliveryState: string) => {
          deliveryStates.push(deliveryState);
          return null;
        }
      },
      writeLog: () => undefined
    });

    const result = await worker.runOutboxWorker({
      handlers,
      once: true,
      queue: "message-delivery",
      store
    });

    assert.equal(result.failed, 0);
    assert.equal(result.published, 1);
    assert.deepEqual(deliveryStates, ["delivered"]);
    assert.equal((await store.list({ statuses: ["published"] })).some((event) => event.id === delivery.id), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://telegram.provider.example.test/bot123456:SECRET/sendMessage");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers?.["idempotency-key"], "telegram-runtime-descriptor-key");
    assert.equal(calls[0].init.headers?.["x-trace-id"], "trc_telegram_runtime_descriptor");
    assert.deepEqual(JSON.parse(calls[0].init.body ?? "{}"), {
      chat_id: "tg-runtime-chat",
      disable_web_page_preview: true,
      text: "Runtime descriptor hello"
    });
  });

  it("delivers Telegram CSAT surveys with an inline keyboard and records delivery state", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    await store.append(createOutboxEvent({
      aggregateId: "tg-csat-chat",
      aggregateType: "conversation",
      payload: { descriptorId: "telegram_csat_descriptor" },
      queue: "message-delivery",
      traceId: "trc_telegram_csat",
      type: "message.delivery.requested"
    }));
    const calls: Array<Record<string, unknown>> = [];
    const deliveryStates: string[] = [];
    const replyMarkup = {
      inline_keyboard: [[1, 2, 3, 4, 5].map((score) => ({
        callback_data: `quality:csat:${score}`,
        text: String(score)
      }))]
    };
    const handlers = worker.createRuntimeOutboxHandlers({
      env: {
        OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
        OUTBOX_TELEGRAM_BOT_TOKEN: "123456:SECRET",
        OUTBOX_TELEGRAM_ENABLED: "true"
      },
      fetcher: async (_url: string, init: { body?: string }) => {
        calls.push(JSON.parse(init.body ?? "{}") as Record<string, unknown>);
        return { ok: true, status: 200, text: async () => "" };
      },
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "Telegram",
          conversationId: "tg-csat-chat",
          id: "telegram_csat_descriptor",
          idempotencyKey: "quality:csat:tg-csat-chat",
          kind: "message_delivery",
          messageId: "csat-survey:tg-csat-chat",
          payload: {
            providerConversationId: "99887766",
            replyMarkup,
            text: "Оцените, пожалуйста, качество поддержки от 1 до 5."
          },
          tenantId: "tenant-volga"
        }),
        markOutboundDescriptorDelivery: async (_descriptorId: string, state: "delivered" | "failed") => {
          deliveryStates.push(state);
          return null;
        }
      },
      writeLog: () => undefined
    });

    const result = await worker.runOutboxWorker({ handlers, once: true, queue: "message-delivery", store });

    assert.equal(result.published, 1);
    assert.deepEqual(deliveryStates, ["delivered"]);
    assert.deepEqual(calls[0], {
      chat_id: "99887766",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
      text: "Оцените, пожалуйста, качество поддержки от 1 до 5."
    });
  });

  it("keeps Telegram delivery idempotency stable for repeated descriptor dispatches", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    await store.append(createOutboxEvent({
      aggregateId: "tg-runtime-chat",
      aggregateType: "conversation",
      payload: { descriptorId: "telegram_runtime_replay_descriptor" },
      queue: "message-delivery",
      traceId: "trc_telegram_runtime_replay_1",
      type: "message.delivery.requested"
    }));
    await store.append(createOutboxEvent({
      aggregateId: "tg-runtime-chat",
      aggregateType: "conversation",
      payload: { descriptorId: "telegram_runtime_replay_descriptor" },
      queue: "message-delivery",
      traceId: "trc_telegram_runtime_replay_2",
      type: "message.delivery.requested"
    }));
    const calls: Array<{ body: Record<string, unknown>; headers: Record<string, string> }> = [];
    const handlers = worker.createRuntimeOutboxHandlers({
      env: {
        OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
        OUTBOX_TELEGRAM_BOT_TOKEN: "123456:SECRET",
        OUTBOX_TELEGRAM_ENABLED: "true"
      },
      fetcher: async (_url: string, init: { body?: string; headers?: Record<string, string> }) => {
        calls.push({
          body: JSON.parse(init.body ?? "{}") as Record<string, unknown>,
          headers: init.headers ?? {}
        });
        return { ok: true, status: 200, text: async () => "" };
      },
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "Telegram",
          conversationId: "tg-runtime-chat",
          id: "telegram_runtime_replay_descriptor",
          idempotencyKey: "telegram-runtime-replay-key",
          kind: "message_delivery",
          messageId: "msg_telegram_runtime_replay",
          payload: { text: "Runtime replay hello" },
          tenantId: "tenant-volga"
        })
      },
      writeLog: () => undefined
    });

    const result = await worker.runOutboxWorker({
      handlers,
      limit: 2,
      once: true,
      queue: "message-delivery",
      store
    });

    assert.equal(result.failed, 0);
    assert.equal(result.published, 2);
    assert.deepEqual(calls.map((call) => call.headers["idempotency-key"]), [
      "telegram-runtime-replay-key",
      "telegram-runtime-replay-key"
    ]);
    assert.deepEqual(calls.map((call) => call.headers["x-trace-id"]), [
      "trc_telegram_runtime_replay_1",
      "trc_telegram_runtime_replay_2"
    ]);
    assert.deepEqual(calls.map((call) => call.body), [
      { chat_id: "tg-runtime-chat", disable_web_page_preview: true, text: "Runtime replay hello" },
      { chat_id: "tg-runtime-chat", disable_web_page_preview: true, text: "Runtime replay hello" }
    ]);
  });

  it("defines VK and MAX connector ports with per-channel capability validation", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    assert.equal(typeof worker.createVkChannelConnector, "function");
    assert.equal(typeof worker.createMaxChannelConnector, "function");

    const calls: Array<{ body: Record<string, unknown>; headers: Record<string, string>; url: string }> = [];
    const fetcher = async (url: string, init: { body?: string; headers?: Record<string, string> }) => {
      calls.push({
        body: JSON.parse(init.body ?? "{}") as Record<string, unknown>,
        headers: init.headers ?? {},
        url
      });
      return { ok: true, status: 200, text: async () => "" };
    };
    const vk = worker.createVkChannelConnector({
      endpoint: "https://vk.provider.example.test/messages.send",
      fetcher,
      timeoutMs: 25
    });
    const max = worker.createMaxChannelConnector({
      endpoint: "https://max.provider.example.test/messages",
      fetcher,
      timeoutMs: 25
    });

    await vk.deliverMessage({
      attachments: [{ providerAttachmentId: "photo123_456" }],
      channel: "VK",
      conversationId: "vk-peer-100",
      descriptorId: "vk_delivery_001",
      idempotencyKey: "vk-key-001",
      messageId: "msg_vk_001",
      outboxEventId: "outbox_vk_001",
      text: "VK hello",
      traceId: "trc_vk_delivery"
    });
    await assert.rejects(
      vk.startConversation({
        channel: "VK",
        descriptorId: "vk_proactive_001",
        idempotencyKey: "vk-key-proactive",
        message: "VK proactive",
        outboxEventId: "outbox_vk_proactive",
        phone: "+79000000000",
        traceId: "trc_vk_proactive"
      }),
      /vk_proactive_delivery_unsupported/
    );
    await max.deliverMessage({
      channel: "MAX",
      conversationId: "max-dialog-100",
      descriptorId: "max_delivery_001",
      idempotencyKey: "max-key-001",
      messageId: "msg_max_001",
      outboxEventId: "outbox_max_001",
      text: "MAX hello",
      traceId: "trc_max_delivery"
    });
    await assert.rejects(
      max.deliverMessage({
        attachments: [{ providerAttachmentId: "file-max-1" }],
        channel: "MAX",
        conversationId: "max-dialog-101",
        descriptorId: "max_delivery_attachment",
        idempotencyKey: "max-key-attachment",
        messageId: "msg_max_attachment",
        outboxEventId: "outbox_max_attachment",
        text: "MAX attachment",
        traceId: "trc_max_attachment"
      }),
      /max_attachments_unsupported/
    );
    await max.startConversation({
      channel: "MAX",
      descriptorId: "max_proactive_001",
      idempotencyKey: "max-key-proactive",
      message: "MAX proactive",
      outboxEventId: "outbox_max_proactive",
      phone: "+79000000001",
      traceId: "trc_max_proactive"
    });

    assert.deepEqual(calls.map((call) => call.url), [
      "https://vk.provider.example.test/messages.send",
      "https://max.provider.example.test/messages",
      "https://max.provider.example.test/messages"
    ]);
    assert.deepEqual(calls.map((call) => call.headers["idempotency-key"]), [
      "vk-key-001",
      "max-key-001",
      "max-key-proactive"
    ]);
    assert.deepEqual(calls.map((call) => call.headers["x-trace-id"]), [
      "trc_vk_delivery",
      "trc_max_delivery",
      "trc_max_proactive"
    ]);
    assert.deepEqual(calls.map((call) => call.body), [
      {
        attachment_ids: ["photo123_456"],
        message: "VK hello",
        peer_id: "vk-peer-100"
      },
      {
        dialog_id: "max-dialog-100",
        text: "MAX hello"
      },
      {
        phone: "+79000000001",
        text: "MAX proactive"
      }
    ]);
  });

  it("loads VK and MAX runtime adapters from disabled-by-default environment config", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const disabled = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_MAX_ENDPOINT: "https://max.provider.example.test/messages",
      OUTBOX_VK_ENDPOINT: "https://vk.provider.example.test/messages.send"
    }, async () => {
      throw new Error("disabled VK/MAX adapters must not call fetch");
    });

    assert.equal(disabled.channelConnectors.VK, undefined);
    assert.equal(disabled.channelConnectors.MAX, undefined);
    assert.throws(
      () => worker.createHttpWorkerAdaptersFromEnv({
        OUTBOX_VK_ENABLED: "true"
      }, async () => {
        throw new Error("missing VK endpoint must not call fetch");
      }),
      /vk_endpoint_required/
    );
    assert.throws(
      () => worker.createHttpWorkerAdaptersFromEnv({
        OUTBOX_MAX_ENABLED: "true"
      }, async () => {
        throw new Error("missing MAX endpoint must not call fetch");
      }),
      /max_endpoint_required/
    );

    const calls: Array<{ body: Record<string, unknown>; headers: Record<string, string>; url: string }> = [];
    const adapters = worker.createHttpWorkerAdaptersFromEnv({
      OUTBOX_MAX_CHANNEL: "MAX_STAGE",
      OUTBOX_MAX_ENABLED: "true",
      OUTBOX_MAX_ENDPOINT: "https://max.provider.example.test/messages",
      OUTBOX_VK_CHANNEL: "VK_STAGE",
      OUTBOX_VK_ENABLED: "true",
      OUTBOX_VK_ENDPOINT: "https://vk.provider.example.test/messages.send"
    }, async (url: string, init: { body?: string; headers?: Record<string, string> }) => {
      calls.push({
        body: JSON.parse(init.body ?? "{}") as Record<string, unknown>,
        headers: init.headers ?? {},
        url
      });
      return { ok: true, status: 200, text: async () => "" };
    });

    assert.equal(adapters.channelConnectors.VK, undefined);
    assert.equal(adapters.channelConnectors.MAX, undefined);
    assert.equal(typeof adapters.channelConnectors.VK_STAGE?.deliverMessage, "function");
    assert.equal(typeof adapters.channelConnectors.MAX_STAGE?.startConversation, "function");
    await adapters.channelConnectors.VK_STAGE.deliverMessage({
      channel: "VK_STAGE",
      conversationId: "vk-peer-runtime",
      descriptorId: "vk_runtime_delivery",
      idempotencyKey: "vk-runtime-key",
      messageId: "msg_vk_runtime",
      outboxEventId: "outbox_vk_runtime",
      text: "VK runtime hello",
      traceId: "trc_vk_runtime"
    });
    await adapters.channelConnectors.MAX_STAGE.startConversation({
      channel: "MAX_STAGE",
      descriptorId: "max_runtime_proactive",
      idempotencyKey: "max-runtime-key",
      message: "MAX runtime proactive",
      outboxEventId: "outbox_max_runtime",
      phone: "+79000000002",
      traceId: "trc_max_runtime"
    });

    assert.deepEqual(calls.map((call) => call.url), [
      "https://vk.provider.example.test/messages.send",
      "https://max.provider.example.test/messages"
    ]);
    assert.deepEqual(calls.map((call) => call.headers["idempotency-key"]), [
      "vk-runtime-key",
      "max-runtime-key"
    ]);
    assert.deepEqual(calls.map((call) => call.body), [
      { message: "VK runtime hello", peer_id: "vk-peer-runtime" },
      { phone: "+79000000002", text: "MAX runtime proactive" }
    ]);
  });

  it("bounds VK and MAX provider calls with sanitized failures and timeouts", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const vk = worker.createVkChannelConnector({
      endpoint: "https://vk.provider.example.test/messages.send",
      fetcher: async () => {
        throw new Error("raw VK provider token SECRET body");
      },
      timeoutMs: 25
    });
    const max = worker.createMaxChannelConnector({
      endpoint: "https://max.provider.example.test/messages",
      fetcher: async (_url: string, init: { signal?: AbortSignal }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(init.signal?.aborted, true);
        return { ok: true, status: 200, text: async () => "" };
      },
      timeoutMs: 5
    });

    await assert.rejects(
      vk.deliverMessage({
        channel: "VK",
        conversationId: "vk-peer-failure",
        descriptorId: "vk_failure",
        idempotencyKey: "vk-key-failure",
        messageId: "msg_vk_failure",
        outboxEventId: "outbox_vk_failure",
        text: "VK failure",
        traceId: "trc_vk_failure"
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "vk_dispatch_failed");
        assert.doesNotMatch(error.message, /SECRET|token|provider body/i);
        return true;
      }
    );
    await assert.rejects(
      max.deliverMessage({
        channel: "MAX",
        conversationId: "max-dialog-timeout",
        descriptorId: "max_timeout",
        idempotencyKey: "max-key-timeout",
        messageId: "msg_max_timeout",
        outboxEventId: "outbox_max_timeout",
        text: "MAX timeout",
        traceId: "trc_max_timeout"
      }),
      /max_dispatch_timeout:5/
    );
  });

  it("fails VK/MAX worker dispatch before provider calls when channel capabilities reject the descriptor", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const maxAttachment = await store.append(createOutboxEvent({
      aggregateId: "max-dialog-capability",
      aggregateType: "conversation",
      payload: { descriptorId: "max_attachment_capability" },
      queue: "message-delivery",
      traceId: "trc_max_attachment_capability",
      type: "message.delivery.requested"
    }));
    const vkProactive = await store.append(createOutboxEvent({
      aggregateId: "vk-proactive-capability",
      aggregateType: "conversation_outbound",
      payload: { descriptorId: "vk_proactive_capability" },
      queue: "message-delivery",
      traceId: "trc_vk_proactive_capability",
      type: "conversation.outbound.requested"
    }));
    let providerCalls = 0;
    const handlers = worker.createRuntimeOutboxHandlers({
      env: {
        OUTBOX_MAX_ENABLED: "true",
        OUTBOX_MAX_ENDPOINT: "https://max.provider.example.test/messages",
        OUTBOX_VK_ENABLED: "true",
        OUTBOX_VK_ENDPOINT: "https://vk.provider.example.test/messages.send"
      },
      fetcher: async () => {
        providerCalls += 1;
        return { ok: true, status: 200, text: async () => "" };
      },
      outboundDescriptorStore: {
        findOutboundDescriptorById: async (descriptorId: string) => {
          if (descriptorId === "max_attachment_capability") {
            return {
              channel: "MAX",
              conversationId: "max-dialog-capability",
              id: descriptorId,
              idempotencyKey: "max-capability-key",
              kind: "message_delivery",
              messageId: "msg_max_capability",
              payload: {
                attachments: [{ providerAttachmentId: "max-file-1" }],
                text: "MAX blocked attachment"
              },
              tenantId: "tenant-volga"
            };
          }

          return {
            channel: "VK",
            conversationId: null,
            id: descriptorId,
            idempotencyKey: "vk-capability-key",
            kind: "outbound_conversation",
            messageId: null,
            payload: {
              message: "VK blocked proactive",
              phone: "+79000000003",
              topic: "Capability"
            },
            tenantId: "tenant-volga"
          };
        }
      },
      writeLog: () => undefined
    });

    const result = await worker.runOutboxWorker({
      handlers,
      limit: 2,
      once: true,
      queue: "message-delivery",
      store
    });

    assert.equal(result.failed, 2);
    assert.equal(result.published, 0);
    assert.equal(providerCalls, 0);
    const failed = await store.list({ statuses: ["failed"] });
    assert.match(failed.find((event) => event.id === maxAttachment.id)?.lastError ?? "", /max_attachments_unsupported/);
    assert.match(failed.find((event) => event.id === vkProactive.id)?.lastError ?? "", /vk_proactive_delivery_unsupported/);
  });

  it("fails external outbox events when runtime adapters are not configured", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    assert.equal(typeof worker.createRuntimeOutboxHandlers, "function");
    const store = new InMemoryOutboxStore();
    const delivery = await store.append(createOutboxEvent({
      aggregateId: "maria",
      aggregateType: "conversation",
      payload: { descriptorId: "delivery_runtime_missing_adapter" },
      queue: "message-delivery",
      traceId: "trc_runtime_missing_delivery_adapter",
      type: "message.delivery.requested"
    }));
    const scan = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_missing_adapter",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_missing_adapter" },
      queue: "file-scan",
      traceId: "trc_runtime_missing_scan_adapter",
      type: "attachment.upload.requested"
    }));

    const handlers = worker.createRuntimeOutboxHandlers({
      env: {},
      outboundDescriptorStore: {
        findOutboundDescriptorById: async (descriptorId: string) => descriptorId === "delivery_runtime_missing_adapter"
          ? {
            channel: "Email",
            conversationId: "maria",
            id: descriptorId,
            idempotencyKey: "delivery-runtime-missing-adapter",
            kind: "message_delivery",
            messageId: "msg_runtime_missing_adapter",
            payload: { text: "Runtime delivery without adapter" },
            tenantId: "tenant-volga"
          }
          : {
            channel: "SDK",
            conversationId: null,
            id: descriptorId,
            idempotencyKey: "scan-runtime-missing-adapter",
            kind: "attachment_upload",
            messageId: null,
            payload: { fileName: "runtime.pdf", sizeBytes: 2048 }
          }
      },
      writeLog: () => undefined
    });

    const deliveryResult = await worker.runOutboxWorker({
      handlers,
      once: true,
      queue: "message-delivery",
      store
    });
    const scanResult = await worker.runOutboxWorker({
      handlers,
      once: true,
      queue: "file-scan",
      store
    });

    assert.equal(deliveryResult.failed, 1);
    assert.equal(deliveryResult.published, 0);
    assert.equal(scanResult.failed, 1);
    assert.equal(scanResult.published, 0);
    const failed = await store.list({ statuses: ["failed"] });
    assert.match(failed.find((event) => event.id === delivery.id)?.lastError ?? "", /channel_connector_not_registered:Email/);
    assert.match(failed.find((event) => event.id === scan.id)?.lastError ?? "", /file_scanner_not_configured/);
  });

  it("dispatches message-delivery outbox events through channel connector adapters", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const delivery = await store.append(createOutboxEvent({
      aggregateId: "maria",
      aggregateType: "conversation",
      payload: { descriptorId: "delivery_002" },
      queue: "message-delivery",
      traceId: "trc_connector_delivery",
      type: "message.delivery.requested"
    }));
    const outbound = await store.append(createOutboxEvent({
      aggregateId: "outbound_002",
      aggregateType: "conversation_outbound",
      payload: { descriptorId: "outbound_002" },
      queue: "message-delivery",
      traceId: "trc_connector_outbound",
      type: "conversation.outbound.requested"
    }));
    const connectorCalls: Array<{ kind: string; request: Record<string, unknown> }> = [];
    const descriptors = new Map<string, Record<string, unknown>>([
      ["delivery_002", {
        channel: "Telegram",
        conversationId: "maria",
        id: "delivery_002",
        idempotencyKey: "reply-key-002",
        kind: "message_delivery",
        messageId: "msg_agent_002",
        payload: {
          text: "Reply from descriptor"
        },
        tenantId: "tenant-volga"
      }],
      ["outbound_002", {
        channel: "Telegram",
        conversationId: null,
        id: "outbound_002",
        idempotencyKey: "outbound-key-002",
        kind: "outbound_conversation",
        messageId: null,
        payload: {
          clientName: "Runtime Client",
          message: "Hello from descriptor",
          phone: "+7 900 000-00-00",
          topic: "Delivery / Status"
        },
        tenantId: "tenant-volga"
      }]
    ]);

    const result = await worker.runOutboxWorker({
      handlers: worker.createDefaultOutboxHandlers({
        channelConnectors: {
          Telegram: {
            deliverMessage: async (request: Record<string, unknown>) => {
              connectorCalls.push({ kind: "deliverMessage", request });
            },
            startConversation: async (request: Record<string, unknown>) => {
              connectorCalls.push({ kind: "startConversation", request });
            }
          }
        },
        outboundDescriptorStore: {
          findOutboundDescriptorById: async (descriptorId: string) => descriptors.get(descriptorId)
        },
        writeLog: () => undefined
      }),
      once: true,
      queue: "message-delivery",
      store
    });

    assert.equal(result.failed, 0);
    assert.equal(result.published, 2);
    assert.deepEqual(connectorCalls.map((call) => call.kind), ["deliverMessage", "startConversation"]);
    assert.deepEqual(connectorCalls.map((call) => call.request.descriptorId), ["delivery_002", "outbound_002"]);
    assert.deepEqual(connectorCalls.map((call) => call.request.idempotencyKey), ["reply-key-002", "outbound-key-002"]);
    assert.deepEqual(connectorCalls.map((call) => call.request.outboxEventId), [delivery.id, outbound.id]);
    assert.deepEqual(connectorCalls.map((call) => call.request.text ?? call.request.message), ["Reply from descriptor", "Hello from descriptor"]);
    assert.deepEqual(connectorCalls.map((call) => call.request.traceId), ["trc_connector_delivery", "trc_connector_outbound"]);
  });

  it("dispatches attachment upload requests through the file scan adapter", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const upload = await store.append(createOutboxEvent({
      aggregateId: "attachment_002",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_002" },
      queue: "file-scan",
      traceId: "trc_connector_file_scan",
      type: "attachment.upload.requested"
    }));
    const scanRequests: Array<Record<string, unknown>> = [];
    const descriptors = new Map<string, Record<string, unknown>>([
      ["attachment_002", {
        channel: "SDK",
        conversationId: null,
        id: "attachment_002",
        idempotencyKey: "attachment-key-002",
        kind: "attachment_upload",
        messageId: null,
        payload: {
          fileId: "file_scan_002",
          fileName: "contract.pdf",
          sizeBytes: 2048
        }
      }]
    ]);

    const result = await worker.runOutboxWorker({
      handlers: worker.createDefaultOutboxHandlers({
        fileScanner: {
          queueAttachmentScan: async (request: Record<string, unknown>) => {
            scanRequests.push(request);
          }
        },
        outboundDescriptorStore: {
          findOutboundDescriptorById: async (descriptorId: string) => descriptors.get(descriptorId)
        },
        writeLog: () => undefined
      }),
      once: true,
      queue: "file-scan",
      store
    });

    assert.equal(result.failed, 0);
    assert.equal(result.published, 1);
    assert.deepEqual(scanRequests, [{
      channel: "SDK",
      descriptorId: "attachment_002",
      fileId: "file_scan_002",
      fileName: "contract.pdf",
      idempotencyKey: "attachment-key-002",
      outboxEventId: upload.id,
      sizeBytes: 2048,
      traceId: "trc_connector_file_scan"
    }]);
  });

  it("claims only file-scan descriptors for scanner execution", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const now = new Date("2026-06-29T09:00:00.000Z");
    const scanDescriptor = await store.append(createOutboxEvent({
      aggregateId: "attachment_claim_scan",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_claim_scan" },
      queue: "file-scan",
      traceId: "trc_file_scan_claim",
      type: "attachment.upload.requested"
    }));
    const deliveryDescriptor = await store.append(createOutboxEvent({
      aggregateId: "message_claim_delivery",
      aggregateType: "conversation",
      payload: { descriptorId: "message_claim_delivery" },
      queue: "message-delivery",
      traceId: "trc_delivery_claim",
      type: "message.delivery.requested"
    }));

    const claimed = await worker.claimFileScanDescriptors({
      leaseTimeoutMs: 60_000,
      limit: 10,
      now,
      store
    });

    assert.deepEqual(claimed.map((descriptor: { id: string }) => descriptor.id), [scanDescriptor.id]);
    assert.equal(claimed[0].queue, "file-scan");
    assert.equal(claimed[0].status, "publishing");
    assert.equal(claimed[0].lockedAt, "2026-06-29T09:00:00.000Z");
    assert.deepEqual(await store.list({ queue: "file-scan", statuses: ["pending"] }), []);
    assert.deepEqual((await store.list({ queue: "message-delivery", statuses: ["pending"] })).map((item) => item.id), [deliveryDescriptor.id]);
  });

  it("claims file-scan descriptors from an explicitly configured scanner queue", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const defaultQueue = await store.append(createOutboxEvent({
      aggregateId: "attachment_default_scan_queue",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_default_scan_queue" },
      queue: "file-scan",
      traceId: "trc_default_scan_queue",
      type: "attachment.upload.requested"
    }));
    const smokeQueue = await store.append(createOutboxEvent({
      aggregateId: "attachment_smoke_scan_queue",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_smoke_scan_queue" },
      queue: "file-scan-smoke",
      traceId: "trc_smoke_scan_queue",
      type: "attachment.upload.requested"
    }));

    const claimed = await worker.claimFileScanDescriptors({
      leaseTimeoutMs: 60_000,
      limit: 10,
      now: new Date("2026-06-29T09:02:00.000Z"),
      queue: "file-scan-smoke",
      store
    });

    assert.deepEqual(claimed.map((descriptor: { id: string }) => descriptor.id), [smokeQueue.id]);
    assert.deepEqual((await store.list({ queue: "file-scan", statuses: ["pending"] })).map((item) => item.id), [defaultQueue.id]);
  });

  it("runs one scanner worker claim pass over only file-scan descriptors", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const now = new Date("2026-06-29T09:03:00.000Z");
    const scanDescriptor = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_claim",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_claim" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_claim",
      type: "attachment.upload.requested"
    }));
    const deliveryDescriptor = await store.append(createOutboxEvent({
      aggregateId: "message_runtime_claim",
      aggregateType: "conversation",
      payload: { descriptorId: "message_runtime_claim" },
      queue: "message-delivery",
      traceId: "trc_message_runtime_claim",
      type: "message.delivery.requested"
    }));

    const result = await worker.runFileScanScannerClaimWorker({
      leaseTimeoutMs: 90_000,
      limit: 1,
      now,
      store
    });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 0,
      scanned: 1,
      stopped: false
    });
    const [claimed] = await store.list({ queue: "file-scan", statuses: ["publishing"] });
    assert.equal(claimed.id, scanDescriptor.id);
    assert.equal(claimed.lockedAt, "2026-06-29T09:03:00.000Z");
    assert.deepEqual((await store.list({ queue: "message-delivery", statuses: ["pending"] })).map((item) => item.id), [deliveryDescriptor.id]);
  });

  it("runs one scanner worker execution pass that calls the scanner adapter once", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_scan_call",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_scan_call" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_scan_call",
      type: "attachment.upload.requested"
    }));
    await store.append(createOutboxEvent({
      aggregateId: "message_runtime_scan_skip",
      aggregateType: "conversation",
      payload: { descriptorId: "message_runtime_scan_skip" },
      queue: "message-delivery",
      traceId: "trc_message_runtime_scan_skip",
      type: "message.delivery.requested"
    }));
    const scanCalls: Array<Record<string, unknown>> = [];

    const result = await worker.runFileScanScannerWorker({
      leaseTimeoutMs: 60_000,
      limit: 1,
      now: new Date("2026-06-29T09:04:00.000Z"),
      outboundDescriptorStore: {
        findOutboundDescriptorById: async (descriptorId: string) => descriptorId === "attachment_runtime_scan_call"
          ? {
            channel: "SDK",
            conversationId: null,
            id: "attachment_runtime_scan_call",
            idempotencyKey: "runtime-scan-call-key",
            kind: "attachment_upload",
            messageId: null,
            payload: {
              fileId: "file_runtime_scan_call",
              fileName: "runtime-scan-call.pdf",
              sizeBytes: 8192
            }
          }
          : null
      },
      scanner: {
        scanAttachment: async (request: Record<string, unknown>) => {
          scanCalls.push(request);
          return {
            checkedAt: "2026-06-29T09:04:30.000Z",
            scanner: "runtime-scanner",
            verdict: "clean"
          };
        }
      },
      store
    });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 0,
      scanned: 1,
      stopped: false
    });
    assert.deepEqual(scanCalls, [{
      channel: "SDK",
      descriptorId: "attachment_runtime_scan_call",
      fileId: "file_runtime_scan_call",
      fileName: "runtime-scan-call.pdf",
      idempotencyKey: "runtime-scan-call-key",
      outboxEventId: event.id,
      sizeBytes: 8192,
      traceId: "trc_file_scan_runtime_scan_call"
    }]);
    assert.deepEqual((await store.list({ queue: "file-scan", statuses: ["publishing"] })).map((item) => item.id), [event.id]);
    assert.deepEqual(await store.list({ queue: "file-scan", statuses: ["published"] }), []);
  });

  it("runs scanner worker execution from an explicitly configured scanner queue", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const defaultQueue = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_scan_default_queue",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_scan_default_queue" },
      queue: "file-scan",
      traceId: "trc_runtime_scan_default_queue",
      type: "attachment.upload.requested"
    }));
    const smokeQueue = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_scan_smoke_queue",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_scan_smoke_queue" },
      queue: "file-scan-smoke",
      traceId: "trc_runtime_scan_smoke_queue",
      type: "attachment.upload.requested"
    }));
    const scanCalls: Array<Record<string, unknown>> = [];

    const result = await worker.runFileScanScannerWorker({
      leaseTimeoutMs: 60_000,
      limit: 1,
      now: new Date("2026-06-29T09:04:45.000Z"),
      outboundDescriptorStore: {
        findOutboundDescriptorById: async (descriptorId: string) => descriptorId === "attachment_runtime_scan_smoke_queue"
          ? {
            channel: "SDK",
            conversationId: null,
            id: descriptorId,
            idempotencyKey: "runtime-scan-smoke-queue-key",
            kind: "attachment_upload",
            messageId: null,
            payload: {
              fileId: "file_runtime_scan_smoke_queue",
              fileName: "runtime-scan-smoke-queue.pdf",
              sizeBytes: 1024
            },
            tenantId: "tenant-lumen"
          }
          : null
      },
      queue: "file-scan-smoke",
      scanResultCallback: {
        recordScanResult: async () => undefined
      },
      scanner: {
        scanAttachment: async (request: Record<string, unknown>) => {
          scanCalls.push(request);
          return {
            checkedAt: "2026-06-29T09:04:46.000Z",
            scanner: "runtime-scanner",
            verdict: "clean"
          };
        }
      },
      store
    });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 1,
      scanned: 1,
      stopped: false
    });
    assert.deepEqual(scanCalls.map((request) => request.descriptorId), ["attachment_runtime_scan_smoke_queue"]);
    assert.deepEqual((await store.list({ queue: "file-scan-smoke", statuses: ["published"] })).map((item) => item.id), [smokeQueue.id]);
    assert.deepEqual((await store.list({ queue: "file-scan", statuses: ["pending"] })).map((item) => item.id), [defaultQueue.id]);
  });

  it("keeps the runtime scanner worker polling when not started in once mode", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const sleeps: number[] = [];

    const result = await worker.runRuntimeFileScanScannerWorker({
      env: {
        OUTBOX_FILE_SCAN_RESULT_BASE_URL: "https://api.example.test/api/v1",
        OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN: "service-admin-scan-token",
        OUTBOX_SCANNER_ENABLED: "true",
        OUTBOX_SCANNER_PROVIDER_MODE: "local"
      },
      fetcher: async () => {
        throw new Error("idle scanner loop must not call fetch");
      },
      maxIterations: 2,
      once: false,
      outboundDescriptorStore: {
        findOutboundDescriptorById: () => {
          throw new Error("idle scanner loop must not read descriptors");
        }
      },
      sleep: async (milliseconds: number) => {
        sleeps.push(milliseconds);
      },
      store
    });

    assert.equal(result.iterations, 2);
    assert.equal(result.scanned, 0);
    assert.deepEqual(sleeps, [1000]);
  });

  it("posts successful scanner output to the scan-result callback and publishes the descriptor", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_callback",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_callback" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_callback",
      type: "attachment.upload.requested"
    }));
    const callbacks: Array<Record<string, unknown>> = [];

    const result = await worker.runFileScanScannerWorker({
      now: new Date("2026-06-29T09:30:00.000Z"),
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "SDK",
          conversationId: null,
          id: "attachment_runtime_callback",
          idempotencyKey: "runtime-callback-key",
          kind: "attachment_upload",
          messageId: null,
          payload: {
            fileId: "file_runtime_callback",
            fileName: "runtime-callback.pdf",
            sizeBytes: 2048
          }
        })
      },
      scanResultCallback: {
        recordScanResult: async (request: Record<string, unknown>) => {
          callbacks.push(request);
        }
      },
      scanner: {
        scanAttachment: async () => ({
          checkedAt: "2026-06-29T09:30:20.000Z",
          reason: "runtime clean",
          scanner: "runtime-scanner",
          verdict: "clean"
        })
      },
      store
    });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 1,
      scanned: 1,
      stopped: false
    });
    assert.deepEqual(callbacks, [{
      checkedAt: "2026-06-29T09:30:20.000Z",
      fileId: "file_runtime_callback",
      idempotencyKey: "runtime-callback-key",
      reason: "runtime clean",
      scanner: "runtime-scanner",
      traceId: "trc_file_scan_runtime_callback",
      verdict: "clean"
    }]);
    assert.deepEqual((await store.list({ queue: "file-scan", statuses: ["published"] })).map((item) => item.id), [event.id]);
  });

  it("does not publish scanner work when the scan-result callback returns an error envelope", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_callback_error",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_callback_error" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_callback_error",
      type: "attachment.upload.requested"
    }));
    const httpCalls: string[] = [];

    const result = await worker.runRuntimeFileScanScannerWorker({
      env: {
        OUTBOX_FILE_SCAN_RESULT_BASE_URL: "https://api.example.test/api/v1",
        OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN: "service-admin-scan-token",
        OUTBOX_SCANNER_ENABLED: "true",
        OUTBOX_SCANNER_PROVIDER_MODE: "http",
        OUTBOX_SCANNER_URL: "https://scanner.example.test/runtime"
      },
      fetcher: async (url: string) => {
        httpCalls.push(url);
        return {
          ok: true,
          status: 200,
          text: async () => url.includes("scanner.example.test")
            ? JSON.stringify({
              checkedAt: "2026-06-29T09:38:00.000Z",
              reason: "runtime clean",
              scanner: "runtime-scanner",
              verdict: "clean"
            })
            : JSON.stringify({
              error: {
                code: "file_not_found",
                message: "File file_runtime_callback_error was not found."
              },
              status: "not_found"
            })
        };
      },
      now: new Date("2026-06-29T09:38:30.000Z"),
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "SDK",
          conversationId: null,
          id: "attachment_runtime_callback_error",
          idempotencyKey: "runtime-callback-error-key",
          kind: "attachment_upload",
          messageId: null,
          payload: {
            fileId: "file_runtime_callback_error",
            fileName: "runtime-callback-error.pdf",
            sizeBytes: 4096
          }
        })
      },
      store
    });

    assert.deepEqual(result, {
      failed: 1,
      iterations: 1,
      published: 0,
      scanned: 1,
      stopped: false
    });
    assert.deepEqual(httpCalls, [
      "https://scanner.example.test/runtime",
      "https://api.example.test/api/v1/files/file_runtime_callback_error/scan-result"
    ]);
    const [failed] = await store.list({ queue: "file-scan", statuses: ["failed"] });
    assert.equal(failed.id, event.id);
    assert.equal(failed.lastError, "file_scan_result_callback_rejected:not_found:file_not_found");
    assert.deepEqual(await store.list({ queue: "file-scan", statuses: ["published"] }), []);
  });

  it("marks scanner worker failures retryable without publishing the descriptor", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const failedAt = new Date("2026-06-29T09:40:00.000Z");
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_retry",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_retry" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_retry",
      type: "attachment.upload.requested"
    }));

    const result = await worker.runFileScanScannerWorker({
      maxAttempts: 3,
      now: failedAt,
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "SDK",
          conversationId: null,
          id: "attachment_runtime_retry",
          idempotencyKey: "runtime-retry-key",
          kind: "attachment_upload",
          messageId: null,
          payload: {
            fileId: "file_runtime_retry",
            fileName: "runtime-retry.pdf",
            sizeBytes: 2048
          }
        })
      },
      retryBackoffMs: 120_000,
      scanResultCallback: {
        recordScanResult: async () => {
          throw new Error("callback must not run after scanner failure");
        }
      },
      scanner: {
        scanAttachment: async () => {
          throw new Error("scanner unavailable");
        }
      },
      store
    });

    assert.deepEqual(result, {
      failed: 1,
      iterations: 1,
      published: 0,
      scanned: 1,
      stopped: false
    });
    const [failed] = await store.list({ queue: "file-scan", statuses: ["failed"] });
    assert.equal(failed.id, event.id);
    assert.equal(failed.attempts, 1);
    assert.equal(failed.lastError, "scanner unavailable");
    assert.equal(failed.nextAttemptAt, "2026-06-29T09:42:00.000Z");
    assert.equal(failed.deadLetteredAt, null);
    assert.deepEqual(await store.list({ queue: "file-scan", statuses: ["published"] }), []);
  });

  it("dead-letters scanner worker failures after the attempt budget is exhausted", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const failedAt = new Date("2026-06-29T09:45:00.000Z");
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_dead_letter",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_dead_letter" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_dead_letter",
      type: "attachment.upload.requested"
    }));

    const result = await worker.runFileScanScannerWorker({
      maxAttempts: 1,
      now: failedAt,
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "SDK",
          conversationId: null,
          id: "attachment_runtime_dead_letter",
          idempotencyKey: "runtime-dead-letter-key",
          kind: "attachment_upload",
          messageId: null,
          payload: {
            fileId: "file_runtime_dead_letter",
            fileName: "runtime-dead-letter.pdf",
            sizeBytes: 2048
          }
        })
      },
      retryBackoffMs: 120_000,
      scanner: {
        scanAttachment: async () => {
          throw new Error("scanner budget exhausted");
        }
      },
      store
    });

    assert.deepEqual(result, {
      failed: 1,
      iterations: 1,
      published: 0,
      scanned: 1,
      stopped: false
    });
    const [deadLettered] = await store.list({ queue: "file-scan", statuses: ["dead_lettered"] });
    assert.equal(deadLettered.id, event.id);
    assert.equal(deadLettered.attempts, 1);
    assert.equal(deadLettered.lastError, "scanner budget exhausted");
    assert.equal(deadLettered.nextAttemptAt, null);
    assert.equal(deadLettered.deadLetteredAt, "2026-06-29T09:45:00.000Z");
    assert.deepEqual(await store.list({ queue: "file-scan", statuses: ["published"] }), []);
  });

  it("keeps scanner worker failure state sanitized before retry", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    await store.append(createOutboxEvent({
      aggregateId: "attachment_runtime_sanitized_failure",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_runtime_sanitized_failure" },
      queue: "file-scan",
      traceId: "trc_file_scan_runtime_sanitized_failure",
      type: "attachment.upload.requested"
    }));

    await worker.runFileScanScannerWorker({
      now: new Date("2026-06-29T09:50:00.000Z"),
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "SDK",
          conversationId: null,
          id: "attachment_runtime_sanitized_failure",
          idempotencyKey: "runtime-sanitized-failure-key",
          kind: "attachment_upload",
          messageId: null,
          payload: {
            fileId: "file_runtime_sanitized_failure",
            fileName: "runtime-sanitized-failure.pdf",
            sizeBytes: 2048
          }
        })
      },
      retryBackoffMs: 60_000,
      scanner: {
        scanAttachment: async () => {
          throw new Error("scanner failed for object tenant-volga/private/uploads/secret-file.pdf with authorization=Bearer scanner-secret-token");
        }
      },
      store
    });

    const [failed] = await store.list({ queue: "file-scan", statuses: ["failed"] });
    assert.match(failed.lastError ?? "", /\[REDACTED:object_key\]/);
    assert.match(failed.lastError ?? "", /Bearer \[REDACTED:api_key\]/);
    assert.doesNotMatch(failed.lastError ?? "", /tenant-volga\/private\/uploads\/secret-file\.pdf|scanner-secret-token/);
  });

  it("calls the scanner adapter with a normalized claimed file-scan descriptor", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_scanner_call",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_scanner_call" },
      queue: "file-scan",
      traceId: "trc_file_scan_adapter_call",
      type: "attachment.upload.requested"
    }));
    const [claimed] = await worker.claimFileScanDescriptors({
      now: new Date("2026-06-29T09:05:00.000Z"),
      store
    });
    const scanCalls: Array<Record<string, unknown>> = [];

    await worker.executeClaimedFileScanDescriptor({
      event: claimed,
      outboundDescriptorStore: {
        findOutboundDescriptorById: async (descriptorId: string) => descriptorId === "attachment_scanner_call"
          ? {
            channel: "SDK",
            conversationId: null,
            id: "attachment_scanner_call",
            idempotencyKey: "scan-call-idempotency",
            kind: "attachment_upload",
            messageId: null,
            payload: {
              fileId: "file_scan_call",
              fileName: "scan-call.pdf",
              sizeBytes: 3072
            }
          }
          : null
      },
      scanner: {
        scanAttachment: async (request: Record<string, unknown>) => {
          scanCalls.push(request);
        }
      }
    });

    assert.equal(claimed.id, event.id);
    assert.deepEqual(scanCalls, [{
      channel: "SDK",
      descriptorId: "attachment_scanner_call",
      fileId: "file_scan_call",
      fileName: "scan-call.pdf",
      idempotencyKey: "scan-call-idempotency",
      outboxEventId: event.id,
      sizeBytes: 3072,
      traceId: "trc_file_scan_adapter_call"
    }]);
  });

  it("returns scanner callback payloads with stable descriptor idempotency keys", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    await store.append(createOutboxEvent({
      aggregateId: "attachment_callback_idempotency",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_callback_idempotency" },
      queue: "file-scan",
      traceId: "trc_file_scan_callback_idempotency",
      type: "attachment.upload.requested"
    }));
    const [claimed] = await worker.claimFileScanDescriptors({
      now: new Date("2026-06-29T09:10:00.000Z"),
      store
    });

    const callback = await worker.executeClaimedFileScanDescriptor({
      event: claimed,
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "SDK",
          conversationId: null,
          id: "attachment_callback_idempotency",
          idempotencyKey: "scan-callback-stable-key",
          kind: "attachment_upload",
          messageId: null,
          payload: {
            fileId: "file_callback_idempotency",
            fileName: "callback.pdf",
            sizeBytes: 512
          }
        })
      },
      scanner: {
        scanAttachment: async () => ({
          checkedAt: "2026-06-29T09:10:30.000Z",
          reason: "clamav clean",
          scanner: "clamav",
          verdict: "clean"
        })
      }
    });

    assert.deepEqual(callback, {
      checkedAt: "2026-06-29T09:10:30.000Z",
      fileId: "file_callback_idempotency",
      idempotencyKey: "scan-callback-stable-key",
      reason: "clamav clean",
      scanner: "clamav",
      traceId: "trc_file_scan_callback_idempotency",
      verdict: "clean"
    });
  });

  it("provides a deterministic scanner adapter for worker tests", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const calls: Array<Record<string, unknown>> = [];
    const scanner = worker.createDeterministicAttachmentScanner({
      onScan: (request: Record<string, unknown>) => calls.push(request),
      result: {
        checkedAt: "2026-06-29T09:15:00.000Z",
        reason: "deterministic clean",
        scanner: "deterministic-scanner",
        verdict: "clean"
      }
    });

    const result = await scanner.scanAttachment({
      channel: "SDK",
      descriptorId: "attachment_deterministic_scanner",
      fileId: "file_deterministic_scanner",
      fileName: "deterministic.pdf",
      idempotencyKey: "deterministic-scan-key",
      outboxEventId: "outbox_deterministic_scanner",
      sizeBytes: 1024,
      traceId: "trc_deterministic_scanner"
    });

    assert.deepEqual(result, {
      checkedAt: "2026-06-29T09:15:00.000Z",
      reason: "deterministic clean",
      scanner: "deterministic-scanner",
      verdict: "clean"
    });
    assert.deepEqual(calls.map((call) => call.fileId), ["file_deterministic_scanner"]);
  });

  it("falls back to descriptor id for legacy file-scan descriptors without fileId", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const upload = await store.append(createOutboxEvent({
      aggregateId: "attachment_legacy_file_id",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_legacy_file_id" },
      queue: "file-scan",
      traceId: "trc_connector_file_scan_legacy",
      type: "attachment.upload.requested"
    }));
    const scanRequests: Array<Record<string, unknown>> = [];

    const result = await worker.runOutboxWorker({
      handlers: worker.createDefaultOutboxHandlers({
        fileScanner: {
          queueAttachmentScan: async (request: Record<string, unknown>) => {
            scanRequests.push(request);
          }
        },
        outboundDescriptorStore: {
          findOutboundDescriptorById: async () => ({
            channel: "SDK",
            conversationId: null,
            id: "attachment_legacy_file_id",
            idempotencyKey: "attachment-legacy-key",
            kind: "attachment_upload",
            messageId: null,
            payload: {
              fileName: "legacy.pdf",
              sizeBytes: 1024
            }
          })
        },
        writeLog: () => undefined
      }),
      once: true,
      queue: "file-scan",
      store
    });

    assert.equal(result.failed, 0);
    assert.equal(result.published, 1);
    assert.deepEqual(scanRequests, [{
      channel: "SDK",
      descriptorId: "attachment_legacy_file_id",
      fileId: "attachment_legacy_file_id",
      fileName: "legacy.pdf",
      idempotencyKey: "attachment-legacy-key",
      outboxEventId: upload.id,
      sizeBytes: 1024,
      traceId: "trc_connector_file_scan_legacy"
    }]);
  });

  it("fails connector outbox events with malformed payloads before publishing", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "maria",
      aggregateType: "conversation",
      payload: { descriptorId: "delivery_missing_channel" },
      queue: "message-delivery",
      traceId: "trc_connector_malformed",
      type: "message.delivery.requested"
    }));

    const result = await worker.runOutboxWorker({
      handlers: worker.createDefaultOutboxHandlers({
        channelConnectors: {
          Telegram: {
            deliverMessage: async () => undefined,
            startConversation: async () => undefined
          }
        },
        outboundDescriptorStore: {
          findOutboundDescriptorById: async () => ({
            channel: "",
            conversationId: "maria",
            id: "delivery_missing_channel",
            idempotencyKey: "malformed-key",
            kind: "message_delivery",
            messageId: "msg_agent_missing_channel",
            payload: { text: "No channel" },
            tenantId: "tenant-volga"
          })
        },
        writeLog: () => undefined
      }),
      once: true,
      queue: "message-delivery",
      store
    });

    assert.equal(result.failed, 1);
    assert.equal(result.published, 0);
    const failed = (await store.list({ statuses: ["failed"] })).find((item) => item.id === event.id);
    assert.match(failed?.lastError ?? "", /channel_required/);
  });

  it("fails file-scan descriptors with malformed size before publishing", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "attachment_malformed",
      aggregateType: "attachment",
      payload: { descriptorId: "attachment_malformed" },
      queue: "file-scan",
      traceId: "trc_connector_file_scan_malformed",
      type: "attachment.upload.requested"
    }));
    const scanRequests: Array<Record<string, unknown>> = [];

    const result = await worker.runOutboxWorker({
      handlers: worker.createDefaultOutboxHandlers({
        fileScanner: {
          queueAttachmentScan: async (request: Record<string, unknown>) => {
            scanRequests.push(request);
          }
        },
        outboundDescriptorStore: {
          findOutboundDescriptorById: async () => ({
            channel: "SDK",
            conversationId: null,
            id: "attachment_malformed",
            idempotencyKey: "attachment-malformed-key",
            kind: "attachment_upload",
            messageId: null,
            payload: {
              fileName: "broken.pdf",
              sizeBytes: null
            }
          })
        },
        writeLog: () => undefined
      }),
      once: true,
      queue: "file-scan",
      store
    });

    assert.equal(result.failed, 1);
    assert.equal(result.published, 0);
    assert.deepEqual(scanRequests, []);
    const failed = (await store.list({ statuses: ["failed"] })).find((item) => item.id === event.id);
    assert.match(failed?.lastError ?? "", /size_bytes_required/);
  });

  it("marks unknown event types as failed instead of silently publishing them", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_outbox_worker_unknown",
      type: "tenant.unknown"
    }));

    const result = await worker.runOutboxWorker({
      handlers: {},
      once: true,
      queue: "identity-events",
      store
    });

    assert.deepEqual(result, {
      failed: 1,
      iterations: 1,
      published: 0,
      scanned: 1,
      stopped: false
    });

    const failed = (await store.list({ statuses: ["failed"] })).find((item) => item.id === event.id);
    assert.equal(failed?.attempts, 1);
    assert.match(failed?.lastError ?? "", /No outbox handler registered for tenant\.unknown/);
  });

  it("does not resolve inherited object properties as outbox handlers", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_outbox_worker_inherited",
      type: "toString"
    }));

    const result = await worker.runOutboxWorker({
      handlers: {},
      once: true,
      queue: "identity-events",
      store
    });

    assert.equal(result.failed, 1);
    assert.equal(result.published, 0);
    const failed = (await store.list({ statuses: ["failed"] })).find((item) => item.id === event.id);
    assert.match(failed?.lastError ?? "", /No outbox handler registered for toString/);
  });

  it("delays retryable outbox failures until their backoff window expires", async () => {
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_outbox_worker_backoff",
      type: "tenant.status.changed"
    }));
    const failedAt = new Date("2026-06-28T10:00:00.000Z");

    await store.claimPending({ now: failedAt, queue: "identity-events" });
    const failed = await store.markFailed(event.id, "queue unavailable", failedAt, {
      maxAttempts: 3,
      retryBackoffMs: 60_000
    });
    const earlyRetry = await store.claimPending({
      now: new Date("2026-06-28T10:00:30.000Z"),
      queue: "identity-events"
    });
    const readyRetry = await store.claimPending({
      now: new Date("2026-06-28T10:01:00.000Z"),
      queue: "identity-events"
    });

    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 1);
    assert.equal(failed.nextAttemptAt, "2026-06-28T10:01:00.000Z");
    assert.equal(failed.deadLetteredAt, null);
    assert.deepEqual(earlyRetry, []);
    assert.deepEqual(readyRetry.map((item) => item.id), [event.id]);
  });

  it("dead-letters outbox events after the configured attempt budget is exhausted", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_outbox_worker_dead_letter",
      type: "tenant.unknown"
    }));

    const result = await worker.runOutboxWorker({
      handlers: {},
      maxAttempts: 1,
      once: true,
      queue: "identity-events",
      retryBackoffMs: 60_000,
      store
    });

    assert.deepEqual(result, {
      failed: 1,
      iterations: 1,
      published: 0,
      scanned: 1,
      stopped: false
    });

    const deadLettered = (await store.list({ statuses: ["dead_lettered"] })).find((item) => item.id === event.id);
    assert.equal(deadLettered?.attempts, 1);
    assert.equal(deadLettered?.deadLetteredAt?.startsWith("20"), true);
    assert.equal(deadLettered?.nextAttemptAt, null);
    assert.match(deadLettered?.lastError ?? "", /No outbox handler registered for tenant\.unknown/);
    assert.deepEqual(await store.claimPending({ queue: "identity-events" }), []);
  });

  it("replays dead-lettered outbox events through a common queue helper", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    assert.equal(typeof worker.replayDeadLetteredQueueItem, "function");
    const store = new InMemoryOutboxStore();
    const replayAuditEvents: Array<Record<string, unknown>> = [];
    const originalReplayDeadLettered = store.replayDeadLettered.bind(store);
    store.replayDeadLettered = async (id, queue, reason, replayedAt, auditEvent) => {
      if (auditEvent) {
        replayAuditEvents.push(auditEvent);
      }
      return originalReplayDeadLettered(id, queue, reason, replayedAt, auditEvent);
    };
    const event = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_outbox_worker_replay",
      type: "tenant.status.changed"
    }));
    await store.claimPending({ now: new Date("2026-06-28T10:00:00.000Z"), queue: "identity-events" });
    await store.markFailed(event.id, "handler unavailable", new Date("2026-06-28T10:00:00.000Z"), {
      maxAttempts: 1,
      retryBackoffMs: 60_000
    });

    await assert.rejects(
      worker.replayDeadLetteredQueueItem({
        id: event.id,
        queue: "billing-sync",
        reason: "wrong queue",
        store
      }),
      /dead_letter_item_not_found:billing-sync/
    );
    replayAuditEvents.length = 0;

    const replayed = await worker.replayDeadLetteredQueueItem({
      id: event.id,
      now: new Date("2026-06-28T10:05:00.000Z"),
      queue: "identity-events",
      reason: "operator approved replay",
      store
    });
    const claimed = await store.claimPending({
      now: new Date("2026-06-28T10:05:00.000Z"),
      queue: "identity-events"
    });
    await store.markPublished(event.id, new Date("2026-06-28T10:05:01.000Z"));
    const published = (await store.list({ statuses: ["published"] }))[0];

    assert.equal(replayed.status, "failed");
    assert.equal(replayed.attempts, 2);
    assert.equal(replayed.deadLetteredAt, null);
    assert.equal(replayed.nextAttemptAt, null);
    assert.equal(replayed.lastError, "dead_letter_replay:operator approved replay");
    assert.equal(replayed.deadLetterReplayAuditEvents?.length, 1);
    assert.equal(replayed.deadLetterReplayAuditEvents?.[0]?.id, replayAuditEvents[0].id);
    assert.equal(replayAuditEvents.length, 1);
    assert.equal(replayAuditEvents[0].action, "worker.dead_letter.replay");
    assert.equal(replayAuditEvents[0].immutable, true);
    assert.equal(replayAuditEvents[0].queue, "identity-events");
    assert.equal(replayAuditEvents[0].target, event.id);
    assert.equal(replayAuditEvents[0].result, "requeued");
    assert.deepEqual(claimed.map((item) => item.id), [event.id]);
    assert.equal(published?.publishedAt, "2026-06-28T10:05:01.000Z");
  });

  it("delegates dead-letter replay to the queue store atomic transition", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const calls: Array<{ auditEvent?: Record<string, unknown>; id: string; now?: Date; queue: string; reason: string }> = [];
    const replayed = {
      attempts: 3,
      deadLetteredAt: null,
      id: "outbox_atomic_replay",
      queue: "identity-events",
      status: "failed"
    };
    const result = await worker.replayDeadLetteredQueueItem({
      id: replayed.id,
      now: new Date("2026-06-28T10:15:00.000Z"),
      queue: replayed.queue,
      reason: "atomic replay",
      store: {
        list: async () => {
          throw new Error("list must not be used for replay");
        },
        markFailed: async () => {
          throw new Error("markFailed must not be used for replay");
        },
        replayDeadLettered: async (id: string, queue: string, reason: string, now?: Date, auditEvent?: Record<string, unknown>) => {
          calls.push({ auditEvent, id, now, queue, reason });
          return replayed;
        }
      }
    });

    assert.deepEqual(result, replayed);
    assert.deepEqual(calls, [{
      id: "outbox_atomic_replay",
      now: new Date("2026-06-28T10:15:00.000Z"),
      queue: "identity-events",
      reason: "atomic replay",
      auditEvent: {
        action: "worker.dead_letter.replay",
        at: "2026-06-28T10:15:00.000Z",
        id: "evt_dead_letter_replay_outbox_atomic_replay_1782641700000",
        immutable: true,
        queue: "identity-events",
        reason: "atomic replay",
        result: "requeued",
        target: "outbox_atomic_replay"
      }
    }]);
  });

  it("loads worker options from environment and one-shot arguments", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");

    const config = worker.loadOutboxWorkerConfig({
      OUTBOX_BATCH_SIZE: "25",
      OUTBOX_LEASE_TIMEOUT_MS: "120000",
      OUTBOX_MAX_ATTEMPTS: "7",
      OUTBOX_POLL_INTERVAL_MS: "500",
      OUTBOX_QUEUE: "identity-events",
      OUTBOX_RETRY_BACKOFF_MS: "90000"
    }, ["--once"]);

    assert.deepEqual(config, {
      intervalMs: 500,
      leaseTimeoutMs: 120000,
      limit: 25,
      maxAttempts: 7,
      once: true,
      queue: "identity-events",
      retryBackoffMs: 90000
    });
  });

  it("loads BullMQ worker connection settings from the shared Redis environment", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");

    const config = worker.loadBullMqWorkerConfig({
      OUTBOX_BULLMQ_CONCURRENCY: "3",
      OUTBOX_BULLMQ_QUEUE: "outbox-domain-poll",
      REDIS_URL: "redis://support:secret@127.0.0.1:6380/2"
    });

    assert.deepEqual(config, {
      concurrency: 3,
      connection: {
        db: 2,
        host: "127.0.0.1",
        password: "secret",
        port: 6380,
        username: "support"
      },
      queueName: "outbox-domain-poll"
    });
  });

  it("wraps one-shot worker runs in a BullMQ processor without opening overlapping loops", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const created: Array<{
      name: string;
      options: Record<string, unknown>;
      processor: (job: { id?: string; name?: string }) => Promise<unknown>;
    }> = [];
    class FakeBullMqWorker {
      constructor(name: string, processor: (job: { id?: string; name?: string }) => Promise<unknown>, options: Record<string, unknown>) {
        created.push({ name, options, processor });
      }

      async close() {
        return undefined;
      }
    }
    const runs: string[] = [];

    const bridge = worker.createBullMqWorkerBridge({
      Worker: FakeBullMqWorker,
      concurrency: 2,
      connection: { host: "127.0.0.1", port: 6379 },
      queueName: "outbox-domain-poll",
      runOnce: async () => {
        runs.push("run-once");
        return {
          failed: 0,
          iterations: 1,
          published: 1,
          scanned: 1,
          stopped: false
        };
      },
      service: "outbox-worker",
      writeLog: () => undefined
    });
    const result = await created[0].processor({ id: "job-1", name: "poll" });

    assert.equal(typeof bridge.close, "function");
    assert.equal(created[0].name, "outbox-domain-poll");
    assert.deepEqual(created[0].options, {
      concurrency: 2,
      connection: { host: "127.0.0.1", port: 6379 }
    });
    assert.deepEqual(runs, ["run-once"]);
    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 1,
      scanned: 1,
      stopped: false
    });
  });

  it("processes billing provider sync jobs with registered handlers", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    assert.equal(typeof worker.runBillingSyncWorker, "function");
    assert.equal(typeof worker.createBillingSyncDispatcher, "function");

    const job = createBillingSyncJob({
      id: "billing_sync_provider_paid",
      payload: {
        eventType: "invoice.paid",
        provider: "stripe",
        providerInvoiceId: "in_paid",
        tenantId: "tenant-lumen"
      },
      traceId: "trc_billing_worker_paid"
    });
    const store = new InMemoryBillingSyncJobStore([job]);
    const handled: string[] = [];

    const result = await worker.runBillingSyncWorker({
      handlers: {
        "stripe.invoice.paid": async (handledJob: StoredBillingSyncJob) => {
          handled.push(handledJob.id);
          assert.equal(handledJob.status, "publishing");
        }
      },
      leaseTimeoutMs: 60_000,
      limit: 5,
      once: true,
      queue: "billing-sync",
      store
    });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 1,
      scanned: 1,
      stopped: false
    });
    assert.deepEqual(handled, ["billing_sync_provider_paid"]);
    const published = await store.list({ statuses: ["published"] });
    assert.equal(published[0]?.id, "billing_sync_provider_paid");
    assert.equal(published[0]?.publishedAt?.startsWith("20"), true);
  });

  it("dispatches billing sync jobs through the runtime provider adapter before publishing", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    assert.equal(typeof worker.createRuntimeBillingSyncHandlers, "function");

    const job = createBillingSyncJob({
      id: "billing_sync_runtime_provider_paid",
      payload: {
        eventType: "invoice.payment_succeeded",
        idempotencyKey: "billing-runtime-provider-key",
        invoiceId: "inv_runtime_provider",
        provider: "demo-billing-provider",
        providerInvoiceId: "provider-invoice-runtime",
        tenantId: "tenant-lumen"
      },
      reason: "invoice.payment_succeeded",
      traceId: "trc_billing_runtime_provider"
    });
    const store = new InMemoryBillingSyncJobStore([job]);
    const calls: Array<{ init: { body?: string; headers?: Record<string, string>; method?: string }; url: string }> = [];
    const logs: Array<{ context: Record<string, unknown>; level: string; message: string }> = [];

    const handlers = worker.createRuntimeBillingSyncHandlers({
      env: {
        BILLING_SYNC_PROVIDER_MODE: "http",
        BILLING_SYNC_PROVIDER_URL: "https://billing-provider.example.test/sync"
      },
      fetcher: async (url: string, init: { body?: string; headers?: Record<string, string>; method?: string }) => {
        calls.push({ url, init });
        return { ok: true, status: 202, text: async () => "" };
      },
      writeLog: (level: string, message: string, context: Record<string, unknown>) => {
        logs.push({ context, level, message });
      }
    });

    const result = await worker.runBillingSyncWorker({
      handlers,
      once: true,
      queue: "billing-sync",
      store
    });

    assert.equal(result.failed, 0);
    assert.equal(result.published, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://billing-provider.example.test/sync");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers?.["content-type"], "application/json");
    assert.equal(calls[0].init.headers?.["idempotency-key"], "billing-runtime-provider-key");
    assert.equal(calls[0].init.headers?.["x-trace-id"], "trc_billing_runtime_provider");
    assert.deepEqual(JSON.parse(calls[0].init.body ?? "{}"), {
      operation: "syncBillingJob",
      request: {
        eventType: "invoice.payment_succeeded",
        fromPlanId: "starter",
        idempotencyKey: "billing-runtime-provider-key",
        jobId: "billing_sync_runtime_provider_paid",
        payload: {
          eventType: "invoice.payment_succeeded",
          idempotencyKey: "billing-runtime-provider-key",
          invoiceId: "inv_runtime_provider",
          provider: "demo-billing-provider",
          providerInvoiceId: "provider-invoice-runtime",
          tenantId: "tenant-lumen"
        },
        provider: "demo-billing-provider",
        queue: "billing-sync",
        reason: "invoice.payment_succeeded",
        tenantId: "tenant-lumen",
        toPlanId: "business",
        traceId: "trc_billing_runtime_provider"
      }
    });
    assert.equal(logs.some((entry) => entry.message === "billing sync provider dispatch completed"), true);
    assert.equal((await store.list({ statuses: ["published"] }))[0]?.id, "billing_sync_runtime_provider_paid");
  });

  it("fails billing sync runtime jobs without an explicitly configured provider", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryBillingSyncJobStore([
      createBillingSyncJob({
        id: "billing_sync_runtime_provider_missing",
        payload: {
          eventType: "invoice.payment_succeeded",
          idempotencyKey: "billing-runtime-provider-missing-key",
          provider: "demo-billing-provider",
          tenantId: "tenant-lumen"
        },
        reason: "invoice.payment_succeeded",
        traceId: "trc_billing_runtime_provider_missing"
      })
    ]);

    const result = await worker.runBillingSyncWorker({
      handlers: worker.createRuntimeBillingSyncHandlers({ env: {} }),
      once: true,
      queue: "billing-sync",
      store
    });

    assert.equal(result.failed, 1);
    assert.equal(result.published, 0);
    assert.equal((await store.list({ statuses: ["published"] })).length, 0);
    assert.match((await store.list({ statuses: ["failed"] }))[0]?.lastError ?? "", /billing_sync_provider_not_configured/);
  });

  it("publishes known provider billing sync events through wildcard default handlers", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryBillingSyncJobStore([
      createBillingSyncJob({
        id: "billing_sync_default_demo_invoice",
        payload: {
          eventType: "invoice.payment_succeeded",
          provider: "demo-billing-provider",
          tenantId: "tenant-lumen"
        },
        traceId: "trc_billing_default_demo"
      }),
      createBillingSyncJob({
        id: "billing_sync_default_stripe_invoice",
        payload: {
          eventType: "invoice.paid",
          provider: "stripe",
          tenantId: "tenant-lumen"
        },
        traceId: "trc_billing_default_stripe"
      })
    ]);
    const logs: Array<{ context: Record<string, unknown>; level: string; message: string }> = [];

    const result = await worker.runBillingSyncWorker({
      handlers: worker.createDefaultBillingSyncHandlers({
        writeLog: (level: string, message: string, context: Record<string, unknown>) => {
          logs.push({ context, level, message });
        }
      }),
      once: true,
      queue: "billing-sync",
      store
    });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 1,
      published: 2,
      scanned: 2,
      stopped: false
    });
    assert.deepEqual((await store.list({ statuses: ["published"] })).map((job) => job.id).sort(), [
      "billing_sync_default_demo_invoice",
      "billing_sync_default_stripe_invoice"
    ]);
    assert.deepEqual(logs.map((entry) => entry.context.handlerKey).sort(), [
      "*.invoice.paid",
      "*.invoice.payment_succeeded"
    ]);
  });

  it("publishes first-party tariff billing sync jobs through the default registry", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryBillingSyncJobStore([
      createBillingSyncJob({
        id: "billing_sync_default_tariff_change",
        payload: {
          approvalId: null,
          fromPlanId: "starter",
          reason: "Persistent trial conversion",
          tenantId: "tenant-lumen",
          toPlanId: "business"
        },
        reason: "Persistent trial conversion",
        traceId: "trc_billing_default_tariff"
      })
    ]);

    const result = await worker.runBillingSyncWorker({
      handlers: worker.createDefaultBillingSyncHandlers({
        writeLog: () => undefined
      }),
      once: true,
      queue: "billing-sync",
      store
    });

    assert.equal(result.failed, 0);
    assert.equal(result.published, 1);
    assert.equal((await store.list({ statuses: ["published"] }))[0]?.id, "billing_sync_default_tariff_change");
  });

  it("marks unknown billing provider sync job handlers as failed", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryBillingSyncJobStore([
      createBillingSyncJob({
        id: "billing_sync_unknown_provider_event",
        payload: {
          eventType: "customer.subscription.updated",
          provider: "stripe",
          tenantId: "tenant-lumen"
        },
        traceId: "trc_billing_worker_unknown"
      })
    ]);

    const result = await worker.runBillingSyncWorker({
      handlers: {},
      once: true,
      queue: "billing-sync",
      store
    });

    assert.deepEqual(result, {
      failed: 1,
      iterations: 1,
      published: 0,
      scanned: 1,
      stopped: false
    });

    const failed = (await store.list({ statuses: ["failed"] }))[0];
    assert.equal(failed?.attempts, 1);
    assert.match(failed?.lastError ?? "", /No billing sync handler registered for stripe\.customer\.subscription\.updated/);
  });

  it("does not resolve inherited object properties as billing sync handlers", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryBillingSyncJobStore([
      createBillingSyncJob({
        id: "billing_sync_inherited_handler",
        payload: {
          eventType: "toString",
          tenantId: "tenant-lumen"
        },
        reason: "toString",
        traceId: "trc_billing_worker_inherited"
      })
    ]);

    const result = await worker.runBillingSyncWorker({
      handlers: {},
      once: true,
      queue: "billing-sync",
      store
    });

    assert.equal(result.failed, 1);
    assert.equal(result.published, 0);
    const failed = (await store.list({ statuses: ["failed"] }))[0];
    assert.match(failed?.lastError ?? "", /No billing sync handler registered for toString/);
  });

  it("delays retryable billing sync job failures until their backoff window expires", async () => {
    const job = createBillingSyncJob({
      id: "billing_sync_backoff",
      traceId: "trc_billing_worker_backoff"
    });
    const store = new InMemoryBillingSyncJobStore([job]);
    const failedAt = new Date("2026-06-28T10:00:00.000Z");

    await store.claimPending({ now: failedAt, queue: "billing-sync" });
    const failed = await store.markFailed(job.id, "provider unavailable", failedAt, {
      maxAttempts: 3,
      retryBackoffMs: 60_000
    });
    const earlyRetry = await store.claimPending({
      now: new Date("2026-06-28T10:00:30.000Z"),
      queue: "billing-sync"
    });
    const readyRetry = await store.claimPending({
      now: new Date("2026-06-28T10:01:00.000Z"),
      queue: "billing-sync"
    });

    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 1);
    assert.equal(failed.nextAttemptAt, "2026-06-28T10:01:00.000Z");
    assert.equal(failed.deadLetteredAt, null);
    assert.deepEqual(earlyRetry, []);
    assert.deepEqual(readyRetry.map((item) => item.id), [job.id]);
  });

  it("dead-letters billing sync jobs after the configured attempt budget is exhausted", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const store = new InMemoryBillingSyncJobStore([
      createBillingSyncJob({
        id: "billing_sync_dead_letter",
        payload: {
          eventType: "customer.subscription.updated",
          provider: "stripe",
          tenantId: "tenant-lumen"
        },
        traceId: "trc_billing_worker_dead_letter"
      })
    ]);

    const result = await worker.runBillingSyncWorker({
      handlers: {},
      maxAttempts: 1,
      once: true,
      queue: "billing-sync",
      retryBackoffMs: 60_000,
      store
    });

    assert.deepEqual(result, {
      failed: 1,
      iterations: 1,
      published: 0,
      scanned: 1,
      stopped: false
    });

    const deadLettered = (await store.list({ statuses: ["dead_lettered"] }))[0];
    assert.equal(deadLettered?.attempts, 1);
    assert.equal(deadLettered?.deadLetteredAt?.startsWith("20"), true);
    assert.equal(deadLettered?.nextAttemptAt, null);
    assert.match(deadLettered?.lastError ?? "", /No billing sync handler registered for stripe\.customer\.subscription\.updated/);
    assert.deepEqual(await store.claimPending({ queue: "billing-sync" }), []);
  });

  it("replays dead-lettered billing sync jobs through the same queue helper", async () => {
    const worker = await import("../apps/outbox-worker/src/index.ts");
    const job = createBillingSyncJob({
      id: "billing_sync_replay",
      payload: {
        eventType: "invoice.paid",
        provider: "stripe",
        tenantId: "tenant-lumen"
      },
      traceId: "trc_billing_worker_replay"
    });
    const store = new InMemoryBillingSyncJobStore([job]);
    await store.claimPending({ now: new Date("2026-06-28T11:00:00.000Z"), queue: "billing-sync" });
    await store.markFailed(job.id, "provider outage", new Date("2026-06-28T11:00:00.000Z"), {
      maxAttempts: 1,
      retryBackoffMs: 60_000
    });

    const replayed = await worker.replayDeadLetteredQueueItem({
      id: job.id,
      now: new Date("2026-06-28T11:30:00.000Z"),
      queue: "billing-sync",
      reason: "provider recovered",
      store
    });
    const claimed = await store.claimPending({
      now: new Date("2026-06-28T11:30:00.000Z"),
      queue: "billing-sync"
    });

    assert.equal(replayed.status, "failed");
    assert.equal(replayed.attempts, 2);
    assert.equal(replayed.deadLetteredAt, null);
    assert.equal(replayed.nextAttemptAt, null);
    assert.equal(replayed.lastError, "dead_letter_replay:provider recovered");
    assert.equal(replayed.deadLetterReplayAuditEvents?.[0]?.action, "worker.dead_letter.replay");
    assert.equal(replayed.deadLetterReplayAuditEvents?.[0]?.immutable, true);
    assert.deepEqual(claimed.map((item) => item.id), [job.id]);
  });
});

function createBillingSyncJob(overrides: Partial<StoredBillingSyncJob> = {}): StoredBillingSyncJob {
  return {
    actor: "billing-provider",
    actorName: "stripe",
    attempts: 0,
    auditEventId: "provider_sync_evt_test",
    createdAt: "2026-06-28T09:45:00.000Z",
    fromPlanId: "starter",
    id: "billing_sync_test",
    deadLetteredAt: null,
    lastError: null,
    lockedAt: null,
    nextAttemptAt: null,
    payload: {
      eventType: "invoice.paid",
      provider: "stripe",
      tenantId: "tenant-lumen"
    },
    publishedAt: null,
    queue: "billing-sync",
    reason: "invoice.paid",
    status: "pending",
    tenantId: "tenant-lumen",
    toPlanId: "business",
    traceId: "trc_billing_worker",
    ...overrides
  };
}
