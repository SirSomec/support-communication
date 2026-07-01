import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "./backend-ids.js";
import { BillingRepository } from "../billing/billing.repository.js";
import { IdentityRepository, type IdentityTenantUser } from "./identity.repository.js";
import { apiMeta, identityTraceId } from "./identity-meta.js";
import { IntegrationRepository } from "../integrations/integration.repository.js";
import type { ServiceAdminRequest } from "./service-admin-auth.js";

const SERVICE = "tenantProvisionService";

interface TenantProvisionPayload {
  admin?: {
    email?: string;
    name?: string;
    password?: string;
  };
  channel?: {
    domain?: string;
    type?: string;
  };
  plan?: {
    id?: string;
    trial?: boolean;
  };
  tenant?: {
    name?: string;
    region?: string;
    slug?: string;
  };
}

export interface TenantProvisionData {
  admin: {
    email: string;
    id: string;
    name: string;
    tenantId: string;
  };
  embedSnippet: string;
  publicApiKey: string;
  tenant: {
    id: string;
    name: string;
    planId: string;
    region: string;
    slug: string;
    status: "trial" | "active";
  };
}

export class TenantProvisionService {
  constructor(
    private readonly identityRepository = IdentityRepository.default(),
    private readonly billingRepository = BillingRepository.default(),
    private readonly integrationRepository = IntegrationRepository.default()
  ) {}

  async provisionTenant(
    payload: TenantProvisionPayload = {},
    request: ServiceAdminRequest
  ): Promise<BackendEnvelope<TenantProvisionData | Record<string, never>>> {
    const traceId = identityTraceId(SERVICE, "provisionTenant");
    const tenantName = String(payload.tenant?.name ?? "").trim();
    const tenantSlug = normalizeSlug(payload.tenant?.slug);
    const tenantRegion = String(payload.tenant?.region ?? "").trim() || "ru-1";
    const adminName = String(payload.admin?.name ?? "").trim();
    const adminEmail = String(payload.admin?.email ?? "").trim().toLowerCase();
    const adminPassword = String(payload.admin?.password ?? "");

    if (!tenantName || !tenantSlug || !adminName || !adminEmail || !adminPassword) {
      return createEnvelope({
        service: SERVICE,
        operation: "provisionTenant",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: {},
        error: {
          code: "tenant_provision_payload_invalid",
          message: "Tenant, admin email/name, and admin password are required."
        }
      });
    }

    const tenantId = `tenant-${tenantSlug}`;
    const billingStatus = payload.plan?.trial ? "trial" : "active";
    const planId = String(payload.plan?.id ?? "trial").trim() || "trial";
    await this.ensureTenantState({
      id: tenantId,
      name: tenantName,
      owner: adminName,
      ownerEmail: adminEmail,
      planId,
      region: tenantRegion,
      status: billingStatus
    });

    const user = await this.upsertProvisionedAdmin({
      email: adminEmail,
      name: adminName,
      tenantId,
      traceId
    });

    await this.identityRepository.savePasswordCredential({
      algorithm: "sha256",
      email: adminEmail,
      hash: `sha256:${createHash("sha256").update(adminPassword).digest("hex")}`,
      subjectId: user.id,
      updatedAt: new Date().toISOString(),
      version: 1
    });

    const rawPublicApiKey = generateStageApiKey();
    await this.integrationRepository.savePublicApiKey({
      createdAt: new Date().toISOString(),
      environment: "stage",
      keyId: `key-${tenantSlug}-${randomUUID()}`,
      name: `${tenantName} SDK stage key`,
      owner: request.serviceAdminContext?.actor.name ?? "service-admin",
      rawSecret: rawPublicApiKey,
      scopes: ["clients:identify", "conversations:write"],
      status: "active",
      tenantId
    });

    await this.identityRepository.recordServiceAdminAuditEvent({
      action: "tenant.provision",
      actor: request.serviceAdminContext?.actor.id ?? "service-admin",
      actorName: request.serviceAdminContext?.actor.name ?? "Service Admin",
      at: new Date().toISOString(),
      id: makeAuditId("tenant_provision"),
      immutable: true,
      reason: `Provisioned tenant ${tenantId}`,
      result: "ok",
      severity: "info",
      target: tenantId,
      tenantId,
      traceId,
      userId: user.id
    });

    const domain = String(payload.channel?.domain ?? "").trim() || "example.test";
    const embedSnippet = `<script src="https://${domain}/sdk.js" data-api-key="${rawPublicApiKey}" data-tenant-id="${tenantId}" data-channel="${String(payload.channel?.type ?? "sdk").trim() || "sdk"}"></script>`;

    return createEnvelope({
      service: SERVICE,
      operation: "provisionTenant",
      traceId,
      meta: apiMeta({ tenantId }),
      data: {
        tenant: {
          id: tenantId,
          name: tenantName,
          planId,
          region: tenantRegion,
          slug: tenantSlug,
          status: billingStatus
        },
        admin: {
          email: user.email,
          id: user.id,
          name: user.name,
          tenantId: user.tenantId
        },
        publicApiKey: rawPublicApiKey,
        embedSnippet
      }
    });
  }

  private async ensureTenantState(input: {
    id: string;
    name: string;
    owner: string;
    ownerEmail: string;
    planId: string;
    region: string;
    status: "trial" | "active";
  }): Promise<void> {
    await this.identityRepository.saveTenant({
      activeUsers: 1,
      arr: 0,
      domains: [],
      flags: [],
      healthScore: 100,
      id: input.id,
      incidentIds: [],
      lastSeenAt: new Date().toISOString(),
      legalName: input.name,
      monthlyRevenue: 0,
      name: input.name,
      notes: "Provisioned through onboarding.",
      owner: input.owner,
      ownerEmail: input.ownerEmail,
      planId: input.planId,
      region: input.region,
      sla: 100,
      status: input.status,
      users: 1,
      workspaces: 1
    });

    await this.billingRepository.saveTenant({
      arr: 0,
      healthScore: 100,
      id: input.id,
      monthlyRevenue: 0,
      name: input.name,
      owner: input.owner,
      planId: input.planId,
      region: input.region,
      sla: "99.9",
      status: input.status,
      usage: {
        aiTokens: 0,
        botRuns: 0,
        channels: 1,
        operators: 1,
        reportExports: 0,
        storageGb: 0,
        webhooks: 0
      },
      users: 1,
      workspaces: 1
    });
  }

  private async upsertProvisionedAdmin(input: {
    email: string;
    name: string;
    tenantId: string;
    traceId: string;
  }): Promise<IdentityTenantUser> {
    const existing = await this.identityRepository.findTenantUserByEmail(input.email);
    if (existing) {
      const updated = await this.identityRepository.applyServiceAdminUserAction({
        action: "tenant.provision.admin",
        userId: existing.id,
        changes: {
          email: input.email,
          inviteStatus: "accepted",
          mfa: "disabled",
          name: input.name,
          role: "Owner",
          status: "active",
          tenantId: input.tenantId
        },
        auditEvent: {
          action: "tenant.provision.admin",
          actor: "service-admin",
          actorName: "Service Admin",
          at: new Date().toISOString(),
          id: makeAuditId("tenant_provision_admin"),
          immutable: true,
          reason: "Upsert tenant admin during provisioning.",
          result: "ok",
          severity: "info",
          target: existing.id,
          tenantId: input.tenantId,
          traceId: input.traceId,
          userId: existing.id
        }
      });
      return updated.user;
    }

    const user: IdentityTenantUser = {
      device: "Provisioned during onboarding",
      email: input.email,
      id: `usr-${randomUUID()}`,
      inviteStatus: "accepted",
      lastActiveAt: new Date().toISOString(),
      mfa: "disabled",
      name: input.name,
      risk: "low",
      role: "Owner",
      sessions: 0,
      status: "active",
      supportNotes: "Created by tenant onboarding.",
      tenantId: input.tenantId
    };
    return this.identityRepository.saveTenantUser(user);
  }
}

function normalizeSlug(input: string | undefined): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateStageApiKey(): string {
  return `sk_stage_${randomBytes(18).toString("hex")}`;
}
