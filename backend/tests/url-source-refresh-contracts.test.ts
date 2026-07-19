import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import { KnowledgeSourcesService, type UrlSourceTransport } from "../apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts";
import { UrlSourcePolicyRepository, type PrismaUrlSourcePolicyRow, type UrlSourcePolicyPrismaClient } from "../apps/api-gateway/src/knowledge-sources/url-source-policy.repository.ts";
import { runUrlSourceRefreshOnce } from "../apps/api-gateway/src/knowledge-sources/url-source-refresh.worker.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";

function service(input: { fetch?: UrlSourceTransport; resolveHostname?: (hostname: string) => Promise<Array<{ address: string }>> } = {}) {
  const repository = KnowledgeSourceRepository.inMemory();
  const audit = IdentityRepository.inMemory();
  const policy = UrlSourcePolicyRepository.inMemory();
  return { audit, policy, repository, service: new KnowledgeSourcesService(repository, WorkspaceRepository.inMemory(), input, policy, audit) };
}

describe("URL knowledge source refresh contracts", () => {
  it("enforces a service-admin tenant exact-host policy and records an immutable safe audit event", async () => {
    const subject = service();
    const updated = await subject.service.setUrlPolicy("tenant-volga", { allowedHosts: ["docs.example.test"] });
    const rejected = await subject.service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://other.example.test/faq" }, title: "Other" });
    const allowed = await subject.service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq" }, title: "Docs" });

    assert.equal(updated.status, "ok");
    assert.equal(rejected.error?.code, "url_source_host_not_allowed");
    assert.equal(allowed.status, "ok");
    const events = await subject.audit.listServiceAdminAuditEvents();
    assert.equal(events.every((event) => event.immutable), true);
    assert.equal(events.some((event) => event.action === "knowledge_source.url.policy"), true);
    assert.equal(events.some((event) => event.action === "knowledge_source.url.create"), true);
  });

  it("fails closed when DNS becomes private after the request or the connected peer is private", async () => {
    let resolutions = 0;
    const subject = service({
      fetch: async () => new Response("safe text", { headers: { "content-type": "text/plain" }, status: 200 }),
      resolveHostname: async () => [{ address: ++resolutions === 1 ? "8.8.8.8" : "127.0.0.1" }]
    });
    const created = await subject.service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq" }, title: "Docs" });
    const rebound = await subject.service.refreshUrl("tenant-volga", String((created.data.source as { id: string }).id));
    assert.equal(rebound.error?.code, "url_source_fetch_failed");

    const peer = service({
      fetch: async () => ({ connectedPeerAddress: "10.0.0.7", response: new Response("safe text", { headers: { "content-type": "text/plain" }, status: 200 }) }),
      resolveHostname: async () => [{ address: "8.8.8.8" }]
    });
    const peerCreated = await peer.service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq" }, title: "Docs" });
    const privatePeer = await peer.service.refreshUrl("tenant-volga", String((peerCreated.data.source as { id: string }).id));
    assert.equal(privatePeer.error?.code, "url_source_fetch_failed");
  });

  it("rejects redirects, unsupported MIME and streamed bodies over the limit", async () => {
    for (const response of [
      new Response("redirect", { headers: { "content-type": "text/plain" }, status: 302 }),
      new Response("binary", { headers: { "content-type": "application/pdf" }, status: 200 }),
      new Response("x".repeat(1_000_001), { headers: { "content-type": "text/plain" }, status: 200 })
    ]) {
      const subject = service({ fetch: async () => response.clone(), resolveHostname: async () => [{ address: "8.8.8.8" }] });
      const created = await subject.service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq" }, title: "Docs" });
      const refreshed = await subject.service.refreshUrl("tenant-volga", String((created.data.source as { id: string }).id));
      assert.equal(refreshed.error?.code, "url_source_fetch_failed");
    }
  });

  it("refresh worker processes only due enabled URL sources without restoring the retired approval gate", async () => {
    const subject = service({ fetch: async () => new Response("Delivery FAQ", { headers: { "content-type": "text/plain" }, status: 200 }), resolveHostname: async () => [{ address: "8.8.8.8" }] });
    const created = await subject.service.create("tenant-volga", { kind: "url", sourceConfig: { url: "https://docs.example.test/faq" }, title: "Docs" });
    const id = String((created.data.source as { id: string }).id);
    const current = subject.repository.find("tenant-volga", id)!;
    subject.repository.save({ ...current, metadata: { ...current.metadata, nextRefreshAt: "2020-01-01T00:00:00.000Z" } });

    const result = await runUrlSourceRefreshOnce(subject.service, new Date("2026-07-12T00:00:00.000Z"));
    const refreshed = subject.repository.find("tenant-volga", id)!;
    assert.deepEqual(result, { failed: 0, refreshed: 1 });
    assert.equal(refreshed.status, "ready");
    assert.equal(refreshed.approvalStatus, "approved");
    assert.equal(refreshed.readiness, "ready");
  });
});

function inMemoryPrismaUrlSourcePolicyClient(): UrlSourcePolicyPrismaClient {
  const rows = new Map<string, PrismaUrlSourcePolicyRow>();
  return {
    urlSourcePolicy: {
      findUnique: async ({ where }) => rows.get(where.tenantId) ?? null,
      upsert: async ({ create, update, where }) => {
        const existing = rows.get(where.tenantId);
        const next = (existing ? { ...existing, ...update } : { ...create }) as PrismaUrlSourcePolicyRow;
        rows.set(where.tenantId, next);
        return next;
      }
    }
  };
}

describe("URL source policy prisma branch", () => {
  it("persists the exact-host allowlist, keeps null vs empty-array meaning, and stays tenant-scoped", async () => {
    const repository = UrlSourcePolicyRepository.prisma({ client: inMemoryPrismaUrlSourcePolicyClient() });

    // No row yet → default: null means unrestricted, empty updatedAt.
    const initial = await repository.get("tenant-volga");
    assert.equal(initial.allowedHosts, null);
    assert.equal(initial.updatedAt, "");

    // Save normalizes, dedupes and lower-cases hosts, then round-trips.
    const saved = await repository.save({ allowedHosts: ["Docs.Example.Test", "docs.example.test."], tenantId: "tenant-volga", updatedAt: "2026-07-12T10:00:00.000Z" });
    assert.deepEqual(saved.allowedHosts, ["docs.example.test"]);
    const fetched = await repository.get("tenant-volga");
    assert.deepEqual(fetched.allowedHosts, ["docs.example.test"]);
    assert.equal(fetched.updatedAt, "2026-07-12T10:00:00.000Z");

    // Empty array denies every host — it must not collapse to null.
    await repository.save({ allowedHosts: [], tenantId: "tenant-volga", updatedAt: "2026-07-12T11:00:00.000Z" });
    assert.deepEqual((await repository.get("tenant-volga")).allowedHosts, []);

    // null lifts the restriction again.
    await repository.save({ allowedHosts: null, tenantId: "tenant-volga", updatedAt: "2026-07-12T12:00:00.000Z" });
    assert.equal((await repository.get("tenant-volga")).allowedHosts, null);

    // A different tenant keeps its own unrestricted default.
    assert.equal((await repository.get("tenant-other")).allowedHosts, null);
  });
});
