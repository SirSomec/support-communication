import { bootstrapAutomationState } from "../automation/seed.js";
import type { AutomationState } from "../automation/automation.repository.js";
import { bootstrapBillingState } from "../billing/seed.js";
import type { BillingState } from "../billing/billing.repository.js";
import { bootstrapConversationState } from "../conversation/seed.js";
import type { ConversationState } from "../conversation/conversation.repository.js";
import { bootstrapIdentityState } from "../identity/seed.js";
import type { IdentityState } from "../identity/identity.repository.js";
import { bootstrapIntegrationState } from "../integrations/seed.js";
import type { IntegrationState } from "../integrations/integration.repository.js";
import { bootstrapOperationsState } from "../operations/seed.js";
import type { OperationsState } from "../operations/operations.repository.js";
import { bootstrapPlatformState } from "../platform/seed.js";
import type { PlatformState } from "../platform/platform.repository.js";
import { bootstrapQualityState } from "../quality/seed.js";
import type { QualityState } from "../quality/quality.repository.js";
import { bootstrapReportState } from "../reports/seed.js";
import type { ReportState } from "../reports/report.repository.js";
import { bootstrapRoutingState } from "../routing/seed.js";
import type { RoutingState } from "../routing/routing.repository.js";
import { bootstrapWorkspaceState } from "../workspace/seed.js";
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

export function createLocalDevelopmentRepositorySeeds(): LocalDevelopmentRepositorySeeds {
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
