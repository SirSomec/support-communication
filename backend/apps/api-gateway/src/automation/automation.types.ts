export interface BotFlowNode {
  config?: Record<string, unknown>;
  id: string;
  type: string;
  title?: string;
}

export interface BotFlowEdge {
  from: string;
  label?: string;
  to: string;
}

export type BotTriggerMatchMode = "contains" | "exact" | "tokens";
export type BotTriggerType = "manual" | "new_conversation" | "phrase" | "always_except";

export interface BotTriggerRule {
  id: string;
  locale?: string;
  matchMode?: BotTriggerMatchMode;
  /** For `phrase`: include phrases. For `always_except`: exclusion phrases. */
  phrases?: string[];
  priority?: number;
  type: BotTriggerType;
}

export interface KnowledgeSourceBinding {
  sourceId: string;
  sourceVersion?: string;
}

/**
 * Unpublished edits of a published scenario (ADR BAI-001 §1.3: editing a
 * published configuration happens through a next-revision draft). Runtime and
 * channels keep executing the pinned published version; the overlay is used by
 * the sandbox draft mode and becomes the next version on publish.
 */
export interface BotScenarioDraftOverlay {
  basePrompt?: string;
  channels?: string[];
  flowEdges?: BotFlowEdge[];
  flowNodes?: BotFlowNode[];
  name?: string;
  priority?: number;
  sourceBindings?: KnowledgeSourceBinding[];
  triggerRules?: BotTriggerRule[];
  updatedAt: string;
  updatedBy?: string;
}

export interface BotScenario {
  draft?: BotScenarioDraftOverlay;
  activeVersionId?: string;
  auditHold?: boolean;
  auditHoldAt?: string;
  auditHoldBy?: string;
  auditHoldReason?: string;
  archiveReason?: string;
  archivedAt?: string;
  archivedBy?: string;
  channels: string[];
  createdAt?: string;
  disabledAt?: string;
  disabledBy?: string;
  disableReason?: string;
  /**
   * A published scenario can be paused without losing its published version.
   * Archived scenarios are always persisted with this value set to false.
   */
  enabled?: boolean;
  flowEdges: BotFlowEdge[];
  flowNodes: BotFlowNode[];
  id: string;
  legalHold?: boolean;
  legalHoldAt?: string;
  legalHoldBy?: string;
  legalHoldReason?: string;
  name: string;
  priority?: number;
  /** Set on archive; no value means that the scenario is retained indefinitely. */
  retentionUntil?: string;
  schemaVersion: "bot-flow/v1";
  /** Scenario-level AI instructions prepended to the system prompt. */
  basePrompt?: string;
  sourceBindings?: KnowledgeSourceBinding[];
  status: string;
  tenantId: string;
  triggerRules?: BotTriggerRule[];
  updatedAt?: string;
}

export interface ProactiveRule {
  activeVariant?: string;
  channels: string[];
  cooldown?: string;
  id: string;
  segment?: string;
  status?: string;
  tenantId: string;
}
