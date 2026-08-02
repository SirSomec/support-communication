import { randomUUID } from "node:crypto";
export const MIGRATION_ROLLBACK_METADATA_SCHEMA_VERSION = "migration-rollback-metadata/v1";
export const API_CONTRACT_SNAPSHOT_SCHEMA_VERSION = "api-contract-snapshot/v1";
export const REQUIRED_ENVELOPE_CONTRACT_FIELDS = [
    "data",
    "error",
    "meta",
    "operation",
    "partial",
    "service",
    "states",
    "status",
    "traceId",
    "updatedAt"
];
export function parseMigrationRollbackCheckRuntimeConfig(source = process.env) {
    const enabled = parseBoolean(source.MIGRATION_ROLLBACK_CHECK_ENABLED, true);
    const releaseChecklistScript = source.MIGRATION_ROLLBACK_CHECK_SCRIPT?.trim() || "migration-rollback-check:verify";
    return {
        enabled,
        releaseChecklistScript
    };
}
export function getMigrationRollbackCheckReleaseChecklistSteps(config = parseMigrationRollbackCheckRuntimeConfig()) {
    if (!config.enabled) {
        return [];
    }
    return [{
            name: "Migration rollback-check verification",
            script: config.releaseChecklistScript
        }];
}
export function validateMigrationRollbackMetadata(metadata) {
    const id = requireNonEmpty(metadata.id, "migration_metadata_id_required");
    const name = requireNonEmpty(metadata.name, "migration_metadata_name_required");
    const service = requireNonEmpty(metadata.service, "migration_metadata_service_required");
    const applyCommand = requireNonEmpty(metadata.applyCommand, "migration_metadata_apply_command_required");
    const rollbackCommand = requireNonEmpty(metadata.rollbackCommand, "migration_metadata_rollback_command_required");
    const status = metadata.status;
    if (status !== "planned" && status !== "ready" && status !== "blocked") {
        throw new Error("migration_metadata_status_invalid");
    }
    return {
        applyCommand,
        id,
        name,
        rollbackCommand,
        schemaVersion: MIGRATION_ROLLBACK_METADATA_SCHEMA_VERSION,
        service,
        status
    };
}
export function validateApiContractSnapshot(snapshot) {
    const migrationId = requireNonEmpty(snapshot.migrationId, "api_contract_snapshot_migration_id_required");
    if (!Array.isArray(snapshot.openapiPaths) || snapshot.openapiPaths.length === 0) {
        throw new Error("api_contract_snapshot_openapi_paths_required");
    }
    if (!Array.isArray(snapshot.envelopeFields) || snapshot.envelopeFields.length === 0) {
        throw new Error("api_contract_snapshot_envelope_fields_required");
    }
    if (!snapshot.responseFieldsByPath || typeof snapshot.responseFieldsByPath !== "object") {
        throw new Error("api_contract_snapshot_response_fields_required");
    }
    return {
        envelopeFields: [...snapshot.envelopeFields].sort(),
        migrationId,
        openapiPaths: [...snapshot.openapiPaths].sort(),
        responseFieldsByPath: cloneResponseFields(snapshot.responseFieldsByPath),
        schemaVersion: API_CONTRACT_SNAPSHOT_SCHEMA_VERSION
    };
}
export function checkAdditiveMigrationCompatibility(input) {
    const checks = [];
    checks.push({
        detail: input.metadata.rollbackCommand.includes("rollback")
            ? "Rollback command is present."
            : "Rollback command must include an explicit rollback target.",
        id: "rollback-plan",
        name: "Rollback plan",
        status: input.metadata.rollbackCommand.includes("rollback") ? "passed" : "failed"
    });
    const sql = input.migrationSql?.trim() ?? "";
    if (!sql) {
        checks.push({
            detail: "No migration SQL supplied; additive-only check skipped with warning.",
            id: "additive-migration",
            name: "Additive migration scan",
            status: "warn"
        });
    }
    else {
        const hasDestructive = hasDestructiveMigrationStatement(sql);
        const rollbackSafe = /--\s*rollback-safe\b/i.test(sql);
        checks.push({
            detail: hasDestructive && !rollbackSafe
                ? "Destructive DROP statements require rollback-safe annotation."
                : "Migration only adds schema objects or is explicitly rollback-safe.",
            id: "additive-migration",
            name: "Additive migration scan",
            status: hasDestructive && !rollbackSafe ? "failed" : "passed"
        });
    }
    return summarizeTooling("migration", checks);
}
function hasDestructiveMigrationStatement(sql) {
    return [
        /\bDROP\s+(TABLE|COLUMN)\b/i,
        /\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+COLUMN\b[\s\S]*?\bSET\s+NOT\s+NULL\b/i,
        /\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b/i,
        /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\s+(COLUMN\s+)?\b/i,
        /\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+CONSTRAINT\b/i
    ].some((pattern) => pattern.test(sql));
}
export function checkEnvelopeContractDiff(input) {
    const removed = input.before.envelopeFields.filter((field) => !input.after.envelopeFields.includes(field));
    const missingRequired = REQUIRED_ENVELOPE_CONTRACT_FIELDS.filter((field) => !input.after.envelopeFields.includes(field));
    const checks = [];
    checks.push({
        detail: removed.length === 0
            ? "No envelope fields were removed."
            : `Removed envelope fields: ${removed.join(", ")}`,
        id: "envelope-field-removals",
        name: "Envelope field removals",
        status: removed.length === 0 ? "passed" : "failed"
    });
    checks.push({
        detail: missingRequired.length === 0
            ? "All required envelope fields remain available."
            : `Missing required envelope fields: ${missingRequired.join(", ")}`,
        id: "envelope-required-fields",
        name: "Envelope required fields",
        status: missingRequired.length === 0 ? "passed" : "failed"
    });
    return summarizeTooling("envelope", checks);
}
export function checkOpenApiContractDiff(input) {
    const removedPaths = input.before.openapiPaths.filter((path) => !input.after.openapiPaths.includes(path));
    const checks = [{
            detail: removedPaths.length === 0
                ? "No OpenAPI paths were removed."
                : `Removed OpenAPI paths: ${removedPaths.join(", ")}`,
            id: "openapi-path-removals",
            name: "OpenAPI path removals",
            status: removedPaths.length === 0 ? "passed" : "failed"
        }];
    for (const path of input.before.openapiPaths) {
        const beforeFields = input.before.responseFieldsByPath[path] ?? [];
        const afterFields = input.after.responseFieldsByPath[path] ?? [];
        const removedFields = beforeFields.filter((field) => !afterFields.includes(field));
        if (removedFields.length > 0) {
            checks.push({
                detail: `Removed response fields for ${path}: ${removedFields.join(", ")}`,
                id: `openapi-response-${path.replace(/[^\w]+/g, "-")}`,
                name: `OpenAPI response fields for ${path}`,
                status: "failed"
            });
        }
    }
    if (checks.length === 1 && checks[0].status === "passed") {
        checks.push({
            detail: "No response field removals detected for existing paths.",
            id: "openapi-response-fields",
            name: "OpenAPI response field removals",
            status: "passed"
        });
    }
    return summarizeTooling("openapi", checks);
}
export function executeMigrationRollbackCheck(input) {
    const metadata = validateMigrationRollbackMetadata(input.metadata);
    const beforeSnapshot = validateApiContractSnapshot(input.beforeSnapshot);
    const afterSnapshot = validateApiContractSnapshot(input.afterSnapshot);
    const toolingResults = [
        checkAdditiveMigrationCompatibility({ metadata, migrationSql: input.migrationSql }),
        checkEnvelopeContractDiff({ after: afterSnapshot, before: beforeSnapshot }),
        checkOpenApiContractDiff({ after: afterSnapshot, before: beforeSnapshot })
    ];
    const status = aggregateRollbackCheckStatus(toolingResults);
    const result = persistMigrationRollbackCheckResult(input.operationsRepository, {
        afterSnapshot,
        auditEvent: {
            action: "operations.migration.rollback_check.tooling",
            id: `evt_migration_rollback_check_${randomUUID()}`,
            immutable: true,
            migrationId: metadata.id,
            reason: input.reason.trim(),
            status,
            target: metadata.id
        },
        beforeSnapshot,
        checkedAt: (input.now ?? new Date()).toISOString(),
        id: makeMigrationRollbackCheckResultId(),
        metadata,
        migrationId: metadata.id,
        reason: input.reason.trim(),
        status,
        toolingResults
    });
    return { result, toolingResults };
}
export async function executeMigrationRollbackCheckAsync(input) {
    const metadata = validateMigrationRollbackMetadata(input.metadata);
    const beforeSnapshot = validateApiContractSnapshot(input.beforeSnapshot);
    const afterSnapshot = validateApiContractSnapshot(input.afterSnapshot);
    const toolingResults = [
        checkAdditiveMigrationCompatibility({ metadata, migrationSql: input.migrationSql }),
        checkEnvelopeContractDiff({ after: afterSnapshot, before: beforeSnapshot }),
        checkOpenApiContractDiff({ after: afterSnapshot, before: beforeSnapshot })
    ];
    const status = aggregateRollbackCheckStatus(toolingResults);
    const result = await persistMigrationRollbackCheckResultAsync(input.operationsRepository, {
        afterSnapshot,
        auditEvent: {
            action: "operations.migration.rollback_check.tooling",
            id: `evt_migration_rollback_check_${randomUUID()}`,
            immutable: true,
            migrationId: metadata.id,
            reason: input.reason.trim(),
            status,
            target: metadata.id
        },
        beforeSnapshot,
        checkedAt: (input.now ?? new Date()).toISOString(),
        id: makeMigrationRollbackCheckResultId(),
        metadata,
        migrationId: metadata.id,
        reason: input.reason.trim(),
        status,
        toolingResults
    });
    return { result, toolingResults };
}
export function persistMigrationRollbackCheckResult(operationsRepository, record) {
    return operationsRepository.saveMigrationRollbackCheckResult(record);
}
export function persistMigrationRollbackCheckResultAsync(operationsRepository, record) {
    return operationsRepository.saveMigrationRollbackCheckResultAsync(record);
}
export function findMigrationRollbackCheckResult(operationsRepository, resultId) {
    return operationsRepository.findMigrationRollbackCheckResult(resultId);
}
export function migrationMetadataFromCandidate(candidate) {
    return validateMigrationRollbackMetadata({
        applyCommand: candidate.applyCommand,
        id: candidate.id,
        name: candidate.name,
        rollbackCommand: candidate.rollbackCommand,
        schemaVersion: MIGRATION_ROLLBACK_METADATA_SCHEMA_VERSION,
        service: candidate.service,
        status: candidate.status
    });
}
function summarizeTooling(tooling, checks) {
    return {
        checks,
        status: aggregateCheckStatuses(checks.map((check) => check.status)),
        tooling
    };
}
function aggregateRollbackCheckStatus(results) {
    return aggregateCheckStatuses(results.map((result) => result.status));
}
function aggregateCheckStatuses(statuses) {
    if (statuses.includes("failed")) {
        return "failed";
    }
    if (statuses.includes("warn")) {
        return "warn";
    }
    return "passed";
}
function cloneResponseFields(value) {
    return Object.fromEntries(Object.entries(value).map(([path, fields]) => [path, [...fields].sort()]));
}
function makeMigrationRollbackCheckResultId() {
    return `migration_rollback_check_result_${randomUUID()}`;
}
function parseBoolean(value, fallback) {
    if (value === undefined) {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
        return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no") {
        return false;
    }
    return fallback;
}
function requireNonEmpty(value, code) {
    const normalized = value?.trim();
    if (!normalized) {
        throw new Error(code);
    }
    return normalized;
}
//# sourceMappingURL=migration-rollback-check.worker.js.map