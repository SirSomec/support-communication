import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { FeatureFlagService } from "./feature-flag.service.js";
export declare class FeatureFlagController {
    private readonly featureFlagService;
    constructor(featureFlagService: FeatureFlagService);
    fetchFeatureFlags(filters: {
        query?: string;
        scope?: string;
        status?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    previewFlagChange(flagId: string, payload: {
        nextRollout?: unknown;
        nextStatus?: "guarded" | "gradual" | "off" | "on";
        reason?: string;
        tenantIds?: string[];
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateFeatureFlag(flagId: string, payload: {
        confirmationText?: string;
        confirmed?: boolean;
        idempotencyKey?: string;
        nextRollout?: unknown;
        nextStatus?: "guarded" | "gradual" | "off" | "on";
        reason?: string;
        tenantIds?: string[];
    }, idempotencyKey: string | undefined, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    runInternalFlagTest(flagId: string, payload: {
        segment?: string;
        tenantId?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
