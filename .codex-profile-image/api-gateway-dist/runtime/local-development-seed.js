import { bootstrapAutomationState } from "../automation/seed.js";
import { bootstrapBillingState } from "../billing/seed.js";
import { bootstrapConversationState } from "../conversation/seed.js";
import { bootstrapIdentityState } from "../identity/seed.js";
import { bootstrapIntegrationState } from "../integrations/seed.js";
import { bootstrapOperationsState } from "../operations/seed.js";
import { bootstrapPlatformState } from "../platform/seed.js";
import { bootstrapQualityState } from "../quality/seed.js";
import { bootstrapReportState } from "../reports/seed.js";
import { bootstrapRoutingState } from "../routing/seed.js";
import { bootstrapWorkspaceState } from "../workspace/seed.js";
export function createLocalDevelopmentRepositorySeeds() {
    return {
        automation: bootstrapAutomationState(),
        billing: bootstrapBillingState(),
        conversation: bootstrapConversationState(),
        identity: bootstrapIdentityState(),
        integrations: bootstrapIntegrationState(),
        operations: bootstrapOperationsState(),
        platform: bootstrapPlatformState(),
        quality: bootstrapQualityState(),
        reports: bootstrapReportState(),
        routing: bootstrapRoutingState(),
        workspace: bootstrapWorkspaceState()
    };
}
export function createPrismaCatalogFallbackSeeds() {
    // Prisma is the source of truth in runtime profiles. Catalog fixtures must never
    // leak into a newly provisioned tenant through an unscoped in-memory fallback.
    return {};
}
//# sourceMappingURL=local-development-seed.js.map