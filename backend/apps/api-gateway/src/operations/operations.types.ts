export interface LoadTestScenario {
  id: string;
  name: string;
  domain: string;
  workflows: string[];
  targetRps: number;
  durationMinutes: number;
  status: "ready" | "needs_review" | "blocked";
  blockers: string[];
}

export interface BackupDrill {
  id: string;
  name: string;
  domain: string;
  targets: string[];
  lastRunAt: string;
  restoreVerifiedAt: string | null;
  status: "pass" | "stale" | "failed";
  blockers: string[];
}

export interface DeadLetterQueue {
  id: string;
  name: string;
  domain: string;
  depth: number;
  oldestMessageAgeMinutes: number;
  replayEnabled: boolean;
  status: "clear" | "watch" | "blocked";
}

export interface DeadLetterMessage {
  id: string;
  queueId: string;
  queueName: string;
  resourceType: string;
  resourceId: string;
  originalTraceId: string;
  failureCode: string;
  failedAt: string;
  attempts: number;
  payloadRedacted: true;
}

export interface MigrationCandidate {
  id: string;
  name: string;
  service: string;
  status: "planned" | "ready" | "blocked";
  applyCommand: string;
  rollbackCommand: string;
  compatibilityChecks: Array<{ id: string; name: string; status: "passed" | "warn" | "failed"; detail: string }>;
}

export interface SecurityControl {
  id: string;
  area: "api_keys" | "audit_immutability" | "auth" | "sensitive_exports" | "tenant_isolation";
  title: string;
  status: "pass" | "warn" | "blocked";
  secretMaterialExposed: boolean;
  evidence: string[];
}

export interface WorkerObservability {
  deadLetterCount: number;
  evidenceSource:
    | "automation.proactiveDeliveryAttempts"
    | "integration.publicDemoRequestNotificationDescriptors"
    | "integration.webhookDeliveryJournal"
    | "database.billingSyncJobs"
    | "database.outboxEvents"
    | "notifications.deliveryDescriptors"
    | "reports.exportJobs"
    | "reports.scheduledDigestDescriptors";
  health: {
    reason: string;
    status: "blocked" | "degraded" | "healthy";
  };
  lastDelivery: {
    attemptedAt: string;
    deliveryId: string;
    eventType: string;
    status: string;
    traceId: string;
  } | null;
  queue: string;
  queueDepth: number;
  updatedAt: string;
  workerId: string;
}
