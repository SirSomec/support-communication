import { loadBackendConfig } from "../packages/config/dist/index.js";
import { redactSensitiveValue } from "../packages/redaction/dist/index.js";
import {
  assertLogRecordsDoNotLeakCanonicalSecrets,
  canonicalSecretBearingFixtures
} from "../packages/testing/dist/index.js";
import { createOutboxEvent, InMemoryOutboxStore } from "../packages/events/dist/index.js";
import { redactExportedDescriptor } from "../packages/envelope/dist/index.js";
import { createRuntimeOutboxHandlers, runOutboxWorker } from "../apps/outbox-worker/dist/index.js";
import { OperationsReadinessService } from "../apps/api-gateway/dist/operations/operations-readiness.service.js";
import { OperationsRepository } from "../apps/api-gateway/dist/operations/operations.repository.js";
import { bootstrapOperationsState } from "../apps/api-gateway/dist/operations/seed.js";
import { ReportService } from "../apps/api-gateway/dist/reports/report.service.js";
import { ReportRepository } from "../apps/api-gateway/dist/reports/report.repository.js";
import { exportJobFixtures } from "../apps/api-gateway/dist/reports/seed-catalog.js";

const modes = new Set(process.argv.slice(2));

if (modes.size === 0) {
  modes.add("--bootstrap");
  modes.add("--provider");
  modes.add("--scanner");
  modes.add("--export");
}

for (const mode of modes) {
  if (mode === "--bootstrap") {
    runBootstrapSmoke();
    continue;
  }

  if (mode === "--provider") {
    await runProviderSmoke();
    continue;
  }

  if (mode === "--scanner") {
    await runScannerSmoke();
    continue;
  }

  if (mode === "--export") {
    await runExportSmoke();
    continue;
  }

  process.stderr.write(`Unknown redaction runtime smoke mode: ${mode}\n`);
  process.exit(1);
}

function runBootstrapSmoke() {
  const source = {
    API_VERSION: "v1",
    DATABASE_URL: "not-a-database-url",
    DEMO_SERVICE_ADMIN_KEY: "dev-service-admin-key",
    NODE_ENV: "production",
    OUTBOX_TELEGRAM_BOT_TOKEN: canonicalSecretBearingFixtures.providerToken.raw,
    REDIS_URL: "not-a-redis-url",
    S3_ACCESS_KEY: "minio",
    S3_BUCKET: "support-communication-local",
    S3_ENDPOINT: "not-a-s3-url",
    S3_REGION: "us-east-1",
    S3_SECRET_KEY: canonicalSecretBearingFixtures.publicApiKey.raw,
    SERVICE_NAME: "api-gateway"
  };

  let configError;
  try {
    loadBackendConfig(source);
  } catch (error) {
    configError = error;
  }

  const errorMessage = configError instanceof Error ? configError.message : String(configError ?? "");
  if (!errorMessage.startsWith("Invalid backend configuration:")) {
    process.stderr.write("bootstrap smoke expected Invalid backend configuration failure.\n");
    process.exit(1);
  }

  const record = JSON.stringify(redactSensitiveValue({
    context: source,
    error: errorMessage,
    smoke: "bootstrap"
  }));
  assertNoCanonicalLeaks([record]);
  process.stdout.write(`bootstrap redaction smoke passed ${record}\n`);
}

async function runProviderSmoke() {
  const logs = [];
  const store = new InMemoryOutboxStore();
  const event = await store.append(createOutboxEvent({
    aggregateId: "provider-redaction-smoke",
    aggregateType: "messageDelivery",
    payload: { descriptorId: "provider-redaction-smoke-descriptor" },
    queue: "message-delivery",
    traceId: "trc_provider_redaction_smoke",
    type: "message.delivery.requested"
  }));
  const handlers = createRuntimeOutboxHandlers({
    env: {
      OUTBOX_TELEGRAM_API_BASE_URL: "https://telegram.provider.example.test",
      OUTBOX_TELEGRAM_BOT_TOKEN: canonicalSecretBearingFixtures.providerToken.raw,
      OUTBOX_TELEGRAM_ENABLED: "true"
    },
    fetcher: async () => {
      throw new Error(canonicalSecretBearingFixtures.providerToken.carriers[2].value);
    },
    outboundDescriptorStore: {
      findOutboundDescriptorById: async (descriptorId) => descriptorId === "provider-redaction-smoke-descriptor"
        ? {
          channel: "Telegram",
          conversationId: "provider-redaction-smoke-chat",
          id: descriptorId,
          idempotencyKey: "provider-redaction-smoke-key",
          kind: "message_delivery",
          messageId: "msg_provider_redaction_smoke",
          payload: { text: "Provider redaction smoke" }
        }
        : null
    },
    writeLog: (level, message, context) => {
      logs.push(JSON.stringify(redactSensitiveValue({
        context,
        level,
        message
      })));
    }
  });

  const result = await runOutboxWorker({
    handlers,
    limit: 1,
    once: true,
    queue: "message-delivery",
    store
  });
  if (result.failed !== 1 || result.scanned !== 1) {
    process.stderr.write(`provider smoke expected one failed dispatch, got ${JSON.stringify(result)}\n`);
    process.exit(1);
  }

  const failed = await store.list({ statuses: ["failed"] });
  const records = [
    ...logs,
    ...failed.map((failedEvent) => failedEvent.lastError ?? "")
  ];
  assertNoCanonicalLeaks(records);
  if (failed[0]?.id !== event.id) {
    process.stderr.write("provider smoke failed to persist expected outbox failure.\n");
    process.exit(1);
  }

  process.stdout.write(`provider redaction smoke passed ${JSON.stringify(redactSensitiveValue({
    lastError: failed[0].lastError,
    logs,
    runtimeContext: {
      providerToken: canonicalSecretBearingFixtures.providerToken.raw
    },
    result
  }))}\n`);
}

async function runScannerSmoke() {
  const logs = [];
  const store = new InMemoryOutboxStore();
  const event = await store.append(createOutboxEvent({
    aggregateId: "scanner-redaction-smoke",
    aggregateType: "file",
    payload: { descriptorId: "scanner-redaction-smoke-descriptor" },
    queue: "file-scan",
    traceId: "trc_scanner_redaction_smoke",
    type: "attachment.upload.requested"
  }));
  const handlers = createRuntimeOutboxHandlers({
    env: {
      OUTBOX_FILE_SCAN_URL: "https://scanner.provider.example.test/scan"
    },
    fetcher: async () => {
      throw new Error(canonicalSecretBearingFixtures.objectKey.carriers[2].value);
    },
    outboundDescriptorStore: {
      findOutboundDescriptorById: async (descriptorId) => descriptorId === "scanner-redaction-smoke-descriptor"
        ? {
          channel: "SCANNER",
          conversationId: null,
          id: descriptorId,
          idempotencyKey: "scanner-redaction-smoke-key",
          kind: "attachment_upload",
          messageId: null,
          payload: {
            fileId: "file_scanner_redaction_smoke",
            fileName: "scanner-redaction.pdf",
            objectKey: canonicalSecretBearingFixtures.objectKey.raw,
            sizeBytes: 1024
          }
        }
        : null
    },
    writeLog: (level, message, context) => {
      logs.push(JSON.stringify(redactSensitiveValue({
        context,
        level,
        message
      })));
    }
  });

  const result = await runOutboxWorker({
    handlers,
    limit: 1,
    once: true,
    queue: "file-scan",
    store
  });
  if (result.failed !== 1 || result.scanned !== 1) {
    process.stderr.write(`scanner smoke expected one failed dispatch, got ${JSON.stringify(result)}\n`);
    process.exit(1);
  }

  const failed = await store.list({ statuses: ["failed"] });
  const records = [
    ...logs,
    ...failed.map((failedEvent) => failedEvent.lastError ?? "")
  ];
  assertNoCanonicalLeaks(records);
  if (failed[0]?.id !== event.id) {
    process.stderr.write("scanner smoke failed to persist expected outbox failure.\n");
    process.exit(1);
  }

  process.stdout.write(`scanner redaction smoke passed ${JSON.stringify(redactSensitiveValue({
    lastError: failed[0].lastError,
    logs,
    runtimeContext: {
      objectKey: canonicalSecretBearingFixtures.objectKey.raw
    },
    result
  }))}\n`);
}

async function runExportSmoke() {
  const reportRepository = ReportRepository.inMemory();
  reportRepository.saveExportJob({
    ...structuredClone(exportJobFixtures.find((job) => job.id === "export-2418")),
    tenantId: "tenant-volga"
  });
  const reportDescriptor = await new ReportService(reportRepository).getExportFileDescriptor("export-2418", {
    canDownload: true,
    tenantId: "tenant-volga"
  });
  const operationsRepository = OperationsRepository.inMemory(bootstrapOperationsState());
  const restoreDescriptor = await new OperationsReadinessService(operationsRepository).queueRestoreCheck({
    confirmed: true,
    drillId: "backup-postgres-nightly",
    idempotencyKey: "restore-redaction-runtime-smoke",
    reason: "Validate restore artifact descriptor runtime smoke"
  });
  const auditDescriptor = redactExportedDescriptor({
    authorization: canonicalSecretBearingFixtures.publicApiKey.carriers[3].value,
    descriptorText: canonicalSecretBearingFixtures.publicApiKey.carriers[3].value,
    objectKey: canonicalSecretBearingFixtures.objectKey.raw,
    providerToken: canonicalSecretBearingFixtures.providerToken.carriers[3].value,
    signature: canonicalSecretBearingFixtures.webhookSignature.carriers[3].value,
    surface: "audit_export"
  });
  const record = JSON.stringify({
    auditDescriptor,
    reportDescriptor,
    restoreDescriptor,
    smoke: "export"
  });
  assertNoCanonicalLeaks([record]);
  if (record.includes("restore-checks/backup-postgres-nightly/artifact.json")) {
    process.stderr.write("export smoke leaked restore artifact object key.\n");
    process.exit(1);
  }
  process.stdout.write(`export redaction smoke passed ${record}\n`);
}

function assertNoCanonicalLeaks(records) {
  try {
    assertLogRecordsDoNotLeakCanonicalSecrets(records);
  } catch {
    process.stderr.write("redaction runtime smoke detected a canonical secret leak.\n");
    process.exit(1);
  }
}
