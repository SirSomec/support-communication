import { randomUUID } from "node:crypto";
export function makeAuditId(scope) {
    return `evt_${scope}_${randomUUID()}`;
}
export function makeMfaChallengeId() {
    return `mfa_${randomUUID()}`;
}
export function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}
export function hasAuditReason(reason) {
    return String(reason ?? "").trim().length >= 8;
}
//# sourceMappingURL=backend-ids.js.map