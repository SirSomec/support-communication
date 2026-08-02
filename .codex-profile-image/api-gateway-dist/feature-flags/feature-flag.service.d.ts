import { type BackendEnvelope } from "@support-communication/envelope";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import type { FeatureFlag } from "../platform/platform.types.js";
import { PlatformRepository } from "../platform/platform.repository.js";
interface FeatureFlagFilters {
    query?: string;
    scope?: string;
    status?: string;
}
interface FeatureFlagChangePayload {
    actor?: ServiceAdminActor;
    confirmationText?: string;
    confirmed?: boolean;
    flagId?: string;
    idempotencyKey?: string;
    nextRollout?: unknown;
    nextStatus?: FeatureFlag["status"];
    reason?: string;
    tenantIds?: string[];
}
interface InternalFlagTestPayload {
    flagId?: string;
    segment?: string;
    tenantId?: string;
}
export declare class FeatureFlagService {
    private readonly platformRepository;
    constructor(platformRepository?: PlatformRepository);
    private listFlags;
    private listTenants;
    fetchFeatureFlags(filters?: FeatureFlagFilters): Promise<BackendEnvelope<Record<string, unknown>>>;
    previewFlagChange(payload: FeatureFlagChangePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateFeatureFlag(payload: FeatureFlagChangePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    runInternalFlagTest(payload: InternalFlagTestPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    private findFlag;
}
export {};
