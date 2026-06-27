import { auditService } from "./auditService.js";
import { automationService } from "./automationService.js";
import { clientService } from "./clientService.js";
import { dialogService } from "./dialogService.js";
import { integrationService } from "./integrationService.js";
import { permissionService } from "./permissionService.js";
import { qualityService } from "./qualityService.js";
import { reportService } from "./reportService.js";
import { templateService } from "./templateService.js";
import { visitorService } from "./visitorService.js";
import { createEnvelope } from "./mockBackend.js";

const SERVICE = "backendIntegrationService";

const serviceRegistry = [
  dialogService,
  clientService,
  templateService,
  reportService,
  integrationService,
  permissionService,
  visitorService,
  automationService,
  qualityService,
  auditService
];

export const backendIntegrationService = {
  async fetchBackendIntegrationSnapshot() {
    const services = serviceRegistry.map((service) => service.getReadiness());

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
          "audit_export_redaction"
        ]
      }
    });
  }
};
