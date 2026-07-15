/**
 * Rollout gating for AI agents (BAI-706).
 * Primary flag key: ai_agents_v1 (alias of product plan §4.3).
 * Legacy key ai_bots remains supported for existing negative contracts.
 */
import { evaluateFeatureFlagRollout, featureFlagToRolloutRule } from "../feature-flags/feature-flag-rollout.engine.js";
import type { FeatureFlag } from "../platform/platform.types.js";
import { featureFlags } from "../platform/seed-catalog.js";

export const AI_AGENTS_FLAG_KEY = "ai_agents_v1";
export const AI_AGENTS_LEGACY_FLAG_KEY = "ai_bots";

export interface AiAgentsRolloutEvaluation {
  eligible: boolean;
  flagKey: string;
  killSwitchArmed: boolean;
  reason: string;
}

export function resolveAiAgentsFeatureFlag(flags: FeatureFlag[] = featureFlags): FeatureFlag | undefined {
  return flags.find((item) => item.key === AI_AGENTS_FLAG_KEY) ?? flags.find((item) => item.key === AI_AGENTS_LEGACY_FLAG_KEY);
}

export function evaluateAiAgentsRollout(input: {
  flags?: FeatureFlag[];
  planId?: string;
  tenantId: string;
}): AiAgentsRolloutEvaluation {
  const flag = resolveAiAgentsFeatureFlag(input.flags);
  if (!flag) {
    return { eligible: false, flagKey: AI_AGENTS_FLAG_KEY, killSwitchArmed: true, reason: "flag_missing" };
  }
  const evaluation = evaluateFeatureFlagRollout({
    planId: input.planId,
    rule: featureFlagToRolloutRule(flag),
    tenantId: input.tenantId
  });
  return {
    eligible: evaluation.eligible,
    flagKey: flag.key,
    killSwitchArmed: Boolean(flag.killSwitch),
    reason: evaluation.reason
  };
}

/** Kill-switch / rollback checklist for AI-agents ops (documented in runbook). */
export function aiAgentsKillSwitchSteps(): string[] {
  return [
    "Set feature flag ai_agents_v1 status to off (or clear enabledTenantIds)",
    "Pause or disable published bot scenarios for the tenant",
    "Disable tenant AI connection in Service Admin if provider is unsafe",
    "Disable failing knowledge sources / MCP connectors",
    "Notify support-lead and affected tenant-admin using communication runbook"
  ];
}
