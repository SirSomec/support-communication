import { type BackendConfig } from "@support-communication/config";
import { type BackendEnvelope } from "@support-communication/envelope";
interface DependencyStatus {
    configured: boolean;
    mode: "configuration";
}
export interface HealthResponse {
    service: string;
    status: "ok";
    version: string;
    dependencies: {
        database: DependencyStatus;
        redis: DependencyStatus;
        objectStorage: DependencyStatus;
        mail: DependencyStatus;
    };
}
export interface ReadinessResponse {
    service: string;
    status: "ready" | "unready";
    version: string;
    dependencies?: Record<string, {
        status: "up" | "down";
    }>;
}
export declare function buildHealthEnvelope(config: BackendConfig, requestId?: string): BackendEnvelope<HealthResponse>;
export declare function buildReadinessEnvelope(config: BackendConfig, requestId?: string, dependencies?: Record<string, {
    status: "up" | "down";
}>): BackendEnvelope<ReadinessResponse>;
export declare function checkRuntimeDependencies(config: BackendConfig, timeoutMs?: number): Promise<Record<string, {
    status: "up" | "down";
}>>;
export {};
