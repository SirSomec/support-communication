export function validateFeatureFlagRule(rule) {
    if (!isPlainRecord(rule)) {
        return { ok: false, reason: "rule_invalid" };
    }
    if (rule.targeting !== "segment" && rule.targeting !== "tenant") {
        return { ok: false, reason: "targeting_unsupported" };
    }
    if (!["guarded", "gradual", "off", "on"].includes(String(rule.status))) {
        return { ok: false, reason: "status_unsupported" };
    }
    if (!isNonEmptyString(rule.bucketSalt)) {
        return { ok: false, reason: "bucket_salt_required" };
    }
    if (!isNonEmptyString(rule.flagId) || !isNonEmptyString(rule.flagKey) || !isNonEmptyString(rule.id)) {
        return { ok: false, reason: "flag_identity_required" };
    }
    if (!Array.isArray(rule.enabledTenantIds) || !rule.enabledTenantIds.every(isNonEmptyString)) {
        return { ok: false, reason: "enabled_tenants_invalid" };
    }
    if (!Array.isArray(rule.segments) || !rule.segments.every(isNonEmptyString)) {
        return { ok: false, reason: "segments_invalid" };
    }
    if (!Number.isFinite(rule.rollout) || rule.rollout < 0 || rule.rollout > 100) {
        return { ok: false, reason: "rollout_out_of_range" };
    }
    if (rule.targeting === "segment" && rule.segments.length === 0) {
        return { ok: false, reason: "segment_targeting_segments_required" };
    }
    if (!Array.isArray(rule.variants)) {
        return { ok: false, reason: "variants_invalid" };
    }
    if (rule.variants.some((variant) => !isPlainRecord(variant) ||
        !isNonEmptyString(variant.id) ||
        !Number.isFinite(variant.weight) ||
        variant.weight < 0)) {
        return { ok: false, reason: "variant_invalid" };
    }
    const totalWeight = rule.variants.reduce((sum, variant) => sum + variant.weight, 0);
    if (!rule.variants.length || totalWeight <= 0) {
        return { ok: false, reason: "variant_weights_invalid" };
    }
    return { ok: true };
}
export function featureFlagToRolloutRule(flag) {
    return {
        bucketSalt: flag.id,
        enabledTenantIds: [...flag.enabledTenantIds],
        flagId: flag.id,
        flagKey: flag.key,
        id: `rule-${flag.id}`,
        rollout: flag.rollout,
        segments: [...flag.segments],
        status: flag.status,
        targeting: flag.scope === "plan" ? "segment" : "tenant",
        updatedAt: flag.updatedAt,
        variants: flag.variants.map((variant) => ({ ...variant }))
    };
}
export function resolveDeterministicRolloutBucket(seed) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % 100;
}
export function chooseFeatureFlagVariant(rule, tenantId) {
    const validation = validateFeatureFlagRule(rule);
    if (!validation.ok) {
        return "control";
    }
    const totalWeight = rule.variants.reduce((sum, variant) => sum + variant.weight, 0);
    const bucket = resolveDeterministicRolloutBucket(`${rule.flagKey}:${tenantId}:variant:${rule.bucketSalt}`);
    const target = bucket % totalWeight;
    let cursor = 0;
    for (const variant of rule.variants) {
        cursor += variant.weight;
        if (target < cursor) {
            return variant.id;
        }
    }
    return rule.variants[0]?.id ?? "control";
}
export function evaluateFeatureFlagRollout(input) {
    const validation = validateFeatureFlagRule(input.rule);
    if (!validation.ok) {
        return ineligibleEvaluation(input.rule, validation.reason ?? "rule_invalid");
    }
    if (input.rule.targeting === "segment") {
        return evaluateSegmentTargetingRule(input);
    }
    return evaluateTenantTargetingRule(input);
}
export function evaluateTenantTargetingRule(input) {
    const validation = validateFeatureFlagRule(input.rule);
    if (!validation.ok) {
        return ineligibleEvaluation(input.rule, validation.reason ?? "rule_invalid");
    }
    if (input.rule.status === "off") {
        return ineligibleEvaluation(input.rule, "flag_off");
    }
    const bucket = resolveDeterministicRolloutBucket(`${input.rule.flagKey}:${input.tenantId}:${input.rule.bucketSalt}`);
    if (input.rule.enabledTenantIds.includes(input.tenantId)) {
        return eligibleEvaluation(input.rule, bucket, input.tenantId, true, true, "tenant_allowlist");
    }
    if (input.rule.rollout >= 100) {
        return eligibleEvaluation(input.rule, bucket, input.tenantId, true, true, "tenant_rollout_full");
    }
    if (bucket < input.rule.rollout) {
        return eligibleEvaluation(input.rule, bucket, input.tenantId, true, true, "tenant_bucket");
    }
    return {
        bucket,
        eligible: false,
        reason: "tenant_bucket_denied",
        rollout: input.rule.rollout,
        segmentEligible: true,
        tenantEligible: false,
        variant: "control"
    };
}
export function evaluateSegmentTargetingRule(input) {
    const validation = validateFeatureFlagRule(input.rule);
    if (!validation.ok) {
        return ineligibleEvaluation(input.rule, validation.reason ?? "rule_invalid");
    }
    if (input.rule.status === "off") {
        return ineligibleEvaluation(input.rule, "flag_off");
    }
    const segment = input.segment ?? input.planId ?? "";
    const segmentEligible = input.rule.segments.includes(segment);
    const bucket = resolveDeterministicRolloutBucket(`${input.rule.flagKey}:${input.tenantId}:${segment}:${input.rule.bucketSalt}`);
    if (input.rule.enabledTenantIds.includes(input.tenantId)) {
        return eligibleEvaluation(input.rule, bucket, input.tenantId, segmentEligible, true, "tenant_allowlist", true);
    }
    if (!segmentEligible) {
        return {
            bucket,
            eligible: false,
            reason: "segment_not_targeted",
            rollout: input.rule.rollout,
            segmentEligible: false,
            tenantEligible: false,
            variant: "control"
        };
    }
    if (input.rule.rollout >= 100) {
        return eligibleEvaluation(input.rule, bucket, input.tenantId, segmentEligible, true, "segment_rollout_full", segmentEligible);
    }
    if (bucket < input.rule.rollout) {
        return eligibleEvaluation(input.rule, bucket, input.tenantId, segmentEligible, true, "segment_bucket", segmentEligible);
    }
    return {
        bucket,
        eligible: false,
        reason: "segment_bucket_denied",
        rollout: input.rule.rollout,
        segmentEligible,
        tenantEligible: false,
        variant: "control"
    };
}
export function buildFeatureFlagPreviewRollout(input) {
    const items = input.tenants.map((tenant) => {
        const evaluation = evaluateFeatureFlagRollout({
            planId: tenant.planId,
            rule: input.rule,
            segment: tenant.planId,
            tenantId: tenant.id
        });
        return {
            ...evaluation,
            planId: tenant.planId,
            segment: tenant.planId,
            tenantId: tenant.id
        };
    });
    return {
        eligibleCount: items.filter((item) => item.eligible).length,
        items
    };
}
function eligibleEvaluation(rule, bucket, tenantId, segmentEligible, tenantEligible, reason, segmentEligibleOverride) {
    return {
        bucket,
        eligible: true,
        reason,
        rollout: rule.rollout,
        segmentEligible: segmentEligibleOverride ?? segmentEligible,
        tenantEligible,
        variant: chooseFeatureFlagVariant(rule, tenantId)
    };
}
function ineligibleEvaluation(rule, reason) {
    return {
        bucket: 0,
        eligible: false,
        reason,
        rollout: rule.rollout,
        segmentEligible: false,
        tenantEligible: false,
        variant: "control"
    };
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPlainRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=feature-flag-rollout.engine.js.map