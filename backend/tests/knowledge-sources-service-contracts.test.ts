import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import { KnowledgeSourcesService } from "../apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";

describe("knowledge source catalog service", () => {
  it("keeps a remote URL pending and rejects unsafe URLs", async () => {
    const service = new KnowledgeSourcesService(KnowledgeSourceRepository.inMemory(), WorkspaceRepository.inMemory());
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
    const service = new KnowledgeSourcesService(repository, WorkspaceRepository.inMemory());
    const created = await service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq" }, title: "FAQ" });
    const id = String((created.data.source as { id: string }).id);
    const disabled = await service.disable("tenant-volga", id);

    assert.equal(service.list("tenant-ladoga").data.sources.length, 0);
    assert.equal((disabled.data.source as { status: string }).status, "disabled");
  });

  it("refreshes a URL only on the server and requires approval before retrieval", async () => {
    const repository = KnowledgeSourceRepository.inMemory();
    const service = new KnowledgeSourcesService(repository, WorkspaceRepository.inMemory(), {
      fetch: async () => new Response("<html><script>ignore()</script><body>Delivery status FAQ</body></html>", { headers: { "content-type": "text/html" }, status: 200 }),
      resolveHostname: async () => [{ address: "8.8.8.8" }]
    });
    const created = await service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq" }, title: "FAQ" });
    const id = String((created.data.source as { id: string }).id);
    const refreshed = await service.refreshUrl("tenant-volga", id);
    const pending = refreshed.data.source as { approvalStatus: string; metadata: { extractedText: string }; readiness: string; status: string };
    assert.equal(pending.status, "ready"); assert.equal(pending.approvalStatus, "pending"); assert.equal(pending.readiness, "stale"); assert.equal(pending.metadata.extractedText.includes("ignore"), false);
    const approved = await service.approve("tenant-volga", id);
    assert.equal((approved.data.source as { readiness: string }).readiness, "ready");
  });

  it("rejects a URL when DNS resolves it to a private address", async () => {
    const repository = KnowledgeSourceRepository.inMemory();
    const service = new KnowledgeSourcesService(repository, WorkspaceRepository.inMemory(), { resolveHostname: async () => [{ address: "127.0.0.1" }] });
    const created = await service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/private" }, title: "Unsafe DNS" });
    const refreshed = await service.refreshUrl("tenant-volga", String((created.data.source as { id: string }).id));
    assert.equal(refreshed.error?.code, "url_source_fetch_failed");
  });
});
