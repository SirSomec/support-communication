const SERVICE = "backendIntegrationService";
const OPERATION = "fetchBackendIntegrationSnapshot";

const serviceReadiness = [
  ["dialogService", ["fetchDialogs", "transitionConversationStatus", "uploadAttachment", "createOutboundConversationRequest"]],
  ["clientService", ["fetchClientProfiles", "mergeClientProfiles", "unmergeClientProfile"]],
  ["templateService", ["fetchTemplates", "saveTemplate"]],
  ["reportService", ["fetchReportWorkspace", "requestReportExport", "retryReportExport", "getExportFileDescriptor"]],
  ["settingsService", ["fetchEmployees", "inviteEmployee", "updateEmployee", "resetEmployeePassword", "resetEmployeeMfa", "deactivateEmployee", "fetchRoles", "fetchGroups", "createGroup", "updateGroup", "fetchTopics", "createTopic", "updateTopic", "archiveTopic", "restoreTopic", "fetchTopicUsage", "fetchRules", "updateRule", "testRule"]],
  ["integrationService", ["fetchIntegrationWorkspace", "testChannelConnection", "rotateApiKey", "replayWebhookDelivery", "revokeSecuritySession"]],
  ["permissionService", ["validatePermission", "fetchPermissionModel"]],
  ["visitorService", ["fetchVisitorWorkspace", "saveProactiveRule", "triggerRescueReturn"]],
  ["automationService", ["fetchAutomationWorkspace", "validateBotFlowImport", "publishBotScenario", "testBotScenario"]],
  ["qualityService", ["fetchQualityWorkspace", "scoreDraftResponse"]],
  ["auditService", ["fetchAuditEvents", "exportAuditEvents", "redactAuditEvent"]],
  ["authService", ["getAuthState", "login", "logout"]],
  ["tenantService", ["fetchTenants", "fetchTenantDetail", "updateTenantStatus"]],
  ["billingService", ["fetchTariffs", "previewTariffChange", "changeTenantTariff"]],
  ["platformMonitoringService", ["fetchPlatformSnapshot", "fetchComponentDrilldown", "acknowledgeComponentAlert"]],
  ["supportAdminService", ["fetchSupportUsers", "resetTwoFactor", "forceLogout", "blockUser", "resendInvite", "startImpersonation", "stopImpersonation"]],
  ["incidentService", ["fetchIncidents", "fetchIncidentDetail", "addIncidentUpdate"]],
  ["featureFlagService", ["fetchFeatureFlags", "previewFlagChange", "updateFeatureFlag"]]
];

const routeGaps = [
  {
    service: "auditService",
    operations: ["exportAuditEvents", "redactAuditEvent"],
    routes: [
      "POST /service-admin/audit-events/exports",
      "POST /service-admin/audit-events/:eventId/redactions"
    ]
  }
];

const backlogCoverage = [
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
];

export const backendIntegrationService = {
  async fetchBackendIntegrationSnapshot() {
    return {
      service: SERVICE,
      operation: OPERATION,
      status: "ok",
      partial: true,
      traceId: `trc_${SERVICE}_${Date.now()}`,
      updatedAt: new Date().toISOString(),
      data: {
        services: serviceReadiness.map(([id, operations]) => buildServiceReadiness(id, operations)),
        contract: {
          envelope: ["service", "operation", "status", "traceId", "states", "meta", "data", "error"],
          states: ["loading", "empty", "error", "partial"],
          realBackendBoundary: "replace src/services adapters with API clients"
        },
        routeGaps,
        backlogCoverage
      },
      error: null,
      states: {
        loading: false,
        empty: false,
        error: false,
        partial: true
      },
      meta: {
        source: "api-client"
      }
    };
  }
};

function buildServiceReadiness(id, operations) {
  if (id === "auditService") {
    return {
      id,
      status: "partial",
      operations,
      traceId: `trc_${id}_partial`,
      states: ["loading", "empty", "error", "partial"],
      note: "fetchAuditEvents is connected to API Gateway; audit export and redaction routes are not exposed yet.",
      backlog: ["audit_export_route", "audit_redaction_route"],
      meta: {
        source: "api-gateway",
        routeGaps: routeGaps[0].routes
      }
    };
  }

  return {
    id,
    status: "ready",
    operations,
    traceId: `trc_${id}_ready`,
    states: ["loading", "empty", "error", "partial"],
    note: "Connected to API Gateway routes."
  };
}
