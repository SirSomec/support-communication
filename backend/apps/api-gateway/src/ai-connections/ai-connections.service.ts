import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { writeStructuredLog } from "@support-communication/observability";
import { makeAuditId } from "../identity/backend-ids.js";
import { IdentityRepository, type IdentityServiceAdminAuditEvent } from "../identity/identity.repository.js";
import { createOpenAiCompatibleChatProvider, AiProviderError, type OpenAiCompatibleChatConnection, type OpenAiCompatibleChatProvider } from "./openai-compatible-chat.provider.js";
import { AiConnectionRepository, type AiConnectionCapability, type AiConnectionRecord } from "./ai-connection.repository.js";
import { AiUsageRepository } from "./ai-usage.repository.js";
import { SecretStore, SecretStoreError } from "./secret-store.js";

const SERVICE = "aiConnectionsService";

export interface AiConnectionWriteInput {
  baseUrl?: string;
  capabilities?: AiConnectionCapability[];
  chatModel?: string;
  embeddingModel?: string | null;
  limits?: { maxConcurrentRuns?: number; monthlyTokenBudget?: number; requestsPerMinute?: number; sandboxMonthlyTokenBudget?: number };
  secret?: string;
}

export type AiConnectionTestProviderFactory = (connection: OpenAiCompatibleChatConnection) => OpenAiCompatibleChatProvider;

export class AiConnectionsService {
  constructor(
    private readonly repository = AiConnectionRepository.default(),
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly usage = AiUsageRepository.default(),
    private readonly identityRepository = IdentityRepository.default(),
    private readonly testProviderFactory: AiConnectionTestProviderFactory = createOpenAiCompatibleChatProvider
  ) {}

  async list(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const connections = await this.repository.list(tenantId);
    const withUsage = await Promise.all(connections.map(async (connection) => ({ ...publicConnection(connection), usage: await this.usage.current(tenantId, connection.id) })));
    return envelope("listAiConnections", tenantId, { connections: withUsage });
  }

  async create(tenantId: string, input: AiConnectionWriteInput): Promise<BackendEnvelope<Record<string, unknown>>> {
    const violation = validateWrite(input, true);
    if (violation) return invalid("createAiConnection", tenantId, violation);
    try {
      const now = new Date().toISOString();
      const secret = this.secretStore().encrypt(String(input.secret));
      const record: AiConnectionRecord = {
        baseUrl: normalizeBaseUrl(String(input.baseUrl)),
        capabilities: normalizeCapabilities(input.capabilities),
        chatModel: String(input.chatModel).trim(),
        createdAt: now,
        disabledAt: null,
        embeddingModel: normalizedOptional(input.embeddingModel),
        id: `aic_${randomUUID()}`,
        keyVersion: secret.keyVersion,
        lastTestMessage: null,
        lastTestStatus: null,
        lastTestedAt: null,
        limits: normalizeLimits(input.limits),
        providerType: "openai_compatible",
        secret,
        status: "disabled",
        tenantId,
        updatedAt: now
      };
      const connection = await this.repository.save(record);
      return envelope("createAiConnection", tenantId, { connection: publicConnection(connection), auditEvent: await this.recordAudit("ai.connection.create", tenantId, connection.id, "created") });
    } catch (error) {
      logWriteFailure("createAiConnection", tenantId, error);
      return invalid("createAiConnection", tenantId, safeMessage(error));
    }
  }

  async update(tenantId: string, connectionId: string, input: AiConnectionWriteInput): Promise<BackendEnvelope<Record<string, unknown>>> {
    const existing = await this.repository.find(tenantId, connectionId);
    if (!existing) return notFound("updateAiConnection", tenantId, connectionId);
    const violation = validateWrite(input, false);
    if (violation) return invalid("updateAiConnection", tenantId, violation);
    try {
      const rotated = input.secret ? this.secretStore().encrypt(input.secret) : existing.secret;
      const record = await this.repository.save({
        ...existing,
        ...(input.baseUrl ? { baseUrl: normalizeBaseUrl(input.baseUrl) } : {}),
        ...(input.chatModel ? { chatModel: input.chatModel.trim() } : {}),
        ...(input.capabilities ? { capabilities: normalizeCapabilities(input.capabilities) } : {}),
        ...(input.embeddingModel !== undefined ? { embeddingModel: normalizedOptional(input.embeddingModel) } : {}),
        ...(input.limits ? { limits: normalizeLimits(input.limits) } : {}),
        keyVersion: rotated.keyVersion,
        lastTestMessage: input.secret ? null : existing.lastTestMessage,
        lastTestStatus: input.secret ? null : existing.lastTestStatus,
        lastTestedAt: input.secret ? null : existing.lastTestedAt,
        secret: rotated,
        status: input.secret ? "disabled" : existing.status,
        updatedAt: new Date().toISOString()
      });
      const action = input.secret ? "ai.connection.rotate" : "ai.connection.update";
      return envelope("updateAiConnection", tenantId, { connection: publicConnection(record), auditEvent: await this.recordAudit(action, tenantId, record.id, input.secret ? "secret_rotated" : "updated") });
    } catch (error) {
      logWriteFailure("updateAiConnection", tenantId, error);
      return invalid("updateAiConnection", tenantId, safeMessage(error));
    }
  }

  async rotate(tenantId: string, connectionId: string, input: Pick<AiConnectionWriteInput, "secret">): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!input.secret?.trim()) return invalid("rotateAiConnection", tenantId, "API key is required.");
    const result = await this.update(tenantId, connectionId, { secret: input.secret });
    return { ...result, operation: "rotateAiConnection" };
  }

  async test(tenantId: string, connectionId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const existing = await this.repository.find(tenantId, connectionId);
    if (!existing) return notFound("testAiConnection", tenantId, connectionId);
    const now = new Date().toISOString();
    const traceId = `trc_ai_connection_test_${randomUUID()}`;
    try {
      const provider = this.testProviderFactory({
        apiKey: this.secretStore().decrypt(existing.secret),
        baseUrl: existing.baseUrl,
        maxRetries: 0,
        model: existing.chatModel,
        // Холодный первый вызов через агрегатор (например, AITunnel) может
        // превышать 5с — держим потолок теста равным рантайм-дефолту провайдера.
        timeoutMs: 15_000
      });
      await provider.complete({ maxTokens: 1, messages: [{ content: "Reply with OK.", role: "user" }], temperature: 0 });
      const record = await this.repository.save({ ...existing, disabledAt: null, lastTestMessage: null, lastTestStatus: "passed", lastTestedAt: now, status: "ready", updatedAt: now });
      return envelope("testAiConnection", tenantId, { auditEvent: await this.recordAudit("ai.connection.test", tenantId, record.id, "passed", traceId), connection: publicConnection(record), test: { diagnostic: { code: "ok", traceId }, status: "passed" } }, "ok", null, traceId);
    } catch (error) {
      const diagnostic = testDiagnostic(error);
      const record = await this.repository.save({ ...existing, lastTestMessage: diagnostic, lastTestStatus: "failed", lastTestedAt: now, status: "error", updatedAt: now });
      return envelope("testAiConnection", tenantId, { auditEvent: await this.recordAudit("ai.connection.test", tenantId, record.id, diagnostic, traceId), connection: publicConnection(record), test: { diagnostic: { code: diagnostic, traceId }, status: "failed" } }, "invalid", { code: "ai_connection_test_failed", message: "AI connection test failed. Check the diagnostic trace." }, traceId);
    }
  }

  async disable(tenantId: string, connectionId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const existing = await this.repository.find(tenantId, connectionId);
    if (!existing) return notFound("disableAiConnection", tenantId, connectionId);
    const now = new Date().toISOString();
    const record = await this.repository.save({ ...existing, disabledAt: now, status: "disabled", updatedAt: now });
    return envelope("disableAiConnection", tenantId, { connection: publicConnection(record), auditEvent: await this.recordAudit("ai.connection.disable", tenantId, record.id, "disabled") });
  }

  async remove(tenantId: string, connectionId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!(await this.repository.remove(tenantId, connectionId))) return notFound("deleteAiConnection", tenantId, connectionId);
    return envelope("deleteAiConnection", tenantId, { auditEvent: await this.recordAudit("ai.connection.delete", tenantId, connectionId, "deleted"), connectionId, deleted: true });
  }

  private secretStore(): SecretStore {
    return new SecretStore({
      keyVersion: this.environment.AI_CONNECTIONS_KEY_VERSION ?? "local-v1",
      masterKeyBase64: this.environment.AI_CONNECTIONS_MASTER_KEY ?? this.environment.PROVIDER_CREDENTIAL_MASTER_KEY ?? ""
    });
  }

  private async recordAudit(action: string, tenantId: string, connectionId: string, result: string, traceId = `trc_${randomUUID()}`): Promise<IdentityServiceAdminAuditEvent> {
    return await this.identityRepository.recordServiceAdminAuditEvent({
      action,
      actor: "service-admin",
      actorName: "Service Admin",
      at: new Date().toISOString(),
      id: makeAuditId("ai_connection"),
      immutable: true,
      reason: null,
      result,
      severity: result === "passed" || result === "created" || result === "updated" || result === "secret_rotated" ? "info" : "warning",
      target: `ai-connection:${connectionId}`,
      tenantId,
      traceId,
      userId: null
    });
  }
}

function envelope(operation: string, tenantId: string, data: Record<string, unknown>, status: "invalid" | "ok" = "ok", error: { code: string; message: string } | null = null, traceId = `trc_${operation}_${randomUUID()}`): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({ data, error, meta: { tenantId }, operation, service: SERVICE, status, traceId });
}
function invalid(operation: string, tenantId: string, message: string): BackendEnvelope<Record<string, unknown>> { return envelope(operation, tenantId, {}, "invalid", { code: "ai_connection_invalid", message }); }
function notFound(operation: string, tenantId: string, connectionId: string): BackendEnvelope<Record<string, unknown>> { return envelope(operation, tenantId, {}, "invalid", { code: "ai_connection_not_found", message: `AI connection ${connectionId} was not found.` }); }
function publicConnection(connection: AiConnectionRecord): Omit<AiConnectionRecord, "secret"> & { secretConfigured: true } { const { secret: _secret, ...safe } = connection; return { ...safe, secretConfigured: true }; }
function normalizeBaseUrl(value: string): string { const url = new URL(value.trim()); if (url.protocol !== "https:" || url.username || url.password) throw new Error("AI provider URL must use HTTPS."); return url.toString().replace(/\/$/, ""); }
function normalizedOptional(value: unknown): string | null { const normalized = String(value ?? "").trim(); return normalized || null; }
function normalizeCapabilities(value: AiConnectionCapability[] | undefined): AiConnectionCapability[] { const capabilities = Array.from(new Set(value ?? [])); if (!capabilities.includes("chat_completion")) capabilities.unshift("chat_completion"); return capabilities.filter((item): item is AiConnectionCapability => item === "chat_completion" || item === "embeddings" || item === "retrieval"); }
function normalizeLimits(value: AiConnectionWriteInput["limits"]): AiConnectionRecord["limits"] { const source = value ?? {}; const limits: AiConnectionRecord["limits"] = {}; for (const key of ["maxConcurrentRuns", "monthlyTokenBudget", "requestsPerMinute", "sandboxMonthlyTokenBudget"] as const) { const parsed = Number(source[key]); if (Number.isInteger(parsed) && parsed > 0) limits[key] = parsed; } return limits; }
function validateWrite(input: AiConnectionWriteInput, creating: boolean): string | null { if (creating && !input.secret?.trim()) return "API key is required."; if (input.secret !== undefined && !input.secret.trim()) return "API key must not be empty."; if (creating && (!input.baseUrl || !input.chatModel)) return "Provider URL and chat model are required."; try { if (input.baseUrl) normalizeBaseUrl(input.baseUrl); } catch { return "Provider URL must be a valid HTTPS URL."; } return null; }
function safeMessage(error: unknown): string { if (error instanceof AiProviderError) return error.message; if (error instanceof SecretStoreError) return "Secret storage is unavailable."; return "AI connection could not be completed safely."; }
function logWriteFailure(operation: string, tenantId: string, error: unknown): void {
  // В лог только name/code: message (например, у PrismaClientValidationError) включает аргументы запроса с шифртекстом секрета — BAI-307 запрещает credential-материал в логах.
  const code = (error as { code?: unknown } | null)?.code;
  writeStructuredLog("error", "AI connection write failed", {
    errorCode: typeof code === "string" || typeof code === "number" ? String(code) : null,
    errorName: error instanceof Error ? error.name : typeof error,
    operation,
    service: SERVICE,
    tenantId
  });
}
function testDiagnostic(error: unknown): string { return error instanceof AiProviderError ? error.code : error instanceof SecretStoreError ? "secret_storage_unavailable" : "provider_unavailable"; }
