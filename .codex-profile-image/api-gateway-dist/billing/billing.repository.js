import { InMemoryStore } from "@support-communication/database";
import { redactSensitiveText } from "@support-communication/redaction";
import { billingTariffCatalog } from "./tariff-catalog.js";
let defaultRepository = null;
export class BillingRepository {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    static default() {
        defaultRepository ??= BillingRepository.inMemory();
        return defaultRepository;
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static inMemory(seed = createEmptyBillingState()) {
        return new BillingRepository(createDurableBillingRepository(new InMemoryStore(seed)));
    }
    static prisma({ client }) {
        return new BillingRepository(new PrismaBillingRepository(client));
    }
    listTariffs() {
        return this.adapter.listTariffs();
    }
    findTariff(planId) {
        return this.adapter.findTariff(planId);
    }
    findTenant(tenantId) {
        return this.adapter.findTenant(tenantId);
    }
    saveTenant(tenant) {
        return this.adapter.saveTenant(tenant);
    }
    removeProvisionedTenant(tenantId) {
        return this.adapter.removeProvisionedTenant(tenantId);
    }
    findTenantSubscription(tenantId) {
        return this.adapter.findTenantSubscription(tenantId);
    }
    listTenantInvoices(tenantId) {
        return this.adapter.listTenantInvoices(tenantId);
    }
    listBillingSyncJobs() {
        return this.adapter.listBillingSyncJobs();
    }
    listBillingApprovals(input) {
        return this.adapter.listBillingApprovals(input);
    }
    listBillingLegalEntities(input) {
        return this.adapter.listBillingLegalEntities(input);
    }
    listBillingTaxDocuments(input) {
        return this.adapter.listBillingTaxDocuments(input);
    }
    listPaymentRetrySchedules(input) {
        return this.adapter.listPaymentRetrySchedules(input);
    }
    listPaymentRetryKeys(input) {
        return this.adapter.listPaymentRetryKeys(input);
    }
    listPaymentDunningStates(input) {
        return this.adapter.listPaymentDunningStates(input);
    }
    listReconciliationConflicts(input) {
        return this.adapter.listReconciliationConflicts(input);
    }
    listQuotaLedgerEntries(tenantId) {
        return this.adapter.listQuotaLedgerEntries(tenantId);
    }
    listQuotaReservations(input) {
        return this.adapter.listQuotaReservations(input);
    }
    findQuotaLedgerEntryByIdempotencyKey(idempotencyKey) {
        return this.adapter.findQuotaLedgerEntryByIdempotencyKey(idempotencyKey);
    }
    findQuotaReservation(reservationId) {
        return this.adapter.findQuotaReservation(reservationId);
    }
    findQuotaReservationByIdempotencyKey(idempotencyKey) {
        return this.adapter.findQuotaReservationByIdempotencyKey(idempotencyKey);
    }
    findProviderSyncEventByIdempotencyKey(idempotencyKey) {
        return this.adapter.findProviderSyncEventByIdempotencyKey(idempotencyKey);
    }
    findBillingApproval(approvalId, tenantId) {
        return this.adapter.findBillingApproval(approvalId, tenantId);
    }
    findBillingLegalEntity(legalEntityId, tenantId) {
        return this.adapter.findBillingLegalEntity(legalEntityId, tenantId);
    }
    findBillingTaxDocument(documentId, tenantId) {
        return this.adapter.findBillingTaxDocument(documentId, tenantId);
    }
    findPaymentRetryScheduleByIdempotencyKey(idempotencyKey) {
        return this.adapter.findPaymentRetryScheduleByIdempotencyKey(idempotencyKey);
    }
    findPaymentRetryKeyByIdempotencyKey(idempotencyKey) {
        return this.adapter.findPaymentRetryKeyByIdempotencyKey(idempotencyKey);
    }
    findPaymentDunningStateByIdempotencyKey(idempotencyKey) {
        return this.adapter.findPaymentDunningStateByIdempotencyKey(idempotencyKey);
    }
    findReconciliationConflictByIdempotencyKey(idempotencyKey) {
        return this.adapter.findReconciliationConflictByIdempotencyKey(idempotencyKey);
    }
    recordQuotaLedgerEntry(entry) {
        return this.adapter.recordQuotaLedgerEntry(entry);
    }
    savePaymentRetrySchedule(schedule) {
        return this.adapter.savePaymentRetrySchedule(schedule);
    }
    savePaymentRetryKey(key) {
        return this.adapter.savePaymentRetryKey(key);
    }
    savePaymentDunningState(state) {
        return this.adapter.savePaymentDunningState(state);
    }
    saveBillingApproval(approval) {
        return this.adapter.saveBillingApproval(approval);
    }
    saveBillingLegalEntity(entity) {
        return this.adapter.saveBillingLegalEntity(entity);
    }
    saveBillingTaxDocument(document) {
        return this.adapter.saveBillingTaxDocument(document);
    }
    decideBillingApproval(input) {
        return this.adapter.decideBillingApproval(input);
    }
    saveReconciliationConflict(conflict) {
        return this.adapter.saveReconciliationConflict(conflict);
    }
    createQuotaReservation(reservation) {
        return this.adapter.createQuotaReservation(reservation);
    }
    reserveQuotaAtomically(input) {
        return this.adapter.reserveQuotaAtomically(input);
    }
    claimExpiredQuotaReservations(input) {
        return this.adapter.claimExpiredQuotaReservations(input);
    }
    commitQuotaReservation(input) {
        return this.adapter.commitQuotaReservation(input);
    }
    releaseQuotaReservation(input) {
        return this.adapter.releaseQuotaReservation(input);
    }
    releaseExpiredQuotaReservation(input) {
        return this.adapter.releaseExpiredQuotaReservation(input);
    }
    applyTenantTariffChange(input) {
        return this.adapter.applyTenantTariffChange(input);
    }
    applyProviderBillingSync(input) {
        return this.adapter.applyProviderBillingSync(input);
    }
    appendProviderSyncAuditEvent(idempotencyKey, auditEvent) {
        return this.adapter.appendProviderSyncAuditEvent(idempotencyKey, auditEvent);
    }
}
class PrismaBillingRepository {
    client;
    constructor(client) {
        this.client = client;
    }
    listTariffs() {
        return clone(billingTariffCatalog);
    }
    findTariff(planId) {
        return clone(billingTariffCatalog.find((tariff) => tariff.id === planId));
    }
    async findTenant(tenantId) {
        if (!tenantId) {
            return undefined;
        }
        const row = await this.client.billingTenantState.findUnique({ where: { id: tenantId } });
        return row ? clone(toBillingTenantState(row)) : undefined;
    }
    async saveTenant(tenant) {
        const existing = await this.client.billingTenantState.findUnique({ where: { id: tenant.id } });
        const data = toPrismaBillingTenantStateUpdateInput(tenant);
        const row = existing
            ? await this.client.billingTenantState.update({ data, where: { id: tenant.id } })
            : await this.client.billingTenantState.create({ data: { ...data, id: tenant.id } });
        return clone(toBillingTenantState(row));
    }
    async removeProvisionedTenant(tenantId) {
        await this.client.billingTenantState.deleteMany({ where: { id: tenantId } });
        if (await this.findTenant(tenantId)) {
            throw new Error(`Billing compensation did not remove tenant ${tenantId}.`);
        }
    }
    async findTenantSubscription(tenantId) {
        if (!tenantId) {
            return undefined;
        }
        const row = await this.client.billingSubscription.findFirst({
            orderBy: { updatedAt: "desc" },
            where: { tenantId }
        });
        return row ? clone(toBillingSubscription(row)) : undefined;
    }
    async listTenantInvoices(tenantId) {
        if (!tenantId) {
            return [];
        }
        const rows = await this.client.billingInvoice.findMany({
            orderBy: { updatedAt: "desc" },
            where: { tenantId }
        });
        return clone(rows.map(toBillingInvoice));
    }
    async listBillingSyncJobs() {
        const rows = await this.client.billingSyncJob.findMany({ orderBy: { createdAt: "desc" } });
        return clone(rows.map(toBillingSyncJob));
    }
    async listBillingApprovals(input = {}) {
        if (!input.tenantId?.trim()) {
            return [];
        }
        const rows = await this.client.billingApproval.findMany({
            orderBy: { createdAt: "desc" },
            where: {
                ...(input.statuses ? { status: { in: input.statuses } } : {}),
                ...(input.subjectType ? { subjectType: input.subjectType } : {}),
                tenantId: input.tenantId
            }
        });
        return clone(rows.map(toBillingApproval));
    }
    async listBillingLegalEntities(input = {}) {
        if (!input.tenantId?.trim()) {
            return [];
        }
        const rows = await this.client.billingLegalEntity.findMany({
            orderBy: { updatedAt: "desc" },
            where: {
                ...(input.statuses ? { status: { in: input.statuses } } : {}),
                tenantId: input.tenantId
            }
        });
        return clone(rows.map(toBillingLegalEntity));
    }
    async listBillingTaxDocuments(input = {}) {
        if (!input.tenantId?.trim()) {
            return [];
        }
        const rows = await this.client.billingTaxDocument.findMany({
            orderBy: { updatedAt: "desc" },
            where: {
                ...(input.documentTypes ? { documentType: { in: input.documentTypes } } : {}),
                ...(input.statuses ? { status: { in: input.statuses } } : {}),
                tenantId: input.tenantId
            }
        });
        return clone(rows.map(toBillingTaxDocument));
    }
    async listPaymentRetrySchedules(input = {}) {
        if (!input.tenantId?.trim()) {
            return [];
        }
        const rows = await this.client.billingPaymentRetrySchedule.findMany({
            orderBy: { nextAttemptAt: "desc" },
            where: {
                ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
                ...(input.statuses ? { status: { in: input.statuses } } : {}),
                tenantId: input.tenantId
            }
        });
        return clone(rows.map(toBillingPaymentRetrySchedule));
    }
    async listPaymentRetryKeys(input = {}) {
        if (!input.tenantId?.trim()) {
            return [];
        }
        const rows = await this.client.billingPaymentRetryKey.findMany({
            orderBy: { firstAttemptAt: "desc" },
            where: {
                ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
                ...(input.statuses ? { status: { in: input.statuses } } : {}),
                tenantId: input.tenantId
            }
        });
        return clone(rows.map(toBillingPaymentRetryKey));
    }
    async listPaymentDunningStates(input = {}) {
        if (!input.tenantId?.trim()) {
            return [];
        }
        const rows = await this.client.billingPaymentDunningState.findMany({
            orderBy: { updatedAt: "desc" },
            where: {
                ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
                ...(input.statuses ? { status: { in: input.statuses } } : {}),
                tenantId: input.tenantId
            }
        });
        return clone(rows.map(toBillingPaymentDunningState));
    }
    async listReconciliationConflicts(input = {}) {
        if (!input.tenantId?.trim()) {
            return [];
        }
        const rows = await this.client.billingReconciliationConflict.findMany({
            orderBy: { detectedAt: "desc" },
            where: {
                ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
                ...(input.severities ? { severity: { in: input.severities } } : {}),
                ...(input.statuses ? { status: { in: input.statuses } } : {}),
                tenantId: input.tenantId
            }
        });
        return clone(rows.map(toBillingReconciliationConflict));
    }
    async listQuotaLedgerEntries(tenantId) {
        const rows = await this.client.billingQuotaLedgerEntry.findMany({
            orderBy: { createdAt: "desc" },
            ...(tenantId ? { where: { tenantId } } : {})
        });
        return clone(rows.map(toBillingQuotaLedgerEntry));
    }
    async listQuotaReservations(input = {}) {
        const rows = await this.client.billingQuotaReservation.findMany({
            orderBy: { createdAt: "desc" },
            where: {
                ...(input.resource ? { resource: input.resource } : {}),
                ...(input.statuses ? { status: { in: input.statuses } } : {}),
                ...(input.tenantId ? { tenantId: input.tenantId } : {})
            }
        });
        return clone(rows.map(toBillingQuotaReservation));
    }
    async claimExpiredQuotaReservations(input = {}) {
        const now = toDate(input.now ?? new Date());
        const staleBefore = new Date(now.getTime() - (input.leaseTimeoutMs ?? 300_000));
        const rows = await this.client.billingQuotaReservation.findMany({
            orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }, { lockedAt: { nulls: "first", sort: "asc" } }, { id: "asc" }],
            take: input.limit ?? 100,
            where: {
                expiresAt: { lte: now },
                OR: [
                    { lockedAt: null },
                    { lockedAt: { lte: staleBefore } }
                ],
                status: "reserved"
            }
        });
        const claimed = [];
        for (const row of rows) {
            const updated = await this.client.billingQuotaReservation.updateMany({
                data: {
                    lockedAt: now,
                    updatedAt: now
                },
                where: {
                    id: row.id,
                    lockedAt: row.lockedAt ? toDate(row.lockedAt) : null,
                    status: "reserved"
                }
            });
            if (updated.count === 0)
                continue;
            claimed.push(toBillingQuotaReservation({
                ...row,
                lockedAt: now,
                updatedAt: now
            }));
        }
        return clone(claimed);
    }
    async findQuotaLedgerEntryByIdempotencyKey(idempotencyKey) {
        if (!idempotencyKey) {
            return undefined;
        }
        const row = await this.client.billingQuotaLedgerEntry.findUnique({ where: { idempotencyKey } });
        return row ? clone(toBillingQuotaLedgerEntry(row)) : undefined;
    }
    async findQuotaReservation(reservationId) {
        if (!reservationId) {
            return undefined;
        }
        const row = await this.client.billingQuotaReservation.findUnique({ where: { id: reservationId } });
        return row ? clone(toBillingQuotaReservation(row)) : undefined;
    }
    async findQuotaReservationByIdempotencyKey(idempotencyKey) {
        if (!idempotencyKey) {
            return undefined;
        }
        const row = await this.client.billingQuotaReservation.findUnique({ where: { idempotencyKey } });
        return row ? clone(toBillingQuotaReservation(row)) : undefined;
    }
    async findProviderSyncEventByIdempotencyKey(idempotencyKey) {
        if (!idempotencyKey) {
            return undefined;
        }
        const row = await this.client.billingProviderSyncEvent.findUnique({ where: { idempotencyKey } });
        return row ? clone(toBillingProviderSyncEvent(row)) : undefined;
    }
    async findBillingApproval(approvalId, tenantId) {
        if (!approvalId || !tenantId?.trim()) {
            return undefined;
        }
        const row = await this.client.billingApproval.findUnique({
            where: { tenantId_approvalId: { approvalId, tenantId } }
        });
        return row ? clone(toBillingApproval(row)) : undefined;
    }
    async findBillingLegalEntity(legalEntityId, tenantId) {
        if (!legalEntityId || !tenantId?.trim()) {
            return undefined;
        }
        const row = await this.client.billingLegalEntity.findUnique({
            where: { tenantId_legalEntityId: { legalEntityId, tenantId } }
        });
        return row ? clone(toBillingLegalEntity(row)) : undefined;
    }
    async findBillingTaxDocument(documentId, tenantId) {
        if (!documentId || !tenantId?.trim()) {
            return undefined;
        }
        const row = await this.client.billingTaxDocument.findUnique({
            where: { tenantId_documentId: { documentId, tenantId } }
        });
        return row ? clone(toBillingTaxDocument(row)) : undefined;
    }
    async findPaymentRetryScheduleByIdempotencyKey(idempotencyKey) {
        if (!idempotencyKey) {
            return undefined;
        }
        const row = await this.client.billingPaymentRetrySchedule.findUnique({ where: { idempotencyKey } });
        return row ? clone(toBillingPaymentRetrySchedule(row)) : undefined;
    }
    async findPaymentRetryKeyByIdempotencyKey(idempotencyKey) {
        if (!idempotencyKey) {
            return undefined;
        }
        const row = await this.client.billingPaymentRetryKey.findUnique({ where: { idempotencyKey } });
        return row ? clone(toBillingPaymentRetryKey(row)) : undefined;
    }
    async findPaymentDunningStateByIdempotencyKey(idempotencyKey) {
        if (!idempotencyKey) {
            return undefined;
        }
        const row = await this.client.billingPaymentDunningState.findUnique({ where: { idempotencyKey } });
        return row ? clone(toBillingPaymentDunningState(row)) : undefined;
    }
    async findReconciliationConflictByIdempotencyKey(idempotencyKey) {
        if (!idempotencyKey) {
            return undefined;
        }
        const row = await this.client.billingReconciliationConflict.findUnique({ where: { idempotencyKey } });
        return row ? clone(toBillingReconciliationConflict(row)) : undefined;
    }
    async appendProviderSyncAuditEvent(idempotencyKey, auditEvent) {
        if (!this.client.$queryRawUnsafe) {
            throw new Error("Prisma billing provider sync client does not support atomic audit append.");
        }
        const auditEventsJson = JSON.stringify([{ ...auditEvent }]);
        const rows = await this.client.$queryRawUnsafe(`
      UPDATE "billing_provider_sync_events"
      SET "audit_events" = COALESCE("audit_events", '[]'::jsonb) || $2::jsonb
      WHERE "idempotency_key" = $1
      RETURNING
        "audit_events" AS "auditEvents",
        "created_at" AS "createdAt",
        "event_type" AS "eventType",
        "id",
        "idempotency_key" AS "idempotencyKey",
        "payload",
        "provider",
        "request_fingerprint" AS "requestFingerprint",
        "status",
        "sync_job_id" AS "syncJobId",
        "tenant_id" AS "tenantId",
        "trace_id" AS "traceId"
    `, idempotencyKey, auditEventsJson);
        return rows[0] ? clone(toBillingProviderSyncEvent(rows[0])) : undefined;
    }
    async recordQuotaLedgerEntry(entry) {
        const row = await this.client.billingQuotaLedgerEntry.create({ data: toPrismaBillingQuotaLedgerEntryCreateInput(entry) });
        return clone(toBillingQuotaLedgerEntry(row));
    }
    async savePaymentRetrySchedule(schedule) {
        const persisted = normalizePaymentRetrySchedule(schedule);
        const existing = await this.client.billingPaymentRetrySchedule.findFirst({
            where: {
                OR: [
                    { scheduleId: persisted.scheduleId, tenantId: persisted.tenantId },
                    { idempotencyKey: persisted.idempotencyKey }
                ]
            }
        });
        if (existing) {
            return clone(toBillingPaymentRetrySchedule(existing));
        }
        const row = await this.client.billingPaymentRetrySchedule.create({
            data: toPrismaBillingPaymentRetryScheduleCreateInput(persisted)
        });
        return clone(toBillingPaymentRetrySchedule(row));
    }
    async savePaymentRetryKey(key) {
        const persisted = normalizePaymentRetryKey(key);
        const existing = await this.client.billingPaymentRetryKey.findFirst({
            where: {
                OR: [
                    { retryKeyId: persisted.retryKeyId, tenantId: persisted.tenantId },
                    { idempotencyKey: persisted.idempotencyKey }
                ]
            }
        });
        if (existing) {
            return clone(toBillingPaymentRetryKey(existing));
        }
        const row = await this.client.billingPaymentRetryKey.create({
            data: toPrismaBillingPaymentRetryKeyCreateInput(persisted)
        });
        return clone(toBillingPaymentRetryKey(row));
    }
    async savePaymentDunningState(state) {
        const persisted = normalizePaymentDunningState(state);
        const existing = await this.client.billingPaymentDunningState.findFirst({
            where: {
                OR: [
                    { dunningId: persisted.dunningId, tenantId: persisted.tenantId },
                    { idempotencyKey: persisted.idempotencyKey }
                ]
            }
        });
        if (existing) {
            return clone(toBillingPaymentDunningState(existing));
        }
        const row = await this.client.billingPaymentDunningState.create({
            data: toPrismaBillingPaymentDunningStateCreateInput(persisted)
        });
        return clone(toBillingPaymentDunningState(row));
    }
    async saveBillingApproval(approval) {
        const persisted = normalizeBillingApproval(approval);
        const existing = await this.client.billingApproval.findFirst({
            where: {
                OR: [
                    { approvalId: persisted.approvalId, tenantId: persisted.tenantId },
                    { requestFingerprint: persisted.requestFingerprint, tenantId: persisted.tenantId }
                ]
            }
        });
        if (existing) {
            return clone(toBillingApproval(existing));
        }
        const row = await this.client.billingApproval.create({
            data: toPrismaBillingApprovalCreateInput(persisted)
        });
        return clone(toBillingApproval(row));
    }
    async saveBillingLegalEntity(entity) {
        const persisted = withBillingLegalEntitySavedAuditEvent(normalizeBillingLegalEntity(entity));
        const existing = await this.client.billingLegalEntity.findFirst({
            where: {
                OR: [
                    { legalEntityId: persisted.legalEntityId, tenantId: persisted.tenantId },
                    { registrationNumber: persisted.registrationNumber, tenantId: persisted.tenantId }
                ]
            }
        });
        if (existing) {
            return clone(toBillingLegalEntity(existing));
        }
        const row = await this.client.billingLegalEntity.create({
            data: toPrismaBillingLegalEntityCreateInput(persisted)
        });
        return clone(toBillingLegalEntity(row));
    }
    async saveBillingTaxDocument(document) {
        const persisted = withBillingTaxDocumentSavedAuditEvent(normalizeBillingTaxDocument(document));
        const existing = await this.client.billingTaxDocument.findFirst({
            where: {
                OR: [
                    { documentId: persisted.documentId, tenantId: persisted.tenantId },
                    { requestFingerprint: persisted.requestFingerprint, tenantId: persisted.tenantId }
                ]
            }
        });
        if (existing) {
            return clone(toBillingTaxDocument(existing));
        }
        const row = await this.client.billingTaxDocument.create({
            data: toPrismaBillingTaxDocumentCreateInput(persisted)
        });
        return clone(toBillingTaxDocument(row));
    }
    async decideBillingApproval(input) {
        const existing = await this.client.billingApproval.findUnique({
            where: { tenantId_approvalId: { approvalId: input.approvalId, tenantId: input.tenantId } }
        });
        if (!existing) {
            throw new Error(`Billing approval ${input.approvalId} was not found.`);
        }
        if (billingApprovalStatusFromRow(existing.status) !== "pending") {
            throw new Error(`Billing approval ${input.approvalId} was not pending.`);
        }
        const decidedAt = toIso(input.decidedAt);
        const auditEvents = appendBillingApprovalDecisionAuditEvent(toBillingApproval(existing), input, decidedAt);
        const row = await this.client.billingApproval.update({
            data: {
                auditEvents,
                decidedAt: new Date(decidedAt),
                decidedBy: String(input.decidedBy ?? "").trim(),
                decidedByName: String(input.decidedByName ?? "").trim(),
                decisionReason: redactSensitiveText(String(input.decisionReason ?? "").trim()),
                status: input.status,
                traceId: String(input.traceId ?? "").trim(),
                updatedAt: new Date(decidedAt)
            },
            where: { tenantId_approvalId: { approvalId: input.approvalId, tenantId: input.tenantId } }
        });
        return clone(toBillingApproval(row));
    }
    async saveReconciliationConflict(conflict) {
        const persisted = normalizeReconciliationConflict(conflict);
        const existing = await this.client.billingReconciliationConflict.findFirst({
            where: {
                OR: [
                    { conflictId: persisted.conflictId, tenantId: persisted.tenantId },
                    { idempotencyKey: persisted.idempotencyKey }
                ]
            }
        });
        if (existing) {
            return clone(toBillingReconciliationConflict(existing));
        }
        const row = await this.client.billingReconciliationConflict.create({
            data: toPrismaBillingReconciliationConflictCreateInput(persisted)
        });
        return clone(toBillingReconciliationConflict(row));
    }
    async createQuotaReservation(reservation) {
        const row = await this.client.billingQuotaReservation.create({ data: toPrismaBillingQuotaReservationCreateInput(reservation) });
        return clone(toBillingQuotaReservation(row));
    }
    async reserveQuotaAtomically(input) {
        return this.client.$transaction(async (transaction) => {
            if (!transaction.$queryRawUnsafe) {
                throw new Error("billing_quota_advisory_lock_unavailable");
            }
            // ::text — pg_advisory_xact_lock возвращает void, который Prisma-клиент
            // не десериализует (Failed to deserialize column of type 'void').
            await transaction.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text", `${input.reservation.tenantId}:${input.reservation.resource}`);
            const existing = await transaction.billingQuotaReservation.findUnique({
                where: { idempotencyKey: input.reservation.idempotencyKey }
            });
            const active = await transaction.billingQuotaReservation.findMany({
                orderBy: { createdAt: "desc" },
                where: {
                    resource: input.reservation.resource,
                    status: "reserved",
                    tenantId: input.reservation.tenantId
                }
            });
            const reserved = active.reduce((sum, reservation) => sum + reservation.requested, 0);
            if (existing) {
                return { kind: "replay", reservation: clone(toBillingQuotaReservation(existing)), reserved };
            }
            if (input.used + reserved + input.reservation.requested > input.limit) {
                return { kind: "denied", reserved };
            }
            const row = await transaction.billingQuotaReservation.create({
                data: toPrismaBillingQuotaReservationCreateInput(input.reservation)
            });
            return { kind: "created", reservation: clone(toBillingQuotaReservation(row)), reserved };
        });
    }
    async commitQuotaReservation(input) {
        return this.client.$transaction(async (transaction) => {
            const reservation = await transaction.billingQuotaReservation.findUnique({ where: { id: input.reservationId } });
            if (!reservation) {
                throw new Error(`Quota reservation ${input.reservationId} was not found.`);
            }
            const tenant = await transaction.billingTenantState.findUnique({ where: { id: reservation.tenantId } });
            if (!tenant) {
                throw new Error(`Billing tenant ${reservation.tenantId} was not found.`);
            }
            const currentTenant = toBillingTenantState(tenant);
            const nextTenant = applyQuotaDelta(currentTenant, reservation.resource, reservation.requested);
            const usedAfter = quotaUsageValue(nextTenant, reservation.resource);
            const claimed = await transaction.billingQuotaReservation.updateMany({
                data: {
                    auditEvent: input.auditEvent ? { ...input.auditEvent } : null,
                    auditEvents: appendBillingAuditEvent(toBillingAuditEvents(reservation.auditEvents), input.auditEvent).map((event) => ({ ...event })),
                    commitIdempotencyKey: input.idempotencyKey,
                    committedAt: new Date(input.committedAt),
                    status: "committed",
                    traceId: input.traceId,
                    updatedAt: new Date(input.committedAt),
                    usedAfter
                },
                where: { id: input.reservationId, status: "reserved" }
            });
            if (claimed.count !== 1) {
                throw new Error(`Quota reservation ${input.reservationId} was not reserved.`);
            }
            const updatedTenant = await transaction.billingTenantState.update({
                data: toPrismaBillingTenantStateUpdateInput({
                    usage: nextTenant.usage,
                    users: nextTenant.users,
                    workspaces: nextTenant.workspaces
                }),
                where: { id: reservation.tenantId }
            });
            const updatedReservation = await transaction.billingQuotaReservation.findUnique({ where: { id: input.reservationId } });
            if (!updatedReservation) {
                throw new Error(`Quota reservation ${input.reservationId} disappeared after commit.`);
            }
            return clone({
                reservation: toBillingQuotaReservation(updatedReservation),
                tenant: toBillingTenantState(updatedTenant)
            });
        });
    }
    async releaseQuotaReservation(input) {
        return this.client.$transaction(async (transaction) => {
            const reservation = await transaction.billingQuotaReservation.findUnique({ where: { id: input.reservationId } });
            if (!reservation) {
                throw new Error(`Quota reservation ${input.reservationId} was not found.`);
            }
            const released = await transaction.billingQuotaReservation.updateMany({
                data: {
                    auditEvent: input.auditEvent ? { ...input.auditEvent } : null,
                    auditEvents: appendBillingAuditEvent(toBillingAuditEvents(reservation.auditEvents), input.auditEvent).map((event) => ({ ...event })),
                    releaseIdempotencyKey: input.idempotencyKey,
                    releasedAt: new Date(input.releasedAt),
                    status: "released",
                    traceId: input.traceId,
                    updatedAt: new Date(input.releasedAt)
                },
                where: { id: input.reservationId, status: "reserved" }
            });
            if (released.count !== 1) {
                throw new Error(`Quota reservation ${input.reservationId} was not reserved.`);
            }
            const row = await transaction.billingQuotaReservation.findUnique({ where: { id: input.reservationId } });
            if (!row) {
                throw new Error(`Quota reservation ${input.reservationId} disappeared after release.`);
            }
            return clone(toBillingQuotaReservation(row));
        });
    }
    async releaseExpiredQuotaReservation(input) {
        return this.client.$transaction(async (transaction) => {
            const row = await transaction.billingQuotaReservation.findUnique({ where: { id: input.reservationId } });
            if (!row) {
                return undefined;
            }
            const reservation = toBillingQuotaReservation(row);
            if (isExpiredQuotaReservationReleaseReplay(reservation, input)) {
                return clone(reservation);
            }
            if (!isExpiredQuotaReservationReleaseCandidate(reservation, input)) {
                return undefined;
            }
            const released = await transaction.billingQuotaReservation.updateMany({
                data: {
                    auditEvent: input.auditEvent ? { ...input.auditEvent } : null,
                    auditEvents: appendBillingAuditEvent(toBillingAuditEvents(row.auditEvents), input.auditEvent).map((event) => ({ ...event })),
                    lockedAt: null,
                    releaseIdempotencyKey: input.idempotencyKey,
                    releasedAt: new Date(input.releasedAt),
                    status: "released",
                    traceId: input.traceId,
                    updatedAt: new Date(input.releasedAt)
                },
                where: {
                    id: input.reservationId,
                    lockedAt: new Date(input.lockedAt),
                    status: "reserved"
                }
            });
            const current = await transaction.billingQuotaReservation.findUnique({ where: { id: input.reservationId } });
            if (released.count !== 1) {
                const currentReservation = current ? toBillingQuotaReservation(current) : undefined;
                return currentReservation && isExpiredQuotaReservationReleaseReplay(currentReservation, input)
                    ? clone(currentReservation)
                    : undefined;
            }
            return current ? clone(toBillingQuotaReservation(current)) : undefined;
        });
    }
    async applyProviderBillingSync(input) {
        return this.client.$transaction(async (transaction) => {
            const existing = await transaction.billingTenantState.findUnique({ where: { id: input.tenantId } });
            if (!existing) {
                throw new Error(`Billing tenant ${input.tenantId} was not found.`);
            }
            const tenant = Object.keys(input.tenantChanges ?? {}).length > 0
                ? await transaction.billingTenantState.update({
                    data: toPrismaBillingTenantStateUpdateInput(input.tenantChanges ?? {}),
                    where: { id: input.tenantId }
                })
                : existing;
            const subscription = input.subscription
                ? await transaction.billingSubscription.upsert({
                    create: toPrismaBillingSubscriptionUpsertInput(input.subscription),
                    update: toPrismaBillingSubscriptionUpsertInput(input.subscription),
                    where: {
                        provider_providerSubscriptionId: {
                            provider: input.subscription.provider,
                            providerSubscriptionId: input.subscription.providerSubscriptionId
                        }
                    }
                })
                : undefined;
            const invoice = input.invoice
                ? await transaction.billingInvoice.upsert({
                    create: toPrismaBillingInvoiceUpsertInput(input.invoice),
                    update: toPrismaBillingInvoiceUpsertInput(input.invoice),
                    where: {
                        provider_providerInvoiceId: {
                            provider: input.invoice.provider,
                            providerInvoiceId: input.invoice.providerInvoiceId
                        }
                    }
                })
                : undefined;
            const event = await transaction.billingProviderSyncEvent.create({
                data: toPrismaBillingProviderSyncEventCreateInput(input.event)
            });
            const job = await transaction.billingSyncJob.create({ data: toPrismaBillingSyncJobCreateInput(input.syncJob) });
            const paymentDunningState = input.paymentDunningState
                ? await persistPrismaPaymentDunningState(transaction, input.paymentDunningState)
                : undefined;
            const paymentRetryKey = input.paymentRetryKey
                ? await persistPrismaPaymentRetryKey(transaction, input.paymentRetryKey)
                : undefined;
            const paymentRetrySchedule = input.paymentRetrySchedule
                ? await persistPrismaPaymentRetrySchedule(transaction, input.paymentRetrySchedule)
                : undefined;
            const reconciliationConflict = input.reconciliationConflict
                ? await persistPrismaReconciliationConflict(transaction, input.reconciliationConflict)
                : undefined;
            return clone({
                event: toBillingProviderSyncEvent(event),
                ...(invoice ? { invoice: toBillingInvoice(invoice) } : {}),
                ...(paymentDunningState ? { paymentDunningState } : {}),
                ...(paymentRetryKey ? { paymentRetryKey } : {}),
                ...(paymentRetrySchedule ? { paymentRetrySchedule } : {}),
                ...(reconciliationConflict ? { reconciliationConflict } : {}),
                ...(subscription ? { subscription: toBillingSubscription(subscription) } : {}),
                syncJob: toBillingSyncJob(job),
                tenant: toBillingTenantState(tenant)
            });
        });
    }
    async applyTenantTariffChange({ changes, syncJob, tenantId }) {
        return this.client.$transaction(async (transaction) => {
            const existing = await transaction.billingTenantState.findUnique({ where: { id: tenantId } });
            if (!existing) {
                throw new Error(`Billing tenant ${tenantId} was not found.`);
            }
            const tenant = await transaction.billingTenantState.update({
                data: toPrismaBillingTenantStateUpdateInput(changes),
                where: { id: tenantId }
            });
            const job = await transaction.billingSyncJob.create({ data: toPrismaBillingSyncJobCreateInput(syncJob) });
            return clone({
                syncJob: toBillingSyncJob(job),
                tenant: toBillingTenantState(tenant)
            });
        });
    }
}
async function persistPrismaPaymentRetrySchedule(client, schedule) {
    const persisted = normalizePaymentRetrySchedule(schedule);
    const existing = await client.billingPaymentRetrySchedule.findFirst({
        where: {
            OR: [
                { scheduleId: persisted.scheduleId, tenantId: persisted.tenantId },
                { idempotencyKey: persisted.idempotencyKey }
            ]
        }
    });
    if (existing) {
        return toBillingPaymentRetrySchedule(existing);
    }
    const row = await client.billingPaymentRetrySchedule.create({
        data: toPrismaBillingPaymentRetryScheduleCreateInput(persisted)
    });
    return toBillingPaymentRetrySchedule(row);
}
async function persistPrismaPaymentDunningState(client, state) {
    const persisted = normalizePaymentDunningState(state);
    const existing = await client.billingPaymentDunningState.findFirst({
        where: {
            OR: [
                { dunningId: persisted.dunningId, tenantId: persisted.tenantId },
                { idempotencyKey: persisted.idempotencyKey }
            ]
        }
    });
    if (existing) {
        return toBillingPaymentDunningState(existing);
    }
    const row = await client.billingPaymentDunningState.create({
        data: toPrismaBillingPaymentDunningStateCreateInput(persisted)
    });
    return toBillingPaymentDunningState(row);
}
async function persistPrismaPaymentRetryKey(client, key) {
    const persisted = normalizePaymentRetryKey(key);
    const existing = await client.billingPaymentRetryKey.findFirst({
        where: {
            OR: [
                { retryKeyId: persisted.retryKeyId, tenantId: persisted.tenantId },
                { idempotencyKey: persisted.idempotencyKey }
            ]
        }
    });
    if (existing) {
        return toBillingPaymentRetryKey(existing);
    }
    const row = await client.billingPaymentRetryKey.create({
        data: toPrismaBillingPaymentRetryKeyCreateInput(persisted)
    });
    return toBillingPaymentRetryKey(row);
}
async function persistPrismaReconciliationConflict(client, conflict) {
    const persisted = normalizeReconciliationConflict(conflict);
    const existing = await client.billingReconciliationConflict.findFirst({
        where: {
            OR: [
                { conflictId: persisted.conflictId, tenantId: persisted.tenantId },
                { idempotencyKey: persisted.idempotencyKey }
            ]
        }
    });
    if (existing) {
        return toBillingReconciliationConflict(existing);
    }
    const row = await client.billingReconciliationConflict.create({
        data: toPrismaBillingReconciliationConflictCreateInput(persisted)
    });
    return toBillingReconciliationConflict(row);
}
function createDurableBillingRepository(store) {
    return {
        listTariffs() {
            return clone(store.read().tariffs ?? billingTariffCatalog);
        },
        findTariff(planId) {
            return clone((store.read().tariffs ?? billingTariffCatalog).find((tariff) => tariff.id === planId));
        },
        findTenant(tenantId) {
            if (!tenantId) {
                return undefined;
            }
            return clone((store.read().tenants ?? []).find((tenant) => tenant.id === tenantId));
        },
        saveTenant(tenant) {
            const state = store.read();
            const tenants = state.tenants ?? [];
            const existing = tenants.some((item) => item.id === tenant.id);
            const nextTenant = clone(tenant);
            store.write({
                ...state,
                tenants: existing
                    ? tenants.map((item) => item.id === tenant.id ? nextTenant : item)
                    : [...tenants, nextTenant]
            });
            return clone(nextTenant);
        },
        removeProvisionedTenant(tenantId) {
            const state = store.read();
            store.write({
                ...state,
                tenants: (state.tenants ?? []).filter((tenant) => tenant.id !== tenantId)
            });
        },
        findTenantSubscription(tenantId) {
            if (!tenantId) {
                return undefined;
            }
            return clone((store.read().subscriptions ?? [])
                .filter((subscription) => subscription.tenantId === tenantId)
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]);
        },
        listTenantInvoices(tenantId) {
            if (!tenantId) {
                return [];
            }
            return clone((store.read().invoices ?? [])
                .filter((invoice) => invoice.tenantId === tenantId)
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
        },
        listBillingSyncJobs() {
            return clone((store.read().billingSyncJobs ?? []).map(normalizeBillingSyncJob));
        },
        listBillingApprovals(input = {}) {
            if (!input.tenantId?.trim()) {
                return [];
            }
            const approvals = (store.read().billingApprovals ?? []).map(normalizeBillingApproval);
            return clone(approvals
                .filter((approval) => {
                if (approval.tenantId !== input.tenantId)
                    return false;
                if (input.subjectType && approval.subjectType !== input.subjectType)
                    return false;
                if (input.statuses && !input.statuses.includes(approval.status))
                    return false;
                return true;
            })
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
        },
        listBillingLegalEntities(input = {}) {
            if (!input.tenantId?.trim()) {
                return [];
            }
            const entities = (store.read().billingLegalEntities ?? []).map(normalizeBillingLegalEntity);
            return clone(entities
                .filter((entity) => {
                if (entity.tenantId !== input.tenantId)
                    return false;
                if (input.statuses && !input.statuses.includes(entity.status))
                    return false;
                return true;
            })
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
        },
        listBillingTaxDocuments(input = {}) {
            if (!input.tenantId?.trim()) {
                return [];
            }
            const documents = (store.read().billingTaxDocuments ?? []).map(normalizeBillingTaxDocument);
            return clone(documents
                .filter((document) => {
                if (document.tenantId !== input.tenantId)
                    return false;
                if (input.documentTypes && !input.documentTypes.includes(document.documentType))
                    return false;
                if (input.statuses && !input.statuses.includes(document.status))
                    return false;
                return true;
            })
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
        },
        listPaymentRetrySchedules(input = {}) {
            if (!input.tenantId?.trim()) {
                return [];
            }
            const schedules = (store.read().paymentRetrySchedules ?? []).map(normalizePaymentRetrySchedule);
            return clone(schedules
                .filter((schedule) => {
                if (schedule.tenantId !== input.tenantId)
                    return false;
                if (input.invoiceId && schedule.invoiceId !== input.invoiceId)
                    return false;
                if (input.statuses && !input.statuses.includes(schedule.status))
                    return false;
                return true;
            })
                .sort((left, right) => right.nextAttemptAt.localeCompare(left.nextAttemptAt)));
        },
        listPaymentRetryKeys(input = {}) {
            if (!input.tenantId?.trim()) {
                return [];
            }
            const keys = (store.read().paymentRetryKeys ?? []).map(normalizePaymentRetryKey);
            return clone(keys
                .filter((key) => {
                if (key.tenantId !== input.tenantId)
                    return false;
                if (input.invoiceId && key.invoiceId !== input.invoiceId)
                    return false;
                if (input.statuses && !input.statuses.includes(key.status))
                    return false;
                return true;
            })
                .sort((left, right) => right.firstAttemptAt.localeCompare(left.firstAttemptAt)));
        },
        listPaymentDunningStates(input = {}) {
            if (!input.tenantId?.trim()) {
                return [];
            }
            const states = (store.read().paymentDunningStates ?? []).map(normalizePaymentDunningState);
            return clone(states
                .filter((state) => {
                if (state.tenantId !== input.tenantId)
                    return false;
                if (input.invoiceId && state.invoiceId !== input.invoiceId)
                    return false;
                if (input.statuses && !input.statuses.includes(state.status))
                    return false;
                return true;
            })
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
        },
        listReconciliationConflicts(input = {}) {
            if (!input.tenantId?.trim()) {
                return [];
            }
            const conflicts = (store.read().reconciliationConflicts ?? []).map(normalizeReconciliationConflict);
            return clone(conflicts
                .filter((conflict) => {
                if (conflict.tenantId !== input.tenantId)
                    return false;
                if (input.invoiceId && conflict.invoiceId !== input.invoiceId)
                    return false;
                if (input.severities && !input.severities.includes(conflict.severity))
                    return false;
                if (input.statuses && !input.statuses.includes(conflict.status))
                    return false;
                return true;
            })
                .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt)));
        },
        listQuotaLedgerEntries(tenantId) {
            const entries = store.read().quotaLedgerEntries ?? [];
            return clone(tenantId ? entries.filter((entry) => entry.tenantId === tenantId) : entries);
        },
        listQuotaReservations(input = {}) {
            const reservations = store.read().quotaReservations ?? [];
            return clone(reservations.filter((reservation) => {
                if (input.tenantId && reservation.tenantId !== input.tenantId)
                    return false;
                if (input.resource && reservation.resource !== input.resource)
                    return false;
                if (input.statuses && !input.statuses.includes(reservation.status))
                    return false;
                return true;
            }));
        },
        claimExpiredQuotaReservations(input = {}) {
            const now = toDate(input.now ?? new Date());
            const nowIso = now.toISOString();
            const staleBeforeMs = now.getTime() - (input.leaseTimeoutMs ?? 300_000);
            const limit = input.limit ?? 100;
            let claimed = [];
            store.update((state) => {
                const reservations = state.quotaReservations ?? [];
                const claimable = reservations
                    .filter((reservation) => reservation.status === "reserved"
                    && Date.parse(reservation.expiresAt) <= now.getTime()
                    && (!reservation.lockedAt || Date.parse(reservation.lockedAt) <= staleBeforeMs))
                    .sort(compareQuotaReservationClaimOrder)
                    .slice(0, limit)
                    .map((reservation) => reservation.id);
                const claimableIds = new Set(claimable);
                claimed = reservations
                    .filter((reservation) => claimableIds.has(reservation.id))
                    .sort(compareQuotaReservationClaimOrder)
                    .map((reservation) => ({
                    ...reservation,
                    lockedAt: nowIso,
                    updatedAt: nowIso
                }));
                return {
                    ...state,
                    quotaReservations: reservations.map((reservation) => claimableIds.has(reservation.id)
                        ? { ...reservation, lockedAt: nowIso, updatedAt: nowIso }
                        : reservation)
                };
            });
            return clone(claimed);
        },
        findQuotaLedgerEntryByIdempotencyKey(idempotencyKey) {
            if (!idempotencyKey) {
                return undefined;
            }
            return clone((store.read().quotaLedgerEntries ?? []).find((entry) => entry.idempotencyKey === idempotencyKey));
        },
        findQuotaReservation(reservationId) {
            if (!reservationId) {
                return undefined;
            }
            return clone((store.read().quotaReservations ?? []).find((reservation) => reservation.id === reservationId));
        },
        findQuotaReservationByIdempotencyKey(idempotencyKey) {
            if (!idempotencyKey) {
                return undefined;
            }
            return clone((store.read().quotaReservations ?? []).find((reservation) => reservation.idempotencyKey === idempotencyKey));
        },
        findProviderSyncEventByIdempotencyKey(idempotencyKey) {
            if (!idempotencyKey) {
                return undefined;
            }
            return clone((store.read().billingProviderSyncEvents ?? []).find((event) => event.idempotencyKey === idempotencyKey));
        },
        findBillingApproval(approvalId, tenantId) {
            if (!approvalId) {
                return undefined;
            }
            const approval = (store.read().billingApprovals ?? [])
                .map(normalizeBillingApproval)
                .find((item) => item.approvalId === approvalId && (!tenantId || item.tenantId === tenantId));
            return approval ? clone(approval) : undefined;
        },
        findBillingLegalEntity(legalEntityId, tenantId) {
            if (!legalEntityId) {
                return undefined;
            }
            const entity = (store.read().billingLegalEntities ?? [])
                .map(normalizeBillingLegalEntity)
                .find((item) => item.legalEntityId === legalEntityId && (!tenantId || item.tenantId === tenantId));
            return entity ? clone(entity) : undefined;
        },
        findBillingTaxDocument(documentId, tenantId) {
            if (!documentId) {
                return undefined;
            }
            const document = (store.read().billingTaxDocuments ?? [])
                .map(normalizeBillingTaxDocument)
                .find((item) => item.documentId === documentId && (!tenantId || item.tenantId === tenantId));
            return document ? clone(document) : undefined;
        },
        findPaymentRetryScheduleByIdempotencyKey(idempotencyKey) {
            if (!idempotencyKey) {
                return undefined;
            }
            const schedule = (store.read().paymentRetrySchedules ?? [])
                .map(normalizePaymentRetrySchedule)
                .find((item) => item.idempotencyKey === idempotencyKey);
            return schedule ? clone(schedule) : undefined;
        },
        findPaymentRetryKeyByIdempotencyKey(idempotencyKey) {
            if (!idempotencyKey) {
                return undefined;
            }
            const key = (store.read().paymentRetryKeys ?? [])
                .map(normalizePaymentRetryKey)
                .find((item) => item.idempotencyKey === idempotencyKey);
            return key ? clone(key) : undefined;
        },
        findPaymentDunningStateByIdempotencyKey(idempotencyKey) {
            if (!idempotencyKey) {
                return undefined;
            }
            const state = (store.read().paymentDunningStates ?? [])
                .map(normalizePaymentDunningState)
                .find((item) => item.idempotencyKey === idempotencyKey);
            return state ? clone(state) : undefined;
        },
        findReconciliationConflictByIdempotencyKey(idempotencyKey) {
            if (!idempotencyKey) {
                return undefined;
            }
            const conflict = (store.read().reconciliationConflicts ?? [])
                .map(normalizeReconciliationConflict)
                .find((item) => item.idempotencyKey === idempotencyKey);
            return conflict ? clone(conflict) : undefined;
        },
        appendProviderSyncAuditEvent(idempotencyKey, auditEvent) {
            let result;
            store.update((state) => {
                const events = state.billingProviderSyncEvents ?? [];
                result = events.find((event) => event.idempotencyKey === idempotencyKey);
                if (!result) {
                    return state;
                }
                const updated = {
                    ...result,
                    auditEvents: [...(result.auditEvents ?? []), auditEvent]
                };
                result = updated;
                return {
                    ...state,
                    billingProviderSyncEvents: events.map((event) => event.idempotencyKey === idempotencyKey ? updated : event)
                };
            });
            return result ? clone(result) : undefined;
        },
        recordQuotaLedgerEntry(entry) {
            store.update((state) => ({
                ...state,
                quotaLedgerEntries: [entry, ...(state.quotaLedgerEntries ?? [])]
            }));
            return clone(entry);
        },
        savePaymentRetrySchedule(schedule) {
            const persisted = normalizePaymentRetrySchedule(schedule);
            let result = persisted;
            store.update((state) => {
                const schedules = (state.paymentRetrySchedules ?? []).map(normalizePaymentRetrySchedule);
                const existing = schedules.find((item) => (item.tenantId === persisted.tenantId && item.scheduleId === persisted.scheduleId)
                    || item.idempotencyKey === persisted.idempotencyKey);
                if (existing) {
                    result = existing;
                    return state;
                }
                return {
                    ...state,
                    paymentRetrySchedules: [persisted, ...schedules]
                };
            });
            return clone(result);
        },
        savePaymentRetryKey(key) {
            const persisted = normalizePaymentRetryKey(key);
            let result = persisted;
            store.update((state) => {
                const keys = (state.paymentRetryKeys ?? []).map(normalizePaymentRetryKey);
                const existing = keys.find((item) => (item.tenantId === persisted.tenantId && item.retryKeyId === persisted.retryKeyId)
                    || item.idempotencyKey === persisted.idempotencyKey);
                if (existing) {
                    result = existing;
                    return state;
                }
                return {
                    ...state,
                    paymentRetryKeys: [persisted, ...keys]
                };
            });
            return clone(result);
        },
        savePaymentDunningState(state) {
            const persisted = normalizePaymentDunningState(state);
            let result = persisted;
            store.update((current) => {
                const states = (current.paymentDunningStates ?? []).map(normalizePaymentDunningState);
                const existing = states.find((item) => (item.tenantId === persisted.tenantId && item.dunningId === persisted.dunningId)
                    || item.idempotencyKey === persisted.idempotencyKey);
                if (existing) {
                    result = existing;
                    return current;
                }
                return {
                    ...current,
                    paymentDunningStates: [persisted, ...states]
                };
            });
            return clone(result);
        },
        saveBillingApproval(approval) {
            const persisted = normalizeBillingApproval(approval);
            let result = persisted;
            store.update((state) => {
                const approvals = (state.billingApprovals ?? []).map(normalizeBillingApproval);
                const existing = approvals.find((item) => (item.tenantId === persisted.tenantId && item.approvalId === persisted.approvalId)
                    || (item.tenantId === persisted.tenantId && item.requestFingerprint === persisted.requestFingerprint));
                if (existing) {
                    result = existing;
                    return state;
                }
                return {
                    ...state,
                    billingApprovals: [persisted, ...approvals]
                };
            });
            return clone(result);
        },
        saveBillingLegalEntity(entity) {
            const persisted = withBillingLegalEntitySavedAuditEvent(normalizeBillingLegalEntity(entity));
            let result = persisted;
            store.update((state) => {
                const entities = (state.billingLegalEntities ?? []).map(normalizeBillingLegalEntity);
                const existing = entities.find((item) => (item.tenantId === persisted.tenantId && item.legalEntityId === persisted.legalEntityId)
                    || (item.tenantId === persisted.tenantId && item.registrationNumber === persisted.registrationNumber));
                if (existing) {
                    result = existing;
                    return state;
                }
                return {
                    ...state,
                    billingLegalEntities: [persisted, ...entities]
                };
            });
            return clone(result);
        },
        saveBillingTaxDocument(document) {
            const persisted = withBillingTaxDocumentSavedAuditEvent(normalizeBillingTaxDocument(document));
            let result = persisted;
            store.update((state) => {
                const documents = (state.billingTaxDocuments ?? []).map(normalizeBillingTaxDocument);
                const existing = documents.find((item) => (item.tenantId === persisted.tenantId && item.documentId === persisted.documentId)
                    || (item.tenantId === persisted.tenantId && item.requestFingerprint === persisted.requestFingerprint));
                if (existing) {
                    result = existing;
                    return state;
                }
                return {
                    ...state,
                    billingTaxDocuments: [persisted, ...documents]
                };
            });
            return clone(result);
        },
        decideBillingApproval(input) {
            let result = null;
            store.update((state) => {
                const approvals = (state.billingApprovals ?? []).map(normalizeBillingApproval);
                const existing = approvals.find((approval) => approval.tenantId === input.tenantId && approval.approvalId === input.approvalId);
                if (!existing) {
                    throw new Error(`Billing approval ${input.approvalId} was not found.`);
                }
                if (existing.status !== "pending") {
                    throw new Error(`Billing approval ${input.approvalId} was not pending.`);
                }
                const decided = {
                    ...existing,
                    auditEvents: appendBillingApprovalDecisionAuditEvent(existing, input, toIso(input.decidedAt)),
                    decidedAt: toIso(input.decidedAt),
                    decidedBy: String(input.decidedBy ?? "").trim(),
                    decidedByName: String(input.decidedByName ?? "").trim(),
                    decisionReason: redactSensitiveText(String(input.decisionReason ?? "").trim()),
                    status: input.status,
                    traceId: String(input.traceId ?? "").trim(),
                    updatedAt: toIso(input.decidedAt)
                };
                result = decided;
                return {
                    ...state,
                    billingApprovals: approvals.map((approval) => approval.tenantId === input.tenantId && approval.approvalId === input.approvalId ? decided : approval)
                };
            });
            if (!result) {
                throw new Error(`Billing approval ${input.approvalId} decision was not persisted.`);
            }
            return clone(result);
        },
        saveReconciliationConflict(conflict) {
            const persisted = normalizeReconciliationConflict(conflict);
            let result = persisted;
            store.update((state) => {
                const conflicts = (state.reconciliationConflicts ?? []).map(normalizeReconciliationConflict);
                const existing = conflicts.find((item) => (item.tenantId === persisted.tenantId && item.conflictId === persisted.conflictId)
                    || item.idempotencyKey === persisted.idempotencyKey);
                if (existing) {
                    result = existing;
                    return state;
                }
                return {
                    ...state,
                    reconciliationConflicts: [persisted, ...conflicts]
                };
            });
            return clone(result);
        },
        createQuotaReservation(reservation) {
            store.update((state) => ({
                ...state,
                quotaReservations: [reservation, ...(state.quotaReservations ?? [])]
            }));
            return clone(reservation);
        },
        reserveQuotaAtomically(input) {
            let result = null;
            store.update((state) => {
                const reservations = state.quotaReservations ?? [];
                const active = reservations.filter((reservation) => reservation.tenantId === input.reservation.tenantId
                    && reservation.resource === input.reservation.resource
                    && reservation.status === "reserved");
                const reserved = active.reduce((sum, reservation) => sum + reservation.requested, 0);
                const existing = reservations.find((reservation) => reservation.idempotencyKey === input.reservation.idempotencyKey);
                if (existing) {
                    result = { kind: "replay", reservation: clone(existing), reserved };
                    return state;
                }
                if (input.used + reserved + input.reservation.requested > input.limit) {
                    result = { kind: "denied", reserved };
                    return state;
                }
                result = { kind: "created", reservation: clone(input.reservation), reserved };
                return {
                    ...state,
                    quotaReservations: [input.reservation, ...reservations]
                };
            });
            if (!result)
                throw new Error("quota_reservation_atomic_result_missing");
            return clone(result);
        },
        commitQuotaReservation(input) {
            let result = null;
            store.update((state) => {
                const currentReservations = state.quotaReservations ?? [];
                const existingReservation = currentReservations.find((reservation) => reservation.id === input.reservationId);
                if (!existingReservation) {
                    throw new Error(`Quota reservation ${input.reservationId} was not found.`);
                }
                if (existingReservation.status !== "reserved") {
                    throw new Error(`Quota reservation ${input.reservationId} was not reserved.`);
                }
                const currentTenants = state.tenants ?? [];
                const existingTenant = currentTenants.find((tenant) => tenant.id === existingReservation.tenantId);
                if (!existingTenant) {
                    throw new Error(`Billing tenant ${existingReservation.tenantId} was not found.`);
                }
                const updatedTenant = applyQuotaDelta(existingTenant, existingReservation.resource, existingReservation.requested);
                const updatedReservation = {
                    ...existingReservation,
                    ...(input.auditEvent ? { auditEvent: input.auditEvent } : {}),
                    auditEvents: appendBillingAuditEvent(existingReservation.auditEvents ?? (existingReservation.auditEvent ? [existingReservation.auditEvent] : []), input.auditEvent),
                    commitIdempotencyKey: input.idempotencyKey,
                    committedAt: input.committedAt,
                    status: "committed",
                    traceId: input.traceId,
                    updatedAt: input.committedAt,
                    usedAfter: quotaUsageValue(updatedTenant, existingReservation.resource)
                };
                result = { reservation: updatedReservation, tenant: updatedTenant };
                return {
                    ...state,
                    quotaReservations: currentReservations.map((reservation) => reservation.id === input.reservationId ? updatedReservation : reservation),
                    tenants: currentTenants.map((tenant) => tenant.id === existingTenant.id ? updatedTenant : tenant)
                };
            });
            if (!result) {
                throw new Error(`Quota reservation ${input.reservationId} commit was not persisted.`);
            }
            return clone(result);
        },
        releaseQuotaReservation(input) {
            let result = null;
            store.update((state) => {
                const currentReservations = state.quotaReservations ?? [];
                const existingReservation = currentReservations.find((reservation) => reservation.id === input.reservationId);
                if (!existingReservation) {
                    throw new Error(`Quota reservation ${input.reservationId} was not found.`);
                }
                if (existingReservation.status !== "reserved") {
                    throw new Error(`Quota reservation ${input.reservationId} was not reserved.`);
                }
                const updatedReservation = {
                    ...existingReservation,
                    ...(input.auditEvent ? { auditEvent: input.auditEvent } : {}),
                    auditEvents: appendBillingAuditEvent(existingReservation.auditEvents ?? (existingReservation.auditEvent ? [existingReservation.auditEvent] : []), input.auditEvent),
                    releaseIdempotencyKey: input.idempotencyKey,
                    releasedAt: input.releasedAt,
                    status: "released",
                    traceId: input.traceId,
                    updatedAt: input.releasedAt
                };
                result = updatedReservation;
                return {
                    ...state,
                    quotaReservations: currentReservations.map((reservation) => reservation.id === input.reservationId ? updatedReservation : reservation)
                };
            });
            if (!result) {
                throw new Error(`Quota reservation ${input.reservationId} release was not persisted.`);
            }
            return clone(result);
        },
        releaseExpiredQuotaReservation(input) {
            let result;
            store.update((state) => {
                const currentReservations = state.quotaReservations ?? [];
                const existingReservation = currentReservations.find((reservation) => reservation.id === input.reservationId);
                if (!existingReservation) {
                    result = undefined;
                    return state;
                }
                if (isExpiredQuotaReservationReleaseReplay(existingReservation, input)) {
                    result = existingReservation;
                    return state;
                }
                if (!isExpiredQuotaReservationReleaseCandidate(existingReservation, input)) {
                    result = undefined;
                    return state;
                }
                const updatedReservation = applyExpiredQuotaReservationRelease(existingReservation, input);
                result = updatedReservation;
                return {
                    ...state,
                    quotaReservations: currentReservations.map((reservation) => reservation.id === input.reservationId ? updatedReservation : reservation)
                };
            });
            return clone(result);
        },
        applyProviderBillingSync(input) {
            let result = null;
            store.update((state) => {
                const currentTenants = state.tenants ?? [];
                const existing = currentTenants.find((tenant) => tenant.id === input.tenantId);
                if (!existing) {
                    throw new Error(`Billing tenant ${input.tenantId} was not found.`);
                }
                const updatedTenant = { ...existing, ...(input.tenantChanges ?? {}) };
                const currentSubscriptions = state.subscriptions ?? [];
                const currentInvoices = state.invoices ?? [];
                const nextSubscriptions = input.subscription
                    ? upsertSubscriptionByProviderId(currentSubscriptions, input.subscription)
                    : currentSubscriptions;
                const nextInvoices = input.invoice
                    ? upsertInvoiceByProviderId(currentInvoices, input.invoice)
                    : currentInvoices;
                const currentPaymentRetrySchedules = state.paymentRetrySchedules ?? [];
                const paymentRetrySchedule = input.paymentRetrySchedule
                    ? normalizePaymentRetrySchedule(input.paymentRetrySchedule)
                    : undefined;
                const nextPaymentRetrySchedules = paymentRetrySchedule
                    ? upsertPaymentRetrySchedule(currentPaymentRetrySchedules, paymentRetrySchedule)
                    : currentPaymentRetrySchedules;
                const currentPaymentDunningStates = state.paymentDunningStates ?? [];
                const paymentDunningState = input.paymentDunningState
                    ? normalizePaymentDunningState(input.paymentDunningState)
                    : undefined;
                const nextPaymentDunningStates = paymentDunningState
                    ? upsertPaymentDunningState(currentPaymentDunningStates, paymentDunningState)
                    : currentPaymentDunningStates;
                const currentPaymentRetryKeys = state.paymentRetryKeys ?? [];
                const paymentRetryKey = input.paymentRetryKey
                    ? normalizePaymentRetryKey(input.paymentRetryKey)
                    : undefined;
                const nextPaymentRetryKeys = paymentRetryKey
                    ? upsertPaymentRetryKey(currentPaymentRetryKeys, paymentRetryKey)
                    : currentPaymentRetryKeys;
                const currentReconciliationConflicts = state.reconciliationConflicts ?? [];
                const reconciliationConflict = input.reconciliationConflict
                    ? normalizeReconciliationConflict(input.reconciliationConflict)
                    : undefined;
                const nextReconciliationConflicts = reconciliationConflict
                    ? upsertReconciliationConflict(currentReconciliationConflicts, reconciliationConflict)
                    : currentReconciliationConflicts;
                const syncJob = normalizeBillingSyncJob(input.syncJob);
                result = {
                    event: input.event,
                    ...(input.invoice ? { invoice: input.invoice } : {}),
                    ...(paymentDunningState ? { paymentDunningState } : {}),
                    ...(paymentRetryKey ? { paymentRetryKey } : {}),
                    ...(paymentRetrySchedule ? { paymentRetrySchedule } : {}),
                    ...(reconciliationConflict ? { reconciliationConflict } : {}),
                    ...(input.subscription ? { subscription: input.subscription } : {}),
                    syncJob,
                    tenant: updatedTenant
                };
                return {
                    ...state,
                    billingProviderSyncEvents: [input.event, ...(state.billingProviderSyncEvents ?? [])],
                    billingSyncJobs: [syncJob, ...(state.billingSyncJobs ?? [])],
                    invoices: nextInvoices,
                    paymentDunningStates: nextPaymentDunningStates,
                    paymentRetryKeys: nextPaymentRetryKeys,
                    paymentRetrySchedules: nextPaymentRetrySchedules,
                    reconciliationConflicts: nextReconciliationConflicts,
                    subscriptions: nextSubscriptions,
                    tenants: currentTenants.map((tenant) => tenant.id === input.tenantId ? updatedTenant : tenant)
                };
            });
            if (!result) {
                throw new Error(`Billing tenant ${input.tenantId} provider sync was not persisted.`);
            }
            return clone(result);
        },
        applyTenantTariffChange({ changes, syncJob, tenantId }) {
            let result = null;
            store.update((state) => {
                const currentTenants = state.tenants ?? [];
                const existing = currentTenants.find((tenant) => tenant.id === tenantId);
                if (!existing) {
                    throw new Error(`Billing tenant ${tenantId} was not found.`);
                }
                const updatedTenant = { ...existing, ...changes };
                const normalizedSyncJob = normalizeBillingSyncJob(syncJob);
                result = { syncJob: normalizedSyncJob, tenant: updatedTenant };
                return {
                    ...state,
                    billingSyncJobs: [normalizedSyncJob, ...(state.billingSyncJobs ?? [])],
                    tenants: currentTenants.map((tenant) => tenant.id === tenantId ? updatedTenant : tenant)
                };
            });
            if (!result) {
                throw new Error(`Billing tenant ${tenantId} tariff change was not persisted.`);
            }
            return clone(result);
        }
    };
}
function toBillingTenantState(row) {
    return {
        arr: row.arr,
        healthScore: row.healthScore,
        id: row.id,
        monthlyRevenue: row.monthlyRevenue,
        name: row.name,
        owner: row.owner,
        planId: row.planId,
        region: row.region,
        sla: row.sla,
        status: billingTenantStatusFromRow(row.status),
        usage: usageFromRow(row.usage),
        users: row.users,
        workspaces: row.workspaces
    };
}
function toBillingSyncJob(row) {
    return {
        actor: row.actor,
        actorName: row.actorName,
        attempts: row.attempts ?? 0,
        auditEventId: row.auditEventId,
        createdAt: toIso(row.createdAt),
        deadLetteredAt: row.deadLetteredAt ? toIso(row.deadLetteredAt) : null,
        fromPlanId: row.fromPlanId,
        id: row.id,
        lastError: row.lastError ?? null,
        lockedAt: row.lockedAt ? toIso(row.lockedAt) : null,
        nextAttemptAt: row.nextAttemptAt ? toIso(row.nextAttemptAt) : null,
        payload: toJsonRecord(row.payload),
        publishedAt: row.publishedAt ? toIso(row.publishedAt) : null,
        queue: "billing-sync",
        reason: row.reason,
        status: billingSyncJobStatusFromRow(row.status),
        tenantId: row.tenantId,
        toPlanId: row.toPlanId,
        traceId: row.traceId
    };
}
function normalizeBillingSyncJob(job) {
    return {
        ...job,
        attempts: job.attempts ?? 0,
        deadLetteredAt: job.deadLetteredAt ?? null,
        lastError: job.lastError ?? null,
        lockedAt: job.lockedAt ?? null,
        nextAttemptAt: job.nextAttemptAt ?? null,
        payload: toJsonRecord(job.payload),
        publishedAt: job.publishedAt ?? null,
        status: billingSyncJobStatusFromRow(job.status)
    };
}
function normalizeBillingApproval(approval) {
    return {
        approvalId: String(approval.approvalId ?? "").trim(),
        auditEvents: toBillingApprovalDecisionAuditEvents(approval.auditEvents),
        createdAt: toIso(approval.createdAt),
        decidedAt: approval.decidedAt ? toIso(approval.decidedAt) : null,
        decidedBy: approval.decidedBy ? String(approval.decidedBy).trim() : null,
        decidedByName: approval.decidedByName ? String(approval.decidedByName).trim() : null,
        decisionReason: approval.decisionReason ? redactSensitiveText(String(approval.decisionReason).trim()) : null,
        expiresAt: toIso(approval.expiresAt),
        reason: redactSensitiveText(String(approval.reason ?? "").trim()),
        requestedBy: String(approval.requestedBy ?? "").trim(),
        requestedByName: String(approval.requestedByName ?? "").trim(),
        requestFingerprint: String(approval.requestFingerprint ?? "").trim(),
        status: billingApprovalStatusFromRow(approval.status),
        subjectId: String(approval.subjectId ?? "").trim(),
        subjectType: billingApprovalSubjectTypeFromRow(approval.subjectType),
        tenantId: String(approval.tenantId ?? "").trim(),
        traceId: String(approval.traceId ?? "").trim(),
        updatedAt: toIso(approval.updatedAt)
    };
}
function normalizeBillingLegalEntity(entity) {
    return {
        addressLine1: redactSensitiveText(String(entity.addressLine1 ?? "").trim()),
        addressLine2: entity.addressLine2 ? redactSensitiveText(String(entity.addressLine2).trim()) : null,
        auditEvents: toBillingLegalEntityAuditEvents(entity.auditEvents),
        city: redactSensitiveText(String(entity.city ?? "").trim()),
        country: String(entity.country ?? "").trim(),
        createdAt: toIso(entity.createdAt),
        legalEntityId: String(entity.legalEntityId ?? "").trim(),
        legalName: redactSensitiveText(String(entity.legalName ?? "").trim()),
        postalCode: redactSensitiveText(String(entity.postalCode ?? "").trim()),
        region: redactSensitiveText(String(entity.region ?? "").trim()),
        registrationNumber: String(entity.registrationNumber ?? "").trim(),
        status: billingLegalEntityStatusFromRow(entity.status),
        taxId: String(entity.taxId ?? "").trim(),
        tenantId: String(entity.tenantId ?? "").trim(),
        traceId: String(entity.traceId ?? "").trim(),
        updatedAt: toIso(entity.updatedAt),
        vatId: entity.vatId ? String(entity.vatId).trim() : null
    };
}
function normalizeBillingTaxDocument(document) {
    return {
        auditEvents: toBillingTaxDocumentAuditEvents(document.auditEvents),
        createdAt: toIso(document.createdAt),
        documentId: String(document.documentId ?? "").trim(),
        documentType: billingTaxDocumentTypeFromRow(document.documentType),
        fileName: redactSensitiveText(String(document.fileName ?? "").trim()),
        legalEntityId: String(document.legalEntityId ?? "").trim(),
        mimeType: String(document.mimeType ?? "").trim(),
        requestFingerprint: String(document.requestFingerprint ?? "").trim(),
        sha256: String(document.sha256 ?? "").trim(),
        status: billingTaxDocumentStatusFromRow(document.status),
        storageLocator: String(document.storageLocator ?? "").trim(),
        tenantId: String(document.tenantId ?? "").trim(),
        traceId: String(document.traceId ?? "").trim(),
        updatedAt: toIso(document.updatedAt),
        uploadedBy: String(document.uploadedBy ?? "").trim(),
        uploadedByName: redactSensitiveText(String(document.uploadedByName ?? "").trim())
    };
}
function normalizePaymentRetrySchedule(schedule) {
    return {
        attempt: numberFromRow(schedule.attempt, 0),
        createdAt: toIso(schedule.createdAt),
        idempotencyKey: String(schedule.idempotencyKey ?? "").trim(),
        invoiceId: String(schedule.invoiceId ?? "").trim(),
        lastAttemptAt: schedule.lastAttemptAt ? toIso(schedule.lastAttemptAt) : null,
        maxAttempts: numberFromRow(schedule.maxAttempts, 1),
        nextAttemptAt: toIso(schedule.nextAttemptAt),
        provider: String(schedule.provider ?? "").trim(),
        providerInvoiceId: String(schedule.providerInvoiceId ?? "").trim(),
        requestFingerprint: String(schedule.requestFingerprint ?? "").trim(),
        scheduleId: String(schedule.scheduleId ?? "").trim(),
        status: billingPaymentRetryScheduleStatusFromRow(schedule.status),
        tenantId: String(schedule.tenantId ?? "").trim(),
        traceId: String(schedule.traceId ?? "").trim(),
        updatedAt: toIso(schedule.updatedAt)
    };
}
function normalizePaymentRetryKey(key) {
    return {
        attempt: numberFromRow(key.attempt, 0),
        createdAt: toIso(key.createdAt),
        firstAttemptAt: toIso(key.firstAttemptAt),
        idempotencyKey: String(key.idempotencyKey ?? "").trim(),
        invoiceId: String(key.invoiceId ?? "").trim(),
        lastAttemptAt: key.lastAttemptAt ? toIso(key.lastAttemptAt) : null,
        provider: String(key.provider ?? "").trim(),
        providerInvoiceId: String(key.providerInvoiceId ?? "").trim(),
        requestFingerprint: String(key.requestFingerprint ?? "").trim(),
        result: toJsonRecord(key.result),
        retryKeyId: String(key.retryKeyId ?? "").trim(),
        scheduleId: key.scheduleId ? String(key.scheduleId).trim() : null,
        status: billingPaymentRetryKeyStatusFromRow(key.status),
        tenantId: String(key.tenantId ?? "").trim(),
        traceId: String(key.traceId ?? "").trim(),
        updatedAt: toIso(key.updatedAt)
    };
}
function normalizePaymentDunningState(state) {
    return {
        createdAt: toIso(state.createdAt),
        dunningId: String(state.dunningId ?? "").trim(),
        failedAttempts: numberFromRow(state.failedAttempts, 0),
        idempotencyKey: String(state.idempotencyKey ?? "").trim(),
        invoiceId: String(state.invoiceId ?? "").trim(),
        lastFailureAt: state.lastFailureAt ? toIso(state.lastFailureAt) : null,
        nextActionAt: state.nextActionAt ? toIso(state.nextActionAt) : null,
        provider: String(state.provider ?? "").trim(),
        providerInvoiceId: String(state.providerInvoiceId ?? "").trim(),
        requestFingerprint: String(state.requestFingerprint ?? "").trim(),
        stage: billingPaymentDunningStageFromRow(state.stage),
        status: billingPaymentDunningStatusFromRow(state.status),
        subscriptionId: state.subscriptionId ? String(state.subscriptionId).trim() : null,
        tenantId: String(state.tenantId ?? "").trim(),
        traceId: String(state.traceId ?? "").trim(),
        updatedAt: toIso(state.updatedAt)
    };
}
function normalizeReconciliationConflict(conflict) {
    return {
        actual: toJsonRecord(conflict.actual),
        conflictId: String(conflict.conflictId ?? "").trim(),
        createdAt: toIso(conflict.createdAt),
        detectedAt: toIso(conflict.detectedAt),
        expected: toJsonRecord(conflict.expected),
        idempotencyKey: String(conflict.idempotencyKey ?? "").trim(),
        invoiceId: String(conflict.invoiceId ?? "").trim(),
        provider: String(conflict.provider ?? "").trim(),
        providerInvoiceId: String(conflict.providerInvoiceId ?? "").trim(),
        reason: String(conflict.reason ?? "").trim(),
        requestFingerprint: String(conflict.requestFingerprint ?? "").trim(),
        resolution: conflict.resolution ? String(conflict.resolution).trim() : null,
        resolvedAt: conflict.resolvedAt ? toIso(conflict.resolvedAt) : null,
        severity: billingReconciliationConflictSeverityFromRow(conflict.severity),
        status: billingReconciliationConflictStatusFromRow(conflict.status),
        tenantId: String(conflict.tenantId ?? "").trim(),
        traceId: String(conflict.traceId ?? "").trim(),
        updatedAt: toIso(conflict.updatedAt)
    };
}
function toBillingQuotaLedgerEntry(row) {
    const auditEvent = toOptionalBillingAuditEvent(row.auditEvent);
    return {
        ...(auditEvent ? { auditEvent } : {}),
        createdAt: toIso(row.createdAt),
        decision: quotaLedgerDecisionFromRow(row.decision),
        id: row.id,
        idempotencyKey: row.idempotencyKey,
        limit: row.limit,
        mode: "record",
        planId: row.planId,
        projected: row.projected,
        reason: row.reason ?? null,
        remainingAfter: row.remainingAfter,
        remainingBefore: row.remainingBefore,
        requested: row.requested,
        requestFingerprint: row.requestFingerprint,
        resource: row.resource,
        tenantId: row.tenantId,
        traceId: row.traceId,
        used: row.used
    };
}
function toBillingQuotaReservation(row) {
    const auditEvents = toBillingAuditEvents(row.auditEvents);
    const auditEvent = toOptionalBillingAuditEvent(row.auditEvent) ?? auditEvents.at(-1);
    return {
        ...(auditEvent ? { auditEvent } : {}),
        ...(auditEvents.length > 0 ? { auditEvents } : {}),
        commitIdempotencyKey: row.commitIdempotencyKey ?? null,
        committedAt: row.committedAt ? toIso(row.committedAt) : null,
        createdAt: toIso(row.createdAt),
        expiresAt: toIso(row.expiresAt),
        id: row.id,
        idempotencyKey: row.idempotencyKey,
        limit: row.limit,
        lockedAt: row.lockedAt ? toIso(row.lockedAt) : null,
        planId: row.planId,
        releaseIdempotencyKey: row.releaseIdempotencyKey ?? null,
        releasedAt: row.releasedAt ? toIso(row.releasedAt) : null,
        requested: row.requested,
        requestFingerprint: row.requestFingerprint,
        resource: row.resource,
        status: quotaReservationStatusFromRow(row.status),
        tenantId: row.tenantId,
        traceId: row.traceId,
        updatedAt: toIso(row.updatedAt),
        usedAfter: row.usedAfter ?? null,
        usedBefore: row.usedBefore
    };
}
function toBillingApproval(row) {
    return {
        approvalId: row.approvalId,
        auditEvents: toBillingApprovalDecisionAuditEvents(row.auditEvents),
        createdAt: toIso(row.createdAt),
        decidedAt: row.decidedAt ? toIso(row.decidedAt) : null,
        decidedBy: row.decidedBy ?? null,
        decidedByName: row.decidedByName ?? null,
        decisionReason: row.decisionReason ?? null,
        expiresAt: toIso(row.expiresAt),
        reason: row.reason,
        requestedBy: row.requestedBy,
        requestedByName: row.requestedByName,
        requestFingerprint: row.requestFingerprint,
        status: billingApprovalStatusFromRow(row.status),
        subjectId: row.subjectId,
        subjectType: billingApprovalSubjectTypeFromRow(row.subjectType),
        tenantId: row.tenantId,
        traceId: row.traceId,
        updatedAt: toIso(row.updatedAt)
    };
}
function toBillingLegalEntity(row) {
    return {
        addressLine1: row.addressLine1,
        addressLine2: row.addressLine2 ?? null,
        auditEvents: toBillingLegalEntityAuditEvents(row.auditEvents),
        city: row.city,
        country: row.country,
        createdAt: toIso(row.createdAt),
        legalEntityId: row.legalEntityId,
        legalName: row.legalName,
        postalCode: row.postalCode,
        region: row.region,
        registrationNumber: row.registrationNumber,
        status: billingLegalEntityStatusFromRow(row.status),
        taxId: row.taxId,
        tenantId: row.tenantId,
        traceId: row.traceId,
        updatedAt: toIso(row.updatedAt),
        vatId: row.vatId ?? null
    };
}
function toBillingTaxDocument(row) {
    return {
        auditEvents: toBillingTaxDocumentAuditEvents(row.auditEvents),
        createdAt: toIso(row.createdAt),
        documentId: row.documentId,
        documentType: billingTaxDocumentTypeFromRow(row.documentType),
        fileName: row.fileName,
        legalEntityId: row.legalEntityId,
        mimeType: row.mimeType,
        requestFingerprint: row.requestFingerprint,
        sha256: row.sha256,
        status: billingTaxDocumentStatusFromRow(row.status),
        storageLocator: row.storageLocator,
        tenantId: row.tenantId,
        traceId: row.traceId,
        updatedAt: toIso(row.updatedAt),
        uploadedBy: row.uploadedBy,
        uploadedByName: row.uploadedByName
    };
}
function toBillingPaymentRetrySchedule(row) {
    return {
        attempt: row.attempt,
        createdAt: toIso(row.createdAt),
        idempotencyKey: row.idempotencyKey,
        invoiceId: row.invoiceId,
        lastAttemptAt: row.lastAttemptAt ? toIso(row.lastAttemptAt) : null,
        maxAttempts: row.maxAttempts,
        nextAttemptAt: toIso(row.nextAttemptAt),
        provider: row.provider,
        providerInvoiceId: row.providerInvoiceId,
        requestFingerprint: row.requestFingerprint,
        scheduleId: row.scheduleId,
        status: billingPaymentRetryScheduleStatusFromRow(row.status),
        tenantId: row.tenantId,
        traceId: row.traceId,
        updatedAt: toIso(row.updatedAt)
    };
}
function toBillingPaymentRetryKey(row) {
    return {
        attempt: row.attempt,
        createdAt: toIso(row.createdAt),
        firstAttemptAt: toIso(row.firstAttemptAt),
        idempotencyKey: row.idempotencyKey,
        invoiceId: row.invoiceId,
        lastAttemptAt: row.lastAttemptAt ? toIso(row.lastAttemptAt) : null,
        provider: row.provider,
        providerInvoiceId: row.providerInvoiceId,
        requestFingerprint: row.requestFingerprint,
        result: toJsonRecord(row.result),
        retryKeyId: row.retryKeyId,
        scheduleId: row.scheduleId ?? null,
        status: billingPaymentRetryKeyStatusFromRow(row.status),
        tenantId: row.tenantId,
        traceId: row.traceId,
        updatedAt: toIso(row.updatedAt)
    };
}
function toBillingPaymentDunningState(row) {
    return {
        createdAt: toIso(row.createdAt),
        dunningId: row.dunningId,
        failedAttempts: row.failedAttempts,
        idempotencyKey: row.idempotencyKey,
        invoiceId: row.invoiceId,
        lastFailureAt: row.lastFailureAt ? toIso(row.lastFailureAt) : null,
        nextActionAt: row.nextActionAt ? toIso(row.nextActionAt) : null,
        provider: row.provider,
        providerInvoiceId: row.providerInvoiceId,
        requestFingerprint: row.requestFingerprint,
        stage: billingPaymentDunningStageFromRow(row.stage),
        status: billingPaymentDunningStatusFromRow(row.status),
        subscriptionId: row.subscriptionId ?? null,
        tenantId: row.tenantId,
        traceId: row.traceId,
        updatedAt: toIso(row.updatedAt)
    };
}
function toBillingReconciliationConflict(row) {
    return {
        actual: toJsonRecord(row.actual),
        conflictId: row.conflictId,
        createdAt: toIso(row.createdAt),
        detectedAt: toIso(row.detectedAt),
        expected: toJsonRecord(row.expected),
        idempotencyKey: row.idempotencyKey,
        invoiceId: row.invoiceId,
        provider: row.provider,
        providerInvoiceId: row.providerInvoiceId,
        reason: row.reason,
        requestFingerprint: row.requestFingerprint,
        resolution: row.resolution ?? null,
        resolvedAt: row.resolvedAt ? toIso(row.resolvedAt) : null,
        severity: billingReconciliationConflictSeverityFromRow(row.severity),
        status: billingReconciliationConflictStatusFromRow(row.status),
        tenantId: row.tenantId,
        traceId: row.traceId,
        updatedAt: toIso(row.updatedAt)
    };
}
function toBillingSubscription(row) {
    return {
        billingPeriod: billingPeriodFromRow(row.billingPeriod),
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        createdAt: toIso(row.createdAt),
        currency: row.currency,
        currentPeriodEnd: toIso(row.currentPeriodEnd),
        currentPeriodStart: toIso(row.currentPeriodStart),
        id: row.id,
        planId: row.planId,
        provider: row.provider,
        providerCustomerId: row.providerCustomerId,
        providerSubscriptionId: row.providerSubscriptionId,
        seats: row.seats,
        status: billingSubscriptionStatusFromRow(row.status),
        tenantId: row.tenantId,
        unitAmountMonthly: row.unitAmountMonthly,
        updatedAt: toIso(row.updatedAt)
    };
}
function toBillingInvoice(row) {
    return {
        amountDue: row.amountDue,
        amountPaid: row.amountPaid,
        createdAt: toIso(row.createdAt),
        currency: row.currency,
        dueAt: toIso(row.dueAt),
        hostedInvoiceUrl: row.hostedInvoiceUrl ?? null,
        id: row.id,
        paidAt: row.paidAt ? toIso(row.paidAt) : null,
        paymentStatus: billingInvoicePaymentStatusFromRow(row.paymentStatus),
        provider: row.provider,
        providerInvoiceId: row.providerInvoiceId,
        status: billingInvoiceStatusFromRow(row.status),
        subscriptionId: row.subscriptionId,
        tenantId: row.tenantId,
        updatedAt: toIso(row.updatedAt)
    };
}
function toBillingProviderSyncEvent(row) {
    const auditEvents = toBillingProviderSyncAuditEvents(row.auditEvents);
    return {
        ...(auditEvents.length > 0 ? { auditEvents } : {}),
        createdAt: toIso(row.createdAt),
        eventType: row.eventType,
        id: row.id,
        idempotencyKey: row.idempotencyKey,
        payload: toJsonRecord(row.payload),
        provider: row.provider,
        requestFingerprint: row.requestFingerprint,
        status: billingProviderSyncStatusFromRow(row.status),
        syncJobId: row.syncJobId,
        tenantId: row.tenantId,
        traceId: row.traceId
    };
}
function toPrismaBillingTenantStateUpdateInput(changes) {
    const input = {};
    if (changes.arr !== undefined)
        input.arr = changes.arr;
    if (changes.healthScore !== undefined)
        input.healthScore = changes.healthScore;
    if (changes.monthlyRevenue !== undefined)
        input.monthlyRevenue = changes.monthlyRevenue;
    if (changes.name !== undefined)
        input.name = changes.name;
    if (changes.owner !== undefined)
        input.owner = changes.owner;
    if (changes.planId !== undefined)
        input.planId = changes.planId;
    if (changes.region !== undefined)
        input.region = changes.region;
    if (changes.sla !== undefined)
        input.sla = changes.sla;
    if (changes.status !== undefined)
        input.status = changes.status;
    if (changes.usage !== undefined)
        input.usage = changes.usage;
    if (changes.users !== undefined)
        input.users = changes.users;
    if (changes.workspaces !== undefined)
        input.workspaces = changes.workspaces;
    return input;
}
function toPrismaBillingSubscriptionUpsertInput(subscription) {
    return {
        billingPeriod: subscription.billingPeriod,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: new Date(subscription.createdAt),
        currency: subscription.currency,
        currentPeriodEnd: new Date(subscription.currentPeriodEnd),
        currentPeriodStart: new Date(subscription.currentPeriodStart),
        id: subscription.id,
        planId: subscription.planId,
        provider: subscription.provider,
        providerCustomerId: subscription.providerCustomerId,
        providerSubscriptionId: subscription.providerSubscriptionId,
        seats: subscription.seats,
        status: subscription.status,
        tenantId: subscription.tenantId,
        unitAmountMonthly: subscription.unitAmountMonthly,
        updatedAt: new Date(subscription.updatedAt)
    };
}
function toPrismaBillingInvoiceUpsertInput(invoice) {
    return {
        amountDue: invoice.amountDue,
        amountPaid: invoice.amountPaid,
        createdAt: new Date(invoice.createdAt),
        currency: invoice.currency,
        dueAt: new Date(invoice.dueAt),
        hostedInvoiceUrl: invoice.hostedInvoiceUrl,
        id: invoice.id,
        paidAt: invoice.paidAt ? new Date(invoice.paidAt) : null,
        paymentStatus: invoice.paymentStatus,
        provider: invoice.provider,
        providerInvoiceId: invoice.providerInvoiceId,
        status: invoice.status,
        subscriptionId: invoice.subscriptionId,
        tenantId: invoice.tenantId,
        updatedAt: new Date(invoice.updatedAt)
    };
}
function toPrismaBillingProviderSyncEventCreateInput(event) {
    return {
        auditEvents: (event.auditEvents ?? []).map((auditEvent) => ({ ...auditEvent })),
        createdAt: new Date(event.createdAt),
        eventType: event.eventType,
        id: event.id,
        idempotencyKey: event.idempotencyKey,
        payload: event.payload,
        provider: event.provider,
        requestFingerprint: event.requestFingerprint,
        status: event.status,
        syncJobId: event.syncJobId,
        tenantId: event.tenantId,
        traceId: event.traceId
    };
}
function toPrismaBillingQuotaReservationCreateInput(reservation) {
    const auditEvents = reservation.auditEvents ?? (reservation.auditEvent ? [reservation.auditEvent] : []);
    return {
        auditEvent: reservation.auditEvent ? { ...reservation.auditEvent } : null,
        auditEvents: auditEvents.map((event) => ({ ...event })),
        commitIdempotencyKey: reservation.commitIdempotencyKey,
        committedAt: reservation.committedAt ? new Date(reservation.committedAt) : null,
        createdAt: new Date(reservation.createdAt),
        expiresAt: new Date(reservation.expiresAt),
        id: reservation.id,
        idempotencyKey: reservation.idempotencyKey,
        limit: reservation.limit,
        lockedAt: reservation.lockedAt ? new Date(reservation.lockedAt) : null,
        planId: reservation.planId,
        releaseIdempotencyKey: reservation.releaseIdempotencyKey,
        releasedAt: reservation.releasedAt ? new Date(reservation.releasedAt) : null,
        requested: reservation.requested,
        requestFingerprint: reservation.requestFingerprint,
        resource: reservation.resource,
        status: reservation.status,
        tenantId: reservation.tenantId,
        traceId: reservation.traceId,
        updatedAt: new Date(reservation.updatedAt),
        usedAfter: reservation.usedAfter,
        usedBefore: reservation.usedBefore
    };
}
function toPrismaBillingApprovalCreateInput(approval) {
    const persisted = normalizeBillingApproval(approval);
    return {
        approvalId: persisted.approvalId,
        auditEvents: persisted.auditEvents ?? [],
        createdAt: new Date(persisted.createdAt),
        decidedAt: persisted.decidedAt ? new Date(persisted.decidedAt) : null,
        decidedBy: persisted.decidedBy,
        decidedByName: persisted.decidedByName,
        decisionReason: persisted.decisionReason,
        expiresAt: new Date(persisted.expiresAt),
        reason: persisted.reason,
        requestedBy: persisted.requestedBy,
        requestedByName: persisted.requestedByName,
        requestFingerprint: persisted.requestFingerprint,
        status: persisted.status,
        subjectId: persisted.subjectId,
        subjectType: persisted.subjectType,
        tenantId: persisted.tenantId,
        traceId: persisted.traceId,
        updatedAt: new Date(persisted.updatedAt)
    };
}
function toPrismaBillingLegalEntityCreateInput(entity) {
    const persisted = normalizeBillingLegalEntity(entity);
    return {
        addressLine1: persisted.addressLine1,
        addressLine2: persisted.addressLine2,
        auditEvents: persisted.auditEvents ?? [],
        city: persisted.city,
        country: persisted.country,
        createdAt: new Date(persisted.createdAt),
        legalEntityId: persisted.legalEntityId,
        legalName: persisted.legalName,
        postalCode: persisted.postalCode,
        region: persisted.region,
        registrationNumber: persisted.registrationNumber,
        status: persisted.status,
        taxId: persisted.taxId,
        tenantId: persisted.tenantId,
        traceId: persisted.traceId,
        updatedAt: new Date(persisted.updatedAt),
        vatId: persisted.vatId
    };
}
function toPrismaBillingTaxDocumentCreateInput(document) {
    const persisted = normalizeBillingTaxDocument(document);
    return {
        auditEvents: persisted.auditEvents ?? [],
        createdAt: new Date(persisted.createdAt),
        documentId: persisted.documentId,
        documentType: persisted.documentType,
        fileName: persisted.fileName,
        legalEntityId: persisted.legalEntityId,
        mimeType: persisted.mimeType,
        requestFingerprint: persisted.requestFingerprint,
        sha256: persisted.sha256,
        status: persisted.status,
        storageLocator: persisted.storageLocator,
        tenantId: persisted.tenantId,
        traceId: persisted.traceId,
        updatedAt: new Date(persisted.updatedAt),
        uploadedBy: persisted.uploadedBy,
        uploadedByName: persisted.uploadedByName
    };
}
function toPrismaBillingPaymentRetryScheduleCreateInput(schedule) {
    const persisted = normalizePaymentRetrySchedule(schedule);
    return {
        attempt: persisted.attempt,
        createdAt: new Date(persisted.createdAt),
        idempotencyKey: persisted.idempotencyKey,
        invoiceId: persisted.invoiceId,
        lastAttemptAt: persisted.lastAttemptAt ? new Date(persisted.lastAttemptAt) : null,
        maxAttempts: persisted.maxAttempts,
        nextAttemptAt: new Date(persisted.nextAttemptAt),
        provider: persisted.provider,
        providerInvoiceId: persisted.providerInvoiceId,
        requestFingerprint: persisted.requestFingerprint,
        scheduleId: persisted.scheduleId,
        status: persisted.status,
        tenantId: persisted.tenantId,
        traceId: persisted.traceId,
        updatedAt: new Date(persisted.updatedAt)
    };
}
function toPrismaBillingPaymentRetryKeyCreateInput(key) {
    const persisted = normalizePaymentRetryKey(key);
    return {
        attempt: persisted.attempt,
        createdAt: new Date(persisted.createdAt),
        firstAttemptAt: new Date(persisted.firstAttemptAt),
        idempotencyKey: persisted.idempotencyKey,
        invoiceId: persisted.invoiceId,
        lastAttemptAt: persisted.lastAttemptAt ? new Date(persisted.lastAttemptAt) : null,
        provider: persisted.provider,
        providerInvoiceId: persisted.providerInvoiceId,
        requestFingerprint: persisted.requestFingerprint,
        result: { ...persisted.result },
        retryKeyId: persisted.retryKeyId,
        scheduleId: persisted.scheduleId,
        status: persisted.status,
        tenantId: persisted.tenantId,
        traceId: persisted.traceId,
        updatedAt: new Date(persisted.updatedAt)
    };
}
function toPrismaBillingPaymentDunningStateCreateInput(state) {
    const persisted = normalizePaymentDunningState(state);
    return {
        createdAt: new Date(persisted.createdAt),
        dunningId: persisted.dunningId,
        failedAttempts: persisted.failedAttempts,
        idempotencyKey: persisted.idempotencyKey,
        invoiceId: persisted.invoiceId,
        lastFailureAt: persisted.lastFailureAt ? new Date(persisted.lastFailureAt) : null,
        nextActionAt: persisted.nextActionAt ? new Date(persisted.nextActionAt) : null,
        provider: persisted.provider,
        providerInvoiceId: persisted.providerInvoiceId,
        requestFingerprint: persisted.requestFingerprint,
        stage: persisted.stage,
        status: persisted.status,
        subscriptionId: persisted.subscriptionId,
        tenantId: persisted.tenantId,
        traceId: persisted.traceId,
        updatedAt: new Date(persisted.updatedAt)
    };
}
function toPrismaBillingReconciliationConflictCreateInput(conflict) {
    const persisted = normalizeReconciliationConflict(conflict);
    return {
        actual: { ...persisted.actual },
        conflictId: persisted.conflictId,
        createdAt: new Date(persisted.createdAt),
        detectedAt: new Date(persisted.detectedAt),
        expected: { ...persisted.expected },
        idempotencyKey: persisted.idempotencyKey,
        invoiceId: persisted.invoiceId,
        provider: persisted.provider,
        providerInvoiceId: persisted.providerInvoiceId,
        reason: persisted.reason,
        requestFingerprint: persisted.requestFingerprint,
        resolution: persisted.resolution,
        resolvedAt: persisted.resolvedAt ? new Date(persisted.resolvedAt) : null,
        severity: persisted.severity,
        status: persisted.status,
        tenantId: persisted.tenantId,
        traceId: persisted.traceId,
        updatedAt: new Date(persisted.updatedAt)
    };
}
function toPrismaBillingSyncJobCreateInput(job) {
    return {
        actor: job.actor,
        actorName: job.actorName,
        attempts: job.attempts,
        auditEventId: job.auditEventId,
        createdAt: new Date(job.createdAt),
        deadLetteredAt: job.deadLetteredAt ? new Date(job.deadLetteredAt) : null,
        fromPlanId: job.fromPlanId,
        id: job.id,
        lastError: job.lastError,
        lockedAt: job.lockedAt ? new Date(job.lockedAt) : null,
        nextAttemptAt: job.nextAttemptAt ? new Date(job.nextAttemptAt) : null,
        payload: job.payload,
        publishedAt: job.publishedAt ? new Date(job.publishedAt) : null,
        queue: job.queue,
        reason: job.reason,
        status: job.status,
        tenantId: job.tenantId,
        toPlanId: job.toPlanId,
        traceId: job.traceId
    };
}
function toPrismaBillingQuotaLedgerEntryCreateInput(entry) {
    return {
        auditEvent: entry.auditEvent ? { ...entry.auditEvent } : null,
        createdAt: new Date(entry.createdAt),
        decision: entry.decision,
        id: entry.id,
        idempotencyKey: entry.idempotencyKey,
        limit: entry.limit,
        mode: entry.mode,
        planId: entry.planId,
        projected: entry.projected,
        reason: entry.reason,
        remainingAfter: entry.remainingAfter,
        remainingBefore: entry.remainingBefore,
        requested: entry.requested,
        requestFingerprint: entry.requestFingerprint,
        resource: entry.resource,
        tenantId: entry.tenantId,
        traceId: entry.traceId,
        used: entry.used
    };
}
function clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
function billingTenantStatusFromRow(status) {
    return status === "active" || status === "trial" || status === "watch" || status === "restricted" ? status : "restricted";
}
function billingPeriodFromRow(period) {
    return period === "annual" ? "annual" : "monthly";
}
function billingSubscriptionStatusFromRow(status) {
    return status === "active" || status === "trialing" || status === "past_due" || status === "canceled" || status === "paused" ? status : "past_due";
}
function billingInvoiceStatusFromRow(status) {
    return status === "draft" || status === "open" || status === "paid" || status === "past_due" || status === "void" || status === "uncollectible" ? status : "open";
}
function billingInvoicePaymentStatusFromRow(status) {
    return status === "pending" || status === "succeeded" || status === "failed" || status === "refunded" || status === "none" ? status : "pending";
}
function billingProviderSyncStatusFromRow(status) {
    return status === "accepted" || status === "duplicate" || status === "failed" ? status : "accepted";
}
function billingSyncJobStatusFromRow(status) {
    return status === "dead_lettered" || status === "published" || status === "failed" || status === "pending" || status === "publishing" ? status : "pending";
}
function billingApprovalStatusFromRow(status) {
    return status === "approved" || status === "expired" || status === "pending" || status === "rejected" ? status : "pending";
}
function billingApprovalSubjectTypeFromRow(subjectType) {
    return subjectType === "payment_action" || subjectType === "tariff_change" ? subjectType : "tariff_change";
}
function billingLegalEntityStatusFromRow(status) {
    return status === "active" || status === "archived" || status === "pending_review" ? status : "pending_review";
}
function billingTaxDocumentStatusFromRow(status) {
    return status === "approved" || status === "archived" || status === "pending_review" || status === "rejected" ? status : "pending_review";
}
function billingTaxDocumentTypeFromRow(documentType) {
    return documentType === "bank_statement" || documentType === "tax_residency_certificate" || documentType === "vat_certificate"
        ? documentType
        : "vat_certificate";
}
function billingPaymentRetryScheduleStatusFromRow(status) {
    return status === "canceled" || status === "exhausted" || status === "paid" || status === "scheduled" ? status : "scheduled";
}
function billingPaymentRetryKeyStatusFromRow(status) {
    return status === "claimed" || status === "failed" || status === "succeeded" ? status : "claimed";
}
function billingPaymentDunningStatusFromRow(status) {
    return status === "active" || status === "canceled" || status === "paid" || status === "paused" ? status : "active";
}
function billingPaymentDunningStageFromRow(stage) {
    return stage === "final_notice" || stage === "grace" || stage === "initial" ? stage : "initial";
}
function billingReconciliationConflictSeverityFromRow(severity) {
    return severity === "high" || severity === "low" || severity === "medium" ? severity : "medium";
}
function billingReconciliationConflictStatusFromRow(status) {
    return status === "ignored" || status === "open" || status === "resolved" ? status : "open";
}
function quotaLedgerDecisionFromRow(decision) {
    return decision === "allow" || decision === "deny" ? decision : "deny";
}
function quotaReservationStatusFromRow(status) {
    return status === "reserved" || status === "committed" || status === "released" || status === "expired" ? status : "reserved";
}
function numberFromRow(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function toJsonRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}
function toOptionalBillingAuditEvent(value) {
    const record = toJsonRecord(value);
    if (typeof record.id !== "string" || typeof record.action !== "string" || record.immutable !== true) {
        return undefined;
    }
    return record;
}
function toBillingAuditEvents(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        const event = toOptionalBillingAuditEvent(item);
        return event ? [event] : [];
    });
}
function toBillingProviderSyncAuditEvent(value) {
    const record = toJsonRecord(value);
    if (typeof record.id !== "string" || typeof record.action !== "string" || record.immutable !== true) {
        return undefined;
    }
    return record;
}
function toBillingProviderSyncAuditEvents(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        const event = toBillingProviderSyncAuditEvent(item);
        return event ? [event] : [];
    });
}
function toBillingApprovalDecisionAuditEvent(value) {
    const record = toJsonRecord(value);
    if (record.action !== "billing.approval.decided"
        || typeof record.approvalId !== "string"
        || typeof record.at !== "string"
        || typeof record.decidedBy !== "string"
        || typeof record.decidedByName !== "string"
        || typeof record.decisionReason !== "string"
        || record.immutable !== true
        || (record.result !== "approved" && record.result !== "rejected")
        || typeof record.subjectId !== "string"
        || (record.subjectType !== "payment_action" && record.subjectType !== "tariff_change")
        || typeof record.tenantId !== "string"
        || typeof record.traceId !== "string") {
        return undefined;
    }
    return {
        ...record,
        decisionReason: redactSensitiveText(record.decisionReason)
    };
}
function toBillingApprovalDecisionAuditEvents(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        const event = toBillingApprovalDecisionAuditEvent(item);
        return event ? [event] : [];
    });
}
function appendBillingApprovalDecisionAuditEvent(approval, decision, decidedAt) {
    return [
        ...(approval.auditEvents ?? []),
        {
            action: "billing.approval.decided",
            approvalId: approval.approvalId,
            at: decidedAt,
            decidedBy: String(decision.decidedBy ?? "").trim(),
            decidedByName: String(decision.decidedByName ?? "").trim(),
            decisionReason: redactSensitiveText(String(decision.decisionReason ?? "").trim()),
            immutable: true,
            result: decision.status,
            subjectId: approval.subjectId,
            subjectType: approval.subjectType,
            tenantId: approval.tenantId,
            traceId: String(decision.traceId ?? "").trim()
        }
    ];
}
function toBillingLegalEntityAuditEvent(value) {
    const record = toJsonRecord(value);
    if (record.action !== "billing.legal_entity.saved"
        || typeof record.at !== "string"
        || record.immutable !== true
        || typeof record.legalEntityId !== "string"
        || typeof record.legalName !== "string"
        || typeof record.registrationNumber !== "string"
        || (record.result !== "active" && record.result !== "archived" && record.result !== "pending_review")
        || typeof record.tenantId !== "string"
        || typeof record.traceId !== "string") {
        return undefined;
    }
    return {
        ...record,
        legalName: redactSensitiveText(record.legalName)
    };
}
function toBillingLegalEntityAuditEvents(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        const event = toBillingLegalEntityAuditEvent(item);
        return event ? [event] : [];
    });
}
function withBillingLegalEntitySavedAuditEvent(entity) {
    if ((entity.auditEvents ?? []).length > 0) {
        return entity;
    }
    return {
        ...entity,
        auditEvents: [{
                action: "billing.legal_entity.saved",
                at: entity.createdAt,
                immutable: true,
                legalEntityId: entity.legalEntityId,
                legalName: entity.legalName,
                registrationNumber: entity.registrationNumber,
                result: entity.status,
                tenantId: entity.tenantId,
                traceId: entity.traceId
            }]
    };
}
function toBillingTaxDocumentAuditEvent(value) {
    const record = toJsonRecord(value);
    if (record.action !== "billing.tax_document.saved"
        || typeof record.at !== "string"
        || typeof record.documentId !== "string"
        || (record.documentType !== "bank_statement" && record.documentType !== "tax_residency_certificate" && record.documentType !== "vat_certificate")
        || typeof record.fileName !== "string"
        || record.immutable !== true
        || typeof record.legalEntityId !== "string"
        || (record.result !== "approved" && record.result !== "archived" && record.result !== "pending_review" && record.result !== "rejected")
        || typeof record.tenantId !== "string"
        || typeof record.traceId !== "string"
        || typeof record.uploadedBy !== "string") {
        return undefined;
    }
    return {
        ...record,
        fileName: redactSensitiveText(record.fileName)
    };
}
function toBillingTaxDocumentAuditEvents(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        const event = toBillingTaxDocumentAuditEvent(item);
        return event ? [event] : [];
    });
}
function withBillingTaxDocumentSavedAuditEvent(document) {
    if ((document.auditEvents ?? []).length > 0) {
        return document;
    }
    return {
        ...document,
        auditEvents: [{
                action: "billing.tax_document.saved",
                at: document.createdAt,
                documentId: document.documentId,
                documentType: document.documentType,
                fileName: document.fileName,
                immutable: true,
                legalEntityId: document.legalEntityId,
                result: document.status,
                tenantId: document.tenantId,
                traceId: document.traceId,
                uploadedBy: document.uploadedBy
            }]
    };
}
function appendBillingAuditEvent(events, event) {
    return event ? [...events, event] : events;
}
function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function toDate(value) {
    return value instanceof Date ? value : new Date(value);
}
function compareQuotaReservationClaimOrder(left, right) {
    return left.expiresAt.localeCompare(right.expiresAt)
        || left.createdAt.localeCompare(right.createdAt)
        || compareNullableIsoFirst(left.lockedAt, right.lockedAt)
        || left.id.localeCompare(right.id);
}
function compareNullableIsoFirst(left, right) {
    if (!left && !right)
        return 0;
    if (!left)
        return -1;
    if (!right)
        return 1;
    return left.localeCompare(right);
}
function isExpiredQuotaReservationReleaseReplay(reservation, input) {
    return reservation.status === "released" && reservation.releaseIdempotencyKey === input.idempotencyKey;
}
function isExpiredQuotaReservationReleaseCandidate(reservation, input) {
    return reservation.status === "reserved"
        && reservation.lockedAt === input.lockedAt
        && Date.parse(reservation.expiresAt) <= Date.parse(input.releasedAt);
}
function applyExpiredQuotaReservationRelease(reservation, input) {
    return {
        ...reservation,
        ...(input.auditEvent ? { auditEvent: input.auditEvent } : {}),
        auditEvents: appendBillingAuditEvent(reservation.auditEvents ?? (reservation.auditEvent ? [reservation.auditEvent] : []), input.auditEvent),
        lockedAt: null,
        releaseIdempotencyKey: input.idempotencyKey,
        releasedAt: input.releasedAt,
        status: "released",
        traceId: input.traceId,
        updatedAt: input.releasedAt
    };
}
function upsertSubscriptionByProviderId(items, next) {
    return [
        next,
        ...items.filter((item) => item.provider !== next.provider || item.providerSubscriptionId !== next.providerSubscriptionId)
    ];
}
function upsertInvoiceByProviderId(items, next) {
    return [
        next,
        ...items.filter((item) => item.provider !== next.provider || item.providerInvoiceId !== next.providerInvoiceId)
    ];
}
function upsertPaymentRetrySchedule(items, next) {
    const existing = items.find((item) => (item.tenantId === next.tenantId && item.scheduleId === next.scheduleId)
        || item.idempotencyKey === next.idempotencyKey);
    return existing ? items : [next, ...items];
}
function upsertPaymentDunningState(items, next) {
    const existing = items.find((item) => (item.tenantId === next.tenantId && item.dunningId === next.dunningId)
        || item.idempotencyKey === next.idempotencyKey);
    return existing ? items : [next, ...items];
}
function upsertPaymentRetryKey(items, next) {
    const existing = items.find((item) => (item.tenantId === next.tenantId && item.retryKeyId === next.retryKeyId)
        || item.idempotencyKey === next.idempotencyKey);
    return existing ? items : [next, ...items];
}
function upsertReconciliationConflict(items, next) {
    const existing = items.find((item) => (item.tenantId === next.tenantId && item.conflictId === next.conflictId)
        || item.idempotencyKey === next.idempotencyKey);
    return existing ? items : [next, ...items];
}
function usageFromRow(value) {
    const usage = toJsonRecord(value);
    return {
        aiTokens: numberFromRow(usage.aiTokens, 0),
        botRuns: numberFromRow(usage.botRuns, 0),
        channels: numberFromRow(usage.channels, 0),
        operators: numberFromRow(usage.operators, 0),
        reportExports: numberFromRow(usage.reportExports, 0),
        storageGb: numberFromRow(usage.storageGb, 0),
        webhooks: numberFromRow(usage.webhooks, 0)
    };
}
function applyUsageDelta(usage, resource, requested) {
    const next = { ...usage };
    switch (resource) {
        case "ai":
            next.aiTokens += requested;
            break;
        case "bots":
            next.botRuns += requested;
            break;
        case "channels":
            next.channels += requested;
            break;
        case "operators":
            next.operators += requested;
            break;
        case "reports":
            next.reportExports += requested;
            break;
        case "storage":
            next.storageGb += requested;
            break;
        case "webhooks":
            next.webhooks += requested;
            break;
    }
    return next;
}
function applyQuotaDelta(tenant, resource, requested) {
    if (resource === "users") {
        return { ...tenant, users: tenant.users + requested };
    }
    if (resource === "workspaces") {
        return { ...tenant, workspaces: tenant.workspaces + requested };
    }
    return { ...tenant, usage: applyUsageDelta(tenant.usage, resource, requested) };
}
function quotaUsageValue(tenant, resource) {
    if (resource === "users") {
        return tenant.users;
    }
    if (resource === "workspaces") {
        return tenant.workspaces;
    }
    const usage = tenant.usage;
    switch (resource) {
        case "ai":
            return usage.aiTokens;
        case "bots":
            return usage.botRuns;
        case "channels":
            return usage.channels;
        case "operators":
            return usage.operators;
        case "reports":
            return usage.reportExports;
        case "storage":
            return usage.storageGb;
        case "webhooks":
            return usage.webhooks;
        default:
            return 0;
    }
}
export function createEmptyBillingState() {
    return {
        billingApprovals: [],
        billingLegalEntities: [],
        billingProviderSyncEvents: [],
        billingTaxDocuments: [],
        billingSyncJobs: [],
        invoices: [],
        paymentDunningStates: [],
        paymentRetryKeys: [],
        paymentRetrySchedules: [],
        quotaLedgerEntries: [],
        quotaReservations: [],
        reconciliationConflicts: [],
        subscriptions: [],
        tariffs: clone(billingTariffCatalog),
        tenants: []
    };
}
//# sourceMappingURL=billing.repository.js.map