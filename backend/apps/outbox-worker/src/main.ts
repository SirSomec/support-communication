import { createPrismaBillingSyncJobStore, createPrismaClient, createPrismaConversationOutboundDescriptorStore, createPrismaOutboxStore, type PrismaBillingSyncJobClient, type PrismaConversationOutboundDescriptorClient, type PrismaOutboxClient } from "@support-communication/database";
import { createBullMqWorkerBridge, createDefaultBillingSyncHandlers, createRuntimeOutboxHandlers, loadBullMqWorkerConfig, loadOutboxWorkerConfig, runBillingSyncWorker, runOutboxWorker, runRuntimeFileScanScannerWorker } from "./index.js";

interface DisconnectableWorkerPrismaClient extends PrismaOutboxClient, PrismaBillingSyncJobClient, PrismaConversationOutboundDescriptorClient {
  $disconnect?: () => Promise<void>;
}

const client = createPrismaClient({
  datasourceUrl: process.env.DATABASE_URL
}) as DisconnectableWorkerPrismaClient;
const outboundDescriptorStore = createPrismaConversationOutboundDescriptorStore(client);

try {
  const config = loadOutboxWorkerConfig();
  const runBillingSync = process.argv.includes("--billing-sync") || process.env.BILLING_SYNC_WORKER === "true";
  const runFileScanScanner = process.argv.includes("--file-scan-scanner") || process.env.OUTBOX_FILE_SCAN_SCANNER_WORKER === "true";
  const runBullMq = process.argv.includes("--bullmq") || process.env.OUTBOX_BULLMQ_WORKER === "true";
  if (runBullMq) {
    const bullMqConfig = loadBullMqWorkerConfig(process.env, runFileScanScanner ? "file-scan-scanner-poll" : runBillingSync ? "billing-sync-poll" : "outbox-domain-poll");
    const service = runFileScanScanner ? "file-scan-scanner-worker" : runBillingSync ? "billing-sync-worker" : "outbox-worker";
    const bridge = createBullMqWorkerBridge({
      ...bullMqConfig,
      runOnce: () => runFileScanScanner
        ? runRuntimeFileScanScannerWorker({
          ...config,
          once: true,
          queue: "file-scan",
          outboundDescriptorStore,
          store: createPrismaOutboxStore(client)
        })
        : runBillingSync
        ? runBillingSyncWorker({
          ...config,
          once: true,
          queue: config.queue ?? "billing-sync",
          handlers: createDefaultBillingSyncHandlers(),
          store: createPrismaBillingSyncJobStore(client)
        })
        : runOutboxWorker({
          ...config,
          once: true,
          handlers: createRuntimeOutboxHandlers({ outboundDescriptorStore }),
          store: createPrismaOutboxStore(client)
        }),
      service
    });

    console.log(JSON.stringify({
      service,
      mode: "bullmq",
      queue: bullMqConfig.queueName
    }));

    const shutdown = async () => {
      await bridge.close();
      await client.$disconnect?.();
      process.exit(0);
    };
    process.once("SIGINT", () => {
      void shutdown();
    });
    process.once("SIGTERM", () => {
      void shutdown();
    });
  } else {
    const result = runFileScanScanner
    ? await runRuntimeFileScanScannerWorker({
      ...config,
      queue: "file-scan",
      outboundDescriptorStore,
      store: createPrismaOutboxStore(client)
    })
    : runBillingSync
    ? await runBillingSyncWorker({
      ...config,
      queue: config.queue ?? "billing-sync",
      handlers: createDefaultBillingSyncHandlers(),
      store: createPrismaBillingSyncJobStore(client)
    })
    : await runOutboxWorker({
      ...config,
      handlers: createRuntimeOutboxHandlers({ outboundDescriptorStore }),
      store: createPrismaOutboxStore(client)
    });

  console.log(JSON.stringify({
    service: runFileScanScanner ? "file-scan-scanner-worker" : runBillingSync ? "billing-sync-worker" : "outbox-worker",
    result
  }));
  }
} finally {
  if (!process.argv.includes("--bullmq") && process.env.OUTBOX_BULLMQ_WORKER !== "true") {
    await client.$disconnect?.();
  }
}
