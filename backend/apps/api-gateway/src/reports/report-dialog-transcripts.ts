import { buildLiveReportWorkspace, type LiveReportWorkspaceOptions } from "./report-live-workspace.js";
import { reportSnapshotAt, serializeReportRowsAsXlsx, type ReportCsvColumn, type ReportObjectStorageBody } from "./report-export.worker.js";
import type { ConversationTranscriptSourceRow, ReportRepository } from "./report.repository.js";
import type { ReportExportJob } from "./report.types.js";

export const DIALOG_TRANSCRIPT_REPORT_TYPE = "dialog_transcripts";

export type DialogTranscriptFormat = "HTML" | "JSON" | "TXT" | "XLSX";

export type DialogTranscriptEntryKind = "comment" | "csat_feedback" | "message";

export interface DialogTranscriptEntry {
  at: string;
  author: string;
  authorRole: "client" | "operator";
  kind: DialogTranscriptEntryKind;
  kindLabel: string;
  text: string;
  time: string;
}

export interface DialogTranscriptDialog {
  channel: string;
  clientName: string;
  createdAt: string;
  entries: DialogTranscriptEntry[];
  id: string;
  operatorId?: string;
  operatorName?: string;
  rating: { createdAt: string; scale: string; score: number | null } | null;
  status: string;
  statusLabel: string;
  topic: string;
  updatedAt: string;
}

export interface DialogTranscriptFilters {
  operatorId?: string;
  score?: string;
  status?: string;
  topic?: string;
}

export interface DialogTranscriptFile {
  body: ReportObjectStorageBody;
  contentType: string;
}

export interface DialogTranscriptSnapshot {
  dialogs: DialogTranscriptDialog[];
  entryCount: number;
  window: { from: string; to: string };
}

export const DIALOG_TRANSCRIPT_COLUMN_OPTIONS: ReportCsvColumn[] = [
  { id: "conversationId", label: "ID диалога" },
  { id: "client", label: "Клиент" },
  { id: "channel", label: "Канал" },
  { id: "topic", label: "Тематика" },
  { id: "status", label: "Статус" },
  { id: "operator", label: "Оператор" },
  { id: "rating", label: "Оценка (CSAT)" },
  { id: "entryKind", label: "Тип записи" },
  { id: "author", label: "Автор" },
  { id: "at", label: "Время" },
  { id: "text", label: "Текст" }
];

export const DIALOG_TRANSCRIPT_COLUMN_IDS = DIALOG_TRANSCRIPT_COLUMN_OPTIONS.map((column) => column.id);

// Русские подписи статусов дублируют conversationStatusMeta фронтенда: выгрузка
// должна читаться без приложения, а общего словаря между src и backend нет.
const DIALOG_STATUS_LABELS: Record<string, string> = {
  active: "В работе",
  assigned: "Назначено",
  closed: "Закрыто",
  new: "Новое",
  paused: "На паузе",
  queued: "В очереди",
  reopened: "Переоткрыто",
  transferred: "Передано",
  waiting_client: "Ожидает клиента",
  waiting_operator: "Ожидает оператора"
};

const DIALOG_TRANSCRIPT_FORMATS: Record<string, DialogTranscriptFormat> = {
  excel: "XLSX",
  html: "HTML",
  json: "JSON",
  text: "TXT",
  txt: "TXT",
  xlsx: "XLSX"
};

const DIALOG_TRANSCRIPT_CONTENT_TYPES: Record<DialogTranscriptFormat, string> = {
  HTML: "text/html; charset=utf-8",
  JSON: "application/json",
  TXT: "text/plain; charset=utf-8",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

export function isDialogTranscriptReportType(reportType: unknown): boolean {
  return typeof reportType === "string" && reportType.trim().toLowerCase() === DIALOG_TRANSCRIPT_REPORT_TYPE;
}

export function isDialogTranscriptExportJob(job: Pick<ReportExportJob, "filters">): boolean {
  return isDialogTranscriptReportType(job.filters?.reportKind);
}

export function normalizeDialogTranscriptFormat(value: unknown): DialogTranscriptFormat | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return DIALOG_TRANSCRIPT_FORMATS[value.trim().toLowerCase()];
}

export function dialogTranscriptContentType(format: DialogTranscriptFormat): string {
  return DIALOG_TRANSCRIPT_CONTENT_TYPES[format];
}

export function dialogStatusLabel(status: string): string {
  return DIALOG_STATUS_LABELS[status.trim().toLowerCase()] ?? status;
}

export function dialogTranscriptFiltersFromJob(job: Pick<ReportExportJob, "filters">): DialogTranscriptFilters {
  return {
    operatorId: stringFilter(job.filters?.operatorId),
    score: stringFilter(job.filters?.score),
    status: stringFilter(job.filters?.status),
    topic: stringFilter(job.filters?.topic)
  };
}

export function buildDialogTranscriptDialogs(
  rows: readonly ConversationTranscriptSourceRow[],
  filters: DialogTranscriptFilters = {}
): DialogTranscriptDialog[] {
  const operator = normalizeFacetFilter(filters.operatorId);
  const topic = normalizeFacetFilter(filters.topic);
  const status = normalizeFacetFilter(filters.status);
  const score = normalizeScoreFilter(filters.score);

  return rows
    .filter((row) => {
      if (operator && !equalsFacet(row.operatorId, operator) && !equalsFacet(row.operatorName, operator)) {
        return false;
      }
      if (topic && !equalsFacet(row.topic, topic)) {
        return false;
      }
      if (status && !equalsFacet(row.status, status)) {
        return false;
      }
      return matchesScoreFilter(row.rating?.score ?? null, score);
    })
    .map((row) => ({
      channel: row.channel,
      clientName: row.clientName || "Клиент",
      createdAt: row.createdAt,
      entries: transcriptEntries(row),
      id: row.id,
      ...(row.operatorId ? { operatorId: row.operatorId } : {}),
      ...(row.operatorName ? { operatorName: row.operatorName } : {}),
      rating: row.rating ? { ...row.rating } : null,
      status: row.status,
      statusLabel: dialogStatusLabel(row.status),
      topic: row.topic,
      updatedAt: row.updatedAt
    }));
}

export function countDialogTranscriptEntries(dialogs: readonly DialogTranscriptDialog[]): number {
  return dialogs.reduce((sum, dialog) => sum + dialog.entries.length, 0);
}

export async function buildDialogTranscriptSnapshot(
  repository: Pick<ReportRepository, "listConversationTranscriptSourceRowsAsync">,
  job: ReportExportJob
): Promise<DialogTranscriptSnapshot> {
  const tenantId = job.tenantId?.trim();
  if (!tenantId) {
    throw new Error("report_export_job_tenant_id_required");
  }

  const snapshotAt = reportSnapshotAt(job);
  const workspace = buildLiveReportWorkspace([], {
    now: snapshotAt,
    period: job.period as LiveReportWorkspaceOptions["period"],
    timezoneOffsetMinutes: transcriptTimezoneOffset(job.filters?.timezoneOffsetMinutes)
  });
  const from = new Date(workspace.windows.current.from);
  const to = new Date(Math.min(new Date(workspace.windows.current.to).getTime(), snapshotAt.getTime()));
  const rows = await repository.listConversationTranscriptSourceRowsAsync({ from, tenantId, to });
  const dialogs = buildDialogTranscriptDialogs(rows, dialogTranscriptFiltersFromJob(job));

  return {
    dialogs,
    entryCount: countDialogTranscriptEntries(dialogs),
    window: { from: from.toISOString(), to: to.toISOString() }
  };
}

export interface DialogTranscriptFileOptions {
  filters?: DialogTranscriptFilters;
  generatedAt?: Date;
  periodLabel?: string;
}

export function buildDialogTranscriptFile(
  dialogs: readonly DialogTranscriptDialog[],
  format: DialogTranscriptFormat,
  options: DialogTranscriptFileOptions = {}
): DialogTranscriptFile {
  const contentType = dialogTranscriptContentType(format);
  if (format === "XLSX") {
    return {
      body: serializeReportRowsAsXlsx(dialogTranscriptXlsxInput(dialogs)),
      contentType
    };
  }

  if (format === "JSON") {
    return { body: serializeDialogTranscriptsAsJson(dialogs, options), contentType };
  }

  if (format === "HTML") {
    return { body: serializeDialogTranscriptsAsHtml(dialogs, options), contentType };
  }

  return { body: serializeDialogTranscriptsAsTxt(dialogs, options), contentType };
}

export function dialogTranscriptXlsxInput(dialogs: readonly DialogTranscriptDialog[]): {
  columns: ReportCsvColumn[];
  rows: Array<Record<string, unknown>>;
} {
  const rows = dialogs.flatMap((dialog) => dialog.entries.map((entry) => ({
    at: formatTranscriptTimestamp(entry.at) || entry.time,
    author: entry.author,
    channel: dialog.channel,
    client: dialog.clientName,
    conversationId: dialog.id,
    entryKind: entry.kindLabel,
    operator: dialog.operatorName ?? dialog.operatorId ?? "",
    rating: dialog.rating?.score ?? "",
    status: dialog.statusLabel,
    text: entry.text,
    topic: dialog.topic
  })));

  return { columns: [...DIALOG_TRANSCRIPT_COLUMN_OPTIONS], rows };
}

export function serializeDialogTranscriptsAsJson(
  dialogs: readonly DialogTranscriptDialog[],
  options: DialogTranscriptFileOptions = {}
): string {
  return JSON.stringify({
    dialogCount: dialogs.length,
    dialogs: dialogs.map((dialog) => ({
      channel: dialog.channel,
      client: dialog.clientName,
      comments: dialog.entries.filter((entry) => entry.kind === "comment").map(jsonEntry),
      createdAt: dialog.createdAt,
      csatFeedback: dialog.entries.filter((entry) => entry.kind === "csat_feedback").map(jsonEntry),
      id: dialog.id,
      messages: dialog.entries.filter((entry) => entry.kind === "message").map(jsonEntry),
      operator: dialog.operatorId || dialog.operatorName
        ? { id: dialog.operatorId ?? null, name: dialog.operatorName ?? null }
        : null,
      rating: dialog.rating,
      status: { key: dialog.status, label: dialog.statusLabel },
      topic: dialog.topic,
      updatedAt: dialog.updatedAt
    })),
    entryCount: countDialogTranscriptEntries(dialogs),
    filters: exportedFilters(options.filters),
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    reportType: DIALOG_TRANSCRIPT_REPORT_TYPE
  }, null, 2);
}

export function serializeDialogTranscriptsAsTxt(
  dialogs: readonly DialogTranscriptDialog[],
  options: DialogTranscriptFileOptions = {}
): string {
  const lines: string[] = [
    "Выгрузка диалогов с перепиской",
    `Сформировано: ${formatTranscriptTimestamp((options.generatedAt ?? new Date()).toISOString())}`,
    `Фильтры: ${filtersSummary(options.filters)}`,
    `Диалогов: ${dialogs.length} · Записей: ${countDialogTranscriptEntries(dialogs)}`
  ];

  for (const dialog of dialogs) {
    lines.push("");
    lines.push("=".repeat(72));
    lines.push(`Диалог ${dialog.id} · ${dialog.clientName} · ${dialog.channel} · Тематика: ${dialog.topic}`);
    lines.push(`Статус: ${dialog.statusLabel} · Оператор: ${dialog.operatorName ?? dialog.operatorId ?? "не назначен"} · Оценка: ${ratingSummary(dialog)}`);
    lines.push("-".repeat(72));
    if (!dialog.entries.length) {
      lines.push("Сообщений нет.");
      continue;
    }

    for (const entry of dialog.entries) {
      lines.push(`[${formatTranscriptTimestamp(entry.at) || entry.time}] ${entry.kindLabel} — ${entry.author}: ${entry.text}`);
    }
  }

  return `${lines.join("\r\n")}\r\n`;
}

export function serializeDialogTranscriptsAsHtml(
  dialogs: readonly DialogTranscriptDialog[],
  options: DialogTranscriptFileOptions = {}
): string {
  const generatedAt = formatTranscriptTimestamp((options.generatedAt ?? new Date()).toISOString());
  const sections = dialogs.map((dialog) => {
    const entries = dialog.entries.length
      ? dialog.entries.map((entry) => [
          `<li class="entry ${entry.kind === "comment" ? "comment" : entry.authorRole}">`,
          `<span class="entry-meta">${escapeHtml(formatTranscriptTimestamp(entry.at) || entry.time)} · ${escapeHtml(entry.kindLabel)} · ${escapeHtml(entry.author)}</span>`,
          `<p>${escapeHtml(entry.text)}</p>`,
          "</li>"
        ].join("")).join("")
      : "<li class=\"entry empty\"><p>Сообщений нет.</p></li>";

    return [
      "<section class=\"dialog\">",
      "<header>",
      `<h2>${escapeHtml(dialog.clientName)} <small>${escapeHtml(dialog.id)}</small></h2>`,
      "<p class=\"dialog-meta\">",
      `<span>Канал: ${escapeHtml(dialog.channel)}</span>`,
      `<span>Тематика: ${escapeHtml(dialog.topic)}</span>`,
      `<span>Статус: ${escapeHtml(dialog.statusLabel)}</span>`,
      `<span>Оператор: ${escapeHtml(dialog.operatorName ?? dialog.operatorId ?? "не назначен")}</span>`,
      `<span>Оценка: ${escapeHtml(ratingSummary(dialog))}</span>`,
      "</p>",
      "</header>",
      `<ul class="entries">${entries}</ul>`,
      "</section>"
    ].join("");
  }).join("");

  return [
    "<!doctype html>",
    "<html lang=\"ru\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>Выгрузка диалогов с перепиской</title>",
    "<style>",
    "body{font-family:'Segoe UI',Arial,sans-serif;margin:24px auto;max-width:900px;padding:0 16px;color:#17212b;background:#f7f8fa;}",
    "h1{font-size:22px;margin-bottom:4px;}",
    ".summary{color:#5b6572;font-size:14px;margin-bottom:20px;}",
    ".dialog{background:#fff;border:1px solid #dfe4ea;border-radius:10px;margin-bottom:16px;padding:16px 18px;}",
    ".dialog h2{font-size:16px;margin:0 0 6px;}",
    ".dialog h2 small{color:#8a94a1;font-weight:400;margin-left:6px;}",
    ".dialog-meta{color:#5b6572;display:flex;flex-wrap:wrap;font-size:13px;gap:6px 14px;margin:0 0 10px;}",
    ".entries{list-style:none;margin:0;padding:0;}",
    ".entry{border-left:3px solid #c6d3e2;margin-bottom:10px;padding:4px 10px;}",
    ".entry.client{border-left-color:#4d94ff;}",
    ".entry.operator{border-left-color:#37b26c;}",
    ".entry.comment{background:#fff8e6;border-left-color:#e2a93b;}",
    ".entry-meta{color:#77818f;display:block;font-size:12px;margin-bottom:2px;}",
    ".entry p{margin:0;white-space:pre-wrap;}",
    "</style>",
    "</head>",
    "<body>",
    "<h1>Выгрузка диалогов с перепиской</h1>",
    `<p class="summary">Сформировано: ${escapeHtml(generatedAt)} · Фильтры: ${escapeHtml(filtersSummary(options.filters))} · Диалогов: ${dialogs.length} · Записей: ${countDialogTranscriptEntries(dialogs)}</p>`,
    sections || "<p class=\"summary\">За выбранный период диалогов нет.</p>",
    "</body>",
    "</html>"
  ].join("");
}

function transcriptEntries(row: ConversationTranscriptSourceRow): DialogTranscriptEntry[] {
  const clientName = row.clientName || "Клиент";
  const operatorName = row.operatorName || row.operatorId || "Оператор";

  return row.messages
    .filter((message) => message.type !== "event")
    .map((message) => {
      if (message.type === "internal") {
        return transcriptEntry(message, {
          author: message.author || operatorName,
          authorRole: "operator",
          kind: "comment",
          kindLabel: "Внутренний комментарий"
        });
      }

      if (message.type === "csat_feedback") {
        return transcriptEntry(message, {
          author: message.author || clientName,
          authorRole: "client",
          kind: "csat_feedback",
          kindLabel: "Отзыв клиента на оценку"
        });
      }

      if (message.side === "client") {
        return transcriptEntry(message, {
          author: message.author || clientName,
          authorRole: "client",
          kind: "message",
          kindLabel: "Сообщение клиента"
        });
      }

      return transcriptEntry(message, {
        author: message.author || operatorName,
        authorRole: "operator",
        kind: "message",
        kindLabel: "Сообщение оператора"
      });
    });
}

function transcriptEntry(
  message: ConversationTranscriptSourceRow["messages"][number],
  target: Pick<DialogTranscriptEntry, "author" | "authorRole" | "kind" | "kindLabel">
): DialogTranscriptEntry {
  return {
    at: message.createdAt,
    author: target.author,
    authorRole: target.authorRole,
    kind: target.kind,
    kindLabel: target.kindLabel,
    text: message.text,
    time: message.time
  };
}

function jsonEntry(entry: DialogTranscriptEntry): Record<string, unknown> {
  return {
    author: entry.author,
    authorRole: entry.authorRole,
    sentAt: entry.at,
    text: entry.text,
    time: entry.time
  };
}

function exportedFilters(filters: DialogTranscriptFilters = {}): Record<string, string> {
  return {
    operator: filters.operatorId?.trim() || "all",
    score: filters.score?.trim() || "all",
    status: filters.status?.trim() || "all",
    topic: filters.topic?.trim() || "all"
  };
}

function filtersSummary(filters: DialogTranscriptFilters = {}): string {
  const exported = exportedFilters(filters);
  const scoreLabel = exported.score === "none" ? "без оценки" : exported.score;
  return [
    `оператор — ${exported.operator === "all" ? "все" : exported.operator}`,
    `тематика — ${exported.topic === "all" ? "все" : exported.topic}`,
    `статус — ${exported.status === "all" ? "все" : dialogStatusLabel(exported.status)}`,
    `оценка — ${exported.score === "all" ? "все" : scoreLabel}`
  ].join(", ");
}

function ratingSummary(dialog: DialogTranscriptDialog): string {
  if (!dialog.rating || dialog.rating.score === null) {
    return "без оценки";
  }

  return `${formatRatingScore(dialog.rating.score)} (${dialog.rating.scale})`;
}

function formatRatingScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function normalizeFacetFilter(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return !normalized || normalized === "all" || normalized.startsWith("Все ")
    ? undefined
    : normalized.toLocaleLowerCase("ru-RU");
}

function equalsFacet(value: string | undefined, filter: string): boolean {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU") === filter;
}

function normalizeScoreFilter(value: string | undefined): "none" | number | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return undefined;
  }

  if (normalized === "none" || normalized === "unrated") {
    return "none";
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function matchesScoreFilter(score: number | null, filter: "none" | number | undefined): boolean {
  if (filter === undefined) {
    return true;
  }

  if (filter === "none") {
    return score === null;
  }

  return score !== null && Math.round(score) === filter;
}

function transcriptTimezoneOffset(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 14 * 60 ? parsed : 0;
}

function formatTranscriptTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(parsed.getUTCDate())}.${pad(parsed.getUTCMonth() + 1)}.${parsed.getUTCFullYear()} ${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())} UTC`;
}

function stringFilter(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
