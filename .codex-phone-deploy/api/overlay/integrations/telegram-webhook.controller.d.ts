import { AutomationService } from "../automation/automation.service.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { RoutingService } from "../routing/routing.service.js";
import { QualityService } from "../quality/quality.service.js";
export declare class TelegramWebhookController {
    private readonly conversationService;
    private readonly routingService;
    private readonly qualityService;
    private readonly automationService;
    private readonly conversationRepository;
    private readonly integrationRepository;
    constructor(conversationService?: ConversationService, routingService?: RoutingService, qualityService?: QualityService, automationService?: AutomationService);
    receiveTelegramWebhook(body: Record<string, unknown>, headers: Record<string, string | undefined>): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
