import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { YooKassaCheckoutUnavailableError, createYooKassaPaymentProvider } from "../apps/api-gateway/src/billing/yookassa.provider.ts";
import { BillingRepository } from "../apps/api-gateway/src/billing/billing.repository.ts";
import { BillingService } from "../apps/api-gateway/src/billing/billing.service.ts";
import { bootstrapBillingState } from "../apps/api-gateway/src/billing/seed.ts";
import { PlatformRepository } from "../apps/api-gateway/src/platform/platform.repository.ts";
import { bootstrapPlatformState } from "../apps/api-gateway/src/platform/seed.ts";

describe("YooKassa checkout provider", () => {
  it("is disabled by default and never makes a network call", async () => {
    const provider = createYooKassaPaymentProvider({ fetcher: async () => { throw new Error("must not be called"); } });
    assert.equal(provider.isEnabled(), false);
    await assert.rejects(
      () => provider.createCheckout({ amountKopeks: 99000, description: "Business", idempotencyKey: "payment-1", metadata: { tenantId: "tenant-volga" } }),
      YooKassaCheckoutUnavailableError
    );
  });

  it("creates a redirect checkout with an exact RUB amount and provider idempotency key", async () => {
    let received: RequestInit | undefined;
    const provider = createYooKassaPaymentProvider({
      mode: "yookassa",
      shopId: "shop-123",
      secretKey: "secret-456",
      returnUrl: "https://app.example.com/settings/billing",
      fetcher: async (_url, init) => {
        received = init;
        return new Response(JSON.stringify({
          id: "2d1b",
          confirmation: { type: "redirect", confirmation_url: "https://yookassa.ru/checkout/2d1b" }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    });

    const result = await provider.createCheckout({
      amountKopeks: 199900,
      description: "Support Communication: Business",
      idempotencyKey: "checkout-2d1b",
      metadata: { planId: "business", tenantId: "tenant-volga" }
    });

    assert.deepEqual(result, { paymentId: "2d1b", redirectUrl: "https://yookassa.ru/checkout/2d1b" });
    assert.equal(received?.headers && (received.headers as Record<string, string>)["Idempotence-Key"], "checkout-2d1b");
    assert.deepEqual(JSON.parse(String(received?.body)), {
      amount: { currency: "RUB", value: "1999.00" },
      capture: true,
      confirmation: { return_url: "https://app.example.com/settings/billing", type: "redirect" },
      description: "Support Communication: Business",
      metadata: { planId: "business", tenantId: "tenant-volga" },
      save_payment_method: true
    });
  });

  it("verifies the provider payment before granting a paid tariff and is idempotent on replay", async () => {
    const platform = PlatformRepository.inMemory(bootstrapPlatformState());
    const launchFlag = (await platform.listFeatureFlagsAsync()).find((flag) => flag.key === "ff-yookassa-payments");
    assert.ok(launchFlag);
    await platform.saveFeatureFlagAsync({ ...launchFlag, rollout: 100, status: "on" });
    const billing = new BillingService(BillingRepository.inMemory(bootstrapBillingState()), {
      isEnabled: () => true,
      createCheckout: async () => ({ paymentId: "unused", redirectUrl: "https://yookassa.ru/unused" }),
      chargeSavedMethod: async () => ({ paymentId: "renewal-unused" }),
      fetchPayment: async () => ({
        amountKopeks: 129000,
        createdAt: "2026-08-05T12:00:00.000Z",
        currency: "RUB",
        metadata: { planId: "business", recurringConsent: "true", tenantId: "tenant-lumen", termsVersion: "v1" },
        paymentId: "payment-business-1",
        paymentMethodId: "payment-method-1",
        paymentMethodSaved: true,
        status: "succeeded"
      })
    }, platform);

    const first = await billing.handleYooKassaWebhook("untrusted-body-id");
    const replay = await billing.handleYooKassaWebhook("untrusted-body-id");

    assert.equal(first.status, "ok");
    assert.equal(first.data.subscription?.planId, "business");
    assert.equal(first.data.invoice?.paymentStatus, "succeeded");
    assert.equal(replay.status, "ok");
    assert.equal(replay.data.duplicate, true);
    const current = await billing.fetchTenantSubscription("tenant-lumen");
    assert.equal(current.data.subscription?.planId, "business");
    const renewal = await billing.renewDueYooKassaSubscriptions(new Date("2026-10-01T00:00:00.000Z"));
    assert.deepEqual(renewal, { attempted: 1, failed: 0, paymentIds: ["renewal-unused"] });
    const cancellation = await billing.cancelTenantSubscription("tenant-lumen");
    assert.equal(cancellation.status, "ok");
    const canceled = await billing.fetchTenantSubscription("tenant-lumen");
    assert.equal(canceled.data.subscription?.cancelAtPeriodEnd, true);
  });

  it("requires current recurring-payment consent before starting checkout", async () => {
    const platform = PlatformRepository.inMemory(bootstrapPlatformState());
    const launchFlag = (await platform.listFeatureFlagsAsync()).find((flag) => flag.key === "ff-yookassa-payments");
    assert.ok(launchFlag);
    await platform.saveFeatureFlagAsync({ ...launchFlag, rollout: 100, status: "on" });
    const billing = new BillingService(BillingRepository.inMemory(bootstrapBillingState()), {
      isEnabled: () => true,
      chargeSavedMethod: async () => ({ paymentId: "unused" }),
      createCheckout: async () => ({ paymentId: "checkout-consent", redirectUrl: "https://yookassa.ru/checkout/consent" }),
      fetchPayment: async () => { throw new Error("not called"); }
    }, platform);
    const missingConsent = await billing.startTenantCheckout("tenant-lumen", { idempotencyKey: "checkout-consent-1", nextPlanId: "business" });
    assert.equal(missingConsent.status, "invalid");
    assert.equal(missingConsent.error?.code, "recurring_consent_required");
    const checkout = await billing.startTenantCheckout("tenant-lumen", { idempotencyKey: "checkout-consent-2", nextPlanId: "business", recurringConsent: true, termsVersion: "v1" });
    assert.equal(checkout.status, "ok");
    const overview = await billing.fetchTenantBillingOverview("tenant-lumen");
    assert.equal(overview.data.recurringTermsVersion, "v1");
  });

  it("records a manual balance top-up and exposes the balance in the tenant overview", async () => {
    const billing = new BillingService(BillingRepository.inMemory(bootstrapBillingState()));
    const topUp = await billing.topUpTenantBalance({ amountKopeks: 125000, idempotencyKey: "manual-credit-1", reason: "Bank transfer received", tenantId: "tenant-lumen" });
    assert.equal(topUp.status, "ok");
    assert.equal(topUp.data.balance?.amountKopeks, 125000);
    const overview = await billing.fetchTenantBillingOverview("tenant-lumen");
    assert.equal(overview.status, "ok");
    assert.equal(overview.data.balance?.amountKopeks, 125000);
    const replay = await billing.topUpTenantBalance({ amountKopeks: 125000, idempotencyKey: "manual-credit-1", reason: "Bank transfer received", tenantId: "tenant-lumen" });
    assert.equal(replay.status, "ok");
    assert.equal(replay.data.balance?.amountKopeks, 125000);
  });

  it("charges an active paid subscription once per day from the tenant balance", async () => {
    const state = bootstrapBillingState();
    const subscription = state.subscriptions.find((item) => item.tenantId === "tenant-lumen");
    assert.ok(subscription);
    subscription.status = "active";
    const billing = new BillingService(BillingRepository.inMemory(state));
    await billing.topUpTenantBalance({ amountKopeks: 500000, idempotencyKey: "daily-charge-credit", reason: "Prepaid balance for daily billing", tenantId: "tenant-lumen" });
    const date = new Date("2026-08-05T12:00:00.000Z");
    const first = await billing.chargeTenantDailySubscription("tenant-lumen", date);
    assert.equal(first.status, "ok");
    assert.equal(first.data.amountKopeks, 30193);
    assert.equal(first.data.balance?.amountKopeks, 469807);
    const replay = await billing.chargeTenantDailySubscription("tenant-lumen", date);
    assert.equal(replay.status, "ok");
    assert.equal(replay.data.duplicate, true);
    const overview = await billing.fetchTenantBillingOverview("tenant-lumen");
    assert.equal(overview.data.balance?.amountKopeks, 469807);
  });

  it("shows the service-admin entitlement tariff while provider reconciliation is pending", async () => {
    const billing = new BillingService(BillingRepository.inMemory(bootstrapBillingState()));
    const changed = await billing.changeTenantTariff({
      confirmationText: "CHANGE tenant-lumen TO enterprise",
      confirmed: true,
      nextPlanId: "enterprise",
      reason: "Move the tenant to its assigned enterprise tariff.",
      tenantId: "tenant-lumen"
    });
    assert.equal(changed.status, "ok");
    const subscription = await billing.fetchTenantSubscription("tenant-lumen");
    assert.equal(subscription.status, "ok");
    assert.equal(subscription.data.entitlementPlanId, "enterprise");
    assert.equal(subscription.data.providerPlanId, "starter");
    assert.equal(subscription.data.tariff?.id, "enterprise");
  });

  it("keeps checkout disabled until service administration enables the launch flag", async () => {
    const billing = new BillingService(BillingRepository.inMemory(bootstrapBillingState()), {
      isEnabled: () => true,
      chargeSavedMethod: async () => ({ paymentId: "unused" }),
      createCheckout: async () => { throw new Error("provider must not be called"); },
      fetchPayment: async () => { throw new Error("not called"); }
    }, PlatformRepository.inMemory(bootstrapPlatformState()));
    const result = await billing.startTenantCheckout("tenant-lumen", { idempotencyKey: "checkout-flag-off", nextPlanId: "business", recurringConsent: true, termsVersion: "v1" });
    assert.equal(result.status, "invalid");
    assert.equal(result.error?.code, "payment_launch_disabled");
  });
});
