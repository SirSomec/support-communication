import { type OutboxEvent } from "@support-communication/events";
import type { ConversationOutboundDescriptor, ConversationOutboundDescriptorRecord, ConversationRepository } from "../conversation/conversation.repository.js";
import type { IntegrationRepository } from "../integrations/integration.repository.js";
import type { ProactiveRule } from "./automation.types.js";
import type { AutomationRepository } from "./automation.repository.js";
import { ProactiveExposureRepository } from "./proactive-exposure.repository.js";
export interface ProactiveDeliveryDescriptorInput {
    channel: string;
    evaluatedAt: string;
    message: string;
    phone: string;
    rule: ProactiveRule;
    subjectId: string;
    tenantId: string;
    topic: string;
    traceId: string;
}
export interface ProactiveDeliveryDescriptorPlan {
    descriptor: ConversationOutboundDescriptor;
    outbox: OutboxEvent;
    requestFingerprint: string;
    ruleId: string;
    status: "planned";
}
export interface EligibleProactiveRuleDeliveryInput {
    activeVariants: string[];
    channel: string;
    evaluatedAt: string;
    message: string;
    phone: string;
    repository: AutomationRepository;
    rules: ProactiveRule[];
    subjectId: string;
    tenantId: string;
    topic: string;
    traceId: string;
}
export interface ProactiveDeliveryPersistenceInput {
    conversationRepository: Pick<ConversationRepository, "recordOutboundDescriptor">;
    plan: ProactiveDeliveryDescriptorPlan;
}
export interface ProactiveDeliveryWorkerRunInput {
    activeVariants?: string[];
    automationRepository: AutomationRepository;
    conversationRepository: Pick<ConversationRepository, "recordOutboundDescriptor">;
    integrationRepository: Pick<IntegrationRepository, "listLiveSdkVisitorPresence">;
    exposureRepository?: ProactiveExposureRepository;
    evaluatedAt?: string;
    limit?: number;
    traceId?: string;
}
export interface ProactiveDeliveryWorkerRunResult {
    conflicted: number;
    duplicate: number;
    failed: number;
    queued: number;
    scanned: number;
    skipped: number;
}
export declare function planProactiveDeliveryDescriptor(input: ProactiveDeliveryDescriptorInput): ProactiveDeliveryDescriptorPlan;
export declare function planEligibleProactiveRuleDelivery(input: EligibleProactiveRuleDeliveryInput): ProactiveDeliveryDescriptorPlan | null;
export declare function planEligibleProactiveRuleDeliveryAsync(input: EligibleProactiveRuleDeliveryInput): Promise<ProactiveDeliveryDescriptorPlan | null>;
export declare function persistProactiveDeliveryPlan(input: ProactiveDeliveryPersistenceInput): Promise<ConversationOutboundDescriptorRecord>;
export declare function runProactiveDeliveryWorkerOnce(input: ProactiveDeliveryWorkerRunInput): Promise<ProactiveDeliveryWorkerRunResult>;
