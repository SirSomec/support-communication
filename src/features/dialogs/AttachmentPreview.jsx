import React from "react";
import { FileText } from "lucide-react";

export function AttachmentPreview({ attachment, compact = false, onOpen }) {
  const body = (
    <>
      <span className="attachment-thumb">
        {attachment.previewUrl ? (
          <img alt={`Превью ${attachment.name}`} src={attachment.previewUrl} />
        ) : (
          <FileText size={compact ? 16 : 18} />
        )}
      </span>
      <span className="attachment-meta">
        <strong>{attachment.name}</strong>
        <small>{attachment.type} · {attachment.size}</small>
      </span>
    </>
  );
  const className = `attachment-preview ${compact ? "compact" : ""}`;
  if ((attachment.downloadUrl || attachment.downloadPath) && onOpen) {
    return <button className={className} onClick={() => onOpen?.(attachment)} type="button">{body}</button>;
  }
  return <span className={className}>{body}</span>;
}
