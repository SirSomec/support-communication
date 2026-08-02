import type { RoutingJobDescriptor, RoutingRepository, RoutingRescueReturnApplyResult } from "./routing.repository.js";
interface RescueReturnClaimWorkerInput {
    leaseDurationMs?: number;
    limit?: number;
    now?: Date;
    routingRepository: Pick<RoutingRepository, "claimJob" | "listJobs">;
    workerId?: string;
}
interface RescueReturnApplyWorkerInput {
    completedAt?: Date;
    job: RoutingJobDescriptor;
    routingRepository: Pick<RoutingRepository, "applyRescueReturnTransition">;
}
interface RescueReturnClaimWorkerResult {
    claimed: RoutingJobDescriptor[];
}
type RescueReturnApplyWorkerResult = RoutingRescueReturnApplyResult;
export declare function claimExpiredRescueReturnJobs(input: RescueReturnClaimWorkerInput): Promise<RescueReturnClaimWorkerResult>;
export declare function applyRescueReturnTransition(input: RescueReturnApplyWorkerInput): Promise<RescueReturnApplyWorkerResult>;
export {};
