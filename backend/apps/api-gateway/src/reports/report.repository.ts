import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import type { ReportExportJob } from "./report.fixtures.js";

export interface ReportIdempotencyRecord {
  fingerprint: string;
  jobId: string;
  key: string;
}

export type ReportExportJobIdempotencyWriteResult =
  | { idempotencyKey: ReportIdempotencyRecord; job: ReportExportJob; status: "created" | "duplicate" }
  | { idempotencyKey: ReportIdempotencyRecord; status: "conflict" };

export interface MetricDefinitionRecord {
  createdAt: string;
  description: string;
  id: string;
  key: string;
  name: string;
  source: string;
  tenantId: string;
  unit: string;
  updatedAt: string;
}

export interface MetricDefinitionFilters {
  key?: string;
  tenantId?: string;
}

export type MetricVersionStatus = "active" | "draft" | "retired";

export interface MetricVersionRecord {
  createdAt: string;
  definitionId: string;
  id: string;
  queryKey: string;
  status: MetricVersionStatus;
  tenantId: string;
  updatedAt: string;
  version: string;
}

export interface MetricVersionFilters {
  definitionId?: string;
  tenantId?: string;
}

export interface MetricTenantOverrideRecord {
  createdAt: string;
  definitionId: string;
  id: string;
  metricVersionId: string;
  reason: string;
  tenantId: string;
  updatedAt: string;
}

export interface MetricTenantOverrideFilters {
  definitionId?: string;
  tenantId?: string;
}

export type ReportQueryExecutionStatus = "completed" | "failed" | "running";

export interface ReportQueryExecutionRecord {
  failureEnvelope?: {
    code: string;
    message: string;
  };
  id: string;
  metricKey: string;
  parameters?: Record<string, unknown>;
  status: ReportQueryExecutionStatus;
}

export interface ReportFileDescriptorRecord {
  checksum: string;
  contentType: string;
  createdAt: string;
  fileName: string;
  format: string;
  id: string;
  jobId: string;
  metricDefinitionVersion: string;
  objectKey: string;
  sizeBytes: number;
  tenantId: string;
  writtenAt: string;
}

export interface ReportNotificationDescriptorRecord {
  createdAt: string;
  eventType: "export.ready";
  exportJobId: string;
  id: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status: "queued";
  tenantId: string;
}

export interface SavedReportTemplateRecord {
  columns: string[];
  createdAt: string;
  filters: Record<string, unknown>;
  id: string;
  name: string;
  ownerUserId: string;
  reportType: string;
  tenantId: string;
  updatedAt: string;
  visibility: SavedReportTemplateVisibility;
}

export type SavedReportTemplateVisibilityScope = "private" | "roles" | "permissions";

export interface SavedReportTemplateVisibility {
  permissions?: string[];
  roles?: string[];
  scope: SavedReportTemplateVisibilityScope;
}

export interface SavedReportTemplateFilters {
  requesterPermissions?: string[];
  requesterRoles?: string[];
  requesterUserId?: string;
  tenantId?: string;
}

export type ScheduledDigestStatus = "due" | "running" | "completed" | "failed";

export interface ScheduledDigestDescriptorRecord {
  createdAt: string;
  dueAt: string;
  id: string;
  periodKey: string;
  reportType: string;
  scheduleId: string;
  status: ScheduledDigestStatus;
  tenantId: string;
  updatedAt: string;
}

export interface ScheduledDigestDescriptorFilters {
  dueBefore?: string;
  status?: ScheduledDigestStatus;
  tenantId?: string;
}

export interface ExportRetryAuditEvent {
  action: "report.export.retry";
  at: string;
  auditId: string;
  backendQueueId: string;
  format: string;
  immutable: true;
  jobId: string;
  metricDefinitionVersion: string;
  nextStatusKey: string;
  previousStatusKey: string;
  queue: string;
  reasonCode: "operator_requested";
}

export interface ReportState {
  exportRetryAuditEvents: ExportRetryAuditEvent[];
  exportJobs: ReportExportJob[];
  idempotencyKeys: ReportIdempotencyRecord[];
  metricDefinitions: MetricDefinitionRecord[];
  metricTenantOverrides: MetricTenantOverrideRecord[];
  metricVersions: MetricVersionRecord[];
  reportFileDescriptors: ReportFileDescriptorRecord[];
  reportNotificationDescriptors: ReportNotificationDescriptorRecord[];
  reportQueryExecutions: ReportQueryExecutionRecord[];
  savedReportTemplates: SavedReportTemplateRecord[];
  scheduledDigestDescriptors: ScheduledDigestDescriptorRecord[];
}

interface ReportRepositoryOptions {
  filePath: string;
}

export interface PrismaReportRepositoryOptions {
  client: PrismaReportClient;
}

type MaybePromise<T> = T | Promise<T>;

interface PrismaReportDataClient {
  metricDefinition: {
    findMany(input: { orderBy: { updatedAt: "desc" }; where?: PrismaMetricDefinitionWhereInput }): Promise<PrismaMetricDefinitionRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaMetricDefinitionRow | null>;
    upsert(input: {
      create: PrismaMetricDefinitionCreateInput;
      update: PrismaMetricDefinitionUpdateInput;
      where: { id: string };
    }): Promise<PrismaMetricDefinitionRow>;
  };
  metricVersion: {
    findMany(input: { orderBy: { updatedAt: "desc" }; where?: PrismaMetricVersionWhereInput }): Promise<PrismaMetricVersionRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaMetricVersionRow | null>;
    upsert(input: {
      create: PrismaMetricVersionCreateInput;
      update: PrismaMetricVersionUpdateInput;
      where: { id: string };
    }): Promise<PrismaMetricVersionRow>;
  };
  metricTenantOverride: {
    findMany(input: { orderBy: { updatedAt: "desc" }; where?: PrismaMetricTenantOverrideWhereInput }): Promise<PrismaMetricTenantOverrideRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaMetricTenantOverrideRow | null>;
    upsert(input: {
      create: PrismaMetricTenantOverrideCreateInput;
      update: PrismaMetricTenantOverrideUpdateInput;
      where: { id: string };
    }): Promise<PrismaMetricTenantOverrideRow>;
  };
  reportIdempotencyKey: {
    create(input: { data: PrismaReportIdempotencyKeyCreateInput }): Promise<PrismaReportIdempotencyKeyRow>;
    findUnique(input: { where: { key: string } }): Promise<PrismaReportIdempotencyKeyRow | null>;
    upsert(input: {
      create: PrismaReportIdempotencyKeyCreateInput;
      update: PrismaReportIdempotencyKeyUpdateInput;
      where: { key: string };
    }): Promise<PrismaReportIdempotencyKeyRow>;
  };
  reportExportJob: {
    findMany(input: { orderBy: { createdAt: "desc" } }): Promise<PrismaReportExportJobRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaReportExportJobRow | null>;
    upsert(input: {
      create: PrismaReportExportJobCreateInput;
      update: PrismaReportExportJobUpdateInput;
      where: { id: string };
    }): Promise<PrismaReportExportJobRow>;
  };
  savedReportTemplate: {
    findMany(input: { orderBy: { updatedAt: "desc" }; where?: PrismaSavedReportTemplateWhereInput }): Promise<PrismaSavedReportTemplateRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaSavedReportTemplateRow | null>;
    upsert(input: {
      create: PrismaSavedReportTemplateCreateInput;
      update: PrismaSavedReportTemplateUpdateInput;
      where: { id: string };
    }): Promise<PrismaSavedReportTemplateRow>;
  };
}

export interface PrismaReportClient extends PrismaReportDataClient {
  $transaction<T>(callback: (transaction: PrismaReportDataClient) => Promise<T>, options?: { isolationLevel?: "Serializable" }): Promise<T>;
}

interface PrismaMetricDefinitionWhereInput {
  key?: string;
  tenantId?: string;
}

interface PrismaMetricDefinitionRow {
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

interface PrismaMetricDefinitionCreateInput extends PrismaMetricDefinitionRow {}

type PrismaMetricDefinitionUpdateInput = Omit<PrismaMetricDefinitionCreateInput, "createdAt" | "id">;

interface PrismaMetricVersionWhereInput {
  definitionId?: string;
  tenantId?: string;
}

interface PrismaMetricVersionRow {
  createdAt: Date;
  definitionId: string;
  id: string;
  queryKey: string;
  status: string;
  tenantId: string;
  updatedAt: Date;
  version: string;
}

interface PrismaMetricVersionCreateInput extends PrismaMetricVersionRow {}

type PrismaMetricVersionUpdateInput = Omit<PrismaMetricVersionCreateInput, "createdAt" | "id">;

interface PrismaMetricTenantOverrideWhereInput {
  definitionId?: string;
  tenantId?: string;
}

interface PrismaMetricTenantOverrideRow {
  createdAt: Date;
  definitionId: string;
  id: string;
  metricVersionId: string;
  reason: string;
  tenantId: string;
  updatedAt: Date;
}

interface PrismaMetricTenantOverrideCreateInput extends PrismaMetricTenantOverrideRow {}

type PrismaMetricTenantOverrideUpdateInput = Omit<PrismaMetricTenantOverrideCreateInput, "createdAt" | "id">;

interface PrismaReportIdempotencyKeyRow {
  fingerprint: string;
  jobId: string;
  key: string;
}

interface PrismaReportIdempotencyKeyCreateInput extends PrismaReportIdempotencyKeyRow {}

type PrismaReportIdempotencyKeyUpdateInput = Omit<PrismaReportIdempotencyKeyCreateInput, "key">;

interface PrismaReportExportJobRow {
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

interface PrismaReportExportJobCreateInput extends PrismaReportExportJobRow {}

type PrismaReportExportJobUpdateInput = Omit<PrismaReportExportJobCreateInput, "createdAt" | "id">;

interface PrismaSavedReportTemplateWhereInput {
  tenantId?: string;
}

interface PrismaSavedReportTemplateRow {
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

interface PrismaSavedReportTemplateCreateInput extends PrismaSavedReportTemplateRow {}

type PrismaSavedReportTemplateUpdateInput = Omit<PrismaSavedReportTemplateCreateInput, "createdAt" | "id">;

let defaultRepository: ReportRepository | null = null;

export class ReportRepository {
  private constructor(
    private readonly store: DurableStore<ReportState>,
    private readonly prismaClient?: PrismaReportClient
  ) {}

  static default(): ReportRepository {
    return defaultRepository ?? ReportRepository.inMemory();
  }

  static useDefault(repository: ReportRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: ReportState = seedReportState()): ReportRepository {
    return new ReportRepository(new InMemoryStore(seed));
  }

  static open({ filePath }: ReportRepositoryOptions): ReportRepository {
    return new ReportRepository(new JsonFileStore({ filePath, seed: seedReportState() }));
  }

  static prisma({ client }: PrismaReportRepositoryOptions): ReportRepository {
    assertCompletePrismaReportClient(client);
    return new ReportRepository(new InMemoryStore(seedReportState()), client);
  }

  readState(): ReportState {
    return normalizeState(this.store.read());
  }

  saveState(state: ReportState): ReportState {
    const current = this.readState();
    return this.store.write(normalizeState({
      ...state,
      exportRetryAuditEvents: [...current.exportRetryAuditEvents, ...(state.exportRetryAuditEvents ?? [])]
    }));
  }

  listExportJobs(): ReportExportJob[] {
    if (this.prismaClient) {
      throw new Error("prisma_report_export_jobs_async_required");
    }

    return clone(this.readState().exportJobs);
  }

  async listExportJobsAsync(): Promise<ReportExportJob[]> {
    if (this.prismaClient) {
      const rows = await this.prismaClient.reportExportJob.findMany({ orderBy: { createdAt: "desc" } });
      return rows.map(toReportExportJob);
    }

    return this.listExportJobs();
  }

  listMetricDefinitions(filters: MetricDefinitionFilters = {}): MaybePromise<MetricDefinitionRecord[]> {
    if (this.prismaClient) {
      return this.prismaClient.metricDefinition.findMany({
        orderBy: { updatedAt: "desc" },
        ...(filters.tenantId || filters.key ? { where: metricDefinitionWhere(filters) } : {})
      }).then((rows) => rows.map(toMetricDefinitionRecord));
    }

    return clone(this.readState().metricDefinitions.filter((metric) => isMetricDefinitionInScope(metric, filters)));
  }

  findMetricDefinition(metricId: string, filters: MetricDefinitionFilters = {}): MaybePromise<MetricDefinitionRecord | undefined> {
    if (this.prismaClient) {
      return this.prismaClient.metricDefinition.findUnique({ where: { id: metricId } })
        .then((row) => {
          const metric = row ? toMetricDefinitionRecord(row) : undefined;
          return metric && isMetricDefinitionInScope(metric, filters) ? metric : undefined;
        });
    }

    return clone(this.readState().metricDefinitions.find((metric) => metric.id === metricId && isMetricDefinitionInScope(metric, filters)));
  }

  listMetricVersions(filters: MetricVersionFilters = {}): MaybePromise<MetricVersionRecord[]> {
    if (this.prismaClient) {
      return this.prismaClient.metricVersion.findMany({
        orderBy: { updatedAt: "desc" },
        ...(filters.tenantId || filters.definitionId ? { where: metricVersionWhere(filters) } : {})
      }).then((rows) => rows.map(toMetricVersionRecord));
    }

    return clone(this.readState().metricVersions.filter((version) => isMetricVersionInScope(version, filters)));
  }

  findMetricVersion(versionId: string, filters: MetricVersionFilters = {}): MaybePromise<MetricVersionRecord | undefined> {
    if (this.prismaClient) {
      return this.prismaClient.metricVersion.findUnique({ where: { id: versionId } })
        .then((row) => {
          const version = row ? toMetricVersionRecord(row) : undefined;
          return version && isMetricVersionInScope(version, filters) ? version : undefined;
        });
    }

    return clone(this.readState().metricVersions.find((version) => version.id === versionId && isMetricVersionInScope(version, filters)));
  }

  findActiveMetricVersion(tenantId: string, definitionId: string): MaybePromise<MetricVersionRecord | undefined> {
    const versions = this.listMetricVersions({ definitionId, tenantId });
    if (isPromiseLike(versions)) {
      return versions.then(selectLatestActiveMetricVersion);
    }

    return selectLatestActiveMetricVersion(versions);
  }

  async resolveMetricVersion(tenantId: string, definitionId: string): Promise<MetricVersionRecord | undefined> {
    const overrides = await this.listMetricTenantOverrides({ definitionId, tenantId });
    const override = selectLatestMetricTenantOverride(overrides);
    if (override) {
      const overrideVersion = await this.findMetricVersion(override.metricVersionId, { tenantId });
      if (overrideVersion) {
        return overrideVersion;
      }
    }

    return this.findActiveMetricVersion(tenantId, definitionId);
  }

  listMetricTenantOverrides(filters: MetricTenantOverrideFilters = {}): MaybePromise<MetricTenantOverrideRecord[]> {
    if (this.prismaClient) {
      return this.prismaClient.metricTenantOverride.findMany({
        orderBy: { updatedAt: "desc" },
        ...(filters.tenantId || filters.definitionId ? { where: metricTenantOverrideWhere(filters) } : {})
      }).then((rows) => rows.map(toMetricTenantOverrideRecord));
    }

    return clone(this.readState().metricTenantOverrides.filter((override) => isMetricTenantOverrideInScope(override, filters)));
  }

  listReportQueryExecutions(): ReportQueryExecutionRecord[] {
    return clone(this.readState().reportQueryExecutions);
  }

  listReportFileDescriptors(): ReportFileDescriptorRecord[] {
    return clone(this.readState().reportFileDescriptors);
  }

  listReportNotificationDescriptors(): ReportNotificationDescriptorRecord[] {
    return clone(this.readState().reportNotificationDescriptors);
  }

  findReportFileDescriptor(jobId: string): ReportFileDescriptorRecord | undefined {
    return clone(this.readState().reportFileDescriptors.find((descriptor) => descriptor.jobId === jobId));
  }

  listSavedReportTemplates(filters: SavedReportTemplateFilters = {}): MaybePromise<SavedReportTemplateRecord[]> {
    if (this.prismaClient) {
      return this.prismaClient.savedReportTemplate.findMany({
        orderBy: { updatedAt: "desc" },
        ...(filters.tenantId ? { where: savedReportTemplateWhere(filters) } : {})
      }).then((rows) => rows
        .map(toSavedReportTemplateRecord)
        .filter((template) => isSavedReportTemplateInScope(template, filters)));
    }

    return clone(this.readState().savedReportTemplates.filter((template) => isSavedReportTemplateInScope(template, filters)));
  }

  findSavedReportTemplate(templateId: string, filters: SavedReportTemplateFilters = {}): MaybePromise<SavedReportTemplateRecord | undefined> {
    if (this.prismaClient) {
      return this.prismaClient.savedReportTemplate.findUnique({ where: { id: templateId } })
        .then((row) => {
          const template = row ? toSavedReportTemplateRecord(row) : undefined;
          return template && isSavedReportTemplateInScope(template, filters) ? template : undefined;
        });
    }

    return clone(this.readState().savedReportTemplates.find((template) => template.id === templateId && isSavedReportTemplateInScope(template, filters)));
  }

  listScheduledDigestDescriptors(filters: ScheduledDigestDescriptorFilters = {}): ScheduledDigestDescriptorRecord[] {
    return clone(this.readState().scheduledDigestDescriptors.filter((descriptor) => isScheduledDigestDescriptorInScope(descriptor, filters))
      .sort(compareScheduledDigestDescriptors));
  }

  findScheduledDigestDescriptor(descriptorId: string, filters: ScheduledDigestDescriptorFilters = {}): ScheduledDigestDescriptorRecord | undefined {
    return clone(this.readState().scheduledDigestDescriptors.find((descriptor) => descriptor.id === descriptorId && isScheduledDigestDescriptorInScope(descriptor, filters)));
  }

  deleteReportFileDescriptor(jobId: string): void {
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        reportFileDescriptors: current.reportFileDescriptors.filter((descriptor) => descriptor.jobId !== jobId)
      };
    });
  }

  findMetricTenantOverride(overrideId: string, filters: MetricTenantOverrideFilters = {}): MaybePromise<MetricTenantOverrideRecord | undefined> {
    if (this.prismaClient) {
      return this.prismaClient.metricTenantOverride.findUnique({ where: { id: overrideId } })
        .then((row) => {
          const override = row ? toMetricTenantOverrideRecord(row) : undefined;
          return override && isMetricTenantOverrideInScope(override, filters) ? override : undefined;
        });
    }

    return clone(this.readState().metricTenantOverrides.find((override) => override.id === overrideId && isMetricTenantOverrideInScope(override, filters)));
  }

  saveExportJob(job: ReportExportJob): ReportExportJob {
    const persisted = clone(job);
    if (this.prismaClient) {
      throw new Error("prisma_report_export_jobs_async_required");
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.exportJobs.some((item) => item.id === persisted.id);

      return {
        ...current,
        exportJobs: exists
          ? current.exportJobs.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.exportJobs]
      };
    });

    return clone(persisted);
  }

  async saveExportJobAsync(job: ReportExportJob): Promise<ReportExportJob> {
    if (this.prismaClient) {
      const create = toPrismaReportExportJobCreateInput(job);
      const row = await this.prismaClient.reportExportJob.upsert({
        create,
        update: toPrismaReportExportJobUpdateInput(create),
        where: { id: create.id }
      });
      return toReportExportJob(row);
    }

    return this.saveExportJob(job);
  }

  saveExportJobWithIdempotency(job: ReportExportJob, idempotencyKey: ReportIdempotencyRecord): MaybePromise<ReportExportJobIdempotencyWriteResult> {
    const persistedJob = clone(job);
    const persistedKey = clone(idempotencyKey);
    let result: ReportExportJobIdempotencyWriteResult | undefined;

    if (this.prismaClient) {
      return this.savePrismaExportJobWithIdempotency(persistedJob, persistedKey);
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const existingKey = current.idempotencyKeys.find((item) => item.key === persistedKey.key);

      if (existingKey && existingKey.fingerprint !== persistedKey.fingerprint) {
        result = {
          idempotencyKey: clone(existingKey),
          status: "conflict"
        };
        return current;
      }

      if (existingKey) {
        const existingJob = current.exportJobs.find((item) => item.id === existingKey.jobId);
        if (existingJob) {
          result = {
            idempotencyKey: clone(existingKey),
            job: clone(existingJob),
            status: "duplicate"
          };
          return current;
        }
      }

      result = {
        idempotencyKey: persistedKey,
        job: persistedJob,
        status: "created"
      };
      return {
        ...current,
        exportJobs: [persistedJob, ...current.exportJobs.filter((item) => item.id !== persistedJob.id)],
        idempotencyKeys: existingKey
          ? current.idempotencyKeys.map((item) => item.key === persistedKey.key ? persistedKey : item)
          : [...current.idempotencyKeys, persistedKey]
      };
    });

    return clone(result!);
  }

  saveRetriedExportJob(job: ReportExportJob, auditEvent: ExportRetryAuditEvent): { auditEvent: ExportRetryAuditEvent; job: ReportExportJob } {
    const persistedJob = clone(job);
    const persistedAuditEvent = clone(auditEvent);
    if (this.prismaClient) {
      throw new Error("prisma_report_export_jobs_async_required");
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.exportJobs.some((item) => item.id === persistedJob.id);

      return {
        ...current,
        exportJobs: exists
          ? current.exportJobs.map((item) => item.id === persistedJob.id ? persistedJob : item)
          : [persistedJob, ...current.exportJobs],
        exportRetryAuditEvents: [...current.exportRetryAuditEvents, persistedAuditEvent]
      };
    });

    return {
      auditEvent: clone(persistedAuditEvent),
      job: clone(persistedJob)
    };
  }

  async saveRetriedExportJobAsync(job: ReportExportJob, auditEvent: ExportRetryAuditEvent): Promise<{ auditEvent: ExportRetryAuditEvent; job: ReportExportJob }> {
    if (this.prismaClient) {
      const persistedJob = await this.saveExportJobAsync(job);
      const persistedAuditEvent = clone(auditEvent);
      this.store.update((state) => {
        const current = normalizeState(state);

        return {
          ...current,
          exportRetryAuditEvents: [...current.exportRetryAuditEvents, persistedAuditEvent]
        };
      });

      return {
        auditEvent: clone(persistedAuditEvent),
        job: persistedJob
      };
    }

    return this.saveRetriedExportJob(job, auditEvent);
  }

  findIdempotencyKey(key: string): MaybePromise<ReportIdempotencyRecord | undefined> {
    if (this.prismaClient) {
      return this.prismaClient.reportIdempotencyKey.findUnique({ where: { key } })
        .then((row) => row ? toReportIdempotencyRecord(row) : undefined);
    }

    return clone(this.readState().idempotencyKeys.find((item) => item.key === key));
  }

  saveIdempotencyKey(record: ReportIdempotencyRecord): MaybePromise<ReportIdempotencyRecord> {
    const persisted = clone(record);
    if (this.prismaClient) {
      return this.prismaClient.reportIdempotencyKey.upsert({
        create: toPrismaReportIdempotencyKeyCreateInput(persisted),
        update: toPrismaReportIdempotencyKeyUpdateInput(persisted),
        where: { key: persisted.key }
      }).then(toReportIdempotencyRecord);
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.idempotencyKeys.some((item) => item.key === persisted.key);

      return {
        ...current,
        idempotencyKeys: exists
          ? current.idempotencyKeys.map((item) => item.key === persisted.key ? persisted : item)
          : [...current.idempotencyKeys, persisted]
      };
    });

    return clone(persisted);
  }

  saveMetricDefinition(metric: MetricDefinitionRecord): MaybePromise<MetricDefinitionRecord> {
    const persisted = normalizeMetricDefinition(metric);
    if (this.prismaClient) {
      const create = toPrismaMetricDefinitionCreateInput(persisted);
      return this.prismaClient.metricDefinition.upsert({
        create,
        update: toPrismaMetricDefinitionUpdateInput(create),
        where: { id: persisted.id }
      }).then(toMetricDefinitionRecord);
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.metricDefinitions.some((item) => item.id === persisted.id);

      return {
        ...current,
        metricDefinitions: exists
          ? current.metricDefinitions.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.metricDefinitions, persisted]
      };
    });

    return clone(persisted);
  }

  saveMetricVersion(version: MetricVersionRecord): MaybePromise<MetricVersionRecord> {
    const persisted = normalizeMetricVersion(version);
    if (this.prismaClient) {
      const create = toPrismaMetricVersionCreateInput(persisted);
      return this.prismaClient.metricVersion.upsert({
        create,
        update: toPrismaMetricVersionUpdateInput(create),
        where: { id: persisted.id }
      }).then(toMetricVersionRecord);
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.metricVersions.some((item) => item.id === persisted.id);

      return {
        ...current,
        metricVersions: exists
          ? current.metricVersions.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.metricVersions, persisted]
      };
    });

    return clone(persisted);
  }

  saveMetricTenantOverride(override: MetricTenantOverrideRecord): MaybePromise<MetricTenantOverrideRecord> {
    const persisted = normalizeMetricTenantOverride(override);
    if (this.prismaClient) {
      const create = toPrismaMetricTenantOverrideCreateInput(persisted);
      return this.prismaClient.metricTenantOverride.upsert({
        create,
        update: toPrismaMetricTenantOverrideUpdateInput(create),
        where: { id: persisted.id }
      }).then(toMetricTenantOverrideRecord);
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.metricTenantOverrides.some((item) => item.id === persisted.id);

      return {
        ...current,
        metricTenantOverrides: exists
          ? current.metricTenantOverrides.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.metricTenantOverrides, persisted]
      };
    });

    return clone(persisted);
  }

  saveReportQueryExecution(execution: ReportQueryExecutionRecord): ReportQueryExecutionRecord {
    const persisted = normalizeReportQueryExecution(execution);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.reportQueryExecutions.some((item) => item.id === persisted.id);

      return {
        ...current,
        reportQueryExecutions: exists
          ? current.reportQueryExecutions.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.reportQueryExecutions, persisted]
      };
    });

    return clone(persisted);
  }

  saveReportFileDescriptor(descriptor: ReportFileDescriptorRecord): ReportFileDescriptorRecord {
    const persisted = normalizeReportFileDescriptor(descriptor);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.reportFileDescriptors.some((item) => item.jobId === persisted.jobId);

      return {
        ...current,
        reportFileDescriptors: exists
          ? current.reportFileDescriptors.map((item) => item.jobId === persisted.jobId ? persisted : item)
          : [...current.reportFileDescriptors, persisted]
      };
    });

    return clone(persisted);
  }

  saveSavedReportTemplate(template: SavedReportTemplateRecord): MaybePromise<SavedReportTemplateRecord> {
    const persisted = normalizeSavedReportTemplate(template);
    if (this.prismaClient) {
      const create = toPrismaSavedReportTemplateCreateInput(persisted);
      return this.prismaClient.savedReportTemplate.upsert({
        create,
        update: toPrismaSavedReportTemplateUpdateInput(create),
        where: { id: persisted.id }
      }).then(toSavedReportTemplateRecord);
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.savedReportTemplates.some((item) => item.id === persisted.id);

      return {
        ...current,
        savedReportTemplates: exists
          ? current.savedReportTemplates.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.savedReportTemplates, persisted]
      };
    });

    return clone(persisted);
  }

  saveReportNotificationDescriptor(descriptor: ReportNotificationDescriptorRecord): ReportNotificationDescriptorRecord {
    const persisted = normalizeReportNotificationDescriptor(descriptor);
    const currentState = this.readState();
    const existing = currentState.reportNotificationDescriptors.find((item) => item.idempotencyKey === persisted.idempotencyKey);
    if (existing) {
      return clone(existing);
    }

    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        reportNotificationDescriptors: [...current.reportNotificationDescriptors, persisted]
      };
    });

    return clone(persisted);
  }

  saveScheduledDigestDescriptor(descriptor: ScheduledDigestDescriptorRecord): ScheduledDigestDescriptorRecord {
    const persisted = normalizeScheduledDigestDescriptor(descriptor);
    const currentState = this.readState();
    const existingById = currentState.scheduledDigestDescriptors.find((item) => item.id === persisted.id);
    if (existingById && !isDuplicateScheduledDigestPeriodReplay(existingById, persisted)) {
      throw new Error("scheduled_digest_period_conflict");
    }

    if (!existingById) {
      const existingPeriodDescriptor = currentState.scheduledDigestDescriptors.find((item) => isSameScheduledDigestPeriod(item, persisted));
      if (existingPeriodDescriptor) {
        if (!isDuplicateScheduledDigestPeriodReplay(existingPeriodDescriptor, persisted)) {
          throw new Error("scheduled_digest_period_conflict");
        }

        return clone(existingPeriodDescriptor);
      }
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.scheduledDigestDescriptors.some((item) => item.id === persisted.id);

      return {
        ...current,
        scheduledDigestDescriptors: exists
          ? current.scheduledDigestDescriptors.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.scheduledDigestDescriptors, persisted]
      };
    });

    return clone(persisted);
  }

  private async savePrismaExportJobWithIdempotency(job: ReportExportJob, idempotencyKey: ReportIdempotencyRecord): Promise<ReportExportJobIdempotencyWriteResult> {
    const client = this.prismaClient!;
    try {
      return await client.$transaction(async (transaction) => {
        const existingKey = await transaction.reportIdempotencyKey.findUnique({ where: { key: idempotencyKey.key } });
        if (existingKey) {
          return resolvePrismaExportIdempotency(transaction, toReportIdempotencyRecord(existingKey), idempotencyKey.fingerprint);
        }

        const createJob = toPrismaReportExportJobCreateInput(job);
        const row = await transaction.reportExportJob.upsert({
          create: createJob,
          update: toPrismaReportExportJobUpdateInput(createJob),
          where: { id: createJob.id }
        });
        const keyRow = await transaction.reportIdempotencyKey.create({
          data: toPrismaReportIdempotencyKeyCreateInput(idempotencyKey)
        });

        return {
          idempotencyKey: toReportIdempotencyRecord(keyRow),
          job: toReportExportJob(row),
          status: "created"
        };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existingKey = await client.reportIdempotencyKey.findUnique({ where: { key: idempotencyKey.key } });
      if (!existingKey) {
        throw error;
      }

      return resolvePrismaExportIdempotency(client, toReportIdempotencyRecord(existingKey), idempotencyKey.fingerprint);
    }
  }
}

function seedReportState(): ReportState {
  return {
    exportRetryAuditEvents: [],
    exportJobs: [],
    idempotencyKeys: [],
    metricDefinitions: [],
    metricTenantOverrides: [],
    metricVersions: [],
    reportFileDescriptors: [],
    reportNotificationDescriptors: [],
    reportQueryExecutions: [],
    savedReportTemplates: [],
    scheduledDigestDescriptors: []
  };
}

async function resolvePrismaExportIdempotency(client: PrismaReportDataClient, existingKey: ReportIdempotencyRecord, requestedFingerprint: string): Promise<ReportExportJobIdempotencyWriteResult> {
  if (existingKey.fingerprint !== requestedFingerprint) {
    return {
      idempotencyKey: clone(existingKey),
      status: "conflict"
    };
  }

  const existingJob = await client.reportExportJob.findUnique({ where: { id: existingKey.jobId } });
  if (!existingJob) {
    return {
      idempotencyKey: clone(existingKey),
      status: "conflict"
    };
  }

  return {
    idempotencyKey: clone(existingKey),
    job: toReportExportJob(existingJob),
    status: "duplicate"
  };
}

function assertCompletePrismaReportClient(client: PrismaReportClient): void {
  if (!client.metricDefinition) {
    throw new Error("prisma_report_metric_definition_delegate_required");
  }

  if (!client.metricVersion) {
    throw new Error("prisma_report_metric_version_delegate_required");
  }

  if (!client.metricTenantOverride) {
    throw new Error("prisma_report_metric_tenant_override_delegate_required");
  }

  if (!client.savedReportTemplate) {
    throw new Error("prisma_report_saved_template_delegate_required");
  }

  if (!client.reportIdempotencyKey) {
    throw new Error("prisma_report_idempotency_delegate_required");
  }

  if (!client.reportExportJob) {
    throw new Error("prisma_report_export_job_delegate_required");
  }

  if (!client.$transaction) {
    throw new Error("prisma_report_transaction_required");
  }
}

function normalizeState(state: Partial<ReportState>): ReportState {
  return {
    exportRetryAuditEvents: state.exportRetryAuditEvents ?? [],
    exportJobs: state.exportJobs ?? [],
    idempotencyKeys: state.idempotencyKeys ?? [],
    metricDefinitions: (state.metricDefinitions ?? []).map(normalizeMetricDefinition),
    metricTenantOverrides: (state.metricTenantOverrides ?? []).map(normalizeMetricTenantOverride),
    metricVersions: (state.metricVersions ?? []).map(normalizeMetricVersion),
    reportFileDescriptors: (state.reportFileDescriptors ?? []).map(normalizeReportFileDescriptor),
    reportNotificationDescriptors: (state.reportNotificationDescriptors ?? []).map(normalizeReportNotificationDescriptor),
    reportQueryExecutions: (state.reportQueryExecutions ?? []).map(normalizeReportQueryExecution),
    savedReportTemplates: (state.savedReportTemplates ?? []).map(normalizeSavedReportTemplate),
    scheduledDigestDescriptors: (state.scheduledDigestDescriptors ?? []).map(normalizeScheduledDigestDescriptor)
  };
}

function isMetricDefinitionInScope(metric: MetricDefinitionRecord, filters: MetricDefinitionFilters): boolean {
  return (!filters.tenantId || metric.tenantId === filters.tenantId)
    && (!filters.key || metric.key === filters.key);
}

function normalizeMetricDefinition(metric: MetricDefinitionRecord): MetricDefinitionRecord {
  const key = requireNonEmpty(metric.key, "metric_definition_key_required");
  return {
    createdAt: metric.createdAt,
    description: metric.description.trim(),
    id: metric.id,
    key,
    name: metric.name.trim(),
    source: metric.source.trim(),
    tenantId: metric.tenantId,
    unit: metric.unit.trim(),
    updatedAt: metric.updatedAt
  };
}

function metricDefinitionWhere(filters: MetricDefinitionFilters): PrismaMetricDefinitionWhereInput {
  return {
    ...(filters.key ? { key: filters.key } : {}),
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {})
  };
}

function toPrismaMetricDefinitionCreateInput(metric: MetricDefinitionRecord): PrismaMetricDefinitionCreateInput {
  return {
    createdAt: new Date(metric.createdAt),
    description: metric.description,
    id: metric.id,
    key: metric.key,
    name: metric.name,
    source: metric.source,
    tenantId: metric.tenantId,
    unit: metric.unit,
    updatedAt: new Date(metric.updatedAt)
  };
}

function toPrismaMetricDefinitionUpdateInput(create: PrismaMetricDefinitionCreateInput): PrismaMetricDefinitionUpdateInput {
  return {
    description: create.description,
    key: create.key,
    name: create.name,
    source: create.source,
    tenantId: create.tenantId,
    unit: create.unit,
    updatedAt: create.updatedAt
  };
}

function toMetricDefinitionRecord(row: PrismaMetricDefinitionRow): MetricDefinitionRecord {
  return {
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    id: row.id,
    key: row.key,
    name: row.name,
    source: row.source,
    tenantId: row.tenantId,
    unit: row.unit,
    updatedAt: row.updatedAt.toISOString()
  };
}

function isMetricVersionInScope(version: MetricVersionRecord, filters: MetricVersionFilters): boolean {
  return (!filters.tenantId || version.tenantId === filters.tenantId)
    && (!filters.definitionId || version.definitionId === filters.definitionId);
}

function normalizeMetricVersion(version: MetricVersionRecord): MetricVersionRecord {
  const queryKey = requireNonEmpty(version.queryKey, "metric_version_query_key_required");
  return {
    createdAt: version.createdAt,
    definitionId: version.definitionId,
    id: version.id,
    queryKey,
    status: parseMetricVersionStatus(version.status),
    tenantId: version.tenantId,
    updatedAt: version.updatedAt,
    version: version.version.trim()
  };
}

function metricVersionWhere(filters: MetricVersionFilters): PrismaMetricVersionWhereInput {
  return {
    ...(filters.definitionId ? { definitionId: filters.definitionId } : {}),
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {})
  };
}

function toPrismaMetricVersionCreateInput(version: MetricVersionRecord): PrismaMetricVersionCreateInput {
  return {
    createdAt: new Date(version.createdAt),
    definitionId: version.definitionId,
    id: version.id,
    queryKey: version.queryKey,
    status: version.status,
    tenantId: version.tenantId,
    updatedAt: new Date(version.updatedAt),
    version: version.version
  };
}

function toPrismaMetricVersionUpdateInput(create: PrismaMetricVersionCreateInput): PrismaMetricVersionUpdateInput {
  return {
    definitionId: create.definitionId,
    queryKey: create.queryKey,
    status: create.status,
    tenantId: create.tenantId,
    updatedAt: create.updatedAt,
    version: create.version
  };
}

function toMetricVersionRecord(row: PrismaMetricVersionRow): MetricVersionRecord {
  return {
    createdAt: row.createdAt.toISOString(),
    definitionId: row.definitionId,
    id: row.id,
    queryKey: row.queryKey,
    status: parseMetricVersionStatus(row.status),
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version
  };
}

function parseMetricVersionStatus(status: string): MetricVersionStatus {
  if (status === "active" || status === "draft" || status === "retired") {
    return status;
  }

  throw new Error(`Unsupported metric version status: ${status}`);
}

function selectLatestActiveMetricVersion(versions: MetricVersionRecord[]): MetricVersionRecord | undefined {
  return clone(versions)
    .filter((version) => version.status === "active")
    .sort(compareMetricVersionsForSelection)
    [0];
}

function compareMetricVersionsForSelection(left: MetricVersionRecord, right: MetricVersionRecord): number {
  const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (updated !== 0) {
    return updated;
  }

  const version = right.version.localeCompare(left.version, "en", { numeric: true, sensitivity: "base" });
  if (version !== 0) {
    return version;
  }

  return left.id.localeCompare(right.id);
}

function selectLatestMetricTenantOverride(overrides: MetricTenantOverrideRecord[]): MetricTenantOverrideRecord | undefined {
  return clone(overrides)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    [0];
}

function isMetricTenantOverrideInScope(override: MetricTenantOverrideRecord, filters: MetricTenantOverrideFilters): boolean {
  return (!filters.tenantId || override.tenantId === filters.tenantId)
    && (!filters.definitionId || override.definitionId === filters.definitionId);
}

function normalizeMetricTenantOverride(override: MetricTenantOverrideRecord): MetricTenantOverrideRecord {
  const metricVersionId = requireNonEmpty(override.metricVersionId, "metric_tenant_override_metric_version_required");
  return {
    createdAt: override.createdAt,
    definitionId: override.definitionId,
    id: override.id,
    metricVersionId,
    reason: override.reason.trim(),
    tenantId: override.tenantId,
    updatedAt: override.updatedAt
  };
}

function normalizeReportQueryExecution(execution: ReportQueryExecutionRecord): ReportQueryExecutionRecord {
  return {
    ...(execution.failureEnvelope ? { failureEnvelope: normalizeFailureEnvelope(execution.failureEnvelope) } : {}),
    id: requireNonEmpty(execution.id, "report_query_execution_id_required"),
    metricKey: requireNonEmpty(execution.metricKey, "report_query_execution_metric_key_required"),
    ...(execution.parameters ? { parameters: clone(execution.parameters) } : {}),
    status: parseReportQueryExecutionStatus(execution.status)
  };
}

function normalizeReportFileDescriptor(descriptor: ReportFileDescriptorRecord): ReportFileDescriptorRecord {
  return {
    checksum: requireNonEmpty(descriptor.checksum, "report_file_descriptor_checksum_required"),
    contentType: requireNonEmpty(descriptor.contentType, "report_file_descriptor_content_type_required"),
    createdAt: requireNonEmpty(descriptor.createdAt, "report_file_descriptor_created_at_required"),
    fileName: requireNonEmpty(descriptor.fileName, "report_file_descriptor_file_name_required"),
    format: requireNonEmpty(descriptor.format, "report_file_descriptor_format_required"),
    id: requireNonEmpty(descriptor.id, "report_file_descriptor_id_required"),
    jobId: requireNonEmpty(descriptor.jobId, "report_file_descriptor_job_id_required"),
    metricDefinitionVersion: requireNonEmpty(descriptor.metricDefinitionVersion, "report_file_descriptor_metric_definition_version_required"),
    objectKey: requireNonEmpty(descriptor.objectKey, "report_file_descriptor_object_key_required"),
    sizeBytes: descriptor.sizeBytes,
    tenantId: requireNonEmpty(descriptor.tenantId, "report_file_descriptor_tenant_id_required"),
    writtenAt: requireNonEmpty(descriptor.writtenAt, "report_file_descriptor_written_at_required")
  };
}

function normalizeReportNotificationDescriptor(descriptor: ReportNotificationDescriptorRecord): ReportNotificationDescriptorRecord {
  return {
    createdAt: requireIsoDate(descriptor.createdAt, "report_notification_created_at_invalid"),
    eventType: parseReportNotificationEventType(descriptor.eventType),
    exportJobId: requireNonEmpty(descriptor.exportJobId, "report_notification_export_job_id_required"),
    id: requireNonEmpty(descriptor.id, "report_notification_id_required"),
    idempotencyKey: requireNonEmpty(descriptor.idempotencyKey, "report_notification_idempotency_key_required"),
    payload: clone(descriptor.payload),
    status: parseReportNotificationStatus(descriptor.status),
    tenantId: requireNonEmpty(descriptor.tenantId, "report_notification_tenant_id_required")
  };
}

function parseReportNotificationEventType(eventType: string): ReportNotificationDescriptorRecord["eventType"] {
  if (eventType === "export.ready") {
    return eventType;
  }

  throw new Error(`Unsupported report notification event type: ${eventType}`);
}

function parseReportNotificationStatus(status: string): ReportNotificationDescriptorRecord["status"] {
  if (status === "queued") {
    return status;
  }

  throw new Error(`Unsupported report notification status: ${status}`);
}

function normalizeSavedReportTemplate(template: SavedReportTemplateRecord): SavedReportTemplateRecord {
  return {
    columns: template.columns.map((column) => requireNonEmpty(column, "saved_report_template_column_required")),
    createdAt: requireNonEmpty(template.createdAt, "saved_report_template_created_at_required"),
    filters: clone(template.filters),
    id: requireNonEmpty(template.id, "saved_report_template_id_required"),
    name: requireNonEmpty(template.name, "saved_report_template_name_required"),
    ownerUserId: requireNonEmpty(template.ownerUserId, "saved_report_template_owner_required"),
    reportType: requireNonEmpty(template.reportType, "saved_report_template_report_type_required"),
    tenantId: requireNonEmpty(template.tenantId, "saved_report_template_tenant_id_required"),
    updatedAt: requireNonEmpty(template.updatedAt, "saved_report_template_updated_at_required"),
    visibility: normalizeSavedReportTemplateVisibility(template.visibility)
  };
}

function normalizeScheduledDigestDescriptor(descriptor: ScheduledDigestDescriptorRecord): ScheduledDigestDescriptorRecord {
  const dueAt = requireIsoDate(descriptor.dueAt, "scheduled_digest_due_at_invalid");
  const createdAt = requireIsoDate(descriptor.createdAt, "scheduled_digest_created_at_invalid");
  const updatedAt = requireIsoDate(descriptor.updatedAt, "scheduled_digest_updated_at_invalid");

  return {
    createdAt,
    dueAt,
    id: requireNonEmpty(descriptor.id, "scheduled_digest_id_required"),
    periodKey: requireNonEmpty(descriptor.periodKey, "scheduled_digest_period_key_required"),
    reportType: requireNonEmpty(descriptor.reportType, "scheduled_digest_report_type_required"),
    scheduleId: requireNonEmpty(descriptor.scheduleId, "scheduled_digest_schedule_id_required"),
    status: parseScheduledDigestStatus(descriptor.status),
    tenantId: requireNonEmpty(descriptor.tenantId, "scheduled_digest_tenant_id_required"),
    updatedAt
  };
}

function isSavedReportTemplateInScope(template: SavedReportTemplateRecord, filters: SavedReportTemplateFilters): boolean {
  return (!filters.tenantId || template.tenantId === filters.tenantId)
    && isSavedReportTemplateVisible(template, filters);
}

function normalizeSavedReportTemplateVisibility(visibility?: SavedReportTemplateVisibility): SavedReportTemplateVisibility {
  if (!visibility) {
    return { scope: "private" };
  }

  if (visibility.scope === "private") {
    return { scope: "private" };
  }

  if (visibility.scope === "roles") {
    return {
      roles: (visibility.roles ?? []).map((role) => requireNonEmpty(role, "saved_report_template_role_required")),
      scope: "roles"
    };
  }

  if (visibility.scope === "permissions") {
    return {
      permissions: (visibility.permissions ?? []).map((permission) => requireNonEmpty(permission, "saved_report_template_permission_required")),
      scope: "permissions"
    };
  }

  throw new Error(`Unsupported saved report template visibility scope: ${(visibility as { scope?: string }).scope}`);
}

function isSavedReportTemplateVisible(template: SavedReportTemplateRecord, filters: SavedReportTemplateFilters): boolean {
  if (!filters.requesterUserId && !filters.requesterRoles && !filters.requesterPermissions) {
    return true;
  }

  if (template.visibility.scope === "private") {
    return template.ownerUserId === filters.requesterUserId;
  }

  if (template.visibility.scope === "roles") {
    const requesterRoles = new Set(filters.requesterRoles ?? []);
    return (template.visibility.roles ?? []).some((role) => requesterRoles.has(role));
  }

  if (template.visibility.scope === "permissions") {
    const requesterPermissions = new Set(filters.requesterPermissions ?? []);
    return (template.visibility.permissions ?? []).some((permission) => requesterPermissions.has(permission));
  }

  return false;
}

function isScheduledDigestDescriptorInScope(descriptor: ScheduledDigestDescriptorRecord, filters: ScheduledDigestDescriptorFilters): boolean {
  return (filters.tenantId === undefined || descriptor.tenantId === filters.tenantId)
    && (filters.status === undefined || descriptor.status === filters.status)
    && (filters.dueBefore === undefined || Date.parse(descriptor.dueAt) <= Date.parse(filters.dueBefore));
}

function isSameScheduledDigestPeriod(left: ScheduledDigestDescriptorRecord, right: ScheduledDigestDescriptorRecord): boolean {
  return left.tenantId === right.tenantId
    && left.scheduleId === right.scheduleId
    && left.periodKey === right.periodKey;
}

function isDuplicateScheduledDigestPeriodReplay(existing: ScheduledDigestDescriptorRecord, replay: ScheduledDigestDescriptorRecord): boolean {
  return existing.createdAt === replay.createdAt
    && existing.dueAt === replay.dueAt
    && existing.periodKey === replay.periodKey
    && existing.reportType === replay.reportType
    && existing.scheduleId === replay.scheduleId
    && existing.tenantId === replay.tenantId;
}

function compareScheduledDigestDescriptors(left: ScheduledDigestDescriptorRecord, right: ScheduledDigestDescriptorRecord): number {
  const due = Date.parse(left.dueAt) - Date.parse(right.dueAt);
  if (due !== 0) {
    return due;
  }

  return left.id.localeCompare(right.id);
}

function parseScheduledDigestStatus(status: string): ScheduledDigestStatus {
  if (status === "due" || status === "running" || status === "completed" || status === "failed") {
    return status;
  }

  throw new Error(`Unsupported scheduled digest status: ${status}`);
}

function normalizeFailureEnvelope(failureEnvelope: { code: string; message: string }): { code: string; message: string } {
  return {
    code: requireNonEmpty(failureEnvelope.code, "report_query_failure_code_required"),
    message: requireNonEmpty(failureEnvelope.message, "report_query_failure_message_required")
  };
}

function parseReportQueryExecutionStatus(status: string): ReportQueryExecutionStatus {
  if (status === "completed" || status === "failed" || status === "running") {
    return status;
  }

  throw new Error(`Unsupported report query execution status: ${status}`);
}

function metricTenantOverrideWhere(filters: MetricTenantOverrideFilters): PrismaMetricTenantOverrideWhereInput {
  return {
    ...(filters.definitionId ? { definitionId: filters.definitionId } : {}),
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {})
  };
}

function toPrismaMetricTenantOverrideCreateInput(override: MetricTenantOverrideRecord): PrismaMetricTenantOverrideCreateInput {
  return {
    createdAt: new Date(override.createdAt),
    definitionId: override.definitionId,
    id: override.id,
    metricVersionId: override.metricVersionId,
    reason: override.reason,
    tenantId: override.tenantId,
    updatedAt: new Date(override.updatedAt)
  };
}

function toPrismaMetricTenantOverrideUpdateInput(create: PrismaMetricTenantOverrideCreateInput): PrismaMetricTenantOverrideUpdateInput {
  return {
    definitionId: create.definitionId,
    metricVersionId: create.metricVersionId,
    reason: create.reason,
    tenantId: create.tenantId,
    updatedAt: create.updatedAt
  };
}

function toMetricTenantOverrideRecord(row: PrismaMetricTenantOverrideRow): MetricTenantOverrideRecord {
  return {
    createdAt: row.createdAt.toISOString(),
    definitionId: row.definitionId,
    id: row.id,
    metricVersionId: row.metricVersionId,
    reason: row.reason,
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString()
  };
}

function savedReportTemplateWhere(filters: SavedReportTemplateFilters): PrismaSavedReportTemplateWhereInput {
  return {
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {})
  };
}

function toPrismaReportIdempotencyKeyCreateInput(record: ReportIdempotencyRecord): PrismaReportIdempotencyKeyCreateInput {
  return {
    fingerprint: record.fingerprint,
    jobId: record.jobId,
    key: record.key
  };
}

function toPrismaReportIdempotencyKeyUpdateInput(record: ReportIdempotencyRecord): PrismaReportIdempotencyKeyUpdateInput {
  return {
    fingerprint: record.fingerprint,
    jobId: record.jobId
  };
}

function toReportIdempotencyRecord(row: PrismaReportIdempotencyKeyRow): ReportIdempotencyRecord {
  return {
    fingerprint: row.fingerprint,
    jobId: row.jobId,
    key: row.key
  };
}

function toPrismaReportExportJobCreateInput(job: ReportExportJob): PrismaReportExportJobCreateInput {
  return {
    auditId: job.auditId,
    backendQueueId: job.backendQueueId ?? null,
    columns: job.columns ?? [],
    createdAt: new Date(requireIsoDate(job.createdAt, "report_export_job_created_at_invalid")),
    deadLetteredAt: job.deadLetteredAt ? new Date(requireIsoDate(job.deadLetteredAt, "report_export_job_dead_lettered_at_invalid")) : null,
    failureCode: job.failureCode ?? null,
    failureMessage: job.failureMessage ?? null,
    fileName: job.fileName ?? null,
    filters: clone(job.filters ?? {}),
    format: job.format,
    id: job.id,
    metricDefinitionVersion: job.metricDefinitionVersion ?? null,
    name: job.name,
    period: job.period,
    progress: job.progress,
    queue: job.queue ?? null,
    requestedBy: job.requestedBy,
    rows: job.rows,
    status: job.status,
    statusKey: job.statusKey
  };
}

function toPrismaReportExportJobUpdateInput(create: PrismaReportExportJobCreateInput): PrismaReportExportJobUpdateInput {
  return {
    auditId: create.auditId,
    backendQueueId: create.backendQueueId,
    columns: create.columns,
    deadLetteredAt: create.deadLetteredAt,
    failureCode: create.failureCode,
    failureMessage: create.failureMessage,
    fileName: create.fileName,
    filters: create.filters,
    format: create.format,
    metricDefinitionVersion: create.metricDefinitionVersion,
    name: create.name,
    period: create.period,
    progress: create.progress,
    queue: create.queue,
    requestedBy: create.requestedBy,
    rows: create.rows,
    status: create.status,
    statusKey: create.statusKey
  };
}

function toReportExportJob(row: PrismaReportExportJobRow): ReportExportJob {
  return {
    auditId: row.auditId,
    ...(row.backendQueueId ? { backendQueueId: row.backendQueueId } : {}),
    columns: row.columns,
    createdAt: row.createdAt.toISOString(),
    ...(row.deadLetteredAt ? { deadLetteredAt: row.deadLetteredAt.toISOString() } : {}),
    ...(row.failureCode ? { failureCode: row.failureCode } : {}),
    ...(row.failureMessage ? { failureMessage: row.failureMessage } : {}),
    ...(row.fileName ? { fileName: row.fileName } : {}),
    filters: clone(row.filters),
    format: parseReportExportFormat(row.format),
    id: row.id,
    ...(row.metricDefinitionVersion ? { metricDefinitionVersion: row.metricDefinitionVersion } : {}),
    name: row.name,
    period: row.period,
    progress: row.progress,
    ...(row.queue ? { queue: row.queue } : {}),
    requestedBy: row.requestedBy,
    rows: row.rows,
    status: row.status,
    statusKey: parseReportExportStatusKey(row.statusKey)
  };
}

function parseReportExportFormat(format: string): ReportExportJob["format"] {
  if (format === "CSV" || format === "PDF" || format === "XLSX") {
    return format;
  }

  throw new Error(`Unsupported report export format: ${format}`);
}

function parseReportExportStatusKey(statusKey: string): ReportExportJob["statusKey"] {
  if (statusKey === "error" || statusKey === "expired" || statusKey === "queued" || statusKey === "ready" || statusKey === "running") {
    return statusKey;
  }

  throw new Error(`Unsupported report export status: ${statusKey}`);
}

function toPrismaSavedReportTemplateCreateInput(template: SavedReportTemplateRecord): PrismaSavedReportTemplateCreateInput {
  return {
    columns: template.columns,
    createdAt: new Date(template.createdAt),
    filters: clone(template.filters),
    id: template.id,
    name: template.name,
    ownerUserId: template.ownerUserId,
    reportType: template.reportType,
    tenantId: template.tenantId,
    updatedAt: new Date(template.updatedAt),
    visibilityPermissions: template.visibility.permissions ?? [],
    visibilityRoles: template.visibility.roles ?? [],
    visibilityScope: template.visibility.scope
  };
}

function toPrismaSavedReportTemplateUpdateInput(create: PrismaSavedReportTemplateCreateInput): PrismaSavedReportTemplateUpdateInput {
  return {
    columns: create.columns,
    filters: create.filters,
    name: create.name,
    ownerUserId: create.ownerUserId,
    reportType: create.reportType,
    tenantId: create.tenantId,
    updatedAt: create.updatedAt,
    visibilityPermissions: create.visibilityPermissions,
    visibilityRoles: create.visibilityRoles,
    visibilityScope: create.visibilityScope
  };
}

function toSavedReportTemplateRecord(row: PrismaSavedReportTemplateRow): SavedReportTemplateRecord {
  return {
    columns: row.columns,
    createdAt: row.createdAt.toISOString(),
    filters: clone(row.filters),
    id: row.id,
    name: row.name,
    ownerUserId: row.ownerUserId,
    reportType: row.reportType,
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString(),
    visibility: normalizeSavedReportTemplateVisibility({
      permissions: row.visibilityPermissions,
      roles: row.visibilityRoles,
      scope: row.visibilityScope as SavedReportTemplateVisibilityScope
    })
  };
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === "function");
}

function requireNonEmpty(value: string, errorCode: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(errorCode);
  }

  return trimmed;
}

function requireIsoDate(value: string, errorCode: string): string {
  const trimmed = requireNonEmpty(value, errorCode);
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== trimmed) {
    throw new Error(errorCode);
  }

  return trimmed;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}
