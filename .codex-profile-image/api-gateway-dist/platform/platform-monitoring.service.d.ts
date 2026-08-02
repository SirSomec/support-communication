import { type BackendEnvelope } from "@support-communication/envelope";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import { PlatformRepository } from "./platform.repository.js";
interface PlatformFilters {
    region?: string;
    status?: string;
}
interface AcknowledgePayload {
    actor?: ServiceAdminActor;
    componentId?: string;
    confirmed?: boolean;
    idempotencyKey?: string;
    reason?: string;
}
interface IngestTelemetrySamplePayload {
    componentId?: string;
    id?: string;
    metricKey?: string;
    sampledAt?: string;
    source?: string;
    tags?: Record<string, unknown>;
    tenantId?: string | null;
    unit?: string;
    value?: number;
}
interface WriteHealthRollupPayload {
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
}
interface SaveAlertRoutingRulePayload {
    componentIds?: string[];
    destination?: {
        channel?: string;
        target?: string;
    };
    enabled?: boolean;
    ruleId?: string;
    severities?: string[];
    statuses?: string[];
}
export declare class PlatformMonitoringService {
    private readonly platformRepository;
    constructor(platformRepository?: PlatformRepository);
    fetchPlatformSnapshot(filters?: PlatformFilters): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchComponentDrilldown(componentId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    saveAlertRoutingRule(payload: SaveAlertRoutingRulePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    ingestTelemetrySample(payload: IngestTelemetrySamplePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    writeHealthRollup(payload: WriteHealthRollupPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    acknowledgeComponentAlert(payload: AcknowledgePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    private findComponent;
    private resolveWritableComponent;
    private loadReadModel;
}
export {};
