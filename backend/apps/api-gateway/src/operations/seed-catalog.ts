import type { BackupDrill, DeadLetterMessage, DeadLetterQueue, LoadTestScenario, MigrationCandidate, SecurityControl } from "./operations.types.js";

export const loadTestScenarios: LoadTestScenario[] = [
  {
    id: "lt-critical-flows",
    name: "Critical support workflows",
    domain: "delivery",
    workflows: ["dialogs", "message-send", "webhook-delivery", "report-export", "realtime-fanout"],
    targetRps: 420,
    durationMinutes: 30,
    status: "needs_review",
    blockers: ["restore drill is stale"]
  },
  {
    id: "lt-webhook-delivery",
    name: "Webhook delivery fan-out",
    domain: "delivery",
    workflows: ["webhook-delivery", "dead-letter-replay"],
    targetRps: 260,
    durationMinutes: 20,
    status: "ready",
    blockers: []
  },
  {
    id: "lt-report-export",
    name: "Report export queue pressure",
    domain: "analytics",
    workflows: ["report-export"],
    targetRps: 80,
    durationMinutes: 25,
    status: "ready",
    blockers: []
  }
];

export const backupDrills: BackupDrill[] = [
  {
    id: "backup-postgres-nightly",
    name: "PostgreSQL and object metadata restore",
    domain: "delivery",
    targets: ["postgres", "object-storage-metadata"],
    lastRunAt: "2026-06-20T01:00:00.000Z",
    restoreVerifiedAt: null,
    status: "stale",
    blockers: ["restore verification is older than policy window"]
  },
  {
    id: "backup-audit-ledger",
    name: "Audit ledger restore",
    domain: "security",
    targets: ["postgres", "audit-ledger"],
    lastRunAt: "2026-06-25T01:00:00.000Z",
    restoreVerifiedAt: "2026-06-25T02:14:00.000Z",
    status: "pass",
    blockers: []
  }
];

export const deadLetterQueues: DeadLetterQueue[] = [
  {
    id: "dlq-webhooks",
    name: "webhook-delivery",
    domain: "delivery",
    depth: 17,
    oldestMessageAgeMinutes: 42,
    replayEnabled: true,
    status: "watch"
  },
  {
    id: "dlq-reports",
    name: "report-export",
    domain: "analytics",
    depth: 3,
    oldestMessageAgeMinutes: 18,
    replayEnabled: true,
    status: "watch"
  },
  {
    id: "dlq-realtime",
    name: "realtime-fanout",
    domain: "delivery",
    depth: 0,
    oldestMessageAgeMinutes: 0,
    replayEnabled: false,
    status: "clear"
  },
  {
    id: "dlq-billing",
    name: "billing-sync",
    domain: "billing",
    depth: 1,
    oldestMessageAgeMinutes: 55,
    replayEnabled: false,
    status: "blocked"
  }
];

export const deadLetterMessages: DeadLetterMessage[] = [
  {
    id: "dlm-webhook-001",
    queueId: "dlq-webhooks",
    queueName: "webhook-delivery",
    resourceType: "webhook_delivery",
    resourceId: "whd_1420",
    originalTraceId: "trc_webhook_dlq_001",
    failureCode: "signature_verification_failed",
    failedAt: "2026-06-27T07:21:00.000Z",
    attempts: 3,
    payloadRedacted: true
  },
  {
    id: "dlm-report-001",
    queueId: "dlq-reports",
    queueName: "report-export",
    resourceType: "report_export",
    resourceId: "export-2421",
    originalTraceId: "trc_report_dlq_001",
    failureCode: "file_descriptor_expired",
    failedAt: "2026-06-27T07:36:00.000Z",
    attempts: 2,
    payloadRedacted: true
  },
  {
    id: "dlm-billing-001",
    queueId: "dlq-billing",
    queueName: "billing-sync",
    resourceType: "billing_sync",
    resourceId: "bill-sync-401",
    originalTraceId: "trc_billing_dlq_001",
    failureCode: "provider_lock_required",
    failedAt: "2026-06-27T07:48:00.000Z",
    attempts: 4,
    payloadRedacted: true
  }
];

export const migrationCandidates: MigrationCandidate[] = [
  {
    id: "mig-add-message-search-index",
    name: "Add message search covering index",
    service: "conversation",
    status: "ready",
    applyCommand: "npm run db:migrate -- --to mig-add-message-search-index",
    rollbackCommand: "npm run db:rollback -- --to mig-add-message-search-index",
    compatibilityChecks: [
      { id: "contract-openapi", name: "OpenAPI compatibility", status: "passed", detail: "No response field removals." },
      { id: "tenant-partition", name: "Tenant partition scan", status: "passed", detail: "Index includes tenant_id." },
      { id: "rollback-lock", name: "Rollback lock duration", status: "warn", detail: "Rollback must run during low traffic window." }
    ]
  },
  {
    id: "mig-drop-legacy-channel",
    name: "Drop legacy channel bridge",
    service: "integrations",
    status: "blocked",
    applyCommand: "npm run db:migrate -- --to mig-drop-legacy-channel",
    rollbackCommand: "npm run db:rollback -- --to mig-drop-legacy-channel",
    compatibilityChecks: [
      { id: "contract-openapi", name: "OpenAPI compatibility", status: "failed", detail: "Legacy channel fields are still consumed." },
      { id: "rollback-plan", name: "Rollback plan", status: "passed", detail: "Rollback command is present." }
    ]
  }
];

export const securityControls: SecurityControl[] = [
  {
    id: "sec-auth-mfa",
    area: "auth",
    title: "Service-admin MFA and session expiry",
    status: "pass",
    secretMaterialExposed: false,
    evidence: ["MFA headers required for privileged routes", "session expiry checked by gateway guard"]
  },
  {
    id: "sec-tenant-isolation",
    area: "tenant_isolation",
    title: "Tenant-owned API isolation",
    status: "warn",
    secretMaterialExposed: false,
    evidence: ["tenant filters are explicit in contract tests", "persistent row-level policies still pending"]
  },
  {
    id: "sec-api-key-rotation",
    area: "api_keys",
    title: "Public API key rotation",
    status: "pass",
    secretMaterialExposed: false,
    evidence: ["rotation queue descriptor exists", "raw key material is never returned"]
  },
  {
    id: "sec-audit-immutability",
    area: "audit_immutability",
    title: "Privileged audit immutability",
    status: "warn",
    secretMaterialExposed: false,
    evidence: ["mutation responses include immutable audit descriptors", "durable append-only ledger still pending"]
  },
  {
    id: "sec-sensitive-exports",
    area: "sensitive_exports",
    title: "Sensitive export download policy",
    status: "pass",
    secretMaterialExposed: false,
    evidence: ["permission-aware descriptors hide object keys", "exports require reports.export"]
  }
];
