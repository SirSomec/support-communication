const VK_API_BASE_URL = "https://api.vk.com";
const VK_PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

export interface VkUserProfile {
  displayName: string;
}

export type VkUserProfileResolver = (input: {
  accessToken: string;
  apiVersion?: string | null;
  userId: string;
}) => Promise<VkUserProfile | null>;

interface CachedProfile {
  expiresAt: number;
  profile: VkUserProfile;
}

const profileCache = new Map<string, CachedProfile>();

/** Fetches only the public name needed to label a support conversation. */
export async function fetchVkUserProfile(input: {
  accessToken: string;
  apiVersion?: string | null;
  fetcher?: typeof fetch;
  userId: string;
}): Promise<VkUserProfile | null> {
  const userId = String(input.userId ?? "").trim();
  const accessToken = String(input.accessToken ?? "").trim();
  if (!userId || !accessToken) return null;

  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const endpoint = new URL("/method/users.get", VK_API_BASE_URL);
  endpoint.searchParams.set("access_token", accessToken);
  endpoint.searchParams.set("user_ids", userId);
  endpoint.searchParams.set("v", String(input.apiVersion ?? "").trim() || "5.199");

  try {
    const response = await (input.fetcher ?? globalThis.fetch)(endpoint, {
      signal: AbortSignal.timeout(3_000)
    });
    if (!response.ok) return null;
    const payload = await response.json() as { response?: Array<{ first_name?: unknown; last_name?: unknown }> };
    const user = Array.isArray(payload.response) ? payload.response[0] : undefined;
    const displayName = [stringValue(user?.first_name), stringValue(user?.last_name)].filter(Boolean).join(" ").trim();
    if (!displayName) return null;
    const profile = { displayName };
    profileCache.set(userId, { expiresAt: Date.now() + VK_PROFILE_CACHE_TTL_MS, profile });
    return profile;
  } catch {
    // Profile enrichment is optional and must never delay inbound messages.
    return null;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
