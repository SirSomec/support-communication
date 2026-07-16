import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { BillingRepository as RuntimeBillingRepository } from "../apps/api-gateway/src/billing/billing.repository.ts";
import { bootstrapBillingState } from "../apps/api-gateway/src/billing/seed.ts";
import { changeTenantTariffFromRoute } from "../apps/api-gateway/src/billing/billing.route.ts";
import { BillingService } from "../apps/api-gateway/src/billing/billing.service.ts";
import {
  claimExpiredQuotaReservationsForWorker,
  releaseExpiredQuotaReservationForWorker
} from "../apps/api-gateway/src/billing/quota-expiration.worker.ts";
import { IdentityRepository as RuntimeIdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { bootstrapIdentityState } from "../apps/api-gateway/src/identity/seed.ts";
import { authorizeServiceAdminPolicy } from "../apps/api-gateway/src/identity/privileged-policy.ts";
import { updateTenantStatusFromRoute } from "../apps/api-gateway/src/identity/tenant.route.ts";
import { TenantService } from "../apps/api-gateway/src/identity/tenant.service.ts";
import {
  requestServiceAdminBreakGlassApprovalFromRoute,
  startServiceAdminImpersonationFromRoute
} from "../apps/api-gateway/src/service-admin/service-admin.route.ts";
import { ServiceAdminService } from "../apps/api-gateway/src/service-admin/service-admin.service.ts";
import { assertLogRecordsDoNotLeakCanonicalSecrets, canonicalSecretBearingFixtures } from "@support-communication/testing";

type BillingRepository = RuntimeBillingRepository;
const BillingRepository = {
  inMemory: () => RuntimeBillingRepository.inMemory(bootstrapBillingState())
};
type IdentityRepository = RuntimeIdentityRepository;
const IdentityRepository = {
  inMemory: () => RuntimeIdentityRepository.inMemory(bootstrapIdentityState())
};

describe("phase 8 billing, quotas and service-admin backend contracts", () => {
  beforeEach(() => {
    RuntimeBillingRepository.useDefault(RuntimeBillingRepository.inMemory(bootstrapBillingState()));
    RuntimeIdentityRepository.useDefault(RuntimeIdentityRepository.inMemory(bootstrapIdentityState()));
  });
  it("returns tariff catalog and previews tariff changes with confirmation text", async () => {
    const billing = new BillingService();

    const tariffs = await billing.fetchTariffs();
    assert.equal(tariffs.service, "billingService");
    assert.equal(tariffs.status, "ok");
    assert.equal(tariffs.data.currency, "RUB");
    assert.equal(tariffs.data.previewRequired, true);
    assert.ok(tariffs.data.items.some((tariff) => tariff.id === "starter"));

    const missingReason = await billing.previewTariffChange({
      tenantId: "tenant-volga",
      nextPlanId: "starter",
      reason: ""
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "reason_required");

    const preview = await billing.previewTariffChange({
      tenantId: "tenant-volga",
      nextPlanId: "starter",
      reason: "QA downgrade preview"
    });
    assert.equal(preview.status, "ok");
    assert.equal(preview.data.approval.required, true);
    assert.equal(preview.data.confirmation.required, true);
    assert.match(preview.data.confirmation.expectedText, /^CHANGE tenant-volga TO starter$/);
    assert.equal(preview.data.capacityCheck.users, "over_limit");
    assert.equal(preview.data.capacityCheck.workspaces, "over_limit");
  });

  it("exposes the canonical tariff catalog through the public read-only controller", async () => {
    const controllerSource = readFileSync(
      join(process.cwd(), "apps/api-gateway/src/billing/billing.controller.ts"),
      "utf8"
    );
    const moduleSource = readFileSync(join(process.cwd(), "apps/api-gateway/src/billing/billing.module.ts"), "utf8");
    const response = await new BillingService().fetchTariffs();

    assert.match(controllerSource, /@Controller\("public\/catalog"\)[\s\S]*@Get\("tariffs"\)/);
    assert.match(moduleSource, /controllers:\s*\[[^\]]*PublicBillingCatalogController/);
    assert.equal(response.status, "ok");
    assert.equal(response.data.currency, "RUB");
    assert.deepEqual(response.data.items.map((tariff) => tariff.id), ["starter", "business", "scale", "enterprise"]);
  });

  it("changes tenant tariff only with reason, explicit confirmation and audit metadata", async () => {
    const billing = new BillingService();

    const blocked = await billing.changeTenantTariff({
      tenantId: "tenant-volga",
      nextPlanId: "starter",
      reason: "QA downgrade preview",
      confirmed: true,
      confirmationText: "wrong"
    });
    assert.equal(blocked.status, "invalid");
    assert.equal(blocked.error?.code, "confirmation_required");
    assert.equal(blocked.data.applied, false);
    assert.match(blocked.data.auditEvent.id, /^evt_billing_tariff_/);
    assert.equal(blocked.data.auditEvent.immutable, true);

    const applied = await billing.changeTenantTariff({
      tenantId: "tenant-lumen",
      nextPlanId: "business",
      reason: "Trial conversion approved",
      confirmed: true,
      confirmationText: "CHANGE tenant-lumen TO business"
    });
    assert.equal(applied.status, "ok");
    assert.equal(applied.data.applied, true);
    assert.equal(applied.data.queue, "billing-sync");
    assert.match(applied.data.billingJobId, /^billing_sync_/);
    assert.equal(applied.data.auditEvent.action, "tenant.tariff.change");
  });

  it("consumes active RBAC policy before service-admin billing writes", async () => {
    const billingRepository = BillingRepository.inMemory();
    const identityRepository = IdentityRepository.inMemory();
    const billing = new BillingService(billingRepository);

    const denied = await changeTenantTariffFromRoute(billing, {
      confirmed: true,
      confirmationText: "CHANGE tenant-lumen TO business",
      nextPlanId: "business",
      reason: "Trial conversion approved",
      tenantId: "tenant-lumen"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-employee-billing",
          name: "Employee Billing Attempt"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["billing.change"],
        roles: ["employee"],
        sessionId: "sess-employee-billing"
      }
    }, identityRepository);

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "permission_denied");
    assert.equal(denied.data.action, "billing.change");
    assert.equal(denied.data.resource, "billing");
    assert.equal(denied.data.tenantId, "tenant-lumen");
    assert.equal((await billingRepository.findTenant("tenant-lumen"))?.planId, "starter");
    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "billing.change");
    assert.equal(denials[0].actorId, "svc-employee-billing");

    const allowed = await changeTenantTariffFromRoute(billing, {
      confirmed: true,
      confirmationText: "CHANGE tenant-lumen TO business",
      nextPlanId: "business",
      reason: "Trial conversion approved",
      tenantId: "tenant-lumen"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-admin-billing",
          name: "Admin Billing Writer"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["billing.change"],
        roles: ["admin"],
        sessionId: "sess-admin-billing"
      }
    }, identityRepository);

    assert.equal(allowed.status, "ok");
    assert.equal(allowed.data.applied, true);
    assert.equal(allowed.data.auditEvent.actor, "svc-admin-billing");
    assert.equal((await billingRepository.findTenant("tenant-lumen"))?.planId, "business");
  });

  it("records immutable RBAC denial audit for denied service-admin billing writes", async () => {
    const billingRepository = BillingRepository.inMemory();
    const identityRepository = IdentityRepository.inMemory();
    const billing = new BillingService(billingRepository);

    const denied = await changeTenantTariffFromRoute(billing, {
      confirmed: true,
      confirmationText: "CHANGE tenant-lumen TO business",
      nextPlanId: "business",
      reason: "Trial conversion approved",
      tenantId: "tenant-lumen"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-billing-denial-audit",
          name: "Billing Denial Audit"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["billing.change"],
        roles: ["employee"],
        sessionId: "sess-billing-denial-audit"
      }
    }, identityRepository);

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "permission_denied");
    assert.equal((await billingRepository.findTenant("tenant-lumen"))?.planId, "starter");

    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "billing.change");
    assert.equal(denials[0].actorId, "svc-billing-denial-audit");
    assert.equal(denials[0].immutable, true);
    assert.equal(denials[0].policyVersionId, "rbac-policy-default");
    assert.equal(denials[0].resource, "billing");
    assert.equal(denials[0].roleKey, "employee");
    assert.equal(denials[0].tenantId, "tenant-lumen");
  });

  it("consumes active RBAC policy before service-admin tenant writes", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const tenants = new TenantService(identityRepository);

    const denied = await updateTenantStatusFromRoute(tenants, {
      confirmed: true,
      reason: "Restrict tenant after billing risk review",
      status: "restricted",
      tenantId: "tenant-lumen"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-employee-tenant",
          name: "Employee Tenant Attempt"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["tenants.manage"],
        roles: ["employee"],
        sessionId: "sess-employee-tenant"
      }
    }, identityRepository);

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "permission_denied");
    assert.equal(denied.data.action, "tenants.manage");
    assert.equal(denied.data.resource, "tenant");
    assert.equal(denied.data.tenantId, "tenant-lumen");
    assert.equal((await identityRepository.findTenant("tenant-lumen"))?.status, "trial");
    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "tenants.manage");
    assert.equal(denials[0].actorId, "svc-employee-tenant");

    const allowed = await updateTenantStatusFromRoute(tenants, {
      confirmed: true,
      reason: "Restrict tenant after billing risk review",
      status: "restricted",
      tenantId: "tenant-lumen"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-admin-tenant",
          name: "Admin Tenant Writer"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["tenants.manage"],
        roles: ["admin"],
        sessionId: "sess-admin-tenant"
      }
    }, identityRepository);

    assert.equal(allowed.status, "ok");
    assert.equal(allowed.data.auditEvent.tenantId, "tenant-lumen");
    assert.equal((allowed.data.auditEvent as Record<string, unknown>).to, "restricted");
    assert.equal((await identityRepository.findTenant("tenant-lumen"))?.status, "restricted");
  });

  it("records immutable RBAC denial audit for denied service-admin tenant writes", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const tenants = new TenantService(identityRepository);

    const denied = await updateTenantStatusFromRoute(tenants, {
      confirmed: true,
      reason: "Restrict tenant after billing risk review",
      status: "restricted",
      tenantId: "tenant-lumen"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-tenant-denial-audit",
          name: "Tenant Denial Audit"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["tenants.manage"],
        roles: ["employee"],
        sessionId: "sess-tenant-denial-audit"
      }
    }, identityRepository);

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "permission_denied");
    assert.equal((await identityRepository.findTenant("tenant-lumen"))?.status, "trial");

    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "tenants.manage");
    assert.equal(denials[0].actorId, "svc-tenant-denial-audit");
    assert.equal(denials[0].immutable, true);
    assert.equal(denials[0].policyVersionId, "rbac-policy-default");
    assert.equal(denials[0].resource, "tenant");
    assert.equal(denials[0].roleKey, "employee");
    assert.equal(denials[0].tenantId, "tenant-lumen");
  });

  it("consumes active RBAC policy before service-admin impersonation writes", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(identityRepository);

    const denied = await startServiceAdminImpersonationFromRoute(support, {
      confirmed: true,
      durationMinutes: 15,
      reason: "Customer approved webhook replay check",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-employee-impersonation",
          name: "Employee Impersonation Attempt"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["impersonation.start"],
        roles: ["employee"],
        sessionId: "sess-employee-impersonation"
      }
    }, identityRepository);

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "permission_denied");
    assert.equal(denied.data.action, "impersonation.start");
    assert.equal(denied.data.resource, "impersonation");
    assert.equal(denied.data.tenantId, "tenant-lumen");
    assert.equal(await identityRepository.findActiveServiceAdminImpersonation({
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }), undefined);
    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "impersonation.start");
    assert.equal(denials[0].actorId, "svc-employee-impersonation");

    const allowed = await startServiceAdminImpersonationFromRoute(support, {
      confirmed: true,
      durationMinutes: 15,
      reason: "Customer approved webhook replay check",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-admin-impersonation",
          name: "Admin Impersonation Writer"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["impersonation.start"],
        roles: ["admin"],
        sessionId: "sess-admin-impersonation"
      }
    }, identityRepository);

    assert.equal(allowed.status, "ok");
    assert.equal(allowed.data.auditEvent.actor, "svc-admin-impersonation");
    assert.equal(allowed.data.impersonation.tenantId, "tenant-lumen");
  });

  it("records immutable RBAC denial audit for denied service-admin impersonation writes", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(identityRepository);

    const denied = await startServiceAdminImpersonationFromRoute(support, {
      confirmed: true,
      durationMinutes: 15,
      reason: "Customer approved webhook replay check",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-impersonation-denial-audit",
          name: "Impersonation Denial Audit"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["impersonation.start"],
        roles: ["employee"],
        sessionId: "sess-impersonation-denial-audit"
      }
    }, identityRepository);

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "permission_denied");
    assert.equal(await identityRepository.findActiveServiceAdminImpersonation({
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }), undefined);

    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "impersonation.start");
    assert.equal(denials[0].actorId, "svc-impersonation-denial-audit");
    assert.equal(denials[0].immutable, true);
    assert.equal(denials[0].policyVersionId, "rbac-policy-default");
    assert.equal(denials[0].resource, "impersonation");
    assert.equal(denials[0].roleKey, "employee");
    assert.equal(denials[0].tenantId, "tenant-lumen");
  });

  it("consumes active RBAC policy before service-admin break-glass writes", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(identityRepository);

    const denied = await requestServiceAdminBreakGlassApprovalFromRoute(support, {
      confirmed: true,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-employee-break-glass",
          name: "Employee Break Glass Attempt"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["break-glass.request"],
        roles: ["employee"],
        sessionId: "sess-employee-break-glass"
      }
    }, identityRepository);

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "permission_denied");
    assert.equal(denied.data.action, "break-glass.request");
    assert.equal(denied.data.resource, "break-glass");
    assert.equal(denied.data.tenantId, "tenant-lumen");
    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "break-glass.request");
    assert.equal(denials[0].actorId, "svc-employee-break-glass");

    const allowed = await requestServiceAdminBreakGlassApprovalFromRoute(support, {
      confirmed: true,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-admin-break-glass",
          name: "Admin Break Glass Writer"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["break-glass.request"],
        roles: ["admin"],
        sessionId: "sess-admin-break-glass"
      }
    }, identityRepository);

    assert.equal(allowed.status, "ok");
    assert.equal(allowed.data.approval.status, "pending");
    assert.equal(allowed.data.auditEvent.actor, "svc-admin-break-glass");
    assert.equal(allowed.data.approval.tenantId, "tenant-lumen");
  });

  it("records immutable RBAC denial audit for denied service-admin break-glass writes", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(identityRepository);

    const denied = await requestServiceAdminBreakGlassApprovalFromRoute(support, {
      confirmed: true,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-break-glass-denial-audit",
          name: "Break Glass Denial Audit"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["break-glass.request"],
        roles: ["employee"],
        sessionId: "sess-break-glass-denial-audit"
      }
    }, identityRepository);

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "permission_denied");

    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "break-glass.request");
    assert.equal(denials[0].actorId, "svc-break-glass-denial-audit");
    assert.equal(denials[0].immutable, true);
    assert.equal(denials[0].policyVersionId, "rbac-policy-default");
    assert.equal(denials[0].resource, "break-glass");
    assert.equal(denials[0].roleKey, "employee");
    assert.equal(denials[0].tenantId, "tenant-lumen");
  });

  it("fails closed for unknown service-admin privileged policy actions", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const denied = await authorizeServiceAdminPolicy({
      action: "billing.drop-database",
      identityRepository,
      request: {
        headers: {},
        serviceAdminContext: {
          actor: {
            id: "svc-admin-unknown-action",
            name: "Admin Unknown Action"
          },
          currentTenantId: "tenant-lumen",
          permissions: ["*"],
          roles: ["admin"],
          sessionId: "sess-admin-unknown-action"
        }
      },
      resource: "billing",
      tenantId: "tenant-lumen"
    });

    assert.ok(denied);
    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "service_admin_action_unrecognized");
    assert.equal(denied.data.action, "billing.drop-database");
    assert.equal(denied.data.resource, "billing");
    assert.equal(denied.data.tenantId, "tenant-lumen");
    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "billing.drop-database");
    assert.equal(denials[0].actorId, "svc-admin-unknown-action");
  });

  it("fails closed for unknown service-admin privileged policy roles", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const denied = await authorizeServiceAdminPolicy({
      action: "billing.change",
      identityRepository,
      request: {
        headers: {},
        serviceAdminContext: {
          actor: {
            id: "svc-admin-unknown-role",
            name: "Unknown Role Actor"
          },
          currentTenantId: "tenant-lumen",
          permissions: ["billing.change"],
          roles: ["contractor-shadow"],
          sessionId: "sess-admin-unknown-role"
        }
      },
      resource: "billing",
      tenantId: "tenant-lumen"
    });

    assert.ok(denied);
    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "role_unrecognized");
    assert.equal(denied.data.action, "billing.change");
    assert.equal(denied.data.role, "unknown");
    assert.equal(denied.data.tenantId, "tenant-lumen");
    const denials = await identityRepository.listPermissionDenialEvents({ tenantId: "tenant-lumen" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "billing.change");
    assert.equal(denials[0].actorId, "svc-admin-unknown-role");
    assert.equal(denials[0].roleKey, null);
  });

  it("wires service-admin billing controller writes through the privileged policy resolver", () => {
    const source = readFileSync("apps/api-gateway/src/billing/billing.controller.ts", "utf8");

    assert.match(source, /import \{ changeTenantTariffFromRoute \} from "\.\/billing\.route\.js";/);
    assert.match(source, /changeTenantTariff\([\s\S]*return changeTenantTariffFromRoute\(this\.billingService,\s*\{\s*\.\.\.payload,\s*tenantId\s*\},\s*request\s*\);/);
    assert.match(source, /patchTenantTariff\([\s\S]*return changeTenantTariffFromRoute\(this\.billingService,\s*\{\s*\.\.\.payload,\s*tenantId\s*\},\s*request\s*\);/);
  });

  it("wires service-admin tenant controller writes through the privileged policy resolver", () => {
    const source = readFileSync("apps/api-gateway/src/identity/tenant.controller.ts", "utf8");

    assert.match(source, /import \{ updateTenantStatusFromRoute \} from "\.\/tenant\.route\.js";/);
    assert.match(source, /updateTenantStatus\([\s\S]*@Req\(\) request: ServiceAdminRequest[\s\S]*return updateTenantStatusFromRoute\(this\.tenantService,\s*\{\s*\.\.\.payload,\s*tenantId\s*\},\s*request\s*\);/);
  });

  it("wires service-admin impersonation controller writes through the privileged policy resolver", () => {
    const source = readFileSync("apps/api-gateway/src/service-admin/service-admin.controller.ts", "utf8");

    assert.match(source, /import \{ requestServiceAdminBreakGlassApprovalFromRoute, startServiceAdminImpersonationFromRoute \} from "\.\/service-admin\.route\.js";/);
    assert.match(source, /startImpersonation\(@Body\(\) payload: ImpersonationBody, @Req\(\) request: ServiceAdminRequest\)[\s\S]*return startServiceAdminImpersonationFromRoute\(this\.serviceAdminService,\s*payload,\s*request\s*\);/);
    assert.match(source, /startImpersonationAlias\(@Body\(\) payload: ImpersonationBody, @Req\(\) request: ServiceAdminRequest\)[\s\S]*return startServiceAdminImpersonationFromRoute\(this\.serviceAdminService,\s*payload,\s*request\s*\);/);
  });

  it("wires service-admin break-glass controller writes through the privileged policy resolver", () => {
    const source = readFileSync("apps/api-gateway/src/service-admin/service-admin.controller.ts", "utf8");

    assert.match(source, /requestBreakGlassApproval\(@Body\(\) payload: BreakGlassBody, @Req\(\) request: ServiceAdminRequest\)[\s\S]*return requestServiceAdminBreakGlassApprovalFromRoute\(this\.serviceAdminService,\s*payload,\s*request\s*\);/);
    assert.match(source, /requestBreakGlassApprovalAlias\(@Body\(\) payload: BreakGlassBody, @Req\(\) request: ServiceAdminRequest\)[\s\S]*return requestServiceAdminBreakGlassApprovalFromRoute\(this\.serviceAdminService,\s*payload,\s*request\s*\);/);
  });

  it("persists billing tariff and quota audit evidence as immutable mutation records", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);

    const applied = await billing.changeTenantTariff({
      tenantId: "tenant-lumen",
      nextPlanId: "business",
      reason: "Trial conversion approved",
      confirmed: true,
      confirmationText: "CHANGE tenant-lumen TO business"
    });
    assert.equal(applied.status, "ok");

    const jobs = await repository.listBillingSyncJobs();
    const tariffJob = jobs.find((job) => job.id === applied.data.billingJobId);
    assert.ok(tariffJob);
    assert.equal((tariffJob.payload.auditEvent as Record<string, unknown>).id, applied.data.auditEvent.id);
    assert.equal((tariffJob.payload.auditEvent as Record<string, unknown>).action, "tenant.tariff.change");
    assert.equal((tariffJob.payload.auditEvent as Record<string, unknown>).immutable, true);
    assert.equal((tariffJob.payload.auditEvent as Record<string, unknown>).tenantId, "tenant-lumen");
    assert.equal((tariffJob.payload.auditEvent as Record<string, unknown>).approvalId, null);

    const quota = await billing.checkQuota({
      idempotencyKey: "quota-immutable-audit-lumen-operators",
      mode: "record",
      requested: 1,
      resource: "operators",
      tenantId: "tenant-lumen"
    });
    assert.equal(quota.status, "ok");

    const ledger = await repository.findQuotaLedgerEntryByIdempotencyKey("quota-immutable-audit-lumen-operators");
    assert.ok(ledger);
    assert.ok(ledger.auditEvent);
    assert.equal(ledger.auditEvent.id, quota.data.auditEvent.id);
    assert.equal(ledger.auditEvent.action, "quota.record");
    assert.equal(ledger.auditEvent.immutable, true);
    assert.equal(ledger.auditEvent.tenantId, "tenant-lumen");
  });

  it("returns an error envelope when tariff persistence fails after validation", async () => {
    const repository = BillingRepository.inMemory();
    repository.applyTenantTariffChange = async () => {
      throw new Error("postgres unavailable");
    };
    const billing = new BillingService(repository);

    const failed = await billing.changeTenantTariff({
      tenantId: "tenant-lumen",
      nextPlanId: "business",
      reason: "Trial conversion approved",
      confirmed: true,
      confirmationText: "CHANGE tenant-lumen TO business"
    });

    assert.equal(failed.status, "error");
    assert.equal(failed.error?.code, "billing_persistence_failed");
    assert.equal(failed.data.applied, false);
    assert.equal(failed.data.tenantId, "tenant-lumen");
    assert.equal(failed.data.queue, "billing-sync");
  });

  it("blocks over-limit tariff downgrades until approval is provided", async () => {
    const billing = new BillingService();

    const blocked = await billing.changeTenantTariff({
      tenantId: "tenant-volga",
      nextPlanId: "starter",
      reason: "Customer downgrade requested",
      confirmed: true,
      confirmationText: "CHANGE tenant-volga TO starter"
    });
    assert.equal(blocked.status, "invalid");
    assert.equal(blocked.error?.code, "approval_required");
    assert.equal(blocked.data.applied, false);
    assert.equal(blocked.data.approval.required, true);
    assert.equal(blocked.data.capacityCheck.users, "over_limit");
  });

  it("applies over-limit tariff changes only after an approved tenant-scoped billing approval decision", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const approval = await repository.saveBillingApproval({
      approvalId: "tariff-runtime-approval",
      createdAt: "2026-07-01T00:00:00.000Z",
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionReason: null,
      expiresAt: "2099-07-01T00:00:00.000Z",
      reason: "Approve downgrade after account owner review",
      requestedBy: "svc-admin-1",
      requestedByName: "Service Admin",
      requestFingerprint: "sha256:tariff-runtime-approval",
      status: "pending" as const,
      subjectId: "tenant-volga:scale:starter",
      subjectType: "tariff_change" as const,
      tenantId: "tenant-volga",
      traceId: "trace-tariff-runtime-approval",
      updatedAt: "2026-07-01T00:00:00.000Z"
    });

    const pending = await billing.changeTenantTariff({
      approvalId: approval.approvalId,
      tenantId: "tenant-volga",
      nextPlanId: "starter",
      reason: "Customer downgrade requested",
      confirmed: true,
      confirmationText: "CHANGE tenant-volga TO starter"
    });
    assert.equal(pending.status, "invalid");
    assert.equal(pending.error?.code, "approval_not_approved");
    assert.equal(pending.data.applied, false);

    const decided = await repository.decideBillingApproval({
      approvalId: approval.approvalId,
      decidedAt: "2026-07-01T00:10:00.000Z",
      decidedBy: "svc-admin-2",
      decidedByName: "Approver",
      decisionReason: "Approved after usage exception review",
      status: "approved",
      tenantId: "tenant-volga",
      traceId: "trace-tariff-runtime-approval-decision"
    });

    const applied = await billing.changeTenantTariff({
      approvalId: decided.approvalId,
      tenantId: "tenant-volga",
      nextPlanId: "starter",
      reason: "Customer downgrade requested",
      confirmed: true,
      confirmationText: "CHANGE tenant-volga TO starter"
    });
    assert.equal(applied.status, "ok");
    assert.equal(applied.data.applied, true);
    assert.equal(applied.data.tenant.planId, "starter");
    assert.equal((applied.data.auditEvent as Record<string, unknown>).approvalId, approval.approvalId);
  });

  it("enforces quota checks with clear denial envelopes", async () => {
    const billing = new BillingService();

    const allowed = await billing.checkQuota({
      tenantId: "tenant-lumen",
      resource: "operators",
      requested: 1
    });
    assert.equal(allowed.status, "ok");
    assert.equal(allowed.data.decision, "allow");
    assert.equal(allowed.data.resource, "operators");

    const denied = await billing.checkQuota({
      tenantId: "tenant-lumen",
      resource: "webhooks",
      requested: 1000000
    });
    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "quota_exceeded");
    assert.equal(denied.data.decision, "deny");
    assert.equal(denied.data.limit > 0, true);

    const deniedStringAmount = await billing.checkQuota({
      tenantId: "tenant-lumen",
      resource: "webhooks",
      requested: "1000000" as unknown as number
    });
    assert.equal(deniedStringAmount.status, "denied");
    assert.equal(deniedStringAmount.error?.code, "quota_exceeded");
  });

  it("reserves and commits quota with idempotent usage mutation", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);

    const before = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const beforeWebhooks = (before.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "webhooks");
    assert.ok(beforeWebhooks);

    const reserved = await billing.reserveQuota({
      idempotencyKey: "reserve-lumen-webhooks-10",
      requested: 10,
      resource: "webhooks",
      tenantId: "tenant-lumen"
    });
    assert.equal(reserved.status, "ok");
    assert.equal(reserved.data.duplicate, false);
    assert.equal(reserved.data.status, "reserved");
    assert.equal((reserved.data.auditEvent as Record<string, unknown>).action, "quota.reserve");
    assert.equal((reserved.data.auditEvent as Record<string, unknown>).immutable, true);
    assert.equal((reserved.data.auditEvent as Record<string, unknown>).tenantId, "tenant-lumen");
    assert.match(reserved.data.reservationId, /^quota_reservation_/);

    const duplicateReserve = await billing.reserveQuota({
      idempotencyKey: "reserve-lumen-webhooks-10",
      requested: 10,
      resource: "webhook",
      tenantId: "tenant-lumen"
    });
    assert.equal(duplicateReserve.status, "ok");
    assert.equal(duplicateReserve.data.duplicate, true);
    assert.equal(duplicateReserve.data.reservationId, reserved.data.reservationId);
    assert.equal((duplicateReserve.data.auditEvent as Record<string, unknown>).id, (reserved.data.auditEvent as Record<string, unknown>).id);

    const committed = await billing.commitQuotaReservation({
      idempotencyKey: "commit-lumen-webhooks-10",
      reservationId: reserved.data.reservationId as string
    });
    assert.equal(committed.status, "ok");
    assert.equal(committed.data.duplicate, false);
    assert.equal(committed.data.status, "committed");
    assert.equal((committed.data.auditEvent as Record<string, unknown>).action, "quota.commit");
    assert.equal((committed.data.auditEvent as Record<string, unknown>).immutable, true);
    assert.equal((committed.data.auditEvent as Record<string, unknown>).tenantId, "tenant-lumen");
    assert.equal(committed.data.usedAfter, Number(beforeWebhooks.used) + 10);

    const duplicateCommit = await billing.commitQuotaReservation({
      idempotencyKey: "commit-lumen-webhooks-10",
      reservationId: reserved.data.reservationId as string
    });
    assert.equal(duplicateCommit.status, "ok");
    assert.equal(duplicateCommit.data.duplicate, true);
    assert.equal((duplicateCommit.data.auditEvent as Record<string, unknown>).id, (committed.data.auditEvent as Record<string, unknown>).id);
    assert.equal(duplicateCommit.data.usedAfter, committed.data.usedAfter);

    const reserveReplayAfterCommit = await billing.reserveQuota({
      idempotencyKey: "reserve-lumen-webhooks-10",
      requested: 10,
      resource: "webhooks",
      tenantId: "tenant-lumen"
    });
    assert.equal(reserveReplayAfterCommit.status, "ok");
    assert.equal(reserveReplayAfterCommit.data.duplicate, true);
    assert.equal((reserveReplayAfterCommit.data.auditEvent as Record<string, unknown>).id, (reserved.data.auditEvent as Record<string, unknown>).id);
    assert.equal((reserveReplayAfterCommit.data.auditEvent as Record<string, unknown>).action, "quota.reserve");

    const after = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const afterWebhooks = (after.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "webhooks");
    assert.equal(afterWebhooks?.used, Number(beforeWebhooks.used) + 10);

    const releasedCommitted = await billing.releaseQuotaReservation({
      idempotencyKey: "release-lumen-webhooks-10",
      reservationId: reserved.data.reservationId as string
    });
    assert.equal(releasedCommitted.status, "conflict");
    assert.equal(releasedCommitted.error?.code, "quota_reservation_already_committed");
  });

  it("releases reserved quota without mutating usage", async () => {
    const billing = new BillingService(BillingRepository.inMemory());

    const before = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const beforeAi = (before.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "ai");
    assert.ok(beforeAi);

    const reserved = await billing.reserveQuota({
      idempotencyKey: "reserve-lumen-ai-release",
      requested: 1000,
      resource: "ai",
      tenantId: "tenant-lumen"
    });
    assert.equal(reserved.status, "ok");

    const released = await billing.releaseQuotaReservation({
      idempotencyKey: "release-lumen-ai-release",
      reservationId: reserved.data.reservationId as string
    });
    assert.equal(released.status, "ok");
    assert.equal(released.data.status, "released");
    assert.equal((released.data.auditEvent as Record<string, unknown>).action, "quota.release");
    assert.equal((released.data.auditEvent as Record<string, unknown>).immutable, true);
    assert.equal((released.data.auditEvent as Record<string, unknown>).tenantId, "tenant-lumen");

    const duplicateRelease = await billing.releaseQuotaReservation({
      idempotencyKey: "release-lumen-ai-release",
      reservationId: reserved.data.reservationId as string
    });
    assert.equal(duplicateRelease.status, "ok");
    assert.equal(duplicateRelease.data.duplicate, true);
    assert.equal((duplicateRelease.data.auditEvent as Record<string, unknown>).id, (released.data.auditEvent as Record<string, unknown>).id);

    const reserveReplayAfterRelease = await billing.reserveQuota({
      idempotencyKey: "reserve-lumen-ai-release",
      requested: 1000,
      resource: "ai",
      tenantId: "tenant-lumen"
    });
    assert.equal(reserveReplayAfterRelease.status, "ok");
    assert.equal(reserveReplayAfterRelease.data.duplicate, true);
    assert.equal((reserveReplayAfterRelease.data.auditEvent as Record<string, unknown>).id, (reserved.data.auditEvent as Record<string, unknown>).id);
    assert.equal((reserveReplayAfterRelease.data.auditEvent as Record<string, unknown>).action, "quota.reserve");

    const after = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const afterAi = (after.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "ai");
    assert.equal(afterAi?.used, beforeAi.used);
  });

  it("claims expired quota reservations with a bounded repository lease", async () => {
    const repository = BillingRepository.inMemory();
    const baseReservation = {
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T03:00:00.000Z",
      expiresAt: "2026-07-01T03:10:00.000Z",
      idempotencyKey: "reserve-expired-lease",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 5,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "webhooks",
      status: "reserved" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-expired-lease",
      updatedAt: "2026-07-01T03:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    };

    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_expired_unlocked"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_expired_stale_locked",
      idempotencyKey: "reserve-expired-stale-lease",
      lockedAt: "2026-07-01T03:00:00.000Z"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      expiresAt: "2026-07-01T03:40:00.000Z",
      id: "quota_reservation_not_expired",
      idempotencyKey: "reserve-not-expired-lease"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_fresh_locked",
      idempotencyKey: "reserve-fresh-locked-lease",
      lockedAt: "2026-07-01T03:29:30.000Z"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_expired_committed",
      idempotencyKey: "reserve-expired-committed-lease",
      status: "committed" as const
    });

    const claimed = await repository.claimExpiredQuotaReservations({
      leaseTimeoutMs: 60_000,
      limit: 2,
      now: "2026-07-01T03:30:00.000Z"
    });
    const secondClaim = await repository.claimExpiredQuotaReservations({
      leaseTimeoutMs: 60_000,
      limit: 2,
      now: "2026-07-01T03:30:29.000Z"
    });

    assert.deepEqual(claimed.map((reservation) => reservation.id), [
      "quota_reservation_expired_unlocked",
      "quota_reservation_expired_stale_locked"
    ]);
    assert.deepEqual(claimed.map((reservation) => reservation.lockedAt), [
      "2026-07-01T03:30:00.000Z",
      "2026-07-01T03:30:00.000Z"
    ]);
    assert.deepEqual(claimed.map((reservation) => reservation.status), ["reserved", "reserved"]);
    assert.equal(secondClaim.length, 0);
    assert.equal((await repository.findQuotaReservation("quota_reservation_expired_unlocked"))?.lockedAt, "2026-07-01T03:30:00.000Z");
  });

  it("releases claimed expired quota reservations with an idempotent worker transition", async () => {
    const repository = BillingRepository.inMemory();
    const baseReservation = {
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T03:00:00.000Z",
      expiresAt: "2026-07-01T03:10:00.000Z",
      idempotencyKey: "reserve-expired-release",
      limit: 100,
      lockedAt: "2026-07-01T03:30:00.000Z",
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 5,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "webhooks",
      status: "reserved" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-expired-release",
      updatedAt: "2026-07-01T03:30:00.000Z",
      usedAfter: null,
      usedBefore: 10
    };
    const auditEvent = {
      action: "quota.expired.release",
      at: "2026-07-01T03:31:00.000Z",
      id: "evt_quota_expired_release",
      immutable: true,
      reason: "quota_reservation_expired",
      result: "released",
      severity: "info",
      target: "quota_reservation_claimed_expired",
      tenantId: "tenant-lumen",
      traceId: "trace-expired-release-worker"
    };

    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_claimed_expired"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_unclaimed_expired",
      idempotencyKey: "reserve-unclaimed-expired-release",
      lockedAt: null
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      expiresAt: "2026-07-01T03:40:00.000Z",
      id: "quota_reservation_claimed_not_expired",
      idempotencyKey: "reserve-claimed-not-expired-release"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_claimed_committed",
      idempotencyKey: "reserve-claimed-committed-release",
      status: "committed" as const
    });

    const released = await repository.releaseExpiredQuotaReservation({
      auditEvent,
      idempotencyKey: "quota-expiration-release:quota_reservation_claimed_expired",
      lockedAt: "2026-07-01T03:30:00.000Z",
      releasedAt: "2026-07-01T03:31:00.000Z",
      reservationId: "quota_reservation_claimed_expired",
      traceId: "trace-expired-release-worker"
    });
    const duplicate = await repository.releaseExpiredQuotaReservation({
      auditEvent: { ...auditEvent, id: "evt_quota_expired_release_duplicate" },
      idempotencyKey: "quota-expiration-release:quota_reservation_claimed_expired",
      lockedAt: "2026-07-01T03:30:00.000Z",
      releasedAt: "2026-07-01T03:32:00.000Z",
      reservationId: "quota_reservation_claimed_expired",
      traceId: "trace-expired-release-worker-replay"
    });
    const unclaimed = await repository.releaseExpiredQuotaReservation({
      auditEvent,
      idempotencyKey: "quota-expiration-release:quota_reservation_unclaimed_expired",
      lockedAt: "2026-07-01T03:30:00.000Z",
      releasedAt: "2026-07-01T03:31:00.000Z",
      reservationId: "quota_reservation_unclaimed_expired",
      traceId: "trace-expired-release-worker"
    });
    const notExpired = await repository.releaseExpiredQuotaReservation({
      auditEvent,
      idempotencyKey: "quota-expiration-release:quota_reservation_claimed_not_expired",
      lockedAt: "2026-07-01T03:30:00.000Z",
      releasedAt: "2026-07-01T03:31:00.000Z",
      reservationId: "quota_reservation_claimed_not_expired",
      traceId: "trace-expired-release-worker"
    });
    const committed = await repository.releaseExpiredQuotaReservation({
      auditEvent,
      idempotencyKey: "quota-expiration-release:quota_reservation_claimed_committed",
      lockedAt: "2026-07-01T03:30:00.000Z",
      releasedAt: "2026-07-01T03:31:00.000Z",
      reservationId: "quota_reservation_claimed_committed",
      traceId: "trace-expired-release-worker"
    });

    assert.equal(released?.status, "released");
    assert.equal(released?.releasedAt, "2026-07-01T03:31:00.000Z");
    assert.equal(released?.releaseIdempotencyKey, "quota-expiration-release:quota_reservation_claimed_expired");
    assert.equal(released?.lockedAt, null);
    assert.equal(released?.auditEvent?.action, "quota.expired.release");
    assert.deepEqual(released?.auditEvents?.map((event) => event.id), ["evt_quota_expired_release"]);
    assert.equal(duplicate?.releasedAt, "2026-07-01T03:31:00.000Z");
    assert.deepEqual(duplicate?.auditEvents?.map((event) => event.id), ["evt_quota_expired_release"]);
    assert.equal(unclaimed, undefined);
    assert.equal(notExpired, undefined);
    assert.equal(committed, undefined);
  });

  it("claims expired quota reservations through the quota expiration worker boundary", async () => {
    const repository = BillingRepository.inMemory();
    const baseReservation = {
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T04:00:00.000Z",
      expiresAt: "2026-07-01T04:10:00.000Z",
      idempotencyKey: "reserve-expiration-worker",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 5,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "webhooks",
      status: "reserved" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-expiration-worker",
      updatedAt: "2026-07-01T04:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    };

    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_worker_expired_first"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_worker_expired_second",
      idempotencyKey: "reserve-expiration-worker-second"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      expiresAt: "2026-07-01T04:40:00.000Z",
      id: "quota_reservation_worker_not_expired",
      idempotencyKey: "reserve-expiration-worker-not-expired"
    });

    const firstRun = await claimExpiredQuotaReservationsForWorker({
      leaseTimeoutMs: 60_000,
      limit: 1,
      now: "2026-07-01T04:30:00.000Z",
      repository
    });
    const secondRun = await claimExpiredQuotaReservationsForWorker({
      leaseTimeoutMs: 60_000,
      limit: 1,
      now: "2026-07-01T04:30:30.000Z",
      repository
    });

    assert.equal(firstRun.claimedAt, "2026-07-01T04:30:00.000Z");
    assert.deepEqual(firstRun.claimed.map((reservation) => reservation.id), ["quota_reservation_worker_expired_first"]);
    assert.deepEqual(firstRun.claimed.map((reservation) => reservation.lockedAt), ["2026-07-01T04:30:00.000Z"]);
    assert.equal(secondRun.claimed.length, 1);
    assert.equal(secondRun.claimed[0]?.id, "quota_reservation_worker_expired_second");
    assert.equal((await repository.findQuotaReservation("quota_reservation_worker_expired_first"))?.lockedAt, "2026-07-01T04:30:00.000Z");
    assert.equal((await repository.findQuotaReservation("quota_reservation_worker_not_expired"))?.lockedAt, null);
  });

  it("releases one claimed expired quota reservation through the quota expiration worker boundary", async () => {
    const repository = BillingRepository.inMemory();
    const baseReservation = {
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T04:00:00.000Z",
      expiresAt: "2026-07-01T04:10:00.000Z",
      idempotencyKey: "reserve-expiration-release-worker",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 5,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "webhooks",
      status: "reserved" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-expiration-release-worker",
      updatedAt: "2026-07-01T04:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    };

    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_release_worker_expired"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      expiresAt: "2026-07-01T04:40:00.000Z",
      id: "quota_reservation_release_worker_not_expired",
      idempotencyKey: "reserve-expiration-release-worker-not-expired"
    });

    const claim = await claimExpiredQuotaReservationsForWorker({
      leaseTimeoutMs: 60_000,
      limit: 1,
      now: "2026-07-01T04:30:00.000Z",
      repository
    });
    const released = await releaseExpiredQuotaReservationForWorker({
      releasedAt: "2026-07-01T04:31:00.000Z",
      repository,
      reservation: claim.claimed[0]!
    });
    const skipped = await releaseExpiredQuotaReservationForWorker({
      releasedAt: "2026-07-01T04:31:00.000Z",
      repository,
      reservation: {
        ...(await repository.findQuotaReservation("quota_reservation_release_worker_not_expired"))!,
        lockedAt: "2026-07-01T04:30:00.000Z"
      }
    });

    assert.equal(released.status, "released");
    assert.equal(released.reservation?.status, "released");
    assert.equal(released.reservation?.lockedAt, null);
    assert.equal(released.reservation?.releasedAt, "2026-07-01T04:31:00.000Z");
    assert.equal(released.reservation?.releaseIdempotencyKey, "quota-expiration-release:quota_reservation_release_worker_expired");
    assert.equal(released.reservation?.auditEvent?.action, "quota.expired.release");
    assert.equal(released.reservation?.auditEvent?.target, "quota_reservation_release_worker_expired");
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.reason, "not_released");
    assert.equal((await repository.findQuotaReservation("quota_reservation_release_worker_not_expired"))?.status, "reserved");
  });

  it("treats already released expired quota reservations as idempotent worker success", async () => {
    const repository = BillingRepository.inMemory();
    await repository.createQuotaReservation({
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T04:00:00.000Z",
      expiresAt: "2026-07-01T04:10:00.000Z",
      id: "quota_reservation_release_worker_replay",
      idempotencyKey: "reserve-expiration-release-worker-replay",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 5,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "webhooks",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trace-expiration-release-worker-replay",
      updatedAt: "2026-07-01T04:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });

    const claim = await claimExpiredQuotaReservationsForWorker({
      leaseTimeoutMs: 60_000,
      limit: 1,
      now: "2026-07-01T04:30:00.000Z",
      repository
    });
    const firstRelease = await releaseExpiredQuotaReservationForWorker({
      releasedAt: "2026-07-01T04:31:00.000Z",
      repository,
      reservation: claim.claimed[0]!
    });
    const persistedReleased = await repository.findQuotaReservation("quota_reservation_release_worker_replay");
    const replayRelease = await releaseExpiredQuotaReservationForWorker({
      releasedAt: "2026-07-01T04:32:00.000Z",
      repository,
      reservation: persistedReleased!
    });

    assert.equal(firstRelease.status, "released");
    assert.equal(replayRelease.status, "released");
    assert.equal(replayRelease.reservation?.releasedAt, "2026-07-01T04:31:00.000Z");
    assert.deepEqual(replayRelease.reservation?.auditEvents?.map((event) => event.action), ["quota.expired.release"]);
  });

  it("skips committed quota reservations explicitly in the expiration release worker", async () => {
    const repository = BillingRepository.inMemory();
    await repository.createQuotaReservation({
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: "commit-expiration-release-worker-committed",
      committedAt: "2026-07-01T04:20:00.000Z",
      createdAt: "2026-07-01T04:00:00.000Z",
      expiresAt: "2026-07-01T04:10:00.000Z",
      id: "quota_reservation_release_worker_committed",
      idempotencyKey: "reserve-expiration-release-worker-committed",
      limit: 100,
      lockedAt: "2026-07-01T04:30:00.000Z",
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 5,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "webhooks",
      status: "committed",
      tenantId: "tenant-lumen",
      traceId: "trace-expiration-release-worker-committed",
      updatedAt: "2026-07-01T04:20:00.000Z",
      usedAfter: 15,
      usedBefore: 10
    });

    const committed = await repository.findQuotaReservation("quota_reservation_release_worker_committed");
    const release = await releaseExpiredQuotaReservationForWorker({
      releasedAt: "2026-07-01T04:31:00.000Z",
      repository,
      reservation: committed!
    });
    const persisted = await repository.findQuotaReservation("quota_reservation_release_worker_committed");

    assert.equal(release.status, "skipped");
    assert.equal(release.reason, "already_committed");
    assert.equal(persisted?.status, "committed");
    assert.equal(persisted?.releaseIdempotencyKey, null);
    assert.equal(persisted?.auditEvents?.length, 0);
  });

  it("skips already released non-worker quota reservations explicitly in the expiration release worker", async () => {
    const repository = BillingRepository.inMemory();
    await repository.createQuotaReservation({
      auditEvent: {
        action: "quota.release",
        actor: "service-admin",
        actorName: "Service Admin",
        at: "2026-07-01T04:20:00.000Z",
        id: "evt_manual_release_before_worker",
        immutable: true,
        reason: "manual_release",
        result: "released",
        severity: "info",
        target: "quota_reservation_release_worker_already_released",
        tenantId: "tenant-lumen",
        traceId: "trace-manual-release-before-worker"
      },
      auditEvents: [{
        action: "quota.release",
        actor: "service-admin",
        actorName: "Service Admin",
        at: "2026-07-01T04:20:00.000Z",
        id: "evt_manual_release_before_worker",
        immutable: true,
        reason: "manual_release",
        result: "released",
        severity: "info",
        target: "quota_reservation_release_worker_already_released",
        tenantId: "tenant-lumen",
        traceId: "trace-manual-release-before-worker"
      }],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T04:00:00.000Z",
      expiresAt: "2026-07-01T04:10:00.000Z",
      id: "quota_reservation_release_worker_already_released",
      idempotencyKey: "reserve-expiration-release-worker-already-released",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: "manual-release-before-worker",
      releasedAt: "2026-07-01T04:20:00.000Z",
      requested: 5,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "webhooks",
      status: "released",
      tenantId: "tenant-lumen",
      traceId: "trace-manual-release-before-worker",
      updatedAt: "2026-07-01T04:20:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });

    const reservation = await repository.findQuotaReservation("quota_reservation_release_worker_already_released");
    const release = await releaseExpiredQuotaReservationForWorker({
      releasedAt: "2026-07-01T04:31:00.000Z",
      repository,
      reservation: reservation!
    });
    const persisted = await repository.findQuotaReservation("quota_reservation_release_worker_already_released");

    assert.equal(release.status, "skipped");
    assert.equal(release.reason, "already_released");
    assert.equal(persisted?.releaseIdempotencyKey, "manual-release-before-worker");
    assert.deepEqual(persisted?.auditEvents?.map((event) => event.id), ["evt_manual_release_before_worker"]);
  });

  it("exposes channels quota read-side with active reserved capacity", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    await repository.createQuotaReservation({
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T05:00:00.000Z",
      expiresAt: "2026-07-01T05:15:00.000Z",
      id: "quota_reservation_channels_readside",
      idempotencyKey: "reserve-channels-readside",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 2,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "channels",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trace-channels-readside",
      updatedAt: "2026-07-01T05:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });

    const snapshot = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const channels = (snapshot.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "channels");

    assert.ok(channels);
    assert.equal(channels.reserved, 2);
    assert.equal(channels.available, Math.max(0, Number(channels.limit) - Number(channels.used) - 2));
  });

  it("exposes storage quota read-side with active reserved capacity", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    await repository.createQuotaReservation({
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T05:00:00.000Z",
      expiresAt: "2026-07-01T05:15:00.000Z",
      id: "quota_reservation_storage_readside",
      idempotencyKey: "reserve-storage-readside",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 4,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "storage",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trace-storage-readside",
      updatedAt: "2026-07-01T05:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });

    const snapshot = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const storage = (snapshot.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "storage");

    assert.ok(storage);
    assert.equal(storage.reserved, 4);
    assert.equal(storage.available, Math.max(0, Number(storage.limit) - Number(storage.used) - 4));
  });

  it("exposes webhooks quota read-side with active reserved capacity", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    await repository.createQuotaReservation({
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T05:00:00.000Z",
      expiresAt: "2026-07-01T05:15:00.000Z",
      id: "quota_reservation_webhooks_readside",
      idempotencyKey: "reserve-webhooks-readside",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 6,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "webhooks",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trace-webhooks-readside",
      updatedAt: "2026-07-01T05:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });

    const snapshot = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const webhooks = (snapshot.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "webhooks");

    assert.ok(webhooks);
    assert.equal(webhooks.reserved, 6);
    assert.equal(webhooks.available, Math.max(0, Number(webhooks.limit) - Number(webhooks.used) - 6));
  });

  it("exposes AI quota read-side with active reserved capacity", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    await repository.createQuotaReservation({
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T05:00:00.000Z",
      expiresAt: "2026-07-01T05:15:00.000Z",
      id: "quota_reservation_ai_readside",
      idempotencyKey: "reserve-ai-readside",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 500,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "ai",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trace-ai-readside",
      updatedAt: "2026-07-01T05:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });

    const snapshot = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const ai = (snapshot.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "ai");

    assert.ok(ai);
    assert.equal(ai.reserved, 500);
    assert.equal(ai.available, Math.max(0, Number(ai.limit) - Number(ai.used) - 500));
  });

  it("exposes bots quota read-side with active reserved capacity", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    await repository.createQuotaReservation({
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T05:00:00.000Z",
      expiresAt: "2026-07-01T05:15:00.000Z",
      id: "quota_reservation_bots_readside",
      idempotencyKey: "reserve-bots-readside",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 3,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "bots",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trace-bots-readside",
      updatedAt: "2026-07-01T05:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });

    const snapshot = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const bots = (snapshot.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "bots");

    assert.ok(bots);
    assert.equal(bots.reserved, 3);
    assert.equal(bots.available, Math.max(0, Number(bots.limit) - Number(bots.used) - 3));
  });

  it("exposes reports quota read-side with active reserved capacity", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    await repository.createQuotaReservation({
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T05:00:00.000Z",
      expiresAt: "2026-07-01T05:15:00.000Z",
      id: "quota_reservation_reports_readside",
      idempotencyKey: "reserve-reports-readside",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 7,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "reports",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trace-reports-readside",
      updatedAt: "2026-07-01T05:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });

    const snapshot = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const reports = (snapshot.data.quotas as Array<Record<string, unknown>>).find((quota) => quota.resource === "reports");

    assert.ok(reports);
    assert.equal(reports.reserved, 7);
    assert.equal(reports.available, Math.max(0, Number(reports.limit) - Number(reports.used) - 7));
  });

  it("exposes operators quota read-side with active reserved capacity", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    await repository.createQuotaReservation({
      auditEvent: undefined,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T05:00:00.000Z",
      expiresAt: "2026-07-01T05:15:00.000Z",
      id: "quota_reservation_operators_readside",
      idempotencyKey: "reserve-operators-readside",
      limit: 100,
      lockedAt: null,
      planId: "starter",
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested: 1,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "operators",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trace-operators-readside",
      updatedAt: "2026-07-01T05:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    });

    const snapshot = await billing.fetchTenantQuotaSnapshot("tenant-lumen");
    const operators = (snapshot.data.quotas as Array<Record<string, unknown>>).find(
      (quota) => quota.resource === "operators"
    );

    assert.ok(operators);
    assert.equal(operators.reserved, 1);
    assert.equal(operators.available, Math.max(0, Number(operators.limit) - Number(operators.used) - 1));
  });

  it("returns tenant subscription and invoice payment state without provider secrets", async () => {
    const billing = new BillingService();

    const subscription = await billing.fetchTenantSubscription("tenant-volga");
    assert.equal(subscription.status, "ok");
    assert.equal(subscription.service, "billingService");
    assert.equal(subscription.data.subscription.tenantId, "tenant-volga");
    assert.equal(subscription.data.subscription.provider, "demo-billing-provider");
    assert.equal(subscription.data.subscription.status, "active");
    assert.equal(subscription.data.subscription.providerSecret, undefined);

    const invoices = await billing.fetchTenantInvoices("tenant-volga");
    const items = invoices.data.items as Array<Record<string, unknown>>;
    assert.equal(invoices.status, "ok");
    assert.equal(invoices.data.paymentSummary.currency, "RUB");
    assert.equal(items.some((invoice) => invoice.status === "open" && invoice.paymentStatus === "pending"), true);
    assert.equal(items.some((invoice) => invoice.providerSecret !== undefined), false);
  });

  it("defines repository contracts for tenant-scoped payment retry schedules", async () => {
    const repository = BillingRepository.inMemory();
    const schedule = {
      attempt: 1,
      createdAt: "2026-06-30T16:00:00.000Z",
      idempotencyKey: "payment-retry:tenant-lumen:invoice-1",
      invoiceId: "invoice-lumen-retry-1",
      lastAttemptAt: null,
      maxAttempts: 4,
      nextAttemptAt: "2026-06-30T16:15:00.000Z",
      provider: "demo-billing-provider",
      providerInvoiceId: "provider-invoice-lumen-retry-1",
      requestFingerprint: "sha256:retry-lumen-1",
      scheduleId: "retry-schedule-contract",
      status: "scheduled" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-retry-lumen",
      updatedAt: "2026-06-30T16:00:00.000Z"
    };

    const saved = await repository.savePaymentRetrySchedule(schedule);
    schedule.attempt = 99;
    saved.attempt = 99;
    const replay = await repository.savePaymentRetrySchedule({
      ...schedule,
      attempt: 2,
      nextAttemptAt: "2026-06-30T17:00:00.000Z",
      requestFingerprint: "sha256:mutated",
      status: "exhausted" as const,
      tenantId: "tenant-lumen"
    });
    const otherTenant = await repository.savePaymentRetrySchedule({
      ...schedule,
      idempotencyKey: "payment-retry:tenant-volga:invoice-1",
      invoiceId: "invoice-volga-retry-1",
      providerInvoiceId: "provider-invoice-volga-retry-1",
      requestFingerprint: "sha256:retry-volga-1",
      tenantId: "tenant-volga"
    });
    const tenantRows = await repository.listPaymentRetrySchedules({ tenantId: "tenant-lumen" });
    tenantRows[0].attempt = 99;
    const tenantRowsAgain = await repository.listPaymentRetrySchedules({ tenantId: "tenant-lumen" });
    const byIdempotencyKey = await repository.findPaymentRetryScheduleByIdempotencyKey("payment-retry:tenant-lumen:invoice-1");

    assert.equal(replay.attempt, 1);
    assert.equal(replay.nextAttemptAt, "2026-06-30T16:15:00.000Z");
    assert.equal(replay.status, "scheduled");
    assert.equal(otherTenant.tenantId, "tenant-volga");
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].attempt, 1);
    assert.equal(tenantRowsAgain[0].scheduleId, "retry-schedule-contract");
    assert.equal(byIdempotencyKey?.scheduleId, "retry-schedule-contract");
    assert.equal((await repository.listPaymentRetrySchedules({ invoiceId: "invoice-lumen-retry-1", tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listPaymentRetrySchedules({ statuses: ["scheduled"], tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listPaymentRetrySchedules({ statuses: ["exhausted"], tenantId: "tenant-lumen" })).length, 0);
    assert.equal((await repository.listPaymentRetrySchedules()).length, 0);
    assert.equal((await repository.listPaymentRetrySchedules({ tenantId: "" })).length, 0);
  });

  it("defines repository contracts for tenant-scoped payment dunning state", async () => {
    const repository = BillingRepository.inMemory();
    const state = {
      createdAt: "2026-06-30T16:30:00.000Z",
      dunningId: "dunning-state-contract",
      failedAttempts: 1,
      idempotencyKey: "dunning:tenant-lumen:invoice-1",
      invoiceId: "invoice-lumen-dunning-1",
      lastFailureAt: "2026-06-30T16:25:00.000Z",
      nextActionAt: "2026-07-01T16:30:00.000Z",
      provider: "demo-billing-provider",
      providerInvoiceId: "provider-invoice-lumen-dunning-1",
      requestFingerprint: "sha256:dunning-lumen-1",
      stage: "grace" as const,
      status: "active" as const,
      subscriptionId: "subscription-lumen",
      tenantId: "tenant-lumen",
      traceId: "trace-dunning-lumen",
      updatedAt: "2026-06-30T16:30:00.000Z"
    };

    const saved = await repository.savePaymentDunningState(state);
    state.failedAttempts = 99;
    saved.failedAttempts = 99;
    const replay = await repository.savePaymentDunningState({
      ...state,
      failedAttempts: 2,
      nextActionAt: "2026-07-02T16:30:00.000Z",
      requestFingerprint: "sha256:mutated",
      stage: "final_notice" as const,
      status: "paused" as const,
      tenantId: "tenant-lumen"
    });
    const otherTenant = await repository.savePaymentDunningState({
      ...state,
      dunningId: "dunning-state-contract-volga",
      idempotencyKey: "dunning:tenant-volga:invoice-1",
      invoiceId: "invoice-volga-dunning-1",
      providerInvoiceId: "provider-invoice-volga-dunning-1",
      requestFingerprint: "sha256:dunning-volga-1",
      tenantId: "tenant-volga"
    });
    const tenantRows = await repository.listPaymentDunningStates({ tenantId: "tenant-lumen" });
    tenantRows[0].failedAttempts = 99;
    const tenantRowsAgain = await repository.listPaymentDunningStates({ tenantId: "tenant-lumen" });
    const byIdempotencyKey = await repository.findPaymentDunningStateByIdempotencyKey("dunning:tenant-lumen:invoice-1");

    assert.equal(replay.failedAttempts, 1);
    assert.equal(replay.nextActionAt, "2026-07-01T16:30:00.000Z");
    assert.equal(replay.stage, "grace");
    assert.equal(replay.status, "active");
    assert.equal(otherTenant.tenantId, "tenant-volga");
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].failedAttempts, 1);
    assert.equal(tenantRowsAgain[0].dunningId, "dunning-state-contract");
    assert.equal(byIdempotencyKey?.dunningId, "dunning-state-contract");
    assert.equal((await repository.listPaymentDunningStates({ invoiceId: "invoice-lumen-dunning-1", tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listPaymentDunningStates({ statuses: ["active"], tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listPaymentDunningStates({ statuses: ["paused"], tenantId: "tenant-lumen" })).length, 0);
    assert.equal((await repository.listPaymentDunningStates()).length, 0);
    assert.equal((await repository.listPaymentDunningStates({ tenantId: "" })).length, 0);
  });

  it("defines repository contracts for tenant-scoped reconciliation conflicts", async () => {
    const repository = BillingRepository.inMemory();
    const conflict = {
      actual: { amountPaid: 0, providerStatus: "failed" },
      conflictId: "reconciliation-conflict-contract",
      createdAt: "2026-06-30T17:00:00.000Z",
      detectedAt: "2026-06-30T16:55:00.000Z",
      expected: { amountDue: 129000, paymentStatus: "pending" },
      idempotencyKey: "reconciliation-conflict:tenant-lumen:invoice-1",
      invoiceId: "invoice-lumen-conflict-1",
      provider: "demo-billing-provider",
      providerInvoiceId: "provider-invoice-lumen-conflict-1",
      reason: "provider_invoice_status_mismatch",
      requestFingerprint: "sha256:reconciliation-conflict-lumen-1",
      resolution: null,
      resolvedAt: null,
      severity: "high" as const,
      status: "open" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-reconciliation-conflict-lumen",
      updatedAt: "2026-06-30T17:00:00.000Z"
    };

    const saved = await repository.saveReconciliationConflict(conflict);
    conflict.actual.amountPaid = 129000;
    saved.actual.amountPaid = 129000;
    const replay = await repository.saveReconciliationConflict({
      ...conflict,
      actual: { amountPaid: 129000, providerStatus: "paid" },
      requestFingerprint: "sha256:mutated",
      resolution: "provider replay was stale",
      resolvedAt: "2026-06-30T17:30:00.000Z",
      severity: "low" as const,
      status: "resolved" as const,
      tenantId: "tenant-lumen"
    });
    const otherTenant = await repository.saveReconciliationConflict({
      ...conflict,
      actual: { amountPaid: 0, providerStatus: "failed" },
      conflictId: "reconciliation-conflict-contract-volga",
      idempotencyKey: "reconciliation-conflict:tenant-volga:invoice-1",
      invoiceId: "invoice-volga-conflict-1",
      providerInvoiceId: "provider-invoice-volga-conflict-1",
      requestFingerprint: "sha256:reconciliation-conflict-volga-1",
      tenantId: "tenant-volga"
    });
    const tenantRows = await repository.listReconciliationConflicts({ tenantId: "tenant-lumen" });
    tenantRows[0].actual.amountPaid = 129000;
    const tenantRowsAgain = await repository.listReconciliationConflicts({ tenantId: "tenant-lumen" });
    const byIdempotencyKey = await repository.findReconciliationConflictByIdempotencyKey("reconciliation-conflict:tenant-lumen:invoice-1");

    assert.equal(replay.actual.amountPaid, 0);
    assert.equal(replay.resolution, null);
    assert.equal(replay.severity, "high");
    assert.equal(replay.status, "open");
    assert.equal(otherTenant.tenantId, "tenant-volga");
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].actual.amountPaid, 0);
    assert.equal(tenantRowsAgain[0].conflictId, "reconciliation-conflict-contract");
    assert.equal(byIdempotencyKey?.conflictId, "reconciliation-conflict-contract");
    assert.equal((await repository.listReconciliationConflicts({ invoiceId: "invoice-lumen-conflict-1", tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listReconciliationConflicts({ severities: ["high"], tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listReconciliationConflicts({ statuses: ["open"], tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listReconciliationConflicts({ severities: ["low"], tenantId: "tenant-lumen" })).length, 0);
    assert.equal((await repository.listReconciliationConflicts({ statuses: ["resolved"], tenantId: "tenant-lumen" })).length, 0);
    assert.equal((await repository.listReconciliationConflicts()).length, 0);
    assert.equal((await repository.listReconciliationConflicts({ tenantId: "" })).length, 0);
  });

  it("defines repository contracts for tenant-scoped idempotent payment retry keys", async () => {
    const repository = BillingRepository.inMemory();
    const retryKey = {
      attempt: 1,
      createdAt: "2026-06-30T17:30:00.000Z",
      firstAttemptAt: "2026-06-30T17:30:00.000Z",
      idempotencyKey: "payment-retry-key:tenant-lumen:invoice-1:attempt-1",
      invoiceId: "invoice-lumen-retry-key-1",
      lastAttemptAt: null,
      provider: "demo-billing-provider",
      providerInvoiceId: "provider-invoice-lumen-retry-key-1",
      requestFingerprint: "sha256:retry-key-lumen-1",
      result: { providerRequestId: "provider-request-lumen-1" },
      retryKeyId: "retry-key-contract",
      scheduleId: "retry-schedule-contract",
      status: "claimed" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-retry-key-lumen",
      updatedAt: "2026-06-30T17:30:00.000Z"
    };

    const saved = await repository.savePaymentRetryKey(retryKey);
    retryKey.result.providerRequestId = "provider-request-mutated";
    saved.result.providerRequestId = "provider-request-mutated";
    const replay = await repository.savePaymentRetryKey({
      ...retryKey,
      lastAttemptAt: "2026-06-30T17:45:00.000Z",
      requestFingerprint: "sha256:mutated",
      result: { providerRequestId: "provider-request-replay" },
      status: "succeeded" as const,
      tenantId: "tenant-lumen",
      updatedAt: "2026-06-30T17:45:00.000Z"
    });
    const otherTenant = await repository.savePaymentRetryKey({
      ...retryKey,
      idempotencyKey: "payment-retry-key:tenant-volga:invoice-1:attempt-1",
      invoiceId: "invoice-volga-retry-key-1",
      providerInvoiceId: "provider-invoice-volga-retry-key-1",
      requestFingerprint: "sha256:retry-key-volga-1",
      result: { providerRequestId: "provider-request-volga-1" },
      retryKeyId: "retry-key-contract-volga",
      tenantId: "tenant-volga"
    });
    const tenantRows = await repository.listPaymentRetryKeys({ tenantId: "tenant-lumen" });
    tenantRows[0].result.providerRequestId = "provider-request-mutated";
    const tenantRowsAgain = await repository.listPaymentRetryKeys({ tenantId: "tenant-lumen" });
    const byIdempotencyKey = await repository.findPaymentRetryKeyByIdempotencyKey("payment-retry-key:tenant-lumen:invoice-1:attempt-1");

    assert.equal(replay.status, "claimed");
    assert.equal(replay.lastAttemptAt, null);
    assert.equal(replay.result.providerRequestId, "provider-request-lumen-1");
    assert.equal(otherTenant.tenantId, "tenant-volga");
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].result.providerRequestId, "provider-request-lumen-1");
    assert.equal(tenantRowsAgain[0].retryKeyId, "retry-key-contract");
    assert.equal(byIdempotencyKey?.retryKeyId, "retry-key-contract");
    assert.equal((await repository.listPaymentRetryKeys({ invoiceId: "invoice-lumen-retry-key-1", tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listPaymentRetryKeys({ statuses: ["claimed"], tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listPaymentRetryKeys({ statuses: ["succeeded"], tenantId: "tenant-lumen" })).length, 0);
    assert.equal((await repository.listPaymentRetryKeys()).length, 0);
    assert.equal((await repository.listPaymentRetryKeys({ tenantId: "" })).length, 0);
  });

  it("defines repository contracts for tenant-scoped billing approvals", async () => {
    const repository = BillingRepository.inMemory();
    const approval = {
      approvalId: "billing-approval-contract",
      createdAt: "2026-06-30T22:00:00.000Z",
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionReason: null,
      expiresAt: "2026-07-01T22:00:00.000Z",
      reason: "Approve tenant downgrade after commercial review",
      requestedBy: "svc-admin-1",
      requestedByName: "Service Admin",
      requestFingerprint: "sha256:billing-approval-contract",
      status: "pending" as const,
      subjectId: "tenant-lumen:business:starter",
      subjectType: "tariff_change" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-contract",
      updatedAt: "2026-06-30T22:00:00.000Z"
    };

    const saved = await repository.saveBillingApproval(approval);
    saved.status = "approved";
    const replay = await repository.saveBillingApproval({
      ...approval,
      reason: "Mutated replay should not overwrite",
      status: "approved" as const
    });
    await repository.saveBillingApproval({
      ...approval,
      approvalId: "billing-approval-contract-volga",
      requestFingerprint: "sha256:billing-approval-contract-volga",
      tenantId: "tenant-volga"
    });
    const pending = await repository.listBillingApprovals({ statuses: ["pending"], tenantId: "tenant-lumen" });
    const crossTenant = await repository.findBillingApproval("billing-approval-contract", "tenant-volga");
    const decided = await repository.decideBillingApproval({
      approvalId: "billing-approval-contract",
      decidedAt: "2026-06-30T22:10:00.000Z",
      decidedBy: "svc-admin-2",
      decidedByName: "Approver",
      decisionReason: "Commercial owner approved",
      status: "approved",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-decision"
    });

    assert.equal(replay.status, "pending");
    assert.equal(replay.reason, "Approve tenant downgrade after commercial review");
    assert.equal(pending.length, 1);
    assert.equal(pending[0].approvalId, "billing-approval-contract");
    assert.equal(crossTenant, undefined);
    assert.equal(decided.status, "approved");
    assert.equal(decided.decidedByName, "Approver");
    assert.equal(decided.decisionReason, "Commercial owner approved");
    await assert.rejects(async () => repository.decideBillingApproval({
      approvalId: "billing-approval-contract",
      decidedAt: "2026-06-30T22:20:00.000Z",
      decidedBy: "svc-admin-3",
      decidedByName: "Late approver",
      decisionReason: "Should fail",
      status: "rejected",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-late-decision"
    }), /was not pending/);
    assert.equal((await repository.listBillingApprovals({ statuses: ["approved"], tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listBillingApprovals({ tenantId: "" })).length, 0);
  });

  it("persists billing approvals through JSON storage with fingerprint replay safety", async () => {
    const repository = BillingRepository.inMemory();
    const approval = {
      approvalId: "billing-approval-json",
      createdAt: "2026-06-30T22:15:00.000Z",
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionReason: null,
      expiresAt: "2026-07-01T22:15:00.000Z",
      reason: "Approve JSON-backed downgrade",
      requestedBy: "svc-admin-json-1",
      requestedByName: "JSON Service Admin",
      requestFingerprint: "sha256:billing-approval-json",
      status: "pending" as const,
      subjectId: "tenant-lumen:business:starter",
      subjectType: "tariff_change" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-json",
      updatedAt: "2026-06-30T22:15:00.000Z"
    };

    await repository.saveBillingApproval(approval);

    const replay = await repository.saveBillingApproval({
      ...approval,
      approvalId: "billing-approval-json-replay",
      reason: "Replay should not overwrite JSON approval",
      status: "approved" as const,
      traceId: "trace-billing-approval-json-replay",
      updatedAt: "2026-06-30T22:16:00.000Z"
    });
    const decided = await repository.decideBillingApproval({
      approvalId: "billing-approval-json",
      decidedAt: "2026-06-30T22:20:00.000Z",
      decidedBy: "svc-admin-json-2",
      decidedByName: "JSON Approver",
      decisionReason: "JSON persistence approved",
      status: "approved",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-json-decision"
    });

    const approvals = await repository.listBillingApprovals({ tenantId: "tenant-lumen" });
    const refetched = await repository.findBillingApproval("billing-approval-json", "tenant-lumen");

    assert.equal(replay.approvalId, "billing-approval-json");
    assert.equal(replay.reason, "Approve JSON-backed downgrade");
    assert.equal(replay.status, "pending");
    assert.equal(decided.status, "approved");
    assert.equal(approvals.length, 1);
    assert.equal(refetched?.decidedByName, "JSON Approver");
    assert.equal(refetched?.decisionReason, "JSON persistence approved");
  });

  it("persists immutable billing approval decision audit events across JSON storage", async () => {
    const repository = BillingRepository.inMemory();
    await repository.saveBillingApproval({
      approvalId: "billing-approval-audit-json",
      createdAt: "2026-07-01T02:00:00.000Z",
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionReason: null,
      expiresAt: "2026-07-02T02:00:00.000Z",
      reason: "Approve audited billing approval decision",
      requestedBy: "svc-admin-json-1",
      requestedByName: "JSON Service Admin",
      requestFingerprint: "sha256:billing-approval-audit-json",
      status: "pending" as const,
      subjectId: "tenant-lumen:business:starter",
      subjectType: "tariff_change" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-audit-request",
      updatedAt: "2026-07-01T02:00:00.000Z"
    });

    const decided = await repository.decideBillingApproval({
      approvalId: "billing-approval-audit-json",
      decidedAt: "2026-07-01T02:10:00.000Z",
      decidedBy: "svc-admin-json-2",
      decidedByName: "JSON Audit Approver",
      decisionReason: "Audit owner approved this decision",
      status: "approved",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-audit-decision"
    });
    const refetched = await repository.findBillingApproval("billing-approval-audit-json", "tenant-lumen");

    assert.equal(decided.auditEvents?.length, 1);
    assert.equal(refetched?.auditEvents?.length, 1);
    assert.deepEqual(refetched?.auditEvents?.[0], {
      action: "billing.approval.decided",
      approvalId: "billing-approval-audit-json",
      at: "2026-07-01T02:10:00.000Z",
      decidedBy: "svc-admin-json-2",
      decidedByName: "JSON Audit Approver",
      decisionReason: "Audit owner approved this decision",
      immutable: true,
      result: "approved",
      subjectId: "tenant-lumen:business:starter",
      subjectType: "tariff_change",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-audit-decision"
    });
  });

  it("redacts secret-like billing approval reasons before JSON persistence and audit history", async () => {
    const repository = BillingRepository.inMemory();
    await repository.saveBillingApproval({
      approvalId: "billing-approval-redaction-json",
      createdAt: "2026-07-01T03:20:00.000Z",
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionReason: null,
      expiresAt: "2026-07-02T03:20:00.000Z",
      reason: "Approve emergency change with Bearer sk_live_approval_reason_secret",
      requestedBy: "svc-admin-json-1",
      requestedByName: "JSON Service Admin",
      requestFingerprint: "sha256:billing-approval-redaction-json",
      status: "pending" as const,
      subjectId: "tenant-lumen:business:starter",
      subjectType: "tariff_change" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-redaction-request",
      updatedAt: "2026-07-01T03:20:00.000Z"
    });

    await repository.decideBillingApproval({
      approvalId: "billing-approval-redaction-json",
      decidedAt: "2026-07-01T03:25:00.000Z",
      decidedBy: "svc-admin-json-2",
      decidedByName: "JSON Audit Approver",
      decisionReason: "Approved after providerToken=fake-provider-token-approval-secret-needle check",
      status: "approved",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-redaction-decision"
    });

    const refetched = await repository.findBillingApproval("billing-approval-redaction-json", "tenant-lumen");
    const serializedApproval = JSON.stringify(refetched);

    assert.equal(serializedApproval.includes("sk_live_approval_reason_secret"), false);
    assert.equal(serializedApproval.includes("fake-provider-token-approval-secret-needle"), false);
    assert.match(refetched?.reason ?? "", /Bearer \[REDACTED:api_key\]/);
    assert.match(refetched?.decisionReason ?? "", /providerToken=\[REDACTED:provider_token\]/);
    assert.match(refetched?.auditEvents?.[0]?.decisionReason ?? "", /providerToken=\[REDACTED:provider_token\]/);
  });

  it("defines repository contracts for tenant-scoped billing legal entities", async () => {
    const repository = BillingRepository.inMemory();
    const legalEntity = {
      addressLine1: "Nevsky 10",
      addressLine2: null,
      city: "Saint Petersburg",
      country: "RU",
      createdAt: "2026-06-30T22:30:00.000Z",
      legalEntityId: "legal-entity-contract",
      legalName: "Lumen Health LLC",
      postalCode: "191025",
      region: "RU-SPE",
      registrationNumber: "1027800000000",
      status: "pending_review" as const,
      taxId: "7800000000",
      tenantId: "tenant-lumen",
      traceId: "trace-legal-entity-contract",
      updatedAt: "2026-06-30T22:30:00.000Z",
      vatId: "RU7800000000"
    };

    const saved = await repository.saveBillingLegalEntity(legalEntity);
    saved.legalName = "Mutated Legal Name";
    const replay = await repository.saveBillingLegalEntity({
      ...legalEntity,
      legalName: "Replay Legal Name",
      requestFingerprint: "sha256:legal-entity-mutated",
      status: "active" as const
    });
    await repository.saveBillingLegalEntity({
      ...legalEntity,
      legalEntityId: "legal-entity-contract-volga",
      legalName: "Volga Retail LLC",
      registrationNumber: "1027700000000",
      taxId: "7700000000",
      tenantId: "tenant-volga",
      vatId: "RU7700000000"
    });
    const tenantRows = await repository.listBillingLegalEntities({ tenantId: "tenant-lumen" });
    tenantRows[0].legalName = "Mutated list row";
    const tenantRowsAgain = await repository.listBillingLegalEntities({ tenantId: "tenant-lumen" });
    const byId = await repository.findBillingLegalEntity("legal-entity-contract", "tenant-lumen");
    const crossTenant = await repository.findBillingLegalEntity("legal-entity-contract", "tenant-volga");

    assert.equal(replay.legalName, "Lumen Health LLC");
    assert.equal(replay.status, "pending_review");
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].legalName, "Lumen Health LLC");
    assert.equal(byId?.taxId, "7800000000");
    assert.equal(crossTenant, undefined);
    assert.equal((await repository.listBillingLegalEntities({ statuses: ["pending_review"], tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listBillingLegalEntities({ statuses: ["active"], tenantId: "tenant-lumen" })).length, 0);
    assert.equal((await repository.listBillingLegalEntities({ tenantId: "" })).length, 0);
  });

  it("persists billing legal entities through JSON storage with registration replay safety", async () => {
    const repository = BillingRepository.inMemory();
    const legalEntity = {
      addressLine1: "Nevsky 10",
      addressLine2: null,
      city: "Saint Petersburg",
      country: "RU",
      createdAt: "2026-06-30T22:35:00.000Z",
      legalEntityId: "legal-entity-json",
      legalName: "Lumen Health LLC",
      postalCode: "191025",
      region: "RU-SPE",
      registrationNumber: "1027800000000",
      status: "pending_review" as const,
      taxId: "7800000000",
      tenantId: "tenant-lumen",
      traceId: "trace-legal-entity-json",
      updatedAt: "2026-06-30T22:35:00.000Z",
      vatId: null
    };

    await repository.saveBillingLegalEntity(legalEntity);

    const replay = await repository.saveBillingLegalEntity({
      ...legalEntity,
      legalEntityId: "legal-entity-json-replay",
      legalName: "Mutated Replay LLC",
      status: "active" as const,
      traceId: "trace-legal-entity-json-replay",
      updatedAt: "2026-06-30T22:36:00.000Z"
    });

    const entities = await repository.listBillingLegalEntities({ tenantId: "tenant-lumen" });
    const refetched = await repository.findBillingLegalEntity("legal-entity-json", "tenant-lumen");

    assert.equal(replay.legalEntityId, "legal-entity-json");
    assert.equal(replay.legalName, "Lumen Health LLC");
    assert.equal(replay.status, "pending_review");
    assert.equal(entities.length, 1);
    assert.equal(refetched?.registrationNumber, "1027800000000");
    assert.equal(JSON.stringify(entities).includes("rawDocumentSecret"), false);
  });

  it("persists immutable billing legal entity audit events across JSON storage", async () => {
    const repository = BillingRepository.inMemory();
    const saved = await repository.saveBillingLegalEntity({
      addressLine1: "Nevsky 10",
      addressLine2: null,
      city: "Saint Petersburg",
      country: "RU",
      createdAt: "2026-07-01T03:00:00.000Z",
      legalEntityId: "legal-entity-audit-json",
      legalName: "Lumen Health LLC",
      postalCode: "191025",
      region: "RU-SPE",
      registrationNumber: "1027800000001",
      status: "pending_review" as const,
      taxId: "7800000001",
      tenantId: "tenant-lumen",
      traceId: "trace-legal-entity-audit-json",
      updatedAt: "2026-07-01T03:00:00.000Z",
      vatId: null
    });

    const replay = await repository.saveBillingLegalEntity({
      ...saved,
      legalEntityId: "legal-entity-audit-json-replay",
      legalName: "Replay should not rewrite legal entity audit",
      status: "active" as const,
      traceId: "trace-legal-entity-audit-json-replay",
      updatedAt: "2026-07-01T03:05:00.000Z"
    });
    const refetched = await repository.findBillingLegalEntity("legal-entity-audit-json", "tenant-lumen");

    assert.equal(saved.auditEvents?.length, 1);
    assert.deepEqual(replay.auditEvents, saved.auditEvents);
    assert.deepEqual(refetched?.auditEvents?.[0], {
      action: "billing.legal_entity.saved",
      at: "2026-07-01T03:00:00.000Z",
      immutable: true,
      legalEntityId: "legal-entity-audit-json",
      legalName: "Lumen Health LLC",
      registrationNumber: "1027800000001",
      result: "pending_review",
      tenantId: "tenant-lumen",
      traceId: "trace-legal-entity-audit-json"
    });
  });

  it("redacts secret-like billing legal entity text before JSON persistence and audit history", async () => {
    const repository = BillingRepository.inMemory();
    const saved = await repository.saveBillingLegalEntity({
      addressLine1: "Nevsky 10 objectKey=tenant-lumen/private/legal-entity-secret.pdf",
      addressLine2: "Bearer sk_live_legal_entity_address_secret",
      city: "Saint Petersburg",
      country: "RU",
      createdAt: "2026-07-01T03:40:00.000Z",
      legalEntityId: "legal-entity-redaction-json",
      legalName: "Lumen providerToken=fake-provider-token-legal-entity-secret-needle LLC",
      postalCode: "191025",
      region: "Northwest",
      registrationNumber: "1027800000002",
      status: "pending_review" as const,
      taxId: "7800000002",
      tenantId: "tenant-lumen",
      traceId: "trace-legal-entity-redaction-json",
      updatedAt: "2026-07-01T03:40:00.000Z",
      vatId: "RU7800000002"
    });

    const refetched = await repository.findBillingLegalEntity("legal-entity-redaction-json", "tenant-lumen");
    const serializedEntity = JSON.stringify(refetched);

    assert.equal(serializedEntity.includes("fake-provider-token-legal-entity-secret-needle"), false);
    assert.match(saved.legalName, /providerToken=\[REDACTED:provider_token\]/);
    assert.match(refetched?.addressLine1 ?? "", /objectKey=\[REDACTED:object_key\]/);
    assert.match(refetched?.addressLine2 ?? "", /Bearer \[REDACTED:api_key\]/);
    assert.match(refetched?.auditEvents?.[0]?.legalName ?? "", /providerToken=\[REDACTED:provider_token\]/);
  });

  it("defines repository contracts for tenant-scoped billing tax document metadata", async () => {
    const repository = BillingRepository.inMemory();
    const document = {
      createdAt: "2026-06-30T23:00:00.000Z",
      documentId: "tax-document-contract",
      documentType: "vat_certificate" as const,
      fileName: "vat-certificate.pdf",
      legalEntityId: "legal-entity-contract",
      mimeType: "application/pdf",
      requestFingerprint: "sha256:tax-document-contract",
      sha256: "sha256-tax-document-contract",
      status: "pending_review" as const,
      storageLocator: "s3://billing-documents/tenant-lumen/tax-document-contract",
      tenantId: "tenant-lumen",
      traceId: "trace-tax-document-contract",
      updatedAt: "2026-06-30T23:00:00.000Z",
      uploadedBy: "svc-admin-1",
      uploadedByName: "Service Admin"
    };

    const saved = await repository.saveBillingTaxDocument({
      ...document,
      rawDocumentSecret: "raw-pdf-secret-needle"
    });
    saved.fileName = "mutated.pdf";
    const replay = await repository.saveBillingTaxDocument({
      ...document,
      fileName: "mutated-replay.pdf",
      rawDocumentSecret: "raw-pdf-secret-needle",
      status: "approved" as const
    });
    await repository.saveBillingTaxDocument({
      ...document,
      documentId: "tax-document-contract-volga",
      legalEntityId: "legal-entity-contract-volga",
      requestFingerprint: "sha256:tax-document-contract-volga",
      sha256: "sha256-tax-document-contract-volga",
      tenantId: "tenant-volga"
    });
    const tenantRows = await repository.listBillingTaxDocuments({ tenantId: "tenant-lumen" });
    const byId = await repository.findBillingTaxDocument("tax-document-contract", "tenant-lumen");
    const crossTenant = await repository.findBillingTaxDocument("tax-document-contract", "tenant-volga");
    const serialized = JSON.stringify(tenantRows);

    assert.equal(replay.fileName, "vat-certificate.pdf");
    assert.equal(replay.status, "pending_review");
    assert.equal(tenantRows.length, 1);
    assert.equal(tenantRows[0].storageLocator, "s3://billing-documents/tenant-lumen/tax-document-contract");
    assert.equal(byId?.sha256, "sha256-tax-document-contract");
    assert.equal(crossTenant, undefined);
    assert.equal(serialized.includes("rawDocumentSecret"), false);
    assert.equal(serialized.includes("raw-pdf-secret-needle"), false);
    assert.equal((await repository.listBillingTaxDocuments({ documentTypes: ["vat_certificate"], tenantId: "tenant-lumen" })).length, 1);
    assert.equal((await repository.listBillingTaxDocuments({ statuses: ["approved"], tenantId: "tenant-lumen" })).length, 0);
    assert.equal((await repository.listBillingTaxDocuments({ tenantId: "" })).length, 0);
  });

  it("persists billing tax document metadata through JSON storage without raw document secrets", async () => {
    const repository = BillingRepository.inMemory();
    const document = {
      createdAt: "2026-06-30T23:10:00.000Z",
      documentId: "tax-document-json",
      documentType: "vat_certificate" as const,
      fileName: "vat-certificate.pdf",
      legalEntityId: "legal-entity-json",
      mimeType: "application/pdf",
      requestFingerprint: "sha256:tax-document-json",
      sha256: "sha256-tax-document-json",
      status: "pending_review" as const,
      storageLocator: "s3://billing-documents/tenant-lumen/tax-document-json",
      tenantId: "tenant-lumen",
      traceId: "trace-tax-document-json",
      updatedAt: "2026-06-30T23:10:00.000Z",
      uploadedBy: "svc-admin-1",
      uploadedByName: "Service Admin"
    };

    await repository.saveBillingTaxDocument({
      ...document,
      rawDocumentSecret: "raw-pdf-secret-needle"
    });

    const replay = await repository.saveBillingTaxDocument({
      ...document,
      documentId: "tax-document-json-replay",
      fileName: "mutated-replay.pdf",
      rawDocumentSecret: "raw-pdf-secret-needle",
      status: "approved" as const,
      traceId: "trace-tax-document-json-replay",
      updatedAt: "2026-06-30T23:11:00.000Z"
    });

    const documents = await repository.listBillingTaxDocuments({ tenantId: "tenant-lumen" });
    const refetched = await repository.findBillingTaxDocument("tax-document-json", "tenant-lumen");
    const serialized = JSON.stringify(documents);

    assert.equal(replay.documentId, "tax-document-json");
    assert.equal(replay.fileName, "vat-certificate.pdf");
    assert.equal(replay.status, "pending_review");
    assert.equal(documents.length, 1);
    assert.equal(refetched?.storageLocator, "s3://billing-documents/tenant-lumen/tax-document-json");
    assert.equal(serialized.includes("rawDocumentSecret"), false);
    assert.equal(serialized.includes("raw-pdf-secret-needle"), false);
  });

  it("persists immutable billing tax document audit events across JSON storage", async () => {
    const repository = BillingRepository.inMemory();
    const document = {
      createdAt: "2026-07-01T03:10:00.000Z",
      documentId: "tax-document-audit-json",
      documentType: "vat_certificate" as const,
      fileName: "vat-certificate.pdf",
      legalEntityId: "legal-entity-audit-json",
      mimeType: "application/pdf",
      requestFingerprint: "sha256:tax-document-audit-json",
      sha256: "sha256-tax-document-audit-json",
      status: "pending_review" as const,
      storageLocator: "s3://billing-documents/tenant-lumen/tax-document-audit-json",
      tenantId: "tenant-lumen",
      traceId: "trace-tax-document-audit-json",
      updatedAt: "2026-07-01T03:10:00.000Z",
      uploadedBy: "svc-admin-1",
      uploadedByName: "Service Admin"
    };

    const saved = await repository.saveBillingTaxDocument({
      ...document,
      rawDocumentSecret: "raw-pdf-secret-needle"
    });

    const replay = await repository.saveBillingTaxDocument({
      ...document,
      fileName: "mutated-replay.pdf",
      rawDocumentSecret: "raw-pdf-secret-needle",
      status: "approved" as const,
      traceId: "trace-tax-document-audit-json-replay",
      updatedAt: "2026-07-01T03:11:00.000Z"
    });

    const refetched = await repository.findBillingTaxDocument("tax-document-audit-json", "tenant-lumen");
    const serializedAudit = JSON.stringify(refetched?.auditEvents ?? []);

    assert.equal(saved.auditEvents?.length, 1);
    assert.deepEqual(replay.auditEvents, saved.auditEvents);
    assert.deepEqual(refetched?.auditEvents?.[0], {
      action: "billing.tax_document.saved",
      at: "2026-07-01T03:10:00.000Z",
      documentId: "tax-document-audit-json",
      documentType: "vat_certificate",
      fileName: "vat-certificate.pdf",
      immutable: true,
      legalEntityId: "legal-entity-audit-json",
      result: "pending_review",
      tenantId: "tenant-lumen",
      traceId: "trace-tax-document-audit-json",
      uploadedBy: "svc-admin-1"
    });
    assert.equal(serializedAudit.includes("storageLocator"), false);
    assert.equal(serializedAudit.includes("s3://billing-documents"), false);
    assert.equal(serializedAudit.includes("rawDocumentSecret"), false);
    assert.equal(serializedAudit.includes("raw-pdf-secret-needle"), false);
  });

  it("redacts secret-like billing tax document text before JSON persistence and audit history", async () => {
    const repository = BillingRepository.inMemory();
    const saved = await repository.saveBillingTaxDocument({
      createdAt: "2026-07-01T03:50:00.000Z",
      documentId: "tax-document-redaction-json",
      documentType: "vat_certificate" as const,
      fileName: "vat-providerToken=fake-provider-token-tax-document-secret-needle.pdf",
      legalEntityId: "legal-entity-redaction-json",
      mimeType: "application/pdf",
      rawDocumentSecret: "raw-pdf-redaction-secret-needle",
      requestFingerprint: "sha256:tax-document-redaction-json",
      sha256: "sha256-tax-document-redaction-json",
      status: "pending_review" as const,
      storageLocator: "s3://billing-documents/tenant-lumen/tax-document-redaction-json",
      tenantId: "tenant-lumen",
      traceId: "trace-tax-document-redaction-json",
      updatedAt: "2026-07-01T03:50:00.000Z",
      uploadedBy: "svc-admin-1",
      uploadedByName: "Bearer sk_live_tax_document_uploader_secret"
    });

    const refetched = await repository.findBillingTaxDocument("tax-document-redaction-json", "tenant-lumen");
    const serializedDocument = JSON.stringify(refetched);

    assert.equal(serializedDocument.includes("fake-provider-token-tax-document-secret-needle"), false);
    assert.match(saved.fileName, /providerToken=\[REDACTED:provider_token\]/);
    assert.match(refetched?.uploadedByName ?? "", /Bearer \[REDACTED:api_key\]/);
    assert.match(refetched?.auditEvents?.[0]?.fileName ?? "", /providerToken=\[REDACTED:provider_token\]/);
  });

  it("syncs provider subscription and invoice state idempotently", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_succeeded",
      idempotencyKey: "provider-event-lumen-invoice-1",
      invoice: {
        amountDue: 129000,
        amountPaid: 129000,
        currency: "RUB",
        dueAt: "2026-07-15T00:00:00.000Z",
        id: "inv_lumen_provider_2026_07",
        paidAt: "2026-07-01T12:00:00.000Z",
        paymentStatus: "succeeded",
        providerInvoiceId: "provider-invoice-lumen-2026-07",
        providerSecret: "sk_live_provider_secret",
        status: "paid",
        subscriptionId: "sub_lumen_provider"
      },
      provider: "demo-billing-provider",
      subscription: {
        billingPeriod: "monthly",
        cancelAtPeriodEnd: false,
        currency: "RUB",
        currentPeriodEnd: "2026-07-31T23:59:59.000Z",
        currentPeriodStart: "2026-07-01T00:00:00.000Z",
        id: "sub_lumen_provider",
        planId: "business",
        providerCustomerId: "provider-customer-lumen",
        providerSubscriptionId: "provider-subscription-lumen",
        seats: 32,
        status: "active",
        unitAmountMonthly: 129000
      },
      tenantId: "tenant-lumen"
    };

    const synced = await billing.syncProviderBillingState(payload);
    assert.equal(synced.status, "ok");
    assert.equal(synced.data.duplicate, false);
    assert.equal(synced.data.queue, "billing-sync");
    assert.match(synced.data.syncJobId, /^billing_sync_/);
    assert.equal(synced.data.subscription.planId, "business");
    assert.equal(synced.data.invoice.status, "paid");
    assert.equal(synced.data.invoice.paymentStatus, "succeeded");

    const duplicate = await billing.syncProviderBillingState(payload);
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.syncJobId, synced.data.syncJobId);

    const reusedKey = await billing.syncProviderBillingState({
      ...payload,
      invoice: {
        ...payload.invoice,
        amountPaid: 1
      }
    });
    assert.equal(reusedKey.status, "conflict");
    assert.equal(reusedKey.error?.code, "billing_provider_sync_idempotency_key_reused");

    const jobs = await repository.listBillingSyncJobs();
    assert.equal(jobs.filter((job) => job.id === synced.data.syncJobId).length, 1);
    const providerEvent = await repository.findProviderSyncEventByIdempotencyKey("provider-event-lumen-invoice-1");
    assert.deepEqual(providerEvent?.auditEvents?.map((event) => event.action), [
      "billing.provider_sync.accepted",
      "billing.provider_sync.duplicate"
    ]);
    assert.deepEqual(providerEvent?.auditEvents?.map((event) => event.immutable), [true, true]);
    assert.equal(providerEvent?.auditEvents?.[0]?.syncJobId, synced.data.syncJobId);
    assert.equal(providerEvent?.auditEvents?.[1]?.syncJobId, duplicate.data.syncJobId);
    assert.equal(JSON.stringify(providerEvent?.auditEvents).includes("providerInvoiceId"), false);
    assert.equal(JSON.stringify(providerEvent?.auditEvents).includes("providerSubscriptionId"), false);
    assert.equal(JSON.stringify(providerEvent?.auditEvents).includes("billing.example"), false);
    assert.equal(JSON.stringify(providerEvent?.auditEvents).includes("sk_live_provider_secret"), false);
  });

  it("applies manual payment overrides only after an approved tenant-scoped billing approval decision", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const approval = await repository.saveBillingApproval({
      approvalId: "payment-runtime-approval",
      createdAt: "2026-07-01T01:00:00.000Z",
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionReason: null,
      expiresAt: "2099-07-01T01:00:00.000Z",
      reason: "Approve manual invoice payment override after finance review",
      requestedBy: "svc-admin-1",
      requestedByName: "Service Admin",
      requestFingerprint: "sha256:payment-runtime-approval",
      status: "pending" as const,
      subjectId: "tenant-lumen:inv_lumen_manual_payment_override:invoice.payment_override",
      subjectType: "payment_action" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-payment-runtime-approval",
      updatedAt: "2026-07-01T01:00:00.000Z"
    });
    const payload = {
      approvalId: approval.approvalId,
      eventType: "invoice.payment_override",
      idempotencyKey: "provider-event-lumen-manual-payment-override",
      invoice: {
        amountDue: 129000,
        amountPaid: 129000,
        currency: "RUB",
        id: "inv_lumen_manual_payment_override",
        paidAt: "2026-07-01T01:15:00.000Z",
        paymentStatus: "succeeded",
        providerInvoiceId: "manual-payment-override-lumen",
        status: "paid"
      },
      provider: "manual-payment-override",
      tenantId: "tenant-lumen"
    };

    const pending = await billing.syncProviderBillingState(payload);
    assert.equal(pending.status, "invalid");
    assert.equal(pending.error?.code, "payment_approval_not_approved");
    assert.equal(pending.data.applied, false);
    assert.equal((await repository.findProviderSyncEventByIdempotencyKey(payload.idempotencyKey)), undefined);

    const decided = await repository.decideBillingApproval({
      approvalId: approval.approvalId,
      decidedAt: "2026-07-01T01:10:00.000Z",
      decidedBy: "svc-admin-2",
      decidedByName: "Finance Approver",
      decisionReason: "Finance confirmed the manual payment override",
      status: "approved",
      tenantId: "tenant-lumen",
      traceId: "trace-payment-runtime-approval-decision"
    });
    const applied = await billing.syncProviderBillingState({
      ...payload,
      approvalId: decided.approvalId
    });
    const event = await repository.findProviderSyncEventByIdempotencyKey(payload.idempotencyKey);

    assert.equal(applied.status, "ok");
    assert.equal(applied.data.invoice.paymentStatus, "succeeded");
    assert.equal(event?.payload.approvalId, approval.approvalId);
    assert.equal(event?.payload.invoice?.id, "inv_lumen_manual_payment_override");
  });

  it("replays invoice-only provider sync without timestamp drift conflicts", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.created",
      idempotencyKey: "provider-event-volga-invoice-only",
      invoice: {
        amountDue: 380000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_volga_provider_only",
        paymentStatus: "pending",
        providerInvoiceId: "provider-invoice-volga-only",
        status: "open"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-volga"
    };

    const synced = await billing.syncProviderBillingState(payload);
    assert.equal(synced.status, "ok");
    assert.equal(synced.data.duplicate, false);
    assert.equal(synced.data.invoice.id, "inv_volga_provider_only");
    assert.equal(synced.data.subscription, null);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const duplicate = await billing.syncProviderBillingState(payload);
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.syncJobId, synced.data.syncJobId);
    assert.equal(duplicate.data.invoice.id, "inv_volga_provider_only");
    assert.equal(duplicate.data.subscription, null);
    const providerEvent = await repository.findProviderSyncEventByIdempotencyKey("provider-event-volga-invoice-only");
    assert.deepEqual(providerEvent?.auditEvents?.map((event) => event.result), ["accepted", "duplicate"]);
  });

  it("creates a payment retry schedule when provider sync reports a failed invoice payment", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_failed",
      idempotencyKey: "provider-event-lumen-payment-failed-runtime",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_failed_runtime",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-failed-runtime",
        status: "past_due"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const synced = await billing.syncProviderBillingState(payload);
    const duplicate = await billing.syncProviderBillingState(payload);
    const schedules = await repository.listPaymentRetrySchedules({
      invoiceId: "inv_lumen_failed_runtime",
      tenantId: "tenant-lumen"
    });

    assert.equal(synced.status, "ok");
    assert.equal(duplicate.status, "ok");
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].attempt, 1);
    assert.equal(schedules[0].invoiceId, "inv_lumen_failed_runtime");
    assert.equal(schedules[0].maxAttempts, 4);
    assert.equal(schedules[0].providerInvoiceId, "provider-invoice-lumen-failed-runtime");
    assert.equal(schedules[0].scheduleId, "payment-retry:tenant-lumen:demo-billing-provider:provider-invoice-lumen-failed-runtime");
    assert.equal(schedules[0].status, "scheduled");
    assert.equal(schedules[0].tenantId, "tenant-lumen");
    assert.match(schedules[0].traceId, /^trc_billingService_syncProviderBillingState_/);
  });

  it("does not duplicate payment retry schedules when provider replay uses a new event key for the same invoice", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_failed",
      idempotencyKey: "provider-event-lumen-retry-duplicate-a",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_retry_duplicate",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-retry-duplicate",
        status: "past_due"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const first = await billing.syncProviderBillingState(payload);
    const replay = await billing.syncProviderBillingState({
      ...payload,
      idempotencyKey: "provider-event-lumen-retry-duplicate-b"
    });
    const schedules = await repository.listPaymentRetrySchedules({
      invoiceId: "inv_lumen_retry_duplicate",
      tenantId: "tenant-lumen"
    });

    assert.equal(first.status, "ok");
    assert.equal(replay.status, "ok");
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].scheduleId, "payment-retry:tenant-lumen:demo-billing-provider:provider-invoice-lumen-retry-duplicate");
    assert.equal(schedules[0].idempotencyKey, "payment-retry:tenant-lumen:demo-billing-provider:provider-invoice-lumen-retry-duplicate:provider-event-lumen-retry-duplicate-a");
  });

  it("does not create a new payment retry schedule when provider reuses an event key with a different invoice payload", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_failed",
      idempotencyKey: "provider-event-lumen-retry-conflict",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_retry_conflict",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-retry-conflict-a",
        status: "past_due"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const first = await billing.syncProviderBillingState(payload);
    const conflict = await billing.syncProviderBillingState({
      ...payload,
      invoice: {
        ...payload.invoice,
        providerInvoiceId: "provider-invoice-lumen-retry-conflict-b"
      }
    });
    const schedules = await repository.listPaymentRetrySchedules({ tenantId: "tenant-lumen" });

    assert.equal(first.status, "ok");
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "billing_provider_sync_idempotency_key_reused");
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].providerInvoiceId, "provider-invoice-lumen-retry-conflict-a");
  });

  it("creates payment dunning state when provider sync reports a failed invoice payment", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_failed",
      idempotencyKey: "provider-event-lumen-dunning-runtime",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_dunning_runtime",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-dunning-runtime",
        status: "past_due",
        subscriptionId: "sub_lumen_dunning_runtime"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const synced = await billing.syncProviderBillingState(payload);
    const duplicate = await billing.syncProviderBillingState(payload);
    const states = await repository.listPaymentDunningStates({
      invoiceId: "inv_lumen_dunning_runtime",
      tenantId: "tenant-lumen"
    });

    assert.equal(synced.status, "ok");
    assert.equal(duplicate.status, "ok");
    assert.equal(states.length, 1);
    assert.equal(states[0].dunningId, "payment-dunning:tenant-lumen:demo-billing-provider:provider-invoice-lumen-dunning-runtime");
    assert.equal(states[0].failedAttempts, 1);
    assert.equal(states[0].invoiceId, "inv_lumen_dunning_runtime");
    assert.equal(states[0].nextActionAt, null);
    assert.equal(states[0].providerInvoiceId, "provider-invoice-lumen-dunning-runtime");
    assert.equal(states[0].stage, "initial");
    assert.equal(states[0].status, "active");
    assert.equal(states[0].subscriptionId, "sub_lumen_dunning_runtime");
    assert.equal(states[0].tenantId, "tenant-lumen");
  });

  it("does not duplicate payment dunning state when provider replay uses a new event key for the same invoice", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_failed",
      idempotencyKey: "provider-event-lumen-dunning-duplicate-a",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_dunning_duplicate",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-dunning-duplicate",
        status: "past_due"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const first = await billing.syncProviderBillingState(payload);
    const replay = await billing.syncProviderBillingState({
      ...payload,
      idempotencyKey: "provider-event-lumen-dunning-duplicate-b"
    });
    const states = await repository.listPaymentDunningStates({
      invoiceId: "inv_lumen_dunning_duplicate",
      tenantId: "tenant-lumen"
    });

    assert.equal(first.status, "ok");
    assert.equal(replay.status, "ok");
    assert.equal(states.length, 1);
    assert.equal(states[0].dunningId, "payment-dunning:tenant-lumen:demo-billing-provider:provider-invoice-lumen-dunning-duplicate");
    assert.equal(states[0].idempotencyKey, "payment-dunning:tenant-lumen:demo-billing-provider:provider-invoice-lumen-dunning-duplicate:provider-event-lumen-dunning-duplicate-a");
    assert.equal(states[0].failedAttempts, 1);
  });

  it("does not create a new payment dunning state when provider reuses an event key with a different invoice payload", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_failed",
      idempotencyKey: "provider-event-lumen-dunning-conflict",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_dunning_conflict",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-dunning-conflict-a",
        status: "past_due"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const first = await billing.syncProviderBillingState(payload);
    const conflict = await billing.syncProviderBillingState({
      ...payload,
      invoice: {
        ...payload.invoice,
        providerInvoiceId: "provider-invoice-lumen-dunning-conflict-b"
      }
    });
    const states = await repository.listPaymentDunningStates({ tenantId: "tenant-lumen" });

    assert.equal(first.status, "ok");
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "billing_provider_sync_idempotency_key_reused");
    assert.equal(states.length, 1);
    assert.equal(states[0].providerInvoiceId, "provider-invoice-lumen-dunning-conflict-a");
    assert.equal(states[0].failedAttempts, 1);
  });

  it("creates an idempotent payment retry key when provider sync schedules a failed invoice retry", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_failed",
      idempotencyKey: "provider-event-lumen-retry-key-runtime",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_retry_key_runtime",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-retry-key-runtime",
        status: "past_due"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const synced = await billing.syncProviderBillingState(payload);
    const duplicate = await billing.syncProviderBillingState(payload);
    const keys = await repository.listPaymentRetryKeys({
      invoiceId: "inv_lumen_retry_key_runtime",
      tenantId: "tenant-lumen"
    });

    assert.equal(synced.status, "ok");
    assert.equal(duplicate.status, "ok");
    assert.equal(keys.length, 1);
    assert.equal(keys[0].attempt, 1);
    assert.equal(keys[0].invoiceId, "inv_lumen_retry_key_runtime");
    assert.equal(keys[0].retryKeyId, "payment-retry-key:tenant-lumen:demo-billing-provider:provider-invoice-lumen-retry-key-runtime:attempt-1");
    assert.equal(keys[0].scheduleId, "payment-retry:tenant-lumen:demo-billing-provider:provider-invoice-lumen-retry-key-runtime");
    assert.equal(keys[0].status, "claimed");
    assert.equal(keys[0].result.action, "schedule_retry");
    assert.equal(keys[0].result.scheduleId, "payment-retry:tenant-lumen:demo-billing-provider:provider-invoice-lumen-retry-key-runtime");
  });

  it("creates a reconciliation conflict when provider sync reports inconsistent invoice payment state", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_succeeded",
      idempotencyKey: "provider-event-lumen-reconciliation-runtime",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_reconciliation_runtime",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-reconciliation-runtime",
        status: "paid"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const synced = await billing.syncProviderBillingState(payload);
    const duplicate = await billing.syncProviderBillingState(payload);
    const conflicts = await repository.listReconciliationConflicts({
      invoiceId: "inv_lumen_reconciliation_runtime",
      tenantId: "tenant-lumen"
    });

    assert.equal(synced.status, "ok");
    assert.equal(duplicate.status, "ok");
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].conflictId, "reconciliation-conflict:tenant-lumen:demo-billing-provider:provider-invoice-lumen-reconciliation-runtime");
    assert.equal(conflicts[0].actual.amountPaid, 0);
    assert.equal(conflicts[0].actual.paymentStatus, "failed");
    assert.equal(conflicts[0].actual.status, "paid");
    assert.equal(conflicts[0].expected.amountPaid, 129000);
    assert.equal(conflicts[0].expected.paymentStatus, "succeeded");
    assert.equal(conflicts[0].reason, "provider_invoice_status_mismatch");
    assert.equal(conflicts[0].severity, "high");
    assert.equal(conflicts[0].status, "open");
    assert.equal(JSON.stringify(conflicts[0]).includes("providerSecret"), false);
  });

  it("does not duplicate reconciliation conflicts when provider replay uses a new event key for the same invoice", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_succeeded",
      idempotencyKey: "provider-event-lumen-reconciliation-duplicate-a",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_reconciliation_duplicate",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-reconciliation-duplicate",
        status: "paid"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const first = await billing.syncProviderBillingState(payload);
    const replay = await billing.syncProviderBillingState({
      ...payload,
      idempotencyKey: "provider-event-lumen-reconciliation-duplicate-b"
    });
    const conflicts = await repository.listReconciliationConflicts({
      invoiceId: "inv_lumen_reconciliation_duplicate",
      tenantId: "tenant-lumen"
    });

    assert.equal(first.status, "ok");
    assert.equal(replay.status, "ok");
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].conflictId, "reconciliation-conflict:tenant-lumen:demo-billing-provider:provider-invoice-lumen-reconciliation-duplicate");
    assert.equal(conflicts[0].idempotencyKey, "reconciliation-conflict:tenant-lumen:demo-billing-provider:provider-invoice-lumen-reconciliation-duplicate:provider-event-lumen-reconciliation-duplicate-a");
    assert.equal(conflicts[0].status, "open");
  });

  it("does not create a new reconciliation conflict when provider reuses an event key with a different invoice payload", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.payment_succeeded",
      idempotencyKey: "provider-event-lumen-reconciliation-conflict",
      invoice: {
        amountDue: 129000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_lumen_reconciliation_conflict",
        paymentStatus: "failed",
        providerInvoiceId: "provider-invoice-lumen-reconciliation-conflict-a",
        status: "paid"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-lumen"
    };

    const first = await billing.syncProviderBillingState(payload);
    const conflict = await billing.syncProviderBillingState({
      ...payload,
      invoice: {
        ...payload.invoice,
        providerInvoiceId: "provider-invoice-lumen-reconciliation-conflict-b"
      }
    });
    const conflicts = await repository.listReconciliationConflicts({ tenantId: "tenant-lumen" });

    assert.equal(first.status, "ok");
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "billing_provider_sync_idempotency_key_reused");
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].providerInvoiceId, "provider-invoice-lumen-reconciliation-conflict-a");
    assert.equal(conflicts[0].status, "open");
  });

  it("returns an error envelope when provider sync persistence fails after validation", async () => {
    const repository = BillingRepository.inMemory();
    repository.applyProviderBillingSync = async () => {
      throw new Error("postgres unavailable");
    };
    const billing = new BillingService(repository);

    const failed = await billing.syncProviderBillingState({
      eventType: "subscription.updated",
      idempotencyKey: "provider-event-lumen-fail",
      provider: "demo-billing-provider",
      subscription: {
        billingPeriod: "monthly",
        currentPeriodEnd: "2026-07-31T23:59:59.000Z",
        currentPeriodStart: "2026-07-01T00:00:00.000Z",
        id: "sub_lumen_provider",
        planId: "business",
        providerSubscriptionId: "provider-subscription-lumen",
        status: "active"
      },
      tenantId: "tenant-lumen"
    });

    assert.equal(failed.status, "error");
    assert.equal(failed.error?.code, "billing_provider_sync_persistence_failed");
    assert.equal(failed.data.idempotencyKey, "provider-event-lumen-fail");
    assert.equal(failed.data.queue, "billing-sync");
  });

  it("fails duplicate provider replay when audit append cannot be persisted", async () => {
    const repository = BillingRepository.inMemory();
    const billing = new BillingService(repository);
    const payload = {
      eventType: "invoice.created",
      idempotencyKey: "provider-event-audit-append-failure",
      invoice: {
        amountDue: 380000,
        amountPaid: 0,
        currency: "RUB",
        id: "inv_audit_append_failure",
        paymentStatus: "pending",
        providerInvoiceId: "provider-invoice-audit-append-failure",
        status: "open"
      },
      provider: "demo-billing-provider",
      tenantId: "tenant-volga"
    };

    const synced = await billing.syncProviderBillingState(payload);
    repository.appendProviderSyncAuditEvent = async () => undefined;

    const duplicate = await billing.syncProviderBillingState(payload);

    assert.equal(synced.status, "ok");
    assert.equal(duplicate.status, "error");
    assert.equal(duplicate.error?.code, "billing_provider_sync_audit_persistence_failed");
  });

  it("lists service-admin users with filters and tenant references", async () => {
    const support = new ServiceAdminService();

    const users = await support.fetchSupportUsers({
      query: "volga",
      status: "active",
      tenantId: "tenant-volga"
    });
    assert.equal(users.service, "supportAdminService");
    assert.equal(users.status, "ok");
    assert.equal(users.partial, true);
    assert.ok(users.data.items.every((user) => user.tenantId === "tenant-volga" && user.status === "active"));
    assert.ok(users.data.tenants.some((tenant) => tenant.id === "tenant-volga"));
  });

  it("requires reason and confirmation for privileged service-admin user actions", async () => {
    const support = new ServiceAdminService();

    const missingReason = await support.resetTwoFactor({
      userId: "usr-ns-agent",
      reason: "",
      confirmed: true
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "reason_required");

    const reset = await support.resetTwoFactor({
      userId: "usr-ns-agent",
      reason: "Phone replaced by employee",
      confirmed: true
    });
    assert.equal(reset.status, "ok");
    assert.equal(reset.data.user.mfa, "reset_pending");
    assert.equal(reset.data.confirmationRequired, true);
    assert.equal(reset.data.auditEvent.action, "user.mfa.reset");
    assert.equal(reset.data.auditEvent.immutable, true);

    const logout = await support.forceLogout({
      userId: "usr-volga-admin",
      reason: "Security incident response",
      confirmed: true
    });
    assert.equal(logout.data.user.sessions, 0);
    assert.equal(logout.data.auditEvent.action, "user.sessions.logout");

    const blocked = await support.blockUser({
      userId: "usr-volga-admin",
      reason: "Confirmed account compromise",
      confirmed: true
    });
    assert.equal(blocked.data.user.status, "blocked");
    assert.equal(blocked.data.auditEvent.action, "user.block");

    const unblocked = await support.unblockUser({
      userId: "usr-volga-admin",
      reason: "Verified recovery complete",
      confirmed: true
    });
    assert.equal(unblocked.data.user.status, "active");
    assert.equal(unblocked.data.auditEvent.action, "user.unblock");

    const invite = await support.resendInvite({
      userId: "usr-lumen-invite",
      reason: "User requested invite resend",
      confirmed: true
    });
    assert.equal(invite.data.user.inviteStatus, "sent");
    assert.equal(invite.data.auditEvent.action, "user.invite.resend");
  });

  it("returns error envelopes when service-admin user action persistence fails after validation", async () => {
    const repository = IdentityRepository.inMemory();
    repository.applyServiceAdminUserAction = async () => {
      throw new Error("postgres unavailable");
    };
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    const failed = await support.blockUser({
      confirmed: true,
      reason: "Confirmed account compromise",
      userId: "usr-volga-admin"
    });

    assert.equal(failed.status, "error");
    assert.equal(failed.error?.code, "service_admin_persistence_failed");
    assert.equal(failed.data.action, "user.block");
    assert.equal(failed.data.auditEvent.result, "failed");
    assert.equal(failed.data.tenantId, "tenant-volga");
    assert.equal(failed.data.userId, "usr-volga-admin");
  });

  it("returns error envelopes when denied-attempt audit persistence fails", async () => {
    const repository = IdentityRepository.inMemory();
    repository.recordServiceAdminAuditEvent = async () => {
      throw new Error("audit down");
    };
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    const failed = await support.blockUser({
      confirmed: true,
      reason: "",
      userId: "usr-volga-admin"
    });

    assert.equal(failed.status, "error");
    assert.equal(failed.error?.code, "service_admin_persistence_failed");
    assert.equal(failed.data.action, "user.block");
    assert.equal(failed.data.auditEvent.result, "failed");
    assert.equal(failed.data.tenantId, "tenant-volga");
    assert.equal(failed.data.userId, "usr-volga-admin");
  });

  it("returns error envelopes when pre-validation probe audit persistence fails", async () => {
    const repository = IdentityRepository.inMemory();
    repository.recordServiceAdminAuditEvent = async () => {
      throw new Error("audit down");
    };
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    const failed = await support.stopImpersonation({
      impersonationId: "imp_missing_probe_failure",
      reason: "Investigate missing impersonation"
    });

    assert.equal(failed.status, "error");
    assert.equal(failed.error?.code, "service_admin_persistence_failed");
    assert.equal(failed.data.action, "impersonation.stop");
    assert.equal(failed.data.auditEvent.result, "failed");
    assert.equal(failed.data.target, "imp_missing_probe_failure");
  });

  it("records durable pre-validation probe audit events for missing service-admin targets", async () => {
    const repository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    const missingUserAction = await support.blockUser({
      confirmed: true,
      reason: "Investigate missing user",
      userId: "usr-missing"
    });
    assert.equal(missingUserAction.status, "not_found");
    assert.equal(missingUserAction.error?.code, "user_not_found");
    assert.equal(missingUserAction.data.auditEvent.action, "user.block");
    assert.equal(missingUserAction.data.auditEvent.result, "blocked_user_not_found");
    assert.equal(missingUserAction.data.auditEvent.target, "usr-missing");
    assert.equal(missingUserAction.data.auditEvent.userId, "usr-missing");

    const missingTenantStart = await support.startImpersonation({
      confirmed: true,
      reason: "Investigate missing tenant",
      tenantId: "tenant-missing",
      userId: "usr-missing"
    });
    assert.equal(missingTenantStart.status, "not_found");
    assert.equal(missingTenantStart.error?.code, "tenant_not_found");
    assert.equal(missingTenantStart.data.auditEvent.action, "impersonation.start");
    assert.equal(missingTenantStart.data.auditEvent.result, "blocked_tenant_not_found");
    assert.equal(missingTenantStart.data.auditEvent.target, "tenant-missing");
    assert.equal(missingTenantStart.data.auditEvent.tenantId, "tenant-missing");
    assert.equal(missingTenantStart.data.auditEvent.userId, "usr-missing");

    const missingUserStart = await support.startImpersonation({
      confirmed: true,
      reason: "Investigate missing user",
      tenantId: "tenant-volga",
      userId: "usr-missing"
    });
    assert.equal(missingUserStart.status, "not_found");
    assert.equal(missingUserStart.error?.code, "user_not_found");
    assert.equal(missingUserStart.data.auditEvent.result, "blocked_user_not_found");
    assert.equal(missingUserStart.data.auditEvent.target, "usr-missing");
    assert.equal(missingUserStart.data.auditEvent.tenantId, "tenant-volga");
    assert.equal(missingUserStart.data.auditEvent.userId, "usr-missing");

    const missingStop = await support.stopImpersonation({
      impersonationId: "imp_missing_probe",
      reason: "Investigate missing impersonation"
    });
    assert.equal(missingStop.status, "not_found");
    assert.equal(missingStop.error?.code, "impersonation_not_found");
    assert.equal(missingStop.data.auditEvent.action, "impersonation.stop");
    assert.equal(missingStop.data.auditEvent.result, "blocked_impersonation_not_found");
    assert.equal(missingStop.data.auditEvent.target, "imp_missing_probe");

    const missingBreakGlassTenant = await support.requestBreakGlassApproval({
      confirmed: true,
      reason: "Investigate missing tenant",
      tenantId: "tenant-missing"
    });
    assert.equal(missingBreakGlassTenant.status, "not_found");
    assert.equal(missingBreakGlassTenant.error?.code, "tenant_not_found");
    assert.equal(missingBreakGlassTenant.data.auditEvent.action, "break_glass.request");
    assert.equal(missingBreakGlassTenant.data.auditEvent.result, "blocked_tenant_not_found");
    assert.equal(missingBreakGlassTenant.data.auditEvent.target, "tenant-missing");
    assert.equal(missingBreakGlassTenant.data.auditEvent.tenantId, "tenant-missing");

    const missingBreakGlassUser = await support.requestBreakGlassApproval({
      confirmed: true,
      reason: "Investigate missing approval user",
      userId: "usr-missing"
    });
    assert.equal(missingBreakGlassUser.status, "not_found");
    assert.equal(missingBreakGlassUser.error?.code, "user_not_found");
    assert.equal(missingBreakGlassUser.data.auditEvent.result, "blocked_user_not_found");
    assert.equal(missingBreakGlassUser.data.auditEvent.target, "usr-missing");
    assert.equal(missingBreakGlassUser.data.auditEvent.userId, "usr-missing");

    const missingDecision = await support.decideBreakGlassApproval({
      approvalId: "bg_missing_probe",
      confirmed: true,
      decision: "approved",
      reason: "Investigate missing approval"
    });
    assert.equal(missingDecision.status, "not_found");
    assert.equal(missingDecision.error?.code, "break_glass_approval_not_found");
    assert.equal(missingDecision.data.auditEvent.action, "break_glass.decision");
    assert.equal(missingDecision.data.auditEvent.result, "blocked_break_glass_approval_not_found");
    assert.equal(missingDecision.data.auditEvent.target, "bg_missing_probe");

    const missingWriteApproval = await support.startImpersonation({
      approvalId: "bg_missing_write_probe",
      confirmed: true,
      reason: "Investigate missing write approval",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin",
      writeAccess: true
    });
    assert.equal(missingWriteApproval.status, "not_found");
    assert.equal(missingWriteApproval.error?.code, "break_glass_approval_not_found");
    assert.equal(missingWriteApproval.data.auditEvent.action, "impersonation.start");
    assert.equal(missingWriteApproval.data.auditEvent.result, "blocked_break_glass_approval_not_found");
    assert.equal(missingWriteApproval.data.auditEvent.target, "bg_missing_write_probe");
    assert.equal(missingWriteApproval.data.auditEvent.tenantId, "tenant-volga");
    assert.equal(missingWriteApproval.data.auditEvent.userId, "usr-volga-admin");

    const audit = await support.fetchAuditEvents({});
    const persistedIds = new Set(audit.data.items.map((event) => event.id));
    for (const envelope of [
      missingUserAction,
      missingTenantStart,
      missingUserStart,
      missingStop,
      missingBreakGlassTenant,
      missingBreakGlassUser,
      missingDecision,
      missingWriteApproval
    ]) {
      assert.equal(persistedIds.has(envelope.data.auditEvent.id), true);
    }
  });

  it("returns error envelopes when service-admin impersonation persistence fails after validation", async () => {
    const repository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    repository.createServiceAdminImpersonation = async () => {
      throw new Error("postgres unavailable");
    };
    const startFailed = await support.startImpersonation({
      confirmed: true,
      reason: "Customer approved webhook replay check",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    assert.equal(startFailed.status, "error");
    assert.equal(startFailed.error?.code, "service_admin_persistence_failed");
    assert.equal(startFailed.data.action, "impersonation.start");
    assert.equal(startFailed.data.auditEvent.result, "failed");
    assert.equal(startFailed.data.tenantId, "tenant-volga");
    assert.equal(startFailed.data.userId, "usr-volga-admin");

    const seedImpersonationRepository = IdentityRepository.inMemory();
    const started = await seedImpersonationRepository.createServiceAdminImpersonation({
      auditEvent: {
        action: "impersonation.start",
        actor: "service-admin",
        actorName: "Service Admin",
        at: "2026-06-28T00:00:00.000Z",
        id: "evt_impersonation_stop_failure_seed",
        immutable: true,
        reason: "Seed active impersonation",
        result: "started",
        severity: "critical",
        target: "imp_stop_failure_seed",
        tenantId: "tenant-volga",
        traceId: "trc_impersonation_stop_failure_seed",
        userId: "usr-volga-admin"
      },
      session: {
        approvalId: null,
        banner: "Read-only support view for Volga Logistics",
        durationMinutes: 15,
        expiresAt: "2099-01-01T00:15:00.000Z",
        id: "imp_stop_failure_seed",
        mode: "read_only_by_default",
        startedAt: "2099-01-01T00:00:00.000Z",
        stoppedAt: null,
        stopAuditEvent: null,
        tenantId: "tenant-volga",
        tenantName: "Volga Logistics",
        userId: "usr-volga-admin",
        userName: "Sergey Volga"
      }
    });
    repository.findServiceAdminImpersonation = async () => started.session;
    repository.stopServiceAdminImpersonation = async () => {
      throw new Error("postgres unavailable");
    };

    const stopFailed = await support.stopImpersonation({
      impersonationId: "imp_stop_failure_seed",
      reason: "Customer approved stop check"
    });
    assert.equal(stopFailed.status, "error");
    assert.equal(stopFailed.error?.code, "service_admin_persistence_failed");
    assert.equal(stopFailed.data.action, "impersonation.stop");
    assert.equal(stopFailed.data.auditEvent.result, "failed");
    assert.equal(stopFailed.data.impersonationId, "imp_stop_failure_seed");
  });

  it("returns error envelopes when break-glass persistence fails after validation", async () => {
    const repository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    repository.createBreakGlassApproval = async () => {
      throw new Error("postgres unavailable");
    };
    const requestFailed = await support.requestBreakGlassApproval({
      confirmed: true,
      reason: "Emergency user account investigation",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    assert.equal(requestFailed.status, "error");
    assert.equal(requestFailed.error?.code, "service_admin_persistence_failed");
    assert.equal(requestFailed.data.action, "break_glass.request");
    assert.equal(requestFailed.data.auditEvent.result, "failed");
    assert.equal(requestFailed.data.tenantId, "tenant-volga");
    assert.equal(requestFailed.data.userId, "usr-volga-admin");

    const seedBreakGlassRepository = IdentityRepository.inMemory();
    await seedBreakGlassRepository.createBreakGlassApproval({
      approval: {
        action: "impersonation.write",
        auditEventId: "evt_break_glass_decision_failure_seed",
        durationMinutes: 15,
        expiresAt: "2099-01-01T00:15:00.000Z",
        id: "bg_decision_failure_seed",
        requestedAt: "2099-01-01T00:00:00.000Z",
        status: "pending",
        target: "usr-volga-admin",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      },
      auditEvent: {
        action: "break_glass.request",
        actor: "service-admin",
        actorName: "Service Admin",
        at: "2099-01-01T00:00:00.000Z",
        id: "evt_break_glass_decision_failure_seed",
        immutable: true,
        reason: "Seed decision failure approval",
        result: "pending",
        severity: "critical",
        target: "usr-volga-admin",
        tenantId: "tenant-volga",
        traceId: "trc_break_glass_decision_failure_seed",
        userId: "usr-volga-admin"
      }
    });
    repository.findBreakGlassApproval = async () => ({
      action: "impersonation.write",
      auditEventId: "evt_break_glass_decision_failure_seed",
      durationMinutes: 15,
      expiresAt: "2099-01-01T00:15:00.000Z",
      id: "bg_decision_failure_seed",
      requestedAt: "2099-01-01T00:00:00.000Z",
      status: "pending",
      target: "usr-volga-admin",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    repository.decideBreakGlassApproval = async () => {
      throw new Error("postgres unavailable");
    };

    const decisionFailed = await support.decideBreakGlassApproval({
      approvalId: "bg_decision_failure_seed",
      confirmed: true,
      decision: "approved",
      reason: "Manager approved emergency access"
    });
    assert.equal(decisionFailed.status, "error");
    assert.equal(decisionFailed.error?.code, "service_admin_persistence_failed");
    assert.equal(decisionFailed.data.action, "break_glass.approve");
    assert.equal(decisionFailed.data.auditEvent.result, "failed");
    assert.equal(decisionFailed.data.approvalId, "bg_decision_failure_seed");
  });

  it("starts read-only impersonation and queues break-glass approval without granting write access", async () => {
    const support = new ServiceAdminService();

    const missingConfirmation = await support.startImpersonation({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin",
      reason: "Customer approved webhook replay check"
    });
    assert.equal(missingConfirmation.status, "invalid");
    assert.equal(missingConfirmation.error?.code, "confirmation_required");

    const impersonation = await support.startImpersonation({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin",
      reason: "Customer approved webhook replay check",
      confirmed: true,
      durationMinutes: 15
    });
    assert.equal(impersonation.status, "ok");
    assert.match(impersonation.data.impersonation.id, /^imp_tenant-volga_/);
    assert.equal(impersonation.data.impersonation.mode, "read_only_by_default");
    assert.equal(impersonation.data.impersonation.approvalId, null);
    assert.match(impersonation.data.impersonation.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(impersonation.data.auditEvent.action, "impersonation.start");

    const duplicateImpersonation = await support.startImpersonation({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin",
      reason: "Customer approved webhook replay check",
      confirmed: true,
      durationMinutes: 15
    });
    assert.equal(duplicateImpersonation.status, "ok");
    assert.equal(duplicateImpersonation.data.duplicate, true);
    assert.equal(duplicateImpersonation.data.impersonation.id, impersonation.data.impersonation.id);

    const breakGlass = await support.requestBreakGlassApproval({
      tenantId: "tenant-volga",
      reason: "Emergency billing investigation",
      confirmed: true
    });
    assert.equal(breakGlass.status, "ok");
    assert.equal(breakGlass.data.approval.status, "pending");
    assert.equal(breakGlass.data.access.writeGranted, false);
    assert.match(breakGlass.data.auditEvent.id, /^evt_break_glass_/);

    const userScopedBreakGlass = await support.requestBreakGlassApproval({
      userId: "usr-volga-admin",
      reason: "Emergency user account investigation",
      confirmed: true
    });
    assert.equal(userScopedBreakGlass.status, "ok");
    assert.equal(userScopedBreakGlass.data.auditEvent.tenantId, "tenant-volga");

    const approvedBreakGlass = await support.decideBreakGlassApproval({
      approvalId: breakGlass.data.approval.id,
      confirmed: true,
      decision: "approved",
      reason: "Manager approved emergency access"
    });
    assert.equal(approvedBreakGlass.status, "ok");
    assert.equal(approvedBreakGlass.data.approval.status, "approved");
    assert.equal(approvedBreakGlass.data.auditEvent.action, "break_glass.approve");
    assert.equal(approvedBreakGlass.data.auditEvent.target, breakGlass.data.approval.id);
    assert.equal(approvedBreakGlass.data.access.writeGranted, true);

    const duplicateApproval = await support.decideBreakGlassApproval({
      approvalId: breakGlass.data.approval.id,
      confirmed: true,
      decision: "approved",
      reason: "Manager approved emergency access again"
    });
    assert.equal(duplicateApproval.status, "ok");
    assert.equal(duplicateApproval.data.duplicate, true);
    assert.equal(duplicateApproval.data.approval.status, "approved");
    assert.equal(duplicateApproval.data.auditEvent.action, "break_glass.approve");
    assert.equal(duplicateApproval.data.auditEvent.result, "duplicate");

    const approveAudit = await support.fetchAuditEvents({
      action: "break_glass.approve",
      target: breakGlass.data.approval.id
    });
    assert.equal(approveAudit.data.items.length, 2);
    assert.equal(approveAudit.data.items.some((event) => event.id === duplicateApproval.data.auditEvent.id && event.result === "duplicate"), true);

    const conflictingDecision = await support.decideBreakGlassApproval({
      approvalId: breakGlass.data.approval.id,
      confirmed: true,
      decision: "rejected",
      reason: "Manager changed decision"
    });
    assert.equal(conflictingDecision.status, "conflict");
    assert.equal(conflictingDecision.error?.code, "break_glass_approval_already_decided");

    const rejectedBreakGlass = await support.decideBreakGlassApproval({
      approvalId: userScopedBreakGlass.data.approval.id,
      confirmed: true,
      decision: "rejected",
      reason: "Manager rejected emergency access"
    });
    assert.equal(rejectedBreakGlass.status, "ok");
    assert.equal(rejectedBreakGlass.data.approval.status, "rejected");
    assert.equal(rejectedBreakGlass.data.auditEvent.action, "break_glass.reject");
    assert.equal(rejectedBreakGlass.data.access.writeGranted, false);

    const repository = IdentityRepository.inMemory();
    await repository.createBreakGlassApproval({
      approval: {
        action: "impersonation.write",
        auditEventId: "evt_expired_break_glass_request",
        durationMinutes: 5,
        expiresAt: "2026-06-28T00:00:00.000Z",
        id: "bg_expired_test",
        requestedAt: "2026-06-27T23:55:00.000Z",
        status: "pending",
        target: "usr-volga-admin",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      },
      auditEvent: {
        action: "break_glass.request",
        actor: "service-admin",
        actorName: "Service Admin",
        at: "2026-06-27T23:55:00.000Z",
        id: "evt_expired_break_glass_request",
        immutable: true,
        reason: "Expired emergency user check",
        result: "pending",
        severity: "critical",
        target: "usr-volga-admin",
        tenantId: "tenant-volga",
        traceId: "trc_expired_break_glass",
        userId: "usr-volga-admin"
      }
    });
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const expiredSupport = new ServiceAdminWithRepository(repository);
    const expiredDecision = await expiredSupport.decideBreakGlassApproval({
      approvalId: "bg_expired_test",
      confirmed: true,
      decision: "approved",
      reason: "Manager approved expired request"
    });
    assert.equal(expiredDecision.status, "invalid");
    assert.equal(expiredDecision.error?.code, "break_glass_approval_expired");
    assert.equal(expiredDecision.data.approval.status, "expired");
    assert.equal(expiredDecision.data.access.writeGranted, false);

    const stop = await support.stopImpersonation({
      impersonationId: impersonation.data.impersonation.id,
      reason: "QA exit reason"
    });
    assert.equal(stop.status, "ok");
    assert.equal(stop.data.auditEvent.action, "impersonation.stop");

    const duplicateStop = await support.stopImpersonation({
      impersonationId: impersonation.data.impersonation.id,
      reason: "QA exit reason repeated"
    });
    assert.equal(duplicateStop.status, "ok");
    assert.equal(duplicateStop.data.duplicate, true);
    assert.equal(duplicateStop.data.auditEvent.action, "impersonation.stop");
    assert.equal(duplicateStop.data.auditEvent.result, "duplicate");
    assert.notEqual(duplicateStop.data.auditEvent.id, stop.data.auditEvent.id);
    assert.equal(duplicateStop.data.stoppedAt, stop.data.stoppedAt);
  });

  it("persists service-admin impersonation and break-glass audit evidence as immutable mutation records", async () => {
    const repository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    const impersonation = await support.startImpersonation({
      confirmed: true,
      durationMinutes: 15,
      reason: "Customer approved webhook replay check",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    assert.equal(impersonation.status, "ok");

    const duplicateImpersonation = await support.startImpersonation({
      confirmed: true,
      durationMinutes: 15,
      reason: "Customer approved webhook replay check",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    assert.equal(duplicateImpersonation.status, "ok");
    assert.equal(duplicateImpersonation.data.duplicate, true);

    const breakGlass = await support.requestBreakGlassApproval({
      confirmed: true,
      reason: "Emergency billing investigation",
      tenantId: "tenant-volga"
    });
    assert.equal(breakGlass.status, "ok");

    const approvedBreakGlass = await support.decideBreakGlassApproval({
      approvalId: breakGlass.data.approval.id,
      confirmed: true,
      decision: "approved",
      reason: "Manager approved emergency access"
    });
    assert.equal(approvedBreakGlass.status, "ok");

    const userScopedBreakGlass = await support.requestBreakGlassApproval({
      confirmed: true,
      reason: "Emergency user account investigation",
      userId: "usr-volga-admin"
    });
    assert.equal(userScopedBreakGlass.status, "ok");

    const rejectedBreakGlass = await support.decideBreakGlassApproval({
      approvalId: userScopedBreakGlass.data.approval.id,
      confirmed: true,
      decision: "rejected",
      reason: "Manager rejected emergency access"
    });
    assert.equal(rejectedBreakGlass.status, "ok");

    const stop = await support.stopImpersonation({
      impersonationId: impersonation.data.impersonation.id,
      reason: "QA exit reason"
    });
    assert.equal(stop.status, "ok");

    const duplicateStop = await support.stopImpersonation({
      impersonationId: impersonation.data.impersonation.id,
      reason: "QA exit reason repeated"
    });
    assert.equal(duplicateStop.status, "ok");
    assert.equal(duplicateStop.data.duplicate, true);

    const auditEvents = await repository.listServiceAdminAuditEvents();
    const persistedById = new Map(auditEvents.map((event) => [event.id, event]));
    for (const event of [
      impersonation.data.auditEvent,
      duplicateImpersonation.data.auditEvent,
      breakGlass.data.auditEvent,
      approvedBreakGlass.data.auditEvent,
      userScopedBreakGlass.data.auditEvent,
      rejectedBreakGlass.data.auditEvent,
      stop.data.auditEvent,
      duplicateStop.data.auditEvent
    ]) {
      const persisted = persistedById.get(event.id);
      assert.ok(persisted, `${event.action} audit event must be persisted`);
      assert.equal(persisted.immutable, true);
      assert.equal(persisted.action, event.action);
      assert.equal(persisted.result, event.result);
      assert.equal(persisted.target, event.target);
      assert.equal(persisted.tenantId, event.tenantId);
      assert.equal(persisted.userId, event.userId);
    }

    const persistedSession = await repository.findServiceAdminImpersonation(impersonation.data.impersonation.id as string);
    assert.equal(persistedSession?.auditEventId, impersonation.data.auditEvent.id);
    assert.equal(persistedSession?.stopAuditEvent?.id, stop.data.auditEvent.id);

    const persistedBreakGlass = await repository.findBreakGlassApproval(breakGlass.data.approval.id as string);
    assert.equal(persistedBreakGlass?.auditEventId, breakGlass.data.auditEvent.id);
    assert.equal(persistedById.get(approvedBreakGlass.data.auditEvent.id)?.immutable, true);
  });

  it("binds service-admin impersonation routes to the approved tenant context", async () => {
    const repository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    const impersonation = await startServiceAdminImpersonationFromRoute(support, {
      confirmed: true,
      durationMinutes: 15,
      reason: "Customer approved webhook replay check",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-admin-scoped",
          name: "Scoped Service Admin"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["impersonation.start"],
        roles: ["admin"],
        sessionId: "sess-scoped-tenant"
      }
    });

    assert.equal(impersonation.status, "ok");
    assert.equal(impersonation.data.impersonation.tenantId, "tenant-volga");
    assert.equal(impersonation.data.impersonation.userId, "usr-volga-admin");
    assert.match(impersonation.data.impersonation.id, /^imp_tenant-volga_/);
    assert.equal(impersonation.data.auditEvent.actor, "svc-admin-scoped");
    assert.equal(impersonation.data.auditEvent.tenantId, "tenant-volga");

    const missingTenantScope = await startServiceAdminImpersonationFromRoute(support, {
      confirmed: true,
      durationMinutes: 15,
      reason: "Customer approved webhook replay check",
      userId: "usr-volga-admin"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-admin-unscoped",
          name: "Unscoped Service Admin"
        },
        permissions: ["impersonation.start"],
        sessionId: "sess-without-tenant"
      }
    });

    assert.equal(missingTenantScope.status, "invalid");
    assert.equal(missingTenantScope.error?.code, "service_admin_tenant_scope_required");
    assert.equal(missingTenantScope.data.actorId, "svc-admin-unscoped");
    assert.equal(missingTenantScope.data.rejectedTenantId, null);
    assert.equal((await repository.findActiveServiceAdminImpersonation({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    }))?.id, impersonation.data.impersonation.id);
  });

  it("binds service-admin write impersonation approval routes to the approved tenant context", async () => {
    const repository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);
    const request = {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-admin-lumen",
          name: "Lumen Service Admin"
        },
        currentTenantId: "tenant-lumen",
        permissions: ["break-glass.request", "impersonation.start"],
        roles: ["admin"],
        sessionId: "sess-lumen-tenant"
      }
    };

    const approval = await requestServiceAdminBreakGlassApprovalFromRoute(support, {
      confirmed: true,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }, request);

    assert.equal(approval.status, "ok");
    assert.equal(approval.data.approval.tenantId, "tenant-lumen");
    assert.equal(approval.data.approval.userId, "usr-lumen-invite");
    assert.equal(approval.data.auditEvent.tenantId, "tenant-lumen");

    const approved = await support.decideBreakGlassApproval({
      approvalId: approval.data.approval.id,
      confirmed: true,
      decision: "approved",
      reason: "Manager approved emergency write access"
    });
    assert.equal(approved.status, "ok");

    const writeImpersonation = await startServiceAdminImpersonationFromRoute(support, {
      approvalId: approval.data.approval.id,
      confirmed: true,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite",
      writeAccess: true
    }, request);

    assert.equal(writeImpersonation.status, "ok");
    assert.equal(writeImpersonation.data.impersonation.tenantId, "tenant-lumen");
    assert.equal(writeImpersonation.data.impersonation.userId, "usr-lumen-invite");
    assert.equal(writeImpersonation.data.access.writeGranted, true);
    assert.equal(writeImpersonation.data.access.approvalId, approval.data.approval.id);

    const missingTenantScopeApproval = await requestServiceAdminBreakGlassApprovalFromRoute(support, {
      confirmed: true,
      reason: "Emergency invite delivery correction",
      userId: "usr-lumen-invite"
    }, {
      headers: {},
      serviceAdminContext: {
        actor: {
          id: "svc-admin-unscoped",
          name: "Unscoped Service Admin"
        },
        permissions: ["break-glass.request"],
        sessionId: "sess-without-tenant"
      }
    });

    assert.equal(missingTenantScopeApproval.status, "invalid");
    assert.equal(missingTenantScopeApproval.error?.code, "service_admin_tenant_scope_required");
    assert.equal(missingTenantScopeApproval.data.actorId, "svc-admin-unscoped");
    assert.equal(missingTenantScopeApproval.data.rejectedTenantId, null);
  });

  it("starts write impersonation only with a matching approved break-glass approval", async () => {
    const repository = IdentityRepository.inMemory();
    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    const missingApproval = await support.startImpersonation({
      confirmed: true,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite",
      writeAccess: true
    });
    assert.equal(missingApproval.status, "invalid");
    assert.equal(missingApproval.error?.code, "break_glass_approval_required");

    const pendingApproval = await support.requestBreakGlassApproval({
      confirmed: true,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    });
    assert.equal(pendingApproval.status, "ok");

    const approvalIdOnlyWrite = await support.startImpersonation({
      approvalId: pendingApproval.data.approval.id,
      confirmed: true,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    });
    assert.equal(approvalIdOnlyWrite.status, "invalid");
    assert.equal(approvalIdOnlyWrite.error?.code, "break_glass_approval_not_approved");

    const pendingWrite = await support.startImpersonation({
      approvalId: pendingApproval.data.approval.id,
      confirmed: true,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite",
      writeAccess: true
    });
    assert.equal(pendingWrite.status, "invalid");
    assert.equal(pendingWrite.error?.code, "break_glass_approval_not_approved");

    const approvedApproval = await support.decideBreakGlassApproval({
      approvalId: pendingApproval.data.approval.id,
      confirmed: true,
      decision: "approved",
      reason: "Manager approved emergency write access"
    });
    assert.equal(approvedApproval.status, "ok");

    const wrongScope = await support.startImpersonation({
      approvalId: pendingApproval.data.approval.id,
      confirmed: true,
      reason: "Emergency account remediation",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin",
      writeAccess: true
    });
    assert.equal(wrongScope.status, "invalid");
    assert.equal(wrongScope.error?.code, "break_glass_approval_scope_mismatch");

    const wrongActionApproval = await support.requestBreakGlassApproval({
      action: "billing.write",
      confirmed: true,
      reason: "Emergency billing change review",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const wrongActionDecision = await support.decideBreakGlassApproval({
      approvalId: wrongActionApproval.data.approval.id,
      confirmed: true,
      decision: "approved",
      reason: "Manager approved billing-only access"
    });
    assert.equal(wrongActionDecision.status, "ok");
    assert.equal(wrongActionDecision.data.access.writeGranted, false);
    const wrongAction = await support.startImpersonation({
      approvalId: wrongActionApproval.data.approval.id,
      confirmed: true,
      reason: "Emergency account remediation",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin",
      writeAccess: true
    });
    assert.equal(wrongAction.status, "invalid");
    assert.equal(wrongAction.error?.code, "break_glass_approval_action_mismatch");

    await repository.createBreakGlassApproval({
      approval: {
        action: "impersonation.write",
        auditEventId: "evt_expired_approved_break_glass_request",
        durationMinutes: 5,
        expiresAt: "2000-01-01T00:05:00.000Z",
        id: "bg_expired_approved_test",
        requestedAt: "2000-01-01T00:00:00.000Z",
        status: "approved",
        target: "usr-volga-admin",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      },
      auditEvent: {
        action: "break_glass.request",
        actor: "service-admin",
        actorName: "Service Admin",
        at: "2000-01-01T00:00:00.000Z",
        id: "evt_expired_approved_break_glass_request",
        immutable: true,
        reason: "Expired approved emergency user check",
        result: "pending",
        severity: "critical",
        target: "usr-volga-admin",
        tenantId: "tenant-volga",
        traceId: "trc_expired_approved_break_glass",
        userId: "usr-volga-admin"
      }
    });
    const expiredDuplicateDecision = await support.decideBreakGlassApproval({
      approvalId: "bg_expired_approved_test",
      confirmed: true,
      decision: "approved",
      reason: "Manager confirmed expired decision"
    });
    assert.equal(expiredDuplicateDecision.status, "ok");
    assert.equal(expiredDuplicateDecision.data.duplicate, true);
    assert.equal(expiredDuplicateDecision.data.access.writeGranted, false);
    const expiredApproval = await support.startImpersonation({
      approvalId: "bg_expired_approved_test",
      confirmed: true,
      reason: "Emergency account remediation",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin",
      writeAccess: true
    });
    assert.equal(expiredApproval.status, "invalid");
    assert.equal(expiredApproval.error?.code, "break_glass_approval_expired");

    const writeImpersonation = await support.startImpersonation({
      approvalId: pendingApproval.data.approval.id,
      confirmed: true,
      durationMinutes: 15,
      reason: "Emergency invite delivery correction",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite",
      writeAccess: true
    });
    assert.equal(writeImpersonation.status, "ok");
    assert.equal(writeImpersonation.data.access.readOnly, false);
    assert.equal(writeImpersonation.data.access.writeGranted, true);
    assert.equal(writeImpersonation.data.access.approvalId, pendingApproval.data.approval.id);
    assert.equal(writeImpersonation.data.impersonation.approvalId, pendingApproval.data.approval.id);
    assert.equal(writeImpersonation.data.impersonation.mode, "break_glass_write");
    assert.match(writeImpersonation.data.impersonation.banner, /write access/i);

    const duplicateWrite = await support.startImpersonation({
      approvalId: pendingApproval.data.approval.id,
      confirmed: true,
      durationMinutes: 15,
      reason: "Emergency invite delivery correction repeated",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite",
      writeAccess: true
    });
    assert.equal(duplicateWrite.status, "ok");
    assert.equal(duplicateWrite.data.duplicate, true);
    assert.equal(duplicateWrite.data.access.writeGranted, true);
    assert.equal(duplicateWrite.data.impersonation.approvalId, pendingApproval.data.approval.id);
    assert.equal(duplicateWrite.data.impersonation.id, writeImpersonation.data.impersonation.id);
    assert.equal(duplicateWrite.data.impersonation.mode, "break_glass_write");
  });

  it("returns a conflict envelope when the repository rejects a raced active impersonation create", async () => {
    const repository = IdentityRepository.inMemory();
    const originalFindActive = repository.findActiveServiceAdminImpersonation.bind(repository);
    const originalFindTenantUser = repository.findTenantUser.bind(repository);
    const originalListAuditEvents = repository.listServiceAdminAuditEvents.bind(repository);

    Object.assign(repository, {
      findActiveServiceAdminImpersonation: () => undefined,
      findTenantUser: originalFindTenantUser,
      listServiceAdminAuditEvents: originalListAuditEvents,
      createServiceAdminImpersonation: () => {
        throw new Error("Active service-admin impersonation already exists for tenant tenant-volga and user usr-volga-admin.");
      }
    });

    const ServiceAdminWithRepository = ServiceAdminService as unknown as new (repository: IdentityRepository) => ServiceAdminService;
    const support = new ServiceAdminWithRepository(repository);

    const raced = await support.startImpersonation({
      confirmed: true,
      reason: "Customer approved webhook replay check",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    assert.equal(raced.status, "conflict");
    assert.equal(raced.error?.code, "impersonation_already_active");
    assert.equal(raced.data.requestedMode, "read_only_by_default");

    Object.assign(repository, {
      findActiveServiceAdminImpersonation: originalFindActive
    });
  });

  it("exposes immutable service-admin audit events with filters", async () => {
    const support = new ServiceAdminService();

    await support.blockUser({
      userId: "usr-volga-admin",
      reason: "Confirmed account compromise",
      confirmed: true
    });

    const audit = await support.fetchAuditEvents({
      action: "user.block",
      tenantId: "tenant-volga"
    });
    assert.equal(audit.status, "ok");
    assert.equal(audit.service, "supportAdminService");
    assert.ok(audit.data.items.length >= 1);
    assert.ok(audit.data.items.every((event) => event.action === "user.block" && event.tenantId === "tenant-volga"));
    assert.equal(audit.data.items[0].immutable, true);
  });

  it("filters service-admin audit events by actor id", async () => {
    const support = new ServiceAdminService(IdentityRepository.inMemory());

    await support.blockUser({
      actor: {
        id: "svc-audit-actor-a",
        name: "Audit Actor A"
      },
      userId: "usr-volga-admin",
      reason: "Confirmed account compromise",
      confirmed: true
    });
    await support.forceLogout({
      actor: {
        id: "svc-audit-actor-b",
        name: "Audit Actor B"
      },
      userId: "usr-volga-agent",
      reason: "Session risk review",
      confirmed: true
    });

    const audit = await support.fetchAuditEvents({
      actorId: "svc-audit-actor-a"
    });

    assert.equal(audit.status, "ok");
    assert.ok(audit.data.items.length >= 1);
    assert.ok(audit.data.items.every((event) => event.actor === "svc-audit-actor-a"));
    assert.equal(audit.data.items.some((event) => event.actor === "svc-audit-actor-b"), false);
    assert.equal(audit.data.filters.actorId, "svc-audit-actor-a");
  });

  it("filters service-admin audit events by action", async () => {
    const support = new ServiceAdminService(IdentityRepository.inMemory());

    await support.blockUser({
      actor: {
        id: "svc-audit-action",
        name: "Audit Action Actor"
      },
      userId: "usr-volga-admin",
      reason: "Confirmed account compromise",
      confirmed: true
    });
    await support.forceLogout({
      actor: {
        id: "svc-audit-action",
        name: "Audit Action Actor"
      },
      userId: "usr-volga-agent",
      reason: "Session risk review",
      confirmed: true
    });

    const audit = await support.fetchAuditEvents({
      action: "user.block"
    });

    assert.equal(audit.status, "ok");
    assert.ok(audit.data.items.length >= 1);
    assert.ok(audit.data.items.every((event) => event.action === "user.block"));
    assert.equal(audit.data.items.some((event) => event.action === "user.sessions.logout"), false);
    assert.equal(audit.data.filters.action, "user.block");
  });

  it("filters service-admin audit events by tenant id", async () => {
    const support = new ServiceAdminService(IdentityRepository.inMemory());

    await support.blockUser({
      actor: {
        id: "svc-audit-tenant",
        name: "Audit Tenant Actor"
      },
      userId: "usr-volga-admin",
      reason: "Confirmed account compromise",
      confirmed: true
    });
    await support.blockUser({
      actor: {
        id: "svc-audit-tenant",
        name: "Audit Tenant Actor"
      },
      userId: "usr-lumen-invite",
      reason: "Confirmed account compromise",
      confirmed: true
    });

    const audit = await support.fetchAuditEvents({
      tenantId: "tenant-lumen"
    });

    assert.equal(audit.status, "ok");
    assert.ok(audit.data.items.length >= 1);
    assert.ok(audit.data.items.every((event) => event.tenantId === "tenant-lumen"));
    assert.equal(audit.data.items.some((event) => event.tenantId === "tenant-volga"), false);
    assert.equal(audit.data.filters.tenantId, "tenant-lumen");
  });

  it("filters service-admin audit events by status", async () => {
    const support = new ServiceAdminService(IdentityRepository.inMemory());

    await support.blockUser({
      actor: {
        id: "svc-audit-status",
        name: "Audit Status Actor"
      },
      userId: "usr-volga-admin",
      reason: "Confirmed account compromise",
      confirmed: true
    });
    await support.forceLogout({
      actor: {
        id: "svc-audit-status",
        name: "Audit Status Actor"
      },
      userId: "usr-lumen-invite",
      reason: "",
      confirmed: true
    });

    const audit = await support.fetchAuditEvents({
      status: "applied"
    });

    assert.equal(audit.status, "ok");
    assert.ok(audit.data.items.length >= 1);
    assert.ok(audit.data.items.every((event) => event.result === "applied"));
    assert.equal(audit.data.items.some((event) => event.result === "blocked_reason_required"), false);
    assert.equal(audit.data.filters.status, "applied");
  });

  it("filters service-admin audit events by 24h period", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(identityRepository);
    const now = Date.now();

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-period",
      actorName: "Audit Period Actor",
      at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      id: "audit-period-recent",
      immutable: true,
      reason: "Recent period event",
      result: "applied",
      severity: "warning",
      target: "usr-volga-admin",
      tenantId: "tenant-volga",
      traceId: "trace-audit-period-recent",
      userId: "usr-volga-admin"
    });
    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-period",
      actorName: "Audit Period Actor",
      at: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
      id: "audit-period-old",
      immutable: true,
      reason: "Old period event",
      result: "applied",
      severity: "warning",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-period-old",
      userId: "usr-lumen-invite"
    });

    const audit = await support.fetchAuditEvents({
      period: "24h"
    });

    assert.equal(audit.status, "ok");
    assert.deepEqual(audit.data.items.map((event) => event.id), ["audit-period-recent"]);
    assert.equal(audit.data.filters.period, "24h");
  });

  it("creates service-admin audit export contracts over filtered rows", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(identityRepository);
    const exporter = support as ServiceAdminService & {
      requestAuditExport(filters: {
        action?: string;
        tenantId?: string;
      }): Promise<{
        data: {
          export: {
            filters: Record<string, unknown>;
            sourceEventIds: string[];
            totalRows: number;
          };
        };
        service: string;
        status: string;
      }>;
    };

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-export",
      actorName: "Audit Export Actor",
      at: "2026-07-01T06:00:00.000Z",
      id: "audit-export-lumen-block",
      immutable: true,
      reason: "Filtered export event",
      result: "applied",
      severity: "warning",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-export-lumen-block",
      userId: "usr-lumen-invite"
    });
    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.sessions.logout",
      actor: "svc-audit-export",
      actorName: "Audit Export Actor",
      at: "2026-07-01T06:01:00.000Z",
      id: "audit-export-lumen-logout",
      immutable: true,
      reason: "Different action export event",
      result: "applied",
      severity: "warning",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-export-lumen-logout",
      userId: "usr-lumen-invite"
    });
    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-export",
      actorName: "Audit Export Actor",
      at: "2026-07-01T06:02:00.000Z",
      id: "audit-export-volga-block",
      immutable: true,
      reason: "Different tenant export event",
      result: "applied",
      severity: "warning",
      target: "usr-volga-admin",
      tenantId: "tenant-volga",
      traceId: "trace-audit-export-volga-block",
      userId: "usr-volga-admin"
    });

    const auditExport = await exporter.requestAuditExport({
      action: "user.block",
      tenantId: "tenant-lumen"
    });

    assert.equal(auditExport.status, "ok");
    assert.equal(auditExport.service, "supportAdminService");
    assert.deepEqual(auditExport.data.export.sourceEventIds, ["audit-export-lumen-block"]);
    assert.equal(auditExport.data.export.totalRows, 1);
    assert.deepEqual(auditExport.data.export.filters, {
      action: "user.block",
      tenantId: "tenant-lumen"
    });
  });

  it("returns service-admin audit export payload shape", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(identityRepository);

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-payload",
      actorName: "Audit Payload Actor",
      at: "2026-07-01T07:00:00.000Z",
      id: "audit-export-payload-row",
      immutable: true,
      reason: "Payload shape event",
      result: "applied",
      severity: "critical",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-export-payload",
      userId: "usr-lumen-invite"
    });

    const auditExport = await support.requestAuditExport({
      tenantId: "tenant-lumen"
    });

    assert.equal(auditExport.status, "ok");
    assert.equal(auditExport.data.export.format, "json");
    assert.equal(auditExport.data.export.payload.contentType, "application/json");
    assert.deepEqual(auditExport.data.export.payload.columns, [
      "id",
      "at",
      "actor",
      "action",
      "result",
      "severity",
      "tenantId",
      "userId",
      "target"
    ]);
    assert.deepEqual(auditExport.data.export.payload.rows, [{
      action: "user.block",
      actor: "svc-audit-payload",
      at: "2026-07-01T07:00:00.000Z",
      id: "audit-export-payload-row",
      result: "applied",
      severity: "critical",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    }]);
  });

  it("returns service-admin audit export descriptors without exposing object keys", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(identityRepository);

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-descriptor",
      actorName: "Audit Descriptor Actor",
      at: "2026-07-01T07:30:00.000Z",
      id: "audit-export-descriptor-row",
      immutable: true,
      reason: "Descriptor shape event",
      result: "applied",
      severity: "critical",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-export-descriptor",
      userId: "usr-lumen-invite"
    });

    const auditExport = await support.requestAuditExport({
      action: "user.block",
      tenantId: "tenant-lumen"
    });
    const descriptor = auditExport.data.export.descriptor;

    assert.equal(descriptor.contentType, "application/json");
    assert.equal(descriptor.fileName, "service-admin-audit-tenant-lumen-user-block.json");
    assert.equal(descriptor.format, "json");
    assert.equal(descriptor.objectKey, "[REDACTED:object_key]");
    assert.equal(descriptor.objectKeyExposed, false);
    assert.equal(descriptor.permissionRequired, "service-admin.audit.export");
    assert.equal(descriptor.totalRows, 1);
    assert.match(descriptor.downloadUrl, /^https:\/\/service-admin\.local\/audit-exports\/audit-export-[a-f0-9]{16}\/service-admin-audit-tenant-lumen-user-block\.json$/);
    assert.equal(JSON.stringify(descriptor).includes("service-admin/audit-exports/"), false);
  });

  it("generates redacted service-admin audit export payloads", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(identityRepository);

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-redacted-payload",
      actorName: "Bearer sk_live_audit_export_actor_secret",
      at: "2026-07-01T07:45:00.000Z",
      id: "audit-export-redacted-payload-row",
      immutable: true,
      reason: "Export reason Bearer sk_live_audit_export_reason_secret and providerToken=fake-provider-token-export-secret",
      result: "applied",
      severity: "critical",
      target: "tenant-lumen/private/exports/audit-export-secret.csv",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-export-redacted-payload",
      userId: null
    });

    const auditExport = await support.requestAuditExport({
      tenantId: "tenant-lumen"
    });
    const payload = auditExport.data.export.payload;
    const serializedPayload = JSON.stringify(payload);

    assert.equal(payload.redacted, true);
    assert.equal(payload.redactionPolicy, "canonical-secret-carriers/v1");
    assert.equal(serializedPayload.includes("sk_live_audit_export_actor_secret"), false);
    assert.equal(serializedPayload.includes("sk_live_audit_export_reason_secret"), false);
    assert.equal(serializedPayload.includes("fake-provider-token-export-secret"), false);
    assert.equal(serializedPayload.includes("tenant-lumen/private/exports/audit-export-secret.csv"), false);
    assert.match(serializedPayload, /\[REDACTED:object_key\]/);
    assert.equal("reason" in payload.rows[0], false);
    assert.equal("traceId" in payload.rows[0], false);
    assert.equal("actorName" in payload.rows[0], false);
  });

  it("keeps service-admin audit export source rows immutable while redacting responses", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(identityRepository);

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-source-immutability",
      actorName: "Audit Source Immutability Actor",
      at: "2026-07-01T07:55:00.000Z",
      id: "audit-export-source-immutability-row",
      immutable: true,
      reason: "Source row keeps Bearer sk_live_source_immutability_secret for append-only audit evidence",
      result: "applied",
      severity: "critical",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-source-immutability",
      userId: "usr-lumen-invite"
    });

    const before = await identityRepository.listServiceAdminAuditEvents();
    const auditExport = await support.requestAuditExport({
      tenantId: "tenant-lumen"
    });
    const readSide = await support.fetchAuditEvents({
      tenantId: "tenant-lumen"
    });
    const after = await identityRepository.listServiceAdminAuditEvents();

    assert.equal(JSON.stringify(after), JSON.stringify(before));
    assert.equal(after[0].immutable, true);
    assert.equal(after[0].reason, "Source row keeps Bearer sk_live_source_immutability_secret for append-only audit evidence");
    assert.equal(after[0].traceId, "trace-audit-source-immutability");
    assert.equal(JSON.stringify(readSide.data.items).includes("sk_live_source_immutability_secret"), false);
    assert.equal(JSON.stringify(auditExport.data.export.payload).includes("sk_live_source_immutability_secret"), false);
  });

  it("redacts canonical secret carriers from service-admin audit export payloads", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(identityRepository);

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-canonical-redaction",
      actorName: canonicalSecretBearingFixtures.publicApiKey.carriers[3].value,
      at: "2026-07-01T08:05:00.000Z",
      id: "audit-export-canonical-redaction-row",
      immutable: true,
      reason: [
        canonicalSecretBearingFixtures.publicApiKey.carriers[3].value,
        canonicalSecretBearingFixtures.providerToken.carriers[0].value,
        canonicalSecretBearingFixtures.webhookSignature.carriers[3].value,
        canonicalSecretBearingFixtures.objectKey.carriers[3].value
      ].join(" | "),
      result: "applied",
      severity: "critical",
      target: canonicalSecretBearingFixtures.objectKey.raw,
      tenantId: "tenant-lumen",
      traceId: "trace-audit-canonical-redaction",
      userId: null
    });

    const auditExport = await support.requestAuditExport({
      tenantId: "tenant-lumen"
    });
    const serializedExport = JSON.stringify(auditExport.data.export);

    assertLogRecordsDoNotLeakCanonicalSecrets([serializedExport]);
    assert.match(serializedExport, /\[REDACTED:object_key\]/);
    assert.equal(auditExport.data.export.payload.redacted, true);
    assert.equal(auditExport.data.export.descriptor.objectKeyExposed, false);
  });

  it("replays service-admin audit export descriptors safely across repository reads", async () => {
    const firstRepository = IdentityRepository.inMemory();
    const firstSupport = new ServiceAdminService(firstRepository);

    await firstRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-json-replay",
      actorName: "Audit JSON Replay Actor",
      at: "2026-07-01T08:10:00.000Z",
      id: "audit-export-json-replay-row",
      immutable: true,
      reason: "JSON replay export descriptor",
      result: "applied",
      severity: "critical",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-json-replay",
      userId: "usr-lumen-invite"
    });

    const firstExport = await firstSupport.requestAuditExport({
      action: "user.block",
      tenantId: "tenant-lumen"
    });
    const replaySupport = new ServiceAdminService(firstRepository);
    const replayExport = await replaySupport.requestAuditExport({
      action: "user.block",
      tenantId: "tenant-lumen"
    });

    assert.equal(replayExport.status, "ok");
    assert.equal(replayExport.data.export.descriptor.id, firstExport.data.export.descriptor.id);
    assert.equal(replayExport.data.export.descriptor.downloadUrl, firstExport.data.export.descriptor.downloadUrl);
    assert.deepEqual(replayExport.data.export.sourceEventIds, firstExport.data.export.sourceEventIds);
    assert.deepEqual(replayExport.data.export.payload.rows, firstExport.data.export.payload.rows);
  });

  it("paginates service-admin audit events with stable cursor ordering", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(identityRepository);

    for (const event of [
      { at: "2026-07-01T08:00:00.000Z", id: "audit-page-001" },
      { at: "2026-07-01T08:01:00.000Z", id: "audit-page-002" },
      { at: "2026-07-01T08:02:00.000Z", id: "audit-page-003" }
    ]) {
      await identityRepository.recordServiceAdminAuditEvent({
        action: "user.block",
        actor: "svc-audit-page",
        actorName: "Audit Page Actor",
        at: event.at,
        id: event.id,
        immutable: true,
        reason: "Pagination event",
        result: "applied",
        severity: "warning",
        target: "usr-lumen-invite",
        tenantId: "tenant-lumen",
        traceId: `trace-${event.id}`,
        userId: "usr-lumen-invite"
      });
    }

    const firstPage = await support.fetchAuditEvents({
      limit: 2,
      tenantId: "tenant-lumen"
    });

    assert.deepEqual(firstPage.data.items.map((event) => event.id), ["audit-page-003", "audit-page-002"]);
    assert.equal(firstPage.data.page.limit, 2);
    assert.equal(firstPage.data.page.returnedRows, 2);
    assert.equal(firstPage.data.page.totalRows, 3);
    assert.equal(typeof firstPage.data.page.nextCursor, "string");

    const secondPage = await support.fetchAuditEvents({
      cursor: firstPage.data.page.nextCursor,
      limit: 2,
      tenantId: "tenant-lumen"
    });

    assert.deepEqual(secondPage.data.items.map((event) => event.id), ["audit-page-001"]);
    assert.equal(secondPage.data.page.returnedRows, 1);
    assert.equal(secondPage.data.page.totalRows, 3);
    assert.equal(secondPage.data.page.nextCursor, null);
  });

  it("redacts secret-like service-admin audit reasons on paginated read side", async () => {
    const identityRepository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(identityRepository);

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-redaction",
      actorName: "Audit Redaction Actor",
      at: "2026-07-01T09:00:00.000Z",
      id: "audit-readside-redaction",
      immutable: true,
      reason: "Review Bearer sk_live_service_admin_audit_secret and providerToken=fake-provider-token-audit-secret",
      result: "applied",
      severity: "critical",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-readside-redaction",
      userId: "usr-lumen-invite"
    });

    const audit = await support.fetchAuditEvents({
      limit: 1,
      tenantId: "tenant-lumen"
    });
    const [event] = audit.data.items;

    assert.equal(audit.data.page.returnedRows, 1);
    assert.equal(event.id, "audit-readside-redaction");
    assert.doesNotMatch(event.reason ?? "", /sk_live_service_admin_audit_secret|fake-provider-token-audit-secret/);
    assert.match(event.reason ?? "", /Bearer \[REDACTED:api_key\]/);
    assert.match(event.reason ?? "", /providerToken=\[REDACTED:provider_token\]/);
  });
});
