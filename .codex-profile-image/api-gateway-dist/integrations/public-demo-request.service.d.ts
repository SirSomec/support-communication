import { type BackendEnvelope } from "@support-communication/envelope";
import { IntegrationRepository } from "./integration.repository.js";
export interface PublicDemoRequestPayload {
    company?: string;
    consent?: boolean;
    email?: string;
    message?: string;
    name?: string;
    planInterest?: string;
    source?: string;
    website?: string;
}
export interface PublicDemoRequestContext {
    idempotencyKey?: string;
    ip?: string;
    now?: string;
    userAgent?: string;
}
export declare class PublicDemoRequestService {
    private readonly repository;
    constructor(repository?: IntegrationRepository);
    createDemoRequest(payload?: PublicDemoRequestPayload, context?: PublicDemoRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
}
