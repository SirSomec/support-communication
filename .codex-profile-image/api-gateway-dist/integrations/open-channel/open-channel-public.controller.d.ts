import { ConversationService } from "../../conversation/conversation.service.js";
import { RoutingService } from "../../routing/routing.service.js";
import { QualityService } from "../../quality/quality.service.js";
import { AutomationService } from "../../automation/automation.service.js";
import { OpenChannelDeliveryService } from "./open-channel-delivery.service.js";
import { type OpenChatEvent } from "./open-chat.route.js";
/**
 * Public endpoints of the external integration surface. URL shapes follow
 * the token-in-path convention of popular live-chat platforms, so a
 * migrating customer only swaps the host and tokens:
 *  - Open Channel chat: POST /api/v1/open-channel/:token
 *                       GET  /api/v1/open-channel/:token/status
 *  - External Bot API:  POST /api/v1/external-bot/webhooks/:connectionId/:token
 */
interface HttpResponseLike {
    send(body: unknown): void;
    set(header: string, value: string): this;
    status(code: number): this;
}
export declare class OpenChannelPublicController {
    private readonly conversationService;
    private readonly routingService;
    private readonly qualityService;
    private readonly automationService;
    private readonly conversationRepository;
    private readonly repository;
    constructor(conversationService?: ConversationService, routingService?: RoutingService, qualityService?: QualityService, automationService?: AutomationService);
    receiveOpenChatEvent(channelToken: string, body: OpenChatEvent, response: HttpResponseLike): Promise<void>;
    fetchOpenChannelStatus(channelToken: string, response: HttpResponseLike): Promise<void>;
    receiveExternalBotEvent(connectionId: string, token: string, body: Record<string, unknown>, response: HttpResponseLike): Promise<void>;
    private botBridge;
}
/** One delivery queue per process so controller instances share the journal. */
export declare function openChannelDeliveryService(): OpenChannelDeliveryService;
export declare function resetOpenChannelDeliveryService(): void;
/**
 * Presence approximation for agents_online / chatMode: at least one active
 * tenant user. Real per-operator presence lives in the operator app; this
 * stays intentionally cheap for the public endpoint.
 */
export declare function resolveAgentsOnline(tenantId: string): Promise<boolean>;
export {};
