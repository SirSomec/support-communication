import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { makeAuditId } from "./backend-ids.js";
import { BillingRepository } from "../billing/billing.repository.js";
import {
  IdentityRepository,
  hashPasswordCredential,
  type IdentityRbacRoleGrant,
  type IdentityTenantUser
} from "./identity.repository.js";
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
  employees?: Array<{
    email?: string;
    name?: string;
    role?: string;
    team?: string;
  }>;
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
    role: string;
    tenantId: string;
  };
  defaultWorkspaceIds: string[];
  embedSnippet: string;
  operator: {
    email: string;
    id: string;
    name: string;
    role: string;
  };
  publicApiKey: string;
  roleGrants: IdentityRbacRoleGrant[];
  session: {
    accessToken: string;
    expiresAt: string;
    refreshToken: string;
  };
  tenant: {
    id: string;
    name: string;
    planId: string;
    region: string;
    slug: string;
    status: "trial" | "active";
  };
  tenantId: string;
}

export class TenantProvisionService {
  constructor(
    private readonly identityRepository = IdentityRepository.default(),
    private readonly billingRepository = BillingRepository.default(),
    private readonly integrationRepository = IntegrationRepository.default()
  ) {}

  async provisionTenant(
    payload: TenantProvisionPayload = {},
    request: Partial<ServiceAdminRequest> = {}
  ): Promise<BackendEnvelope<TenantProvisionData | Record<string, never>>> {
    const traceId = identityTraceId(SERVICE, "provisionTenant");
    const tenantName = String(payload.tenant?.name ?? "").trim();
    const tenantSlug = normalizeSlug(payload.tenant?.slug);
    const tenantRegion = String(payload.tenant?.region ?? "").trim() || "ru-1";
    const adminName = String(payload.admin?.name ?? "").trim();
    const adminEmail = String(payload.admin?.email ?? "").trim().toLowerCase();
    const adminPassword = String(payload.admin?.password ?? "");
    const channelDomain = String(payload.channel?.domain ?? "").trim();

    if (!tenantName || !tenantSlug || !adminName || !adminEmail || !adminPassword) {
      return invalidProvision(traceId, "tenant_provision_payload_invalid", "Tenant, admin email/name, and admin password are required.");
    }

    if (channelDomain && !isValidChannelDomain(channelDomain)) {
      return invalidProvision(traceId, "tenant_provision_channel_domain_invalid", "Channel domain must be a valid hostname.");
    }

    const tenantId = `tenant-${tenantSlug}`;
    if (await this.identityRepository.findTenant(tenantId)) {
      return invalidProvision(traceId, "tenant_slug_duplicate", "Tenant slug is already in use.");
    }

    const existingAdmin = await this.identityRepository.findTenantUserByEmail(adminEmail);
    if (existingAdmin) {
      return invalidProvision(traceId, "tenant_admin_email_duplicate", "Admin email is already assigned to another tenant.");
    }

    const billingStatus = payload.plan?.trial ? "trial" : "active";
    const planId = String(payload.plan?.id ?? "trial").trim() || "trial";
    const defaultWorkspaceIds = [`ws-${tenantSlug}-dialogs`, `ws-${tenantSlug}-settings`];
    const compensation: Array<() => Promise<void>> = [];

    try {
      await this.identityRepository.saveTenant({
        activeUsers: 1,
        arr: 0,
        domains: channelDomain ? [channelDomain] : [],
        flags: [],
        healthScore: 100,
        id: tenantId,
        incidentIds: [],
        lastSeenAt: new Date().toISOString(),
        legalName: tenantName,
        monthlyRevenue: 0,
        name: tenantName,
        notes: "Provisioned through onboarding.",
        owner: adminName,
        ownerEmail: adminEmail,
        planId,
        region: tenantRegion,
        sla: 100,
        status: billingStatus,
        users: 1,
        workspaces: defaultWorkspaceIds.length
      });
      compensation.push(async () => {
        void tenantId;
      });

      await this.billingRepository.saveTenant({
        arr: 0,
        healthScore: 100,
        id: tenantId,
        monthlyRevenue: 0,
        name: tenantName,
        owner: adminName,
        planId,
        region: tenantRegion,
        sla: "99.9",
        status: billingStatus,
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
        workspaces: defaultWorkspaceIds.length
      });

      const user: IdentityTenantUser = {
        device: "Provisioned during onboarding",
        email: adminEmail,
        id: `usr-${randomUUID()}`,
        inviteStatus: "accepted",
        lastActiveAt: new Date().toISOString(),
        mfa: "disabled",
        name: adminName,
        risk: "low",
        role: "Owner",
        sessions: 0,
        status: "active",
        supportNotes: "Created by tenant onboarding.",
        tenantId
      };
      await this.identityRepository.saveTenantUser(user);

      await this.identityRepository.savePasswordCredential({
        algorithm: "scrypt",
        email: adminEmail,
        hash: hashPasswordCredential(adminPassword),
        subjectId: user.id,
        updatedAt: new Date().toISOString(),
        version: 1
      });

      const activePolicy = await this.identityRepository.getActiveRbacPolicyVersion();
      const roleGrants: IdentityRbacRoleGrant[] = [];
      if (activePolicy) {
        const grant: IdentityRbacRoleGrant = {
          action: "*",
          createdAt: new Date().toISOString(),
          createdBy: request.serviceAdminContext?.actor.id ?? "service-admin",
          effect: "allow",
          id: `grant_${randomUUID()}`,
          policyVersionId: activePolicy.id,
          resource: "tenant",
          roleKey: "owner",
          tenantId,
          traceId
        };
        await this.identityRepository.recordRbacRoleGrant(grant);
        roleGrants.push(grant);
      }

      for (const employee of payload.employees ?? []) {
        const employeeEmail = String(employee.email ?? "").trim().toLowerCase();
        if (!employeeEmail || employeeEmail === adminEmail) {
          continue;
        }

        await this.identityRepository.saveTenantUser({
          device: "Invited during onboarding",
          email: employeeEmail,
          id: `usr-${randomUUID()}`,
          inviteStatus: "pending",
          lastActiveAt: new Date().toISOString(),
          mfa: "disabled",
          name: String(employee.name ?? employeeEmail.split("@")[0] ?? "Employee"),
          risk: "low",
          role: String(employee.role ?? "Operator"),
          sessions: 0,
          status: "active",
          supportNotes: `Invited during onboarding (${String(employee.team ?? "Support")}).`,
          tenantId
        });
      }

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

      const createdSession = await this.identityRepository.createTenantOperatorSession({
        tenantId,
        userId: user.id
      });

      const domain = channelDomain || "example.test";
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
          tenantId,
          admin: {
            email: user.email,
            id: user.id,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId
          },
          operator: {
            email: user.email,
            id: user.id,
            name: user.name,
            role: user.role
          },
          session: {
            accessToken: createdSession.accessToken,
            expiresAt: createdSession.expiresAt,
            refreshToken: createdSession.refreshToken
          },
          roleGrants,
          defaultWorkspaceIds,
          publicApiKey: rawPublicApiKey,
          embedSnippet
        }
      });
    } catch (error) {
      for (const rollback of compensation.reverse()) {
        try {
          await rollback();
        } catch {
          // Best-effort compensation only.
        }
      }

      return createEnvelope({
        service: SERVICE,
        operation: "provisionTenant",
        traceId,
        status: "error",
        meta: apiMeta(),
        data: {},
        error: {
          code: "tenant_provision_failed",
          message: error instanceof Error ? error.message : "Tenant provisioning failed."
        }
      });
    }
  }
}

function invalidProvision(traceId: string, code: string, message: string) {
  return createEnvelope({
    service: SERVICE,
    operation: "provisionTenant",
    traceId,
    status: "invalid",
    meta: apiMeta(),
    data: {},
    error: { code, message }
  });
}

function normalizeSlug(input: string | undefined): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidChannelDomain(domain: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

function generateStageApiKey(): string {
  return `sk_stage_${randomBytes(18).toString("hex")}`;
}
