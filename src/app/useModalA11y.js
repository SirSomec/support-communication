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
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Эффект ставит фокус и ловушку один раз на открытие модалки: перезапуск на
  // каждый новый inline-onClose уводил фокус из полей формы на кнопку закрытия.
  useEffect(() => {
    const previousElement = document.activeElement;
    const panel = panelRef.current;
    const focusable = panel ? Array.from(panel.querySelectorAll(modalFocusableSelector)) : [];
    const firstField = focusable.find((element) =>
      ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName)
    );

    (firstField ?? focusable[0])?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
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
  }, []);

  return panelRef;
}
