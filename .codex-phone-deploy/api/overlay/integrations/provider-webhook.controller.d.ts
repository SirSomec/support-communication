import { ConversationService } from "../conversation/conversation.service.js";
import { AutomationService } from "../automation/automation.service.js";
import { QualityService } from "../quality/quality.service.js";
export declare class ProviderWebhookController {
    private readonly conversationService;
    private readonly automationService;
    private readonly qualityService;
    private readonly conversations;
    private readonly integrations;
    private readonly providerMessageBindings;
    constructor(conversationService?: ConversationService, automationService?: AutomationService, qualityService?: QualityService);
    receiveVk(connectionId: string, body: Record<string, unknown>, headers: Record<string, string | undefined>): Promise<unknown>;
    receiveMax(connectionId: string, body: Record<string, unknown>, headers: Record<string, string | undefined>): Promise<unknown>;
}
