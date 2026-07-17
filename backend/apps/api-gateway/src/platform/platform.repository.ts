import { createHash } from "node:crypto";
import { type DurableStore, InMemoryStore } from "@support-communication/database";
import type { FeatureFlag, PlatformComponent, PlatformIncident, PlatformMetric, PlatformTenant } from "./platform.types.js";
import type {
  PlatformFeatureFlagRule,
  PlatformFeatureFlagRuleFilters
} from "../feature-flags/feature-flag-rollout.engine.js";

export interface PlatformIncidentIdempotencyRecord {
  fingerprint: string;
  key: string;
  result: Record<string, unknown>;
}

export interface PlatformAlertAcknowledgement {
  acknowledgedAt: string;
  auditEvent: Record<string, unknown>;
  componentId: string;
  idempotencyKey?: string;
  reason: string | null;
  statusPageSync: Record<string, unknown>;
}

export interface PlatformFeatureFlagOutbox {
  id: string;
  queue: string;
  target: string;
}

export interface PlatformTelemetrySample {
  componentId: string;
  id: string;
  metricKey: string;
  sampledAt: string;
  source: string;
  tags: Record<string, unknown>;
  tenantId: string | null;
  unit: string;
  value: number;
}

export interface PlatformTelemetrySampleFilters {
  componentId?: string;
  metricKey?: string;
  since?: string;
  tenantId?: string | null;
  until?: string;
}

export interface PlatformHealthRollup {
  availability: number;
  componentId: string;
  errorRate: number;
  generatedAt: string;
  id: string;
  incidentIds: string[];
  latencyP95Ms: number;
  sampleCount: number;
  status: string;
  windowEnd: string;
  windowStart: string;
}

export interface PlatformHealthRollupFilters {
  componentId?: string;
  since?: string;
  status?: string;
  until?: string;
}

export interface PlatformAlertRoutingRuleDestination {
  channel: string;
  target: string;
}

export interface PlatformAlertRoutingRule {
  componentIds: string[];
  createdAt: string;
  destination: PlatformAlertRoutingRuleDestination;
  enabled: boolean;
  id: string;
  severities: string[];
  statuses: string[];
  updatedAt: string;
}

export interface PlatformAlertRoutingRuleFilters {
  componentId?: string;
  destinationChannel?: string;
  enabled?: boolean;
  severity?: string;
  status?: string;
}

export interface PlatformIncidentCommunicationAttempt {
  attemptId: string;
  attemptedAt: string;
  descriptorId: string;
  idempotencyKey: string;
  incidentId: string;
  port: "internal-notification" | "status-page";
  requestFingerprint: string;
  status: "dead_lettered" | "publishing" | "queued" | "retry_scheduled" | "succeeded";
  traceId: string;
  visibility: "customer-visible" | "internal-only";
}

export interface PlatformIncidentCommunicationAttemptFilters {
  incidentId?: string;
  visibility?: PlatformIncidentCommunicationAttempt["visibility"];
}

export interface PlatformIncidentCommunicationRetry {
  attemptId: string;
  attempts: number;
  failedAt: string;
  incidentId: string;
  lastError: string;
  nextAttemptAt: string;
  status: "retry_scheduled";
}

export interface PlatformIncidentCommunicationRetryFilters {
  attemptId?: string;
  incidentId?: string;
}

export interface PlatformIncidentCommunicationDeadLetter {
  attemptId: string;
  attempts: number;
  deadLetteredAt: string;
  failedAt: string;
  incidentId: string;
  lastError: string;
  status: "dead_lettered";
}

export interface PlatformIncidentCommunicationDeadLetterFilters {
  attemptId?: string;
  incidentId?: string;
}

export type PlatformMutationKind = "alert" | "incident" | "rollout";

export interface PlatformAuditRow {
  action: string;
  actor: string;
  actorName: string;
  createdAt: string;
  fingerprint: string;
  id: string;
  idempotencyKey: string;
  immutable: boolean;
  mutationKind: PlatformMutationKind;
  payload: Record<string, unknown>;
  reason: string;
  result: string;
  target: string;
  traceId: string;
}

export interface PlatformAuditRowFilters {
  idempotencyKey?: string;
  mutationKind?: PlatformMutationKind;
  target?: string;
}

export interface PlatformOutboxRow {
  aggregateId: string;
  aggregateType: string;
  createdAt: string;
  fingerprint: string;
  id: string;
  idempotencyKey: string;
  mutationKind: PlatformMutationKind;
  payload: Record<string, unknown>;
  queue: string;
  status: string;
  target: string;
  traceId: string;
  type: string;
}

export interface PlatformOutboxRowFilters {
  mutationKind?: PlatformMutationKind;
}

export interface PlatformAuditOutboxRepository {
  findPlatformAuditRow(idempotencyKey: string): PlatformAuditRow | undefined;
  findPlatformOutboxRow(idempotencyKey: string): PlatformOutboxRow | undefined;
  listPlatformAuditRows(filters?: PlatformAuditRowFilters): PlatformAuditRow[];
  listPlatformOutboxRows(filters?: PlatformOutboxRowFilters): PlatformOutboxRow[];
  savePlatformAuditRow(row: PlatformAuditRow): PlatformAuditRow;
  savePlatformOutboxRow(row: PlatformOutboxRow): PlatformOutboxRow;
  updatePlatformOutboxRowStatus(
    idempotencyKey: string,
    status: string,
    payloadPatch?: Record<string, unknown>
  ): PlatformOutboxRow;
}

export interface PlatformState {
  alertAcknowledgements: PlatformAlertAcknowledgement[];
  alertRoutingRules: PlatformAlertRoutingRule[];
  components: PlatformComponent[];
  featureFlagOutbox: PlatformFeatureFlagOutbox[];
  featureFlagRules: PlatformFeatureFlagRule[];
  featureFlags: FeatureFlag[];
  healthRollups: PlatformHealthRollup[];
  incidentCommunicationAttempts: PlatformIncidentCommunicationAttempt[];
  incidentCommunicationDeadLetters: PlatformIncidentCommunicationDeadLetter[];
  incidentCommunicationRetries: PlatformIncidentCommunicationRetry[];
  incidentIdempotencyKeys: PlatformIncidentIdempotencyRecord[];
  incidentPostmortems: Array<Record<string, unknown>>;
  incidents: PlatformIncident[];
  maintenanceWindows: Array<Record<string, unknown>>;
  platformAuditRows: PlatformAuditRow[];
  platformOutboxRows: PlatformOutboxRow[];
  platformTenants: PlatformTenant[];
  staticMetrics: PlatformMetric[];
  telemetrySamples: PlatformTelemetrySample[];
}

export interface PrismaPlatformClient {
  featureFlagRule: PrismaFeatureFlagRuleDelegate;
  platformAlertRoutingRule: PrismaPlatformAlertRoutingRuleDelegate;
  platformAuditRow: PrismaPlatformAuditRowDelegate;
  platformHealthRollup: PrismaPlatformHealthRollupDelegate;
  platformOutboxRow: PrismaPlatformOutboxRowDelegate;
  platformRuntimeRecord: PrismaPlatformRuntimeRecordDelegate;
  platformTelemetrySample: PrismaPlatformTelemetrySampleDelegate;
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $transaction?<T>(callback: (client: PrismaPlatformClient) => Promise<T>): Promise<T>;
}

interface PrismaPlatformRuntimeRecordDelegate {
  findMany(input?: PrismaPlatformRuntimeRecordFindManyInput): Promise<PrismaPlatformRuntimeRecordRow[]>;
  findUnique(input: PrismaPlatformRuntimeRecordFindUniqueInput): Promise<PrismaPlatformRuntimeRecordRow | null>;
  upsert(input: PrismaPlatformRuntimeRecordUpsertInput): Promise<PrismaPlatformRuntimeRecordRow>;
}

interface PrismaPlatformTelemetrySampleDelegate {
  findMany(input?: PrismaPlatformTelemetrySampleFindManyInput): Promise<PrismaPlatformTelemetrySampleRow[]>;
  upsert(input: PrismaPlatformTelemetrySampleUpsertInput): Promise<PrismaPlatformTelemetrySampleRow>;
}

interface PrismaPlatformHealthRollupDelegate {
  findMany(input?: PrismaPlatformHealthRollupFindManyInput): Promise<PrismaPlatformHealthRollupRow[]>;
  upsert(input: PrismaPlatformHealthRollupUpsertInput): Promise<PrismaPlatformHealthRollupRow>;
}

interface PrismaPlatformAlertRoutingRuleDelegate {
  findMany(input?: PrismaPlatformAlertRoutingRuleFindManyInput): Promise<PrismaPlatformAlertRoutingRuleRow[]>;
  upsert(input: PrismaPlatformAlertRoutingRuleUpsertInput): Promise<PrismaPlatformAlertRoutingRuleRow>;
}

interface PrismaFeatureFlagRuleDelegate {
  findMany(input?: PrismaFeatureFlagRuleFindManyInput): Promise<PrismaFeatureFlagRuleRow[]>;
  upsert(input: PrismaFeatureFlagRuleUpsertInput): Promise<PrismaFeatureFlagRuleRow>;
}

interface PrismaPlatformAuditRowDelegate {
  findMany(input?: PrismaPlatformAuditRowFindManyInput): Promise<PrismaPlatformAuditRowRow[]>;
  findUnique(input: { where: { id?: string; idempotencyKey?: string } }): Promise<PrismaPlatformAuditRowRow | null>;
  upsert(input: PrismaPlatformAuditRowUpsertInput): Promise<PrismaPlatformAuditRowRow>;
}

interface PrismaPlatformOutboxRowDelegate {
  findMany(input?: PrismaPlatformOutboxRowFindManyInput): Promise<PrismaPlatformOutboxRowRow[]>;
  findUnique(input: { where: { id?: string; idempotencyKey?: string } }): Promise<PrismaPlatformOutboxRowRow | null>;
  upsert(input: PrismaPlatformOutboxRowUpsertInput): Promise<PrismaPlatformOutboxRowRow>;
}

interface PrismaPlatformRuntimeRecordFindManyInput {
  orderBy?: { updatedAt: "desc" };
  where?: {
    collection?: string;
    entityKey?: string;
    filterKey?: string;
  };
}

interface PrismaPlatformRuntimeRecordFindUniqueInput {
  where: {
    collection_entityKey: {
      collection: string;
      entityKey: string;
    };
  };
}

interface PrismaPlatformRuntimeRecordUpsertInput extends PrismaPlatformRuntimeRecordFindUniqueInput {
  create: PrismaPlatformRuntimeRecordCreateInput;
  update: PrismaPlatformRuntimeRecordUpdateInput;
}

interface PrismaPlatformRuntimeRecordCreateInput {
  collection: string;
  createdAt: Date;
  entityKey: string;
  filterKey: string | null;
  id: string;
  record: unknown;
  updatedAt: Date;
}

type PrismaPlatformRuntimeRecordUpdateInput = Partial<Omit<PrismaPlatformRuntimeRecordCreateInput, "collection" | "createdAt" | "entityKey" | "id">>;

interface PrismaPlatformRuntimeRecordRow extends PrismaPlatformRuntimeRecordCreateInput {}

interface PrismaPlatformTelemetrySampleFindManyInput {
  orderBy?: { sampledAt: "desc" };
  where?: {
    componentId?: string;
    metricKey?: string;
    sampledAt?: { gte?: Date; lte?: Date };
    tenantId?: string | null;
  };
}

interface PrismaPlatformTelemetrySampleUpsertInput {
  create: PrismaPlatformTelemetrySampleCreateInput;
  update: PrismaPlatformTelemetrySampleUpdateInput;
  where: { id: string };
}

interface PrismaPlatformTelemetrySampleCreateInput {
  componentId: string;
  createdAt?: Date;
  id: string;
  metricKey: string;
  sampledAt: Date;
  source: string;
  tags: unknown;
  tenantId: string | null;
  unit: string;
  value: number;
}

type PrismaPlatformTelemetrySampleUpdateInput = Partial<Omit<PrismaPlatformTelemetrySampleCreateInput, "createdAt" | "id">>;

interface PrismaPlatformTelemetrySampleRow extends Omit<PrismaPlatformTelemetrySampleCreateInput, "createdAt" | "sampledAt"> {
  createdAt: Date | string;
  sampledAt: Date | string;
}

interface PrismaPlatformHealthRollupFindManyInput {
  orderBy?: { windowEnd: "desc" };
  where?: {
    componentId?: string;
    status?: string;
    windowEnd?: { gte?: Date; lte?: Date };
  };
}

interface PrismaPlatformHealthRollupUpsertInput {
  create: PrismaPlatformHealthRollupCreateInput;
  update: PrismaPlatformHealthRollupUpdateInput;
  where: { id: string };
}

interface PrismaPlatformHealthRollupCreateInput {
  availability: number;
  componentId: string;
  createdAt?: Date;
  errorRate: number;
  generatedAt: Date;
  id: string;
  incidentIds: unknown;
  latencyP95Ms: number;
  sampleCount: number;
  status: string;
  windowEnd: Date;
  windowStart: Date;
}

type PrismaPlatformHealthRollupUpdateInput = Partial<Omit<PrismaPlatformHealthRollupCreateInput, "createdAt" | "id">>;

interface PrismaPlatformHealthRollupRow extends Omit<PrismaPlatformHealthRollupCreateInput, "createdAt" | "generatedAt" | "windowEnd" | "windowStart"> {
  createdAt: Date | string;
  generatedAt: Date | string;
  windowEnd: Date | string;
  windowStart: Date | string;
}

interface PrismaPlatformAlertRoutingRuleFindManyInput {
  orderBy?: { updatedAt: "desc" };
  where?: {
    destinationChannel?: string;
    enabled?: boolean;
  };
}

interface PrismaPlatformAlertRoutingRuleUpsertInput {
  create: PrismaPlatformAlertRoutingRuleCreateInput;
  update: PrismaPlatformAlertRoutingRuleUpdateInput;
  where: { id: string };
}

interface PrismaPlatformAlertRoutingRuleCreateInput {
  componentIds: unknown;
  createdAt: Date;
  destinationChannel: string;
  destinationTarget: string;
  enabled: boolean;
  id: string;
  severities: unknown;
  statuses: unknown;
  updatedAt: Date;
}

type PrismaPlatformAlertRoutingRuleUpdateInput = Partial<Omit<PrismaPlatformAlertRoutingRuleCreateInput, "createdAt" | "id">>;

interface PrismaPlatformAlertRoutingRuleRow extends Omit<PrismaPlatformAlertRoutingRuleCreateInput, "createdAt" | "updatedAt"> {
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface PrismaFeatureFlagRuleFindManyInput {
  orderBy?: { updatedAt: "desc" };
  where?: {
    flagId?: string;
    flagKey?: string;
    targeting?: string;
  };
}

interface PrismaFeatureFlagRuleUpsertInput {
  create: PrismaFeatureFlagRuleCreateInput;
  update: PrismaFeatureFlagRuleUpdateInput;
  where: { id: string };
}

interface PrismaFeatureFlagRuleCreateInput {
  bucketSalt: string;
  createdAt: Date;
  enabledTenantIds: unknown;
  flagId: string;
  flagKey: string;
  id: string;
  rollout: number;
  segments: unknown;
  status: string;
  targeting: string;
  updatedAt: Date;
  variants: unknown;
}

type PrismaFeatureFlagRuleUpdateInput = Partial<Omit<PrismaFeatureFlagRuleCreateInput, "createdAt" | "id">>;

interface PrismaFeatureFlagRuleRow extends Omit<PrismaFeatureFlagRuleCreateInput, "createdAt" | "updatedAt"> {
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface PrismaPlatformAuditRowFindManyInput {
  orderBy?: { createdAt: "desc" };
  where?: {
    idempotencyKey?: string;
    mutationKind?: string;
    target?: string;
  };
}

interface PrismaPlatformAuditRowUpsertInput {
  create: PrismaPlatformAuditRowCreateInput;
  update: PrismaPlatformAuditRowUpdateInput;
  where: { idempotencyKey: string };
}

interface PrismaPlatformAuditRowCreateInput {
  action: string;
  actor: string;
  actorName: string;
  createdAt: Date;
  fingerprint: string;
  id: string;
  idempotencyKey: string;
  immutable: boolean;
  mutationKind: string;
  payload: unknown;
  reason: string;
  result: string;
  target: string;
  traceId: string;
}

type PrismaPlatformAuditRowUpdateInput = Partial<Omit<PrismaPlatformAuditRowCreateInput, "createdAt" | "id" | "idempotencyKey">>;

interface PrismaPlatformAuditRowRow extends Omit<PrismaPlatformAuditRowCreateInput, "createdAt"> {
  createdAt: Date | string;
}

interface PrismaPlatformOutboxRowFindManyInput {
  orderBy?: { createdAt: "desc" };
  where?: {
    mutationKind?: string;
  };
}

interface PrismaPlatformOutboxRowUpsertInput {
  create: PrismaPlatformOutboxRowCreateInput;
  update: PrismaPlatformOutboxRowUpdateInput;
  where: { idempotencyKey: string };
}

interface PrismaPlatformOutboxRowCreateInput {
  aggregateId: string;
  aggregateType: string;
  createdAt: Date;
  fingerprint: string;
  id: string;
  idempotencyKey: string;
  mutationKind: string;
  payload: unknown;
  queue: string;
  status: string;
  target: string;
  traceId: string;
  type: string;
}

type PrismaPlatformOutboxRowUpdateInput = Partial<Omit<PrismaPlatformOutboxRowCreateInput, "createdAt" | "id" | "idempotencyKey">>;

interface PrismaPlatformOutboxRowRow extends Omit<PrismaPlatformOutboxRowCreateInput, "createdAt"> {
  createdAt: Date | string;
}

type PlatformRuntimeCollection =
  | "alertAcknowledgements"
  | "featureFlagOutbox"
  | "featureFlags"
  | "incidentCommunicationAttempts"
  | "incidentCommunicationDeadLetters"
  | "incidentCommunicationRetries"
  | "incidentIdempotencyKeys"
  | "incidents";

let defaultRepository: PlatformRepository | null = null;
const inMemoryTransactionTails = new Map<string, Promise<void>>();

export class PlatformRepository implements PlatformAuditOutboxRepository {
  private constructor(
    private readonly store: DurableStore<PlatformState>,
    private readonly prismaClient?: PrismaPlatformClient
  ) {}

  static default(): PlatformRepository {
    if (defaultRepository) {
      return defaultRepository;
    }

    return PlatformRepository.inMemory();
  }

  static useDefault(repository: PlatformRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed?: PlatformState): PlatformRepository {
    return new PlatformRepository(new InMemoryStore(seed ?? seedPlatformState()));
  }

  static prisma({ client, seed }: { client: PrismaPlatformClient; seed?: PlatformState }): PlatformRepository {
    assertCompletePrismaPlatformClient(client);
    return new PlatformRepository(new InMemoryStore(seed ?? seedPlatformState()), client);
  }

  async runInTransaction<T>(
    lockKey: string,
    operation: (repository: PlatformRepository) => Promise<T>
  ): Promise<T> {
    const normalizedLockKey = lockKey.trim();
    if (!normalizedLockKey) {
      throw new TypeError("platform_transaction_lock_key_required");
    }

    if (!this.prismaClient) {
      return withInMemoryTransactionLock(normalizedLockKey, async () => {
        const transactionRepository = PlatformRepository.inMemory(this.readState());
        const result = await operation(transactionRepository);
        const nextState = transactionRepository.readState();
        this.store.update(() => nextState);
        return result;
      });
    }

    if (!this.prismaClient.$transaction) {
      throw new Error("prisma_platform_transaction_required");
    }
    return this.prismaClient.$transaction(async (transaction) => {
      if (!transaction.$queryRawUnsafe) {
        throw new Error("platform_advisory_lock_unavailable");
      }
      // ::text — pg_advisory_xact_lock возвращает void, который Prisma-клиент
      // не десериализует (Failed to deserialize column of type 'void').
      await transaction.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text",
        normalizedLockKey
      );
      return operation(new PlatformRepository(this.store, transaction));
    });
  }

  readState(): PlatformState {
    if (this.prismaClient) {
      throw new Error("prisma_platform_async_required");
    }

    return normalizeState(this.store.read());
  }

  async readStateAsync(): Promise<PlatformState> {
    if (!this.prismaClient) {
      return this.readState();
    }

    const seed = normalizeState(this.store.read());
    const state = clone(seed);
    const [
      runtimeRows,
      telemetryRows,
      healthRows,
      alertRoutingRows,
      featureFlagRuleRows,
      auditRows,
      outboxRows
    ] = await Promise.all([
      this.prismaClient.platformRuntimeRecord.findMany({ orderBy: { updatedAt: "desc" } }),
      this.prismaClient.platformTelemetrySample.findMany({ orderBy: { sampledAt: "desc" } }),
      this.prismaClient.platformHealthRollup.findMany({ orderBy: { windowEnd: "desc" } }),
      this.prismaClient.platformAlertRoutingRule.findMany({ orderBy: { updatedAt: "desc" } }),
      this.prismaClient.featureFlagRule.findMany({ orderBy: { updatedAt: "desc" } }),
      this.prismaClient.platformAuditRow.findMany({ orderBy: { createdAt: "desc" } }),
      this.prismaClient.platformOutboxRow.findMany({ orderBy: { createdAt: "desc" } })
    ]);

    state.alertAcknowledgements = [];
    state.featureFlagOutbox = [];
    state.featureFlags = [];
    state.incidentCommunicationAttempts = [];
    state.incidentCommunicationDeadLetters = [];
    state.incidentCommunicationRetries = [];
    state.incidentIdempotencyKeys = [];
    state.incidents = [];

    for (const row of runtimeRows) {
      appendRuntimeRecord(state, row.collection, row.record);
    }

    state.telemetrySamples = telemetryRows.map(toTelemetrySample);
    state.healthRollups = healthRows.map(toHealthRollup);
    state.alertRoutingRules = alertRoutingRows.map(toAlertRoutingRule);
    state.featureFlagRules = featureFlagRuleRows.map(toFeatureFlagRule);
    state.platformAuditRows = auditRows.map(toPlatformAuditRow);
    state.platformOutboxRows = outboxRows.map(toPlatformOutboxRow);
    state.incidents = overlayById(seed.incidents, state.incidents);
    state.featureFlags = overlayById(seed.featureFlags, state.featureFlags);

    return normalizeState(state);
  }

  listIncidents(): PlatformIncident[] {
    return clone(this.readState().incidents);
  }

  async listIncidentsAsync(): Promise<PlatformIncident[]> {
    if (!this.prismaClient) {
      return this.listIncidents();
    }

    return overlayById(this.readCatalogState().incidents, await this.listRuntimeRecords<PlatformIncident>("incidents"));
  }

  listPlatformTenants(): PlatformTenant[] {
    return clone(this.readCatalogState().platformTenants);
  }

  async listPlatformTenantsAsync(): Promise<PlatformTenant[]> {
    return this.listPlatformTenants();
  }

  listStaticMetrics(): PlatformMetric[] {
    return clone(this.readCatalogState().staticMetrics);
  }

  async listStaticMetricsAsync(): Promise<PlatformMetric[]> {
    return this.listStaticMetrics();
  }

  listComponents(): PlatformComponent[] {
    return clone(this.readCatalogState().components);
  }

  async listComponentsAsync(): Promise<PlatformComponent[]> {
    return this.listComponents();
  }

  saveIncident(incident: PlatformIncident): PlatformIncident {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(incident);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.incidents.some((item) => item.id === persisted.id);

      return {
        ...current,
        incidents: exists
          ? current.incidents.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.incidents]
      };
    });

    return clone(persisted);
  }

  async saveIncidentAsync(incident: PlatformIncident): Promise<PlatformIncident> {
    return this.saveRuntimeRecord("incidents", incident.id, incident, incident.componentId);
  }

  findIncidentIdempotencyKey(key: string): PlatformIncidentIdempotencyRecord | undefined {
    this.assertSyncRuntimeAvailable();
    return clone(this.readState().incidentIdempotencyKeys.find((item) => item.key === key));
  }

  async findIncidentIdempotencyKeyAsync(key: string): Promise<PlatformIncidentIdempotencyRecord | undefined> {
    return this.findRuntimeRecord("incidentIdempotencyKeys", key);
  }

  saveIncidentIdempotencyKey(record: PlatformIncidentIdempotencyRecord): PlatformIncidentIdempotencyRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(record);
    let saved: PlatformIncidentIdempotencyRecord = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.incidentIdempotencyKeys.find((item) => item.key === persisted.key);
      if (existing) {
        saved = clone(existing);
        return current;
      }
      saved = persisted;

      return {
        ...current,
        incidentIdempotencyKeys: [...current.incidentIdempotencyKeys, persisted]
      };
    });

    return clone(saved);
  }

  async saveIncidentIdempotencyKeyAsync(record: PlatformIncidentIdempotencyRecord): Promise<PlatformIncidentIdempotencyRecord> {
    if (!this.prismaClient) {
      return this.saveIncidentIdempotencyKey(record);
    }

    const existing = await this.findIncidentIdempotencyKeyAsync(record.key);
    if (existing) {
      return existing;
    }

    return this.saveRuntimeRecord("incidentIdempotencyKeys", record.key, record);
  }

  listMaintenanceWindows(): Array<Record<string, unknown>> {
    return clone(this.readCatalogState().maintenanceWindows);
  }

  async listMaintenanceWindowsAsync(): Promise<Array<Record<string, unknown>>> {
    return this.listMaintenanceWindows();
  }

  listIncidentPostmortems(): Array<Record<string, unknown>> {
    return clone(this.readCatalogState().incidentPostmortems);
  }

  async listIncidentPostmortemsAsync(): Promise<Array<Record<string, unknown>>> {
    return this.listIncidentPostmortems();
  }

  listFeatureFlags(): FeatureFlag[] {
    return clone(this.readState().featureFlags);
  }

  async listFeatureFlagsAsync(): Promise<FeatureFlag[]> {
    if (!this.prismaClient) {
      return this.listFeatureFlags();
    }

    return overlayById(this.readCatalogState().featureFlags, await this.listRuntimeRecords<FeatureFlag>("featureFlags"));
  }

  saveFeatureFlag(flag: FeatureFlag): FeatureFlag {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(flag);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.featureFlags.some((item) => item.id === persisted.id);

      return {
        ...current,
        featureFlags: exists
          ? current.featureFlags.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.featureFlags]
      };
    });

    return clone(persisted);
  }

  async saveFeatureFlagAsync(flag: FeatureFlag): Promise<FeatureFlag> {
    return this.saveRuntimeRecord("featureFlags", flag.id, flag, flag.key);
  }

  saveFeatureFlagOutbox(outbox: PlatformFeatureFlagOutbox): PlatformFeatureFlagOutbox {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(outbox);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.featureFlagOutbox.some((item) => item.id === persisted.id);

      return {
        ...current,
        featureFlagOutbox: exists
          ? current.featureFlagOutbox.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.featureFlagOutbox]
      };
    });

    return clone(persisted);
  }

  async saveFeatureFlagOutboxAsync(outbox: PlatformFeatureFlagOutbox): Promise<PlatformFeatureFlagOutbox> {
    return this.saveRuntimeRecord("featureFlagOutbox", outbox.id, outbox, outbox.queue);
  }

  saveFeatureFlagRule(rule: PlatformFeatureFlagRule): PlatformFeatureFlagRule {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(rule);
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.featureFlagRules.find((item) => item.id === persisted.id);

      return {
        ...current,
        featureFlagRules: existing
          ? current.featureFlagRules.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.featureFlagRules]
      };
    });

    return clone(persisted);
  }

  async saveFeatureFlagRuleAsync(rule: PlatformFeatureFlagRule): Promise<PlatformFeatureFlagRule> {
    if (!this.prismaClient) {
      return this.saveFeatureFlagRule(rule);
    }

    const data = toPrismaFeatureFlagRuleCreateInput(rule);
    const row = await this.prismaClient.featureFlagRule.upsert({
      create: data,
      update: toPrismaFeatureFlagRuleUpdateInput(rule),
      where: { id: rule.id }
    });

    return toFeatureFlagRule(row);
  }

  listFeatureFlagRules(filters: PlatformFeatureFlagRuleFilters = {}): PlatformFeatureFlagRule[] {
    const items = this.readState().featureFlagRules.filter((rule) => {
      const flagMatches = !filters.flagId || rule.flagId === filters.flagId;
      const keyMatches = !filters.flagKey || rule.flagKey === filters.flagKey;
      const targetingMatches = !filters.targeting || rule.targeting === filters.targeting;

      return flagMatches && keyMatches && targetingMatches;
    });

    return clone(items);
  }

  async listFeatureFlagRulesAsync(filters: PlatformFeatureFlagRuleFilters = {}): Promise<PlatformFeatureFlagRule[]> {
    if (!this.prismaClient) {
      return this.listFeatureFlagRules(filters);
    }

    const rows = await this.prismaClient.featureFlagRule.findMany({
      orderBy: { updatedAt: "desc" },
      where: {
        ...(filters.flagId ? { flagId: filters.flagId } : {}),
        ...(filters.flagKey ? { flagKey: filters.flagKey } : {}),
        ...(filters.targeting ? { targeting: filters.targeting } : {})
      }
    });

    return rows.map(toFeatureFlagRule);
  }

  saveTelemetrySample(sample: PlatformTelemetrySample): PlatformTelemetrySample {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(sample);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.telemetrySamples.some((item) => item.id === persisted.id);

      return {
        ...current,
        telemetrySamples: exists
          ? current.telemetrySamples.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.telemetrySamples]
      };
    });

    return clone(persisted);
  }

  async saveTelemetrySampleAsync(sample: PlatformTelemetrySample): Promise<PlatformTelemetrySample> {
    if (!this.prismaClient) {
      return this.saveTelemetrySample(sample);
    }

    const data = toPrismaTelemetrySampleCreateInput(sample);
    const row = await this.prismaClient.platformTelemetrySample.upsert({
      create: data,
      update: toPrismaTelemetrySampleUpdateInput(sample),
      where: { id: sample.id }
    });

    return toTelemetrySample(row);
  }

  listTelemetrySamples(filters: PlatformTelemetrySampleFilters = {}): PlatformTelemetrySample[] {
    const since = parseOptionalTime(filters.since);
    const until = parseOptionalTime(filters.until);
    const items = this.readState().telemetrySamples
      .filter((sample) => {
        const sampledAt = Date.parse(sample.sampledAt);
        const componentMatches = !filters.componentId || sample.componentId === filters.componentId;
        const metricMatches = !filters.metricKey || sample.metricKey === filters.metricKey;
        const tenantMatches = filters.tenantId === undefined || sample.tenantId === filters.tenantId;
        const sinceMatches = since === null || sampledAt >= since;
        const untilMatches = until === null || sampledAt <= until;

        return componentMatches && metricMatches && tenantMatches && sinceMatches && untilMatches;
      })
      .sort((left, right) => Date.parse(right.sampledAt) - Date.parse(left.sampledAt));

    return clone(items);
  }

  async listTelemetrySamplesAsync(filters: PlatformTelemetrySampleFilters = {}): Promise<PlatformTelemetrySample[]> {
    if (!this.prismaClient) {
      return this.listTelemetrySamples(filters);
    }

    const rows = await this.prismaClient.platformTelemetrySample.findMany({
      orderBy: { sampledAt: "desc" },
      where: {
        ...(filters.componentId ? { componentId: filters.componentId } : {}),
        ...(filters.metricKey ? { metricKey: filters.metricKey } : {}),
        ...(filters.tenantId !== undefined ? { tenantId: filters.tenantId } : {}),
        ...(buildDateRangeFilter(filters.since, filters.until) ? { sampledAt: buildDateRangeFilter(filters.since, filters.until)! } : {})
      }
    });

    return rows.map(toTelemetrySample);
  }

  saveHealthRollup(rollup: PlatformHealthRollup): PlatformHealthRollup {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(rollup);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.healthRollups.some((item) => item.id === persisted.id);

      return {
        ...current,
        healthRollups: exists
          ? current.healthRollups.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.healthRollups]
      };
    });

    return clone(persisted);
  }

  async saveHealthRollupAsync(rollup: PlatformHealthRollup): Promise<PlatformHealthRollup> {
    if (!this.prismaClient) {
      return this.saveHealthRollup(rollup);
    }

    const data = toPrismaHealthRollupCreateInput(rollup);
    const row = await this.prismaClient.platformHealthRollup.upsert({
      create: data,
      update: toPrismaHealthRollupUpdateInput(rollup),
      where: { id: rollup.id }
    });

    return toHealthRollup(row);
  }

  listHealthRollups(filters: PlatformHealthRollupFilters = {}): PlatformHealthRollup[] {
    const since = parseOptionalTime(filters.since);
    const until = parseOptionalTime(filters.until);
    const items = this.readState().healthRollups
      .filter((rollup) => {
        const windowEnd = Date.parse(rollup.windowEnd);
        const componentMatches = !filters.componentId || rollup.componentId === filters.componentId;
        const statusMatches = !filters.status || rollup.status === filters.status;
        const sinceMatches = since === null || windowEnd >= since;
        const untilMatches = until === null || windowEnd <= until;

        return componentMatches && statusMatches && sinceMatches && untilMatches;
      })
      .sort((left, right) => {
        const time = Date.parse(right.windowEnd) - Date.parse(left.windowEnd);
        return time === 0 ? right.id.localeCompare(left.id) : time;
      });

    return clone(items);
  }

  async listHealthRollupsAsync(filters: PlatformHealthRollupFilters = {}): Promise<PlatformHealthRollup[]> {
    if (!this.prismaClient) {
      return this.listHealthRollups(filters);
    }

    const rows = await this.prismaClient.platformHealthRollup.findMany({
      orderBy: { windowEnd: "desc" },
      where: {
        ...(filters.componentId ? { componentId: filters.componentId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(buildDateRangeFilter(filters.since, filters.until) ? { windowEnd: buildDateRangeFilter(filters.since, filters.until)! } : {})
      }
    });

    return rows.map(toHealthRollup).sort((left, right) => {
      const time = Date.parse(right.windowEnd) - Date.parse(left.windowEnd);
      return time === 0 ? right.id.localeCompare(left.id) : time;
    });
  }

  saveAlertRoutingRule(rule: PlatformAlertRoutingRule): PlatformAlertRoutingRule {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(rule);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.alertRoutingRules.some((item) => item.id === persisted.id);

      return {
        ...current,
        alertRoutingRules: exists
          ? current.alertRoutingRules.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.alertRoutingRules]
      };
    });

    return clone(persisted);
  }

  async saveAlertRoutingRuleAsync(rule: PlatformAlertRoutingRule): Promise<PlatformAlertRoutingRule> {
    if (!this.prismaClient) {
      return this.saveAlertRoutingRule(rule);
    }

    const data = toPrismaAlertRoutingRuleCreateInput(rule);
    const row = await this.prismaClient.platformAlertRoutingRule.upsert({
      create: data,
      update: toPrismaAlertRoutingRuleUpdateInput(rule),
      where: { id: rule.id }
    });

    return toAlertRoutingRule(row);
  }

  listAlertRoutingRules(filters: PlatformAlertRoutingRuleFilters = {}): PlatformAlertRoutingRule[] {
    const items = this.readState().alertRoutingRules
      .filter((rule) => {
        const componentMatches = !filters.componentId || rule.componentIds.length === 0 || rule.componentIds.includes(filters.componentId);
        const statusMatches = !filters.status || rule.statuses.length === 0 || rule.statuses.includes(filters.status);
        const severityMatches = !filters.severity || rule.severities.length === 0 || rule.severities.includes(filters.severity);
        const enabledMatches = filters.enabled === undefined || rule.enabled === filters.enabled;
        const destinationMatches = !filters.destinationChannel || rule.destination.channel === filters.destinationChannel;

        return componentMatches && statusMatches && severityMatches && enabledMatches && destinationMatches;
      })
      .sort((left, right) => {
        const time = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        return time === 0 ? right.id.localeCompare(left.id) : time;
      });

    return clone(items);
  }

  async listAlertRoutingRulesAsync(filters: PlatformAlertRoutingRuleFilters = {}): Promise<PlatformAlertRoutingRule[]> {
    if (!this.prismaClient) {
      return this.listAlertRoutingRules(filters);
    }

    const rows = await this.prismaClient.platformAlertRoutingRule.findMany({
      orderBy: { updatedAt: "desc" },
      where: {
        ...(filters.destinationChannel ? { destinationChannel: filters.destinationChannel } : {}),
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {})
      }
    });

    return rows.map(toAlertRoutingRule)
      .filter((rule) => {
        const componentMatches = !filters.componentId || rule.componentIds.length === 0 || rule.componentIds.includes(filters.componentId);
        const statusMatches = !filters.status || rule.statuses.length === 0 || rule.statuses.includes(filters.status);
        const severityMatches = !filters.severity || rule.severities.length === 0 || rule.severities.includes(filters.severity);

        return componentMatches && statusMatches && severityMatches;
      })
      .sort((left, right) => {
        const time = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        return time === 0 ? right.id.localeCompare(left.id) : time;
      });
  }

  saveAlertAcknowledgement(acknowledgement: PlatformAlertAcknowledgement): PlatformAlertAcknowledgement {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(acknowledgement);
    let replay: PlatformAlertAcknowledgement | undefined;
    this.store.update((state) => {
      const current = normalizeState(state);
      replay = persisted.idempotencyKey
        ? current.alertAcknowledgements.find((item) => item.idempotencyKey === persisted.idempotencyKey)
        : undefined;
      if (replay) return current;

      return {
        ...current,
        alertAcknowledgements: [persisted, ...current.alertAcknowledgements]
      };
    });

    return clone(replay ?? persisted);
  }

  async saveAlertAcknowledgementAsync(acknowledgement: PlatformAlertAcknowledgement): Promise<PlatformAlertAcknowledgement> {
    return this.saveRuntimeRecord(
      "alertAcknowledgements",
      acknowledgement.idempotencyKey
        ? `ack:${acknowledgement.idempotencyKey}`
        : String(toJsonRecord(acknowledgement.auditEvent).id ?? `${acknowledgement.componentId}:${acknowledgement.acknowledgedAt}`),
      acknowledgement,
      acknowledgement.componentId
    );
  }

  saveIncidentCommunicationAttempt(
    attempt: PlatformIncidentCommunicationAttempt
  ): PlatformIncidentCommunicationAttempt {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(attempt);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.incidentCommunicationAttempts.some((item) => item.attemptId === persisted.attemptId);

      return {
        ...current,
        incidentCommunicationAttempts: exists
          ? current.incidentCommunicationAttempts.map((item) => item.attemptId === persisted.attemptId ? persisted : item)
          : [persisted, ...current.incidentCommunicationAttempts]
      };
    });

    return clone(persisted);
  }

  async saveIncidentCommunicationAttemptAsync(
    attempt: PlatformIncidentCommunicationAttempt
  ): Promise<PlatformIncidentCommunicationAttempt> {
    return this.saveRuntimeRecord("incidentCommunicationAttempts", attempt.attemptId, attempt, attempt.incidentId);
  }

  listIncidentCommunicationAttempts(
    filters: PlatformIncidentCommunicationAttemptFilters = {}
  ): PlatformIncidentCommunicationAttempt[] {
    const items = this.readState().incidentCommunicationAttempts.filter((attempt) => {
      const incidentMatches = !filters.incidentId || attempt.incidentId === filters.incidentId;
      const visibilityMatches = !filters.visibility || attempt.visibility === filters.visibility;

      return incidentMatches && visibilityMatches;
    });

    return clone(items);
  }

  async listIncidentCommunicationAttemptsAsync(
    filters: PlatformIncidentCommunicationAttemptFilters = {}
  ): Promise<PlatformIncidentCommunicationAttempt[]> {
    const items = this.prismaClient
      ? await this.listRuntimeRecords<PlatformIncidentCommunicationAttempt>(
        "incidentCommunicationAttempts",
        filters.incidentId ? { filterKey: filters.incidentId } : {}
      )
      : this.listIncidentCommunicationAttempts(filters);

    return clone(items.filter((attempt) => {
      const incidentMatches = !filters.incidentId || attempt.incidentId === filters.incidentId;
      const visibilityMatches = !filters.visibility || attempt.visibility === filters.visibility;

      return incidentMatches && visibilityMatches;
    }));
  }

  saveIncidentCommunicationRetry(retry: PlatformIncidentCommunicationRetry): PlatformIncidentCommunicationRetry {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(retry);
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.incidentCommunicationRetries.find((item) => item.attemptId === persisted.attemptId);

      return {
        ...current,
        incidentCommunicationRetries: existing
          ? current.incidentCommunicationRetries.map((item) => item.attemptId === persisted.attemptId ? persisted : item)
          : [persisted, ...current.incidentCommunicationRetries]
      };
    });

    return clone(persisted);
  }

  async saveIncidentCommunicationRetryAsync(retry: PlatformIncidentCommunicationRetry): Promise<PlatformIncidentCommunicationRetry> {
    return this.saveRuntimeRecord("incidentCommunicationRetries", retry.attemptId, retry, retry.incidentId);
  }

  listIncidentCommunicationRetries(
    filters: PlatformIncidentCommunicationRetryFilters = {}
  ): PlatformIncidentCommunicationRetry[] {
    const items = this.readState().incidentCommunicationRetries.filter((retry) => {
      const attemptMatches = !filters.attemptId || retry.attemptId === filters.attemptId;
      const incidentMatches = !filters.incidentId || retry.incidentId === filters.incidentId;

      return attemptMatches && incidentMatches;
    });

    return clone(items);
  }

  async listIncidentCommunicationRetriesAsync(
    filters: PlatformIncidentCommunicationRetryFilters = {}
  ): Promise<PlatformIncidentCommunicationRetry[]> {
    const items = this.prismaClient
      ? await this.listRuntimeRecords<PlatformIncidentCommunicationRetry>(
        "incidentCommunicationRetries",
        filters.incidentId ? { filterKey: filters.incidentId } : {}
      )
      : this.listIncidentCommunicationRetries(filters);

    return clone(items.filter((retry) => {
      const attemptMatches = !filters.attemptId || retry.attemptId === filters.attemptId;
      const incidentMatches = !filters.incidentId || retry.incidentId === filters.incidentId;

      return attemptMatches && incidentMatches;
    }));
  }

  saveIncidentCommunicationDeadLetter(
    deadLetter: PlatformIncidentCommunicationDeadLetter
  ): PlatformIncidentCommunicationDeadLetter {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(deadLetter);
    let saved: PlatformIncidentCommunicationDeadLetter = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.incidentCommunicationDeadLetters.find((item) => item.attemptId === persisted.attemptId);
      if (existing) {
        saved = clone(existing);
        return current;
      }
      saved = persisted;

      return {
        ...current,
        incidentCommunicationDeadLetters: [persisted, ...current.incidentCommunicationDeadLetters]
      };
    });

    return clone(saved);
  }

  async saveIncidentCommunicationDeadLetterAsync(
    deadLetter: PlatformIncidentCommunicationDeadLetter
  ): Promise<PlatformIncidentCommunicationDeadLetter> {
    if (!this.prismaClient) {
      return this.saveIncidentCommunicationDeadLetter(deadLetter);
    }

    const existing = await this.findRuntimeRecord<PlatformIncidentCommunicationDeadLetter>(
      "incidentCommunicationDeadLetters",
      deadLetter.attemptId
    );
    if (existing) {
      return existing;
    }

    return this.saveRuntimeRecord("incidentCommunicationDeadLetters", deadLetter.attemptId, deadLetter, deadLetter.incidentId);
  }

  listIncidentCommunicationDeadLetters(
    filters: PlatformIncidentCommunicationDeadLetterFilters = {}
  ): PlatformIncidentCommunicationDeadLetter[] {
    const items = this.readState().incidentCommunicationDeadLetters.filter((deadLetter) => {
      const attemptMatches = !filters.attemptId || deadLetter.attemptId === filters.attemptId;
      const incidentMatches = !filters.incidentId || deadLetter.incidentId === filters.incidentId;

      return attemptMatches && incidentMatches;
    });

    return clone(items);
  }

  async listIncidentCommunicationDeadLettersAsync(
    filters: PlatformIncidentCommunicationDeadLetterFilters = {}
  ): Promise<PlatformIncidentCommunicationDeadLetter[]> {
    const items = this.prismaClient
      ? await this.listRuntimeRecords<PlatformIncidentCommunicationDeadLetter>(
        "incidentCommunicationDeadLetters",
        filters.incidentId ? { filterKey: filters.incidentId } : {}
      )
      : this.listIncidentCommunicationDeadLetters(filters);

    return clone(items.filter((deadLetter) => {
      const attemptMatches = !filters.attemptId || deadLetter.attemptId === filters.attemptId;
      const incidentMatches = !filters.incidentId || deadLetter.incidentId === filters.incidentId;

      return attemptMatches && incidentMatches;
    }));
  }

  findPlatformAuditRow(idempotencyKey: string): PlatformAuditRow | undefined {
    this.assertSyncRuntimeAvailable();
    return clone(this.readState().platformAuditRows.find((item) => item.idempotencyKey === idempotencyKey));
  }

  async findPlatformAuditRowAsync(idempotencyKey: string): Promise<PlatformAuditRow | undefined> {
    if (!this.prismaClient) {
      return this.findPlatformAuditRow(idempotencyKey);
    }

    const row = await this.prismaClient.platformAuditRow.findUnique({ where: { idempotencyKey } });
    return row ? toPlatformAuditRow(row) : undefined;
  }

  savePlatformAuditRow(row: PlatformAuditRow): PlatformAuditRow {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(row);
    let saved: PlatformAuditRow = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.platformAuditRows.find((item) => item.idempotencyKey === persisted.idempotencyKey);
      if (existing) {
        if (!platformAuditRowsEqual(existing, persisted)) {
          throw new Error("platform_audit_immutable");
        }

        saved = clone(existing);
        return current;
      }

      saved = persisted;
      return {
        ...current,
        platformAuditRows: [persisted, ...current.platformAuditRows]
      };
    });

    return clone(saved);
  }

  async savePlatformAuditRowAsync(row: PlatformAuditRow): Promise<PlatformAuditRow> {
    if (!this.prismaClient) {
      return this.savePlatformAuditRow(row);
    }

    const existing = await this.findPlatformAuditRowAsync(row.idempotencyKey);
    if (existing) {
      if (!platformAuditRowsEqual(existing, row)) {
        throw new Error("platform_audit_immutable");
      }

      return existing;
    }

    const data = toPrismaPlatformAuditRowCreateInput(row);
    const saved = await this.prismaClient.platformAuditRow.upsert({
      create: data,
      update: {},
      where: { idempotencyKey: row.idempotencyKey }
    });

    return toPlatformAuditRow(saved);
  }

  listPlatformAuditRows(filters: PlatformAuditRowFilters = {}): PlatformAuditRow[] {
    const items = this.readState().platformAuditRows.filter((row) => {
      const kindMatches = !filters.mutationKind || row.mutationKind === filters.mutationKind;
      const idempotencyMatches = !filters.idempotencyKey || row.idempotencyKey === filters.idempotencyKey;
      const targetMatches = !filters.target || row.target === filters.target;

      return kindMatches && idempotencyMatches && targetMatches;
    });

    return clone(items);
  }

  async listPlatformAuditRowsAsync(filters: PlatformAuditRowFilters = {}): Promise<PlatformAuditRow[]> {
    if (!this.prismaClient) {
      return this.listPlatformAuditRows(filters);
    }

    const rows = await this.prismaClient.platformAuditRow.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        ...(filters.idempotencyKey ? { idempotencyKey: filters.idempotencyKey } : {}),
        ...(filters.mutationKind ? { mutationKind: filters.mutationKind } : {}),
        ...(filters.target ? { target: filters.target } : {})
      }
    });

    return rows.map(toPlatformAuditRow);
  }

  findPlatformOutboxRow(idempotencyKey: string): PlatformOutboxRow | undefined {
    this.assertSyncRuntimeAvailable();
    return clone(this.readState().platformOutboxRows.find((item) => item.idempotencyKey === idempotencyKey));
  }

  async findPlatformOutboxRowAsync(idempotencyKey: string): Promise<PlatformOutboxRow | undefined> {
    if (!this.prismaClient) {
      return this.findPlatformOutboxRow(idempotencyKey);
    }

    const row = await this.prismaClient.platformOutboxRow.findUnique({ where: { idempotencyKey } });
    return row ? toPlatformOutboxRow(row) : undefined;
  }

  savePlatformOutboxRow(row: PlatformOutboxRow): PlatformOutboxRow {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(row);
    let saved: PlatformOutboxRow = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.platformOutboxRows.find((item) => item.idempotencyKey === persisted.idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== persisted.fingerprint) {
          throw new Error("platform_outbox_idempotency_conflict");
        }

        saved = clone(existing);
        return current;
      }

      saved = persisted;
      return {
        ...current,
        platformOutboxRows: [persisted, ...current.platformOutboxRows]
      };
    });

    return clone(saved);
  }

  async savePlatformOutboxRowAsync(row: PlatformOutboxRow): Promise<PlatformOutboxRow> {
    if (!this.prismaClient) {
      return this.savePlatformOutboxRow(row);
    }

    const existing = await this.findPlatformOutboxRowAsync(row.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== row.fingerprint) {
        throw new Error("platform_outbox_idempotency_conflict");
      }

      return existing;
    }

    const data = toPrismaPlatformOutboxRowCreateInput(row);
    const saved = await this.prismaClient.platformOutboxRow.upsert({
      create: data,
      update: toPrismaPlatformOutboxRowUpdateInput(row),
      where: { idempotencyKey: row.idempotencyKey }
    });

    return toPlatformOutboxRow(saved);
  }

  updatePlatformOutboxRowStatus(
    idempotencyKey: string,
    status: string,
    payloadPatch: Record<string, unknown> = {}
  ): PlatformOutboxRow {
    this.assertSyncRuntimeAvailable();
    let updated: PlatformOutboxRow | undefined;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.platformOutboxRows.find((item) => item.idempotencyKey === idempotencyKey);
      if (!existing) {
        throw new Error(`platform_outbox_row_not_found:${idempotencyKey}`);
      }

      updated = {
        ...existing,
        payload: {
          ...existing.payload,
          ...clone(payloadPatch)
        },
        status
      };

      return {
        ...current,
        platformOutboxRows: current.platformOutboxRows.map((item) =>
          item.idempotencyKey === idempotencyKey ? updated! : item
        )
      };
    });

    return clone(updated!);
  }

  async updatePlatformOutboxRowStatusAsync(
    idempotencyKey: string,
    status: string,
    payloadPatch: Record<string, unknown> = {}
  ): Promise<PlatformOutboxRow> {
    if (!this.prismaClient) {
      return this.updatePlatformOutboxRowStatus(idempotencyKey, status, payloadPatch);
    }

    const existing = await this.findPlatformOutboxRowAsync(idempotencyKey);
    if (!existing) {
      throw new Error(`platform_outbox_row_not_found:${idempotencyKey}`);
    }

    const updated: PlatformOutboxRow = {
      ...existing,
      payload: {
        ...existing.payload,
        ...clone(payloadPatch)
      },
      status
    };
    const row = await this.prismaClient.platformOutboxRow.upsert({
      create: toPrismaPlatformOutboxRowCreateInput(updated),
      update: toPrismaPlatformOutboxRowUpdateInput(updated),
      where: { idempotencyKey }
    });

    return toPlatformOutboxRow(row);
  }

  listPlatformOutboxRows(filters: PlatformOutboxRowFilters = {}): PlatformOutboxRow[] {
    const items = this.readState().platformOutboxRows.filter((row) => {
      const kindMatches = !filters.mutationKind || row.mutationKind === filters.mutationKind;

      return kindMatches;
    });

    return clone(items);
  }

  async listPlatformOutboxRowsAsync(filters: PlatformOutboxRowFilters = {}): Promise<PlatformOutboxRow[]> {
    if (!this.prismaClient) {
      return this.listPlatformOutboxRows(filters);
    }

    const rows = await this.prismaClient.platformOutboxRow.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        ...(filters.mutationKind ? { mutationKind: filters.mutationKind } : {})
      }
    });

    return rows.map(toPlatformOutboxRow);
  }

  private readCatalogState(): PlatformState {
    return this.prismaClient ? normalizeState(this.store.read()) : this.readState();
  }

  private assertSyncRuntimeAvailable(): void {
    if (this.prismaClient) {
      throw new Error("prisma_platform_async_required");
    }
  }

  private async findRuntimeRecord<T>(collection: PlatformRuntimeCollection, entityKey: string): Promise<T | undefined> {
    if (!this.prismaClient) {
      return clone((this.readState()[collection] as T[]).find((item) => platformRuntimeEntityKey(collection, item) === entityKey));
    }

    const row = await this.prismaClient.platformRuntimeRecord.findUnique({
      where: {
        collection_entityKey: {
          collection,
          entityKey
        }
      }
    });

    return row ? clone(row.record as T) : undefined;
  }

  private async listRuntimeRecords<T>(
    collection: PlatformRuntimeCollection,
    filters: { filterKey?: string } = {}
  ): Promise<T[]> {
    if (!this.prismaClient) {
      return (this.readState()[collection] as T[])
        .filter((item) => !filters.filterKey || platformRuntimeFilterKey(collection, item) === filters.filterKey)
        .map(clone);
    }

    const rows = await this.prismaClient.platformRuntimeRecord.findMany({
      orderBy: { updatedAt: "desc" },
      where: {
        collection,
        ...(filters.filterKey ? { filterKey: filters.filterKey } : {})
      }
    });

    return rows.map((row) => clone(row.record as T));
  }

  private async saveRuntimeRecord<T>(
    collection: PlatformRuntimeCollection,
    entityKey: string,
    record: T,
    filterKey: string | null = null
  ): Promise<T> {
    if (!this.prismaClient) {
      return this.saveRuntimeRecordSynchronously(collection, record);
    }

    const persisted = clone(record);
    const now = new Date();
    const normalizedEntityKey = entityKey || platformRuntimeRecordId(collection, JSON.stringify(persisted));
    const row = await this.prismaClient.platformRuntimeRecord.upsert({
      create: {
        collection,
        createdAt: now,
        entityKey: normalizedEntityKey,
        filterKey,
        id: platformRuntimeRecordId(collection, normalizedEntityKey),
        record: persisted,
        updatedAt: now
      },
      update: {
        filterKey,
        record: persisted,
        updatedAt: now
      },
      where: {
        collection_entityKey: {
          collection,
          entityKey: normalizedEntityKey
        }
      }
    });

    return clone(row.record as T);
  }

  private saveRuntimeRecordSynchronously<T>(collection: PlatformRuntimeCollection, record: T): T {
    switch (collection) {
      case "alertAcknowledgements":
        return this.saveAlertAcknowledgement(record as PlatformAlertAcknowledgement) as T;
      case "featureFlagOutbox":
        return this.saveFeatureFlagOutbox(record as PlatformFeatureFlagOutbox) as T;
      case "featureFlags":
        return this.saveFeatureFlag(record as FeatureFlag) as T;
      case "incidentCommunicationAttempts":
        return this.saveIncidentCommunicationAttempt(record as PlatformIncidentCommunicationAttempt) as T;
      case "incidentCommunicationDeadLetters":
        return this.saveIncidentCommunicationDeadLetter(record as PlatformIncidentCommunicationDeadLetter) as T;
      case "incidentCommunicationRetries":
        return this.saveIncidentCommunicationRetry(record as PlatformIncidentCommunicationRetry) as T;
      case "incidentIdempotencyKeys":
        return this.saveIncidentIdempotencyKey(record as PlatformIncidentIdempotencyRecord) as T;
      case "incidents":
        return this.saveIncident(record as PlatformIncident) as T;
    }

    throw new Error(`platform_runtime_collection_unsupported:${collection}`);
  }
}

function assertCompletePrismaPlatformClient(client: PrismaPlatformClient): void {
  if (!client.$transaction) {
    throw new Error("prisma_platform_transaction_required");
  }
  if (!client.platformRuntimeRecord?.findMany || !client.platformRuntimeRecord.findUnique || !client.platformRuntimeRecord.upsert) {
    throw new Error("prisma_platform_runtime_record_delegate_required");
  }
  if (!client.platformTelemetrySample?.findMany || !client.platformTelemetrySample.upsert) {
    throw new Error("prisma_platform_telemetry_sample_delegate_required");
  }
  if (!client.platformHealthRollup?.findMany || !client.platformHealthRollup.upsert) {
    throw new Error("prisma_platform_health_rollup_delegate_required");
  }
  if (!client.platformAlertRoutingRule?.findMany || !client.platformAlertRoutingRule.upsert) {
    throw new Error("prisma_platform_alert_routing_rule_delegate_required");
  }
  if (!client.featureFlagRule?.findMany || !client.featureFlagRule.upsert) {
    throw new Error("prisma_feature_flag_rule_delegate_required");
  }
  if (!client.platformAuditRow?.findMany || !client.platformAuditRow.findUnique || !client.platformAuditRow.upsert) {
    throw new Error("prisma_platform_audit_row_delegate_required");
  }
  if (!client.platformOutboxRow?.findMany || !client.platformOutboxRow.findUnique || !client.platformOutboxRow.upsert) {
    throw new Error("prisma_platform_outbox_row_delegate_required");
  }
}

async function withInMemoryTransactionLock<T>(lockKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = inMemoryTransactionTails.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  inMemoryTransactionTails.set(lockKey, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (inMemoryTransactionTails.get(lockKey) === tail) {
      inMemoryTransactionTails.delete(lockKey);
    }
  }
}

function appendRuntimeRecord(state: PlatformState, collection: string, record: unknown): void {
  if (!isPlatformRuntimeCollection(collection)) {
    return;
  }

  (state[collection] as unknown[]).push(clone(record));
}

function isPlatformRuntimeCollection(collection: string): collection is PlatformRuntimeCollection {
  return [
    "alertAcknowledgements",
    "featureFlagOutbox",
    "featureFlags",
    "incidentCommunicationAttempts",
    "incidentCommunicationDeadLetters",
    "incidentCommunicationRetries",
    "incidentIdempotencyKeys",
    "incidents"
  ].includes(collection);
}

function platformRuntimeEntityKey(collection: PlatformRuntimeCollection, record: unknown): string {
  const value = toJsonRecord(record);
  switch (collection) {
    case "alertAcknowledgements":
      return String(toJsonRecord(value.auditEvent).id ?? `${value.componentId ?? ""}:${value.acknowledgedAt ?? ""}`);
    case "featureFlagOutbox":
    case "featureFlags":
    case "incidents":
      return String(value.id ?? "");
    case "incidentCommunicationAttempts":
    case "incidentCommunicationDeadLetters":
    case "incidentCommunicationRetries":
      return String(value.attemptId ?? "");
    case "incidentIdempotencyKeys":
      return String(value.key ?? "");
  }
}

function platformRuntimeFilterKey(collection: PlatformRuntimeCollection, record: unknown): string | null {
  const value = toJsonRecord(record);
  switch (collection) {
    case "alertAcknowledgements":
      return String(value.componentId ?? "");
    case "featureFlagOutbox":
      return String(value.queue ?? "");
    case "featureFlags":
      return String(value.key ?? "");
    case "incidentCommunicationAttempts":
    case "incidentCommunicationDeadLetters":
    case "incidentCommunicationRetries":
      return String(value.incidentId ?? "");
    case "incidents":
      return String(value.componentId ?? "");
    default:
      return null;
  }
}

function platformRuntimeRecordId(collection: string, entityKey: string): string {
  return `platform_runtime_${collection}_${createHash("sha256").update(entityKey).digest("hex").slice(0, 24)}`;
}

function toPrismaTelemetrySampleCreateInput(sample: PlatformTelemetrySample): PrismaPlatformTelemetrySampleCreateInput {
  return {
    componentId: sample.componentId,
    id: sample.id,
    metricKey: sample.metricKey,
    sampledAt: new Date(sample.sampledAt),
    source: sample.source,
    tags: clone(sample.tags),
    tenantId: sample.tenantId,
    unit: sample.unit,
    value: sample.value
  };
}

function toPrismaTelemetrySampleUpdateInput(sample: PlatformTelemetrySample): PrismaPlatformTelemetrySampleUpdateInput {
  const { id: _id, ...data } = toPrismaTelemetrySampleCreateInput(sample);
  return data;
}

function toTelemetrySample(row: PrismaPlatformTelemetrySampleRow): PlatformTelemetrySample {
  return {
    componentId: row.componentId,
    id: row.id,
    metricKey: row.metricKey,
    sampledAt: toIso(row.sampledAt),
    source: row.source,
    tags: toJsonRecord(row.tags),
    tenantId: row.tenantId,
    unit: row.unit,
    value: row.value
  };
}

function toPrismaHealthRollupCreateInput(rollup: PlatformHealthRollup): PrismaPlatformHealthRollupCreateInput {
  return {
    availability: rollup.availability,
    componentId: rollup.componentId,
    errorRate: rollup.errorRate,
    generatedAt: new Date(rollup.generatedAt),
    id: rollup.id,
    incidentIds: clone(rollup.incidentIds),
    latencyP95Ms: rollup.latencyP95Ms,
    sampleCount: rollup.sampleCount,
    status: rollup.status,
    windowEnd: new Date(rollup.windowEnd),
    windowStart: new Date(rollup.windowStart)
  };
}

function toPrismaHealthRollupUpdateInput(rollup: PlatformHealthRollup): PrismaPlatformHealthRollupUpdateInput {
  const { id: _id, ...data } = toPrismaHealthRollupCreateInput(rollup);
  return data;
}

function toHealthRollup(row: PrismaPlatformHealthRollupRow): PlatformHealthRollup {
  return {
    availability: row.availability,
    componentId: row.componentId,
    errorRate: row.errorRate,
    generatedAt: toIso(row.generatedAt),
    id: row.id,
    incidentIds: toStringArray(row.incidentIds),
    latencyP95Ms: row.latencyP95Ms,
    sampleCount: row.sampleCount,
    status: row.status,
    windowEnd: toIso(row.windowEnd),
    windowStart: toIso(row.windowStart)
  };
}

function toPrismaAlertRoutingRuleCreateInput(rule: PlatformAlertRoutingRule): PrismaPlatformAlertRoutingRuleCreateInput {
  return {
    componentIds: clone(rule.componentIds),
    createdAt: new Date(rule.createdAt),
    destinationChannel: rule.destination.channel,
    destinationTarget: rule.destination.target,
    enabled: rule.enabled,
    id: rule.id,
    severities: clone(rule.severities),
    statuses: clone(rule.statuses),
    updatedAt: new Date(rule.updatedAt)
  };
}

function toPrismaAlertRoutingRuleUpdateInput(rule: PlatformAlertRoutingRule): PrismaPlatformAlertRoutingRuleUpdateInput {
  const { id: _id, createdAt: _createdAt, ...data } = toPrismaAlertRoutingRuleCreateInput(rule);
  return data;
}

function toAlertRoutingRule(row: PrismaPlatformAlertRoutingRuleRow): PlatformAlertRoutingRule {
  return {
    componentIds: toStringArray(row.componentIds),
    createdAt: toIso(row.createdAt),
    destination: {
      channel: row.destinationChannel,
      target: row.destinationTarget
    },
    enabled: row.enabled,
    id: row.id,
    severities: toStringArray(row.severities),
    statuses: toStringArray(row.statuses),
    updatedAt: toIso(row.updatedAt)
  };
}

function toPrismaFeatureFlagRuleCreateInput(rule: PlatformFeatureFlagRule): PrismaFeatureFlagRuleCreateInput {
  return {
    bucketSalt: rule.bucketSalt,
    createdAt: new Date(rule.updatedAt),
    enabledTenantIds: clone(rule.enabledTenantIds),
    flagId: rule.flagId,
    flagKey: rule.flagKey,
    id: rule.id,
    rollout: rule.rollout,
    segments: clone(rule.segments),
    status: rule.status,
    targeting: rule.targeting,
    updatedAt: new Date(rule.updatedAt),
    variants: clone(rule.variants)
  };
}

function toPrismaFeatureFlagRuleUpdateInput(rule: PlatformFeatureFlagRule): PrismaFeatureFlagRuleUpdateInput {
  const { id: _id, createdAt: _createdAt, ...data } = toPrismaFeatureFlagRuleCreateInput(rule);
  return data;
}

function toFeatureFlagRule(row: PrismaFeatureFlagRuleRow): PlatformFeatureFlagRule {
  return {
    bucketSalt: row.bucketSalt,
    enabledTenantIds: toStringArray(row.enabledTenantIds),
    flagId: row.flagId,
    flagKey: row.flagKey,
    id: row.id,
    rollout: row.rollout,
    segments: toStringArray(row.segments),
    status: toFeatureFlagRuleStatus(row.status),
    targeting: row.targeting as PlatformFeatureFlagRule["targeting"],
    updatedAt: toIso(row.updatedAt),
    variants: toVariantArray(row.variants)
  };
}

function toFeatureFlagRuleStatus(status: string): PlatformFeatureFlagRule["status"] {
  if (status === "off" || status === "on" || status === "gradual" || status === "guarded") {
    return status;
  }
  return "off";
}

function toPrismaPlatformAuditRowCreateInput(row: PlatformAuditRow): PrismaPlatformAuditRowCreateInput {
  return {
    action: row.action,
    actor: row.actor,
    actorName: row.actorName,
    createdAt: new Date(row.createdAt),
    fingerprint: row.fingerprint,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    immutable: row.immutable,
    mutationKind: row.mutationKind,
    payload: clone(row.payload),
    reason: row.reason,
    result: row.result,
    target: row.target,
    traceId: row.traceId
  };
}

function toPlatformAuditRow(row: PrismaPlatformAuditRowRow): PlatformAuditRow {
  return {
    action: row.action,
    actor: row.actor,
    actorName: row.actorName,
    createdAt: toIso(row.createdAt),
    fingerprint: row.fingerprint,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    immutable: row.immutable,
    mutationKind: toPlatformMutationKind(row.mutationKind),
    payload: toJsonRecord(row.payload),
    reason: row.reason,
    result: row.result,
    target: row.target,
    traceId: row.traceId
  };
}

function toPrismaPlatformOutboxRowCreateInput(row: PlatformOutboxRow): PrismaPlatformOutboxRowCreateInput {
  return {
    aggregateId: row.aggregateId,
    aggregateType: row.aggregateType,
    createdAt: new Date(row.createdAt),
    fingerprint: row.fingerprint,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    mutationKind: row.mutationKind,
    payload: clone(row.payload),
    queue: row.queue,
    status: row.status,
    target: row.target,
    traceId: row.traceId,
    type: row.type
  };
}

function toPrismaPlatformOutboxRowUpdateInput(row: PlatformOutboxRow): PrismaPlatformOutboxRowUpdateInput {
  const { id: _id, createdAt: _createdAt, idempotencyKey: _idempotencyKey, ...data } = toPrismaPlatformOutboxRowCreateInput(row);
  return data;
}

function toPlatformOutboxRow(row: PrismaPlatformOutboxRowRow): PlatformOutboxRow {
  return {
    aggregateId: row.aggregateId,
    aggregateType: row.aggregateType,
    createdAt: toIso(row.createdAt),
    fingerprint: row.fingerprint,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    mutationKind: toPlatformMutationKind(row.mutationKind),
    payload: toJsonRecord(row.payload),
    queue: row.queue,
    status: row.status,
    target: row.target,
    traceId: row.traceId,
    type: row.type
  };
}

function buildDateRangeFilter(since: string | undefined, until: string | undefined): { gte?: Date; lte?: Date } | undefined {
  const range: { gte?: Date; lte?: Date } = {};
  const sinceTime = parseOptionalTime(since);
  const untilTime = parseOptionalTime(until);
  if (sinceTime !== null) {
    range.gte = new Date(sinceTime);
  }
  if (untilTime !== null) {
    range.lte = new Date(untilTime);
  }

  return Object.keys(range).length > 0 ? range : undefined;
}

function toPlatformMutationKind(kind: string): PlatformMutationKind {
  return kind === "incident" || kind === "rollout" || kind === "alert" ? kind : "alert";
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toVariantArray(value: unknown): PlatformFeatureFlagRule["variants"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      id: String(item.id ?? ""),
      weight: Number(item.weight ?? 0)
    }));
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function overlayById<T extends { id: string }>(base: T[], overlay: T[]): T[] {
  const overrides = new Map(overlay.map((item) => [item.id, item]));
  const merged = base.map((item) => overrides.get(item.id) ?? item);
  const extra = overlay.filter((item) => !base.some((baseItem) => baseItem.id === item.id));
  return clone([...extra, ...merged]);
}

function seedPlatformState(): PlatformState {
  return {
    alertAcknowledgements: [],
    alertRoutingRules: [],
    components: [],
    featureFlagOutbox: [],
    featureFlagRules: [],
    featureFlags: [],
    healthRollups: [],
    incidentCommunicationAttempts: [],
    incidentCommunicationDeadLetters: [],
    incidentCommunicationRetries: [],
    incidentIdempotencyKeys: [],
    incidentPostmortems: [],
    incidents: [],
    maintenanceWindows: [],
    platformAuditRows: [],
    platformOutboxRows: [],
    platformTenants: [],
    staticMetrics: [],
    telemetrySamples: []
  };
}

function normalizeState(state: Partial<PlatformState>): PlatformState {
  return {
    alertAcknowledgements: state.alertAcknowledgements ?? [],
    alertRoutingRules: state.alertRoutingRules ?? [],
    components: state.components ?? [],
    featureFlagOutbox: state.featureFlagOutbox ?? [],
    featureFlagRules: state.featureFlagRules ?? [],
    featureFlags: state.featureFlags ?? [],
    healthRollups: state.healthRollups ?? [],
    incidentCommunicationAttempts: state.incidentCommunicationAttempts ?? [],
    incidentCommunicationDeadLetters: state.incidentCommunicationDeadLetters ?? [],
    incidentCommunicationRetries: state.incidentCommunicationRetries ?? [],
    incidentIdempotencyKeys: state.incidentIdempotencyKeys ?? [],
    incidentPostmortems: state.incidentPostmortems ?? [],
    incidents: state.incidents ?? [],
    maintenanceWindows: state.maintenanceWindows ?? [],
    platformAuditRows: state.platformAuditRows ?? [],
    platformOutboxRows: state.platformOutboxRows ?? [],
    platformTenants: state.platformTenants ?? [],
    staticMetrics: state.staticMetrics ?? [],
    telemetrySamples: state.telemetrySamples ?? []
  };
}

function parseOptionalTime(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function platformAuditRowsEqual(left: PlatformAuditRow, right: PlatformAuditRow): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
