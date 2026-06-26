import { useCallback, useEffect, useRef, useState } from "react";
import { createComposerAttachment, releaseAttachmentPreviews } from "./dialogModel.js";

export function useComposerAttachments() {
  const [attachments, setAttachments] = useState([]);
  const attachmentsRef = useRef([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => releaseAttachmentPreviews(attachmentsRef.current), []);

  useEffect(() => {
    if (!attachments.some((attachment) => attachment.status === "uploading")) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.status === "uploading"
            ? {
                ...attachment,
                status: "ready",
                progress: 100
              }
            : attachment
        )
      );
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [attachments]);

  const addFiles = useCallback((fileList, channel) => {
    const files = Array.from(fileList ?? []);

    if (!files.length) {
      return 0;
    }

    setAttachments((current) => [
      ...current,
      ...files.map((file, index) => createComposerAttachment(file, index, channel))
    ]);
    return files.length;
  }, []);

  const completeAttachment = useCallback((attachmentId) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId
          ? {
              ...attachment,
              status: "ready",
              progress: 100,
              error: ""
            }
          : attachment
      )
    );
  }, []);

  const retryAttachment = useCallback((attachmentId) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId
          ? {
              ...attachment,
              status: "uploading",
              progress: 54,
              error: ""
            }
          : attachment
      )
    );
  }, []);

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
    hasAttachments: Boolean(attachments.length),
    hasPending: attachments.some((attachment) => attachment.status !== "ready"),
    retryAttachment,
    removeAttachment
  };
}
