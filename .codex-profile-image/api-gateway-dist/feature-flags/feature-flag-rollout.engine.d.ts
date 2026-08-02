import type { FeatureFlag } from "../platform/platform.types.js";
export type FeatureFlagRuleStatus = FeatureFlag["status"];
export type FeatureFlagRuleTargeting = "segment" | "tenant";
export interface PlatformFeatureFlagRuleVariant {
    id: string;
    weight: number;
}
export interface PlatformFeatureFlagRule {
    bucketSalt: string;
    enabledTenantIds: string[];
    flagId: string;
    flagKey: string;
    id: string;
    rollout: number;
    segments: string[];
    status: FeatureFlagRuleStatus;
    targeting: FeatureFlagRuleTargeting;
    updatedAt: string;
    variants: PlatformFeatureFlagRuleVariant[];
}
export interface PlatformFeatureFlagRuleFilters {
    flagId?: string;
    flagKey?: string;
    targeting?: FeatureFlagRuleTargeting;
}
export interface FeatureFlagRolloutTenant {
    id: string;
    planId: string;
}
export interface FeatureFlagRolloutEvaluationInput {
    planId?: string;
    rule: PlatformFeatureFlagRule;
    segment?: string;
    tenantId: string;
}
export interface FeatureFlagRolloutEvaluation {
    bucket: number;
    eligible: boolean;
    reason: string;
    rollout: number;
    segmentEligible: boolean;
    tenantEligible: boolean;
    variant: string;
}
export interface FeatureFlagPreviewRolloutItem extends FeatureFlagRolloutEvaluation {
    planId: string;
    segment: string;
    tenantId: string;
}
export interface FeatureFlagPreviewRollout {
    eligibleCount: number;
    items: FeatureFlagPreviewRolloutItem[];
}
export interface FeatureFlagRuleValidationResult {
    ok: boolean;
    reason?: string;
}
export declare function validateFeatureFlagRule(rule: PlatformFeatureFlagRule): FeatureFlagRuleValidationResult;
export declare function featureFlagToRolloutRule(flag: FeatureFlag): PlatformFeatureFlagRule;
export declare function resolveDeterministicRolloutBucket(seed: string): number;
export declare function chooseFeatureFlagVariant(rule: PlatformFeatureFlagRule, tenantId: string): string;
export declare function evaluateFeatureFlagRollout(input: FeatureFlagRolloutEvaluationInput): FeatureFlagRolloutEvaluation;
export declare function evaluateTenantTargetingRule(input: FeatureFlagRolloutEvaluationInput): FeatureFlagRolloutEvaluation;
export declare function evaluateSegmentTargetingRule(input: FeatureFlagRolloutEvaluationInput): FeatureFlagRolloutEvaluation;
export declare function buildFeatureFlagPreviewRollout(input: {
    rule: PlatformFeatureFlagRule;
    tenants: FeatureFlagRolloutTenant[];
}): FeatureFlagPreviewRollout;
