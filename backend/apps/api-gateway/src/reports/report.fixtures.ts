export interface ReportExportJob {
  auditId: string;
  backendQueueId?: string;
  columns?: string[];
  createdAt: string;
  deadLetteredAt?: string;
  failureCode?: string;
  failureMessage?: string;
  fileName?: string;
  filters?: Record<string, unknown>;
  format: "CSV" | "PDF" | "XLSX";
  id: string;
  metricDefinitionVersion?: string;
  name: string;
  period: string;
  progress: number;
  queue?: string;
  requestedBy: string;
  rows: number;
  status: string;
  statusKey: "error" | "expired" | "queued" | "ready" | "running";
}

export const METRIC_DEFINITION_VERSION = "metrics/v1";

export const reportRows = [
  { metric: "Новые обращения", today: "486", previous: "438", delta: "+11%", status: "Рост нагрузки" },
  { metric: "Закрытые обращения", today: "451", previous: "429", delta: "+5%", status: "В норме" },
  { metric: "Среднее время первого ответа", today: "01:36", previous: "01:52", delta: "-14%", status: "Лучше" },
  { metric: "SLA выполнен", today: "91%", previous: "87%", delta: "+4 п.п.", status: "Лучше" },
  { metric: "Без тематики", today: "0", previous: "3", delta: "-3", status: "Контроль работает" }
];

export const reportBars = [
  ["SDK", 38],
  ["Telegram", 28],
  ["MAX", 18],
  ["VK", 16]
] as Array<[string, number]>;

export const reportChartBlocks = [
  {
    id: "new-closed",
    title: "Новые и закрытые",
    value: "486 / 451",
    delta: "+11% новых",
    tone: "ok",
    points: [64, 70, 58, 76, 84, 91, 88],
    legend: ["Новые", "Закрытые"]
  },
  {
    id: "first-response",
    title: "Первый ответ",
    value: "01:36",
    delta: "-16 сек",
    tone: "ok",
    points: [82, 78, 72, 69, 64, 59, 54],
    legend: ["SLA", "Ответ"]
  },
  {
    id: "operator-load",
    title: "Нагрузка операторов",
    value: "7.2 / 12",
    delta: "60% среднего лимита",
    tone: "warn",
    points: [42, 55, 63, 71, 68, 74, 60],
    legend: ["Чаты", "Лимит"]
  },
  {
    id: "rescue",
    title: "Спасение",
    value: "18 / 23",
    delta: "78% спасено",
    tone: "ok",
    points: [45, 52, 58, 62, 71, 78, 76],
    legend: ["Спасено", "Пропущено"]
  }
];

export const rescueOutcomeSummary = [
  { label: "Спасено", value: "18", detail: "78% rescue-сценариев", tone: "ok" },
  { label: "Пропущено", value: "5", detail: "нужен разбор старшего", tone: "danger" },
  { label: "Средний timer", value: "02:16", detail: "до ответа или возврата", tone: "hold" },
  { label: "Автовозврат", value: "9", detail: "в SLA-очередь", tone: "info" }
];

export const rescueReportRows = [
  {
    id: "rescue-report-vladimir",
    client: "Владимир Б.",
    channel: "Telegram",
    operator: "Кирилл М.",
    timer: "00:42",
    reason: "Принят, но нет ответа оператора",
    outcome: "Спасен",
    resolution: "Вернулся в очередь, ответ за 01:12",
    digest: "Попал в ежедневный отчет"
  },
  {
    id: "rescue-report-olga",
    client: "Ольга Л.",
    channel: "SDK",
    operator: "Иван П.",
    timer: "01:18",
    reason: "Низкая оценка после прошлого диалога",
    outcome: "Спасен",
    resolution: "Ответ проверен старшим перед закрытием",
    digest: "В дайджест качества"
  },
  {
    id: "rescue-report-vk",
    client: "Очередь VK",
    channel: "VK",
    operator: "Не назначен",
    timer: "00:00",
    reason: "Очередь перегружена, SLA 68%",
    outcome: "Пропущен",
    resolution: "Timer истек без перераспределения",
    digest: "Требует разбора"
  }
];

export const reportColumnOptions = [
  { id: "metric", label: "Показатель", locked: true },
  { id: "today", label: "Текущий период" },
  { id: "previous", label: "Сравнение" },
  { id: "delta", label: "Динамика" },
  { id: "status", label: "Комментарий" }
];

export const exportJobFixtures: ReportExportJob[] = [
  {
    id: "export-2418",
    name: "Ежедневный отчет",
    format: "XLSX",
    period: "Сегодня",
    statusKey: "ready",
    status: "Готов",
    progress: 100,
    requestedBy: "Иван П.",
    createdAt: "11:30",
    rows: 486,
    auditId: "evt_report_8831",
    backendQueueId: "report_seed_2418",
    metricDefinitionVersion: METRIC_DEFINITION_VERSION,
    queue: "report-export"
  },
  {
    id: "export-2419",
    name: "CSAT и низкие оценки",
    format: "CSV",
    period: "7 дней",
    statusKey: "running",
    status: "Готовится",
    progress: 62,
    requestedBy: "Анна Р.",
    createdAt: "11:34",
    rows: 128,
    auditId: "evt_report_8832",
    backendQueueId: "report_seed_2419",
    metricDefinitionVersion: METRIC_DEFINITION_VERSION,
    queue: "report-export"
  },
  {
    id: "export-2420",
    name: "Сводка по каналам",
    format: "PDF",
    period: "30 дней",
    statusKey: "error",
    status: "Ошибка",
    progress: 0,
    requestedBy: "Администратор",
    createdAt: "10:12",
    rows: 0,
    auditId: "evt_report_8819",
    backendQueueId: "report_seed_2420",
    metricDefinitionVersion: METRIC_DEFINITION_VERSION,
    queue: "report-export"
  },
  {
    id: "export-2421",
    name: "Нагрузка операторов",
    format: "XLSX",
    period: "Вчера",
    statusKey: "expired",
    status: "Истек",
    progress: 100,
    requestedBy: "Анна Р.",
    createdAt: "09:40",
    rows: 314,
    auditId: "evt_report_8807",
    backendQueueId: "report_seed_2421",
    metricDefinitionVersion: METRIC_DEFINITION_VERSION,
    queue: "report-export"
  }
];
