import { InMemoryStore, createPrismaClient } from "@support-communication/database";
let defaultRepository = null;
/** Tenant-level exact-host policy for remote URL ingestion. `null` means the
 * tenant has not restricted public HTTPS hosts yet; an empty array denies all. */
export class UrlSourcePolicyRepository {
    store;
    prismaClient;
    constructor(store, prismaClient) {
        this.store = store;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (!defaultRepository) {
            // Prisma-only рантайм (план 2026-07-15): политика URL-источников всегда
            // персистится в Postgres; json-ветка выпилена вместе с JsonFileStore.
            defaultRepository = UrlSourcePolicyRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) });
        }
        return defaultRepository;
    }
    static clearDefault() { defaultRepository = null; }
    static inMemory(seed = { policies: [] }) { return new UrlSourcePolicyRepository(new InMemoryStore(normalizeState(seed))); }
    static prisma({ client }) { return new UrlSourcePolicyRepository(new InMemoryStore({ policies: [] }), client); }
    get(tenantId) {
        const tenant = requiredTenant(tenantId);
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.urlSourcePolicy.findUnique({ where: { tenantId: tenant } }))
                .then((row) => row ? fromRow(row) : { allowedHosts: null, tenantId: tenant, updatedAt: "" });
        }
        return clone(this.store.read().policies.find((policy) => policy.tenantId === tenant) ?? { allowedHosts: null, tenantId: tenant, updatedAt: "" });
    }
    save(input) {
        const policy = normalizePolicy(input);
        if (this.prismaClient) {
            const create = { allowedHosts: policy.allowedHosts, tenantId: policy.tenantId, updatedAt: new Date(policy.updatedAt) };
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
function fromRow(row) {
    return normalizePolicy({
        allowedHosts: row.allowedHosts === null || row.allowedHosts === undefined ? null : row.allowedHosts,
        tenantId: row.tenantId,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? "")
    });
}
function normalizeState(input) { return { policies: (input.policies ?? []).map(normalizePolicy) }; }
function normalizePolicy(input) {
    return { allowedHosts: input.allowedHosts === null ? null : Array.from(new Set((input.allowedHosts ?? []).map(normalizeHost).filter(Boolean))), tenantId: requiredTenant(input.tenantId), updatedAt: String(input.updatedAt ?? "") };
}
function normalizeHost(value) { return String(value ?? "").trim().toLowerCase().replace(/\.+$/, ""); }
function requiredTenant(value) { const tenantId = String(value ?? "").trim(); if (!tenantId)
    throw new Error("url_source_policy_tenant_required"); return tenantId; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
//# sourceMappingURL=url-source-policy.repository.js.map