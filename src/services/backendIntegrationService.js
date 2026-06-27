import { auditService } from "./auditService.js";
import { automationService } from "./automationService.js";
import { clientService } from "./clientService.js";
import { createEnvelope } from "./mockBackend.js";
import { dialogService } from "./dialogService.js";
import { integrationService } from "./integrationService.js";
import { reportService } from "./reportService.js";
import { visitorService } from "./visitorService.js";

const SERVICE = "backendIntegrationService";

const loadedServiceRegistry = [
  dialogService,
  clientService,
  reportService,
  integrationService,
  visitorService,
  automationService,
  auditService
];

const lazyServiceRegistry = [
  () => import("./templateService.js").then((module) => module.templateService),
  () => import("./permissionService.js").then((module) => module.permissionService),
  () => import("./qualityService.js").then((module) => module.qualityService),
  () => import("./authService.js").then((module) => module.authService),
  () => import("./tenantService.js").then((module) => module.tenantService),
  () => import("./billingService.js").then((module) => module.billingService),
  () => import("./platformMonitoringService.js").then((module) => module.platformMonitoringService),
  () => import("./supportAdminService.js").then((module) => module.supportAdminService),
  () => import("./incidentService.js").then((module) => module.incidentService),
  () => import("./featureFlagService.js").then((module) => module.featureFlagService)
];

export const backendIntegrationService = {
  async fetchBackendIntegrationSnapshot() {
    const lazyServiceAdapters = await Promise.all(lazyServiceRegistry.map((loadService) => loadService()));
    const serviceAdapters = [
      loadedServiceRegistry[0],
      loadedServiceRegistry[1],
      lazyServiceAdapters[0],
      loadedServiceRegistry[2],
      loadedServiceRegistry[3],
      lazyServiceAdapters[1],
      loadedServiceRegistry[4],
      loadedServiceRegistry[5],
      lazyServiceAdapters[2],
      loadedServiceRegistry[6],
      ...lazyServiceAdapters.slice(3)
    ];
    const services = serviceAdapters.map((service) => service.getReadiness());

    return createEnvelope({
      service: SERVICE,
      operation: "fetchBackendIntegrationSnapshot",
      partial: true,
      data: {
        services,
        contract: {
          envelope: ["service", "operation", "status", "traceId", "states", "meta", "data", "error"],
          states: ["loading", "empty", "error", "partial"],
          realBackendBoundary: "replace src/services adapters with API clients"
        },
        backlogCoverage: [
          "permission_denial_audit",
          "client_merge_graph",
          "report_export_queue",
          "channel_tests_webhook_replay",
          "key_rotation_session_revoke",
          "proactive_caps_rescue_countdown",
          "bot_publish_import_runtime",
          "quality_scoring_telemetry",
          "audit_export_redaction",
          "auth_session_2fa_invite",
          "tenant_billing_quota_management",
          "platform_monitoring_incidents",
          "support_admin_impersonation",
          "feature_flag_rollout_audit"
        ]
      }
    });
  }
};
