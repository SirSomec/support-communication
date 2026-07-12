export const REPORT_METRIC_DEFINITION_VERSION = "metrics/v1";

export const REPORT_COLUMN_OPTIONS = [
  { id: "metric", label: "Показатель", locked: true },
  { id: "today", label: "Текущий период" },
  { id: "previous", label: "Сравнение" },
  { id: "delta", label: "Динамика" },
  { id: "status", label: "Комментарий" }
];

export const REPORT_COLUMN_IDS = REPORT_COLUMN_OPTIONS.map((column) => column.id);
