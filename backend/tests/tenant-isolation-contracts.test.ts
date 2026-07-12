import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import { BillingRepository } from "../apps/api-gateway/src/billing/billing.repository.ts";
import { createSeededBillingRepository } from "../apps/api-gateway/src/billing/seed.ts";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { createSeededIdentityRepository } from "../apps/api-gateway/src/identity/seed.ts";
import { QualityRepository } from "../apps/api-gateway/src/quality/quality.repository.ts";
import { RoutingRepository } from "../apps/api-gateway/src/routing/routing.repository.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";
import {
  createBillingRepositoryTenantIsolationChecks,
  createConversationRepositoryTenantIsolationChecks,
  createIdentityRepositoryTenantIsolationChecks,
  createQualityRepositoryTenantIsolationChecks,
  createRoutingRepositoryTenantIsolationChecks,
  createWorkspaceRepositoryTenantIsolationChecks,
  listTenantOwnedRepositoryMethodCatalog,
  verifyTenantIsolationChecks
} from "../apps/api-gateway/src/operations/tenant-isolation.verifier.ts";

describe("tenant isolation verification gates", () => {
  it("catalogs tenant-owned repository methods before service-specific isolation checks are wired", () => {
    const catalog = listTenantOwnedRepositoryMethodCatalog();
    const expectedIds = [
      "billing.findTenant",
      "billing.findTenantSubscription",
      "billing.listQuotaLedgerEntries",
      "billing.listQuotaReservations",
      "billing.listTenantInvoices",
      "conversation.listDeliveryReceipts",
      "conversation.listOutboundDescriptors",
      "conversation.listRealtimeEvents",
      "identity.findTenantAuditEvents",
      "identity.findTenantUsers",
      "identity.listPermissionDenialEvents",
      "identity.listRbacRoleGrants",
      "quality.listAiScoringAudits",
      "quality.listManualQaReviews",
      "quality.listQualityRatings",
      "routing.listOperatorCapacities",
      "routing.listQueueMemberships",
      "routing.listRoutingRules",
      "workspace.findClientProfile",
      "workspace.findFile",
      "workspace.findFileScanResultIdempotency",
      "workspace.findTemplate",
      "workspace.listClientMergeConflicts",
      "workspace.listClientMergeEvents",
      "workspace.listTemplates"
    ];

    assert.ok(catalog.every((entry) => entry.boundary === "repository"));
    assert.deepEqual(
      catalog.map((entry) => entry.id),
      expectedIds
    );
    assert.ok(catalog.every((entry) => entry.expectedTenantSource !== "unscoped"));
  });

  it("fails closed when no tenant isolation checks are registered", async () => {
    const report = await verifyTenantIsolationChecks([]);

    assert.equal(report.status, "fail");
    assert.equal(report.checked, 0);
    assert.deepEqual(report.failures, [{
      checkId: "__tenant_isolation_checks__",
      expectedTenantId: "(configured)",
      leakedRecordIds: ["missing-checks"],
      leakedTenantIds: ["(not-run)"]
    }]);
  });

  it("fails closed when a tenant-owned check returns cross-tenant rows", async () => {
    const report = await verifyTenantIsolationChecks([
      {
        id: "identity.findTenantUsers",
        expectedTenantId: "tenant-volga",
        loadRows: async () => [
          { id: "user-volga-001", tenantId: "tenant-volga" },
          { id: "user-lumen-001", tenantId: "tenant-lumen" }
        ]
      }
    ]);

    assert.equal(report.status, "fail");
    assert.equal(report.failures.length, 1);
    assert.deepEqual(report.failures[0], {
      checkId: "identity.findTenantUsers",
      expectedTenantId: "tenant-volga",
      leakedRecordIds: ["user-lumen-001"],
      leakedTenantIds: ["tenant-lumen"]
    });
  });

  it("passes when all tenant-owned rows match the expected tenant", async () => {
    const report = await verifyTenantIsolationChecks([
      {
        id: "conversation.listDeliveryReceipts",
        expectedTenantId: "tenant-volga",
        loadRows: async () => [
          { receiptId: "receipt-001", tenantId: "tenant-volga" },
          { receiptId: "receipt-002", tenantId: "tenant-volga" }
        ],
        recordId: (row) => String(row.receiptId)
      }
    ]);

    assert.equal(report.status, "pass");
    assert.deepEqual(report.failures, []);
  });

  it("covers identity tenant-owned repository methods with concrete isolation checks", async () => {
    const repository = createSeededIdentityRepository();

    await repository.recordRbacRoleGrant({
      action: "conversation.read",
      createdAt: "2026-06-29T10:00:00.000Z",
      createdBy: "contract",
      effect: "allow",
      id: "grant-volga-contract",
      policyVersionId: "rbac-policy-volga",
      resource: "conversation",
      roleKey: "admin",
      tenantId: "tenant-volga",
      traceId: "trace-grant-volga"
    });
    await repository.recordRbacRoleGrant({
      action: "conversation.read",
      createdAt: "2026-06-29T10:01:00.000Z",
      createdBy: "contract",
      effect: "allow",
      id: "grant-lumen-contract",
      policyVersionId: "rbac-policy-lumen",
      resource: "conversation",
      roleKey: "operator",
      tenantId: "tenant-lumen",
      traceId: "trace-grant-lumen"
    });
    await repository.recordPermissionDenialEvent({
      action: "conversation.export",
      actorId: "actor-volga",
      at: "2026-06-29T10:02:00.000Z",
      id: "denial-volga-contract",
      immutable: true,
      policyVersionId: "rbac-policy-volga",
      reason: "contract",
      resource: "conversation",
      roleKey: "operator",
      tenantId: "tenant-volga",
      traceId: "trace-denial-volga"
    });
    await repository.recordPermissionDenialEvent({
      action: "conversation.export",
      actorId: "actor-lumen",
      at: "2026-06-29T10:03:00.000Z",
      id: "denial-lumen-contract",
      immutable: true,
      policyVersionId: "rbac-policy-lumen",
      reason: "contract",
      resource: "conversation",
      roleKey: "operator",
      tenantId: "tenant-lumen",
      traceId: "trace-denial-lumen"
    });

    const checks = createIdentityRepositoryTenantIsolationChecks(repository, "tenant-volga");
    assert.deepEqual(checks.map((check) => check.id), [
      "identity.findTenantAuditEvents",
      "identity.findTenantUsers",
      "identity.listPermissionDenialEvents",
      "identity.listRbacRoleGrants"
    ]);

    const loadedRows = await Promise.all(checks.map(async (check) => check.loadRows()));
    assert.ok(loadedRows.every((rows) => rows.length > 0));

    const report = await verifyTenantIsolationChecks(checks);
    assert.equal(report.status, "pass");
    assert.equal(report.checked, 4);
    assert.deepEqual(report.failures, []);
  });

  it("fails identity repository checks when a repository method leaks another tenant", async () => {
    const checks = createIdentityRepositoryTenantIsolationChecks({
      findTenantAuditEvents: () => [{ id: "audit-lumen", tenantId: "tenant-lumen" }],
      findTenantUsers: () => [{ id: "user-lumen", tenantId: "tenant-lumen" }],
      listPermissionDenialEvents: () => [{ id: "denial-lumen", tenantId: "tenant-lumen" }],
      listRbacRoleGrants: () => [{ id: "grant-lumen", tenantId: "tenant-lumen" }]
    }, "tenant-volga");

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "fail");
    assert.equal(report.checked, 4);
    assert.deepEqual(report.failures.map((failure) => failure.checkId), [
      "identity.findTenantAuditEvents",
      "identity.findTenantUsers",
      "identity.listPermissionDenialEvents",
      "identity.listRbacRoleGrants"
    ]);
    assert.ok(report.failures.every((failure) => failure.leakedTenantIds.includes("tenant-lumen")));
  });

  it("covers conversation tenant-owned repository reads with concrete isolation checks", async () => {
    const repository = ConversationRepository.inMemory();
    await repository.recordDeliveryReceipt({
      channel: "telegram",
      id: "receipt-volga-contract",
      idempotencyKey: "receipt-volga-key",
      messageId: "msg-volga",
      provider: "telegram",
      providerEventId: "provider-volga",
      receivedAt: "2026-06-29T11:00:00.000Z",
      status: "delivered",
      tenantId: "tenant-volga",
      traceId: "trace-receipt-volga"
    });
    await repository.recordDeliveryReceipt({
      channel: "telegram",
      id: "receipt-lumen-contract",
      idempotencyKey: "receipt-lumen-key",
      messageId: "msg-lumen",
      provider: "telegram",
      providerEventId: "provider-lumen",
      receivedAt: "2026-06-29T11:01:00.000Z",
      status: "delivered",
      tenantId: "tenant-lumen",
      traceId: "trace-receipt-lumen"
    });
    await repository.recordOutboundDescriptor({
      descriptor: {
        auditId: null,
        channel: "telegram",
        conversationId: "conv-volga",
        createdAt: "2026-06-29T11:02:00.000Z",
        deliveryState: null,
        id: "descriptor-volga-contract",
        idempotencyKey: "descriptor-volga-key",
        kind: "message_delivery",
        messageId: "msg-volga",
        outboxEventId: null,
        payload: {},
        requestFingerprint: null,
        retryable: true,
        status: "queued",
        tenantId: "tenant-volga",
        traceId: "trace-descriptor-volga"
      }
    });
    await repository.recordOutboundDescriptor({
      descriptor: {
        auditId: null,
        channel: "telegram",
        conversationId: "conv-lumen",
        createdAt: "2026-06-29T11:03:00.000Z",
        deliveryState: null,
        id: "descriptor-lumen-contract",
        idempotencyKey: "descriptor-lumen-key",
        kind: "message_delivery",
        messageId: "msg-lumen",
        outboxEventId: null,
        payload: {},
        requestFingerprint: null,
        retryable: true,
        status: "queued",
        tenantId: "tenant-lumen",
        traceId: "trace-descriptor-lumen"
      }
    });
    await repository.appendRealtimeEvent({
      data: {},
      eventId: "rt-volga-contract",
      eventName: "message.created",
      occurredAt: "2026-06-29T11:04:00.000Z",
      resourceId: "msg-volga",
      resourceType: "message",
      schemaVersion: "1.0",
      tenantId: "tenant-volga",
      traceId: "trace-rt-volga"
    });
    await repository.appendRealtimeEvent({
      data: {},
      eventId: "rt-lumen-contract",
      eventName: "message.created",
      occurredAt: "2026-06-29T11:05:00.000Z",
      resourceId: "msg-lumen",
      resourceType: "message",
      schemaVersion: "1.0",
      tenantId: "tenant-lumen",
      traceId: "trace-rt-lumen"
    });

    const checks = createConversationRepositoryTenantIsolationChecks(repository, "tenant-volga");
    assert.deepEqual(checks.map((check) => check.id), [
      "conversation.listDeliveryReceipts",
      "conversation.listOutboundDescriptors",
      "conversation.listRealtimeEvents"
    ]);

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "pass");
    assert.equal(report.checked, 3);
    assert.deepEqual(report.failures, []);
  });

  it("fails conversation repository checks when delivery receipts leak another tenant", async () => {
    const checks = createConversationRepositoryTenantIsolationChecks({
      listDeliveryReceipts: () => [{ id: "receipt-lumen", tenantId: "tenant-lumen" }],
      listOutboundDescriptors: () => [{ id: "descriptor-volga", tenantId: "tenant-volga" }],
      listRealtimeEvents: () => [{ eventId: "rt-volga", tenantId: "tenant-volga" }]
    }, "tenant-volga");

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "fail");
    assert.deepEqual(report.failures, [{
      checkId: "conversation.listDeliveryReceipts",
      expectedTenantId: "tenant-volga",
      leakedRecordIds: ["receipt-lumen"],
      leakedTenantIds: ["tenant-lumen"]
    }]);
  });

  it("covers quality rating tenant-owned repository reads with concrete isolation checks", async () => {
    const repository = QualityRepository.inMemory();
    repository.saveQualityRating({
      auditId: "audit-rating-volga",
      channel: "SDK",
      clientId: "client-volga",
      conversationId: "conv-rating-volga",
      createdAt: "2026-06-30T15:00:00.000Z",
      operator: "operator-volga",
      ratingId: "rating-volga-contract",
      realtimeEventId: "rt-rating-volga",
      scale: "CSAT",
      score: 5,
      tenantId: "tenant-volga",
      topic: "Delivery"
    });
    repository.saveQualityRating({
      auditId: "audit-rating-lumen",
      channel: "Email",
      clientId: "client-lumen",
      conversationId: "conv-rating-lumen",
      createdAt: "2026-06-30T15:01:00.000Z",
      operator: "operator-lumen",
      ratingId: "rating-lumen-contract",
      realtimeEventId: "rt-rating-lumen",
      scale: "CSI",
      score: 4,
      tenantId: "tenant-lumen",
      topic: "Billing"
    });

    const checks = createQualityRepositoryTenantIsolationChecks(repository, "tenant-volga");
    assert.equal(checks.some((check) => check.id === "quality.listQualityRatings"), true);

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "pass");
    assert.deepEqual(report.failures, []);
  });

  it("fails quality rating checks when ratings leak another tenant", async () => {
    const checks = createQualityRepositoryTenantIsolationChecks({
      listAiScoringAudits: () => [],
      listManualQaReviews: () => [],
      listQualityRatings: () => [{ ratingId: "rating-lumen", tenantId: "tenant-lumen" }]
    }, "tenant-volga");

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "fail");
    assert.deepEqual(report.failures, [{
      checkId: "quality.listQualityRatings",
      expectedTenantId: "tenant-volga",
      leakedRecordIds: ["rating-lumen"],
      leakedTenantIds: ["tenant-lumen"]
    }]);
  });

  it("covers manual QA review tenant-owned repository reads with concrete isolation checks", async () => {
    const repository = QualityRepository.inMemory();
    repository.saveManualQaReview({
      auditId: "audit-review-volga",
      conversationId: "conv-review-volga",
      createdAt: "2026-06-30T15:10:00.000Z",
      criteria: { empathy: 5 },
      overrideReason: null,
      reviewer: "reviewer-volga",
      reviewId: "review-volga-contract",
      score: 5,
      tenantId: "tenant-volga"
    });
    repository.saveManualQaReview({
      auditId: "audit-review-lumen",
      conversationId: "conv-review-lumen",
      createdAt: "2026-06-30T15:11:00.000Z",
      criteria: { empathy: 4 },
      overrideReason: "Supervisor override",
      reviewer: "reviewer-lumen",
      reviewId: "review-lumen-contract",
      score: 4,
      tenantId: "tenant-lumen"
    });

    const checks = createQualityRepositoryTenantIsolationChecks(repository, "tenant-volga");
    assert.equal(checks.some((check) => check.id === "quality.listManualQaReviews"), true);

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "pass");
    assert.deepEqual(report.failures, []);
  });

  it("fails manual QA review checks when reviews leak another tenant", async () => {
    const checks = createQualityRepositoryTenantIsolationChecks({
      listAiScoringAudits: () => [],
      listManualQaReviews: () => [{ reviewId: "review-lumen", tenantId: "tenant-lumen" }],
      listQualityRatings: () => [{ ratingId: "rating-volga", tenantId: "tenant-volga" }]
    }, "tenant-volga");

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "fail");
    assert.deepEqual(report.failures, [{
      checkId: "quality.listManualQaReviews",
      expectedTenantId: "tenant-volga",
      leakedRecordIds: ["review-lumen"],
      leakedTenantIds: ["tenant-lumen"]
    }]);
  });

  it("covers AI scoring audit tenant-owned repository reads with concrete isolation checks", async () => {
    const repository = QualityRepository.inMemory();
    repository.saveAiScoringAudit({
      auditId: "audit-scoring-volga",
      conversationId: "conv-scoring-volga",
      createdAt: "2026-06-30T15:20:00.000Z",
      providerId: "deterministic-quality-scoring",
      providerResultId: "quality-result-volga",
      queue: "quality-ai-scoring",
      score: 92,
      status: "ok",
      tenantId: "tenant-volga",
      traceId: "trace-scoring-volga"
    });
    repository.saveAiScoringAudit({
      auditId: "audit-scoring-lumen",
      conversationId: "conv-scoring-lumen",
      createdAt: "2026-06-30T15:21:00.000Z",
      providerId: "deterministic-quality-scoring",
      providerResultId: "quality-result-lumen",
      queue: "quality-ai-scoring",
      score: 74,
      status: "failed",
      tenantId: "tenant-lumen",
      traceId: "trace-scoring-lumen"
    });

    const checks = createQualityRepositoryTenantIsolationChecks(repository, "tenant-volga");
    assert.equal(checks.some((check) => check.id === "quality.listAiScoringAudits"), true);

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "pass");
    assert.deepEqual(report.failures, []);
  });

  it("fails AI scoring audit checks when audit rows leak another tenant", async () => {
    const checks = createQualityRepositoryTenantIsolationChecks({
      listAiScoringAudits: () => [{ auditId: "audit-lumen", tenantId: "tenant-lumen" }],
      listManualQaReviews: () => [{ reviewId: "review-volga", tenantId: "tenant-volga" }],
      listQualityRatings: () => [{ ratingId: "rating-volga", tenantId: "tenant-volga" }]
    }, "tenant-volga");

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "fail");
    assert.deepEqual(report.failures, [{
      checkId: "quality.listAiScoringAudits",
      expectedTenantId: "tenant-volga",
      leakedRecordIds: ["audit-lumen"],
      leakedTenantIds: ["tenant-lumen"]
    }]);
  });

  it("covers workspace file metadata and scan idempotency ownership checks", async () => {
    const repository = WorkspaceRepository.inMemory();
    await repository.saveFile({
      auditId: "audit-file-volga",
      channel: "telegram",
      checksum: "sha256-volga",
      fileId: "file-volga-contract",
      fileName: "volga.pdf",
      mimeType: "application/pdf",
      objectKey: "tenant-volga/file-volga-contract/volga.pdf",
      scanState: "clean",
      scanVerdict: "clean",
      sizeBytes: 128,
      storageState: "stored",
      tenantId: "tenant-volga"
    });
    await repository.saveFile({
      auditId: "audit-file-lumen",
      channel: "telegram",
      checksum: "sha256-lumen",
      fileId: "file-lumen-contract",
      fileName: "lumen.pdf",
      mimeType: "application/pdf",
      objectKey: "tenant-lumen/file-lumen-contract/lumen.pdf",
      scanState: "clean",
      scanVerdict: "clean",
      sizeBytes: 256,
      storageState: "stored",
      tenantId: "tenant-lumen"
    });
    await repository.saveFileScanResultIdempotency({
      fileId: "file-volga-contract",
      fingerprint: "scan-volga",
      key: "scan-volga-key",
      result: { status: "accepted" }
    });
    await repository.saveFileScanResultIdempotency({
      fileId: "file-lumen-contract",
      fingerprint: "scan-lumen",
      key: "scan-lumen-key",
      result: { status: "accepted" }
    });
    await repository.saveClientProfile({
      channel: "SDK",
      clientSince: "2026-06-29",
      device: "Web",
      entry: "SDK",
      id: "client-volga-contract",
      name: "Volga Client",
      phone: "+7 999 100-20-30",
      previous: [],
      sourceProfileId: "src_sdk_verifier",
      tenantId: "tenant-volga",
      topic: "Delivery"
    });
    await repository.saveClientProfile({
      channel: "SDK",
      clientSince: "2026-06-29",
      device: "Web",
      entry: "SDK",
      id: "client-lumen-contract",
      name: "Lumen Client",
      phone: "+7 999 200-30-40",
      previous: [],
      sourceProfileId: "src_sdk_verifier",
      tenantId: "tenant-lumen",
      topic: "Billing"
    });
    await repository.saveClientMergeEvent({
      action: "client.merge",
      candidateProfileId: "src_sdk_verifier_secondary",
      id: "merge-volga-contract",
      immutable: true,
      mergeGraphEdge: "src_sdk_verifier->src_sdk_verifier_secondary",
      primaryProfileId: "src_sdk_verifier",
      reason: "Verifier merge edge",
      tenantId: "tenant-volga"
    });
    await repository.saveClientMergeEvent({
      action: "client.merge",
      candidateProfileId: "src_sdk_verifier_secondary",
      id: "merge-lumen-contract",
      immutable: true,
      mergeGraphEdge: "src_sdk_verifier->src_sdk_verifier_secondary",
      primaryProfileId: "src_sdk_verifier",
      reason: "Verifier merge edge",
      tenantId: "tenant-lumen"
    });
    await repository.saveClientMergeConflict({
      candidateProfileId: "src_sdk_verifier_secondary",
      id: "conflict-volga-contract",
      primaryProfileId: "src_sdk_verifier",
      reason: "phone_match",
      state: "open",
      tenantId: "tenant-volga"
    });
    await repository.saveClientMergeConflict({
      candidateProfileId: "src_sdk_verifier_secondary",
      id: "conflict-lumen-contract",
      primaryProfileId: "src_sdk_verifier",
      reason: "phone_match",
      state: "open",
      tenantId: "tenant-lumen"
    });
    await repository.saveTemplate({
      channel: "SDK",
      id: "tpl-volga-contract",
      scope: "team",
      tenantId: "tenant-volga",
      text: "Volga template",
      title: "Volga template",
      topic: "Delivery",
      updated: "2026-06-29T12:00:00.000Z",
      usage: 0,
      version: 1
    });
    await repository.saveTemplate({
      channel: "SDK",
      id: "tpl-lumen-contract",
      scope: "team",
      tenantId: "tenant-lumen",
      text: "Lumen template",
      title: "Lumen template",
      topic: "Delivery",
      updated: "2026-06-29T12:01:00.000Z",
      usage: 0,
      version: 1
    });

    const checks = createWorkspaceRepositoryTenantIsolationChecks(repository, {
      fileId: "file-volga-contract",
      idempotencyKey: "scan-volga-key",
      sourceProfileId: "src_sdk_verifier",
      templateId: "tpl-volga-contract",
      tenantId: "tenant-volga"
    });

    assert.deepEqual(checks.map((check) => check.id), [
      "workspace.findFile",
      "workspace.findClientProfile",
      "workspace.listClientMergeEvents",
      "workspace.listClientMergeConflicts",
      "workspace.findTemplate",
      "workspace.listTemplates",
      "workspace.findFileScanResultIdempotency"
    ]);
    const loadedRows = await Promise.all(checks.map(async (check) => check.loadRows()));
    assert.deepEqual(loadedRows.map((rows) => rows.length), [1, 1, 1, 1, 1, 1, 1]);
    assert.equal(loadedRows[0][0]?.fileId, "file-volga-contract");
    assert.equal(loadedRows[1][0]?.id, "client-volga-contract");
    assert.equal(loadedRows[2][0]?.id, "merge-volga-contract");
    assert.equal(loadedRows[3][0]?.id, "conflict-volga-contract");
    assert.equal(loadedRows[4][0]?.id, "tpl-volga-contract");
    assert.equal(loadedRows[5][0]?.id, "tpl-volga-contract");
    assert.equal(loadedRows[6][0]?.key, "scan-volga-key");
    assert.equal((await repository.findFile("file-lumen-contract", { tenantId: "tenant-volga" })), undefined);
    assert.equal((await repository.findClientProfile("src_sdk_verifier")), undefined);
    assert.deepEqual((await repository.listClientMergeEvents({ tenantId: "tenant-volga" })).map((event) => event.id), ["merge-volga-contract"]);
    assert.deepEqual((await repository.listClientMergeConflicts({ tenantId: "tenant-volga" })).map((conflict) => conflict.id), ["conflict-volga-contract"]);
    assert.equal((await repository.findTemplate("tpl-lumen-contract", { tenantId: "tenant-volga" })), undefined);
    assert.deepEqual((await repository.listTemplates({ tenantId: "tenant-volga" })).map((template) => template.id), ["tpl-volga-contract"]);
    assert.equal((await repository.findFileScanResultIdempotency("scan-lumen-key", { tenantId: "tenant-volga" })), undefined);

    const report = await verifyTenantIsolationChecks(checks);
    assert.equal(report.status, "pass");
    assert.equal(report.checked, 7);
    assert.deepEqual(report.failures, []);
  });

  it("fails workspace checks when file ownership leaks another tenant", async () => {
    const checks = createWorkspaceRepositoryTenantIsolationChecks({
      findFile: () => ({ fileId: "file-lumen", tenantId: "tenant-lumen" }),
      findClientProfile: () => ({ id: "client-lumen", sourceProfileId: "src-lumen", tenantId: "tenant-lumen" }),
      listClientMergeEvents: () => [{ id: "merge-lumen", tenantId: "tenant-lumen" }],
      listClientMergeConflicts: () => [{ id: "conflict-lumen", tenantId: "tenant-lumen" }],
      findTemplate: () => ({ id: "tpl-lumen", tenantId: "tenant-lumen" }),
      listTemplates: () => [{ id: "tpl-lumen", tenantId: "tenant-lumen" }],
      findFileScanResultIdempotency: () => ({ fileId: "file-lumen", key: "scan-lumen", tenantId: "tenant-lumen" })
    }, {
      fileId: "file-volga",
      idempotencyKey: "scan-volga",
      sourceProfileId: "src-volga",
      templateId: "tpl-volga",
      tenantId: "tenant-volga"
    });

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "fail");
    assert.deepEqual(report.failures.map((failure) => failure.checkId), [
      "workspace.findFile",
      "workspace.findClientProfile",
      "workspace.listClientMergeEvents",
      "workspace.listClientMergeConflicts",
      "workspace.findTemplate",
      "workspace.listTemplates",
      "workspace.findFileScanResultIdempotency"
    ]);
    assert.ok(report.failures.every((failure) => failure.leakedTenantIds.includes("tenant-lumen")));
  });

  it("covers billing tenant-owned repository reads with concrete isolation checks", async () => {
    const repository = createSeededBillingRepository();
    await repository.recordQuotaLedgerEntry({
      createdAt: "2026-06-29T12:00:00.000Z",
      decision: "allow",
      id: "ledger-volga-contract",
      idempotencyKey: "ledger-volga-key",
      limit: 100,
      mode: "record",
      planId: "business",
      projected: 11,
      reason: null,
      remainingAfter: 89,
      remainingBefore: 90,
      requested: 1,
      requestFingerprint: "ledger-volga-fp",
      resource: "operators",
      tenantId: "tenant-volga",
      traceId: "trace-ledger-volga",
      used: 10
    });
    await repository.recordQuotaLedgerEntry({
      createdAt: "2026-06-29T12:01:00.000Z",
      decision: "allow",
      id: "ledger-lumen-contract",
      idempotencyKey: "ledger-lumen-key",
      limit: 100,
      mode: "record",
      planId: "business",
      projected: 21,
      reason: null,
      remainingAfter: 79,
      remainingBefore: 80,
      requested: 1,
      requestFingerprint: "ledger-lumen-fp",
      resource: "operators",
      tenantId: "tenant-lumen",
      traceId: "trace-ledger-lumen",
      used: 20
    });
    await repository.createQuotaReservation({
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-06-29T12:02:00.000Z",
      expiresAt: "2026-06-29T12:12:00.000Z",
      id: "reservation-volga-contract",
      idempotencyKey: "reservation-volga-key",
      limit: 100,
      planId: "business",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 2,
      requestFingerprint: "reservation-volga-fp",
      resource: "operators",
      status: "reserved",
      tenantId: "tenant-volga",
      traceId: "trace-reservation-volga",
      updatedAt: "2026-06-29T12:02:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });
    await repository.createQuotaReservation({
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-06-29T12:03:00.000Z",
      expiresAt: "2026-06-29T12:13:00.000Z",
      id: "reservation-lumen-contract",
      idempotencyKey: "reservation-lumen-key",
      limit: 100,
      planId: "business",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 2,
      requestFingerprint: "reservation-lumen-fp",
      resource: "operators",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trace-reservation-lumen",
      updatedAt: "2026-06-29T12:03:00.000Z",
      usedAfter: null,
      usedBefore: 20
    });

    const checks = createBillingRepositoryTenantIsolationChecks(repository, "tenant-volga");
    assert.deepEqual(checks.map((check) => check.id), [
      "billing.findTenant",
      "billing.findTenantSubscription",
      "billing.listTenantInvoices",
      "billing.listQuotaLedgerEntries",
      "billing.listQuotaReservations"
    ]);
    const loadedRows = await Promise.all(checks.map(async (check) => check.loadRows()));
    assert.ok(loadedRows.every((rows) => rows.length > 0));

    const report = await verifyTenantIsolationChecks(checks);
    assert.equal(report.status, "pass");
    assert.equal(report.checked, 5);
    assert.deepEqual(report.failures, []);
  });

  it("fails billing repository checks when quota reads leak another tenant", async () => {
    const checks = createBillingRepositoryTenantIsolationChecks({
      findTenant: () => ({ id: "tenant-volga", tenantId: "tenant-volga" }),
      findTenantSubscription: () => ({ id: "sub-volga", tenantId: "tenant-volga" }),
      listTenantInvoices: () => [{ id: "invoice-volga", tenantId: "tenant-volga" }],
      listQuotaLedgerEntries: () => [{ id: "ledger-lumen", tenantId: "tenant-lumen" }],
      listQuotaReservations: () => [{ id: "reservation-lumen", tenantId: "tenant-lumen" }]
    }, "tenant-volga");

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "fail");
    assert.deepEqual(report.failures.map((failure) => failure.checkId), [
      "billing.listQuotaLedgerEntries",
      "billing.listQuotaReservations"
    ]);
    assert.ok(report.failures.every((failure) => failure.leakedTenantIds.includes("tenant-lumen")));
  });

  it("covers routing tenant-owned repository reads with concrete isolation checks", async () => {
    const repository = RoutingRepository.inMemory();
    await repository.saveRoutingRule({
      channel: "VK",
      enabled: true,
      id: "rule-volga-contract",
      limitMode: "operator_channel_limit",
      priorityStrategy: "least_loaded",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z",
      waitThresholdSeconds: 180
    });
    await repository.saveRoutingRule({
      channel: "VK",
      enabled: true,
      id: "rule-lumen-contract",
      limitMode: "operator_channel_limit",
      priorityStrategy: "least_loaded",
      tenantId: "tenant-lumen",
      updatedAt: "2026-06-29T12:00:00.000Z",
      waitThresholdSeconds: 180
    });
    await repository.saveQueueMembership({
      active: true,
      id: "membership-volga-contract",
      operatorId: "operator-anna",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z"
    });
    await repository.saveQueueMembership({
      active: true,
      id: "membership-lumen-contract",
      operatorId: "operator-anna",
      queueId: "VK",
      role: "primary",
      tenantId: "tenant-lumen",
      updatedAt: "2026-06-29T12:00:00.000Z"
    });
    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 12,
      id: "capacity-volga-contract",
      operatorId: "operator-anna",
      overrideAllowed: false,
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z"
    });
    await repository.saveOperatorCapacity({
      channel: "VK",
      chatLimit: 12,
      id: "capacity-lumen-contract",
      operatorId: "operator-anna",
      overrideAllowed: false,
      tenantId: "tenant-lumen",
      updatedAt: "2026-06-29T12:00:00.000Z"
    });

    const checks = createRoutingRepositoryTenantIsolationChecks(repository, "tenant-volga");
    assert.deepEqual(checks.map((check) => check.id), [
      "routing.listRoutingRules",
      "routing.listQueueMemberships",
      "routing.listOperatorCapacities"
    ]);

    const report = await verifyTenantIsolationChecks(checks);
    assert.equal(report.status, "pass");
    assert.equal(report.checked, 3);
    assert.deepEqual(report.failures, []);
  });

  it("fails routing repository checks when routing reads leak another tenant", async () => {
    const checks = createRoutingRepositoryTenantIsolationChecks({
      listOperatorCapacities: () => [{ id: "capacity-lumen", tenantId: "tenant-lumen" }],
      listQueueMemberships: () => [{ id: "membership-lumen", tenantId: "tenant-lumen" }],
      listRoutingRules: () => [{ id: "rule-lumen", tenantId: "tenant-lumen" }]
    }, "tenant-volga");

    const report = await verifyTenantIsolationChecks(checks);

    assert.equal(report.status, "fail");
    assert.deepEqual(report.failures.map((failure) => failure.checkId), [
      "routing.listRoutingRules",
      "routing.listQueueMemberships",
      "routing.listOperatorCapacities"
    ]);
    assert.ok(report.failures.every((failure) => failure.leakedTenantIds.includes("tenant-lumen")));
  });
});

const tenantIsolationRouteSuites = [
  {
    file: "tests/workspace-contracts.test.ts",
    pattern: "binds file service operations to authenticated tenant context instead of request tenant parameters"
  },
  {
    file: "tests/billing-service-admin-contracts.test.ts",
    pattern: "binds service-admin impersonation routes to the approved tenant context"
  },
  {
    file: "tests/integration-contracts.test.ts",
    pattern: "authenticates public API keys with environment binding and required scopes"
  }
];

describe("tenant isolation route verification gates", () => {
  for (const suite of tenantIsolationRouteSuites) {
    it(`passes ${suite.file} tenant route isolation gates`, () => {
      const result = spawnSync(process.execPath, [
        "--test",
        "--import",
        "tsx",
        suite.file,
        "--test-name-pattern",
        suite.pattern
      ], {
        cwd: new URL("..", import.meta.url),
        encoding: "utf8"
      });

      assert.equal(result.status, 0, [
        result.stdout,
        result.stderr
      ].filter(Boolean).join("\n"));
    });
  }
});
