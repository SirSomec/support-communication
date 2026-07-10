export async function copyTextToClipboard(text, {
  clipboard = globalThis.navigator?.clipboard,
  documentRef = globalThis.document
} = {}) {
  const value = String(text ?? "");
  if (!value.trim()) {
    return {
      ok: false,
      code: "empty_clipboard_payload",
      message: "Нет данных для копирования."
    };
  }

  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return {
        ok: true,
        method: "clipboard-api"
      };
    } catch {
      // Continue to the DOM fallback below.
    }
  }

  if (documentRef?.createElement && documentRef.body?.appendChild && documentRef.body?.removeChild && documentRef.execCommand) {
    const textarea = documentRef.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    documentRef.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      const copied = documentRef.execCommand("copy");
      if (copied) {
        return {
          ok: true,
          method: "exec-command"
        };
      }
    } finally {
      documentRef.body.removeChild(textarea);
    }
  }

  return {
    ok: false,
    code: "clipboard_unavailable",
    message: "Буфер обмена недоступен в этом браузере."
  };
}
