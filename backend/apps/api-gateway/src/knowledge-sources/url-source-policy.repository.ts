import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";

export interface UrlSourcePolicy {
  allowedHosts: string[] | null;
  tenantId: string;
  updatedAt: string;
}

interface UrlSourcePolicyState { policies: UrlSourcePolicy[]; }

let defaultRepository: UrlSourcePolicyRepository | null = null;

/** Tenant-level exact-host policy for remote URL ingestion. `null` means the
 * tenant has not restricted public HTTPS hosts yet; an empty array denies all. */
export class UrlSourcePolicyRepository {
  constructor(private readonly store: DurableStore<UrlSourcePolicyState>) {}

  static default(): UrlSourcePolicyRepository {
    if (!defaultRepository) defaultRepository = UrlSourcePolicyRepository.open(process.env.URL_SOURCE_POLICIES_STORE_FILE ?? ".runtime/url-source-policies.json");
    return defaultRepository;
  }
  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: UrlSourcePolicyState = { policies: [] }): UrlSourcePolicyRepository { return new UrlSourcePolicyRepository(new InMemoryStore(normalizeState(seed))); }
  static open(filePath: string): UrlSourcePolicyRepository { return new UrlSourcePolicyRepository(new JsonFileStore({ filePath, seed: { policies: [] } })); }

  get(tenantId: string): UrlSourcePolicy {
    const tenant = requiredTenant(tenantId);
    return clone(this.store.read().policies.find((policy) => policy.tenantId === tenant) ?? { allowedHosts: null, tenantId: tenant, updatedAt: "" });
  }

  save(input: UrlSourcePolicy): UrlSourcePolicy {
    const policy = normalizePolicy(input);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.policies.some((item) => item.tenantId === policy.tenantId);
      return { policies: exists ? current.policies.map((item) => item.tenantId === policy.tenantId ? policy : item) : [...current.policies, policy] };
    });
    return clone(policy);
  }
}

function normalizeState(input: Partial<UrlSourcePolicyState>): UrlSourcePolicyState { return { policies: (input.policies ?? []).map(normalizePolicy) }; }
function normalizePolicy(input: UrlSourcePolicy): UrlSourcePolicy {
  return { allowedHosts: input.allowedHosts === null ? null : Array.from(new Set((input.allowedHosts ?? []).map(normalizeHost).filter(Boolean))), tenantId: requiredTenant(input.tenantId), updatedAt: String(input.updatedAt ?? "") };
}
function normalizeHost(value: unknown): string { return String(value ?? "").trim().toLowerCase().replace(/\.+$/, ""); }
function requiredTenant(value: unknown): string { const tenantId = String(value ?? "").trim(); if (!tenantId) throw new Error("url_source_policy_tenant_required"); return tenantId; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
