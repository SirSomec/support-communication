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
  format: "CSV" | "HTML" | "JSON" | "PDF" | "TXT" | "XLSX";
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
