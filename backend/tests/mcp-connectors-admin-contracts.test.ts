import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { McpConnectorRepository } from "../apps/api-gateway/src/knowledge-sources/mcp-connector.repository.ts";
import { McpConnectorsService } from "../apps/api-gateway/src/knowledge-sources/mcp-connectors.service.ts";
import { McpReadOnlyConnectorService } from "../apps/api-gateway/src/knowledge-sources/mcp-readonly-connector.service.ts";

const actor = { id: "admin-1", name: "Admin" };
const env = { MCP_CONNECTOR_ALLOWED_HOSTS: "mcp.example.test" };

describe("service-admin MCP connector lifecycle", () => {
  it("creates disabled, requires approval, resets approval on update and audits every mutation", async () => {
    const repository = McpConnectorRepository.inMemory(); const audit = IdentityRepository.inMemory();
    const service = new McpConnectorsService(repository, audit, env);
    const created = await service.create("tenant-a", { endpoint: "https://mcp.example.test/rpc", rateLimitPerMinute: 2, tools: [{ mode: "read", name: "search_docs" }] }, actor);
    assert.equal(created.status, "ok");
    const connector = created.data.connector as { id: string; approvedAt: string | null; status: string };
    assert.equal(connector.status, "disabled"); assert.equal(connector.approvedAt, null);
    assert.equal((await service.setEnabled("tenant-a", connector.id, true, actor)).error?.code, "mcp_connector_invalid");
    await service.approve("tenant-a", connector.id, actor); await service.setEnabled("tenant-a", connector.id, true, actor);
    assert.equal(repository.find("tenant-a", connector.id)?.status, "enabled");
    await service.update("tenant-a", connector.id, { tools: [{ mode: "read", name: "get_faq" }] }, actor);
    assert.equal(repository.find("tenant-a", connector.id)?.approvedAt, null); assert.equal(repository.find("tenant-a", connector.id)?.status, "disabled");
    const events = await audit.listServiceAdminAuditEvents();
    assert.deepEqual(new Set(events.map((event) => event.action)), new Set(["mcp.connector.create", "mcp.connector.approve", "mcp.connector.enable", "mcp.connector.update"]));
    assert.equal(events.every((event) => event.immutable), true);
  });

  it("isolates tenants and rejects arbitrary hosts, headers and write tools", async () => {
    const repository = McpConnectorRepository.inMemory(); const service = new McpConnectorsService(repository, IdentityRepository.inMemory(), env);
    assert.equal((await service.create("tenant-a", { endpoint: "https://evil.test", tools: [{ name: "read" }] }, actor)).status, "invalid");
    assert.equal((await service.create("tenant-a", { endpoint: "https://mcp.example.test", tools: [{ mode: "write", name: "read" }] }, actor)).status, "invalid");
    assert.equal((await service.create("tenant-a", { endpoint: "https://mcp.example.test", tools: [{ name: "delete_document" }] }, actor)).status, "invalid");
    const injected = await service.create("tenant-a", { endpoint: "https://mcp.example.test", tools: [{ name: "search" }], headers: { Authorization: "secret" } } as never, actor);
    assert.equal(injected.status, "invalid"); assert.equal(JSON.stringify(injected).includes("secret"), false);
    const good = await service.create("tenant-a", { endpoint: "https://mcp.example.test", tools: [{ name: "search" }] }, actor);
    const id = String((good.data.connector as { id: string }).id);
    assert.equal(service.list("tenant-b").data.connectors.length, 0);
    assert.equal((await service.approve("tenant-b", id, actor)).error?.code, "mcp_connector_not_found");
  });

  it("runtime reads persisted approval/status and enforces the configured rate limit", async () => {
    const repository = McpConnectorRepository.inMemory(); const admin = new McpConnectorsService(repository, IdentityRepository.inMemory(), env);
    const created = await admin.create("tenant-a", { endpoint: "https://mcp.example.test", rateLimitPerMinute: 1, tools: [{ name: "search" }] }, actor);
    const id = String((created.data.connector as { id: string }).id); let calls = 0;
    const runtime = new McpReadOnlyConnectorService({ call: async () => { calls += 1; return "answer"; } }, 100, repository);
    assert.equal((await runtime.invoke("tenant-a", id, "search")).code, "mcp_connector_unapproved");
    await admin.approve("tenant-a", id, actor); await admin.setEnabled("tenant-a", id, true, actor);
    assert.equal((await runtime.invoke("tenant-a", id, "search")).ok, true);
    assert.equal((await runtime.invoke("tenant-a", id, "search")).code, "mcp_rate_limited");
    await admin.setEnabled("tenant-a", id, false, actor);
    assert.equal((await runtime.invoke("tenant-a", id, "search")).code, "mcp_connector_disabled"); assert.equal(calls, 1);
  });
});
