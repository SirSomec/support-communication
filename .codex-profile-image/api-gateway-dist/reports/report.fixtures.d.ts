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
export declare const METRIC_DEFINITION_VERSION = "metrics/v1";
export declare const reportRows: {
    metric: string;
    today: string;
    previous: string;
    delta: string;
    status: string;
}[];
export declare const reportBars: Array<[string, number]>;
export declare const reportChartBlocks: {
    id: string;
    title: string;
    value: string;
    delta: string;
    tone: string;
    points: number[];
    legend: string[];
}[];
export declare const rescueOutcomeSummary: {
    label: string;
    value: string;
    detail: string;
    tone: string;
}[];
export declare const rescueReportRows: {
    id: string;
    client: string;
    channel: string;
    operator: string;
    timer: string;
    reason: string;
    outcome: string;
    resolution: string;
    digest: string;
}[];
export declare const reportColumnOptions: ({
    id: string;
    label: string;
    locked: boolean;
} | {
    id: string;
    label: string;
    locked?: undefined;
})[];
export declare const exportJobFixtures: ReportExportJob[];
