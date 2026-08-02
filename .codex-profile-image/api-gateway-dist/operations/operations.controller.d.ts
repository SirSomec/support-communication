import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { OperationsReadinessService } from "./operations-readiness.service.js";
interface OperationBody {
    confirmed?: boolean;
    idempotencyKey?: string;
    reason?: string;
}
export declare class OperationsController {
    private readonly operationsReadinessService;
    constructor(operationsReadinessService: OperationsReadinessService);
    fetchReadinessDashboard(query: {
        domain?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    queueLoadTestRun(scenarioId: string, payload: OperationBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    queueRestoreCheck(drillId: string, payload: OperationBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchDeadLetterDashboard(query: {
        queue?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    replayDeadLetterMessage(messageId: string, payload: OperationBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    checkMigrationRollback(migrationId: string, payload: OperationBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchSecurityReview(query: {
        area?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
export {};
