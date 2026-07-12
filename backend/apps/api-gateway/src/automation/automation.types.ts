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

export interface BotScenario {
  activeVersionId?: string;
  channels: string[];
  createdAt?: string;
  flowEdges: BotFlowEdge[];
  flowNodes: BotFlowNode[];
  id: string;
  name: string;
  schemaVersion: "bot-flow/v1";
  status: string;
  tenantId: string;
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
