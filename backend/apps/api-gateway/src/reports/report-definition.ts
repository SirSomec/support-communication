import type { SupportOperationsMetricKey } from "./support-operations-workspace.js";

export const REPORT_METRIC_DEFINITION_VERSION = "metrics/v1";

export const REPORT_COLUMN_OPTIONS = [
  { id: "metric", label: "Показатель", locked: true },
  { id: "today", label: "Текущий период" },
  { id: "previous", label: "Сравнение" },
  { id: "delta", label: "Динамика" },
  { id: "status", label: "Комментарий" },
  { id: "key", label: "Ключ метрики" },
  { id: "current", label: "Текущее значение" },
  { id: "absoluteDelta", label: "Абсолютное изменение" },
  { id: "percentDelta", label: "Изменение, %" },
  { id: "comparable", label: "Доступно сравнение" },
  { id: "unit", label: "Единица измерения" },
  { id: "formula", label: "Определение" },
  { id: "source", label: "Источники" },
  { id: "caveats", label: "Ограничения" },
  { id: "workspaceVersion", label: "Версия контракта" }
];

export const REPORT_COLUMN_IDS = REPORT_COLUMN_OPTIONS.map((column) => column.id);

/**
 * Stable presentation catalog for the support-operations/v2 metric rows.
 * Keys are the public API identifiers; labels can be localized by clients but
 * remain fixed here so CSV/XLSX exports are readable without the application.
 */
export const SUPPORT_OPERATIONS_METRIC_OPTIONS = [
  { key: "incoming", label: "Входящие обращения" },
  { key: "resolved", label: "Решённые обращения" },
  { key: "backlog", label: "Открытый бэклог" },
  { key: "waiting", label: "Ожидают ответа команды" },
  { key: "slaAttainmentPercent", label: "Выполнение SLA" },
  { key: "slaBreaches", label: "Нарушения SLA" },
  { key: "slaRecordedSamples", label: "Обращения с измеренным SLA" },
  { key: "firstResponseAverageSeconds", label: "Среднее время первого ответа" },
  { key: "firstResponseMedianSeconds", label: "Медиана времени первого ответа" },
  { key: "firstResponseP90Seconds", label: "P90 времени первого ответа" },
  { key: "firstResponseSamples", label: "Измеренные первые ответы" },
  { key: "firstResponseCoveragePercent", label: "Покрытие измерением первого ответа" },
  { key: "nextResponseMedianSeconds", label: "Медиана времени следующего ответа" },
  { key: "nextResponseP90Seconds", label: "P90 времени следующего ответа" },
  { key: "nextResponseSamples", label: "Измеренные следующие ответы" },
  { key: "firstResolutionMedianSeconds", label: "Медиана времени первого решения" },
  { key: "firstResolutionP90Seconds", label: "P90 времени первого решения" },
  { key: "firstResolutionSamples", label: "Измеренные первые решения" },
  { key: "fullResolutionMedianSeconds", label: "Медиана времени полного решения" },
  { key: "fullResolutionP90Seconds", label: "P90 времени полного решения" },
  { key: "fullResolutionSamples", label: "Измеренные полные решения" },
  { key: "reopenedConversations", label: "Повторно открытые обращения" },
  { key: "reopenRatePercent", label: "Доля повторных открытий" },
  { key: "oneTouchResolutionCount", label: "Решения за одно касание" },
  { key: "oneTouchResolutionPercent", label: "Доля решений за одно касание" },
  { key: "oneTouchResolutionSamples", label: "Выборка решений за одно касание" },
  { key: "csatAverage", label: "Средняя оценка CSAT" },
  { key: "csatPositiveRatePercent", label: "Доля положительных оценок CSAT" },
  { key: "csatSamples", label: "Ответы CSAT" },
  { key: "csatCoveragePercent", label: "Покрытие CSAT" },
  { key: "csatScaleMaximum", label: "Максимум шкалы CSAT" },
  { key: "internalComments", label: "Внутренние комментарии" },
  { key: "agentTouches", label: "Касания операторов" }
] as const satisfies ReadonlyArray<{ key: SupportOperationsMetricKey; label: string }>;
