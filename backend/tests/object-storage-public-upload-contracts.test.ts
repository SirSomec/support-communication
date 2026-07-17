import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createS3CompatibleObjectStorageSigner } from "../apps/api-gateway/src/workspace/object-storage.ts";

const base = {
  S3_ACCESS_KEY: "minio",
  S3_BUCKET: "support-communication-local",
  S3_ENDPOINT: "http://kubernetes.docker.internal:19000",
  S3_SECRET_KEY: "minio-password"
};
const uploadInput = { contentType: "text/plain", fileId: "file-1", fileName: "faq.txt", objectKey: "tenant/faq.txt", sizeBytes: 5, tenantId: "tenant-volga" };

describe("object storage public upload base", () => {
  it("rewrites only the upload origin to the same-origin proxy prefix, keeping path and signature query", () => {
    const now = () => new Date("2026-07-17T10:00:00.000Z");
    const direct = createS3CompatibleObjectStorageSigner(base, { now });
    const proxied = createS3CompatibleObjectStorageSigner({ ...base, S3_PUBLIC_UPLOAD_BASE: "/s3/" }, { now });

    const directUrl = direct.signUpload(uploadInput).url;
    const proxiedUrl = proxied.signUpload(uploadInput).url;

    assert.ok(directUrl.startsWith("http://kubernetes.docker.internal:19000/support-communication-local/"));
    // Публичный URL относительный (same-origin), а путь и подпись — байт в байт те же:
    // nginx срежет /s3 и подставит Host подписи, minio увидит исходный запрос.
    assert.equal(proxiedUrl, `/s3${directUrl.slice("http://kubernetes.docker.internal:19000".length)}`);
    assert.match(proxiedUrl, /^\/s3\/support-communication-local\/tenant\/faq\.txt\?X-Amz-Algorithm=/);
    assert.match(proxiedUrl, /X-Amz-Signature=[a-f0-9]{64}$/);
  });

  it("keeps downloads and metadata on the direct internal endpoint for workers and scanners", () => {
    const proxied = createS3CompatibleObjectStorageSigner({ ...base, S3_PUBLIC_UPLOAD_BASE: "/s3" });
    const download = proxied.signDownload({ fileId: "file-1", objectKey: "tenant/faq.txt", tenantId: "tenant-volga" });
    assert.ok(download.url.startsWith("http://kubernetes.docker.internal:19000/"));
  });

  it("ignores blank or malformed public base values", () => {
    for (const value of ["", "   ", "ftp://x", "no-slash"]) {
      const signer = createS3CompatibleObjectStorageSigner({ ...base, S3_PUBLIC_UPLOAD_BASE: value });
      assert.ok(signer.signUpload(uploadInput).url.startsWith("http://kubernetes.docker.internal:19000/"), JSON.stringify(value));
    }
  });
});
