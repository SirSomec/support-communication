import type { FeatureFlag, PlatformComponent, PlatformIncident, PlatformTenant } from "../../apps/api-gateway/src/platform/platform.types.ts";
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
