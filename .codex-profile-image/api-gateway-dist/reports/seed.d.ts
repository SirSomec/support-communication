export * from "./seed-catalog.js";
import type { ReportState, ReportWorkspaceCatalog } from "./report.repository.js";
export declare function bootstrapReportWorkspaceCatalog(): ReportWorkspaceCatalog;
export declare function bootstrapReportState(base?: Partial<ReportState>): ReportState;
