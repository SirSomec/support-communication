import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { AutomationModule } from "./automation/automation.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { ConversationModule } from "./conversation/conversation.module.js";
import { FeatureFlagModule } from "./feature-flags/feature-flag.module.js";
import { HealthController } from "./health.controller.js";
import { IdentityModule } from "./identity/identity.module.js";
import { IncidentModule } from "./incidents/incident.module.js";
import { IntegrationModule } from "./integrations/integration.module.js";
import { OperationsModule } from "./operations/operations.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { QualityModule } from "./quality/quality.module.js";
import { ReportModule } from "./reports/report.module.js";
import { RoutingModule } from "./routing/routing.module.js";
import { ServiceAdminModule } from "./service-admin/service-admin.module.js";
import { requestTraceMiddleware } from "./trace-id.middleware.js";
import { WorkspaceModule } from "./workspace/workspace.module.js";

@Module({
  imports: [
    AutomationModule,
    BillingModule,
    ConversationModule,
    FeatureFlagModule,
    IdentityModule,
    IncidentModule,
    IntegrationModule,
    OperationsModule,
    PlatformModule,
    QualityModule,
    ReportModule,
    RoutingModule,
    ServiceAdminModule,
    WorkspaceModule
  ],
  controllers: [HealthController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestTraceMiddleware).forRoutes("*");
  }
}
