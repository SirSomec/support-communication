import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import type { FeatureFlag, PlatformComponent, PlatformIncident } from "./platform.fixtures.js";
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
  incidents: PlatformIncident[];
  platformAuditRows: PlatformAuditRow[];
  platformOutboxRows: PlatformOutboxRow[];
  telemetrySamples: PlatformTelemetrySample[];
}

interface PlatformRepositoryOptions {
  filePath: string;
}

let defaultRepository: PlatformRepository | null = null;

export class PlatformRepository implements PlatformAuditOutboxRepository {
  private constructor(private readonly store: DurableStore<PlatformState>) {}

  static default(): PlatformRepository {
    return defaultRepository ?? PlatformRepository.inMemory();
  }

  static useDefault(repository: PlatformRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: PlatformState = seedPlatformState()): PlatformRepository {
    return new PlatformRepository(new InMemoryStore(seed));
  }

  static open({ filePath }: PlatformRepositoryOptions): PlatformRepository {
    return new PlatformRepository(new JsonFileStore({ filePath, seed: seedPlatformState() }));
  }

  readState(): PlatformState {
    return normalizeState(this.store.read());
  }

  listComponents(): PlatformComponent[] {
    return clone(this.readState().components);
  }

  listIncidents(): PlatformIncident[] {
    return clone(this.readState().incidents);
  }

  saveIncident(incident: PlatformIncident): PlatformIncident {
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

  findIncidentIdempotencyKey(key: string): PlatformIncidentIdempotencyRecord | undefined {
    return clone(this.readState().incidentIdempotencyKeys.find((item) => item.key === key));
  }

  saveIncidentIdempotencyKey(record: PlatformIncidentIdempotencyRecord): PlatformIncidentIdempotencyRecord {
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

  listFeatureFlags(): FeatureFlag[] {
    return clone(this.readState().featureFlags);
  }

  saveFeatureFlag(flag: FeatureFlag): FeatureFlag {
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

  saveFeatureFlagOutbox(outbox: PlatformFeatureFlagOutbox): PlatformFeatureFlagOutbox {
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

  saveFeatureFlagRule(rule: PlatformFeatureFlagRule): PlatformFeatureFlagRule {
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

  listFeatureFlagRules(filters: PlatformFeatureFlagRuleFilters = {}): PlatformFeatureFlagRule[] {
    const items = this.readState().featureFlagRules.filter((rule) => {
      const flagMatches = !filters.flagId || rule.flagId === filters.flagId;
      const keyMatches = !filters.flagKey || rule.flagKey === filters.flagKey;
      const targetingMatches = !filters.targeting || rule.targeting === filters.targeting;

      return flagMatches && keyMatches && targetingMatches;
    });

    return clone(items);
  }

  saveTelemetrySample(sample: PlatformTelemetrySample): PlatformTelemetrySample {
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

  saveHealthRollup(rollup: PlatformHealthRollup): PlatformHealthRollup {
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

  saveAlertRoutingRule(rule: PlatformAlertRoutingRule): PlatformAlertRoutingRule {
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

  saveAlertAcknowledgement(acknowledgement: PlatformAlertAcknowledgement): PlatformAlertAcknowledgement {
    const persisted = clone(acknowledgement);
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        alertAcknowledgements: [persisted, ...current.alertAcknowledgements]
      };
    });

    return clone(persisted);
  }

  saveIncidentCommunicationAttempt(
    attempt: PlatformIncidentCommunicationAttempt
  ): PlatformIncidentCommunicationAttempt {
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

  saveIncidentCommunicationRetry(retry: PlatformIncidentCommunicationRetry): PlatformIncidentCommunicationRetry {
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

  saveIncidentCommunicationDeadLetter(
    deadLetter: PlatformIncidentCommunicationDeadLetter
  ): PlatformIncidentCommunicationDeadLetter {
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

  findPlatformAuditRow(idempotencyKey: string): PlatformAuditRow | undefined {
    return clone(this.readState().platformAuditRows.find((item) => item.idempotencyKey === idempotencyKey));
  }

  savePlatformAuditRow(row: PlatformAuditRow): PlatformAuditRow {
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

  listPlatformAuditRows(filters: PlatformAuditRowFilters = {}): PlatformAuditRow[] {
    const items = this.readState().platformAuditRows.filter((row) => {
      const kindMatches = !filters.mutationKind || row.mutationKind === filters.mutationKind;
      const idempotencyMatches = !filters.idempotencyKey || row.idempotencyKey === filters.idempotencyKey;
      const targetMatches = !filters.target || row.target === filters.target;

      return kindMatches && idempotencyMatches && targetMatches;
    });

    return clone(items);
  }

  findPlatformOutboxRow(idempotencyKey: string): PlatformOutboxRow | undefined {
    return clone(this.readState().platformOutboxRows.find((item) => item.idempotencyKey === idempotencyKey));
  }

  savePlatformOutboxRow(row: PlatformOutboxRow): PlatformOutboxRow {
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

  updatePlatformOutboxRowStatus(
    idempotencyKey: string,
    status: string,
    payloadPatch: Record<string, unknown> = {}
  ): PlatformOutboxRow {
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

  listPlatformOutboxRows(filters: PlatformOutboxRowFilters = {}): PlatformOutboxRow[] {
    const items = this.readState().platformOutboxRows.filter((row) => {
      const kindMatches = !filters.mutationKind || row.mutationKind === filters.mutationKind;

      return kindMatches;
    });

    return clone(items);
  }
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
    incidents: [],
    platformAuditRows: [],
    platformOutboxRows: [],
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
    incidents: state.incidents ?? [],
    platformAuditRows: state.platformAuditRows ?? [],
    platformOutboxRows: state.platformOutboxRows ?? [],
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
