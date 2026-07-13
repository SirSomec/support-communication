import { createPrismaBillingSyncJobStore, createPrismaClient, createPrismaConversationOutboundDescriptorStore, createPrismaOutboxStore, type ConversationOutboundDescriptorStore, type PrismaBillingSyncJobClient, type PrismaConversationOutboundDescriptorClient, type PrismaOutboxClient } from "@support-communication/database";
import { type OutboxEventStore } from "@support-communication/events";
import { createBullMqWorkerBridge, createRuntimeBillingSyncHandlers, createRuntimeOutboxHandlers, loadBullMqWorkerConfig, loadOutboxWorkerConfig, runBillingSyncWorker, runOutboxWorker, runRuntimeFileScanScannerWorker } from "./index.js";
import { createIntegrationTelegramTokenResolver, createPrismaIntegrationTelegramTokenResolver, type PrismaTelegramConnectionTokenClient } from "./integration-telegram-store.js";
import { createJsonConversationOutboundDescriptorStore, createJsonConversationOutboxStore } from "./json-conversation-delivery-store.js";
import { resolveProviderConnectionCredential, type PrismaProviderConnectionCredentialClient } from "./provider-connection-store.js";
import { createPrismaProviderAttachmentTransferStore, type PrismaProviderAttachmentTransferClient } from "./provider-attachment-transfer-store.js";

interface DisconnectableWorkerPrismaClient extends PrismaOutboxClient, PrismaBillingSyncJobClient, PrismaConversationOutboundDescriptorClient, PrismaTelegramConnectionTokenClient, PrismaProviderConnectionCredentialClient, PrismaProviderAttachmentTransferClient {
  $disconnect?: () => Promise<void>;
}

const conversationRepository = String(process.env.CONVERSATION_REPOSITORY ?? "json").trim().toLowerCase();
const useJsonConversationDelivery = conversationRepository !== "prisma";
const client = createPrismaClient({
  datasourceUrl: process.env.DATABASE_URL
}) as DisconnectableWorkerPrismaClient;
const outboxStore: OutboxEventStore = useJsonConversationDelivery
  ? createJsonConversationOutboxStore(process.env.CONVERSATION_STORE_FILE)
  : createPrismaOutboxStore(client);
const outboundDescriptorStore: ConversationOutboundDescriptorStore = useJsonConversationDelivery
  ? createJsonConversationOutboundDescriptorStore(process.env.CONVERSATION_STORE_FILE)
  : createPrismaConversationOutboundDescriptorStore(client);
const providerAttachmentTransferStore = createPrismaProviderAttachmentTransferStore(client);
const telegramBotTokenResolver = process.env.INTEGRATION_REPOSITORY === "prisma"
  ? createPrismaIntegrationTelegramTokenResolver(client, process.env.OUTBOX_TELEGRAM_BOT_TOKEN)
  : createIntegrationTelegramTokenResolver(process.env.INTEGRATION_STORE_FILE, process.env.OUTBOX_TELEGRAM_BOT_TOKEN);
const providerCredentialResolver = {
  async resolve(input: { channelConnectionId: string; provider: "max" | "vk"; tenantId: string }) {
    const credential = await resolveProviderConnectionCredential(client, input.tenantId, input.channelConnectionId, input.provider);
    return { accessToken: credential.token, apiVersion: credential.apiVersion, externalAccountId: credential.externalAccountId };
  }
};

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
          queue: config.queue ?? "file-scan",
          outboundDescriptorStore,
          store: outboxStore
        })
        : runBillingSync
        ? runBillingSyncWorker({
          ...config,
          once: true,
          queue: config.queue ?? "billing-sync",
          handlers: createRuntimeBillingSyncHandlers(),
          store: createPrismaBillingSyncJobStore(client)
        })
        : runOutboxWorker({
          ...config,
          once: true,
          handlers: createRuntimeOutboxHandlers({ outboundDescriptorStore, providerAttachmentTransferStore, providerCredentialResolver, telegramBotTokenResolver }),
          store: outboxStore
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
      queue: config.queue ?? "file-scan",
      outboundDescriptorStore,
      store: outboxStore
    })
    : runBillingSync
    ? await runBillingSyncWorker({
      ...config,
      queue: config.queue ?? "billing-sync",
      handlers: createRuntimeBillingSyncHandlers(),
      store: createPrismaBillingSyncJobStore(client)
    })
    : await runOutboxWorker({
      ...config,
      handlers: createRuntimeOutboxHandlers({ outboundDescriptorStore, providerAttachmentTransferStore, providerCredentialResolver, telegramBotTokenResolver }),
      store: outboxStore
    });

  console.log(JSON.stringify({
    service: runFileScanScanner ? "file-scan-scanner-worker" : runBillingSync ? "billing-sync-worker" : "outbox-worker",
    conversationDeliveryStore: useJsonConversationDelivery ? "json" : "prisma",
    result
  }));
  }
} finally {
  if (!process.argv.includes("--bullmq") && process.env.OUTBOX_BULLMQ_WORKER !== "true") {
    await client.$disconnect?.();
  }
}
