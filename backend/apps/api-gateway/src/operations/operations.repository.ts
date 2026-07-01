import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";

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
  deadLetterReplayIdempotencyKeys: OperationsIdempotencyRecord[];
  deadLetterReplayRequeueAudits: OperationsDeadLetterReplayRequeueAuditRecord[];
  deadLetterReplayValidationDenials: OperationsDeadLetterReplayValidationDenialRecord[];
  deadLetterReplays: OperationsDeadLetterReplayRecord[];
  loadTestIdempotencyKeys: OperationsIdempotencyRecord[];
  loadTestRunErrorSummaries: OperationsLoadTestRunErrorSummaryRecord[];
  loadTestRunExecutions: OperationsLoadTestRunExecutionRecord[];
  loadTestRunMetrics: OperationsLoadTestRunMetricsRecord[];
  loadTestRuns: OperationsLoadTestRunRecord[];
  migrationRollbackCheckResults: OperationsMigrationRollbackCheckResultRecord[];
  migrationRollbackChecks: OperationsMigrationRollbackCheckRecord[];
  objectStorageRestoreCheckChecksumResults: OperationsObjectStorageRestoreCheckChecksumResultRecord[];
  objectStorageRestoreCheckExistenceResults: OperationsObjectStorageRestoreCheckExistenceResultRecord[];
  objectStorageRestoreCheckMetadataResults: OperationsObjectStorageRestoreCheckMetadataResultRecord[];
  postgresRestoreCheckResults: OperationsPostgresRestoreCheckResultRecord[];
  restoreCheckIdempotencyKeys: OperationsIdempotencyRecord[];
  restoreChecks: OperationsRestoreCheckRecord[];
}

interface OperationsRepositoryOptions {
  filePath: string;
}

let defaultRepository: OperationsRepository | null = null;

export class OperationsRepository {
  private constructor(private readonly store: DurableStore<OperationsState>) {}

  static default(): OperationsRepository {
    return defaultRepository ?? OperationsRepository.inMemory();
  }

  static useDefault(repository: OperationsRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: OperationsState = seedOperationsState()): OperationsRepository {
    return new OperationsRepository(new InMemoryStore(seed));
  }

  static open({ filePath }: OperationsRepositoryOptions): OperationsRepository {
    return new OperationsRepository(new JsonFileStore({ filePath, seed: seedOperationsState() }));
  }

  readState(): OperationsState {
    return normalizeState(this.store.read());
  }

  findLoadTestIdempotencyKey(key: string): OperationsIdempotencyRecord | undefined {
    return clone(this.readState().loadTestIdempotencyKeys.find((item) => item.key === key));
  }

  saveLoadTestIdempotencyKey(record: OperationsIdempotencyRecord): OperationsIdempotencyRecord {
    return this.saveIdempotencyKey("loadTestIdempotencyKeys", record);
  }

  saveLoadTestRun(record: OperationsLoadTestRunRecord): OperationsLoadTestRunRecord {
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

function seedOperationsState(): OperationsState {
  return {
    deadLetterReplayIdempotencyKeys: [],
    deadLetterReplayRequeueAudits: [],
    deadLetterReplayValidationDenials: [],
    deadLetterReplays: [],
    loadTestIdempotencyKeys: [],
    loadTestRunErrorSummaries: [],
    loadTestRunExecutions: [],
    loadTestRunMetrics: [],
    loadTestRuns: [],
    migrationRollbackCheckResults: [],
    migrationRollbackChecks: [],
    objectStorageRestoreCheckChecksumResults: [],
    objectStorageRestoreCheckExistenceResults: [],
    objectStorageRestoreCheckMetadataResults: [],
    postgresRestoreCheckResults: [],
    restoreCheckIdempotencyKeys: [],
    restoreChecks: []
  };
}

function normalizeState(state: Partial<OperationsState>): OperationsState {
  return {
    deadLetterReplayIdempotencyKeys: state.deadLetterReplayIdempotencyKeys ?? [],
    deadLetterReplayRequeueAudits: state.deadLetterReplayRequeueAudits ?? [],
    deadLetterReplayValidationDenials: state.deadLetterReplayValidationDenials ?? [],
    deadLetterReplays: state.deadLetterReplays ?? [],
    loadTestIdempotencyKeys: state.loadTestIdempotencyKeys ?? [],
    loadTestRunErrorSummaries: state.loadTestRunErrorSummaries ?? [],
    loadTestRunExecutions: state.loadTestRunExecutions ?? [],
    loadTestRunMetrics: state.loadTestRunMetrics ?? [],
    loadTestRuns: state.loadTestRuns ?? [],
    migrationRollbackCheckResults: state.migrationRollbackCheckResults ?? [],
    migrationRollbackChecks: state.migrationRollbackChecks ?? [],
    objectStorageRestoreCheckChecksumResults: state.objectStorageRestoreCheckChecksumResults ?? [],
    objectStorageRestoreCheckExistenceResults: state.objectStorageRestoreCheckExistenceResults ?? [],
    objectStorageRestoreCheckMetadataResults: state.objectStorageRestoreCheckMetadataResults ?? [],
    postgresRestoreCheckResults: state.postgresRestoreCheckResults ?? [],
    restoreCheckIdempotencyKeys: state.restoreCheckIdempotencyKeys ?? [],
    restoreChecks: state.restoreChecks ?? []
  };
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
