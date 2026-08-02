import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { IncidentService } from "./incident.service.js";
export declare class IncidentController {
    private readonly incidentService;
    constructor(incidentService: IncidentService);
    fetchIncidents(filters: {
        componentId?: string;
        severity?: string;
        status?: string;
        tenantId?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchIncidentDetail(incidentId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    addIncidentUpdate(incidentId: string, payload: {
        confirmed?: boolean;
        customerVisible?: boolean;
        idempotencyKey?: string;
        message?: string;
        reason?: string;
        status?: "identified" | "investigating" | "monitoring" | "resolved";
    }, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
