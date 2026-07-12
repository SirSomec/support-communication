import { createEnvelope } from "@support-communication/envelope";
import type { ProactiveExposureRepository, ProactiveExposureStatus } from "../automation/proactive-exposure.repository.js";
import type { IntegrationRepository } from "./integration.repository.js";
import { resolvePublicApiRequest, type PublicApiEnvironment, type PublicApiKeyLookup } from "./public-api-auth.js";
import { scopedSdkPresenceHash } from "./public-sdk-presence.route.js";

interface BaseInput {
  authorization?: string;
  environment: PublicApiEnvironment;
  exposureRepository: ProactiveExposureRepository;
  integrationRepository: Pick<IntegrationRepository, "listLiveSdkVisitorPresence">;
  lookup: PublicApiKeyLookup;
  now?: string;
  sessionId?: string;
}

export async function handlePublicSdkInvitationPoll(input: BaseInput) {
  const context = await resolveSession(input, "pollPublicSdkInvitations");
  if ("response" in context) return context.response;
  const pending = await input.exposureRepository.listPendingForSession(context.tenantId, context.presenceSessionId);
  const deliveredAt = validNow(input.now);
  const invitations = await Promise.all(pending.map(async (exposure) =>
    await input.exposureRepository.markDelivered({ at: deliveredAt, exposureId: exposure.exposureId,
      presenceSessionId: context.presenceSessionId, tenantId: context.tenantId }) ?? exposure));
  return createEnvelope({ service: "integrationService", operation: "pollPublicSdkInvitations",
    meta: { apiVersion: "v1", source: "api" }, data: { invitations: invitations.map(publicInvitation), sessionId: context.sessionId } });
}

export async function handlePublicSdkInvitationAcknowledge(input: BaseInput & { action: "shown" | "dismissed" | "accepted" | "failed";
  conversationId?: string; exposureId?: string; failureCode?: string;
  onAccepted?: (exposure: Awaited<ReturnType<ProactiveExposureRepository["transition"]>>) => Promise<string | null> }) {
  const operation = `${input.action}PublicSdkInvitation`;
  const context = await resolveSession(input, operation);
  if ("response" in context) return context.response;
  const exposureId = String(input.exposureId ?? "").trim();
  if (!exposureId) return invalid(operation, "proactive_exposure_id_required");
  let exposure = await input.exposureRepository.transition({ at: validNow(input.now),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}), exposureId,
    ...(input.failureCode ? { failureCode: input.failureCode.slice(0, 120) } : {}), presenceSessionId: context.presenceSessionId,
    status: input.action as Exclude<ProactiveExposureStatus, "planned">, tenantId: context.tenantId });
  if (!exposure) return invalid(operation, "proactive_exposure_not_found");
  if (input.action === "accepted" && !exposure.conversationId && input.onAccepted) {
    const conversationId = await input.onAccepted(exposure);
    if (conversationId) exposure = await input.exposureRepository.transition({ at: validNow(input.now), conversationId,
      exposureId, presenceSessionId: context.presenceSessionId, status: "accepted", tenantId: context.tenantId }) ?? exposure;
  }
  return createEnvelope({ service: "integrationService", operation, meta: { apiVersion: "v1", source: "api" },
    data: { attribution: { experimentId: exposure.experimentId, experimentVersion: exposure.experimentVersion,
      exposureId: exposure.exposureId, ruleId: exposure.ruleId, variant: exposure.variant }, conversationId: exposure.conversationId,
      exposureId: exposure.exposureId, status: exposure.status } });
}

async function resolveSession(input: BaseInput, operation: string): Promise<{ tenantId: string; presenceSessionId: string; sessionId: string } | { response: ReturnType<typeof invalid> }> {
  const auth = await resolvePublicApiRequest({ authorization: input.authorization, environment: input.environment,
    lookup: input.lookup, requiredScope: "clients:identify" });
  if (!auth.allowed) return { response: invalid(operation, auth.code) };
  const sessionId = String(input.sessionId ?? "").trim().slice(0, 160);
  const connectionId = String(auth.context.channelConnectionId ?? "").trim();
  if (!sessionId || !connectionId) return { response: invalid(operation, "sdk_presence_session_id_required") };
  const sessionHash = scopedSdkPresenceHash(auth.context.tenantId, connectionId, sessionId);
  const sessions = await input.integrationRepository.listLiveSdkVisitorPresence({ at: validNow(input.now), tenantId: auth.context.tenantId });
  const presence = sessions.find((item) => item.channelConnectionId === connectionId && item.sessionKeyHash === sessionHash);
  if (!presence) return { response: invalid(operation, "sdk_presence_session_not_live") };
  return { presenceSessionId: presence.id, sessionId, tenantId: auth.context.tenantId };
}

function publicInvitation(exposure: Awaited<ReturnType<ProactiveExposureRepository["listPendingForSession"]>>[number]) {
  return { experimentVersion: exposure.experimentVersion, exposureId: exposure.exposureId, message: exposure.message,
    plannedAt: exposure.plannedAt, ruleId: exposure.ruleId, variant: exposure.variant };
}
function validNow(value?: string): string { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString(); }
function invalid(operation: string, code: string) { return createEnvelope({ service: "integrationService", operation, status: "invalid",
  data: {}, error: { code, message: "The proactive invitation request is invalid for this SDK session." } }); }
