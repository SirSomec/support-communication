import { type BackendEnvelope } from "@support-communication/envelope";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { type RealtimeFanoutAdapter } from "../conversation/realtime.fanout.js";
import { IntegrationRepository } from "../integrations/integration.repository.js";
import { NotificationRepository, type NotificationActionTarget, type NotificationCategory, type NotificationTone } from "./notification.repository.js";
export interface NotificationRequestContext {
    tenantId?: string;
    userId?: string;
}
export interface CreateNotificationInput {
    action: string;
    actionTarget?: NotificationActionTarget | null;
    category: NotificationCategory;
    detail: string;
    history?: string;
    meta: string;
    recipientUserId?: string | null;
    tenantId: string;
    title: string;
    tone: NotificationTone;
    type: string;
    typeKey: string;
}
interface MarkNotificationsReadPayload {
    all?: boolean;
    notificationIds?: string[];
}
interface NotificationPreferencesPayload {
    browserPushEnabled?: boolean;
    browserPushEndpoint?: string | null;
    browserPushPermission?: string | null;
    browserPushSubscriptionId?: string | null;
    enabledExternalChannelIds?: string[];
    mutedSoundRuleIds?: string[];
    mutedTypeKeys?: string[];
}
interface CriticalAlertTestPayload {
    channelIds?: string[];
    includeBrowserPush?: boolean;
    message?: string;
}
interface BrowserPushSubscriptionPayload {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
        auth?: string;
        p256dh?: string;
    };
    userAgent?: string | null;
}
interface NotificationServiceOptions {
    conversationRepository?: ConversationRepository;
    integrationRepository?: IntegrationRepository;
    notificationRepository?: NotificationRepository;
    realtimeFanout?: RealtimeFanoutAdapter;
}
export declare class NotificationService {
    private readonly conversationRepository;
    private readonly integrationRepository;
    private readonly notificationRepository;
    private readonly realtimeFanout;
    constructor(options?: NotificationServiceOptions);
    static configureRealtimeFanoutFromEnv(source?: NodeJS.ProcessEnv): void;
    fetchNotifications(filters?: {
        unreadOnly?: boolean;
    }, context?: NotificationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    markNotificationsRead(payload: MarkNotificationsReadPayload | null | undefined, context?: NotificationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchNotificationPreferences(context?: NotificationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchBrowserPushPublicKey(context?: NotificationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    createBrowserPushSubscription(payload: BrowserPushSubscriptionPayload | null | undefined, context?: NotificationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteBrowserPushSubscription(subscriptionId: string, context?: NotificationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateNotificationPreferences(payload: NotificationPreferencesPayload | null | undefined, context?: NotificationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    sendCriticalAlertTest(payload: CriticalAlertTestPayload | null | undefined, context?: NotificationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    createNotification(input: CreateNotificationInput): Promise<BackendEnvelope<Record<string, unknown>>>;
    private publishRealtimeEvent;
    private resolveDeliverableExternalChannels;
}
export {};
