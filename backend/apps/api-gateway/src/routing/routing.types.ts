export interface RoutingOperator {
  avgFirstResponseSeconds: number;
  channels: string[];
  chats: number;
  id: string;
  limit: number;
  name: string;
  rescueActive: number;
  slaPercent: number;
  status: "break" | "offline" | "online";
  tenantId?: string;
}

export interface RoutingQueue {
  active: number;
  channel: string;
  health: number;
  limit: number;
  overdue: number;
  tenantId?: string;
  waiting: number;
}

export interface RoutingRescueState {
  deadlineAt: number;
  durationSeconds: number;
  nextAction: string;
  reason: string;
  source: string;
  startedAt: number;
  state: "active" | "missed" | "returned_to_queue" | "saved";
}

export interface RoutingConversation {
  channel: string;
  client: string;
  id: string;
  operatorId?: string;
  rescue?: RoutingRescueState;
  slaTone: "closed" | "danger" | "hold" | "ok" | "warn";
  status: "active" | "assigned" | "closed" | "paused" | "queued" | "transferred";
  tenantId?: string;
  topic?: string;
}

export interface RescueReportRow {
  channel: string;
  conversationId: string;
  digest: string;
  operatorId: string | null;
  outcome: string;
  reason: string;
  resolution: string;
  tenantId?: string;
  timerSeconds: number;
}
