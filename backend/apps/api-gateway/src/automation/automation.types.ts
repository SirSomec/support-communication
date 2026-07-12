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
export type BotTriggerType = "manual" | "new_conversation" | "phrase";

export interface BotTriggerRule {
  id: string;
  locale?: string;
  matchMode?: BotTriggerMatchMode;
  phrases?: string[];
  priority?: number;
  type: BotTriggerType;
}

export interface KnowledgeSourceBinding {
  sourceId: string;
  sourceVersion?: string;
}

export interface BotScenario {
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
