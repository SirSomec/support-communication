import React, { useEffect, useState } from "react";
import { Download, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

export function AttachmentViewerModal({ attachment, error, loading, onClose, onDownload, sourceUrl }) {
  const [zoom, setZoom] = useState(1);
  const image = /^image\//i.test(attachment?.type ?? "") || /\.(avif|gif|jpe?g|png|webp)$/i.test(attachment?.name ?? "");

  useEffect(() => {
    setZoom(1);
  }, [attachment?.id, sourceUrl]);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const changeZoom = (delta) => setZoom((value) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((value + delta).toFixed(2)))));
  return (
    <div aria-modal="true" className="attachment-viewer-backdrop" onMouseDown={onClose} role="dialog">
      <section aria-label={`Вложение ${attachment?.name ?? ""}`} className="attachment-viewer" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><strong>{attachment?.name ?? "Вложение"}</strong><small>{attachment?.size || attachment?.type}</small></div>
          <div className="attachment-viewer-actions">
            {image ? <><button aria-label="Уменьшить" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(-0.25)} type="button"><ZoomOut size={18} /></button><button aria-label="Сбросить масштаб" onClick={() => setZoom(1)} type="button"><RotateCcw size={18} /></button><button aria-label="Увеличить" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(0.25)} type="button"><ZoomIn size={18} /></button></> : null}
            <button aria-label="Скачать вложение" disabled={!sourceUrl || loading} onClick={onDownload} type="button"><Download size={18} /></button>
            <button aria-label="Закрыть просмотр" onClick={onClose} type="button"><X size={19} /></button>
          </div>
        </header>
        <div className="attachment-viewer-content" onWheel={image ? (event) => { event.preventDefault(); changeZoom(event.deltaY < 0 ? 0.2 : -0.2); } : undefined}>
          {loading ? <p>Загружаем вложение…</p> : error ? <p className="attachment-viewer-error">{error}</p> : image && sourceUrl ? <img alt={attachment?.name ?? "Вложение"} src={sourceUrl} style={{ transform: `scale(${zoom})` }} /> : <p>Предпросмотр недоступен. Скачайте файл, чтобы открыть его.</p>}
        </div>
        {image ? <footer>Масштаб: {Math.round(zoom * 100)}%</footer> : null}
      </section>
    </div>
  );
}
