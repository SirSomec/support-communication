import { useEffect, useRef } from "react";

const modalFocusableSelector = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function useModalA11y(onClose) {
  const panelRef = useRef(null);

  useEffect(() => {
    const previousElement = document.activeElement;
    const panel = panelRef.current;
    const focusable = panel ? Array.from(panel.querySelectorAll(modalFocusableSelector)) : [];

    focusable[0]?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const visibleFocusable = Array.from(panel.querySelectorAll(modalFocusableSelector)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement
      );

      if (!visibleFocusable.length) {
        event.preventDefault();
        return;
      }

      const firstElement = visibleFocusable[0];
      const lastElement = visibleFocusable.at(-1);

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousElement instanceof HTMLElement) {
        previousElement.focus();
      }
    };
  }, [onClose]);

  return panelRef;
}
