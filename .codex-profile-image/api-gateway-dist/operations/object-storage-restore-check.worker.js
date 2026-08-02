import { createHash, randomUUID } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
export const OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION = "object-storage-restore-metadata/v1";
export function createObjectStorageRestoreCheckExistencePort(verifier) {
    return { verify: verifier };
}
export function createObjectStorageRestoreCheckChecksumPort(verifier) {
    return { verify: verifier };
}
export function createObjectStorageRestoreCheckMetadataPort(verifier) {
    return { verify: verifier };
}
export function createDeterministicObjectStorageRestoreCheckAdapters(options = {}) {
    const artifacts = options.artifacts ?? new Map();
    const existencePort = createObjectStorageRestoreCheckExistencePort(async (request) => {
        const configured = artifacts.get(request.artifact.artifactId);
        const exists = configured?.exists ?? true;
        return {
            exists,
            ok: exists,
            status: exists ? "passed" : "missing"
        };
    });
    const checksumPort = createObjectStorageRestoreCheckChecksumPort(async (request) => {
        const configured = artifacts.get(request.artifact.artifactId);
        const expectedChecksum = request.artifact.expectedChecksum ?? configured?.checksum ?? "sha256:missing-expected";
        const actualChecksum = configured?.checksum ?? expectedChecksum;
        const ok = actualChecksum === expectedChecksum;
        return {
            actualChecksum,
            expectedChecksum,
            ok,
            status: ok ? "passed" : "mismatch"
        };
    });
    const metadataPort = createObjectStorageRestoreCheckMetadataPort(async (request) => {
        const configured = artifacts.get(request.artifact.artifactId);
        const expectedMetadata = request.artifact.expectedMetadata ?? defaultArtifactMetadata(request.artifact.artifactId);
        const actualMetadata = configured?.metadata ?? expectedMetadata;
        const ok = metadataMatches(actualMetadata, expectedMetadata);
        return {
            actualMetadata,
            expectedMetadata,
            ok,
            status: ok ? "passed" : "mismatch"
        };
    });
    return { checksumPort, existencePort, metadataPort };
}
export async function verifyObjectStorageRestoreCheckExistence(input) {
    const verification = await input.existencePort.verify(input.request);
    const result = await input.operationsRepository.saveObjectStorageRestoreCheckExistenceResultAsync({
        artifactId: input.request.artifact.artifactId,
        drillId: input.request.drillId,
        exists: verification.exists,
        id: makeObjectStorageRestoreCheckResultId("existence"),
        restoreCheckId: input.request.restoreCheckId,
        status: verification.status,
        verifiedAt: (input.now ?? new Date()).toISOString()
    });
    return {
        denial: verification.ok ? null : createMissingArtifactDenialEnvelope({
            artifactId: input.request.artifact.artifactId,
            drillId: input.request.drillId,
            restoreCheckId: input.request.restoreCheckId,
            signedUrl: input.request.artifact.signedUrl
        }),
        result
    };
}
export async function verifyObjectStorageRestoreCheckChecksum(input) {
    const verification = await input.checksumPort.verify(input.request);
    const result = await input.operationsRepository.saveObjectStorageRestoreCheckChecksumResultAsync({
        actualChecksum: verification.actualChecksum,
        artifactId: input.request.artifact.artifactId,
        drillId: input.request.drillId,
        expectedChecksum: verification.expectedChecksum,
        id: makeObjectStorageRestoreCheckResultId("checksum"),
        restoreCheckId: input.request.restoreCheckId,
        status: verification.status,
        verifiedAt: (input.now ?? new Date()).toISOString()
    });
    return {
        denial: verification.ok ? null : createChecksumMismatchDenialEnvelope({
            actualChecksum: verification.actualChecksum,
            artifactId: input.request.artifact.artifactId,
            drillId: input.request.drillId,
            expectedChecksum: verification.expectedChecksum,
            restoreCheckId: input.request.restoreCheckId
        }),
        result
    };
}
export async function verifyObjectStorageRestoreCheckMetadata(input) {
    const verification = await input.metadataPort.verify(input.request);
    const result = await input.operationsRepository.saveObjectStorageRestoreCheckMetadataResultAsync({
        actualMetadata: verification.actualMetadata,
        artifactId: input.request.artifact.artifactId,
        drillId: input.request.drillId,
        expectedMetadata: verification.expectedMetadata,
        id: makeObjectStorageRestoreCheckResultId("metadata"),
        restoreCheckId: input.request.restoreCheckId,
        status: verification.status,
        verifiedAt: (input.now ?? new Date()).toISOString()
    });
    return {
        denial: verification.ok ? null : createMetadataMismatchDenialEnvelope({
            actualMetadata: verification.actualMetadata,
            artifactId: input.request.artifact.artifactId,
            drillId: input.request.drillId,
            expectedMetadata: verification.expectedMetadata,
            restoreCheckId: input.request.restoreCheckId
        }),
        result
    };
}
export function persistObjectStorageRestoreCheckExistenceResult(operationsRepository, record) {
    return operationsRepository.saveObjectStorageRestoreCheckExistenceResult(record);
}
export function persistObjectStorageRestoreCheckChecksumResult(operationsRepository, record) {
    return operationsRepository.saveObjectStorageRestoreCheckChecksumResult(record);
}
export function persistObjectStorageRestoreCheckMetadataResult(operationsRepository, record) {
    return operationsRepository.saveObjectStorageRestoreCheckMetadataResult(record);
}
export function createMissingArtifactDenialEnvelope(input) {
    return {
        artifactId: input.artifactId,
        code: "object_storage_restore_check_artifact_missing",
        drillId: input.drillId,
        message: sanitizeRestoreCheckDetail(`signed restore artifact is missing for ${sanitizeSignedUrl(input.signedUrl)}`),
        restoreCheckId: input.restoreCheckId,
        sanitized: true
    };
}
export function createChecksumMismatchDenialEnvelope(input) {
    return {
        artifactId: input.artifactId,
        code: "object_storage_restore_check_checksum_mismatch",
        drillId: input.drillId,
        message: sanitizeRestoreCheckDetail(`checksum mismatch for artifact ${input.artifactId}: expected ${input.expectedChecksum}, actual ${input.actualChecksum}`),
        restoreCheckId: input.restoreCheckId,
        sanitized: true
    };
}
export function createMetadataMismatchDenialEnvelope(input) {
    const actualLabel = input.actualMetadata?.backupLabel ?? "unknown";
    const expectedLabel = input.expectedMetadata.backupLabel;
    return {
        artifactId: input.artifactId,
        code: "object_storage_restore_check_metadata_mismatch",
        drillId: input.drillId,
        message: sanitizeRestoreCheckDetail(`metadata mismatch for artifact ${input.artifactId}: expected backupLabel=${expectedLabel}, actual backupLabel=${actualLabel}`),
        restoreCheckId: input.restoreCheckId,
        sanitized: true
    };
}
function defaultArtifactMetadata(artifactId) {
    return {
        backupLabel: artifactId,
        contentType: "application/json",
        schemaVersion: OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
        sizeBytes: 1024
    };
}
function makeObjectStorageRestoreCheckResultId(kind) {
    return `object_storage_restore_${kind}_${randomUUID()}`;
}
function metadataMatches(actual, expected) {
    return actual.backupLabel === expected.backupLabel
        && actual.contentType === expected.contentType
        && actual.schemaVersion === expected.schemaVersion
        && actual.sizeBytes === expected.sizeBytes;
}
function sanitizeRestoreCheckDetail(value) {
    return redactSensitiveText(value);
}
function sanitizeSignedUrl(value) {
    try {
        const url = new URL(value);
        if (url.search) {
            url.search = "?[REDACTED:secret]";
        }
        return url.toString();
    }
    catch {
        return redactSensitiveText(value);
    }
}
export function fingerprintObjectStorageRestoreCheckArtifact(artifact) {
    return createHash("sha256").update(JSON.stringify({
        artifactId: artifact.artifactId,
        expectedChecksum: artifact.expectedChecksum ?? null,
        expectedMetadata: artifact.expectedMetadata ?? null,
        signedUrlHost: safeUrlHost(artifact.signedUrl)
    })).digest("hex");
}
function safeUrlHost(value) {
    try {
        return new URL(value).host;
    }
    catch {
        return "invalid-host";
    }
}
//# sourceMappingURL=object-storage-restore-check.worker.js.map