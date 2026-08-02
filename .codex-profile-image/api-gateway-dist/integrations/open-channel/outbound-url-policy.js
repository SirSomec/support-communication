import { lookup } from "node:dns/promises";
import { validateUrlKnowledgeSourceConfig } from "../../knowledge-sources/url-source-config.js";
export function normalizeOpenChannelOutboundUrl(value, options = {}) {
    const text = String(value ?? "").trim();
    if (!text)
        return null;
    try {
        const url = new URL(text);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            return null;
        }
        if (!isTrustedOrigin(url, options.trustedOrigins) && !isPublicOutboundUrl(url)) {
            return null;
        }
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    }
    catch {
        return null;
    }
}
export async function assertOpenChannelOutboundUrlSafe(value, resolver = (hostname) => lookup(hostname, { all: true }), options = { trustedOrigins: trustedOriginsFromEnvironment() }) {
    const normalized = normalizeOpenChannelOutboundUrl(value, options);
    if (!normalized) {
        throw new Error("open_channel_outbound_url_forbidden");
    }
    if (isTrustedOrigin(new URL(normalized), options.trustedOrigins))
        return normalized;
    try {
        const addresses = await resolver(new URL(normalized).hostname);
        if (!addresses.length || addresses.some(({ address }) => {
            const host = address.includes(":") ? `[${address}]` : address;
            return !validateUrlKnowledgeSourceConfig({ url: `https://${host}/` }).ok;
        })) {
            throw new Error("open_channel_outbound_url_forbidden");
        }
    }
    catch {
        throw new Error("open_channel_outbound_url_forbidden");
    }
    return normalized;
}
function isPublicOutboundUrl(url) {
    const safetyProbe = new URL(url.toString());
    safetyProbe.protocol = "https:";
    return validateUrlKnowledgeSourceConfig({ url: safetyProbe.toString() }).ok;
}
function isTrustedOrigin(url, trustedOrigins) {
    if (!trustedOrigins?.length)
        return false;
    return trustedOrigins.some((value) => {
        try {
            const allowed = new URL(value.trim());
            return ["http:", "https:"].includes(allowed.protocol)
                && !allowed.username
                && !allowed.password
                && allowed.origin === url.origin;
        }
        catch {
            return false;
        }
    });
}
function trustedOriginsFromEnvironment() {
    return String(process.env.OPEN_CHANNEL_OUTBOUND_TRUSTED_ORIGINS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}
//# sourceMappingURL=outbound-url-policy.js.map