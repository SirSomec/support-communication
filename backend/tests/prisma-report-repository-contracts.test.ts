import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ReportRepository,
  type MetricDefinitionRecord,
  type MetricTenantOverrideRecord,
  type MetricVersionRecord,
  type ReportIdempotencyRecord,
  type SavedReportTemplateRecord
} from "../apps/api-gateway/src/reports/report.repository.ts";
import type { ReportExportJob } from "../apps/api-gateway/src/reports/report.fixtures.ts";

describe("Prisma-backed report repository contracts", () => {
  it("fails closed when Prisma report delegates are incomplete", () => {
    const { client } = createFakePrismaReportClient();
    delete (client as { metricVersion?: unknown }).metricVersion;

    assert.throws(
      () => ReportRepository.prisma({ client }),
      /prisma_report_metric_version_delegate_required/
    );
  });

  it("persists metric definitions through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const repository = ReportRepository.prisma({ client });
    const metric: MetricDefinitionRecord = {
      createdAt: "2026-06-30T10:00:00.000Z",
      description: " Median time until the first operator response. ",
      id: "metric_prisma_first_response",
      key: " first_response_seconds ",
      name: " First response time ",
      source: " conversation ",
      tenantId: "tenant-volga",
      unit: " seconds ",
      updatedAt: "2026-06-30T10:05:00.000Z"
    };

    const saved = await repository.saveMetricDefinition(metric);
    const refetched = await repository.findMetricDefinition("metric_prisma_first_response", { tenantId: "tenant-volga" });
    const crossTenant = await repository.findMetricDefinition("metric_prisma_first_response", { tenantId: "tenant-ladoga" });
    const rows = await repository.listMetricDefinitions({
      key: "first_response_seconds",
      tenantId: "tenant-volga"
    });

    assert.equal(saved.description, "Median time until the first operator response.");
    assert.equal(saved.key, "first_response_seconds");
    assert.equal(refetched?.unit, "seconds");
    assert.equal(crossTenant, undefined);
    assert.deepEqual(rows.map((row) => row.id), ["metric_prisma_first_response"]);
    assert.deepEqual(calls.metricDefinitionUpserts[0], {
      create: {
        createdAt: new Date("2026-06-30T10:00:00.000Z"),
        description: "Median time until the first operator response.",
        id: "metric_prisma_first_response",
        key: "first_response_seconds",
        name: "First response time",
        source: "conversation",
        tenantId: "tenant-volga",
        unit: "seconds",
        updatedAt: new Date("2026-06-30T10:05:00.000Z")
      },
      update: {
        description: "Median time until the first operator response.",
        key: "first_response_seconds",
        name: "First response time",
        source: "conversation",
        tenantId: "tenant-volga",
        unit: "seconds",
        updatedAt: new Date("2026-06-30T10:05:00.000Z")
      },
      where: { id: "metric_prisma_first_response" }
    });
  });

  it("persists metric versions through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const repository = ReportRepository.prisma({ client });
    const version: MetricVersionRecord = {
      createdAt: "2026-06-30T10:10:00.000Z",
      definitionId: "metric_prisma_first_response",
      id: "metric_prisma_first_response_v1",
      queryKey: " conversation.first_response_seconds ",
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T10:15:00.000Z",
      version: " v1 "
    };

    const saved = await repository.saveMetricVersion(version);
    const refetched = await repository.findMetricVersion("metric_prisma_first_response_v1", { tenantId: "tenant-volga" });
    const crossTenant = await repository.findMetricVersion("metric_prisma_first_response_v1", { tenantId: "tenant-ladoga" });
    const rows = await repository.listMetricVersions({
      definitionId: "metric_prisma_first_response",
      tenantId: "tenant-volga"
    });

    assert.equal(saved.queryKey, "conversation.first_response_seconds");
    assert.equal(saved.version, "v1");
    assert.equal(refetched?.status, "active");
    assert.equal(crossTenant, undefined);
    assert.deepEqual(rows.map((row) => row.id), ["metric_prisma_first_response_v1"]);
    assert.deepEqual(calls.metricVersionUpserts[0], {
      create: {
        createdAt: new Date("2026-06-30T10:10:00.000Z"),
        definitionId: "metric_prisma_first_response",
        id: "metric_prisma_first_response_v1",
        queryKey: "conversation.first_response_seconds",
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T10:15:00.000Z"),
        version: "v1"
      },
      update: {
        definitionId: "metric_prisma_first_response",
        queryKey: "conversation.first_response_seconds",
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T10:15:00.000Z"),
        version: "v1"
      },
      where: { id: "metric_prisma_first_response_v1" }
    });
  });

  it("fails closed when Prisma metric version rows contain malformed statuses", async () => {
    const { client, seedMetricVersion } = createFakePrismaReportClient();
    seedMetricVersion({
      createdAt: new Date("2026-06-30T10:10:00.000Z"),
      definitionId: "metric_prisma_first_response",
      id: "metric_prisma_first_response_malformed",
      queryKey: "conversation.first_response_seconds",
      status: "paused",
      tenantId: "tenant-volga",
      updatedAt: new Date("2026-06-30T10:15:00.000Z"),
      version: "v1"
    });
    const repository = ReportRepository.prisma({ client });

    await assert.rejects(
      () => repository.findMetricVersion("metric_prisma_first_response_malformed", { tenantId: "tenant-volga" }),
      /Unsupported metric version status: paused/
    );
  });

  it("persists metric tenant overrides through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const repository = ReportRepository.prisma({ client });
    const override: MetricTenantOverrideRecord = {
      createdAt: "2026-06-30T10:20:00.000Z",
      definitionId: "metric_prisma_first_response",
      id: "metric_prisma_first_response_override",
      metricVersionId: "metric_prisma_first_response_v2",
      reason: " Tenant-specific reporting cutoff ",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T10:25:00.000Z"
    };

    const saved = await repository.saveMetricTenantOverride(override);
    const refetched = await repository.findMetricTenantOverride("metric_prisma_first_response_override", { tenantId: "tenant-volga" });
    const crossTenant = await repository.findMetricTenantOverride("metric_prisma_first_response_override", { tenantId: "tenant-ladoga" });
    const rows = await repository.listMetricTenantOverrides({
      definitionId: "metric_prisma_first_response",
      tenantId: "tenant-volga"
    });

    assert.equal(saved.reason, "Tenant-specific reporting cutoff");
    assert.equal(refetched?.metricVersionId, "metric_prisma_first_response_v2");
    assert.equal(crossTenant, undefined);
    assert.deepEqual(rows.map((row) => row.id), ["metric_prisma_first_response_override"]);
    assert.deepEqual(calls.metricTenantOverrideUpserts[0], {
      create: {
        createdAt: new Date("2026-06-30T10:20:00.000Z"),
        definitionId: "metric_prisma_first_response",
        id: "metric_prisma_first_response_override",
        metricVersionId: "metric_prisma_first_response_v2",
        reason: "Tenant-specific reporting cutoff",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T10:25:00.000Z")
      },
      update: {
        definitionId: "metric_prisma_first_response",
        metricVersionId: "metric_prisma_first_response_v2",
        reason: "Tenant-specific reporting cutoff",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T10:25:00.000Z")
      },
      where: { id: "metric_prisma_first_response_override" }
    });
  });

  it("persists saved report templates and idempotency keys through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const repository = ReportRepository.prisma({ client });
    const template: SavedReportTemplateRecord = {
      columns: ["metric", "today"],
      createdAt: "2026-06-30T13:30:00.000Z",
      filters: {
        channel: "VK",
        period: "today"
      },
      id: "template_prisma_saved",
      name: " Prisma saved report ",
      ownerUserId: "operator-anna",
      reportType: "SLA",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T13:35:00.000Z",
      visibility: {
        roles: ["supervisor"],
        scope: "roles"
      }
    };

    const saved = await repository.saveSavedReportTemplate(template);
    await repository.saveIdempotencyKey({
      fingerprint: "fingerprint-template-prisma",
      jobId: saved.id,
      key: "saveSavedReportTemplate:template-prisma-key"
    });
    const refetched = await repository.findSavedReportTemplate("template_prisma_saved", {
      requesterRoles: ["supervisor"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-volga"
    });
    const hidden = await repository.findSavedReportTemplate("template_prisma_saved", {
      requesterRoles: ["operator"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-volga"
    });
    const crossTenant = await repository.findSavedReportTemplate("template_prisma_saved", {
      requesterRoles: ["supervisor"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-ladoga"
    });
    const listed = await repository.listSavedReportTemplates({
      requesterRoles: ["supervisor"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-volga"
    });
    const idempotency = await repository.findIdempotencyKey("saveSavedReportTemplate:template-prisma-key");

    assert.equal(saved.name, "Prisma saved report");
    assert.equal(refetched?.id, "template_prisma_saved");
    assert.equal(hidden, undefined);
    assert.equal(crossTenant, undefined);
    assert.deepEqual(listed.map((row) => row.id), ["template_prisma_saved"]);
    assert.deepEqual(idempotency, {
      fingerprint: "fingerprint-template-prisma",
      jobId: "template_prisma_saved",
      key: "saveSavedReportTemplate:template-prisma-key"
    });
    assert.deepEqual(calls.savedReportTemplateUpserts[0], {
      create: {
        columns: ["metric", "today"],
        createdAt: new Date("2026-06-30T13:30:00.000Z"),
        filters: {
          channel: "VK",
          period: "today"
        },
        id: "template_prisma_saved",
        name: "Prisma saved report",
        ownerUserId: "operator-anna",
        reportType: "SLA",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T13:35:00.000Z"),
        visibilityPermissions: [],
        visibilityRoles: ["supervisor"],
        visibilityScope: "roles"
      },
      update: {
        columns: ["metric", "today"],
        filters: {
          channel: "VK",
          period: "today"
        },
        name: "Prisma saved report",
        ownerUserId: "operator-anna",
        reportType: "SLA",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T13:35:00.000Z"),
        visibilityPermissions: [],
        visibilityRoles: ["supervisor"],
        visibilityScope: "roles"
      },
      where: { id: "template_prisma_saved" }
    });
    assert.deepEqual(calls.reportIdempotencyKeyUpserts[0], {
      create: {
        fingerprint: "fingerprint-template-prisma",
        jobId: "template_prisma_saved",
        key: "saveSavedReportTemplate:template-prisma-key"
      },
      update: {
        fingerprint: "fingerprint-template-prisma",
        jobId: "template_prisma_saved"
      },
      where: { key: "saveSavedReportTemplate:template-prisma-key" }
    });
  });

  it("persists report export jobs and idempotency atomically through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const firstRepository = ReportRepository.prisma({ client });
    const secondRepository = ReportRepository.prisma({ client });
    const idempotencyKey: ReportIdempotencyRecord = {
      fingerprint: "digest-export-fingerprint",
      jobId: "export-prisma-first",
      key: "scheduled-digest-export:tenant-volga:digest-volga-daily:2026-07-01"
    };

    const first = await firstRepository.saveExportJobWithIdempotency(reportExportJob({
      id: "export-prisma-first"
    }), idempotencyKey);
    const duplicate = await secondRepository.saveExportJobWithIdempotency(reportExportJob({
      id: "export-prisma-second"
    }), {
      ...idempotencyKey,
      jobId: "export-prisma-second"
    });
    const conflict = await secondRepository.saveExportJobWithIdempotency(reportExportJob({
      columns: ["metric", "previous"],
      id: "export-prisma-conflict"
    }), {
      fingerprint: "different-fingerprint",
      jobId: "export-prisma-conflict",
      key: idempotencyKey.key
    });
    const jobs = await secondRepository.listExportJobsAsync();

    assert.equal(first.status, "created");
    assert.equal(first.job.id, "export-prisma-first");
    assert.equal(duplicate.status, "duplicate");
    assert.equal(duplicate.job.id, "export-prisma-first");
    assert.equal(conflict.status, "conflict");
    assert.deepEqual(jobs.map((job) => job.id), ["export-prisma-first"]);
    assert.equal(calls.reportExportJobUpserts.length, 1);
    assert.equal(calls.reportIdempotencyKeyCreates.length, 1);
    assert.equal(calls.transactions.length, 3);
  });
});

function createFakePrismaReportClient() {
  const metricDefinitions = new Map<string, FakeMetricDefinitionCreateInput>();
  const metricTenantOverrides = new Map<string, FakeMetricTenantOverrideCreateInput>();
  const metricVersions = new Map<string, FakeMetricVersionCreateInput>();
  const reportExportJobs = new Map<string, FakeReportExportJobCreateInput>();
  const reportIdempotencyKeys = new Map<string, FakeReportIdempotencyKeyCreateInput>();
  const savedReportTemplates = new Map<string, FakeSavedReportTemplateCreateInput>();
  const calls = {
    metricDefinitionFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    metricDefinitionFindUnique: [] as Array<{ where: { id: string } }>,
    metricDefinitionUpserts: [] as Array<{
      create: FakeMetricDefinitionCreateInput;
      update: FakeMetricDefinitionUpdateInput;
      where: { id: string };
    }>,
    metricVersionFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    metricVersionFindUnique: [] as Array<{ where: { id: string } }>,
    metricVersionUpserts: [] as Array<{
      create: FakeMetricVersionCreateInput;
      update: FakeMetricVersionUpdateInput;
      where: { id: string };
    }>,
    metricTenantOverrideFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    metricTenantOverrideFindUnique: [] as Array<{ where: { id: string } }>,
    metricTenantOverrideUpserts: [] as Array<{
      create: FakeMetricTenantOverrideCreateInput;
      update: FakeMetricTenantOverrideUpdateInput;
      where: { id: string };
    }>,
    reportIdempotencyKeyFindUnique: [] as Array<{ where: { key: string } }>,
    reportIdempotencyKeyCreates: [] as Array<{ data: FakeReportIdempotencyKeyCreateInput }>,
    reportIdempotencyKeyUpserts: [] as Array<{
      create: FakeReportIdempotencyKeyCreateInput;
      update: FakeReportIdempotencyKeyUpdateInput;
      where: { key: string };
    }>,
    reportExportJobFindMany: [] as Array<{ orderBy: { createdAt: "desc" } }>,
    reportExportJobFindUnique: [] as Array<{ where: { id: string } }>,
    reportExportJobUpserts: [] as Array<{
      create: FakeReportExportJobCreateInput;
      update: FakeReportExportJobUpdateInput;
      where: { id: string };
    }>,
    savedReportTemplateFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    savedReportTemplateFindUnique: [] as Array<{ where: { id: string } }>,
    savedReportTemplateUpserts: [] as Array<{
      create: FakeSavedReportTemplateCreateInput;
      update: FakeSavedReportTemplateUpdateInput;
      where: { id: string };
    }>,
    transactions: [] as Array<{ isolationLevel?: "Serializable" }>
  };

  return {
    calls,
    seedMetricVersion(row: FakeMetricVersionCreateInput) {
      metricVersions.set(row.id, row);
    },
    client: {
      metricDefinition: {
        findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
          calls.metricDefinitionFindMany.push(input);
          return Promise.resolve(Array.from(metricDefinitions.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          calls.metricDefinitionFindUnique.push(input);
          return Promise.resolve(metricDefinitions.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeMetricDefinitionCreateInput;
          update: FakeMetricDefinitionUpdateInput;
          where: { id: string };
        }) {
          calls.metricDefinitionUpserts.push(input);
          const current = metricDefinitions.get(input.where.id);
          const next: FakeMetricDefinitionCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          metricDefinitions.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      metricVersion: {
        findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
          calls.metricVersionFindMany.push(input);
          return Promise.resolve(Array.from(metricVersions.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          calls.metricVersionFindUnique.push(input);
          return Promise.resolve(metricVersions.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeMetricVersionCreateInput;
          update: FakeMetricVersionUpdateInput;
          where: { id: string };
        }) {
          calls.metricVersionUpserts.push(input);
          const current = metricVersions.get(input.where.id);
          const next: FakeMetricVersionCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          metricVersions.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      metricTenantOverride: {
        findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
          calls.metricTenantOverrideFindMany.push(input);
          return Promise.resolve(Array.from(metricTenantOverrides.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          calls.metricTenantOverrideFindUnique.push(input);
          return Promise.resolve(metricTenantOverrides.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeMetricTenantOverrideCreateInput;
          update: FakeMetricTenantOverrideUpdateInput;
          where: { id: string };
        }) {
          calls.metricTenantOverrideUpserts.push(input);
          const current = metricTenantOverrides.get(input.where.id);
          const next: FakeMetricTenantOverrideCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          metricTenantOverrides.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      reportIdempotencyKey: {
        create(input: { data: FakeReportIdempotencyKeyCreateInput }) {
          calls.reportIdempotencyKeyCreates.push(input);
          if (reportIdempotencyKeys.has(input.data.key)) {
            const error = new Error("Unique constraint failed on the fields: (`key`)") as Error & { code?: string };
            error.code = "P2002";
            return Promise.reject(error);
          }

          reportIdempotencyKeys.set(input.data.key, input.data);
          return Promise.resolve(input.data);
        },
        findUnique(input: { where: { key: string } }) {
          calls.reportIdempotencyKeyFindUnique.push(input);
          return Promise.resolve(reportIdempotencyKeys.get(input.where.key) ?? null);
        },
        upsert(input: {
          create: FakeReportIdempotencyKeyCreateInput;
          update: FakeReportIdempotencyKeyUpdateInput;
          where: { key: string };
        }) {
          calls.reportIdempotencyKeyUpserts.push(input);
          const current = reportIdempotencyKeys.get(input.where.key);
          const next: FakeReportIdempotencyKeyCreateInput = current
            ? { ...current, ...input.update, key: current.key }
            : input.create;
          reportIdempotencyKeys.set(input.where.key, next);
          return Promise.resolve(next);
        }
      },
      reportExportJob: {
        findMany(input: { orderBy: { createdAt: "desc" } }) {
          calls.reportExportJobFindMany.push(input);
          return Promise.resolve(Array.from(reportExportJobs.values())
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          calls.reportExportJobFindUnique.push(input);
          return Promise.resolve(reportExportJobs.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeReportExportJobCreateInput;
          update: FakeReportExportJobUpdateInput;
          where: { id: string };
        }) {
          calls.reportExportJobUpserts.push(input);
          const current = reportExportJobs.get(input.where.id);
          const next: FakeReportExportJobCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          reportExportJobs.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      savedReportTemplate: {
        findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
          calls.savedReportTemplateFindMany.push(input);
          return Promise.resolve(Array.from(savedReportTemplates.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          calls.savedReportTemplateFindUnique.push(input);
          return Promise.resolve(savedReportTemplates.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeSavedReportTemplateCreateInput;
          update: FakeSavedReportTemplateUpdateInput;
          where: { id: string };
        }) {
          calls.savedReportTemplateUpserts.push(input);
          const current = savedReportTemplates.get(input.where.id);
          const next: FakeSavedReportTemplateCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          savedReportTemplates.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      $transaction<T>(callback: (transaction: unknown) => Promise<T>, options?: { isolationLevel?: "Serializable" }) {
        calls.transactions.push({ isolationLevel: options?.isolationLevel });
        return callback(this);
      }
    }
  };
}

interface FakeMetricDefinitionCreateInput {
  createdAt: Date;
  description: string;
  id: string;
  key: string;
  name: string;
  source: string;
  tenantId: string;
  unit: string;
  updatedAt: Date;
}

type FakeMetricDefinitionUpdateInput = Omit<FakeMetricDefinitionCreateInput, "createdAt" | "id">;

interface FakeMetricVersionCreateInput {
  createdAt: Date;
  definitionId: string;
  id: string;
  queryKey: string;
  status: string;
  tenantId: string;
  updatedAt: Date;
  version: string;
}

type FakeMetricVersionUpdateInput = Omit<FakeMetricVersionCreateInput, "createdAt" | "id">;

interface FakeMetricTenantOverrideCreateInput {
  createdAt: Date;
  definitionId: string;
  id: string;
  metricVersionId: string;
  reason: string;
  tenantId: string;
  updatedAt: Date;
}

type FakeMetricTenantOverrideUpdateInput = Omit<FakeMetricTenantOverrideCreateInput, "createdAt" | "id">;

interface FakeReportIdempotencyKeyCreateInput {
  fingerprint: string;
  jobId: string;
  key: string;
}

type FakeReportIdempotencyKeyUpdateInput = Omit<FakeReportIdempotencyKeyCreateInput, "key">;

interface FakeReportExportJobCreateInput {
  auditId: string;
  backendQueueId: string | null;
  columns: string[];
  createdAt: Date;
  deadLetteredAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  fileName: string | null;
  filters: Record<string, unknown>;
  format: string;
  id: string;
  metricDefinitionVersion: string | null;
  name: string;
  period: string;
  progress: number;
  queue: string | null;
  requestedBy: string;
  rows: number;
  status: string;
  statusKey: string;
}

type FakeReportExportJobUpdateInput = Omit<FakeReportExportJobCreateInput, "createdAt" | "id">;

interface FakeSavedReportTemplateCreateInput {
  columns: string[];
  createdAt: Date;
  filters: Record<string, unknown>;
  id: string;
  name: string;
  ownerUserId: string;
  reportType: string;
  tenantId: string;
  updatedAt: Date;
  visibilityPermissions: string[];
  visibilityRoles: string[];
  visibilityScope: string;
}

type FakeSavedReportTemplateUpdateInput = Omit<FakeSavedReportTemplateCreateInput, "createdAt" | "id">;

function reportExportJob(overrides: Partial<ReportExportJob> = {}): ReportExportJob {
  return {
    auditId: "evt_report_prisma_export",
    backendQueueId: "report_prisma_export",
    columns: ["metric", "today"],
    createdAt: "2026-06-30T15:00:00.000Z",
    filters: {
      periodKey: "2026-07-01",
      scheduleId: "digest-volga-daily",
      tenantId: "tenant-volga"
    },
    format: "XLSX",
    id: "export-prisma-first",
    metricDefinitionVersion: "metrics/v1",
    name: "daily_support_digest: all",
    period: "2026-07-01",
    progress: 8,
    queue: "report-export",
    requestedBy: "current-operator",
    rows: 0,
    status: "Queued",
    statusKey: "queued",
    ...overrides
  };
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, value]) => row[key] === value);
}
