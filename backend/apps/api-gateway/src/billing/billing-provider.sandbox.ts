import { randomUUID } from "node:crypto";
import type {
  BillingProviderPort,
  BillingProviderSyncResult
} from "./billing-provider.port.js";
import type {
  BillingInvoiceState,
  BillingSubscriptionState,
  BillingSyncJob,
  BillingTenantState
} from "./billing.repository.js";

export class SandboxBillingProvider implements BillingProviderPort {
  readonly providerName = "sandbox-billing-provider";

  async syncTenantState(input: {
    eventType: string;
    idempotencyKey: string;
    invoice?: {
      invoice: Partial<BillingInvoiceState>;
      provider: string;
      subscription?: BillingSubscriptionState;
      tenant: BillingTenantState;
    };
    subscription?: {
      provider: string;
      subscription: Partial<BillingSubscriptionState>;
      tenant: BillingTenantState;
    };
    tenant: BillingTenantState;
  }): Promise<BillingProviderSyncResult> {
    const now = new Date().toISOString();
    const provider = input.invoice?.provider ?? input.subscription?.provider ?? this.providerName;
    const subscription = input.subscription
      ? normalizeSubscription(input.subscription.subscription, input.tenant, provider, now)
      : undefined;
    const invoice = input.invoice
      ? normalizeInvoice(input.invoice.invoice, input.tenant, subscription, provider, now)
      : undefined;
    const syncJob: BillingSyncJob = {
      actor: "billing-provider",
      actorName: provider,
      attempts: 0,
      auditEventId: `provider_sync_${randomUUID()}`,
      createdAt: now,
      deadLetteredAt: null,
      fromPlanId: input.tenant.planId,
      id: `billing_sync_${randomUUID()}`,
      lastError: null,
      lockedAt: null,
      nextAttemptAt: null,
      payload: {
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        provider,
        tenantId: input.tenant.id
      },
      publishedAt: null,
      queue: "billing-sync",
      reason: input.eventType,
      status: "pending",
      tenantId: input.tenant.id,
      toPlanId: subscription?.planId ?? input.tenant.planId,
      traceId: `trace_billing_provider_${randomUUID()}`
    };

    return {
      customer: {
        provider,
        providerCustomerId: `provider-customer-${input.tenant.id}`,
        tenantId: input.tenant.id
      },
      ...(invoice ? { invoice } : {}),
      provider,
      ...(subscription ? { subscription } : {}),
      syncJob
    };
  }
}

function normalizeSubscription(
  subscription: Partial<BillingSubscriptionState>,
  tenant: BillingTenantState,
  provider: string,
  now: string
): BillingSubscriptionState {
  const id = stringOrDefault(subscription.id, `sub_${tenant.id}_${provider}`);
  return {
    billingPeriod: subscription.billingPeriod === "annual" ? "annual" : "monthly",
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    createdAt: isoOrDefault(subscription.createdAt, now),
    currency: String(subscription.currency ?? "RUB").toUpperCase(),
    currentPeriodEnd: isoOrDefault(subscription.currentPeriodEnd, now),
    currentPeriodStart: isoOrDefault(subscription.currentPeriodStart, now),
    id,
    planId: stringOrDefault(subscription.planId, tenant.planId),
    provider,
    providerCustomerId: stringOrDefault(subscription.providerCustomerId, `provider-customer-${tenant.id}`),
    providerSubscriptionId: stringOrDefault(subscription.providerSubscriptionId, id),
    seats: positiveIntegerOrDefault(subscription.seats, tenant.users),
    status: subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due" || subscription.status === "canceled" || subscription.status === "paused" ? subscription.status : "active",
    tenantId: tenant.id,
    unitAmountMonthly: positiveIntegerOrDefault(subscription.unitAmountMonthly, tenant.monthlyRevenue),
    updatedAt: isoOrDefault(subscription.updatedAt, now)
  };
}

function normalizeInvoice(
  invoice: Partial<BillingInvoiceState>,
  tenant: BillingTenantState,
  subscription: BillingSubscriptionState | undefined,
  provider: string,
  now: string
): BillingInvoiceState {
  const id = stringOrDefault(invoice.id, `inv_${tenant.id}_${provider}`);
  const amountDue = nonNegativeIntegerOrDefault(invoice.amountDue, subscription?.unitAmountMonthly ?? tenant.monthlyRevenue);
  const amountPaid = nonNegativeIntegerOrDefault(invoice.amountPaid, 0);
  return {
    amountDue,
    amountPaid,
    createdAt: isoOrDefault(invoice.createdAt, now),
    currency: String(invoice.currency ?? "RUB").toUpperCase(),
    dueAt: isoOrDefault(invoice.dueAt, now),
    hostedInvoiceUrl: stringOrNull(invoice.hostedInvoiceUrl),
    id,
    paidAt: invoice.paidAt ? isoOrDefault(invoice.paidAt, now) : null,
    paymentStatus: invoice.paymentStatus === "pending" || invoice.paymentStatus === "succeeded" || invoice.paymentStatus === "failed" || invoice.paymentStatus === "refunded" || invoice.paymentStatus === "none" ? invoice.paymentStatus : "pending",
    provider,
    providerInvoiceId: stringOrDefault(invoice.providerInvoiceId, id),
    status: invoice.status === "draft" || invoice.status === "open" || invoice.status === "paid" || invoice.status === "past_due" || invoice.status === "void" || invoice.status === "uncollectible" ? invoice.status : "open",
    subscriptionId: stringOrNull(invoice.subscriptionId) ?? subscription?.id ?? null,
    tenantId: tenant.id,
    updatedAt: isoOrDefault(invoice.updatedAt, now)
  };
}

function isoOrDefault(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function nonNegativeIntegerOrDefault(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function positiveIntegerOrDefault(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function stringOrDefault(value: unknown, fallback: string): string {
  const stringValue = String(value ?? "").trim();
  return stringValue || fallback;
}

function stringOrNull(value: unknown): string | null {
  const stringValue = String(value ?? "").trim();
  return stringValue || null;
}

export function createBillingProvider(mode: string | undefined): BillingProviderPort {
  return new SandboxBillingProvider();
}
