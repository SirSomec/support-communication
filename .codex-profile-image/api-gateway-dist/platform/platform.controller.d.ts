import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { PlatformMonitoringService } from "./platform-monitoring.service.js";
export declare class PlatformController {
    private readonly platformMonitoringService;
    constructor(platformMonitoringService: PlatformMonitoringService);
    fetchPlatformSnapshot(filters: {
        region?: string;
        status?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchComponentDrilldown(componentId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    acknowledgeComponentAlert(componentId: string, payload: {
        confirmed?: boolean;
        idempotencyKey?: string;
        reason?: string;
    }, idempotencyKey: string | undefined, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    ingestTelemetrySample(payload: {
        componentId?: string;
        id?: string;
        metricKey?: string;
        sampledAt?: string;
        source?: string;
        tags?: Record<string, unknown>;
        tenantId?: string | null;
        unit?: string;
        value?: number;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    writeHealthRollup(payload: {
        availability?: number;
        componentId?: string;
        errorRate?: number;
        generatedAt?: string;
        id?: string;
        incidentIds?: string[];
        latencyP95Ms?: number;
        sampleCount?: number;
        status?: string;
        windowEnd?: string;
        windowStart?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    saveAlertRoutingRule(payload: {
        componentIds?: string[];
        destination?: {
            channel?: string;
            target?: string;
        };
        enabled?: boolean;
        ruleId?: string;
        severities?: string[];
        statuses?: string[];
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
export declare class PlatformMonitoringAliasController {
    private readonly platformMonitoringService;
    constructor(platformMonitoringService: PlatformMonitoringService);
    fetchPlatformSnapshot(filters: {
        region?: string;
        status?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchComponentDrilldown(componentId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    acknowledgeComponentAlert(componentId: string, payload: {
        confirmed?: boolean;
        idempotencyKey?: string;
        reason?: string;
    }, idempotencyKey: string | undefined, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    ingestTelemetrySample(payload: {
        componentId?: string;
        id?: string;
        metricKey?: string;
        sampledAt?: string;
        source?: string;
        tags?: Record<string, unknown>;
        tenantId?: string | null;
        unit?: string;
        value?: number;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    writeHealthRollup(payload: {
        availability?: number;
        componentId?: string;
        errorRate?: number;
        generatedAt?: string;
        id?: string;
        incidentIds?: string[];
        latencyP95Ms?: number;
        sampleCount?: number;
        status?: string;
        windowEnd?: string;
        windowStart?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    saveAlertRoutingRule(payload: {
        componentIds?: string[];
        destination?: {
            channel?: string;
            target?: string;
        };
        enabled?: boolean;
        ruleId?: string;
        severities?: string[];
        statuses?: string[];
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
