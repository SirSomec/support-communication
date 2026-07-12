export * from "./seed-catalog.js";

import {
  backupDrills,
  deadLetterMessages,
  deadLetterQueues,
  loadTestScenarios,
  migrationCandidates,
  securityControls
} from "./seed-catalog.js";
import type { OperationsState } from "./operations.repository.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function bootstrapOperationsState(base?: Partial<OperationsState>): OperationsState {
  return {
    backupDrills: clone(backupDrills),
    deadLetterMessages: clone(deadLetterMessages),
    deadLetterQueues: clone(deadLetterQueues),
    deadLetterReplayIdempotencyKeys: base?.deadLetterReplayIdempotencyKeys ?? [],
    deadLetterReplayRequeueAudits: base?.deadLetterReplayRequeueAudits ?? [],
    deadLetterReplayValidationDenials: base?.deadLetterReplayValidationDenials ?? [],
    deadLetterReplays: base?.deadLetterReplays ?? [],
    loadTestIdempotencyKeys: base?.loadTestIdempotencyKeys ?? [],
    loadTestRunErrorSummaries: base?.loadTestRunErrorSummaries ?? [],
    loadTestRunExecutions: base?.loadTestRunExecutions ?? [],
    loadTestRunMetrics: base?.loadTestRunMetrics ?? [],
    loadTestRuns: base?.loadTestRuns ?? [],
    loadTestScenarios: clone(loadTestScenarios),
    migrationCandidates: clone(migrationCandidates),
    migrationRollbackCheckResults: base?.migrationRollbackCheckResults ?? [],
    migrationRollbackChecks: base?.migrationRollbackChecks ?? [],
    objectStorageRestoreCheckChecksumResults: base?.objectStorageRestoreCheckChecksumResults ?? [],
    objectStorageRestoreCheckExistenceResults: base?.objectStorageRestoreCheckExistenceResults ?? [],
    objectStorageRestoreCheckMetadataResults: base?.objectStorageRestoreCheckMetadataResults ?? [],
    postgresRestoreCheckResults: base?.postgresRestoreCheckResults ?? [],
    restoreCheckIdempotencyKeys: base?.restoreCheckIdempotencyKeys ?? [],
    restoreChecks: base?.restoreChecks ?? [],
    securityControls: clone(securityControls)
  };
}
