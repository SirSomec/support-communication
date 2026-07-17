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

export function summarizeBulkApprove(data) {
  const approvedCount = Array.isArray(data?.approved) ? data.approved.length : 0;
  const skippedCount = Array.isArray(data?.skipped) ? data.skipped.length : 0;
  const base = approvedCount
    ? `Одобрено источников: ${approvedCount}. Бот сможет отвечать по ним.`
    : "Ни один источник не одобрен.";
  return skippedCount
    ? `${base} Пропущено: ${skippedCount} — источники изменились или уже одобрены, список обновлён.`
    : base;
}
