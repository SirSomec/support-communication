import { lookup } from "node:dns/promises";
import { validateUrlKnowledgeSourceConfig } from "../../knowledge-sources/url-source-config.js";

export type OpenChannelHostnameResolver = (hostname: string) => Promise<Array<{ address: string }>>;

export function normalizeOpenChannelOutboundUrl(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return null;
    }

    const safetyProbe = new URL(url.toString());
    safetyProbe.protocol = "https:";
    if (!validateUrlKnowledgeSourceConfig({ url: safetyProbe.toString() }).ok) {
      return null;
    }

    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function assertOpenChannelOutboundUrlSafe(
  value: unknown,
  resolver: OpenChannelHostnameResolver = (hostname) => lookup(hostname, { all: true })
): Promise<string> {
  const normalized = normalizeOpenChannelOutboundUrl(value);
  if (!normalized) {
    throw new Error("open_channel_outbound_url_forbidden");
  }

  try {
    const addresses = await resolver(new URL(normalized).hostname);
    if (!addresses.length || addresses.some(({ address }) => {
      const host = address.includes(":") ? `[${address}]` : address;
      return !validateUrlKnowledgeSourceConfig({ url: `https://${host}/` }).ok;
    })) {
      throw new Error("open_channel_outbound_url_forbidden");
    }
  } catch {
    throw new Error("open_channel_outbound_url_forbidden");
  }

  return normalized;
}
