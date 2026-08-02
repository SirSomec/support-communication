import type { RoutingConversation } from "./routing.types.js";
import type { RoutingJobDescriptor, RoutingRepository, RoutingSlaTimerApplyResult } from "./routing.repository.js";
interface SlaTimerTransitionInput {
    conversation: Pick<RoutingConversation, "id" | "status">;
    job: RoutingJobDescriptor;
    now?: Date;
}
interface SlaTimerClaimWorkerInput {
    leaseDurationMs?: number;
    limit?: number;
    now?: Date;
    routingRepository: Pick<RoutingRepository, "claimJob" | "listJobs">;
    workerId?: string;
}
interface SlaTimerFailureInput {
    error: Error | string;
    failedAt?: Date;
    jobId: string;
    maxAttempts?: number;
    retryBackoffMs?: number;
    routingRepository: Pick<RoutingRepository, "listJobs" | "saveJob">;
}
interface SlaTimerApplyWorkerInput {
    completedAt?: Date;
    routingRepository: Pick<RoutingRepository, "applySlaTimerTransition">;
    transition: SlaTimerTransition;
}
interface SlaTimerClaimWorkerResult {
    claimed: RoutingJobDescriptor[];
}
type SlaTimerApplyWorkerResult = RoutingSlaTimerApplyResult;
interface SlaTimerTransitionReady {
    action: "resume_sla";
    conversationId: string;
    fromStatus: "paused";
    jobId: string;
    leaseOwner?: string;
    tenantId?: string;
    status: "ready";
    toStatus: "active";
}
interface SlaTimerOverdueTransitionReady {
    action: "mark_sla_overdue";
    conversationId: string;
    fromStatus: "active" | "assigned";
    jobId: string;
    leaseOwner?: string;
    tenantId?: string;
    status: "ready";
    toSlaTone: "danger";
    toStatus: "active" | "assigned";
}
interface SlaTimerTransitionSkipped {
    action: string | undefined;
    conversationId: string;
    jobId: string;
    reason: "not_due" | "not_paused" | "unsupported_action" | "unsupported_queue";
    status: "skipped";
}
export type SlaTimerTransition = SlaTimerOverdueTransitionReady | SlaTimerTransitionReady | SlaTimerTransitionSkipped;
export declare function claimDueSlaTimerJobs(input: SlaTimerClaimWorkerInput): Promise<SlaTimerClaimWorkerResult>;
export declare function recordSlaTimerJobFailure(input: SlaTimerFailureInput): Promise<RoutingJobDescriptor>;
export declare function applySlaTimerTransition(input: SlaTimerApplyWorkerInput): Promise<SlaTimerApplyWorkerResult>;
export declare function planSlaTimerTransition(input: SlaTimerTransitionInput): SlaTimerTransition;
export {};
