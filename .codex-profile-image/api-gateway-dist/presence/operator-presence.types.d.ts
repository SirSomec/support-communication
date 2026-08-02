export type OperatorPresenceStatus = "break" | "busy" | "offline" | "online" | "unavailable" | "wrapping_up";
export interface OperatorPresenceStatusDescriptor {
    /** Distribution engine may auto-assign queued conversations to this status. */
    acceptsAutoAssignment: boolean;
    /** Seniors/admins may still assign or transfer dialogs manually to this status. */
    acceptsManualAssignment: boolean;
    key: OperatorPresenceStatus;
}
/** FR §9.4 operator status catalog: онлайн, занят, завершает диалоги, в перерыве, недоступен, офлайн. */
export declare const OPERATOR_PRESENCE_STATUSES: OperatorPresenceStatusDescriptor[];
export declare function isOperatorPresenceStatus(value: unknown): value is OperatorPresenceStatus;
export declare function presenceAcceptsAutoAssignment(status: OperatorPresenceStatus): boolean;
export declare function presenceAcceptsManualAssignment(status: OperatorPresenceStatus): boolean;
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
