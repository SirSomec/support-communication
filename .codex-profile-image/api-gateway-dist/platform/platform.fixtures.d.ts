export interface PlatformTenant {
    id: string;
    name: string;
    planId: string;
    region: string;
    status: string;
}
export interface PlatformComponent {
    id: string;
    name: string;
    status: "degraded" | "operational" | "partial_outage";
    ownerTeam: string;
    region: string;
    latencyMs: number;
    errorRate: number;
    uptime: number;
    tenantImpact: number;
    dependencies: string[];
    signals: Array<{
        label: string;
        tone: "danger" | "ok" | "warn";
        value: string;
    }>;
    recentEvents: string[];
}
export interface PlatformIncident {
    id: string;
    title: string;
    status: "identified" | "investigating" | "monitoring" | "resolved";
    severity: "sev1" | "sev2" | "sev3";
    componentId: string;
    owner: string;
    startedAt: string;
    updatedAt: string;
    affectedTenantIds: string[];
    impact: string;
    customerMessage: string;
    updates: Array<{
        at: string;
        author: string;
        text: string;
    }>;
}
export interface FeatureFlag {
    id: string;
    key: string;
    name: string;
    status: "guarded" | "gradual" | "off" | "on";
    environment: string;
    scope: "plan" | "tenant";
    rollout: number;
    owner: string;
    segments: string[];
    enabledTenantIds: string[];
    variants: Array<{
        id: string;
        weight: number;
    }>;
    killSwitch: boolean;
    updatedAt: string;
}
export declare const platformTenants: PlatformTenant[];
export declare const platformComponents: PlatformComponent[];
export declare const platformMetrics: {
    id: string;
    label: string;
    value: number;
    unit: string;
    componentId: string;
    tone: string;
}[];
export declare const platformIncidents: PlatformIncident[];
export declare const maintenanceWindows: {
    id: string;
    componentId: string;
    startsAt: string;
    endsAt: string;
    customerVisible: boolean;
    status: string;
    summary: string;
}[];
export declare const incidentPostmortems: {
    incidentId: string;
    status: string;
    dueAt: string;
    owner: string;
}[];
export declare const featureFlags: FeatureFlag[];
