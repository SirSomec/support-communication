import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { RoutingService } from "./routing.service.js";
export declare class RoutingController {
    private readonly routingService;
    constructor(routingService: RoutingService);
    fetchWorkload(query: {
        channel?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createAssignment(payload: {
        action?: "assign" | "return_queue" | "transfer";
        conversationId: string;
        overrideLimit?: boolean;
        reason?: string;
        targetOperatorId?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    simulateAssignment(payload: {
        conversationId: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    previewRedistribution(payload: {
        idempotencyKey?: string;
        reason?: string;
        selectedQueues?: string[];
        targetRule?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    commitRedistribution(payload: {
        idempotencyKey?: string;
        previewId?: string;
        reason?: string;
        selectedQueues?: string[];
        targetRule?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    pauseSla(payload: {
        conversationId: string;
        durationMinutes?: number | string;
        reason?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    startRescue(payload: {
        conversationId: string;
        durationSeconds?: number;
        reason?: string;
        source?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    resolveRescue(payload: {
        conversationId: string;
        outcome?: "missed" | "returned_to_queue" | "saved";
        reason?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchRescueReport(query: {
        period?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
