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
    reason: "execution_window_invalid_time" | "execution_window_matched" | "execution_window_not_configured" | "outside_execution_window" | "tenant_targeting_invalid" | "tenant_targeting_mismatch";
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
    reason: "frequency_cap_available" | "frequency_cap_exhausted" | "frequency_cap_invalid_time" | "frequency_cap_not_configured" | "frequency_cap_reset_invalid" | "frequency_cap_reset_reached" | "tenant_targeting_invalid" | "tenant_targeting_mismatch";
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
    reason: "client_targeting_invalid" | "experiment_assigned" | "experiment_assignment_invalid_time" | "experiment_assignment_invalid_variants" | "experiment_assignment_replayed" | "tenant_targeting_invalid";
}
export declare function evaluateProactiveExecutionWindowEligibility({ evaluatedAt, repository, ruleId, tenantId }: ProactiveExecutionWindowEligibilityInput): ProactiveExecutionWindowEligibilityResult;
export declare function evaluateProactiveExecutionWindowEligibilityAsync({ evaluatedAt, repository, ruleId, tenantId }: ProactiveExecutionWindowEligibilityInput): Promise<ProactiveExecutionWindowEligibilityResult>;
export declare function evaluateProactiveFrequencyCapEligibility({ evaluatedAt, repository, ruleId, tenantId }: ProactiveFrequencyCapEligibilityInput): ProactiveFrequencyCapEligibilityResult;
export declare function evaluateProactiveFrequencyCapEligibilityAsync({ evaluatedAt, repository, ruleId, tenantId }: ProactiveFrequencyCapEligibilityInput): Promise<ProactiveFrequencyCapEligibilityResult>;
export declare function evaluateProactiveExperimentAssignmentEligibility({ assignedAt, experimentId, repository, ruleId, subjectId, tenantId, variants }: ProactiveExperimentAssignmentEligibilityInput): ProactiveExperimentAssignmentEligibilityResult;
export declare function evaluateProactiveExperimentAssignmentEligibilityAsync({ assignedAt, experimentId, repository, ruleId, subjectId, tenantId, variants }: ProactiveExperimentAssignmentEligibilityInput): Promise<ProactiveExperimentAssignmentEligibilityResult>;
