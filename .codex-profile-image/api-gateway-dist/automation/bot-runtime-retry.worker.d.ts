import { BotRuntimeService } from "./bot-runtime.service.js";
import type { AutomationRepository } from "./automation.repository.js";
export interface BotRuntimeRetryWorkerInput {
    automationRepository: AutomationRepository;
    leaseMs?: number;
    limit?: number;
    maxAttempts?: number;
    now?: string;
    runtime?: Pick<BotRuntimeService, "handleInboundEvent">;
}
export interface BotRuntimeRetryWorkerResult {
    claimed: number;
    deadLettered: number;
    failed: number;
    retried: number;
    scanned: number;
    skipped: number;
}
export declare function runBotRuntimeRetryOnce(input: BotRuntimeRetryWorkerInput): Promise<BotRuntimeRetryWorkerResult>;
