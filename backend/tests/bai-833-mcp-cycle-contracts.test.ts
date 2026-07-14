import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KnowledgeRetrievalService, type McpRetrievalInvoker } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval.service.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import { KnowledgeSourcesService } from "../apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts";
import { McpConnectorRepository, type McpConnectorRecord } from "../apps/api-gateway/src/knowledge-sources/mcp-connector.repository.ts";
import { McpConnectorsService } from "../apps/api-gateway/src/knowledge-sources/mcp-connectors.service.ts";
import { KnowledgeRetrievalCache } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval-cache.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";
import type { McpReadOnlyResult } from "../apps/api-gateway/src/knowledge-sources/mcp-readonly-connector.service.ts";

const TENANT = "tenant-volga";
const ACTOR = { id: "svc-admin", name: "Service Admin" };

function connector(overrides: Partial<McpConnectorRecord> = {}): McpConnectorRecord {
  return {
    allowedHosts: ["mcp.example.test"],
    approvedAt: "2026-07-14T10:00:00.000Z",
    approvedBy: "svc-admin",
    createdAt: "2026-07-14T09:00:00.000Z",
    endpoint: "https://mcp.example.test/rpc",
    id: "mcp-1",
    name: "Каталог заказов",
    rateLimitPerMinute: 60,
    status: "enabled",
    tenantId: TENANT,
    tools: [{ mode: "read", name: "order_status" }],
    updatedAt: "2026-07-14T10:00:00.000Z",
    ...overrides
  };
}

function mcpSource(id = "src-mcp") {
  return {
    approvalStatus: "approved" as const,
    approvedAt: "2026-07-14T10:00:00.000Z",
    approvedBy: "admin",
    archivedAt: null,
    contentChecksum: null,
    createdAt: "2026-07-14T10:00:00.000Z",
    disabledAt: null,
    failedAt: null,
    failureCode: null,
    id,
    kind: "mcp" as const,
    lastIndexedAt: "2026-07-14T10:00:00.000Z",
    lastIngestedAt: "2026-07-14T10:00:00.000Z",
    metadata: {},
    owner: "admin",
    readiness: "ready" as const,
    retentionUntil: null,
    sourceConfig: { connectorId: "mcp-1", tool: "order_status" },
    sourceRef: null,
    status: "ready" as const,
    tenantId: TENANT,
    title: "Каталог заказов",
    updatedAt: "2026-07-14T10:00:00.000Z",
    version: 1
  };
}

describe("BAI-831 tenant MCP request flow", () => {
  it("creates an unapproved, disabled connector from a tenant request within the host allowlist", async () => {
    const repo = McpConnectorRepository.inMemory();
    const service = new McpConnectorsService(repo, undefined as never, { MCP_CONNECTOR_ALLOWED_HOSTS: "mcp.example.test" } as NodeJS.ProcessEnv);
    const result = await service.request(TENANT, { endpoint: "https://mcp.example.test/rpc", name: "Каталог", tools: [{ name: "order_status" }] }, "tenant-admin");
    assert.equal(result.status, "ok");
    const record = result.data.connector as McpConnectorRecord;
    assert.equal(record.approvedAt, null);
    assert.equal(record.status, "disabled");
    assert.equal(record.requestedBy, "tenant-admin");
  });

  it("rejects a request whose host is not in the service allowlist", async () => {
    const repo = McpConnectorRepository.inMemory();
    const service = new McpConnectorsService(repo, undefined as never, { MCP_CONNECTOR_ALLOWED_HOSTS: "trusted.example.test" } as NodeJS.ProcessEnv);
    const result = await service.request(TENANT, { endpoint: "https://evil.example.test/rpc", tools: [{ name: "order_status" }] }, "tenant-admin");
    assert.equal(result.status, "invalid");
  });
});

describe("BAI-833 MCP as a knowledge source", () => {
  it("creates an mcp source only against an approved, enabled connector with an allowed tool", async () => {
    const connectors = McpConnectorRepository.inMemory({ connectors: [connector()] });
    McpConnectorRepository.useDefault(connectors);
    try {
      const service = new KnowledgeSourcesService(KnowledgeSourceRepository.inMemory(), WorkspaceRepository.inMemory());
      const ready = await service.create(TENANT, { kind: "mcp", sourceConfig: { connectorId: "mcp-1", tool: "order_status" }, title: "Заказы" });
      assert.equal(ready.status, "ok");
      assert.equal((ready.data.source as { status: string }).status, "ready");

      const badTool = await service.create(TENANT, { kind: "mcp", sourceConfig: { connectorId: "mcp-1", tool: "delete_order" }, title: "Bad" });
      assert.equal(badTool.error?.code, "mcp_tool_not_allowed");

      connectors.save(connector({ status: "disabled" }));
      const disabled = await service.create(TENANT, { kind: "mcp", sourceConfig: { connectorId: "mcp-1", tool: "order_status" }, title: "Disabled" });
      assert.equal(disabled.error?.code, "mcp_connector_not_ready");
    } finally {
      McpConnectorRepository.clearDefault();
    }
  });

  it("returns a live MCP passage with an MCP-labelled citation", async () => {
    const sources = KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources: [mcpSource()] });
    const calls: Array<{ connectorId: string; toolName: string; query: unknown }> = [];
    const invoker: McpRetrievalInvoker = {
      invoke: async (_tenantId, connectorId, toolName, toolInput): Promise<McpReadOnlyResult> => {
        calls.push({ connectorId, query: toolInput.query, toolName });
        return { ok: true, result: { content: "Заказ №42 доставлен 12 июля.", truncated: false } };
      }
    };
    const result = await new KnowledgeRetrievalService(sources, WorkspaceRepository.inMemory(), new KnowledgeRetrievalCache(), invoker).retrieve({
      query: "Где заказ 42?",
      sourceBindings: [{ sourceId: "src-mcp" }],
      tenantId: TENANT
    });
    assert.equal(result.passages.length, 1);
    assert.equal(result.passages[0]?.citation.title, "MCP: Каталог заказов");
    assert.equal(result.passages[0]?.content.includes("Заказ №42"), true);
    assert.equal(calls[0]?.connectorId, "mcp-1");
    assert.equal(calls[0]?.toolName, "order_status");
  });

  it("treats an MCP error as no evidence rather than a fabricated answer", async () => {
    const sources = KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources: [mcpSource()] });
    const invoker: McpRetrievalInvoker = {
      invoke: async (): Promise<McpReadOnlyResult> => ({ ok: false, code: "mcp_timeout" })
    };
    const result = await new KnowledgeRetrievalService(sources, WorkspaceRepository.inMemory(), new KnowledgeRetrievalCache(), invoker).retrieve({
      query: "Где заказ 42?",
      sourceBindings: [{ sourceId: "src-mcp" }],
      tenantId: TENANT
    });
    assert.equal(result.passages.length, 0);
  });

  it("does not call MCP for a foreign tenant binding", async () => {
    const sources = KnowledgeSourceRepository.inMemory({ ingestionJobs: [], sources: [mcpSource()] });
    let called = 0;
    const invoker: McpRetrievalInvoker = { invoke: async (): Promise<McpReadOnlyResult> => { called += 1; return { ok: true, result: { content: "x", truncated: false } }; } };
    const result = await new KnowledgeRetrievalService(sources, WorkspaceRepository.inMemory(), new KnowledgeRetrievalCache(), invoker).retrieve({
      query: "Где заказ?",
      sourceBindings: [{ sourceId: "src-mcp" }],
      tenantId: "tenant-ladoga"
    });
    assert.equal(result.passages.length, 0);
    assert.equal(called, 0);
  });
});
