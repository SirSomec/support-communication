import { type OperationsObjectStorageRestoreCheckChecksumResultRecord, type OperationsObjectStorageRestoreCheckExistenceResultRecord, type OperationsObjectStorageRestoreCheckMetadataResultRecord, type OperationsRepository } from "./operations.repository.js";
export declare const OBJECT_STORAGE_RESTORE_CHECK_METADATA_SCHEMA_VERSION: "object-storage-restore-metadata/v1";
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
export declare function createObjectStorageRestoreCheckExistencePort(verifier: ObjectStorageRestoreCheckExistencePort["verify"]): ObjectStorageRestoreCheckExistencePort;
export declare function createObjectStorageRestoreCheckChecksumPort(verifier: ObjectStorageRestoreCheckChecksumPort["verify"]): ObjectStorageRestoreCheckChecksumPort;
export declare function createObjectStorageRestoreCheckMetadataPort(verifier: ObjectStorageRestoreCheckMetadataPort["verify"]): ObjectStorageRestoreCheckMetadataPort;
export declare function createDeterministicObjectStorageRestoreCheckAdapters(options?: DeterministicObjectStorageRestoreCheckAdapterOptions): {
    checksumPort: ObjectStorageRestoreCheckChecksumPort;
    existencePort: ObjectStorageRestoreCheckExistencePort;
    metadataPort: ObjectStorageRestoreCheckMetadataPort;
};
export declare function verifyObjectStorageRestoreCheckExistence(input: {
    existencePort: ObjectStorageRestoreCheckExistencePort;
    now?: Date;
    operationsRepository: OperationsRepository;
    request: ObjectStorageRestoreCheckVerificationRequest;
}): Promise<{
    denial: ObjectStorageRestoreCheckDenialEnvelope | null;
    result: OperationsObjectStorageRestoreCheckExistenceResultRecord;
}>;
export declare function verifyObjectStorageRestoreCheckChecksum(input: {
    checksumPort: ObjectStorageRestoreCheckChecksumPort;
    now?: Date;
    operationsRepository: OperationsRepository;
    request: ObjectStorageRestoreCheckVerificationRequest;
}): Promise<{
    denial: ObjectStorageRestoreCheckDenialEnvelope | null;
    result: OperationsObjectStorageRestoreCheckChecksumResultRecord;
}>;
export declare function verifyObjectStorageRestoreCheckMetadata(input: {
    metadataPort: ObjectStorageRestoreCheckMetadataPort;
    now?: Date;
    operationsRepository: OperationsRepository;
    request: ObjectStorageRestoreCheckVerificationRequest;
}): Promise<{
    denial: ObjectStorageRestoreCheckDenialEnvelope | null;
    result: OperationsObjectStorageRestoreCheckMetadataResultRecord;
}>;
export declare function persistObjectStorageRestoreCheckExistenceResult(operationsRepository: OperationsRepository, record: OperationsObjectStorageRestoreCheckExistenceResultRecord): OperationsObjectStorageRestoreCheckExistenceResultRecord;
export declare function persistObjectStorageRestoreCheckChecksumResult(operationsRepository: OperationsRepository, record: OperationsObjectStorageRestoreCheckChecksumResultRecord): OperationsObjectStorageRestoreCheckChecksumResultRecord;
export declare function persistObjectStorageRestoreCheckMetadataResult(operationsRepository: OperationsRepository, record: OperationsObjectStorageRestoreCheckMetadataResultRecord): OperationsObjectStorageRestoreCheckMetadataResultRecord;
export declare function createMissingArtifactDenialEnvelope(input: {
    artifactId: string;
    drillId: string;
    restoreCheckId: string;
    signedUrl: string;
}): ObjectStorageRestoreCheckDenialEnvelope;
export declare function createChecksumMismatchDenialEnvelope(input: {
    actualChecksum: string;
    artifactId: string;
    drillId: string;
    expectedChecksum: string;
    restoreCheckId: string;
}): ObjectStorageRestoreCheckDenialEnvelope;
export declare function createMetadataMismatchDenialEnvelope(input: {
    actualMetadata: ObjectStorageRestoreCheckArtifactMetadata | null;
    artifactId: string;
    drillId: string;
    expectedMetadata: ObjectStorageRestoreCheckArtifactMetadata;
    restoreCheckId: string;
}): ObjectStorageRestoreCheckDenialEnvelope;
export declare function fingerprintObjectStorageRestoreCheckArtifact(artifact: ObjectStorageRestoreCheckArtifact): string;
