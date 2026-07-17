import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { HttpMcpReadOnlyTransport, McpReadOnlyConnectorService } from "../apps/api-gateway/src/knowledge-sources/mcp-readonly-connector.service.ts";

describe("read-only MCP connector contract", () => {
  const connector = {
    allowedHosts: ["mcp.example.test"], approved: true, endpoint: "https://mcp.example.test/v1", id: "mcp_docs", tenantId: "tenant-volga",
    tools: [{ mode: "read" as const, name: "search_documents" }]
  };

  it("keeps one connector limiter for the lifetime of the AI bot response service", () => {
    const source = readFileSync(new URL(
      "../apps/api-gateway/src/automation/ai-bot-response.service.ts",
      import.meta.url
    ), "utf8");

    assert.match(source, /private readonly mcpConnectors = new McpReadOnlyConnectorService/);
    assert.match(source, /this\.mcpConnectors\.invoke/);
    assert.doesNotMatch(source, /private mcpInvoker\(\)[\s\S]*const service = new McpReadOnlyConnectorService/);
  });

  it("allows only preconfigured read tools for the owning tenant", async () => {
    const calls: string[] = [];
    const service = new McpReadOnlyConnectorService({ call: async ({ toolName }) => { calls.push(toolName); return "public FAQ"; } });
    assert.deepEqual(service.register(connector), { ok: true });
    assert.deepEqual(await service.invoke("tenant-ladoga", "mcp_docs", "search_documents"), { ok: false, code: "mcp_connector_not_found" });
    assert.deepEqual(await service.invoke("tenant-volga", "mcp_docs", "delete_document"), { ok: false, code: "mcp_tool_forbidden" });
    assert.deepEqual(await service.invoke("tenant-volga", "mcp_docs", "search_documents"), { ok: true, result: { content: "public FAQ", truncated: false } });
    assert.deepEqual(calls, ["search_documents"]);
  });

  it("uses a fixed JSON-RPC request without custom headers or redirects", async () => {
    let request: RequestInit | undefined;
    const transport = new HttpMcpReadOnlyTransport(async (_url, init) => {
      request = init; return new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { content: "FAQ" } }), { headers: { "content-type": "application/json" }, status: 200 });
    }, async () => [{ address: "93.184.216.34" }]);
    const result = await transport.call({ endpoint: "https://mcp.example.test/rpc", signal: new AbortController().signal, toolInput: { q: "billing" }, toolName: "search_documents" });
    assert.deepEqual(result, { content: "FAQ" });
    assert.deepEqual(request?.headers, { Accept: "application/json", "Content-Type": "application/json" });
    assert.equal(request?.redirect, "error");
    assert.match(String(request?.body), /"method":"tools\/call"/);
  });

  it("rejects an allowlisted hostname if DNS resolves to a private address", async () => {
    let called = false;
    const transport = new HttpMcpReadOnlyTransport(async () => { called = true; return new Response("{}"); }, async () => [{ address: "127.0.0.1" }]);
    await assert.rejects(() => transport.call({ endpoint: "https://mcp.example.test", signal: new AbortController().signal, toolInput: {}, toolName: "search" }), /url_source_dns_forbidden/);
    assert.equal(called, false);
  });

  it("rejects write-like tools and endpoints outside the connector allowlist", () => {
    const service = new McpReadOnlyConnectorService({ call: async () => "unused" });
    assert.deepEqual(service.register({ ...connector, tools: [{ mode: "read", name: "create_ticket" }] }), { ok: false, code: "mcp_connector_invalid" });
    assert.deepEqual(service.register({ ...connector, endpoint: "https://other.example.test/mcp" }), { ok: false, code: "mcp_connector_invalid" });
  });

  it("caps tool input, output and waiting time", async () => {
    const service = new McpReadOnlyConnectorService({ call: async ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) }, 5);
    service.register(connector);
    assert.equal((await service.invoke("tenant-volga", "mcp_docs", "search_documents", { q: "x".repeat(8_001) })).code, "mcp_input_too_large");
    assert.equal((await service.invoke("tenant-volga", "mcp_docs", "search_documents")).code, "mcp_timeout");
    const capped = new McpReadOnlyConnectorService({ call: async () => "x".repeat(20_001) }); capped.register(connector);
    const result = await capped.invoke("tenant-volga", "mcp_docs", "search_documents");
    assert.equal(result.ok, true); if (result.ok) { assert.equal(result.result.content.length, 20_000); assert.equal(result.result.truncated, true); }
  });
});
