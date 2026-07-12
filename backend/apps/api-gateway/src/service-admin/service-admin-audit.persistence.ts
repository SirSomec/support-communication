import { createHash, randomUUID } from "node:crypto";
import { redactExportedDescriptor } from "@support-communication/envelope";
import { redactSensitiveValue } from "@support-communication/redaction";
import type { IdentityServiceAdminAuditEvent } from "../identity/identity.repository.js";

export const AUDIT_EXPORT_PERMISSION = "service-admin.audit.export";
export const AUDIT_EXPORT_REDACTION_POLICY = "canonical-secret-carriers/v1";
export const AUDIT_EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

export const AUDIT_EXPORT_COLUMNS = [
  "id",
  "at",
  "actor",
  "action",
  "result",
  "severity",
  "tenantId",
  "userId",
  "target"
] as const;

export interface ServiceAdminAuditExportRecord {
  createdAt: string;
  descriptor: Record<string, unknown>;
  descriptorId: string;
  expiresAt: string;
  filters: Record<string, string>;
  id: string;
  objectKey: string;
  redactionPolicy: string;
  requesterId: string;
  requesterName: string;
  sourceEventIds: string[];
}

export interface ServiceAdminAuditRedactionRecord {
  actor: string;
  actorName: string;
  at: string;
  createdAt: string;
  eventId: string;
  id: string;
  overlay: Record<string, unknown>;
  reason: string;
}

export interface AuditExportFilters {
  action?: string;
  actorId?: string;
  cursor?: string;
  limit?: number | string;
  period?: string;
  query?: string;
  severity?: string;
  status?: string;
  target?: string;
  tenantId?: string;
  userId?: string;
}

export function stableAuditExportFilters(filters: AuditExportFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && String(value).trim() !== "")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)])
  );
}

export function auditExportDescriptorId(filters: AuditExportFilters, events: IdentityServiceAdminAuditEvent[]): string {
  const fingerprint = JSON.stringify({
    filters: stableAuditExportFilters(filters),
    sourceEventIds: events.map((event) => event.id)
  });

  return `audit-export-${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`;
}

export function auditExportFileName(filters: AuditExportFilters): string {
  const scope = [filters.tenantId, filters.action]
    .map((value) => sanitizeAuditExportFilePart(value))
    .filter(Boolean)
    .join("-") || "all";

  return `service-admin-audit-${scope}.json`;
}

export function buildAuditExportDescriptor(
  filters: AuditExportFilters,
  events: IdentityServiceAdminAuditEvent[]
): Record<string, unknown> {
  const id = auditExportDescriptorId(filters, events);
  const fileName = auditExportFileName(filters);

  return redactExportedDescriptor({
    contentType: "application/json",
    downloadUrl: `https://service-admin.local/audit-exports/${id}/${fileName}`,
    expiresIn: "24h",
    fileName,
    format: "json",
    id,
    objectKey: `service-admin/audit-exports/${id}/${fileName}`,
    objectKeyExposed: false,
    permissionRequired: AUDIT_EXPORT_PERMISSION,
    totalRows: events.length
  });
}

export function toAuditExportPayloadRow(
  event: IdentityServiceAdminAuditEvent
): Record<(typeof AUDIT_EXPORT_COLUMNS)[number], string | null> {
  return {
    action: event.action,
    actor: event.actor,
    at: event.at,
    id: event.id,
    result: event.result,
    severity: event.severity,
    target: event.target,
    tenantId: event.tenantId,
    userId: event.userId
  };
}

export function redactAuditEventForReadSide(event: IdentityServiceAdminAuditEvent): IdentityServiceAdminAuditEvent {
  return redactSensitiveValue(clone(event));
}

export function applyAuditRedactionOverlay(
  event: IdentityServiceAdminAuditEvent,
  overlay: Record<string, unknown> | undefined
): IdentityServiceAdminAuditEvent {
  const redacted = redactAuditEventForReadSide(event);
  if (!overlay) {
    return redacted;
  }

  return {
    ...redacted,
    ...overlay,
    id: redacted.id,
    immutable: redacted.immutable
  };
}

export function buildAuditRedactionOverlay(
  event: IdentityServiceAdminAuditEvent,
  fields: string[] | undefined
): Record<string, unknown> {
  const selected = fields?.length
    ? fields
    : ["reason", "actorName", "target"];

  const overlay: Record<string, unknown> = {};
  for (const field of selected) {
    if (field in event) {
      overlay[field] = "[REDACTED:privacy]";
    }
  }

  return overlay;
}

export function createAuditExportRecord(input: {
  descriptor: Record<string, unknown>;
  filters: AuditExportFilters;
  requesterId: string;
  requesterName: string;
  sourceEventIds: string[];
}): ServiceAdminAuditExportRecord {
  const now = new Date();
  const descriptorId = String(input.descriptor.id ?? auditExportDescriptorId(input.filters, input.sourceEventIds.map((id) => ({ id } as IdentityServiceAdminAuditEvent))));

  return {
    id: `audit_export_${randomUUID()}`,
    createdAt: now.toISOString(),
    descriptor: input.descriptor,
    descriptorId,
    expiresAt: new Date(now.getTime() + AUDIT_EXPORT_TTL_MS).toISOString(),
    filters: stableAuditExportFilters(input.filters),
    objectKey: String(input.descriptor.objectKey ?? "").includes("[REDACTED")
      ? `service-admin/audit-exports/${descriptorId}/${auditExportFileName(input.filters)}`
      : String(input.descriptor.objectKey ?? ""),
    redactionPolicy: AUDIT_EXPORT_REDACTION_POLICY,
    requesterId: input.requesterId,
    requesterName: input.requesterName,
    sourceEventIds: [...input.sourceEventIds]
  };
}

export function createAuditRedactionRecord(input: {
  actor: string;
  actorName: string;
  eventId: string;
  fields?: string[];
  original: IdentityServiceAdminAuditEvent;
  reason: string;
}): ServiceAdminAuditRedactionRecord {
  const now = new Date();

  return {
    id: `audit_redaction_${randomUUID()}`,
    actor: input.actor,
    actorName: input.actorName,
    at: now.toISOString(),
    createdAt: now.toISOString(),
    eventId: input.eventId,
    overlay: buildAuditRedactionOverlay(input.original, input.fields),
    reason: input.reason
  };
}

export function isAuditExportExpired(record: ServiceAdminAuditExportRecord, now = Date.now()): boolean {
  return Date.parse(record.expiresAt) <= now;
}

function sanitizeAuditExportFilePart(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
