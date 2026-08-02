import type { FeatureFlag, PlatformComponent, PlatformIncident, PlatformMetric, PlatformTenant } from "./platform.types.js";
import type { PlatformFeatureFlagRule, PlatformFeatureFlagRuleFilters } from "../feature-flags/feature-flag-rollout.engine.js";
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
    updatePlatformOutboxRowStatus(idempotencyKey: string, status: string, payloadPatch?: Record<string, unknown>): PlatformOutboxRow;
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
    findUnique(input: {
        where: {
            id?: string;
            idempotencyKey?: string;
        };
    }): Promise<PrismaPlatformAuditRowRow | null>;
    upsert(input: PrismaPlatformAuditRowUpsertInput): Promise<PrismaPlatformAuditRowRow>;
}
interface PrismaPlatformOutboxRowDelegate {
    findMany(input?: PrismaPlatformOutboxRowFindManyInput): Promise<PrismaPlatformOutboxRowRow[]>;
    findUnique(input: {
        where: {
            id?: string;
            idempotencyKey?: string;
        };
    }): Promise<PrismaPlatformOutboxRowRow | null>;
    upsert(input: PrismaPlatformOutboxRowUpsertInput): Promise<PrismaPlatformOutboxRowRow>;
}
interface PrismaPlatformRuntimeRecordFindManyInput {
    orderBy?: {
        updatedAt: "desc";
    };
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
interface PrismaPlatformRuntimeRecordRow extends PrismaPlatformRuntimeRecordCreateInput {
}
interface PrismaPlatformTelemetrySampleFindManyInput {
    orderBy?: {
        sampledAt: "desc";
    };
    where?: {
        componentId?: string;
        metricKey?: string;
        sampledAt?: {
            gte?: Date;
            lte?: Date;
        };
        tenantId?: string | null;
    };
}
interface PrismaPlatformTelemetrySampleUpsertInput {
    create: PrismaPlatformTelemetrySampleCreateInput;
    update: PrismaPlatformTelemetrySampleUpdateInput;
    where: {
        id: string;
    };
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
    orderBy?: {
        windowEnd: "desc";
    };
    where?: {
        componentId?: string;
        status?: string;
        windowEnd?: {
            gte?: Date;
            lte?: Date;
        };
    };
}
interface PrismaPlatformHealthRollupUpsertInput {
    create: PrismaPlatformHealthRollupCreateInput;
    update: PrismaPlatformHealthRollupUpdateInput;
    where: {
        id: string;
    };
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
    orderBy?: {
        updatedAt: "desc";
    };
    where?: {
        destinationChannel?: string;
        enabled?: boolean;
    };
}
interface PrismaPlatformAlertRoutingRuleUpsertInput {
    create: PrismaPlatformAlertRoutingRuleCreateInput;
    update: PrismaPlatformAlertRoutingRuleUpdateInput;
    where: {
        id: string;
    };
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
    orderBy?: {
        updatedAt: "desc";
    };
    where?: {
        flagId?: string;
        flagKey?: string;
        targeting?: string;
    };
}
interface PrismaFeatureFlagRuleUpsertInput {
    create: PrismaFeatureFlagRuleCreateInput;
    update: PrismaFeatureFlagRuleUpdateInput;
    where: {
        id: string;
    };
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
    orderBy?: {
        createdAt: "desc";
    };
    where?: {
        idempotencyKey?: string;
        mutationKind?: string;
        target?: string;
    };
}
interface PrismaPlatformAuditRowUpsertInput {
    create: PrismaPlatformAuditRowCreateInput;
    update: PrismaPlatformAuditRowUpdateInput;
    where: {
        idempotencyKey: string;
    };
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
    orderBy?: {
        createdAt: "desc";
    };
    where?: {
        mutationKind?: string;
    };
}
interface PrismaPlatformOutboxRowUpsertInput {
    create: PrismaPlatformOutboxRowCreateInput;
    update: PrismaPlatformOutboxRowUpdateInput;
    where: {
        idempotencyKey: string;
    };
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
export declare class PlatformRepository implements PlatformAuditOutboxRepository {
    private readonly store;
    private readonly prismaClient?;
    private constructor();
    static default(): PlatformRepository;
    static useDefault(repository: PlatformRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: PlatformState): PlatformRepository;
    static prisma({ client, seed }: {
        client: PrismaPlatformClient;
        seed?: PlatformState;
    }): PlatformRepository;
    runInTransaction<T>(lockKey: string, operation: (repository: PlatformRepository) => Promise<T>): Promise<T>;
    readState(): PlatformState;
    readStateAsync(): Promise<PlatformState>;
    listIncidents(): PlatformIncident[];
    listIncidentsAsync(): Promise<PlatformIncident[]>;
    listPlatformTenants(): PlatformTenant[];
    listPlatformTenantsAsync(): Promise<PlatformTenant[]>;
    listStaticMetrics(): PlatformMetric[];
    listStaticMetricsAsync(): Promise<PlatformMetric[]>;
    listComponents(): PlatformComponent[];
    listComponentsAsync(): Promise<PlatformComponent[]>;
    saveIncident(incident: PlatformIncident): PlatformIncident;
    saveIncidentAsync(incident: PlatformIncident): Promise<PlatformIncident>;
    findIncidentIdempotencyKey(key: string): PlatformIncidentIdempotencyRecord | undefined;
    findIncidentIdempotencyKeyAsync(key: string): Promise<PlatformIncidentIdempotencyRecord | undefined>;
    saveIncidentIdempotencyKey(record: PlatformIncidentIdempotencyRecord): PlatformIncidentIdempotencyRecord;
    saveIncidentIdempotencyKeyAsync(record: PlatformIncidentIdempotencyRecord): Promise<PlatformIncidentIdempotencyRecord>;
    listMaintenanceWindows(): Array<Record<string, unknown>>;
    listMaintenanceWindowsAsync(): Promise<Array<Record<string, unknown>>>;
    listIncidentPostmortems(): Array<Record<string, unknown>>;
    listIncidentPostmortemsAsync(): Promise<Array<Record<string, unknown>>>;
    listFeatureFlags(): FeatureFlag[];
    listFeatureFlagsAsync(): Promise<FeatureFlag[]>;
    saveFeatureFlag(flag: FeatureFlag): FeatureFlag;
    saveFeatureFlagAsync(flag: FeatureFlag): Promise<FeatureFlag>;
    saveFeatureFlagOutbox(outbox: PlatformFeatureFlagOutbox): PlatformFeatureFlagOutbox;
    saveFeatureFlagOutboxAsync(outbox: PlatformFeatureFlagOutbox): Promise<PlatformFeatureFlagOutbox>;
    saveFeatureFlagRule(rule: PlatformFeatureFlagRule): PlatformFeatureFlagRule;
    saveFeatureFlagRuleAsync(rule: PlatformFeatureFlagRule): Promise<PlatformFeatureFlagRule>;
    listFeatureFlagRules(filters?: PlatformFeatureFlagRuleFilters): PlatformFeatureFlagRule[];
    listFeatureFlagRulesAsync(filters?: PlatformFeatureFlagRuleFilters): Promise<PlatformFeatureFlagRule[]>;
    saveTelemetrySample(sample: PlatformTelemetrySample): PlatformTelemetrySample;
    saveTelemetrySampleAsync(sample: PlatformTelemetrySample): Promise<PlatformTelemetrySample>;
    listTelemetrySamples(filters?: PlatformTelemetrySampleFilters): PlatformTelemetrySample[];
    listTelemetrySamplesAsync(filters?: PlatformTelemetrySampleFilters): Promise<PlatformTelemetrySample[]>;
    saveHealthRollup(rollup: PlatformHealthRollup): PlatformHealthRollup;
    saveHealthRollupAsync(rollup: PlatformHealthRollup): Promise<PlatformHealthRollup>;
    listHealthRollups(filters?: PlatformHealthRollupFilters): PlatformHealthRollup[];
    listHealthRollupsAsync(filters?: PlatformHealthRollupFilters): Promise<PlatformHealthRollup[]>;
    saveAlertRoutingRule(rule: PlatformAlertRoutingRule): PlatformAlertRoutingRule;
    saveAlertRoutingRuleAsync(rule: PlatformAlertRoutingRule): Promise<PlatformAlertRoutingRule>;
    listAlertRoutingRules(filters?: PlatformAlertRoutingRuleFilters): PlatformAlertRoutingRule[];
    listAlertRoutingRulesAsync(filters?: PlatformAlertRoutingRuleFilters): Promise<PlatformAlertRoutingRule[]>;
    saveAlertAcknowledgement(acknowledgement: PlatformAlertAcknowledgement): PlatformAlertAcknowledgement;
    saveAlertAcknowledgementAsync(acknowledgement: PlatformAlertAcknowledgement): Promise<PlatformAlertAcknowledgement>;
    saveIncidentCommunicationAttempt(attempt: PlatformIncidentCommunicationAttempt): PlatformIncidentCommunicationAttempt;
    saveIncidentCommunicationAttemptAsync(attempt: PlatformIncidentCommunicationAttempt): Promise<PlatformIncidentCommunicationAttempt>;
    listIncidentCommunicationAttempts(filters?: PlatformIncidentCommunicationAttemptFilters): PlatformIncidentCommunicationAttempt[];
    listIncidentCommunicationAttemptsAsync(filters?: PlatformIncidentCommunicationAttemptFilters): Promise<PlatformIncidentCommunicationAttempt[]>;
    saveIncidentCommunicationRetry(retry: PlatformIncidentCommunicationRetry): PlatformIncidentCommunicationRetry;
    saveIncidentCommunicationRetryAsync(retry: PlatformIncidentCommunicationRetry): Promise<PlatformIncidentCommunicationRetry>;
    listIncidentCommunicationRetries(filters?: PlatformIncidentCommunicationRetryFilters): PlatformIncidentCommunicationRetry[];
    listIncidentCommunicationRetriesAsync(filters?: PlatformIncidentCommunicationRetryFilters): Promise<PlatformIncidentCommunicationRetry[]>;
    saveIncidentCommunicationDeadLetter(deadLetter: PlatformIncidentCommunicationDeadLetter): PlatformIncidentCommunicationDeadLetter;
    saveIncidentCommunicationDeadLetterAsync(deadLetter: PlatformIncidentCommunicationDeadLetter): Promise<PlatformIncidentCommunicationDeadLetter>;
    listIncidentCommunicationDeadLetters(filters?: PlatformIncidentCommunicationDeadLetterFilters): PlatformIncidentCommunicationDeadLetter[];
    listIncidentCommunicationDeadLettersAsync(filters?: PlatformIncidentCommunicationDeadLetterFilters): Promise<PlatformIncidentCommunicationDeadLetter[]>;
    findPlatformAuditRow(idempotencyKey: string): PlatformAuditRow | undefined;
    findPlatformAuditRowAsync(idempotencyKey: string): Promise<PlatformAuditRow | undefined>;
    savePlatformAuditRow(row: PlatformAuditRow): PlatformAuditRow;
    savePlatformAuditRowAsync(row: PlatformAuditRow): Promise<PlatformAuditRow>;
    listPlatformAuditRows(filters?: PlatformAuditRowFilters): PlatformAuditRow[];
    listPlatformAuditRowsAsync(filters?: PlatformAuditRowFilters): Promise<PlatformAuditRow[]>;
    findPlatformOutboxRow(idempotencyKey: string): PlatformOutboxRow | undefined;
    findPlatformOutboxRowAsync(idempotencyKey: string): Promise<PlatformOutboxRow | undefined>;
    savePlatformOutboxRow(row: PlatformOutboxRow): PlatformOutboxRow;
    savePlatformOutboxRowAsync(row: PlatformOutboxRow): Promise<PlatformOutboxRow>;
    updatePlatformOutboxRowStatus(idempotencyKey: string, status: string, payloadPatch?: Record<string, unknown>): PlatformOutboxRow;
    updatePlatformOutboxRowStatusAsync(idempotencyKey: string, status: string, payloadPatch?: Record<string, unknown>): Promise<PlatformOutboxRow>;
    listPlatformOutboxRows(filters?: PlatformOutboxRowFilters): PlatformOutboxRow[];
    listPlatformOutboxRowsAsync(filters?: PlatformOutboxRowFilters): Promise<PlatformOutboxRow[]>;
    private readCatalogState;
    private assertSyncRuntimeAvailable;
    private findRuntimeRecord;
    private listRuntimeRecords;
    private saveRuntimeRecord;
    private saveRuntimeRecordSynchronously;
}
export {};
