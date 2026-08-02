import type { ProactiveExposureRepository } from "../automation/proactive-exposure.repository.js";
import type { IntegrationRepository } from "./integration.repository.js";
import { type PublicApiEnvironment, type PublicApiKeyLookup } from "./public-api-auth.js";
interface BaseInput {
    authorization?: string;
    environment: PublicApiEnvironment;
    exposureRepository: ProactiveExposureRepository;
    integrationRepository: Pick<IntegrationRepository, "listLiveSdkVisitorPresence">;
    lookup: PublicApiKeyLookup;
    now?: string;
    sessionId?: string;
}
export declare function handlePublicSdkInvitationPoll(input: BaseInput): Promise<import("@support-communication/envelope").BackendEnvelope<{}>>;
export declare function handlePublicSdkInvitationAcknowledge(input: BaseInput & {
    action: "shown" | "dismissed" | "accepted" | "failed";
    conversationId?: string;
    exposureId?: string;
    failureCode?: string;
    onAccepted?: (exposure: Awaited<ReturnType<ProactiveExposureRepository["transition"]>>) => Promise<string | null>;
}): Promise<import("@support-communication/envelope").BackendEnvelope<{}>>;
export {};
