import type { ConversationReportSourceRow } from "./report.repository.js";
export declare function listJsonConversationReportSourceRows(input: {
    conversationStoreFile?: string;
    from: Date;
    tenantId: string;
    to: Date;
}): ConversationReportSourceRow[];
