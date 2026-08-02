import { createHash } from "node:crypto";
/** Deterministic, dependency-free preparation used after a trusted scanner/extractor. */
export function ingestKnowledgeDocument(input, options = {}) {
    if (typeof input !== "string")
        return null;
    const maxChars = clamp(options.maxChars, 1_000, 500_000, 100_000);
    const text = input.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, maxChars);
    if (!text)
        return null;
    const chunkChars = clamp(options.chunkChars, 300, 4_000, 1_200);
    const chunks = [];
    for (let start = 0, index = 0; start < text.length; index += 1) {
        let end = Math.min(text.length, start + chunkChars);
        if (end < text.length) {
            const boundary = text.lastIndexOf(" ", end);
            if (boundary > start + Math.floor(chunkChars * 0.55))
                end = boundary;
        }
        const content = text.slice(start, end).trim();
        if (content)
            chunks.push({ content, endOffset: end, id: `chunk_${index + 1}`, startOffset: start });
        start = Math.max(end, start + 1);
    }
    return { checksum: createHash("sha256").update(text).digest("hex"), chunks, language: detectLanguage(text), text };
}
function clamp(value, min, max, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function detectLanguage(text) {
    const cyrillic = (text.match(/[а-яё]/gi) ?? []).length;
    const latin = (text.match(/[a-z]/gi) ?? []).length;
    return cyrillic > latin ? "ru" : latin > 0 ? "en" : "und";
}
//# sourceMappingURL=document-ingestion.js.map