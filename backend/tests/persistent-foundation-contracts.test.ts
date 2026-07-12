import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { resolveServiceAdminContext } from "@support-communication/auth-context";
import { configureRepositoryBootstrap, JsonFileStore, resolveRepositoryKind, resolveRepositoryStoreFile } from "@support-communication/database";
import { createOutboxEvent } from "@support-communication/events";
import { configureAutomationRepository } from "../apps/api-gateway/src/automation/bootstrap.ts";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { configureBillingRepository } from "../apps/api-gateway/src/billing/bootstrap.ts";
import { BillingRepository as RuntimeBillingRepository } from "../apps/api-gateway/src/billing/billing.repository.ts";
import { BillingService } from "../apps/api-gateway/src/billing/billing.service.ts";
import { bootstrapBillingState } from "../apps/api-gateway/src/billing/seed.ts";
import { configureConversationRepository } from "../apps/api-gateway/src/conversation/bootstrap.ts";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { ConversationService } from "../apps/api-gateway/src/conversation/conversation.service.ts";
import { bootstrapConversationState } from "../apps/api-gateway/src/conversation/seed.ts";
import { configureIdentityRepository } from "../apps/api-gateway/src/identity/bootstrap.ts";
import { AuthService } from "../apps/api-gateway/src/identity/auth.service.ts";
import { ServiceAdminSessionGuard } from "../apps/api-gateway/src/identity/service-admin-session.guard.ts";
import { IdentityRepository as RuntimeIdentityRepository, hashServiceAdminToken } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { bootstrapIdentityState } from "../apps/api-gateway/src/identity/seed.ts";
import { createMfaOtpRuntime } from "../apps/api-gateway/src/identity/mfa-otp.ts";
import { TenantService } from "../apps/api-gateway/src/identity/tenant.service.ts";
import { FeatureFlagService } from "../apps/api-gateway/src/feature-flags/feature-flag.service.ts";
import { IncidentService } from "../apps/api-gateway/src/incidents/incident.service.ts";
import { configureIntegrationRepository } from "../apps/api-gateway/src/integrations/bootstrap.ts";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { IntegrationService } from "../apps/api-gateway/src/integrations/integration.service.ts";
import { bootstrapIntegrationState } from "../apps/api-gateway/src/integrations/seed.ts";
import { createDeterministicDeadLetterReplayBackendStore } from "../apps/api-gateway/src/operations/dead-letter-replay.worker.ts";
import { configureOperationsRepository } from "../apps/api-gateway/src/operations/bootstrap.ts";
import {
  OperationsDeadLetterBackendRegistry,
  useOperationsDeadLetterBackendRegistry
} from "../apps/api-gateway/src/operations/operations-dead-letter-backend.registry.ts";
import { OperationsReadinessService } from "../apps/api-gateway/src/operations/operations-readiness.service.ts";
import { OperationsRepository } from "../apps/api-gateway/src/operations/operations.repository.ts";
import { bootstrapOperationsState } from "../apps/api-gateway/src/operations/seed.ts";
import { configurePlatformRepository } from "../apps/api-gateway/src/platform/bootstrap.ts";
import { PlatformRepository } from "../apps/api-gateway/src/platform/platform.repository.ts";
import { PlatformMonitoringService } from "../apps/api-gateway/src/platform/platform-monitoring.service.ts";
import { bootstrapPlatformState } from "../apps/api-gateway/src/platform/seed.ts";
import { configureReportRepository } from "../apps/api-gateway/src/reports/bootstrap.ts";
import { ReportRepository } from "../apps/api-gateway/src/reports/report.repository.ts";
import { ReportService } from "../apps/api-gateway/src/reports/report.service.ts";
import { exportJobFixtures } from "../apps/api-gateway/src/reports/seed-catalog.ts";
import { bootstrapReportState } from "../apps/api-gateway/src/reports/seed.ts";
import { configureRoutingRepository } from "../apps/api-gateway/src/routing/bootstrap.ts";
import { RoutingRepository } from "../apps/api-gateway/src/routing/routing.repository.ts";
import { RoutingService } from "../apps/api-gateway/src/routing/routing.service.ts";
import { bootstrapRoutingState } from "../apps/api-gateway/src/routing/seed.ts";
import { ServiceAdminService } from "../apps/api-gateway/src/service-admin/service-admin.service.ts";
import { configureWorkspaceRepository } from "../apps/api-gateway/src/workspace/bootstrap.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";
import { WorkspaceService } from "../apps/api-gateway/src/workspace/workspace.service.ts";
import { bootstrapWorkspaceState } from "../apps/api-gateway/src/workspace/seed.ts";

type BillingRepository = RuntimeBillingRepository;
const BillingRepository = {
  default: () => RuntimeBillingRepository.default(),
  inMemory: () => RuntimeBillingRepository.inMemory(bootstrapBillingState()),
  open: ({ filePath }: { filePath: string }) => RuntimeBillingRepository.open({ filePath, seed: bootstrapBillingState() }),
  useDefault: (repository: RuntimeBillingRepository) => RuntimeBillingRepository.useDefault(repository)
};
type IdentityRepository = RuntimeIdentityRepository;
const IdentityRepository = {
  default: () => RuntimeIdentityRepository.default(),
  inMemory: () => RuntimeIdentityRepository.inMemory(bootstrapIdentityState()),
  open: ({ filePath }: { filePath: string }) => RuntimeIdentityRepository.open({ filePath, seed: bootstrapIdentityState() }),
  useDefault: (repository: RuntimeIdentityRepository) => RuntimeIdentityRepository.useDefault(repository)
};

function usePersistentOperationsDeadLetterBackendRegistry(): void {
  const registry = new OperationsDeadLetterBackendRegistry();
  registry.register("webhook-delivery", createDeterministicDeadLetterReplayBackendStore());
  registry.register("report-export", createDeterministicDeadLetterReplayBackendStore());
  useOperationsDeadLetterBackendRegistry(registry);
}

describe("persistent backend foundation and identity services", () => {
  beforeEach(() => {
    RuntimeBillingRepository.useDefault(RuntimeBillingRepository.inMemory(bootstrapBillingState()));
    RuntimeIdentityRepository.useDefault(RuntimeIdentityRepository.inMemory(bootstrapIdentityState()));
  });
  it("uses shared repository bootstrap helpers for JSON and Prisma fallback selection", () => {
    assert.equal(resolveRepositoryKind({ SUPPORT_REPOSITORY: " prisma " }, "SUPPORT_REPOSITORY"), "prisma");
    assert.equal(resolveRepositoryKind({ SUPPORT_REPOSITORY: "json" }, "SUPPORT_REPOSITORY"), "json");
    assert.equal(resolveRepositoryKind({}, "SUPPORT_REPOSITORY"), "json");

    assert.equal(
      resolveRepositoryStoreFile({
        source: { SUPPORT_STORE_FILE: " C:/tmp/support.json " },
        storeFileEnv: "SUPPORT_STORE_FILE",
        suffix: "support"
      }),
      resolve("C:/tmp/support.json")
    );
    assert.equal(
      resolveRepositoryStoreFile({
        source: { SUPPORT_STORE_FILE: " relative/support.json " },
        storeFileEnv: "SUPPORT_STORE_FILE",
        suffix: "support"
      }),
      resolve("relative/support.json")
    );
    assert.match(
      resolveRepositoryStoreFile({
        source: {
          NODE_ENV: "test env",
          PORT: "41/00",
          SERVICE_NAME: "api gateway"
        },
        storeFileEnv: "SUPPORT_STORE_FILE",
        suffix: "support"
      }),
      /support-communication[\\/]+api-gateway-test-env-41-00-support\.json$/
    );

    const configuredDefaults: string[] = [];
    const prismaFactoryCalls: Array<{ datasourceUrl?: string }> = [];
    const repository = configureRepositoryBootstrap({
      createJsonRepository: (filePath) => `json:${filePath}`,
      createPrismaRepository: (client) => `prisma:${client}`,
      prismaClientFactory: (options) => {
        prismaFactoryCalls.push(options);
        return "client";
      },
      repositoryEnv: "SUPPORT_REPOSITORY",
      source: {
        DATABASE_URL: "postgres://support",
        SUPPORT_REPOSITORY: "PrIsMa",
        SUPPORT_STORE_FILE: "ignored.json"
      },
      storeFileEnv: "SUPPORT_STORE_FILE",
      suffix: "support",
      useDefault: (next) => {
        configuredDefaults.push(next);
      }
    });

    assert.equal(repository, "prisma:client");
    assert.deepEqual(configuredDefaults, ["prisma:client"]);
    assert.deepEqual(prismaFactoryCalls, [{ datasourceUrl: "postgres://support" }]);

    const withoutFallback = configureRepositoryBootstrap({
      createJsonRepository: () => {
        throw new Error("json fallback should not be opened");
      },
      createPrismaRepository: (client) => `prisma:${client}`,
      prismaClientFactory: () => "client-no-fallback",
      repositoryEnv: "SUPPORT_REPOSITORY",
      source: { SUPPORT_REPOSITORY: "prisma" },
      storeFileEnv: "SUPPORT_STORE_FILE",
      suffix: "support",
      useDefault: () => undefined
    });
    assert.equal(withoutFallback, "prisma:client-no-fallback");
  });

  it("persists JSON database state across store instances and creates outbox descriptors", () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "foundation.json");
      const first = new JsonFileStore<{ counter: number }>({ filePath, seed: { counter: 0 } });
      first.update((state) => ({ counter: state.counter + 1 }));

      const second = new JsonFileStore<{ counter: number }>({ filePath, seed: { counter: 0 } });
      assert.equal(second.read().counter, 1);

      const event = createOutboxEvent({
        aggregateId: "tenant-volga",
        aggregateType: "tenant",
        payload: { status: "restricted" },
        traceId: "trc_test_identity",
        type: "tenant.status.changed"
      });
      assert.match(event.id, /^outbox_/);
      assert.equal(event.queue, "domain-events");
      assert.equal(event.status, "pending");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists tenant status changes, audit events and outbox entries across service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity.json");
      const firstRepository = IdentityRepository.open({ filePath });
      const firstTenants = new TenantService(firstRepository);

      const updated = await firstTenants.updateTenantStatus({
        confirmed: true,
        reason: "Persistent restriction audit",
        status: "restricted",
        tenantId: "tenant-volga"
      });
      assert.equal(updated.status, "ok");
      assert.equal(updated.data.tenant.status, "restricted");
      assert.equal(updated.data.outbox.queue, "identity-events");
      assert.equal(updated.data.outbox.type, "tenant.status.changed");

      const secondRepository = IdentityRepository.open({ filePath });
      const secondTenants = new TenantService(secondRepository);
      const detail = await secondTenants.fetchTenantDetail("tenant-volga");

      assert.equal(detail.status, "ok");
      assert.equal(detail.data.tenant.status, "restricted");
      assert.ok(detail.data.auditEvents.some((event) => event.reason === "Persistent restriction audit"));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists conversations, messages, inbound idempotency and realtime events across service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "conversation.json");
      const firstRepository = ConversationRepository.open({ filePath, seed: bootstrapConversationState() });
      const firstConversations = new ConversationService(firstRepository);

      const closed = await firstConversations.transitionConversationStatus({
        conversationId: "vladimir",
        nextStatus: "closed",
        roleMode: "admin",
        topic: "Product / Mismatch"
      });
      assert.equal(closed.status, "ok");
      assert.equal(closed.data.conversation.status, "closed");

      const reply = await firstConversations.appendMessage({
        conversationId: "maria",
        mode: "reply",
        text: "Persistent reply from JSON repository"
      });
      assert.equal(reply.status, "ok");
      assert.equal(reply.data.outboundDelivery.deliveryState, "queued");

      const upload = await firstConversations.uploadAttachment({
        channel: "SDK",
        fileName: "invoice.pdf",
        sizeBytes: 2048
      }, { tenantId: "tenant-volga" });
      assert.equal(upload.status, "ok");

      const outbound = await firstConversations.createOutboundConversationRequest({
        channel: "telegram",
        message: "Persistent proactive message",
        phone: "+7 999 111-22-33",
        topic: "Delivery / Status"
      }, { tenantId: "tenant-volga" });
      assert.equal(outbound.status, "ok");

      const inbound = await firstConversations.normalizeInboundEvent("telegram", {
        conversationId: "dmitry",
        eventId: "tg-persistent-001",
        text: "Persistent inbound update"
      });
      assert.equal(inbound.status, "ok");
      assert.equal(inbound.data.duplicate, false);

      const secondRepository = ConversationRepository.open({ filePath });
      const secondConversations = new ConversationService(secondRepository);
      const vladimir = await secondConversations.fetchDialogDetail("vladimir");
      const maria = await secondConversations.fetchDialogDetail("maria");
      const duplicate = await secondConversations.normalizeInboundEvent("telegram", {
        conversationId: "dmitry",
        eventId: "tg-persistent-001",
        text: "Persistent inbound update"
      });
      const events = await secondConversations.fetchRealtimeEvents();
      const outboundDescriptors = await secondRepository.listOutboundDescriptors();
      const outboxEvents = await secondRepository.listOutboxEvents();

      assert.equal(vladimir.data.conversation.status, "closed");
      assert.equal(vladimir.data.conversation.topic, "Product / Mismatch");
      assert.ok((maria.data.messages as Array<Record<string, unknown>>).some((message) => message.text === "Persistent reply from JSON repository"));
      assert.equal(duplicate.data.duplicate, true);
      assert.ok(events.data.events.some((event) => event.resourceId === "vladimir" && event.eventName === "conversation.updated"));
      assert.ok(events.data.events.some((event) => event.data.eventId === "tg-persistent-001"));
      assert.ok(outboundDescriptors.some((descriptor) => descriptor.kind === "message_delivery" && descriptor.conversationId === "maria" && descriptor.status === "queued"));
      assert.ok(outboundDescriptors.some((descriptor) => descriptor.kind === "attachment_upload" && descriptor.payload.fileName === "invoice.pdf"));
      assert.ok(outboundDescriptors.some((descriptor) => descriptor.kind === "outbound_conversation" && descriptor.payload.phone === "+7 999 111-22-33"));
      assert.ok(outboxEvents.some((event) => event.type === "message.delivery.requested" && event.queue === "message-delivery"));
      assert.ok(outboxEvents.some((event) => event.type === "attachment.upload.requested" && event.queue === "file-scan"));
      assert.ok(outboxEvents.some((event) => event.type === "conversation.outbound.requested" && event.queue === "message-delivery"));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists channel delivery receipts through the JSON conversation repository without duplicating provider replays", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "conversation-receipts.json");
      const firstRepository = ConversationRepository.open({ filePath });

      const firstReceipt = await firstRepository.recordDeliveryReceipt({
        channel: "telegram",
        conversationId: "maria",
        id: "receipt_json_001",
        idempotencyKey: "delivery-receipt-json-001",
        messageId: "msg_json_001",
        payload: { providerStatus: "delivered" },
        provider: "telegram-bot-api",
        providerEventId: "tg-update-json-001",
        receivedAt: "2026-06-29T09:30:00.000Z",
        status: "delivered",
        tenantId: "tenant-volga",
        traceId: "trace-receipt-json-001"
      });
      const replayReceipt = await firstRepository.recordDeliveryReceipt({
        channel: "telegram",
        conversationId: "maria",
        id: "receipt_json_replay",
        idempotencyKey: "delivery-receipt-json-replay",
        messageId: "msg_json_replay",
        payload: { providerStatus: "ignored" },
        provider: "telegram-bot-api",
        providerEventId: "tg-update-json-001",
        receivedAt: "2026-06-29T09:31:00.000Z",
        status: "failed",
        tenantId: "tenant-volga",
        traceId: "trace-receipt-json-replay"
      });

      const secondRepository = ConversationRepository.open({ filePath });
      const receipts = await secondRepository.listDeliveryReceipts({
        channel: "telegram",
        messageId: "msg_json_001",
        tenantId: "tenant-volga"
      });

      assert.equal(replayReceipt.id, firstReceipt.id);
      assert.equal(replayReceipt.status, "delivered");
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].providerEventId, "tg-update-json-001");
      assert.deepEqual(receipts[0].payload, { providerStatus: "delivered" });
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists MFA challenges and service-admin sessions across auth service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity.json");
      const firstRepository = IdentityRepository.open({ filePath });
      const firstAuth = new AuthService(firstRepository);

      const challenge = await firstAuth.login({
        email: "service-admin@example.com",
        password: "correct-password"
      });
      assert.equal(challenge.status, "ok");
      assert.match(challenge.data.mfaChallengeId, /^mfa_/);
      assert.equal(firstRepository.findMfaChallenge(challenge.data.mfaChallengeId)?.email, "service-admin@example.com");

      const missingChallenge = await firstAuth.login({
        email: "service-admin@example.com",
        otp: "123456",
        password: "correct-password"
      }, { privileged: true });
      assert.equal(missingChallenge.status, "invalid");
      assert.equal(missingChallenge.error?.code, "mfa_challenge_required");

      const verified = await firstAuth.login({
        email: "service-admin@example.com",
        mfaChallengeId: challenge.data.mfaChallengeId,
        otp: "123456",
        password: "correct-password"
      }, { privileged: true });
      assert.equal(verified.status, "ok");
      assert.match(verified.data.session.id, /^svc-session_/);
      assert.equal(verified.data.outbox.queue, "identity-events");

      const reusedChallenge = await firstAuth.login({
        email: "service-admin@example.com",
        mfaChallengeId: challenge.data.mfaChallengeId,
        otp: "123456",
        password: "correct-password"
      }, { privileged: true });
      assert.equal(reusedChallenge.status, "invalid");
      assert.equal(reusedChallenge.error?.code, "mfa_challenge_consumed");

      const secondRepository = IdentityRepository.open({ filePath });
      const secondAuth = new AuthService(secondRepository);
      const state = await secondAuth.getAuthState({ sessionId: verified.data.session.id });
      assert.equal(state.status, "ok");
      assert.equal(state.data.authenticated, true);
      assert.equal(state.data.session.id, verified.data.session.id);

      const logout = await secondAuth.logout({
        reason: "Persistent logout audit",
        sessionId: verified.data.session.id
      });
      assert.equal(logout.status, "ok");
      assert.equal(logout.data.outbox.type, "service_admin.logout");

      const finalAuth = new AuthService(IdentityRepository.open({ filePath }));
      const afterLogout = await finalAuth.getAuthState({ sessionId: verified.data.session.id });
      assert.equal(afterLogout.status, "denied");
      assert.equal(afterLogout.data.authenticated, false);
      assert.equal(afterLogout.error?.code, "session_revoked");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists password credentials, password policy state and credential audit events across identity instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity.json");
      const firstRepository = IdentityRepository.open({ filePath }) as IdentityRepository & {
        findPasswordCredentialByEmail(email: string): unknown;
        getPasswordPolicy(scope: string): unknown;
        listCredentialAuditEvents(subjectId: string): unknown[];
        recordCredentialAuditEvent(event: {
          action: string;
          actor: string;
          at: string;
          id: string;
          immutable: true;
          reason: string;
          result: string;
          subjectId: string;
          traceId: string;
        }): unknown;
        savePasswordCredential(credential: {
          algorithm: "sha256";
          email: string;
          hash: string;
          subjectId: string;
          updatedAt: string;
          version: number;
        }): unknown;
        savePasswordPolicy(policy: {
          maxFailedAttempts: number;
          minLength: number;
          requireMfa: boolean;
          scope: string;
          updatedAt: string;
        }): unknown;
      };

      await firstRepository.savePasswordCredential({
        algorithm: "sha256",
        email: "service-admin@example.com",
        hash: "sha256:9e70573a46a3aab3bdcb7d239c2730f3f4edc7a8f7b7034d1f066274048a8432",
        subjectId: "svc-admin-001",
        updatedAt: "2026-06-28T09:00:00.000Z",
        version: 1
      });
      await firstRepository.savePasswordPolicy({
        maxFailedAttempts: 5,
        minLength: 12,
        requireMfa: true,
        scope: "service-admin",
        updatedAt: "2026-06-28T09:00:00.000Z"
      });
      await firstRepository.recordCredentialAuditEvent({
        action: "credential.password.updated",
        actor: "svc-admin-001",
        at: "2026-06-28T09:01:00.000Z",
        id: "evt_credential_password_updated",
        immutable: true,
        reason: "Initial credential bootstrap",
        result: "ok",
        subjectId: "svc-admin-001",
        traceId: "trc_credential_password_updated"
      });

      const secondRepository = IdentityRepository.open({ filePath }) as typeof firstRepository;
      const credential = await secondRepository.findPasswordCredentialByEmail("service-admin@example.com");
      const policy = await secondRepository.getPasswordPolicy("service-admin");
      const auditEvents = await secondRepository.listCredentialAuditEvents("svc-admin-001");

      assert.deepEqual(credential, {
        algorithm: "sha256",
        email: "service-admin@example.com",
        hash: "sha256:9e70573a46a3aab3bdcb7d239c2730f3f4edc7a8f7b7034d1f066274048a8432",
        subjectId: "svc-admin-001",
        updatedAt: "2026-06-28T09:00:00.000Z",
        version: 1
      });
      assert.deepEqual(policy, {
        maxFailedAttempts: 5,
        minLength: 12,
        requireMfa: true,
        scope: "service-admin",
        updatedAt: "2026-06-28T09:00:00.000Z"
      });
      assert.deepEqual(auditEvents.map((event) => event.id), ["evt_credential_password_updated"]);
      assert.equal(auditEvents[0].immutable, true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists service-admin user actions and audit events across service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity.json");
      const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
      const firstRepository = IdentityRepository.open({ filePath });
      const firstSupport = new ServiceAdminWithRepository(firstRepository);

      const reset = await firstSupport.resetTwoFactor({
        confirmed: true,
        reason: "Persistent MFA reset audit",
        userId: "usr-volga-admin"
      });
      assert.equal(reset.status, "ok");
      assert.equal(reset.data.user.mfa, "reset_pending");
      assert.equal(reset.data.auditEvent.action, "user.mfa.reset");

      const secondRepository = IdentityRepository.open({ filePath });
      const secondSupport = new ServiceAdminWithRepository(secondRepository);
      const users = await secondSupport.fetchSupportUsers({ tenantId: "tenant-volga" });
      const persistedUser = users.data.items.find((user) => user.id === "usr-volga-admin");
      assert.ok(persistedUser);
      assert.equal(persistedUser.mfa, "reset_pending");

      const audit = await secondSupport.fetchAuditEvents({
        action: "user.mfa.reset",
        userId: "usr-volga-admin"
      });
      assert.equal(audit.data.items.some((event) => event.reason === "Persistent MFA reset audit"), true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists service-admin denied attempt audit events across service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity.json");
      const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
      const firstSupport = new ServiceAdminWithRepository(IdentityRepository.open({ filePath }));

      const blocked = await firstSupport.resetTwoFactor({
        confirmed: true,
        reason: "",
        userId: "usr-volga-admin"
      });
      assert.equal(blocked.status, "invalid");
      assert.equal(blocked.error?.code, "reason_required");
      assert.equal(blocked.data.auditEvent.action, "user.mfa.reset");
      assert.equal(blocked.data.auditEvent.result, "blocked_reason_required");

      const secondSupport = new ServiceAdminWithRepository(IdentityRepository.open({ filePath }));
      const audit = await secondSupport.fetchAuditEvents({
        action: "user.mfa.reset",
        userId: "usr-volga-admin"
      });

      assert.equal(audit.status, "ok");
      assert.equal(audit.data.items.some((event) => event.id === blocked.data.auditEvent.id && event.result === "blocked_reason_required"), true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists service-admin pre-validation probe audit events across service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity.json");
      const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
      const firstSupport = new ServiceAdminWithRepository(IdentityRepository.open({ filePath }));

      const missing = await firstSupport.stopImpersonation({
        impersonationId: "imp_missing_persistent_probe",
        reason: "Persistent missing impersonation probe"
      });
      assert.equal(missing.status, "not_found");
      assert.equal(missing.error?.code, "impersonation_not_found");
      assert.equal(missing.data.auditEvent.action, "impersonation.stop");
      assert.equal(missing.data.auditEvent.result, "blocked_impersonation_not_found");

      const secondSupport = new ServiceAdminWithRepository(IdentityRepository.open({ filePath }));
      const audit = await secondSupport.fetchAuditEvents({
        action: "impersonation.stop",
        target: "imp_missing_persistent_probe"
      });

      assert.equal(audit.status, "ok");
      assert.equal(audit.data.items.some((event) => event.id === missing.data.auditEvent.id && event.result === "blocked_impersonation_not_found"), true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists service-admin impersonations and break-glass approvals across service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity.json");
      const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
      const firstRepository = IdentityRepository.open({ filePath });
      const firstSupport = new ServiceAdminWithRepository(firstRepository);

      const started = await firstSupport.startImpersonation({
        confirmed: true,
        reason: "Persistent impersonation start",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      });
      assert.equal(started.status, "ok");
      assert.match(started.data.impersonation.id, /^imp_tenant-volga_/);

      const secondSupport = new ServiceAdminWithRepository(IdentityRepository.open({ filePath }));
      const duplicateStart = await secondSupport.startImpersonation({
        confirmed: true,
        reason: "Persistent impersonation duplicate",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      });
      assert.equal(duplicateStart.status, "ok");
      assert.equal(duplicateStart.data.duplicate, true);
      assert.equal(duplicateStart.data.impersonation.id, started.data.impersonation.id);

      const stopped = await secondSupport.stopImpersonation({
        impersonationId: started.data.impersonation.id,
        reason: "Persistent impersonation stop"
      });
      assert.equal(stopped.status, "ok");
      assert.equal(stopped.data.impersonationId, started.data.impersonation.id);

      const thirdSupport = new ServiceAdminWithRepository(IdentityRepository.open({ filePath }));
      const duplicateStop = await thirdSupport.stopImpersonation({
        impersonationId: started.data.impersonation.id,
        reason: "Persistent impersonation stop duplicate"
      });
      assert.equal(duplicateStop.status, "ok");
      assert.equal(duplicateStop.data.duplicate, true);
      assert.equal(duplicateStop.data.auditEvent.result, "duplicate");
      assert.notEqual(duplicateStop.data.auditEvent.id, stopped.data.auditEvent.id);
      assert.equal(duplicateStop.data.stoppedAt, stopped.data.stoppedAt);

      const breakGlass = await thirdSupport.requestBreakGlassApproval({
        confirmed: true,
        reason: "Persistent break glass approval",
        userId: "usr-volga-admin"
      });
      assert.equal(breakGlass.status, "ok");
      assert.match(breakGlass.data.approval.id, /^bg_/);

      const fourthSupport = new ServiceAdminWithRepository(IdentityRepository.open({ filePath }));
      const approved = await fourthSupport.decideBreakGlassApproval({
        approvalId: breakGlass.data.approval.id,
        confirmed: true,
        decision: "approved",
        reason: "Persistent approval decision"
      });
      assert.equal(approved.status, "ok");
      assert.equal(approved.data.approval.status, "approved");

      const fifthSupport = new ServiceAdminWithRepository(IdentityRepository.open({ filePath }));
      const writeStart = await fifthSupport.startImpersonation({
        approvalId: breakGlass.data.approval.id,
        confirmed: true,
        reason: "Persistent write impersonation start",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin",
        writeAccess: true
      });
      assert.equal(writeStart.status, "ok");
      assert.equal(writeStart.data.access.writeGranted, true);
      assert.equal(writeStart.data.impersonation.approvalId, breakGlass.data.approval.id);
      assert.equal(writeStart.data.impersonation.mode, "break_glass_write");

      const sixthSupport = new ServiceAdminWithRepository(IdentityRepository.open({ filePath }));
      const duplicateWriteStart = await sixthSupport.startImpersonation({
        approvalId: breakGlass.data.approval.id,
        confirmed: true,
        reason: "Persistent write impersonation duplicate",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin",
        writeAccess: true
      });
      assert.equal(duplicateWriteStart.status, "ok");
      assert.equal(duplicateWriteStart.data.duplicate, true);
      assert.equal(duplicateWriteStart.data.impersonation.approvalId, breakGlass.data.approval.id);
      assert.equal(duplicateWriteStart.data.impersonation.mode, "break_glass_write");
      assert.equal(duplicateWriteStart.data.impersonation.id, writeStart.data.impersonation.id);

      const audit = await new ServiceAdminWithRepository(IdentityRepository.open({ filePath })).fetchAuditEvents({
        action: "break_glass.request",
        userId: "usr-volga-admin"
      });
      assert.equal(audit.status, "ok");
      assert.ok(audit.data.items.some((event) => event.id === breakGlass.data.auditEvent.id && event.reason === "Persistent break glass approval"));

      const decisionAudit = await new ServiceAdminWithRepository(IdentityRepository.open({ filePath })).fetchAuditEvents({
        action: "break_glass.approve",
        userId: "usr-volga-admin"
      });
      assert.equal(decisionAudit.status, "ok");
      assert.ok(decisionAudit.data.items.some((event) => event.id === approved.data.auditEvent.id && event.target === breakGlass.data.approval.id));

      const stopAudit = await new ServiceAdminWithRepository(IdentityRepository.open({ filePath })).fetchAuditEvents({
        action: "impersonation.stop",
        target: started.data.impersonation.id
      });
      assert.equal(stopAudit.status, "ok");
      assert.ok(stopAudit.data.items.some((event) => event.id === duplicateStop.data.auditEvent.id && event.result === "duplicate"));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("does not overwrite terminal break-glass approvals in the JSON identity repository", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity.json");
      const repository = IdentityRepository.open({ filePath });
      await repository.createBreakGlassApproval({
        approval: {
          action: "impersonation.write",
          auditEventId: "evt_json_break_glass_pending",
          durationMinutes: 15,
          expiresAt: "2099-01-01T00:15:00.000Z",
          id: "bg_json_terminal_guard",
          requestedAt: "2099-01-01T00:00:00.000Z",
          status: "pending",
          target: "usr-volga-admin",
          tenantId: "tenant-volga",
          userId: "usr-volga-admin"
        },
        auditEvent: {
          action: "break_glass.request",
          actor: "service-admin",
          actorName: "Service Admin",
          at: "2099-01-01T00:00:00.000Z",
          id: "evt_json_break_glass_pending",
          immutable: true,
          reason: "JSON approval guard request",
          result: "pending",
          severity: "critical",
          target: "usr-volga-admin",
          tenantId: "tenant-volga",
          traceId: "trc_json_break_glass_pending",
          userId: "usr-volga-admin"
        }
      });

      await repository.decideBreakGlassApproval({
        approvalId: "bg_json_terminal_guard",
        auditEvent: {
          action: "break_glass.approve",
          actor: "service-admin",
          actorName: "Service Admin",
          at: "2099-01-01T00:01:00.000Z",
          id: "evt_json_break_glass_approved",
          immutable: true,
          reason: "JSON approval guard approve",
          result: "approved",
          severity: "critical",
          target: "bg_json_terminal_guard",
          tenantId: "tenant-volga",
          traceId: "trc_json_break_glass_approved",
          userId: "usr-volga-admin"
        },
        status: "approved"
      });

      assert.throws(() => repository.decideBreakGlassApproval({
        approvalId: "bg_json_terminal_guard",
        auditEvent: {
          action: "break_glass.reject",
          actor: "service-admin",
          actorName: "Service Admin",
          at: "2099-01-01T00:02:00.000Z",
          id: "evt_json_break_glass_rejected",
          immutable: true,
          reason: "JSON approval guard reject",
          result: "rejected",
          severity: "critical",
          target: "bg_json_terminal_guard",
          tenantId: "tenant-volga",
          traceId: "trc_json_break_glass_rejected",
          userId: "usr-volga-admin"
        },
        status: "rejected"
      }), /was not pending/);

      const storedApproval = await IdentityRepository.open({ filePath }).findBreakGlassApproval("bg_json_terminal_guard");
      assert.equal(storedApproval?.status, "approved");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("rejects duplicate active service-admin impersonation creates in the JSON identity repository", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity.json");
      const repository = IdentityRepository.open({ filePath });
      const firstSession = {
        approvalId: null,
        banner: "Read-only support view for Volga Logistics",
        durationMinutes: 15,
        expiresAt: "2099-01-01T00:15:00.000Z",
        id: "imp_json_first",
        mode: "read_only_by_default" as const,
        startedAt: "2099-01-01T00:00:00.000Z",
        stoppedAt: null,
        stopAuditEvent: null,
        tenantId: "tenant-volga",
        tenantName: "Volga Logistics",
        userId: "usr-volga-admin",
        userName: "Sergey Volga"
      };

      await repository.createServiceAdminImpersonation({
        auditEvent: {
          action: "impersonation.start",
          actor: "service-admin",
          actorName: "Service Admin",
          at: "2099-01-01T00:00:00.000Z",
          id: "evt_json_impersonation_first",
          immutable: true,
          reason: "JSON impersonation first",
          result: "started",
          severity: "critical",
          target: "imp_json_first",
          tenantId: "tenant-volga",
          traceId: "trc_json_impersonation_first",
          userId: "usr-volga-admin"
        },
        session: firstSession
      });

      assert.throws(() => repository.createServiceAdminImpersonation({
        auditEvent: {
          action: "impersonation.start",
          actor: "service-admin",
          actorName: "Service Admin",
          at: "2099-01-01T00:01:00.000Z",
          id: "evt_json_impersonation_second",
          immutable: true,
          reason: "JSON impersonation second",
          result: "started",
          severity: "critical",
          target: "imp_json_second",
          tenantId: "tenant-volga",
          traceId: "trc_json_impersonation_second",
          userId: "usr-volga-admin"
        },
        session: {
          ...firstSession,
          id: "imp_json_second",
          startedAt: "2099-01-01T00:01:00.000Z"
        }
      }), /Active service-admin impersonation already exists/);

      const active = await IdentityRepository.open({ filePath }).findActiveServiceAdminImpersonation({
        now: new Date("2099-01-01T00:02:00.000Z"),
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      });
      assert.equal(active?.id, "imp_json_first");

      await repository.createServiceAdminImpersonation({
        auditEvent: {
          action: "impersonation.start",
          actor: "service-admin",
          actorName: "Service Admin",
          at: "2099-01-01T00:02:00.000Z",
          id: "evt_json_impersonation_tenant_scope",
          immutable: true,
          reason: "JSON tenant scoped impersonation",
          result: "started",
          severity: "critical",
          target: "imp_json_tenant_scope",
          tenantId: "tenant-volga",
          traceId: "trc_json_impersonation_tenant_scope",
          userId: null
        },
        session: {
          ...firstSession,
          id: "imp_json_tenant_scope",
          startedAt: "2099-01-01T00:02:00.000Z",
          userId: null,
          userName: null
        }
      });

      await repository.stopServiceAdminImpersonation({
        auditEvent: {
          action: "impersonation.stop",
          actor: "service-admin",
          actorName: "Service Admin",
          at: "2099-01-01T00:03:00.000Z",
          id: "evt_json_impersonation_first_stop",
          immutable: true,
          reason: "JSON impersonation first stop",
          result: "stopped",
          severity: "critical",
          target: "imp_json_first",
          tenantId: "tenant-volga",
          traceId: "trc_json_impersonation_first_stop",
          userId: "usr-volga-admin"
        },
        impersonationId: "imp_json_first",
        stoppedAt: "2099-01-01T00:03:00.000Z"
      });

      await repository.createServiceAdminImpersonation({
        auditEvent: {
          action: "impersonation.start",
          actor: "service-admin",
          actorName: "Service Admin",
          at: "2099-01-01T00:04:00.000Z",
          id: "evt_json_impersonation_after_stop",
          immutable: true,
          reason: "JSON impersonation after stop",
          result: "started",
          severity: "critical",
          target: "imp_json_after_stop",
          tenantId: "tenant-volga",
          traceId: "trc_json_impersonation_after_stop",
          userId: "usr-volga-admin"
        },
        session: {
          ...firstSession,
          id: "imp_json_after_stop",
          startedAt: "2099-01-01T00:04:00.000Z"
        }
      });
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists billing tariff changes and billing-sync jobs across service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "billing.json");
      const firstRepository = BillingRepository.open({ filePath });
      const firstBilling = new BillingService(firstRepository);

      const applied = await firstBilling.changeTenantTariff({
        confirmed: true,
        confirmationText: "CHANGE tenant-lumen TO business",
        nextPlanId: "business",
        reason: "Persistent trial conversion",
        tenantId: "tenant-lumen"
      });
      assert.equal(applied.status, "ok");
      assert.equal(applied.data.applied, true);
      assert.equal(applied.data.tenant.planId, "business");
      assert.match(applied.data.billingJobId, /^billing_sync_/);

      const firstJobs = await firstRepository.listBillingSyncJobs();
      assert.equal(firstJobs.some((job) => job.id === applied.data.billingJobId && job.tenantId === "tenant-lumen"), true);

      const secondRepository = BillingRepository.open({ filePath });
      const secondBilling = new BillingService(secondRepository);
      const quota = await secondBilling.fetchTenantQuotaSnapshot("tenant-lumen");
      assert.equal(quota.status, "ok");
      assert.equal(quota.data.tenant.planId, "business");
      assert.equal(quota.data.tariff.id, "business");

      const secondJobs = await secondRepository.listBillingSyncJobs();
      assert.equal(secondJobs.some((job) => job.id === applied.data.billingJobId && job.toPlanId === "business"), true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists quota check ledger entries across billing service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "billing.json");
      const firstRepository = BillingRepository.open({ filePath });
      const firstBilling = new BillingService(firstRepository);

      const legacyCheck = await firstBilling.checkQuota({
        requested: 1,
        resource: "operators",
        tenantId: "tenant-lumen"
      });
      assert.equal(legacyCheck.status, "ok");
      assert.equal((await firstRepository.listQuotaLedgerEntries("tenant-lumen")).length, 0);

      const allowed = await firstBilling.checkQuota({
        idempotencyKey: "quota-record-lumen-operators-1",
        mode: "record",
        requested: 1,
        resource: "operators",
        tenantId: "tenant-lumen"
      });
      assert.equal(allowed.status, "ok");
      assert.equal(allowed.data.decision, "allow");
      assert.match(allowed.data.quotaLedgerEntryId, /^quota_/);
      assert.equal(allowed.data.duplicate, false);

      const denied = await firstBilling.checkQuota({
        idempotencyKey: "quota-record-lumen-operators-10",
        mode: "record",
        requested: 10,
        resource: "operators",
        tenantId: "tenant-lumen"
      });
      assert.equal(denied.status, "denied");
      assert.equal(denied.data.decision, "deny");
      assert.match(denied.data.quotaLedgerEntryId, /^quota_/);

      const secondRepository = BillingRepository.open({ filePath });
      const secondBilling = new BillingService(secondRepository);
      const duplicate = await secondBilling.checkQuota({
        idempotencyKey: "quota-record-lumen-operators-1",
        mode: "record",
        requested: 1,
        resource: "operator",
        tenantId: "tenant-lumen"
      });
      assert.equal(duplicate.status, "ok");
      assert.equal(duplicate.data.duplicate, true);
      assert.equal(duplicate.data.quotaLedgerEntryId, allowed.data.quotaLedgerEntryId);

      const reusedKey = await secondBilling.checkQuota({
        idempotencyKey: "quota-record-lumen-operators-1",
        mode: "record",
        requested: 2,
        resource: "operators",
        tenantId: "tenant-lumen"
      });
      assert.equal(reusedKey.status, "conflict");
      assert.equal(reusedKey.error?.code, "idempotency_key_reused");

      const persistedEntries = await secondRepository.listQuotaLedgerEntries("tenant-lumen");

      assert.equal(persistedEntries.length, 2);
      assert.equal(persistedEntries[0].id, denied.data.quotaLedgerEntryId);
      assert.equal(persistedEntries[0].decision, "deny");
      assert.equal(persistedEntries[0].reason, "quota_exceeded");
      assert.equal(persistedEntries[0].traceId, denied.traceId);
      assert.equal(persistedEntries[1].id, allowed.data.quotaLedgerEntryId);
      assert.equal(persistedEntries[1].decision, "allow");
      assert.equal(persistedEntries[1].resource, "operators");
      assert.equal(persistedEntries[1].requested, 1);
      assert.equal(persistedEntries[1].traceId, allowed.traceId);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists quota reservations and committed usage mutations across billing service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "billing-quota-reservations.json");
      const firstRepository = BillingRepository.open({ filePath });
      const firstBilling = new BillingService(firstRepository);
      const before = await firstBilling.fetchTenantQuotaSnapshot("tenant-lumen");
      const beforeReports = (before.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "reports");
      assert.ok(beforeReports);

      const reserved = await firstBilling.reserveQuota({
        idempotencyKey: "reserve-persistent-reports",
        requested: 2,
        resource: "reports",
        tenantId: "tenant-lumen"
      });
      assert.equal(reserved.status, "ok");

      const committed = await firstBilling.commitQuotaReservation({
        idempotencyKey: "commit-persistent-reports",
        reservationId: reserved.data.reservationId as string
      });
      assert.equal(committed.status, "ok");
      assert.equal(committed.data.status, "committed");

      const secondRepository = BillingRepository.open({ filePath });
      const secondBilling = new BillingService(secondRepository);
      const duplicateCommit = await secondBilling.commitQuotaReservation({
        idempotencyKey: "commit-persistent-reports",
        reservationId: reserved.data.reservationId as string
      });
      const after = await secondBilling.fetchTenantQuotaSnapshot("tenant-lumen");
      const afterReports = (after.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "reports");

      assert.equal(duplicateCommit.status, "ok");
      assert.equal(duplicateCommit.data.duplicate, true);
      assert.equal(afterReports?.used, Number(beforeReports.used) + 2);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists provider subscription and invoice sync state across billing service instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "billing-provider-sync.json");
      const firstRepository = BillingRepository.open({ filePath });
      const firstBilling = new BillingService(firstRepository);

      const synced = await firstBilling.syncProviderBillingState({
        eventType: "invoice.payment_failed",
        idempotencyKey: "provider-event-lumen-payment-failed",
        invoice: {
          amountDue: 129000,
          amountPaid: 0,
          currency: "RUB",
          dueAt: "2026-07-15T00:00:00.000Z",
          id: "inv_lumen_provider_failed",
          paymentStatus: "failed",
          providerInvoiceId: "provider-invoice-lumen-failed",
          status: "past_due",
          subscriptionId: "sub_lumen_provider"
        },
        provider: "demo-billing-provider",
        subscription: {
          billingPeriod: "monthly",
          currentPeriodEnd: "2026-07-31T23:59:59.000Z",
          currentPeriodStart: "2026-07-01T00:00:00.000Z",
          id: "sub_lumen_provider",
          planId: "business",
          providerCustomerId: "provider-customer-lumen",
          providerSubscriptionId: "provider-subscription-lumen",
          seats: 32,
          status: "past_due"
        },
        tenantId: "tenant-lumen"
      });
      assert.equal(synced.status, "ok");
      assert.match(synced.data.syncJobId, /^billing_sync_/);

      const secondRepository = BillingRepository.open({ filePath });
      const secondBilling = new BillingService(secondRepository);
      const subscription = await secondBilling.fetchTenantSubscription("tenant-lumen");
      const invoices = await secondBilling.fetchTenantInvoices("tenant-lumen");
      const providerEvent = await secondRepository.findProviderSyncEventByIdempotencyKey("provider-event-lumen-payment-failed");
      const jobs = await secondRepository.listBillingSyncJobs();

      assert.equal(subscription.status, "ok");
      assert.equal(subscription.data.subscription.status, "past_due");
      assert.equal(subscription.data.subscription.planId, "business");
      assert.equal(invoices.status, "ok");
      assert.equal((invoices.data.items as Array<Record<string, unknown>>).some((invoice) => invoice.id === "inv_lumen_provider_failed" && invoice.paymentStatus === "failed"), true);
      assert.equal(providerEvent?.syncJobId, synced.data.syncJobId);
      assert.deepEqual(providerEvent?.auditEvents?.map((event) => event.result), ["accepted"]);
      assert.equal(providerEvent?.auditEvents?.[0]?.immutable, true);
      assert.equal(jobs.some((job) => job.id === synced.data.syncJobId && job.payload.eventType === "invoice.payment_failed"), true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists payment retry schedules across billing repository instances without transient secret fields", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "billing-payment-retry-schedules.json");
      const firstRepository = BillingRepository.open({ filePath });
      const schedule = {
        attempt: 1,
        createdAt: "2026-06-30T18:00:00.000Z",
        idempotencyKey: "payment-retry-json:tenant-lumen:invoice-1",
        invoiceId: "invoice-lumen-json-retry-1",
        lastAttemptAt: null,
        lastError: "providerToken=fake-provider-token-canonical-secret-needle",
        maxAttempts: 4,
        nextAttemptAt: "2026-06-30T18:15:00.000Z",
        provider: "demo-billing-provider",
        providerInvoiceId: "provider-invoice-lumen-json-retry-1",
        providerSecret: "fake-provider-token-canonical-secret-needle",
        requestFingerprint: "sha256:retry-json-lumen-1",
        scheduleId: "retry-schedule-json",
        status: "scheduled" as const,
        tenantId: "tenant-lumen",
        traceId: "trace-retry-json-lumen",
        updatedAt: "2026-06-30T18:00:00.000Z"
      };

      const saved = await firstRepository.savePaymentRetrySchedule(schedule);
      const replay = await firstRepository.savePaymentRetrySchedule({
        ...schedule,
        attempt: 2,
        nextAttemptAt: "2026-06-30T19:00:00.000Z",
        requestFingerprint: "sha256:retry-json-mutated",
        status: "exhausted" as const
      });

      const secondRepository = BillingRepository.open({ filePath });
      const tenantRows = await secondRepository.listPaymentRetrySchedules({ tenantId: "tenant-lumen" });
      const byIdempotencyKey = await secondRepository.findPaymentRetryScheduleByIdempotencyKey("payment-retry-json:tenant-lumen:invoice-1");
      const rawJson = readFileSync(filePath, "utf8");

      assert.equal(saved.attempt, 1);
      assert.equal(replay.attempt, 1);
      assert.equal(replay.status, "scheduled");
      assert.equal(tenantRows.length, 1);
      assert.equal(tenantRows[0].scheduleId, "retry-schedule-json");
      assert.equal(tenantRows[0].nextAttemptAt, "2026-06-30T18:15:00.000Z");
      assert.equal(byIdempotencyKey?.scheduleId, "retry-schedule-json");
      assert.equal((await secondRepository.listPaymentRetrySchedules({ tenantId: "tenant-volga" })).length, 0);
      assert.equal(rawJson.includes("providerSecret"), false);
      assert.equal(rawJson.includes("lastError"), false);
      assert.equal(rawJson.includes("fake-provider-token-canonical-secret-needle"), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists payment dunning state across billing repository instances without transient secret fields", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "billing-payment-dunning-state.json");
      const firstRepository = BillingRepository.open({ filePath });
      const state = {
        createdAt: "2026-06-30T18:30:00.000Z",
        dunningId: "dunning-state-json",
        failedAttempts: 1,
        idempotencyKey: "dunning-json:tenant-lumen:invoice-1",
        invoiceId: "invoice-lumen-json-dunning-1",
        lastError: "providerToken=fake-provider-token-canonical-secret-needle",
        lastFailureAt: "2026-06-30T18:25:00.000Z",
        nextActionAt: "2026-07-01T18:30:00.000Z",
        provider: "demo-billing-provider",
        providerInvoiceId: "provider-invoice-lumen-json-dunning-1",
        providerSecret: "fake-provider-token-canonical-secret-needle",
        requestFingerprint: "sha256:dunning-json-lumen-1",
        stage: "grace" as const,
        status: "active" as const,
        subscriptionId: "subscription-lumen",
        tenantId: "tenant-lumen",
        traceId: "trace-dunning-json-lumen",
        updatedAt: "2026-06-30T18:30:00.000Z"
      };

      const saved = await firstRepository.savePaymentDunningState(state);
      const replay = await firstRepository.savePaymentDunningState({
        ...state,
        failedAttempts: 2,
        nextActionAt: "2026-07-02T18:30:00.000Z",
        requestFingerprint: "sha256:dunning-json-mutated",
        stage: "final_notice" as const,
        status: "paused" as const
      });

      const secondRepository = BillingRepository.open({ filePath });
      const tenantRows = await secondRepository.listPaymentDunningStates({ tenantId: "tenant-lumen" });
      const byIdempotencyKey = await secondRepository.findPaymentDunningStateByIdempotencyKey("dunning-json:tenant-lumen:invoice-1");
      const rawJson = readFileSync(filePath, "utf8");

      assert.equal(saved.failedAttempts, 1);
      assert.equal(replay.failedAttempts, 1);
      assert.equal(replay.status, "active");
      assert.equal(replay.stage, "grace");
      assert.equal(tenantRows.length, 1);
      assert.equal(tenantRows[0].dunningId, "dunning-state-json");
      assert.equal(tenantRows[0].nextActionAt, "2026-07-01T18:30:00.000Z");
      assert.equal(byIdempotencyKey?.dunningId, "dunning-state-json");
      assert.equal((await secondRepository.listPaymentDunningStates({ tenantId: "tenant-volga" })).length, 0);
      assert.equal(rawJson.includes("providerSecret"), false);
      assert.equal(rawJson.includes("lastError"), false);
      assert.equal(rawJson.includes("fake-provider-token-canonical-secret-needle"), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists reconciliation conflicts across billing repository instances without transient secret fields", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "billing-reconciliation-conflicts.json");
      const firstRepository = BillingRepository.open({ filePath });
      const conflict = {
        actual: { amountPaid: 0, providerStatus: "failed" },
        conflictId: "reconciliation-conflict-json",
        createdAt: "2026-06-30T19:00:00.000Z",
        detectedAt: "2026-06-30T18:55:00.000Z",
        expected: { amountDue: 129000, paymentStatus: "pending" },
        idempotencyKey: "reconciliation-conflict-json:tenant-lumen:invoice-1",
        invoiceId: "invoice-lumen-json-conflict-1",
        lastError: "providerToken=fake-provider-token-canonical-secret-needle",
        provider: "demo-billing-provider",
        providerInvoiceId: "provider-invoice-lumen-json-conflict-1",
        providerSecret: "fake-provider-token-canonical-secret-needle",
        reason: "provider_invoice_status_mismatch",
        requestFingerprint: "sha256:reconciliation-json-lumen-1",
        resolution: null,
        resolvedAt: null,
        severity: "high" as const,
        status: "open" as const,
        tenantId: "tenant-lumen",
        traceId: "trace-reconciliation-json-lumen",
        updatedAt: "2026-06-30T19:00:00.000Z"
      };

      const saved = await firstRepository.saveReconciliationConflict(conflict);
      const replay = await firstRepository.saveReconciliationConflict({
        ...conflict,
        actual: { amountPaid: 129000, providerStatus: "paid" },
        requestFingerprint: "sha256:reconciliation-json-mutated",
        resolution: "provider replay was stale",
        resolvedAt: "2026-06-30T19:30:00.000Z",
        severity: "low" as const,
        status: "resolved" as const
      });

      const secondRepository = BillingRepository.open({ filePath });
      const tenantRows = await secondRepository.listReconciliationConflicts({ tenantId: "tenant-lumen" });
      const byIdempotencyKey = await secondRepository.findReconciliationConflictByIdempotencyKey("reconciliation-conflict-json:tenant-lumen:invoice-1");
      const rawJson = readFileSync(filePath, "utf8");

      assert.equal(saved.actual.amountPaid, 0);
      assert.equal(replay.actual.amountPaid, 0);
      assert.equal(replay.status, "open");
      assert.equal(replay.severity, "high");
      assert.equal(replay.resolution, null);
      assert.equal(tenantRows.length, 1);
      assert.equal(tenantRows[0].conflictId, "reconciliation-conflict-json");
      assert.equal(tenantRows[0].actual.amountPaid, 0);
      assert.equal(byIdempotencyKey?.conflictId, "reconciliation-conflict-json");
      assert.equal((await secondRepository.listReconciliationConflicts({ tenantId: "tenant-volga" })).length, 0);
      assert.equal(rawJson.includes("providerSecret"), false);
      assert.equal(rawJson.includes("lastError"), false);
      assert.equal(rawJson.includes("fake-provider-token-canonical-secret-needle"), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists idempotent payment retry keys across billing repository instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "billing-payment-retry-keys.json");
      const firstRepository = BillingRepository.open({ filePath });
      const retryKey = {
        attempt: 1,
        createdAt: "2026-06-30T19:30:00.000Z",
        firstAttemptAt: "2026-06-30T19:30:00.000Z",
        idempotencyKey: "payment-retry-key-json:tenant-lumen:invoice-1:attempt-1",
        invoiceId: "invoice-lumen-json-retry-key-1",
        lastAttemptAt: null,
        provider: "demo-billing-provider",
        providerInvoiceId: "provider-invoice-lumen-json-retry-key-1",
        requestFingerprint: "sha256:retry-key-json-lumen-1",
        result: { providerRequestId: "provider-request-json-lumen-1" },
        retryKeyId: "retry-key-json",
        scheduleId: "retry-schedule-json",
        status: "claimed" as const,
        tenantId: "tenant-lumen",
        traceId: "trace-retry-key-json-lumen",
        updatedAt: "2026-06-30T19:30:00.000Z"
      };

      const saved = await firstRepository.savePaymentRetryKey(retryKey);
      saved.result.providerRequestId = "provider-request-mutated";
      const replay = await firstRepository.savePaymentRetryKey({
        ...retryKey,
        lastAttemptAt: "2026-06-30T19:45:00.000Z",
        requestFingerprint: "sha256:retry-key-json-mutated",
        result: { providerRequestId: "provider-request-json-replay" },
        status: "succeeded" as const,
        updatedAt: "2026-06-30T19:45:00.000Z"
      });

      const secondRepository = BillingRepository.open({ filePath });
      const tenantRows = await secondRepository.listPaymentRetryKeys({ tenantId: "tenant-lumen" });
      tenantRows[0].result.providerRequestId = "provider-request-mutated";
      const tenantRowsAgain = await secondRepository.listPaymentRetryKeys({ tenantId: "tenant-lumen" });
      const byIdempotencyKey = await secondRepository.findPaymentRetryKeyByIdempotencyKey("payment-retry-key-json:tenant-lumen:invoice-1:attempt-1");

      assert.equal(replay.status, "claimed");
      assert.equal(replay.lastAttemptAt, null);
      assert.equal(replay.result.providerRequestId, "provider-request-json-lumen-1");
      assert.equal(tenantRowsAgain.length, 1);
      assert.equal(tenantRowsAgain[0].retryKeyId, "retry-key-json");
      assert.equal(tenantRowsAgain[0].result.providerRequestId, "provider-request-json-lumen-1");
      assert.equal(byIdempotencyKey?.retryKeyId, "retry-key-json");
      assert.equal((await secondRepository.listPaymentRetryKeys({ tenantId: "tenant-volga" })).length, 0);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("auth state fails closed for unverified and expired persisted sessions", async () => {
    const repository = IdentityRepository.inMemory();
    const auth = new AuthService(repository);
    const unverified = await repository.createServiceAdminSession({
      actorId: "svc-unverified",
      actorName: "Unverified Admin",
      allowedActions: ["tenants.manage"],
      mfaVerified: false,
      ttlMinutes: 30
    });
    const expired = await repository.createServiceAdminSession({
      actorId: "svc-expired",
      actorName: "Expired Admin",
      allowedActions: ["tenants.manage"],
      mfaVerified: true,
      ttlMinutes: -1
    });

    const unverifiedState = await auth.getAuthState({ sessionId: unverified.id });
    assert.equal(unverifiedState.status, "denied");
    assert.equal(unverifiedState.data.authenticated, false);
    assert.equal(unverifiedState.error?.code, "mfa_required");

    const expiredState = await auth.getAuthState({ sessionId: expired.id });
    assert.equal(expiredState.status, "denied");
    assert.equal(expiredState.data.authenticated, false);
    assert.equal(expiredState.error?.code, "session_expired");
  });

  it("persists service-admin access and refresh token lifecycle with idempotent rotate and revoke", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity-tokens.json");
      type TokenLifecycleRepository = IdentityRepository & {
        createServiceAdminTokenPair(input: {
          accessTokenExpiresAt: string;
          accessTokenHash: string;
          id: string;
          issuedAt: string;
          refreshTokenExpiresAt: string;
          refreshTokenHash: string;
          sessionId: string;
          subjectId: string;
        }): unknown;
        findServiceAdminSessionByAccessToken(accessToken: string): unknown;
        revokeServiceAdminToken(input: {
          idempotencyKey: string;
          revokedAt: string;
          tokenHash: string;
        }): unknown;
        rotateServiceAdminRefreshToken(input: {
          idempotencyKey: string;
          nextAccessTokenExpiresAt: string;
          nextAccessTokenHash: string;
          nextRefreshTokenExpiresAt: string;
          nextRefreshTokenHash: string;
          refreshTokenHash: string;
          rotatedAt: string;
        }): unknown;
      };
      const repository = IdentityRepository.open({ filePath }) as TokenLifecycleRepository;
      const session = await repository.createServiceAdminSession({
        actorId: "svc-admin-token",
        actorName: "Token Admin",
        allowedActions: ["tenants.manage"],
        mfaVerified: true,
        ttlMinutes: 30
      });

      await repository.createServiceAdminTokenPair({
        accessTokenExpiresAt: "2035-06-29T11:00:00.000Z",
        accessTokenHash: hashServiceAdminTokenForTest("access-token-1"),
        id: "sat_pair_1",
        issuedAt: "2026-06-29T10:00:00.000Z",
        refreshTokenExpiresAt: "2035-07-29T10:00:00.000Z",
        refreshTokenHash: hashServiceAdminTokenForTest("refresh-token-1"),
        sessionId: session.id,
        subjectId: "svc-admin-token"
      });

      const secondRepository = IdentityRepository.open({ filePath }) as TokenLifecycleRepository;
      const bearerDecision = resolveServiceAdminContext({
        headers: { authorization: "Bearer access-token-1" },
        requiredAction: "tenants.manage",
        sessionLookup: (accessToken) => secondRepository.findServiceAdminSessionByAccessToken(accessToken) as ReturnType<IdentityRepository["findServiceAdminSession"]>
      });
      assert.equal(bearerDecision.allowed, true);
      assert.equal(bearerDecision.sessionId, session.id);

      const rotated = await secondRepository.rotateServiceAdminRefreshToken({
        idempotencyKey: "rotate-token-1",
        nextAccessTokenExpiresAt: "2035-06-29T11:05:00.000Z",
        nextAccessTokenHash: hashServiceAdminTokenForTest("access-token-2"),
        nextRefreshTokenExpiresAt: "2035-07-29T10:05:00.000Z",
        nextRefreshTokenHash: hashServiceAdminTokenForTest("refresh-token-2"),
        refreshTokenHash: hashServiceAdminTokenForTest("refresh-token-1"),
        rotatedAt: "2026-06-29T10:05:00.000Z"
      }) as Record<string, unknown>;
      const duplicateRotate = await secondRepository.rotateServiceAdminRefreshToken({
        idempotencyKey: "rotate-token-1",
        nextAccessTokenExpiresAt: "2035-06-29T11:05:00.000Z",
        nextAccessTokenHash: hashServiceAdminTokenForTest("access-token-2"),
        nextRefreshTokenExpiresAt: "2035-07-29T10:05:00.000Z",
        nextRefreshTokenHash: hashServiceAdminTokenForTest("refresh-token-2"),
        refreshTokenHash: hashServiceAdminTokenForTest("refresh-token-1"),
        rotatedAt: "2026-06-29T10:05:00.000Z"
      }) as Record<string, unknown>;

      assert.equal(rotated.status, "rotated");
      assert.equal(duplicateRotate.status, "duplicate");
      assert.equal(secondRepository.findServiceAdminSessionByAccessToken("access-token-1"), undefined);
      assert.equal(Boolean(secondRepository.findServiceAdminSessionByAccessToken("access-token-2")), true);

      const revoked = await secondRepository.revokeServiceAdminToken({
        idempotencyKey: "revoke-token-2",
        revokedAt: "2026-06-29T10:06:00.000Z",
        tokenHash: hashServiceAdminTokenForTest("access-token-2")
      }) as Record<string, unknown>;
      const finalRepository = IdentityRepository.open({ filePath }) as TokenLifecycleRepository;
      const duplicateRevoke = await finalRepository.revokeServiceAdminToken({
        idempotencyKey: "revoke-token-2",
        revokedAt: "2026-06-29T10:06:00.000Z",
        tokenHash: hashServiceAdminTokenForTest("access-token-2")
      }) as Record<string, unknown>;

      assert.equal(revoked.status, "revoked");
      assert.equal(duplicateRevoke.status, "duplicate");
      assert.equal(finalRepository.findServiceAdminSessionByAccessToken("access-token-2"), undefined);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("does not reuse service-admin token revoke idempotency keys for different active tokens", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity-token-revoke-conflict.json");
      type TokenLifecycleRepository = IdentityRepository & {
        createServiceAdminTokenPair(input: {
          accessTokenExpiresAt: string;
          accessTokenHash: string;
          id: string;
          issuedAt: string;
          refreshTokenExpiresAt: string;
          refreshTokenHash: string;
          sessionId: string;
          subjectId: string;
        }): unknown;
        findServiceAdminSessionByAccessToken(accessToken: string): unknown;
        revokeServiceAdminToken(input: {
          idempotencyKey: string;
          revokedAt: string;
          tokenHash: string;
        }): unknown;
      };
      const repository = IdentityRepository.open({ filePath }) as TokenLifecycleRepository;
      const firstSession = await repository.createServiceAdminSession({
        actorId: "svc-admin-first-token",
        actorName: "First Token Admin",
        allowedActions: ["tenants.manage"],
        mfaVerified: true,
        ttlMinutes: 30
      });
      const secondSession = await repository.createServiceAdminSession({
        actorId: "svc-admin-second-token",
        actorName: "Second Token Admin",
        allowedActions: ["tenants.manage"],
        mfaVerified: true,
        ttlMinutes: 30
      });

      await repository.createServiceAdminTokenPair({
        accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
        accessTokenHash: hashServiceAdminTokenForTest("revoke-access-1"),
        id: "sat_pair_revoke_1",
        issuedAt: "2026-06-29T10:00:00.000Z",
        refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z",
        refreshTokenHash: hashServiceAdminTokenForTest("revoke-refresh-1"),
        sessionId: firstSession.id,
        subjectId: "svc-admin-first-token"
      });
      await repository.createServiceAdminTokenPair({
        accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
        accessTokenHash: hashServiceAdminTokenForTest("revoke-access-2"),
        id: "sat_pair_revoke_2",
        issuedAt: "2026-06-29T10:00:00.000Z",
        refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z",
        refreshTokenHash: hashServiceAdminTokenForTest("revoke-refresh-2"),
        sessionId: secondSession.id,
        subjectId: "svc-admin-second-token"
      });

      const revoked = await repository.revokeServiceAdminToken({
        idempotencyKey: "revoke-reused-key",
        revokedAt: "2026-06-29T10:06:00.000Z",
        tokenHash: hashServiceAdminTokenForTest("revoke-access-1")
      }) as Record<string, unknown>;
      const conflict = await repository.revokeServiceAdminToken({
        idempotencyKey: "revoke-reused-key",
        revokedAt: "2026-06-29T10:07:00.000Z",
        tokenHash: hashServiceAdminTokenForTest("revoke-access-2")
      });

      assert.equal(revoked.status, "revoked");
      assert.equal(conflict, undefined);
      assert.equal(repository.findServiceAdminSessionByAccessToken("revoke-access-1"), undefined);
      assert.equal(Boolean(repository.findServiceAdminSessionByAccessToken("revoke-access-2")), true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("rejects service-admin token hash reuse during create and rotate", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity-token-hash-conflict.json");
      type TokenLifecycleRepository = IdentityRepository & {
        createServiceAdminTokenPair(input: {
          accessTokenExpiresAt: string;
          accessTokenHash: string;
          id: string;
          issuedAt: string;
          refreshTokenExpiresAt: string;
          refreshTokenHash: string;
          sessionId: string;
          subjectId: string;
        }): unknown;
        findServiceAdminSessionByAccessToken(accessToken: string): unknown;
        revokeServiceAdminToken(input: {
          idempotencyKey: string;
          revokedAt: string;
          tokenHash: string;
        }): unknown;
        rotateServiceAdminRefreshToken(input: {
          idempotencyKey: string;
          nextAccessTokenExpiresAt: string;
          nextAccessTokenHash: string;
          nextRefreshTokenExpiresAt: string;
          nextRefreshTokenHash: string;
          refreshTokenHash: string;
          rotatedAt: string;
        }): unknown;
      };
      const repository = IdentityRepository.open({ filePath }) as TokenLifecycleRepository;
      const firstSession = await repository.createServiceAdminSession({
        actorId: "svc-admin-hash-first",
        actorName: "Hash First Admin",
        allowedActions: ["tenants.manage"],
        mfaVerified: true,
        ttlMinutes: 30
      });
      const secondSession = await repository.createServiceAdminSession({
        actorId: "svc-admin-hash-second",
        actorName: "Hash Second Admin",
        allowedActions: ["tenants.manage"],
        mfaVerified: true,
        ttlMinutes: 30
      });

      await repository.createServiceAdminTokenPair({
        accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
        accessTokenHash: hashServiceAdminTokenForTest("hash-conflict-access-1"),
        id: "sat_pair_hash_1",
        issuedAt: "2026-06-29T10:00:00.000Z",
        refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z",
        refreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-1"),
        sessionId: firstSession.id,
        subjectId: "svc-admin-hash-first"
      });
      await repository.createServiceAdminTokenPair({
        accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
        accessTokenHash: hashServiceAdminTokenForTest("hash-conflict-access-2"),
        id: "sat_pair_hash_2",
        issuedAt: "2026-06-29T10:00:00.000Z",
        refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z",
        refreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-2"),
        sessionId: secondSession.id,
        subjectId: "svc-admin-hash-second"
      });

      assert.throws(
        () => repository.createServiceAdminTokenPair({
          accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
          accessTokenHash: hashServiceAdminTokenForTest("same-secret"),
          id: "sat_pair_same_secret",
          issuedAt: "2026-06-29T10:01:00.000Z",
          refreshTokenExpiresAt: "2099-07-29T10:01:00.000Z",
          refreshTokenHash: hashServiceAdminTokenForTest("same-secret"),
          sessionId: secondSession.id,
          subjectId: "svc-admin-hash-second"
        }),
        /token hash conflict/
      );
      assert.throws(
        () => repository.createServiceAdminTokenPair({
          accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
          accessTokenHash: hashServiceAdminTokenForTest("hash-conflict-access-1"),
          id: "sat_pair_hash_conflict",
          issuedAt: "2026-06-29T10:01:00.000Z",
          refreshTokenExpiresAt: "2099-07-29T10:01:00.000Z",
          refreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-3"),
          sessionId: secondSession.id,
          subjectId: "svc-admin-hash-second"
        }),
        /token hash conflict/
      );
      assert.throws(
        () => repository.createServiceAdminTokenPair({
          accessTokenExpiresAt: "2099-06-29T11:05:00.000Z",
          accessTokenHash: hashServiceAdminTokenForTest("hash-conflict-access-4"),
          id: "sat_pair_hash_1",
          issuedAt: "2026-06-29T10:05:00.000Z",
          refreshTokenExpiresAt: "2099-07-29T10:05:00.000Z",
          refreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-4"),
          sessionId: secondSession.id,
          subjectId: "svc-admin-hash-second"
        }),
        /token pair id conflict/
      );

      const rotateConflict = await repository.rotateServiceAdminRefreshToken({
        idempotencyKey: "rotate-hash-conflict",
        nextAccessTokenExpiresAt: "2099-06-29T11:05:00.000Z",
        nextAccessTokenHash: hashServiceAdminTokenForTest("hash-conflict-access-2"),
        nextRefreshTokenExpiresAt: "2099-07-29T10:05:00.000Z",
        nextRefreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-3"),
        refreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-1"),
        rotatedAt: "2026-06-29T10:05:00.000Z"
      });

      assert.equal(rotateConflict, undefined);
      const firstLookup = repository.findServiceAdminSessionByAccessToken("hash-conflict-access-1") as { id: string } | undefined;
      const secondLookup = repository.findServiceAdminSessionByAccessToken("hash-conflict-access-2") as { id: string } | undefined;
      assert.equal(firstLookup?.id, firstSession.id);
      assert.equal(secondLookup?.id, secondSession.id);

      await repository.revokeServiceAdminToken({
        idempotencyKey: "revoke-hash-conflict-2",
        revokedAt: "2026-06-29T10:06:00.000Z",
        tokenHash: hashServiceAdminTokenForTest("hash-conflict-access-2")
      });
      assert.throws(
        () => repository.createServiceAdminTokenPair({
          accessTokenExpiresAt: "2099-06-29T11:10:00.000Z",
          accessTokenHash: hashServiceAdminTokenForTest("hash-conflict-access-2"),
          id: "sat_pair_hash_revoked_reuse",
          issuedAt: "2026-06-29T10:10:00.000Z",
          refreshTokenExpiresAt: "2099-07-29T10:10:00.000Z",
          refreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-5"),
          sessionId: firstSession.id,
          subjectId: "svc-admin-hash-first"
        }),
        /token hash conflict/
      );

      const rotated = await repository.rotateServiceAdminRefreshToken({
        idempotencyKey: "rotate-hash-unique",
        nextAccessTokenExpiresAt: "2099-06-29T11:15:00.000Z",
        nextAccessTokenHash: hashServiceAdminTokenForTest("hash-conflict-access-6"),
        nextRefreshTokenExpiresAt: "2099-07-29T10:15:00.000Z",
        nextRefreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-6"),
        refreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-1"),
        rotatedAt: "2026-06-29T10:15:00.000Z"
      }) as Record<string, unknown>;
      assert.equal(rotated.status, "rotated");
      assert.throws(
        () => repository.createServiceAdminTokenPair({
          accessTokenExpiresAt: "2099-06-29T11:20:00.000Z",
          accessTokenHash: hashServiceAdminTokenForTest("hash-conflict-access-1"),
          id: "sat_pair_hash_rotated_reuse",
          issuedAt: "2026-06-29T10:20:00.000Z",
          refreshTokenExpiresAt: "2099-07-29T10:20:00.000Z",
          refreshTokenHash: hashServiceAdminTokenForTest("hash-conflict-refresh-7"),
          sessionId: firstSession.id,
          subjectId: "svc-admin-hash-first"
        }),
        /token hash conflict/
      );
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists OIDC provider config and callback descriptors across identity instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity-oidc.json");
      type OidcRepository = IdentityRepository & {
        findOidcCallbackDescriptor(state: string): unknown;
        findOidcProviderConfig(providerId: string): unknown;
        recordOidcCallbackDescriptor(input: {
          consumedAt: string | null;
          expiresAt: string;
          id: string;
          nonceHash: string;
          providerId: string;
          redirectUri: string;
          requestedAt: string;
          state: string;
          traceId: string;
        }): unknown;
        saveOidcProviderConfig(input: {
          audience: string;
          clientId: string;
          enabled: boolean;
          issuer: string;
          jwksUri: string;
          providerId: string;
          scopes: string[];
          tenantId: string;
          updatedAt: string;
        }): unknown;
        consumeOidcCallbackDescriptor(input: {
          now?: Date;
          state: string;
        }): unknown;
      };
      const repository = IdentityRepository.open({ filePath }) as OidcRepository;

      await repository.saveOidcProviderConfig({
        audience: "support-api",
        clientId: "support-web",
        enabled: true,
        issuer: "https://idp.example.com/",
        jwksUri: "https://idp.example.com/.well-known/jwks.json",
        providerId: "oidc-main",
        scopes: ["openid", "email", "profile"],
        tenantId: "tenant-volga",
        updatedAt: "2026-06-29T12:00:00.000Z"
      });
      await repository.recordOidcCallbackDescriptor({
        consumedAt: null,
        expiresAt: "2026-06-29T12:10:00.000Z",
        id: "oidc_cb_001",
        nonceHash: "sha256:nonce-001",
        providerId: "oidc-main",
        redirectUri: "https://support.example.com/auth/oidc/callback",
        requestedAt: "2026-06-29T12:00:30.000Z",
        state: "state-oidc-001",
        traceId: "trc_oidc_callback_001"
      });

      const secondRepository = IdentityRepository.open({ filePath }) as OidcRepository;
      const provider = await secondRepository.findOidcProviderConfig("oidc-main") as Record<string, unknown> | undefined;
      const callback = await secondRepository.findOidcCallbackDescriptor("state-oidc-001") as Record<string, unknown> | undefined;

      assert.equal(provider?.issuer, "https://idp.example.com/");
      assert.deepEqual(provider?.scopes, ["openid", "email", "profile"]);
      assert.equal(callback?.providerId, "oidc-main");
      assert.equal(callback?.consumedAt, null);
      assert.throws(() => secondRepository.recordOidcCallbackDescriptor({
        consumedAt: null,
        expiresAt: "2026-06-29T12:12:00.000Z",
        id: "oidc_cb_002",
        nonceHash: "sha256:nonce-duplicate-state",
        providerId: "oidc-main",
        redirectUri: "https://support.example.com/auth/oidc/callback",
        requestedAt: "2026-06-29T12:01:00.000Z",
        state: "state-oidc-001",
        traceId: "trc_oidc_callback_duplicate_state"
      }), /OIDC callback descriptor already exists/);
      assert.throws(() => secondRepository.recordOidcCallbackDescriptor({
        consumedAt: null,
        expiresAt: "2026-06-29T12:12:00.000Z",
        id: "oidc_cb_001",
        nonceHash: "sha256:nonce-duplicate-id",
        providerId: "oidc-main",
        redirectUri: "https://support.example.com/auth/oidc/callback",
        requestedAt: "2026-06-29T12:01:30.000Z",
        state: "state-oidc-002",
        traceId: "trc_oidc_callback_duplicate_id"
      }), /OIDC callback descriptor already exists/);

      const preservedCallback = await secondRepository.findOidcCallbackDescriptor("state-oidc-001") as Record<string, unknown> | undefined;
      assert.equal(preservedCallback?.id, "oidc_cb_001");
      assert.equal(preservedCallback?.nonceHash, "sha256:nonce-001");

      const consumed = await secondRepository.consumeOidcCallbackDescriptor({
        now: new Date("2026-06-29T12:02:00.000Z"),
        state: "state-oidc-001"
      }) as Record<string, unknown>;
      assert.equal(consumed.status, "consumed");
      assert.equal((consumed.descriptor as Record<string, unknown>).consumedAt, "2026-06-29T12:02:00.000Z");

      const replay = await secondRepository.consumeOidcCallbackDescriptor({
        now: new Date("2026-06-29T12:03:00.000Z"),
        state: "state-oidc-001"
      }) as Record<string, unknown>;
      assert.equal(replay.status, "replayed");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists SAML provider metadata, ACS descriptors and assertion replay ids across identity instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity-saml.json");
      type SamlRepository = IdentityRepository & {
        consumeSamlAcsRequestDescriptor(input: { now?: Date; requestId?: string }): unknown;
        findSamlAcsRequestDescriptor(requestId: string): unknown;
        findSamlAssertionReplay(providerId: string, assertionId: string): unknown;
        findSamlProviderMetadata(providerId: string): unknown;
        recordSamlAcsRequestDescriptor(input: {
          acsUrl: string;
          consumedAt: string | null;
          expiresAt: string;
          id: string;
          providerId: string;
          relayState: string;
          requestId: string;
          requestedAt: string;
          traceId: string;
        }): unknown;
        recordSamlAssertionReplay(input: {
          assertionId: string;
          audience: string;
          expiresAt: string;
          providerId: string;
          receivedAt: string;
          requestId: string;
          subjectId: string;
          traceId: string;
        }): unknown;
        saveSamlProviderMetadata(input: {
          acsUrl: string;
          audience: string;
          certificateFingerprint: string;
          enabled: boolean;
          entityId: string;
          providerId: string;
          ssoUrl: string;
          tenantId: string;
          updatedAt: string;
        }): unknown;
      };
      const repository = IdentityRepository.open({ filePath }) as SamlRepository;

      await repository.saveSamlProviderMetadata({
        acsUrl: "https://support.example.com/auth/saml/acs",
        audience: "support-api",
        certificateFingerprint: "sha256:saml-cert-001",
        enabled: true,
        entityId: "https://idp.example.com/saml/metadata",
        providerId: "saml-main",
        ssoUrl: "https://idp.example.com/saml/sso",
        tenantId: "tenant-volga",
        updatedAt: "2026-06-29T13:00:00.000Z"
      });
      await repository.recordSamlAcsRequestDescriptor({
        acsUrl: "https://support.example.com/auth/saml/acs",
        consumedAt: null,
        expiresAt: "2026-06-29T13:10:00.000Z",
        id: "saml_acs_001",
        providerId: "saml-main",
        relayState: "relay-state-001",
        requestId: "saml-request-001",
        requestedAt: "2026-06-29T13:00:30.000Z",
        traceId: "trc_saml_acs_001"
      });
      await repository.recordSamlAssertionReplay({
        assertionId: "assertion-001",
        audience: "support-api",
        expiresAt: "2026-06-29T13:15:00.000Z",
        providerId: "saml-main",
        receivedAt: "2026-06-29T13:02:00.000Z",
        requestId: "saml-request-001",
        subjectId: "svc-admin-001",
        traceId: "trc_saml_assertion_001"
      });

      const secondRepository = IdentityRepository.open({ filePath }) as SamlRepository;
      const provider = await secondRepository.findSamlProviderMetadata("saml-main") as Record<string, unknown> | undefined;
      const acs = await secondRepository.findSamlAcsRequestDescriptor("saml-request-001") as Record<string, unknown> | undefined;
      const replay = await secondRepository.findSamlAssertionReplay("saml-main", "assertion-001") as Record<string, unknown> | undefined;

      assert.equal(provider?.entityId, "https://idp.example.com/saml/metadata");
      assert.equal(provider?.certificateFingerprint, "sha256:saml-cert-001");
      assert.equal(acs?.providerId, "saml-main");
      assert.equal(acs?.consumedAt, null);
      assert.equal(replay?.subjectId, "svc-admin-001");
      assert.equal(replay?.requestId, "saml-request-001");

      const consumed = await secondRepository.consumeSamlAcsRequestDescriptor({
        now: new Date("2026-06-29T13:02:00.000Z"),
        requestId: "saml-request-001"
      }) as Record<string, unknown>;
      assert.equal(consumed.status, "consumed");
      assert.equal((consumed.descriptor as Record<string, unknown>).consumedAt, "2026-06-29T13:02:00.000Z");

      const acsAfterConsume = await secondRepository.findSamlAcsRequestDescriptor("saml-request-001") as Record<string, unknown> | undefined;
      assert.equal(acsAfterConsume?.consumedAt, "2026-06-29T13:02:00.000Z");

      const acsReplay = await secondRepository.consumeSamlAcsRequestDescriptor({
        now: new Date("2026-06-29T13:03:00.000Z"),
        requestId: "saml-request-001"
      }) as Record<string, unknown>;
      assert.equal(acsReplay.status, "replayed");

      assert.throws(() => secondRepository.recordSamlAcsRequestDescriptor({
        acsUrl: "https://support.example.com/auth/saml/acs",
        consumedAt: null,
        expiresAt: "2026-06-29T13:11:00.000Z",
        id: "saml_acs_001",
        providerId: "saml-main",
        relayState: "relay-state-duplicate-id",
        requestId: "saml-request-duplicate-id",
        requestedAt: "2026-06-29T13:04:00.000Z",
        traceId: "trc_saml_acs_duplicate_id"
      }), /SAML ACS request descriptor already exists/);
      assert.throws(() => secondRepository.recordSamlAcsRequestDescriptor({
        acsUrl: "https://support.example.com/auth/saml/acs",
        consumedAt: null,
        expiresAt: "2026-06-29T13:11:00.000Z",
        id: "saml_acs_duplicate_request",
        providerId: "saml-main",
        relayState: "relay-state-duplicate-request",
        requestId: "saml-request-001",
        requestedAt: "2026-06-29T13:04:30.000Z",
        traceId: "trc_saml_acs_duplicate_request"
      }), /SAML ACS request descriptor already exists/);
      assert.throws(() => secondRepository.recordSamlAcsRequestDescriptor({
        acsUrl: "https://support.example.com/auth/saml/acs",
        consumedAt: null,
        expiresAt: "2026-06-29T13:11:00.000Z",
        id: "saml_acs_duplicate_relay",
        providerId: "saml-main",
        relayState: "relay-state-001",
        requestId: "saml-request-duplicate-relay",
        requestedAt: "2026-06-29T13:05:00.000Z",
        traceId: "trc_saml_acs_duplicate_relay"
      }), /SAML ACS request descriptor already exists/);
      assert.throws(() => secondRepository.recordSamlAssertionReplay({
        assertionId: "assertion-001",
        audience: "support-api",
        expiresAt: "2026-06-29T13:20:00.000Z",
        providerId: "saml-main",
        receivedAt: "2026-06-29T13:03:00.000Z",
        requestId: "saml-request-001",
        subjectId: "svc-admin-001",
        traceId: "trc_saml_assertion_duplicate"
      }), /SAML assertion replay already exists/);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists RBAC policy versions, role grants and tenant permission denial rows across identity instances", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity-rbac.json");
      type RbacRepository = IdentityRepository & {
        getActiveRbacPolicyVersion(): unknown;
        listPermissionDenialEvents(input?: { tenantId?: string }): unknown;
        listRbacRoleGrants(input?: { policyVersionId?: string; roleKey?: string; tenantId?: string | null }): unknown;
        recordPermissionDenialEvent(input: Record<string, unknown>): unknown;
        recordRbacRoleGrant(input: Record<string, unknown>): unknown;
        saveRbacPolicyVersion(input: Record<string, unknown>): unknown;
      };
      const repository = IdentityRepository.open({ filePath }) as RbacRepository;

      await repository.saveRbacPolicyVersion({
        activatedAt: "2026-06-29T14:00:00.000Z",
        checksum: "sha256:rbac-policy-volga",
        createdAt: "2026-06-29T14:00:00.000Z",
        createdBy: "svc-admin-001",
        description: "Tenant-scoped RBAC policy",
        id: "rbac-policy-volga",
        status: "active",
        version: "2026.06.29-volga"
      });
      await repository.recordRbacRoleGrant({
        action: "settings.manage",
        createdAt: "2026-06-29T14:01:00.000Z",
        createdBy: "svc-admin-001",
        effect: "allow",
        id: "rbac-grant-volga-admin-settings",
        policyVersionId: "rbac-policy-volga",
        resource: "settings",
        roleKey: "admin",
        tenantId: "tenant-volga",
        traceId: "trc_rbac_grant_volga"
      });
      await repository.recordPermissionDenialEvent({
        action: "settings.manage",
        actorId: "svc-admin-001",
        at: "2026-06-29T14:02:00.000Z",
        id: "rbac-denial-aurora-settings",
        immutable: true,
        policyVersionId: "rbac-policy-volga",
        reason: "No tenant-scoped grant matched.",
        resource: "settings",
        roleKey: "admin",
        tenantId: "tenant-aurora",
        traceId: "trc_rbac_denial_aurora"
      });

      const secondRepository = IdentityRepository.open({ filePath }) as RbacRepository;
      const active = await secondRepository.getActiveRbacPolicyVersion() as Record<string, unknown> | undefined;
      const grants = await secondRepository.listRbacRoleGrants({ policyVersionId: "rbac-policy-volga", roleKey: "admin" }) as Array<Record<string, unknown>>;
      const denials = await secondRepository.listPermissionDenialEvents({ tenantId: "tenant-aurora" }) as Array<Record<string, unknown>>;

      assert.equal(active?.id, "rbac-policy-volga");
      assert.equal(grants.length, 1);
      assert.equal(grants[0].tenantId, "tenant-volga");
      assert.equal(denials.length, 1);
      assert.equal(denials[0].id, "rbac-denial-aurora-settings");
      assert.equal(denials[0].immutable, true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("retires the previous JSON-backed active RBAC policy when a new policy is activated", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "identity-rbac-active-policy.json");
      type RbacRepository = IdentityRepository & {
        getActiveRbacPolicyVersion(): unknown;
        saveRbacPolicyVersion(input: Record<string, unknown>): unknown;
      };
      const repository = IdentityRepository.open({ filePath }) as RbacRepository;

      await repository.saveRbacPolicyVersion({
        activatedAt: "2026-06-29T15:00:00.000Z",
        checksum: "sha256:rbac-policy-next",
        createdAt: "2026-06-29T15:00:00.000Z",
        createdBy: "svc-admin-001",
        description: "Next active RBAC policy",
        id: "rbac-policy-next",
        status: "active",
        version: "2026.06.29-next"
      });

      const active = await repository.getActiveRbacPolicyVersion() as Record<string, unknown> | undefined;
      const state = JSON.parse(readFileSync(filePath, "utf8")) as {
        rbacPolicyVersions: Array<{ id: string; status: string }>;
      };

      assert.equal(active?.id, "rbac-policy-next");
      assert.equal(state.rbacPolicyVersions.filter((policy) => policy.status === "active").length, 1);
      assert.equal(state.rbacPolicyVersions.find((policy) => policy.id === "rbac-policy-default")?.status, "retired");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("bootstraps the default identity repository from a durable runtime store file", () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-identity.json");
      configureIdentityRepository({ IDENTITY_STORE_FILE: filePath }, { seed: bootstrapIdentityState() });
      const first = IdentityRepository.default();
      const session = first.createServiceAdminSession({
        actorId: "runtime-admin",
        actorName: "Runtime Admin",
        adminEmail: "runtime-admin@example.com",
        allowedActions: ["tenants.manage"],
        availableOrganizations: [{ id: "tenant-volga", name: "Volga Logistics", role: "service_admin" }],
        currentTenantId: "tenant-volga",
        mfaVerified: true,
        ttlMinutes: 30
      });

      configureIdentityRepository({ IDENTITY_STORE_FILE: filePath });
      const second = IdentityRepository.default();
      assert.equal(second.findServiceAdminSession(session.id)?.actorId, "runtime-admin");
      assert.equal(existsSync(filePath), true);
      assert.ok(second.listTenants().some((tenant) => tenant.id === "tenant-volga"));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("bootstraps the default billing repository from a durable runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-billing.json");
      configureBillingRepository({ BILLING_STORE_FILE: filePath }, { seed: bootstrapBillingState() });
      const first = new BillingService();

      const applied = await first.changeTenantTariff({
        confirmed: true,
        confirmationText: "CHANGE tenant-lumen TO business",
        nextPlanId: "business",
        reason: "Runtime billing persistence",
        tenantId: "tenant-lumen"
      });
      assert.equal(applied.status, "ok");

      configureBillingRepository({ BILLING_STORE_FILE: filePath });
      const second = new BillingService();
      const snapshot = await second.fetchTenantQuotaSnapshot("tenant-lumen");
      assert.equal(snapshot.data.tenant.planId, "business");
      assert.equal(existsSync(filePath), true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("bootstraps the default conversation repository from a durable runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-conversation.json");
      configureConversationRepository({ CONVERSATION_STORE_FILE: filePath }, { seed: bootstrapConversationState() });
      const first = new ConversationService();

      const reply = await first.appendMessage({
        conversationId: "maria",
        mode: "reply",
        text: "Runtime conversation persistence"
      });
      assert.equal(reply.status, "ok");

      configureConversationRepository({ CONVERSATION_STORE_FILE: filePath });
      const second = new ConversationService();
      const detail = await second.fetchDialogDetail("maria");

      assert.equal(existsSync(filePath), true);
      assert.ok((detail.data.messages as Array<Record<string, unknown>>).some((message) => message.text === "Runtime conversation persistence"));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ConversationRepository.useDefault(ConversationRepository.inMemory());
    }
  });

  it("bootstraps durable workspace file metadata from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-workspace.json");
      configureWorkspaceRepository({ WORKSPACE_STORE_FILE: filePath });
      const first = new WorkspaceService();

      const upload = await first.createUploadDescriptor({
        channel: "SDK",
        fileName: "runtime-map.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096
      }, { tenantId: "tenant-volga" });
      assert.equal(upload.status, "ok");
      const finalized = await first.finalizeUpload({
        checksum: "sha256-runtime",
        fileId: String(upload.data.fileId)
      });
      assert.equal(finalized.status, "ok");

      configureWorkspaceRepository({ WORKSPACE_STORE_FILE: filePath }, { seed: bootstrapWorkspaceState() });
      const second = new WorkspaceService();
      const denied = await second.getDownloadPolicy(String(upload.data.fileId));
      const scanPending = await second.getDownloadPolicy(String(upload.data.fileId), { canDownload: true });

      assert.equal(existsSync(filePath), true);
      assert.equal(denied.status, "denied");
      assert.equal(denied.error?.code, "file_permission_denied");
      assert.equal(scanPending.status, "denied");
      assert.equal(scanPending.error?.code, "file_not_ready");
      assert.equal(scanPending.data.fileId, upload.data.fileId);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      WorkspaceRepository.useDefault(WorkspaceRepository.inMemory());
    }
  });

  it("bootstraps durable workspace templates and knowledge drafts from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-workspace.json");
      configureWorkspaceRepository({ WORKSPACE_STORE_FILE: filePath }, { seed: bootstrapWorkspaceState() });
      const first = new WorkspaceService();

      const savedTemplate = await first.saveTemplate({
        channel: "SDK",
        text: "Use the durable template after restart.",
        title: "Runtime durable template",
        topic: "Delivery"
      }, { tenantId: "tenant-volga" });
      const savedDraft = await first.saveKnowledgeArticleDraft({
        articleId: "kb-delivery-tracking",
        body: "Durable runtime draft body.",
        reason: "Persist draft through restart"
      }, { tenantId: "tenant-volga" });
      assert.equal(savedTemplate.status, "ok");
      assert.equal(savedDraft.status, "ok");

      configureWorkspaceRepository({ WORKSPACE_STORE_FILE: filePath });
      const second = new WorkspaceService();
      const templates = await second.fetchTemplates({ operatorId: "operator-1" }, { tenantId: "tenant-volga" });
      const article = await second.fetchKnowledgeArticle("kb-delivery-tracking", { tenantId: "tenant-volga" });

      assert.equal(existsSync(filePath), true);
      assert.ok((templates.data.items as Array<Record<string, unknown>>).some((template) => template.id === savedTemplate.data.id));
      assert.equal(article.status, "ok");
      assert.equal(article.data.article.body, "Durable runtime draft body.");
      assert.equal(article.data.article.status, "draft");
      assert.equal(article.data.article.version, "v4.3-draft");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      WorkspaceRepository.useDefault(WorkspaceRepository.inMemory());
    }
  });

  it("bootstraps durable client profile merge descriptors from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-workspace.json");
      configureWorkspaceRepository({ WORKSPACE_STORE_FILE: filePath }, { seed: bootstrapWorkspaceState() });
      const first = new WorkspaceService();

      const merge = await first.mergeClientProfiles({
        candidateProfileId: "src_telegram_dmitry",
        primaryProfileId: "src_sdk_maria",
        reason: "Runtime duplicate client profile"
      }, { tenantId: "tenant-volga" });
      const unmerge = await first.unmergeClientProfile({
        detachedProfileId: "src_telegram_dmitry",
        primaryProfileId: "src_sdk_maria",
        reason: "Runtime profile detach"
      }, { tenantId: "tenant-volga" });
      assert.equal(merge.status, "ok");
      assert.equal(unmerge.status, "ok");

      configureWorkspaceRepository({ WORKSPACE_STORE_FILE: filePath });
      const second = new WorkspaceService();
      const profiles = await second.fetchClientProfiles({ page: 1, pageSize: 5 }, { tenantId: "tenant-volga" });
      const mergeEvents = profiles.data.mergeEvents as Array<Record<string, unknown>>;

      assert.equal(existsSync(filePath), true);
      assert.ok((profiles.data.items as Array<Record<string, unknown>>).some((profile) => profile.sourceProfileId === "src_sdk_maria"));
      assert.ok(mergeEvents.some((event) => event.id === merge.data.auditEvent.id && event.action === "client.merge"));
      assert.ok(mergeEvents.some((event) => event.id === unmerge.data.auditEvent.id && event.action === "client.unmerge"));
      assert.ok(mergeEvents.every((event) => event.immutable === true));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      WorkspaceRepository.useDefault(WorkspaceRepository.inMemory());
    }
  });

  it("bootstraps durable routing assignments, SLA jobs and rescue reports from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-routing.json");
      configureRoutingRepository({ ROUTING_STORE_FILE: filePath }, { seed: bootstrapRoutingState() });
      const first = new RoutingService();
      const routingContext = { tenantId: "tenant-volga" };

      const assigned = await first.createAssignment({
        action: "assign",
        conversationId: "alexey",
        reason: "Runtime persistent assignment",
        targetOperatorId: "operator-anna"
      }, routingContext);
      const paused = await first.pauseSla({
        conversationId: "maria",
        durationMinutes: 15,
        reason: "Runtime persistent SLA pause"
      }, routingContext);
      const rescue = await first.startRescue({
        conversationId: "vladimir",
        reason: "Runtime persistent rescue"
      }, routingContext);
      const resolved = await first.resolveRescue({
        conversationId: "vladimir",
        outcome: "returned_to_queue",
        reason: "Runtime persistent rescue return"
      }, routingContext);
      assert.equal(assigned.status, "ok");
      assert.equal(paused.status, "ok");
      assert.equal(rescue.status, "ok");
      assert.equal(resolved.status, "ok");

      configureRoutingRepository({ ROUTING_STORE_FILE: filePath });
      const second = new RoutingService();
      const workload = await second.fetchWorkload({ channel: "VK" }, routingContext);
      const rescueReport = await second.fetchRescueReport({ period: "today" }, routingContext);
      const routingRepository = RoutingRepository.open({ filePath });
      const jobs = await routingRepository.listJobs();

      const anna = (workload.data.operators as Array<Record<string, unknown>>).find((operator) => operator.id === "operator-anna");
      const vkQueue = (workload.data.queues as Array<Record<string, unknown>>)[0];
      assert.equal(existsSync(filePath), true);
      assert.equal(anna?.chats, 11);
      assert.equal(vkQueue.active, 26);
      assert.equal(vkQueue.waiting, 8);
      assert.ok(jobs.some((job) => job.id === assigned.data.queueJob.id && job.kind === "assignment.commit"));
      assert.ok(jobs.some((job) => job.id === paused.data.schedulerJob.id && job.action === "resume_sla"));
      assert.ok(jobs.some((job) => job.id === rescue.data.schedulerJob.id && job.action === "return_to_sla_queue"));
      assert.ok((rescueReport.data.rows as Array<Record<string, unknown>>).some((row) => row.conversationId === "vladimir" && row.outcome === "returned_to_queue"));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      RoutingRepository.clearDefault();
    }
  });

  it("bootstraps durable report exports and idempotency from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-reports.json");
      const reportRepository = configureReportRepository({ REPORT_STORE_FILE: filePath });
      for (const fixture of structuredClone(exportJobFixtures)) {
        reportRepository.saveExportJob({ ...fixture, tenantId: "tenant-volga" });
      }
      const first = new ReportService();
      const reportContext = { requesterUserId: "operator-anna", tenantId: "tenant-volga" };

      const queued = await first.requestReportExport({
        channel: "VK",
        columns: ["metric", "today", "status"],
        filters: { sla: "overdue" },
        idempotencyKey: "runtime-durable-report-export",
        period: "today",
        reportType: "SLA"
      }, reportContext);
      const retried = await first.retryReportExport({
        jobId: "export-2420",
        reason: "Runtime persistent retry"
      }, reportContext);
      assert.equal(queued.status, "ok");
      assert.equal(retried.status, "ok");

      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const second = new ReportService();
      const workspaceEnvelope = await second.fetchReportWorkspace({ channel: "VK", period: "today", reportType: "SLA" }, reportContext);
      const duplicate = await second.requestReportExport({
        channel: "VK",
        columns: ["metric", "today", "status"],
        filters: { sla: "overdue" },
        idempotencyKey: "runtime-durable-report-export",
        period: "today",
        reportType: "SLA"
      }, reportContext);
      const reusedKey = await second.requestReportExport({
        channel: "VK",
        columns: ["metric", "previous"],
        filters: { sla: "overdue" },
        idempotencyKey: "runtime-durable-report-export",
        period: "today",
        reportType: "SLA"
      }, reportContext);
      const retryAgain = await second.retryReportExport({
        jobId: "export-2420",
        reason: "Already running after restart"
      }, reportContext);
      const untouchedReadyDescriptor = await second.getExportFileDescriptor("export-2418", { canDownload: true, ...reportContext });

      const exportJobs = workspaceEnvelope.data.exportJobs as Array<Record<string, unknown>>;
      const reopenedReportRepository = ReportRepository.open({ filePath });
      const state = reopenedReportRepository.readState();

      assert.equal(existsSync(filePath), true);
      assert.ok(exportJobs.some((job) => job.id === queued.data.job.id && job.statusKey === "queued"));
      assert.ok(exportJobs.some((job) => job.id === "export-2420" && job.statusKey === "running"));
      assert.equal(duplicate.status, "ok");
      assert.equal(duplicate.data.duplicate, true);
      assert.equal(duplicate.data.job.id, queued.data.job.id);
      assert.equal(reusedKey.status, "conflict");
      assert.equal(reusedKey.error?.code, "idempotency_key_reused");
      assert.equal(retryAgain.status, "conflict");
      assert.equal(retryAgain.error?.code, "report_export_retry_not_allowed");
      assert.equal(untouchedReadyDescriptor.status, "ok");
      assert.equal(untouchedReadyDescriptor.data.jobId, "export-2418");
      assert.ok(state.idempotencyKeys.some((item) => item.key === "runtime-durable-report-export" && item.jobId === queued.data.job.id));
      assert.equal(state.exportRetryAuditEvents.length, 1);
      assert.equal(state.exportRetryAuditEvents[0].jobId, "export-2420");
      assert.equal(state.exportRetryAuditEvents[0].auditId, retried.data.auditEvent.id);
      assert.equal(state.exportRetryAuditEvents[0].previousStatusKey, "error");
      assert.equal(state.exportRetryAuditEvents[0].nextStatusKey, "running");
      assert.equal(JSON.stringify(state.exportRetryAuditEvents).includes("downloadUrl"), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("bootstraps durable saved report templates from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-report-templates.json");
      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const first = new ReportService();

      const saved = await first.saveSavedReportTemplate({
        columns: ["metric", "today", "status"],
        filters: {
          channel: "VK",
          period: "today"
        },
        ownerUserId: "spoofed-owner",
        name: "VK daily SLA",
        reportType: "SLA",
        tenantId: "spoofed-tenant"
      } as Parameters<ReportService["saveSavedReportTemplate"]>[0], {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });
      const hidden = await first.saveSavedReportTemplate({
        columns: ["metric", "previous"],
        filters: {
          channel: "VK",
          period: "yesterday"
        },
        name: "VK private for another owner",
        reportType: "SLA"
      }, {
        requesterUserId: "operator-oleg",
        tenantId: "tenant-volga"
      });

      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const second = new ReportService();
      const workspaceEnvelope = await second.fetchReportWorkspace({
        channel: "VK",
        period: "today",
        reportType: "SLA"
      }, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });
      const reportRepository = ReportRepository.open({ filePath });
      const state = reportRepository.readState();
      const savedTemplates = workspaceEnvelope.data.savedReportTemplates as Array<Record<string, unknown>>;

      assert.equal(saved.status, "ok");
      assert.equal(saved.data.template.name, "VK daily SLA");
      assert.equal(saved.data.template.ownerUserId, "operator-anna");
      assert.equal(saved.data.template.tenantId, "tenant-volga");
      assert.equal(saved.data.template.visibility.scope, "private");
      assert.equal(existsSync(filePath), true);
      assert.ok(savedTemplates.some((template) => template.id === saved.data.template.id && template.name === "VK daily SLA"));
      assert.equal(savedTemplates.some((template) => template.id === hidden.data.template.id), false);
      assert.ok(state.savedReportTemplates.some((template) => template.id === saved.data.template.id && template.tenantId === "tenant-volga"));
      assert.ok(state.savedReportTemplates.some((template) => template.id === hidden.data.template.id && template.tenantId === "tenant-volga"));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("reads role-scoped saved report templates through the runtime workspace", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-role-report-templates.json");
      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const first = new ReportService();

      const saved = await first.saveSavedReportTemplate({
        columns: ["metric", "today"],
        filters: {
          channel: "Telegram",
          period: "today"
        },
        name: "Supervisor Telegram report",
        reportType: "conversation",
        visibility: {
          roles: ["supervisor"],
          scope: "roles"
        }
      }, {
        requesterRoles: ["supervisor"],
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });

      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const second = new ReportService();
      const supervisorWorkspace = await second.fetchReportWorkspace({
      }, {
        requesterRoles: ["supervisor"],
        requesterUserId: "operator-boris",
        tenantId: "tenant-volga"
      });
      const operatorWorkspace = await second.fetchReportWorkspace({}, {
        requesterRoles: ["operator"],
        requesterUserId: "operator-oleg",
        tenantId: "tenant-volga"
      });

      const supervisorTemplates = supervisorWorkspace.data.savedReportTemplates as Array<Record<string, unknown>>;
      const operatorTemplates = operatorWorkspace.data.savedReportTemplates as Array<Record<string, unknown>>;

      assert.equal(saved.status, "ok");
      assert.equal(saved.data.template.visibility.scope, "roles");
      assert.deepEqual(saved.data.template.visibility.roles, ["supervisor"]);
      assert.ok(supervisorTemplates.some((template) => template.id === saved.data.template.id));
      assert.equal(operatorTemplates.some((template) => template.id === saved.data.template.id), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("reads permission-scoped saved report templates through the runtime workspace", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-permission-report-templates.json");
      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const first = new ReportService();

      const saved = await first.saveSavedReportTemplate({
        columns: ["metric", "today"],
        filters: {
          channel: "MAX",
          period: "today"
        },
        name: "Export permission report",
        reportType: "conversation",
        visibility: {
          permissions: ["reports.export"],
          scope: "permissions"
        }
      } as Parameters<ReportService["saveSavedReportTemplate"]>[0], {
        requesterPermissions: ["reports.write"],
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });

      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const second = new ReportService();
      const exporterWorkspace = await second.fetchReportWorkspace({}, {
        requesterPermissions: ["reports.export"],
        requesterUserId: "operator-boris",
        tenantId: "tenant-volga"
      });
      const readerWorkspace = await second.fetchReportWorkspace({}, {
        requesterPermissions: ["reports.read"],
        requesterUserId: "operator-oleg",
        tenantId: "tenant-volga"
      });

      const exporterTemplates = exporterWorkspace.data.savedReportTemplates as Array<Record<string, unknown>>;
      const readerTemplates = readerWorkspace.data.savedReportTemplates as Array<Record<string, unknown>>;

      assert.equal(saved.status, "ok");
      assert.equal(saved.data.template.visibility.scope, "permissions");
      assert.deepEqual(saved.data.template.visibility.permissions, ["reports.export"]);
      assert.ok(exporterTemplates.some((template) => template.id === saved.data.template.id));
      assert.equal(readerTemplates.some((template) => template.id === saved.data.template.id), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("denies hidden saved report template lookups without leaking template content", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-hidden-report-template-deny.json");
      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const first = new ReportService();

      const saved = await first.saveSavedReportTemplate({
        columns: ["metric", "today"],
        filters: {
          channel: "VK",
          period: "today"
        },
        name: "Private SLA escalation report",
        reportType: "SLA"
      }, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });

      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const second = new ReportService();
      const hidden = await second.getSavedReportTemplate(saved.data.template.id, {
        requesterUserId: "operator-boris",
        tenantId: "tenant-volga"
      });

      assert.equal(hidden.status, "not_found");
      assert.equal(hidden.error?.code, "saved_report_template_not_found");
      assert.equal(JSON.stringify(hidden).includes("Private SLA escalation report"), false);
      assert.equal(JSON.stringify(hidden).includes("operator-anna"), false);
      assert.equal(JSON.stringify(hidden).includes("today"), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("denies cross-tenant saved report template lookups without leaking tenant content", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-cross-tenant-report-template-deny.json");
      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const first = new ReportService();

      const saved = await first.saveSavedReportTemplate({
        columns: ["metric", "today"],
        filters: {
          channel: "Telegram",
          period: "today"
        },
        name: "Tenant Volga executive report",
        reportType: "conversation"
      }, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });

      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const second = new ReportService();
      const crossTenant = await second.getSavedReportTemplate(saved.data.template.id, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-ladoga"
      });

      assert.equal(crossTenant.status, "not_found");
      assert.equal(crossTenant.error?.code, "saved_report_template_not_found");
      assert.equal(JSON.stringify(crossTenant).includes("Tenant Volga executive report"), false);
      assert.equal(JSON.stringify(crossTenant).includes("tenant-volga"), false);
      assert.equal(JSON.stringify(crossTenant).includes("Telegram"), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("replays duplicate saved report template creates by idempotency key", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-template-duplicate-replay.json");
      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const first = new ReportService();

      const request = {
        columns: ["metric", "today", "status"],
        filters: {
          channel: "VK",
          period: "today"
        },
        idempotencyKey: "save-template-vk-today",
        name: "VK daily replay-safe report",
        reportType: "SLA"
      } as Parameters<ReportService["saveSavedReportTemplate"]>[0];
      const saved = await first.saveSavedReportTemplate(request, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });

      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const second = new ReportService();
      const duplicate = await second.saveSavedReportTemplate(request, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });
      const state = ReportRepository.open({ filePath }).readState();

      assert.equal(saved.status, "ok");
      assert.equal(duplicate.status, "ok");
      assert.equal(duplicate.data.duplicate, true);
      assert.equal(duplicate.data.template.id, saved.data.template.id);
      assert.equal(state.savedReportTemplates.filter((template) => template.name === "VK daily replay-safe report").length, 1);
      assert.ok(state.idempotencyKeys.some((item) => item.key === "saveSavedReportTemplate:save-template-vk-today" && item.jobId === saved.data.template.id));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("replays role-scoped saved report template creates without duplicating hidden templates", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-template-role-replay.json");
      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const first = new ReportService();
      const request = {
        columns: ["metric", "today"],
        idempotencyKey: "save-template-supervisor",
        name: "Supervisor replay report",
        reportType: "conversation",
        visibility: {
          roles: ["supervisor"],
          scope: "roles"
        }
      } as Parameters<ReportService["saveSavedReportTemplate"]>[0];

      const saved = await first.saveSavedReportTemplate(request, {
        requesterRoles: ["supervisor"],
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });

      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const second = new ReportService();
      const duplicate = await second.saveSavedReportTemplate(request, {
        requesterRoles: [],
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });
      const state = ReportRepository.open({ filePath }).readState();

      assert.equal(saved.status, "ok");
      assert.equal(duplicate.status, "ok");
      assert.equal(duplicate.data.duplicate, true);
      assert.equal(duplicate.data.template.id, saved.data.template.id);
      assert.equal(state.savedReportTemplates.filter((template) => template.name === "Supervisor replay report").length, 1);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("keeps saved template idempotency keys isolated from report export keys", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-template-export-idempotency-namespace.json");
      configureReportRepository({ REPORT_STORE_FILE: filePath });
      const reports = new ReportService();

      const saved = await reports.saveSavedReportTemplate({
        columns: ["metric", "today"],
        idempotencyKey: "shared-report-key",
        name: "Template with shared client key",
        reportType: "SLA"
      }, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });
      const exportRequest = await reports.requestReportExport({
        channel: "VK",
        columns: ["metric", "today"],
        idempotencyKey: "shared-report-key",
        period: "today",
        reportType: "SLA"
      }, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });
      const state = ReportRepository.open({ filePath }).readState();

      assert.equal(saved.status, "ok");
      assert.equal(exportRequest.status, "ok");
      assert.equal(exportRequest.data.duplicate, false);
      assert.ok(state.idempotencyKeys.some((item) => item.key === "saveSavedReportTemplate:shared-report-key" && item.jobId === saved.data.template.id));
      assert.ok(state.idempotencyKeys.some((item) => item.key === "shared-report-key" && item.jobId === exportRequest.data.job.id));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("rejects conflicting saved report template replays by idempotency key", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-template-conflict-replay.json");
      configureReportRepository({ REPORT_STORE_FILE: filePath }, { seed: bootstrapReportState() });
      const first = new ReportService();

      const saved = await first.saveSavedReportTemplate({
        columns: ["metric", "today"],
        filters: {
          channel: "VK",
          period: "today"
        },
        idempotencyKey: "save-template-conflict",
        name: "VK conflict-safe report",
        reportType: "SLA"
      }, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });

      configureReportRepository({ REPORT_STORE_FILE: filePath }, { seed: bootstrapReportState() });
      const second = new ReportService();
      const conflict = await second.saveSavedReportTemplate({
        columns: ["metric", "previous"],
        filters: {
          channel: "Telegram",
          period: "yesterday"
        },
        idempotencyKey: "save-template-conflict",
        name: "Telegram conflict report",
        reportType: "conversation"
      }, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-volga"
      });
      const crossTenantReplay = await second.saveSavedReportTemplate({
        columns: ["metric", "today"],
        filters: {
          channel: "VK",
          period: "today"
        },
        idempotencyKey: "save-template-conflict",
        name: "VK conflict-safe report",
        reportType: "SLA"
      }, {
        requesterUserId: "operator-anna",
        tenantId: "tenant-ladoga"
      });
      const state = ReportRepository.open({ filePath, seed: bootstrapReportState() }).readState();

      assert.equal(saved.status, "ok");
      assert.equal(conflict.status, "conflict");
      assert.equal(conflict.error?.code, "idempotency_key_reused");
      assert.equal(crossTenantReplay.status, "ok");
      assert.equal(crossTenantReplay.data.duplicate, false);
      assert.equal(state.savedReportTemplates.length, 2);
      assert.equal(state.savedReportTemplates[0].id, saved.data.template.id);
      assert.deepEqual(
        state.idempotencyKeys
          .filter((item) => item.key === "saveSavedReportTemplate:save-template-conflict")
          .map((item) => item.tenantId)
          .sort(),
        ["tenant-ladoga", "tenant-volga"]
      );
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      ReportRepository.clearDefault();
    }
  });

  it("bootstraps durable integration rotations, webhook replay journal and revoked sessions from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-integrations.json");
      configureIntegrationRepository({ INTEGRATION_STORE_FILE: filePath }, { seed: bootstrapIntegrationState() });
      const first = new IntegrationService();

      const rotated = await first.rotateApiKey("stage-key");
      const replay = await first.replayWebhookDelivery({
        deliveryId: "dlv-441",
        idempotencyKey: "runtime-webhook-replay"
      });
      const revoked = await first.revokeSecuritySession("sess-risk");
      assert.equal(rotated.status, "ok");
      assert.equal(replay.status, "ok");
      assert.equal(revoked.status, "ok");

      configureIntegrationRepository({ INTEGRATION_STORE_FILE: filePath }, { seed: bootstrapIntegrationState() });
      const second = new IntegrationService();
      const workspaceEnvelope = await second.fetchIntegrationWorkspace();
      const duplicateReplay = await second.replayWebhookDelivery({
        deliveryId: "dlv-441",
        idempotencyKey: "runtime-webhook-replay"
      });
      const repository = IntegrationRepository.open({ filePath, seed: bootstrapIntegrationState() });
      const state = repository.readState();

      const riskSession = (workspaceEnvelope.data.activeSecuritySessions as Array<Record<string, unknown>>).find((session) => session.id === "sess-risk");
      const activeSessionIds = (workspaceEnvelope.data.activeSecuritySessions as Array<Record<string, unknown>>).map((session) => session.id);
      assert.equal(existsSync(filePath), true);
      assert.deepEqual(activeSessionIds.sort(), ["sess-anna", "sess-ivan", "sess-risk"]);
      assert.equal(riskSession?.status, "revoked");
      assert.equal(duplicateReplay.status, "ok");
      assert.equal(duplicateReplay.data.duplicate, true);
      assert.equal(duplicateReplay.data.replayId, replay.data.replayId);
      assert.ok(state.apiKeyRotationJobs.some((job) => job.keyId === "stage-key" && job.rotationId === rotated.data.rotationId));
      assert.ok(state.webhookReplayJournal.some((item) => item.idempotencyKey === "runtime-webhook-replay" && item.replayId === replay.data.replayId));
      assert.deepEqual(state.webhookReplayAuditEvents.map((event) => event.action), ["webhook.replay.queued", "webhook.replay.duplicate"]);
      assert.ok(state.webhookReplayAuditEvents.every((event) => event.immutable === true && event.replayId === replay.data.replayId));
      assert.equal(state.webhookReplayAuditEvents[1]?.transition, "duplicate");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      IntegrationRepository.clearDefault();
    }
  });

  it("bootstraps durable automation publishes, proactive rules and bot test runs from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-automation.json");
      configureAutomationRepository({ AUTOMATION_STORE_FILE: filePath });
      const first = new AutomationService();

      const published = await first.publishBotScenario({
        id: "bot-persistent",
        name: "Persistent bot",
        channels: ["SDK"],
        flowNodes: [{ id: "start", type: "message" }],
        flowEdges: [],
        idempotencyKey: "persistent-bot-publish"
      }, { tenantId: "tenant-demo" });
      const testRun = await first.testBotScenario({
        id: "bot-persistent",
        name: "Persistent bot",
        testCases: [{ id: "happy-path", expected: "handoff" }]
      }, { tenantId: "tenant-demo" });
      const proactive = await first.saveProactiveRule({
        id: "rule-persistent",
        channels: ["VK"],
        activeVariant: "B",
        cooldown: "12h",
        segment: "returning"
      }, { tenantId: "tenant-demo" });
      assert.equal(published.status, "ok");
      assert.equal(testRun.status, "ok");
      assert.equal(proactive.status, "ok");

      configureAutomationRepository({ AUTOMATION_STORE_FILE: filePath });
      const second = new AutomationService();
      const workspaceEnvelope = await second.fetchAutomationWorkspace({ tenantId: "tenant-demo" });
      const duplicate = await second.publishBotScenario({
        id: "bot-persistent",
        name: "Persistent bot",
        channels: ["SDK"],
        flowNodes: [{ id: "start", type: "message" }],
        flowEdges: [],
        idempotencyKey: "persistent-bot-publish"
      }, { tenantId: "tenant-demo" });
      const repository = AutomationRepository.open({ filePath });
      const state = repository.readState();

      const scenarios = workspaceEnvelope.data.botScenarios as Array<Record<string, unknown>>;
      const rules = workspaceEnvelope.data.proactiveRules as Array<Record<string, unknown>>;
      assert.equal(existsSync(filePath), true);
      assert.ok(scenarios.some((scenario) => scenario.id === "bot-persistent" && scenario.status === "published"));
      assert.ok(rules.some((rule) => rule.id === "rule-persistent" && rule.activeVariant === "B"));
      assert.equal(duplicate.status, "ok");
      assert.equal(duplicate.data.duplicate, true);
      assert.equal(duplicate.data.runtimeVersion, published.data.runtimeVersion);
      assert.ok(state.botTestRuns.some((run) => run.testRunId === testRun.data.testRunId && run.scenarioId === "bot-persistent"));
      assert.ok(state.publishIdempotencyKeys.some((item) => item.key === "persistent-bot-publish" && item.result.runtimeVersion === published.data.runtimeVersion));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      AutomationRepository.clearDefault();
    }
  });

  it("persists JSON bot scenarios with tenant and timestamp parity across repository reopen", () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "automation-scenarios.json");
      const first = AutomationRepository.open({ filePath });

      first.saveBotScenario({
        channels: ["SDK"],
        flowEdges: [{ from: "start", to: "handoff" }],
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { id: "handoff", title: "Handoff", type: "handoff" }
        ],
        id: "bot-json-parity",
        name: "JSON parity bot",
        schemaVersion: "bot-flow/v1",
        status: "draft",
        tenantId: "tenant-demo"
      });

      const second = AutomationRepository.open({ filePath });
      const found = second.findBotScenario("bot-json-parity") as Record<string, unknown> | undefined;
      const state = JSON.parse(readFileSync(filePath, "utf8")) as {
        botScenarios: Array<Record<string, unknown>>;
      };
      const [persisted] = state.botScenarios.filter((scenario) => scenario.id === "bot-json-parity");

      assert.equal(found?.tenantId, "tenant-demo");
      assert.match(String(found?.createdAt), /^\d{4}-\d{2}-\d{2}T/);
      assert.match(String(found?.updatedAt), /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(persisted?.tenantId, "tenant-demo");
      assert.equal(persisted?.createdAt, found?.createdAt);
      assert.equal(persisted?.updatedAt, found?.updatedAt);

      const originalCreatedAt = String(found?.createdAt);
      const originalUpdatedAt = String(found?.updatedAt);
      second.saveBotScenario({
        channels: ["SDK", "Telegram"],
        createdAt: "2026-01-01T00:00:00.000Z",
        flowEdges: [{ from: "start", to: "handoff" }],
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { id: "handoff", title: "Handoff", type: "handoff" }
        ],
        id: "bot-json-parity",
        name: "JSON parity bot updated",
        schemaVersion: "bot-flow/v1",
        status: "published",
        tenantId: "tenant-demo"
      });
      const updated = second.findBotScenario("bot-json-parity") as Record<string, unknown> | undefined;

      assert.equal(updated?.tenantId, "tenant-demo");
      assert.equal(updated?.createdAt, originalCreatedAt);
      assert.notEqual(updated?.updatedAt, originalUpdatedAt);
      assert.equal(updated?.status, "published");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      AutomationRepository.clearDefault();
    }
  });

  it("persists JSON bot scenario versions with tenant parity across repository reopen", () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "automation-scenario-versions.json");
      const first = AutomationRepository.open({ filePath });

      first.saveBotScenarioVersion({
        createdAt: "2026-06-30T16:00:00.000Z",
        flowEdges: [{ from: "start", to: "handoff" }],
        flowNodes: [
          { id: "start", title: "Start", type: "message" },
          { id: "handoff", title: "Handoff", type: "handoff" }
        ],
        scenarioId: "bot-version-json-parity",
        status: "draft",
        tenantId: "tenant-demo",
        versionId: "bot-version-json-parity-v1"
      });

      const second = AutomationRepository.open({ filePath });
      const found = second.findBotScenarioVersion("bot-version-json-parity-v1") as Record<string, unknown> | undefined;
      const state = JSON.parse(readFileSync(filePath, "utf8")) as {
        botScenarioVersions: Array<Record<string, unknown>>;
      };
      const [persisted] = state.botScenarioVersions.filter((version) => version.versionId === "bot-version-json-parity-v1");

      assert.equal(found?.tenantId, "tenant-demo");
      assert.equal(found?.createdAt, "2026-06-30T16:00:00.000Z");
      assert.equal(persisted?.tenantId, "tenant-demo");
      assert.equal(persisted?.createdAt, found?.createdAt);

      const duplicate = second.saveBotScenarioVersion({
        createdAt: "2026-01-01T00:00:00.000Z",
        flowEdges: [{ from: "changed", to: "handoff" }],
        flowNodes: [{ id: "changed", title: "Changed", type: "message" }],
        scenarioId: "bot-version-json-parity",
        status: "published",
        tenantId: "tenant-demo",
        versionId: "bot-version-json-parity-v1"
      } as Parameters<AutomationRepository["saveBotScenarioVersion"]>[0]);
      const listed = second.listBotScenarioVersions("bot-version-json-parity") as Array<Record<string, unknown>>;

      assert.equal(duplicate.tenantId, "tenant-demo");
      assert.equal(duplicate.createdAt, "2026-06-30T16:00:00.000Z");
      assert.equal(duplicate.status, "draft");
      assert.deepEqual(listed.map((version) => version.versionId), ["bot-version-json-parity-v1"]);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      AutomationRepository.clearDefault();
    }
  });

  it("persists JSON bot publish audit rows with tenant and immutable parity across repository reopen", () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "automation-publish-audit.json");
      const first = AutomationRepository.open({ filePath });

      first.saveBotPublishAuditEvent({
        action: "bot.publish",
        actor: "automation-admin",
        auditId: "evt_bot_publish_json_001",
        createdAt: "2026-06-30T16:20:00.000Z",
        idempotencyKey: "publish-audit-json",
        immutable: true,
        runtimeVersion: "runtime-bot-json-v1",
        scenarioId: "bot-publish-json",
        tenantId: "tenant-demo",
        versionId: "bot-publish-json-v1"
      });

      const second = AutomationRepository.open({ filePath });
      const found = second.findBotPublishAuditEvent("evt_bot_publish_json_001") as Record<string, unknown> | undefined;
      const state = JSON.parse(readFileSync(filePath, "utf8")) as {
        botPublishAuditEvents: Array<Record<string, unknown>>;
      };
      const [persisted] = state.botPublishAuditEvents.filter((event) => event.auditId === "evt_bot_publish_json_001");

      assert.equal(found?.tenantId, "tenant-demo");
      assert.equal(found?.immutable, true);
      assert.equal(found?.createdAt, "2026-06-30T16:20:00.000Z");
      assert.equal(persisted?.tenantId, "tenant-demo");
      assert.equal(persisted?.immutable, true);
      assert.equal(persisted?.createdAt, found?.createdAt);

      const duplicateKey = second.saveBotPublishAuditEvent({
        action: "bot.publish",
        actor: "changed-admin",
        auditId: "evt_bot_publish_json_002",
        createdAt: "2026-01-01T00:00:00.000Z",
        idempotencyKey: "publish-audit-json",
        immutable: true,
        runtimeVersion: "runtime-bot-json-v2",
        scenarioId: "bot-publish-json",
        tenantId: "tenant-demo",
        versionId: "bot-publish-json-v1"
      } as Parameters<AutomationRepository["saveBotPublishAuditEvent"]>[0]);
      const listed = second.listBotPublishAuditEvents("bot-publish-json") as Array<Record<string, unknown>>;

      assert.equal(duplicateKey.auditId, "evt_bot_publish_json_001");
      assert.equal(duplicateKey.tenantId, "tenant-demo");
      assert.equal(duplicateKey.runtimeVersion, "runtime-bot-json-v1");
      assert.deepEqual(listed.map((event) => event.auditId), ["evt_bot_publish_json_001"]);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      AutomationRepository.clearDefault();
    }
  });

  it("bootstraps durable platform acknowledgements, incident updates and feature flag rollout state from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-platform.json");
      configurePlatformRepository({ PLATFORM_STORE_FILE: filePath }, { seed: bootstrapPlatformState() });
      const firstPlatform = new PlatformMonitoringService();
      const firstIncidents = new IncidentService();
      const firstFlags = new FeatureFlagService();

      const acknowledged = await firstPlatform.acknowledgeComponentAlert({
        componentId: "cmp-webhooks",
        confirmed: true,
        reason: "Persistent platform acknowledgement"
      });
      const incidentUpdate = await firstIncidents.addIncidentUpdate({
        incidentId: "inc-webhook-retry",
        idempotencyKey: "persistent-incident-update",
        message: "Webhook delivery delay is persistently monitored.",
        reason: "Persistent incident update",
        confirmed: true,
        status: "resolved"
      });
      const flagUpdate = await firstFlags.updateFeatureFlag({
        flagId: "flag-billing-v2",
        nextRollout: 55,
        nextStatus: "gradual",
        reason: "Persistent rollout update",
        confirmed: true
      });
      assert.equal(acknowledged.status, "ok");
      assert.equal(incidentUpdate.status, "ok");
      assert.equal(flagUpdate.status, "ok");

      configurePlatformRepository({ PLATFORM_STORE_FILE: filePath }, { seed: bootstrapPlatformState() });
      const secondPlatform = new PlatformMonitoringService();
      const secondIncidents = new IncidentService();
      const secondFlags = new FeatureFlagService();
      const duplicateIncident = await secondIncidents.addIncidentUpdate({
        incidentId: "inc-webhook-retry",
        idempotencyKey: "persistent-incident-update",
        message: "Webhook delivery delay is persistently monitored.",
        reason: "Persistent incident update",
        confirmed: true,
        status: "resolved"
      });
      const platformDrilldown = await secondPlatform.fetchComponentDrilldown("cmp-webhooks");
      const incidentDetail = await secondIncidents.fetchIncidentDetail("inc-webhook-retry");
      const flagList = await secondFlags.fetchFeatureFlags({ query: "billing" });
      const repository = PlatformRepository.open({ filePath, seed: bootstrapPlatformState() });
      const state = repository.readState();

      const billingFlag = (flagList.data.items as Array<Record<string, unknown>>).find((flag) => flag.id === "flag-billing-v2");
      assert.equal(existsSync(filePath), true);
      assert.equal(duplicateIncident.status, "ok");
      assert.equal(duplicateIncident.data.duplicate, true);
      assert.equal(duplicateIncident.data.incident.id, incidentUpdate.data.incident.id);
      assert.equal((incidentDetail.data.incident as Record<string, unknown>).status, "resolved");
      assert.ok((platformDrilldown.data.incidents as Array<Record<string, unknown>>).some((incident) => incident.id === "inc-webhook-retry" && incident.status === "resolved"));
      assert.equal(billingFlag?.rollout, 55);
      assert.ok(state.alertAcknowledgements.some((item) => item.componentId === "cmp-webhooks" && item.statusPageSync.id === acknowledged.data.statusPageSync.id));
      assert.ok(state.featureFlagOutbox.some((item) => item.target === "ff-billing-v2" && item.id === flagUpdate.data.outbox.id));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      PlatformRepository.clearDefault();
    }
  });

  it("bootstraps durable operations queues, idempotency and rollback checks from a runtime store file", async () => {
    const workspace = makeTempWorkspace();
    try {
      const filePath = join(workspace, "runtime-operations.json");
      configureOperationsRepository({ OPERATIONS_STORE_FILE: filePath }, { seed: bootstrapOperationsState() });
      usePersistentOperationsDeadLetterBackendRegistry();
      const first = new OperationsReadinessService();

      const loadRun = await first.queueLoadTestRun({
        confirmed: true,
        idempotencyKey: "persistent-load-test-run",
        reason: "Persistent load test queue",
        scenarioId: "lt-critical-flows"
      });
      const restoreCheck = await first.queueRestoreCheck({
        confirmed: true,
        drillId: "backup-postgres-nightly",
        idempotencyKey: "persistent-restore-check",
        reason: "Persistent restore drill"
      });
      const replay = await first.replayDeadLetterMessage({
        confirmed: true,
        idempotencyKey: "persistent-dead-letter-replay",
        messageId: "dlm-webhook-001",
        reason: "Persistent dead letter replay"
      });
      const rollback = await first.checkMigrationRollback({
        confirmed: true,
        migrationId: "mig-add-message-search-index",
        reason: "Persistent rollback check"
      });
      assert.equal(loadRun.status, "ok");
      assert.equal(restoreCheck.status, "ok");
      assert.equal(replay.status, "ok");
      assert.equal(rollback.status, "ok");

      configureOperationsRepository({ OPERATIONS_STORE_FILE: filePath }, { seed: bootstrapOperationsState() });
      usePersistentOperationsDeadLetterBackendRegistry();
      const second = new OperationsReadinessService();
      const duplicateLoadRun = await second.queueLoadTestRun({
        confirmed: true,
        idempotencyKey: "persistent-load-test-run",
        reason: "Persistent load test queue",
        scenarioId: "lt-critical-flows"
      });
      const duplicateRestoreCheck = await second.queueRestoreCheck({
        confirmed: true,
        drillId: "backup-postgres-nightly",
        idempotencyKey: "persistent-restore-check",
        reason: "Persistent restore drill"
      });
      const duplicateReplay = await second.replayDeadLetterMessage({
        confirmed: true,
        idempotencyKey: "persistent-dead-letter-replay",
        messageId: "dlm-webhook-001",
        reason: "Persistent dead letter replay"
      });
      const loadRunConflict = await second.queueLoadTestRun({
        confirmed: true,
        idempotencyKey: "persistent-load-test-run",
        reason: "Persistent load test conflict",
        scenarioId: "lt-webhook-delivery"
      });
      const restoreConflict = await second.queueRestoreCheck({
        confirmed: true,
        drillId: "backup-audit-ledger",
        idempotencyKey: "persistent-restore-check",
        reason: "Persistent restore conflict"
      });
      const replayConflict = await second.replayDeadLetterMessage({
        confirmed: true,
        idempotencyKey: "persistent-dead-letter-replay",
        messageId: "dlm-report-001",
        reason: "Persistent dead letter conflict"
      });
      const repository = OperationsRepository.open({ filePath, seed: bootstrapOperationsState() });
      const state = repository.readState();

      assert.equal(existsSync(filePath), true);
      assert.equal(duplicateLoadRun.status, "ok");
      assert.equal(duplicateLoadRun.data.duplicate, true);
      assert.equal(duplicateLoadRun.data.run.id, loadRun.data.run.id);
      assert.equal(duplicateRestoreCheck.status, "ok");
      assert.equal(duplicateRestoreCheck.data.duplicate, true);
      assert.equal(duplicateRestoreCheck.data.restoreCheck.id, restoreCheck.data.restoreCheck.id);
      assert.equal(duplicateReplay.status, "ok");
      assert.equal(duplicateReplay.data.duplicate, true);
      assert.equal(duplicateReplay.data.replay.id, replay.data.replay.id);
      assert.equal(loadRunConflict.status, "conflict");
      assert.equal(loadRunConflict.error?.code, "idempotency_key_reused");
      assert.equal(restoreConflict.status, "conflict");
      assert.equal(restoreConflict.error?.code, "idempotency_key_reused");
      assert.equal(replayConflict.status, "conflict");
      assert.equal(replayConflict.error?.code, "idempotency_key_reused");
      assert.ok(state.loadTestRuns.some((item) => item.run.id === loadRun.data.run.id && item.auditEvent.id === loadRun.data.auditEvent.id));
      assert.ok(state.restoreChecks.some((item) => item.restoreCheck.id === restoreCheck.data.restoreCheck.id));
      assert.ok(state.deadLetterReplays.some((item) => item.replay.id === replay.data.replay.id));
      assert.ok(state.migrationRollbackChecks.some((item) => item.rollbackPlan.applyCommand === rollback.data.rollbackPlan.applyCommand));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      OperationsRepository.clearDefault();
    }
  });

  it("resolves production service-admin context from persisted sessions and fails closed", async () => {
    const workspace = makeTempWorkspace();
    try {
      const repository = IdentityRepository.open({ filePath: join(workspace, "identity.json") });
      const session = repository.createServiceAdminSession({
        actorId: "svc-admin-prod",
        actorName: "Production Admin",
        allowedActions: ["tenants.manage"],
        mfaVerified: true,
        ttlMinutes: 30
      });

      const allowed = resolveServiceAdminContext({
        headers: { authorization: `Bearer ${session.id}` },
        requiredAction: "tenants.manage",
        sessionLookup: (sessionId) => repository.findServiceAdminSession(sessionId)
      });
      assert.equal(allowed.allowed, true);
      assert.equal(allowed.actor.id, "svc-admin-prod");
      assert.deepEqual(allowed.permissions, ["tenants.manage"]);

      const deniedPermission = resolveServiceAdminContext({
        headers: { authorization: `Bearer ${session.id}` },
        requiredAction: "billing.change",
        sessionLookup: (sessionId) => repository.findServiceAdminSession(sessionId)
      });
      assert.equal(deniedPermission.allowed, false);
      assert.equal(deniedPermission.code, "permission_denied");

      const missingSession = resolveServiceAdminContext({
        headers: { authorization: "Bearer missing-session" },
        requiredAction: "tenants.manage",
        sessionLookup: (sessionId) => repository.findServiceAdminSession(sessionId)
      });
      assert.equal(missingSession.allowed, false);
      assert.equal(missingSession.code, "session_not_found");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("production guard uses persisted bearer sessions and ignores spoofed permission headers", async () => {
    const repository = IdentityRepository.inMemory();
    IdentityRepository.useDefault(repository);
    const session = repository.createServiceAdminSession({
      actorId: "svc-admin-prod",
      actorName: "Production Admin",
      allowedActions: ["tenants.manage"],
      mfaVerified: true,
      ttlMinutes: 30
    });
    repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-12-31T23:59:59.000Z",
      accessTokenHash: hashServiceAdminToken("prod-access-token"),
      id: "prod-token-pair",
      issuedAt: "2026-07-02T00:00:00.000Z",
      refreshTokenExpiresAt: "2100-01-01T23:59:59.000Z",
      refreshTokenHash: hashServiceAdminToken("prod-refresh-token"),
      sessionId: session.id,
      subjectId: session.adminId
    });

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    const request = {
      headers: {
        authorization: "Bearer prod-access-token",
        "x-demo-service-admin-actor-id": "spoofed-admin",
        "x-demo-service-admin-actor-name": "Spoofed Admin",
        "x-demo-service-admin-mfa-verified": "true",
        "x-demo-service-admin-permissions": "*",
        "x-demo-service-admin-session-expires-at": "2999-01-01T00:00:00.000Z"
      }
    };

    assert.equal(await guard.canActivate(executionContextForRequest(request)), true);
    assert.equal(request.serviceAdminContext.actor.id, "svc-admin-prod");
    assert.equal(request.serviceAdminContext.currentTenantId, undefined);
    assert.equal(request.serviceAdminContext.sessionId, session.id);
    assert.deepEqual(request.serviceAdminContext.permissions, ["tenants.manage"]);

    const deniedGuard = new ServiceAdminSessionGuard(reflectorForAction("billing.change"));
    await assert.rejects(
      () => deniedGuard.canActivate(executionContextForRequest({ headers: { authorization: "Bearer prod-access-token", "x-demo-service-admin-permissions": "*" } })),
      /permission_denied|permission/
    );
    const denials = await repository.listPermissionDenialEvents();
    assert.equal(denials.length, 1);
    assert.equal(denials[0].actorId, "svc-admin-prod");
    assert.equal(denials[0].action, "billing.change");
    assert.equal(denials[0].resource, "service-admin");
    assert.equal(denials[0].roleKey, "service_admin");
    assert.equal(denials[0].immutable, true);

    repository.revokeServiceAdminSession(session.id);
    await assert.rejects(
      () => guard.canActivate(executionContextForRequest({ headers: { authorization: "Bearer prod-access-token" } })),
      /session_revoked|revoked/
    );
  });

  it("production guard resolves bearer access tokens through hashed service-admin token storage", async () => {
    const repository = IdentityRepository.inMemory();
    IdentityRepository.useDefault(repository);
    const session = repository.createServiceAdminSession({
      actorId: "svc-admin-token-prod",
      actorName: "Production Token Admin",
      allowedActions: ["tenants.manage"],
      mfaVerified: true,
      ttlMinutes: 30
    });
    await repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
      accessTokenHash: hashServiceAdminTokenForTest("guard-access-token"),
      id: "sat_pair_guard_prod",
      issuedAt: "2026-06-29T10:00:00.000Z",
      refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z",
      refreshTokenHash: hashServiceAdminTokenForTest("guard-refresh-token"),
      sessionId: session.id,
      subjectId: "svc-admin-token-prod"
    });

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    const request = {
      headers: {
        authorization: "Bearer guard-access-token",
        "x-service-admin-session-id": "spoofed-session-id"
      }
    };

    assert.equal(await guard.canActivate(executionContextForRequest(request)), true);
    assert.equal(request.serviceAdminContext.actor.id, "svc-admin-token-prod");
    assert.equal(request.serviceAdminContext.sessionId, session.id);
  });

  it("realtime socket auth resolves bearer access tokens through hashed service-admin token storage", async () => {
    const repository = IdentityRepository.inMemory();
    IdentityRepository.useDefault(repository);
    const session = repository.createServiceAdminSession({
      actorId: "svc-admin-realtime-token",
      actorName: "Realtime Token Admin",
      allowedActions: ["realtime.events.read"],
      mfaVerified: true,
      ttlMinutes: 30
    });
    await repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
      accessTokenHash: hashServiceAdminTokenForTest("realtime-access-token"),
      id: "sat_pair_realtime_prod",
      issuedAt: "2026-06-29T10:00:00.000Z",
      refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z",
      refreshTokenHash: hashServiceAdminTokenForTest("realtime-refresh-token"),
      sessionId: session.id,
      subjectId: "svc-admin-realtime-token"
    });
    const realtimeModule = await import("../apps/api-gateway/src/conversation/realtime.websocket.ts") as Record<string, unknown>;
    const authorizeRealtimeSocket = realtimeModule.authorizeRealtimeSocket as ((headers: Record<string, string>, config: Record<string, string>) => Promise<{ allowed: boolean }>) | undefined;

    assert.equal(typeof authorizeRealtimeSocket, "function");
    const auth = await authorizeRealtimeSocket({
      authorization: "Bearer realtime-access-token",
      "x-service-admin-session-id": "spoofed-session-id"
    }, {
      DEMO_SERVICE_ADMIN_KEY: "demo-key",
      NODE_ENV: "production"
    });

    assert.equal(auth.allowed, true);
  });

  it("production guard rejects empty bearer tokens even when a session-id fallback header is present", async () => {
    const previous = snapshotEnv();
    try {
      Object.assign(process.env, requiredConfigEnv({
        DEMO_SERVICE_ADMIN_KEY: "prod-service-admin-key",
        NODE_ENV: "production"
      }));
      const repository = IdentityRepository.default();
      const session = repository.createServiceAdminSession({
        actorId: "svc-admin-prod-empty-bearer",
        actorName: "Prod Empty Bearer",
        allowedActions: ["tenants.manage"],
        mfaVerified: true,
        ttlMinutes: 30
      });

      const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
      await assert.rejects(
        () => guard.canActivate(executionContextForRequest({
          headers: {
            authorization: "Bearer ",
            "x-service-admin-session-id": session.id
          }
        })),
        /Bearer service-admin session is required|session_not_found|unauthorized/i
      );
    } finally {
      restoreEnv(previous);
      configureIdentityRepository({ repository: IdentityRepository.inMemory() });
    }
  });

  it("rejects spoofable demo service-admin headers outside development and test", async () => {
    const previous = snapshotEnv();
    try {
      Object.assign(process.env, requiredConfigEnv({
        DEMO_SERVICE_ADMIN_KEY: "prod-service-admin-key",
        NODE_ENV: "production"
      }));

      const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
      await assert.rejects(
        () => guard.canActivate(executionContextForRequest({
          headers: {
            "x-demo-service-admin-key": "prod-service-admin-key",
            "x-demo-service-admin-actor-id": "spoofed-admin",
            "x-demo-service-admin-actor-name": "Spoofed Admin",
            "x-demo-service-admin-mfa-verified": "true",
            "x-demo-service-admin-permissions": "*",
            "x-demo-service-admin-session-expires-at": "2999-01-01T00:00:00.000Z"
          }
        })),
        /Bearer service-admin session is required/
      );
    } finally {
      restoreEnv(previous);
    }
  });

  it("creates persisted service-admin sessions after MFA without demo headers in production", async () => {
    const previous = snapshotEnv();
    try {
      Object.assign(process.env, requiredConfigEnv({
        DEMO_SERVICE_ADMIN_KEY: "prod-service-admin-key",
        NODE_ENV: "production"
      }));
      const repository = IdentityRepository.inMemory();
      const auth = new AuthService(repository, createMfaOtpRuntime({
        delivery: {
          async send({ challengeId }) {
            return { providerMessageId: `test-${challengeId}` };
          }
        },
        generateOtp: () => "123456",
        hashKey: "production-session-contract-mfa-key"
      }));
      const challenge = await auth.login({
        email: "service-admin@example.com",
        password: "correct-password"
      });
      let sessionsCreated = 0;
      const createServiceAdminSession = repository.createServiceAdminSession.bind(repository);
      repository.createServiceAdminSession = ((input) => {
        sessionsCreated += 1;
        return createServiceAdminSession(input);
      }) as typeof repository.createServiceAdminSession;

      const completion = await auth.login({
        email: "service-admin@example.com",
        mfaChallengeId: challenge.data.mfaChallengeId,
        otp: "123456",
        password: "correct-password"
      });

      assert.equal(completion.status, "ok");
      assert.equal(completion.data.authenticated, true);
      assert.equal(typeof completion.data.accessToken, "string");
      assert.equal(sessionsCreated, 1);
    } finally {
      restoreEnv(previous);
    }
  });

  it("requires explicit service-admin action metadata on every guarded controller route", () => {
    const controllerRoot = new URL("../apps/api-gateway/src/", import.meta.url);
    const missing: string[] = [];

    for (const fileUrl of listControllerFiles(controllerRoot)) {
      const content = readFileSync(fileUrl, "utf8");
      if (!content.includes("ServiceAdminSessionGuard")) {
        continue;
      }

      const lines = content.split(/\r?\n/);
      let classGuarded = false;
      let decorators: string[] = [];
      for (let index = 0; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (trimmed.startsWith("@")) {
          decorators.push(trimmed);
          continue;
        }

        if (/^export class \w+/.test(trimmed)) {
          classGuarded = decorators.some((decorator) => decorator.includes("ServiceAdminSessionGuard"));
          decorators = [];
          continue;
        }

        const routeDecorated = decorators.some((decorator) => /^@(Delete|Get|Patch|Post|Put)\b/.test(decorator));
        const methodGuarded = decorators.some((decorator) => decorator.includes("ServiceAdminSessionGuard"));
        const methodMatch = /^([a-zA-Z_$][\w$]*)\s*\(/.exec(trimmed);
        if (routeDecorated && methodMatch && (classGuarded || methodGuarded) && !decorators.some((decorator) => decorator.startsWith("@RequireServiceAdminAction"))) {
          missing.push(`${fileUrl.pathname}:${index + 1}:${methodMatch[1]}`);
        }

        if (trimmed && !trimmed.startsWith("//")) {
          decorators = [];
        }
      }
    }

    assert.deepEqual(missing, []);
  });
});

function makeTempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "support-backend-"));
}

function hashServiceAdminTokenForTest(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function executionContextForRequest(request: Record<string, unknown>) {
  return {
    getClass: () => function Controller() {},
    getHandler: () => function handler() {},
    switchToHttp: () => ({
      getRequest: () => request
    })
  };
}

function reflectorForAction(action: string) {
  return {
    getAllAndOverride: () => action
  };
}

function requiredConfigEnv(overrides: Record<string, string>): Record<string, string> {
  return {
    API_VERSION: "v1",
    BILLING_REPOSITORY: "prisma",
    CONVERSATION_REPOSITORY: "prisma",
    DATABASE_URL: "postgresql://support:support@127.0.0.1:5432/support_communication",
    DEMO_SERVICE_ADMIN_KEY: "dev-service-admin-key",
    IDENTITY_REPOSITORY: "prisma",
    JWT_ACCESS_SECRET: "test-access-secret-16chars",
    JWT_REFRESH_SECRET: "test-refresh-secret-16chars",
    LOG_LEVEL: "info",
    MAIL_HOST: "127.0.0.1",
    MAIL_PORT: "1025",
    NODE_ENV: "test",
    PORT: "4191",
    PUBLIC_API_KEY_SECRET: "test-public-api-secret",
    REDIS_URL: "redis://127.0.0.1:6379",
    ROUTING_REPOSITORY: "prisma",
    S3_ACCESS_KEY: "minio",
    S3_BUCKET: "support-communication-local",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_SECRET_KEY: "minio-password",
    SERVICE_NAME: "api-gateway",
    WORKSPACE_REPOSITORY: "prisma",
    ...overrides
  };
}

function snapshotEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

function restoreEnv(previous: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, previous);
}

function listControllerFiles(root: URL): URL[] {
  const files: URL[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, root);
    if (entry.isDirectory()) {
      files.push(...listControllerFiles(child));
    } else if (entry.name.endsWith(".controller.ts")) {
      files.push(child);
    }
  }

  return files;
}
