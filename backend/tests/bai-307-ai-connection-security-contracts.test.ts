import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AiConnectionRepository,
  type AiConnectionPrismaClient,
  type PrismaAiConnectionRow
} from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";
import { AiConnectionsService, type AiConnectionTestProviderFactory } from "../apps/api-gateway/src/ai-connections/ai-connections.service.ts";
import { AiUsageRepository } from "../apps/api-gateway/src/ai-connections/ai-usage.repository.ts";
import { createOpenAiCompatibleChatProvider } from "../apps/api-gateway/src/ai-connections/openai-compatible-chat.provider.ts";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { PermissionService } from "../apps/api-gateway/src/identity/permission.service.ts";
import { createSeededIdentityRepository } from "../apps/api-gateway/src/identity/seed.ts";
import { serviceAdminSession } from "../apps/api-gateway/src/identity/seed-catalog.ts";

const environment = {
  AI_CONNECTIONS_KEY_VERSION: "bai-307-v1",
  AI_CONNECTIONS_MASTER_KEY: Buffer.alloc(32, 9).toString("base64")
};

const controllerSource = readFileSync(
  fileURLToPath(new URL("../apps/api-gateway/src/ai-connections/ai-connections.controller.ts", import.meta.url)),
  "utf8"
);

const SECRET = "sk-live-bai-307-must-never-leak";

function inMemoryPrismaAiConnectionClient(): AiConnectionPrismaClient {
  const rows = new Map<string, PrismaAiConnectionRow>();
  const rowKey = (tenantId: string, id: string) => `${tenantId} ${id}`;

  return {
    aiConnection: {
      delete: async ({ where }) => {
        const key = rowKey(where.ai_connections_tenant_id_key.tenantId, where.ai_connections_tenant_id_key.id);
        const existing = rows.get(key);
        if (!existing) throw Object.assign(new Error("record not found"), { code: "P2025" });
        rows.delete(key);
        return existing;
      },
      findMany: async ({ where } = {}) => [...rows.values()]
        .filter((row) => !where?.tenantId || row.tenantId === where.tenantId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
      upsert: async ({ create, update, where }) => {
        const key = rowKey(where.ai_connections_tenant_id_key.tenantId, where.ai_connections_tenant_id_key.id);
        const existing = rows.get(key);
        const next: PrismaAiConnectionRow = existing ? { ...existing, ...update } : { ...create };
        rows.set(key, next);
        return next;
      }
    }
  };
}

function hasCredentialMaterial(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.includes(SECRET) || /sk-live-|super-secret|provider-token/i.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(hasCredentialMaterial);
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, child]) => (
      /api.?key|password|secret|token|ciphertext/i.test(key) && typeof child === "string" && child.length > 0 && !/Configured|ByteLength|Version|algorithm|mask/i.test(key)
    ) || hasCredentialMaterial(child));
  }
  return false;
}

describe("BAI-307 AI connection security contracts", () => {
  it("binds every HTTP mutation and read to service-admin session MFA guard and ai.connections.manage", () => {
    assert.match(controllerSource, /@UseGuards\(ServiceAdminSessionGuard\)/);
    for (const route of [
      "@Get()",
      "@Post()",
      '@Patch(":connectionId")',
      '@Post(":connectionId/rotate")',
      '@Post(":connectionId/test")',
      '@Post(":connectionId/disable")',
      '@Delete(":connectionId")'
    ]) {
      assert.match(
        controllerSource,
        new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?@RequireServiceAdminAction\\("ai\\.connections\\.manage"\\)`)
      );
    }
  });

  it("authorizes service-admin connection management and denies line operators", async () => {
    const permissions = new PermissionService(createSeededIdentityRepository());
    const allowed = await permissions.validatePermission({
      action: "ai.connections.manage",
      actorId: serviceAdminSession.adminId,
      actorRole: serviceAdminSession.role,
      resource: "ai-connection",
      tenantId: "tenant-volga"
    });
    const denied = await permissions.validatePermission({
      action: "ai.connections.manage",
      actorRole: "senior",
      resource: "ai-connection",
      tenantId: "tenant-volga"
    });

    assert.equal(allowed.data.allowed, true);
    assert.equal(denied.data.allowed, false);
    assert.match(controllerSource, /ServiceAdminSessionGuard/);
    assert.doesNotMatch(controllerSource, /TenantOperatorSessionGuard|@Controller\("tenants/);
  });

  it("keeps tenant binding, masking, rotation, revoke and audit free of credential material", async () => {
    const repository = AiConnectionRepository.inMemory();
    const audit = IdentityRepository.inMemory();
    const service = new AiConnectionsService(repository, environment, undefined, audit);

    const created = await service.create("tenant-volga", {
      baseUrl: "https://provider.example.test/v1",
      chatModel: "support-model",
      limits: { maxConcurrentRuns: 2, monthlyTokenBudget: 1_000, requestsPerMinute: 10 },
      secret: SECRET
    });
    assert.equal(created.status, "ok");
    assert.equal(hasCredentialMaterial(created), false);

    const id = String((created.data.connection as { id: string }).id);
    const listed = await service.list("tenant-volga");
    assert.equal(hasCredentialMaterial(listed), false);
    assert.equal(((await service.list("tenant-ladoga")).data.connections as unknown[]).length, 0);

    const rotated = await service.rotate("tenant-volga", id, { secret: `${SECRET}-rotated` });
    assert.equal(rotated.status, "ok");
    assert.equal(hasCredentialMaterial(rotated), false);
    assert.equal((rotated.data.connection as { status: string }).status, "disabled");

    const disabled = await service.disable("tenant-volga", id);
    assert.equal(disabled.status, "ok");
    assert.equal(hasCredentialMaterial(disabled), false);

    const removed = await service.remove("tenant-volga", id);
    assert.equal(removed.status, "ok");
    assert.equal(await repository.find("tenant-volga", id), undefined);
    assert.equal(hasCredentialMaterial(removed), false);

    const events = await audit.listServiceAdminAuditEvents();
    assert.equal(events.some((event) => event.action === "ai.connection.create" && event.immutable), true);
    assert.equal(events.some((event) => event.action === "ai.connection.rotate" && event.immutable), true);
    assert.equal(events.some((event) => event.action === "ai.connection.disable" && event.immutable), true);
    assert.equal(events.some((event) => event.action === "ai.connection.delete" && event.immutable), true);
    assert.equal(hasCredentialMaterial(events), false);
  });

  it("persists the encrypted envelope intact through the prisma branch", async () => {
    const client = inMemoryPrismaAiConnectionClient();
    const repository = AiConnectionRepository.prisma({ client });
    const audit = IdentityRepository.inMemory();
    const service = new AiConnectionsService(repository, environment, undefined, audit);

    const created = await service.create("tenant-volga", {
      baseUrl: "https://provider.example.test/v1",
      chatModel: "support-model",
      limits: { monthlyTokenBudget: 500 },
      secret: SECRET
    });
    assert.equal(created.status, "ok");
    assert.equal(hasCredentialMaterial(created), false);
    const id = String((created.data.connection as { id: string }).id);

    const stored = await repository.find("tenant-volga", id);
    assert.ok(stored);
    assert.equal(stored!.secret.algorithm, "aes-256-gcm");
    assert.equal(stored!.secret.envelopeVersion, 1);
    assert.equal(stored!.secret.keyVersion, environment.AI_CONNECTIONS_KEY_VERSION);
    assert.ok(stored!.secret.ciphertext.length > 0);
    assert.ok(stored!.secret.iv.length > 0);
    assert.ok(stored!.secret.authTag.length > 0);
    assert.equal(stored!.secret.ciphertext.includes(SECRET), false);
    assert.deepEqual(stored!.limits, { monthlyTokenBudget: 500 });

    assert.equal((await repository.list("tenant-ladoga")).length, 0);
    assert.equal(await repository.remove("tenant-volga", id), true);
    assert.equal(await repository.remove("tenant-volga", id), false);
    assert.equal(await repository.find("tenant-volga", id), undefined);
  });

  it("enforces rate, budget and concurrency limits before a provider call", () => {
    const usage = AiUsageRepository.inMemory();
    const now = new Date("2026-07-12T12:00:00.000Z");

    usage.reserve({ connectionId: "c1", now, requestsPerMinute: 1, tenantId: "tenant-volga", worstCaseTokens: 1 });
    assert.throws(
      () => usage.reserve({ connectionId: "c1", now, requestsPerMinute: 1, tenantId: "tenant-volga", worstCaseTokens: 1 }),
      /bot_ai_rate_limit_reached/
    );
    assert.throws(
      () => usage.reserve({ connectionId: "c1", monthlyTokenBudget: 50, tenantId: "tenant-volga", worstCaseTokens: 200 }),
      /bot_ai_quota_exhausted/
    );

    const release = usage.reserve({ connectionId: "c2", maxConcurrentRuns: 1, tenantId: "tenant-volga", worstCaseTokens: 1 });
    assert.throws(
      () => usage.reserve({ connectionId: "c2", maxConcurrentRuns: 1, tenantId: "tenant-volga", worstCaseTokens: 1 }),
      /bot_ai_concurrency_limit_reached/
    );
    release();
  });

  it("maps provider timeout and errors without leaking the connection secret", async () => {
    const provider = createOpenAiCompatibleChatProvider({
      apiKey: SECRET,
      baseUrl: "https://provider.example.test/v1",
      maxRetries: 0,
      model: "support-model",
      timeoutMs: 100
    }, {
      fetch: async (_url, init) => new Promise((_resolve, reject) => {
        const timer = setTimeout(() => {
          reject(Object.assign(new Error("should have aborted"), { name: "Timeout" }));
        }, 500);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        }, { once: true });
      })
    });

    await assert.rejects(
      () => provider.complete({ messages: [{ content: "ping", role: "user" }] }),
      (error: unknown) => error instanceof Error
        && /timed out|timeout/i.test(error.message)
        && !error.message.includes(SECRET)
    );

    const failing = createOpenAiCompatibleChatProvider({
      apiKey: SECRET,
      baseUrl: "https://provider.example.test/v1",
      maxRetries: 0,
      model: "support-model"
    }, {
      fetch: async () => new Response(JSON.stringify({ error: { message: `leak ${SECRET}` } }), { status: 500 })
    });

    await assert.rejects(
      () => failing.complete({ messages: [{ content: "ping", role: "user" }] }),
      (error: unknown) => error instanceof Error && !String(error.message).includes(SECRET)
    );
  });

  it("keeps connectivity-test failures masked and free of provider response bodies", async () => {
    const repository = AiConnectionRepository.inMemory();
    const audit = IdentityRepository.inMemory();
    const providerFactory: AiConnectionTestProviderFactory = () => ({
      model: "model",
      providerId: "openai-compatible-chat",
      async complete() {
        throw new Error(`upstream said ${SECRET}`);
      }
    });
    const service = new AiConnectionsService(repository, environment, undefined, audit, providerFactory);
    const created = await service.create("tenant-volga", {
      baseUrl: "https://provider.example.test",
      chatModel: "model",
      secret: SECRET
    });
    const id = String((created.data.connection as { id: string }).id);
    const tested = await service.test("tenant-volga", id);

    assert.equal(tested.status, "invalid");
    assert.equal(tested.error?.message, "AI connection test failed. Check the diagnostic trace.");
    assert.equal(hasCredentialMaterial(tested), false);
    assert.equal(repository.find("tenant-volga", id)?.lastTestMessage?.includes(SECRET), false);
    assert.equal(hasCredentialMaterial(await audit.listServiceAdminAuditEvents()), false);
  });
});
