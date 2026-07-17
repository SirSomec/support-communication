// Чистая логика массовых операций раздела «Знания → Документы»: какие
// источники готовы к одобрению и как отчитаться о пакетной загрузке/одобрении.

export function selectApprovableSources(sources) {
  return (Array.isArray(sources) ? sources : []).filter(
    (source) => source?.status === "ready" && source?.approvalStatus === "pending"
  );
}

export function summarizeBulkUpload(outcomes) {
  const list = Array.isArray(outcomes) ? outcomes : [];
  if (!list.length) return "Файлы не выбраны.";
  const failed = list.filter((outcome) => !outcome?.ok);
  if (!failed.length) {
    return list.length === 1
      ? "Файл в очереди индексации. Когда источник станет «Готов», одобрите его."
      : `Все файлы в очереди индексации: ${list.length}. Когда источники станут «Готов», одобрите их кнопкой «Одобрить готовые».`;
  }
  const shown = failed.slice(0, 3).map((outcome) => `${outcome.fileName} (${outcome.reason ?? "неизвестная ошибка"})`);
  const hidden = failed.length - shown.length;
  const queued = list.length - failed.length;
  return `В очереди индексации: ${queued} из ${list.length}. Не загрузились: ${shown.join("; ")}${hidden > 0 ? ` и ещё ${hidden}` : ""}.`;
}

const BULK_ACTION_LABELS = {
  approve: { done: "Одобрено источников", none: "Ни один источник не одобрен.", suffix: " Бот сможет отвечать по ним." },
  archive: { done: "Перемещено в архив", none: "Ничего не перемещено в архив." },
  delete: { done: "Удалено источников", none: "Ничего не удалено." },
  disable: { done: "Отключено источников", none: "Ничего не отключено." },
  enable: { done: "Включено источников", none: "Ничего не включено." }
};

export function summarizeBulkAction(action, data) {
  const labels = BULK_ACTION_LABELS[action] ?? { done: "Обработано источников", none: "Ничего не изменилось." };
  const affectedCount = Array.isArray(data?.affected) ? data.affected.length : 0;
  const skippedCount = Array.isArray(data?.skipped) ? data.skipped.length : 0;
  const base = affectedCount ? `${labels.done}: ${affectedCount}.${labels.suffix ?? ""}` : labels.none;
  return skippedCount
    ? `${base} Пропущено: ${skippedCount} — источники в другом состоянии, список обновлён.`
    : base;
}

/** Слияние привязок сценария с выбранными документами: черновик приоритетнее опубликованного набора. */
export function mergeScenarioSourceBindings(scenario, sources) {
  const base = Array.isArray(scenario?.draft?.sourceBindings)
    ? scenario.draft.sourceBindings
    : Array.isArray(scenario?.sourceBindings) ? scenario.sourceBindings : [];
  const known = new Set(base.map((binding) => binding?.sourceId).filter(Boolean));
  const additions = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const sourceId = source?.id;
    if (!sourceId || known.has(sourceId)) continue;
    known.add(sourceId);
    additions.push({ sourceId });
  }
  return { additions: additions.length, merged: [...base, ...additions] };
}
