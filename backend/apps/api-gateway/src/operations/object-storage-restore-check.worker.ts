import { createHash, randomUUID } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
import {
  type OperationsObjectStorageRestoreCheckChecksumResultRecord,
  type OperationsObjectStorageRestoreCheckExistenceResultRecord,
  type OperationsObjectStorageRestoreCheckMetadataResultRecord,
  type OperationsRepository
} from "./operations.repository.js";

export const OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION = "object-storage-restore-metadata/v1" as const;

export interface ObjectStorageRestoreCheckArtifactMetadata {
  backupLabel: string;
  contentType: string;
  schemaVersion: typeof OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION;
  sizeBytes: number;
}

export interface ObjectStorageRestoreCheckArtifact {
  artifactId: string;
  expectedChecksum?: string;
  expectedMetadata?: ObjectStorageRestoreCheckArtifactMetadata;
  signedUrl: string;
}

export interface ObjectStorageRestoreCheckVerificationRequest {
  artifact: ObjectStorageRestoreCheckArtifact;
  drillId: string;
  restoreCheckId: string;
}

export interface ObjectStorageRestoreCheckExistenceVerification {
  exists: boolean;
  ok: boolean;
  status: OperationsObjectStorageRestoreCheckExistenceResultRecord["status"];
}

export interface ObjectStorageRestoreCheckChecksumVerification {
  actualChecksum: string;
  expectedChecksum: string;
  ok: boolean;
  status: OperationsObjectStorageRestoreCheckChecksumResultRecord["status"];
}

export interface ObjectStorageRestoreCheckMetadataVerification {
  actualMetadata: ObjectStorageRestoreCheckArtifactMetadata | null;
  expectedMetadata: ObjectStorageRestoreCheckArtifactMetadata;
  ok: boolean;
  status: OperationsObjectStorageRestoreCheckMetadataResultRecord["status"];
}

export interface ObjectStorageRestoreCheckExistencePort {
  verify(request: ObjectStorageRestoreCheckVerificationRequest): Promise<ObjectStorageRestoreCheckExistenceVerification>;
}

export interface ObjectStorageRestoreCheckChecksumPort {
  verify(request: ObjectStorageRestoreCheckVerificationRequest): Promise<ObjectStorageRestoreCheckChecksumVerification>;
}

export interface ObjectStorageRestoreCheckMetadataPort {
  verify(request: ObjectStorageRestoreCheckVerificationRequest): Promise<ObjectStorageRestoreCheckMetadataVerification>;
}

export interface ObjectStorageRestoreCheckDenialEnvelope {
  artifactId: string;
  code: string;
  drillId: string;
  message: string;
  restoreCheckId: string;
  sanitized: true;
}

export interface DeterministicObjectStorageRestoreCheckAdapterOptions {
  artifacts?: Map<string, {
    checksum?: string;
    exists?: boolean;
    metadata?: ObjectStorageRestoreCheckArtifactMetadata;
  }>;
}

export function createObjectStorageRestoreCheckExistencePort(
  verifier: ObjectStorageRestoreCheckExistencePort["verify"]
): ObjectStorageRestoreCheckExistencePort {
  return { verify: verifier };
}

export function createObjectStorageRestoreCheckChecksumPort(
  verifier: ObjectStorageRestoreCheckChecksumPort["verify"]
): ObjectStorageRestoreCheckChecksumPort {
  return { verify: verifier };
}

export function createObjectStorageRestoreCheckMetadataPort(
  verifier: ObjectStorageRestoreCheckMetadataPort["verify"]
): ObjectStorageRestoreCheckMetadataPort {
  return { verify: verifier };
}

export function createDeterministicObjectStorageRestoreCheckAdapters(
  options: DeterministicObjectStorageRestoreCheckAdapterOptions = {}
): {
  checksumPort: ObjectStorageRestoreCheckChecksumPort;
  existencePort: ObjectStorageRestoreCheckExistencePort;
  metadataPort: ObjectStorageRestoreCheckMetadataPort;
} {
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

export async function verifyObjectStorageRestoreCheckExistence(input: {
  existencePort: ObjectStorageRestoreCheckExistencePort;
  now?: Date;
  operationsRepository: OperationsRepository;
  request: ObjectStorageRestoreCheckVerificationRequest;
}): Promise<{
  denial: ObjectStorageRestoreCheckDenialEnvelope | null;
  result: OperationsObjectStorageRestoreCheckExistenceResultRecord;
}> {
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

export async function verifyObjectStorageRestoreCheckChecksum(input: {
  checksumPort: ObjectStorageRestoreCheckChecksumPort;
  now?: Date;
  operationsRepository: OperationsRepository;
  request: ObjectStorageRestoreCheckVerificationRequest;
}): Promise<{
  denial: ObjectStorageRestoreCheckDenialEnvelope | null;
  result: OperationsObjectStorageRestoreCheckChecksumResultRecord;
}> {
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

export async function verifyObjectStorageRestoreCheckMetadata(input: {
  metadataPort: ObjectStorageRestoreCheckMetadataPort;
  now?: Date;
  operationsRepository: OperationsRepository;
  request: ObjectStorageRestoreCheckVerificationRequest;
}): Promise<{
  denial: ObjectStorageRestoreCheckDenialEnvelope | null;
  result: OperationsObjectStorageRestoreCheckMetadataResultRecord;
}> {
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

export function persistObjectStorageRestoreCheckExistenceResult(
  operationsRepository: OperationsRepository,
  record: OperationsObjectStorageRestoreCheckExistenceResultRecord
): OperationsObjectStorageRestoreCheckExistenceResultRecord {
  return operationsRepository.saveObjectStorageRestoreCheckExistenceResult(record);
}

export function persistObjectStorageRestoreCheckChecksumResult(
  operationsRepository: OperationsRepository,
  record: OperationsObjectStorageRestoreCheckChecksumResultRecord
): OperationsObjectStorageRestoreCheckChecksumResultRecord {
  return operationsRepository.saveObjectStorageRestoreCheckChecksumResult(record);
}

export function persistObjectStorageRestoreCheckMetadataResult(
  operationsRepository: OperationsRepository,
  record: OperationsObjectStorageRestoreCheckMetadataResultRecord
): OperationsObjectStorageRestoreCheckMetadataResultRecord {
  return operationsRepository.saveObjectStorageRestoreCheckMetadataResult(record);
}

export function createMissingArtifactDenialEnvelope(input: {
  artifactId: string;
  drillId: string;
  restoreCheckId: string;
  signedUrl: string;
}): ObjectStorageRestoreCheckDenialEnvelope {
  return {
    artifactId: input.artifactId,
    code: "object_storage_restore_check_artifact_missing",
    drillId: input.drillId,
    message: sanitizeRestoreCheckDetail(`signed restore artifact is missing for ${sanitizeSignedUrl(input.signedUrl)}`),
    restoreCheckId: input.restoreCheckId,
    sanitized: true
  };
}

export function createChecksumMismatchDenialEnvelope(input: {
  actualChecksum: string;
  artifactId: string;
  drillId: string;
  expectedChecksum: string;
  restoreCheckId: string;
}): ObjectStorageRestoreCheckDenialEnvelope {
  return {
    artifactId: input.artifactId,
    code: "object_storage_restore_check_checksum_mismatch",
    drillId: input.drillId,
    message: sanitizeRestoreCheckDetail(
      `checksum mismatch for artifact ${input.artifactId}: expected ${input.expectedChecksum}, actual ${input.actualChecksum}`
    ),
    restoreCheckId: input.restoreCheckId,
    sanitized: true
  };
}

export function createMetadataMismatchDenialEnvelope(input: {
  actualMetadata: ObjectStorageRestoreCheckArtifactMetadata | null;
  artifactId: string;
  drillId: string;
  expectedMetadata: ObjectStorageRestoreCheckArtifactMetadata;
  restoreCheckId: string;
}): ObjectStorageRestoreCheckDenialEnvelope {
  const actualLabel = input.actualMetadata?.backupLabel ?? "unknown";
  const expectedLabel = input.expectedMetadata.backupLabel;

  return {
    artifactId: input.artifactId,
    code: "object_storage_restore_check_metadata_mismatch",
    drillId: input.drillId,
    message: sanitizeRestoreCheckDetail(
      `metadata mismatch for artifact ${input.artifactId}: expected backupLabel=${expectedLabel}, actual backupLabel=${actualLabel}`
    ),
    restoreCheckId: input.restoreCheckId,
    sanitized: true
  };
}

function defaultArtifactMetadata(artifactId: string): ObjectStorageRestoreCheckArtifactMetadata {
  return {
    backupLabel: artifactId,
    contentType: "application/json",
    schemaVersion: OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION,
    sizeBytes: 1024
  };
}

function makeObjectStorageRestoreCheckResultId(kind: "checksum" | "existence" | "metadata"): string {
  return `object_storage_restore_${kind}_${randomUUID()}`;
}

function metadataMatches(
  actual: ObjectStorageRestoreCheckArtifactMetadata,
  expected: ObjectStorageRestoreCheckArtifactMetadata
): boolean {
  return actual.backupLabel === expected.backupLabel
    && actual.contentType === expected.contentType
    && actual.schemaVersion === expected.schemaVersion
    && actual.sizeBytes === expected.sizeBytes;
}

function sanitizeRestoreCheckDetail(value: string): string {
  return redactSensitiveText(value);
}

function sanitizeSignedUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.search) {
      url.search = "?[REDACTED:secret]";
    }
    return url.toString();
  } catch {
    return redactSensitiveText(value);
  }
}

export function fingerprintObjectStorageRestoreCheckArtifact(artifact: ObjectStorageRestoreCheckArtifact): string {
  return createHash("sha256").update(JSON.stringify({
    artifactId: artifact.artifactId,
    expectedChecksum: artifact.expectedChecksum ?? null,
    expectedMetadata: artifact.expectedMetadata ?? null,
    signedUrlHost: safeUrlHost(artifact.signedUrl)
  })).digest("hex");
}

function safeUrlHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "invalid-host";
  }
}
