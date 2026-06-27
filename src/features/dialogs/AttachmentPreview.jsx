import React from "react";
import { FileText } from "lucide-react";

export function AttachmentPreview({ attachment, compact = false }) {
  return (
    <span className={`attachment-preview ${compact ? "compact" : ""}`}>
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
    </span>
  );
}
