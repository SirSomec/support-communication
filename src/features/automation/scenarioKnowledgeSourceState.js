// Как источник знаний показывается в настройках бота: выбираем ли он и какая
// подпись объясняет его состояние. Раньше селектор показывал только ready —
// загруженные документы «исчезали» на время индексации, а до одобрения бот
// молча их игнорировал; теперь состояние видно прямо в списке.

const legacyReadyStatuses = new Set(["ready", "indexed", "published", "active", "готов", "готово", "опубликован"]);
const preparingStatuses = new Set(["fetching", "indexing", "uploaded"]);

export function describeScenarioSourceState(source) {
  const status = String(source?.status ?? "").trim().toLowerCase();
  if (status === "archived") {
    return { hidden: true, hint: "", selectable: false };
  }
  const ready = source?.isReady === true || legacyReadyStatuses.has(status);
  if (ready) {
    if (String(source?.approvalStatus ?? "").trim().toLowerCase() === "pending") {
      return {
        hidden: false,
        hint: "ждёт одобрения в разделе «Знания» — бот начнёт использовать источник после одобрения",
        selectable: true
      };
    }
    return { hidden: false, hint: "", selectable: true };
  }
  if (preparingStatuses.has(status)) {
    return { hidden: false, hint: "готовится: антивирус и индексация ещё идут", selectable: false };
  }
  if (status === "failed") {
    return { hidden: false, hint: "ошибка подготовки — обновите источник в разделе «Знания»", selectable: false };
  }
  if (status === "disabled") {
    return { hidden: false, hint: "источник отключён — включите его в разделе «Знания»", selectable: false };
  }
  return { hidden: false, hint: "черновик — содержимое ещё не загружено", selectable: false };
}
