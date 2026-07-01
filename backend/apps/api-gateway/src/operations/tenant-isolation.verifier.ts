export type TenantIsolationBoundary = "repository" | "api";
export type TenantIsolationExpectedTenantSource = "argument" | "context" | "record-owner";

export interface TenantOwnedMethodCatalogEntry {
  readonly boundary: TenantIsolationBoundary;
  readonly expectedTenantSource: TenantIsolationExpectedTenantSource;
  readonly id: string;
  readonly method: string;
  readonly service: "identity" | "conversation" | "workspace" | "billing" | "quality" | "routing";
}

export interface TenantIsolationCheck<Row extends object = Record<string, unknown>> {
  readonly expectedTenantId: string;
  readonly id: string;
  readonly loadRows: () => Promise<readonly Row[]> | readonly Row[];
  readonly recordId?: (row: Row) => string;
  readonly tenantId?: (row: Row) => string | null | undefined;
}

export interface TenantIsolationFailure {
  readonly checkId: string;
  readonly expectedTenantId: string;
  readonly leakedRecordIds: string[];
  readonly leakedTenantIds: string[];
}

export interface TenantIsolationVerificationReport {
  readonly checked: number;
  readonly failures: TenantIsolationFailure[];
  readonly status: "pass" | "fail";
}

type MaybePromise<T> = T | Promise<T>;

interface TenantScopedRow {
  readonly id?: unknown;
  readonly tenantId?: unknown;
}

export interface IdentityRepositoryTenantIsolationSource {
  findTenantAuditEvents(tenantId: string): MaybePromise<readonly TenantScopedRow[]>;
  findTenantUsers(tenantId: string): MaybePromise<readonly TenantScopedRow[]>;
  listPermissionDenialEvents(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
  listRbacRoleGrants(input?: { readonly tenantId?: string | null }): MaybePromise<readonly TenantScopedRow[]>;
}

export interface ConversationRepositoryTenantIsolationSource {
  listDeliveryReceipts(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
  listOutboundDescriptors(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
  listRealtimeEvents(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
}

export interface WorkspaceRepositoryTenantIsolationSource {
  findClientProfile(sourceProfileId: string, scope?: { readonly tenantId?: string }): MaybePromise<TenantScopedRow | undefined>;
  findFile(fileId: string, scope?: { readonly tenantId?: string }): MaybePromise<TenantScopedRow | undefined>;
  findFileScanResultIdempotency(key: string, scope?: { readonly tenantId?: string }): MaybePromise<TenantScopedRow | undefined>;
  findTemplate(templateId: string, scope?: { readonly tenantId?: string }): MaybePromise<TenantScopedRow | undefined>;
  listClientMergeConflicts(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
  listClientMergeEvents(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
  listTemplates(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
}

export interface WorkspaceRepositoryTenantIsolationInput {
  readonly fileId: string;
  readonly idempotencyKey: string;
  readonly sourceProfileId: string;
  readonly templateId: string;
  readonly tenantId: string;
}

export interface BillingRepositoryTenantIsolationSource {
  findTenant(tenantId: string): MaybePromise<TenantScopedRow | undefined>;
  findTenantSubscription(tenantId: string): MaybePromise<TenantScopedRow | undefined>;
  listTenantInvoices(tenantId: string): MaybePromise<readonly TenantScopedRow[]>;
  listQuotaLedgerEntries(tenantId?: string): MaybePromise<readonly TenantScopedRow[]>;
  listQuotaReservations(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
}

export interface RoutingRepositoryTenantIsolationSource {
  listOperatorCapacities(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
  listQueueMemberships(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
  listRoutingRules(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
}

export interface QualityRepositoryTenantIsolationSource {
  listAiScoringAudits(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
  listManualQaReviews(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
  listQualityRatings(input?: { readonly tenantId?: string }): MaybePromise<readonly TenantScopedRow[]>;
}

const TENANT_OWNED_REPOSITORY_METHOD_CATALOG: TenantOwnedMethodCatalogEntry[] = [
  catalogEntry("billing", "findTenant", "argument"),
  catalogEntry("billing", "findTenantSubscription", "argument"),
  catalogEntry("billing", "listQuotaLedgerEntries", "argument"),
  catalogEntry("billing", "listQuotaReservations", "argument"),
  catalogEntry("billing", "listTenantInvoices", "argument"),
  catalogEntry("conversation", "listDeliveryReceipts", "argument"),
  catalogEntry("conversation", "listOutboundDescriptors", "record-owner"),
  catalogEntry("conversation", "listRealtimeEvents", "record-owner"),
  catalogEntry("identity", "findTenantAuditEvents", "argument"),
  catalogEntry("identity", "findTenantUsers", "argument"),
  catalogEntry("identity", "listPermissionDenialEvents", "argument"),
  catalogEntry("identity", "listRbacRoleGrants", "argument"),
  catalogEntry("quality", "listAiScoringAudits", "argument"),
  catalogEntry("quality", "listManualQaReviews", "argument"),
  catalogEntry("quality", "listQualityRatings", "argument"),
  catalogEntry("routing", "listOperatorCapacities", "argument"),
  catalogEntry("routing", "listQueueMemberships", "argument"),
  catalogEntry("routing", "listRoutingRules", "argument"),
  catalogEntry("workspace", "findClientProfile", "record-owner"),
  catalogEntry("workspace", "findFile", "record-owner"),
  catalogEntry("workspace", "findFileScanResultIdempotency", "record-owner"),
  catalogEntry("workspace", "findTemplate", "record-owner"),
  catalogEntry("workspace", "listClientMergeConflicts", "argument"),
  catalogEntry("workspace", "listClientMergeEvents", "argument"),
  catalogEntry("workspace", "listTemplates", "argument")
].sort((left, right) => left.id.localeCompare(right.id));

export function listTenantOwnedRepositoryMethodCatalog(filters: {
  readonly service?: TenantOwnedMethodCatalogEntry["service"];
} = {}): TenantOwnedMethodCatalogEntry[] {
  return TENANT_OWNED_REPOSITORY_METHOD_CATALOG
    .filter((entry) => !filters.service || entry.service === filters.service)
    .map((entry) => ({ ...entry }));
}

export function createIdentityRepositoryTenantIsolationChecks(
  repository: IdentityRepositoryTenantIsolationSource,
  tenantId: string
): TenantIsolationCheck<TenantScopedRow>[] {
  return [
    {
      expectedTenantId: tenantId,
      id: "identity.findTenantAuditEvents",
      loadRows: () => repository.findTenantAuditEvents(tenantId),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "identity.findTenantUsers",
      loadRows: () => repository.findTenantUsers(tenantId),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "identity.listPermissionDenialEvents",
      loadRows: () => repository.listPermissionDenialEvents({ tenantId }),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "identity.listRbacRoleGrants",
      loadRows: () => repository.listRbacRoleGrants({ tenantId }),
      recordId: tenantScopedRecordId
    }
  ];
}

export function createConversationRepositoryTenantIsolationChecks(
  repository: ConversationRepositoryTenantIsolationSource,
  tenantId: string
): TenantIsolationCheck<TenantScopedRow>[] {
  return [
    {
      expectedTenantId: tenantId,
      id: "conversation.listDeliveryReceipts",
      loadRows: () => repository.listDeliveryReceipts({ tenantId }),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "conversation.listOutboundDescriptors",
      loadRows: () => repository.listOutboundDescriptors({ tenantId }),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "conversation.listRealtimeEvents",
      loadRows: () => repository.listRealtimeEvents({ tenantId }),
      recordId: (row) => {
        const eventId = (row as { readonly eventId?: unknown }).eventId;
        return typeof eventId === "string" && eventId.length > 0 ? eventId : tenantScopedRecordId(row);
      }
    }
  ];
}

export function createWorkspaceRepositoryTenantIsolationChecks(
  repository: WorkspaceRepositoryTenantIsolationSource,
  input: WorkspaceRepositoryTenantIsolationInput
): TenantIsolationCheck<TenantScopedRow>[] {
  return [
    {
      expectedTenantId: input.tenantId,
      id: "workspace.findFile",
      loadRows: async () => maybeRow(await repository.findFile(input.fileId, { tenantId: input.tenantId })),
      recordId: (row) => {
        const fileId = (row as { readonly fileId?: unknown }).fileId;
        return typeof fileId === "string" && fileId.length > 0 ? fileId : tenantScopedRecordId(row);
      }
    },
    {
      expectedTenantId: input.tenantId,
      id: "workspace.findClientProfile",
      loadRows: async () => maybeRow(await repository.findClientProfile(input.sourceProfileId, { tenantId: input.tenantId })),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: input.tenantId,
      id: "workspace.listClientMergeEvents",
      loadRows: () => repository.listClientMergeEvents({ tenantId: input.tenantId }),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: input.tenantId,
      id: "workspace.listClientMergeConflicts",
      loadRows: () => repository.listClientMergeConflicts({ tenantId: input.tenantId }),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: input.tenantId,
      id: "workspace.findTemplate",
      loadRows: async () => maybeRow(await repository.findTemplate(input.templateId, { tenantId: input.tenantId })),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: input.tenantId,
      id: "workspace.listTemplates",
      loadRows: () => repository.listTemplates({ tenantId: input.tenantId }),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: input.tenantId,
      id: "workspace.findFileScanResultIdempotency",
      loadRows: async () => maybeRow(await repository.findFileScanResultIdempotency(input.idempotencyKey, { tenantId: input.tenantId })),
      recordId: (row) => {
        const key = (row as { readonly key?: unknown }).key;
        return typeof key === "string" && key.length > 0 ? key : tenantScopedRecordId(row);
      }
    }
  ];
}

export function createBillingRepositoryTenantIsolationChecks(
  repository: BillingRepositoryTenantIsolationSource,
  tenantId: string
): TenantIsolationCheck<TenantScopedRow>[] {
  return [
    {
      expectedTenantId: tenantId,
      id: "billing.findTenant",
      loadRows: async () => maybeRow(normalizeTenantRow(await repository.findTenant(tenantId))),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "billing.findTenantSubscription",
      loadRows: async () => maybeRow(await repository.findTenantSubscription(tenantId)),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "billing.listTenantInvoices",
      loadRows: () => repository.listTenantInvoices(tenantId),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "billing.listQuotaLedgerEntries",
      loadRows: () => repository.listQuotaLedgerEntries(tenantId),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "billing.listQuotaReservations",
      loadRows: () => repository.listQuotaReservations({ tenantId }),
      recordId: tenantScopedRecordId
    }
  ];
}

export function createRoutingRepositoryTenantIsolationChecks(
  repository: RoutingRepositoryTenantIsolationSource,
  tenantId: string
): TenantIsolationCheck<TenantScopedRow>[] {
  return [
    {
      expectedTenantId: tenantId,
      id: "routing.listRoutingRules",
      loadRows: () => repository.listRoutingRules({ tenantId }),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "routing.listQueueMemberships",
      loadRows: () => repository.listQueueMemberships({ tenantId }),
      recordId: tenantScopedRecordId
    },
    {
      expectedTenantId: tenantId,
      id: "routing.listOperatorCapacities",
      loadRows: () => repository.listOperatorCapacities({ tenantId }),
      recordId: tenantScopedRecordId
    }
  ];
}

export function createQualityRepositoryTenantIsolationChecks(
  repository: QualityRepositoryTenantIsolationSource,
  tenantId: string
): TenantIsolationCheck<TenantScopedRow>[] {
  const checks: TenantIsolationCheck<TenantScopedRow>[] = [
    {
      expectedTenantId: tenantId,
      id: "quality.listQualityRatings",
      loadRows: () => repository.listQualityRatings({ tenantId }),
      recordId: (row) => {
        const ratingId = (row as { readonly ratingId?: unknown }).ratingId;
        return typeof ratingId === "string" && ratingId.length > 0 ? ratingId : tenantScopedRecordId(row);
      }
    }
  ];

  checks.push({
    expectedTenantId: tenantId,
    id: "quality.listAiScoringAudits",
    loadRows: () => repository.listAiScoringAudits({ tenantId }),
    recordId: (row) => {
      const auditId = (row as { readonly auditId?: unknown }).auditId;
      return typeof auditId === "string" && auditId.length > 0 ? auditId : tenantScopedRecordId(row);
    }
  });

  checks.push({
    expectedTenantId: tenantId,
    id: "quality.listManualQaReviews",
    loadRows: () => repository.listManualQaReviews({ tenantId }),
    recordId: (row) => {
      const reviewId = (row as { readonly reviewId?: unknown }).reviewId;
      return typeof reviewId === "string" && reviewId.length > 0 ? reviewId : tenantScopedRecordId(row);
    }
  });

  return checks.sort((left, right) => left.id.localeCompare(right.id));
}

export async function verifyTenantIsolationChecks<Row extends object = Record<string, unknown>>(
  checks: readonly TenantIsolationCheck<Row>[]
): Promise<TenantIsolationVerificationReport> {
  const failures: TenantIsolationFailure[] = [];

  if (checks.length === 0) {
    return {
      checked: 0,
      failures: [{
        checkId: "__tenant_isolation_checks__",
        expectedTenantId: "(configured)",
        leakedRecordIds: ["missing-checks"],
        leakedTenantIds: ["(not-run)"]
      }],
      status: "fail"
    };
  }

  for (const check of checks) {
    const rows = await check.loadRows();
    const leakedRows = rows
      .map((row, index) => ({
        id: resolveRecordId(row, index, check.recordId),
        tenantId: resolveTenantId(row, check.tenantId)
      }))
      .filter((row) => row.tenantId !== check.expectedTenantId);

    if (leakedRows.length > 0) {
      failures.push({
        checkId: check.id,
        expectedTenantId: check.expectedTenantId,
        leakedRecordIds: leakedRows.map((row) => row.id),
        leakedTenantIds: [...new Set(leakedRows.map((row) => row.tenantId ?? "(missing)"))]
      });
    }
  }

  return {
    checked: checks.length,
    failures,
    status: failures.length === 0 ? "pass" : "fail"
  };
}

function tenantScopedRecordId(row: TenantScopedRow): string {
  return typeof row.id === "string" && row.id.length > 0 ? row.id : "unknown";
}

function maybeRow<Row extends object>(row: Row | undefined): readonly Row[] {
  return row ? [row] : [];
}

function normalizeTenantRow(row: TenantScopedRow | undefined): TenantScopedRow | undefined {
  if (!row || row.tenantId !== undefined) {
    return row;
  }

  const id = typeof row.id === "string" ? row.id : undefined;
  return id ? { ...row, tenantId: id } : row;
}

function catalogEntry(
  service: TenantOwnedMethodCatalogEntry["service"],
  method: string,
  expectedTenantSource: TenantIsolationExpectedTenantSource
): TenantOwnedMethodCatalogEntry {
  return {
    boundary: "repository",
    expectedTenantSource,
    id: `${service}.${method}`,
    method,
    service
  };
}

function resolveRecordId<Row extends object>(
  row: Row,
  index: number,
  selector: TenantIsolationCheck<Row>["recordId"]
): string {
  if (selector) {
    return selector(row);
  }

  for (const field of ["id", "receiptId", "eventId", "fileId", "reservationId", "invoiceId", "entryId"]) {
    const value = (row as Record<string, unknown>)[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return `row-${index}`;
}

function resolveTenantId<Row extends object>(
  row: Row,
  selector: TenantIsolationCheck<Row>["tenantId"]
): string | null | undefined {
  if (selector) {
    return selector(row);
  }

  const value = (row as { readonly tenantId?: unknown }).tenantId;
  return typeof value === "string" ? value : undefined;
}
