import { type DurableStore, InMemoryStore, JsonFileStore, createPrismaClient } from "@support-communication/database";

type MaybePromise<T> = Promise<T> | T;

export interface UrlSourcePolicy {
  allowedHosts: string[] | null;
  tenantId: string;
  updatedAt: string;
}

interface UrlSourcePolicyState { policies: UrlSourcePolicy[]; }

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
    findUnique(input: { where: { tenantId: string } }): MaybePromise<PrismaUrlSourcePolicyRow | null>;
    upsert(input: {
      create: PrismaUrlSourcePolicyCreateInput;
      update: Omit<PrismaUrlSourcePolicyCreateInput, "tenantId">;
      where: { tenantId: string };
    }): MaybePromise<PrismaUrlSourcePolicyRow>;
  };
}

let defaultRepository: UrlSourcePolicyRepository | null = null;

function isPrismaRuntimeProfile(env: NodeJS.ProcessEnv): boolean {
  return String(env.RUNTIME_PROFILE ?? "").trim().toLowerCase() === "production-like";
}

/** Tenant-level exact-host policy for remote URL ingestion. `null` means the
 * tenant has not restricted public HTTPS hosts yet; an empty array denies all. */
export class UrlSourcePolicyRepository {
  constructor(
    private readonly store: DurableStore<UrlSourcePolicyState>,
    private readonly prismaClient?: UrlSourcePolicyPrismaClient
  ) {}

  static default(): UrlSourcePolicyRepository {
    if (!defaultRepository) {
      // Prisma-only рантайм (план 2026-07-15, фаза A3): production-like профиль
      // всегда персистится в Postgres; json-store остаётся тестовым бэкендом.
      defaultRepository = isPrismaRuntimeProfile(process.env)
        ? UrlSourcePolicyRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as UrlSourcePolicyPrismaClient })
        : UrlSourcePolicyRepository.open(process.env.URL_SOURCE_POLICIES_STORE_FILE ?? ".runtime/url-source-policies.json");
    }
    return defaultRepository;
  }
  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: UrlSourcePolicyState = { policies: [] }): UrlSourcePolicyRepository { return new UrlSourcePolicyRepository(new InMemoryStore(normalizeState(seed))); }
  static open(filePath: string): UrlSourcePolicyRepository { return new UrlSourcePolicyRepository(new JsonFileStore({ filePath, seed: { policies: [] } })); }
  static prisma({ client }: { client: UrlSourcePolicyPrismaClient }): UrlSourcePolicyRepository { return new UrlSourcePolicyRepository(new InMemoryStore({ policies: [] }), client); }

  get(tenantId: string): MaybePromise<UrlSourcePolicy> {
    const tenant = requiredTenant(tenantId);
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.urlSourcePolicy.findUnique({ where: { tenantId: tenant } }))
        .then((row) => row ? fromRow(row) : { allowedHosts: null, tenantId: tenant, updatedAt: "" });
    }
    return clone(this.store.read().policies.find((policy) => policy.tenantId === tenant) ?? { allowedHosts: null, tenantId: tenant, updatedAt: "" });
  }

  save(input: UrlSourcePolicy): MaybePromise<UrlSourcePolicy> {
    const policy = normalizePolicy(input);
    if (this.prismaClient) {
      const create: PrismaUrlSourcePolicyCreateInput = { allowedHosts: policy.allowedHosts, tenantId: policy.tenantId, updatedAt: new Date(policy.updatedAt) };
      const { tenantId: _tenantId, ...update } = create;
      return Promise.resolve(this.prismaClient.urlSourcePolicy.upsert({
        create,
        update,
        where: { tenantId: policy.tenantId }
      })).then(fromRow);
    }
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.policies.some((item) => item.tenantId === policy.tenantId);
      return { policies: exists ? current.policies.map((item) => item.tenantId === policy.tenantId ? policy : item) : [...current.policies, policy] };
    });
    return clone(policy);
  }
}

function fromRow(row: PrismaUrlSourcePolicyRow): UrlSourcePolicy {
  return normalizePolicy({
    allowedHosts: row.allowedHosts === null || row.allowedHosts === undefined ? null : (row.allowedHosts as string[]),
    tenantId: row.tenantId,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? "")
  });
}
function normalizeState(input: Partial<UrlSourcePolicyState>): UrlSourcePolicyState { return { policies: (input.policies ?? []).map(normalizePolicy) }; }
function normalizePolicy(input: UrlSourcePolicy): UrlSourcePolicy {
  return { allowedHosts: input.allowedHosts === null ? null : Array.from(new Set((input.allowedHosts ?? []).map(normalizeHost).filter(Boolean))), tenantId: requiredTenant(input.tenantId), updatedAt: String(input.updatedAt ?? "") };
}
function normalizeHost(value: unknown): string { return String(value ?? "").trim().toLowerCase().replace(/\.+$/, ""); }
function requiredTenant(value: unknown): string { const tenantId = String(value ?? "").trim(); if (!tenantId) throw new Error("url_source_policy_tenant_required"); return tenantId; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
