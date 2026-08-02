import { randomUUID } from "node:crypto";
import { InMemoryStore } from "@support-communication/database";
import { isOperatorPresenceStatus } from "./operator-presence.types.js";
let defaultRepository = null;
export class OperatorPresenceRepository {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    static default() {
        defaultRepository ??= OperatorPresenceRepository.inMemory();
        return defaultRepository;
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static clearDefault() {
        defaultRepository = null;
    }
    static inMemory(seed = {}) {
        return new OperatorPresenceRepository(createStoreAdapter(new InMemoryStore(normalizeState(seed))));
    }
    static prisma(options) {
        return new OperatorPresenceRepository(createPrismaAdapter(options.client));
    }
    findCurrent(tenantId, operatorId) {
        return this.adapter.findCurrent(requireId(tenantId, "tenantId"), requireId(operatorId, "operatorId"));
    }
    listCurrent(tenantId) {
        return this.adapter.listCurrent(requireId(tenantId, "tenantId"));
    }
    listIntervalsInRange(tenantId, range) {
        return this.adapter.listIntervalsInRange(requireId(tenantId, "tenantId"), range);
    }
    setStatus(input) {
        requireId(input.tenantId, "tenantId");
        requireId(input.operatorId, "operatorId");
        if (!isOperatorPresenceStatus(input.status)) {
            throw new TypeError(`Unsupported operator presence status: ${String(input.status)}`);
        }
        return this.adapter.setStatus(input);
    }
    setStatusIfCurrent(input) {
        requireId(input.tenantId, "tenantId");
        requireId(input.operatorId, "operatorId");
        if (!isOperatorPresenceStatus(input.status) || !isOperatorPresenceStatus(input.expectedStatus)) {
            throw new TypeError("Unsupported operator presence status.");
        }
        return this.adapter.setStatusIfCurrent(input);
    }
}
function createStoreAdapter(store) {
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
            let result = null;
            store.update((state) => {
                const open = findOpenInterval(state.intervals, input.tenantId, input.operatorId);
                if (open && open.status === input.status) {
                    result = { changed: false, current: toCurrentRecord(open), previous: toCurrentRecord(open) };
                    return state;
                }
                const nextInterval = {
                    changedBy: input.changedBy ?? null,
                    endedAt: null,
                    id: `opi_${randomUUID()}`,
                    operatorId: input.operatorId,
                    startedAt: at,
                    status: input.status,
                    tenantId: input.tenantId
                };
                const intervals = state.intervals.map((interval) => interval.tenantId === input.tenantId && interval.operatorId === input.operatorId && interval.endedAt === null
                    ? { ...interval, endedAt: at }
                    : interval);
                result = {
                    changed: true,
                    current: toCurrentRecord(nextInterval),
                    previous: open ? toCurrentRecord(open) : null
                };
                return { intervals: [...intervals, nextInterval] };
            });
            return result;
        },
        async setStatusIfCurrent(input) {
            const at = (input.at ?? new Date()).toISOString();
            let result = null;
            store.update((state) => {
                const open = findOpenInterval(state.intervals, input.tenantId, input.operatorId);
                if (!open || open.status !== input.expectedStatus) {
                    result = {
                        changed: false,
                        conditionMatched: false,
                        current: open ? toCurrentRecord(open) : null,
                        previous: open ? toCurrentRecord(open) : null
                    };
                    return state;
                }
                const nextInterval = {
                    changedBy: input.changedBy ?? null,
                    endedAt: null,
                    id: `opi_${randomUUID()}`,
                    operatorId: input.operatorId,
                    startedAt: at,
                    status: input.status,
                    tenantId: input.tenantId
                };
                const intervals = state.intervals.map((interval) => interval.tenantId === input.tenantId && interval.operatorId === input.operatorId && interval.endedAt === null
                    ? { ...interval, endedAt: at }
                    : interval);
                result = {
                    changed: true,
                    conditionMatched: true,
                    current: toCurrentRecord(nextInterval),
                    previous: toCurrentRecord(open)
                };
                return { intervals: [...intervals, nextInterval] };
            });
            return result;
        }
    };
}
function createPrismaAdapter(client) {
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
                if (!transaction.$queryRawUnsafe) {
                    throw new Error("operator_presence_advisory_lock_unavailable");
                }
                // ::text — pg_advisory_xact_lock возвращает void, который Prisma-клиент
                // не десериализует (Failed to deserialize column of type 'void').
                await transaction.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text", `${input.tenantId}:${input.operatorId}`);
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
        },
        async setStatusIfCurrent(input) {
            const at = input.at ?? new Date();
            return client.$transaction(async (transaction) => {
                if (!transaction.$queryRawUnsafe) {
                    throw new Error("operator_presence_advisory_lock_unavailable");
                }
                await transaction.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text", `${input.tenantId}:${input.operatorId}`);
                const openRows = await transaction.operatorPresenceInterval.findMany({
                    orderBy: [{ startedAt: "desc" }],
                    where: { endedAt: null, operatorId: input.operatorId, tenantId: input.tenantId }
                });
                const open = openRows.length ? fromPrismaRow(openRows[0]) : null;
                if (!open || open.status !== input.expectedStatus) {
                    return {
                        changed: false,
                        conditionMatched: false,
                        current: open ? toCurrentRecord(open) : null,
                        previous: open ? toCurrentRecord(open) : null
                    };
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
                    conditionMatched: true,
                    current: toCurrentRecord(fromPrismaRow(created)),
                    previous: toCurrentRecord(open)
                };
            });
        }
    };
}
function normalizeState(seed) {
    return { intervals: (seed?.intervals ?? []).map((interval) => ({ ...interval })) };
}
function findOpenInterval(intervals, tenantId, operatorId) {
    return intervals.find((interval) => interval.tenantId === tenantId && interval.operatorId === operatorId && interval.endedAt === null);
}
function intervalOverlapsRange(interval, tenantId, range) {
    if (interval.tenantId !== tenantId)
        return false;
    if (new Date(interval.startedAt).getTime() >= range.to.getTime())
        return false;
    return interval.endedAt === null || new Date(interval.endedAt).getTime() > range.from.getTime();
}
function toCurrentRecord(interval) {
    return {
        changedBy: interval.changedBy,
        operatorId: interval.operatorId,
        since: interval.startedAt,
        status: interval.status,
        tenantId: interval.tenantId
    };
}
function fromPrismaRow(row) {
    return {
        changedBy: row.changedBy ?? null,
        endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
        id: String(row.id),
        operatorId: String(row.operatorId),
        startedAt: new Date(row.startedAt).toISOString(),
        status: row.status,
        tenantId: String(row.tenantId)
    };
}
function requireId(value, field) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw new TypeError(`${field} is required for operator presence access.`);
    }
    return normalized;
}
//# sourceMappingURL=operator-presence.repository.js.map