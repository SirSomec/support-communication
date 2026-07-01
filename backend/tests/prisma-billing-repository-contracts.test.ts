import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configureBillingRepository } from "../apps/api-gateway/src/billing/bootstrap.ts";
import { BillingRepository } from "../apps/api-gateway/src/billing/billing.repository.ts";

describe("Prisma-backed billing repository contracts", () => {
  it("persists tenant tariff changes and billing-sync jobs in one Prisma transaction", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });

    const result = await repository.applyTenantTariffChange({
      changes: {
        arr: 1548000,
        monthlyRevenue: 129000,
        planId: "business"
      },
      syncJob: {
        actor: "svc-admin",
        actorName: "Service Admin",
        attempts: 0,
        auditEventId: "evt_billing_tariff_test",
        createdAt: "2026-06-28T09:00:00.000Z",
        deadLetteredAt: null,
        fromPlanId: "starter",
        id: "billing_sync_test",
        lastError: null,
        lockedAt: null,
        nextAttemptAt: null,
        payload: {
          approvalId: null,
          auditEvent: {
            action: "tenant.tariff.change",
            actor: "svc-admin",
            actorName: "Service Admin",
            approvalId: null,
            at: "2026-06-28T09:00:00.000Z",
            id: "evt_billing_tariff_test",
            immutable: true,
            reason: "Persistent trial conversion",
            result: "queued",
            severity: "critical",
            target: "tenant-lumen",
            tenantId: "tenant-lumen",
            traceId: "trc_billing_test"
          },
          reason: "Persistent trial conversion"
        },
        publishedAt: null,
        queue: "billing-sync",
        reason: "Persistent trial conversion",
        status: "pending",
        tenantId: "tenant-lumen",
        toPlanId: "business",
        traceId: "trc_billing_test"
      },
      tenantId: "tenant-lumen"
    });

    assert.equal(client.calls.transactions, 1);
    assert.equal(result.tenant.planId, "business");
    assert.equal(result.syncJob.id, "billing_sync_test");
    assert.equal(client.calls.billingTenantUpdates.length, 1);
    assert.deepEqual(client.calls.billingTenantUpdates[0].data, {
      arr: 1548000,
      monthlyRevenue: 129000,
      planId: "business"
    });
    assert.equal(client.calls.billingSyncJobCreates.length, 1);
    assert.equal(client.calls.billingSyncJobCreates[0].data.createdAt instanceof Date, true);
    assert.equal(client.calls.billingSyncJobCreates[0].data.deadLetteredAt, null);
    assert.equal(client.calls.billingSyncJobCreates[0].data.nextAttemptAt, null);
    const tariffAuditEvent = result.syncJob.payload.auditEvent as Record<string, unknown>;
    assert.equal((client.calls.billingSyncJobCreates[0].data.payload.auditEvent as Record<string, unknown>).immutable, true);
    assert.equal(tariffAuditEvent.id, "evt_billing_tariff_test");
  });

  it("persists quota ledger entries through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });

    const entry = await repository.recordQuotaLedgerEntry({
      auditEvent: {
        action: "quota.record",
        actor: "quota-service",
        actorName: "Quota Service",
        at: "2026-06-28T09:15:00.000Z",
        id: "evt_billing_quota_prisma_test",
        immutable: true,
        reason: "quota_exceeded",
        result: "deny",
        severity: "warning",
        target: "operators",
        tenantId: "tenant-lumen",
        traceId: "trc_quota_prisma_test"
      },
      createdAt: "2026-06-28T09:15:00.000Z",
      decision: "deny",
      id: "quota_prisma_test",
      idempotencyKey: "quota-prisma-key",
      limit: 25,
      mode: "record",
      planId: "starter",
      projected: 34,
      reason: "quota_exceeded",
      remainingAfter: 0,
      remainingBefore: 1,
      requested: 10,
      requestFingerprint: "{\"mode\":\"record\",\"requested\":10,\"resource\":\"operators\",\"tenantId\":\"tenant-lumen\"}",
      resource: "operators",
      tenantId: "tenant-lumen",
      traceId: "trc_quota_prisma_test",
      used: 24
    });
    const found = await repository.findQuotaLedgerEntryByIdempotencyKey("quota-prisma-key");
    const entries = await repository.listQuotaLedgerEntries("tenant-lumen");

    assert.equal(entry.id, "quota_prisma_test");
    assert.equal(found?.id, "quota_prisma_test");
    assert.equal(found?.auditEvent?.id, "evt_billing_quota_prisma_test");
    assert.equal(found?.auditEvent?.immutable, true);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "quota_prisma_test");
    assert.equal(entries[0].auditEvent?.action, "quota.record");
    assert.equal(entries[0].decision, "deny");
    assert.equal(entries[0].createdAt, "2026-06-28T09:15:00.000Z");
    assert.equal(client.calls.billingQuotaLedgerEntryCreates.length, 1);
    assert.equal(client.calls.billingQuotaLedgerEntryCreates[0].data.createdAt instanceof Date, true);
    assert.equal(client.calls.billingQuotaLedgerEntryCreates[0].data.auditEvent?.immutable, true);
    assert.deepEqual(client.calls.billingQuotaLedgerEntryFinds, [{
      orderBy: { createdAt: "desc" },
      where: { tenantId: "tenant-lumen" }
    }]);
  });

  it("persists quota reservations and committed usage mutations through Prisma transactions", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });

    const reserved = await repository.createQuotaReservation({
      auditEvent: {
        action: "quota.reserve",
        actor: "quota-service",
        actorName: "Quota Service",
        at: "2026-06-28T09:20:00.000Z",
        id: "evt_quota_reserve_prisma",
        immutable: true,
        reason: "quota_reserved",
        result: "reserved",
        severity: "info",
        target: "webhooks",
        tenantId: "tenant-lumen",
        traceId: "trc_reserve_prisma"
      },
      committedAt: null,
      createdAt: "2026-06-28T09:20:00.000Z",
      expiresAt: "2026-06-28T09:35:00.000Z",
      id: "quota_reservation_prisma_test",
      idempotencyKey: "reserve-prisma-quota",
      limit: 20000,
      lockedAt: "2026-06-28T09:24:00.000Z",
      planId: "starter",
      releasedAt: null,
      requested: 10,
      requestFingerprint: "{\"mode\":\"reserve\"}",
      resource: "webhooks",
      status: "reserved",
      tenantId: "tenant-lumen",
      traceId: "trc_reserve_prisma",
      updatedAt: "2026-06-28T09:20:00.000Z",
      usedBefore: 19000
    });

    assert.equal(reserved.id, "quota_reservation_prisma_test");
    assert.equal(reserved.auditEvent?.id, "evt_quota_reserve_prisma");
    assert.equal(reserved.auditEvents?.[0]?.id, "evt_quota_reserve_prisma");
    assert.equal(reserved.lockedAt, "2026-06-28T09:24:00.000Z");
    assert.equal(client.calls.billingQuotaReservationCreates.length, 1);
    assert.equal(client.calls.billingQuotaReservationCreates[0].data.createdAt instanceof Date, true);
    assert.equal(client.calls.billingQuotaReservationCreates[0].data.lockedAt instanceof Date, true);
    assert.equal(client.calls.billingQuotaReservationCreates[0].data.auditEvent?.immutable, true);
    assert.equal(client.calls.billingQuotaReservationCreates[0].data.auditEvents?.[0]?.id, "evt_quota_reserve_prisma");

    const committed = await repository.commitQuotaReservation({
      auditEvent: {
        action: "quota.commit",
        actor: "quota-service",
        actorName: "Quota Service",
        at: "2026-06-28T09:21:00.000Z",
        id: "evt_quota_commit_prisma",
        immutable: true,
        reason: "quota_committed",
        result: "committed",
        severity: "info",
        target: "webhooks",
        tenantId: "tenant-lumen",
        traceId: "trc_commit_prisma"
      },
      committedAt: "2026-06-28T09:21:00.000Z",
      idempotencyKey: "commit-prisma-quota",
      reservationId: "quota_reservation_prisma_test",
      traceId: "trc_commit_prisma"
    });

    assert.equal(client.calls.transactions, 1);
    assert.equal(committed.reservation.status, "committed");
    assert.equal(committed.reservation.auditEvent?.action, "quota.commit");
    assert.deepEqual(committed.reservation.auditEvents?.map((event) => event.action), ["quota.reserve", "quota.commit"]);
    assert.equal(committed.tenant.usage.webhooks, 19010);
    assert.equal(client.calls.billingQuotaReservationUpdates.length, 1);
    assert.equal(client.calls.billingQuotaReservationUpdates[0].data.auditEvent?.id, "evt_quota_commit_prisma");
    assert.deepEqual(client.calls.billingQuotaReservationUpdates[0].data.auditEvents?.map((event) => event.action), ["quota.reserve", "quota.commit"]);
    assert.equal(client.calls.billingTenantUpdates[0].data.usage?.webhooks, 19010);
  });

  it("claims expired quota reservations through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });
    const baseReservation = {
      auditEvent: null,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T03:00:00.000Z",
      expiresAt: "2026-07-01T03:10:00.000Z",
      idempotencyKey: "reserve-prisma-expired-claim",
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
      traceId: "trace-prisma-expired-claim",
      updatedAt: "2026-07-01T03:00:00.000Z",
      usedAfter: null,
      usedBefore: 10
    };

    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_prisma_expired_unlocked"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_prisma_expired_stale_locked",
      idempotencyKey: "reserve-prisma-expired-stale-claim",
      lockedAt: "2026-07-01T03:00:00.000Z"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_prisma_fresh_locked",
      idempotencyKey: "reserve-prisma-fresh-claim",
      lockedAt: "2026-07-01T03:29:30.000Z"
    });

    const claimed = await repository.claimExpiredQuotaReservations({
      leaseTimeoutMs: 60_000,
      limit: 2,
      now: "2026-07-01T03:30:00.000Z"
    });

    assert.deepEqual(claimed.map((reservation) => reservation.id), [
      "quota_reservation_prisma_expired_unlocked",
      "quota_reservation_prisma_expired_stale_locked"
    ]);
    assert.deepEqual(claimed.map((reservation) => reservation.lockedAt), [
      "2026-07-01T03:30:00.000Z",
      "2026-07-01T03:30:00.000Z"
    ]);
    assert.deepEqual(client.calls.billingQuotaReservationUpdates.map((call) => call.data.lockedAt instanceof Date), [true, true]);
    assert.deepEqual(client.calls.billingQuotaReservationFinds.at(-1), {
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }, { lockedAt: { nulls: "first", sort: "asc" } }, { id: "asc" }],
      take: 2,
      where: {
        expiresAt: { lte: new Date("2026-07-01T03:30:00.000Z") },
        OR: [
          { lockedAt: null },
          { lockedAt: { lte: new Date("2026-07-01T03:29:00.000Z") } }
        ],
        status: "reserved"
      }
    });
  });

  it("releases claimed expired quota reservations through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });
    const baseReservation = {
      auditEvent: null,
      auditEvents: [],
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt: "2026-07-01T03:00:00.000Z",
      expiresAt: "2026-07-01T03:10:00.000Z",
      idempotencyKey: "reserve-prisma-expired-release",
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
      traceId: "trace-prisma-expired-release",
      updatedAt: "2026-07-01T03:30:00.000Z",
      usedAfter: null,
      usedBefore: 10
    };
    const auditEvent = {
      action: "quota.expired.release",
      at: "2026-07-01T03:31:00.000Z",
      id: "evt_quota_expired_release_prisma",
      immutable: true,
      reason: "quota_reservation_expired",
      result: "released",
      severity: "info",
      target: "quota_reservation_prisma_claimed_expired",
      tenantId: "tenant-lumen",
      traceId: "trace-prisma-expired-release-worker"
    };

    await repository.createQuotaReservation({
      ...baseReservation,
      id: "quota_reservation_prisma_claimed_expired"
    });
    await repository.createQuotaReservation({
      ...baseReservation,
      expiresAt: "2026-07-01T03:40:00.000Z",
      id: "quota_reservation_prisma_claimed_not_expired",
      idempotencyKey: "reserve-prisma-claimed-not-expired-release"
    });

    const released = await repository.releaseExpiredQuotaReservation({
      auditEvent,
      idempotencyKey: "quota-expiration-release:quota_reservation_prisma_claimed_expired",
      lockedAt: "2026-07-01T03:30:00.000Z",
      releasedAt: "2026-07-01T03:31:00.000Z",
      reservationId: "quota_reservation_prisma_claimed_expired",
      traceId: "trace-prisma-expired-release-worker"
    });
    const duplicate = await repository.releaseExpiredQuotaReservation({
      auditEvent: { ...auditEvent, id: "evt_quota_expired_release_prisma_duplicate" },
      idempotencyKey: "quota-expiration-release:quota_reservation_prisma_claimed_expired",
      lockedAt: "2026-07-01T03:30:00.000Z",
      releasedAt: "2026-07-01T03:32:00.000Z",
      reservationId: "quota_reservation_prisma_claimed_expired",
      traceId: "trace-prisma-expired-release-worker-replay"
    });
    const notExpired = await repository.releaseExpiredQuotaReservation({
      auditEvent,
      idempotencyKey: "quota-expiration-release:quota_reservation_prisma_claimed_not_expired",
      lockedAt: "2026-07-01T03:30:00.000Z",
      releasedAt: "2026-07-01T03:31:00.000Z",
      reservationId: "quota_reservation_prisma_claimed_not_expired",
      traceId: "trace-prisma-expired-release-worker"
    });

    assert.equal(released?.status, "released");
    assert.equal(released?.releasedAt, "2026-07-01T03:31:00.000Z");
    assert.equal(released?.releaseIdempotencyKey, "quota-expiration-release:quota_reservation_prisma_claimed_expired");
    assert.equal(released?.lockedAt, null);
    assert.deepEqual(released?.auditEvents?.map((event) => event.id), ["evt_quota_expired_release_prisma"]);
    assert.equal(duplicate?.releasedAt, "2026-07-01T03:31:00.000Z");
    assert.deepEqual(duplicate?.auditEvents?.map((event) => event.id), ["evt_quota_expired_release_prisma"]);
    assert.equal(notExpired, undefined);
    assert.deepEqual(client.calls.billingQuotaReservationUpdates.map((call) => ({
      lockedAt: call.data.lockedAt,
      releasedAtIsDate: call.data.releasedAt instanceof Date,
      status: call.data.status
    })), [{
      lockedAt: null,
      releasedAtIsDate: true,
      status: "released"
    }]);
  });

  it("persists provider sync subscription, invoice and job state in one Prisma transaction", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });

    const result = await repository.applyProviderBillingSync({
      event: {
        auditEvents: [{
          action: "billing.provider_sync.accepted",
          at: "2026-06-28T09:30:00.000Z",
          eventId: "provider_sync_prisma_test",
          eventType: "invoice.payment_succeeded",
          id: "evt_provider_sync_prisma",
          idempotencyKey: "provider-event-prisma",
          immutable: true,
          provider: "demo-billing-provider",
          result: "accepted",
          syncJobId: "billing_sync_provider_prisma",
          tenantId: "tenant-lumen",
          traceId: "trc_provider_sync_prisma"
        }],
        createdAt: "2026-06-28T09:30:00.000Z",
        eventType: "invoice.payment_succeeded",
        id: "provider_sync_prisma_test",
        idempotencyKey: "provider-event-prisma",
        payload: { providerInvoiceId: "provider-invoice-prisma", rawPayloadSecret: "sk_live_prisma_secret" },
        provider: "demo-billing-provider",
        requestFingerprint: "{\"eventType\":\"invoice.payment_succeeded\"}",
        status: "accepted",
        syncJobId: "billing_sync_provider_prisma",
        tenantId: "tenant-lumen",
        traceId: "trc_provider_sync_prisma"
      },
      invoice: {
        amountDue: 129000,
        amountPaid: 129000,
        createdAt: "2026-06-28T09:30:00.000Z",
        currency: "RUB",
        dueAt: "2026-07-15T00:00:00.000Z",
        hostedInvoiceUrl: "https://billing.example/invoices/provider-invoice-prisma",
        id: "inv_prisma_provider",
        paidAt: "2026-07-01T12:00:00.000Z",
        paymentStatus: "succeeded",
        provider: "demo-billing-provider",
        providerInvoiceId: "provider-invoice-prisma",
        status: "paid",
        subscriptionId: "sub_prisma_provider",
        tenantId: "tenant-lumen",
        updatedAt: "2026-06-28T09:30:00.000Z"
      },
      subscription: {
        billingPeriod: "monthly",
        cancelAtPeriodEnd: false,
        createdAt: "2026-06-28T09:30:00.000Z",
        currency: "RUB",
        currentPeriodEnd: "2026-07-31T23:59:59.000Z",
        currentPeriodStart: "2026-07-01T00:00:00.000Z",
        id: "sub_prisma_provider",
        planId: "business",
        provider: "demo-billing-provider",
        providerCustomerId: "provider-customer-prisma",
        providerSubscriptionId: "provider-subscription-prisma",
        seats: 32,
        status: "active",
        tenantId: "tenant-lumen",
        unitAmountMonthly: 129000,
        updatedAt: "2026-06-28T09:30:00.000Z"
      },
      syncJob: {
        actor: "billing-provider",
        actorName: "demo-billing-provider",
        attempts: 0,
        auditEventId: "provider_sync_prisma_test",
        createdAt: "2026-06-28T09:30:00.000Z",
        deadLetteredAt: null,
        fromPlanId: "starter",
        id: "billing_sync_provider_prisma",
        lastError: null,
        lockedAt: null,
        nextAttemptAt: null,
        payload: { eventType: "invoice.payment_succeeded", idempotencyKey: "provider-event-prisma" },
        publishedAt: null,
        queue: "billing-sync",
        reason: "invoice.payment_succeeded",
        status: "pending",
        tenantId: "tenant-lumen",
        toPlanId: "business",
        traceId: "trc_provider_sync_prisma"
      },
      tenantChanges: {
        arr: 1548000,
        monthlyRevenue: 129000,
        planId: "business"
      },
      tenantId: "tenant-lumen"
    });

    assert.equal(client.calls.transactions, 1);
    assert.equal(result.event.id, "provider_sync_prisma_test");
    assert.equal(result.event.auditEvents?.[0]?.immutable, true);
    assert.equal(result.subscription?.planId, "business");
    assert.equal(result.invoice?.paymentStatus, "succeeded");
    assert.equal(result.syncJob.id, "billing_sync_provider_prisma");
    assert.equal(result.tenant.planId, "business");
    assert.equal(client.calls.billingProviderSyncEventCreates.length, 1);
    assert.equal(client.calls.billingProviderSyncEventCreates[0].data.auditEvents?.[0]?.id, "evt_provider_sync_prisma");
    assert.equal(JSON.stringify(client.calls.billingProviderSyncEventCreates[0].data.auditEvents).includes("provider-invoice-prisma"), false);
    assert.equal(JSON.stringify(client.calls.billingProviderSyncEventCreates[0].data.auditEvents).includes("sk_live_prisma_secret"), false);
    assert.equal(client.calls.billingSyncJobCreates[0].data.deadLetteredAt, null);
    assert.equal(client.calls.billingSyncJobCreates[0].data.nextAttemptAt, null);
    assert.equal(client.calls.billingSubscriptionUpserts.length, 1);
    assert.equal(client.calls.billingInvoiceUpserts.length, 1);
    assert.deepEqual(client.calls.billingSubscriptionUpserts[0].where, {
      provider_providerSubscriptionId: {
        provider: "demo-billing-provider",
        providerSubscriptionId: "provider-subscription-prisma"
      }
    });
    assert.deepEqual(client.calls.billingInvoiceUpserts[0].where, {
      provider_providerInvoiceId: {
        provider: "demo-billing-provider",
        providerInvoiceId: "provider-invoice-prisma"
      }
    });
    assert.equal(client.calls.billingSyncJobCreates.length, 1);
    assert.equal(client.calls.billingTenantUpdates.length, 1);
    assert.equal(client.calls.billingProviderSyncEventCreates[0].data.createdAt instanceof Date, true);

    const replayedEvent = await repository.appendProviderSyncAuditEvent("provider-event-prisma", {
      action: "billing.provider_sync.duplicate",
      at: "2026-06-28T09:31:00.000Z",
      eventId: "provider_sync_prisma_test",
      eventType: "invoice.payment_succeeded",
      id: "evt_provider_sync_prisma_duplicate",
      idempotencyKey: "provider-event-prisma",
      immutable: true,
      provider: "demo-billing-provider",
      result: "duplicate",
      syncJobId: "billing_sync_provider_prisma",
      tenantId: "tenant-lumen",
      traceId: "trc_provider_sync_prisma"
    });
    assert.deepEqual(replayedEvent?.auditEvents?.map((event) => event.result), ["accepted", "duplicate"]);
    assert.equal(client.calls.billingProviderSyncEventUpdates.length, 0);
    assert.equal(client.calls.queryRawUnsafe.length, 1);
    assert.match(client.calls.queryRawUnsafe[0].query, /"audit_events" = COALESCE\("audit_events", '\[\]'::jsonb\) \|\| \$2::jsonb/);
  });

  it("persists payment retry schedules through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });
    const schedule = {
      attempt: 1,
      createdAt: "2026-06-30T20:00:00.000Z",
      idempotencyKey: "payment-retry-prisma:tenant-lumen:invoice-1",
      invoiceId: "invoice-lumen-prisma-retry-1",
      lastAttemptAt: null,
      lastError: "providerToken=fake-provider-token-canonical-secret-needle",
      maxAttempts: 4,
      nextAttemptAt: "2026-06-30T20:15:00.000Z",
      provider: "demo-billing-provider",
      providerInvoiceId: "provider-invoice-lumen-prisma-retry-1",
      providerSecret: "fake-provider-token-canonical-secret-needle",
      requestFingerprint: "sha256:retry-prisma-lumen-1",
      scheduleId: "retry-schedule-prisma",
      status: "scheduled" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-retry-prisma-lumen",
      updatedAt: "2026-06-30T20:00:00.000Z"
    };

    const saved = await repository.savePaymentRetrySchedule(schedule);
    const replay = await repository.savePaymentRetrySchedule({
      ...schedule,
      attempt: 2,
      nextAttemptAt: "2026-06-30T21:00:00.000Z",
      requestFingerprint: "sha256:retry-prisma-mutated",
      status: "exhausted" as const
    });
    const rows = await repository.listPaymentRetrySchedules({ tenantId: "tenant-lumen" });
    const byIdempotencyKey = await repository.findPaymentRetryScheduleByIdempotencyKey("payment-retry-prisma:tenant-lumen:invoice-1");
    const emptyTenantRows = await repository.listPaymentRetrySchedules({ tenantId: "" });

    assert.equal(saved.scheduleId, "retry-schedule-prisma");
    assert.equal(saved.createdAt, "2026-06-30T20:00:00.000Z");
    assert.equal(replay.attempt, 1);
    assert.equal(replay.status, "scheduled");
    assert.equal(replay.nextAttemptAt, "2026-06-30T20:15:00.000Z");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scheduleId, "retry-schedule-prisma");
    assert.equal(byIdempotencyKey?.scheduleId, "retry-schedule-prisma");
    assert.equal(emptyTenantRows.length, 0);
    assert.equal(client.calls.billingPaymentRetryScheduleCreates.length, 1);
    assert.equal(client.calls.billingPaymentRetryScheduleCreates[0].data.createdAt instanceof Date, true);
    assert.deepEqual(client.calls.billingPaymentRetryScheduleFindMany, [{
      orderBy: { nextAttemptAt: "desc" },
      where: { tenantId: "tenant-lumen" }
    }]);
    const serializedCreate = JSON.stringify(client.calls.billingPaymentRetryScheduleCreates[0].data);
    assert.equal(serializedCreate.includes("providerSecret"), false);
    assert.equal(serializedCreate.includes("lastError"), false);
    assert.equal(serializedCreate.includes("fake-provider-token-canonical-secret-needle"), false);
  });

  it("persists payment dunning state through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });
    const state = {
      createdAt: "2026-06-30T20:30:00.000Z",
      dunningId: "dunning-prisma",
      failedAttempts: 2,
      idempotencyKey: "payment-dunning-prisma:tenant-lumen:invoice-1",
      invoiceId: "invoice-lumen-prisma-dunning-1",
      lastError: "providerToken=fake-provider-token-canonical-secret-needle",
      lastFailureAt: "2026-06-30T20:20:00.000Z",
      nextActionAt: "2026-07-01T09:00:00.000Z",
      provider: "demo-billing-provider",
      providerInvoiceId: "provider-invoice-lumen-prisma-dunning-1",
      providerSecret: "fake-provider-token-canonical-secret-needle",
      requestFingerprint: "sha256:dunning-prisma-lumen-1",
      stage: "grace" as const,
      status: "active" as const,
      subscriptionId: "subscription-lumen-prisma-dunning-1",
      tenantId: "tenant-lumen",
      traceId: "trace-dunning-prisma-lumen",
      updatedAt: "2026-06-30T20:30:00.000Z"
    };

    const saved = await repository.savePaymentDunningState(state);
    const replay = await repository.savePaymentDunningState({
      ...state,
      failedAttempts: 3,
      nextActionAt: "2026-07-02T09:00:00.000Z",
      requestFingerprint: "sha256:dunning-prisma-mutated",
      status: "paused" as const
    });
    const rows = await repository.listPaymentDunningStates({ tenantId: "tenant-lumen" });
    const byIdempotencyKey = await repository.findPaymentDunningStateByIdempotencyKey("payment-dunning-prisma:tenant-lumen:invoice-1");
    const emptyTenantRows = await repository.listPaymentDunningStates({ tenantId: "" });

    assert.equal(saved.dunningId, "dunning-prisma");
    assert.equal(saved.createdAt, "2026-06-30T20:30:00.000Z");
    assert.equal(replay.failedAttempts, 2);
    assert.equal(replay.status, "active");
    assert.equal(replay.nextActionAt, "2026-07-01T09:00:00.000Z");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].dunningId, "dunning-prisma");
    assert.equal(byIdempotencyKey?.dunningId, "dunning-prisma");
    assert.equal(emptyTenantRows.length, 0);
    assert.equal(client.calls.billingPaymentDunningStateCreates.length, 1);
    assert.equal(client.calls.billingPaymentDunningStateCreates[0].data.createdAt instanceof Date, true);
    assert.deepEqual(client.calls.billingPaymentDunningStateFindMany, [{
      orderBy: { updatedAt: "desc" },
      where: { tenantId: "tenant-lumen" }
    }]);
    const serializedCreate = JSON.stringify(client.calls.billingPaymentDunningStateCreates[0].data);
    assert.equal(serializedCreate.includes("providerSecret"), false);
    assert.equal(serializedCreate.includes("lastError"), false);
    assert.equal(serializedCreate.includes("fake-provider-token-canonical-secret-needle"), false);
  });

  it("persists reconciliation conflicts through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });
    const conflict = {
      actual: { amountPaid: 0, providerStatus: "failed" },
      conflictId: "reconciliation-conflict-prisma",
      createdAt: "2026-06-30T21:00:00.000Z",
      detectedAt: "2026-06-30T20:55:00.000Z",
      expected: { amountDue: 129000, paymentStatus: "pending" },
      idempotencyKey: "reconciliation-conflict-prisma:tenant-lumen:invoice-1",
      invoiceId: "invoice-lumen-prisma-conflict-1",
      lastError: "providerToken=fake-provider-token-canonical-secret-needle",
      provider: "demo-billing-provider",
      providerInvoiceId: "provider-invoice-lumen-prisma-conflict-1",
      providerSecret: "fake-provider-token-canonical-secret-needle",
      reason: "provider_invoice_status_mismatch",
      requestFingerprint: "sha256:reconciliation-prisma-lumen-1",
      resolution: null,
      resolvedAt: null,
      severity: "high" as const,
      status: "open" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-reconciliation-prisma-lumen",
      updatedAt: "2026-06-30T21:00:00.000Z"
    };

    const saved = await repository.saveReconciliationConflict(conflict);
    conflict.actual.amountPaid = 129000;
    const replay = await repository.saveReconciliationConflict({
      ...conflict,
      requestFingerprint: "sha256:reconciliation-prisma-mutated",
      resolution: "provider replay was stale",
      resolvedAt: "2026-06-30T21:30:00.000Z",
      severity: "low" as const,
      status: "resolved" as const
    });
    const rows = await repository.listReconciliationConflicts({ tenantId: "tenant-lumen" });
    const byIdempotencyKey = await repository.findReconciliationConflictByIdempotencyKey("reconciliation-conflict-prisma:tenant-lumen:invoice-1");
    const emptyTenantRows = await repository.listReconciliationConflicts({ tenantId: "" });

    assert.equal(saved.conflictId, "reconciliation-conflict-prisma");
    assert.equal(saved.actual.amountPaid, 0);
    assert.equal(replay.actual.amountPaid, 0);
    assert.equal(replay.status, "open");
    assert.equal(replay.severity, "high");
    assert.equal(replay.resolution, null);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conflictId, "reconciliation-conflict-prisma");
    assert.equal(byIdempotencyKey?.conflictId, "reconciliation-conflict-prisma");
    assert.equal(emptyTenantRows.length, 0);
    assert.equal(client.calls.billingReconciliationConflictCreates.length, 1);
    assert.equal(client.calls.billingReconciliationConflictCreates[0].data.createdAt instanceof Date, true);
    assert.deepEqual(client.calls.billingReconciliationConflictFindMany, [{
      orderBy: { detectedAt: "desc" },
      where: { tenantId: "tenant-lumen" }
    }]);
    const serializedCreate = JSON.stringify(client.calls.billingReconciliationConflictCreates[0].data);
    assert.equal(serializedCreate.includes("providerSecret"), false);
    assert.equal(serializedCreate.includes("lastError"), false);
    assert.equal(serializedCreate.includes("fake-provider-token-canonical-secret-needle"), false);
  });

  it("persists idempotent payment retry keys through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });
    const key = {
      attempt: 1,
      createdAt: "2026-06-30T21:30:00.000Z",
      firstAttemptAt: "2026-06-30T21:30:00.000Z",
      idempotencyKey: "payment-retry-key-prisma:tenant-lumen:invoice-1:attempt-1",
      invoiceId: "invoice-lumen-prisma-retry-key-1",
      lastAttemptAt: null,
      provider: "demo-billing-provider",
      providerInvoiceId: "provider-invoice-lumen-prisma-retry-key-1",
      requestFingerprint: "sha256:retry-key-prisma-lumen-1",
      result: { providerRequestId: "provider-request-prisma-lumen-1" },
      retryKeyId: "retry-key-prisma",
      scheduleId: "retry-schedule-prisma",
      status: "claimed" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-retry-key-prisma-lumen",
      updatedAt: "2026-06-30T21:30:00.000Z"
    };

    const saved = await repository.savePaymentRetryKey(key);
    key.result.providerRequestId = "mutated-provider-request";
    const replay = await repository.savePaymentRetryKey({
      ...key,
      attempt: 2,
      requestFingerprint: "sha256:retry-key-prisma-mutated",
      result: { providerRequestId: "provider-request-prisma-replay" },
      status: "succeeded" as const
    });
    const rows = await repository.listPaymentRetryKeys({ tenantId: "tenant-lumen" });
    const byIdempotencyKey = await repository.findPaymentRetryKeyByIdempotencyKey("payment-retry-key-prisma:tenant-lumen:invoice-1:attempt-1");
    const emptyTenantRows = await repository.listPaymentRetryKeys({ tenantId: "" });

    assert.equal(saved.retryKeyId, "retry-key-prisma");
    assert.equal(saved.result.providerRequestId, "provider-request-prisma-lumen-1");
    assert.equal(replay.attempt, 1);
    assert.equal(replay.result.providerRequestId, "provider-request-prisma-lumen-1");
    assert.equal(replay.status, "claimed");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].retryKeyId, "retry-key-prisma");
    assert.equal(byIdempotencyKey?.retryKeyId, "retry-key-prisma");
    assert.equal(emptyTenantRows.length, 0);
    assert.equal(client.calls.billingPaymentRetryKeyCreates.length, 1);
    assert.equal(client.calls.billingPaymentRetryKeyCreates[0].data.createdAt instanceof Date, true);
    assert.deepEqual(client.calls.billingPaymentRetryKeyFindMany, [{
      orderBy: { firstAttemptAt: "desc" },
      where: { tenantId: "tenant-lumen" }
    }]);
  });

  it("persists billing approvals through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });
    const approval = {
      approvalId: "billing-approval-prisma",
      createdAt: "2026-06-30T22:45:00.000Z",
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionReason: null,
      expiresAt: "2026-07-01T22:45:00.000Z",
      reason: "Approve Prisma-backed downgrade",
      requestedBy: "svc-admin-prisma-1",
      requestedByName: "Prisma Service Admin",
      requestFingerprint: "sha256:billing-approval-prisma",
      status: "pending" as const,
      subjectId: "tenant-lumen:business:starter",
      subjectType: "tariff_change" as const,
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-prisma",
      updatedAt: "2026-06-30T22:45:00.000Z"
    };

    const saved = await repository.saveBillingApproval(approval);
    const replay = await repository.saveBillingApproval({
      ...approval,
      approvalId: "billing-approval-prisma-replay",
      reason: "Replay should not overwrite Prisma approval",
      status: "approved" as const,
      traceId: "trace-billing-approval-prisma-replay",
      updatedAt: "2026-06-30T22:46:00.000Z"
    });
    await repository.saveBillingApproval({
      ...approval,
      approvalId: "billing-approval-prisma-volga",
      requestFingerprint: "sha256:billing-approval-prisma-volga",
      tenantId: "tenant-volga"
    });

    const pending = await repository.listBillingApprovals({ statuses: ["pending"], tenantId: "tenant-lumen" });
    const byId = await repository.findBillingApproval("billing-approval-prisma", "tenant-lumen");
    const crossTenant = await repository.findBillingApproval("billing-approval-prisma", "tenant-volga");
    const decided = await repository.decideBillingApproval({
      approvalId: "billing-approval-prisma",
      decidedAt: "2026-06-30T22:50:00.000Z",
      decidedBy: "svc-admin-prisma-2",
      decidedByName: "Prisma Approver",
      decisionReason: "Prisma approval accepted",
      status: "approved",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-prisma-decision"
    });
    const approved = await repository.listBillingApprovals({ statuses: ["approved"], tenantId: "tenant-lumen" });

    assert.equal(saved.approvalId, "billing-approval-prisma");
    assert.equal(saved.createdAt, "2026-06-30T22:45:00.000Z");
    assert.equal(replay.approvalId, "billing-approval-prisma");
    assert.equal(replay.reason, "Approve Prisma-backed downgrade");
    assert.equal(replay.status, "pending");
    assert.equal(pending.length, 1);
    assert.equal(pending[0].approvalId, "billing-approval-prisma");
    assert.equal(byId?.requestFingerprint, "sha256:billing-approval-prisma");
    assert.equal(crossTenant, undefined);
    assert.equal(decided.status, "approved");
    assert.equal(decided.decidedByName, "Prisma Approver");
    assert.equal(decided.decisionReason, "Prisma approval accepted");
    assert.equal(decided.updatedAt, "2026-06-30T22:50:00.000Z");
    assert.deepEqual(decided.auditEvents?.[0], {
      action: "billing.approval.decided",
      approvalId: "billing-approval-prisma",
      at: "2026-06-30T22:50:00.000Z",
      decidedBy: "svc-admin-prisma-2",
      decidedByName: "Prisma Approver",
      decisionReason: "Prisma approval accepted",
      immutable: true,
      result: "approved",
      subjectId: "tenant-lumen:business:starter",
      subjectType: "tariff_change",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-prisma-decision"
    });
    assert.equal(approved.length, 1);
    await assert.rejects(async () => repository.decideBillingApproval({
      approvalId: "billing-approval-prisma",
      decidedAt: "2026-06-30T22:55:00.000Z",
      decidedBy: "svc-admin-prisma-3",
      decidedByName: "Late Prisma Approver",
      decisionReason: "Should fail",
      status: "rejected",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-prisma-late"
    }), /was not pending/);
    assert.equal(client.calls.billingApprovalCreates.length, 2);
    assert.equal(client.calls.billingApprovalCreates[0].data.createdAt instanceof Date, true);
    assert.deepEqual(client.calls.billingApprovalFindMany[0], {
      orderBy: { createdAt: "desc" },
      where: { status: { in: ["pending"] }, tenantId: "tenant-lumen" }
    });
    assert.equal(client.calls.billingApprovalUpdates.length, 1);
    assert.equal(client.calls.billingApprovalUpdates[0].data.decidedAt instanceof Date, true);
    assert.equal(client.calls.billingApprovalUpdates[0].data.auditEvents.length, 1);
  });

  it("redacts secret-like billing approval reasons through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });

    const saved = await repository.saveBillingApproval({
      approvalId: "billing-approval-redaction-prisma",
      createdAt: "2026-07-01T03:30:00.000Z",
      decidedAt: null,
      decidedBy: null,
      decidedByName: null,
      decisionReason: null,
      expiresAt: "2026-07-02T03:30:00.000Z",
      reason: "Approve emergency change with Bearer sk_live_prisma_approval_reason_secret",
      requestedBy: "svc-admin-prisma-1",
      requestedByName: "Prisma Service Admin",
      requestFingerprint: "sha256:billing-approval-redaction-prisma",
      status: "pending",
      subjectId: "tenant-lumen:business:starter",
      subjectType: "tariff_change",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-redaction-prisma-request",
      updatedAt: "2026-07-01T03:30:00.000Z"
    });

    const decided = await repository.decideBillingApproval({
      approvalId: "billing-approval-redaction-prisma",
      decidedAt: "2026-07-01T03:35:00.000Z",
      decidedBy: "svc-admin-prisma-2",
      decidedByName: "Prisma Approver",
      decisionReason: "Approved after providerToken=fake-provider-token-prisma-approval-secret-needle check",
      status: "approved",
      tenantId: "tenant-lumen",
      traceId: "trace-billing-approval-redaction-prisma-decision"
    });
    const serializedCalls = JSON.stringify({
      creates: client.calls.billingApprovalCreates,
      updates: client.calls.billingApprovalUpdates
    });

    assert.equal(serializedCalls.includes("sk_live_prisma_approval_reason_secret"), false);
    assert.equal(serializedCalls.includes("fake-provider-token-prisma-approval-secret-needle"), false);
    assert.match(saved.reason, /Bearer \[REDACTED:api_key\]/);
    assert.match(decided.decisionReason ?? "", /providerToken=\[REDACTED:provider_token\]/);
    assert.match(decided.auditEvents?.[0]?.decisionReason ?? "", /providerToken=\[REDACTED:provider_token\]/);
    assert.match(client.calls.billingApprovalCreates[0].data.reason, /Bearer \[REDACTED:api_key\]/);
    assert.match(client.calls.billingApprovalUpdates[0].data.decisionReason ?? "", /providerToken=\[REDACTED:provider_token\]/);
    assert.match(client.calls.billingApprovalUpdates[0].data.auditEvents[0].decisionReason, /providerToken=\[REDACTED:provider_token\]/);
  });

  it("persists billing legal entities through the Prisma billing adapter without raw document secrets", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });
    const legalEntity = {
      addressLine1: "Nevsky 10",
      addressLine2: null,
      city: "Saint Petersburg",
      country: "RU",
      createdAt: "2026-06-30T22:55:00.000Z",
      legalEntityId: "legal-entity-prisma",
      legalName: "Lumen Health LLC",
      postalCode: "191025",
      region: "RU-SPE",
      registrationNumber: "1027800000000",
      status: "pending_review" as const,
      taxId: "7800000000",
      tenantId: "tenant-lumen",
      traceId: "trace-legal-entity-prisma",
      updatedAt: "2026-06-30T22:55:00.000Z",
      vatId: null
    };

    const saved = await repository.saveBillingLegalEntity(legalEntity);
    const replay = await repository.saveBillingLegalEntity({
      ...legalEntity,
      legalEntityId: "legal-entity-prisma-replay",
      legalName: "Mutated Prisma Replay LLC",
      status: "active" as const,
      traceId: "trace-legal-entity-prisma-replay",
      updatedAt: "2026-06-30T22:56:00.000Z"
    });
    await repository.saveBillingLegalEntity({
      ...legalEntity,
      legalEntityId: "legal-entity-prisma-volga",
      legalName: "Volga Retail LLC",
      registrationNumber: "1027700000000",
      taxId: "7700000000",
      tenantId: "tenant-volga",
      vatId: "RU7700000000"
    });

    const rows = await repository.listBillingLegalEntities({ statuses: ["pending_review"], tenantId: "tenant-lumen" });
    const activeRows = await repository.listBillingLegalEntities({ statuses: ["active"], tenantId: "tenant-lumen" });
    const byId = await repository.findBillingLegalEntity("legal-entity-prisma", "tenant-lumen");
    const crossTenant = await repository.findBillingLegalEntity("legal-entity-prisma", "tenant-volga");
    const emptyTenantRows = await repository.listBillingLegalEntities({ tenantId: "" });
    const serializedCreate = JSON.stringify(client.calls.billingLegalEntityCreates[0].data);

    assert.equal(saved.legalEntityId, "legal-entity-prisma");
    assert.equal(saved.createdAt, "2026-06-30T22:55:00.000Z");
    assert.deepEqual(saved.auditEvents?.[0], {
      action: "billing.legal_entity.saved",
      at: "2026-06-30T22:55:00.000Z",
      immutable: true,
      legalEntityId: "legal-entity-prisma",
      legalName: "Lumen Health LLC",
      registrationNumber: "1027800000000",
      result: "pending_review",
      tenantId: "tenant-lumen",
      traceId: "trace-legal-entity-prisma"
    });
    assert.equal(replay.legalEntityId, "legal-entity-prisma");
    assert.equal(replay.legalName, "Lumen Health LLC");
    assert.equal(replay.status, "pending_review");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].legalEntityId, "legal-entity-prisma");
    assert.equal(activeRows.length, 0);
    assert.equal(byId?.registrationNumber, "1027800000000");
    assert.equal(crossTenant, undefined);
    assert.equal(emptyTenantRows.length, 0);
    assert.equal(client.calls.billingLegalEntityCreates.length, 2);
    assert.equal(client.calls.billingLegalEntityCreates[0].data.createdAt instanceof Date, true);
    assert.equal(client.calls.billingLegalEntityCreates[0].data.auditEvents.length, 1);
    assert.deepEqual(client.calls.billingLegalEntityFindMany[0], {
      orderBy: { updatedAt: "desc" },
      where: { status: { in: ["pending_review"] }, tenantId: "tenant-lumen" }
    });
    assert.equal(serializedCreate.includes("rawDocumentSecret"), false);
    assert.equal(serializedCreate.includes("raw-pdf-secret-needle"), false);
  });

  it("redacts secret-like billing legal entity text through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });

    const saved = await repository.saveBillingLegalEntity({
      addressLine1: "Nevsky 10 objectKey=tenant-lumen/private/legal-entity-prisma-secret.pdf",
      addressLine2: "Bearer sk_live_prisma_legal_entity_address_secret",
      city: "Saint Petersburg",
      country: "RU",
      createdAt: "2026-07-01T03:45:00.000Z",
      legalEntityId: "legal-entity-redaction-prisma",
      legalName: "Lumen providerToken=fake-provider-token-prisma-legal-entity-secret-needle LLC",
      postalCode: "191025",
      region: "Northwest",
      registrationNumber: "1027800000003",
      status: "pending_review",
      taxId: "7800000003",
      tenantId: "tenant-lumen",
      traceId: "trace-legal-entity-redaction-prisma",
      updatedAt: "2026-07-01T03:45:00.000Z",
      vatId: "RU7800000003"
    });
    const serializedCreate = JSON.stringify(client.calls.billingLegalEntityCreates[0].data);

    assert.equal(serializedCreate.includes("fake-provider-token-prisma-legal-entity-secret-needle"), false);
    assert.equal(serializedCreate.includes("sk_live_prisma_legal_entity_address_secret"), false);
    assert.equal(serializedCreate.includes("tenant-lumen/private/legal-entity-prisma-secret.pdf"), false);
    assert.match(saved.legalName, /providerToken=\[REDACTED:provider_token\]/);
    assert.match(saved.addressLine1, /objectKey=\[REDACTED:object_key\]/);
    assert.match(saved.addressLine2 ?? "", /Bearer \[REDACTED:api_key\]/);
    assert.match(saved.auditEvents?.[0]?.legalName ?? "", /providerToken=\[REDACTED:provider_token\]/);
    assert.match(client.calls.billingLegalEntityCreates[0].data.auditEvents[0].legalName, /providerToken=\[REDACTED:provider_token\]/);
  });

  it("persists billing tax document metadata through the Prisma billing adapter without raw document secrets", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });
    const document = {
      createdAt: "2026-06-30T23:20:00.000Z",
      documentId: "tax-document-prisma",
      documentType: "vat_certificate" as const,
      fileName: "vat-certificate.pdf",
      legalEntityId: "legal-entity-prisma",
      mimeType: "application/pdf",
      requestFingerprint: "sha256:tax-document-prisma",
      sha256: "sha256-tax-document-prisma",
      status: "pending_review" as const,
      storageLocator: "s3://billing-documents/tenant-lumen/tax-document-prisma",
      tenantId: "tenant-lumen",
      traceId: "trace-tax-document-prisma",
      updatedAt: "2026-06-30T23:20:00.000Z",
      uploadedBy: "svc-admin-prisma-1",
      uploadedByName: "Prisma Service Admin"
    };

    const saved = await repository.saveBillingTaxDocument({
      ...document,
      rawDocumentSecret: "raw-pdf-secret-needle"
    });
    const replay = await repository.saveBillingTaxDocument({
      ...document,
      documentId: "tax-document-prisma-replay",
      fileName: "mutated-replay.pdf",
      rawDocumentSecret: "raw-pdf-secret-needle",
      status: "approved" as const,
      traceId: "trace-tax-document-prisma-replay",
      updatedAt: "2026-06-30T23:21:00.000Z"
    });
    await repository.saveBillingTaxDocument({
      ...document,
      documentId: "tax-document-prisma-volga",
      legalEntityId: "legal-entity-prisma-volga",
      requestFingerprint: "sha256:tax-document-prisma-volga",
      sha256: "sha256-tax-document-prisma-volga",
      tenantId: "tenant-volga"
    });

    const rows = await repository.listBillingTaxDocuments({ documentTypes: ["vat_certificate"], statuses: ["pending_review"], tenantId: "tenant-lumen" });
    const approvedRows = await repository.listBillingTaxDocuments({ statuses: ["approved"], tenantId: "tenant-lumen" });
    const byId = await repository.findBillingTaxDocument("tax-document-prisma", "tenant-lumen");
    const crossTenant = await repository.findBillingTaxDocument("tax-document-prisma", "tenant-volga");
    const emptyTenantRows = await repository.listBillingTaxDocuments({ tenantId: "" });
    const serializedCreate = JSON.stringify(client.calls.billingTaxDocumentCreates[0].data);

    assert.equal(saved.documentId, "tax-document-prisma");
    assert.equal(saved.createdAt, "2026-06-30T23:20:00.000Z");
    assert.deepEqual(saved.auditEvents?.[0], {
      action: "billing.tax_document.saved",
      at: "2026-06-30T23:20:00.000Z",
      documentId: "tax-document-prisma",
      documentType: "vat_certificate",
      fileName: "vat-certificate.pdf",
      immutable: true,
      legalEntityId: "legal-entity-prisma",
      result: "pending_review",
      tenantId: "tenant-lumen",
      traceId: "trace-tax-document-prisma",
      uploadedBy: "svc-admin-prisma-1"
    });
    assert.equal(replay.documentId, "tax-document-prisma");
    assert.deepEqual(replay.auditEvents, saved.auditEvents);
    assert.equal(replay.fileName, "vat-certificate.pdf");
    assert.equal(replay.status, "pending_review");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].documentId, "tax-document-prisma");
    assert.equal(approvedRows.length, 0);
    assert.equal(byId?.storageLocator, "s3://billing-documents/tenant-lumen/tax-document-prisma");
    assert.equal(crossTenant, undefined);
    assert.equal(emptyTenantRows.length, 0);
    assert.equal(client.calls.billingTaxDocumentCreates.length, 2);
    assert.equal(client.calls.billingTaxDocumentCreates[0].data.createdAt instanceof Date, true);
    assert.equal(client.calls.billingTaxDocumentCreates[0].data.auditEvents.length, 1);
    assert.deepEqual(client.calls.billingTaxDocumentFindMany[0], {
      orderBy: { updatedAt: "desc" },
      where: {
        documentType: { in: ["vat_certificate"] },
        status: { in: ["pending_review"] },
        tenantId: "tenant-lumen"
      }
    });
    assert.equal(serializedCreate.includes("rawDocumentSecret"), false);
    assert.equal(serializedCreate.includes("raw-pdf-secret-needle"), false);
    assert.equal(serializedCreate.includes("storageLocator"), true);
    assert.equal(JSON.stringify(client.calls.billingTaxDocumentCreates[0].data.auditEvents).includes("storageLocator"), false);
    assert.equal(JSON.stringify(client.calls.billingTaxDocumentCreates[0].data.auditEvents).includes("s3://billing-documents"), false);
  });

  it("redacts secret-like billing tax document text through the Prisma billing adapter", async () => {
    const { client } = createFakePrismaBillingClient();
    const repository = BillingRepository.prisma({ client });

    const saved = await repository.saveBillingTaxDocument({
      createdAt: "2026-07-01T03:55:00.000Z",
      documentId: "tax-document-redaction-prisma",
      documentType: "vat_certificate",
      fileName: "vat-providerToken=fake-provider-token-prisma-tax-document-secret-needle.pdf",
      legalEntityId: "legal-entity-redaction-prisma",
      mimeType: "application/pdf",
      rawDocumentSecret: "raw-pdf-prisma-redaction-secret-needle",
      requestFingerprint: "sha256:tax-document-redaction-prisma",
      sha256: "sha256-tax-document-redaction-prisma",
      status: "pending_review",
      storageLocator: "s3://billing-documents/tenant-lumen/tax-document-redaction-prisma",
      tenantId: "tenant-lumen",
      traceId: "trace-tax-document-redaction-prisma",
      updatedAt: "2026-07-01T03:55:00.000Z",
      uploadedBy: "svc-admin-prisma-1",
      uploadedByName: "Bearer sk_live_prisma_tax_document_uploader_secret"
    });
    const serializedCreate = JSON.stringify(client.calls.billingTaxDocumentCreates[0].data);

    assert.equal(serializedCreate.includes("fake-provider-token-prisma-tax-document-secret-needle"), false);
    assert.equal(serializedCreate.includes("sk_live_prisma_tax_document_uploader_secret"), false);
    assert.equal(serializedCreate.includes("raw-pdf-prisma-redaction-secret-needle"), false);
    assert.match(saved.fileName, /providerToken=\[REDACTED:provider_token\]/);
    assert.match(saved.uploadedByName, /Bearer \[REDACTED:api_key\]/);
    assert.match(saved.auditEvents?.[0]?.fileName ?? "", /providerToken=\[REDACTED:provider_token\]/);
    assert.match(client.calls.billingTaxDocumentCreates[0].data.auditEvents[0].fileName, /providerToken=\[REDACTED:provider_token\]/);
  });

  it("bootstraps the default billing repository from a Prisma client factory", async () => {
    const { client } = createFakePrismaBillingClient();
    const factoryCalls: unknown[] = [];

    const repository = configureBillingRepository({
      BILLING_REPOSITORY: "prisma",
      DATABASE_URL: "postgresql://support:support@127.0.0.1:5432/support_communication",
      NODE_ENV: "test",
      PORT: "4191",
      SERVICE_NAME: "api-gateway"
    }, {
      prismaClientFactory: (options) => {
        factoryCalls.push(options);
        return client;
      }
    });

    assert.equal(BillingRepository.default(), repository);
    assert.deepEqual(factoryCalls, [{
      datasourceUrl: "postgresql://support:support@127.0.0.1:5432/support_communication"
    }]);

    const tenant = await BillingRepository.default().findTenant("tenant-lumen");
    assert.equal(tenant?.planId, "starter");
  });
});

function createFakePrismaBillingClient() {
  const billingTenants = new Map<string, FakeBillingTenantStateRow>([[
    "tenant-lumen",
    {
      arr: 468000,
      healthScore: 84,
      id: "tenant-lumen",
      monthlyRevenue: 39000,
      name: "Lumen Health",
      owner: "Maria Lumen",
      planId: "starter",
      region: "ru-spb",
      sla: "99.0",
      status: "trial",
      usage: {
        aiTokens: 180000,
        botRuns: 1200,
        channels: 3,
        operators: 24,
        reportExports: 12,
        storageGb: 18,
        webhooks: 19000
      },
      users: 24,
      workspaces: 2
    }
  ]]);
  const billingApprovals = new Map<string, FakeBillingApprovalRow>();
  const billingLegalEntities = new Map<string, FakeBillingLegalEntityRow>();
  const billingTaxDocuments = new Map<string, FakeBillingTaxDocumentRow>();
  const quotaReservations = new Map<string, FakeBillingQuotaReservationRow>();
  const paymentRetrySchedules = new Map<string, FakeBillingPaymentRetryScheduleRow>();
  const paymentRetryKeys = new Map<string, FakeBillingPaymentRetryKeyRow>();
  const paymentDunningStates = new Map<string, FakeBillingPaymentDunningStateRow>();
  const reconciliationConflicts = new Map<string, FakeBillingReconciliationConflictRow>();
  const calls = {
    billingApprovalCreates: [] as Array<{ data: FakeBillingApprovalCreateInput }>,
    billingApprovalFindFirst: [] as Array<{ where: { OR: Array<{ approvalId?: string; requestFingerprint?: string; tenantId?: string }> } }>,
    billingApprovalFindMany: [] as Array<{
      orderBy: { createdAt: "desc" };
      where: { status?: { in: string[] }; subjectType?: string; tenantId: string };
    }>,
    billingApprovalFindUnique: [] as Array<{ where: { tenantId_approvalId: { approvalId: string; tenantId: string } } }>,
    billingApprovalUpdates: [] as Array<{
      data: FakeBillingApprovalUpdateInput;
      where: { tenantId_approvalId: { approvalId: string; tenantId: string } };
    }>,
    billingLegalEntityCreates: [] as Array<{ data: FakeBillingLegalEntityCreateInput }>,
    billingLegalEntityFindFirst: [] as Array<{ where: { OR: Array<{ legalEntityId?: string; registrationNumber?: string; tenantId?: string }> } }>,
    billingLegalEntityFindMany: [] as Array<{
      orderBy: { updatedAt: "desc" };
      where: { status?: { in: string[] }; tenantId: string };
    }>,
    billingLegalEntityFindUnique: [] as Array<{ where: { tenantId_legalEntityId: { legalEntityId: string; tenantId: string } } }>,
    billingTaxDocumentCreates: [] as Array<{ data: FakeBillingTaxDocumentCreateInput }>,
    billingTaxDocumentFindFirst: [] as Array<{ where: { OR: Array<{ documentId?: string; requestFingerprint?: string; tenantId?: string }> } }>,
    billingTaxDocumentFindMany: [] as Array<{
      orderBy: { updatedAt: "desc" };
      where: { documentType?: { in: string[] }; status?: { in: string[] }; tenantId: string };
    }>,
    billingTaxDocumentFindUnique: [] as Array<{ where: { tenantId_documentId: { documentId: string; tenantId: string } } }>,
    billingInvoiceFinds: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: { tenantId: string } }>,
    billingInvoiceUpserts: [] as Array<{ create: FakeBillingInvoiceUpsertInput; update: FakeBillingInvoiceUpsertInput; where: FakeBillingInvoiceWhereUniqueInput }>,
    billingProviderSyncEventCreates: [] as Array<{ data: FakeBillingProviderSyncEventCreateInput }>,
    billingProviderSyncEventFindUnique: [] as Array<{ where: { idempotencyKey: string } }>,
    billingProviderSyncEventUpdates: [] as Array<{ data: { auditEvents: Array<Record<string, unknown>> }; where: { idempotencyKey: string } }>,
    queryRawUnsafe: [] as Array<{ args: unknown[]; query: string }>,
    billingQuotaLedgerEntryCreates: [] as Array<{ data: FakeBillingQuotaLedgerEntryCreateInput }>,
    billingQuotaLedgerEntryFinds: [] as Array<{ orderBy: { createdAt: "desc" }; where?: { tenantId: string } }>,
    billingQuotaLedgerEntryFindUnique: [] as Array<{ where: { idempotencyKey: string } }>,
    billingQuotaReservationCreates: [] as Array<{ data: FakeBillingQuotaReservationCreateInput }>,
    billingQuotaReservationFinds: [] as Array<{
      orderBy: { createdAt: "desc" } | Array<{ expiresAt: "asc" } | { createdAt: "asc" } | { lockedAt: { nulls: "first"; sort: "asc" } } | { id: "asc" }>;
      take?: number;
      where?: {
        expiresAt?: { lte: Date };
        OR?: Array<{ lockedAt: null } | { lockedAt: { lte: Date } }>;
        resource?: string;
        status?: string | { in: string[] };
        tenantId?: string;
      };
    }>,
    billingQuotaReservationFindUnique: [] as Array<{ where: { id?: string; idempotencyKey?: string } }>,
    billingQuotaReservationUpdates: [] as Array<{ data: Partial<FakeBillingQuotaReservationRow>; where: { id: string } }>,
    billingPaymentRetryScheduleCreates: [] as Array<{ data: FakeBillingPaymentRetryScheduleCreateInput }>,
    billingPaymentRetryScheduleFindFirst: [] as Array<{ where: { OR: Array<{ idempotencyKey?: string; scheduleId?: string; tenantId?: string }> } }>,
    billingPaymentRetryScheduleFindMany: [] as Array<{
      orderBy: { nextAttemptAt: "desc" };
      where: { invoiceId?: string; status?: { in: string[] }; tenantId: string };
    }>,
    billingPaymentRetryScheduleFindUnique: [] as Array<{ where: { idempotencyKey: string } }>,
    billingPaymentRetryKeyCreates: [] as Array<{ data: FakeBillingPaymentRetryKeyCreateInput }>,
    billingPaymentRetryKeyFindFirst: [] as Array<{ where: { OR: Array<{ idempotencyKey?: string; retryKeyId?: string; tenantId?: string }> } }>,
    billingPaymentRetryKeyFindMany: [] as Array<{
      orderBy: { firstAttemptAt: "desc" };
      where: { invoiceId?: string; status?: { in: string[] }; tenantId: string };
    }>,
    billingPaymentRetryKeyFindUnique: [] as Array<{ where: { idempotencyKey: string } }>,
    billingPaymentDunningStateCreates: [] as Array<{ data: FakeBillingPaymentDunningStateCreateInput }>,
    billingPaymentDunningStateFindFirst: [] as Array<{ where: { OR: Array<{ dunningId?: string; idempotencyKey?: string; tenantId?: string }> } }>,
    billingPaymentDunningStateFindMany: [] as Array<{
      orderBy: { updatedAt: "desc" };
      where: { invoiceId?: string; status?: { in: string[] }; tenantId: string };
    }>,
    billingPaymentDunningStateFindUnique: [] as Array<{ where: { idempotencyKey: string } }>,
    billingReconciliationConflictCreates: [] as Array<{ data: FakeBillingReconciliationConflictCreateInput }>,
    billingReconciliationConflictFindFirst: [] as Array<{ where: { OR: Array<{ conflictId?: string; idempotencyKey?: string; tenantId?: string }> } }>,
    billingReconciliationConflictFindMany: [] as Array<{
      orderBy: { detectedAt: "desc" };
      where: { invoiceId?: string; severity?: { in: string[] }; status?: { in: string[] }; tenantId: string };
    }>,
    billingReconciliationConflictFindUnique: [] as Array<{ where: { idempotencyKey: string } }>,
    billingSubscriptionFinds: [] as Array<{ orderBy: { updatedAt: "desc" }; where: { tenantId: string } }>,
    billingSubscriptionUpserts: [] as Array<{ create: FakeBillingSubscriptionUpsertInput; update: FakeBillingSubscriptionUpsertInput; where: FakeBillingSubscriptionWhereUniqueInput }>,
    billingSyncJobCreates: [] as Array<{ data: FakeBillingSyncJobCreateInput }>,
    billingTenantUpdates: [] as Array<{ data: Partial<FakeBillingTenantStateRow>; where: { id: string } }>,
    transactions: 0
  };

  const delegates = {
    billingApproval: {
      create: async (input: { data: FakeBillingApprovalCreateInput }) => {
        calls.billingApprovalCreates.push(input);
        billingApprovals.set(`${input.data.tenantId}:${input.data.approvalId}`, cloneFake(input.data));
        return cloneFake(input.data);
      },
      findFirst: async (input: { where: { OR: Array<{ approvalId?: string; requestFingerprint?: string; tenantId?: string }> } }) => {
        calls.billingApprovalFindFirst.push(input);
        const row = Array.from(billingApprovals.values()).find((approval) => input.where.OR.some((condition) => {
          if (condition.approvalId && condition.tenantId) {
            return approval.approvalId === condition.approvalId && approval.tenantId === condition.tenantId;
          }
          if (condition.requestFingerprint && condition.tenantId) {
            return approval.requestFingerprint === condition.requestFingerprint && approval.tenantId === condition.tenantId;
          }
          return false;
        }));
        return row ? cloneFake(row) : null;
      },
      findMany: async (input: {
        orderBy: { createdAt: "desc" };
        where: { status?: { in: string[] }; subjectType?: string; tenantId: string };
      }) => {
        calls.billingApprovalFindMany.push(input);
        return Array.from(billingApprovals.values())
          .filter((approval) => {
            if (approval.tenantId !== input.where.tenantId) return false;
            if (input.where.subjectType && approval.subjectType !== input.where.subjectType) return false;
            if (input.where.status && !input.where.status.in.includes(approval.status)) return false;
            return true;
          })
          .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
          .map(cloneFake);
      },
      findUnique: async (input: { where: { tenantId_approvalId: { approvalId: string; tenantId: string } } }) => {
        calls.billingApprovalFindUnique.push(input);
        const row = billingApprovals.get(`${input.where.tenantId_approvalId.tenantId}:${input.where.tenantId_approvalId.approvalId}`);
        return row ? cloneFake(row) : null;
      },
      update: async (input: {
        data: FakeBillingApprovalUpdateInput;
        where: { tenantId_approvalId: { approvalId: string; tenantId: string } };
      }) => {
        calls.billingApprovalUpdates.push(input);
        const key = `${input.where.tenantId_approvalId.tenantId}:${input.where.tenantId_approvalId.approvalId}`;
        const row = billingApprovals.get(key);
        if (!row) {
          throw new Error(`Missing fake billing approval ${input.where.tenantId_approvalId.approvalId}`);
        }

        const next = { ...row, ...input.data };
        billingApprovals.set(key, cloneFake(next));
        return cloneFake(next);
      }
    },
    billingLegalEntity: {
      create: async (input: { data: FakeBillingLegalEntityCreateInput }) => {
        calls.billingLegalEntityCreates.push(input);
        billingLegalEntities.set(`${input.data.tenantId}:${input.data.legalEntityId}`, cloneFake(input.data));
        return cloneFake(input.data);
      },
      findFirst: async (input: { where: { OR: Array<{ legalEntityId?: string; registrationNumber?: string; tenantId?: string }> } }) => {
        calls.billingLegalEntityFindFirst.push(input);
        const row = Array.from(billingLegalEntities.values()).find((entity) => input.where.OR.some((condition) => {
          if (condition.legalEntityId && condition.tenantId) {
            return entity.legalEntityId === condition.legalEntityId && entity.tenantId === condition.tenantId;
          }
          if (condition.registrationNumber && condition.tenantId) {
            return entity.registrationNumber === condition.registrationNumber && entity.tenantId === condition.tenantId;
          }
          return false;
        }));
        return row ? cloneFake(row) : null;
      },
      findMany: async (input: {
        orderBy: { updatedAt: "desc" };
        where: { status?: { in: string[] }; tenantId: string };
      }) => {
        calls.billingLegalEntityFindMany.push(input);
        return Array.from(billingLegalEntities.values())
          .filter((entity) => {
            if (entity.tenantId !== input.where.tenantId) return false;
            if (input.where.status && !input.where.status.in.includes(entity.status)) return false;
            return true;
          })
          .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
          .map(cloneFake);
      },
      findUnique: async (input: { where: { tenantId_legalEntityId: { legalEntityId: string; tenantId: string } } }) => {
        calls.billingLegalEntityFindUnique.push(input);
        const row = billingLegalEntities.get(`${input.where.tenantId_legalEntityId.tenantId}:${input.where.tenantId_legalEntityId.legalEntityId}`);
        return row ? cloneFake(row) : null;
      }
    },
    billingTaxDocument: {
      create: async (input: { data: FakeBillingTaxDocumentCreateInput }) => {
        calls.billingTaxDocumentCreates.push(input);
        billingTaxDocuments.set(`${input.data.tenantId}:${input.data.documentId}`, cloneFake(input.data));
        return cloneFake(input.data);
      },
      findFirst: async (input: { where: { OR: Array<{ documentId?: string; requestFingerprint?: string; tenantId?: string }> } }) => {
        calls.billingTaxDocumentFindFirst.push(input);
        const row = Array.from(billingTaxDocuments.values()).find((document) => input.where.OR.some((condition) => {
          if (condition.documentId && condition.tenantId) {
            return document.documentId === condition.documentId && document.tenantId === condition.tenantId;
          }
          if (condition.requestFingerprint && condition.tenantId) {
            return document.requestFingerprint === condition.requestFingerprint && document.tenantId === condition.tenantId;
          }
          return false;
        }));
        return row ? cloneFake(row) : null;
      },
      findMany: async (input: {
        orderBy: { updatedAt: "desc" };
        where: { documentType?: { in: string[] }; status?: { in: string[] }; tenantId: string };
      }) => {
        calls.billingTaxDocumentFindMany.push(input);
        return Array.from(billingTaxDocuments.values())
          .filter((document) => {
            if (document.tenantId !== input.where.tenantId) return false;
            if (input.where.documentType && !input.where.documentType.in.includes(document.documentType)) return false;
            if (input.where.status && !input.where.status.in.includes(document.status)) return false;
            return true;
          })
          .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
          .map(cloneFake);
      },
      findUnique: async (input: { where: { tenantId_documentId: { documentId: string; tenantId: string } } }) => {
        calls.billingTaxDocumentFindUnique.push(input);
        const row = billingTaxDocuments.get(`${input.where.tenantId_documentId.tenantId}:${input.where.tenantId_documentId.documentId}`);
        return row ? cloneFake(row) : null;
      }
    },
    billingInvoice: {
      findMany: async (input: { orderBy: { updatedAt: "desc" }; where?: { tenantId: string } }) => {
        calls.billingInvoiceFinds.push(input);
        return calls.billingInvoiceUpserts.map((call) => call.create);
      },
      upsert: async (input: { create: FakeBillingInvoiceUpsertInput; update: FakeBillingInvoiceUpsertInput; where: FakeBillingInvoiceWhereUniqueInput }) => {
        calls.billingInvoiceUpserts.push(input);
        return input.create;
      }
    },
    billingProviderSyncEvent: {
      create: async (input: { data: FakeBillingProviderSyncEventCreateInput }) => {
        calls.billingProviderSyncEventCreates.push(input);
        return input.data;
      },
      findUnique: async (input: { where: { idempotencyKey: string } }) => {
        calls.billingProviderSyncEventFindUnique.push(input);
        return calls.billingProviderSyncEventCreates.find((call) => call.data.idempotencyKey === input.where.idempotencyKey)?.data ?? null;
      },
      update: async (input: { data: { auditEvents: Array<Record<string, unknown>> }; where: { idempotencyKey: string } }) => {
        calls.billingProviderSyncEventUpdates.push(input);
        const existing = calls.billingProviderSyncEventCreates.find((call) => call.data.idempotencyKey === input.where.idempotencyKey);
        if (!existing) {
          throw new Error("provider sync event not found");
        }
        existing.data = { ...existing.data, auditEvents: input.data.auditEvents };
        return existing.data;
      }
    },
    billingQuotaLedgerEntry: {
      create: async (input: { data: FakeBillingQuotaLedgerEntryCreateInput }) => {
        calls.billingQuotaLedgerEntryCreates.push(input);
        return input.data;
      },
      findMany: async (input: { orderBy: { createdAt: "desc" }; where?: { tenantId: string } }) => {
        calls.billingQuotaLedgerEntryFinds.push(input);
        return calls.billingQuotaLedgerEntryCreates.map((call) => call.data);
      },
      findUnique: async (input: { where: { idempotencyKey: string } }) => {
        calls.billingQuotaLedgerEntryFindUnique.push(input);
        return calls.billingQuotaLedgerEntryCreates.find((call) => call.data.idempotencyKey === input.where.idempotencyKey)?.data ?? null;
      }
    },
    billingQuotaReservation: {
      create: async (input: { data: FakeBillingQuotaReservationCreateInput }) => {
        calls.billingQuotaReservationCreates.push(input);
        quotaReservations.set(input.data.id, input.data);
        return input.data;
      },
      findMany: async (input: {
        orderBy: { createdAt: "desc" } | Array<{ expiresAt: "asc" } | { createdAt: "asc" } | { lockedAt: { nulls: "first"; sort: "asc" } } | { id: "asc" }>;
        take?: number;
        where?: {
          expiresAt?: { lte: Date };
          OR?: Array<{ lockedAt: null } | { lockedAt: { lte: Date } }>;
          resource?: string;
          status?: string | { in: string[] };
          tenantId?: string;
        };
      }) => {
        calls.billingQuotaReservationFinds.push(input);
        const rows = Array.from(quotaReservations.values()).filter((reservation) => {
          if (input.where?.tenantId && reservation.tenantId !== input.where.tenantId) return false;
          if (input.where?.resource && reservation.resource !== input.where.resource) return false;
          if (typeof input.where?.status === "string" && reservation.status !== input.where.status) return false;
          if (typeof input.where?.status === "object" && !input.where.status.in.includes(reservation.status)) return false;
          if (input.where?.expiresAt && new Date(reservation.expiresAt).getTime() > input.where.expiresAt.lte.getTime()) return false;
          if (input.where?.OR && !input.where.OR.some((condition) => {
            if ("lockedAt" in condition && condition.lockedAt === null) return reservation.lockedAt === null;
            if ("lockedAt" in condition && condition.lockedAt && reservation.lockedAt) {
              return new Date(reservation.lockedAt).getTime() <= condition.lockedAt.lte.getTime();
            }
            return false;
          })) return false;
          return true;
        }).sort((left, right) => {
          if (Array.isArray(input.orderBy)) {
            return String(left.expiresAt).localeCompare(String(right.expiresAt))
              || String(left.createdAt).localeCompare(String(right.createdAt))
              || compareNullableFakeDateFirst(left.lockedAt, right.lockedAt)
              || String(left.id).localeCompare(String(right.id));
          }
          return String(right.createdAt).localeCompare(String(left.createdAt));
        });
        return typeof input.take === "number" ? rows.slice(0, input.take) : rows;
      },
      findUnique: async (input: { where: { id?: string; idempotencyKey?: string } }) => {
        calls.billingQuotaReservationFindUnique.push(input);
        if (input.where.id) {
          return quotaReservations.get(input.where.id) ?? null;
        }
        return Array.from(quotaReservations.values()).find((reservation) => reservation.idempotencyKey === input.where.idempotencyKey) ?? null;
      },
      update: async (input: { data: Partial<FakeBillingQuotaReservationRow>; where: { id: string } }) => {
        calls.billingQuotaReservationUpdates.push(input);
        const row = quotaReservations.get(input.where.id);
        if (!row) {
          throw new Error(`Missing fake quota reservation ${input.where.id}`);
        }

        const next = { ...row, ...input.data };
        quotaReservations.set(next.id, next);
        return next;
      }
    },
    billingPaymentRetrySchedule: {
      create: async (input: { data: FakeBillingPaymentRetryScheduleCreateInput }) => {
        calls.billingPaymentRetryScheduleCreates.push(input);
        paymentRetrySchedules.set(`${input.data.tenantId}:${input.data.scheduleId}`, input.data);
        return input.data;
      },
      findFirst: async (input: { where: { OR: Array<{ idempotencyKey?: string; scheduleId?: string; tenantId?: string }> } }) => {
        calls.billingPaymentRetryScheduleFindFirst.push(input);
        return Array.from(paymentRetrySchedules.values()).find((schedule) => input.where.OR.some((condition) => {
          if (condition.idempotencyKey && schedule.idempotencyKey === condition.idempotencyKey) {
            return true;
          }
          return Boolean(
            condition.scheduleId
              && condition.tenantId
              && schedule.scheduleId === condition.scheduleId
              && schedule.tenantId === condition.tenantId
          );
        })) ?? null;
      },
      findMany: async (input: {
        orderBy: { nextAttemptAt: "desc" };
        where: { invoiceId?: string; status?: { in: string[] }; tenantId: string };
      }) => {
        calls.billingPaymentRetryScheduleFindMany.push(input);
        return Array.from(paymentRetrySchedules.values())
          .filter((schedule) => {
            if (schedule.tenantId !== input.where.tenantId) return false;
            if (input.where.invoiceId && schedule.invoiceId !== input.where.invoiceId) return false;
            if (input.where.status && !input.where.status.in.includes(schedule.status)) return false;
            return true;
          })
          .sort((left, right) => String(right.nextAttemptAt).localeCompare(String(left.nextAttemptAt)));
      },
      findUnique: async (input: { where: { idempotencyKey: string } }) => {
        calls.billingPaymentRetryScheduleFindUnique.push(input);
        return Array.from(paymentRetrySchedules.values()).find((schedule) => schedule.idempotencyKey === input.where.idempotencyKey) ?? null;
      }
    },
    billingPaymentRetryKey: {
      create: async (input: { data: FakeBillingPaymentRetryKeyCreateInput }) => {
        calls.billingPaymentRetryKeyCreates.push(input);
        paymentRetryKeys.set(`${input.data.tenantId}:${input.data.retryKeyId}`, cloneFake(input.data));
        return cloneFake(input.data);
      },
      findFirst: async (input: { where: { OR: Array<{ idempotencyKey?: string; retryKeyId?: string; tenantId?: string }> } }) => {
        calls.billingPaymentRetryKeyFindFirst.push(input);
        const row = Array.from(paymentRetryKeys.values()).find((key) => input.where.OR.some((condition) => {
          if (condition.idempotencyKey && key.idempotencyKey === condition.idempotencyKey) {
            return true;
          }
          return Boolean(
            condition.retryKeyId
              && condition.tenantId
              && key.retryKeyId === condition.retryKeyId
              && key.tenantId === condition.tenantId
          );
        }));
        return row ? cloneFake(row) : null;
      },
      findMany: async (input: {
        orderBy: { firstAttemptAt: "desc" };
        where: { invoiceId?: string; status?: { in: string[] }; tenantId: string };
      }) => {
        calls.billingPaymentRetryKeyFindMany.push(input);
        return Array.from(paymentRetryKeys.values())
          .filter((key) => {
            if (key.tenantId !== input.where.tenantId) return false;
            if (input.where.invoiceId && key.invoiceId !== input.where.invoiceId) return false;
            if (input.where.status && !input.where.status.in.includes(key.status)) return false;
            return true;
          })
          .sort((left, right) => String(right.firstAttemptAt).localeCompare(String(left.firstAttemptAt)))
          .map(cloneFake);
      },
      findUnique: async (input: { where: { idempotencyKey: string } }) => {
        calls.billingPaymentRetryKeyFindUnique.push(input);
        const row = Array.from(paymentRetryKeys.values()).find((key) => key.idempotencyKey === input.where.idempotencyKey);
        return row ? cloneFake(row) : null;
      }
    },
    billingPaymentDunningState: {
      create: async (input: { data: FakeBillingPaymentDunningStateCreateInput }) => {
        calls.billingPaymentDunningStateCreates.push(input);
        paymentDunningStates.set(`${input.data.tenantId}:${input.data.dunningId}`, input.data);
        return input.data;
      },
      findFirst: async (input: { where: { OR: Array<{ dunningId?: string; idempotencyKey?: string; tenantId?: string }> } }) => {
        calls.billingPaymentDunningStateFindFirst.push(input);
        return Array.from(paymentDunningStates.values()).find((state) => input.where.OR.some((condition) => {
          if (condition.idempotencyKey && state.idempotencyKey === condition.idempotencyKey) {
            return true;
          }
          return Boolean(
            condition.dunningId
              && condition.tenantId
              && state.dunningId === condition.dunningId
              && state.tenantId === condition.tenantId
          );
        })) ?? null;
      },
      findMany: async (input: {
        orderBy: { updatedAt: "desc" };
        where: { invoiceId?: string; status?: { in: string[] }; tenantId: string };
      }) => {
        calls.billingPaymentDunningStateFindMany.push(input);
        return Array.from(paymentDunningStates.values())
          .filter((state) => {
            if (state.tenantId !== input.where.tenantId) return false;
            if (input.where.invoiceId && state.invoiceId !== input.where.invoiceId) return false;
            if (input.where.status && !input.where.status.in.includes(state.status)) return false;
            return true;
          })
          .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
      },
      findUnique: async (input: { where: { idempotencyKey: string } }) => {
        calls.billingPaymentDunningStateFindUnique.push(input);
        return Array.from(paymentDunningStates.values()).find((state) => state.idempotencyKey === input.where.idempotencyKey) ?? null;
      }
    },
    billingReconciliationConflict: {
      create: async (input: { data: FakeBillingReconciliationConflictCreateInput }) => {
        calls.billingReconciliationConflictCreates.push(input);
        reconciliationConflicts.set(`${input.data.tenantId}:${input.data.conflictId}`, cloneFake(input.data));
        return cloneFake(input.data);
      },
      findFirst: async (input: { where: { OR: Array<{ conflictId?: string; idempotencyKey?: string; tenantId?: string }> } }) => {
        calls.billingReconciliationConflictFindFirst.push(input);
        const row = Array.from(reconciliationConflicts.values()).find((conflict) => input.where.OR.some((condition) => {
          if (condition.idempotencyKey && conflict.idempotencyKey === condition.idempotencyKey) {
            return true;
          }
          return Boolean(
            condition.conflictId
              && condition.tenantId
              && conflict.conflictId === condition.conflictId
              && conflict.tenantId === condition.tenantId
          );
        }));
        return row ? cloneFake(row) : null;
      },
      findMany: async (input: {
        orderBy: { detectedAt: "desc" };
        where: { invoiceId?: string; severity?: { in: string[] }; status?: { in: string[] }; tenantId: string };
      }) => {
        calls.billingReconciliationConflictFindMany.push(input);
        return Array.from(reconciliationConflicts.values())
          .filter((conflict) => {
            if (conflict.tenantId !== input.where.tenantId) return false;
            if (input.where.invoiceId && conflict.invoiceId !== input.where.invoiceId) return false;
            if (input.where.severity && !input.where.severity.in.includes(conflict.severity)) return false;
            if (input.where.status && !input.where.status.in.includes(conflict.status)) return false;
            return true;
          })
          .sort((left, right) => String(right.detectedAt).localeCompare(String(left.detectedAt)))
          .map(cloneFake);
      },
      findUnique: async (input: { where: { idempotencyKey: string } }) => {
        calls.billingReconciliationConflictFindUnique.push(input);
        const row = Array.from(reconciliationConflicts.values()).find((conflict) => conflict.idempotencyKey === input.where.idempotencyKey);
        return row ? cloneFake(row) : null;
      }
    },
    billingSyncJob: {
      create: async (input: { data: FakeBillingSyncJobCreateInput }) => {
        calls.billingSyncJobCreates.push(input);
        return input.data;
      },
      findMany: async () => []
    },
    billingSubscription: {
      findFirst: async (input: { orderBy: { updatedAt: "desc" }; where: { tenantId: string } }) => {
        calls.billingSubscriptionFinds.push(input);
        return calls.billingSubscriptionUpserts.find((call) => call.create.tenantId === input.where.tenantId)?.create ?? null;
      },
      upsert: async (input: { create: FakeBillingSubscriptionUpsertInput; update: FakeBillingSubscriptionUpsertInput; where: FakeBillingSubscriptionWhereUniqueInput }) => {
        calls.billingSubscriptionUpserts.push(input);
        return input.create;
      }
    },
    billingTenantState: {
      findMany: async () => Array.from(billingTenants.values()),
      findUnique: async (input: { where: { id: string } }) => billingTenants.get(input.where.id) ?? null,
      update: async (input: { data: Partial<FakeBillingTenantStateRow>; where: { id: string } }) => {
        calls.billingTenantUpdates.push(input);
        const row = billingTenants.get(input.where.id);
        if (!row) {
          throw new Error(`Missing fake billing tenant ${input.where.id}`);
        }

        const next = { ...row, ...input.data };
        billingTenants.set(next.id, next);
        return next;
      }
    }
  };

  const client = {
    ...delegates,
    calls,
    $queryRawUnsafe: async (query: string, ...args: unknown[]) => {
      calls.queryRawUnsafe.push({ args, query });
      const [idempotencyKey, auditEventsJson] = args;
      const existing = calls.billingProviderSyncEventCreates.find((call) => call.data.idempotencyKey === idempotencyKey);
      if (!existing) {
        return [];
      }
      const auditEvents = [
        ...(existing.data.auditEvents ?? []),
        ...JSON.parse(String(auditEventsJson)) as Array<Record<string, unknown>>
      ];
      existing.data = { ...existing.data, auditEvents };
      return [existing.data];
    },
    $transaction: async <T>(operation: (transactionClient: typeof delegates) => Promise<T>) => {
      calls.transactions += 1;
      return operation(delegates);
    }
  };

  return { calls, client };
}

interface FakeBillingTenantStateRow {
  arr: number;
  healthScore: number;
  id: string;
  monthlyRevenue: number;
  name: string;
  owner: string;
  planId: string;
  region: string;
  sla: string;
  status: string;
  usage: Record<string, unknown>;
  users: number;
  workspaces: number;
}

interface FakeBillingSubscriptionUpsertInput {
  billingPeriod: string;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  currency: string;
  currentPeriodEnd: Date;
  currentPeriodStart: Date;
  id: string;
  planId: string;
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  seats: number;
  status: string;
  tenantId: string;
  unitAmountMonthly: number;
  updatedAt: Date;
}

interface FakeBillingSubscriptionWhereUniqueInput {
  provider_providerSubscriptionId: {
    provider: string;
    providerSubscriptionId: string;
  };
}

interface FakeBillingInvoiceUpsertInput {
  amountDue: number;
  amountPaid: number;
  createdAt: Date;
  currency: string;
  dueAt: Date;
  hostedInvoiceUrl: string | null;
  id: string;
  paidAt: Date | null;
  paymentStatus: string;
  provider: string;
  providerInvoiceId: string;
  status: string;
  subscriptionId: string | null;
  tenantId: string;
  updatedAt: Date;
}

interface FakeBillingInvoiceWhereUniqueInput {
  provider_providerInvoiceId: {
    provider: string;
    providerInvoiceId: string;
  };
}

interface FakeBillingProviderSyncEventCreateInput {
  auditEvents?: Array<Record<string, unknown>>;
  createdAt: Date;
  eventType: string;
  id: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  provider: string;
  requestFingerprint: string;
  status: string;
  syncJobId: string;
  tenantId: string;
  traceId: string;
}

interface FakeBillingApprovalRow {
  approvalId: string;
  auditEvents?: Array<Record<string, unknown>>;
  createdAt: Date | string;
  decidedAt: Date | string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  expiresAt: Date | string;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestFingerprint: string;
  status: string;
  subjectId: string;
  subjectType: string;
  tenantId: string;
  traceId: string;
  updatedAt: Date | string;
}

type FakeBillingApprovalCreateInput = FakeBillingApprovalRow;

interface FakeBillingApprovalUpdateInput {
  auditEvents: Array<Record<string, unknown>>;
  decidedAt: Date | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  status: string;
  traceId: string;
  updatedAt: Date;
}

interface FakeBillingLegalEntityRow {
  addressLine1: string;
  addressLine2: string | null;
  auditEvents?: Array<Record<string, unknown>>;
  city: string;
  country: string;
  createdAt: Date | string;
  legalEntityId: string;
  legalName: string;
  postalCode: string;
  region: string;
  registrationNumber: string;
  status: string;
  taxId: string;
  tenantId: string;
  traceId: string;
  updatedAt: Date | string;
  vatId: string | null;
}

type FakeBillingLegalEntityCreateInput = FakeBillingLegalEntityRow;

interface FakeBillingTaxDocumentRow {
  auditEvents: Array<Record<string, unknown>>;
  createdAt: Date | string;
  documentId: string;
  documentType: string;
  fileName: string;
  legalEntityId: string;
  mimeType: string;
  requestFingerprint: string;
  sha256: string;
  status: string;
  storageLocator: string;
  tenantId: string;
  traceId: string;
  updatedAt: Date | string;
  uploadedBy: string;
  uploadedByName: string;
}

type FakeBillingTaxDocumentCreateInput = FakeBillingTaxDocumentRow;

interface FakeBillingQuotaReservationRow {
  auditEvent?: Record<string, unknown> | null;
  auditEvents?: Array<Record<string, unknown>>;
  commitIdempotencyKey: string | null;
  committedAt: Date | string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  id: string;
  idempotencyKey: string;
  limit: number;
  lockedAt: Date | string | null;
  planId: string;
  releaseIdempotencyKey: string | null;
  releasedAt: Date | string | null;
  requested: number;
  requestFingerprint: string;
  resource: string;
  status: string;
  tenantId: string;
  traceId: string;
  updatedAt: Date | string;
  usedAfter: number | null;
  usedBefore: number;
}

type FakeBillingQuotaReservationCreateInput = FakeBillingQuotaReservationRow;

interface FakeBillingPaymentRetryScheduleRow {
  attempt: number;
  createdAt: Date | string;
  idempotencyKey: string;
  invoiceId: string;
  lastAttemptAt: Date | string | null;
  maxAttempts: number;
  nextAttemptAt: Date | string;
  provider: string;
  providerInvoiceId: string;
  requestFingerprint: string;
  scheduleId: string;
  status: string;
  tenantId: string;
  traceId: string;
  updatedAt: Date | string;
}

type FakeBillingPaymentRetryScheduleCreateInput = FakeBillingPaymentRetryScheduleRow;

interface FakeBillingPaymentRetryKeyRow {
  attempt: number;
  createdAt: Date | string;
  firstAttemptAt: Date | string;
  idempotencyKey: string;
  invoiceId: string;
  lastAttemptAt: Date | string | null;
  provider: string;
  providerInvoiceId: string;
  requestFingerprint: string;
  result: Record<string, unknown>;
  retryKeyId: string;
  scheduleId: string | null;
  status: string;
  tenantId: string;
  traceId: string;
  updatedAt: Date | string;
}

type FakeBillingPaymentRetryKeyCreateInput = FakeBillingPaymentRetryKeyRow;

interface FakeBillingPaymentDunningStateRow {
  createdAt: Date | string;
  dunningId: string;
  failedAttempts: number;
  idempotencyKey: string;
  invoiceId: string;
  lastFailureAt: Date | string | null;
  nextActionAt: Date | string | null;
  provider: string;
  providerInvoiceId: string;
  requestFingerprint: string;
  stage: string;
  status: string;
  subscriptionId: string | null;
  tenantId: string;
  traceId: string;
  updatedAt: Date | string;
}

type FakeBillingPaymentDunningStateCreateInput = FakeBillingPaymentDunningStateRow;

interface FakeBillingReconciliationConflictRow {
  actual: Record<string, unknown>;
  conflictId: string;
  createdAt: Date | string;
  detectedAt: Date | string;
  expected: Record<string, unknown>;
  idempotencyKey: string;
  invoiceId: string;
  provider: string;
  providerInvoiceId: string;
  reason: string;
  requestFingerprint: string;
  resolution: string | null;
  resolvedAt: Date | string | null;
  severity: string;
  status: string;
  tenantId: string;
  traceId: string;
  updatedAt: Date | string;
}

type FakeBillingReconciliationConflictCreateInput = FakeBillingReconciliationConflictRow;

interface FakeBillingSyncJobCreateInput {
  actor: string;
  actorName: string;
  attempts: number;
  auditEventId: string;
  createdAt: Date;
  deadLetteredAt: Date | null;
  fromPlanId: string;
  id: string;
  lastError: string | null;
  lockedAt: Date | null;
  nextAttemptAt: Date | null;
  payload: Record<string, unknown>;
  publishedAt: Date | null;
  queue: string;
  reason: string;
  status: string;
  tenantId: string;
  toPlanId: string;
  traceId: string;
}

interface FakeBillingQuotaLedgerEntryCreateInput {
  auditEvent?: Record<string, unknown> | null;
  createdAt: Date;
  decision: string;
  id: string;
  idempotencyKey: string;
  limit: number;
  mode: string;
  planId: string;
  projected: number;
  reason?: string | null;
  remainingAfter: number;
  remainingBefore: number;
  requested: number;
  requestFingerprint: string;
  resource: string;
  tenantId: string;
  traceId: string;
  used: number;
}

function cloneFake<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function compareNullableFakeDateFirst(left: Date | string | null | undefined, right: Date | string | null | undefined): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return new Date(left).getTime() - new Date(right).getTime();
}
