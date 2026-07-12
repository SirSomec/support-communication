import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { IdentityRepository, isActiveServiceAdminImpersonationConflict, type IdentityBreakGlassApproval, type IdentityServiceAdminAuditEvent, type IdentityServiceAdminImpersonationSession, type IdentityTenant, type IdentityTenantUser } from "../identity/identity.repository.js";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import { type ServiceAdminUser } from "./service-admin.types.js";
import {
  applyAuditRedactionOverlay,
  AUDIT_EXPORT_COLUMNS,
  AUDIT_EXPORT_REDACTION_POLICY,
  buildAuditExportDescriptor,
  createAuditExportRecord,
  createAuditRedactionRecord,
  isAuditExportExpired,
  stableAuditExportFilters,
  toAuditExportPayloadRow,
  type AuditExportFilters
} from "./service-admin-audit.persistence.js";

const SUPPORT_ADMIN_SERVICE = "supportAdminService";

interface UserFilters extends AuditExportFilters {
}

interface UserActionPayload {
  actor?: ServiceAdminActor;
  confirmed?: boolean;
  reason?: string;
  userId?: string;
}

interface ImpersonationPayload {
  actor?: ServiceAdminActor;
  approvalId?: string;
  confirmed?: boolean;
  durationMinutes?: number;
  mode?: string;
  reason?: string;
  tenantId?: string;
  userId?: string;
  writeAccess?: boolean;
}

interface BreakGlassPayload {
  actor?: ServiceAdminActor;
  action?: string;
  confirmed?: boolean;
  durationMinutes?: number;
  reason?: string;
  target?: string;
  tenantId?: string;
  userId?: string;
}

interface BreakGlassDecisionPayload {
  actor?: ServiceAdminActor;
  approvalId?: string;
  confirmed?: boolean;
  decision?: string;
  reason?: string;
}

type AuditEvent = IdentityServiceAdminAuditEvent;

type ImpersonationSession = IdentityServiceAdminImpersonationSession;

interface AuditRecordInput {
  actor?: ServiceAdminActor;
  action: string;
  idScope?: string;
  reason?: string;
  result: string;
  severity: AuditEvent["severity"];
  target: string;
  tenantId: string | null;
  userId: string | null;
}

type AuditRecordResult = { auditEvent: AuditEvent } | { envelope: BackendEnvelope<Record<string, unknown>> };

export class ServiceAdminService {
  constructor(private readonly identityRepository = IdentityRepository.default()) {}

  async fetchSupportUsers(filters: UserFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const query = String(filters.query ?? "").trim().toLowerCase();
    const tenants = await this.listTenants();
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const allUsers = await this.fetchRepositoryUsers();
    const items = allUsers.filter((user) => {
      const tenant = tenantById.get(user.tenantId);
      const tenantMatches = !filters.tenantId || user.tenantId === filters.tenantId;
      const statusMatches = !filters.status || filters.status === "all" || user.status === filters.status;
      const queryMatches = !query || [user.id, user.name, user.email, user.role, tenant?.name ?? ""]
        .some((value) => value.toLowerCase().includes(query));

      return tenantMatches && statusMatches && queryMatches;
    });

    return createEnvelope({
      service: SUPPORT_ADMIN_SERVICE,
      operation: "fetchSupportUsers",
      traceId: supportTraceId("fetchSupportUsers"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        filters,
        items: clone(items),
        tenants: clone(tenants)
      }
    });
  }

  async fetchAuditEvents(filters: UserFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const query = String(filters.query ?? "").trim().toLowerCase();
    const periodCutoff = auditPeriodCutoff(filters.period);
    const redactionOverlays = await this.loadAuditRedactionOverlays();
    const allEvents = (await this.identityRepository.listServiceAdminAuditEvents())
      .sort(compareAuditEvents);
    const filteredItems = allEvents.filter((event) => {
      const actionMatches = !filters.action || event.action === filters.action;
      const actorMatches = !filters.actorId || event.actor === filters.actorId;
      const periodMatches = periodCutoff === null || Date.parse(event.at) >= periodCutoff;
      const severityMatches = !filters.severity || event.severity === filters.severity;
      const statusMatches = !filters.status || event.result === filters.status;
      const tenantMatches = !filters.tenantId || event.tenantId === filters.tenantId;
      const userMatches = !filters.userId || event.userId === filters.userId || event.target === filters.userId;
      const targetMatches = !filters.target || event.target === filters.target;
      const queryMatches = !query || [event.id, event.actor, event.action, event.target, event.reason ?? "", event.result]
        .some((value) => value.toLowerCase().includes(query));

      return actionMatches && actorMatches && periodMatches && severityMatches && statusMatches && tenantMatches && userMatches && targetMatches && queryMatches;
    });
    const cursor = decodeAuditCursor(filters.cursor);
    const cursorItems = cursor ? filteredItems.filter((event) => isAfterAuditCursor(event, cursor)) : filteredItems;
    const limit = normalizeAuditLimit(filters.limit, cursorItems.length);
    const items = cursorItems.slice(0, limit);
    const nextCursor = cursorItems.length > items.length ? encodeAuditCursor(items[items.length - 1]) : null;

    return createEnvelope({
      service: SUPPORT_ADMIN_SERVICE,
      operation: "fetchAuditEvents",
      traceId: supportTraceId("fetchAuditEvents"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        filters,
        items: items.map((event) => applyAuditRedactionOverlay(event, redactionOverlays.get(event.id))),
        page: {
          cursor: filters.cursor ?? null,
          limit,
          nextCursor,
          returnedRows: items.length,
          totalRows: filteredItems.length
        }
      }
    });
  }

  async requestAuditExport(
    filters: UserFilters = {},
    actor: ServiceAdminActor | undefined = undefined
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const auditEvents = await this.fetchAuditEvents(filters);
    const items = auditEvents.data.items as AuditEvent[];
    const descriptor = buildAuditExportDescriptor(filters, items);
    const existingExports = await this.identityRepository.listServiceAdminAuditExports();
    const descriptorId = String(descriptor.id);
    const reusable = existingExports.find((record) => (
      record.descriptorId === descriptorId
      && stableExportFiltersMatch(record.filters, stableAuditExportFilters(filters))
      && !isAuditExportExpired(record)
    ));

    const exportRecord = reusable ?? await this.identityRepository.recordServiceAdminAuditExport(
      createAuditExportRecord({
        descriptor,
        filters,
        requesterId: actor?.id ?? "service-admin",
        requesterName: actor?.name ?? "Service Admin",
        sourceEventIds: items.map((event) => event.id)
      })
    );

    return buildAuditExportEnvelope(filters, items, exportRecord.descriptor);
  }

  async redactAuditEvent(payload: {
    actor?: ServiceAdminActor;
    eventId?: string;
    fields?: string[];
    reason?: string;
  } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const eventId = String(payload.eventId ?? "").trim();
    const reason = String(payload.reason ?? "").trim();

    if (!eventId) {
      return invalidEnvelope("redactAuditEvent", "audit_event_id_required", "Audit event id is required.", { eventId });
    }

    if (reason.length < 8) {
      return invalidEnvelope("redactAuditEvent", "audit_redaction_reason_required", "Audit redaction reason must be at least 8 characters.", { eventId });
    }

    const original = (await this.identityRepository.listServiceAdminAuditEvents()).find((event) => event.id === eventId);
    if (!original) {
      return notFoundEnvelope("redactAuditEvent", "audit_event_not_found", `Audit event ${eventId} was not found.`, { eventId });
    }

    const redaction = await this.identityRepository.recordServiceAdminAuditRedaction(
      createAuditRedactionRecord({
        actor: payload.actor?.id ?? "service-admin",
        actorName: payload.actor?.name ?? "Service Admin",
        eventId,
        fields: payload.fields,
        original,
        reason
      })
    );

    const auditRecord = await this.recordAudit("redactAuditEvent", {
      actor: payload.actor,
      action: "audit.redact",
      reason,
      result: "applied",
      severity: "warning",
      target: eventId,
      tenantId: original.tenantId,
      userId: original.userId
    });
    if ("envelope" in auditRecord) {
      return auditRecord.envelope;
    }

    return createEnvelope({
      service: SUPPORT_ADMIN_SERVICE,
      operation: "redactAuditEvent",
      traceId: supportTraceId("redactAuditEvent"),
      meta: apiMeta({ eventId }),
      data: {
        auditEvent: auditRecord.auditEvent,
        overlay: redaction.overlay,
        original: {
          id: original.id,
          immutable: original.immutable
        },
        redaction
      }
    });
  }

  async resetTwoFactor(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.applyUserAction(payload, "user.mfa.reset", (user) => {
      user.mfa = "reset_pending";
    });
  }

  async forceLogout(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.applyUserAction(payload, "user.sessions.logout", (user) => {
      user.sessions = 0;
    });
  }

  async blockUser(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.applyUserAction(payload, "user.block", (user) => {
      user.status = "blocked";
      user.sessions = 0;
    }, "critical");
  }

  async unblockUser(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.applyUserAction(payload, "user.unblock", (user) => {
      user.status = "active";
    }, "warning");
  }

  async resendInvite(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    return this.applyUserAction(payload, "user.invite.resend", (user) => {
      user.inviteStatus = "sent";
    });
  }

  async startImpersonation(payload: ImpersonationPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const tenant = await this.findTenant(request.tenantId);

    if (!tenant) {
      return this.notFoundWithAudit("startImpersonation", "tenant_not_found", `Tenant ${request.tenantId ?? "(empty)"} was not found.`, {
        tenantId: request.tenantId ?? null
      }, {
        action: "impersonation.start",
        actor: request.actor,
        reason: request.reason,
        result: "blocked_tenant_not_found",
        severity: "warning",
        target: request.tenantId ?? "unknown",
        tenantId: request.tenantId ?? null,
        userId: request.userId ?? null
      });
    }

    const user = request.userId ? await this.findUser(request.userId) : undefined;

    if (request.userId && (!user || user.tenantId !== tenant.id)) {
      return this.notFoundWithAudit("startImpersonation", "user_not_found", `User ${request.userId} was not found in tenant ${tenant.id}.`, {
        tenantId: tenant.id,
        userId: request.userId
      }, {
        action: "impersonation.start",
        actor: request.actor,
        reason: request.reason,
        result: "blocked_user_not_found",
        severity: "warning",
        target: request.userId,
        tenantId: tenant.id,
        userId: request.userId
      });
    }

    const validation = await this.validatePrivilegedRequest("startImpersonation", request, {
      action: "impersonation.start",
      target: request.userId ?? tenant.id,
      tenantId: tenant.id,
      userId: request.userId ?? null
    });

    if (validation) {
      return validation;
    }

    const requestedMode = requestedImpersonationMode(request);
    const approvalValidation = requestedMode === "break_glass_write"
      ? await this.validateBreakGlassWriteApproval(request, tenant.id, user?.id ?? null)
      : { approval: null };
    if ("envelope" in approvalValidation) {
      return approvalValidation.envelope;
    }

    const activeDuplicate = await this.findActiveImpersonation(tenant.id, user?.id ?? null);
    if (activeDuplicate) {
      if (activeDuplicate.mode !== requestedMode || (activeDuplicate.approvalId ?? null) !== (approvalValidation.approval?.id ?? null)) {
        const auditRecord = await this.recordAudit("startImpersonation", {
          actor: request.actor,
          action: "impersonation.start",
          reason: request.reason,
          result: "blocked_impersonation_already_active",
          severity: "warning",
          target: activeDuplicate.id,
          tenantId: tenant.id,
          userId: user?.id ?? null
        });
        if ("envelope" in auditRecord) {
          return auditRecord.envelope;
        }
        return conflictEnvelope("startImpersonation", "impersonation_already_active", "An active impersonation already exists for this tenant and user scope.", {
          access: impersonationAccess(activeDuplicate),
          activeMode: activeDuplicate.mode,
          auditEvent: auditRecord.auditEvent,
          approvalId: approvalValidation.approval?.id ?? null,
          impersonation: clone(activeDuplicate),
          requestedMode
        });
      }

      const auditRecord = await this.recordAudit("startImpersonation", {
        actor: request.actor,
        action: "impersonation.start",
        reason: request.reason,
        result: "duplicate",
        severity: "warning",
        target: activeDuplicate.id,
        tenantId: tenant.id,
        userId: user?.id ?? null
      });
      if ("envelope" in auditRecord) {
        return auditRecord.envelope;
      }

      return createEnvelope({
        service: SUPPORT_ADMIN_SERVICE,
        operation: "startImpersonation",
        traceId: supportTraceId("startImpersonation"),
        meta: apiMeta({ tenantId: tenant.id }),
        data: {
          access: impersonationAccess(activeDuplicate),
          auditEvent: auditRecord.auditEvent,
          duplicate: true,
          impersonation: clone(activeDuplicate)
        }
      });
    }

    const durationMinutes = clampDuration(request.durationMinutes);
    const startedAt = new Date();
    const expiresAt = approvalValidation.approval
      ? earliestDate(addMinutes(startedAt, durationMinutes), new Date(approvalValidation.approval.expiresAt))
      : addMinutes(startedAt, durationMinutes);
    const effectiveDurationMinutes = Math.max(1, Math.ceil((expiresAt.getTime() - startedAt.getTime()) / 60000));
    const impersonationId = `imp_${tenant.id}_${randomUUID()}`;
    const impersonation: ImpersonationSession = {
      approvalId: approvalValidation.approval?.id ?? null,
      id: impersonationId,
      tenantId: tenant.id,
      tenantName: tenant.name,
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      mode: requestedMode,
      startedAt: startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      durationMinutes: effectiveDurationMinutes,
      banner: requestedMode === "break_glass_write" ? `Break-glass write access for ${tenant.name}` : `Read-only support view for ${tenant.name}`,
      stoppedAt: null,
      stopAuditEvent: null
    };
    const auditEvent = this.buildAuditEvent({
      actor: request.actor,
      action: "impersonation.start",
      reason: request.reason,
      result: "started",
      severity: "critical",
      target: impersonation.id,
      tenantId: tenant.id,
      userId: user?.id ?? null
    });
    const persisted = await this.createImpersonationWithConflictEnvelope(request, {
      ...impersonation,
      auditEventId: auditEvent.id
    }, auditEvent, requestedMode, approvalValidation.approval?.id ?? null);
    if ("envelope" in persisted) {
      return persisted.envelope;
    }

    return createEnvelope({
      service: SUPPORT_ADMIN_SERVICE,
      operation: "startImpersonation",
      traceId: supportTraceId("startImpersonation"),
      meta: apiMeta({ tenantId: tenant.id }),
      data: {
        access: impersonationAccess(persisted.session),
        auditEvent: persisted.auditEvent,
        impersonation: clone(persisted.session)
      }
    });
  }

  async stopImpersonation(payload: { actor?: ServiceAdminActor; impersonationId?: string; reason?: string } | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const impersonation = await this.identityRepository.findServiceAdminImpersonation(request.impersonationId);

    if (!impersonation) {
      return this.notFoundWithAudit("stopImpersonation", "impersonation_not_found", `Impersonation ${request.impersonationId ?? "(empty)"} was not found.`, {
        impersonationId: request.impersonationId ?? null
      }, {
        action: "impersonation.stop",
        actor: request.actor,
        reason: request.reason,
        result: "blocked_impersonation_not_found",
        severity: "warning",
        target: request.impersonationId ?? "unknown",
        tenantId: null,
        userId: null
      });
    }

    if (!hasAuditReason(request.reason)) {
      const auditRecord = await this.recordAudit("stopImpersonation", {
        actor: request.actor,
        action: "impersonation.stop",
        reason: request.reason,
        result: "blocked_reason_required",
        severity: "warning",
        target: impersonation.id,
        tenantId: impersonation.tenantId,
        userId: impersonation.userId
      });
      if ("envelope" in auditRecord) {
        return auditRecord.envelope;
      }
      return invalidEnvelope("stopImpersonation", "reason_required", "A service-admin reason of at least 8 characters is required.", {
        auditEvent: auditRecord.auditEvent,
        impersonationId: impersonation.id
      });
    }

    if (impersonation.stoppedAt) {
      const auditRecord = await this.recordAudit("stopImpersonation", {
        actor: request.actor,
        action: "impersonation.stop",
        reason: request.reason,
        result: "duplicate",
        severity: "warning",
        target: impersonation.id,
        tenantId: impersonation.tenantId,
        userId: impersonation.userId
      });
      if ("envelope" in auditRecord) {
        return auditRecord.envelope;
      }
      return createEnvelope({
        service: SUPPORT_ADMIN_SERVICE,
        operation: "stopImpersonation",
        traceId: supportTraceId("stopImpersonation"),
        meta: apiMeta({ impersonationId: impersonation.id }),
        data: {
          auditEvent: auditRecord.auditEvent,
          duplicate: true,
          impersonationId: impersonation.id,
          reason: request.reason?.trim(),
          stoppedAt: impersonation.stoppedAt
        }
      });
    }

    const stoppedAt = new Date().toISOString();
    const auditEvent = this.buildAuditEvent({
      actor: request.actor,
      action: "impersonation.stop",
      reason: request.reason,
      result: "stopped",
      severity: "critical",
      target: impersonation.id,
      tenantId: impersonation.tenantId,
      userId: impersonation.userId
    });
    let persisted: { auditEvent: AuditEvent; session: ImpersonationSession };
    try {
      persisted = await this.identityRepository.stopServiceAdminImpersonation({
        auditEvent,
        impersonationId: impersonation.id,
        stoppedAt
      });
    } catch {
      return serviceAdminPersistenceErrorEnvelope("stopImpersonation", "impersonation.stop", auditEvent, {
        impersonationId: impersonation.id,
        tenantId: impersonation.tenantId,
        userId: impersonation.userId
      });
    }

    return createEnvelope({
      service: SUPPORT_ADMIN_SERVICE,
      operation: "stopImpersonation",
      traceId: supportTraceId("stopImpersonation"),
      meta: apiMeta({ impersonationId: impersonation.id }),
      data: {
        auditEvent: persisted.auditEvent,
        impersonationId: impersonation.id,
        reason: request.reason?.trim(),
        stoppedAt: persisted.session.stoppedAt
      }
    });
  }

  async requestBreakGlassApproval(payload: BreakGlassPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const tenant = request.tenantId ? await this.findTenant(request.tenantId) : undefined;

    if (request.tenantId && !tenant) {
      return this.notFoundWithAudit("requestBreakGlassApproval", "tenant_not_found", `Tenant ${request.tenantId} was not found.`, {
        tenantId: request.tenantId
      }, {
        action: "break_glass.request",
        actor: request.actor,
        idScope: "break_glass",
        reason: request.reason,
        result: "blocked_tenant_not_found",
        severity: "warning",
        target: request.target ?? request.userId ?? request.tenantId,
        tenantId: request.tenantId,
        userId: request.userId ?? null
      });
    }

    const user = request.userId ? await this.findUser(request.userId) : undefined;

    if (request.userId && (!user || (tenant && user.tenantId !== tenant.id))) {
      return this.notFoundWithAudit("requestBreakGlassApproval", "user_not_found", `User ${request.userId} was not found in approval scope.`, {
        tenantId: tenant?.id ?? null,
        userId: request.userId
      }, {
        action: "break_glass.request",
        actor: request.actor,
        idScope: "break_glass",
        reason: request.reason,
        result: "blocked_user_not_found",
        severity: "warning",
        target: request.target ?? request.userId,
        tenantId: tenant?.id ?? request.tenantId ?? null,
        userId: request.userId
      });
    }

    const effectiveTenant = tenant ?? (user ? await this.findTenant(user.tenantId) : undefined);
    const target = request.target ?? request.userId ?? request.tenantId ?? "global";
    const validation = await this.validatePrivilegedRequest("requestBreakGlassApproval", request, {
      action: "break_glass.request",
      target,
      tenantId: effectiveTenant?.id ?? null,
      userId: user?.id ?? null
    });

    if (validation) {
      return validation;
    }

    const durationMinutes = clampDuration(request.durationMinutes);
    const requestedAt = new Date();
    const auditEvent = this.buildAuditEvent({
      actor: request.actor,
      action: "break_glass.request",
      idScope: "break_glass",
      reason: request.reason,
      result: "pending",
      severity: "critical",
      target,
      tenantId: effectiveTenant?.id ?? null,
      userId: user?.id ?? null
    });
    const approval: IdentityBreakGlassApproval = {
      action: request.action ?? "impersonation.write",
      auditEventId: auditEvent.id,
      durationMinutes,
      expiresAt: addMinutes(requestedAt, durationMinutes).toISOString(),
      id: `bg_${randomUUID()}`,
      requestedAt: requestedAt.toISOString(),
      status: "pending",
      target,
      tenantId: effectiveTenant?.id ?? null,
      userId: user?.id ?? null
    };
    let persisted: { approval: IdentityBreakGlassApproval; auditEvent: AuditEvent };
    try {
      persisted = await this.identityRepository.createBreakGlassApproval({
        approval,
        auditEvent
      });
    } catch {
      return serviceAdminPersistenceErrorEnvelope("requestBreakGlassApproval", "break_glass.request", auditEvent, {
        approvalId: approval.id,
        tenantId: effectiveTenant?.id ?? null,
        userId: user?.id ?? null
      });
    }

    return createEnvelope({
      service: SUPPORT_ADMIN_SERVICE,
      operation: "requestBreakGlassApproval",
      traceId: supportTraceId("requestBreakGlassApproval"),
      meta: apiMeta({ tenantId: effectiveTenant?.id ?? null }),
      data: {
        access: {
          readOnly: true,
          writeGranted: false
        },
        approval: persisted.approval,
        auditEvent: persisted.auditEvent
      }
    });
  }

  async decideBreakGlassApproval(payload: BreakGlassDecisionPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const approval = await this.identityRepository.findBreakGlassApproval(request.approvalId);

    if (!approval) {
      return this.notFoundWithAudit("decideBreakGlassApproval", "break_glass_approval_not_found", `Break-glass approval ${request.approvalId ?? "(empty)"} was not found.`, {
        approvalId: request.approvalId ?? null
      }, {
        action: "break_glass.decision",
        actor: request.actor,
        idScope: "break_glass",
        reason: request.reason,
        result: "blocked_break_glass_approval_not_found",
        severity: "warning",
        target: request.approvalId ?? "unknown",
        tenantId: null,
        userId: null
      });
    }

    const decision = normalizeBreakGlassDecision(request.decision);
    if (!decision) {
      const auditRecord = await this.recordAudit("decideBreakGlassApproval", {
        actor: request.actor,
        action: "break_glass.decision",
        idScope: "break_glass",
        reason: request.reason,
        result: "blocked_break_glass_decision_required",
        severity: "warning",
        target: approval.id,
        tenantId: approval.tenantId,
        userId: approval.userId
      });
      if ("envelope" in auditRecord) {
        return auditRecord.envelope;
      }
      return invalidEnvelope("decideBreakGlassApproval", "break_glass_decision_required", "Break-glass decision must be approved or rejected.", {
        auditEvent: auditRecord.auditEvent,
        approvalId: approval.id,
        decision: request.decision ?? null
      });
    }

    const action = decision === "approved" ? "break_glass.approve" : "break_glass.reject";
    const validation = await this.validatePrivilegedRequest("decideBreakGlassApproval", request, {
      action,
      target: approval.id,
      tenantId: approval.tenantId,
      userId: approval.userId
    });

    if (validation) {
      return validation;
    }

    if (approval.status === "pending" && Date.parse(approval.expiresAt) <= Date.now()) {
      const auditEvent = this.buildAuditEvent({
        actor: request.actor,
        action: "break_glass.expire",
        idScope: "break_glass",
        reason: request.reason,
        result: "expired",
        severity: "critical",
        target: approval.id,
        tenantId: approval.tenantId,
        userId: approval.userId
      });
      let persisted: { approval: IdentityBreakGlassApproval; auditEvent: AuditEvent };
      try {
        persisted = await this.identityRepository.decideBreakGlassApproval({
          approvalId: approval.id,
          auditEvent,
          status: "expired"
        });
      } catch {
        return serviceAdminPersistenceErrorEnvelope("decideBreakGlassApproval", "break_glass.expire", auditEvent, {
          approvalId: approval.id,
          tenantId: approval.tenantId,
          userId: approval.userId
        });
      }

      return invalidEnvelope("decideBreakGlassApproval", "break_glass_approval_expired", "Break-glass approval expired before it could be decided.", {
        access: breakGlassDecisionAccess(persisted.approval),
        approval: persisted.approval,
        auditEvent: persisted.auditEvent
      });
    }

    if (approval.status !== "pending") {
      if (approval.status === decision) {
        const auditRecord = await this.recordAudit("decideBreakGlassApproval", {
          actor: request.actor,
          action,
          idScope: "break_glass",
          reason: request.reason,
          result: "duplicate",
          severity: "warning",
          target: approval.id,
          tenantId: approval.tenantId,
          userId: approval.userId
        });
        if ("envelope" in auditRecord) {
          return auditRecord.envelope;
        }
        return createEnvelope({
          service: SUPPORT_ADMIN_SERVICE,
          operation: "decideBreakGlassApproval",
          traceId: supportTraceId("decideBreakGlassApproval"),
          meta: apiMeta({ approvalId: approval.id, tenantId: approval.tenantId }),
          data: {
            access: breakGlassDecisionAccess(approval),
            approval,
            auditEvent: auditRecord.auditEvent,
            duplicate: true
          }
        });
      }

      const auditRecord = await this.recordAudit("decideBreakGlassApproval", {
        actor: request.actor,
        action,
        idScope: "break_glass",
        reason: request.reason,
        result: "blocked_break_glass_approval_already_decided",
        severity: "warning",
        target: approval.id,
        tenantId: approval.tenantId,
        userId: approval.userId
      });
      if ("envelope" in auditRecord) {
        return auditRecord.envelope;
      }

      return conflictEnvelope("decideBreakGlassApproval", "break_glass_approval_already_decided", "Break-glass approval was already decided.", {
        auditEvent: auditRecord.auditEvent,
        approval,
        requestedDecision: decision
      });
    }

    const auditEvent = this.buildAuditEvent({
      actor: request.actor,
      action,
      idScope: "break_glass",
      reason: request.reason,
      result: decision,
      severity: "critical",
      target: approval.id,
      tenantId: approval.tenantId,
      userId: approval.userId
    });
    let persisted: { approval: IdentityBreakGlassApproval; auditEvent: AuditEvent };
    try {
      persisted = await this.identityRepository.decideBreakGlassApproval({
        approvalId: approval.id,
        auditEvent,
        status: decision
      });
    } catch {
      return serviceAdminPersistenceErrorEnvelope("decideBreakGlassApproval", action, auditEvent, {
        approvalId: approval.id,
        tenantId: approval.tenantId,
        userId: approval.userId
      });
    }

    return createEnvelope({
      service: SUPPORT_ADMIN_SERVICE,
      operation: "decideBreakGlassApproval",
      traceId: supportTraceId("decideBreakGlassApproval"),
      meta: apiMeta({ approvalId: approval.id, tenantId: approval.tenantId }),
      data: {
        access: breakGlassDecisionAccess(persisted.approval),
        approval: persisted.approval,
        auditEvent: persisted.auditEvent
      }
    });
  }

  private async applyUserAction(
    payload: UserActionPayload | null | undefined,
    action: string,
    mutate: (user: ServiceAdminUser) => void,
    severity: AuditEvent["severity"] = "warning"
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const user = await this.findUser(request.userId);

    if (!user) {
      return this.notFoundWithAudit(actionToOperation(action), "user_not_found", `User ${request.userId ?? "(empty)"} was not found.`, {
        userId: request.userId ?? null
      }, {
        action,
        actor: request.actor,
        reason: request.reason,
        result: "blocked_user_not_found",
        severity: "warning",
        target: request.userId ?? "unknown",
        tenantId: null,
        userId: request.userId ?? null
      });
    }

    const validation = await this.validatePrivilegedRequest(actionToOperation(action), request, {
      action,
      target: user.id,
      tenantId: user.tenantId,
      userId: user.id
    });

    if (validation) {
      return validation;
    }

    const nextUser = clone(user);
    mutate(nextUser);
    const auditEvent = this.buildAuditEvent({
      actor: request.actor,
      action,
      reason: request.reason,
      result: "applied",
      severity,
      target: user.id,
      tenantId: user.tenantId,
      userId: user.id
    });
    let persisted: { auditEvent: AuditEvent; user: IdentityTenantUser };
    try {
      persisted = await this.identityRepository.applyServiceAdminUserAction({
        action,
        auditEvent,
        changes: toTenantUserChanges(user, nextUser),
        userId: user.id
      });
    } catch {
      return serviceAdminPersistenceErrorEnvelope(actionToOperation(action), action, auditEvent, {
        tenantId: user.tenantId,
        userId: user.id
      });
    }
    const persistedUser = toServiceAdminUser(persisted.user);

    return createEnvelope({
      service: SUPPORT_ADMIN_SERVICE,
      operation: actionToOperation(action),
      traceId: supportTraceId(actionToOperation(action)),
      meta: apiMeta({ tenantId: persistedUser.tenantId, userId: persistedUser.id }),
      data: {
        auditEvent: persisted.auditEvent,
        confirmationRequired: true,
        reason: request.reason?.trim(),
        user: clone(persistedUser)
      }
    });
  }

  private async listTenants(): Promise<Array<{ id: string; name: string; planId: string; status: string }>> {
    const tenants = await this.identityRepository.listTenants();
    return tenants.map(toServiceAdminTenant);
  }

  private async findTenant(tenantId: string | undefined): Promise<{ id: string; name: string; planId: string; status: string } | undefined> {
    if (!tenantId) {
      return undefined;
    }

    const tenant = await this.identityRepository.findTenant(tenantId);
    return tenant ? toServiceAdminTenant(tenant) : undefined;
  }

  private async findUser(userId: string | undefined): Promise<ServiceAdminUser | undefined> {
    const user = await this.identityRepository.findTenantUser(userId);
    if (!user || !(await this.findTenant(user.tenantId))) {
      return undefined;
    }

    return toServiceAdminUser(user);
  }

  private async fetchRepositoryUsers(): Promise<ServiceAdminUser[]> {
    const tenants = await this.listTenants();
    const tenantUsers = await Promise.all(tenants.map((tenant) => this.identityRepository.findTenantUsers(tenant.id)));
    return tenantUsers.flat().map(toServiceAdminUser);
  }

  private async loadAuditRedactionOverlays(): Promise<Map<string, Record<string, unknown>>> {
    const redactions = await this.identityRepository.listServiceAdminAuditRedactions();
    const overlays = new Map<string, Record<string, unknown>>();

    for (const redaction of redactions) {
      overlays.set(redaction.eventId, redaction.overlay);
    }

    return overlays;
  }

  private async findActiveImpersonation(tenantId: string, userId: string | null): Promise<ImpersonationSession | undefined> {
    return this.identityRepository.findActiveServiceAdminImpersonation({
      tenantId,
      userId
    });
  }

  private async createImpersonationWithConflictEnvelope(
    request: ImpersonationPayload,
    impersonation: ImpersonationSession,
    auditEvent: AuditEvent,
    requestedMode: ImpersonationSession["mode"],
    approvalId: string | null
  ): Promise<{ auditEvent: AuditEvent; session: ImpersonationSession } | { envelope: BackendEnvelope<Record<string, unknown>> }> {
    try {
      return await this.identityRepository.createServiceAdminImpersonation({
        auditEvent,
        session: impersonation
      });
    } catch (error) {
      if (!isActiveServiceAdminImpersonationConflict(error)) {
        return {
          envelope: serviceAdminPersistenceErrorEnvelope("startImpersonation", "impersonation.start", auditEvent, {
            tenantId: impersonation.tenantId,
            userId: impersonation.userId
          })
        };
      }

      const active = await this.findActiveImpersonation(impersonation.tenantId, impersonation.userId);
      if (active && active.mode === requestedMode && (active.approvalId ?? null) === approvalId) {
        const auditRecord = await this.recordAudit("startImpersonation", {
          actor: request.actor,
          action: "impersonation.start",
          reason: request.reason,
          result: "duplicate",
          severity: "warning",
          target: active.id,
          tenantId: impersonation.tenantId,
          userId: impersonation.userId
        });
        if ("envelope" in auditRecord) {
          return { envelope: auditRecord.envelope };
        }

        return {
          envelope: createEnvelope({
            service: SUPPORT_ADMIN_SERVICE,
            operation: "startImpersonation",
            traceId: supportTraceId("startImpersonation"),
            meta: apiMeta({ tenantId: impersonation.tenantId }),
            data: {
              access: impersonationAccess(active),
              auditEvent: auditRecord.auditEvent,
              duplicate: true,
              impersonation: clone(active)
            }
          })
        };
      }

      const auditRecord = await this.recordAudit("startImpersonation", {
        actor: request.actor,
        action: "impersonation.start",
        reason: request.reason,
        result: "blocked_impersonation_already_active",
        severity: "warning",
        target: active?.id ?? impersonation.id,
        tenantId: impersonation.tenantId,
        userId: impersonation.userId
      });
      if ("envelope" in auditRecord) {
        return { envelope: auditRecord.envelope };
      }

      return {
        envelope: conflictEnvelope("startImpersonation", "impersonation_already_active", "An active impersonation already exists for this tenant and user scope.", {
          access: { approvalId, readOnly: true, writeGranted: false },
          activeMode: active?.mode ?? null,
          auditEvent: auditRecord.auditEvent,
          impersonation: active ? clone(active) : null,
          requestedMode
        })
      };
    }
  }

  private async validateBreakGlassWriteApproval(
    request: ImpersonationPayload,
    tenantId: string,
    userId: string | null
  ): Promise<{ approval: IdentityBreakGlassApproval } | { envelope: BackendEnvelope<Record<string, unknown>> }> {
    const approvalId = String(request.approvalId ?? "").trim();
    const target = userId ?? tenantId;
    const auditContext = {
      action: "impersonation.start",
      actor: request.actor,
      reason: request.reason,
      severity: "critical" as const,
      target,
      tenantId,
      userId
    };

    if (!approvalId) {
      const auditRecord = await this.recordAudit("startImpersonation", {
        ...auditContext,
        result: "blocked_break_glass_approval_required"
      });
      if ("envelope" in auditRecord) {
        return { envelope: auditRecord.envelope };
      }
      return {
        envelope: invalidEnvelope("startImpersonation", "break_glass_approval_required", "Approved break-glass approval is required for write impersonation.", {
          access: { approvalId: null, readOnly: true, writeGranted: false },
          auditEvent: auditRecord.auditEvent
        })
      };
    }

    const approval = await this.identityRepository.findBreakGlassApproval(approvalId);
    if (!approval) {
      const auditRecord = await this.recordAudit("startImpersonation", {
        ...auditContext,
        result: "blocked_break_glass_approval_not_found",
        target: approvalId
      });
      if ("envelope" in auditRecord) {
        return { envelope: auditRecord.envelope };
      }
      return {
        envelope: notFoundEnvelope("startImpersonation", "break_glass_approval_not_found", `Break-glass approval ${approvalId} was not found.`, {
          access: { approvalId, readOnly: true, writeGranted: false },
          auditEvent: auditRecord.auditEvent,
          approvalId
        })
      };
    }

    if (approval.status !== "approved") {
      return await this.writeApprovalDenied("break_glass_approval_not_approved", "Break-glass approval must be approved before write impersonation can start.", request, approval, {
        approval
      });
    }

    if (Date.parse(approval.expiresAt) <= Date.now()) {
      return await this.writeApprovalDenied("break_glass_approval_expired", "Break-glass approval has expired.", request, approval, {
        approval
      });
    }

    if (approval.action !== "impersonation.write") {
      return await this.writeApprovalDenied("break_glass_approval_action_mismatch", "Break-glass approval action does not allow write impersonation.", request, approval, {
        approval
      });
    }

    if (approval.tenantId !== tenantId || approval.userId !== userId || approval.target !== target) {
      return await this.writeApprovalDenied("break_glass_approval_scope_mismatch", "Break-glass approval scope does not match the requested impersonation.", request, approval, {
        approval,
        requestedScope: { target, tenantId, userId }
      });
    }

    return { approval };
  }

  private async writeApprovalDenied(
    code: string,
    message: string,
    request: ImpersonationPayload,
    approval: IdentityBreakGlassApproval,
    data: Record<string, unknown>
  ): Promise<{ envelope: BackendEnvelope<Record<string, unknown>> }> {
    const auditRecord = await this.recordAudit("startImpersonation", {
      action: "impersonation.start",
      actor: request.actor,
      reason: request.reason,
      result: `blocked_${code}`,
      severity: "critical",
      target: approval.target,
      tenantId: approval.tenantId,
      userId: approval.userId
    });
    if ("envelope" in auditRecord) {
      return { envelope: auditRecord.envelope };
    }

    return {
      envelope: invalidEnvelope("startImpersonation", code, message, {
        access: { approvalId: approval.id, readOnly: true, writeGranted: false },
        auditEvent: auditRecord.auditEvent,
        ...data
      })
    };
  }

  private async notFoundWithAudit(
    operation: string,
    code: string,
    message: string,
    data: Record<string, unknown>,
    auditInput: AuditRecordInput
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const auditRecord = await this.recordAudit(operation, auditInput);
    if ("envelope" in auditRecord) {
      return auditRecord.envelope;
    }

    return notFoundEnvelope(operation, code, message, {
      ...data,
      auditEvent: auditRecord.auditEvent
    });
  }

  private async recordAudit(operation: string, {
    actor,
    action,
    idScope = "service_admin",
    reason,
    result,
    severity,
    target,
    tenantId,
    userId
  }: AuditRecordInput): Promise<AuditRecordResult> {
    const event = this.buildAuditEvent({
      actor,
      action,
      idScope,
      reason,
      result,
      severity,
      target,
      tenantId,
      userId
    });
    try {
      return {
        auditEvent: await this.identityRepository.recordServiceAdminAuditEvent(event)
      };
    } catch {
      return {
        envelope: serviceAdminPersistenceErrorEnvelope(operation, action, event, {
          target,
          tenantId,
          userId
        })
      };
    }
  }

  private buildAuditEvent({
    actor,
    action,
    idScope = "service_admin",
    reason,
    result,
    severity,
    target,
    tenantId,
    userId
  }: {
    actor?: ServiceAdminActor;
    action: string;
    idScope?: string;
    reason?: string;
    result: string;
    severity: AuditEvent["severity"];
    target: string;
    tenantId: string | null;
    userId: string | null;
  }): AuditEvent {
    return {
      id: makeAuditId(idScope),
      action,
      actor: actor?.id ?? "service-admin",
      actorName: actor?.name ?? "Service Admin",
      at: new Date().toISOString(),
      immutable: true,
      reason: reason?.trim() || null,
      result,
      severity,
      target,
      tenantId,
      traceId: supportTraceId(action),
      userId
    };
  }

  private async validatePrivilegedRequest(
    operation: string,
    payload: { actor?: ServiceAdminActor; confirmed?: boolean; reason?: string },
    auditContext: { action: string; target: string; tenantId: string | null; userId: string | null }
  ): Promise<BackendEnvelope<Record<string, unknown>> | null> {
    if (!hasAuditReason(payload.reason)) {
      const auditRecord = await this.recordAudit(operation, {
        ...auditContext,
        actor: payload.actor,
        reason: payload.reason,
        result: "blocked_reason_required",
        severity: "warning"
      });
      if ("envelope" in auditRecord) {
        return auditRecord.envelope;
      }
      return invalidEnvelope(operation, "reason_required", "A service-admin reason of at least 8 characters is required.", {
        auditEvent: auditRecord.auditEvent,
        confirmationRequired: true
      });
    }

    if (!payload.confirmed) {
      const auditRecord = await this.recordAudit(operation, {
        ...auditContext,
        actor: payload.actor,
        reason: payload.reason,
        result: "blocked_confirmation_required",
        severity: "warning"
      });
      if ("envelope" in auditRecord) {
        return auditRecord.envelope;
      }
      return invalidEnvelope(operation, "confirmation_required", "Explicit confirmation is required for service-admin privileged actions.", {
        auditEvent: auditRecord.auditEvent,
        confirmationRequired: true
      });
    }

    return null;
  }
}

function actionToOperation(action: string): string {
  const operations: Record<string, string> = {
    "user.block": "blockUser",
    "user.invite.resend": "resendInvite",
    "user.mfa.reset": "resetTwoFactor",
    "user.sessions.logout": "forceLogout",
    "user.unblock": "unblockUser"
  };

  return operations[action] ?? action.replace(/[^a-zA-Z0-9]+(.)/g, (_match, char: string) => char.toUpperCase());
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function auditPeriodCutoff(period: string | undefined): number | null {
  switch (String(period ?? "").trim().toLowerCase()) {
    case "24h":
      return Date.now() - 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function compareAuditEvents(left: AuditEvent, right: AuditEvent): number {
  const time = Date.parse(right.at) - Date.parse(left.at);
  return time === 0 ? right.id.localeCompare(left.id) : time;
}

function decodeAuditCursor(cursor: string | undefined): { at: string; id: string } | null {
  const value = String(cursor ?? "").trim();
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { at?: unknown; id?: unknown };
    const at = String(parsed.at ?? "").trim();
    const id = String(parsed.id ?? "").trim();
    return at && id ? { at, id } : null;
  } catch {
    return null;
  }
}

function encodeAuditCursor(event: AuditEvent | undefined): string | null {
  if (!event) {
    return null;
  }

  return Buffer.from(JSON.stringify({ at: event.at, id: event.id }), "utf8").toString("base64url");
}

function isAfterAuditCursor(event: AuditEvent, cursor: { at: string; id: string }): boolean {
  const eventTime = Date.parse(event.at);
  const cursorTime = Date.parse(cursor.at);
  if (eventTime !== cursorTime) {
    return eventTime < cursorTime;
  }

  return event.id.localeCompare(cursor.id) < 0;
}

function normalizeAuditLimit(limit: number | string | undefined, fallback: number): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

function clampDuration(durationMinutes: number | undefined): number {
  const duration = Number.isFinite(durationMinutes) ? Number(durationMinutes) : 15;
  return Math.min(60, Math.max(5, duration));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildAuditExportEnvelope(
  filters: UserFilters,
  items: AuditEvent[],
  descriptor: Record<string, unknown>
): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: SUPPORT_ADMIN_SERVICE,
    operation: "requestAuditExport",
    traceId: supportTraceId("requestAuditExport"),
    partial: true,
    meta: apiMeta({ filters }),
    data: {
      export: {
        descriptor,
        format: "json",
        filters: clone(filters),
        payload: {
          columns: [...AUDIT_EXPORT_COLUMNS],
          contentType: "application/json",
          redacted: true,
          redactionPolicy: AUDIT_EXPORT_REDACTION_POLICY,
          rows: items.map(toAuditExportPayloadRow)
        },
        sourceEventIds: items.map((event) => event.id),
        totalRows: items.length
      }
    }
  });
}

function stableExportFiltersMatch(left: Record<string, string>, right: Record<string, string>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function notFoundEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: SUPPORT_ADMIN_SERVICE,
    operation,
    traceId: supportTraceId(operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function breakGlassDecisionAccess(approval: IdentityBreakGlassApproval): Record<string, unknown> {
  const writeGranted = approval.status === "approved"
    && approval.action === "impersonation.write"
    && Date.parse(approval.expiresAt) > Date.now();

  return {
    approvalId: approval.id,
    action: approval.action,
    expiresAt: approval.expiresAt,
    readOnly: !writeGranted,
    writeGranted
  };
}

function earliestDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function impersonationAccess(session: ImpersonationSession): Record<string, unknown> {
  const approvalId = session.approvalId ?? null;
  const writeGranted = session.mode === "break_glass_write" && Boolean(approvalId);

  return {
    approvalId,
    readOnly: !writeGranted,
    writeGranted
  };
}

function conflictEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: SUPPORT_ADMIN_SERVICE,
    operation,
    traceId: supportTraceId(operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function serviceAdminPersistenceErrorEnvelope(operation: string, action: string, auditEvent: AuditEvent, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: SUPPORT_ADMIN_SERVICE,
    operation,
    traceId: supportTraceId(operation),
    status: "error",
    meta: apiMeta(),
    data: {
      ...data,
      action,
      auditEvent: {
        ...auditEvent,
        result: "failed"
      }
    },
    error: {
      code: "service_admin_persistence_failed",
      message: "Service-admin operation could not be persisted."
    }
  });
}

function hasAuditReason(reason: unknown): boolean {
  return String(reason ?? "").trim().length >= 8;
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: SUPPORT_ADMIN_SERVICE,
    operation,
    traceId: supportTraceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function normalizeBreakGlassDecision(decision: unknown): "approved" | "rejected" | undefined {
  const value = String(decision ?? "").trim().toLowerCase();
  if (value === "approve" || value === "approved") {
    return "approved";
  }
  if (value === "reject" || value === "rejected") {
    return "rejected";
  }

  return undefined;
}

function requestedImpersonationMode(request: ImpersonationPayload): ImpersonationSession["mode"] {
  const mode = String(request.mode ?? "").trim().toLowerCase();
  if (String(request.approvalId ?? "").trim() || request.writeAccess === true || mode === "break_glass_write" || mode === "write") {
    return "break_glass_write";
  }

  return "read_only_by_default";
}

function supportTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(SUPPORT_ADMIN_SERVICE, operation);
}

function toServiceAdminTenant(tenant: IdentityTenant): { id: string; name: string; planId: string; status: string } {
  return {
    id: tenant.id,
    name: tenant.name,
    planId: "planId" in tenant ? String((tenant as { planId?: string }).planId ?? "business") : "business",
    status: tenant.status
  };
}

function toServiceAdminUser(user: IdentityTenantUser): ServiceAdminUser {
  return {
    device: user.device,
    email: user.email,
    id: user.id,
    inviteStatus: user.inviteStatus,
    lastActiveAt: user.lastActiveAt ?? "never",
    mfa: user.mfa,
    name: user.name,
    risk: user.risk,
    role: user.role,
    sessions: user.sessions,
    status: user.status,
    supportNotes: user.supportNotes,
    tenantId: user.tenantId
  };
}

function toTenantUserChanges(previous: ServiceAdminUser, next: ServiceAdminUser): Partial<IdentityTenantUser> {
  const changes: Partial<IdentityTenantUser> = {};

  if (next.device !== previous.device) changes.device = next.device;
  if (next.email !== previous.email) changes.email = next.email;
  if (next.inviteStatus !== previous.inviteStatus) changes.inviteStatus = next.inviteStatus;
  if (next.lastActiveAt !== previous.lastActiveAt) changes.lastActiveAt = next.lastActiveAt === "never" ? null : next.lastActiveAt;
  if (next.mfa !== previous.mfa) changes.mfa = next.mfa;
  if (next.name !== previous.name) changes.name = next.name;
  if (next.risk !== previous.risk) changes.risk = next.risk;
  if (next.role !== previous.role) changes.role = next.role;
  if (next.sessions !== previous.sessions) changes.sessions = next.sessions;
  if (next.status !== previous.status) changes.status = next.status;
  if (next.supportNotes !== previous.supportNotes) changes.supportNotes = next.supportNotes;
  if (next.tenantId !== previous.tenantId) changes.tenantId = next.tenantId;

  return changes;
}
