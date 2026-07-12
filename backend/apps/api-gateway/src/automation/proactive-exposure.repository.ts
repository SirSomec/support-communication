import { randomUUID } from "node:crypto";
import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";

export type ProactiveExposureStatus = "planned" | "delivered" | "shown" | "dismissed" | "accepted" | "failed";

export const DEFAULT_PROACTIVE_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProactiveExposure {
  acceptedAt: string | null;
  attributionWindowEndsAt: string | null;
  channelConnectionId: string;
  conversationId: string | null;
  dismissedAt: string | null;
  deliveredAt: string | null;
  experimentId: string;
  experimentVersion: string;
  exposureId: string;
  failedAt: string | null;
  failureCode: string | null;
  message: string;
  occurrenceKey: string;
  plannedAt: string;
  presenceSessionId: string;
  ruleId: string;
  segmentSnapshot: Record<string, unknown>;
  shownAt: string | null;
  status: ProactiveExposureStatus;
  subjectId: string;
  tenantId: string;
  variant: string;
}

export interface ProactiveConversionEvent {
  conversationId: string;
  conversionId: string;
  experimentId: string;
  experimentVersion: string;
  exposureId: string;
  messageId: string | null;
  occurredAt: string;
  ruleId: string;
  tenantId: string;
  trigger: "message";
  variant: string;
}

export interface ProactiveMetricBucket {
  counts: { accepted: number; converted: number; delivered: number; dismissed: number; eligible: number; planned: number; shown: number };
  rates: { acceptanceRate: number; conversionRate: number; deliveryRate: number; showRate: number };
  ruleId: string;
  variant: string;
}

interface ExposureState { conversions: ProactiveConversionEvent[]; exposures: ProactiveExposure[] }
interface PrismaExposureDelegate {
  create(input: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  findMany(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  findUnique(input: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
  updateMany(input: { data: Record<string, unknown>; where: Record<string, unknown> }): Promise<{ count: number }>;
}
interface PrismaConversionDelegate {
  create(input: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  findMany(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  findUnique(input: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
}
export interface PrismaExposureClient { proactiveConversionEvent?: PrismaConversionDelegate; proactiveExposure: PrismaExposureDelegate }

let defaultRepository: ProactiveExposureRepository | null = null;

export class ProactiveExposureRepository {
  private constructor(private readonly store: DurableStore<ExposureState>, private readonly prisma?: PrismaExposureClient) {}

  static default(): ProactiveExposureRepository {
    if (!defaultRepository) defaultRepository = ProactiveExposureRepository.inMemory();
    return defaultRepository;
  }
  static useDefault(repository: ProactiveExposureRepository): void { defaultRepository = repository; }
  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: ProactiveExposure[] = []): ProactiveExposureRepository {
    return new ProactiveExposureRepository(new InMemoryStore({ conversions: [], exposures: seed }));
  }
  static open(filePath: string): ProactiveExposureRepository {
    return new ProactiveExposureRepository(new JsonFileStore({ filePath, seed: { conversions: [], exposures: [] } }));
  }
  static prisma(client: PrismaExposureClient): ProactiveExposureRepository {
    return new ProactiveExposureRepository(new InMemoryStore({ conversions: [], exposures: [] }), client);
  }

  async createPlanned(input: Omit<ProactiveExposure, "exposureId" | "status" | "acceptedAt" | "attributionWindowEndsAt" | "conversationId" | "deliveredAt" | "dismissedAt" | "failedAt" | "failureCode" | "shownAt">): Promise<{ created: boolean; exposure: ProactiveExposure }> {
    const exposure: ProactiveExposure = { ...input, acceptedAt: null, attributionWindowEndsAt: null, conversationId: null,
      deliveredAt: null, dismissedAt: null, exposureId: `pex_${randomUUID()}`, failedAt: null, failureCode: null,
      shownAt: null, status: "planned" };
    if (!this.prisma) {
      let result = { created: true, exposure };
      this.store.update((state) => {
        const existing = state.exposures.find((item) => item.tenantId === input.tenantId && item.ruleId === input.ruleId
          && item.subjectId === input.subjectId && item.occurrenceKey === input.occurrenceKey);
        if (existing) result = { created: false, exposure: existing };
        return existing ? state : { ...state, conversions: state.conversions ?? [], exposures: [...state.exposures, exposure] };
      });
      return clone(result);
    }
    try { return { created: true, exposure: fromRow(await this.prisma.proactiveExposure.create({ data: toRow(exposure) })) }; }
    catch (error) {
      const existing = await this.prisma.proactiveExposure.findUnique({ where: { tenantId_ruleId_subjectId_occurrenceKey:
        { occurrenceKey: input.occurrenceKey, ruleId: input.ruleId, subjectId: input.subjectId, tenantId: input.tenantId } } });
      if (existing) return { created: false, exposure: fromRow(existing) };
      throw error;
    }
  }

  async listPendingForSession(tenantId: string, presenceSessionId: string, limit = 5): Promise<ProactiveExposure[]> {
    if (!this.prisma) return clone(this.store.read().exposures.filter((item) => item.tenantId === tenantId
      && item.presenceSessionId === presenceSessionId && ["planned", "delivered"].includes(item.status)).slice(0, limit));
    const rows = await this.prisma.proactiveExposure.findMany({ orderBy: { plannedAt: "asc" }, take: limit,
      where: { presenceSessionId, status: { in: ["planned", "delivered"] }, tenantId } });
    return rows.map(fromRow);
  }

  async markDelivered(input: { at: string; exposureId: string; presenceSessionId: string; tenantId: string }): Promise<ProactiveExposure | null> {
    return this.transition({ ...input, status: "delivered" });
  }

  async listRecent(tenantId: string, ruleId: string, subjectId: string, since: string): Promise<ProactiveExposure[]> {
    if (!this.prisma) return clone(this.store.read().exposures.filter((item) => item.tenantId === tenantId && item.ruleId === ruleId
      && item.subjectId === subjectId && Date.parse(item.plannedAt) >= Date.parse(since)));
    return (await this.prisma.proactiveExposure.findMany({ where: { plannedAt: { gte: new Date(since) }, ruleId, subjectId, tenantId } })).map(fromRow);
  }

  async transition(input: { at: string; attributionWindowMs?: number; conversationId?: string; exposureId: string; failureCode?: string;
    presenceSessionId: string; status: Exclude<ProactiveExposureStatus, "planned">; tenantId: string }): Promise<ProactiveExposure | null> {
    const deliverable = ["planned"];
    const visible = ["planned", "delivered"];
    const allowed = input.status === "delivered" ? deliverable : input.status === "shown" ? visible
      : input.status === "failed" ? [...visible, "shown"] : [...visible, "shown"];
    const timestamp = `${input.status}At`;
    if (!this.prisma) {
      let saved: ProactiveExposure | null = null;
      this.store.update((state) => ({ ...state, conversions: state.conversions ?? [], exposures: state.exposures.map((item) => {
        if (item.exposureId !== input.exposureId || item.tenantId !== input.tenantId || item.presenceSessionId !== input.presenceSessionId) return item;
        if (item.status === input.status) {
          saved = input.conversationId && !item.conversationId ? { ...item, conversationId: input.conversationId } : item;
          return saved;
        }
        if (!allowed.includes(item.status)) return item;
        saved = { ...item, status: input.status, [timestamp]: item[timestamp as keyof ProactiveExposure] ?? input.at,
          ...(input.status === "accepted" ? { attributionWindowEndsAt: item.attributionWindowEndsAt
            ?? new Date(Date.parse(input.at) + validAttributionWindowMs(input.attributionWindowMs)).toISOString() } : {}),
          ...(input.conversationId ? { conversationId: item.conversationId ?? input.conversationId } : {}),
          ...(input.failureCode ? { failureCode: input.failureCode } : {}) } as ProactiveExposure;
        return saved;
      }) }));
      return clone(saved);
    }
    const existing = await this.prisma.proactiveExposure.findUnique({ where: { exposureId: input.exposureId } });
    if (!existing || String(existing.tenantId) !== input.tenantId || String(existing.presenceSessionId) !== input.presenceSessionId) return null;
    if (String(existing.status) === input.status) {
      if (input.conversationId && !existing.conversationId) {
        await this.prisma.proactiveExposure.updateMany({ data: { conversationId: input.conversationId },
          where: { conversationId: null, exposureId: input.exposureId, presenceSessionId: input.presenceSessionId,
            status: input.status, tenantId: input.tenantId } });
        const enriched = await this.prisma.proactiveExposure.findUnique({ where: { exposureId: input.exposureId } });
        return enriched ? fromRow(enriched) : null;
      }
      return fromRow(existing);
    }
    if (!allowed.includes(String(existing.status))) return null;
    const data: Record<string, unknown> = { status: input.status, [timestamp]: new Date(input.at),
      ...(input.status === "accepted" && !existing.attributionWindowEndsAt ? { attributionWindowEndsAt: new Date(Date.parse(input.at)
        + validAttributionWindowMs(input.attributionWindowMs)) } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}), ...(input.failureCode ? { failureCode: input.failureCode } : {}) };
    const updated = await this.prisma.proactiveExposure.updateMany({ data, where: { exposureId: input.exposureId,
      presenceSessionId: input.presenceSessionId, status: { in: allowed }, tenantId: input.tenantId } });
    if (updated.count === 0) return null;
    const row = await this.prisma.proactiveExposure.findUnique({ where: { exposureId: input.exposureId } });
    return row && String(row.tenantId) === input.tenantId && String(row.presenceSessionId) === input.presenceSessionId ? fromRow(row) : null;
  }

  async recordMessageConversion(input: { conversationId: string; messageId?: string | null; occurredAt: string; tenantId: string }): Promise<ProactiveConversionEvent | null> {
    const candidates = await this.findAttributableExposures(input.tenantId, input.conversationId);
    const occurredAt = validTimestamp(input.occurredAt);
    const exposure = candidates.find((item) => item.acceptedAt && Date.parse(item.acceptedAt) <= Date.parse(occurredAt)
      && Date.parse(item.attributionWindowEndsAt ?? new Date(Date.parse(item.acceptedAt) + DEFAULT_PROACTIVE_ATTRIBUTION_WINDOW_MS).toISOString()) >= Date.parse(occurredAt));
    if (!exposure) return null;
    const conversion: ProactiveConversionEvent = { conversationId: input.conversationId, conversionId: `pcv_${randomUUID()}`,
      experimentId: exposure.experimentId, experimentVersion: exposure.experimentVersion, exposureId: exposure.exposureId,
      messageId: input.messageId ? String(input.messageId) : null, occurredAt, ruleId: exposure.ruleId, tenantId: input.tenantId,
      trigger: "message", variant: exposure.variant };
    if (!this.prisma || !this.prisma.proactiveConversionEvent) {
      let saved: ProactiveConversionEvent | null = conversion;
      this.store.update((state) => {
        const existing = (state.conversions ?? []).find((item) => item.tenantId === input.tenantId && item.exposureId === exposure.exposureId);
        if (existing) saved = existing;
        return existing ? state : { ...state, conversions: [...(state.conversions ?? []), conversion] };
      });
      return clone(saved);
    }
    try { return conversionFromRow(await this.prisma.proactiveConversionEvent.create({ data: conversionToRow(conversion) })); }
    catch {
      const existing = await this.prisma.proactiveConversionEvent.findUnique({ where: { tenantId_exposureId: { exposureId: exposure.exposureId, tenantId: input.tenantId } } });
      return existing ? conversionFromRow(existing) : null;
    }
  }

  async aggregateMetrics(input: { from: string; ruleVariants: Array<{ ruleId: string; variant: string }>; tenantId: string; to: string }): Promise<ProactiveMetricBucket[]> {
    const from = validTimestamp(input.from); const to = validTimestamp(input.to);
    const exposures = await this.listInRange(input.tenantId, from, to);
    const conversions = await this.listConversionsInRange(input.tenantId, from, to);
    const keys = new Map(input.ruleVariants.map((item) => [`${item.ruleId}\u0000${item.variant}`, item]));
    for (const exposure of exposures) keys.set(`${exposure.ruleId}\u0000${exposure.variant}`, { ruleId: exposure.ruleId, variant: exposure.variant });
    return [...keys.values()].sort((a, b) => `${a.ruleId}:${a.variant}`.localeCompare(`${b.ruleId}:${b.variant}`)).map((item) => {
      const own = exposures.filter((exposure) => exposure.ruleId === item.ruleId && exposure.variant === item.variant);
      const planned = own.filter((item) => inRange(item.plannedAt, from, to)).length;
      const counts = { eligible: planned, planned,
        delivered: own.filter((item) => item.deliveredAt && inRange(item.deliveredAt, from, to)).length,
        shown: own.filter((item) => item.shownAt && inRange(item.shownAt, from, to)).length,
        dismissed: own.filter((item) => item.dismissedAt && inRange(item.dismissedAt, from, to)).length,
        accepted: own.filter((item) => item.acceptedAt && inRange(item.acceptedAt, from, to)).length,
        converted: conversions.filter((conversion) => conversion.ruleId === item.ruleId && conversion.variant === item.variant).length };
      return { counts, rates: { acceptanceRate: ratio(counts.accepted, counts.shown), conversionRate: ratio(counts.converted, counts.accepted),
        deliveryRate: ratio(counts.delivered, counts.eligible), showRate: ratio(counts.shown, counts.delivered) }, ruleId: item.ruleId, variant: item.variant };
    });
  }

  private async findAttributableExposures(tenantId: string, conversationId: string): Promise<ProactiveExposure[]> {
    if (!this.prisma) return this.store.read().exposures.filter((item) => item.tenantId === tenantId && item.conversationId === conversationId && item.status === "accepted");
    return (await this.prisma.proactiveExposure.findMany({ orderBy: { acceptedAt: "desc" }, where: { conversationId, status: "accepted", tenantId } })).map(fromRow);
  }
  private async listInRange(tenantId: string, from: string, to: string): Promise<ProactiveExposure[]> {
    if (!this.prisma) return this.store.read().exposures.filter((item) => item.tenantId === tenantId && [item.plannedAt, item.deliveredAt,
      item.shownAt, item.dismissedAt, item.acceptedAt].some((timestamp) => inRange(timestamp, from, to)));
    const range = { gte: new Date(from), lte: new Date(to) };
    return (await this.prisma.proactiveExposure.findMany({ where: { OR: [{ plannedAt: range }, { deliveredAt: range }, { shownAt: range },
      { dismissedAt: range }, { acceptedAt: range }], tenantId } })).map(fromRow);
  }
  private async listConversionsInRange(tenantId: string, from: string, to: string): Promise<ProactiveConversionEvent[]> {
    if (!this.prisma || !this.prisma.proactiveConversionEvent) return (this.store.read().conversions ?? []).filter((item) => item.tenantId === tenantId && inRange(item.occurredAt, from, to));
    return (await this.prisma.proactiveConversionEvent.findMany({ where: { occurredAt: { gte: new Date(from), lte: new Date(to) }, tenantId } })).map(conversionFromRow);
  }
}

function toRow(value: ProactiveExposure): Record<string, unknown> { return { ...value, acceptedAt: null, attributionWindowEndsAt: null, createdAt: new Date(value.plannedAt),
  deliveredAt: null, dismissedAt: null, failedAt: null, plannedAt: new Date(value.plannedAt), shownAt: null, updatedAt: new Date(value.plannedAt) }; }
function fromRow(row: Record<string, unknown>): ProactiveExposure { return {
  acceptedAt: isoOrNull(row.acceptedAt), attributionWindowEndsAt: isoOrNull(row.attributionWindowEndsAt), channelConnectionId: String(row.channelConnectionId), conversationId: textOrNull(row.conversationId),
  deliveredAt: isoOrNull(row.deliveredAt), dismissedAt: isoOrNull(row.dismissedAt), experimentId: String(row.experimentId), experimentVersion: String(row.experimentVersion),
  exposureId: String(row.exposureId), failedAt: isoOrNull(row.failedAt), failureCode: textOrNull(row.failureCode), message: String(row.message),
  occurrenceKey: String(row.occurrenceKey), plannedAt: iso(row.plannedAt), presenceSessionId: String(row.presenceSessionId), ruleId: String(row.ruleId),
  segmentSnapshot: (row.segmentSnapshot && typeof row.segmentSnapshot === "object" ? row.segmentSnapshot : {}) as Record<string, unknown>,
  shownAt: isoOrNull(row.shownAt), status: String(row.status) as ProactiveExposureStatus, subjectId: String(row.subjectId),
  tenantId: String(row.tenantId), variant: String(row.variant) }; }
function iso(value: unknown): string { return new Date(value as string | Date).toISOString(); }
function isoOrNull(value: unknown): string | null { return value ? iso(value) : null; }
function textOrNull(value: unknown): string | null { return value == null ? null : String(value); }
function conversionToRow(value: ProactiveConversionEvent): Record<string, unknown> { return { ...value, occurredAt: new Date(value.occurredAt), createdAt: new Date(value.occurredAt) }; }
function conversionFromRow(row: Record<string, unknown>): ProactiveConversionEvent { return { conversationId: String(row.conversationId), conversionId: String(row.conversionId),
  experimentId: String(row.experimentId), experimentVersion: String(row.experimentVersion), exposureId: String(row.exposureId), messageId: textOrNull(row.messageId),
  occurredAt: iso(row.occurredAt), ruleId: String(row.ruleId), tenantId: String(row.tenantId), trigger: "message", variant: String(row.variant) }; }
function validAttributionWindowMs(value: number | undefined): number { return Number.isInteger(value) && Number(value) > 0 ? Number(value) : DEFAULT_PROACTIVE_ATTRIBUTION_WINDOW_MS; }
function validTimestamp(value: string): string { return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString(); }
function inRange(value: string | null, from: string, to: string): boolean { return Boolean(value) && Date.parse(value!) >= Date.parse(from) && Date.parse(value!) <= Date.parse(to); }
function ratio(numerator: number, denominator: number): number { return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
