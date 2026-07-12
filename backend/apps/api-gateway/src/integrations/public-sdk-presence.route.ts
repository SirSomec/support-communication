import { createHash } from "node:crypto";
import { createEnvelope } from "@support-communication/envelope";
import type { IntegrationRepository } from "./integration.repository.js";
import { resolvePublicApiRequest, type PublicApiEnvironment, type PublicApiKeyLookup } from "./public-api-auth.js";

const TTL_MS = 90_000;

export interface PublicSdkPresenceBody {
  externalId?: string;
  pageUrl?: string;
  pagePath?: string;
  referrer?: string;
  sessionId?: string;
}

export async function handlePublicSdkPresenceHeartbeat(input: {
  authorization?: string; body: PublicSdkPresenceBody; environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup; repository: IntegrationRepository; now?: string;
}) {
  const auth = await resolvePublicApiRequest({ authorization: input.authorization, environment: input.environment,
    lookup: input.lookup, requiredScope: "clients:identify" });
  if (!auth.allowed) return denied("heartbeatPublicSdkPresence", auth.code);
  const sessionId = limitedToken(input.body.sessionId, 160);
  if (!sessionId) return invalid("heartbeatPublicSdkPresence", "sdk_presence_session_id_required");
  const connectionId = String(auth.context.channelConnectionId ?? "").trim();
  const connection = connectionId ? await input.repository.findChannelConnectionAsync(auth.context.tenantId, connectionId) : undefined;
  if (!connection || connection.type !== "sdk" || connection.status !== "active") {
    return denied("heartbeatPublicSdkPresence", "sdk_connection_inactive");
  }
  const now = validNow(input.now);
  const subjectSource = limitedToken(input.body.externalId, 512) || sessionId;
  const page = safeWebLocation(input.body.pageUrl);
  const path = safePath(input.body.pagePath) || page?.path || null;
  const presence = await input.repository.upsertSdkVisitorPresence({
    channelConnectionId: connectionId, expiresAt: new Date(Date.parse(now) + TTL_MS).toISOString(), lastSeenAt: now,
    pagePath: path, pageUrl: page?.url ?? null, referrer: safeWebLocation(input.body.referrer)?.url ?? null,
    sessionKeyHash: scopedHash(auth.context.tenantId, connectionId, sessionId),
    subjectId: scopedHash(auth.context.tenantId, "subject", subjectSource), tenantId: auth.context.tenantId
  });
  return createEnvelope({ service: "integrationService", operation: "heartbeatPublicSdkPresence",
    meta: { apiVersion: "v1", source: "api" }, data: { connected: true, expiresAt: presence.expiresAt,
      firstSeenAt: presence.firstSeenAt, lastSeenAt: presence.lastSeenAt, sessionId } });
}

export async function handlePublicSdkPresenceDisconnect(input: {
  authorization?: string; body: Pick<PublicSdkPresenceBody, "sessionId">; environment: PublicApiEnvironment;
  lookup: PublicApiKeyLookup; repository: IntegrationRepository; now?: string;
}) {
  const auth = await resolvePublicApiRequest({ authorization: input.authorization, environment: input.environment,
    lookup: input.lookup, requiredScope: "clients:identify" });
  if (!auth.allowed) return denied("disconnectPublicSdkPresence", auth.code);
  const sessionId = limitedToken(input.body.sessionId, 160);
  const connectionId = String(auth.context.channelConnectionId ?? "").trim();
  if (!sessionId) return invalid("disconnectPublicSdkPresence", "sdk_presence_session_id_required");
  if (!connectionId) return denied("disconnectPublicSdkPresence", "sdk_connection_inactive");
  const presence = await input.repository.disconnectSdkVisitorPresence({ channelConnectionId: connectionId,
    disconnectedAt: validNow(input.now), sessionKeyHash: scopedHash(auth.context.tenantId, connectionId, sessionId),
    tenantId: auth.context.tenantId });
  return createEnvelope({ service: "integrationService", operation: "disconnectPublicSdkPresence",
    meta: { apiVersion: "v1", source: "api" }, data: { connected: false, found: Boolean(presence), sessionId } });
}

export function scopedSdkPresenceHash(...parts: string[]): string { return createHash("sha256").update(parts.join("\0")).digest("hex"); }
const scopedHash = scopedSdkPresenceHash;
function limitedToken(value: unknown, limit: number): string { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function validNow(value?: string): string { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString(); }
function safePath(value: unknown): string | null {
  const text = limitedToken(value, 2048); if (!text || !text.startsWith("/")) return null;
  return text.split(/[?#]/, 1)[0]?.slice(0, 1024) || null;
}
function safeWebLocation(value: unknown): { path: string; url: string } | null {
  const text = limitedToken(value, 4096); if (!text) return null;
  try { const url = new URL(text); if (!/^https?:$/.test(url.protocol)) return null;
    return { path: url.pathname.slice(0, 1024) || "/", url: `${url.origin}${url.pathname}`.slice(0, 2048) }; } catch { return null; }
}
function invalid(operation: string, code: string) { return createEnvelope({ service: "integrationService", operation, status: "invalid",
  data: {}, error: { code, message: "A stable SDK sessionId is required." } }); }
function denied(operation: string, code: string) { return createEnvelope({ service: "integrationService", operation, status: "denied",
  data: {}, error: { code, message: "SDK presence request is not authorized for an active SDK connection." } }); }
