import { randomUUID } from "node:crypto";

export function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

export function makeMfaChallengeId(): string {
  return `mfa_${randomUUID()}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function hasAuditReason(reason: unknown): boolean {
  return String(reason ?? "").trim().length >= 8;
}
