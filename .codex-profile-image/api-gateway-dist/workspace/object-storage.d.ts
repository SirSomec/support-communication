import { type ObjectStorageMetadataInput, type ObjectStorageObjectMetadata, type ObjectStorageSigner } from "./workspace.service.js";
export interface ObjectStorageSignerSource {
    S3_ACCESS_KEY?: string;
    S3_BUCKET?: string;
    S3_ENDPOINT?: string;
    /**
     * Публичная база для БРАУЗЕРНЫХ upload-URL (напр. "/s3"): подпись остаётся
     * по хосту S3_ENDPOINT, а origin URL заменяется на относительный префикс —
     * файл уходит same-origin через nginx-прокси (см. docker/nginx.conf),
     * что не требует DNS до minio и проходит CSP connect-src 'self'.
     * Серверные операции (signDownload, метаданные) продолжают ходить напрямую.
     */
    S3_PUBLIC_UPLOAD_BASE?: string;
    S3_REGION?: string;
    S3_SECRET_KEY?: string;
}
export interface ObjectStorageSignerOptions {
    expiresSeconds?: number;
    metadataFetcher?: ObjectStorageMetadataFetch;
    metadataTimeoutMs?: number;
    now?: () => Date;
}
interface ObjectStorageMetadataFetch {
    (input: string, init: {
        method: "HEAD";
        signal: AbortSignal;
    }): Promise<{
        headers: {
            get(name: string): string | null;
        };
        ok: boolean;
        status: number;
    }>;
}
export interface DeterministicObjectStorageSignerOptions extends ObjectStorageSignerOptions {
    metadata?: (input: ObjectStorageMetadataInput) => ObjectStorageObjectMetadata | undefined;
    metadataByFileId?: Record<string, ObjectStorageObjectMetadata | undefined>;
    onMetadataInput?: (input: ObjectStorageMetadataInput) => void;
}
export declare function createObjectStorageSigner(source?: ObjectStorageSignerSource, options?: ObjectStorageSignerOptions): ObjectStorageSigner;
export declare function createDeterministicObjectStorageSigner(options?: DeterministicObjectStorageSignerOptions): ObjectStorageSigner;
export declare function createS3CompatibleObjectStorageSigner(source: Required<Pick<ObjectStorageSignerSource, "S3_ACCESS_KEY" | "S3_BUCKET" | "S3_ENDPOINT" | "S3_SECRET_KEY">> & ObjectStorageSignerSource, options?: ObjectStorageSignerOptions): ObjectStorageSigner;
export declare function createLocalObjectStorageSigner(options?: ObjectStorageSignerOptions): ObjectStorageSigner;
export {};
