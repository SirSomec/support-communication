export interface KnowledgeDocumentChunk {
    content: string;
    endOffset: number;
    id: string;
    startOffset: number;
}
export interface IngestedKnowledgeDocument {
    checksum: string;
    chunks: KnowledgeDocumentChunk[];
    language: string;
    text: string;
}
/** Deterministic, dependency-free preparation used after a trusted scanner/extractor. */
export declare function ingestKnowledgeDocument(input: unknown, options?: {
    chunkChars?: number;
    maxChars?: number;
}): IngestedKnowledgeDocument | null;
