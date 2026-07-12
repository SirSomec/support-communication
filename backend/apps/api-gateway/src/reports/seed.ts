export * from "./seed-catalog.js";



import {

  METRIC_DEFINITION_VERSION,

  reportBars,

  reportChartBlocks,

  reportColumnOptions,

  reportRows,

  rescueOutcomeSummary,

  rescueReportRows

} from "./seed-catalog.js";

import type { ReportState, ReportWorkspaceCatalog } from "./report.repository.js";



function clone<T>(value: T): T {

  return JSON.parse(JSON.stringify(value)) as T;

}



export function bootstrapReportWorkspaceCatalog(): ReportWorkspaceCatalog {

  return {

    metricDefinitionVersion: METRIC_DEFINITION_VERSION,

    reportBars: clone(reportBars),

    reportChartBlocks: clone(reportChartBlocks),

    reportColumnOptions: clone(reportColumnOptions),

    reportRows: clone(reportRows),

    rescueOutcomeSummary: clone(rescueOutcomeSummary),

    rescueReportRows: clone(rescueReportRows)

  };

}



export function bootstrapReportState(base?: Partial<ReportState>): ReportState {

  return {

    exportRetryAuditEvents: base?.exportRetryAuditEvents ?? [],

    exportJobs: base?.exportJobs ?? [],

    idempotencyKeys: base?.idempotencyKeys ?? [],

    metricDefinitions: base?.metricDefinitions ?? [],

    metricTenantOverrides: base?.metricTenantOverrides ?? [],

    metricVersions: base?.metricVersions ?? [],

    reportFileDescriptors: base?.reportFileDescriptors ?? [],

    reportNotificationDescriptors: base?.reportNotificationDescriptors ?? [],

    reportQueryExecutions: base?.reportQueryExecutions ?? [],

    savedReportTemplates: base?.savedReportTemplates ?? [],

    scheduledDigestDescriptors: base?.scheduledDigestDescriptors ?? [],

    workspace: base?.workspace ?? bootstrapReportWorkspaceCatalog()

  };

}

