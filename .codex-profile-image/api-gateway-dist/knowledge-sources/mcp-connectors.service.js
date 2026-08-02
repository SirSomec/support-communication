import { randomUUID } from "node:crypto";
import { createEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "../identity/backend-ids.js";
import { IdentityRepository } from "../identity/identity.repository.js";
import { McpConnectorRepository } from "./mcp-connector.repository.js";
import { validateMcpConnector } from "./mcp-readonly-connector.service.js";
const SERVICE = "mcpConnectorsService";
export class McpConnectorsService {
    repository;
    identity;
    environment;
    constructor(repository = McpConnectorRepository.default(), identity = IdentityRepository.default(), environment = process.env) {
        this.repository = repository;
        this.identity = identity;
        this.environment = environment;
    }
    async list(tenantId) { return ok("listMcpConnectors", tenantId, { connectors: await this.repository.list(tenantId) }); }
    /**
     * BAI-831: заявка тенант-администратора. Коннектор создаётся неодобренным и
     * выключенным; включить его сможет только Service Admin после одобрения.
     * Хост всё равно должен быть в глобальном allowlist — это защита от SSRF.
     */
    async request(tenantId, input, requestedBy) {
        const now = new Date().toISOString();
        const id = `mcp_${randomUUID()}`;
        const candidate = this.build({ approvedAt: null, approvedBy: null, createdAt: now, id, requestedBy, status: "disabled", tenantId, updatedAt: now }, input);
        if (typeof candidate === "string")
            return invalid("requestMcpConnector", tenantId, candidate);
        const record = await this.repository.save({ ...candidate, name: input.name, description: input.description });
        return ok("requestMcpConnector", tenantId, { auditEvent: await this.audit("mcp.connector.request", record, { id: requestedBy, name: requestedBy }, "requested"), connector: record });
    }
    async create(tenantId, input, actor) {
        const now = new Date().toISOString();
        const id = `mcp_${randomUUID()}`;
        const candidate = this.build({ approvedAt: null, approvedBy: null, createdAt: now, id, status: "disabled", tenantId, updatedAt: now }, input);
        if (typeof candidate === "string")
            return invalid("createMcpConnector", tenantId, candidate);
        const record = await this.repository.save(candidate);
        return ok("createMcpConnector", tenantId, { auditEvent: await this.audit("mcp.connector.create", record, actor, "created"), connector: record });
    }
    async update(tenantId, id, input, actor) {
        const prior = await this.repository.find(tenantId, id);
        if (!prior)
            return missing("updateMcpConnector", tenantId, id);
        const candidate = this.build({ ...prior, approvedAt: null, approvedBy: null, status: "disabled", updatedAt: new Date().toISOString() }, input);
        if (typeof candidate === "string")
            return invalid("updateMcpConnector", tenantId, candidate);
        const record = await this.repository.save(candidate);
        return ok("updateMcpConnector", tenantId, { auditEvent: await this.audit("mcp.connector.update", record, actor, "approval_reset"), connector: record });
    }
    async approve(tenantId, id, actor) {
        const prior = await this.repository.find(tenantId, id);
        if (!prior)
            return missing("approveMcpConnector", tenantId, id);
        const record = await this.repository.save({ ...prior, approvedAt: new Date().toISOString(), approvedBy: actor.id, updatedAt: new Date().toISOString() });
        return ok("approveMcpConnector", tenantId, { auditEvent: await this.audit("mcp.connector.approve", record, actor, "approved"), connector: record });
    }
    async setEnabled(tenantId, id, enabled, actor) {
        const operation = enabled ? "enableMcpConnector" : "disableMcpConnector";
        const prior = await this.repository.find(tenantId, id);
        if (!prior)
            return missing(operation, tenantId, id);
        if (enabled && !prior.approvedAt)
            return invalid(operation, tenantId, "Connector must be approved before it can be enabled.");
        const record = await this.repository.save({ ...prior, status: enabled ? "enabled" : "disabled", updatedAt: new Date().toISOString() });
        return ok(operation, tenantId, { auditEvent: await this.audit(`mcp.connector.${enabled ? "enable" : "disable"}`, record, actor, enabled ? "enabled" : "disabled"), connector: record });
    }
    build(base, input) {
        if (Object.keys(input).some((key) => !["description", "endpoint", "name", "rateLimitPerMinute", "requestedBy", "tools"].includes(key)))
            return "Only name, endpoint, read-only tools and rate limit may be configured.";
        const endpoint = String(input.endpoint ?? base.endpoint ?? "").trim();
        let host = "";
        try {
            host = new URL(endpoint).hostname.toLowerCase();
        }
        catch {
            return "A valid HTTPS MCP endpoint is required.";
        }
        const policy = allowedHosts(this.environment);
        if (!policy.includes(host))
            return "MCP endpoint is not in the service allowlist.";
        const tools = (input.tools ?? base.tools ?? []).map((tool) => ({ mode: "read", name: String(tool.name ?? "").trim() }));
        if ((input.tools ?? []).some((tool) => tool.mode !== undefined && tool.mode !== "read"))
            return "Only read-only MCP tools are allowed.";
        const value = { ...base, allowedHosts: [host], endpoint, rateLimitPerMinute: Number(input.rateLimitPerMinute ?? base.rateLimitPerMinute ?? 60), tools };
        return validateMcpConnector({ ...value, approved: Boolean(value.approvedAt) }).ok ? value : "Connector endpoint or tool allowlist is unsafe.";
    }
    async audit(action, record, actor, result) {
        return await this.identity.recordServiceAdminAuditEvent({ action, actor: actor.id, actorName: actor.name, at: new Date().toISOString(), id: makeAuditId("mcp_connector"), immutable: true, reason: null, result, severity: "info", target: `mcp-connector:${record.id}`, tenantId: record.tenantId, traceId: `trc_${randomUUID()}`, userId: null });
    }
}
function allowedHosts(env) { return String(env.MCP_CONNECTOR_ALLOWED_HOSTS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean); }
function ok(operation, tenantId, data) { return createEnvelope({ data, error: null, meta: { tenantId }, operation, service: SERVICE, status: "ok", traceId: `trc_${randomUUID()}` }); }
function invalid(operation, tenantId, message) { return createEnvelope({ data: {}, error: { code: "mcp_connector_invalid", message }, meta: { tenantId }, operation, service: SERVICE, status: "invalid", traceId: `trc_${randomUUID()}` }); }
function missing(operation, tenantId, id) { return createEnvelope({ data: {}, error: { code: "mcp_connector_not_found", message: `MCP connector ${id} was not found.` }, meta: { tenantId }, operation, service: SERVICE, status: "invalid", traceId: `trc_${randomUUID()}` }); }
//# sourceMappingURL=mcp-connectors.service.js.map