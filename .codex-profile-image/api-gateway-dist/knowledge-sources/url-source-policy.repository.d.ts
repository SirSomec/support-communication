import { type DurableStore } from "@support-communication/database";
type MaybePromise<T> = Promise<T> | T;
export interface UrlSourcePolicy {
    allowedHosts: string[] | null;
    tenantId: string;
    updatedAt: string;
}
interface UrlSourcePolicyState {
    policies: UrlSourcePolicy[];
}
export interface PrismaUrlSourcePolicyRow {
    allowedHosts: unknown;
    tenantId: string;
    updatedAt: Date;
}
export interface PrismaUrlSourcePolicyCreateInput {
    allowedHosts: string[] | null;
    tenantId: string;
    updatedAt: Date;
}
export interface UrlSourcePolicyPrismaClient {
    urlSourcePolicy: {
        findUnique(input: {
            where: {
                tenantId: string;
            };
        }): MaybePromise<PrismaUrlSourcePolicyRow | null>;
        upsert(input: {
            create: PrismaUrlSourcePolicyCreateInput;
            update: Omit<PrismaUrlSourcePolicyCreateInput, "tenantId">;
            where: {
                tenantId: string;
            };
        }): MaybePromise<PrismaUrlSourcePolicyRow>;
    };
}
/** Tenant-level exact-host policy for remote URL ingestion. `null` means the
 * tenant has not restricted public HTTPS hosts yet; an empty array denies all. */
export declare class UrlSourcePolicyRepository {
    private readonly store;
    private readonly prismaClient?;
    constructor(store: DurableStore<UrlSourcePolicyState>, prismaClient?: UrlSourcePolicyPrismaClient | undefined);
    static default(): UrlSourcePolicyRepository;
    static clearDefault(): void;
    static inMemory(seed?: UrlSourcePolicyState): UrlSourcePolicyRepository;
    static prisma({ client }: {
        client: UrlSourcePolicyPrismaClient;
    }): UrlSourcePolicyRepository;
    get(tenantId: string): MaybePromise<UrlSourcePolicy>;
    save(input: UrlSourcePolicy): MaybePromise<UrlSourcePolicy>;
}
export {};
