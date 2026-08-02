var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
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
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(requestTraceMiddleware, sensitiveRateLimitMiddleware).forRoutes("*");
    }
};
AppModule = __decorate([
    Module({
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
], AppModule);
export { AppModule };
//# sourceMappingURL=app.module.js.map