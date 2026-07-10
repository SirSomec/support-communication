import type { AutomationProactiveExperimentAssignment, AutomationRepository } from "./automation.repository.js";

export interface ProactiveExecutionWindowEligibilityInput {
  evaluatedAt: string;
  repository: AutomationRepository;
  ruleId: string;
  tenantId: string;
}

export interface ProactiveExecutionWindowEligibilityResult {
  consideredWindowIds: string[];
  eligible: boolean;
  matchedWindowIds: string[];
  reason:
    | "execution_window_invalid_time"
    | "execution_window_matched"
    | "execution_window_not_configured"
    | "outside_execution_window"
    | "tenant_targeting_invalid"
    | "tenant_targeting_mismatch";
}

export interface ProactiveFrequencyCapEligibilityInput {
  evaluatedAt: string;
  repository: AutomationRepository;
  ruleId: string;
  tenantId: string;
}

export interface ProactiveFrequencyCapEligibilityResult {
  consideredCapIds: string[];
  eligible: boolean;
  exhaustedCapIds: string[];
  reason:
    | "frequency_cap_available"
    | "frequency_cap_exhausted"
    | "frequency_cap_invalid_time"
    | "frequency_cap_not_configured"
    | "frequency_cap_reset_invalid"
    | "frequency_cap_reset_reached"
    | "tenant_targeting_invalid"
    | "tenant_targeting_mismatch";
}

export interface ProactiveExperimentAssignmentEligibilityInput {
  assignedAt: string;
  experimentId: string;
  repository: AutomationRepository;
  ruleId: string;
  subjectId: string;
  tenantId: string;
  variants: string[];
}

export interface ProactiveExperimentAssignmentEligibilityResult {
  assignment: AutomationProactiveExperimentAssignment | null;
  eligible: boolean;
  reason:
    | "client_targeting_invalid"
    | "experiment_assigned"
    | "experiment_assignment_invalid_time"
    | "experiment_assignment_invalid_variants"
    | "experiment_assignment_replayed"
    | "tenant_targeting_invalid";
}

export function evaluateProactiveExecutionWindowEligibility({
  evaluatedAt,
  repository,
  ruleId,
  tenantId
}: ProactiveExecutionWindowEligibilityInput): ProactiveExecutionWindowEligibilityResult {
  if (!tenantId.trim()) {
    return {
      consideredWindowIds: [],
      eligible: false,
      matchedWindowIds: [],
      reason: "tenant_targeting_invalid"
    };
  }

  const evaluationDate = new Date(evaluatedAt);
  if (Number.isNaN(evaluationDate.getTime()) || evaluationDate.toISOString() !== evaluatedAt) {
    return {
      consideredWindowIds: [],
      eligible: false,
      matchedWindowIds: [],
      reason: "execution_window_invalid_time"
    };
  }

  const windows = repository
    .listProactiveExecutionWindows({ ruleId, tenantId })
    .filter((window) => window.active);

  if (!windows.length) {
    const activeRuleWindows = repository
      .listProactiveExecutionWindows({ ruleId })
      .filter((window) => window.active);
    if (activeRuleWindows.length) {
      return {
        consideredWindowIds: [],
        eligible: false,
        matchedWindowIds: [],
        reason: "tenant_targeting_mismatch"
      };
    }

    return {
      consideredWindowIds: [],
      eligible: true,
      matchedWindowIds: [],
      reason: "execution_window_not_configured"
    };
  }

  const matchedWindowIds = windows
    .filter((window) => windowMatchesEvaluationTime(window, evaluationDate))
    .map((window) => window.windowId);

  return {
    consideredWindowIds: windows.map((window) => window.windowId),
    eligible: matchedWindowIds.length > 0,
    matchedWindowIds,
    reason: matchedWindowIds.length ? "execution_window_matched" : "outside_execution_window"
  };
}

export async function evaluateProactiveExecutionWindowEligibilityAsync({
  evaluatedAt,
  repository,
  ruleId,
  tenantId
}: ProactiveExecutionWindowEligibilityInput): Promise<ProactiveExecutionWindowEligibilityResult> {
  if (!tenantId.trim()) {
    return {
      consideredWindowIds: [],
      eligible: false,
      matchedWindowIds: [],
      reason: "tenant_targeting_invalid"
    };
  }

  const evaluationDate = new Date(evaluatedAt);
  if (Number.isNaN(evaluationDate.getTime()) || evaluationDate.toISOString() !== evaluatedAt) {
    return {
      consideredWindowIds: [],
      eligible: false,
      matchedWindowIds: [],
      reason: "execution_window_invalid_time"
    };
  }

  const windows = (await repository.listProactiveExecutionWindowsAsync({ ruleId, tenantId }))
    .filter((window) => window.active);

  if (!windows.length) {
    const activeRuleWindows = (await repository.listProactiveExecutionWindowsAsync({ ruleId }))
      .filter((window) => window.active);
    if (activeRuleWindows.length) {
      return {
        consideredWindowIds: [],
        eligible: false,
        matchedWindowIds: [],
        reason: "tenant_targeting_mismatch"
      };
    }

    return {
      consideredWindowIds: [],
      eligible: true,
      matchedWindowIds: [],
      reason: "execution_window_not_configured"
    };
  }

  const matchedWindowIds = windows
    .filter((window) => windowMatchesEvaluationTime(window, evaluationDate))
    .map((window) => window.windowId);

  return {
    consideredWindowIds: windows.map((window) => window.windowId),
    eligible: matchedWindowIds.length > 0,
    matchedWindowIds,
    reason: matchedWindowIds.length ? "execution_window_matched" : "outside_execution_window"
  };
}

export function evaluateProactiveFrequencyCapEligibility({
  evaluatedAt,
  repository,
  ruleId,
  tenantId
}: ProactiveFrequencyCapEligibilityInput): ProactiveFrequencyCapEligibilityResult {
  if (!tenantId.trim()) {
    return {
      consideredCapIds: [],
      eligible: false,
      exhaustedCapIds: [],
      reason: "tenant_targeting_invalid"
    };
  }

  const evaluationDate = new Date(evaluatedAt);
  if (Number.isNaN(evaluationDate.getTime()) || evaluationDate.toISOString() !== evaluatedAt) {
    return {
      consideredCapIds: [],
      eligible: false,
      exhaustedCapIds: [],
      reason: "frequency_cap_invalid_time"
    };
  }

  const caps = repository
    .listProactiveFrequencyCaps({ ruleId, tenantId })
    .filter((cap) => cap.active);

  if (!caps.length) {
    const activeRuleCaps = repository
      .listProactiveFrequencyCaps({ ruleId })
      .filter((cap) => cap.active);
    if (activeRuleCaps.length) {
      return {
        consideredCapIds: [],
        eligible: false,
        exhaustedCapIds: [],
        reason: "tenant_targeting_mismatch"
      };
    }

    return {
      consideredCapIds: [],
      eligible: true,
      exhaustedCapIds: [],
      reason: "frequency_cap_not_configured"
    };
  }

  const exhaustedCaps = caps.filter((cap) => cap.used >= cap.limit);
  const malformedResetCapIds = exhaustedCaps
    .filter((cap) => !parseStrictIsoInstant(cap.resetAt))
    .map((cap) => cap.capId);
  if (malformedResetCapIds.length) {
    return {
      consideredCapIds: caps.map((cap) => cap.capId),
      eligible: false,
      exhaustedCapIds: malformedResetCapIds,
      reason: "frequency_cap_reset_invalid"
    };
  }

  const exhaustedCapIds = exhaustedCaps
    .filter((cap) => isAfterEvaluation(cap.resetAt, evaluationDate))
    .map((cap) => cap.capId);
  const anyResetReached = exhaustedCaps.some((cap) => !isAfterEvaluation(cap.resetAt, evaluationDate));

  return {
    consideredCapIds: caps.map((cap) => cap.capId),
    eligible: exhaustedCapIds.length === 0,
    exhaustedCapIds,
    reason: exhaustedCapIds.length
      ? "frequency_cap_exhausted"
      : anyResetReached
        ? "frequency_cap_reset_reached"
        : "frequency_cap_available"
  };
}

export async function evaluateProactiveFrequencyCapEligibilityAsync({
  evaluatedAt,
  repository,
  ruleId,
  tenantId
}: ProactiveFrequencyCapEligibilityInput): Promise<ProactiveFrequencyCapEligibilityResult> {
  if (!tenantId.trim()) {
    return {
      consideredCapIds: [],
      eligible: false,
      exhaustedCapIds: [],
      reason: "tenant_targeting_invalid"
    };
  }

  const evaluationDate = new Date(evaluatedAt);
  if (Number.isNaN(evaluationDate.getTime()) || evaluationDate.toISOString() !== evaluatedAt) {
    return {
      consideredCapIds: [],
      eligible: false,
      exhaustedCapIds: [],
      reason: "frequency_cap_invalid_time"
    };
  }

  const caps = (await repository.listProactiveFrequencyCapsAsync({ ruleId, tenantId }))
    .filter((cap) => cap.active);

  if (!caps.length) {
    const activeRuleCaps = (await repository.listProactiveFrequencyCapsAsync({ ruleId }))
      .filter((cap) => cap.active);
    if (activeRuleCaps.length) {
      return {
        consideredCapIds: [],
        eligible: false,
        exhaustedCapIds: [],
        reason: "tenant_targeting_mismatch"
      };
    }

    return {
      consideredCapIds: [],
      eligible: true,
      exhaustedCapIds: [],
      reason: "frequency_cap_not_configured"
    };
  }

  const exhaustedCaps = caps.filter((cap) => cap.used >= cap.limit);
  const malformedResetCapIds = exhaustedCaps
    .filter((cap) => !parseStrictIsoInstant(cap.resetAt))
    .map((cap) => cap.capId);
  if (malformedResetCapIds.length) {
    return {
      consideredCapIds: caps.map((cap) => cap.capId),
      eligible: false,
      exhaustedCapIds: malformedResetCapIds,
      reason: "frequency_cap_reset_invalid"
    };
  }

  const exhaustedCapIds = exhaustedCaps
    .filter((cap) => isAfterEvaluation(cap.resetAt, evaluationDate))
    .map((cap) => cap.capId);
  const anyResetReached = exhaustedCaps.some((cap) => !isAfterEvaluation(cap.resetAt, evaluationDate));

  return {
    consideredCapIds: caps.map((cap) => cap.capId),
    eligible: exhaustedCapIds.length === 0,
    exhaustedCapIds,
    reason: exhaustedCapIds.length
      ? "frequency_cap_exhausted"
      : anyResetReached
        ? "frequency_cap_reset_reached"
        : "frequency_cap_available"
  };
}

export function evaluateProactiveExperimentAssignmentEligibility({
  assignedAt,
  experimentId,
  repository,
  ruleId,
  subjectId,
  tenantId,
  variants
}: ProactiveExperimentAssignmentEligibilityInput): ProactiveExperimentAssignmentEligibilityResult {
  if (!tenantId.trim()) {
    return {
      assignment: null,
      eligible: false,
      reason: "tenant_targeting_invalid"
    };
  }

  if (!subjectId.trim()) {
    return {
      assignment: null,
      eligible: false,
      reason: "client_targeting_invalid"
    };
  }

  const assignmentDate = new Date(assignedAt);
  if (Number.isNaN(assignmentDate.getTime()) || assignmentDate.toISOString() !== assignedAt) {
    return {
      assignment: null,
      eligible: false,
      reason: "experiment_assignment_invalid_time"
    };
  }

  const normalizedVariants = variants.map((variant) => variant.trim()).filter(Boolean);
  if (!normalizedVariants.length) {
    return {
      assignment: null,
      eligible: false,
      reason: "experiment_assignment_invalid_variants"
    };
  }

  const existing = repository.listProactiveExperimentAssignments({ ruleId, subjectId, tenantId })[0];
  if (existing) {
    return {
      assignment: existing,
      eligible: true,
      reason: "experiment_assignment_replayed"
    };
  }

  const assignment = repository.saveProactiveExperimentAssignment({
    assignedAt,
    assignmentId: `${experimentId}:${tenantId}:${ruleId}:${subjectId}`,
    experimentId,
    ruleId,
    subjectId,
    tenantId,
    variant: normalizedVariants[stableBucket(`${tenantId}:${ruleId}:${subjectId}`, normalizedVariants.length)]
  });

  return {
    assignment,
    eligible: true,
    reason: "experiment_assigned"
  };
}

export async function evaluateProactiveExperimentAssignmentEligibilityAsync({
  assignedAt,
  experimentId,
  repository,
  ruleId,
  subjectId,
  tenantId,
  variants
}: ProactiveExperimentAssignmentEligibilityInput): Promise<ProactiveExperimentAssignmentEligibilityResult> {
  if (!tenantId.trim()) {
    return {
      assignment: null,
      eligible: false,
      reason: "tenant_targeting_invalid"
    };
  }

  if (!subjectId.trim()) {
    return {
      assignment: null,
      eligible: false,
      reason: "client_targeting_invalid"
    };
  }

  const assignmentDate = new Date(assignedAt);
  if (Number.isNaN(assignmentDate.getTime()) || assignmentDate.toISOString() !== assignedAt) {
    return {
      assignment: null,
      eligible: false,
      reason: "experiment_assignment_invalid_time"
    };
  }

  const normalizedVariants = variants.map((variant) => variant.trim()).filter(Boolean);
  if (!normalizedVariants.length) {
    return {
      assignment: null,
      eligible: false,
      reason: "experiment_assignment_invalid_variants"
    };
  }

  const existing = (await repository.listProactiveExperimentAssignmentsAsync({ ruleId, subjectId, tenantId }))[0];
  if (existing) {
    return {
      assignment: existing,
      eligible: true,
      reason: "experiment_assignment_replayed"
    };
  }

  const assignment = await repository.saveProactiveExperimentAssignmentAsync({
    assignedAt,
    assignmentId: `${experimentId}:${tenantId}:${ruleId}:${subjectId}`,
    experimentId,
    ruleId,
    subjectId,
    tenantId,
    variant: normalizedVariants[stableBucket(`${tenantId}:${ruleId}:${subjectId}`, normalizedVariants.length)]
  });

  return {
    assignment,
    eligible: true,
    reason: "experiment_assigned"
  };
}

function windowMatchesEvaluationTime(
  window: ReturnType<AutomationRepository["listProactiveExecutionWindows"]>[number],
  evaluatedAt: Date
): boolean {
  const local = localDateTimeParts(evaluatedAt, window.timezone);
  if (!local) {
    return false;
  }

  const startsAt = parseTimeOfDay(window.startsAt);
  const endsAt = parseTimeOfDay(window.endsAt);
  if (!startsAt || !endsAt) {
    return false;
  }

  const current = local.hour * 60 + local.minute;
  const start = startsAt.hour * 60 + startsAt.minute;
  const end = endsAt.hour * 60 + endsAt.minute;
  const overnight = start > end;
  const matchesTime = overnight
    ? current >= start || current < end
    : current >= start && current < end;

  if (!matchesTime) {
    return false;
  }

  const windowStartDayOfWeek = overnight && current < end
    ? previousDayOfWeek(local.dayOfWeek)
    : local.dayOfWeek;

  return !window.daysOfWeek.length || window.daysOfWeek.includes(windowStartDayOfWeek);
}

function localDateTimeParts(date: Date, timeZone: string): { dayOfWeek: number; hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const hour = Number(values.hour);
    const minute = Number(values.minute);

    if ([year, month, day, hour, minute].some((value) => !Number.isInteger(value))) {
      return null;
    }

    return {
      dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
      hour,
      minute
    };
  } catch {
    return null;
  }
}

function parseTimeOfDay(value: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

function previousDayOfWeek(dayOfWeek: number): number {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function isAfterEvaluation(value: string, evaluatedAt: Date): boolean {
  const date = parseStrictIsoInstant(value);
  return Boolean(date && date.getTime() > evaluatedAt.getTime());
}

function stableBucket(value: string, bucketCount: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % bucketCount;
}

function parseStrictIsoInstant(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    return null;
  }

  return date;
}
