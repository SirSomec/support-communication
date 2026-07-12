export * from "./seed-catalog.js";

import {
  featureFlags,
  incidentPostmortems,
  maintenanceWindows,
  platformComponents,
  platformIncidents,
  platformMetrics,
  platformTenants
} from "./seed-catalog.js";
import type { PlatformState } from "./platform.repository.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function bootstrapPlatformState(base?: Partial<PlatformState>): PlatformState {
  return {
    alertAcknowledgements: base?.alertAcknowledgements ?? [],
    alertRoutingRules: base?.alertRoutingRules ?? [],
    components: clone(platformComponents),
    featureFlagOutbox: base?.featureFlagOutbox ?? [],
    featureFlagRules: base?.featureFlagRules ?? [],
    featureFlags: clone(featureFlags),
    healthRollups: base?.healthRollups ?? [],
    incidentCommunicationAttempts: base?.incidentCommunicationAttempts ?? [],
    incidentCommunicationDeadLetters: base?.incidentCommunicationDeadLetters ?? [],
    incidentCommunicationRetries: base?.incidentCommunicationRetries ?? [],
    incidentIdempotencyKeys: base?.incidentIdempotencyKeys ?? [],
    incidentPostmortems: clone(incidentPostmortems),
    incidents: clone(platformIncidents),
    maintenanceWindows: clone(maintenanceWindows),
    platformAuditRows: base?.platformAuditRows ?? [],
    platformOutboxRows: base?.platformOutboxRows ?? [],
    platformTenants: clone(platformTenants),
    staticMetrics: clone(platformMetrics) as PlatformState["staticMetrics"],
    telemetrySamples: base?.telemetrySamples ?? []
  };
}
