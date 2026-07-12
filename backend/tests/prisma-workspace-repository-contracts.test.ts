import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configureWorkspaceRepository } from "../apps/api-gateway/src/workspace/bootstrap.ts";
import {
  WorkspaceRepository,
  type ClientExportJobRecord,
  type ClientMergeConflictRecord,
  type ClientMergeEvent,
  type ClientProfileRecord,
  type FileRecord,
  type KnowledgeApprovalDecisionRecord,
  type KnowledgeArticle,
  type KnowledgeDraftVersionRecord,
  type TemplateAuditRecord,
  type TemplateRecord,
  type TemplateVersionRecord
} from "../apps/api-gateway/src/workspace/workspace.repository.ts";
import { bootstrapWorkspaceState } from "../apps/api-gateway/src/workspace/seed.ts";

describe("Prisma-backed workspace repository contracts", () => {
  it("keeps repository defaults empty and applies local fixtures only when explicitly injected", async () => {
    assert.deepEqual(await WorkspaceRepository.inMemory().listKnowledgeArticles(), []);
    assert.deepEqual(await WorkspaceRepository.inMemory().listTemplates(), []);
    assert.ok((await WorkspaceRepository.inMemory(bootstrapWorkspaceState()).listKnowledgeArticles()).length > 0);
  });
  it("persists workspace file metadata through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });
    const file: FileRecord = {
      auditId: "evt_file_prisma",
      channel: "SDK",
      checksum: "sha256-prisma",
      fileId: "file_prisma_001",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      objectKey: "tenant-volga/file_prisma_001/contract.pdf",
      scanState: "scan_pending",
      sizeBytes: 2048,
      storageState: "uploaded",
      scanCheckedAt: "2026-06-28T12:20:00.000Z",
      scanReason: "Queued after upload finalize",
      scanVerdict: "pending",
      scanner: "clamav",
      tenantId: "tenant-volga"
    } as FileRecord & {
      scanCheckedAt: string;
      scanReason: string;
      scanVerdict: string;
      scanner: string;
    };

    const saved = await repository.saveFile(file);
    const refetched = await repository.findFile("file_prisma_001");
    const scoped = await repository.findFile("file_prisma_001", { tenantId: "tenant-volga" });
    const crossTenant = await repository.findFile("file_prisma_001", { tenantId: "tenant-lumen" });

    assert.equal(saved.fileId, "file_prisma_001");
    assert.equal(refetched?.checksum, "sha256-prisma");
    assert.equal(scoped?.fileId, "file_prisma_001");
    assert.equal(crossTenant, undefined);
    assert.equal(refetched?.objectKey, "tenant-volga/file_prisma_001/contract.pdf");
    assert.equal((refetched as typeof refetched & { scanCheckedAt?: string })?.scanCheckedAt, "2026-06-28T12:20:00.000Z");
    assert.deepEqual(client.calls.workspaceFileUpserts[0], {
      create: {
        auditId: "evt_file_prisma",
        channel: "SDK",
        checksum: "sha256-prisma",
        fileId: "file_prisma_001",
        fileName: "contract.pdf",
        mimeType: "application/pdf",
        objectKey: "tenant-volga/file_prisma_001/contract.pdf",
        scanCheckedAt: new Date("2026-06-28T12:20:00.000Z"),
        scanReason: "Queued after upload finalize",
        scanState: "scan_pending",
        scanVerdict: "pending",
        scanner: "clamav",
        sizeBytes: 2048n,
        storageState: "uploaded",
        tenantId: "tenant-volga"
      },
      update: {
        auditId: "evt_file_prisma",
        channel: "SDK",
        checksum: "sha256-prisma",
        fileName: "contract.pdf",
        mimeType: "application/pdf",
        objectKey: "tenant-volga/file_prisma_001/contract.pdf",
        scanCheckedAt: new Date("2026-06-28T12:20:00.000Z"),
        scanReason: "Queued after upload finalize",
        scanState: "scan_pending",
        scanVerdict: "pending",
        scanner: "clamav",
        sizeBytes: 2048n,
        storageState: "uploaded",
        tenantId: "tenant-volga"
      },
      where: { fileId: "file_prisma_001" }
    });
    assert.deepEqual(client.calls.workspaceFileFindUnique, [
      { where: { fileId: "file_prisma_001" } },
      { where: { fileId: "file_prisma_001" } },
      { where: { fileId: "file_prisma_001" } }
    ]);
  });

  it("persists client export jobs through Prisma delegates without fallback", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const fallback = WorkspaceRepository.inMemory();
    fallback.saveClientExportJob = () => {
      throw new Error("fallback saveClientExportJob called");
    };
    fallback.listClientExportJobs = () => {
      throw new Error("fallback listClientExportJobs called");
    };
    const repository = WorkspaceRepository.prisma({ client, fallback });
    const job: ClientExportJobRecord = {
      auditEvent: {
        actor: "service-admin",
        immutable: true,
        traceId: "trace-export-prisma"
      },
      createdAt: "2026-06-29T09:10:00.000Z",
      exportId: "client_export_prisma_001",
      fileDescriptor: {
        checksum: "sha256-export",
        contentType: "text/csv",
        objectKey: "exports/tenant-volga/client_export_prisma_001.csv"
      },
      filters: {
        channel: "telegram",
        segmentId: "vip"
      },
      format: "csv",
      itemCount: 2,
      reason: "GDPR client data portability request",
      segment: {
        id: "vip",
        title: "VIP clients"
      },
      sensitiveFieldsMasked: true,
      status: "ready",
      tenantId: "tenant-volga"
    };

    const saved = await repository.saveClientExportJob(job);
    const listed = await repository.listClientExportJobs({ tenantId: "tenant-volga" });
    const crossTenant = await repository.listClientExportJobs({ tenantId: "tenant-lumen" });

    assert.deepEqual(saved, job);
    assert.deepEqual(listed, [job]);
    assert.deepEqual(crossTenant, []);
    assert.deepEqual(client.calls.clientExportJobUpserts, [{
      create: {
        auditEvent: {
          actor: "service-admin",
          immutable: true,
          traceId: "trace-export-prisma"
        },
        createdAt: new Date("2026-06-29T09:10:00.000Z"),
        exportId: "client_export_prisma_001",
        fileDescriptor: {
          checksum: "sha256-export",
          contentType: "text/csv",
          objectKey: "exports/tenant-volga/client_export_prisma_001.csv"
        },
        filters: {
          channel: "telegram",
          segmentId: "vip"
        },
        format: "csv",
        itemCount: 2,
        reason: "GDPR client data portability request",
        segment: {
          id: "vip",
          title: "VIP clients"
        },
        sensitiveFieldsMasked: true,
        status: "ready",
        tenantId: "tenant-volga"
      },
      update: {
        auditEvent: {
          actor: "service-admin",
          immutable: true,
          traceId: "trace-export-prisma"
        },
        createdAt: new Date("2026-06-29T09:10:00.000Z"),
        fileDescriptor: {
          checksum: "sha256-export",
          contentType: "text/csv",
          objectKey: "exports/tenant-volga/client_export_prisma_001.csv"
        },
        filters: {
          channel: "telegram",
          segmentId: "vip"
        },
        format: "csv",
        itemCount: 2,
        reason: "GDPR client data portability request",
        segment: {
          id: "vip",
          title: "VIP clients"
        },
        sensitiveFieldsMasked: true,
        status: "ready",
        tenantId: "tenant-volga"
      },
      where: { exportId: "client_export_prisma_001" }
    }]);
    assert.deepEqual(client.calls.clientExportJobFindMany, [
      { orderBy: { createdAt: "desc" }, where: { tenantId: "tenant-volga" } },
      { orderBy: { createdAt: "desc" }, where: { tenantId: "tenant-lumen" } }
    ]);
  });

  it("bootstraps the default workspace repository from a Prisma client factory", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const factoryCalls: unknown[] = [];

    const repository = configureWorkspaceRepository({
      DATABASE_URL: "postgresql://support:support@127.0.0.1:5432/support_communication",
      NODE_ENV: "test",
      PORT: "4191",
      SERVICE_NAME: "api-gateway",
      WORKSPACE_REPOSITORY: "prisma"
    }, {
      prismaClientFactory: (options) => {
        factoryCalls.push(options);
        return client;
      }
    });

    assert.equal(WorkspaceRepository.default(), repository);
    assert.deepEqual(factoryCalls, [{
      datasourceUrl: "postgresql://support:support@127.0.0.1:5432/support_communication"
    }]);

    await WorkspaceRepository.default().saveFile({
      auditId: "evt_file_bootstrap",
      channel: "VK",
      fileId: "file_bootstrap_001",
      fileName: "bootstrap.txt",
      mimeType: "text/plain",
      objectKey: "tenant-volga/file_bootstrap_001/bootstrap.txt",
      scanState: "pending",
      sizeBytes: 120,
      storageState: "upload_descriptor_ready",
      tenantId: "tenant-volga"
    });
    const refetched = await WorkspaceRepository.default().findFile("file_bootstrap_001");
    assert.equal(refetched?.fileName, "bootstrap.txt");
  });

  it("persists knowledge articles through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });
    const article: KnowledgeArticle = {
      ...knowledgeArticle({
        id: "kb_prisma_article",
        title: "Prisma article"
      }),
      approvalHistory: [{ id: "approval-1", action: "created_draft" }],
      attachments: [{ id: "att-1", status: "ready" }],
      body: "Prisma-backed knowledge body",
      helpfulRate: 91,
      status: "review",
      tenantId: "tenant-volga",
      usage: 12,
      versions: [{ id: "kb_prisma_article_v1", status: "draft" }],
      visibility: "public"
    };

    const saved = await repository.saveKnowledgeArticle(article);
    const refetched = await repository.findKnowledgeArticle("kb_prisma_article", { tenantId: "tenant-volga" });
    const crossTenant = await repository.findKnowledgeArticle("kb_prisma_article", { tenantId: "tenant-lumen" });
    const articles = await repository.listKnowledgeArticles({ tenantId: "tenant-volga" });

    assert.equal(saved.id, "kb_prisma_article");
    assert.equal(refetched?.body, "Prisma-backed knowledge body");
    assert.equal(crossTenant, undefined);
    assert.deepEqual(articles.map((item) => item.id), ["kb_prisma_article"]);
    assert.deepEqual(client.calls.knowledgeArticleUpserts[0], {
      create: {
        approvalHistory: [{ id: "approval-1", action: "created_draft" }],
        attachments: [{ id: "att-1", status: "ready" }],
        body: "Prisma-backed knowledge body",
        category: "Delivery",
        channels: ["SDK"],
        helpfulRate: 91,
        id: "kb_prisma_article",
        owner: "Support Ops",
        status: "review",
        tenantId: "tenant-volga",
        title: "Prisma article",
        topics: ["Delivery"],
        updatedAt: new Date("2026-06-29T10:00:00.000Z"),
        usage: 12,
        version: "v1",
        versions: [{ id: "kb_prisma_article_v1", status: "draft" }],
        visibility: "public"
      },
      update: {
        approvalHistory: [{ id: "approval-1", action: "created_draft" }],
        attachments: [{ id: "att-1", status: "ready" }],
        body: "Prisma-backed knowledge body",
        category: "Delivery",
        channels: ["SDK"],
        helpfulRate: 91,
        owner: "Support Ops",
        status: "review",
        tenantId: "tenant-volga",
        title: "Prisma article",
        topics: ["Delivery"],
        updatedAt: new Date("2026-06-29T10:00:00.000Z"),
        usage: 12,
        version: "v1",
        versions: [{ id: "kb_prisma_article_v1", status: "draft" }],
        visibility: "public"
      },
      where: { id: "kb_prisma_article" }
    });
    assert.deepEqual(client.calls.knowledgeArticleFindUnique, [
      { where: { id: "kb_prisma_article" } },
      { where: { id: "kb_prisma_article" } }
    ]);
    assert.deepEqual(client.calls.knowledgeArticleFindMany, [
      {
        orderBy: { updatedAt: "desc" },
        where: { tenantId: "tenant-volga" }
      }
    ]);
  });

  it("updates knowledge article publication state through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });

    await repository.saveKnowledgeArticle(knowledgeArticle({
      id: "kb_prisma_publication",
      title: "Prisma publication"
    }));

    const archived = await repository.updateKnowledgeArticlePublicationState("kb_prisma_publication", {
      status: "archived",
      updated: "2026-06-29T12:30:00.000Z",
      visibility: "private"
    });
    const missing = await repository.updateKnowledgeArticlePublicationState("kb_prisma_missing", {
      status: "published",
      updated: "2026-06-29T12:31:00.000Z",
      visibility: "public"
    });
    const refetched = await repository.findKnowledgeArticle("kb_prisma_publication");

    assert.equal(archived?.status, "archived");
    assert.equal(archived?.updated, "2026-06-29T12:30:00.000Z");
    assert.equal(refetched?.visibility, "private");
    assert.equal(refetched?.title, "Prisma publication");
    assert.equal(missing, undefined);
    assert.deepEqual(client.calls.knowledgeArticleUpdates, [
      {
        data: {
          status: "archived",
          updatedAt: new Date("2026-06-29T12:30:00.000Z"),
          visibility: "private"
        },
        where: { id: "kb_prisma_publication" }
      },
      {
        data: {
          status: "published",
          updatedAt: new Date("2026-06-29T12:31:00.000Z"),
          visibility: "public"
        },
        where: { id: "kb_prisma_missing" }
      }
    ]);
  });

  it("persists knowledge draft versions through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });
    const version: KnowledgeDraftVersionRecord = {
      articleId: "kb_prisma_draft",
      author: "Support Ops",
      body: "Prisma draft body",
      changes: "Initial draft",
      id: "kb_prisma_draft_v1",
      label: "v1-draft",
      status: "draft",
      updated: "2026-06-29T13:00:00.000Z"
    };

    const saved = await repository.saveKnowledgeDraftVersion(version);
    const refetched = await repository.findKnowledgeDraftVersion("kb_prisma_draft", "kb_prisma_draft_v1");
    const missing = await repository.findKnowledgeDraftVersion("kb_prisma_draft", "kb_missing_draft");
    const versions = await repository.listKnowledgeDraftVersions("kb_prisma_draft");

    assert.equal(saved.id, "kb_prisma_draft_v1");
    assert.equal(refetched?.body, "Prisma draft body");
    assert.equal(missing, undefined);
    assert.deepEqual(versions.map((item) => item.id), ["kb_prisma_draft_v1"]);
    assert.deepEqual(client.calls.knowledgeDraftVersionUpserts[0], {
      create: {
        articleId: "kb_prisma_draft",
        author: "Support Ops",
        body: "Prisma draft body",
        changes: "Initial draft",
        id: "kb_prisma_draft_v1",
        label: "v1-draft",
        status: "draft",
        updatedAt: new Date("2026-06-29T13:00:00.000Z")
      },
      update: {
        articleId: "kb_prisma_draft",
        author: "Support Ops",
        body: "Prisma draft body",
        changes: "Initial draft",
        label: "v1-draft",
        status: "draft",
        updatedAt: new Date("2026-06-29T13:00:00.000Z")
      },
      where: { id: "kb_prisma_draft_v1" }
    });
    assert.deepEqual(client.calls.knowledgeDraftVersionFindFirst, [
      {
        where: {
          articleId: "kb_prisma_draft",
          id: "kb_prisma_draft_v1"
        }
      },
      {
        where: {
          articleId: "kb_prisma_draft",
          id: "kb_missing_draft"
        }
      }
    ]);
    assert.deepEqual(client.calls.knowledgeDraftVersionFindMany, [
      {
        orderBy: { updatedAt: "asc" },
        where: { articleId: "kb_prisma_draft" }
      }
    ]);
  });

  it("updates knowledge draft version state through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });

    await repository.saveKnowledgeDraftVersion({
      articleId: "kb_prisma_draft_transition",
      author: "Support Ops",
      body: "Prisma transition draft body",
      id: "kb_prisma_draft_transition_v1",
      label: "v1-draft",
      status: "draft",
      updated: "2026-06-29T13:30:00.000Z"
    });

    const published = await repository.updateKnowledgeDraftVersionState("kb_prisma_draft_transition", "kb_prisma_draft_transition_v1", {
      status: "published",
      updated: "2026-06-29T13:45:00.000Z"
    });
    const missing = await repository.updateKnowledgeDraftVersionState("kb_prisma_draft_transition", "kb_missing_draft", {
      status: "archived",
      updated: "2026-06-29T13:46:00.000Z"
    });
    const refetched = await repository.findKnowledgeDraftVersion("kb_prisma_draft_transition", "kb_prisma_draft_transition_v1");

    assert.equal(published?.status, "published");
    assert.equal(published?.updated, "2026-06-29T13:45:00.000Z");
    assert.equal(refetched?.body, "Prisma transition draft body");
    assert.equal(missing, undefined);
    assert.deepEqual(client.calls.knowledgeDraftVersionUpdates, [
      {
        data: {
          status: "published",
          updatedAt: new Date("2026-06-29T13:45:00.000Z")
        },
        where: { id: "kb_prisma_draft_transition_v1" }
      },
      {
        data: {
          status: "archived",
          updatedAt: new Date("2026-06-29T13:46:00.000Z")
        },
        where: { id: "kb_missing_draft" }
      }
    ]);
  });

  it("persists knowledge approval decisions through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });
    const decision: KnowledgeApprovalDecisionRecord = {
      action: "approved",
      actor: "Support Lead",
      articleId: "kb_prisma_approval",
      draftId: "kb_prisma_approval_v1",
      id: "kb_prisma_approval_decision_1",
      immutable: true,
      reason: "Approved for publishing",
      timestamp: "2026-06-29T14:00:00.000Z"
    };

    const saved = await repository.saveKnowledgeApprovalDecision(decision);
    const refetched = await repository.findKnowledgeApprovalDecision("kb_prisma_approval", "kb_prisma_approval_decision_1");
    const missing = await repository.findKnowledgeApprovalDecision("kb_prisma_approval", "kb_missing_decision");
    const decisions = await repository.listKnowledgeApprovalDecisions("kb_prisma_approval");

    assert.equal(saved.id, "kb_prisma_approval_decision_1");
    assert.equal(refetched?.reason, "Approved for publishing");
    assert.equal(missing, undefined);
    assert.deepEqual(decisions.map((item) => item.id), ["kb_prisma_approval_decision_1"]);
    assert.deepEqual(client.calls.knowledgeApprovalDecisionUpserts[0], {
      create: {
        action: "approved",
        actor: "Support Lead",
        articleId: "kb_prisma_approval",
        draftId: "kb_prisma_approval_v1",
        id: "kb_prisma_approval_decision_1",
        immutable: true,
        reason: "Approved for publishing",
        timestamp: new Date("2026-06-29T14:00:00.000Z")
      },
      update: {
        action: "approved",
        actor: "Support Lead",
        articleId: "kb_prisma_approval",
        draftId: "kb_prisma_approval_v1",
        immutable: true,
        reason: "Approved for publishing",
        timestamp: new Date("2026-06-29T14:00:00.000Z")
      },
      where: { id: "kb_prisma_approval_decision_1" }
    });
    assert.deepEqual(client.calls.knowledgeApprovalDecisionFindFirst, [
      {
        where: {
          articleId: "kb_prisma_approval",
          id: "kb_prisma_approval_decision_1"
        }
      },
      {
        where: {
          articleId: "kb_prisma_approval",
          id: "kb_prisma_approval_decision_1"
        }
      },
      {
        where: {
          articleId: "kb_prisma_approval",
          id: "kb_missing_decision"
        }
      }
    ]);
    assert.deepEqual(client.calls.knowledgeApprovalDecisionFindMany, [
      {
        orderBy: { timestamp: "asc" },
        where: { articleId: "kb_prisma_approval" }
      }
    ]);
  });

  it("persists template records through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });
    const template: TemplateRecord = {
      auditId: "evt_template_prisma",
      channel: "SDK",
      id: "tpl_prisma_delivery",
      scope: "team",
      text: "We are checking your delivery status.",
      title: "Delivery status",
      topic: "Delivery",
      tenantId: "tenant-volga",
      updated: "2026-06-29T10:30:00.000Z",
      usage: 4,
      version: 2
    };

    const saved = await repository.saveTemplate(template);
    const refetched = await repository.findTemplate("tpl_prisma_delivery");
    const templates = await repository.listTemplates();

    assert.equal(saved.id, "tpl_prisma_delivery");
    assert.equal(refetched?.updated, "2026-06-29T10:30:00.000Z");
    assert.deepEqual(templates.map((item) => item.id), ["tpl_prisma_delivery"]);
    assert.deepEqual(client.calls.templateRecordUpserts[0], {
      create: {
        auditId: "evt_template_prisma",
        channel: "SDK",
        id: "tpl_prisma_delivery",
        scope: "team",
        text: "We are checking your delivery status.",
        title: "Delivery status",
        topic: "Delivery",
        updatedAt: new Date("2026-06-29T10:30:00.000Z"),
        usage: 4,
        version: 2,
        tenantId: "tenant-volga"
      },
      update: {
        auditId: "evt_template_prisma",
        channel: "SDK",
        scope: "team",
        text: "We are checking your delivery status.",
        title: "Delivery status",
        topic: "Delivery",
        updatedAt: new Date("2026-06-29T10:30:00.000Z"),
        usage: 4,
        version: 2,
        tenantId: "tenant-volga"
      },
      where: { id: "tpl_prisma_delivery" }
    });
    assert.deepEqual(client.calls.templateRecordFindUnique, [
      { where: { id: "tpl_prisma_delivery" } }
    ]);
    assert.deepEqual(client.calls.templateRecordFindMany, [
      { orderBy: { updatedAt: "desc" } }
    ]);
  });

  it("persists template versions through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });
    const version: TemplateVersionRecord = {
      channel: "SDK",
      id: "tpl_prisma_delivery_v2",
      scope: "team",
      templateId: "tpl_prisma_delivery",
      text: "Your delivery status has been refreshed.",
      title: "Delivery status update",
      topic: "Delivery",
      updated: "2026-06-29T11:00:00.000Z",
      usage: 5,
      version: 2
    };

    const saved = await repository.saveTemplateVersion(version);
    const refetched = await repository.findTemplateVersion("tpl_prisma_delivery", 2);
    const versions = await repository.listTemplateVersions("tpl_prisma_delivery");

    assert.equal(saved.id, "tpl_prisma_delivery_v2");
    assert.equal(refetched?.text, "Your delivery status has been refreshed.");
    assert.deepEqual(versions.map((item) => item.id), ["tpl_prisma_delivery_v2"]);
    assert.deepEqual(client.calls.templateVersionUpserts[0], {
      create: {
        channel: "SDK",
        id: "tpl_prisma_delivery_v2",
        scope: "team",
        templateId: "tpl_prisma_delivery",
        text: "Your delivery status has been refreshed.",
        title: "Delivery status update",
        topic: "Delivery",
        updatedAt: new Date("2026-06-29T11:00:00.000Z"),
        usage: 5,
        version: 2
      },
      update: {
        channel: "SDK",
        scope: "team",
        templateId: "tpl_prisma_delivery",
        text: "Your delivery status has been refreshed.",
        title: "Delivery status update",
        topic: "Delivery",
        updatedAt: new Date("2026-06-29T11:00:00.000Z"),
        usage: 5,
        version: 2
      },
      where: { id: "tpl_prisma_delivery_v2" }
    });
    assert.deepEqual(client.calls.templateVersionFindFirst, [
      {
        where: {
          templateId: "tpl_prisma_delivery",
          version: 2
        }
      }
    ]);
    assert.deepEqual(client.calls.templateVersionFindMany, [
      {
        orderBy: { version: "asc" },
        where: { templateId: "tpl_prisma_delivery" }
      }
    ]);
  });

  it("persists template audit rows through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });
    const event: TemplateAuditRecord = {
      action: "template.updated",
      id: "evt_template_prisma_delivery_updated",
      immutable: true,
      reason: "Refresh delivery wording",
      templateId: "tpl_prisma_delivery",
      timestamp: "2026-06-29T11:15:00.000Z"
    };

    const saved = await repository.saveTemplateAuditEvent(event);
    const refetched = await repository.findTemplateAuditEvent("evt_template_prisma_delivery_updated");
    const events = await repository.listTemplateAuditEvents("tpl_prisma_delivery");

    assert.equal(saved.id, "evt_template_prisma_delivery_updated");
    assert.equal(refetched?.reason, "Refresh delivery wording");
    assert.deepEqual(events.map((item) => item.id), ["evt_template_prisma_delivery_updated"]);
    assert.deepEqual(client.calls.templateAuditEventUpserts[0], {
      create: {
        action: "template.updated",
        id: "evt_template_prisma_delivery_updated",
        immutable: true,
        reason: "Refresh delivery wording",
        templateId: "tpl_prisma_delivery",
        timestamp: new Date("2026-06-29T11:15:00.000Z")
      },
      update: {
        action: "template.updated",
        immutable: true,
        reason: "Refresh delivery wording",
        templateId: "tpl_prisma_delivery",
        timestamp: new Date("2026-06-29T11:15:00.000Z")
      },
      where: { id: "evt_template_prisma_delivery_updated" }
    });
    assert.deepEqual(client.calls.templateAuditEventFindUnique, [
      { where: { id: "evt_template_prisma_delivery_updated" } }
    ]);
    assert.deepEqual(client.calls.templateAuditEventFindMany, [
      {
        orderBy: { timestamp: "asc" },
        where: { templateId: "tpl_prisma_delivery" }
      }
    ]);
  });

  it("persists client identities, merge graph and conflicts through Prisma delegates", async () => {
    const { client, simulateClientMergeEventUniqueRace } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });

    await repository.saveClientProfile(clientProfile({
      id: "maria",
      phone: "+7 999 204-18-44",
      sourceProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    await repository.saveClientProfile(clientProfile({
      id: "ivan",
      phone: "+7 916 777-11-22",
      sourceProfileId: "src_sdk_maria",
      tenantId: "tenant-lumen"
    }));

    const profile = await repository.findClientProfile("src_sdk_maria", { tenantId: "tenant-volga" });
    const unscopedProfile = await repository.findClientProfile("src_sdk_maria");
    const profiles = await repository.listClientProfiles({ tenantId: "tenant-volga" });

    await repository.saveClientMergeEvent(clientMergeEvent({
      candidateProfileId: "src_telegram_dmitry",
      id: "evt_merge_prisma",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    await repository.saveClientMergeEvent(clientMergeEvent({
      action: "client.unmerge",
      detachedProfileId: "src_sdk_olga",
      id: "evt_unmerge_prisma",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    const duplicateMerge = await repository.saveClientMergeEvent(clientMergeEvent({
      candidateProfileId: "src_telegram_dmitry",
      id: "evt_merge_prisma_duplicate",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    simulateClientMergeEventUniqueRace(clientMergeEvent({
      candidateProfileId: "src_whatsapp_pavel",
      id: "evt_merge_prisma_raced",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    const racedDuplicate = await repository.saveClientMergeEvent(clientMergeEvent({
      candidateProfileId: "src_whatsapp_pavel",
      id: "evt_merge_prisma_race_loser",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    await assert.rejects(() => repository.saveClientMergeEvent(clientMergeEvent({
      candidateProfileId: "src_vk_ivan",
      id: "evt_merge_prisma",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    })), /Client merge event evt_merge_prisma conflicts with existing immutable event/);
    const candidateEvents = await repository.listClientMergeEvents({
      candidateProfileId: "src_telegram_dmitry",
      tenantId: "tenant-volga"
    });
    const detachedEvents = await repository.listClientMergeEvents({
      detachedProfileId: "src_sdk_olga",
      tenantId: "tenant-volga"
    });

    await repository.saveClientMergeConflict(clientMergeConflict({
      candidateProfileId: "src_telegram_dmitry",
      id: "conflict_prisma",
      primaryProfileId: "src_sdk_maria",
      tenantId: "tenant-volga"
    }));
    await assert.rejects(() => repository.saveClientMergeConflict({
      ...clientMergeConflict({
        candidateProfileId: "src_vk_ivan",
        id: "conflict_prisma_bad_save",
        primaryProfileId: "src_sdk_maria",
        tenantId: "tenant-volga"
      }),
      state: "queued" as ClientMergeConflictRecord["state"]
    }), /Unsupported client merge conflict state: queued/);
    const openConflicts = await repository.listClientMergeConflicts({
      state: "open",
      tenantId: "tenant-volga"
    });
    const resolved = await repository.updateClientMergeConflictState("conflict_prisma", "resolved");
    await assert.rejects(
      () => repository.updateClientMergeConflictState("conflict_prisma", "queued" as ClientMergeConflictRecord["state"]),
      /Unsupported client merge conflict state: queued/
    );
    const resolvedConflicts = await repository.listClientMergeConflicts({
      state: "resolved",
      tenantId: "tenant-volga"
    });

    assert.equal(profile?.tenantId, "tenant-volga");
    assert.equal(profile?.phone, "+7 999 204-18-44");
    assert.equal(unscopedProfile, undefined);
    assert.deepEqual(profiles.map((item) => item.tenantId), ["tenant-volga"]);
    assert.equal(duplicateMerge.id, "evt_merge_prisma");
    assert.equal(racedDuplicate.id, "evt_merge_prisma_raced");
    assert.deepEqual(candidateEvents.map((event) => event.id), ["evt_merge_prisma"]);
    assert.deepEqual(detachedEvents.map((event) => event.id), ["evt_unmerge_prisma"]);
    assert.deepEqual(openConflicts.map((conflict) => conflict.id), ["conflict_prisma"]);
    assert.equal(resolved?.state, "resolved");
    assert.deepEqual(resolvedConflicts.map((conflict) => conflict.id), ["conflict_prisma"]);
    assert.deepEqual(client.calls.clientProfileUpserts.map((call) => call.where.tenantId_sourceProfileId), [
      { tenantId: "tenant-volga", sourceProfileId: "src_sdk_maria" },
      { tenantId: "tenant-lumen", sourceProfileId: "src_sdk_maria" }
    ]);
    assert.deepEqual(client.calls.clientMergeEventUpserts.map((call) => call.where.id), [
      "evt_merge_prisma",
      "evt_unmerge_prisma",
      "evt_merge_prisma_race_loser"
    ]);
    assert.deepEqual(client.calls.clientMergeEventUpserts.map((call) => ({
      candidateProfileId: call.create.candidateProfileId,
      detachedProfileId: call.create.detachedProfileId,
      reason: call.create.reason
    })), [
      {
        candidateProfileId: "src_telegram_dmitry",
        detachedProfileId: null,
        reason: "Duplicate customer confirmed by support"
      },
      {
        candidateProfileId: null,
        detachedProfileId: "src_sdk_olga",
        reason: "Duplicate customer confirmed by support"
      },
      {
        candidateProfileId: "src_whatsapp_pavel",
        detachedProfileId: null,
        reason: "Duplicate customer confirmed by support"
      }
    ]);
    assert.deepEqual(client.calls.clientMergeConflictUpdates, [{
      data: { state: "resolved" },
      where: { id: "conflict_prisma" }
    }]);
  });

  it("preserves empty checksum values across Prisma file metadata round trips", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });

    await repository.saveFile({
      auditId: "evt_file_empty_checksum",
      channel: "SDK",
      checksum: "",
      fileId: "file_empty_checksum",
      fileName: "empty.txt",
      mimeType: "text/plain",
      objectKey: "tenant-volga/file_empty_checksum/empty.txt",
      scanState: "scan_pending",
      sizeBytes: 1,
      storageState: "uploaded",
      tenantId: "tenant-volga"
    });

    const refetched = await repository.findFile("file_empty_checksum");
    assert.equal(refetched?.checksum, "");
  });

  it("updates only scan result metadata through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });

    await repository.saveFile({
      auditId: "evt_file_scan_update",
      channel: "SDK",
      checksum: "sha256-scan-update",
      fileId: "file_scan_update",
      fileName: "scan-update.pdf",
      mimeType: "application/pdf",
      objectKey: "objects/obj_scan_update",
      scanState: "scan_pending",
      sizeBytes: 1024,
      storageState: "uploaded",
      tenantId: "tenant-lumen"
    });
    client.calls.workspaceFileUpserts.length = 0;

    const updated = await repository.updateFileScanResult("file_scan_update", {
      scanCheckedAt: "2026-06-28T12:40:00.000Z",
      scanReason: "Clean scan",
      scanState: "scan_clean",
      scanVerdict: "clean",
      scanner: "clamav"
    });

    assert.equal(updated?.fileId, "file_scan_update");
    assert.equal(updated?.scanVerdict, "clean");
    assert.deepEqual(client.calls.workspaceFileUpserts, []);
    assert.deepEqual(client.calls.workspaceFileUpdates, [{
      data: {
        scanCheckedAt: new Date("2026-06-28T12:40:00.000Z"),
        scanReason: "Clean scan",
        scanState: "scan_clean",
        scanVerdict: "clean",
        scanner: "clamav"
      },
      where: { fileId: "file_scan_update" }
    }]);
  });

  it("requires explicit tenant ownership for opaque object keys", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });

    const missingTenant = {
      auditId: "evt_file_opaque_tenant",
      channel: "SDK",
      fileId: "file_opaque_tenant",
      fileName: "opaque.pdf",
      mimeType: "application/pdf",
      objectKey: "objects/obj_opaque_tenant",
      scanState: "pending",
      sizeBytes: 1,
      storageState: "upload_descriptor_ready"
    };

    await assert.rejects(() => repository.saveFile(missingTenant), /workspace_tenant_id_required/);
    await repository.saveFile({ ...missingTenant, tenantId: "tenant-volga" });

    assert.equal(client.calls.workspaceFileUpserts[0].create.tenantId, "tenant-volga");
  });

  it("persists scan result idempotency records through Prisma delegates", async () => {
    const { client } = createFakePrismaWorkspaceClient();
    const repository = WorkspaceRepository.prisma({ client });
    await repository.saveFile({
      auditId: "evt_file_scan_idem",
      channel: "SDK",
      checksum: "sha256-scan-idem",
      fileId: "file_scan_idem",
      fileName: "scan-idem.pdf",
      mimeType: "application/pdf",
      objectKey: "tenant-volga/file_scan_idem/scan-idem.pdf",
      scanState: "scan_pending",
      sizeBytes: 1024,
      storageState: "uploaded",
      tenantId: "tenant-volga"
    });

    const saved = await repository.saveFileScanResultIdempotency({
      fileId: "file_scan_idem",
      fingerprint: "fp_scan_clean",
      key: "scan-idem-key",
      result: {
        fileId: "file_scan_idem",
        scanState: "scan_clean",
        scanVerdict: "clean"
      }
    });
    const refetched = await repository.findFileScanResultIdempotency("scan-idem-key");
    const scoped = await repository.findFileScanResultIdempotency("scan-idem-key", { tenantId: "tenant-volga" });
    const crossTenant = await repository.findFileScanResultIdempotency("scan-idem-key", { tenantId: "tenant-lumen" });

    assert.equal(saved.key, "scan-idem-key");
    assert.equal(scoped?.tenantId, "tenant-volga");
    assert.equal(crossTenant, undefined);
    assert.deepEqual(refetched?.result, {
      fileId: "file_scan_idem",
      scanState: "scan_clean",
      scanVerdict: "clean"
    });
    assert.deepEqual(client.calls.workspaceFileScanResultIdempotencyCreates, [{
      data: {
        fileId: "file_scan_idem",
        fingerprint: "fp_scan_clean",
        key: "scan-idem-key",
        result: {
          fileId: "file_scan_idem",
          scanState: "scan_clean",
          scanVerdict: "clean"
        }
      }
    }]);
    assert.deepEqual(client.calls.workspaceFileScanResultIdempotencyFindUnique, [
      { where: { key: "scan-idem-key" } },
      { where: { key: "scan-idem-key" } },
      { where: { key: "scan-idem-key" } }
    ]);
    assert.equal(client.calls.workspaceFileFindUnique.filter((call) => call.where.fileId === "file_scan_idem").length, 2);
  });
});

function createFakePrismaWorkspaceClient() {
  const files = new Map<string, FakeWorkspaceFileRow>();
  const idempotencyRecords = new Map<string, FakeWorkspaceFileScanResultIdempotencyCreateInput>();
  const clientExportJobs = new Map<string, FakeClientExportJobCreateInput>();
  const clientProfiles = new Map<string, FakeClientProfileCreateInput>();
  const clientMergeEvents = new Map<string, FakeClientMergeEventCreateInput>();
  const clientMergeConflicts = new Map<string, FakeClientMergeConflictCreateInput>();
  const templateRecords = new Map<string, FakeTemplateRecordCreateInput>();
  const knowledgeArticles = new Map<string, FakeKnowledgeArticleCreateInput>();
  const knowledgeApprovalDecisions = new Map<string, FakeKnowledgeApprovalDecisionCreateInput>();
  const knowledgeDraftVersions = new Map<string, FakeKnowledgeDraftVersionCreateInput>();
  const templateVersions = new Map<string, FakeTemplateVersionCreateInput>();
  const templateAuditEvents = new Map<string, FakeTemplateAuditEventCreateInput>();
  let clientMergeEventUniqueRace: FakeClientMergeEventCreateInput | undefined;
  const calls = {
    clientMergeConflictFindMany: [] as Array<{ orderBy: { createdAt: "asc" }; where?: FakeClientMergeConflictWhere }>,
    clientMergeConflictUpdates: [] as Array<{ data: { state: string }; where: { id: string } }>,
    clientMergeConflictUpserts: [] as Array<{
      create: FakeClientMergeConflictCreateInput;
      update: Omit<FakeClientMergeConflictCreateInput, "id">;
      where: { id: string };
    }>,
    clientMergeEventFindMany: [] as Array<{ orderBy: { createdAt: "asc" }; where?: FakeClientMergeEventWhere }>,
    clientMergeEventFindUnique: [] as Array<{ where: { id: string } }>,
    clientMergeEventUpserts: [] as Array<{
      create: FakeClientMergeEventCreateInput;
      update: Omit<FakeClientMergeEventCreateInput, "id">;
      where: { id: string };
    }>,
    clientExportJobFindMany: [] as Array<{ orderBy: { createdAt: "desc" }; where?: { tenantId?: string } }>,
    clientExportJobUpserts: [] as Array<{
      create: FakeClientExportJobCreateInput;
      update: Omit<FakeClientExportJobCreateInput, "exportId">;
      where: { exportId: string };
    }>,
    clientProfileFindFirst: [] as Array<{ where: { sourceProfileId: string; tenantId?: string } }>,
    clientProfileFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: { tenantId?: string } }>,
    clientProfileUpserts: [] as Array<{
      create: FakeClientProfileCreateInput;
      update: Omit<FakeClientProfileCreateInput, "id" | "sourceProfileId" | "tenantId">;
      where: { tenantId_sourceProfileId: { sourceProfileId: string; tenantId: string } };
    }>,
    templateRecordFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: { tenantId?: string } }>,
    templateRecordFindUnique: [] as Array<{ where: { id: string } }>,
    templateRecordUpserts: [] as Array<{
      create: FakeTemplateRecordCreateInput;
      update: Omit<FakeTemplateRecordCreateInput, "id">;
      where: { id: string };
    }>,
    knowledgeArticleFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: { tenantId?: string } }>,
    knowledgeArticleFindUnique: [] as Array<{ where: { id: string } }>,
    knowledgeArticleUpserts: [] as Array<{
      create: FakeKnowledgeArticleCreateInput;
      update: Omit<FakeKnowledgeArticleCreateInput, "id">;
      where: { id: string };
    }>,
    knowledgeArticleUpdates: [] as Array<{
      data: { status: string; updatedAt: Date; visibility: string };
      where: { id: string };
    }>,
    knowledgeDraftVersionFindFirst: [] as Array<{ where: { articleId: string; id: string } }>,
    knowledgeDraftVersionFindUnique: [] as Array<{ where: { id: string } }>,
    knowledgeDraftVersionFindMany: [] as Array<{ orderBy: { updatedAt: "asc" }; where: { articleId: string } }>,
    knowledgeDraftVersionUpserts: [] as Array<{
      create: FakeKnowledgeDraftVersionCreateInput;
      update: Omit<FakeKnowledgeDraftVersionCreateInput, "id">;
      where: { id: string };
    }>,
    knowledgeDraftVersionUpdates: [] as Array<{
      data: { status: string; updatedAt: Date };
      where: { id: string };
    }>,
    knowledgeApprovalDecisionFindFirst: [] as Array<{ where: { articleId: string; id: string } }>,
    knowledgeApprovalDecisionFindMany: [] as Array<{ orderBy: { timestamp: "asc" }; where: { articleId: string } }>,
    knowledgeApprovalDecisionUpserts: [] as Array<{
      create: FakeKnowledgeApprovalDecisionCreateInput;
      update: Omit<FakeKnowledgeApprovalDecisionCreateInput, "id">;
      where: { id: string };
    }>,
    templateVersionFindFirst: [] as Array<{ where: { templateId: string; version: number } }>,
    templateVersionFindMany: [] as Array<{ orderBy: { version: "asc" }; where: { templateId: string } }>,
    templateVersionUpserts: [] as Array<{
      create: FakeTemplateVersionCreateInput;
      update: Omit<FakeTemplateVersionCreateInput, "id">;
      where: { id: string };
    }>,
    templateAuditEventFindMany: [] as Array<{ orderBy: { timestamp: "asc" }; where: { templateId: string } }>,
    templateAuditEventFindUnique: [] as Array<{ where: { id: string } }>,
    templateAuditEventUpserts: [] as Array<{
      create: FakeTemplateAuditEventCreateInput;
      update: Omit<FakeTemplateAuditEventCreateInput, "id">;
      where: { id: string };
    }>,
    workspaceFileFindUnique: [] as Array<{ where: { fileId: string } }>,
    workspaceFileUpserts: [] as Array<{
      create: FakeWorkspaceFileCreateInput;
      update: Omit<FakeWorkspaceFileCreateInput, "fileId">;
      where: { fileId: string };
    }>,
    workspaceFileUpdates: [] as Array<{
      data: FakeWorkspaceFileScanUpdateInput;
      where: { fileId: string };
    }>,
    workspaceFileScanResultIdempotencyCreates: [] as Array<{ data: FakeWorkspaceFileScanResultIdempotencyCreateInput }>,
    workspaceFileScanResultIdempotencyFindUnique: [] as Array<{ where: { key: string } }>,
    workspaceFileScanResultIdempotencyUpdates: [] as Array<{ data: { result: Record<string, unknown> }; where: { key: string } }>
  };
  const client = {
    calls,
    clientMergeConflict: {
      findMany: async (input: { orderBy: { createdAt: "asc" }; where?: FakeClientMergeConflictWhere }) => {
        calls.clientMergeConflictFindMany.push(input);
        return Array.from(clientMergeConflicts.values()).filter((conflict) =>
          (!input.where?.tenantId || conflict.tenantId === input.where.tenantId)
          && (!input.where?.primaryProfileId || conflict.primaryProfileId === input.where.primaryProfileId)
          && (!input.where?.state || conflict.state === input.where.state)
        );
      },
      update: async (input: { data: { state: string }; where: { id: string } }) => {
        calls.clientMergeConflictUpdates.push(input);
        const current = clientMergeConflicts.get(input.where.id);
        if (!current) {
          throw new Error(`Missing client merge conflict ${input.where.id}`);
        }

        const next = {
          ...current,
          state: input.data.state
        };
        clientMergeConflicts.set(input.where.id, next);
        return next;
      },
      upsert: async (input: {
        create: FakeClientMergeConflictCreateInput;
        update: Omit<FakeClientMergeConflictCreateInput, "id">;
        where: { id: string };
      }) => {
        calls.clientMergeConflictUpserts.push(input);
        const next = {
          ...(clientMergeConflicts.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update,
          id: input.where.id
        };
        clientMergeConflicts.set(input.where.id, next);
        return next;
      }
    },
    clientMergeEvent: {
      findUnique: async (input: { where: { id: string } }) => {
        calls.clientMergeEventFindUnique.push(input);
        return clientMergeEvents.get(input.where.id) ?? null;
      },
      findMany: async (input: { orderBy: { createdAt: "asc" }; where?: FakeClientMergeEventWhere }) => {
        calls.clientMergeEventFindMany.push(input);
        return Array.from(clientMergeEvents.values()).filter((event) =>
          (!input.where?.tenantId || event.tenantId === input.where.tenantId)
          && (!input.where?.primaryProfileId || event.primaryProfileId === input.where.primaryProfileId)
          && (!input.where?.candidateProfileId || event.candidateProfileId === input.where.candidateProfileId)
          && (!input.where?.detachedProfileId || event.detachedProfileId === input.where.detachedProfileId)
        );
      },
      upsert: async (input: {
        create: FakeClientMergeEventCreateInput;
        update: Omit<FakeClientMergeEventCreateInput, "id">;
        where: { id: string };
      }) => {
        calls.clientMergeEventUpserts.push(input);
        if (clientMergeEventUniqueRace) {
          const raced = clientMergeEventUniqueRace;
          clientMergeEventUniqueRace = undefined;
          clientMergeEvents.set(raced.id, raced);
          const error = new Error("Unique constraint failed on the fields: (`tenant_id`,`action`,`merge_graph_edge`)") as Error & { code?: string };
          error.code = "P2002";
          throw error;
        }

        const next = {
          ...(clientMergeEvents.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update,
          id: input.where.id
        };
        clientMergeEvents.set(input.where.id, next);
        return next;
      }
    },
    clientExportJob: {
      findMany: async (input: { orderBy: { createdAt: "desc" }; where?: { tenantId?: string } }) => {
        calls.clientExportJobFindMany.push(input);
        return Array.from(clientExportJobs.values())
          .filter((job) => !input.where?.tenantId || job.tenantId === input.where.tenantId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      },
      upsert: async (input: {
        create: FakeClientExportJobCreateInput;
        update: Omit<FakeClientExportJobCreateInput, "exportId">;
        where: { exportId: string };
      }) => {
        calls.clientExportJobUpserts.push(input);
        const next = {
          ...(clientExportJobs.get(input.where.exportId) ?? {}),
          ...input.create,
          ...input.update,
          exportId: input.where.exportId
        };
        clientExportJobs.set(input.where.exportId, next);
        return next;
      }
    },
    clientProfile: {
      findFirst: async (input: { where: { sourceProfileId: string; tenantId?: string } }) => {
        calls.clientProfileFindFirst.push(input);
        return Array.from(clientProfiles.values()).find((profile) =>
          profile.sourceProfileId === input.where.sourceProfileId
          && (!input.where.tenantId || profile.tenantId === input.where.tenantId)
        ) ?? null;
      },
      findMany: async (input: { orderBy: { updatedAt: "desc" }; where?: { tenantId?: string } }) => {
        calls.clientProfileFindMany.push(input);
        return Array.from(clientProfiles.values()).filter((profile) => !input.where?.tenantId || profile.tenantId === input.where.tenantId);
      },
      upsert: async (input: {
        create: FakeClientProfileCreateInput;
        update: Omit<FakeClientProfileCreateInput, "id" | "sourceProfileId" | "tenantId">;
        where: { tenantId_sourceProfileId: { sourceProfileId: string; tenantId: string } };
      }) => {
        calls.clientProfileUpserts.push(input);
        const key = `${input.where.tenantId_sourceProfileId.tenantId}:${input.where.tenantId_sourceProfileId.sourceProfileId}`;
        const current = clientProfiles.get(key);
        const next = {
          ...(current ?? {}),
          ...input.create,
          ...input.update,
          sourceProfileId: input.where.tenantId_sourceProfileId.sourceProfileId,
          tenantId: input.where.tenantId_sourceProfileId.tenantId
        };
        clientProfiles.set(key, next);
        return next;
      }
    },
    templateRecord: {
      findUnique: async (input: { where: { id: string } }) => {
        calls.templateRecordFindUnique.push(input);
        return templateRecords.get(input.where.id) ?? null;
      },
      findMany: async (input: { orderBy: { updatedAt: "desc" }; where?: { tenantId?: string } }) => {
        calls.templateRecordFindMany.push(input);
        return Array.from(templateRecords.values())
          .filter((template) => !input.where?.tenantId || template.tenantId === input.where.tenantId)
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
      },
      upsert: async (input: {
        create: FakeTemplateRecordCreateInput;
        update: Omit<FakeTemplateRecordCreateInput, "id">;
        where: { id: string };
      }) => {
        calls.templateRecordUpserts.push(input);
        const next = {
          ...(templateRecords.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update,
          id: input.where.id
        };
        templateRecords.set(input.where.id, next);
        return next;
      }
    },
    knowledgeArticle: {
      findUnique: async (input: { where: { id: string } }) => {
        calls.knowledgeArticleFindUnique.push(input);
        return knowledgeArticles.get(input.where.id) ?? null;
      },
      findMany: async (input: { orderBy: { updatedAt: "desc" }; where?: { tenantId?: string } }) => {
        calls.knowledgeArticleFindMany.push(input);
        return Array.from(knowledgeArticles.values())
          .filter((article) => !input.where?.tenantId || article.tenantId === input.where.tenantId)
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
      },
      upsert: async (input: {
        create: FakeKnowledgeArticleCreateInput;
        update: Omit<FakeKnowledgeArticleCreateInput, "id">;
        where: { id: string };
      }) => {
        calls.knowledgeArticleUpserts.push(input);
        const next = {
          ...(knowledgeArticles.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update,
          id: input.where.id
        };
        knowledgeArticles.set(input.where.id, next);
        return next;
      },
      update: async (input: { data: { status: string; updatedAt: Date; visibility: string }; where: { id: string } }) => {
        calls.knowledgeArticleUpdates.push(input);
        const current = knowledgeArticles.get(input.where.id);
        if (!current) {
          const error = new Error(`Missing knowledge article ${input.where.id}`) as Error & { code?: string };
          error.code = "P2025";
          throw error;
        }

        const next = {
          ...current,
          ...input.data
        };
        knowledgeArticles.set(input.where.id, next);
        return next;
      }
    },
    knowledgeDraftVersion: {
      findUnique: async (input: { where: { id: string } }) => {
        calls.knowledgeDraftVersionFindUnique.push(input);
        return knowledgeDraftVersions.get(input.where.id) ?? null;
      },
      findFirst: async (input: { where: { articleId: string; id: string } }) => {
        calls.knowledgeDraftVersionFindFirst.push(input);
        return Array.from(knowledgeDraftVersions.values()).find((version) =>
          version.articleId === input.where.articleId && version.id === input.where.id
        ) ?? null;
      },
      findMany: async (input: { orderBy: { updatedAt: "asc" }; where: { articleId: string } }) => {
        calls.knowledgeDraftVersionFindMany.push(input);
        return Array.from(knowledgeDraftVersions.values())
          .filter((version) => version.articleId === input.where.articleId)
          .sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime());
      },
      upsert: async (input: {
        create: FakeKnowledgeDraftVersionCreateInput;
        update: Omit<FakeKnowledgeDraftVersionCreateInput, "id">;
        where: { id: string };
      }) => {
        calls.knowledgeDraftVersionUpserts.push(input);
        const next = {
          ...(knowledgeDraftVersions.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update,
          id: input.where.id
        };
        knowledgeDraftVersions.set(input.where.id, next);
        return next;
      },
      update: async (input: { data: { status: string; updatedAt: Date }; where: { id: string } }) => {
        calls.knowledgeDraftVersionUpdates.push(input);
        const current = knowledgeDraftVersions.get(input.where.id);
        if (!current) {
          const error = new Error(`Missing knowledge draft version ${input.where.id}`) as Error & { code?: string };
          error.code = "P2025";
          throw error;
        }

        const next = {
          ...current,
          ...input.data
        };
        knowledgeDraftVersions.set(input.where.id, next);
        return next;
      }
    },
    knowledgeApprovalDecision: {
      findFirst: async (input: { where: { articleId: string; id: string } }) => {
        calls.knowledgeApprovalDecisionFindFirst.push(input);
        return Array.from(knowledgeApprovalDecisions.values()).find((decision) =>
          decision.articleId === input.where.articleId && decision.id === input.where.id
        ) ?? null;
      },
      findMany: async (input: { orderBy: { timestamp: "asc" }; where: { articleId: string } }) => {
        calls.knowledgeApprovalDecisionFindMany.push(input);
        return Array.from(knowledgeApprovalDecisions.values())
          .filter((decision) => decision.articleId === input.where.articleId)
          .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
      },
      upsert: async (input: {
        create: FakeKnowledgeApprovalDecisionCreateInput;
        update: Omit<FakeKnowledgeApprovalDecisionCreateInput, "id">;
        where: { id: string };
      }) => {
        calls.knowledgeApprovalDecisionUpserts.push(input);
        const next = {
          ...(knowledgeApprovalDecisions.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update,
          id: input.where.id
        };
        knowledgeApprovalDecisions.set(input.where.id, next);
        return next;
      }
    },
    templateVersion: {
      findFirst: async (input: { where: { templateId: string; version: number } }) => {
        calls.templateVersionFindFirst.push(input);
        return Array.from(templateVersions.values()).find((version) =>
          version.templateId === input.where.templateId && version.version === input.where.version
        ) ?? null;
      },
      findMany: async (input: { orderBy: { version: "asc" }; where: { templateId: string } }) => {
        calls.templateVersionFindMany.push(input);
        return Array.from(templateVersions.values())
          .filter((version) => version.templateId === input.where.templateId)
          .sort((left, right) => left.version - right.version);
      },
      upsert: async (input: {
        create: FakeTemplateVersionCreateInput;
        update: Omit<FakeTemplateVersionCreateInput, "id">;
        where: { id: string };
      }) => {
        calls.templateVersionUpserts.push(input);
        const next = {
          ...(templateVersions.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update,
          id: input.where.id
        };
        templateVersions.set(input.where.id, next);
        return next;
      }
    },
    templateAuditEvent: {
      findUnique: async (input: { where: { id: string } }) => {
        calls.templateAuditEventFindUnique.push(input);
        return templateAuditEvents.get(input.where.id) ?? null;
      },
      findMany: async (input: { orderBy: { timestamp: "asc" }; where: { templateId: string } }) => {
        calls.templateAuditEventFindMany.push(input);
        return Array.from(templateAuditEvents.values())
          .filter((event) => event.templateId === input.where.templateId)
          .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
      },
      upsert: async (input: {
        create: FakeTemplateAuditEventCreateInput;
        update: Omit<FakeTemplateAuditEventCreateInput, "id">;
        where: { id: string };
      }) => {
        calls.templateAuditEventUpserts.push(input);
        const next = {
          ...(templateAuditEvents.get(input.where.id) ?? {}),
          ...input.create,
          ...input.update,
          id: input.where.id
        };
        templateAuditEvents.set(input.where.id, next);
        return next;
      }
    },
    workspaceFileScanResultIdempotency: {
      create: async (input: { data: FakeWorkspaceFileScanResultIdempotencyCreateInput }) => {
        calls.workspaceFileScanResultIdempotencyCreates.push(input);
        idempotencyRecords.set(input.data.key, input.data);
        return input.data;
      },
      findUnique: async (input: { where: { key: string } }) => {
        calls.workspaceFileScanResultIdempotencyFindUnique.push(input);
        return idempotencyRecords.get(input.where.key) ?? null;
      },
      update: async (input: { data: { result: Record<string, unknown> }; where: { key: string } }) => {
        calls.workspaceFileScanResultIdempotencyUpdates.push(input);
        const current = idempotencyRecords.get(input.where.key);
        if (!current) {
          throw new Error(`Missing scan idempotency key ${input.where.key}`);
        }

        const next = {
          ...current,
          result: input.data.result
        };
        idempotencyRecords.set(input.where.key, next);
        return next;
      }
    },
    workspaceFile: {
      findUnique: async (input: { where: { fileId: string } }) => {
        calls.workspaceFileFindUnique.push(input);
        return files.get(input.where.fileId) ?? null;
      },
      upsert: async (input: {
        create: FakeWorkspaceFileCreateInput;
        update: Omit<FakeWorkspaceFileCreateInput, "fileId">;
        where: { fileId: string };
      }) => {
        calls.workspaceFileUpserts.push(input);
        const next = {
          ...(files.get(input.where.fileId) ?? {}),
          ...input.create,
          ...input.update,
          fileId: input.where.fileId
        };
        files.set(input.where.fileId, next);
        return next;
      },
      update: async (input: {
        data: FakeWorkspaceFileScanUpdateInput;
        where: { fileId: string };
      }) => {
        calls.workspaceFileUpdates.push(input);
        const current = files.get(input.where.fileId);
        if (!current) {
          throw new Error(`Missing workspace file ${input.where.fileId}`);
        }

        const next = {
          ...current,
          ...input.data
        };
        files.set(input.where.fileId, next);
        return next;
      }
    }
  };

  return {
    client,
    simulateClientMergeEventUniqueRace(row: ClientMergeEvent) {
      clientMergeEventUniqueRace = {
        action: row.action,
        candidateProfileId: row.candidateProfileId ?? null,
        detachedProfileId: row.detachedProfileId ?? null,
        id: row.id,
        immutable: row.immutable,
        mergeGraphEdge: row.mergeGraphEdge,
        primaryProfileId: row.primaryProfileId,
        reason: row.reason ?? null,
        tenantId: row.tenantId ?? "tenant-volga"
      };
    }
  };
}

interface FakeWorkspaceFileCreateInput {
  auditId: string;
  channel: string;
  checksum: string | null;
  fileId: string;
  fileName: string;
  mimeType: string;
  objectKey: string;
  scanCheckedAt?: Date | null;
  scanReason?: string | null;
  scanState: string;
  scanVerdict?: string | null;
  scanner?: string | null;
  sizeBytes: bigint;
  storageState: string;
  tenantId: string;
}

type FakeWorkspaceFileRow = FakeWorkspaceFileCreateInput;

interface FakeClientExportJobCreateInput {
  auditEvent: Record<string, unknown>;
  createdAt: Date;
  exportId: string;
  fileDescriptor: Record<string, unknown>;
  filters: Record<string, unknown>;
  format: string;
  itemCount: number;
  reason: string;
  segment: Record<string, unknown> | null;
  sensitiveFieldsMasked: boolean;
  status: string;
  tenantId: string;
}

interface FakeWorkspaceFileScanUpdateInput {
  scanCheckedAt: Date | null;
  scanReason: string | null;
  scanState: string;
  scanVerdict: string | null;
  scanner: string | null;
}

interface FakeWorkspaceFileScanResultIdempotencyCreateInput {
  fileId: string;
  fingerprint: string;
  key: string;
  result: Record<string, unknown>;
}

interface FakeClientProfileCreateInput {
  channel: string;
  clientSince: string;
  device: string;
  entry: string;
  id: string;
  name: string;
  phone: string;
  previous: string[][];
  sourceProfileId: string;
  tenantId: string;
  topic: string;
}

interface FakeClientMergeEventCreateInput {
  action: string;
  candidateProfileId: string | null;
  detachedProfileId: string | null;
  id: string;
  immutable: boolean;
  mergeGraphEdge: string;
  primaryProfileId: string;
  reason: string | null;
  tenantId: string;
}

interface FakeClientMergeEventWhere {
  candidateProfileId?: string;
  detachedProfileId?: string;
  primaryProfileId?: string;
  tenantId?: string;
}

interface FakeClientMergeConflictCreateInput {
  candidateProfileId: string;
  conflictingFields: string[];
  id: string;
  primaryProfileId: string;
  reason: string;
  state: string;
  tenantId: string;
}

interface FakeClientMergeConflictWhere {
  primaryProfileId?: string;
  state?: string;
  tenantId?: string;
}

interface FakeTemplateRecordCreateInput {
  auditId: string | null;
  channel: string;
  id: string;
  scope: string;
  tenantId: string;
  text: string;
  title: string;
  topic: string;
  updatedAt: Date;
  usage: number;
  version: number;
}

interface FakeKnowledgeArticleCreateInput {
  approvalHistory: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  body: string;
  category: string;
  channels: string[];
  helpfulRate: number;
  id: string;
  owner: string;
  status: string;
  tenantId: string;
  title: string;
  topics: string[];
  updatedAt: Date;
  usage: number;
  version: string;
  versions: Array<Record<string, unknown>>;
  visibility: string;
}

interface FakeKnowledgeDraftVersionCreateInput {
  articleId: string;
  author: string;
  body: string;
  changes: string | null;
  id: string;
  label: string;
  status: string;
  updatedAt: Date;
}

interface FakeKnowledgeApprovalDecisionCreateInput {
  action: string;
  actor: string;
  articleId: string;
  draftId: string | null;
  id: string;
  immutable: boolean;
  reason: string | null;
  timestamp: Date;
}

interface FakeTemplateVersionCreateInput {
  channel: string;
  id: string;
  scope: string;
  templateId: string;
  text: string;
  title: string;
  topic: string;
  updatedAt: Date;
  usage: number;
  version: number;
}

interface FakeTemplateAuditEventCreateInput {
  action: string;
  id: string;
  immutable: boolean;
  reason: string | null;
  templateId: string;
  timestamp: Date;
}

function clientProfile(input: {
  id: string;
  phone: string;
  sourceProfileId: string;
  tenantId: string;
}): ClientProfileRecord {
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

function clientMergeEvent(input: {
  action?: "client.merge" | "client.unmerge";
  candidateProfileId?: string;
  detachedProfileId?: string;
  id: string;
  primaryProfileId: string;
  tenantId: string;
}): ClientMergeEvent {
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

function knowledgeArticle(input: {
  id: string;
  title: string;
}): KnowledgeArticle {
  return {
    approvalHistory: [],
    attachments: [],
    body: "Knowledge article body",
    category: "Delivery",
    channels: ["SDK"],
    helpfulRate: 0,
    id: input.id,
    owner: "Support Ops",
    status: "draft",
    tenantId: "tenant-volga",
    title: input.title,
    topics: ["Delivery"],
    updated: "2026-06-29T10:00:00.000Z",
    usage: 0,
    version: "v1",
    versions: [],
    visibility: "private"
  };
}
