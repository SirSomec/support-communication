import { createHash, randomUUID } from "node:crypto";
import { redactExportedDescriptor } from "@support-communication/envelope";
import { redactSensitiveValue } from "@support-communication/redaction";
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
];
export function stableAuditExportFilters(filters) {
    return Object.fromEntries(Object.entries(filters)
        .filter(([, value]) => value !== undefined && String(value).trim() !== "")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, String(value)]));
}
export function auditExportDescriptorId(filters, events) {
    const fingerprint = JSON.stringify({
        filters: stableAuditExportFilters(filters),
        sourceEventIds: events.map((event) => event.id)
    });
    return `audit-export-${createHash("sha256").update(fingerprint).digest("hex").slice(0, 16)}`;
}
export function auditExportFileName(filters) {
    const scope = [filters.tenantId, filters.action]
        .map((value) => sanitizeAuditExportFilePart(value))
        .filter(Boolean)
        .join("-") || "all";
    return `service-admin-audit-${scope}.json`;
}
export function buildAuditExportDescriptor(filters, events) {
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
export function toAuditExportPayloadRow(event) {
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
export function redactAuditEventForReadSide(event) {
    return redactSensitiveValue(clone(event));
}
export function applyAuditRedactionOverlay(event, overlay) {
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
export function buildAuditRedactionOverlay(event, fields) {
    const selected = fields?.length
        ? fields
        : ["reason", "actorName", "target"];
    const overlay = {};
    for (const field of selected) {
        if (field in event) {
            overlay[field] = "[REDACTED:privacy]";
        }
    }
    return overlay;
}
export function createAuditExportRecord(input) {
    const now = new Date();
    const descriptorId = String(input.descriptor.id ?? auditExportDescriptorId(input.filters, input.sourceEventIds.map((id) => ({ id }))));
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
export function createAuditRedactionRecord(input) {
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
export function isAuditExportExpired(record, now = Date.now()) {
    return Date.parse(record.expiresAt) <= now;
}
function sanitizeAuditExportFilePart(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=service-admin-audit.persistence.js.map