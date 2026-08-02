import { type BackendEnvelope } from "@support-communication/envelope";
import { type HealthResponse, type ReadinessResponse } from "./health.response.js";
export declare class HealthController {
    private readonly config;
    health(requestId?: string): BackendEnvelope<HealthResponse>;
    ready(requestId?: string): Promise<BackendEnvelope<ReadinessResponse>>;
}
