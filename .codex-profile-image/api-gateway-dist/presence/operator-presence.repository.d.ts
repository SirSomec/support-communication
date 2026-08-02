import { type OperatorPresenceCurrentRecord, type OperatorPresenceIntervalRecord, type OperatorPresenceStatus } from "./operator-presence.types.js";
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
export interface OperatorPresenceSetStatusIfCurrentInput extends OperatorPresenceSetStatusInput {
    expectedStatus: OperatorPresenceStatus;
}
export interface OperatorPresenceSetStatusIfCurrentResult {
    changed: boolean;
    conditionMatched: boolean;
    current: OperatorPresenceCurrentRecord | null;
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
    setStatusIfCurrent(input: OperatorPresenceSetStatusIfCurrentInput): Promise<OperatorPresenceSetStatusIfCurrentResult>;
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
        create(input: {
            data: Record<string, unknown>;
        }): Promise<PrismaOperatorPresenceIntervalRow>;
        findMany(input: {
            orderBy?: Array<Record<string, "asc" | "desc">>;
            where: Record<string, unknown>;
        }): Promise<PrismaOperatorPresenceIntervalRow[]>;
        updateMany(input: {
            data: Record<string, unknown>;
            where: Record<string, unknown>;
        }): Promise<unknown>;
    };
    $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
    $transaction<T>(callback: (client: PrismaOperatorPresenceClient) => Promise<T>): Promise<T>;
}
export interface OperatorPresencePrismaOptions {
    client: PrismaOperatorPresenceClient;
}
export declare class OperatorPresenceRepository implements OperatorPresenceRepositoryPort {
    private readonly adapter;
    private constructor();
    static default(): OperatorPresenceRepository;
    static useDefault(repository: OperatorPresenceRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: Partial<OperatorPresenceState>): OperatorPresenceRepository;
    static prisma(options: OperatorPresencePrismaOptions): OperatorPresenceRepository;
    findCurrent(tenantId: string, operatorId: string): Promise<OperatorPresenceCurrentRecord | null>;
    listCurrent(tenantId: string): Promise<OperatorPresenceCurrentRecord[]>;
    listIntervalsInRange(tenantId: string, range: OperatorPresenceRange): Promise<OperatorPresenceIntervalRecord[]>;
    setStatus(input: OperatorPresenceSetStatusInput): Promise<OperatorPresenceSetStatusResult>;
    setStatusIfCurrent(input: OperatorPresenceSetStatusIfCurrentInput): Promise<OperatorPresenceSetStatusIfCurrentResult>;
}
export {};
