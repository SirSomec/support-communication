import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createDeterministicObjectStorageSigner, createS3CompatibleObjectStorageSigner } from "../apps/api-gateway/src/workspace/object-storage.ts";
import { WorkspaceRepository, type ClientProfileRecord, type KnowledgeArticle, type TemplateRecord } from "../apps/api-gateway/src/workspace/workspace.repository.ts";
import { WorkspaceService } from "../apps/api-gateway/src/workspace/workspace.service.ts";
import { TopicDirectoryService } from "../apps/api-gateway/src/workspace/topic-directory.service.ts";

type ClientProfileIdentityRepository = {
  findClientProfile(sourceProfileId: string, scope?: { tenantId?: string }): ClientProfileIdentityRecord | Promise<ClientProfileIdentityRecord | undefined> | undefined;
  listClientMergeConflicts(filters?: ClientMergeConflictFilters): ClientMergeConflictRecord[] | Promise<ClientMergeConflictRecord[]>;
  listClientMergeEvents(filters?: ClientMergeGraphFilters): ClientMergeGraphEvent[] | Promise<ClientMergeGraphEvent[]>;
  saveClientMergeConflict(conflict: ClientMergeConflictRecord): ClientMergeConflictRecord | Promise<ClientMergeConflictRecord>;
  listClientProfiles(scope?: { tenantId?: string }): ClientProfileIdentityRecord[] | Promise<ClientProfileIdentityRecord[]>;
  saveClientMergeEvent(event: ClientMergeGraphEvent): ClientMergeGraphEvent | Promise<ClientMergeGraphEvent>;
  saveClientProfile(profile: ClientProfileIdentityRecord): ClientProfileIdentityRecord | Promise<ClientProfileIdentityRecord>;
  updateClientMergeConflictState(conflictId: string, state: ClientMergeConflictState): ClientMergeConflictRecord | Promise<ClientMergeConflictRecord | undefined> | undefined;
};

describe("topic directory settings contracts", () => {
  it("manages hierarchical topics and preserves archived topics out of active options", async () => {
    const service = new TopicDirectoryService();

    const initial = await service.fetchTopics({ tenantId: "tenant-northstar" });
    assert.equal(initial.status, "ok");
    assert.ok(initial.data.directory.length >= 3);
    assert.ok(initial.data.activeOptions.every((option: string) => !option.includes("Смена карты")));

    const created = await service.createTopic({
      accessScope: "admins",
      branchName: "Статус",
      channels: ["Telegram", "MAX"],
      groupName: "Заказ",
      name: "Перенос доставки",
      required: true,
      routingTarget: "VIP support"
    }, { tenantId: "tenant-northstar" });
    assert.equal(created.status, "ok");
    assert.equal(created.data.topic.name, "Перенос доставки");
    assert.equal(created.data.topic.archived, false);
    assert.match(created.data.auditEvent.id, /^evt_topic_directory_/);

    const updated = await service.updateTopic(created.data.topic.id, {
      channels: ["Telegram"],
      required: false,
      routingTarget: "Line 1"
    });
    assert.equal(updated.status, "ok");
    assert.deepEqual(updated.data.topic.channels, ["Telegram"]);
    assert.equal(updated.data.topic.required, false);

    const usage = await service.fetchTopicUsage(created.data.topic.id);
    assert.equal(usage.status, "ok");
    assert.equal(usage.data.canHardDelete, false);
    assert.ok(usage.data.usage.dialogs >= 0);

    const archived = await service.archiveTopic(created.data.topic.id, { reason: "Duplicate topic" });
    assert.equal(archived.status, "ok");
    assert.equal(archived.data.topic.archived, true);

    const afterArchive = await service.fetchTopics({ tenantId: "tenant-northstar" });
    assert.equal(afterArchive.data.activeOptions.includes("Заказ / Перенос доставки"), false);
    assert.ok(afterArchive.data.directory.some((group: Record<string, unknown>) => JSON.stringify(group).includes("Перенос доставки")));

    const restored = await service.restoreTopic(created.data.topic.id, { reason: "Needed for routing" });
    assert.equal(restored.status, "ok");
    assert.equal(restored.data.topic.archived, false);
  });

  it("keeps topic directory mutations visible across service instances", async () => {
    const first = new TopicDirectoryService();
    const created = await first.createTopic({
      branchName: "SLA",
      channels: ["SDK"],
      groupName: "Quality",
      name: `Persistent topic ${Date.now()}`,
      routingTarget: "Senior operators"
    }, { tenantId: "tenant-northstar" });
    assert.equal(created.status, "ok");

    const second = new TopicDirectoryService();
    const fetched = await second.fetchTopics({ query: created.data.topic.name, tenantId: "tenant-northstar" });
    assert.equal(fetched.status, "ok");
    assert.equal(fetched.data.topics.some((topic: Record<string, unknown>) => topic.id === created.data.topic.id), true);
  });
});

type TemplateRecordRepository = {
  findTemplate(templateId: string, scope?: { tenantId?: string }): TemplateRecord | Promise<TemplateRecord | undefined> | undefined;
  listTemplates(scope?: { tenantId?: string }): TemplateRecord[] | Promise<TemplateRecord[]>;
  saveTemplate(template: TemplateRecord): TemplateRecord | Promise<TemplateRecord>;
};

type TemplateVersionRecord = {
  channel: string;
  id: string;
  scope: string;
  templateId: string;
  text: string;
  title: string;
  topic: string;
  updated: string;
  usage: number;
  version: number;
};

type TemplateVersionRepository = {
  findTemplateVersion(templateId: string, version: number): TemplateVersionRecord | Promise<TemplateVersionRecord | undefined> | undefined;
  listTemplateVersions(templateId: string): TemplateVersionRecord[] | Promise<TemplateVersionRecord[]>;
  saveTemplateVersion(version: TemplateVersionRecord): TemplateVersionRecord | Promise<TemplateVersionRecord>;
};

type TemplateAuditRecord = {
  action: string;
  id: string;
  immutable: true;
  reason?: string;
  templateId: string;
  timestamp: string;
};

type TemplateAuditRepository = {
  findTemplateAuditEvent(auditId: string): TemplateAuditRecord | Promise<TemplateAuditRecord | undefined> | undefined;
  listTemplateAuditEvents(templateId: string): TemplateAuditRecord[] | Promise<TemplateAuditRecord[]>;
  saveTemplateAuditEvent(event: TemplateAuditRecord): TemplateAuditRecord | Promise<TemplateAuditRecord>;
};

type KnowledgeArticleRecordRepository = {
  findKnowledgeArticle(articleId: string, scope?: { tenantId?: string }): KnowledgeArticle | Promise<KnowledgeArticle | undefined> | undefined;
  listKnowledgeArticles(scope?: { tenantId?: string }): KnowledgeArticle[] | Promise<KnowledgeArticle[]>;
  saveKnowledgeArticle(article: KnowledgeArticle): KnowledgeArticle | Promise<KnowledgeArticle>;
  updateKnowledgeArticlePublicationState(articleId: string, state: KnowledgeArticlePublicationState): KnowledgeArticle | Promise<KnowledgeArticle | undefined> | undefined;
};

type KnowledgeArticlePublicationState = {
  status: string;
  updated: string;
  visibility: string;
};

type KnowledgeDraftVersionRecord = {
  articleId: string;
  author: string;
  body: string;
  changes?: string;
  id: string;
  label: string;
  status: string;
  updated: string;
};

type KnowledgeDraftVersionState = {
  status: string;
  updated: string;
};

type KnowledgeDraftVersionRepository = {
  findKnowledgeDraftVersion(articleId: string, draftId: string, scope?: { tenantId?: string }): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord | undefined> | undefined;
  listKnowledgeDraftVersions(articleId: string, scope?: { tenantId?: string }): KnowledgeDraftVersionRecord[] | Promise<KnowledgeDraftVersionRecord[]>;
  saveKnowledgeDraftVersion(version: KnowledgeDraftVersionRecord): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord>;
  updateKnowledgeDraftVersionState(articleId: string, draftId: string, state: KnowledgeDraftVersionState): KnowledgeDraftVersionRecord | Promise<KnowledgeDraftVersionRecord | undefined> | undefined;
};

type KnowledgeApprovalDecisionRecord = {
  action: string;
  actor: string;
  articleId: string;
  draftId?: string;
  id: string;
  immutable: true;
  reason?: string;
  timestamp: string;
};

type KnowledgeApprovalDecisionRepository = {
  findKnowledgeApprovalDecision(articleId: string, decisionId: string, scope?: { tenantId?: string }): KnowledgeApprovalDecisionRecord | Promise<KnowledgeApprovalDecisionRecord | undefined> | undefined;
  listKnowledgeApprovalDecisions(articleId: string, scope?: { tenantId?: string }): KnowledgeApprovalDecisionRecord[] | Promise<KnowledgeApprovalDecisionRecord[]>;
  saveKnowledgeApprovalDecision(decision: KnowledgeApprovalDecisionRecord): KnowledgeApprovalDecisionRecord | Promise<KnowledgeApprovalDecisionRecord>;
};

type ClientProfileIdentityRecord = ClientProfileRecord & {
  tenantId: string;
};

type ClientMergeGraphEvent = {
  action: string;
  candidateProfileId?: string;
  detachedProfileId?: string;
  id: string;
  immutable: true;
  mergeGraphEdge: string;
  primaryProfileId: string;
  reason?: string;
  tenantId: string;
};

type ClientMergeGraphFilters = {
  candidateProfileId?: string;
  detachedProfileId?: string;
  primaryProfileId?: string;
  tenantId?: string;
};

type ClientMergeConflictState = "open" | "resolved" | "dismissed";

type ClientMergeConflictRecord = {
  candidateProfileId: string;
  conflictingFields: string[];
  id: string;
  primaryProfileId: string;
  reason: string;
  state: ClientMergeConflictState;
  tenantId: string;
};

type ClientMergeConflictFilters = {
  primaryProfileId?: string;
  state?: ClientMergeConflictState;
  tenantId?: string;
};

describe("phase 3 files, clients, templates and knowledge backend contracts", () => {
  it("lists client profiles with merge graph and masks sensitive fields by policy", async () => {
    const workspace = new WorkspaceService();

    const masked = await workspace.fetchClientProfiles({ maskSensitive: true, page: 1, pageSize: 5 });

    assert.equal(masked.service, "clientService");
    assert.equal(masked.operation, "fetchClientProfiles");
    assert.equal(masked.partial, true);
    assert.equal(masked.data.pagination.mode, "backend-ready");
    assert.ok(masked.data.items.length > 0);
    assert.match(masked.data.items[0].phone, /^\+7 \*\*\* \*\*\*-\*\*-\d{2}$/);
    assert.ok(masked.data.mergeGraph.length > 0);
    assert.ok(masked.data.mergeGraph.every((node) => node.profileId.startsWith("src_")));

    const callerRequestedUnmasked = await workspace.fetchClientProfiles({ maskSensitive: false });
    assert.match(callerRequestedUnmasked.data.items[0].phone, /^\+7 \*\*\* \*\*\*-\*\*-\d{2}$/);
    assert.equal(callerRequestedUnmasked.meta.sensitiveFieldsMasked, true);
  });

  it("creates merge and unmerge audit descriptors while preserving source profile ids", async () => {
    const workspace = new WorkspaceService();

    const merge = await workspace.mergeClientProfiles({
      primaryProfileId: "src_sdk_maria",
      candidateProfileId: "src_telegram_dmitry",
      reason: "Duplicate customer confirmed by support"
    });

    assert.equal(merge.status, "ok");
    assert.deepEqual(merge.data.sourceProfileIds, ["src_sdk_maria", "src_telegram_dmitry"]);
    assert.equal(merge.data.mergeGraphEdge, "src_sdk_maria->src_telegram_dmitry");
    assert.equal(merge.data.auditEvent.immutable, true);
    assert.match(merge.data.auditEvent.id, /^evt_client_merge_/);

    const missingReason = await workspace.mergeClientProfiles({
      primaryProfileId: "src_sdk_maria",
      candidateProfileId: "src_telegram_dmitry",
      reason: ""
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "reason_required");

    const unmerge = await workspace.unmergeClientProfile({
      primaryProfileId: "src_sdk_maria",
      detachedProfileId: "src_telegram_dmitry",
      reason: "Manual detach after conflict review"
    });
    assert.equal(unmerge.status, "ok");
    assert.equal(unmerge.data.conflictResolution, "manual_detach");
    assert.match(unmerge.data.auditEvent.id, /^evt_client_merge_/);
  });

  it("returns client segment descriptors and filters profiles by segment", async () => {
    const workspace = new WorkspaceService();

    const segments = await workspace.fetchClientSegments();
    const sdkSegment = segments.data.segments.find((segment: Record<string, unknown>) => segment.id === "channel:SDK");
    const segmentedProfiles = await workspace.fetchClientProfiles({ segmentId: "channel:SDK" });

    assert.equal(segments.status, "ok");
    assert.equal(segments.operation, "fetchClientSegments");
    assert.ok(sdkSegment);
    assert.equal(sdkSegment.label, "SDK");
    assert.equal(sdkSegment.count, 2);
    assert.equal(segmentedProfiles.status, "ok");
    assert.equal(segmentedProfiles.data.pagination.total, 2);
    assert.equal(segmentedProfiles.data.items.every((profile: Record<string, unknown>) => profile.channel === "SDK"), true);
    assert.deepEqual(segmentedProfiles.data.segment, {
      count: 2,
      dimension: "channel",
      id: "channel:SDK",
      label: "SDK"
    });
  });

  it("creates client export descriptors with masked fields and immutable audit evidence", async () => {
    const workspace = new WorkspaceService();

    const exported = await workspace.createClientExport({
      format: "json",
      reason: "Segment export requested by support lead",
      segmentId: "channel:SDK"
    });

    assert.equal(exported.status, "ok");
    assert.equal(exported.operation, "createClientExport");
    assert.match(exported.data.exportId, /^client_export_/);
    assert.equal(exported.data.status, "queued");
    assert.equal(exported.data.segment.id, "channel:SDK");
    assert.equal(exported.data.itemCount, 2);
    assert.equal(exported.data.fileDescriptor.fileName.endsWith(".json"), true);
    assert.equal(exported.data.auditEvent.immutable, true);
    assert.match(exported.data.auditEvent.id, /^evt_client_export_/);
    assert.equal(exported.data.previewRows.every((profile: Record<string, unknown>) => /^\+7 \*\*\* \*\*\*-\*\*-\d{2}$/.test(String(profile.phone))), true);

    const missingReason = await workspace.createClientExport({
      format: "json",
      reason: "",
      segmentId: "channel:SDK"
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "reason_required");
  });

  it("persists client profile identity records behind tenant-scoped repository reads", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as ClientProfileIdentityRepository;
    const volgaProfile = clientProfile({
      id: "maria",
      phone: "+7 999 204-18-44",
      sourceProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    });
    const lumenProfile = clientProfile({
      id: "ivan",
      phone: "+7 916 777-11-22",
      sourceProfileId: "src_sdk_maria",
      tenantId: "tenant-lumen"
    });

    await repository.saveClientProfile(volgaProfile);
    await repository.saveClientProfile(lumenProfile);

    const volgaProfiles = await repository.listClientProfiles({ tenantId: "tenant-volga" });
    assert.deepEqual(volgaProfiles.map((profile) => profile.sourceProfileId), ["src_sdk_maria"]);

    const found = await repository.findClientProfile("src_sdk_maria", { tenantId: "tenant-volga" });
    assert.equal(found?.tenantId, "tenant-volga");
    assert.equal(found?.phone, "+7 999 204-18-44");

    const unscoped = await repository.findClientProfile("src_sdk_maria");
    assert.equal(unscoped, undefined);

    const crossTenant = await repository.findClientProfile("src_sdk_maria", { tenantId: "tenant-lumen" });
    assert.equal(crossTenant?.tenantId, "tenant-lumen");
    assert.equal(crossTenant?.phone, "+7 916 777-11-22");

    const allProfiles = await repository.listClientProfiles();
    assert.deepEqual(allProfiles.map((profile) => `${profile.tenantId}:${profile.sourceProfileId}`).sort(), [
      "tenant-lumen:src_sdk_maria",
      "tenant-volga:src_sdk_maria"
    ]);
  });

  it("persists client merge graph edges behind filtered repository reads", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as ClientProfileIdentityRepository;
    await repository.saveClientMergeEvent(clientMergeGraphEvent({
      candidateProfileId: "src_telegram_dmitry",
      id: "evt_merge_volga_1",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    await repository.saveClientMergeEvent(clientMergeGraphEvent({
      candidateProfileId: "src_sdk_ivan",
      id: "evt_merge_lumen_1",
      primaryProfileId: "src_sdk_lumen",
      tenantId: "tenant-lumen"
    }));
    await repository.saveClientMergeEvent(clientMergeGraphEvent({
      action: "client.unmerge",
      detachedProfileId: "src_sdk_olga",
      id: "evt_unmerge_volga_1",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));

    const volgaEdges = await repository.listClientMergeEvents({ tenantId: "tenant-volga" });
    assert.deepEqual(volgaEdges.map((event) => event.mergeGraphEdge), [
      "src_sdk_maria->src_telegram_dmitry",
      "src_sdk_maria->src_sdk_olga"
    ]);
    assert.equal(volgaEdges[0]?.immutable, true);

    const primaryEdges = await repository.listClientMergeEvents({
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    });
    assert.deepEqual(primaryEdges.map((event) => event.id), ["evt_merge_volga_1", "evt_unmerge_volga_1"]);

    const candidateEdges = await repository.listClientMergeEvents({
      candidateProfileId: "src_telegram_dmitry",
      tenantId: "tenant-volga"
    });
    assert.deepEqual(candidateEdges.map((event) => event.id), ["evt_merge_volga_1"]);

    const detachedEdges = await repository.listClientMergeEvents({
      detachedProfileId: "src_sdk_olga",
      tenantId: "tenant-volga"
    });
    assert.deepEqual(detachedEdges.map((event) => event.id), ["evt_unmerge_volga_1"]);

    const crossTenantEdges = await repository.listClientMergeEvents({
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-lumen"
    });
    assert.deepEqual(crossTenantEdges, []);
  });

  it("replays duplicate client merge graph edges and rejects conflicting immutable event ids", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as ClientProfileIdentityRepository;
    const original = await repository.saveClientMergeEvent(clientMergeGraphEvent({
      candidateProfileId: "src_telegram_dmitry",
      id: "merge_replay_1",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    const duplicate = await repository.saveClientMergeEvent(clientMergeGraphEvent({
      candidateProfileId: "src_telegram_dmitry",
      id: "merge_replay_duplicate",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    const unmerge = await repository.saveClientMergeEvent(clientMergeGraphEvent({
      action: "client.unmerge",
      detachedProfileId: "src_telegram_dmitry",
      id: "unmerge_replay_1",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));

    assert.equal(duplicate.id, original.id);
    assert.equal(unmerge.id, "unmerge_replay_1");
    assert.deepEqual((await repository.listClientMergeEvents({ tenantId: "tenant-volga" })).map((event) => event.id), [
      "merge_replay_1",
      "unmerge_replay_1"
    ]);
    assert.throws(() => repository.saveClientMergeEvent(clientMergeGraphEvent({
      candidateProfileId: "src_vk_ivan",
      id: "merge_replay_1",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    })), /Client merge event merge_replay_1 conflicts with existing immutable event/);
  });

  it("persists client merge conflicts with filtered reads and state transitions", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as ClientProfileIdentityRepository;
    await repository.saveClientMergeConflict(clientMergeConflict({
      candidateProfileId: "src_telegram_dmitry",
      id: "conflict_volga_phone",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    await repository.saveClientMergeConflict(clientMergeConflict({
      candidateProfileId: "src_sdk_ivan",
      id: "conflict_lumen_device",
      primaryProfileId: "src_sdk_lumen",
      tenantId: "tenant-lumen"
    }));

    const volgaOpenConflicts = await repository.listClientMergeConflicts({
      state: "open",
      tenantId: "tenant-volga"
    });
    assert.deepEqual(volgaOpenConflicts.map((conflict) => conflict.id), ["conflict_volga_phone"]);
    assert.deepEqual(volgaOpenConflicts[0]?.conflictingFields, ["phone"]);

    const resolved = await repository.updateClientMergeConflictState("conflict_volga_phone", "resolved");
    assert.equal(resolved?.state, "resolved");

    const resolvedByPrimary = await repository.listClientMergeConflicts({
      primaryProfileId: "src_sdk_maria",
      state: "resolved",
      tenantId: "tenant-volga"
    });
    assert.deepEqual(resolvedByPrimary.map((conflict) => conflict.id), ["conflict_volga_phone"]);

    const crossTenantConflicts = await repository.listClientMergeConflicts({
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-lumen"
    });
    assert.deepEqual(crossTenantConflicts, []);
  });

  it("fails closed for malformed client merge conflict states", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as ClientProfileIdentityRepository;
    await repository.saveClientMergeConflict(clientMergeConflict({
      candidateProfileId: "src_telegram_dmitry",
      id: "conflict_malformed_state",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));

    assert.throws(() => repository.saveClientMergeConflict({
      ...clientMergeConflict({
        candidateProfileId: "src_vk_ivan",
        id: "conflict_bad_save",
        primaryProfileId: "src_sdk_maria",
        tenantId: "tenant-volga"
      }),
      state: "queued" as ClientMergeConflictState
    }), /Unsupported client merge conflict state: queued/);
    assert.throws(() => repository.updateClientMergeConflictState(
      "conflict_malformed_state",
      "queued" as ClientMergeConflictState
    ), /Unsupported client merge conflict state: queued/);
    assert.equal((await repository.listClientMergeConflicts({
      tenantId: "tenant-volga"
    }))[0]?.state, "open");
  });

  it("persists client identity, merge graph and conflicts across JSON repository instances", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "support-workspace-json-"));
    const storeFile = join(workspace, "workspace.json");
    try {
      const firstRepository = WorkspaceRepository.open({ filePath: storeFile }) as unknown as ClientProfileIdentityRepository;
      await firstRepository.saveClientProfile(clientProfile({
        id: "maria",
        phone: "+7 999 204-18-44",
        sourceProfileId: "src_sdk_maria",
        tenantId: "tenant-volga"
      }));
      await firstRepository.saveClientMergeEvent(clientMergeGraphEvent({
        candidateProfileId: "src_telegram_dmitry",
        id: "evt_merge_json_1",
        primaryProfileId: "src_sdk_maria",
        tenantId: "tenant-volga"
      }));
      await firstRepository.saveClientMergeConflict(clientMergeConflict({
        candidateProfileId: "src_telegram_dmitry",
        id: "conflict_json_1",
        primaryProfileId: "src_sdk_maria",
        tenantId: "tenant-volga"
      }));

      const secondRepository = WorkspaceRepository.open({ filePath: storeFile }) as unknown as ClientProfileIdentityRepository;
      assert.equal((await secondRepository.findClientProfile("src_sdk_maria", { tenantId: "tenant-volga" }))?.phone, "+7 999 204-18-44");
      assert.deepEqual((await secondRepository.listClientMergeEvents({ tenantId: "tenant-volga" })).map((event) => event.id), ["evt_merge_json_1"]);
      assert.deepEqual((await secondRepository.listClientMergeConflicts({ state: "open", tenantId: "tenant-volga" })).map((conflict) => conflict.id), ["conflict_json_1"]);

      await secondRepository.updateClientMergeConflictState("conflict_json_1", "resolved");

      const thirdRepository = WorkspaceRepository.open({ filePath: storeFile }) as unknown as ClientProfileIdentityRepository;
      assert.deepEqual((await thirdRepository.listClientMergeConflicts({ state: "resolved", tenantId: "tenant-volga" })).map((conflict) => conflict.id), ["conflict_json_1"]);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("creates file upload, finalize and permission-aware download policy descriptors", async () => {
    const workspace = new WorkspaceService();

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "delivery-map.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024
    });
    assert.equal(upload.status, "ok");
    assert.equal(upload.data.storageState, "upload_descriptor_ready");
    assert.equal(upload.data.scanState, "pending");
    assert.equal(upload.data.objectKeyExposed, false);
    assert.ok(upload.data.signedUpload.url.startsWith("https://storage.local/upload/"));

    const prematureDownload = await workspace.getDownloadPolicy(upload.data.fileId, { canDownload: true });
    assert.equal(prematureDownload.status, "denied");
    assert.equal(prematureDownload.error?.code, "file_not_ready");

    const finalized = await workspace.finalizeUpload({
      fileId: upload.data.fileId,
      checksum: "sha256-demo"
    });
    assert.equal(finalized.status, "ok");
    assert.equal(finalized.data.scanState, "scan_pending");
    assert.equal(finalized.data.downloadPolicy.permissionRequired, "files.read");

    const scanPendingDownload = await workspace.getDownloadPolicy(upload.data.fileId, { canDownload: true });
    assert.equal(scanPendingDownload.status, "denied");
    assert.equal(scanPendingDownload.error?.code, "file_not_ready");

    const download = await workspace.getDownloadPolicy(upload.data.fileId, { requestedRoleMode: "employee" });
    assert.equal(download.status, "denied");
    assert.equal(download.error?.code, "file_permission_denied");

    const selfAssertedAdmin = await workspace.getDownloadPolicy(upload.data.fileId, { requestedRoleMode: "admin" });
    assert.equal(selfAssertedAdmin.status, "denied");
    assert.equal(selfAssertedAdmin.error?.code, "file_permission_denied");
  });

  it("denies upload descriptors when the channel does not support attachments", async () => {
    const workspace = new WorkspaceService(WorkspaceRepository.inMemory());

    const denied = await workspace.createUploadDescriptor({
      channel: "SMS",
      fileName: "sms-proof.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024
    });

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "attachment_channel_unsupported");
    assert.equal(denied.data.channel, "SMS");
    assert.equal(denied.data.objectKeyExposed, false);
    assert.equal(JSON.stringify(denied).includes("objects/obj_"), false);
  });

  it("returns upload denial audit descriptors for unsupported attachment channels without object keys", async () => {
    const workspace = new WorkspaceService(WorkspaceRepository.inMemory());

    const denied = await workspace.createUploadDescriptor({
      channel: "SMS",
      fileName: "sms-audit.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024
    }, { tenantId: "tenant-lumen" });

    assert.equal(denied.status, "denied");
    assert.equal(denied.data.auditEvent.action, "file.upload_descriptor_denied");
    assert.equal(denied.data.auditEvent.reason, "attachment_channel_unsupported");
    assert.equal(denied.data.auditEvent.channel, "SMS");
    assert.equal(denied.data.auditEvent.immutable, true);
    assert.equal(denied.data.auditEvent.objectKeyExposed, false);
    assert.equal(JSON.stringify(denied.data.auditEvent).includes("objects/obj_"), false);
  });

  it("denies upload descriptors when the tenant attachment quota would be exceeded", async () => {
    const repository = WorkspaceRepository.inMemory();
    const saveCalls: Array<Record<string, unknown>> = [];
    const quotaChecks: Array<Record<string, unknown>> = [];
    const signUploadCalls: Array<Record<string, unknown>> = [];
    const originalSaveFile = repository.saveFile.bind(repository);
    (repository as unknown as {
      saveFile(file: Record<string, unknown>): Promise<Record<string, unknown>> | Record<string, unknown>;
    }).saveFile = async (file) => {
      saveCalls.push(file);
      return originalSaveFile(file as never) as Promise<Record<string, unknown>> | Record<string, unknown>;
    };
    const workspace = new WorkspaceService(repository, {
      fileUploadQuota: {
        checkFileUpload: async (input: Record<string, unknown>) => {
          quotaChecks.push(input);
          return {
            allowed: false,
            limitBytes: 4096,
            remainingBytes: 512,
            usedBytes: 3584
          };
        }
      },
      objectStorage: {
        signUpload: async (input) => {
          signUploadCalls.push(input);
          throw new Error("signUpload must not run for quota-denied uploads");
        },
        signDownload: async () => ({
          method: "GET",
          url: "https://storage.example.test/download/unreachable",
          expiresAt: "2026-06-28T12:30:00.000Z"
        })
      }
    });

    const denied = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "quota-proof.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024
    }, { tenantId: "tenant-lumen" });

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "attachment_quota_exceeded");
    assert.deepEqual(quotaChecks, [{
      channel: "SDK",
      requestedBytes: 1024,
      resource: "storage",
      tenantId: "tenant-lumen"
    }]);
    assert.equal(denied.data.limitBytes, 4096);
    assert.equal(denied.data.remainingBytes, 512);
    assert.equal(denied.data.usedBytes, 3584);
    assert.equal(denied.data.objectKeyExposed, false);
    assert.deepEqual(signUploadCalls, []);
    assert.deepEqual(saveCalls, []);
    assert.equal(JSON.stringify(denied).includes("objects/obj_"), false);
  });

  it("returns upload denial audit descriptors for tenant quota blocks without object keys", async () => {
    const workspace = new WorkspaceService(WorkspaceRepository.inMemory(), {
      fileUploadQuota: {
        checkFileUpload: async () => ({
          allowed: false,
          limitBytes: 4096,
          remainingBytes: 512,
          usedBytes: 3584
        })
      }
    });

    const denied = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "quota-audit.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024
    }, { tenantId: "tenant-lumen" });

    assert.equal(denied.status, "denied");
    assert.equal(denied.data.auditEvent.action, "file.upload_descriptor_denied");
    assert.equal(denied.data.auditEvent.reason, "attachment_quota_exceeded");
    assert.equal(denied.data.auditEvent.channel, "SDK");
    assert.equal(denied.data.auditEvent.immutable, true);
    assert.equal(denied.data.auditEvent.objectKeyExposed, false);
    assert.equal(JSON.stringify(denied.data.auditEvent).includes("objects/obj_"), false);
  });

  it("denies upload descriptors when tenant file metadata already has too many pending uploads", async () => {
    const repository = WorkspaceRepository.inMemory();
    const saveCalls: Array<Record<string, unknown>> = [];
    const signUploadCalls: Array<Record<string, unknown>> = [];
    for (let index = 0; index < 25; index += 1) {
      await repository.saveFile({
        auditId: `evt_pending_upload_${index}`,
        channel: "SDK",
        fileId: `file_pending_upload_${index}`,
        fileName: `pending-${index}.pdf`,
        mimeType: "application/pdf",
        objectKey: `objects/obj_pending_${index}`,
        scanState: "pending",
        sizeBytes: 256,
        storageState: "upload_descriptor_ready",
        tenantId: "tenant-lumen"
      });
    }
    const originalSaveFile = repository.saveFile.bind(repository);
    (repository as unknown as {
      saveFile(file: Record<string, unknown>): Promise<Record<string, unknown>> | Record<string, unknown>;
    }).saveFile = async (file) => {
      saveCalls.push(file);
      return originalSaveFile(file as never) as Promise<Record<string, unknown>> | Record<string, unknown>;
    };
    const workspace = new WorkspaceService(repository, {
      objectStorage: {
        signUpload: async (input) => {
          signUploadCalls.push(input);
          throw new Error("signUpload must not run when pending upload state blocks descriptor creation");
        },
        signDownload: async () => ({
          method: "GET",
          url: "https://storage.example.test/download/unreachable",
          expiresAt: "2026-06-28T12:30:00.000Z"
        })
      }
    });

    const denied = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "too-many-pending.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024
    }, { tenantId: "tenant-lumen" });

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "attachment_upload_state_limit_exceeded");
    assert.equal(denied.data.pendingUploadDescriptors, 25);
    assert.equal(denied.data.pendingUploadDescriptorLimit, 25);
    assert.equal(denied.data.objectKeyExposed, false);
    assert.deepEqual(signUploadCalls, []);
    assert.deepEqual(saveCalls, []);
    assert.equal(JSON.stringify(denied).includes("objects/obj_"), false);
  });

  it("returns upload denial audit descriptors for pending file-state limits without object keys", async () => {
    const repository = WorkspaceRepository.inMemory();
    for (let index = 0; index < 25; index += 1) {
      await repository.saveFile({
        auditId: `evt_pending_audit_upload_${index}`,
        channel: "SDK",
        fileId: `file_pending_audit_upload_${index}`,
        fileName: `pending-audit-${index}.pdf`,
        mimeType: "application/pdf",
        objectKey: `objects/obj_pending_audit_${index}`,
        scanState: "pending",
        sizeBytes: 256,
        storageState: "upload_descriptor_ready",
        tenantId: "tenant-lumen"
      });
    }
    const workspace = new WorkspaceService(repository);

    const denied = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "pending-audit-blocked.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024
    }, { tenantId: "tenant-lumen" });

    assert.equal(denied.status, "denied");
    assert.equal(denied.data.auditEvent.action, "file.upload_descriptor_denied");
    assert.equal(denied.data.auditEvent.reason, "attachment_upload_state_limit_exceeded");
    assert.equal(denied.data.auditEvent.channel, "SDK");
    assert.equal(denied.data.auditEvent.immutable, true);
    assert.equal(denied.data.auditEvent.objectKeyExposed, false);
    assert.equal(JSON.stringify(denied.data.auditEvent).includes("objects/obj_"), false);
  });

  it("denies upload finalize when object storage metadata is missing", async () => {
    const repository = WorkspaceRepository.inMemory();
    const metadataCalls: Array<Record<string, unknown>> = [];
    const workspace = new WorkspaceService(repository, {
      objectStorage: createDeterministicObjectStorageSigner({
        onMetadataInput: (input) => metadataCalls.push(input)
      })
    });

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "missing-object.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048
    });

    const finalized = await workspace.finalizeUpload({
      fileId: String(upload.data.fileId),
      checksum: "sha256-missing-object"
    });
    const stored = await repository.findFile(String(upload.data.fileId));

    assert.equal(finalized.status, "denied");
    assert.equal(finalized.error?.code, "object_metadata_missing");
    assert.equal(finalized.data.fileId, upload.data.fileId);
    assert.equal(JSON.stringify(finalized).includes(String(stored?.objectKey)), false);
    assert.deepEqual(metadataCalls.map((call) => call.fileId), [upload.data.fileId]);
    assert.equal(stored?.storageState, "upload_descriptor_ready");
    assert.equal(stored?.scanState, "pending");
    assert.equal(stored?.checksum, undefined);
  });

  it("denies upload finalize when object storage size does not match the upload descriptor", async () => {
    const repository = WorkspaceRepository.inMemory();
    const workspace = new WorkspaceService(repository, {
      objectStorage: createDeterministicObjectStorageSigner({
        metadata: () => ({
          sizeBytes: 1024,
          checksum: "sha256-size-mismatch"
        })
      })
    });

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "wrong-size.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048
    });

    const finalized = await workspace.finalizeUpload({
      fileId: String(upload.data.fileId),
      checksum: "sha256-size-mismatch"
    });
    const stored = await repository.findFile(String(upload.data.fileId));

    assert.equal(finalized.status, "denied");
    assert.equal(finalized.error?.code, "object_size_mismatch");
    assert.equal(finalized.data.fileId, upload.data.fileId);
    assert.equal(finalized.data.expectedSizeBytes, 2048);
    assert.equal(finalized.data.actualSizeBytes, 1024);
    assert.equal(JSON.stringify(finalized).includes(String(stored?.objectKey)), false);
    assert.equal(stored?.storageState, "upload_descriptor_ready");
    assert.equal(stored?.scanState, "pending");
    assert.equal(stored?.checksum, undefined);
  });

  it("denies upload finalize when object storage checksum does not match the finalize checksum", async () => {
    const repository = WorkspaceRepository.inMemory();
    const workspace = new WorkspaceService(repository, {
      objectStorage: createDeterministicObjectStorageSigner({
        metadata: () => ({
          sizeBytes: 4096,
          checksum: "sha256-actual-object"
        })
      })
    });

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "wrong-checksum.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096
    });

    const finalized = await workspace.finalizeUpload({
      fileId: String(upload.data.fileId),
      checksum: "sha256-client-claim"
    });
    const stored = await repository.findFile(String(upload.data.fileId));

    assert.equal(finalized.status, "denied");
    assert.equal(finalized.error?.code, "object_checksum_mismatch");
    assert.equal(finalized.data.fileId, upload.data.fileId);
    assert.equal(JSON.stringify(finalized).includes("sha256-actual-object"), false);
    assert.equal(JSON.stringify(finalized).includes(String(stored?.objectKey)), false);
    assert.equal(stored?.storageState, "upload_descriptor_ready");
    assert.equal(stored?.scanState, "pending");
    assert.equal(stored?.checksum, undefined);
  });

  it("approves upload finalize when object storage metadata matches the upload descriptor", async () => {
    const repository = WorkspaceRepository.inMemory();
    const metadataCalls: Array<Record<string, unknown>> = [];
    const workspace = new WorkspaceService(repository, {
      objectStorage: createDeterministicObjectStorageSigner({
        metadata: () => ({
          sizeBytes: 3072,
          checksum: "sha256-verified-object"
        }),
        onMetadataInput: (input) => metadataCalls.push(input)
      })
    });

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "verified-object.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3072
    });

    const finalized = await workspace.finalizeUpload({
      fileId: String(upload.data.fileId),
      checksum: "sha256-verified-object"
    });
    const stored = await repository.findFile(String(upload.data.fileId));

    assert.equal(finalized.status, "ok");
    assert.equal(finalized.data.fileId, upload.data.fileId);
    assert.equal(finalized.data.storageState, "uploaded");
    assert.equal(finalized.data.scanState, "scan_pending");
    assert.equal(finalized.data.checksum, "sha256-verified-object");
    assert.deepEqual(metadataCalls.map((call) => call.fileId), [upload.data.fileId]);
    assert.equal(stored?.storageState, "uploaded");
    assert.equal(stored?.scanState, "scan_pending");
    assert.equal(stored?.checksum, "sha256-verified-object");
  });

  it("returns upload finalize audit descriptors without exposing object keys", async () => {
    const repository = WorkspaceRepository.inMemory();
    const workspace = new WorkspaceService(repository, {
      objectStorage: createDeterministicObjectStorageSigner({
        metadata: (input) => input.fileName === "audit-success.pdf"
          ? { sizeBytes: 512, checksum: "sha256-audit-success" }
          : { sizeBytes: 128, checksum: "sha256-audit-denied" }
      })
    });

    const successUpload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "audit-success.pdf",
      mimeType: "application/pdf",
      sizeBytes: 512
    });
    const deniedUpload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "audit-denied.pdf",
      mimeType: "application/pdf",
      sizeBytes: 256
    });

    const success = await workspace.finalizeUpload({
      fileId: String(successUpload.data.fileId),
      checksum: "sha256-audit-success"
    });
    const denied = await workspace.finalizeUpload({
      fileId: String(deniedUpload.data.fileId),
      checksum: "sha256-audit-denied"
    });
    const successStored = await repository.findFile(String(successUpload.data.fileId));
    const deniedStored = await repository.findFile(String(deniedUpload.data.fileId));

    assert.equal(success.status, "ok");
    assert.equal(denied.status, "denied");
    assert.equal(success.data.auditEvent.action, "file.upload.finalized");
    assert.equal(denied.data.auditEvent.action, "file.upload.finalize_denied");
    assert.equal(success.data.auditEvent.objectKeyExposed, false);
    assert.equal(denied.data.auditEvent.objectKeyExposed, false);
    assert.equal(JSON.stringify(success.data.auditEvent).includes(String(successStored?.objectKey)), false);
    assert.equal(JSON.stringify(denied.data.auditEvent).includes(String(deniedStored?.objectKey)), false);
  });

  it("applies antivirus scan results to durable file metadata and gates downloads", async () => {
    const repository = WorkspaceRepository.inMemory();
    const workspace = new WorkspaceService(repository, {
      objectStorage: {
        signUpload: async (input) => ({
          method: "PUT",
          url: `https://storage.example.test/upload/${input.objectKey}`,
          expiresAt: "2026-06-28T12:15:00.000Z"
        }),
        signDownload: async (input) => ({
          method: "GET",
          url: `https://storage.example.test/download/${input.objectKey}`,
          expiresAt: "2026-06-28T12:30:00.000Z"
        })
      }
    });
    assert.equal(typeof (workspace as unknown as { recordScanResult?: unknown }).recordScanResult, "function");
    const recordScanResult = (workspace as unknown as {
      recordScanResult(input: {
        checkedAt?: string;
        fileId: string;
        idempotencyKey?: string;
        reason?: string;
        scanner?: string;
        verdict: "clean" | "error" | "infected";
      }): Promise<Record<string, any>>;
    }).recordScanResult.bind(workspace);

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "scan-clean.pdf",
      mimeType: "application/pdf",
      sizeBytes: 256
    });
    await workspace.finalizeUpload({ fileId: String(upload.data.fileId), checksum: "sha256-clean" });

    const cleanScan = await recordScanResult({
      fileId: String(upload.data.fileId),
      verdict: "clean",
      scanner: "clamav",
      checkedAt: "2026-06-28T12:20:00.000Z"
    });
    assert.equal(cleanScan.status, "ok");
    assert.equal(cleanScan.data.scanState, "scan_clean");
    assert.equal(cleanScan.data.scanVerdict, "clean");
    assert.equal(cleanScan.data.downloadPolicy.signedUrlAvailable, true);
    const cleanStored = await repository.findFile(String(upload.data.fileId));
    const cleanScanMetadata = cleanStored as typeof cleanStored & { scanCheckedAt?: string; scanner?: string };
    assert.equal(cleanScanMetadata?.scanCheckedAt, "2026-06-28T12:20:00.000Z");
    assert.equal(cleanScanMetadata?.scanner, "clamav");

    const download = await workspace.getDownloadPolicy(String(upload.data.fileId), { canDownload: true });
    assert.equal(download.status, "ok");
    assert.equal(download.data.signedUrl, `https://storage.example.test/download/${cleanStored?.objectKey}`);

    const infectedUpload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "scan-blocked.pdf",
      mimeType: "application/pdf",
      sizeBytes: 512
    });
    await workspace.finalizeUpload({ fileId: String(infectedUpload.data.fileId), checksum: "sha256-blocked" });
    const blockedScan = await recordScanResult({
      fileId: String(infectedUpload.data.fileId),
      verdict: "infected",
      scanner: "clamav",
      checkedAt: "2026-06-28T12:25:00.000Z",
      reason: "Eicar-Test-Signature"
    });
    assert.equal(blockedScan.status, "ok");
    assert.equal(blockedScan.data.scanState, "scan_blocked");
    assert.equal(blockedScan.data.scanVerdict, "infected");
    assert.equal(blockedScan.data.downloadPolicy.signedUrlAvailable, false);

    const blockedDownload = await workspace.getDownloadPolicy(String(infectedUpload.data.fileId), { canDownload: true });
    assert.equal(blockedDownload.status, "denied");
    assert.equal(blockedDownload.error?.code, "file_scan_blocked");

    const failedUpload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "scan-error.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128
    });
    await workspace.finalizeUpload({ fileId: String(failedUpload.data.fileId), checksum: "sha256-error" });
    const failedScan = await recordScanResult({
      fileId: String(failedUpload.data.fileId),
      verdict: "error",
      scanner: "clamav",
      checkedAt: "2026-06-28T12:35:00.000Z",
      reason: "scanner timeout"
    });
    assert.equal(failedScan.status, "ok");
    assert.equal(failedScan.data.scanState, "scan_failed");
    assert.equal(failedScan.data.downloadPolicy.signedUrlAvailable, false);
    const failedDownload = await workspace.getDownloadPolicy(String(failedUpload.data.fileId), { canDownload: true });
    assert.equal(failedDownload.status, "denied");
    assert.equal(failedDownload.error?.code, "file_not_ready");

    const legacyCleanStateUpload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "legacy-clean-state.pdf",
      mimeType: "application/pdf",
      sizeBytes: 64
    });
    await workspace.finalizeUpload({ fileId: String(legacyCleanStateUpload.data.fileId), checksum: "sha256-legacy" });
    const legacyStored = await repository.findFile(String(legacyCleanStateUpload.data.fileId));
    assert.ok(legacyStored);
    await repository.saveFile({
      ...legacyStored,
      scanState: "scan_clean",
      scanVerdict: "pending"
    });
    const legacyStateOnlyDownload = await workspace.getDownloadPolicy(String(legacyCleanStateUpload.data.fileId), { canDownload: true });
    assert.equal(legacyStateOnlyDownload.status, "denied");
    assert.equal(legacyStateOnlyDownload.error?.code, "file_not_ready");
  });

  it("replays scanner callbacks idempotently and rejects reused keys with different results", async () => {
    const workspace = new WorkspaceService(WorkspaceRepository.inMemory(), {
      objectStorage: {
        signUpload: async (input) => ({
          method: "PUT",
          url: `https://storage.example.test/upload/${input.objectKey}`,
          expiresAt: "2026-06-28T12:15:00.000Z"
        }),
        signDownload: async (input) => ({
          method: "GET",
          url: `https://storage.example.test/download/${input.objectKey}`,
          expiresAt: "2026-06-28T12:30:00.000Z"
        })
      }
    });
    const recordScanResult = (workspace as unknown as {
      recordScanResult(input: {
        checkedAt?: string;
        fileId: string;
        idempotencyKey?: string;
        reason?: string;
        scanner?: string;
        verdict: "clean" | "infected";
      }): Promise<Record<string, any>>;
    }).recordScanResult.bind(workspace);
    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "scanner-callback.pdf",
      mimeType: "application/pdf",
      sizeBytes: 256
    });
    await workspace.finalizeUpload({ fileId: String(upload.data.fileId), checksum: "sha256-callback" });

    const first = await recordScanResult({
      fileId: String(upload.data.fileId),
      idempotencyKey: "scan-callback-clean-001",
      verdict: "clean",
      scanner: "clamav",
      checkedAt: "2026-06-28T12:45:00.000Z"
    });
    const duplicate = await recordScanResult({
      fileId: String(upload.data.fileId),
      idempotencyKey: "scan-callback-clean-001",
      verdict: "clean",
      scanner: "clamav",
      checkedAt: "2026-06-28T12:45:00.000Z"
    });
    const conflict = await recordScanResult({
      fileId: String(upload.data.fileId),
      idempotencyKey: "scan-callback-clean-001",
      verdict: "infected",
      scanner: "clamav",
      checkedAt: "2026-06-28T12:46:00.000Z",
      reason: "different scanner result"
    });

    assert.equal(first.status, "ok");
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.deepEqual(duplicate.data.fileId, first.data.fileId);
    assert.deepEqual(duplicate.data.scanState, first.data.scanState);
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "idempotency_key_reused");
  });

  it("keeps scanner callback idempotency stable without checkedAt and prevents conflict writes", async () => {
    const repository = WorkspaceRepository.inMemory();
    const workspace = new WorkspaceService(repository);
    const recordScanResult = (workspace as unknown as {
      recordScanResult(input: {
        fileId: string;
        idempotencyKey?: string;
        reason?: string;
        scanner?: string;
        verdict: "clean" | "infected";
      }): Promise<Record<string, any>>;
    }).recordScanResult.bind(workspace);
    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "scanner-callback-no-time.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128
    });
    await workspace.finalizeUpload({ fileId: String(upload.data.fileId), checksum: "sha256-no-time" });

    const OriginalDate = Date;
    try {
      class FirstDate extends OriginalDate {
        constructor(value?: string | number | Date) {
          super(value ?? "2026-06-28T12:50:00.000Z");
        }

        static now() {
          return new OriginalDate("2026-06-28T12:50:00.000Z").getTime();
        }
      }
      globalThis.Date = FirstDate as DateConstructor;
      const first = await recordScanResult({
        fileId: String(upload.data.fileId),
        idempotencyKey: "scan-callback-no-time",
        verdict: "clean",
        scanner: "clamav"
      });

      class SecondDate extends OriginalDate {
        constructor(value?: string | number | Date) {
          super(value ?? "2026-06-28T12:55:00.000Z");
        }

        static now() {
          return new OriginalDate("2026-06-28T12:55:00.000Z").getTime();
        }
      }
      globalThis.Date = SecondDate as DateConstructor;
      const duplicate = await recordScanResult({
        fileId: String(upload.data.fileId),
        idempotencyKey: "scan-callback-no-time",
        verdict: "clean",
        scanner: "clamav"
      });
      const conflict = await recordScanResult({
        fileId: String(upload.data.fileId),
        idempotencyKey: "scan-callback-no-time",
        verdict: "infected",
        scanner: "clamav",
        reason: "late conflicting scanner response"
      });

      assert.equal(first.status, "ok");
      assert.equal(duplicate.status, "ok");
      assert.equal(duplicate.data.duplicate, true);
      assert.equal(conflict.status, "conflict");
      assert.equal(conflict.error?.code, "idempotency_key_reused");
      const stored = await repository.findFile(String(upload.data.fileId));
      assert.equal(stored?.scanState, "scan_clean");
      assert.equal(stored?.scanVerdict, "clean");
    } finally {
      globalThis.Date = OriginalDate;
    }
  });

  it("issues signed upload and download URLs through the object storage signer", async () => {
    const repository = WorkspaceRepository.inMemory();
    const signerCalls: Array<Record<string, unknown>> = [];
    const workspace = new WorkspaceService(repository, {
      objectStorage: {
        signUpload: async (input) => {
          signerCalls.push({ operation: "upload", ...input });
          return {
            method: "PUT",
            url: `https://minio.example.test/upload/${input.objectKey}`,
            expiresAt: "2026-06-28T12:15:00.000Z",
            headers: {
              "content-type": input.contentType
            }
          };
        },
        signDownload: async (input) => {
          signerCalls.push({ operation: "download", ...input });
          return {
            method: "GET",
            url: `https://minio.example.test/download/${input.objectKey}`,
            expiresAt: "2026-06-28T12:30:00.000Z"
          };
        }
      }
    });

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "signed-map.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096
    }, {
      tenantId: "tenant-lumen"
    });

    assert.equal(upload.status, "ok");
    assert.equal(upload.data.objectKeyExposed, false);
    assert.doesNotMatch(String(upload.data.signedUpload.url), /tenant-lumen|signed-map\.pdf/);
    assert.match(String(upload.data.signedUpload.url), /^https:\/\/minio\.example\.test\/upload\/objects\/obj_/);
    assert.equal("objectKey" in upload.data, false);
    assert.deepEqual(upload.data.signedUpload.headers, {
      "content-type": "application/pdf"
    });

    await workspace.finalizeUpload({ fileId: String(upload.data.fileId), checksum: "sha256-signed" });
    const recordScanResult = (workspace as unknown as {
      recordScanResult(input: {
        checkedAt?: string;
        fileId: string;
        scanner?: string;
        verdict: "clean";
      }): Promise<Record<string, any>>;
    }).recordScanResult.bind(workspace);
    await recordScanResult({
      fileId: String(upload.data.fileId),
      verdict: "clean",
      scanner: "clamav",
      checkedAt: "2026-06-28T12:20:00.000Z"
    });

    const download = await workspace.getDownloadPolicy(String(upload.data.fileId), { canDownload: true });

    assert.equal(download.status, "ok");
    assert.doesNotMatch(String(download.data.signedUrl), /tenant-lumen|signed-map\.pdf/);
    assert.match(String(download.data.signedUrl), /^https:\/\/minio\.example\.test\/download\/objects\/obj_/);
    assert.equal(download.data.expiresAt, "2026-06-28T12:30:00.000Z");
    const signedObjectKey = String(signerCalls[0].objectKey);
    assert.deepEqual(signerCalls, [
      {
        operation: "upload",
        contentType: "application/pdf",
        fileId: upload.data.fileId,
        fileName: "signed-map.pdf",
        objectKey: signedObjectKey,
        sizeBytes: 4096,
        tenantId: "tenant-lumen"
      },
      {
        operation: "download",
        fileId: upload.data.fileId,
        fileName: "signed-map.pdf",
        objectKey: signedObjectKey,
        tenantId: "tenant-lumen"
      }
    ]);
    assert.match(signedObjectKey, /^objects\/obj_/);
  });

  it("sanitizes file names without leaking tenant or file names into signed storage URLs", async () => {
    const workspace = new WorkspaceService(WorkspaceRepository.inMemory(), {
      objectStorage: createS3CompatibleObjectStorageSigner({
        S3_ACCESS_KEY: "minio",
        S3_BUCKET: "support-communication-local",
        S3_ENDPOINT: "http://127.0.0.1:9000",
        S3_REGION: "us-east-1",
        S3_SECRET_KEY: "minio-password"
      }, {
        now: () => new Date("2026-06-28T12:00:00.000Z")
      })
    });

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "../evil.pdf",
      mimeType: "application/pdf",
      sizeBytes: 64
    }, {
      tenantId: "tenant-lumen"
    });

    assert.equal(upload.status, "ok");
    assert.match(upload.data.signedUpload.url, /\/objects\/obj_[^/?]+\?/);
    assert.doesNotMatch(upload.data.signedUpload.url, /tenant-lumen|evil\.pdf/);
    assert.doesNotMatch(upload.data.signedUpload.url, /\.\./);
    assert.equal(upload.data.fileName, "evil.pdf");
  });

  it("does not trust tenant ids supplied in upload request bodies", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const workspace = new WorkspaceService(WorkspaceRepository.inMemory(), {
      objectStorage: {
        signUpload: async (input) => {
          calls.push(input);
          return { method: "PUT", url: `https://storage.example.test/${input.objectKey}`, expiresAt: "2026-06-28T12:15:00.000Z" };
        },
        signDownload: async (input) => ({ method: "GET", url: `https://storage.example.test/${input.objectKey}`, expiresAt: "2026-06-28T12:30:00.000Z" })
      }
    });

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "tenant-spoof.pdf",
      mimeType: "application/pdf",
      sizeBytes: 32,
      tenantId: "tenant-attacker"
    } as { channel: string; fileName: string; mimeType: string; sizeBytes: number; tenantId: string });

    assert.equal(upload.status, "ok");
    assert.equal(calls[0].tenantId, "tenant-volga");
    assert.doesNotMatch(String(calls[0].objectKey), /tenant-attacker|tenant-volga|tenant-spoof/);
  });

  it("binds file service operations to authenticated tenant context instead of request tenant parameters", async () => {
    const repository = WorkspaceRepository.inMemory();
    const signedUploadTenants: string[] = [];
    const workspace = new WorkspaceService(repository, {
      objectStorage: {
        signUpload: async (input) => {
          signedUploadTenants.push(input.tenantId);
          return { method: "PUT", url: `https://storage.example.test/${input.fileId}`, expiresAt: "2026-06-29T12:15:00.000Z" };
        },
        signDownload: async (input) => ({ method: "GET", url: `https://storage.example.test/${input.fileId}`, expiresAt: "2026-06-29T12:30:00.000Z" })
      }
    });

    const upload = await workspace.createUploadDescriptor({
      channel: "SDK",
      fileName: "tenant-context.pdf",
      mimeType: "application/pdf",
      sizeBytes: 64,
      tenantId: "tenant-attacker"
    } as { channel: string; fileName: string; mimeType: string; sizeBytes: number; tenantId: string }, { tenantId: "tenant-lumen" });
    const fileId = String((upload as { data: { fileId: string } }).data.fileId);
    const stored = await repository.findFile(fileId);

    assert.equal((upload as { status: string }).status, "ok");
    assert.deepEqual(signedUploadTenants, ["tenant-lumen"]);
    assert.equal(stored?.tenantId, "tenant-lumen");

    await repository.saveFile({
      auditId: "audit-cross-tenant-file",
      channel: "SDK",
      fileId: "file-cross-tenant-api",
      fileName: "cross-tenant.pdf",
      mimeType: "application/pdf",
      objectKey: "opaque-cross-tenant",
      scanState: "pending",
      sizeBytes: 10,
      storageState: "upload_descriptor_ready",
      tenantId: "tenant-volga"
    });

    const finalizeCrossTenant = await workspace.finalizeUpload({ checksum: "sha256-cross", fileId: "file-cross-tenant-api" }, { tenantId: "tenant-lumen" });
    assert.equal((finalizeCrossTenant as { status: string }).status, "not_found");
    assert.equal((finalizeCrossTenant as { error?: { code?: string } }).error?.code, "file_not_found");

    const scanCrossTenant = await workspace.recordScanResult({
      fileId: "file-cross-tenant-api",
      idempotencyKey: "scan-cross-tenant-key",
      verdict: "clean"
    }, { tenantId: "tenant-lumen" });
    const downloadCrossTenant = await workspace.getDownloadPolicy("file-cross-tenant-api", { canDownload: true, tenantId: "tenant-lumen" });

    assert.equal((scanCrossTenant as { status: string }).status, "not_found");
    assert.equal((downloadCrossTenant as { status: string }).status, "not_found");
    assert.equal(await repository.findFileScanResultIdempotency("scan-cross-tenant-key"), undefined);
  });

  it("wires file controllers to service-admin tenant context for tenant-owned routes", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/workspace/files.controller.ts", import.meta.url), "utf8");

    assert.match(source, /@Req\(\)\s+request:\s*ServiceAdminRequest/);
    assert.match(source, /tenantContextFromServiceAdminRequest\(request\)/);
    assert.match(source, /createUploadDescriptor\(payload,\s*tenantContextFromServiceAdminRequest\(request\)\)/);
    assert.match(source, /finalizeUpload\(\{\s*\.\.\.payload,\s*fileId\s*\},\s*tenantContextFromServiceAdminRequest\(request\)\)/s);
    assert.match(source, /recordScanResult\(\s*\{\s*\.\.\.payload,\s*fileId,\s*idempotencyKey:/s);
    assert.match(source, /getDownloadPolicy\(fileId,\s*\{\s*canDownload:\s*true,\s*\.\.\.tenantContextFromServiceAdminRequest\(request\)\s*\}\)/s);
  });

  it("builds S3-compatible presigned object storage URLs from runtime configuration", async () => {
    const signer = createS3CompatibleObjectStorageSigner({
      S3_ACCESS_KEY: "minio",
      S3_BUCKET: "support-communication-local",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_REGION: "us-east-1",
      S3_SECRET_KEY: "minio-password"
    }, {
      now: () => new Date("2026-06-28T12:00:00.000Z")
    });

    const upload = await signer.signUpload({
      contentType: "application/pdf",
      fileId: "file_s3_001",
      fileName: "contract.pdf",
      objectKey: "tenant-volga/file_s3_001/contract.pdf",
      sizeBytes: 8192,
      tenantId: "tenant-volga"
    });
    const download = await signer.signDownload({
      fileId: "file_s3_001",
      fileName: "contract.pdf",
      objectKey: "tenant-volga/file_s3_001/contract.pdf",
      tenantId: "tenant-volga"
    });

    assert.equal(upload.method, "PUT");
    assert.equal(download.method, "GET");
    assert.match(upload.url, /^http:\/\/127\.0\.0\.1:9000\/support-communication-local\/tenant-volga\/file_s3_001\/contract\.pdf\?/);
    assert.match(upload.url, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
    assert.match(upload.url, /X-Amz-Credential=minio%2F20260628%2Fus-east-1%2Fs3%2Faws4_request/);
    assert.match(upload.url, /X-Amz-SignedHeaders=content-type%3Bhost/);
    assert.doesNotMatch(upload.url, /minio-password/);
    assert.match(download.url, /X-Amz-Signature=[a-f0-9]{64}/);
    assert.equal(upload.expiresAt, "2026-06-28T12:15:00.000Z");
    assert.equal(download.expiresAt, "2026-06-28T12:15:00.000Z");
  });

  it("creates deterministic object storage URLs and metadata for finalize tests", async () => {
    const metadataCalls: Array<Record<string, unknown>> = [];
    const signer = createDeterministicObjectStorageSigner({
      metadataByFileId: {
        file_deterministic: {
          checksum: "sha256-deterministic",
          sizeBytes: 512
        }
      },
      onMetadataInput: (input) => metadataCalls.push(input)
    });

    const upload = await signer.signUpload({
      contentType: "application/pdf",
      fileId: "file_deterministic",
      fileName: "contract.pdf",
      objectKey: "objects/obj_deterministic",
      sizeBytes: 512,
      tenantId: "tenant-volga"
    });
    const download = await signer.signDownload({
      fileId: "file_deterministic",
      fileName: "contract.pdf",
      objectKey: "objects/obj_deterministic",
      tenantId: "tenant-volga"
    });
    const metadata = await signer.getObjectMetadata?.({
      fileId: "file_deterministic",
      fileName: "contract.pdf",
      objectKey: "objects/obj_deterministic",
      tenantId: "tenant-volga"
    });

    assert.deepEqual(metadata, { checksum: "sha256-deterministic", sizeBytes: 512 });
    assert.equal(upload.url, "https://storage.example.test/upload/file_deterministic");
    assert.equal(download.url, "https://storage.example.test/download/file_deterministic");
    assert.deepEqual(metadataCalls.map((call) => call.fileId), ["file_deterministic"]);
  });

  it("percent-encodes dot-only object key path segments before signing", async () => {
    const signer = createS3CompatibleObjectStorageSigner({
      S3_ACCESS_KEY: "minio",
      S3_BUCKET: "support-communication-local",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_REGION: "us-east-1",
      S3_SECRET_KEY: "minio-password"
    }, {
      now: () => new Date("2026-06-28T12:00:00.000Z")
    });

    const upload = await signer.signUpload({
      contentType: "application/pdf",
      fileId: "file_dot_segment",
      fileName: "contract.pdf",
      objectKey: "objects/../obj_dot_segment",
      sizeBytes: 128,
      tenantId: "tenant-volga"
    });

    assert.match(upload.url, /\/objects\/%2E%2E\/obj_dot_segment\?/);
    assert.doesNotMatch(upload.url, /\/\.\.(\/|\?)/);
  });

  it("passes server-owned download permission from files controller after guard authorization", async () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/workspace/files.controller.ts", import.meta.url), "utf8");

    assert.match(source, /getDownloadPolicy\(fileId,\s*\{\s*canDownload:\s*true,\s*\.\.\.tenantContextFromServiceAdminRequest\(request\)\s*\}\)/s);
    assert.match(source, /@Post\(":fileId\/scan-result"\)/);
    assert.match(source, /@Headers\("idempotency-key"\)\s+idempotencyKey/);
    assert.match(source, /recordScanResult\(\s*\{\s*\.\.\.payload,\s*fileId,\s*idempotencyKey:\s*idempotencyKey\s*\?\?\s*payload\.idempotencyKey\s*\},\s*tenantContextFromServiceAdminRequest\(request\)\s*\)/s);
    assert.match(source, /tenantContextFromServiceAdminRequest\(request\)/);
  });

  it("returns not_found envelopes for missing durable workspace records", async () => {
    const workspace = new WorkspaceService();

    const finalizeMissing = await workspace.finalizeUpload({ fileId: "file_missing", checksum: "sha256-missing" });
    const downloadMissing = await workspace.getDownloadPolicy("file_missing", { canDownload: true });
    const draftMissing = await workspace.saveKnowledgeArticleDraft({
      articleId: "kb-missing",
      body: "Missing article body",
      reason: "Missing article regression"
    });

    assert.equal(finalizeMissing.status, "not_found");
    assert.equal(finalizeMissing.error?.code, "file_not_found");
    assert.equal(downloadMissing.status, "not_found");
    assert.equal(downloadMissing.error?.code, "file_not_found");
    assert.equal(draftMissing.status, "not_found");
    assert.equal(draftMissing.error?.code, "knowledge_article_not_found");
  });

  it("saves templates with version and audit metadata", async () => {
    const workspace = new WorkspaceService();

    const templates = await workspace.fetchTemplates({ operatorId: "operator-1" });
    assert.equal(templates.service, "templateService");
    assert.equal(templates.partial, true);
    assert.ok(templates.data.items.length > 0);

    const saved = await workspace.saveTemplate({
      channel: "SDK",
      text: "We will check your delivery status.",
      title: "Delivery check",
      topic: "Delivery"
    });
    assert.equal(saved.status, "ok");
    assert.equal(saved.data.version, 1);
    assert.match(saved.data.auditId, /^evt_template_/);
  });

  it("writes template audit rows from saveTemplate responses", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as TemplateRecordRepository & TemplateAuditRepository;
    const workspace = new WorkspaceService(repository as unknown as WorkspaceRepository);

    const saved = await workspace.saveTemplate({
      channel: "SDK",
      id: "tpl_runtime_audit",
      text: "We will check your delivery status.",
      title: "Runtime audit template",
      topic: "Delivery"
    });
    const auditEvents = await repository.listTemplateAuditEvents("tpl_runtime_audit");

    assert.equal(saved.status, "ok");
    assert.equal(saved.data.auditEvent.action, "template.saved");
    assert.equal(saved.data.auditEvent.id, saved.data.auditId);
    assert.deepEqual(auditEvents.map((event) => event.id), [saved.data.auditId]);
    assert.equal(auditEvents[0]?.immutable, true);
    assert.equal(auditEvents[0]?.templateId, "tpl_runtime_audit");
  });

  it("wires template controllers to read/write permissions and tenant context", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/workspace/templates.controller.ts", import.meta.url), "utf8");

    assert.match(source, /@RequireServiceAdminAction\("templates\.read"\)[\s\S]*fetchTemplates\(/);
    assert.match(source, /@RequireServiceAdminAction\("templates\.write"\)[\s\S]*saveTemplate\(/);
    assert.match(source, /fetchTemplates\([\s\S]*@Req\(\)\s+request:\s*TenantOperatorRequest & ServiceAdminRequest[\s\S]*\):\s*Promise<unknown>/);
    assert.match(source, /saveTemplate\([\s\S]*@Req\(\)\s+request:\s*TenantOperatorRequest & ServiceAdminRequest[\s\S]*\):\s*Promise<unknown>/);
    assert.match(source, /this\.workspaceService\.fetchTemplates\(filters,\s*tenantContextFromServiceAdminRequest\(request\)\)/);
    assert.match(source, /this\.workspaceService\.saveTemplate\(payload,\s*tenantContextFromServiceAdminRequest\(request\)\)/);
  });

  it("persists template records behind addressable repository reads", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as TemplateRecordRepository;

    await repository.saveTemplate(templateRecord({
      id: "tpl_delivery_status",
      text: "We are checking your delivery status.",
      title: "Delivery status",
      version: 1
    }));
    await repository.saveTemplate(templateRecord({
      id: "tpl_payment_receipt",
      text: "We found your payment and attached the receipt.",
      title: "Payment receipt",
      topic: "Billing",
      version: 1
    }));
    const updated = await repository.saveTemplate(templateRecord({
      id: "tpl_delivery_status",
      text: "Your delivery status has been refreshed.",
      title: "Delivery status update",
      version: 2
    }));

    const found = await repository.findTemplate("tpl_delivery_status");
    const missing = await repository.findTemplate("tpl_missing");
    const templates = await repository.listTemplates();

    assert.equal(updated.version, 2);
    assert.equal(found?.title, "Delivery status update");
    assert.equal(found?.text, "Your delivery status has been refreshed.");
    assert.equal(missing, undefined);
    assert.deepEqual(templates.map((template) => template.id).sort(), [
      "tpl_delivery_status",
      "tpl_payment_receipt"
    ]);
  });

  it("keeps template visibility scoped to the authenticated tenant", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as TemplateRecordRepository;
    await repository.saveTemplate({
      ...templateRecord({
        id: "tpl_volga_delivery",
        text: "Volga delivery update.",
        title: "Volga delivery",
        version: 1
      }),
      tenantId: "tenant-volga"
    });
    await repository.saveTemplate({
      ...templateRecord({
        id: "tpl_lumen_delivery",
        text: "Lumen delivery update.",
        title: "Lumen delivery",
        version: 1
      }),
      tenantId: "tenant-lumen"
    });

    const volgaTemplates = await repository.listTemplates({ tenantId: "tenant-volga" });
    const lumenTemplateFromVolga = await repository.findTemplate("tpl_lumen_delivery", { tenantId: "tenant-volga" });
    const unscopedTemplates = await repository.listTemplates();

    assert.deepEqual(volgaTemplates.map((template) => template.id), ["tpl_volga_delivery"]);
    assert.equal(lumenTemplateFromVolga, undefined);
    assert.deepEqual(unscopedTemplates.map((template) => template.id).sort(), [
      "tpl_lumen_delivery",
      "tpl_volga_delivery"
    ]);
  });

  it("preserves template version history behind repository reads", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as TemplateVersionRepository;

    await repository.saveTemplateVersion(templateVersion({
      id: "tpl_delivery_status_v1",
      templateId: "tpl_delivery_status",
      text: "We are checking your delivery status.",
      title: "Delivery status",
      version: 1
    }));
    await repository.saveTemplateVersion(templateVersion({
      id: "tpl_delivery_status_v2",
      templateId: "tpl_delivery_status",
      text: "Your delivery status has been refreshed.",
      title: "Delivery status update",
      version: 2
    }));
    await repository.saveTemplateVersion(templateVersion({
      id: "tpl_payment_receipt_v1",
      templateId: "tpl_payment_receipt",
      text: "We found your payment and attached the receipt.",
      title: "Payment receipt",
      topic: "Billing",
      version: 1
    }));

    const deliveryVersions = await repository.listTemplateVersions("tpl_delivery_status");
    const firstVersion = await repository.findTemplateVersion("tpl_delivery_status", 1);
    const missingVersion = await repository.findTemplateVersion("tpl_delivery_status", 99);

    assert.deepEqual(deliveryVersions.map((version) => version.version), [1, 2]);
    assert.deepEqual(deliveryVersions.map((version) => version.id), [
      "tpl_delivery_status_v1",
      "tpl_delivery_status_v2"
    ]);
    assert.equal(firstVersion?.text, "We are checking your delivery status.");
    assert.equal(missingVersion, undefined);
  });

  it("persists template audit rows behind repository reads", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as TemplateAuditRepository;

    await repository.saveTemplateAuditEvent(templateAuditEvent({
      action: "template.created",
      id: "evt_template_delivery_created",
      reason: "Initial delivery template",
      templateId: "tpl_delivery_status"
    }));
    await repository.saveTemplateAuditEvent(templateAuditEvent({
      action: "template.updated",
      id: "evt_template_delivery_updated",
      reason: "Refresh delivery wording",
      templateId: "tpl_delivery_status"
    }));
    await repository.saveTemplateAuditEvent(templateAuditEvent({
      action: "template.created",
      id: "evt_template_payment_created",
      templateId: "tpl_payment_receipt"
    }));

    const deliveryEvents = await repository.listTemplateAuditEvents("tpl_delivery_status");
    const firstEvent = await repository.findTemplateAuditEvent("evt_template_delivery_created");
    const missingEvent = await repository.findTemplateAuditEvent("evt_template_missing");

    assert.deepEqual(deliveryEvents.map((event) => event.id), [
      "evt_template_delivery_created",
      "evt_template_delivery_updated"
    ]);
    assert.deepEqual(deliveryEvents.map((event) => event.immutable), [true, true]);
    assert.equal(firstEvent?.reason, "Initial delivery template");
    assert.equal(missingEvent, undefined);
  });

  it("persists template records, versions and audit rows across JSON repository instances", async () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "workspace-template-json-"));
    const storeFile = join(runtimeDir, "workspace.json");

    try {
      const first = WorkspaceRepository.open({ filePath: storeFile }) as unknown as TemplateRecordRepository & TemplateVersionRepository & TemplateAuditRepository;
      await first.saveTemplate(templateRecord({
        id: "tpl_json_delivery",
        text: "We are checking your delivery status.",
        title: "JSON delivery template",
        version: 1
      }));
      await first.saveTemplateVersion(templateVersion({
        id: "tpl_json_delivery_v1",
        templateId: "tpl_json_delivery",
        text: "We are checking your delivery status.",
        title: "JSON delivery template",
        version: 1
      }));
      await first.saveTemplateAuditEvent(templateAuditEvent({
        action: "template.created",
        id: "evt_template_json_delivery_created",
        reason: "Initial JSON template",
        templateId: "tpl_json_delivery"
      }));

      const second = WorkspaceRepository.open({ filePath: storeFile }) as unknown as TemplateRecordRepository & TemplateVersionRepository & TemplateAuditRepository;
      const template = await second.findTemplate("tpl_json_delivery");
      const versions = await second.listTemplateVersions("tpl_json_delivery");
      const auditEvents = await second.listTemplateAuditEvents("tpl_json_delivery");

      assert.equal(template?.title, "JSON delivery template");
      assert.deepEqual(versions.map((version) => version.id), ["tpl_json_delivery_v1"]);
      assert.deepEqual(auditEvents.map((event) => event.id), ["evt_template_json_delivery_created"]);
    } finally {
      rmSync(runtimeDir, { force: true, recursive: true });
    }
  });

  it("preserves knowledge article versions and approval history", async () => {
    const workspace = new WorkspaceService();

    const articles = await workspace.fetchKnowledgeArticles({ visibility: "public" });
    assert.equal(articles.service, "knowledgeService");
    assert.equal(articles.partial, true);
    assert.ok(articles.data.items.every((article) => article.visibility === "public"));

    const detail = await workspace.fetchKnowledgeArticle("kb-delivery-tracking");
    assert.equal(detail.status, "ok");
    assert.equal(detail.data.article.id, "kb-delivery-tracking");
    assert.ok(detail.data.article.versions.length > 0);
    assert.ok(detail.data.article.approvalHistory.length > 0);

    const draft = await workspace.saveKnowledgeArticleDraft({
      articleId: "kb-delivery-tracking",
      body: "Updated delivery tracking instructions.",
      reason: "Refresh courier SLA wording"
    });
    assert.equal(draft.status, "ok");
    assert.equal(draft.data.article.version, "v4.3-draft");
    assert.equal(draft.data.article.status, "draft");
    assert.match(draft.data.auditEvent.id, /^evt_knowledge_/);
  });

  it("keeps draft knowledge articles out of public visibility lists", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeArticleRecordRepository;
    const workspace = new WorkspaceService(repository as unknown as WorkspaceRepository);

    await repository.saveKnowledgeArticle({
      ...knowledgeArticle({
        id: "kb-public-draft",
        tenantId: "tenant-volga",
        title: "Public flagged draft"
      }),
      status: "draft",
      visibility: "public"
    });
    await repository.saveKnowledgeArticle({
      ...knowledgeArticle({
        id: "kb-public-published",
        tenantId: "tenant-volga",
        title: "Public published"
      }),
      status: "published",
      visibility: "public"
    });

    const publicArticles = await workspace.fetchKnowledgeArticles({ visibility: "public" });

    assert.deepEqual(publicArticles.data.items.map((article) => article.id), ["kb-public-published"]);
    assert.equal(publicArticles.data.items.every((article) => article.status !== "draft"), true);
  });

  it("keeps public visibility lists scoped to published knowledge articles", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeArticleRecordRepository;
    const workspace = new WorkspaceService(repository as unknown as WorkspaceRepository);

    await repository.saveKnowledgeArticle({
      ...knowledgeArticle({
        id: "kb-public-live",
        tenantId: "tenant-volga",
        title: "Published public article"
      }),
      status: "published",
      visibility: "public"
    });
    await repository.saveKnowledgeArticle({
      ...knowledgeArticle({
        id: "kb-public-archived",
        tenantId: "tenant-volga",
        title: "Archived public article"
      }),
      status: "archived",
      visibility: "public"
    });

    const publicArticles = await workspace.fetchKnowledgeArticles({ visibility: "public" });

    assert.deepEqual(publicArticles.data.items.map((article) => article.id), ["kb-public-live"]);
    assert.equal(publicArticles.data.items.every((article) => article.status === "published"), true);
  });

  it("keeps archived knowledge articles out of public visibility while retaining operator review visibility", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeArticleRecordRepository;
    const workspace = new WorkspaceService(repository as unknown as WorkspaceRepository);

    await repository.saveKnowledgeArticle({
      ...knowledgeArticle({
        id: "kb-archived-review",
        tenantId: "tenant-volga",
        title: "Archived review article"
      }),
      status: "archived",
      visibility: "public"
    });

    const publicArticles = await workspace.fetchKnowledgeArticles({ visibility: "public" });
    const allArticles = await workspace.fetchKnowledgeArticles({ visibility: "all" });

    assert.deepEqual(publicArticles.data.items.map((article) => article.id), []);
    assert.deepEqual(allArticles.data.items.map((article) => article.id), ["kb-archived-review"]);
    assert.equal(allArticles.data.items[0].status, "archived");
  });

  it("persists knowledge article records behind tenant-scoped repository reads", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeArticleRecordRepository;

    await repository.saveKnowledgeArticle(knowledgeArticle({
      id: "kb-delivery-status",
      tenantId: "tenant-volga",
      title: "Volga delivery status"
    }));
    await repository.saveKnowledgeArticle(knowledgeArticle({
      id: "kb-delivery-status",
      tenantId: "tenant-lumen",
      title: "Lumen delivery status"
    }));

    const volgaArticles = await repository.listKnowledgeArticles({ tenantId: "tenant-volga" });
    const lumenArticleFromVolga = await repository.findKnowledgeArticle("kb-delivery-status", { tenantId: "tenant-lumen" });
    const allArticles = await repository.listKnowledgeArticles();

    assert.deepEqual(volgaArticles.map((article) => `${article.tenantId}:${article.title}`), [
      "tenant-volga:Volga delivery status"
    ]);
    assert.equal(lumenArticleFromVolga?.title, "Lumen delivery status");
    assert.deepEqual(allArticles.map((article) => `${article.tenantId}:${article.id}`).sort(), [
      "tenant-lumen:kb-delivery-status",
      "tenant-volga:kb-delivery-status"
    ]);
  });

  it("updates knowledge article publication state without changing article identity", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeArticleRecordRepository;

    await repository.saveKnowledgeArticle(knowledgeArticle({
      id: "kb-publication-state",
      tenantId: "tenant-volga",
      title: "Publication state"
    }));

    const archived = await repository.updateKnowledgeArticlePublicationState("kb-publication-state", {
      status: "archived",
      updated: "2026-06-29T16:00:00.000Z",
      visibility: "private"
    });
    const missing = await repository.updateKnowledgeArticlePublicationState("kb-missing", {
      status: "published",
      updated: "2026-06-29T16:01:00.000Z",
      visibility: "public"
    });
    const refetched = await repository.findKnowledgeArticle("kb-publication-state", { tenantId: "tenant-volga" });

    assert.equal(archived?.status, "archived");
    assert.equal(archived?.visibility, "private");
    assert.equal(archived?.updated, "2026-06-29T16:00:00.000Z");
    assert.equal(refetched?.title, "Publication state");
    assert.equal(refetched?.tenantId, "tenant-volga");
    assert.equal(missing, undefined);
  });

  it("persists knowledge draft versions behind article-scoped repository reads", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeDraftVersionRepository;

    await repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-draft-history",
      body: "Initial draft body",
      id: "kb-draft-history-v1",
      label: "v1-draft"
    }));
    await repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-draft-history",
      body: "Updated draft body",
      changes: "Refresh wording",
      id: "kb-draft-history-v2",
      label: "v2-draft"
    }));
    await repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-other",
      body: "Other draft body",
      id: "kb-other-v1",
      label: "v1-draft"
    }));

    const versions = await repository.listKnowledgeDraftVersions("kb-draft-history");
    const first = await repository.findKnowledgeDraftVersion("kb-draft-history", "kb-draft-history-v1");
    const missing = await repository.findKnowledgeDraftVersion("kb-draft-history", "kb-missing");

    assert.deepEqual(versions.map((version) => version.id), [
      "kb-draft-history-v1",
      "kb-draft-history-v2"
    ]);
    assert.equal(first?.body, "Initial draft body");
    assert.equal(versions[1]?.changes, "Refresh wording");
    assert.equal(missing, undefined);
  });

  it("replays duplicate knowledge draft decisions without rewriting the original draft version", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeDraftVersionRepository;

    const original = await repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-draft-replay",
      body: "Replay-safe draft body",
      changes: "Initial replay body",
      id: "kb-draft-replay-v1",
      label: "v1-draft"
    }));
    const replayed = await repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-draft-replay",
      body: "Replay-safe draft body",
      changes: "Initial replay body",
      id: "kb-draft-replay-v1",
      label: "v1-draft",
      updated: "2026-06-29T17:05:00.000Z"
    }));

    const versions = await repository.listKnowledgeDraftVersions("kb-draft-replay");
    const refetched = await repository.findKnowledgeDraftVersion("kb-draft-replay", "kb-draft-replay-v1");

    assert.equal(replayed.updated, original.updated);
    assert.equal(refetched?.updated, original.updated);
    assert.deepEqual(versions.map((version) => version.id), ["kb-draft-replay-v1"]);
  });

  it("rejects conflicting knowledge draft decision replays without rewriting the original draft version", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeDraftVersionRepository;

    const original = await repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-draft-conflict",
      body: "Original draft body",
      id: "kb-draft-conflict-v1",
      label: "v1-draft"
    }));

    assert.throws(() => repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-draft-conflict",
      body: "Conflicting draft body",
      id: "kb-draft-conflict-v1",
      label: "v1-draft",
      updated: "2026-06-29T17:10:00.000Z"
    })), /Knowledge draft version kb-draft-conflict-v1 conflicts with existing draft decision/);

    const refetched = await repository.findKnowledgeDraftVersion("kb-draft-conflict", "kb-draft-conflict-v1");
    assert.equal(refetched?.body, original.body);
    assert.equal(refetched?.updated, original.updated);
  });

  it("keeps knowledge draft version reads scoped to the parent article tenant", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeArticleRecordRepository & KnowledgeDraftVersionRepository;

    await repository.saveKnowledgeArticle(knowledgeArticle({
      id: "kb-draft-tenant-volga",
      tenantId: "tenant-volga",
      title: "Volga draft article"
    }));
    await repository.saveKnowledgeArticle(knowledgeArticle({
      id: "kb-draft-tenant-lumen",
      tenantId: "tenant-lumen",
      title: "Lumen draft article"
    }));
    await repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-draft-tenant-volga",
      body: "Volga draft body",
      id: "kb-draft-tenant-volga-v1",
      label: "v1-draft"
    }));
    await repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-draft-tenant-lumen",
      body: "Lumen draft body",
      id: "kb-draft-tenant-lumen-v1",
      label: "v1-draft"
    }));

    const volgaDrafts = await repository.listKnowledgeDraftVersions("kb-draft-tenant-volga", { tenantId: "tenant-volga" });
    const crossTenantDrafts = await repository.listKnowledgeDraftVersions("kb-draft-tenant-volga", { tenantId: "tenant-lumen" });
    const crossTenantDraft = await repository.findKnowledgeDraftVersion("kb-draft-tenant-volga", "kb-draft-tenant-volga-v1", { tenantId: "tenant-lumen" });

    assert.deepEqual(volgaDrafts.map((draft) => draft.id), ["kb-draft-tenant-volga-v1"]);
    assert.deepEqual(crossTenantDrafts, []);
    assert.equal(crossTenantDraft, undefined);
  });

  it("updates knowledge draft version state without rewriting draft body", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeDraftVersionRepository;

    await repository.saveKnowledgeDraftVersion(knowledgeDraftVersion({
      articleId: "kb-draft-transition",
      body: "Draft body for transition",
      id: "kb-draft-transition-v1",
      label: "v1-draft"
    }));

    const published = await repository.updateKnowledgeDraftVersionState("kb-draft-transition", "kb-draft-transition-v1", {
      status: "published",
      updated: "2026-06-29T17:30:00.000Z"
    });
    const missing = await repository.updateKnowledgeDraftVersionState("kb-draft-transition", "kb-missing", {
      status: "archived",
      updated: "2026-06-29T17:31:00.000Z"
    });
    const refetched = await repository.findKnowledgeDraftVersion("kb-draft-transition", "kb-draft-transition-v1");

    assert.equal(published?.status, "published");
    assert.equal(published?.updated, "2026-06-29T17:30:00.000Z");
    assert.equal(refetched?.body, "Draft body for transition");
    assert.equal(refetched?.label, "v1-draft");
    assert.equal(missing, undefined);
  });

  it("persists knowledge approval decisions behind article-scoped repository reads", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeApprovalDecisionRepository;

    await repository.saveKnowledgeApprovalDecision(knowledgeApprovalDecision({
      action: "sent_for_review",
      articleId: "kb-approval-flow",
      draftId: "kb-approval-flow-v1",
      id: "kb-approval-flow-decision-1",
      reason: "Ready for review"
    }));
    await repository.saveKnowledgeApprovalDecision(knowledgeApprovalDecision({
      action: "approved",
      articleId: "kb-approval-flow",
      draftId: "kb-approval-flow-v1",
      id: "kb-approval-flow-decision-2",
      reason: "Approved by lead"
    }));
    await repository.saveKnowledgeApprovalDecision(knowledgeApprovalDecision({
      action: "approved",
      articleId: "kb-other-approval",
      id: "kb-other-approval-decision-1"
    }));

    const decisions = await repository.listKnowledgeApprovalDecisions("kb-approval-flow");
    const first = await repository.findKnowledgeApprovalDecision("kb-approval-flow", "kb-approval-flow-decision-1");
    const missing = await repository.findKnowledgeApprovalDecision("kb-approval-flow", "kb-missing-decision");

    assert.deepEqual(decisions.map((decision) => decision.id), [
      "kb-approval-flow-decision-1",
      "kb-approval-flow-decision-2"
    ]);
    assert.equal(first?.action, "sent_for_review");
    assert.equal(first?.draftId, "kb-approval-flow-v1");
    assert.equal(first?.immutable, true);
    assert.equal(decisions[1]?.reason, "Approved by lead");
    assert.equal(missing, undefined);
  });

  it("replays duplicate knowledge approval decisions without rewriting immutable decision metadata", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeApprovalDecisionRepository;

    const original = await repository.saveKnowledgeApprovalDecision(knowledgeApprovalDecision({
      action: "approved",
      articleId: "kb-approval-replay",
      draftId: "kb-approval-replay-v1",
      id: "approval-replay-1",
      reason: "Looks ready"
    }));
    const replayed = await repository.saveKnowledgeApprovalDecision(knowledgeApprovalDecision({
      action: "approved",
      articleId: "kb-approval-replay",
      draftId: "kb-approval-replay-v1",
      id: "approval-replay-1",
      reason: "Looks ready",
      timestamp: "2026-06-29T18:05:00.000Z"
    }));

    const decisions = await repository.listKnowledgeApprovalDecisions("kb-approval-replay");
    const refetched = await repository.findKnowledgeApprovalDecision("kb-approval-replay", "approval-replay-1");

    assert.equal(replayed.timestamp, original.timestamp);
    assert.equal(refetched?.timestamp, original.timestamp);
    assert.deepEqual(decisions.map((decision) => decision.id), ["approval-replay-1"]);
  });

  it("rejects conflicting knowledge approval decision replays without rewriting immutable decision metadata", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeApprovalDecisionRepository;

    const original = await repository.saveKnowledgeApprovalDecision(knowledgeApprovalDecision({
      action: "approved",
      articleId: "kb-approval-conflict",
      draftId: "kb-approval-conflict-v1",
      id: "approval-conflict-1",
      reason: "Approved by lead"
    }));

    assert.throws(() => repository.saveKnowledgeApprovalDecision(knowledgeApprovalDecision({
      action: "rejected",
      articleId: "kb-approval-conflict",
      draftId: "kb-approval-conflict-v1",
      id: "approval-conflict-1",
      reason: "Conflicting rejection",
      timestamp: "2026-06-29T18:10:00.000Z"
    })), /Knowledge approval decision approval-conflict-1 conflicts with existing immutable decision/);

    const refetched = await repository.findKnowledgeApprovalDecision("kb-approval-conflict", "approval-conflict-1");
    assert.equal(refetched?.action, original.action);
    assert.equal(refetched?.reason, original.reason);
    assert.equal(refetched?.timestamp, original.timestamp);
  });

  it("keeps knowledge approval decision reads scoped to the parent article tenant", async () => {
    const repository = WorkspaceRepository.inMemory() as unknown as KnowledgeArticleRecordRepository & KnowledgeApprovalDecisionRepository;

    await repository.saveKnowledgeArticle(knowledgeArticle({
      id: "kb-approval-tenant-volga",
      tenantId: "tenant-volga",
      title: "Volga approval article"
    }));
    await repository.saveKnowledgeArticle(knowledgeArticle({
      id: "kb-approval-tenant-lumen",
      tenantId: "tenant-lumen",
      title: "Lumen approval article"
    }));
    await repository.saveKnowledgeApprovalDecision(knowledgeApprovalDecision({
      action: "approved",
      articleId: "kb-approval-tenant-volga",
      id: "kb-approval-tenant-volga-decision-1"
    }));
    await repository.saveKnowledgeApprovalDecision(knowledgeApprovalDecision({
      action: "approved",
      articleId: "kb-approval-tenant-lumen",
      id: "kb-approval-tenant-lumen-decision-1"
    }));

    const volgaDecisions = await repository.listKnowledgeApprovalDecisions("kb-approval-tenant-volga", { tenantId: "tenant-volga" });
    const crossTenantDecisions = await repository.listKnowledgeApprovalDecisions("kb-approval-tenant-volga", { tenantId: "tenant-lumen" });
    const crossTenantDecision = await repository.findKnowledgeApprovalDecision("kb-approval-tenant-volga", "kb-approval-tenant-volga-decision-1", { tenantId: "tenant-lumen" });

    assert.deepEqual(volgaDecisions.map((decision) => decision.id), ["kb-approval-tenant-volga-decision-1"]);
    assert.deepEqual(crossTenantDecisions, []);
    assert.equal(crossTenantDecision, undefined);
  });
});

function clientProfile(input: {
  id: string;
  phone: string;
  sourceProfileId: string;
  tenantId: string;
}): ClientProfileIdentityRecord {
  return {
    channel: "SDK",
    clientSince: "2026-06-29",
    device: "Web",
    entry: "SDK",
    id: input.id,
    name: `Client ${input.id}`,
    phone: input.phone,
    previous: [],
    sourceProfileId: input.sourceProfileId,
    tenantId: input.tenantId,
    topic: "Delivery / Status"
  };
}

function clientMergeGraphEvent(input: {
  action?: "client.merge" | "client.unmerge";
  candidateProfileId?: string;
  detachedProfileId?: string;
  id: string;
  primaryProfileId: string;
  tenantId: string;
}): ClientMergeGraphEvent {
  const targetProfileId = input.candidateProfileId ?? input.detachedProfileId;
  assert.ok(targetProfileId);

  return {
    action: input.action ?? "client.merge",
    ...(input.candidateProfileId ? { candidateProfileId: input.candidateProfileId } : {}),
    ...(input.detachedProfileId ? { detachedProfileId: input.detachedProfileId } : {}),
    id: input.id,
    immutable: true,
    mergeGraphEdge: `${input.primaryProfileId}->${targetProfileId}`,
    primaryProfileId: input.primaryProfileId,
    reason: "Duplicate customer confirmed by support",
    tenantId: input.tenantId
  };
}

function clientMergeConflict(input: {
  candidateProfileId: string;
  id: string;
  primaryProfileId: string;
  tenantId: string;
}): ClientMergeConflictRecord {
  return {
    candidateProfileId: input.candidateProfileId,
    conflictingFields: ["phone"],
    id: input.id,
    primaryProfileId: input.primaryProfileId,
    reason: "Conflicting customer identity attributes require manual review",
    state: "open",
    tenantId: input.tenantId
  };
}

function templateRecord(input: {
  id: string;
  text: string;
  title: string;
  topic?: string;
  version: number;
}): TemplateRecord {
  return {
    auditId: `evt_template_${input.id}`,
    channel: "SDK",
    id: input.id,
    scope: "team",
    text: input.text,
    title: input.title,
    topic: input.topic ?? "Delivery",
    updated: `2026-06-29T12:0${input.version}:00.000Z`,
    usage: 0,
    version: input.version
  };
}

function templateVersion(input: {
  id: string;
  templateId: string;
  text: string;
  title: string;
  topic?: string;
  version: number;
}): TemplateVersionRecord {
  return {
    channel: "SDK",
    id: input.id,
    scope: "team",
    templateId: input.templateId,
    text: input.text,
    title: input.title,
    topic: input.topic ?? "Delivery",
    updated: `2026-06-29T13:0${input.version}:00.000Z`,
    usage: 0,
    version: input.version
  };
}

function templateAuditEvent(input: {
  action: string;
  id: string;
  reason?: string;
  templateId: string;
}): TemplateAuditRecord {
  return {
    action: input.action,
    id: input.id,
    immutable: true,
    ...(input.reason ? { reason: input.reason } : {}),
    templateId: input.templateId,
    timestamp: "2026-06-29T14:00:00.000Z"
  };
}

function knowledgeArticle(input: {
  id: string;
  tenantId: string;
  title: string;
}): KnowledgeArticle {
  return {
    approvalHistory: [],
    attachments: [],
    body: `${input.title} body`,
    category: "Delivery",
    channels: ["SDK"],
    helpfulRate: 0,
    id: input.id,
    owner: "Support Ops",
    status: "published",
    tenantId: input.tenantId,
    title: input.title,
    topics: ["Delivery"],
    updated: "2026-06-29T15:00:00.000Z",
    usage: 0,
    version: "v1",
    versions: [],
    visibility: "private"
  };
}

function knowledgeDraftVersion(input: {
  articleId: string;
  body: string;
  changes?: string;
  id: string;
  label: string;
  updated?: string;
}): KnowledgeDraftVersionRecord {
  return {
    articleId: input.articleId,
    author: "Support Ops",
    body: input.body,
    ...(input.changes ? { changes: input.changes } : {}),
    id: input.id,
    label: input.label,
    status: "draft",
    updated: input.updated ?? "2026-06-29T17:00:00.000Z"
  };
}

function knowledgeApprovalDecision(input: {
  action: string;
  articleId: string;
  draftId?: string;
  id: string;
  reason?: string;
  timestamp?: string;
}): KnowledgeApprovalDecisionRecord {
  return {
    action: input.action,
    actor: "Support Lead",
    articleId: input.articleId,
    ...(input.draftId ? { draftId: input.draftId } : {}),
    id: input.id,
    immutable: true,
    ...(input.reason ? { reason: input.reason } : {}),
    timestamp: input.timestamp ?? "2026-06-29T18:00:00.000Z"
  };
}
