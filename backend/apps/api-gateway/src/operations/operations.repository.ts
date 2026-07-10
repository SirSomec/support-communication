import { createHash } from "node:crypto";
import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import { isLocalRuntime } from "../runtime/local-runtime.js";
import { bootstrapOperationsState } from "./seed.js";
import type {
  BackupDrill,
  DeadLetterMessage,
  DeadLetterQueue,
  LoadTestScenario,
  MigrationCandidate,
  SecurityControl
} from "./operations.types.js";

export interface OperationsIdempotencyRecord {
  fingerprint: string;
  key: string;
  result: Record<string, unknown>;
}

export interface OperationsLoadTestRunRecord {
  auditEvent: Record<string, unknown>;
  reason: string | null;
  run: Record<string, unknown>;
}

export interface OperationsRestoreCheckRecord {
  auditEvent: Record<string, unknown>;
  reason: string | null;
  restoreCheck: Record<string, unknown>;
}

export interface OperationsDeadLetterReplayRecord {
  auditEvent: Record<string, unknown>;
  reason: string | null;
  replay: Record<string, unknown>;
}

export interface OperationsDeadLetterReplayValidationDenialRecord {
  auditEvent: Record<string, unknown>;
  code: string;
  messageId: string;
  queueName: string;
  reason: string | null;
}

export interface OperationsDeadLetterReplayRequeueAuditRecord {
  auditEvent: Record<string, unknown>;
  messageId: string;
  queueName: string;
  reason: string | null;
  replay: Record<string, unknown>;
}

export interface OperationsMigrationRollbackCheckRecord {
  auditEvent: Record<string, unknown>;
  compatibilityChecks: Array<Record<string, unknown>>;
  migrationId: string;
  policy: Record<string, unknown>;
  reason: string | null;
  rollbackPlan: Record<string, unknown>;
}

export interface OperationsMigrationRollbackCheckResultRecord {
  afterSnapshot: {
    envelopeFields: string[];
    migrationId: string;
    openapiPaths: string[];
    responseFieldsByPath: Record<string, string[]>;
    schemaVersion: string;
  };
  auditEvent: Record<string, unknown>;
  beforeSnapshot: {
    envelopeFields: string[];
    migrationId: string;
    openapiPaths: string[];
    responseFieldsByPath: Record<string, string[]>;
    schemaVersion: string;
  };
  checkedAt: string;
  id: string;
  metadata: {
    applyCommand: string;
    id: string;
    name: string;
    rollbackCommand: string;
    schemaVersion: string;
    service: string;
    status: string;
  };
  migrationId: string;
  reason: string;
  status: "failed" | "passed" | "warn";
  toolingResults: Array<{
    checks: Array<{
      detail: string;
      id: string;
      name: string;
      status: string;
    }>;
    status: string;
    tooling: string;
  }>;
}

export interface OperationsLoadTestRunExecutionRecord {
  completedAt: string | null;
  operations: Array<Record<string, unknown>>;
  runId: string;
  scenarioId: string;
  startedAt: string | null;
  status: "queued" | "running" | "completed" | "failed";
  targetRps: number;
  traceId: string;
  updatedAt: string;
}

export interface OperationsLoadTestRunMetricsRecord {
  completedOperations: number;
  failedOperations: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  observedRps: number;
  runId: string;
  targetRps: number;
  totalOperations: number;
  workflowBreakdown: Record<string, { completed: number; failed: number; latencyP95Ms: number }>;
}

export interface OperationsLoadTestRunErrorSummaryRecord {
  runId: string;
  sanitized: true;
  topFailures: Array<{ code: string; count: number; workflow: string }>;
  totalFailures: number;
}

export interface OperationsPostgresRestoreCheckResultRecord {
  command: string;
  drillId: string;
  durationMs: number;
  executedAt: string;
  id: string;
  outputSummary: string;
  restoreCheckId: string;
  status: "passed" | "failed" | "timed_out";
}

export interface OperationsObjectStorageRestoreCheckExistenceResultRecord {
  artifactId: string;
  drillId: string;
  exists: boolean;
  id: string;
  restoreCheckId: string;
  status: "missing" | "passed";
  verifiedAt: string;
}

export interface OperationsObjectStorageRestoreCheckChecksumResultRecord {
  actualChecksum: string;
  artifactId: string;
  drillId: string;
  expectedChecksum: string;
  id: string;
  restoreCheckId: string;
  status: "mismatch" | "passed";
  verifiedAt: string;
}

export interface OperationsObjectStorageRestoreCheckMetadataResultRecord {
  actualMetadata: {
    backupLabel: string;
    contentType: string;
    schemaVersion: string;
    sizeBytes: number;
  } | null;
  artifactId: string;
  drillId: string;
  expectedMetadata: {
    backupLabel: string;
    contentType: string;
    schemaVersion: string;
    sizeBytes: number;
  };
  id: string;
  restoreCheckId: string;
  status: "mismatch" | "passed";
  verifiedAt: string;
}

export interface OperationsState {
  backupDrills: BackupDrill[];
  deadLetterMessages: DeadLetterMessage[];
  deadLetterQueues: DeadLetterQueue[];
  deadLetterReplayIdempotencyKeys: OperationsIdempotencyRecord[];
  deadLetterReplayRequeueAudits: OperationsDeadLetterReplayRequeueAuditRecord[];
  deadLetterReplayValidationDenials: OperationsDeadLetterReplayValidationDenialRecord[];
  deadLetterReplays: OperationsDeadLetterReplayRecord[];
  loadTestIdempotencyKeys: OperationsIdempotencyRecord[];
  loadTestRunErrorSummaries: OperationsLoadTestRunErrorSummaryRecord[];
  loadTestRunExecutions: OperationsLoadTestRunExecutionRecord[];
  loadTestRunMetrics: OperationsLoadTestRunMetricsRecord[];
  loadTestRuns: OperationsLoadTestRunRecord[];
  loadTestScenarios: LoadTestScenario[];
  migrationCandidates: MigrationCandidate[];
  migrationRollbackCheckResults: OperationsMigrationRollbackCheckResultRecord[];
  migrationRollbackChecks: OperationsMigrationRollbackCheckRecord[];
  objectStorageRestoreCheckChecksumResults: OperationsObjectStorageRestoreCheckChecksumResultRecord[];
  objectStorageRestoreCheckExistenceResults: OperationsObjectStorageRestoreCheckExistenceResultRecord[];
  objectStorageRestoreCheckMetadataResults: OperationsObjectStorageRestoreCheckMetadataResultRecord[];
  postgresRestoreCheckResults: OperationsPostgresRestoreCheckResultRecord[];
  restoreCheckIdempotencyKeys: OperationsIdempotencyRecord[];
  restoreChecks: OperationsRestoreCheckRecord[];
  securityControls: SecurityControl[];
}

interface OperationsRepositoryOptions {
  filePath: string;
  seed?: OperationsState;
}

export interface PrismaOperationsClient {
  operationsObjectStorageRestoreCheckResult: PrismaOperationsObjectStorageRestoreCheckResultDelegate;
  operationsPostgresRestoreCheckResult: PrismaOperationsPostgresRestoreCheckResultDelegate;
  operationsRuntimeRecord: PrismaOperationsRuntimeRecordDelegate;
}

interface PrismaOperationsRuntimeRecordDelegate {
  findMany(input?: PrismaOperationsRuntimeRecordFindManyInput): Promise<PrismaOperationsRuntimeRecordRow[]>;
  findUnique(input: PrismaOperationsRuntimeRecordFindUniqueInput): Promise<PrismaOperationsRuntimeRecordRow | null>;
  upsert(input: PrismaOperationsRuntimeRecordUpsertInput): Promise<PrismaOperationsRuntimeRecordRow>;
}

interface PrismaOperationsPostgresRestoreCheckResultDelegate {
  findMany(input?: PrismaOperationsPostgresRestoreCheckResultFindManyInput): Promise<PrismaOperationsPostgresRestoreCheckResultRow[]>;
  findUnique(input: { where: { id: string } }): Promise<PrismaOperationsPostgresRestoreCheckResultRow | null>;
  upsert(input: PrismaOperationsPostgresRestoreCheckResultUpsertInput): Promise<PrismaOperationsPostgresRestoreCheckResultRow>;
}

interface PrismaOperationsObjectStorageRestoreCheckResultDelegate {
  findMany(input?: PrismaOperationsObjectStorageRestoreCheckResultFindManyInput): Promise<PrismaOperationsObjectStorageRestoreCheckResultRow[]>;
  findUnique(input: { where: { id: string } }): Promise<PrismaOperationsObjectStorageRestoreCheckResultRow | null>;
  upsert(input: PrismaOperationsObjectStorageRestoreCheckResultUpsertInput): Promise<PrismaOperationsObjectStorageRestoreCheckResultRow>;
}

interface PrismaOperationsRuntimeRecordFindManyInput {
  orderBy?: { updatedAt: "desc" };
  where?: {
    collection?: string;
    entityKey?: string;
    filterKey?: string;
  };
}

interface PrismaOperationsRuntimeRecordFindUniqueInput {
  where: {
    collection_entityKey: {
      collection: string;
      entityKey: string;
    };
  };
}

interface PrismaOperationsRuntimeRecordUpsertInput extends PrismaOperationsRuntimeRecordFindUniqueInput {
  create: PrismaOperationsRuntimeRecordCreateInput;
  update: PrismaOperationsRuntimeRecordUpdateInput;
}

interface PrismaOperationsRuntimeRecordCreateInput {
  collection: string;
  createdAt: Date;
  entityKey: string;
  filterKey: string | null;
  id: string;
  record: unknown;
  updatedAt: Date;
}

type PrismaOperationsRuntimeRecordUpdateInput = Partial<Omit<PrismaOperationsRuntimeRecordCreateInput, "collection" | "createdAt" | "entityKey" | "id">>;

interface PrismaOperationsRuntimeRecordRow extends PrismaOperationsRuntimeRecordCreateInput {}

interface PrismaOperationsPostgresRestoreCheckResultFindManyInput {
  orderBy?: { executedAt: "desc" };
  where?: {
    drillId?: string;
    restoreCheckId?: string;
  };
}

interface PrismaOperationsPostgresRestoreCheckResultUpsertInput {
  create: PrismaOperationsPostgresRestoreCheckResultCreateInput;
  update: PrismaOperationsPostgresRestoreCheckResultUpdateInput;
  where: { id: string };
}

interface PrismaOperationsPostgresRestoreCheckResultCreateInput {
  command: string;
  createdAt?: Date;
  drillId: string;
  durationMs: number;
  executedAt: Date;
  id: string;
  outputSummary: string;
  restoreCheckId: string;
  status: string;
}

type PrismaOperationsPostgresRestoreCheckResultUpdateInput = Partial<Omit<PrismaOperationsPostgresRestoreCheckResultCreateInput, "createdAt" | "id">>;

interface PrismaOperationsPostgresRestoreCheckResultRow extends Omit<PrismaOperationsPostgresRestoreCheckResultCreateInput, "createdAt" | "executedAt"> {
  createdAt: Date | string;
  executedAt: Date | string;
}

interface PrismaOperationsObjectStorageRestoreCheckResultFindManyInput {
  orderBy?: { verifiedAt: "desc" };
  where?: {
    artifactId?: string;
    checkKind?: string;
    drillId?: string;
    restoreCheckId?: string;
  };
}

interface PrismaOperationsObjectStorageRestoreCheckResultUpsertInput {
  create: PrismaOperationsObjectStorageRestoreCheckResultCreateInput;
  update: PrismaOperationsObjectStorageRestoreCheckResultUpdateInput;
  where: { id: string };
}

interface PrismaOperationsObjectStorageRestoreCheckResultCreateInput {
  artifactId: string;
  checkKind: string;
  createdAt?: Date;
  detail: unknown;
  drillId: string;
  id: string;
  restoreCheckId: string;
  status: string;
  verifiedAt: Date;
}

type PrismaOperationsObjectStorageRestoreCheckResultUpdateInput = Partial<Omit<PrismaOperationsObjectStorageRestoreCheckResultCreateInput, "createdAt" | "id">>;

interface PrismaOperationsObjectStorageRestoreCheckResultRow extends Omit<PrismaOperationsObjectStorageRestoreCheckResultCreateInput, "createdAt" | "verifiedAt"> {
  createdAt: Date | string;
  verifiedAt: Date | string;
}

type OperationsRuntimeCollection =
  | "deadLetterReplayIdempotencyKeys"
  | "deadLetterReplayRequeueAudits"
  | "deadLetterReplayValidationDenials"
  | "deadLetterReplays"
  | "loadTestIdempotencyKeys"
  | "loadTestRunErrorSummaries"
  | "loadTestRunExecutions"
  | "loadTestRunMetrics"
  | "loadTestRuns"
  | "migrationRollbackCheckResults"
  | "migrationRollbackChecks"
  | "restoreCheckIdempotencyKeys"
  | "restoreChecks";

let defaultRepository: OperationsRepository | null = null;

export class OperationsRepository {
  private constructor(
    private readonly store: DurableStore<OperationsState>,
    private readonly prismaClient?: PrismaOperationsClient
  ) {}

  static default(): OperationsRepository {
    if (defaultRepository) {
      return defaultRepository;
    }

    if (isLocalRuntime()) {
      return OperationsRepository.inMemory(bootstrapOperationsState());
    }

    return OperationsRepository.inMemory();
  }

  static useDefault(repository: OperationsRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed?: OperationsState): OperationsRepository {
    const resolved = seed ?? (isLocalRuntime() ? bootstrapOperationsState() : seedOperationsState());
    return new OperationsRepository(new InMemoryStore(resolved));
  }

  static open({ filePath, seed = seedOperationsState() }: OperationsRepositoryOptions): OperationsRepository {
    return new OperationsRepository(new JsonFileStore({ filePath, seed }));
  }

  static prisma({ client }: { client: PrismaOperationsClient }): OperationsRepository {
    assertCompletePrismaOperationsClient(client);
    return new OperationsRepository(new InMemoryStore(bootstrapOperationsState()), client);
  }

  readState(): OperationsState {
    if (this.prismaClient) {
      throw new Error("prisma_operations_async_required");
    }

    return normalizeState(this.store.read());
  }

  async readStateAsync(): Promise<OperationsState> {
    if (!this.prismaClient) {
      return this.readState();
    }

    const state = bootstrapOperationsState();
    const [runtimeRows, postgresRows, objectStorageRows] = await Promise.all([
      this.prismaClient.operationsRuntimeRecord.findMany({ orderBy: { updatedAt: "desc" } }),
      this.prismaClient.operationsPostgresRestoreCheckResult.findMany({ orderBy: { executedAt: "desc" } }),
      this.prismaClient.operationsObjectStorageRestoreCheckResult.findMany({ orderBy: { verifiedAt: "desc" } })
    ]);

    for (const row of runtimeRows) {
      appendRuntimeRecord(state, row.collection, row.record);
    }

    state.postgresRestoreCheckResults = postgresRows.map(toPostgresRestoreCheckResult);
    state.objectStorageRestoreCheckExistenceResults = objectStorageRows
      .filter((row) => row.checkKind === "existence")
      .map(toObjectStorageRestoreCheckExistenceResult);
    state.objectStorageRestoreCheckChecksumResults = objectStorageRows
      .filter((row) => row.checkKind === "checksum")
      .map(toObjectStorageRestoreCheckChecksumResult);
    state.objectStorageRestoreCheckMetadataResults = objectStorageRows
      .filter((row) => row.checkKind === "metadata")
      .map(toObjectStorageRestoreCheckMetadataResult);

    return normalizeState(state);
  }

  listLoadTestScenarios(): LoadTestScenario[] {
    return clone(this.readCatalogState().loadTestScenarios);
  }

  listBackupDrills(): BackupDrill[] {
    return clone(this.readCatalogState().backupDrills);
  }

  listDeadLetterQueues(): DeadLetterQueue[] {
    return clone(this.readCatalogState().deadLetterQueues);
  }

  listDeadLetterMessages(): DeadLetterMessage[] {
    return clone(this.readCatalogState().deadLetterMessages);
  }

  listMigrationCandidates(): MigrationCandidate[] {
    return clone(this.readCatalogState().migrationCandidates);
  }

  listSecurityControls(): SecurityControl[] {
    return clone(this.readCatalogState().securityControls);
  }

  async findLoadTestIdempotencyKeyAsync(key: string): Promise<OperationsIdempotencyRecord | undefined> {
    return this.findRuntimeRecord("loadTestIdempotencyKeys", key);
  }

  async saveLoadTestIdempotencyKeyAsync(record: OperationsIdempotencyRecord): Promise<OperationsIdempotencyRecord> {
    return this.saveIdempotencyKeyAsync("loadTestIdempotencyKeys", record);
  }

  async saveLoadTestRunAsync(record: OperationsLoadTestRunRecord): Promise<OperationsLoadTestRunRecord> {
    return this.saveRuntimeRecord("loadTestRuns", String(record.run.id ?? ""), record);
  }

  async findRestoreCheckIdempotencyKeyAsync(key: string): Promise<OperationsIdempotencyRecord | undefined> {
    return this.findRuntimeRecord("restoreCheckIdempotencyKeys", key);
  }

  async saveRestoreCheckIdempotencyKeyAsync(record: OperationsIdempotencyRecord): Promise<OperationsIdempotencyRecord> {
    return this.saveIdempotencyKeyAsync("restoreCheckIdempotencyKeys", record);
  }

  async saveRestoreCheckAsync(record: OperationsRestoreCheckRecord): Promise<OperationsRestoreCheckRecord> {
    return this.saveRuntimeRecord("restoreChecks", String(record.restoreCheck.id ?? ""), record);
  }

  async findDeadLetterReplayIdempotencyKeyAsync(key: string): Promise<OperationsIdempotencyRecord | undefined> {
    return this.findRuntimeRecord("deadLetterReplayIdempotencyKeys", key);
  }

  async saveDeadLetterReplayIdempotencyKeyAsync(record: OperationsIdempotencyRecord): Promise<OperationsIdempotencyRecord> {
    return this.saveIdempotencyKeyAsync("deadLetterReplayIdempotencyKeys", record);
  }

  async findDeadLetterReplayAsync(replayId: string): Promise<OperationsDeadLetterReplayRecord | undefined> {
    return this.findRuntimeRecord("deadLetterReplays", replayId);
  }

  async saveDeadLetterReplayAsync(record: OperationsDeadLetterReplayRecord): Promise<OperationsDeadLetterReplayRecord> {
    return this.saveRuntimeRecord("deadLetterReplays", String(record.replay.id ?? ""), record);
  }

  async saveDeadLetterReplayValidationDenialAsync(
    record: OperationsDeadLetterReplayValidationDenialRecord
  ): Promise<OperationsDeadLetterReplayValidationDenialRecord> {
    return this.saveRuntimeRecord(
      "deadLetterReplayValidationDenials",
      String(record.auditEvent.id ?? runtimeRecordId("deadLetterReplayValidationDenials", `${record.messageId}:${Date.now()}`)),
      record,
      record.messageId
    );
  }

  async listDeadLetterReplayValidationDenialsAsync(
    filters: { messageId?: string } = {}
  ): Promise<OperationsDeadLetterReplayValidationDenialRecord[]> {
    return this.listRuntimeRecords("deadLetterReplayValidationDenials", { filterKey: filters.messageId });
  }

  async saveDeadLetterReplayRequeueAuditAsync(
    record: OperationsDeadLetterReplayRequeueAuditRecord
  ): Promise<OperationsDeadLetterReplayRequeueAuditRecord> {
    return this.saveRuntimeRecord(
      "deadLetterReplayRequeueAudits",
      String(record.auditEvent.id ?? runtimeRecordId("deadLetterReplayRequeueAudits", `${record.messageId}:${Date.now()}`)),
      record,
      record.messageId
    );
  }

  async listDeadLetterReplayRequeueAuditsAsync(
    filters: { messageId?: string } = {}
  ): Promise<OperationsDeadLetterReplayRequeueAuditRecord[]> {
    return this.listRuntimeRecords("deadLetterReplayRequeueAudits", { filterKey: filters.messageId });
  }

  async saveMigrationRollbackCheckAsync(
    record: OperationsMigrationRollbackCheckRecord
  ): Promise<OperationsMigrationRollbackCheckRecord> {
    return this.saveRuntimeRecord(
      "migrationRollbackChecks",
      String(record.auditEvent.id ?? runtimeRecordId("migrationRollbackChecks", `${record.migrationId}:${Date.now()}`)),
      record,
      record.migrationId
    );
  }

  async findMigrationRollbackCheckResultAsync(
    resultId: string
  ): Promise<OperationsMigrationRollbackCheckResultRecord | undefined> {
    return this.findRuntimeRecord("migrationRollbackCheckResults", resultId);
  }

  async listMigrationRollbackCheckResultsAsync(
    filters: { migrationId?: string } = {}
  ): Promise<OperationsMigrationRollbackCheckResultRecord[]> {
    return this.listRuntimeRecords("migrationRollbackCheckResults", { filterKey: filters.migrationId });
  }

  async saveMigrationRollbackCheckResultAsync(
    record: OperationsMigrationRollbackCheckResultRecord
  ): Promise<OperationsMigrationRollbackCheckResultRecord> {
    return this.saveRuntimeRecord("migrationRollbackCheckResults", record.id, record, record.migrationId);
  }

  async listLoadTestRunExecutionsAsync(
    filters: { status?: OperationsLoadTestRunExecutionRecord["status"] } = {}
  ): Promise<OperationsLoadTestRunExecutionRecord[]> {
    return this.listRuntimeRecords("loadTestRunExecutions", { filterKey: filters.status });
  }

  async findLoadTestRunExecutionAsync(runId: string): Promise<OperationsLoadTestRunExecutionRecord | undefined> {
    return this.findRuntimeRecord("loadTestRunExecutions", runId);
  }

  async saveLoadTestRunExecutionAsync(
    record: OperationsLoadTestRunExecutionRecord
  ): Promise<OperationsLoadTestRunExecutionRecord> {
    return this.saveRuntimeRecord("loadTestRunExecutions", record.runId, record, record.status);
  }

  async findLoadTestRunMetricsAsync(runId: string): Promise<OperationsLoadTestRunMetricsRecord | undefined> {
    return this.findRuntimeRecord("loadTestRunMetrics", runId);
  }

  async saveLoadTestRunMetricsAsync(
    record: OperationsLoadTestRunMetricsRecord
  ): Promise<OperationsLoadTestRunMetricsRecord> {
    return this.saveRuntimeRecord("loadTestRunMetrics", record.runId, record);
  }

  async findLoadTestRunErrorSummaryAsync(runId: string): Promise<OperationsLoadTestRunErrorSummaryRecord | undefined> {
    return this.findRuntimeRecord("loadTestRunErrorSummaries", runId);
  }

  async saveLoadTestRunErrorSummaryAsync(
    record: OperationsLoadTestRunErrorSummaryRecord
  ): Promise<OperationsLoadTestRunErrorSummaryRecord> {
    return this.saveRuntimeRecord("loadTestRunErrorSummaries", record.runId, record);
  }

  async findPostgresRestoreCheckResultAsync(
    resultId: string
  ): Promise<OperationsPostgresRestoreCheckResultRecord | undefined> {
    if (!this.prismaClient) {
      return this.findPostgresRestoreCheckResult(resultId);
    }

    const row = await this.prismaClient.operationsPostgresRestoreCheckResult.findUnique({ where: { id: resultId } });
    return row ? toPostgresRestoreCheckResult(row) : undefined;
  }

  async listPostgresRestoreCheckResultsAsync(
    filters: { drillId?: string; restoreCheckId?: string } = {}
  ): Promise<OperationsPostgresRestoreCheckResultRecord[]> {
    if (!this.prismaClient) {
      return this.listPostgresRestoreCheckResults(filters);
    }

    const rows = await this.prismaClient.operationsPostgresRestoreCheckResult.findMany({
      orderBy: { executedAt: "desc" },
      where: {
        ...(filters.drillId ? { drillId: filters.drillId } : {}),
        ...(filters.restoreCheckId ? { restoreCheckId: filters.restoreCheckId } : {})
      }
    });
    return rows.map(toPostgresRestoreCheckResult);
  }

  async savePostgresRestoreCheckResultAsync(
    record: OperationsPostgresRestoreCheckResultRecord
  ): Promise<OperationsPostgresRestoreCheckResultRecord> {
    if (!this.prismaClient) {
      return this.savePostgresRestoreCheckResult(record);
    }

    const data = toPrismaPostgresRestoreCheckResultCreateInput(record);
    const row = await this.prismaClient.operationsPostgresRestoreCheckResult.upsert({
      create: data,
      update: toPrismaPostgresRestoreCheckResultUpdateInput(record),
      where: { id: record.id }
    });
    return toPostgresRestoreCheckResult(row);
  }

  async listObjectStorageRestoreCheckExistenceResultsAsync(
    filters: { artifactId?: string; drillId?: string } = {}
  ): Promise<OperationsObjectStorageRestoreCheckExistenceResultRecord[]> {
    const rows = await this.listObjectStorageRestoreCheckRows("existence", filters);
    return rows.map(toObjectStorageRestoreCheckExistenceResult);
  }

  async saveObjectStorageRestoreCheckExistenceResultAsync(
    record: OperationsObjectStorageRestoreCheckExistenceResultRecord
  ): Promise<OperationsObjectStorageRestoreCheckExistenceResultRecord> {
    if (!this.prismaClient) {
      return this.saveObjectStorageRestoreCheckExistenceResult(record);
    }

    const row = await this.saveObjectStorageRestoreCheckRow("existence", record, {
      exists: record.exists
    });
    return toObjectStorageRestoreCheckExistenceResult(row);
  }

  async listObjectStorageRestoreCheckChecksumResultsAsync(
    filters: { artifactId?: string; drillId?: string } = {}
  ): Promise<OperationsObjectStorageRestoreCheckChecksumResultRecord[]> {
    const rows = await this.listObjectStorageRestoreCheckRows("checksum", filters);
    return rows.map(toObjectStorageRestoreCheckChecksumResult);
  }

  async saveObjectStorageRestoreCheckChecksumResultAsync(
    record: OperationsObjectStorageRestoreCheckChecksumResultRecord
  ): Promise<OperationsObjectStorageRestoreCheckChecksumResultRecord> {
    if (!this.prismaClient) {
      return this.saveObjectStorageRestoreCheckChecksumResult(record);
    }

    const row = await this.saveObjectStorageRestoreCheckRow("checksum", record, {
      actualChecksum: record.actualChecksum,
      expectedChecksum: record.expectedChecksum
    });
    return toObjectStorageRestoreCheckChecksumResult(row);
  }

  async listObjectStorageRestoreCheckMetadataResultsAsync(
    filters: { artifactId?: string; drillId?: string } = {}
  ): Promise<OperationsObjectStorageRestoreCheckMetadataResultRecord[]> {
    const rows = await this.listObjectStorageRestoreCheckRows("metadata", filters);
    return rows.map(toObjectStorageRestoreCheckMetadataResult);
  }

  async saveObjectStorageRestoreCheckMetadataResultAsync(
    record: OperationsObjectStorageRestoreCheckMetadataResultRecord
  ): Promise<OperationsObjectStorageRestoreCheckMetadataResultRecord> {
    if (!this.prismaClient) {
      return this.saveObjectStorageRestoreCheckMetadataResult(record);
    }

    const row = await this.saveObjectStorageRestoreCheckRow("metadata", record, {
      actualMetadata: record.actualMetadata,
      expectedMetadata: record.expectedMetadata
    });
    return toObjectStorageRestoreCheckMetadataResult(row);
  }

  findLoadTestIdempotencyKey(key: string): OperationsIdempotencyRecord | undefined {
    return clone(this.readState().loadTestIdempotencyKeys.find((item) => item.key === key));
  }

  saveLoadTestIdempotencyKey(record: OperationsIdempotencyRecord): OperationsIdempotencyRecord {
    return this.saveIdempotencyKey("loadTestIdempotencyKeys", record);
  }

  saveLoadTestRun(record: OperationsLoadTestRunRecord): OperationsLoadTestRunRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const runId = String(persisted.run.id ?? "");
      const exists = current.loadTestRuns.some((item) => item.run.id === runId);

      return {
        ...current,
        loadTestRuns: exists
          ? current.loadTestRuns.map((item) => item.run.id === runId ? persisted : item)
          : [persisted, ...current.loadTestRuns]
      };
    });

    return clone(persisted);
  }

  findRestoreCheckIdempotencyKey(key: string): OperationsIdempotencyRecord | undefined {
    return clone(this.readState().restoreCheckIdempotencyKeys.find((item) => item.key === key));
  }

  saveRestoreCheckIdempotencyKey(record: OperationsIdempotencyRecord): OperationsIdempotencyRecord {
    return this.saveIdempotencyKey("restoreCheckIdempotencyKeys", record);
  }

  saveRestoreCheck(record: OperationsRestoreCheckRecord): OperationsRestoreCheckRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const checkId = String(persisted.restoreCheck.id ?? "");
      const exists = current.restoreChecks.some((item) => item.restoreCheck.id === checkId);

      return {
        ...current,
        restoreChecks: exists
          ? current.restoreChecks.map((item) => item.restoreCheck.id === checkId ? persisted : item)
          : [persisted, ...current.restoreChecks]
      };
    });

    return clone(persisted);
  }

  findDeadLetterReplayIdempotencyKey(key: string): OperationsIdempotencyRecord | undefined {
    return clone(this.readState().deadLetterReplayIdempotencyKeys.find((item) => item.key === key));
  }

  saveDeadLetterReplayIdempotencyKey(record: OperationsIdempotencyRecord): OperationsIdempotencyRecord {
    return this.saveIdempotencyKey("deadLetterReplayIdempotencyKeys", record);
  }

  saveDeadLetterReplay(record: OperationsDeadLetterReplayRecord): OperationsDeadLetterReplayRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const replayId = String(persisted.replay.id ?? "");
      const exists = current.deadLetterReplays.some((item) => item.replay.id === replayId);

      return {
        ...current,
        deadLetterReplays: exists
          ? current.deadLetterReplays.map((item) => item.replay.id === replayId ? persisted : item)
          : [persisted, ...current.deadLetterReplays]
      };
    });

    return clone(persisted);
  }

  saveDeadLetterReplayValidationDenial(
    record: OperationsDeadLetterReplayValidationDenialRecord
  ): OperationsDeadLetterReplayValidationDenialRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        deadLetterReplayValidationDenials: [persisted, ...current.deadLetterReplayValidationDenials]
      };
    });

    return clone(persisted);
  }

  listDeadLetterReplayValidationDenials(filters: { messageId?: string } = {}): OperationsDeadLetterReplayValidationDenialRecord[] {
    return this.readState().deadLetterReplayValidationDenials
      .filter((item) => !filters.messageId || item.messageId === filters.messageId)
      .map(clone);
  }

  saveDeadLetterReplayRequeueAudit(
    record: OperationsDeadLetterReplayRequeueAuditRecord
  ): OperationsDeadLetterReplayRequeueAuditRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        deadLetterReplayRequeueAudits: [persisted, ...current.deadLetterReplayRequeueAudits]
      };
    });

    return clone(persisted);
  }

  listDeadLetterReplayRequeueAudits(filters: { messageId?: string } = {}): OperationsDeadLetterReplayRequeueAuditRecord[] {
    return this.readState().deadLetterReplayRequeueAudits
      .filter((item) => !filters.messageId || item.messageId === filters.messageId)
      .map(clone);
  }

  saveMigrationRollbackCheck(record: OperationsMigrationRollbackCheckRecord): OperationsMigrationRollbackCheckRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        migrationRollbackChecks: [persisted, ...current.migrationRollbackChecks]
      };
    });

    return clone(persisted);
  }

  findMigrationRollbackCheckResult(resultId: string): OperationsMigrationRollbackCheckResultRecord | undefined {
    return clone(this.readState().migrationRollbackCheckResults.find((item) => item.id === resultId));
  }

  listMigrationRollbackCheckResults(filters: { migrationId?: string } = {}): OperationsMigrationRollbackCheckResultRecord[] {
    return this.readState().migrationRollbackCheckResults
      .filter((item) => !filters.migrationId || item.migrationId === filters.migrationId)
      .map(clone);
  }

  saveMigrationRollbackCheckResult(record: OperationsMigrationRollbackCheckResultRecord): OperationsMigrationRollbackCheckResultRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.migrationRollbackCheckResults.some((item) => item.id === persisted.id);

      return {
        ...current,
        migrationRollbackCheckResults: exists
          ? current.migrationRollbackCheckResults.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.migrationRollbackCheckResults]
      };
    });

    return clone(persisted);
  }

  listLoadTestRunExecutions(filters: { status?: OperationsLoadTestRunExecutionRecord["status"] } = {}): OperationsLoadTestRunExecutionRecord[] {
    return this.readState().loadTestRunExecutions
      .filter((item) => !filters.status || item.status === filters.status)
      .map(clone);
  }

  findLoadTestRunExecution(runId: string): OperationsLoadTestRunExecutionRecord | undefined {
    return clone(this.readState().loadTestRunExecutions.find((item) => item.runId === runId));
  }

  saveLoadTestRunExecution(record: OperationsLoadTestRunExecutionRecord): OperationsLoadTestRunExecutionRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.loadTestRunExecutions.some((item) => item.runId === persisted.runId);

      return {
        ...current,
        loadTestRunExecutions: exists
          ? current.loadTestRunExecutions.map((item) => item.runId === persisted.runId ? persisted : item)
          : [persisted, ...current.loadTestRunExecutions]
      };
    });

    return clone(persisted);
  }

  findLoadTestRunMetrics(runId: string): OperationsLoadTestRunMetricsRecord | undefined {
    return clone(this.readState().loadTestRunMetrics.find((item) => item.runId === runId));
  }

  saveLoadTestRunMetrics(record: OperationsLoadTestRunMetricsRecord): OperationsLoadTestRunMetricsRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.loadTestRunMetrics.some((item) => item.runId === persisted.runId);

      return {
        ...current,
        loadTestRunMetrics: exists
          ? current.loadTestRunMetrics.map((item) => item.runId === persisted.runId ? persisted : item)
          : [persisted, ...current.loadTestRunMetrics]
      };
    });

    return clone(persisted);
  }

  findLoadTestRunErrorSummary(runId: string): OperationsLoadTestRunErrorSummaryRecord | undefined {
    return clone(this.readState().loadTestRunErrorSummaries.find((item) => item.runId === runId));
  }

  saveLoadTestRunErrorSummary(record: OperationsLoadTestRunErrorSummaryRecord): OperationsLoadTestRunErrorSummaryRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.loadTestRunErrorSummaries.some((item) => item.runId === persisted.runId);

      return {
        ...current,
        loadTestRunErrorSummaries: exists
          ? current.loadTestRunErrorSummaries.map((item) => item.runId === persisted.runId ? persisted : item)
          : [persisted, ...current.loadTestRunErrorSummaries]
      };
    });

    return clone(persisted);
  }

  findPostgresRestoreCheckResult(resultId: string): OperationsPostgresRestoreCheckResultRecord | undefined {
    return clone(this.readState().postgresRestoreCheckResults.find((item) => item.id === resultId));
  }

  listPostgresRestoreCheckResults(filters: { drillId?: string; restoreCheckId?: string } = {}): OperationsPostgresRestoreCheckResultRecord[] {
    return this.readState().postgresRestoreCheckResults
      .filter((item) => !filters.drillId || item.drillId === filters.drillId)
      .filter((item) => !filters.restoreCheckId || item.restoreCheckId === filters.restoreCheckId)
      .map(clone);
  }

  savePostgresRestoreCheckResult(record: OperationsPostgresRestoreCheckResultRecord): OperationsPostgresRestoreCheckResultRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.postgresRestoreCheckResults.some((item) => item.id === persisted.id);

      return {
        ...current,
        postgresRestoreCheckResults: exists
          ? current.postgresRestoreCheckResults.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.postgresRestoreCheckResults]
      };
    });

    return clone(persisted);
  }

  listObjectStorageRestoreCheckExistenceResults(filters: { artifactId?: string; drillId?: string } = {}): OperationsObjectStorageRestoreCheckExistenceResultRecord[] {
    return this.readState().objectStorageRestoreCheckExistenceResults
      .filter((item) => !filters.artifactId || item.artifactId === filters.artifactId)
      .filter((item) => !filters.drillId || item.drillId === filters.drillId)
      .map(clone);
  }

  saveObjectStorageRestoreCheckExistenceResult(
    record: OperationsObjectStorageRestoreCheckExistenceResultRecord
  ): OperationsObjectStorageRestoreCheckExistenceResultRecord {
    return this.saveObjectStorageRestoreCheckResult("objectStorageRestoreCheckExistenceResults", record);
  }

  listObjectStorageRestoreCheckChecksumResults(filters: { artifactId?: string; drillId?: string } = {}): OperationsObjectStorageRestoreCheckChecksumResultRecord[] {
    return this.readState().objectStorageRestoreCheckChecksumResults
      .filter((item) => !filters.artifactId || item.artifactId === filters.artifactId)
      .filter((item) => !filters.drillId || item.drillId === filters.drillId)
      .map(clone);
  }

  saveObjectStorageRestoreCheckChecksumResult(
    record: OperationsObjectStorageRestoreCheckChecksumResultRecord
  ): OperationsObjectStorageRestoreCheckChecksumResultRecord {
    return this.saveObjectStorageRestoreCheckResult("objectStorageRestoreCheckChecksumResults", record);
  }

  listObjectStorageRestoreCheckMetadataResults(filters: { artifactId?: string; drillId?: string } = {}): OperationsObjectStorageRestoreCheckMetadataResultRecord[] {
    return this.readState().objectStorageRestoreCheckMetadataResults
      .filter((item) => !filters.artifactId || item.artifactId === filters.artifactId)
      .filter((item) => !filters.drillId || item.drillId === filters.drillId)
      .map(clone);
  }

  saveObjectStorageRestoreCheckMetadataResult(
    record: OperationsObjectStorageRestoreCheckMetadataResultRecord
  ): OperationsObjectStorageRestoreCheckMetadataResultRecord {
    return this.saveObjectStorageRestoreCheckResult("objectStorageRestoreCheckMetadataResults", record);
  }

  private readCatalogState(): OperationsState {
    return this.prismaClient ? bootstrapOperationsState() : this.readState();
  }

  private assertSyncRuntimeAvailable(): void {
    if (this.prismaClient) {
      throw new Error("prisma_operations_async_required");
    }
  }

  private async findRuntimeRecord<T>(collection: OperationsRuntimeCollection, entityKey: string): Promise<T | undefined> {
    if (!this.prismaClient) {
      return clone((this.readState()[collection] as T[]).find((item) => runtimeEntityKey(collection, item) === entityKey));
    }

    const row = await this.prismaClient.operationsRuntimeRecord.findUnique({
      where: {
        collection_entityKey: {
          collection,
          entityKey
        }
      }
    });
    return row ? clone(row.record as T) : undefined;
  }

  private async listRuntimeRecords<T>(
    collection: OperationsRuntimeCollection,
    filters: { filterKey?: string } = {}
  ): Promise<T[]> {
    if (!this.prismaClient) {
      return (this.readState()[collection] as T[])
        .filter((item) => !filters.filterKey || runtimeFilterKey(collection, item) === filters.filterKey)
        .map(clone);
    }

    const rows = await this.prismaClient.operationsRuntimeRecord.findMany({
      orderBy: { updatedAt: "desc" },
      where: {
        collection,
        ...(filters.filterKey ? { filterKey: filters.filterKey } : {})
      }
    });
    return rows.map((row) => clone(row.record as T));
  }

  private async saveRuntimeRecord<T>(
    collection: OperationsRuntimeCollection,
    entityKey: string,
    record: T,
    filterKey: string | null = null
  ): Promise<T> {
    if (!this.prismaClient) {
      return this.saveRuntimeRecordSynchronously(collection, record);
    }

    const persisted = clone(record);
    const now = new Date();
    const normalizedEntityKey = entityKey || runtimeRecordId(collection, JSON.stringify(persisted));
    const row = await this.prismaClient.operationsRuntimeRecord.upsert({
      create: {
        collection,
        createdAt: now,
        entityKey: normalizedEntityKey,
        filterKey,
        id: runtimeRecordId(collection, normalizedEntityKey),
        record: persisted,
        updatedAt: now
      },
      update: {
        filterKey,
        record: persisted,
        updatedAt: now
      },
      where: {
        collection_entityKey: {
          collection,
          entityKey: normalizedEntityKey
        }
      }
    });

    return clone(row.record as T);
  }

  private saveRuntimeRecordSynchronously<T>(collection: OperationsRuntimeCollection, record: T): T {
    switch (collection) {
      case "deadLetterReplayIdempotencyKeys":
        return this.saveDeadLetterReplayIdempotencyKey(record as OperationsIdempotencyRecord) as T;
      case "deadLetterReplayRequeueAudits":
        return this.saveDeadLetterReplayRequeueAudit(record as OperationsDeadLetterReplayRequeueAuditRecord) as T;
      case "deadLetterReplayValidationDenials":
        return this.saveDeadLetterReplayValidationDenial(record as OperationsDeadLetterReplayValidationDenialRecord) as T;
      case "deadLetterReplays":
        return this.saveDeadLetterReplay(record as OperationsDeadLetterReplayRecord) as T;
      case "loadTestIdempotencyKeys":
        return this.saveLoadTestIdempotencyKey(record as OperationsIdempotencyRecord) as T;
      case "loadTestRunErrorSummaries":
        return this.saveLoadTestRunErrorSummary(record as OperationsLoadTestRunErrorSummaryRecord) as T;
      case "loadTestRunExecutions":
        return this.saveLoadTestRunExecution(record as OperationsLoadTestRunExecutionRecord) as T;
      case "loadTestRunMetrics":
        return this.saveLoadTestRunMetrics(record as OperationsLoadTestRunMetricsRecord) as T;
      case "loadTestRuns":
        return this.saveLoadTestRun(record as OperationsLoadTestRunRecord) as T;
      case "migrationRollbackCheckResults":
        return this.saveMigrationRollbackCheckResult(record as OperationsMigrationRollbackCheckResultRecord) as T;
      case "migrationRollbackChecks":
        return this.saveMigrationRollbackCheck(record as OperationsMigrationRollbackCheckRecord) as T;
      case "restoreCheckIdempotencyKeys":
        return this.saveRestoreCheckIdempotencyKey(record as OperationsIdempotencyRecord) as T;
      case "restoreChecks":
        return this.saveRestoreCheck(record as OperationsRestoreCheckRecord) as T;
    }

    throw new Error(`operations_runtime_collection_unsupported:${collection}`);
  }

  private async saveIdempotencyKeyAsync(
    collection: "deadLetterReplayIdempotencyKeys" | "loadTestIdempotencyKeys" | "restoreCheckIdempotencyKeys",
    record: OperationsIdempotencyRecord
  ): Promise<OperationsIdempotencyRecord> {
    if (!this.prismaClient) {
      return this.saveIdempotencyKey(collection, record);
    }

    const existing = await this.findRuntimeRecord<OperationsIdempotencyRecord>(collection, record.key);
    if (existing) {
      return existing;
    }

    return this.saveRuntimeRecord(collection, record.key, record);
  }

  private async listObjectStorageRestoreCheckRows(
    checkKind: "checksum" | "existence" | "metadata",
    filters: { artifactId?: string; drillId?: string } = {}
  ): Promise<PrismaOperationsObjectStorageRestoreCheckResultRow[]> {
    if (!this.prismaClient) {
      const rows = checkKind === "existence"
        ? this.listObjectStorageRestoreCheckExistenceResults(filters).map((record) => toPrismaObjectStorageRestoreCheckResultRow("existence", record, { exists: record.exists }))
        : checkKind === "checksum"
          ? this.listObjectStorageRestoreCheckChecksumResults(filters).map((record) => toPrismaObjectStorageRestoreCheckResultRow("checksum", record, {
            actualChecksum: record.actualChecksum,
            expectedChecksum: record.expectedChecksum
          }))
          : this.listObjectStorageRestoreCheckMetadataResults(filters).map((record) => toPrismaObjectStorageRestoreCheckResultRow("metadata", record, {
            actualMetadata: record.actualMetadata,
            expectedMetadata: record.expectedMetadata
          }));
      return rows;
    }

    return this.prismaClient.operationsObjectStorageRestoreCheckResult.findMany({
      orderBy: { verifiedAt: "desc" },
      where: {
        checkKind,
        ...(filters.artifactId ? { artifactId: filters.artifactId } : {}),
        ...(filters.drillId ? { drillId: filters.drillId } : {})
      }
    });
  }

  private async saveObjectStorageRestoreCheckRow(
    checkKind: "checksum" | "existence" | "metadata",
    record: OperationsObjectStorageRestoreCheckChecksumResultRecord
      | OperationsObjectStorageRestoreCheckExistenceResultRecord
      | OperationsObjectStorageRestoreCheckMetadataResultRecord,
    detail: Record<string, unknown>
  ): Promise<PrismaOperationsObjectStorageRestoreCheckResultRow> {
    if (!this.prismaClient) {
      return toPrismaObjectStorageRestoreCheckResultRow(checkKind, record, detail);
    }

    const data = toPrismaObjectStorageRestoreCheckResultCreateInput(checkKind, record, detail);
    return this.prismaClient.operationsObjectStorageRestoreCheckResult.upsert({
      create: data,
      update: toPrismaObjectStorageRestoreCheckResultUpdateInput(checkKind, record, detail),
      where: { id: record.id }
    });
  }

  private saveObjectStorageRestoreCheckResult<
    T extends OperationsObjectStorageRestoreCheckChecksumResultRecord
      | OperationsObjectStorageRestoreCheckExistenceResultRecord
      | OperationsObjectStorageRestoreCheckMetadataResultRecord
  >(
    collection:
      | "objectStorageRestoreCheckChecksumResults"
      | "objectStorageRestoreCheckExistenceResults"
      | "objectStorageRestoreCheckMetadataResults",
    record: T
  ): T {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const items = current[collection] as T[];
      const exists = items.some((item) => item.id === persisted.id);

      return {
        ...current,
        [collection]: exists
          ? items.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...items]
      };
    });

    return clone(persisted);
  }

  private saveIdempotencyKey(
    collection: "deadLetterReplayIdempotencyKeys" | "loadTestIdempotencyKeys" | "restoreCheckIdempotencyKeys",
    record: OperationsIdempotencyRecord
  ): OperationsIdempotencyRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    let saved: OperationsIdempotencyRecord = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current[collection].find((item) => item.key === persisted.key);
      if (existing) {
        saved = clone(existing);
        return current;
      }
      saved = persisted;

      return {
        ...current,
        [collection]: [...current[collection], persisted]
      };
    });

    return clone(saved);
  }
}

function assertCompletePrismaOperationsClient(client: PrismaOperationsClient): void {
  if (!client.operationsRuntimeRecord?.findMany || !client.operationsRuntimeRecord.findUnique || !client.operationsRuntimeRecord.upsert) {
    throw new Error("prisma_operations_runtime_record_delegate_required");
  }
  if (!client.operationsPostgresRestoreCheckResult?.findMany || !client.operationsPostgresRestoreCheckResult.findUnique || !client.operationsPostgresRestoreCheckResult.upsert) {
    throw new Error("prisma_operations_postgres_restore_check_result_delegate_required");
  }
  if (!client.operationsObjectStorageRestoreCheckResult?.findMany || !client.operationsObjectStorageRestoreCheckResult.findUnique || !client.operationsObjectStorageRestoreCheckResult.upsert) {
    throw new Error("prisma_operations_object_storage_restore_check_result_delegate_required");
  }
}

function appendRuntimeRecord(state: OperationsState, collection: string, record: unknown): void {
  if (!isOperationsRuntimeCollection(collection)) {
    return;
  }

  (state[collection] as unknown[]).push(clone(record));
}

function isOperationsRuntimeCollection(collection: string): collection is OperationsRuntimeCollection {
  return [
    "deadLetterReplayIdempotencyKeys",
    "deadLetterReplayRequeueAudits",
    "deadLetterReplayValidationDenials",
    "deadLetterReplays",
    "loadTestIdempotencyKeys",
    "loadTestRunErrorSummaries",
    "loadTestRunExecutions",
    "loadTestRunMetrics",
    "loadTestRuns",
    "migrationRollbackCheckResults",
    "migrationRollbackChecks",
    "restoreCheckIdempotencyKeys",
    "restoreChecks"
  ].includes(collection);
}

function runtimeEntityKey(collection: OperationsRuntimeCollection, record: unknown): string {
  const value = toJsonRecord(record);
  switch (collection) {
    case "deadLetterReplayIdempotencyKeys":
    case "loadTestIdempotencyKeys":
    case "restoreCheckIdempotencyKeys":
      return String(value.key ?? "");
    case "deadLetterReplayRequeueAudits":
    case "deadLetterReplayValidationDenials":
    case "migrationRollbackChecks":
      return String(toJsonRecord(value.auditEvent).id ?? "");
    case "deadLetterReplays":
      return String(toJsonRecord(value.replay).id ?? "");
    case "loadTestRunErrorSummaries":
    case "loadTestRunExecutions":
    case "loadTestRunMetrics":
      return String(value.runId ?? "");
    case "loadTestRuns":
      return String(toJsonRecord(value.run).id ?? "");
    case "migrationRollbackCheckResults":
      return String(value.id ?? "");
    case "restoreChecks":
      return String(toJsonRecord(value.restoreCheck).id ?? "");
  }
}

function runtimeFilterKey(collection: OperationsRuntimeCollection, record: unknown): string | null {
  const value = toJsonRecord(record);
  switch (collection) {
    case "deadLetterReplayRequeueAudits":
    case "deadLetterReplayValidationDenials":
      return String(value.messageId ?? "");
    case "loadTestRunExecutions":
      return String(value.status ?? "");
    case "migrationRollbackCheckResults":
    case "migrationRollbackChecks":
      return String(value.migrationId ?? "");
    default:
      return null;
  }
}

function runtimeRecordId(collection: string, entityKey: string): string {
  return `operations_runtime_${collection}_${createHash("sha256").update(entityKey).digest("hex").slice(0, 24)}`;
}

function toPrismaPostgresRestoreCheckResultCreateInput(
  record: OperationsPostgresRestoreCheckResultRecord
): PrismaOperationsPostgresRestoreCheckResultCreateInput {
  return {
    command: record.command,
    drillId: record.drillId,
    durationMs: record.durationMs,
    executedAt: new Date(record.executedAt),
    id: record.id,
    outputSummary: record.outputSummary,
    restoreCheckId: record.restoreCheckId,
    status: record.status
  };
}

function toPrismaPostgresRestoreCheckResultUpdateInput(
  record: OperationsPostgresRestoreCheckResultRecord
): PrismaOperationsPostgresRestoreCheckResultUpdateInput {
  const { id: _id, ...data } = toPrismaPostgresRestoreCheckResultCreateInput(record);
  return data;
}

function toPostgresRestoreCheckResult(
  row: PrismaOperationsPostgresRestoreCheckResultRow
): OperationsPostgresRestoreCheckResultRecord {
  return {
    command: row.command,
    drillId: row.drillId,
    durationMs: row.durationMs,
    executedAt: toIso(row.executedAt),
    id: row.id,
    outputSummary: row.outputSummary,
    restoreCheckId: row.restoreCheckId,
    status: operationsPostgresRestoreStatus(row.status)
  };
}

function toPrismaObjectStorageRestoreCheckResultCreateInput(
  checkKind: "checksum" | "existence" | "metadata",
  record: OperationsObjectStorageRestoreCheckChecksumResultRecord
    | OperationsObjectStorageRestoreCheckExistenceResultRecord
    | OperationsObjectStorageRestoreCheckMetadataResultRecord,
  detail: Record<string, unknown>
): PrismaOperationsObjectStorageRestoreCheckResultCreateInput {
  return {
    artifactId: record.artifactId,
    checkKind,
    detail,
    drillId: record.drillId,
    id: record.id,
    restoreCheckId: record.restoreCheckId,
    status: record.status,
    verifiedAt: new Date(record.verifiedAt)
  };
}

function toPrismaObjectStorageRestoreCheckResultUpdateInput(
  checkKind: "checksum" | "existence" | "metadata",
  record: OperationsObjectStorageRestoreCheckChecksumResultRecord
    | OperationsObjectStorageRestoreCheckExistenceResultRecord
    | OperationsObjectStorageRestoreCheckMetadataResultRecord,
  detail: Record<string, unknown>
): PrismaOperationsObjectStorageRestoreCheckResultUpdateInput {
  const { id: _id, ...data } = toPrismaObjectStorageRestoreCheckResultCreateInput(checkKind, record, detail);
  return data;
}

function toPrismaObjectStorageRestoreCheckResultRow(
  checkKind: "checksum" | "existence" | "metadata",
  record: OperationsObjectStorageRestoreCheckChecksumResultRecord
    | OperationsObjectStorageRestoreCheckExistenceResultRecord
    | OperationsObjectStorageRestoreCheckMetadataResultRecord,
  detail: Record<string, unknown>
): PrismaOperationsObjectStorageRestoreCheckResultRow {
  return {
    ...toPrismaObjectStorageRestoreCheckResultCreateInput(checkKind, record, detail),
    createdAt: new Date(),
    verifiedAt: new Date(record.verifiedAt)
  };
}

function toObjectStorageRestoreCheckExistenceResult(
  row: PrismaOperationsObjectStorageRestoreCheckResultRow
): OperationsObjectStorageRestoreCheckExistenceResultRecord {
  const detail = toJsonRecord(row.detail);
  return {
    artifactId: row.artifactId,
    drillId: row.drillId,
    exists: Boolean(detail.exists),
    id: row.id,
    restoreCheckId: row.restoreCheckId,
    status: row.status === "missing" ? "missing" : "passed",
    verifiedAt: toIso(row.verifiedAt)
  };
}

function toObjectStorageRestoreCheckChecksumResult(
  row: PrismaOperationsObjectStorageRestoreCheckResultRow
): OperationsObjectStorageRestoreCheckChecksumResultRecord {
  const detail = toJsonRecord(row.detail);
  return {
    actualChecksum: String(detail.actualChecksum ?? ""),
    artifactId: row.artifactId,
    drillId: row.drillId,
    expectedChecksum: String(detail.expectedChecksum ?? ""),
    id: row.id,
    restoreCheckId: row.restoreCheckId,
    status: row.status === "mismatch" ? "mismatch" : "passed",
    verifiedAt: toIso(row.verifiedAt)
  };
}

function toObjectStorageRestoreCheckMetadataResult(
  row: PrismaOperationsObjectStorageRestoreCheckResultRow
): OperationsObjectStorageRestoreCheckMetadataResultRecord {
  const detail = toJsonRecord(row.detail);
  return {
    actualMetadata: toNullableMetadata(detail.actualMetadata),
    artifactId: row.artifactId,
    drillId: row.drillId,
    expectedMetadata: toMetadata(detail.expectedMetadata),
    id: row.id,
    restoreCheckId: row.restoreCheckId,
    status: row.status === "mismatch" ? "mismatch" : "passed",
    verifiedAt: toIso(row.verifiedAt)
  };
}

function operationsPostgresRestoreStatus(status: string): OperationsPostgresRestoreCheckResultRecord["status"] {
  return status === "failed" || status === "timed_out" || status === "passed" ? status : "failed";
}

function toNullableMetadata(value: unknown): OperationsObjectStorageRestoreCheckMetadataResultRecord["actualMetadata"] {
  return value === null || value === undefined ? null : toMetadata(value);
}

function toMetadata(value: unknown): OperationsObjectStorageRestoreCheckMetadataResultRecord["expectedMetadata"] {
  const record = toJsonRecord(value);
  return {
    backupLabel: String(record.backupLabel ?? ""),
    contentType: String(record.contentType ?? ""),
    schemaVersion: String(record.schemaVersion ?? ""),
    sizeBytes: Number(record.sizeBytes ?? 0)
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function seedOperationsState(): OperationsState {
  return {
    backupDrills: [],
    deadLetterMessages: [],
    deadLetterQueues: [],
    deadLetterReplayIdempotencyKeys: [],
    deadLetterReplayRequeueAudits: [],
    deadLetterReplayValidationDenials: [],
    deadLetterReplays: [],
    loadTestIdempotencyKeys: [],
    loadTestRunErrorSummaries: [],
    loadTestRunExecutions: [],
    loadTestRunMetrics: [],
    loadTestRuns: [],
    loadTestScenarios: [],
    migrationCandidates: [],
    migrationRollbackCheckResults: [],
    migrationRollbackChecks: [],
    objectStorageRestoreCheckChecksumResults: [],
    objectStorageRestoreCheckExistenceResults: [],
    objectStorageRestoreCheckMetadataResults: [],
    postgresRestoreCheckResults: [],
    restoreCheckIdempotencyKeys: [],
    restoreChecks: [],
    securityControls: []
  };
}

function normalizeState(state: Partial<OperationsState>): OperationsState {
  return {
    backupDrills: state.backupDrills ?? [],
    deadLetterMessages: state.deadLetterMessages ?? [],
    deadLetterQueues: state.deadLetterQueues ?? [],
    deadLetterReplayIdempotencyKeys: state.deadLetterReplayIdempotencyKeys ?? [],
    deadLetterReplayRequeueAudits: state.deadLetterReplayRequeueAudits ?? [],
    deadLetterReplayValidationDenials: state.deadLetterReplayValidationDenials ?? [],
    deadLetterReplays: state.deadLetterReplays ?? [],
    loadTestIdempotencyKeys: state.loadTestIdempotencyKeys ?? [],
    loadTestRunErrorSummaries: state.loadTestRunErrorSummaries ?? [],
    loadTestRunExecutions: state.loadTestRunExecutions ?? [],
    loadTestRunMetrics: state.loadTestRunMetrics ?? [],
    loadTestRuns: state.loadTestRuns ?? [],
    loadTestScenarios: state.loadTestScenarios ?? [],
    migrationCandidates: state.migrationCandidates ?? [],
    migrationRollbackCheckResults: state.migrationRollbackCheckResults ?? [],
    migrationRollbackChecks: state.migrationRollbackChecks ?? [],
    objectStorageRestoreCheckChecksumResults: state.objectStorageRestoreCheckChecksumResults ?? [],
    objectStorageRestoreCheckExistenceResults: state.objectStorageRestoreCheckExistenceResults ?? [],
    objectStorageRestoreCheckMetadataResults: state.objectStorageRestoreCheckMetadataResults ?? [],
    postgresRestoreCheckResults: state.postgresRestoreCheckResults ?? [],
    restoreCheckIdempotencyKeys: state.restoreCheckIdempotencyKeys ?? [],
    restoreChecks: state.restoreChecks ?? [],
    securityControls: state.securityControls ?? []
  };
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
