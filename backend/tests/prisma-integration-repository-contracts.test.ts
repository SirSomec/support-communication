import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { configureIntegrationRepository } from "../apps/api-gateway/src/integrations/bootstrap.ts";
import {
  IntegrationRepository,
  type PrismaIntegrationClient
} from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { IntegrationService } from "../apps/api-gateway/src/integrations/integration.service.ts";
import { bootstrapIntegrationState } from "../apps/api-gateway/src/integrations/seed.ts";
import {
  hashPublicApiKeySecret,
  resolvePublicApiRequest
} from "../apps/api-gateway/src/integrations/public-api-auth.ts";

describe("Prisma-backed integration repository contracts", () => {
  it("fails closed when Prisma public API key delegates are incomplete", () => {
    const { client } = createFakePrismaIntegrationClient();
    delete (client as { publicApiKey?: unknown }).publicApiKey;

    assert.throws(
      () => IntegrationRepository.prisma({ client }),
      /prisma_integration_public_api_key_delegate_required/
    );
  });

  it("fails closed when Prisma public API key reveal state delegates are incomplete", () => {
    const { client } = createFakePrismaIntegrationClient();
    delete (client as { publicApiKeyRevealState?: unknown }).publicApiKeyRevealState;

    assert.throws(
      () => IntegrationRepository.prisma({ client }),
      /prisma_integration_public_api_key_reveal_state_delegate_required/
    );
  });

  it("fails closed when Prisma public API key rotation audit delegates are incomplete", () => {
    const { client } = createFakePrismaIntegrationClient();
    delete (client as { publicApiKeyRotationAuditEvent?: unknown }).publicApiKeyRotationAuditEvent;

    assert.throws(
      () => IntegrationRepository.prisma({ client }),
      /prisma_integration_public_api_key_rotation_audit_delegate_required/
    );
  });

  it("fails closed when Prisma integration runtime delegates are incomplete", () => {
    const { client } = createFakePrismaIntegrationClient();
    delete (client as { webhookDeliveryJournalEntry?: unknown }).webhookDeliveryJournalEntry;

    assert.throws(
      () => IntegrationRepository.prisma({ client }),
      /prisma_integration_webhook_delivery_journal_delegate_required/
    );
  });

  it("bootstraps the default integration repository from a Prisma client factory", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "integration-prisma-bootstrap-"));
    const filePath = join(workspace, "integration-store.json");
    const { client } = createFakePrismaIntegrationClient();

    try {
      const repository = configureIntegrationRepository({
        DATABASE_URL: "postgresql://support:support@localhost:5432/support_communication",
        INTEGRATION_REPOSITORY: "prisma",
        INTEGRATION_STORE_FILE: filePath,
        NODE_ENV: "staging",
        PORT: "4100",
        SERVICE_NAME: "api-gateway"
      }, {
        prismaClientFactory: () => client
      });

      await repository.saveApiKeyRotationJobAsync({
        auditId: "evt_integration_bootstrap",
        environment: "stage",
        keyId: "stage-key",
        rawKeyShownOnce: false,
        requires2fa: true,
        rotationId: "rot_integration_bootstrap",
        status: "rotation_queued"
      });

      const bootstrappedState = await IntegrationRepository.default().readStateAsync();

      assert.equal(repository, IntegrationRepository.default());
      assert.equal(existsSync(filePath), false);
      assert.equal(bootstrappedState.apiKeyRotationJobs.some((job) => job.rotationId === "rot_integration_bootstrap"), true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      IntegrationRepository.clearDefault();
    }
  });

  it("persists mutable integration runtime state through Prisma delegates without JSON fallback", async () => {
    const { client } = createFakePrismaIntegrationClient();
    const first = IntegrationRepository.prisma({ client });

    assert.throws(
      () => first.readState(),
      /prisma_integration_async_required/
    );

    await first.saveApiKeyRotationJobAsync({
      auditId: "evt_rotation_runtime",
      environment: "production",
      keyId: "runtime-key",
      rawKeyShownOnce: false,
      requires2fa: true,
      rotationId: "rot_runtime",
      status: "rotation_queued"
    });
    await first.savePublicDemoRequestAsync({
      company: "Runtime Co",
      consent: true,
      createdAt: "2026-07-03T08:00:00.000Z",
      email: "lead@example.test",
      id: "demo_runtime",
      idempotencyKey: "demo-runtime-key",
      ipHash: "ip_hash",
      message: "Need an integration demo",
      name: "Lead User",
      planInterest: "enterprise",
      requestFingerprint: "demo-runtime-fingerprint",
      source: "landing",
      status: "queued",
      updatedAt: "2026-07-03T08:00:00.000Z",
      userAgentHash: "ua_hash"
    });
    await first.savePublicDemoRequestAuditEventAsync({
      action: "public_demo_request.created",
      at: "2026-07-03T08:00:01.000Z",
      id: "audit_demo_runtime",
      immutable: true,
      leadId: "demo_runtime",
      requestFingerprint: "demo-runtime-fingerprint",
      result: "ok",
      source: "landing"
    });
    await first.savePublicDemoRequestNotificationDescriptorAsync({
      createdAt: "2026-07-03T08:00:02.000Z",
      id: "lead_notification_runtime",
      leadId: "demo_runtime",
      payload: {
        company: "Runtime Co",
        email: "lead@example.test",
        messagePreview: "Need an integration demo",
        name: "Lead User",
        planInterest: "enterprise",
        source: "landing"
      },
      queue: "lead-notification",
      status: "queued",
      type: "public.demo_request.notification.requested"
    });
    await first.saveWebhookReplayAsync({
      auditId: "evt_webhook_runtime",
      deliveryId: "dlv-runtime",
      idempotencyKey: "webhook-runtime-key",
      originalTraceId: "trc_original",
      replayId: "webhook_replay_runtime",
      signatureVerified: true,
      status: "replay_queued"
    });
    await first.saveWebhookReplayAuditEventAsync({
      action: "webhook.replay.queued",
      at: "2026-07-03T08:01:00.000Z",
      attempts: 2,
      auditId: "evt_webhook_runtime",
      deliveryId: "dlv-runtime",
      deliveryStatus: "failed",
      id: "evt_webhook_runtime_audit",
      idempotencyKey: "webhook-runtime-key",
      immutable: true,
      originalTraceId: "trc_original",
      replayId: "webhook_replay_runtime",
      transition: "dead_letter"
    });
    await first.saveWebhookDeliveryJournalEntryAsync({
      attempts: 0,
      createdAt: "2026-07-03T08:02:00.000Z",
      deliveryId: "wdj-runtime",
      endpointId: "endpoint-runtime",
      eventType: "message.created",
      idempotencyKey: "wdj-runtime-key",
      payloadRef: "s3://runtime/webhook.json",
      queue: "webhook-delivery",
      status: "queued",
      targetUrl: "https://example.test/webhooks",
      tenantId: "tenant-runtime",
      traceId: "trc_wdj_runtime"
    });
    const claimed = await first.claimWebhookDeliveryJournalEntriesAsync({
      limit: 1,
      now: "2026-07-03T08:03:00.000Z",
      queue: "webhook-delivery"
    });
    const retry = await first.recordWebhookDeliveryRetryStateAsync({
      attempts: 1,
      deliveryId: "wdj-runtime",
      lastAttemptAt: "2026-07-03T08:04:00.000Z",
      lastError: {
        code: "provider_timeout",
        message: "Authorization: Bearer secret-token failed",
        statusCode: 504
      },
      nextAttemptAt: "2026-07-03T08:05:00.000Z"
    });
    await first.saveSecuritySessionAsync({
      device: "Desktop",
      id: "sess-runtime",
      ip: "10.0.0.1",
      lastSeen: "2026-07-03T08:06:00.000Z",
      role: "Admin",
      status: "revoked",
      user: "Runtime User"
    });
    await first.saveChannelConnectionAsync({
      chatLimit: 12,
      createdAt: "2026-07-03T08:07:00.000Z",
      credentialsMasked: true,
      environment: "production",
      health: 98,
      id: "conn-runtime",
      lastSyncAt: "2026-07-03T08:07:00.000Z",
      name: "Runtime Telegram",
      rawExternalId: "telegram:runtime",
      routingQueueId: "queue-runtime",
      status: "active",
      tenantId: "tenant-runtime",
      traffic: "0 events",
      type: "telegram",
      updatedAt: "2026-07-03T08:07:00.000Z",
      webhookUrl: "https://example.test/telegram"
    });
    await first.saveChannelConnectionEventAsync({
      action: "channel.connection.created",
      at: "2026-07-03T08:08:00.000Z",
      connectionId: "conn-runtime",
      id: "evt_channel_runtime",
      message: "Runtime Telegram created",
      severity: "info",
      tenantId: "tenant-runtime"
    });
    await first.saveChannelConnectionAuditEventAsync({
      action: "channel.connection.create",
      at: "2026-07-03T08:08:01.000Z",
      connectionId: "conn-runtime",
      id: "audit_channel_runtime",
      immutable: true,
      reason: "Created",
      result: "ok",
      tenantId: "tenant-runtime",
      type: "telegram"
    });
    await first.saveTelegramConnectionAsync({
      botId: "900001",
      botToken: "123:runtime-token",
      botUsername: "runtime_bot",
      createdAt: "2026-07-03T08:09:00.000Z",
      status: "active",
      tenantId: "tenant-runtime",
      tokenPreview: "123:****",
      updatedAt: "2026-07-03T08:09:00.000Z",
      webhookSecret: "tg_wh_runtime"
    });

    const second = IntegrationRepository.prisma({ client });
    const state = await second.readStateAsync();
    const foundDemo = await second.findPublicDemoRequestByIdempotencyKeyAsync("demo-runtime-key");
    const foundReplay = await second.findWebhookReplayAsync("webhook-runtime-key");
    const channelConnections = await second.listChannelConnectionsAsync({ tenantId: "tenant-runtime", type: "telegram" });
    const telegram = await second.findTelegramConnectionByWebhookSecretAsync("tg_wh_runtime");

    assert.deepEqual(claimed.map((entry) => entry.deliveryId), ["wdj-runtime"]);
    assert.equal(retry?.status, "retry_scheduled");
    assert.equal(retry?.lastError?.message.includes("secret-token"), false);
    assert.equal(foundDemo?.id, "demo_runtime");
    assert.equal(foundReplay?.replayId, "webhook_replay_runtime");
    assert.equal(channelConnections[0]?.id, "conn-runtime");
    assert.equal(telegram?.botUsername, "runtime_bot");
    assert.equal(state.apiKeyRotationJobs.some((job) => job.rotationId === "rot_runtime"), true);
    assert.equal(state.publicDemoRequests.some((request) => request.id === "demo_runtime"), true);
    assert.equal(state.webhookReplayAuditEvents.some((event) => event.id === "evt_webhook_runtime_audit"), true);
    assert.equal(state.webhookDeliveryJournal.some((entry) => entry.deliveryId === "wdj-runtime" && entry.status === "retry_scheduled"), true);
    assert.equal(state.securitySessions.some((session) => session.id === "sess-runtime" && session.status === "revoked"), true);
    assert.equal(state.channelConnectionEvents.some((event) => event.id === "evt_channel_runtime"), true);
    assert.equal(state.channelConnectionAuditEvents.some((event) => event.id === "audit_channel_runtime"), true);
  });

  it("preserves Prisma public demo request notification terminal delivery status", async () => {
    const { client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const queuedDescriptor = {
      createdAt: "2026-07-03T08:30:00.000Z",
      id: "lead_notification_prisma_terminal",
      leadId: "demo_prisma_terminal",
      payload: {
        company: "Runtime Co",
        email: "lead@example.test",
        messagePreview: "Need an integration demo",
        name: "Lead User",
        planInterest: "enterprise",
        source: "landing"
      },
      queue: "lead-notification" as const,
      status: "queued" as const,
      type: "public.demo_request.notification.requested" as const
    };

    await repository.savePublicDemoRequestNotificationDescriptorAsync(queuedDescriptor);
    const delivered = await repository.savePublicDemoRequestNotificationDescriptorAsync({
      ...queuedDescriptor,
      payload: {
        ...queuedDescriptor.payload,
        delivery: {
          attempts: 1,
          deliveredAt: "2026-07-03T08:31:00.000Z",
          providerMessageId: "local-lead-notification-terminal"
        }
      },
      status: "delivered"
    });

    const queued = await repository.listPublicDemoRequestNotificationDescriptorsAsync({
      queue: "lead-notification",
      status: "queued"
    });
    const terminal = await repository.listPublicDemoRequestNotificationDescriptorsAsync({
      queue: "lead-notification",
      status: "delivered"
    });
    const state = await repository.readStateAsync();
    const persisted = state.publicDemoRequestNotificationDescriptors.find((item) => item.id === queuedDescriptor.id);

    assert.equal(delivered.status, "delivered");
    assert.equal(delivered.payload.delivery?.providerMessageId, "local-lead-notification-terminal");
    assert.deepEqual(queued.map((item) => item.id), []);
    assert.deepEqual(terminal.map((item) => item.id), [queuedDescriptor.id]);
    assert.equal(persisted?.status, "delivered");
    assert.equal(persisted?.payload.delivery?.attempts, 1);
  });

  it("summarizes public demo request notification observability through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const baseDescriptor = {
      createdAt: "2026-07-03T08:30:00.000Z",
      id: "lead_notification_prisma_summary",
      leadId: "demo_prisma_summary",
      payload: {
        company: "Runtime Co",
        email: "lead@example.test",
        messagePreview: "Need an integration demo",
        name: "Lead User",
        planInterest: "enterprise",
        source: "landing"
      },
      queue: "lead-notification" as const,
      status: "queued" as const,
      type: "public.demo_request.notification.requested" as const
    };

    await repository.savePublicDemoRequestNotificationDescriptorAsync({
      ...baseDescriptor,
      id: "lead_notification_prisma_summary_queued",
      leadId: "demo_prisma_summary_queued"
    });
    await repository.savePublicDemoRequestNotificationDescriptorAsync({
      ...baseDescriptor,
      id: "lead_notification_prisma_summary_delivered",
      leadId: "demo_prisma_summary_delivered",
      payload: {
        ...baseDescriptor.payload,
        delivery: {
          attempts: 1,
          deliveredAt: "2026-07-03T08:35:00.000Z",
          providerMessageId: "local-lead-notification-summary"
        }
      },
      status: "delivered"
    });
    await repository.savePublicDemoRequestNotificationDescriptorAsync({
      ...baseDescriptor,
      id: "lead_notification_prisma_summary_failed",
      leadId: "demo_prisma_summary_failed",
      payload: {
        ...baseDescriptor.payload,
        delivery: {
          attempts: 2,
          failedAt: "2026-07-03T08:34:00.000Z",
          lastError: {
            code: "public_demo_request_notification_delivery_failed" as const,
            message: "smtp token secret-summary-token"
          }
        }
      },
      status: "failed"
    });

    const summary = await repository.summarizePublicDemoRequestNotificationDescriptorsAsync({
      queue: "lead-notification"
    });

    assert.equal(summary.queue, "lead-notification");
    assert.equal(summary.queueDepth, 1);
    assert.equal(summary.deadLetterCount, 1);
    assert.equal(summary.latestDescriptor?.id, "lead_notification_prisma_summary_failed");
    assert.equal(summary.latestDescriptor?.payload.delivery?.failedAt, "2026-07-03T08:34:00.000Z");
    assert.deepEqual(
      calls.publicDemoRequestNotificationDescriptorCounts.map((input) => input.where?.status).sort(),
      ["failed", "queued"]
    );
    assert.deepEqual(
      calls.publicDemoRequestNotificationDescriptorFindMany.map((input) => input.where?.status).sort(),
      ["delivered", "failed", "queued"]
    );
    assert.equal(calls.publicDemoRequestNotificationDescriptorFindMany.every((input) => input.take === 25), true);
  });

  it("persists public API key hashes through Prisma delegates without raw secret material", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_live_prisma_hash_secret_7711";

    const saved = await repository.savePublicApiKey({
      createdAt: "2026-06-30T11:00:00.000Z",
      environment: "production",
      keyId: "pak_prisma_hash",
      name: "Prisma hash key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });
    const auth = await resolvePublicApiRequest({
      authorization: `Bearer ${rawSecret}`,
      environment: "production",
      lookup: repository,
      requiredScope: "clients:identify"
    });

    assert.equal(saved.secretHash, hashPublicApiKeySecret(rawSecret));
    assert.equal(saved.keyPreview, "sk_live_****_7711");
    assert.equal(auth.allowed, true);
    assert.equal(auth.context.keyId, "pak_prisma_hash");
    assert.equal(JSON.stringify(calls.publicApiKeyUpserts).includes(rawSecret), false);
    assert.deepEqual(calls.publicApiKeyUpserts[0], {
      create: {
        createdAt: new Date("2026-06-30T11:00:00.000Z"),
        environment: "production",
        keyId: "pak_prisma_hash",
        keyPreview: "sk_live_****_7711",
        name: "Prisma hash key",
        owner: "Security",
        scopes: ["clients:identify"],
        secretHash: hashPublicApiKeySecret(rawSecret),
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T11:00:00.000Z")
      },
      update: {
        environment: "production",
        keyPreview: "sk_live_****_7711",
        name: "Prisma hash key",
        owner: "Security",
        scopes: ["clients:identify"],
        secretHash: hashPublicApiKeySecret(rawSecret),
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T11:00:00.000Z")
      },
      where: { keyId: "pak_prisma_hash" }
    });
  });

  it("persists and consumes one-time public API key reveal state through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_test_prisma_reveal_secret_4822";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:00:00.000Z",
      environment: "stage",
      keyId: "pak_prisma_reveal",
      name: "Prisma reveal key",
      owner: "Platform",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-kama"
    });

    const firstReveal = await repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T12:01:00.000Z",
      keyId: "pak_prisma_reveal"
    });
    const secondReveal = await repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T12:02:00.000Z",
      keyId: "pak_prisma_reveal"
    });

    assert.deepEqual(firstReveal, {
      consumedAt: "2026-06-30T12:01:00.000Z",
      keyId: "pak_prisma_reveal",
      keyPreview: "sk_test_****_4822",
      rawSecret,
      status: "revealed"
    });
    assert.deepEqual(secondReveal, {
      consumedAt: "2026-06-30T12:01:00.000Z",
      keyId: "pak_prisma_reveal",
      keyPreview: "sk_test_****_4822",
      status: "consumed"
    });
    assert.equal(JSON.stringify(calls.publicApiKeyRevealStateUpserts).includes(rawSecret), false);
    assert.equal(JSON.stringify(calls.publicApiKeyRevealStateUpdateMany).includes(rawSecret), false);
    assert.deepEqual(calls.publicApiKeyRevealStateUpserts[0], {
      create: {
        consumedAt: null,
        createdAt: new Date("2026-06-30T12:00:00.000Z"),
        keyId: "pak_prisma_reveal",
        keyPreview: "sk_test_****_4822",
        status: "available"
      },
      update: {},
      where: { keyId: "pak_prisma_reveal" }
    });
    assert.deepEqual(calls.publicApiKeyRevealStateUpdateMany[0], {
      data: {
        consumedAt: new Date("2026-06-30T12:01:00.000Z"),
        keyPreview: "sk_test_****_4822",
        status: "consumed"
      },
      where: { keyId: "pak_prisma_reveal", status: "available" }
    });
  });

  it("reveals the Prisma-backed public API key secret only once under concurrent consume calls", async () => {
    const revealFindUniqueBarrier = createCallBarrier(2);
    const { calls, client } = createFakePrismaIntegrationClient({
      afterRevealFindUniqueSnapshot: revealFindUniqueBarrier.wait
    });
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_test_prisma_concurrent_reveal_9015";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:10:00.000Z",
      environment: "stage",
      keyId: "pak_prisma_concurrent_reveal",
      name: "Prisma concurrent reveal key",
      owner: "Platform",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-kama"
    });

    const [first, second] = await Promise.all([
      repository.consumePublicApiKeyReveal({
        consumedAt: "2026-06-30T12:11:00.000Z",
        keyId: "pak_prisma_concurrent_reveal"
      }),
      repository.consumePublicApiKeyReveal({
        consumedAt: "2026-06-30T12:11:01.000Z",
        keyId: "pak_prisma_concurrent_reveal"
      })
    ]);
    const results = [first, second];

    assert.equal(results.filter((result) => result.status === "revealed").length, 1);
    assert.equal(results.filter((result) => result.status === "consumed").length, 1);
    assert.equal(results.filter((result) => result.rawSecret === rawSecret).length, 1);
    assert.equal(JSON.stringify(calls.publicApiKeyRevealStateUpdateMany).includes(rawSecret), false);
    assert.deepEqual(calls.publicApiKeyRevealStateUpdateMany.map((call) => call.where), [
      { keyId: "pak_prisma_concurrent_reveal", status: "available" },
      { keyId: "pak_prisma_concurrent_reveal", status: "available" }
    ]);
  });

  it("does not reopen Prisma one-time reveal state when key creation is replayed", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_test_prisma_replay_reveal_3377";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:15:00.000Z",
      environment: "stage",
      keyId: "pak_prisma_replay_reveal",
      name: "Prisma replay reveal key",
      owner: "Platform",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-kama"
    });

    const firstReveal = await repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T12:16:00.000Z",
      keyId: "pak_prisma_replay_reveal"
    });
    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:17:00.000Z",
      environment: "stage",
      keyId: "pak_prisma_replay_reveal",
      name: "Prisma replay reveal key",
      owner: "Platform",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-kama"
    });
    const replayReveal = await repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T12:18:00.000Z",
      keyId: "pak_prisma_replay_reveal"
    });

    assert.equal(firstReveal.status, "revealed");
    assert.equal(firstReveal.rawSecret, rawSecret);
    assert.deepEqual(replayReveal, {
      consumedAt: "2026-06-30T12:16:00.000Z",
      keyId: "pak_prisma_replay_reveal",
      keyPreview: "sk_test_****_3377",
      status: "consumed"
    });
    assert.equal(JSON.stringify(calls.publicApiKeyRevealStateUpserts).includes(rawSecret), false);
    assert.equal(calls.publicApiKeyRevealStateUpserts.length, 2);
    assert.deepEqual(calls.publicApiKeyRevealStateUpserts[1].update, {});
  });

  it("persists immutable public API key rotation audit rows through Prisma create without raw secret material", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_live_prisma_rotation_secret_6650";
    const auditEvent = {
      action: "public_api_key.rotation_queued" as const,
      at: "2026-06-30T12:20:00.000Z",
      auditId: "evt_key_prisma_rotation",
      environment: "production",
      immutable: true as const,
      keyId: "pak_prisma_rotation",
      keyPreview: "sk_live_****_6650",
      rotationId: "key_rotation_prisma_6650",
      status: "rotation_queued"
    };

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:19:00.000Z",
      environment: "production",
      keyId: "pak_prisma_rotation",
      name: "Prisma rotation key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });

    const saved = await repository.saveApiKeyRotationAuditEvent(auditEvent);

    assert.deepEqual(saved, auditEvent);
    assert.equal(JSON.stringify(calls.publicApiKeyRotationAuditEventCreates).includes(rawSecret), false);
    assert.equal(JSON.stringify(calls.publicApiKeyRotationAuditEventCreates).includes("rawSecret"), false);
    assert.deepEqual(calls.publicApiKeyRotationAuditEventCreates[0], {
      data: {
        action: "public_api_key.rotation_queued",
        at: new Date("2026-06-30T12:20:00.000Z"),
        auditId: "evt_key_prisma_rotation",
        environment: "production",
        immutable: true,
        keyId: "pak_prisma_rotation",
        keyPreview: "sk_live_****_6650",
        rotationId: "key_rotation_prisma_6650",
        status: "rotation_queued"
      }
    });
    await assert.rejects(
      () => repository.saveApiKeyRotationAuditEvent(auditEvent),
      /fake_prisma_public_api_key_rotation_audit_duplicate/
    );
  });

  it("rotates fixture API keys through Prisma after creating a safe public key reference for audit FK", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client, seed: bootstrapIntegrationState() });
    const integrations = new IntegrationService(repository);

    const rotated = await integrations.rotateApiKey("stage-key");

    assert.equal(rotated.status, "ok");
    assert.equal(rotated.data.keyId, "stage-key");
    assert.equal(calls.publicApiKeyUpserts[0].where.keyId, "stage-key");
    assert.equal(calls.publicApiKeyUpserts[0].create.keyId, "stage-key");
    assert.equal(calls.publicApiKeyUpserts[0].create.keyPreview, "sk_test_****_44ST");
    assert.equal(calls.publicApiKeyUpserts[0].create.environment, "stage");
    assert.equal(calls.publicApiKeyUpserts[0].create.status, "active");
    assert.equal(calls.publicApiKeyUpserts[0].create.secretHash.length, 64);
    assert.equal(calls.publicApiKeyUpserts[0].create.secretHash.includes("sk_test"), false);
    assert.deepEqual(calls.publicApiKeyUpserts[0].update, {});
    assert.equal(calls.publicApiKeyRotationAuditEventCreates[0].data.keyId, "stage-key");
    assert.equal(calls.publicApiKeyRotationAuditEventCreates[0].data.keyPreview, "sk_test_****_44ST");
    assert.equal(JSON.stringify(calls.publicApiKeyRotationAuditEventCreates).includes("rawSecret"), false);
    assert.equal(JSON.stringify(calls.publicApiKeyRotationAuditEventCreates).includes("sk_test_support_secret"), false);
  });

  it("keeps an existing Prisma public API key hash when preparing rotation audit references", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client, seed: bootstrapIntegrationState() });
    const integrations = new IntegrationService(repository);
    const rawSecret = "sk_test_existing_stage_secret_4400";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:30:00.000Z",
      environment: "stage",
      keyId: "stage-key",
      name: "Persisted stage key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });

    const rotated = await integrations.rotateApiKey("stage-key");
    const auth = await resolvePublicApiRequest({
      authorization: `Bearer ${rawSecret}`,
      environment: "stage",
      lookup: repository,
      requiredScope: "clients:identify"
    });

    assert.equal(rotated.status, "ok");
    assert.equal(auth.allowed, true);
    assert.equal(calls.publicApiKeyUpserts.length, 2);
    assert.deepEqual(calls.publicApiKeyUpserts[1].update, {});
    assert.equal(calls.publicApiKeyRotationAuditEventCreates[0].data.keyId, "stage-key");
  });
});

function createFakePrismaIntegrationClient(options: {
  afterRevealFindUniqueSnapshot?: () => Promise<void>;
} = {}) {
  const rows = new Map<string, FakePublicApiKeyRow>();
  const revealRows = new Map<string, FakePublicApiKeyRevealStateRow>();
  const rotationAuditRows = new Map<string, FakePublicApiKeyRotationAuditEventRow>();
  const rotationJobRows = new Map<string, FakeRuntimeRow>();
  const publicDemoRows = new Map<string, FakeRuntimeRow>();
  const publicDemoAuditRows = new Map<string, FakeRuntimeRow>();
  const publicDemoNotificationRows = new Map<string, FakeRuntimeRow>();
  const webhookDeliveryRows = new Map<string, FakeRuntimeRow>();
  const webhookReplayRows = new Map<string, FakeRuntimeRow>();
  const webhookReplayAuditRows = new Map<string, FakeRuntimeRow>();
  const securitySessionRows = new Map<string, FakeRuntimeRow>();
  const channelConnectionRows = new Map<string, FakeRuntimeRow>();
  const channelConnectionEventRows = new Map<string, FakeRuntimeRow>();
  const channelConnectionAuditRows = new Map<string, FakeRuntimeRow>();
  const telegramConnectionRows = new Map<string, FakeRuntimeRow>();
  const calls: {
    publicApiKeyCreates: Array<{ data: FakePublicApiKeyRow }>;
    publicApiKeyFindMany: Array<{ orderBy?: { createdAt: "asc" | "desc" }; where?: { status?: string } }>;
    publicApiKeyFindUnique: Array<{ where: { keyId: string } }>;
    publicApiKeyUpserts: Array<{
      create: FakePublicApiKeyRow;
      update: Partial<Omit<FakePublicApiKeyRow, "createdAt" | "keyId">>;
      where: { keyId: string };
    }>;
    publicApiKeyRevealStateFindUnique: Array<{ where: { keyId: string } }>;
    publicApiKeyRevealStateUpdates: Array<{
      data: Partial<Omit<FakePublicApiKeyRevealStateRow, "createdAt" | "keyId">>;
      where: { keyId: string };
    }>;
    publicApiKeyRevealStateUpdateMany: Array<{
      data: Partial<Omit<FakePublicApiKeyRevealStateRow, "createdAt" | "keyId">>;
      where: { keyId: string; status?: "available" | "consumed" };
    }>;
    publicApiKeyRevealStateUpserts: Array<{
      create: FakePublicApiKeyRevealStateRow;
      update: Partial<Omit<FakePublicApiKeyRevealStateRow, "createdAt" | "keyId">>;
      where: { keyId: string };
    }>;
    publicApiKeyRotationAuditEventCreates: Array<{
      data: FakePublicApiKeyRotationAuditEventCreateInput;
    }>;
    publicDemoRequestNotificationDescriptorCounts: Array<{
      where?: FakeRuntimeRow;
    }>;
    publicDemoRequestNotificationDescriptorFindMany: Array<{
      orderBy?: Record<string, "asc" | "desc">;
      take?: number;
      where?: FakeRuntimeRow;
    }>;
  } = {
    publicApiKeyCreates: [],
    publicApiKeyFindMany: [],
    publicApiKeyFindUnique: [],
    publicApiKeyRevealStateFindUnique: [],
    publicApiKeyRevealStateUpdateMany: [],
    publicApiKeyRevealStateUpdates: [],
    publicApiKeyRevealStateUpserts: [],
    publicApiKeyRotationAuditEventCreates: [],
    publicApiKeyUpserts: [],
    publicDemoRequestNotificationDescriptorCounts: [],
    publicDemoRequestNotificationDescriptorFindMany: []
  };
  const client: PrismaIntegrationClient = {
    channelConnection: {
      async findMany(input) {
        return findRuntimeRows(channelConnectionRows, input.where, "createdAt");
      },
      async findUnique(input) {
        return clone(channelConnectionRows.get(input.where.id) ?? null);
      },
      async upsert(input) {
        return upsertRuntimeRow(channelConnectionRows, input.where.id, input.create, input.update);
      }
    },
    channelConnectionAuditEvent: {
      async create(input) {
        return createRuntimeRow(channelConnectionAuditRows, input.data.id, input.data);
      },
      async findMany(input) {
        return findRuntimeRows(channelConnectionAuditRows, input.where, "at");
      }
    },
    channelConnectionEvent: {
      async create(input) {
        return createRuntimeRow(channelConnectionEventRows, input.data.id, input.data);
      },
      async findMany(input) {
        return findRuntimeRows(channelConnectionEventRows, input.where, "at");
      }
    },
    integrationApiKeyRotationJob: {
      async findMany() {
        return findRuntimeRows(rotationJobRows, undefined, "createdAt");
      },
      async upsert(input) {
        return upsertRuntimeRow(rotationJobRows, input.where.rotationId, input.create, input.update);
      }
    },
    publicApiKey: {
      async create(input) {
        if (rows.has(input.data.keyId)) {
          throw new Error("fake_prisma_public_api_key_duplicate");
        }

        calls.publicApiKeyCreates.push(clone(input));
        rows.set(input.data.keyId, clone(input.data));

        return clone(input.data);
      },
      async findMany(input) {
        calls.publicApiKeyFindMany.push(input);
        return [...rows.values()]
          .filter((row) => !input.where?.status || row.status === input.where.status)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      },
      async findUnique(input) {
        calls.publicApiKeyFindUnique.push(clone(input));

        return clone(rows.get(input.where.keyId) ?? null);
      },
      async upsert(input) {
        calls.publicApiKeyUpserts.push(clone(input));
        const existing = rows.get(input.where.keyId);
        const next = existing
          ? { ...existing, ...input.update }
          : clone(input.create);
        rows.set(input.where.keyId, next);

        return clone(next);
      }
    },
    publicApiKeyRevealState: {
      async findMany() {
        return [...revealRows.values()].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      },
      async findUnique(input) {
        calls.publicApiKeyRevealStateFindUnique.push(clone(input));
        const snapshot = clone(revealRows.get(input.where.keyId) ?? null);
        await options.afterRevealFindUniqueSnapshot?.();

        return snapshot;
      },
      async update(input) {
        calls.publicApiKeyRevealStateUpdates.push(clone(input));
        const existing = revealRows.get(input.where.keyId);
        if (!existing) {
          throw new Error("fake_prisma_public_api_key_reveal_state_not_found");
        }

        const next = { ...existing, ...input.data };
        revealRows.set(input.where.keyId, next);

        return clone(next);
      },
      async updateMany(input) {
        calls.publicApiKeyRevealStateUpdateMany.push(clone(input));
        const existing = revealRows.get(input.where.keyId);
        if (!existing || (input.where.status && existing.status !== input.where.status)) {
          return { count: 0 };
        }

        revealRows.set(input.where.keyId, { ...existing, ...input.data });

        return { count: 1 };
      },
      async upsert(input) {
        calls.publicApiKeyRevealStateUpserts.push(clone(input));
        const existing = revealRows.get(input.where.keyId);
        const next = existing
          ? { ...existing, ...input.update }
          : clone(input.create);
        revealRows.set(input.where.keyId, next);

        return clone(next);
      }
    },
    publicApiKeyRotationAuditEvent: {
      async create(input) {
        if (!rows.has(input.data.keyId)) {
          throw new Error("fake_prisma_public_api_key_rotation_audit_missing_key_fk");
        }

        if (rotationAuditRows.has(input.data.auditId)) {
          throw new Error("fake_prisma_public_api_key_rotation_audit_duplicate");
        }

        calls.publicApiKeyRotationAuditEventCreates.push(clone(input));
        const row = { ...clone(input.data), createdAt: new Date("2026-06-30T12:20:01.000Z") };
        rotationAuditRows.set(row.auditId, row);

        return clone(row);
      },
      async findMany() {
        return [...rotationAuditRows.values()].sort((left, right) => left.at.getTime() - right.at.getTime());
      }
    },
    publicDemoRequest: {
      async findFirst(input) {
        return clone([...publicDemoRows.values()].find((row) => matchesWhere(row, input.where)) ?? null);
      },
      async findMany() {
        return findRuntimeRows(publicDemoRows, undefined, "createdAt");
      },
      async upsert(input) {
        return upsertRuntimeRow(publicDemoRows, input.where.id, input.create, input.update);
      }
    },
    publicDemoRequestAuditEvent: {
      async create(input) {
        return createRuntimeRow(publicDemoAuditRows, input.data.id, input.data);
      },
      async findMany() {
        return findRuntimeRows(publicDemoAuditRows, undefined, "at");
      }
    },
    publicDemoRequestNotificationDescriptor: {
      async count(input) {
        calls.publicDemoRequestNotificationDescriptorCounts.push(clone(input));
        return findRuntimeRows(publicDemoNotificationRows, input.where, "createdAt").length;
      },
      async findMany(input) {
        calls.publicDemoRequestNotificationDescriptorFindMany.push(clone(input));
        const [orderByField, orderByDirection] = Object.entries(input.orderBy ?? { createdAt: "asc" })[0] ?? ["createdAt", "asc"];
        const rows = findRuntimeRows(publicDemoNotificationRows, input.where, orderByField);
        return (orderByDirection === "desc" ? rows.reverse() : rows).slice(0, input.take);
      },
      async upsert(input) {
        return upsertRuntimeRow(publicDemoNotificationRows, input.where.id, input.create, input.update);
      }
    },
    securitySession: {
      async findMany() {
        return findRuntimeRows(securitySessionRows, undefined, "lastSeen");
      },
      async upsert(input) {
        return upsertRuntimeRow(securitySessionRows, input.where.id, input.create, input.update);
      }
    },
    telegramConnection: {
      async findFirst(input) {
        return clone([...telegramConnectionRows.values()].find((row) => matchesWhere(row, input.where)) ?? null);
      },
      async findMany() {
        return findRuntimeRows(telegramConnectionRows, undefined, "createdAt");
      },
      async findUnique(input) {
        return clone(telegramConnectionRows.get(input.where.tenantId) ?? null);
      },
      async upsert(input) {
        return upsertRuntimeRow(telegramConnectionRows, input.where.tenantId, input.create, input.update);
      }
    },
    webhookDeliveryJournalEntry: {
      async findMany(input) {
        return findRuntimeRows(webhookDeliveryRows, input.where, "createdAt").slice(0, input.take);
      },
      async findUnique(input) {
        return clone(webhookDeliveryRows.get(input.where.deliveryId) ?? null);
      },
      async update(input) {
        const existing = webhookDeliveryRows.get(input.where.deliveryId);
        if (!existing) {
          throw new Error("fake_prisma_webhook_delivery_journal_not_found");
        }

        const next = { ...existing, ...clone(input.data) };
        webhookDeliveryRows.set(input.where.deliveryId, next);
        return clone(next);
      },
      async upsert(input) {
        return upsertRuntimeRow(webhookDeliveryRows, input.where.deliveryId, input.create, input.update);
      }
    },
    webhookReplayAuditEvent: {
      async create(input) {
        return createRuntimeRow(webhookReplayAuditRows, input.data.id, input.data);
      },
      async findMany() {
        return findRuntimeRows(webhookReplayAuditRows, undefined, "at");
      }
    },
    webhookReplayJournalEntry: {
      async findMany() {
        return findRuntimeRows(webhookReplayRows, undefined, "createdAt");
      },
      async findUnique(input) {
        return clone(webhookReplayRows.get(input.where.idempotencyKey) ?? null);
      },
      async upsert(input) {
        return upsertRuntimeRow(webhookReplayRows, input.where.idempotencyKey, input.create, input.update);
      }
    }
  };

  return { calls, client };
}

interface FakePublicApiKeyRow {
  createdAt: Date;
  environment: "production" | "stage";
  keyId: string;
  keyPreview: string;
  name: string;
  owner: string;
  scopes: string[];
  secretHash: string;
  status: "active" | "revoked";
  tenantId: string;
  updatedAt: Date;
}

interface FakePublicApiKeyRevealStateRow {
  consumedAt: Date | null;
  createdAt: Date;
  keyId: string;
  keyPreview: string;
  status: "available" | "consumed";
}

interface FakePublicApiKeyRotationAuditEventCreateInput {
  action: "public_api_key.rotation_queued";
  at: Date;
  auditId: string;
  environment: string;
  immutable: true;
  keyId: string;
  keyPreview: string;
  rotationId: string;
  status: string;
}

interface FakePublicApiKeyRotationAuditEventRow extends FakePublicApiKeyRotationAuditEventCreateInput {
  createdAt: Date;
}

type FakeRuntimeRow = Record<string, any>;

function createRuntimeRow<T extends FakeRuntimeRow>(store: Map<string, T>, id: string, data: T): T {
  if (store.has(id)) {
    throw new Error(`fake_prisma_duplicate:${id}`);
  }

  const row = withRuntimeTimestamps(clone(data));
  store.set(id, row);
  return clone(row);
}

function upsertRuntimeRow<TCreate extends FakeRuntimeRow, TUpdate extends FakeRuntimeRow>(
  store: Map<string, FakeRuntimeRow>,
  id: string,
  create: TCreate,
  update: TUpdate
): FakeRuntimeRow {
  const existing = store.get(id);
  const next = existing
    ? withRuntimeTimestamps({ ...existing, ...clone(update), updatedAt: clone(update).updatedAt ?? new Date("2026-07-03T09:00:00.000Z") })
    : withRuntimeTimestamps(clone(create));
  store.set(id, next);
  return clone(next);
}

function findRuntimeRows(
  store: Map<string, FakeRuntimeRow>,
  where: FakeRuntimeRow | undefined,
  sortField: string
): FakeRuntimeRow[] {
  return [...store.values()]
    .filter((row) => matchesWhere(row, where))
    .sort((left, right) => dateValue(left[sortField]) - dateValue(right[sortField]))
    .map((row) => clone(row));
}

function matchesWhere(row: FakeRuntimeRow, where: FakeRuntimeRow | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) {
      return true;
    }

    if (expected && typeof expected === "object" && !Array.isArray(expected) && "in" in expected) {
      return Array.isArray(expected.in) && expected.in.includes(row[key]);
    }

    return row[key] === expected;
  });
}

function withRuntimeTimestamps<T extends FakeRuntimeRow>(row: T): T {
  const now = new Date("2026-07-03T09:00:00.000Z");
  return {
    ...row,
    createdAt: row.createdAt ?? now,
    updatedAt: row.updatedAt ?? row.createdAt ?? now
  };
}

function dateValue(value: unknown): number {
  return value instanceof Date ? value.getTime() : new Date(String(value ?? 0)).getTime();
}

function createCallBarrier(targetCalls: number) {
  let calls = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    async wait(): Promise<void> {
      calls += 1;
      if (calls === targetCalls) {
        release();
      }

      await released;
    }
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, item) => {
    if (typeof item === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item)) {
      return new Date(item);
    }

    return item;
  }) as T;
}
