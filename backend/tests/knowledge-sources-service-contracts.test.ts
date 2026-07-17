import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import { KnowledgeSourcesService } from "../apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts";
import { UrlSourcePolicyRepository } from "../apps/api-gateway/src/knowledge-sources/url-source-policy.repository.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";

describe("knowledge source catalog service", () => {
  it("keeps a remote URL pending and rejects unsafe URLs", async () => {
    const service = new KnowledgeSourcesService(KnowledgeSourceRepository.inMemory(), WorkspaceRepository.inMemory(), {}, UrlSourcePolicyRepository.inMemory());
    const unsafe = await service.create("tenant-volga", { kind: "url", sourceConfig: { url: "http://127.0.0.1/private" }, title: "Unsafe" });
    const safe = await service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq#fragment" }, title: "FAQ" });

    assert.equal(unsafe.error?.code, "url_source_https_required");
    assert.equal(safe.status, "ok");
    const source = safe.data.source as { readiness: string; sourceConfig: { url: string }; status: string };
    assert.equal(source.status, "draft");
    assert.equal(source.readiness, "not_ready");
    assert.equal(source.sourceConfig.url.includes("#"), false);
  });

  it("does not reveal sources across tenants and can disable one safely", async () => {
    const repository = KnowledgeSourceRepository.inMemory();
    const service = new KnowledgeSourcesService(repository, WorkspaceRepository.inMemory(), {}, UrlSourcePolicyRepository.inMemory());
    const created = await service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq" }, title: "FAQ" });
    const id = String((created.data.source as { id: string }).id);
    const disabled = await service.disable("tenant-volga", id);

    assert.equal(((await service.list("tenant-ladoga")).data.sources as unknown[]).length, 0);
    assert.equal((disabled.data.source as { status: string }).status, "disabled");
  });

  it("refreshes a URL only on the server and requires approval before retrieval", async () => {
    const repository = KnowledgeSourceRepository.inMemory();
    const service = new KnowledgeSourcesService(repository, WorkspaceRepository.inMemory(), {
      fetch: async () => new Response("<html><script>ignore()</script><body>Delivery status FAQ</body></html>", { headers: { "content-type": "text/html" }, status: 200 }),
      resolveHostname: async () => [{ address: "8.8.8.8" }]
    }, UrlSourcePolicyRepository.inMemory());
    const created = await service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq" }, title: "FAQ" });
    const id = String((created.data.source as { id: string }).id);
    const refreshed = await service.refreshUrl("tenant-volga", id);
    const pending = refreshed.data.source as { approvalStatus: string; metadata: { extractedText: string }; readiness: string; status: string };
    assert.equal(pending.status, "ready"); assert.equal(pending.approvalStatus, "pending"); assert.equal(pending.readiness, "stale"); assert.equal(pending.metadata.extractedText.includes("ignore"), false);
    const approved = await service.approve("tenant-volga", id);
    assert.equal((approved.data.source as { readiness: string }).readiness, "ready");
  });

  it("bulk-approves only ready pending sources of the tenant and reports skipped ones", async () => {
    const repository = KnowledgeSourceRepository.inMemory();
    const service = new KnowledgeSourcesService(repository, WorkspaceRepository.inMemory(), {}, UrlSourcePolicyRepository.inMemory());
    const now = "2026-07-17T10:00:00.000Z";
    const base = {
      approvalStatus: "pending" as const, approvedAt: null, approvedBy: null, archivedAt: null, contentChecksum: null, createdAt: now,
      disabledAt: null, failedAt: null, failureCode: null, kind: "document" as const, lastIndexedAt: now, lastIngestedAt: now, metadata: {},
      owner: "op", readiness: "stale" as const, retentionUntil: null, sourceConfig: {}, sourceRef: null, status: "ready" as const,
      tenantId: "tenant-volga", title: "Doc", updatedAt: now, version: 1
    };
    await repository.save({ ...base, id: "doc-a" });
    await repository.save({ ...base, id: "doc-b" });
    await repository.save({ ...base, id: "doc-draft", status: "draft" });
    await repository.save({ ...base, approvalStatus: "approved", id: "doc-approved" });
    await repository.save({ ...base, id: "doc-foreign", tenantId: "tenant-ladoga" });

    const empty = await service.approveBulk("tenant-volga", { sourceIds: [] });
    assert.equal(empty.error?.code, "knowledge_bulk_approve_invalid");
    const oversized = await service.approveBulk("tenant-volga", { sourceIds: Array.from({ length: 101 }, (_, index) => `doc-${index}`) });
    assert.equal(oversized.error?.code, "knowledge_bulk_approve_too_many");

    const result = await service.approveBulk("tenant-volga", { sourceIds: ["doc-a", "doc-b", "doc-a", "doc-draft", "doc-approved", "doc-foreign", "missing"] });
    assert.equal(result.status, "ok");
    const approved = result.data.approved as Array<{ approvalStatus: string; id: string; readiness: string }>;
    assert.deepEqual(approved.map((source) => source.id), ["doc-a", "doc-b"]);
    assert.ok(approved.every((source) => source.approvalStatus === "approved" && source.readiness === "ready"));
    assert.deepEqual(result.data.skipped, [
      { code: "knowledge_source_not_ready", sourceId: "doc-draft" },
      { code: "knowledge_source_already_approved", sourceId: "doc-approved" },
      { code: "knowledge_source_not_ready", sourceId: "doc-foreign" },
      { code: "knowledge_source_not_ready", sourceId: "missing" }
    ]);
    assert.equal((await repository.find("tenant-ladoga", "doc-foreign"))?.approvalStatus, "pending");
  });

  it("rejects a URL when DNS resolves it to a private address", async () => {
    const repository = KnowledgeSourceRepository.inMemory();
    const service = new KnowledgeSourcesService(repository, WorkspaceRepository.inMemory(), { resolveHostname: async () => [{ address: "127.0.0.1" }] }, UrlSourcePolicyRepository.inMemory());
    const created = await service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/private" }, title: "Unsafe DNS" });
    const refreshed = await service.refreshUrl("tenant-volga", String((created.data.source as { id: string }).id));
    assert.equal(refreshed.error?.code, "url_source_fetch_failed");
  });
});
