import { type ReportCsvColumn, type ReportObjectStorageBody } from "./report-export.worker.js";
import type { ConversationTranscriptSourceRow, ReportRepository } from "./report.repository.js";
import type { ReportExportJob } from "./report.types.js";
export declare const DIALOG_TRANSCRIPT_REPORT_TYPE = "dialog_transcripts";
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
    rating: {
        createdAt: string;
        scale: string;
        score: number | null;
    } | null;
    status: string;
    statusLabel: string;
    topic: string;
    updatedAt: string;
}
export interface DialogTranscriptFilters {
    operatorIds?: string[];
    scores?: string[];
    statuses?: string[];
    topics?: string[];
}
export interface DialogTranscriptDateRange {
    from: Date;
    to: Date;
}
export interface DialogTranscriptFile {
    body: ReportObjectStorageBody;
    contentType: string;
}
export interface DialogTranscriptSnapshot {
    dialogs: DialogTranscriptDialog[];
    entryCount: number;
    window: {
        from: string;
        to: string;
    };
}
export declare const DIALOG_TRANSCRIPT_COLUMN_OPTIONS: ReportCsvColumn[];
export declare const DIALOG_TRANSCRIPT_COLUMN_IDS: string[];
export declare function isDialogTranscriptReportType(reportType: unknown): boolean;
export declare function isDialogTranscriptExportJob(job: Pick<ReportExportJob, "filters">): boolean;
export declare function normalizeDialogTranscriptFormat(value: unknown): DialogTranscriptFormat | undefined;
export declare function dialogTranscriptContentType(format: DialogTranscriptFormat): string;
export declare function dialogStatusLabel(status: string): string;
export declare function dialogTranscriptFiltersFromJob(job: Pick<ReportExportJob, "filters">): DialogTranscriptFilters;
export declare function dialogTranscriptDateRange(filters: Record<string, unknown> | undefined): DialogTranscriptDateRange | "invalid" | undefined;
export declare function buildDialogTranscriptDialogs(rows: readonly ConversationTranscriptSourceRow[], filters?: DialogTranscriptFilters): DialogTranscriptDialog[];
export declare function countDialogTranscriptEntries(dialogs: readonly DialogTranscriptDialog[]): number;
export declare function buildDialogTranscriptSnapshot(repository: Pick<ReportRepository, "listConversationTranscriptSourceRowsAsync">, job: ReportExportJob): Promise<DialogTranscriptSnapshot>;
export interface DialogTranscriptFileOptions {
    filters?: DialogTranscriptFilters;
    generatedAt?: Date;
    periodLabel?: string;
}
export declare function buildDialogTranscriptFile(dialogs: readonly DialogTranscriptDialog[], format: DialogTranscriptFormat, options?: DialogTranscriptFileOptions): DialogTranscriptFile;
export declare function dialogTranscriptXlsxInput(dialogs: readonly DialogTranscriptDialog[]): {
    columns: ReportCsvColumn[];
    rows: Array<Record<string, unknown>>;
};
export declare function serializeDialogTranscriptsAsJson(dialogs: readonly DialogTranscriptDialog[], options?: DialogTranscriptFileOptions): string;
export declare function serializeDialogTranscriptsAsTxt(dialogs: readonly DialogTranscriptDialog[], options?: DialogTranscriptFileOptions): string;
export declare function serializeDialogTranscriptsAsHtml(dialogs: readonly DialogTranscriptDialog[], options?: DialogTranscriptFileOptions): string;
