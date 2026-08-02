import type { ConversationReportSourceRow } from "./report.repository.js";
export interface ConversationReportFilters {
    operatorId?: string;
    outcome?: string;
    queueId?: string;
    resolutionOutcome?: string;
    status?: string;
    teamId?: string;
    topic?: string;
}
export interface ConversationReportEventWatermark {
    id: string;
    ingestedAt: string | null;
    occurredAt: string;
}
export declare function buildConversationReportEventWatermark(rows: ConversationReportSourceRow[], snapshotAt: Date): ConversationReportEventWatermark | null;
export type ConversationReportFilterOptions = Record<keyof ConversationReportFilters, string[]>;
export declare function filterReportConversations(rows: readonly ConversationReportSourceRow[], filters: ConversationReportFilters): ConversationReportSourceRow[];
export declare function buildConversationReportFilterOptions(rows: readonly ConversationReportSourceRow[]): ConversationReportFilterOptions;
export declare function buildConversationReportDataQuality(rows: readonly ConversationReportSourceRow[], snapshotAt: Date): Record<string, unknown>;
