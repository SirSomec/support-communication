import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

const CLOSE_DELAY_MS = 120;
const TOOLTIP_GAP = 8;
const VIEWPORT_GUTTER = 12;

export function ReportInfoTooltip({ ariaLabel, caveats, className = "", description, sources, title }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [position, setPosition] = useState(null);
  const closeTimer = useRef(null);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);
  const tooltipId = useId();
  const sourceItems = textItems(sources);
  const caveatItems = textItems(caveats);

  const clearScheduledClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearScheduledClose();
    setIsOpen(false);
    setIsPinned(false);
    setPosition(null);
  }, [clearScheduledClose]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popoverRef.current?.getBoundingClientRect();
    const width = popoverRect?.width ?? Math.min(340, window.innerWidth - VIEWPORT_GUTTER * 2);
    const height = popoverRect?.height ?? 190;
    const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER);
    const left = Math.min(Math.max(VIEWPORT_GUTTER, triggerRect.right - width), maxLeft);
    const below = triggerRect.bottom + TOOLTIP_GAP;
    const above = triggerRect.top - TOOLTIP_GAP - height;
    const top = below + height <= window.innerHeight - VIEWPORT_GUTTER
      ? below
      : above >= VIEWPORT_GUTTER
        ? above
        : Math.max(VIEWPORT_GUTTER, Math.min(below, window.innerHeight - height - VIEWPORT_GUTTER));

    setPosition({ left: Math.round(left), top: Math.round(top) });
  }, []);

  const show = useCallback(() => {
    clearScheduledClose();
    setIsOpen(true);
  }, [clearScheduledClose]);

  const scheduleClose = useCallback(() => {
    if (isPinned || document.activeElement === triggerRef.current) return;
    clearScheduledClose();
    closeTimer.current = window.setTimeout(() => {
      if (document.activeElement !== triggerRef.current) close();
    }, CLOSE_DELAY_MS);
  }, [clearScheduledClose, close, isPinned]);

  useEffect(() => () => clearScheduledClose(), [clearScheduledClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = window.requestAnimationFrame(updatePosition);
    const handlePointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return;
      close();
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isOpen, updatePosition]);

  const handleClick = () => {
    if (isPinned) {
      close();
      return;
    }
    show();
    setIsPinned(true);
  };

  return (
    <>
      <button
        aria-controls={isOpen ? tooltipId : undefined}
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-expanded={isOpen}
        aria-label={ariaLabel ?? ("Определение: " + title)}
        className={("reports-info-tooltip-trigger " + className).trim()}
        onBlur={scheduleClose}
        onClick={handleClick}
        onFocus={show}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") show();
        }}
        onPointerLeave={scheduleClose}
        ref={triggerRef}
        type="button"
      >
        <Info aria-hidden="true" size={14} />
      </button>
      {isOpen && typeof document !== "undefined" ? createPortal(
        <aside
          className="reports-info-tooltip"
          id={tooltipId}
          onPointerEnter={clearScheduledClose}
          onPointerLeave={scheduleClose}
          ref={popoverRef}
          role="tooltip"
          style={{
            left: (position?.left ?? -9999) + "px",
            top: (position?.top ?? -9999) + "px",
            visibility: position ? "visible" : "hidden"
          }}
        >
          <strong>{title}</strong>
          <p>{description || "Описание показателя пока недоступно."}</p>
          {sourceItems.length ? <p className="reports-info-tooltip-source"><span>Источник</span>{sourceItems.join(" · ")}</p> : null}
          {caveatItems.length ? <ul>{caveatItems.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </aside>,
        document.body
      ) : null}
    </>
  );
}

function textItems(values) {
  const items = Array.isArray(values) ? values : values === null || values === undefined ? [] : [values];
  return items.map((item) => String(item).trim()).filter(Boolean);
}
