// Как источник знаний показывается в настройках бота. Логика одобрения выведена
// из эксплуатации (2026-07-17): выбрать можно любой не-архивный источник — бот
// использует его безусловно, как только контент проиндексирован. Подписи ниже
// информируют о состоянии, но не блокируют выбор.

const legacyReadyStatuses = new Set(["ready", "indexed", "published", "active", "готов", "готово", "опубликован"]);
const preparingStatuses = new Set(["fetching", "indexing", "uploaded"]);

export function describeScenarioSourceState(source) {
  const status = String(source?.status ?? "").trim().toLowerCase();
  if (status === "archived") {
    return { hidden: true, hint: "", selectable: false };
  }
  if (source?.isReady === true || legacyReadyStatuses.has(status)) {
    return { hidden: false, hint: "", selectable: true };
  }
  if (preparingStatuses.has(status)) {
    return { hidden: false, hint: "готовится: антивирус и индексация ещё идут — бот начнёт использовать сразу после", selectable: true };
  }
  if (status === "failed") {
    return { hidden: false, hint: "ошибка подготовки — обновите источник в разделе «Знания»", selectable: true };
  }
  if (status === "disabled") {
    return { hidden: false, hint: "источник отключён — бот не использует его, пока вы не включите", selectable: true };
  }
  return { hidden: false, hint: "черновик — содержимое ещё не загружено", selectable: true };
}
