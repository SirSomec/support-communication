import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "../identity/backend-ids.js";
import { IdentityRepository, type IdentityServiceAdminAuditEvent } from "../identity/identity.repository.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import {
  canTransitionKnowledgeSourceStatus,
  deriveKnowledgeSourceReadiness,
  type KnowledgeSourceKind,
  type KnowledgeSourceRecord
} from "./knowledge-source.types.js";
import { validateUrlKnowledgeSourceConfig } from "./url-source-config.js";
import { ingestKnowledgeDocument } from "./document-ingestion.js";
import { UrlSourcePolicyRepository, type UrlSourcePolicy } from "./url-source-policy.repository.js";
import { AutomationRepository } from "../automation/automation.repository.js";
import { McpConnectorRepository } from "./mcp-connector.repository.js";

const SERVICE = "knowledgeSourcesService";
const URL_SOURCE_MAX_BYTES = 1_000_000;
const URL_SOURCE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const knowledgeSourceBulkActions = ["approve", "archive", "delete", "disable", "enable"] as const;
export type KnowledgeSourceBulkAction = typeof knowledgeSourceBulkActions[number];

export interface KnowledgeSourceCreateInput {
  kind?: KnowledgeSourceKind;
  sourceConfig?: Record<string, unknown>;
  sourceRef?: string;
  title?: string;
}

export interface UrlSourceTransportResult { connectedPeerAddress?: string; response: Response; }
export type UrlSourceTransport = (url: string, init: RequestInit) => Promise<Response | UrlSourceTransportResult>;
export interface UrlSourcePolicyWriteInput { allowedHosts?: string[] | null; }

export class KnowledgeSourcesService {
  constructor(
    private readonly repository = KnowledgeSourceRepository.default(),
    private readonly workspaceRepository = WorkspaceRepository.default(),
    private readonly options: { fetch?: UrlSourceTransport; resolveHostname?: (hostname: string) => Promise<Array<{ address: string }>> } = {},
    private readonly policyRepository = UrlSourcePolicyRepository.default(),
    private readonly identityRepository = IdentityRepository.default(),
    private readonly automationRepository = AutomationRepository.default()
  ) {}

  async list(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    return envelope("listKnowledgeSources", tenantId, {
      sources: await this.repository.list(tenantId),
      usage: await this.scenarioUsage(tenantId)
    });
  }

  /** BAI-822: где используется каждый источник — по обычным привязкам и черновикам сценариев. */
  private async scenarioUsage(tenantId: string): Promise<Record<string, Array<{ enabled: boolean; name: string; scenarioId: string; status: string }>>> {
    const state = await this.automationRepository.readStateAsync();
    const usage: Record<string, Array<{ enabled: boolean; name: string; scenarioId: string; status: string }>> = {};
    for (const scenario of state.botScenarios) {
      if (scenario.tenantId !== tenantId || scenario.status === "archived") continue;
      const bindings = [...(scenario.sourceBindings ?? []), ...(scenario.draft?.sourceBindings ?? [])];
      for (const sourceId of new Set(bindings.map((binding) => binding.sourceId).filter(Boolean))) {
        usage[sourceId] = [...(usage[sourceId] ?? []), { enabled: scenario.enabled !== false, name: scenario.name, scenarioId: scenario.id, status: scenario.status }];
      }
    }
    return usage;
  }

  private async boundScenarios(tenantId: string, sourceId: string): Promise<Array<{ enabled: boolean; name: string; scenarioId: string; status: string }>> {
    return (await this.scenarioUsage(tenantId))[sourceId] ?? [];
  }

  async update(tenantId: string, sourceId: string, input: { title?: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current) return invalid("updateKnowledgeSource", tenantId, "knowledge_source_not_found", "Источник знаний не найден.");
    const title = String(input.title ?? "").trim();
    if (!title) return invalid("updateKnowledgeSource", tenantId, "knowledge_source_title_required", "Укажите название источника.");
    const source = await this.repository.save({ ...current, title, updatedAt: new Date().toISOString(), version: current.version + 1 });
    return envelope("updateKnowledgeSource", tenantId, { source });
  }

  async enable(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current) return invalid("enableKnowledgeSource", tenantId, "knowledge_source_not_found", "Источник знаний не найден.");
    if (current.status !== "disabled") return invalid("enableKnowledgeSource", tenantId, "knowledge_source_not_disabled", "Включить можно только отключённый источник.");
    if (!canTransitionKnowledgeSourceStatus(current.status, "ready")
      && !canTransitionKnowledgeSourceStatus(current.status, "draft")) {
      return invalid("enableKnowledgeSource", tenantId, "knowledge_source_transition_invalid", "This source cannot be enabled from its current status.");
    }
    if (current.kind === "mcp") {
      const connectorId = String(current.sourceConfig.connectorId ?? "").trim();
      const connector = connectorId
        ? await McpConnectorRepository.default().find(tenantId, connectorId)
        : undefined;
      if (!connector || !connector.approvedAt || connector.status !== "enabled") {
        return invalid("enableKnowledgeSource", tenantId, "mcp_connector_not_ready", "MCP connector must still be approved and enabled.");
      }
    }
    const hasIndexedContent = Array.isArray(current.metadata.chunks) && current.metadata.chunks.length > 0;
    const disabledFromStatus = String(current.metadata.disabledFromStatus ?? "");
    const wasReady = current.kind === "mcp"
      || disabledFromStatus === "ready"
      || current.readiness === "ready"
      || hasIndexedContent;
    const status: KnowledgeSourceRecord["status"] = wasReady ? "ready" : "draft";
    const { disabledFromStatus: _disabledFromStatus, ...metadata } = current.metadata;
    const now = new Date().toISOString();
    const source = await this.repository.save({
      ...current,
      disabledAt: null,
      metadata,
      readiness: deriveKnowledgeSourceReadiness(status, current.approvalStatus),
      status,
      updatedAt: now,
      version: current.version + 1
    });
    return envelope("enableKnowledgeSource", tenantId, { source });
  }

  async archive(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current) return invalid("archiveKnowledgeSource", tenantId, "knowledge_source_not_found", "Источник знаний не найден.");
    const bound = await this.boundScenarios(tenantId, sourceId);
    if (bound.length) {
      return invalid("archiveKnowledgeSource", tenantId, "knowledge_source_in_use", `Источник привязан к сценариям: ${bound.map((item) => item.name).join(", ")}. Сначала отвяжите его.`, { scenarios: bound });
    }
    const now = new Date().toISOString();
    const source = await this.repository.save({ ...current, archivedAt: now, status: "archived", updatedAt: now, version: current.version + 1 });
    return envelope("archiveKnowledgeSource", tenantId, { source });
  }

  async remove(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current) return invalid("removeKnowledgeSource", tenantId, "knowledge_source_not_found", "Источник знаний не найден.");
    if (current.status !== "archived") return invalid("removeKnowledgeSource", tenantId, "knowledge_source_not_archived", "Сначала переместите источник в архив.");
    const bound = await this.boundScenarios(tenantId, sourceId);
    if (bound.length) {
      return invalid("removeKnowledgeSource", tenantId, "knowledge_source_in_use", `Источник привязан к сценариям: ${bound.map((item) => item.name).join(", ")}.`, { scenarios: bound });
    }
    await this.repository.delete(tenantId, sourceId);
    return envelope("removeKnowledgeSource", tenantId, { deleted: true, sourceId });
  }

  /** BAI-825: «что именно знает бот» — проиндексированные фрагменты без выдачи целого документа. */
  async preview(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current) return invalid("previewKnowledgeSource", tenantId, "knowledge_source_not_found", "Источник знаний не найден.");
    const chunks = Array.isArray(current.metadata.chunks) ? current.metadata.chunks as Array<{ content?: string; id?: string }> : [];
    const extractedText = typeof current.metadata.extractedText === "string" ? current.metadata.extractedText : "";
    return envelope("previewKnowledgeSource", tenantId, {
      chunkCount: chunks.length,
      chunks: chunks.slice(0, 8).map((chunk, index) => ({ content: String(chunk.content ?? "").slice(0, 400), id: String(chunk.id ?? `chunk_${index + 1}`) })),
      contentChecksum: current.contentChecksum,
      extractedTextPreview: extractedText.slice(0, 1_200),
      language: typeof current.metadata.language === "string" ? current.metadata.language : null,
      sourceId: current.id
    });
  }

  async create(tenantId: string, input: KnowledgeSourceCreateInput): Promise<BackendEnvelope<Record<string, unknown>>> {
    const kind = input.kind;
    const title = String(input.title ?? "").trim();
    if (!tenantId || !title || (kind !== "document" && kind !== "url" && kind !== "mcp")) return invalid("createKnowledgeSource", tenantId, "knowledge_source_invalid", "Choose a source type and provide a title.");
    const now = new Date().toISOString();
    let sourceConfig = input.sourceConfig ?? {};
    let sourceRef = String(input.sourceRef ?? "").trim() || null;
    let status: KnowledgeSourceRecord["status"] = "draft";
    let approvalStatus: KnowledgeSourceRecord["approvalStatus"] = "pending";
    let metadata: Record<string, unknown> = {};

    if (kind === "document" && !sourceRef && sourceConfig.upload === true) {
      // BAI-823: документ-файл без статьи — черновик, который наполняется через
      // существующий scan-clean attachment-пайплайн (enqueueAttachmentIngestion).
      sourceConfig = { upload: true };
    } else if (kind === "document") {
      if (!sourceRef) return invalid("createKnowledgeSource", tenantId, "knowledge_article_required", "Choose a published knowledge article.");
      const article = await this.workspaceRepository.findKnowledgeArticle(sourceRef, { tenantId });
      if (!article || article.status !== "published") return invalid("createKnowledgeSource", tenantId, "knowledge_article_not_ready", "The selected article must be published before it can answer clients.");
      const prepared = preparePublishedArticle(article);
      if (!prepared) return invalid("createKnowledgeSource", tenantId, "knowledge_article_not_ready", "The selected article version must be published before it can answer clients.");
      status = "ready";
      approvalStatus = "approved";
      sourceConfig = { articleId: article.id, articleVersion: article.version };
      metadata = { articleVersion: article.version, category: article.category, chunks: prepared.chunks, language: prepared.language, topics: article.topics };
    }
    if (kind === "url") {
      const validated = validateUrlKnowledgeSourceConfig(sourceConfig, validationOptions(await this.policyRepository.get(tenantId)));
      if (!validated.ok) return invalid("createKnowledgeSource", tenantId, validated.code, "This URL cannot be used as a knowledge source.");
      sourceConfig = { ...validated.config };
      sourceRef = validated.config.url;
    }
    if (kind === "mcp") {
      const connectorId = String(sourceConfig.connectorId ?? "").trim();
      const tool = String(sourceConfig.tool ?? sourceConfig.toolName ?? "").trim();
      if (!connectorId || !tool) return invalid("createKnowledgeSource", tenantId, "mcp_connector_required", "Выберите одобренный read-only MCP-коннектор и его инструмент.");
      const connector = await McpConnectorRepository.default().find(tenantId, connectorId);
      if (!connector || !connector.approvedAt || connector.status !== "enabled") {
        return invalid("createKnowledgeSource", tenantId, "mcp_connector_not_ready", "MCP-коннектор должен быть одобрен и включён.");
      }
      if (!connector.tools.some((item) => item.name === tool)) {
        return invalid("createKnowledgeSource", tenantId, "mcp_tool_not_allowed", "Инструмент не входит в разрешённый read-only список коннектора.");
      }
      // MCP отдаёт данные в реальном времени: индексации нет, источник сразу
      // готов к retrieval и одобрен (сам коннектор уже прошёл одобрение).
      sourceConfig = { connectorId, tool };
      status = "ready";
      approvalStatus = "approved";
      metadata = { connectorEndpoint: connector.endpoint, connectorName: connector.name ?? connectorId };
    }

    const source = await this.repository.save({
      approvalStatus,
      approvedAt: approvalStatus === "approved" ? now : null,
      approvedBy: approvalStatus === "approved" ? "knowledge-governance" : null,
      archivedAt: null,
      contentChecksum: null,
      createdAt: now,
      disabledAt: null,
      failedAt: null,
      failureCode: null,
      id: `ks_${randomUUID()}`,
      kind,
      lastIndexedAt: status === "ready" ? now : null,
      lastIngestedAt: status === "ready" ? now : null,
      metadata: kind === "url" ? { ...metadata, nextRefreshAt: new Date(Date.now() + URL_SOURCE_REFRESH_INTERVAL_MS).toISOString() } : metadata,
      owner: "current-operator",
      readiness: deriveKnowledgeSourceReadiness(status, approvalStatus),
      retentionUntil: null,
      sourceConfig,
      sourceRef,
      status,
      tenantId,
      title,
      updatedAt: now,
      version: 1
    });
    const data: Record<string, unknown> = { source };
    if (kind === "url") data.auditEvent = await this.recordUrlAudit("knowledge_source.url.create", tenantId, source.id, "created");
    return envelope("createKnowledgeSource", tenantId, data);
  }

  async disable(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current) return invalid("disableKnowledgeSource", tenantId, "knowledge_source_not_found", "Knowledge source was not found.");
    if (!canTransitionKnowledgeSourceStatus(current.status, "disabled")) {
      return invalid("disableKnowledgeSource", tenantId, "knowledge_source_transition_invalid", "This source cannot be disabled from its current status.");
    }
    const now = new Date().toISOString();
    const source = await this.repository.save({
      ...current,
      disabledAt: now,
      metadata: { ...current.metadata, disabledFromStatus: current.status },
      status: "disabled",
      updatedAt: now,
      version: current.version + 1
    });
    const data: Record<string, unknown> = { source };
    if (current.kind === "url") data.auditEvent = await this.recordUrlAudit("knowledge_source.url.disable", tenantId, source.id, "disabled");
    return envelope("disableKnowledgeSource", tenantId, data);
  }

  async refreshUrl(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current || current.kind !== "url") return invalid("refreshKnowledgeSourceUrl", tenantId, "knowledge_source_not_found", "URL source was not found.");
    const validated = validateUrlKnowledgeSourceConfig(current.sourceConfig, validationOptions(await this.policyRepository.get(tenantId)));
    if (!validated.ok) return invalid("refreshKnowledgeSourceUrl", tenantId, validated.code, "This URL cannot be refreshed safely.");
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000); const now = new Date().toISOString();
    try {
      await assertPublicResolution(validated.hostname, this.options.resolveHostname);
      await this.repository.save({ ...current, status: "fetching", updatedAt: now, version: current.version + 1 });
      const transport = await (this.options.fetch ?? defaultUrlTransport)(validated.config.url, { headers: { accept: "text/html,text/plain;q=0.9" }, redirect: "error", signal: controller.signal });
      const { connectedPeerAddress, response } = normalizeTransportResult(transport);
      // The default Node fetch does not expose the TCP peer. Re-resolving
      // immediately after the request catches DNS rebinding; a hardened
      // transport can additionally provide the peer address for direct check.
      await assertPublicResolution(validated.hostname, this.options.resolveHostname);
      if (connectedPeerAddress && !isPublicAddress(connectedPeerAddress)) throw new Error("url_source_peer_forbidden");
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const length = Number(response.headers.get("content-length") ?? 0);
      if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("text/plain")) || !Number.isFinite(length) || length > URL_SOURCE_MAX_BYTES) throw new Error("url_source_fetch_rejected");
      const raw = (await readBoundedText(response, URL_SOURCE_MAX_BYTES)).slice(0, 200_000);
      const extractedText = stripHtml(raw).slice(0, 100_000);
      if (!extractedText) throw new Error("url_source_content_empty");
      const source = await this.repository.save({ ...current, approvalStatus: "pending", contentChecksum: createHash("sha256").update(extractedText).digest("hex"), failedAt: null, failureCode: null, lastIndexedAt: now, lastIngestedAt: now, metadata: { ...current.metadata, extractedText, nextRefreshAt: new Date(Date.now() + URL_SOURCE_REFRESH_INTERVAL_MS).toISOString() }, status: "ready", updatedAt: now, version: current.version + 1 });
      return envelope("refreshKnowledgeSourceUrl", tenantId, { auditEvent: await this.recordUrlAudit("knowledge_source.url.refresh", tenantId, source.id, "refreshed"), source });
    } catch {
      const source = await this.repository.save({ ...current, failedAt: now, failureCode: "url_source_fetch_failed", metadata: { ...current.metadata, nextRefreshAt: new Date(Date.now() + URL_SOURCE_REFRESH_INTERVAL_MS).toISOString() }, status: "failed", updatedAt: now, version: current.version + 1 });
      return invalid("refreshKnowledgeSourceUrl", tenantId, "url_source_fetch_failed", "The URL could not be read safely.", { auditEvent: await this.recordUrlAudit("knowledge_source.url.refresh", tenantId, source.id, "failed") });
    } finally { clearTimeout(timeout); }
  }

  async approve(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current || current.status !== "ready") return invalid("approveKnowledgeSource", tenantId, "knowledge_source_not_ready", "Refresh the source successfully before approving it.");
    const now = new Date().toISOString();
    const source = await this.repository.save({ ...current, approvalStatus: "approved", approvedAt: now, approvedBy: "current-operator", updatedAt: now, version: current.version + 1 });
    const data: Record<string, unknown> = { source };
    if (current.kind === "url") data.auditEvent = await this.recordUrlAudit("knowledge_source.url.approve", tenantId, source.id, "approved");
    return envelope("approveKnowledgeSource", tenantId, data);
  }

  /**
   * Массовые операции над источниками (после пакетной загрузки): каждый источник
   * проходит те же проверки, что и одиночное действие; уже находящиеся в целевом
   * состоянии и невозможные переходы попадают в skipped с кодом причины.
   */
  async applyBulk(tenantId: string, action: KnowledgeSourceBulkAction, input: { sourceIds?: unknown }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const operation = `bulkKnowledgeSources:${action}`;
    const sourceIds = Array.isArray(input.sourceIds)
      ? [...new Set(input.sourceIds.map((id) => String(id ?? "").trim()).filter(Boolean))]
      : [];
    if (!sourceIds.length) return invalid(operation, tenantId, "knowledge_bulk_request_invalid", "Укажите хотя бы один источник.");
    const affected: KnowledgeSourceRecord[] = [];
    const skipped: Array<{ code: string; sourceId: string }> = [];
    for (const sourceId of sourceIds) {
      const outcome = await this.applyBulkOne(tenantId, action, sourceId);
      if (outcome.source) affected.push(outcome.source);
      else skipped.push({ code: outcome.code ?? "knowledge_source_transition_invalid", sourceId });
    }
    return envelope(operation, tenantId, { action, affected, skipped });
  }

  private async applyBulkOne(tenantId: string, action: KnowledgeSourceBulkAction, sourceId: string): Promise<{ code?: string; source?: KnowledgeSourceRecord }> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current) return { code: "knowledge_source_not_found" };
    if (action === "approve") {
      if (current.approvalStatus === "approved") return { code: "knowledge_source_already_approved" };
      return unwrap(await this.approve(tenantId, sourceId));
    }
    if (action === "disable") {
      if (current.status === "disabled") return { code: "knowledge_source_already_disabled" };
      return unwrap(await this.disable(tenantId, sourceId));
    }
    if (action === "enable") {
      if (current.status !== "disabled") return { code: "knowledge_source_not_disabled" };
      return unwrap(await this.enable(tenantId, sourceId));
    }
    if (action === "archive") {
      if (current.status === "archived") return { code: "knowledge_source_already_archived" };
      return unwrap(await this.archive(tenantId, sourceId));
    }
    // delete: неархивные сначала архивируются — как двухшаговое одиночное удаление.
    if (current.status !== "archived") {
      const archived = unwrap(await this.archive(tenantId, sourceId));
      if (!archived.source) return archived;
    }
    const removed = await this.remove(tenantId, sourceId);
    if (removed.status !== "ok") return { code: removed.error?.code ?? "knowledge_source_transition_invalid" };
    return { source: { ...current, status: "archived" } };
  }

  async getUrlPolicy(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    return envelope("getUrlSourcePolicy", tenantId, { policy: await this.policyRepository.get(tenantId) });
  }

  async setUrlPolicy(tenantId: string, input: UrlSourcePolicyWriteInput): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!tenantId || (input.allowedHosts !== undefined && input.allowedHosts !== null && (!Array.isArray(input.allowedHosts) || input.allowedHosts.some((host) => !validAllowlistHost(host))))) {
      return invalid("setUrlSourcePolicy", tenantId, "url_source_policy_invalid", "Allowed hosts must be exact public host names.");
    }
    const policy = await this.policyRepository.save({ allowedHosts: input.allowedHosts === undefined ? null : input.allowedHosts, tenantId, updatedAt: new Date().toISOString() });
    return envelope("setUrlSourcePolicy", tenantId, { auditEvent: await this.recordUrlAudit("knowledge_source.url.policy", tenantId, "policy", "updated"), policy });
  }

  async refreshDueUrls(now = new Date()): Promise<{ failed: number; refreshed: number }> {
    let failed = 0; let refreshed = 0;
    for (const source of (await this.repository.listAll()).filter((item) => item.kind === "url" && item.status !== "disabled" && item.status !== "archived" && dueForRefresh(item, now))) {
      const result = await this.refreshUrl(source.tenantId, source.id);
      if (result.status === "ok") refreshed += 1; else failed += 1;
    }
    return { failed, refreshed };
  }

  /** Rebuild article chunks only from its current published and approved version. */
  async refreshDocument(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current || current.kind !== "document") return invalid("refreshKnowledgeSourceDocument", tenantId, "knowledge_source_not_found", "Document source was not found.");
    const articleId = String(current.sourceConfig.articleId ?? current.sourceRef ?? "").trim();
    const article = await this.workspaceRepository.findKnowledgeArticle(articleId, { tenantId });
    const prepared = article ? preparePublishedArticle(article) : null;
    if (!prepared || !article) {
      const now = new Date().toISOString();
      const source = await this.repository.save({ ...current, approvalStatus: "pending", failedAt: now, failureCode: "knowledge_article_not_ready", status: "failed", updatedAt: now, version: current.version + 1 });
      return invalid("refreshKnowledgeSourceDocument", tenantId, "knowledge_article_not_ready", "Publish and approve the article version before refreshing this source.");
    }
    const now = new Date().toISOString();
    const source = await this.repository.save({ ...current, approvalStatus: "pending", approvedAt: null, approvedBy: null, contentChecksum: prepared.checksum, failedAt: null, failureCode: null, lastIndexedAt: now, lastIngestedAt: now, metadata: { ...current.metadata, articleVersion: article.version, chunks: prepared.chunks, language: prepared.language }, sourceConfig: { articleId: article.id, articleVersion: article.version }, sourceRef: article.id, status: "ready", updatedAt: now, version: current.version + 1 });
    return envelope("refreshKnowledgeSourceDocument", tenantId, { source });
  }

  private async recordUrlAudit(action: string, tenantId: string, sourceId: string, result: string): Promise<IdentityServiceAdminAuditEvent> {
    return await this.identityRepository.recordServiceAdminAuditEvent({
      action, actor: "knowledge-source-service", actorName: "Knowledge source service", at: new Date().toISOString(), id: makeAuditId("knowledge_source"), immutable: true,
      reason: null, result, severity: result === "failed" ? "warning" : "info", target: `knowledge-source:${sourceId}`, tenantId, traceId: `trc_${randomUUID()}`, userId: null
    });
  }

  async enqueueAttachmentIngestion(tenantId: string, sourceId: string, input: { fileId?: string; idempotencyKey?: string }): Promise<BackendEnvelope<Record<string, unknown>>> {
    const current = await this.repository.find(tenantId, sourceId);
    if (!current || current.kind !== "document") return invalid("enqueueKnowledgeAttachmentIngestion", tenantId, "knowledge_source_not_found", "Document source was not found.");
    const fileId = String(input.fileId ?? "").trim(); const idempotencyKey = String(input.idempotencyKey ?? "").trim();
    if (!fileId || !idempotencyKey) return invalid("enqueueKnowledgeAttachmentIngestion", tenantId, "knowledge_ingestion_request_invalid", "A file and idempotency key are required.");
    const file = await this.workspaceRepository.findFile(fileId, { tenantId });
    if (!file || file.storageState !== "uploaded" || file.scanVerdict !== "clean" || !["clean", "scan_clean"].includes(file.scanState)) return invalid("enqueueKnowledgeAttachmentIngestion", tenantId, "knowledge_attachment_scan_required", "Only uploaded and scan-clean attachments can be indexed.");
    const fingerprint = `${sourceId}:${fileId}`; const existing = await this.repository.findIngestionJob(tenantId, idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return invalid("enqueueKnowledgeAttachmentIngestion", tenantId, "idempotency_key_reused", "This idempotency key belongs to a different ingestion request.");
      return envelope("enqueueKnowledgeAttachmentIngestion", tenantId, { duplicate: true, job: existing });
    }
    const now = new Date().toISOString();
    const job = await this.repository.saveIngestionJob({ attempts: 0, createdAt: now, errorCode: null, fileId, fingerprint, idempotencyKey, jobId: `knowledge_ingest_${randomUUID()}`, sourceId, status: "pending", tenantId, updatedAt: now });
    const source = await this.repository.save({ ...current, approvalStatus: "pending", failedAt: null, failureCode: null, metadata: { ...current.metadata, ingestionJobId: job.jobId }, status: "indexing", updatedAt: now, version: current.version + 1 });
    return envelope("enqueueKnowledgeAttachmentIngestion", tenantId, { duplicate: false, job, source });
  }
}

function preparePublishedArticle(article: { body: string; status: string; title: string; version: string; versions: Array<Record<string, unknown>> }) {
  if (article.status !== "published") return null;
  const version = article.versions.find((item) => String(item.label ?? "") === article.version);
  if (version && String(version.status ?? "") !== "published") return null;
  return ingestKnowledgeDocument(`${article.title}\n\n${article.body}`);
}

function stripHtml(value: string): string { return value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

export async function assertPublicResolution(hostname: string, resolver?: (hostname: string) => Promise<Array<{ address: string }>>): Promise<void> {
  const addresses = await (resolver ? resolver(hostname) : lookup(hostname, { all: true }));
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("url_source_dns_forbidden");
}

function isPublicAddress(address: string): boolean {
  const host = address.includes(":") ? `[${address}]` : address;
  return validateUrlKnowledgeSourceConfig({ url: `https://${host}/` }).ok;
}

async function defaultUrlTransport(url: string, init: RequestInit): Promise<Response> { return fetch(url, init); }
function normalizeTransportResult(value: Response | UrlSourceTransportResult): UrlSourceTransportResult {
  return value instanceof Response ? { response: value } : value;
}
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("url_source_response_too_large");
    return text;
  }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new Error("url_source_response_too_large");
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}
function validationOptions(policy: UrlSourcePolicy): { allowedHosts?: readonly string[] } { return policy.allowedHosts === null ? {} : { allowedHosts: policy.allowedHosts }; }
function validAllowlistHost(value: unknown): boolean {
  const host = String(value ?? "").trim().toLowerCase().replace(/\.+$/, "");
  const validated = validateUrlKnowledgeSourceConfig({ url: `https://${host}/` });
  return validated.ok && validated.hostname === host;
}
function dueForRefresh(source: KnowledgeSourceRecord, now: Date): boolean {
  const next = Date.parse(String(source.metadata.nextRefreshAt ?? ""));
  return !Number.isFinite(next) || next <= now.getTime();
}

function unwrap(result: BackendEnvelope<Record<string, unknown>>): { code?: string; source?: KnowledgeSourceRecord } {
  if (result.status !== "ok") return { code: result.error?.code ?? "knowledge_source_transition_invalid" };
  return { source: result.data.source as KnowledgeSourceRecord };
}

function envelope(operation: string, tenantId: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({ data, meta: { tenantId }, operation, service: SERVICE, traceId: `trc_${operation}_${randomUUID()}` });
}
function invalid(operation: string, tenantId: string, code: string, message: string, data: Record<string, unknown> = {}): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({ data, error: { code, message }, meta: { tenantId }, operation, service: SERVICE, status: "invalid", traceId: `trc_${operation}_${randomUUID()}` });
}
