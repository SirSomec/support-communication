import { type BackendEnvelope } from "@support-communication/envelope";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import type { PlatformIncident } from "../platform/platform.types.js";
import { PlatformRepository } from "../platform/platform.repository.js";
interface IncidentFilters {
    componentId?: string;
    severity?: string;
    status?: string;
    tenantId?: string;
}
interface IncidentUpdatePayload {
    actor?: ServiceAdminActor;
    confirmed?: boolean;
    customerVisible?: boolean;
    idempotencyKey?: string;
    incidentId?: string;
    message?: string;
    reason?: string;
    status?: PlatformIncident["status"];
}
export declare class IncidentService {
    private readonly platformRepository;
    private readonly idempotencyIndex;
    constructor(platformRepository?: PlatformRepository);
    fetchIncidents(filters?: IncidentFilters): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchIncidentDetail(incidentId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    addIncidentUpdate(payload: IncidentUpdatePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    private findIncident;
}
export {};
