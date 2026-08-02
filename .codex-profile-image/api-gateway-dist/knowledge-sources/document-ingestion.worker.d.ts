import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
export interface KnowledgeObjectReader {
    read(input: {
        fileId: string;
        objectKey: string;
        tenantId: string;
        maxBytes: number;
    }): Promise<Uint8Array>;
}
export interface KnowledgeDocumentExtractor {
    extract(input: {
        bytes: Uint8Array;
        fileName: string;
        mimeType: string;
    }): Promise<string>;
}
export declare function processOneKnowledgeDocumentIngestion(input: {
    extractor?: KnowledgeDocumentExtractor;
    maxBytes?: number;
    reader: KnowledgeObjectReader;
    sources?: KnowledgeSourceRepository;
    workspace?: WorkspaceRepository;
}): Promise<{
    outcome: "completed" | "empty" | "failed";
    jobId?: string;
}>;
export declare function extractKnowledgeDocumentText(input: {
    bytes: Uint8Array;
    fileName: string;
    mimeType: string;
}, options?: {
    runCommand?: (command: string, args: string[]) => Promise<string>;
}): Promise<string>;
