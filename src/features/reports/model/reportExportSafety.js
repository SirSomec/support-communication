export function getReportExportAvailability({
  error = "",
  refreshing = false,
  viewValid = true,
  workspace = null,
  workspaceMatchesView = false
} = {}) {
  if (!viewValid) {
    return { disabled: true, reason: "Исправьте период отчета перед экспортом." };
  }
  if (!workspace) {
    return { disabled: true, reason: "Дождитесь загрузки отчета перед экспортом." };
  }
  if (error) {
    return {
      disabled: true,
      reason: "Показан последний успешно полученный снимок. Экспорт станет доступен после успешного обновления."
    };
  }
  if (refreshing) {
    return { disabled: true, reason: "Дождитесь завершения обновления перед экспортом." };
  }
  if (!workspaceMatchesView) {
    return {
      disabled: true,
      reason: "Показан снимок для предыдущих параметров. Дождитесь загрузки выбранного среза."
    };
  }
  return { disabled: false, reason: "" };
}
