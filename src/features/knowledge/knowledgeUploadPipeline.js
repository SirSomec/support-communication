import { uploadComposerAttachment } from "../../app/useComposerAttachments.js";
import { knowledgeService } from "../../services/knowledgeService.js";

// Общий конвейер загрузки файлов знаний: создание источника → антивирус →
// очередь индексации. Используется в разделе «Знания» и в настройках бота.

export const KNOWLEDGE_UPLOAD_ACCEPT = ".txt,.md,.markdown,.html,.htm,.pdf,.docx,text/plain,text/markdown,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function buildKnowledgeUpload(file) {
  const id = `ks-doc-${file.name}-${file.lastModified}-${Date.now()}`;
  const attachment = {
    channel: "SDK",
    id,
    idempotencyKey: `knowledge-upload:${id}`,
    mimeType: knowledgeDocumentMimeType(file),
    name: file.name,
    sizeBytes: file.size,
    status: "uploading"
  };
  Object.defineProperty(attachment, "file", { enumerable: false, value: file, writable: false });
  return attachment;
}

function knowledgeDocumentMimeType(file) {
  const mimeType = String(file?.type ?? "").trim().toLowerCase();
  if (mimeType) return mimeType;
  const extension = String(file?.name ?? "").trim().toLowerCase().split(".").at(-1);
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (["md", "markdown"].includes(extension)) return "text/markdown";
  if (["html", "htm"].includes(extension)) return "text/html";
  return "text/plain";
}

export async function uploadKnowledgeDocumentFile(file) {
  // ВАЖНО: сперва грузим и сканируем файл, и только потом создаём источник.
  // Иначе упавшая загрузка (нет minio, антивирус, сеть) оставляла бы пустой
  // источник-«черновик» без контента — их накапливалось много при импорте,
  // а бот молча их не использовал. Нет контента — нет и записи источника.
  // Не переиспользуем createComposerAttachment: он ограничен PDF/картинками
  // (чат), а воркер знаний извлекает текстовые форматы. Строим объект напрямую.
  const uploaded = await uploadComposerAttachment(buildKnowledgeUpload(file));
  if (uploaded.status === "error") {
    return { fileName: file.name, ok: false, reason: uploaded.error ?? "файл не прошёл антивирусную проверку" };
  }
  if (!uploaded.fileId) {
    return { fileName: file.name, ok: false, reason: "загрузка не вернула идентификатор файла" };
  }
  const created = await knowledgeService.createSource({ kind: "document", sourceConfig: { upload: true }, title: file.name });
  const source = created.data?.source;
  if (created.status !== "ok" || !source) {
    return { fileName: file.name, ok: false, reason: created.error?.message ?? "не удалось создать источник" };
  }
  const enqueue = await knowledgeService.enqueueSourceAttachment(source.id, {
    fileId: uploaded.fileId,
    idempotencyKey: `ks-upload-${source.id}`
  });
  if (enqueue.status !== "ok") {
    // Индексация не запустилась — не оставляем пустой источник висеть в списке.
    await knowledgeService.archiveSource(source.id).catch(() => {});
    await knowledgeService.deleteSource(source.id).catch(() => {});
    return { fileName: file.name, ok: false, reason: enqueue.error?.message ?? "файл проверен, но индексация не запустилась" };
  }
  return { fileName: file.name, ok: true };
}

/**
 * Пакетная загрузка с ограниченной параллелью: каждый файл ждёт антивирус
 * (до ~30 секунд поллинга), поэтому строгая очередь на больших партиях
 * растягивалась на десятки минут. 3 параллельных потока безопасны: скан и
 * индексация асинхронные (outbox/воркер), а minio спокойно держит несколько PUT.
 * onProgress получает { done, total, fileName, outcome? }: done — число
 * завершённых файлов; событие с outcome приходит после каждого файла.
 */
export async function uploadKnowledgeDocumentFiles(fileList, { concurrency = 3, onProgress, uploadOne = uploadKnowledgeDocumentFile } = {}) {
  const files = Array.from(fileList ?? []).filter(Boolean);
  const outcomes = new Array(files.length);
  let nextIndex = 0;
  let completed = 0;
  if (files.length) onProgress?.({ done: 0, fileName: files[0].name, total: files.length });
  async function worker() {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = files[index];
      onProgress?.({ done: completed, fileName: file.name, total: files.length });
      outcomes[index] = await uploadOne(file);
      completed += 1;
      onProgress?.({ done: completed, fileName: file.name, outcome: outcomes[index], total: files.length });
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, files.length)) }, () => worker()));
  return outcomes;
}
