import { type DurableStore, InMemoryStore } from "@support-communication/database";

export interface CurrentShiftRecord {
  endsAt: string;
  name: string;
  operatorIds: string[];
  startsAt: string;
  tenantId: string;
  updatedAt: string;
}

export interface SaveCurrentShiftInput {
  endsAt: Date;
  name: string;
  operatorIds: string[];
  startsAt: Date;
  tenantId: string;
  updatedAt?: Date;
}

export interface CurrentShiftRepositoryPort {
  findCurrent(tenantId: string): Promise<CurrentShiftRecord | null>;
  saveCurrent(input: SaveCurrentShiftInput): Promise<CurrentShiftRecord>;
}

interface CurrentShiftState {
  shifts: CurrentShiftRecord[];
}

export interface PrismaCurrentShiftRow {
  endsAt: Date;
  name: string;
  operatorIds: string[];
  startsAt: Date;
  tenantId: string;
  updatedAt: Date;
}

export interface PrismaCurrentShiftClient {
  currentShift: {
    findUnique(input: { where: { tenantId: string } }): Promise<PrismaCurrentShiftRow | null>;
    upsert(input: {
      create: {
        endsAt: Date;
        name: string;
        operatorIds: string[];
        startsAt: Date;
        tenantId: string;
        updatedAt: Date;
      };
      update: {
        endsAt: Date;
        name: string;
        operatorIds: string[];
        startsAt: Date;
        updatedAt: Date;
      };
      where: { tenantId: string };
    }): Promise<PrismaCurrentShiftRow>;
  };
}

export interface CurrentShiftPrismaOptions {
  client: PrismaCurrentShiftClient;
}

let defaultRepository: CurrentShiftRepository | null = null;

/**
 * One explicitly managed shift configuration per tenant. Keeping the tenant
 * id as the primary key makes the "current" resource atomic and naturally
 * tenant-scoped in both Prisma and the local fallback.
 */
export class CurrentShiftRepository implements CurrentShiftRepositoryPort {
  private constructor(private readonly adapter: CurrentShiftRepositoryPort) {}

  static default(): CurrentShiftRepository {
    defaultRepository ??= CurrentShiftRepository.inMemory();
    return defaultRepository;
  }

  static useDefault(repository: CurrentShiftRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: Partial<CurrentShiftState> = {}): CurrentShiftRepository {
    return new CurrentShiftRepository(createStoreAdapter(new InMemoryStore(normalizeState(seed))));
  }

  static prisma(options: CurrentShiftPrismaOptions): CurrentShiftRepository {
    return new CurrentShiftRepository(createPrismaAdapter(options.client));
  }

  findCurrent(tenantId: string): Promise<CurrentShiftRecord | null> {
    return this.adapter.findCurrent(requireId(tenantId, "tenantId"));
  }

  saveCurrent(input: SaveCurrentShiftInput): Promise<CurrentShiftRecord> {
    return this.adapter.saveCurrent(normalizeSaveInput(input));
  }
}

function createStoreAdapter(store: DurableStore<CurrentShiftState>): CurrentShiftRepositoryPort {
  return {
    async findCurrent(tenantId) {
      const shift = store.read().shifts.find((item) => item.tenantId === tenantId);
      return shift ? cloneRecord(shift) : null;
    },
    async saveCurrent(input) {
      const record = toRecord(input);
      store.update((state) => ({
        shifts: [...state.shifts.filter((item) => item.tenantId !== record.tenantId), record]
      }));
      return cloneRecord(record);
    }
  };
}

function createPrismaAdapter(client: PrismaCurrentShiftClient): CurrentShiftRepositoryPort {
  return {
    async findCurrent(tenantId) {
      const row = await client.currentShift.findUnique({ where: { tenantId } });
      return row ? fromPrismaRow(row) : null;
    },
    async saveCurrent(input) {
      const updatedAt = input.updatedAt ?? new Date();
      const row = await client.currentShift.upsert({
        create: {
          endsAt: input.endsAt,
          name: input.name,
          operatorIds: [...input.operatorIds],
          startsAt: input.startsAt,
          tenantId: input.tenantId,
          updatedAt
        },
        update: {
          endsAt: input.endsAt,
          name: input.name,
          operatorIds: [...input.operatorIds],
          startsAt: input.startsAt,
          updatedAt
        },
        where: { tenantId: input.tenantId }
      });
      return fromPrismaRow(row);
    }
  };
}

function normalizeState(seed: Partial<CurrentShiftState>): CurrentShiftState {
  const byTenant = new Map<string, CurrentShiftRecord>();
  for (const shift of seed.shifts ?? []) {
    const normalized = normalizeRecord(shift);
    byTenant.set(normalized.tenantId, normalized);
  }
  return { shifts: [...byTenant.values()] };
}

function normalizeSaveInput(input: SaveCurrentShiftInput): SaveCurrentShiftInput {
  const startsAt = requireDate(input.startsAt, "startsAt");
  const endsAt = requireDate(input.endsAt, "endsAt");
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new TypeError("endsAt must be later than startsAt for current shift persistence.");
  }

  return {
    endsAt,
    name: requireName(input.name),
    operatorIds: normalizeOperatorIds(input.operatorIds),
    startsAt,
    tenantId: requireId(input.tenantId, "tenantId"),
    ...(input.updatedAt ? { updatedAt: requireDate(input.updatedAt, "updatedAt") } : {})
  };
}

function normalizeRecord(record: CurrentShiftRecord): CurrentShiftRecord {
  const startsAt = requireDate(record.startsAt, "startsAt");
  const endsAt = requireDate(record.endsAt, "endsAt");
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new TypeError("endsAt must be later than startsAt for current shift persistence.");
  }
  return {
    endsAt: endsAt.toISOString(),
    name: requireName(record.name),
    operatorIds: normalizeOperatorIds(record.operatorIds),
    startsAt: startsAt.toISOString(),
    tenantId: requireId(record.tenantId, "tenantId"),
    updatedAt: requireDate(record.updatedAt, "updatedAt").toISOString()
  };
}

function toRecord(input: SaveCurrentShiftInput): CurrentShiftRecord {
  const updatedAt = input.updatedAt ?? new Date();
  return {
    endsAt: input.endsAt.toISOString(),
    name: input.name,
    operatorIds: [...input.operatorIds],
    startsAt: input.startsAt.toISOString(),
    tenantId: input.tenantId,
    updatedAt: updatedAt.toISOString()
  };
}

function fromPrismaRow(row: PrismaCurrentShiftRow): CurrentShiftRecord {
  return {
    endsAt: new Date(row.endsAt).toISOString(),
    name: String(row.name),
    operatorIds: [...(row.operatorIds ?? [])].map((operatorId) => String(operatorId)),
    startsAt: new Date(row.startsAt).toISOString(),
    tenantId: String(row.tenantId),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

function cloneRecord(record: CurrentShiftRecord): CurrentShiftRecord {
  return { ...record, operatorIds: [...record.operatorIds] };
}

function requireId(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new TypeError(`${field} is required for current shift access.`);
  }
  return normalized;
}

function requireName(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new TypeError("name is required for current shift persistence.");
  }
  return normalized;
}

function normalizeOperatorIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError("operatorIds must be an array for current shift persistence.");
  }
  const operatorIds = value.map((operatorId) => requireId(operatorId, "operatorId"));
  if (new Set(operatorIds).size !== operatorIds.length) {
    throw new TypeError("operatorIds must be unique for current shift persistence.");
  }
  return operatorIds;
}

function requireDate(value: unknown, field: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${field} must be a valid date for current shift persistence.`);
  }
  return date;
}
