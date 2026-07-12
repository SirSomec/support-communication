import type { RoutingState } from "./routing.repository.js";

import {

  rescueReportSeedRows,

  routingConversationFixtures,

  routingOperatorFixtures,

  routingQueueFixtures

} from "./seed-catalog.js";



function clone<T>(value: T): T {

  return JSON.parse(JSON.stringify(value)) as T;

}



const FALLBACK_TENANT_ID = "tenant-volga";



function tagTenantRecords<T extends { tenantId?: string }>(records: T[], tenantId: string): T[] {

  return records.map((record) => ({ ...record, tenantId: record.tenantId ?? tenantId }));

}



export function bootstrapRoutingState(base?: Partial<RoutingState>): RoutingState {

  return {

    conversations: tagTenantRecords(base?.conversations ?? clone(routingConversationFixtures), FALLBACK_TENANT_ID),

    jobs: base?.jobs ?? [],

    operatorCapacities: base?.operatorCapacities ?? [],

    operators: base?.operators ?? tagTenantRecords(clone(routingOperatorFixtures), FALLBACK_TENANT_ID),

    queueMemberships: base?.queueMemberships ?? [],

    queues: base?.queues ?? tagTenantRecords(clone(routingQueueFixtures), FALLBACK_TENANT_ID),

    routingAnalyticsRows: base?.routingAnalyticsRows ?? [],

    rescueReportRows: tagTenantRecords(base?.rescueReportRows ?? clone(rescueReportSeedRows), FALLBACK_TENANT_ID),

    routingRules: base?.routingRules ?? []

  };

}



export * from "./seed-catalog.js";

