import type { AutomationState } from "../automation/automation.repository.js";
import type { BillingState } from "../billing/billing.repository.js";
import type { ConversationState } from "../conversation/conversation.repository.js";
import type { IdentityState } from "../identity/identity.repository.js";
import type { IntegrationState } from "../integrations/integration.repository.js";
import type { OperationsState } from "../operations/operations.repository.js";
import type { PlatformState } from "../platform/platform.repository.js";
import type { QualityState } from "../quality/quality.repository.js";
import type { ReportState } from "../reports/report.repository.js";
import type { RoutingState } from "../routing/routing.repository.js";
import type { WorkspaceState } from "../workspace/workspace.repository.js";
export interface LocalDevelopmentRepositorySeeds {
    automation?: AutomationState;
    billing?: BillingState;
    conversation?: ConversationState;
    identity?: IdentityState;
    integrations?: IntegrationState;
    operations?: OperationsState;
    platform?: PlatformState;
    quality?: QualityState;
    reports?: ReportState;
    routing?: RoutingState;
    workspace?: WorkspaceState;
}
export declare function createLocalDevelopmentRepositorySeeds(): LocalDevelopmentRepositorySeeds;
export declare function createPrismaCatalogFallbackSeeds(): LocalDevelopmentRepositorySeeds;
