import { createHash } from "node:crypto";
import { createS3CompatibleObjectStorageSigner } from "../workspace/object-storage.js";
import { createLocalReportObjectStorageAdapter } from "./report-export.worker.js";
export function createSharedReportObjectStorage(source = process.env, options = {}) {
    if (resolveReportObjectStorageMode(source) === "local") {
        const local = createLocalReportObjectStorageAdapter({
            now: options.now,
            rootDir: source.REPORT_EXPORT_OBJECT_ROOT?.trim() || ".runtime/report-exports"
        });
        return {
            ...local,
            async signDownload(input) {
                return {
                    downloadUrl: `/api/v1/reports/exports/${encodeURIComponent(input.jobId)}/download`,
                    expiresAt: new Date((options.now?.() ?? new Date()).getTime() + 15 * 60_000).toISOString()
                };
            }
        };
    }
    return createS3ReportObjectStorageAdapter(source, options);
}
export function resolveReportObjectStorageMode(source = process.env) {
    const configured = source.REPORT_EXPORT_OBJECT_STORAGE_MODE?.trim().toLowerCase();
    if (configured === "local" || configured === "s3")
        return configured;
    return source.RUNTIME_PROFILE?.trim() === "production-like" ? "s3" : "local";
}
export function createS3ReportObjectStorageAdapter(source, options = {}) {
    // S3_PUBLIC_UPLOAD_BASE переписывает upload-URL под браузерный nginx-прокси
    // (/s3); экспорт отчётов кладёт объекты СЕРВЕРОМ, и relative-URL ломает fetch
    // внутри гейтвея — подписываем строго по прямому S3_ENDPOINT.
    const signer = options.signer ?? createS3CompatibleObjectStorageSigner({ ...requireS3Configuration(source), S3_PUBLIC_UPLOAD_BASE: undefined }, { now: options.now });
    const request = options.fetch ?? fetch;
    return {
        async getObject(input) {
            assertReportObjectKey(input.objectKey);
            const signed = await signer.signDownload(signerDownloadInput(input.objectKey, "report-export"));
            const response = await request(signed.url, { method: signed.method });
            if (response.status === 404)
                return undefined;
            if (!response.ok)
                throw new Error(`report_object_storage_get_failed:${response.status}`);
            const body = Buffer.from(await response.arrayBuffer());
            return { body, contentType: response.headers.get("content-type") ?? undefined, sizeBytes: body.length };
        },
        async putObject(input) {
            assertReportObjectKey(input.objectKey);
            const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
            const signed = await signer.signUpload({
                ...signerDownloadInput(input.objectKey, "report-export"),
                contentType: input.contentType,
                sizeBytes: body.length
            });
            const response = await request(signed.url, { body, headers: signed.headers, method: signed.method });
            if (!response.ok)
                throw new Error(`report_object_storage_put_failed:${response.status}`);
            return {
                checksum: `sha256:${createHash("sha256").update(body).digest("hex")}`,
                sizeBytes: body.length,
                writtenAt: (options.now?.() ?? new Date()).toISOString()
            };
        },
        async signDownload(input) {
            assertReportObjectKey(input.objectKey, input.tenantId);
            const signed = await signer.signDownload(signerDownloadInput(input.objectKey, input.fileName));
            return { downloadUrl: signed.url, expiresAt: signed.expiresAt };
        }
    };
}
function signerDownloadInput(objectKey, fileName) {
    return { fileId: objectKey, fileName, objectKey, tenantId: reportTenantFromObjectKey(objectKey) };
}
function requireS3Configuration(source) {
    if (!source.S3_ACCESS_KEY?.trim() || !source.S3_BUCKET?.trim() || !source.S3_ENDPOINT?.trim() || !source.S3_SECRET_KEY?.trim()) {
        throw new Error("report_object_storage_s3_configuration_required");
    }
    return source;
}
function assertReportObjectKey(objectKey, tenantId) {
    const match = /^reports\/([^/]+)\/([^/]+)\/([^/]+\.(?:csv|html|json|txt|xlsx))$/.exec(objectKey);
    if (!match || (tenantId && match[1] !== tenantId))
        throw new Error("report_object_key_invalid");
}
function reportTenantFromObjectKey(objectKey) {
    const match = /^reports\/([^/]+)\//.exec(objectKey);
    if (!match)
        throw new Error("report_object_key_invalid");
    return match[1];
}
//# sourceMappingURL=report-object-storage.js.map