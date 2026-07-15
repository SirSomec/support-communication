import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createQualityScoringProviderRequest,
  createQualityScoringRequestTelemetry,
  createQualityScoringResponseTelemetry
} from "../apps/api-gateway/src/quality/quality-scoring.adapter.ts";
import {
  QUALITY_SCORING_PROVIDER_PORT_VERSION,
  type QualityScoringProvider
} from "../apps/api-gateway/src/quality/quality-scoring.provider.ts";
import {
  PrismaQualityScoringRepository,
  QualityScoringRepository,
  type PrismaQualityScoringClient
} from "../apps/api-gateway/src/quality/quality-scoring.repository.ts";
import {
  configureQualityScoringRepository,
  resolveQualityScoringStoreFile
} from "../apps/api-gateway/src/quality/quality-scoring.bootstrap.ts";

describe("Prisma-backed quality scoring telemetry contracts", () => {
  it("persists sanitized request telemetry through Prisma with tenant-scoped first-write-wins replay", async () => {
    const { client, calls } = createFakePrismaQualityScoringClient();
    const repository = QualityScoringRepository.prisma({ client });
    const request = createQualityScoringProviderRequest({
      channel: "Telegram Bearer sk-channel-secret",
      conversationId: "conv-request-prisma/Bearer-sk-conversation-secret",
      locale: "en",
      mode: "reply",
      operatorId: "operator-secret",
      tenantId: "tenant-volga",
      text: "Bearer sk-live-secret should not be persisted."
    }, {
      requestedAt: "2026-06-30T13:00:00.000Z",
      traceId: "trc_quality_request_prisma Bearer sk-trace-secret"
    });
    const unsafeTelemetry = {
      ...createQualityScoringRequestTelemetry(request),
      channel: "Bearer:sk-channel-secret",
      prompt: "raw prompt",
      secret: "raw secret"
    } as ReturnType<typeof createQualityScoringRequestTelemetry>;

    const saved = await repository.saveRequestTelemetry({
      recordedAt: "2026-06-30T13:00:01.000Z",
      telemetry: unsafeTelemetry,
      telemetryId: "quality-request-telemetry-Bearer-sk-id-secret"
    });
    const replay = await repository.saveRequestTelemetry({
      recordedAt: "2026-06-30T13:00:02.000Z",
      telemetry: { ...createQualityScoringRequestTelemetry({ ...request, channel: "VK" }), channel: "VK" },
      telemetryId: "quality-request-telemetry-Bearer-sk-id-secret"
    });
    const otherTenant = await repository.saveRequestTelemetry({
      recordedAt: "2026-06-30T13:00:03.000Z",
      telemetry: {
        ...createQualityScoringRequestTelemetry({ ...request, channel: "VK", tenantId: "tenant-other" }),
        channel: "VK"
      },
      telemetryId: "quality-request-telemetry-Bearer-sk-other-id-secret"
    });
    const rows = await repository.listRequestTelemetry({ tenantId: "tenant-volga" });
    rows[0].telemetry.channel = "mutated-after-read";
    const rowsAgain = await repository.listRequestTelemetry({ tenantId: "tenant-volga" });
    const serialized = JSON.stringify(rowsAgain);

    assert.match(saved.telemetryId, /^quality-request-telemetry-redacted:[a-f0-9]{16}$/);
    // First write wins: replay collapses onto the stored row instead of creating a second row.
    assert.equal(replay.recordedAt, "2026-06-30T13:00:01.000Z");
    assert.equal(replay.telemetry.channel, "other");
    assert.equal(calls.requestCreates.length, 2);
    assert.notEqual(otherTenant.telemetry.tenantId, "redacted");
    assert.equal(otherTenant.telemetry.tenantId, "tenant-other");
    assert.equal(rowsAgain.length, 1);
    assert.equal(rowsAgain[0].telemetry.channel, "other");
    assert.equal(rowsAgain[0].telemetry.direction, "request");
    assert.equal(rowsAgain[0].telemetry.conversationId, "redacted");
    assert.equal(rowsAgain[0].telemetry.traceId, "redacted");
    assert.equal("prompt" in rowsAgain[0].telemetry, false);
    assert.equal("secret" in rowsAgain[0].telemetry, false);
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(serialized.includes("sk-live-secret"), false);
    assert.equal(serialized.includes("sk-channel-secret"), false);
    assert.equal(serialized.includes("raw prompt"), false);
    assert.equal(serialized.includes("operator-secret"), false);
    // The persisted JSON keeps ISO timestamps as strings (JSONB round-trip), never Date objects.
    assert.equal(calls.requestCreates[0].data.telemetry.requestedAt, "2026-06-30T13:00:00.000Z");
    assert.deepEqual(calls.requestFindUnique[0], {
      where: { tenantId_telemetryId: { telemetryId: saved.telemetryId, tenantId: "tenant-volga" } }
    });
    assert.equal((await repository.listRequestTelemetry({ tenantId: "tenant-other" })).length, 1);
    assert.equal((await repository.listRequestTelemetry()).length, 2);
  });

  it("persists sanitized response telemetry through Prisma with status and conversation filters", async () => {
    const { client, calls } = createFakePrismaQualityScoringClient();
    const repository = QualityScoringRepository.prisma({ client });
    const okResult = qualityScoreResult({ score: 30, status: "ok" });
    const unsafeTelemetry = {
      ...createQualityScoringResponseTelemetry(okResult, {
        conversationId: "conv-response-prisma/Bearer-sk-conversation-secret"
      }),
      provider: {
        model: "quality-model/v1 Bearer sk-model-secret",
        providerId: "Bearer:sk-provider-secret",
        providerResultStored: true
      },
      prompt: "raw prompt",
      secret: "raw secret"
    } as ReturnType<typeof createQualityScoringResponseTelemetry>;

    const saved = await repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:01.000Z",
      tenantId: "tenant-volga",
      telemetry: unsafeTelemetry,
      telemetryId: "quality-response-telemetry-Bearer-sk-id-secret"
    });
    const replay = await repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:02.000Z",
      tenantId: "tenant-volga",
      telemetry: createQualityScoringResponseTelemetry(qualityScoreResult({ score: 80, status: "ok" }), {
        conversationId: "conv-response-prisma"
      }),
      telemetryId: "quality-response-telemetry-Bearer-sk-id-secret"
    });
    const failed = await repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:03.000Z",
      tenantId: "tenant-volga",
      telemetry: createQualityScoringResponseTelemetry(
        qualityScoreResult({ score: null, status: "failed", errorCode: "provider_timeout" }),
        { conversationId: "conv-response-failed" }
      ),
      telemetryId: "quality-response-telemetry-failed"
    });
    const okRows = await repository.listResponseTelemetry({ status: "ok", tenantId: "tenant-volga" });
    const conversationRows = await repository.listResponseTelemetry({
      conversationId: "redacted",
      tenantId: "tenant-volga"
    });
    const serialized = JSON.stringify(okRows);

    assert.match(saved.telemetryId, /^quality-response-telemetry-redacted:[a-f0-9]{16}$/);
    assert.equal(replay.recordedAt, "2026-06-30T13:05:01.000Z");
    assert.equal(calls.responseCreates.length, 2);
    assert.equal(okRows.length, 1);
    assert.equal(okRows[0].telemetry.status, "ok");
    assert.equal(okRows[0].telemetry.provider.model, "redacted");
    assert.equal(okRows[0].telemetry.provider.providerId, "redacted");
    assert.equal(okRows[0].telemetry.conversationId, "redacted");
    assert.equal(conversationRows.length, 1);
    assert.equal((await repository.listResponseTelemetry({ status: "failed", tenantId: "tenant-volga" })).length, 1);
    assert.equal(failed.telemetry.status, "failed");
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(serialized.includes("sk-model-secret"), false);
    assert.equal(serialized.includes("raw prompt"), false);
    assert.equal(calls.responseCreates[0].data.status, "ok");
    assert.equal(calls.responseCreates[0].data.conversationId, "redacted");
    assert.deepEqual(calls.responseFindMany.at(-1)?.where, {
      status: "failed",
      tenantId: "tenant-volga"
    });
  });

  it("persists sanitized failure envelopes through Prisma with error-code filter", async () => {
    const { client, calls } = createFakePrismaQualityScoringClient();
    const repository = QualityScoringRepository.prisma({ client });
    const unsafeEnvelope = {
      conversationId: "conv-failure/Bearer-sk-conversation-secret",
      error: { code: "customer_requested_refund", retryable: true, message: "raw provider failure prompt" },
      provider: {
        model: "quality-model/v1 Bearer sk-model-secret",
        providerId: "Bearer:sk-provider-secret",
        providerResultStored: true
      },
      providerPortVersion: "quality-scoring-provider/unsafe",
      responseFingerprint: "Bearer sk-response-fingerprint-secret",
      status: "failed",
      prompt: "raw prompt",
      secret: "raw secret"
    };

    const saved = await repository.saveFailureEnvelope({
      envelope: unsafeEnvelope as never,
      failureId: "quality-failure-envelope-Bearer-sk-id-secret",
      recordedAt: "2026-06-30T13:10:01.000Z",
      tenantId: "tenant-with-Bearer-sk-unsafe-one"
    });
    const replay = await repository.saveFailureEnvelope({
      envelope: unsafeEnvelope as never,
      failureId: "quality-failure-envelope-Bearer-sk-id-secret",
      recordedAt: "2026-06-30T13:10:02.000Z",
      tenantId: "tenant-with-Bearer-sk-unsafe-one"
    });
    const rows = await repository.listFailureEnvelopes({ tenantId: saved.tenantId });
    const redactedCodeRows = await repository.listFailureEnvelopes({
      errorCode: "redacted",
      tenantId: saved.tenantId
    });
    const serialized = JSON.stringify(rows);

    assert.match(saved.failureId, /^quality-failure-envelope-redacted:[a-f0-9]{16}$/);
    assert.match(saved.tenantId, /^tenant-redacted:[a-f0-9]{16}$/);
    assert.equal(replay.recordedAt, "2026-06-30T13:10:01.000Z");
    assert.equal(calls.failureCreates.length, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].envelope.status, "failed");
    assert.equal(rows[0].envelope.providerPortVersion, QUALITY_SCORING_PROVIDER_PORT_VERSION);
    assert.equal(rows[0].envelope.error.code, "redacted");
    assert.equal(rows[0].envelope.provider.model, "redacted");
    assert.equal(rows[0].envelope.conversationId, "redacted");
    assert.equal(redactedCodeRows.length, 1);
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(serialized.includes("customer_requested_refund"), false);
    assert.equal(serialized.includes("raw prompt"), false);
    assert.equal(calls.failureCreates[0].data.errorCode, "redacted");
  });

  it("bootstraps the quality scoring repository from Prisma via the house repository env", () => {
    const { client } = createFakePrismaQualityScoringClient();
    QualityScoringRepository.clearDefault();
    const repository = configureQualityScoringRepository({
      DATABASE_URL: "postgresql://quality:quality@127.0.0.1:5432/quality",
      NODE_ENV: "staging",
      QUALITY_SCORING_REPOSITORY: "prisma",
      SERVICE_NAME: "quality-scoring-contract"
    }, {
      prismaClientFactory: () => client
    });
    assert.ok(repository instanceof PrismaQualityScoringRepository);
    assert.equal(QualityScoringRepository.default(), repository);
    QualityScoringRepository.clearDefault();
  });

  it("resolves a local store path even when no store-file env is configured", () => {
    const resolved = resolveQualityScoringStoreFile({});
    assert.match(resolved, /quality-scoring/);
  });
});

function qualityScoreResult(options: {
  errorCode?: string;
  score: number | null;
  status: "failed" | "ok";
}): Awaited<ReturnType<QualityScoringProvider["score"]>> {
  const base = {
    checks: options.status === "failed"
      ? []
      : [{ detail: "Provider saw Bearer sk-live-secret.", id: "risk", label: "Risky wording", tone: "danger" }],
    explainability: { modelVersion: "quality-model/v1", reasons: ["risk:Bearer sk-live-secret"] },
    portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
    providerId: "model-quality",
    providerResultId: "quality-result-prisma",
    repairActions: [],
    score: options.score,
    status: options.status,
    telemetry: {
      model: "quality-model/v1",
      providerId: "model-quality",
      requestFingerprint: "request-prisma",
      prompt: "raw prompt",
      secret: "raw secret"
    }
  } as unknown as Awaited<ReturnType<QualityScoringProvider["score"]>>;

  if (options.status === "failed") {
    return {
      ...base,
      error: {
        code: options.errorCode ?? "provider_timeout",
        message: "Timed out after reading Bearer sk-live-secret prompt.",
        retryable: true
      }
    } as Awaited<ReturnType<QualityScoringProvider["score"]>>;
  }

  return base;
}

interface FakeRequestRow {
  recordedAt: string;
  telemetry: Record<string, unknown>;
  telemetryId: string;
  tenantId: string;
}

interface FakeResponseRow {
  conversationId: string | null;
  recordedAt: string;
  status: string;
  telemetry: Record<string, unknown>;
  telemetryId: string;
  tenantId: string;
}

interface FakeFailureRow {
  envelope: Record<string, unknown>;
  errorCode: string;
  failureId: string;
  recordedAt: string;
  tenantId: string;
}

function createFakePrismaQualityScoringClient(): {
  calls: {
    failureCreates: Array<{ data: FakeFailureRow }>;
    requestCreates: Array<{ data: FakeRequestRow }>;
    requestFindUnique: Array<{ where: { tenantId_telemetryId: { telemetryId: string; tenantId: string } } }>;
    responseCreates: Array<{ data: FakeResponseRow }>;
    responseFindMany: Array<{ where: { conversationId?: string | null; status?: string; tenantId?: string } }>;
  };
  client: PrismaQualityScoringClient;
} {
  const requestRows = new Map<string, FakeRequestRow>();
  const responseRows = new Map<string, FakeResponseRow>();
  const failureRows = new Map<string, FakeFailureRow>();
  const calls = {
    failureCreates: [] as Array<{ data: FakeFailureRow }>,
    requestCreates: [] as Array<{ data: FakeRequestRow }>,
    requestFindUnique: [] as Array<{ where: { tenantId_telemetryId: { telemetryId: string; tenantId: string } } }>,
    responseCreates: [] as Array<{ data: FakeResponseRow }>,
    responseFindMany: [] as Array<{ where: { conversationId?: string | null; status?: string; tenantId?: string } }>
  };
  const byRecordedAt = <T extends { recordedAt: string }>(left: T, right: T): number =>
    left.recordedAt < right.recordedAt ? -1 : left.recordedAt > right.recordedAt ? 1 : 0;

  const client = {
    qualityScoringRequestTelemetry: {
      async create(input: { data: FakeRequestRow }): Promise<FakeRequestRow> {
        calls.requestCreates.push(input);
        const row = clone(input.data);
        requestRows.set(`${row.tenantId}:${row.telemetryId}`, row);
        return clone(row);
      },
      async findMany(input: { where: { tenantId?: string } }): Promise<FakeRequestRow[]> {
        return Array.from(requestRows.values())
          .filter((row) => !input.where.tenantId || row.tenantId === input.where.tenantId)
          .sort(byRecordedAt)
          .map(clone);
      },
      async findUnique(input: {
        where: { tenantId_telemetryId: { telemetryId: string; tenantId: string } };
      }): Promise<FakeRequestRow | null> {
        calls.requestFindUnique.push(input);
        const key = input.where.tenantId_telemetryId;
        return clone(requestRows.get(`${key.tenantId}:${key.telemetryId}`) ?? null);
      }
    },
    qualityScoringResponseTelemetry: {
      async create(input: { data: FakeResponseRow }): Promise<FakeResponseRow> {
        calls.responseCreates.push(input);
        const row = clone(input.data);
        responseRows.set(`${row.tenantId}:${row.telemetryId}`, row);
        return clone(row);
      },
      async findMany(input: {
        where: { conversationId?: string | null; status?: string; tenantId?: string };
      }): Promise<FakeResponseRow[]> {
        calls.responseFindMany.push(input);
        return Array.from(responseRows.values())
          .filter((row) =>
            (!input.where.tenantId || row.tenantId === input.where.tenantId)
              && (input.where.status === undefined || row.status === input.where.status)
              && (input.where.conversationId === undefined || row.conversationId === input.where.conversationId)
          )
          .sort(byRecordedAt)
          .map(clone);
      },
      async findUnique(input: {
        where: { tenantId_telemetryId: { telemetryId: string; tenantId: string } };
      }): Promise<FakeResponseRow | null> {
        const key = input.where.tenantId_telemetryId;
        return clone(responseRows.get(`${key.tenantId}:${key.telemetryId}`) ?? null);
      }
    },
    qualityScoringFailureEnvelope: {
      async create(input: { data: FakeFailureRow }): Promise<FakeFailureRow> {
        calls.failureCreates.push(input);
        const row = clone(input.data);
        failureRows.set(`${row.tenantId}:${row.failureId}`, row);
        return clone(row);
      },
      async findMany(input: { where: { errorCode?: string; tenantId?: string } }): Promise<FakeFailureRow[]> {
        return Array.from(failureRows.values())
          .filter((row) =>
            (!input.where.tenantId || row.tenantId === input.where.tenantId)
              && (!input.where.errorCode || row.errorCode === input.where.errorCode)
          )
          .sort(byRecordedAt)
          .map(clone);
      },
      async findUnique(input: {
        where: { tenantId_failureId: { failureId: string; tenantId: string } };
      }): Promise<FakeFailureRow | null> {
        const key = input.where.tenantId_failureId;
        return clone(failureRows.get(`${key.tenantId}:${key.failureId}`) ?? null);
      }
    }
  };

  return { calls, client: client as unknown as PrismaQualityScoringClient };
}

function clone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
