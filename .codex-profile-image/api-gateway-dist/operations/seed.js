export * from "./seed-catalog.js";
import { backupDrills, deadLetterMessages, deadLetterQueues, loadTestScenarios, migrationCandidates, securityControls } from "./seed-catalog.js";
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
export function bootstrapOperationsState(base) {
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
//# sourceMappingURL=seed.js.map