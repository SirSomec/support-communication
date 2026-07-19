import React from "react";
import { FileText } from "lucide-react";

export function AttachmentPreview({ attachment, compact = false }) {
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
  return attachment.downloadUrl ? (
    <a className={className} href={attachment.downloadUrl} rel="noopener noreferrer" target="_blank">
      {body}
    </a>
  ) : <span className={className}>{body}</span>;
}
