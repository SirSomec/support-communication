import type { IdentityServiceAdminAuditEvent } from "../identity/identity.repository.js";
export declare const AUDIT_EXPORT_PERMISSION = "service-admin.audit.export";
export declare const AUDIT_EXPORT_REDACTION_POLICY = "canonical-secret-carriers/v1";
export declare const AUDIT_EXPORT_TTL_MS: number;
export declare const AUDIT_EXPORT_COLUMNS: readonly ["id", "at", "actor", "action", "result", "severity", "tenantId", "userId", "target"];
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
export declare function stableAuditExportFilters(filters: AuditExportFilters): Record<string, string>;
export declare function auditExportDescriptorId(filters: AuditExportFilters, events: IdentityServiceAdminAuditEvent[]): string;
export declare function auditExportFileName(filters: AuditExportFilters): string;
export declare function buildAuditExportDescriptor(filters: AuditExportFilters, events: IdentityServiceAdminAuditEvent[]): Record<string, unknown>;
export declare function toAuditExportPayloadRow(event: IdentityServiceAdminAuditEvent): Record<(typeof AUDIT_EXPORT_COLUMNS)[number], string | null>;
export declare function redactAuditEventForReadSide(event: IdentityServiceAdminAuditEvent): IdentityServiceAdminAuditEvent;
export declare function applyAuditRedactionOverlay(event: IdentityServiceAdminAuditEvent, overlay: Record<string, unknown> | undefined): IdentityServiceAdminAuditEvent;
export declare function buildAuditRedactionOverlay(event: IdentityServiceAdminAuditEvent, fields: string[] | undefined): Record<string, unknown>;
export declare function createAuditExportRecord(input: {
    descriptor: Record<string, unknown>;
    filters: AuditExportFilters;
    requesterId: string;
    requesterName: string;
    sourceEventIds: string[];
}): ServiceAdminAuditExportRecord;
export declare function createAuditRedactionRecord(input: {
    actor: string;
    actorName: string;
    eventId: string;
    fields?: string[];
    original: IdentityServiceAdminAuditEvent;
    reason: string;
}): ServiceAdminAuditRedactionRecord;
export declare function isAuditExportExpired(record: ServiceAdminAuditExportRecord, now?: number): boolean;
