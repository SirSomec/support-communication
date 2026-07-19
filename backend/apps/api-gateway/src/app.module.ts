import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { WorkspaceAuditModule } from "./audit/workspace-audit.module.js";
import { AutomationModule } from "./automation/automation.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { ConversationModule } from "./conversation/conversation.module.js";
import { FeatureFlagModule } from "./feature-flags/feature-flag.module.js";
import { HealthController } from "./health.controller.js";
import { MetricsController } from "./metrics.controller.js";
import { IdentityModule } from "./identity/identity.module.js";
import { IncidentModule } from "./incidents/incident.module.js";
import { IntegrationModule } from "./integrations/integration.module.js";
import { OpenChannelModule } from "./integrations/open-channel/open-channel.module.js";
import { NotificationModule } from "./notifications/notification.module.js";
import { OperationsModule } from "./operations/operations.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { PresenceModule } from "./presence/presence.module.js";
import { QualityModule } from "./quality/quality.module.js";
import { ReportModule } from "./reports/report.module.js";
import { RoutingModule } from "./routing/routing.module.js";
import { ServiceAdminModule } from "./service-admin/service-admin.module.js";
import { AiConnectionsModule } from "./ai-connections/ai-connections.module.js";
import { requestTraceMiddleware } from "./trace-id.middleware.js";
import { sensitiveRateLimitMiddleware } from "./sensitive-rate-limit.middleware.js";
import { WorkspaceModule } from "./workspace/workspace.module.js";
import { KnowledgeSourcesModule } from "./knowledge-sources/knowledge-sources.module.js";

@Module({
  imports: [
    WorkspaceAuditModule,
    AutomationModule,
    BillingModule,
    ConversationModule,
    FeatureFlagModule,
    IdentityModule,
    IncidentModule,
    IntegrationModule,
    OpenChannelModule,
    NotificationModule,
    OperationsModule,
    PlatformModule,
    PresenceModule,
    QualityModule,
    ReportModule,
    RoutingModule,
    ServiceAdminModule,
    AiConnectionsModule,
    WorkspaceModule,
    KnowledgeSourcesModule
  ],
  controllers: [HealthController, MetricsController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestTraceMiddleware, sensitiveRateLimitMiddleware).forRoutes("*");
  }
}
