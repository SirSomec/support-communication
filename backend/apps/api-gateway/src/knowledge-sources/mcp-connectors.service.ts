import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "../identity/backend-ids.js";
import { IdentityRepository } from "../identity/identity.repository.js";
import type { ServiceAdminActor } from "../identity/service-admin-auth.js";
import { McpConnectorRepository, type McpConnectorRecord } from "./mcp-connector.repository.js";
import { validateMcpConnector } from "./mcp-readonly-connector.service.js";

export interface McpConnectorWriteInput { description?: string; endpoint?: string; name?: string; rateLimitPerMinute?: number; requestedBy?: string; tools?: Array<{ name?: string; mode?: string }>; }
const SERVICE = "mcpConnectorsService";

export class McpConnectorsService {
  constructor(private readonly repository = McpConnectorRepository.default(), private readonly identity = IdentityRepository.default(), private readonly environment: NodeJS.ProcessEnv = process.env) {}

  list(tenantId: string): BackendEnvelope<Record<string, unknown>> { return ok("listMcpConnectors", tenantId, { connectors: this.repository.list(tenantId) }); }

  /**
   * BAI-831: заявка тенант-администратора. Коннектор создаётся неодобренным и
   * выключенным; включить его сможет только Service Admin после одобрения.
   * Хост всё равно должен быть в глобальном allowlist — это защита от SSRF.
   */
  async request(tenantId: string, input: McpConnectorWriteInput, requestedBy: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const now = new Date().toISOString(); const id = `mcp_${randomUUID()}`;
    const candidate = this.build({ approvedAt: null, approvedBy: null, createdAt: now, id, requestedBy, status: "disabled", tenantId, updatedAt: now }, input);
    if (typeof candidate === "string") return invalid("requestMcpConnector", tenantId, candidate);
    const record = this.repository.save({ ...candidate, name: input.name, description: input.description });
    return ok("requestMcpConnector", tenantId, { auditEvent: await this.audit("mcp.connector.request", record, { id: requestedBy, name: requestedBy }, "requested"), connector: record });
  }

  async create(tenantId: string, input: McpConnectorWriteInput, actor: ServiceAdminActor): Promise<BackendEnvelope<Record<string, unknown>>> {
    const now = new Date().toISOString(); const id = `mcp_${randomUUID()}`;
    const candidate = this.build({ approvedAt: null, approvedBy: null, createdAt: now, id, status: "disabled", tenantId, updatedAt: now }, input);
    if (typeof candidate === "string") return invalid("createMcpConnector", tenantId, candidate);
    const record = this.repository.save(candidate);
    return ok("createMcpConnector", tenantId, { auditEvent: await this.audit("mcp.connector.create", record, actor, "created"), connector: record });
  }

  async update(tenantId: string, id: string, input: McpConnectorWriteInput, actor: ServiceAdminActor): Promise<BackendEnvelope<Record<string, unknown>>> {
    const prior = this.repository.find(tenantId, id); if (!prior) return missing("updateMcpConnector", tenantId, id);
    const candidate = this.build({ ...prior, approvedAt: null, approvedBy: null, status: "disabled", updatedAt: new Date().toISOString() }, input);
    if (typeof candidate === "string") return invalid("updateMcpConnector", tenantId, candidate);
    const record = this.repository.save(candidate);
    return ok("updateMcpConnector", tenantId, { auditEvent: await this.audit("mcp.connector.update", record, actor, "approval_reset"), connector: record });
  }

  async approve(tenantId: string, id: string, actor: ServiceAdminActor): Promise<BackendEnvelope<Record<string, unknown>>> {
    const prior = this.repository.find(tenantId, id); if (!prior) return missing("approveMcpConnector", tenantId, id);
    const record = this.repository.save({ ...prior, approvedAt: new Date().toISOString(), approvedBy: actor.id, updatedAt: new Date().toISOString() });
    return ok("approveMcpConnector", tenantId, { auditEvent: await this.audit("mcp.connector.approve", record, actor, "approved"), connector: record });
  }

  async setEnabled(tenantId: string, id: string, enabled: boolean, actor: ServiceAdminActor): Promise<BackendEnvelope<Record<string, unknown>>> {
    const operation = enabled ? "enableMcpConnector" : "disableMcpConnector"; const prior = this.repository.find(tenantId, id);
    if (!prior) return missing(operation, tenantId, id);
    if (enabled && !prior.approvedAt) return invalid(operation, tenantId, "Connector must be approved before it can be enabled.");
    const record = this.repository.save({ ...prior, status: enabled ? "enabled" : "disabled", updatedAt: new Date().toISOString() });
    return ok(operation, tenantId, { auditEvent: await this.audit(`mcp.connector.${enabled ? "enable" : "disable"}`, record, actor, enabled ? "enabled" : "disabled"), connector: record });
  }

  private build(base: Omit<McpConnectorRecord, "allowedHosts" | "endpoint" | "rateLimitPerMinute" | "tools"> & Partial<Pick<McpConnectorRecord, "allowedHosts" | "endpoint" | "rateLimitPerMinute" | "tools">>, input: McpConnectorWriteInput): McpConnectorRecord | string {
    if (Object.keys(input as object).some((key) => !["description", "endpoint", "name", "rateLimitPerMinute", "requestedBy", "tools"].includes(key))) return "Only name, endpoint, read-only tools and rate limit may be configured.";
    const endpoint = String(input.endpoint ?? base.endpoint ?? "").trim(); let host = "";
    try { host = new URL(endpoint).hostname.toLowerCase(); } catch { return "A valid HTTPS MCP endpoint is required."; }
    const policy = allowedHosts(this.environment); if (!policy.includes(host)) return "MCP endpoint is not in the service allowlist.";
    const tools = (input.tools ?? base.tools ?? []).map((tool) => ({ mode: "read" as const, name: String(tool.name ?? "").trim() }));
    if ((input.tools ?? []).some((tool) => tool.mode !== undefined && tool.mode !== "read")) return "Only read-only MCP tools are allowed.";
    const value: McpConnectorRecord = { ...base, allowedHosts: [host], endpoint, rateLimitPerMinute: Number(input.rateLimitPerMinute ?? base.rateLimitPerMinute ?? 60), tools } as McpConnectorRecord;
    return validateMcpConnector({ ...value, approved: Boolean(value.approvedAt) }).ok ? value : "Connector endpoint or tool allowlist is unsafe.";
  }

  private async audit(action: string, record: McpConnectorRecord, actor: ServiceAdminActor, result: string) {
    return await this.identity.recordServiceAdminAuditEvent({ action, actor: actor.id, actorName: actor.name, at: new Date().toISOString(), id: makeAuditId("mcp_connector"), immutable: true, reason: null, result, severity: "info", target: `mcp-connector:${record.id}`, tenantId: record.tenantId, traceId: `trc_${randomUUID()}`, userId: null });
  }
}

function allowedHosts(env: NodeJS.ProcessEnv): string[] { return String(env.MCP_CONNECTOR_ALLOWED_HOSTS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean); }
function ok(operation: string, tenantId: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> { return createEnvelope({ data, error: null, meta: { tenantId }, operation, service: SERVICE, status: "ok", traceId: `trc_${randomUUID()}` }); }
function invalid(operation: string, tenantId: string, message: string): BackendEnvelope<Record<string, unknown>> { return createEnvelope({ data: {}, error: { code: "mcp_connector_invalid", message }, meta: { tenantId }, operation, service: SERVICE, status: "invalid", traceId: `trc_${randomUUID()}` }); }
function missing(operation: string, tenantId: string, id: string): BackendEnvelope<Record<string, unknown>> { return createEnvelope({ data: {}, error: { code: "mcp_connector_not_found", message: `MCP connector ${id} was not found.` }, meta: { tenantId }, operation, service: SERVICE, status: "invalid", traceId: `trc_${randomUUID()}` }); }
