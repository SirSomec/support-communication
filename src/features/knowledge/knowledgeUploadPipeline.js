import { uploadComposerAttachment } from "../../app/useComposerAttachments.js";
import { knowledgeService } from "../../services/knowledgeService.js";

// Общий конвейер загрузки файлов знаний: создание источника → антивирус →
// очередь индексации. Используется в разделе «Знания» и в настройках бота.

export const KNOWLEDGE_UPLOAD_ACCEPT = ".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html";

export function buildKnowledgeUpload(file) {
  const id = `ks-doc-${file.name}-${file.lastModified}-${Date.now()}`;
  const attachment = {
    channel: "SDK",
    id,
    idempotencyKey: `knowledge-upload:${id}`,
    mimeType: file.type || "text/plain",
    name: file.name,
    sizeBytes: file.size,
    status: "uploading"
  };
  Object.defineProperty(attachment, "file", { enumerable: false, value: file, writable: false });
  return attachment;
}

export async function uploadKnowledgeDocumentFile(file) {
  const created = await knowledgeService.createSource({ kind: "document", sourceConfig: { upload: true }, title: file.name });
  const source = created.data?.source;
  if (created.status !== "ok" || !source) {
    return { fileName: file.name, ok: false, reason: created.error?.message ?? "не удалось создать источник" };
  }
  // Не переиспользуем createComposerAttachment: он ограничен PDF/картинками
  // (чат), а воркер знаний извлекает текстовые форматы. Строим объект напрямую.
  const uploaded = await uploadComposerAttachment(buildKnowledgeUpload(file));
  if (uploaded.status === "error") {
    return { fileName: file.name, ok: false, reason: uploaded.error ?? "файл не прошёл антивирусную проверку" };
  }
  if (!uploaded.fileId) {
    return { fileName: file.name, ok: false, reason: "загрузка не вернула идентификатор файла" };
  }
  const enqueue = await knowledgeService.enqueueSourceAttachment(source.id, {
    fileId: uploaded.fileId,
    idempotencyKey: `ks-upload-${source.id}`
  });
  if (enqueue.status !== "ok") {
    return { fileName: file.name, ok: false, reason: enqueue.error?.message ?? "файл проверен, но индексация не запустилась" };
  }
  return { fileName: file.name, ok: true };
}

/** Файлы идут последовательно: антивирус и индексация не любят параллельных заливок. */
export async function uploadKnowledgeDocumentFiles(fileList, { onProgress } = {}) {
  const files = Array.from(fileList ?? []).filter(Boolean);
  const outcomes = [];
  for (const [index, file] of files.entries()) {
    onProgress?.({ done: index, total: files.length });
    outcomes.push(await uploadKnowledgeDocumentFile(file));
  }
  return outcomes;
}
