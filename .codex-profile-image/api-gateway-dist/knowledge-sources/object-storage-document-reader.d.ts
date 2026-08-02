import type { ObjectStorageSigner } from "../workspace/workspace.service.js";
import type { KnowledgeObjectReader } from "./document-ingestion.worker.js";
/** Reads only server-generated, short-lived download URLs; clients never pass URLs. */
export declare function createObjectStorageDocumentReader(options?: {
    fetch?: typeof fetch;
    signer?: ObjectStorageSigner;
}): KnowledgeObjectReader;
