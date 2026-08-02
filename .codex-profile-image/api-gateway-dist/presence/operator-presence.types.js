/** FR §9.4 operator status catalog: онлайн, занят, завершает диалоги, в перерыве, недоступен, офлайн. */
export const OPERATOR_PRESENCE_STATUSES = [
    { acceptsAutoAssignment: true, acceptsManualAssignment: true, key: "online" },
    { acceptsAutoAssignment: false, acceptsManualAssignment: true, key: "busy" },
    { acceptsAutoAssignment: false, acceptsManualAssignment: true, key: "wrapping_up" },
    { acceptsAutoAssignment: false, acceptsManualAssignment: false, key: "break" },
    { acceptsAutoAssignment: false, acceptsManualAssignment: false, key: "unavailable" },
    { acceptsAutoAssignment: false, acceptsManualAssignment: false, key: "offline" }
];
const descriptorsByKey = new Map(OPERATOR_PRESENCE_STATUSES.map((descriptor) => [descriptor.key, descriptor]));
export function isOperatorPresenceStatus(value) {
    return typeof value === "string" && descriptorsByKey.has(value);
}
export function presenceAcceptsAutoAssignment(status) {
    return descriptorsByKey.get(status)?.acceptsAutoAssignment ?? false;
}
export function presenceAcceptsManualAssignment(status) {
    return descriptorsByKey.get(status)?.acceptsManualAssignment ?? false;
}
//# sourceMappingURL=operator-presence.types.js.map