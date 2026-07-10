import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFeatureFlagPreviewRollout,
  chooseFeatureFlagVariant,
  evaluateFeatureFlagRollout,
  evaluateSegmentTargetingRule,
  evaluateTenantTargetingRule,
  featureFlagToRolloutRule,
  resolveDeterministicRolloutBucket,
  validateFeatureFlagRule
} from "../apps/api-gateway/src/feature-flags/feature-flag-rollout.engine.ts";
import { featureFlags } from "../apps/api-gateway/src/platform/seed-catalog.ts";
import { PlatformRepository } from "../apps/api-gateway/src/platform/platform.repository.ts";

const tenantRule = {
  bucketSalt: "flag-ai-replies",
  enabledTenantIds: ["tenant-northstar", "tenant-aurora"],
  flagId: "flag-ai-replies",
  flagKey: "ff-ai-replies",
  id: "rule-flag-ai-replies-tenant",
  rollout: 72,
  segments: ["business", "enterprise"],
  status: "on" as const,
  targeting: "tenant" as const,
  updatedAt: "2026-07-01T10:00:00.000Z",
  variants: [
    { id: "control", weight: 28 },
    { id: "assistant-v2", weight: 72 }
  ]
};

const segmentRule = {
  bucketSalt: "flag-billing-v2",
  enabledTenantIds: ["tenant-northstar"],
  flagId: "flag-billing-v2",
  flagKey: "ff-billing-v2",
  id: "rule-flag-billing-v2-segment",
  rollout: 50,
  segments: ["business", "scale"],
  status: "gradual" as const,
  targeting: "segment" as const,
  updatedAt: "2026-07-01T10:00:00.000Z",
  variants: [
    { id: "legacy", weight: 65 },
    { id: "tariff-preview", weight: 35 }
  ]
};

describe("feature flag rollout engine contracts", () => {
  it("defines feature flag rule persistence contracts", () => {
    const repository = PlatformRepository.inMemory();
    const saved = repository.saveFeatureFlagRule(tenantRule);
    saved.rollout = 99;
    repository.saveFeatureFlagRule({
      ...segmentRule,
      id: "rule-flag-billing-v2-segment-2"
    });
    const replay = repository.saveFeatureFlagRule({
      ...tenantRule,
      rollout: 10,
      updatedAt: "2026-07-01T11:00:00.000Z"
    });
    const listed = repository.listFeatureFlagRules({ flagId: "flag-ai-replies" });
    listed[0].rollout = 1;

    assert.equal(replay.rollout, 10);
    assert.equal(replay.updatedAt, "2026-07-01T11:00:00.000Z");
    assert.equal(replay.id, "rule-flag-ai-replies-tenant");
    assert.equal(listed.length, 1);
    assert.equal(repository.listFeatureFlagRules({ flagId: "flag-ai-replies" })[0].rollout, 10);
    assert.equal(listed[0].targeting, "tenant");
    assert.equal(repository.listFeatureFlagRules({ targeting: "segment" }).length, 1);
  });

  it("defines tenant targeting rollout evaluation contracts", () => {
    const whitelisted = evaluateTenantTargetingRule({
      planId: "business",
      rule: tenantRule,
      tenantId: "tenant-northstar"
    });
    const bucket = resolveDeterministicRolloutBucket("ff-ai-replies:tenant-volga:flag-ai-replies");
    const bucketDenied = evaluateTenantTargetingRule({
      planId: "scale",
      rule: { ...tenantRule, rollout: bucket },
      tenantId: "tenant-volga"
    });

    assert.equal(whitelisted.eligible, true);
    assert.equal(whitelisted.tenantEligible, true);
    assert.equal(whitelisted.reason, "tenant_allowlist");
    assert.equal(bucketDenied.eligible, false);
    assert.equal(bucketDenied.reason, "tenant_bucket_denied");
    assert.equal(bucketDenied.bucket, bucket);

    if (bucket < 99) {
      const bucketEligible = evaluateTenantTargetingRule({
        planId: "scale",
        rule: { ...tenantRule, rollout: bucket + 1 },
        tenantId: "tenant-volga"
      });
      assert.equal(bucketEligible.eligible, true);
      assert.equal(bucketEligible.reason, "tenant_bucket");
    }
  });

  it("defines segment targeting rollout evaluation contracts", () => {
    const eligible = evaluateSegmentTargetingRule({
      planId: "business",
      rule: segmentRule,
      segment: "business",
      tenantId: "tenant-volga"
    });
    const wrongSegment = evaluateSegmentTargetingRule({
      planId: "starter",
      rule: segmentRule,
      segment: "starter",
      tenantId: "tenant-lumen"
    });
    const allowlisted = evaluateSegmentTargetingRule({
      planId: "starter",
      rule: segmentRule,
      segment: "starter",
      tenantId: "tenant-northstar"
    });

    assert.equal(eligible.segmentEligible, true);
    assert.equal(wrongSegment.eligible, false);
    assert.equal(wrongSegment.reason, "segment_not_targeted");
    assert.equal(allowlisted.eligible, true);
    assert.equal(allowlisted.reason, "tenant_allowlist");
  });

  it("implements tenant targeting engine with deterministic bucketing", () => {
    const evaluation = evaluateFeatureFlagRollout({
      planId: "enterprise",
      rule: tenantRule,
      tenantId: "tenant-aurora"
    });

    assert.equal(evaluation.eligible, true);
    assert.equal(evaluation.variant, chooseFeatureFlagVariant(tenantRule, "tenant-aurora"));
    assert.equal(
      resolveDeterministicRolloutBucket("ff-ai-replies:tenant-aurora:flag-ai-replies"),
      evaluation.bucket
    );
  });

  it("implements segment targeting engine with deterministic bucketing", () => {
    const evaluation = evaluateFeatureFlagRollout({
      planId: "scale",
      rule: segmentRule,
      segment: "scale",
      tenantId: "tenant-volga"
    });

    assert.equal(evaluation.segmentEligible, true);
    assert.equal(
      evaluation.bucket,
      resolveDeterministicRolloutBucket("ff-billing-v2:tenant-volga:scale:flag-billing-v2")
    );
  });

  it("covers tenant preview rollout edge cases", () => {
    const preview = buildFeatureFlagPreviewRollout({
      rule: { ...tenantRule, rollout: 0 },
      tenants: [
        { id: "tenant-northstar", planId: "business" },
        { id: "tenant-volga", planId: "scale" }
      ]
    });

    assert.equal(preview.eligibleCount, 1);
    assert.equal(preview.items.find((item) => item.tenantId === "tenant-northstar")?.eligible, true);
    assert.equal(preview.items.find((item) => item.tenantId === "tenant-volga")?.eligible, false);
  });

  it("covers segment preview rollout edge cases", () => {
    const preview = buildFeatureFlagPreviewRollout({
      rule: { ...segmentRule, rollout: 100 },
      tenants: [
        { id: "tenant-volga", planId: "scale" },
        { id: "tenant-lumen", planId: "starter" }
      ]
    });

    assert.equal(preview.items.find((item) => item.tenantId === "tenant-volga")?.eligible, true);
    assert.equal(preview.items.find((item) => item.tenantId === "tenant-lumen")?.eligible, false);
  });

  it("covers deterministic bucket boundary cases in preview", () => {
    const tenantId = "tenant-aurora";
    const bucket = resolveDeterministicRolloutBucket(`ff-billing-v2:${tenantId}:business:flag-billing-v2`);
    const preview = buildFeatureFlagPreviewRollout({
      rule: { ...segmentRule, rollout: bucket },
      tenants: [{ id: tenantId, planId: "business" }]
    });

    assert.equal(preview.items[0].bucket, bucket);
    assert.equal(preview.items[0].eligible, false);

    const previewEligible = buildFeatureFlagPreviewRollout({
      rule: { ...segmentRule, rollout: bucket + 1 },
      tenants: [{ id: tenantId, planId: "business" }]
    });
    assert.equal(previewEligible.items[0].eligible, true);
  });

  it("covers tenant internal-test rollout edge cases", () => {
    const off = evaluateFeatureFlagRollout({
      planId: "business",
      rule: { ...tenantRule, status: "off" },
      tenantId: "tenant-northstar"
    });
    const full = evaluateFeatureFlagRollout({
      planId: "business",
      rule: { ...tenantRule, rollout: 100, enabledTenantIds: [] },
      tenantId: "tenant-lumen"
    });

    assert.equal(off.eligible, false);
    assert.equal(off.reason, "flag_off");
    assert.equal(full.eligible, true);
    assert.equal(full.reason, "tenant_rollout_full");
  });

  it("covers segment internal-test rollout edge cases", () => {
    const denied = evaluateFeatureFlagRollout({
      planId: "starter",
      rule: segmentRule,
      segment: "enterprise",
      tenantId: "tenant-lumen"
    });

    assert.equal(denied.eligible, false);
    assert.equal(denied.segmentEligible, false);
    assert.equal(denied.reason, "segment_not_targeted");
  });

  it("covers deterministic bucket boundary cases in internal tests", () => {
    const tenantId = "tenant-volga";
    const bucket = resolveDeterministicRolloutBucket(`ff-billing-v2:${tenantId}:scale:flag-billing-v2`);
    const denied = evaluateFeatureFlagRollout({
      planId: "scale",
      rule: { ...segmentRule, rollout: bucket },
      segment: "scale",
      tenantId
    });
    const eligible = evaluateFeatureFlagRollout({
      planId: "scale",
      rule: { ...segmentRule, rollout: bucket + 1 },
      segment: "scale",
      tenantId
    });

    assert.equal(denied.eligible, false);
    assert.equal(eligible.eligible, true);
    assert.equal(denied.bucket, eligible.bucket);
  });

  it("rejects malformed tenant-targeting feature-flag rules", () => {
    assert.equal(validateFeatureFlagRule({ ...tenantRule, rollout: 120 }).reason, "rollout_out_of_range");
    assert.equal(validateFeatureFlagRule({ ...tenantRule, bucketSalt: "" }).reason, "bucket_salt_required");
    assert.equal(validateFeatureFlagRule({ ...tenantRule, variants: [] }).reason, "variant_weights_invalid");
    assert.equal(validateFeatureFlagRule({ ...tenantRule, targeting: "workspace" } as typeof tenantRule).reason, "targeting_unsupported");
    assert.equal(validateFeatureFlagRule({ ...tenantRule, status: "paused" } as typeof tenantRule).reason, "status_unsupported");
    assert.equal(validateFeatureFlagRule({ ...tenantRule, enabledTenantIds: "tenant-northstar" } as unknown as typeof tenantRule).reason, "enabled_tenants_invalid");
  });

  it("rejects malformed segment-targeting feature-flag rules", () => {
    assert.equal(validateFeatureFlagRule({ ...segmentRule, segments: [] }).reason, "segment_targeting_segments_required");
    assert.equal(validateFeatureFlagRule({ ...segmentRule, targeting: "segment", variants: [{ id: "a", weight: 0 }] }).reason, "variant_weights_invalid");
    assert.equal(validateFeatureFlagRule({ ...segmentRule, segments: "business" } as unknown as typeof segmentRule).reason, "segments_invalid");
    assert.equal(validateFeatureFlagRule({ ...segmentRule, variants: [{ id: "", weight: 100 }] } as typeof segmentRule).reason, "variant_invalid");
  });

  it("fails closed when evaluating malformed persisted feature-flag rules", () => {
    const malformed = {
      ...tenantRule,
      targeting: "workspace",
      status: "paused"
    } as unknown as typeof tenantRule;
    const evaluation = evaluateFeatureFlagRollout({
      planId: "enterprise",
      rule: malformed,
      tenantId: "tenant-northstar"
    });

    assert.equal(evaluation.eligible, false);
    assert.equal(evaluation.reason, "targeting_unsupported");
    assert.equal(evaluation.variant, "control");
  });

  it("maps persisted feature flags into rollout rules", () => {
    const flag = featureFlags.find((item) => item.id === "flag-billing-v2");
    assert.ok(flag);
    const rule = featureFlagToRolloutRule(flag!);

    assert.equal(rule.flagId, "flag-billing-v2");
    assert.equal(rule.targeting, "segment");
    assert.deepEqual(rule.segments, flag!.segments);
  });
});
