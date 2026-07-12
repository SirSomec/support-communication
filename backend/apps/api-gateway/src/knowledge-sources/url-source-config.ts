/**
 * Pure validation for remotely fetched knowledge sources.  Resolution and
 * fetching must perform their own DNS/IP checks as well; this module only
 * rejects unsafe URL literals before a source is persisted.
 */
export const DEFAULT_URL_SOURCE_MAX_NORMALIZED_LENGTH = 2_048;

export interface UrlKnowledgeSourceConfig {
  url: string;
}

export interface UrlSourceValidationOptions {
  /** When supplied, only these canonical host names may be used. */
  allowedHosts?: readonly string[];
  maxNormalizedLength?: number;
}

export type UrlSourceValidationCode =
  | "url_source_config_invalid"
  | "url_source_https_required"
  | "url_source_credentials_forbidden"
  | "url_source_host_forbidden"
  | "url_source_host_not_allowed"
  | "url_source_too_long";

export type UrlSourceConfigValidation =
  | { ok: true; config: UrlKnowledgeSourceConfig; hostname: string }
  | { ok: false; code: UrlSourceValidationCode };

export function validateUrlKnowledgeSourceConfig(
  input: unknown,
  options: UrlSourceValidationOptions = {}
): UrlSourceConfigValidation {
  const rawUrl = typeof input === "object" && input !== null
    ? (input as Record<string, unknown>).url
    : undefined;
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return { ok: false, code: "url_source_config_invalid" };

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, code: "url_source_config_invalid" };
  }

  if (parsed.protocol !== "https:") return { ok: false, code: "url_source_https_required" };
  if (parsed.username || parsed.password) return { ok: false, code: "url_source_credentials_forbidden" };

  // Fragments are never sent in an HTTP request and must not create a second
  // representation of the same source.
  parsed.hash = "";
  const hostname = canonicalHostname(parsed.hostname);
  if (!hostname || isForbiddenLiteralHostname(hostname)) return { ok: false, code: "url_source_host_forbidden" };

  const allowedHosts = options.allowedHosts?.map(canonicalHostname).filter(Boolean) ?? [];
  if (options.allowedHosts !== undefined && !allowedHosts.includes(hostname)) {
    return { ok: false, code: "url_source_host_not_allowed" };
  }

  const maxLength = normalizedMaximumLength(options.maxNormalizedLength);
  const normalizedUrl = parsed.toString();
  if (normalizedUrl.length > maxLength) return { ok: false, code: "url_source_too_long" };

  return { ok: true, config: { url: normalizedUrl }, hostname };
}

function normalizedMaximumLength(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_URL_SOURCE_MAX_NORMALIZED_LENGTH;
}

function canonicalHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

function isForbiddenLiteralHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  const ipv4 = parseIpv4(hostname);
  if (ipv4 !== null) return isReservedIpv4(ipv4);
  const ipv6 = parseIpv6(hostname);
  return ipv6 !== null && isReservedIpv6(ipv6);
}

function parseIpv4(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return null;
  return (((octets[0]! * 256 + octets[1]!) * 256 + octets[2]!) * 256 + octets[3]!) >>> 0;
}

function isReservedIpv4(address: number): boolean {
  const first = address >>> 24;
  const second = (address >>> 16) & 0xff;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return true;
  if (first === 100 && second >= 64 && second <= 127) return true; // shared address space
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && (second === 0 || second === 168)) return true;
  if (first === 198 && (second === 18 || second === 19 || second === 51)) return true;
  return first === 203 && second === 0 && ((address >>> 8) & 0xff) === 113;
}

function parseIpv6(value: string): bigint | null {
  if (!/^[0-9a-f:.]+$/i.test(value)) return null;
  let text = value.toLowerCase();
  // IPv4-mapped forms are accepted by URL and need the same protections.
  const finalColon = text.lastIndexOf(":");
  if (text.includes(".")) {
    const ipv4 = parseIpv4(text.slice(finalColon + 1));
    if (ipv4 === null) return null;
    text = `${text.slice(0, finalColon)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (left.length + right.length > 8 || (halves.length === 1 && left.length !== 8)) return null;
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.reduce((address, group) => (address << 16n) + BigInt(`0x${group}`), 0n);
}

function isReservedIpv6(address: bigint): boolean {
  const prefix = (bits: number) => address >> BigInt(128 - bits);
  if (address === 0n || address === 1n) return true;
  if (prefix(7) === 0b1111110n) return true; // fc00::/7, unique local
  if (prefix(10) === 0b1111111010n) return true; // fe80::/10, link local
  if (prefix(8) === 0xffn) return true; // multicast
  if (prefix(32) === 0x20010db8n) return true; // documentation

  // IPv4-compatible and IPv4-mapped addresses must not bypass IPv4 checks.
  if (prefix(96) === 0n || prefix(96) === 0xffffn) return isReservedIpv4(Number(address & 0xffffffffn));
  return false;
}
