export * from "./seed-catalog.js";
import { featureFlags, incidentPostmortems, maintenanceWindows, platformComponents, platformIncidents, platformMetrics, platformTenants } from "./seed-catalog.js";
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
export function bootstrapPlatformState(base) {
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
        staticMetrics: clone(platformMetrics),
        telemetrySamples: base?.telemetrySamples ?? []
    };
}
//# sourceMappingURL=seed.js.map