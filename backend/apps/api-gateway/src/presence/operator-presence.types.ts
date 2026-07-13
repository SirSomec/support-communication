export type OperatorPresenceStatus = "break" | "busy" | "offline" | "online" | "unavailable" | "wrapping_up";

export interface OperatorPresenceStatusDescriptor {
  /** Distribution engine may auto-assign queued conversations to this status. */
  acceptsAutoAssignment: boolean;
  /** Seniors/admins may still assign or transfer dialogs manually to this status. */
  acceptsManualAssignment: boolean;
  key: OperatorPresenceStatus;
}

/** FR §9.4 operator status catalog: онлайн, занят, завершает диалоги, в перерыве, недоступен, офлайн. */
export const OPERATOR_PRESENCE_STATUSES: OperatorPresenceStatusDescriptor[] = [
  { acceptsAutoAssignment: true, acceptsManualAssignment: true, key: "online" },
  { acceptsAutoAssignment: false, acceptsManualAssignment: true, key: "busy" },
  { acceptsAutoAssignment: false, acceptsManualAssignment: true, key: "wrapping_up" },
  { acceptsAutoAssignment: false, acceptsManualAssignment: false, key: "break" },
  { acceptsAutoAssignment: false, acceptsManualAssignment: false, key: "unavailable" },
  { acceptsAutoAssignment: false, acceptsManualAssignment: false, key: "offline" }
];

const descriptorsByKey = new Map(OPERATOR_PRESENCE_STATUSES.map((descriptor) => [descriptor.key, descriptor]));

export function isOperatorPresenceStatus(value: unknown): value is OperatorPresenceStatus {
  return typeof value === "string" && descriptorsByKey.has(value as OperatorPresenceStatus);
}

export function presenceAcceptsAutoAssignment(status: OperatorPresenceStatus): boolean {
  return descriptorsByKey.get(status)?.acceptsAutoAssignment ?? false;
}

export function presenceAcceptsManualAssignment(status: OperatorPresenceStatus): boolean {
  return descriptorsByKey.get(status)?.acceptsManualAssignment ?? false;
}

export interface OperatorPresenceCurrentRecord {
  changedBy: string | null;
  operatorId: string;
  since: string;
  status: OperatorPresenceStatus;
  tenantId: string;
}

export interface OperatorPresenceIntervalRecord {
  changedBy: string | null;
  endedAt: string | null;
  id: string;
  operatorId: string;
  startedAt: string;
  status: OperatorPresenceStatus;
  tenantId: string;
}
