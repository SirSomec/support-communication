import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IntegrationRepository,
  type PrismaIntegrationClient
} from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { IntegrationService } from "../apps/api-gateway/src/integrations/integration.service.ts";
import {
  hashPublicApiKeySecret,
  resolvePublicApiRequest
} from "../apps/api-gateway/src/integrations/public-api-auth.ts";

describe("Prisma-backed integration repository contracts", () => {
  it("fails closed when Prisma public API key delegates are incomplete", () => {
    const { client } = createFakePrismaIntegrationClient();
    delete (client as { publicApiKey?: unknown }).publicApiKey;

    assert.throws(
      () => IntegrationRepository.prisma({ client }),
      /prisma_integration_public_api_key_delegate_required/
    );
  });

  it("fails closed when Prisma public API key reveal state delegates are incomplete", () => {
    const { client } = createFakePrismaIntegrationClient();
    delete (client as { publicApiKeyRevealState?: unknown }).publicApiKeyRevealState;

    assert.throws(
      () => IntegrationRepository.prisma({ client }),
      /prisma_integration_public_api_key_reveal_state_delegate_required/
    );
  });

  it("fails closed when Prisma public API key rotation audit delegates are incomplete", () => {
    const { client } = createFakePrismaIntegrationClient();
    delete (client as { publicApiKeyRotationAuditEvent?: unknown }).publicApiKeyRotationAuditEvent;

    assert.throws(
      () => IntegrationRepository.prisma({ client }),
      /prisma_integration_public_api_key_rotation_audit_delegate_required/
    );
  });

  it("persists public API key hashes through Prisma delegates without raw secret material", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_live_prisma_hash_secret_7711";

    const saved = await repository.savePublicApiKey({
      createdAt: "2026-06-30T11:00:00.000Z",
      environment: "production",
      keyId: "pak_prisma_hash",
      name: "Prisma hash key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });
    const auth = await resolvePublicApiRequest({
      authorization: `Bearer ${rawSecret}`,
      environment: "production",
      lookup: repository,
      requiredScope: "clients:identify"
    });

    assert.equal(saved.secretHash, hashPublicApiKeySecret(rawSecret));
    assert.equal(saved.keyPreview, "sk_live_****_7711");
    assert.equal(auth.allowed, true);
    assert.equal(auth.context.keyId, "pak_prisma_hash");
    assert.equal(JSON.stringify(calls.publicApiKeyUpserts).includes(rawSecret), false);
    assert.deepEqual(calls.publicApiKeyUpserts[0], {
      create: {
        createdAt: new Date("2026-06-30T11:00:00.000Z"),
        environment: "production",
        keyId: "pak_prisma_hash",
        keyPreview: "sk_live_****_7711",
        name: "Prisma hash key",
        owner: "Security",
        scopes: ["clients:identify"],
        secretHash: hashPublicApiKeySecret(rawSecret),
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T11:00:00.000Z")
      },
      update: {
        environment: "production",
        keyPreview: "sk_live_****_7711",
        name: "Prisma hash key",
        owner: "Security",
        scopes: ["clients:identify"],
        secretHash: hashPublicApiKeySecret(rawSecret),
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T11:00:00.000Z")
      },
      where: { keyId: "pak_prisma_hash" }
    });
  });

  it("persists and consumes one-time public API key reveal state through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_test_prisma_reveal_secret_4822";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:00:00.000Z",
      environment: "stage",
      keyId: "pak_prisma_reveal",
      name: "Prisma reveal key",
      owner: "Platform",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-kama"
    });

    const firstReveal = await repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T12:01:00.000Z",
      keyId: "pak_prisma_reveal"
    });
    const secondReveal = await repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T12:02:00.000Z",
      keyId: "pak_prisma_reveal"
    });

    assert.deepEqual(firstReveal, {
      consumedAt: "2026-06-30T12:01:00.000Z",
      keyId: "pak_prisma_reveal",
      keyPreview: "sk_test_****_4822",
      rawSecret,
      status: "revealed"
    });
    assert.deepEqual(secondReveal, {
      consumedAt: "2026-06-30T12:01:00.000Z",
      keyId: "pak_prisma_reveal",
      keyPreview: "sk_test_****_4822",
      status: "consumed"
    });
    assert.equal(JSON.stringify(calls.publicApiKeyRevealStateUpserts).includes(rawSecret), false);
    assert.equal(JSON.stringify(calls.publicApiKeyRevealStateUpdateMany).includes(rawSecret), false);
    assert.deepEqual(calls.publicApiKeyRevealStateUpserts[0], {
      create: {
        consumedAt: null,
        createdAt: new Date("2026-06-30T12:00:00.000Z"),
        keyId: "pak_prisma_reveal",
        keyPreview: "sk_test_****_4822",
        status: "available"
      },
      update: {},
      where: { keyId: "pak_prisma_reveal" }
    });
    assert.deepEqual(calls.publicApiKeyRevealStateUpdateMany[0], {
      data: {
        consumedAt: new Date("2026-06-30T12:01:00.000Z"),
        keyPreview: "sk_test_****_4822",
        status: "consumed"
      },
      where: { keyId: "pak_prisma_reveal", status: "available" }
    });
  });

  it("reveals the Prisma-backed public API key secret only once under concurrent consume calls", async () => {
    const revealFindUniqueBarrier = createCallBarrier(2);
    const { calls, client } = createFakePrismaIntegrationClient({
      afterRevealFindUniqueSnapshot: revealFindUniqueBarrier.wait
    });
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_test_prisma_concurrent_reveal_9015";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:10:00.000Z",
      environment: "stage",
      keyId: "pak_prisma_concurrent_reveal",
      name: "Prisma concurrent reveal key",
      owner: "Platform",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-kama"
    });

    const [first, second] = await Promise.all([
      repository.consumePublicApiKeyReveal({
        consumedAt: "2026-06-30T12:11:00.000Z",
        keyId: "pak_prisma_concurrent_reveal"
      }),
      repository.consumePublicApiKeyReveal({
        consumedAt: "2026-06-30T12:11:01.000Z",
        keyId: "pak_prisma_concurrent_reveal"
      })
    ]);
    const results = [first, second];

    assert.equal(results.filter((result) => result.status === "revealed").length, 1);
    assert.equal(results.filter((result) => result.status === "consumed").length, 1);
    assert.equal(results.filter((result) => result.rawSecret === rawSecret).length, 1);
    assert.equal(JSON.stringify(calls.publicApiKeyRevealStateUpdateMany).includes(rawSecret), false);
    assert.deepEqual(calls.publicApiKeyRevealStateUpdateMany.map((call) => call.where), [
      { keyId: "pak_prisma_concurrent_reveal", status: "available" },
      { keyId: "pak_prisma_concurrent_reveal", status: "available" }
    ]);
  });

  it("does not reopen Prisma one-time reveal state when key creation is replayed", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_test_prisma_replay_reveal_3377";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:15:00.000Z",
      environment: "stage",
      keyId: "pak_prisma_replay_reveal",
      name: "Prisma replay reveal key",
      owner: "Platform",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-kama"
    });

    const firstReveal = await repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T12:16:00.000Z",
      keyId: "pak_prisma_replay_reveal"
    });
    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:17:00.000Z",
      environment: "stage",
      keyId: "pak_prisma_replay_reveal",
      name: "Prisma replay reveal key",
      owner: "Platform",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-kama"
    });
    const replayReveal = await repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T12:18:00.000Z",
      keyId: "pak_prisma_replay_reveal"
    });

    assert.equal(firstReveal.status, "revealed");
    assert.equal(firstReveal.rawSecret, rawSecret);
    assert.deepEqual(replayReveal, {
      consumedAt: "2026-06-30T12:16:00.000Z",
      keyId: "pak_prisma_replay_reveal",
      keyPreview: "sk_test_****_3377",
      status: "consumed"
    });
    assert.equal(JSON.stringify(calls.publicApiKeyRevealStateUpserts).includes(rawSecret), false);
    assert.equal(calls.publicApiKeyRevealStateUpserts.length, 2);
    assert.deepEqual(calls.publicApiKeyRevealStateUpserts[1].update, {});
  });

  it("persists immutable public API key rotation audit rows through Prisma create without raw secret material", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const rawSecret = "sk_live_prisma_rotation_secret_6650";
    const auditEvent = {
      action: "public_api_key.rotation_queued" as const,
      at: "2026-06-30T12:20:00.000Z",
      auditId: "evt_key_prisma_rotation",
      environment: "production",
      immutable: true as const,
      keyId: "pak_prisma_rotation",
      keyPreview: "sk_live_****_6650",
      rotationId: "key_rotation_prisma_6650",
      status: "rotation_queued"
    };

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:19:00.000Z",
      environment: "production",
      keyId: "pak_prisma_rotation",
      name: "Prisma rotation key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });

    const saved = await repository.saveApiKeyRotationAuditEvent(auditEvent);

    assert.deepEqual(saved, auditEvent);
    assert.equal(JSON.stringify(calls.publicApiKeyRotationAuditEventCreates).includes(rawSecret), false);
    assert.equal(JSON.stringify(calls.publicApiKeyRotationAuditEventCreates).includes("rawSecret"), false);
    assert.deepEqual(calls.publicApiKeyRotationAuditEventCreates[0], {
      data: {
        action: "public_api_key.rotation_queued",
        at: new Date("2026-06-30T12:20:00.000Z"),
        auditId: "evt_key_prisma_rotation",
        environment: "production",
        immutable: true,
        keyId: "pak_prisma_rotation",
        keyPreview: "sk_live_****_6650",
        rotationId: "key_rotation_prisma_6650",
        status: "rotation_queued"
      }
    });
    await assert.rejects(
      () => repository.saveApiKeyRotationAuditEvent(auditEvent),
      /fake_prisma_public_api_key_rotation_audit_duplicate/
    );
  });

  it("rotates fixture API keys through Prisma after creating a safe public key reference for audit FK", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const integrations = new IntegrationService(repository);

    const rotated = await integrations.rotateApiKey("stage-key");

    assert.equal(rotated.status, "ok");
    assert.equal(rotated.data.keyId, "stage-key");
    assert.equal(calls.publicApiKeyUpserts[0].where.keyId, "stage-key");
    assert.equal(calls.publicApiKeyUpserts[0].create.keyId, "stage-key");
    assert.equal(calls.publicApiKeyUpserts[0].create.keyPreview, "sk_test_****_44ST");
    assert.equal(calls.publicApiKeyUpserts[0].create.environment, "stage");
    assert.equal(calls.publicApiKeyUpserts[0].create.status, "active");
    assert.equal(calls.publicApiKeyUpserts[0].create.secretHash.length, 64);
    assert.equal(calls.publicApiKeyUpserts[0].create.secretHash.includes("sk_test"), false);
    assert.deepEqual(calls.publicApiKeyUpserts[0].update, {});
    assert.equal(calls.publicApiKeyRotationAuditEventCreates[0].data.keyId, "stage-key");
    assert.equal(calls.publicApiKeyRotationAuditEventCreates[0].data.keyPreview, "sk_test_****_44ST");
    assert.equal(JSON.stringify(calls.publicApiKeyRotationAuditEventCreates).includes("rawSecret"), false);
    assert.equal(JSON.stringify(calls.publicApiKeyRotationAuditEventCreates).includes("sk_test_support_secret"), false);
  });

  it("keeps an existing Prisma public API key hash when preparing rotation audit references", async () => {
    const { calls, client } = createFakePrismaIntegrationClient();
    const repository = IntegrationRepository.prisma({ client });
    const integrations = new IntegrationService(repository);
    const rawSecret = "sk_test_existing_stage_secret_4400";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T12:30:00.000Z",
      environment: "stage",
      keyId: "stage-key",
      name: "Persisted stage key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });

    const rotated = await integrations.rotateApiKey("stage-key");
    const auth = await resolvePublicApiRequest({
      authorization: `Bearer ${rawSecret}`,
      environment: "stage",
      lookup: repository,
      requiredScope: "clients:identify"
    });

    assert.equal(rotated.status, "ok");
    assert.equal(auth.allowed, true);
    assert.equal(calls.publicApiKeyUpserts.length, 2);
    assert.deepEqual(calls.publicApiKeyUpserts[1].update, {});
    assert.equal(calls.publicApiKeyRotationAuditEventCreates[0].data.keyId, "stage-key");
  });
});

function createFakePrismaIntegrationClient(options: {
  afterRevealFindUniqueSnapshot?: () => Promise<void>;
} = {}) {
  const rows = new Map<string, FakePublicApiKeyRow>();
  const revealRows = new Map<string, FakePublicApiKeyRevealStateRow>();
  const rotationAuditRows = new Map<string, FakePublicApiKeyRotationAuditEventRow>();
  const calls: {
    publicApiKeyCreates: Array<{ data: FakePublicApiKeyRow }>;
    publicApiKeyFindMany: Array<{ orderBy?: { createdAt: "asc" | "desc" }; where?: { status?: string } }>;
    publicApiKeyFindUnique: Array<{ where: { keyId: string } }>;
    publicApiKeyUpserts: Array<{
      create: FakePublicApiKeyRow;
      update: Partial<Omit<FakePublicApiKeyRow, "createdAt" | "keyId">>;
      where: { keyId: string };
    }>;
    publicApiKeyRevealStateFindUnique: Array<{ where: { keyId: string } }>;
    publicApiKeyRevealStateUpdates: Array<{
      data: Partial<Omit<FakePublicApiKeyRevealStateRow, "createdAt" | "keyId">>;
      where: { keyId: string };
    }>;
    publicApiKeyRevealStateUpdateMany: Array<{
      data: Partial<Omit<FakePublicApiKeyRevealStateRow, "createdAt" | "keyId">>;
      where: { keyId: string; status?: "available" | "consumed" };
    }>;
    publicApiKeyRevealStateUpserts: Array<{
      create: FakePublicApiKeyRevealStateRow;
      update: Partial<Omit<FakePublicApiKeyRevealStateRow, "createdAt" | "keyId">>;
      where: { keyId: string };
    }>;
    publicApiKeyRotationAuditEventCreates: Array<{
      data: FakePublicApiKeyRotationAuditEventCreateInput;
    }>;
  } = {
    publicApiKeyCreates: [],
    publicApiKeyFindMany: [],
    publicApiKeyFindUnique: [],
    publicApiKeyRevealStateFindUnique: [],
    publicApiKeyRevealStateUpdateMany: [],
    publicApiKeyRevealStateUpdates: [],
    publicApiKeyRevealStateUpserts: [],
    publicApiKeyRotationAuditEventCreates: [],
    publicApiKeyUpserts: []
  };
  const client: PrismaIntegrationClient = {
    publicApiKey: {
      async create(input) {
        if (rows.has(input.data.keyId)) {
          throw new Error("fake_prisma_public_api_key_duplicate");
        }

        calls.publicApiKeyCreates.push(clone(input));
        rows.set(input.data.keyId, clone(input.data));

        return clone(input.data);
      },
      async findMany(input) {
        calls.publicApiKeyFindMany.push(input);
        return [...rows.values()]
          .filter((row) => !input.where?.status || row.status === input.where.status)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      },
      async findUnique(input) {
        calls.publicApiKeyFindUnique.push(clone(input));

        return clone(rows.get(input.where.keyId) ?? null);
      },
      async upsert(input) {
        calls.publicApiKeyUpserts.push(clone(input));
        const existing = rows.get(input.where.keyId);
        const next = existing
          ? { ...existing, ...input.update }
          : clone(input.create);
        rows.set(input.where.keyId, next);

        return clone(next);
      }
    },
    publicApiKeyRevealState: {
      async findUnique(input) {
        calls.publicApiKeyRevealStateFindUnique.push(clone(input));
        const snapshot = clone(revealRows.get(input.where.keyId) ?? null);
        await options.afterRevealFindUniqueSnapshot?.();

        return snapshot;
      },
      async update(input) {
        calls.publicApiKeyRevealStateUpdates.push(clone(input));
        const existing = revealRows.get(input.where.keyId);
        if (!existing) {
          throw new Error("fake_prisma_public_api_key_reveal_state_not_found");
        }

        const next = { ...existing, ...input.data };
        revealRows.set(input.where.keyId, next);

        return clone(next);
      },
      async updateMany(input) {
        calls.publicApiKeyRevealStateUpdateMany.push(clone(input));
        const existing = revealRows.get(input.where.keyId);
        if (!existing || (input.where.status && existing.status !== input.where.status)) {
          return { count: 0 };
        }

        revealRows.set(input.where.keyId, { ...existing, ...input.data });

        return { count: 1 };
      },
      async upsert(input) {
        calls.publicApiKeyRevealStateUpserts.push(clone(input));
        const existing = revealRows.get(input.where.keyId);
        const next = existing
          ? { ...existing, ...input.update }
          : clone(input.create);
        revealRows.set(input.where.keyId, next);

        return clone(next);
      }
    },
    publicApiKeyRotationAuditEvent: {
      async create(input) {
        if (!rows.has(input.data.keyId)) {
          throw new Error("fake_prisma_public_api_key_rotation_audit_missing_key_fk");
        }

        if (rotationAuditRows.has(input.data.auditId)) {
          throw new Error("fake_prisma_public_api_key_rotation_audit_duplicate");
        }

        calls.publicApiKeyRotationAuditEventCreates.push(clone(input));
        const row = { ...clone(input.data), createdAt: new Date("2026-06-30T12:20:01.000Z") };
        rotationAuditRows.set(row.auditId, row);

        return clone(row);
      }
    }
  };

  return { calls, client };
}

interface FakePublicApiKeyRow {
  createdAt: Date;
  environment: "production" | "stage";
  keyId: string;
  keyPreview: string;
  name: string;
  owner: string;
  scopes: string[];
  secretHash: string;
  status: "active" | "revoked";
  tenantId: string;
  updatedAt: Date;
}

interface FakePublicApiKeyRevealStateRow {
  consumedAt: Date | null;
  createdAt: Date;
  keyId: string;
  keyPreview: string;
  status: "available" | "consumed";
}

interface FakePublicApiKeyRotationAuditEventCreateInput {
  action: "public_api_key.rotation_queued";
  at: Date;
  auditId: string;
  environment: string;
  immutable: true;
  keyId: string;
  keyPreview: string;
  rotationId: string;
  status: string;
}

interface FakePublicApiKeyRotationAuditEventRow extends FakePublicApiKeyRotationAuditEventCreateInput {
  createdAt: Date;
}

function createCallBarrier(targetCalls: number) {
  let calls = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    async wait(): Promise<void> {
      calls += 1;
      if (calls === targetCalls) {
        release();
      }

      await released;
    }
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, item) => {
    if (typeof item === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item)) {
      return new Date(item);
    }

    return item;
  }) as T;
}
