import { createObjectStorageSigner } from "../workspace/object-storage.js";
import type { ObjectStorageSigner } from "../workspace/workspace.service.js";
import type { KnowledgeObjectReader } from "./document-ingestion.worker.js";

/** Reads only server-generated, short-lived download URLs; clients never pass URLs. */
export function createObjectStorageDocumentReader(options: { fetch?: typeof fetch; signer?: ObjectStorageSigner } = {}): KnowledgeObjectReader {
  const signer = options.signer ?? createObjectStorageSigner(); const request = options.fetch ?? fetch;
  return {
    async read(input) {
      const signed = await signer.signDownload({ fileId: input.fileId, fileName: input.fileId, objectKey: input.objectKey, tenantId: input.tenantId });
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await request(signed.url, { method: "GET", redirect: "error", signal: controller.signal });
        const length = Number(response.headers.get("content-length") ?? 0);
        if (!response.ok || length > input.maxBytes) throw new Error("knowledge_document_read_rejected");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > input.maxBytes) throw new Error("knowledge_document_too_large");
        return bytes;
      } finally { clearTimeout(timer); }
    }
  };
}
