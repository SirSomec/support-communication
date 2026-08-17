export type MetricReportExportFormat = "CSV" | "JSON" | "XLSX";
export type DialogTranscriptExportFormat = "HTML" | "JSON" | "TXT" | "XLSX";
export type ReportExportFormat = MetricReportExportFormat | DialogTranscriptExportFormat | "PDF";

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
  format: ReportExportFormat;
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
  tenantId?: string;
}
