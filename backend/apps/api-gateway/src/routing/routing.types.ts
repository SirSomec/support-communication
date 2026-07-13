export interface RoutingOperator {
  /** Recorded when the presence source is known; canonical adapter marks "not_recorded". */
  availability?: { online: boolean | null; source: string };
  avgFirstResponseSeconds: number;
  channels: string[];
  chats: number;
  id: string;
  limit: number;
  name: string;
  /** Start of the current presence status, ISO timestamp (FR §12.3 "время в текущем статусе"). */
  presenceSince?: string;
  presenceSource?: "operator_presence";
  rescueActive: number;
  slaPercent: number;
  /** FR §9.4 operator statuses; legacy json stores may only carry online/break/offline. */
  status: "break" | "busy" | "offline" | "online" | "unavailable" | "wrapping_up";
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
  teamId?: string;
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
