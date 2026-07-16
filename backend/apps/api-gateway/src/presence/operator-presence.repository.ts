import { randomUUID } from "node:crypto";
import { type DurableStore, InMemoryStore } from "@support-communication/database";
import {
  isOperatorPresenceStatus,
  type OperatorPresenceCurrentRecord,
  type OperatorPresenceIntervalRecord,
  type OperatorPresenceStatus
} from "./operator-presence.types.js";

export interface OperatorPresenceState {
  intervals: OperatorPresenceIntervalRecord[];
}

export interface OperatorPresenceSetStatusInput {
  at?: Date;
  changedBy?: string | null;
  operatorId: string;
  status: OperatorPresenceStatus;
  tenantId: string;
}

export interface OperatorPresenceSetStatusResult {
  changed: boolean;
  current: OperatorPresenceCurrentRecord;
  previous: OperatorPresenceCurrentRecord | null;
}

export interface OperatorPresenceRange {
  from: Date;
  to: Date;
}

export interface OperatorPresenceRepositoryPort {
  findCurrent(tenantId: string, operatorId: string): Promise<OperatorPresenceCurrentRecord | null>;
  listCurrent(tenantId: string): Promise<OperatorPresenceCurrentRecord[]>;
  listIntervalsInRange(tenantId: string, range: OperatorPresenceRange): Promise<OperatorPresenceIntervalRecord[]>;
  setStatus(input: OperatorPresenceSetStatusInput): Promise<OperatorPresenceSetStatusResult>;
}

interface PrismaOperatorPresenceIntervalRow {
  changedBy: string | null;
  endedAt: Date | null;
  id: string;
  operatorId: string;
  startedAt: Date;
  status: string;
  tenantId: string;
}

export interface PrismaOperatorPresenceClient {
  operatorPresenceInterval: {
    create(input: { data: Record<string, unknown> }): Promise<PrismaOperatorPresenceIntervalRow>;
    findMany(input: {
      orderBy?: Array<Record<string, "asc" | "desc">>;
      where: Record<string, unknown>;
    }): Promise<PrismaOperatorPresenceIntervalRow[]>;
    updateMany(input: { data: Record<string, unknown>; where: Record<string, unknown> }): Promise<unknown>;
  };
  $transaction<T>(callback: (client: PrismaOperatorPresenceClient) => Promise<T>): Promise<T>;
}

export interface OperatorPresencePrismaOptions {
  client: PrismaOperatorPresenceClient;
}

let defaultRepository: OperatorPresenceRepository | null = null;

export class OperatorPresenceRepository implements OperatorPresenceRepositoryPort {
  private constructor(private readonly adapter: OperatorPresenceRepositoryPort) {}

  static default(): OperatorPresenceRepository {
    defaultRepository ??= OperatorPresenceRepository.inMemory();
    return defaultRepository;
  }

  static useDefault(repository: OperatorPresenceRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: Partial<OperatorPresenceState> = {}): OperatorPresenceRepository {
    return new OperatorPresenceRepository(createStoreAdapter(new InMemoryStore(normalizeState(seed))));
  }

  static prisma(options: OperatorPresencePrismaOptions): OperatorPresenceRepository {
    return new OperatorPresenceRepository(createPrismaAdapter(options.client));
  }

  findCurrent(tenantId: string, operatorId: string): Promise<OperatorPresenceCurrentRecord | null> {
    return this.adapter.findCurrent(requireId(tenantId, "tenantId"), requireId(operatorId, "operatorId"));
  }

  listCurrent(tenantId: string): Promise<OperatorPresenceCurrentRecord[]> {
    return this.adapter.listCurrent(requireId(tenantId, "tenantId"));
  }

  listIntervalsInRange(tenantId: string, range: OperatorPresenceRange): Promise<OperatorPresenceIntervalRecord[]> {
    return this.adapter.listIntervalsInRange(requireId(tenantId, "tenantId"), range);
  }

  setStatus(input: OperatorPresenceSetStatusInput): Promise<OperatorPresenceSetStatusResult> {
    requireId(input.tenantId, "tenantId");
    requireId(input.operatorId, "operatorId");
    if (!isOperatorPresenceStatus(input.status)) {
      throw new TypeError(`Unsupported operator presence status: ${String(input.status)}`);
    }
    return this.adapter.setStatus(input);
  }
}

function createStoreAdapter(store: DurableStore<OperatorPresenceState>): OperatorPresenceRepositoryPort {
  return {
    async findCurrent(tenantId, operatorId) {
      const open = findOpenInterval(store.read().intervals, tenantId, operatorId);
      return open ? toCurrentRecord(open) : null;
    },
    async listCurrent(tenantId) {
      return store.read().intervals
        .filter((interval) => interval.tenantId === tenantId && interval.endedAt === null)
        .map(toCurrentRecord);
    },
    async listIntervalsInRange(tenantId, range) {
      return store.read().intervals.filter((interval) => intervalOverlapsRange(interval, tenantId, range));
    },
    async setStatus(input) {
      const at = (input.at ?? new Date()).toISOString();
      let result: OperatorPresenceSetStatusResult | null = null;
      store.update((state) => {
        const open = findOpenInterval(state.intervals, input.tenantId, input.operatorId);
        if (open && open.status === input.status) {
          result = { changed: false, current: toCurrentRecord(open), previous: toCurrentRecord(open) };
          return state;
        }
        const nextInterval: OperatorPresenceIntervalRecord = {
          changedBy: input.changedBy ?? null,
          endedAt: null,
          id: `opi_${randomUUID()}`,
          operatorId: input.operatorId,
          startedAt: at,
          status: input.status,
          tenantId: input.tenantId
        };
        const intervals = state.intervals.map((interval) =>
          interval.tenantId === input.tenantId && interval.operatorId === input.operatorId && interval.endedAt === null
            ? { ...interval, endedAt: at }
            : interval
        );
        result = {
          changed: true,
          current: toCurrentRecord(nextInterval),
          previous: open ? toCurrentRecord(open) : null
        };
        return { intervals: [...intervals, nextInterval] };
      });
      return result!;
    }
  };
}

function createPrismaAdapter(client: PrismaOperatorPresenceClient): OperatorPresenceRepositoryPort {
  return {
    async findCurrent(tenantId, operatorId) {
      const rows = await client.operatorPresenceInterval.findMany({
        orderBy: [{ startedAt: "desc" }],
        where: { endedAt: null, operatorId, tenantId }
      });
      return rows.length ? toCurrentRecord(fromPrismaRow(rows[0])) : null;
    },
    async listCurrent(tenantId) {
      const rows = await client.operatorPresenceInterval.findMany({
        orderBy: [{ startedAt: "asc" }],
        where: { endedAt: null, tenantId }
      });
      return rows.map((row) => toCurrentRecord(fromPrismaRow(row)));
    },
    async listIntervalsInRange(tenantId, range) {
      const rows = await client.operatorPresenceInterval.findMany({
        orderBy: [{ startedAt: "asc" }],
        where: {
          OR: [{ endedAt: null }, { endedAt: { gt: range.from } }],
          startedAt: { lt: range.to },
          tenantId
        }
      });
      return rows.map(fromPrismaRow);
    },
    async setStatus(input) {
      const at = input.at ?? new Date();
      return client.$transaction(async (transaction) => {
        const openRows = await transaction.operatorPresenceInterval.findMany({
          orderBy: [{ startedAt: "desc" }],
          where: { endedAt: null, operatorId: input.operatorId, tenantId: input.tenantId }
        });
        const open = openRows.length ? fromPrismaRow(openRows[0]) : null;
        if (open && open.status === input.status) {
          return { changed: false, current: toCurrentRecord(open), previous: toCurrentRecord(open) };
        }
        await transaction.operatorPresenceInterval.updateMany({
          data: { endedAt: at, updatedAt: at },
          where: { endedAt: null, operatorId: input.operatorId, tenantId: input.tenantId }
        });
        const created = await transaction.operatorPresenceInterval.create({
          data: {
            changedBy: input.changedBy ?? null,
            endedAt: null,
            id: `opi_${randomUUID()}`,
            operatorId: input.operatorId,
            startedAt: at,
            status: input.status,
            tenantId: input.tenantId
          }
        });
        return {
          changed: true,
          current: toCurrentRecord(fromPrismaRow(created)),
          previous: open ? toCurrentRecord(open) : null
        };
      });
    }
  };
}

function normalizeState(seed: Partial<OperatorPresenceState> | undefined): OperatorPresenceState {
  return { intervals: (seed?.intervals ?? []).map((interval) => ({ ...interval })) };
}

function findOpenInterval(
  intervals: OperatorPresenceIntervalRecord[],
  tenantId: string,
  operatorId: string
): OperatorPresenceIntervalRecord | undefined {
  return intervals.find((interval) =>
    interval.tenantId === tenantId && interval.operatorId === operatorId && interval.endedAt === null
  );
}

function intervalOverlapsRange(interval: OperatorPresenceIntervalRecord, tenantId: string, range: OperatorPresenceRange): boolean {
  if (interval.tenantId !== tenantId) return false;
  if (new Date(interval.startedAt).getTime() >= range.to.getTime()) return false;
  return interval.endedAt === null || new Date(interval.endedAt).getTime() > range.from.getTime();
}

function toCurrentRecord(interval: OperatorPresenceIntervalRecord): OperatorPresenceCurrentRecord {
  return {
    changedBy: interval.changedBy,
    operatorId: interval.operatorId,
    since: interval.startedAt,
    status: interval.status,
    tenantId: interval.tenantId
  };
}

function fromPrismaRow(row: PrismaOperatorPresenceIntervalRow): OperatorPresenceIntervalRecord {
  return {
    changedBy: row.changedBy ?? null,
    endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
    id: String(row.id),
    operatorId: String(row.operatorId),
    startedAt: new Date(row.startedAt).toISOString(),
    status: row.status as OperatorPresenceStatus,
    tenantId: String(row.tenantId)
  };
}

function requireId(value: string, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new TypeError(`${field} is required for operator presence access.`);
  }
  return normalized;
}
