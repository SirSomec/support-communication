import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import {
  IntegrationRepository,
  type PublicDemoRequestAuditEvent,
  type PublicDemoRequestNotificationDescriptor,
  type PublicDemoRequestRecord
} from "./integration.repository.js";

const SERVICE = "publicLeadService";
const OPERATION = "createDemoRequest";

export interface PublicDemoRequestPayload {
  company?: string;
  consent?: boolean;
  email?: string;
  message?: string;
  name?: string;
  planInterest?: string;
  source?: string;
  website?: string;
}

export interface PublicDemoRequestContext {
  idempotencyKey?: string;
  ip?: string;
  now?: string;
  userAgent?: string;
}

interface NormalizedPublicDemoRequest {
  company: string;
  consent: boolean;
  email: string;
  message: string;
  name: string;
  planInterest: string | null;
  source: string;
}

export class PublicDemoRequestService {
  constructor(private readonly repository = IntegrationRepository.default()) {}

  async createDemoRequest(
    payload: PublicDemoRequestPayload = {},
    context: PublicDemoRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const traceId = traceIdFor(OPERATION);
    const honeypot = normalizeString(payload.website, 160);
    const normalized = normalizePayload(payload);
    const validationErrors = validatePayload(normalized);
    const now = context.now ?? new Date().toISOString();
    const idempotencyKey = normalizeString(context.idempotencyKey, 160) || null;

    if (honeypot) {
      return rateLimitedEnvelope(traceId, {
        duplicate: false,
        leadId: null,
        requestFingerprint: fingerprintForRejectedPayload(payload),
        reason: "honeypot"
      });
    }

    if (validationErrors.length > 0) {
      return createEnvelope({
        service: SERVICE,
        operation: OPERATION,
        status: "invalid",
        traceId,
        partial: false,
        meta: apiMeta({ source: normalized.source || "landing" }),
        data: {
          accepted: false,
          duplicate: false,
          fields: validationErrors,
          leadId: null
        },
        error: {
          code: "public_demo_request_invalid",
          message: "Public demo request requires name, company, valid email, message and consent."
        }
      });
    }

    const requestFingerprint = createRequestFingerprint(normalized);
    if (idempotencyKey) {
      const existingByIdempotencyKey = await this.repository.findPublicDemoRequestByIdempotencyKeyAsync(idempotencyKey);
      if (existingByIdempotencyKey) {
        if (existingByIdempotencyKey.requestFingerprint !== requestFingerprint) {
          return createEnvelope({
            service: SERVICE,
            operation: OPERATION,
            status: "conflict",
            traceId,
            partial: false,
            meta: apiMeta({ source: normalized.source }),
            data: {
              accepted: false,
              duplicate: false,
              idempotencyKey,
              leadId: existingByIdempotencyKey.id,
              requestFingerprint
            },
            error: {
              code: "public_demo_request_idempotency_conflict",
              message: "Idempotency key was already used with another public demo request fingerprint."
            }
          });
        }

        return okEnvelope(traceId, existingByIdempotencyKey, null, {
          accepted: true,
          duplicate: true,
          notificationDescriptor: null
        });
      }
    }

    const existingByFingerprint = await this.repository.findPublicDemoRequestByFingerprintAsync(requestFingerprint);
    if (existingByFingerprint) {
      const auditEvent = await this.repository.savePublicDemoRequestAuditEventAsync({
        action: "public_demo_request.duplicate",
        at: now,
        id: `audit_${randomUUID()}`,
        immutable: true,
        leadId: existingByFingerprint.id,
        requestFingerprint,
        result: "duplicate",
        source: normalized.source
      });

      return rateLimitedEnvelope(traceId, {
        auditEvent,
        duplicate: true,
        leadId: existingByFingerprint.id,
        requestFingerprint,
        reason: "duplicate_fingerprint"
      });
    }

    const lead: PublicDemoRequestRecord = await this.repository.savePublicDemoRequestAsync({
      company: normalized.company,
      consent: true,
      createdAt: now,
      email: normalized.email,
      id: `demo_req_${randomUUID()}`,
      idempotencyKey,
      ipHash: hashOptional(context.ip),
      message: normalized.message,
      name: normalized.name,
      planInterest: normalized.planInterest,
      requestFingerprint,
      source: normalized.source,
      status: "queued",
      updatedAt: now,
      userAgentHash: hashOptional(context.userAgent)
    });
    const auditEvent = await this.repository.savePublicDemoRequestAuditEventAsync({
      action: "public_demo_request.created",
      at: now,
      id: `audit_${randomUUID()}`,
      immutable: true,
      leadId: lead.id,
      requestFingerprint,
      result: "ok",
      source: lead.source
    });
    const notificationDescriptor = await this.repository.savePublicDemoRequestNotificationDescriptorAsync({
      createdAt: now,
      id: `lead_notification_${randomUUID()}`,
      leadId: lead.id,
      payload: {
        company: lead.company,
        email: lead.email,
        messagePreview: lead.message.slice(0, 220),
        name: lead.name,
        planInterest: lead.planInterest,
        source: lead.source
      },
      queue: "lead-notification",
      status: "queued",
      type: "public.demo_request.notification.requested"
    });

    return okEnvelope(traceId, lead, auditEvent, {
      accepted: true,
      duplicate: false,
      notificationDescriptor
    });
  }
}

function normalizePayload(payload: PublicDemoRequestPayload): NormalizedPublicDemoRequest {
  return {
    company: normalizeString(payload.company, 160),
    consent: payload.consent === true,
    email: normalizeEmail(payload.email),
    message: normalizeString(payload.message, 1200),
    name: normalizeString(payload.name, 120),
    planInterest: normalizeString(payload.planInterest, 80) || null,
    source: normalizeString(payload.source, 80) || "landing"
  };
}

function validatePayload(payload: NormalizedPublicDemoRequest): string[] {
  const fields: string[] = [];
  if (payload.name.length < 2) {
    fields.push("name");
  }
  if (payload.company.length < 2) {
    fields.push("company");
  }
  if (!isValidEmail(payload.email)) {
    fields.push("email");
  }
  if (payload.message.length < 10) {
    fields.push("message");
  }
  if (payload.consent !== true) {
    fields.push("consent");
  }

  return fields;
}

function okEnvelope(
  traceId: string,
  lead: PublicDemoRequestRecord,
  auditEvent: PublicDemoRequestAuditEvent | null,
  options: {
    accepted: boolean;
    duplicate: boolean;
    notificationDescriptor: PublicDemoRequestNotificationDescriptor | null;
  }
): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: SERVICE,
    operation: OPERATION,
    status: "ok",
    traceId,
    partial: false,
    meta: apiMeta({ source: lead.source }),
    data: {
      accepted: options.accepted,
      auditEvent,
      duplicate: options.duplicate,
      lead: publicLeadView(lead),
      leadId: lead.id,
      notificationDescriptor: options.notificationDescriptor,
      requestFingerprint: lead.requestFingerprint
    }
  });
}

function rateLimitedEnvelope(
  traceId: string,
  input: {
    auditEvent?: PublicDemoRequestAuditEvent;
    duplicate: boolean;
    leadId: string | null;
    reason: string;
    requestFingerprint: string;
  }
): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: SERVICE,
    operation: OPERATION,
    status: "rate_limited",
    traceId,
    partial: false,
    meta: apiMeta({ rateLimitReason: input.reason }),
    data: {
      accepted: false,
      auditEvent: input.auditEvent ?? null,
      duplicate: input.duplicate,
      leadId: input.leadId,
      requestFingerprint: input.requestFingerprint
    },
    error: {
      code: "public_demo_request_rate_limited",
      message: "Public demo request was rate-limited by duplicate or spam controls."
    }
  });
}

function publicLeadView(lead: PublicDemoRequestRecord): Record<string, unknown> {
  return {
    company: lead.company,
    createdAt: lead.createdAt,
    email: lead.email,
    id: lead.id,
    name: lead.name,
    planInterest: lead.planInterest,
    source: lead.source,
    status: lead.status
  };
}

function createRequestFingerprint(payload: NormalizedPublicDemoRequest): string {
  return sha256([
    payload.email,
    payload.company.toLowerCase(),
    payload.name.toLowerCase(),
    payload.message.toLowerCase(),
    payload.planInterest?.toLowerCase() ?? "",
    payload.source.toLowerCase()
  ].join("\n"));
}

function fingerprintForRejectedPayload(payload: PublicDemoRequestPayload): string {
  return sha256(JSON.stringify({
    company: normalizeString(payload.company, 160).toLowerCase(),
    email: normalizeEmail(payload.email),
    message: normalizeString(payload.message, 1200).toLowerCase(),
    name: normalizeString(payload.name, 120).toLowerCase(),
    planInterest: normalizeString(payload.planInterest, 80).toLowerCase(),
    source: normalizeString(payload.source, 80).toLowerCase()
  }));
}

function hashOptional(value: unknown): string | null {
  const normalized = normalizeString(value, 1024);
  return normalized ? sha256(normalized) : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(value: unknown): string {
  return normalizeString(value, 254).toLowerCase();
}

function normalizeString(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function traceIdFor(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(SERVICE, operation);
}

function apiMeta(meta: Record<string, unknown>): Record<string, unknown> {
  return {
    apiVersion: "v1",
    source: "api-gateway",
    ...meta
  };
}
