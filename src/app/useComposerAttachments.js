import { useCallback, useEffect, useRef, useState } from "react";
import { createComposerAttachment, releaseAttachmentPreviews } from "./dialogModel.js";
import { dialogService } from "../services/dialogService.js";

const readyStorageStates = new Set(["ready", "upload_complete", "upload_ready", "uploaded"]);
const readyScanStates = new Set(["clean", "scan_clean"]);
const blockedScanStates = new Set(["blocked", "infected", "scan_blocked"]);
const failedScanStates = new Set(["error", "failed", "scan_failed"]);
// Бюджет опроса должен перекрывать интервал file-scan воркера (10 секунд)
// плюс время самой проверки, иначе вложение зависает в "uploading".
const defaultStatusPollAttempts = 20;
const defaultStatusPollDelayMs = 1500;

export function buildAttachmentUploadPayload(attachment) {
  const payload = {
    channel: attachment.channel,
    fileName: attachment.name,
    idempotencyKey: attachment.idempotencyKey,
    sizeBytes: attachment.sizeBytes ?? 0
  };
  const mimeType = stringValue(attachment.mimeType ?? attachment.file?.type);
  return {
    ...payload,
    ...(mimeType ? { mimeType } : {})
  };
}

export async function uploadComposerAttachment(
  attachment,
  {
    fetchAttachmentStatus = (fileId) => dialogService.fetchAttachmentStatus(fileId),
    finalizeAttachmentUpload = (payload) => dialogService.finalizeAttachmentUpload(payload),
    sleep = delay,
    statusPollAttempts = defaultStatusPollAttempts,
    statusPollDelayMs = defaultStatusPollDelayMs,
    uploadAttachment = (payload) => dialogService.uploadAttachment(payload),
    uploadAttachmentFile = uploadSignedAttachmentFile
  } = {}
) {
  try {
    const response = await uploadAttachment(buildAttachmentUploadPayload(attachment));

    if (response.status !== "ok") {
      return createAttachmentUploadError(
        attachment,
        response.error?.message ?? "Сервер не принял дескриптор загрузки вложения."
      );
    }

    if (!response.data?.descriptorId && !response.data?.fileId) {
      return createAttachmentUploadError(attachment, "В дескрипторе загрузки вложения нет идентификаторов бэкенда.");
    }

    let descriptor = response.data;
    let shouldPollScanStatus = false;
    const signedUpload = signedUploadPolicy(response.data?.signedUpload);
    if (signedUpload && !attachment.file) {
      return createAttachmentUploadError(
        attachment,
        "Файл вложения недоступен в памяти браузера. Удалите вложение и приложите файл заново."
      );
    }
    if (signedUpload && attachment.file) {
      await uploadAttachmentFile(attachment.file, signedUpload);
      const fileId = String(response.data.fileId ?? "").trim();
      if (!fileId) {
        return createAttachmentUploadError(attachment, "В дескрипторе загрузки вложения нет fileId для завершения загрузки.");
      }

      const finalizeResponse = await finalizeAttachmentUpload({ fileId });
      if (finalizeResponse.status !== "ok") {
        return createAttachmentUploadError(
          mergeAttachmentUploadDescriptor(attachment, descriptor),
          finalizeResponse.error?.message ?? "Сервер не принял завершение загрузки вложения."
        );
      }

      descriptor = {
        ...descriptor,
        ...finalizeResponse.data
      };
      shouldPollScanStatus = true;
    }

    const nextAttachment = mergeAttachmentUploadDescriptor(attachment, descriptor);
    if (!shouldPollScanStatus || nextAttachment.status !== "uploading" || !nextAttachment.fileId) {
      return nextAttachment;
    }

    return pollAttachmentScanStatus(nextAttachment, {
      fetchAttachmentStatus,
      sleep,
      statusPollAttempts,
      statusPollDelayMs
    });
  } catch (error) {
    return createAttachmentUploadError(
      attachment,
      error instanceof Error ? error.message : "Не удалось выполнить запрос загрузки вложения."
    );
  }
}

export function mergeAttachmentUploadDescriptor(attachment, descriptor) {
  const storageState = stringValue(descriptor.storageState);
  const antivirusState = stringValue(descriptor.antivirusState ?? descriptor.scanState);
  const deliveryState = stringValue(descriptor.deliveryState);
  const backendState = {
    antivirusState,
    deliveryState,
    storageState
  };
  const queue = descriptor.queue ?? attachment.queue;
  const base = {
    ...attachment,
    backendState,
    descriptorId: descriptor.descriptorId ?? attachment.descriptorId,
    fileId: descriptor.fileId ?? attachment.fileId,
    outboxEventId: descriptor.outboxEventId ?? attachment.outboxEventId,
    queue,
    retryable: false,
    uploadPolicy: normalizeUploadPolicy(descriptor.uploadPolicy ?? attachment.uploadPolicy, {
      deliveryState,
      queue,
      scanState: antivirusState,
      storageState
    })
  };

  if (blockedScanStates.has(antivirusState)) {
    return preserveAttachmentFile({
      ...base,
      error: "Вложение заблокировано антивирусной проверкой.",
      progress: 100,
      retryable: false,
      status: "error"
    }, attachment);
  }

  if (failedScanStates.has(antivirusState)) {
    return preserveAttachmentFile({
      ...base,
      error: "Антивирусная проверка вложения не удалась. Повторите загрузку.",
      progress: 100,
      retryable: true,
      status: "error"
    }, attachment);
  }

  if (isAttachmentDescriptorReady({ antivirusState, deliveryState, storageState })) {
    return preserveAttachmentFile({
      ...base,
      error: "",
      progress: 100,
      status: "ready"
    }, attachment);
  }

  return preserveAttachmentFile({
    ...base,
    error: "Ожидание антивирусной проверки перед отправкой.",
    progress: Math.max(Number(attachment.progress) || 0, 80),
    status: "uploading"
  }, attachment);
}

function isAttachmentDescriptorReady({ antivirusState, deliveryState, storageState }) {
  return readyScanStates.has(antivirusState)
    && (readyStorageStates.has(storageState) || deliveryState === "ready");
}

function createAttachmentUploadError(attachment, message) {
  return preserveAttachmentFile({
    ...attachment,
    error: message,
    progress: 100,
    retryable: true,
    status: "error"
  }, attachment);
}

function stringValue(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function preserveAttachmentFile(nextAttachment, sourceAttachment) {
  if (sourceAttachment?.file) {
    Object.defineProperty(nextAttachment, "file", {
      enumerable: false,
      value: sourceAttachment.file
    });
  }
  return nextAttachment;
}

function signedUploadPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const method = String(value.method ?? "PUT").toUpperCase();
  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (!url || method !== "PUT") {
    return null;
  }

  const headers = value.headers && typeof value.headers === "object" && !Array.isArray(value.headers)
    ? Object.fromEntries(Object.entries(value.headers).map(([key, headerValue]) => [key, String(headerValue)]))
    : undefined;

  return {
    ...(typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {}),
    ...(headers ? { headers } : {}),
    method,
    url
  };
}

async function uploadSignedAttachmentFile(file, signedUpload) {
  const response = await fetch(signedUpload.url, {
    body: file,
    headers: signedUpload.headers ?? {},
    method: signedUpload.method
  });

  if (!response.ok) {
    throw new Error(`Не удалось загрузить файл вложения: статус ${response.status}.`);
  }
}

async function pollAttachmentScanStatus(attachment, {
  fetchAttachmentStatus,
  sleep,
  statusPollAttempts,
  statusPollDelayMs
}) {
  let nextAttachment = attachment;
  const attempts = Math.max(0, Number(statusPollAttempts) || 0);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0 && statusPollDelayMs > 0) {
      await sleep(statusPollDelayMs);
    }

    const response = await fetchAttachmentStatus(nextAttachment.fileId);
    if (response.status !== "ok") {
      return createAttachmentUploadError(
        nextAttachment,
        response.error?.message ?? "Не удалось получить статус антивирусной проверки вложения."
      );
    }

    nextAttachment = mergeAttachmentUploadDescriptor(nextAttachment, response.data);
    if (nextAttachment.status !== "uploading") {
      return nextAttachment;
    }
  }

  return nextAttachment;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeUploadPolicy(policy, fallback) {
  if (policy && typeof policy === "object" && !Array.isArray(policy)) {
    return { ...policy };
  }

  return Object.fromEntries(
    Object.entries(fallback).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export function useComposerAttachments({ setToast } = {}) {
  const [attachments, setAttachments] = useState([]);
  const attachmentsRef = useRef([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => releaseAttachmentPreviews(attachmentsRef.current), []);

  const startUpload = useCallback(
    async (attachment) => {
      const nextAttachment = await uploadComposerAttachment(attachment);
      setAttachments((current) =>
        current.map((currentAttachment) =>
          currentAttachment.id === attachment.id
            ? preserveAttachmentFile({ ...nextAttachment, previewUrl: currentAttachment.previewUrl }, nextAttachment)
            : currentAttachment
        )
      );

      if (nextAttachment.status === "error") {
        setToast?.(nextAttachment.error);
      }
    },
    [setToast]
  );

  const addFiles = useCallback((fileList, channel) => {
    const files = Array.from(fileList ?? []);

    if (!files.length) {
      return 0;
    }

    const nextAttachments = files.map((file, index) => createComposerAttachment(file, index, channel));
    setAttachments((current) => [...current, ...nextAttachments]);
    nextAttachments
      .filter((attachment) => attachment.status === "uploading")
      .forEach((attachment) => {
        void startUpload(attachment);
      });

    return files.length;
  }, [startUpload]);

  const handleAttachFiles = useCallback(
    (fileList, channel) => {
      const added = addFiles(fileList, channel);
      if (added) {
        setToast?.(`Вложения добавлены в очередь: ${added}`);
      }

      return added;
    },
    [addFiles, setToast]
  );

  const completeAttachment = useCallback(() => {
    setToast?.("Готовность вложения определяется статусом антивирусной проверки на сервере.");
  }, [setToast]);

  const retryAttachment = useCallback((attachmentId) => {
    const attachment = attachmentsRef.current.find((currentAttachment) => currentAttachment.id === attachmentId);
    if (!attachment) {
      return;
    }

    const retryingAttachment = preserveAttachmentFile({
      ...attachment,
      error: "",
      progress: 64,
      status: "uploading"
    }, attachment);

    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId
          ? retryingAttachment
          : attachment
      )
    );
    void startUpload(retryingAttachment);
  }, [startUpload]);

  const removeAttachment = useCallback((attachmentId) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === attachmentId);
      if (removed) {
        releaseAttachmentPreviews([removed]);
      }

      return current.filter((attachment) => attachment.id !== attachmentId);
    });
  }, []);

  const clearAttachments = useCallback(({ releasePreviews = true } = {}) => {
    setAttachments((current) => {
      if (releasePreviews) {
        releaseAttachmentPreviews(current);
      }

      return [];
    });
  }, []);

  return {
    addFiles,
    attachments,
    clearAttachments,
    completeAttachment,
    handleAttachFiles,
    hasAttachments: Boolean(attachments.length),
    hasPending: attachments.some((attachment) => attachment.status !== "ready"),
    retryAttachment,
    removeAttachment
  };
}
