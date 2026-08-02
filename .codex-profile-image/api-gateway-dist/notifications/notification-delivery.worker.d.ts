import { NotificationRepository } from "./notification.repository.js";
export interface BrowserPushDeliveryRequest {
    descriptorId: string;
    endpoint: string;
    keys: {
        auth: string;
        p256dh: string;
    };
    payload: {
        body: string;
        title: string;
        url: string;
    };
    subscriptionId: string;
    tenantId: string;
    traceId: string;
}
export interface BrowserPushDeliveryResult {
    deliveredAt?: string;
    providerMessageId: string;
}
export interface WebPushProviderClient {
    sendNotification(subscription: {
        endpoint: string;
        keys: {
            auth: string;
            p256dh: string;
        };
    }, payload: string, options: {
        TTL: number;
        urgency: "high" | "low" | "normal" | "very-low";
    }): Promise<{
        headers?: Record<string, string | string[] | undefined>;
        statusCode?: number;
    } | void>;
}
export interface NotificationDeliveryProviderPort {
    send(request: BrowserPushDeliveryRequest): Promise<BrowserPushDeliveryResult>;
}
export type NotificationDeliveryProviderAdapter = Partial<NotificationDeliveryProviderPort>;
export interface DeterministicNotificationDeliveryProviderAdapter extends NotificationDeliveryProviderPort {
    listDeliveries(): BrowserPushDeliveryRequest[];
}
export interface DeterministicNotificationDeliveryProviderOptions {
    now?: () => Date;
}
export interface NotificationDeliveryWorkerInput {
    leaseMs?: number;
    limit?: number;
    maxAttempts?: number;
    notificationRepository: NotificationRepository;
    now?: Date;
    provider: NotificationDeliveryProviderPort;
    queue?: string;
    retryDelayMs?: number;
    tenantId?: string;
}
export interface NotificationDeliveryWorkerResult {
    delivered: number;
    failed: number;
    retried: number;
    scanned: number;
}
export declare function createNotificationDeliveryProviderPort(adapter: NotificationDeliveryProviderAdapter): NotificationDeliveryProviderPort;
export declare function createDeterministicNotificationDeliveryProviderAdapter(options?: DeterministicNotificationDeliveryProviderOptions): DeterministicNotificationDeliveryProviderAdapter;
export declare function createDisabledNotificationDeliveryProviderAdapter(reason?: string): NotificationDeliveryProviderPort;
export declare function createWebPushNotificationDeliveryProviderAdapter(client: WebPushProviderClient): NotificationDeliveryProviderPort;
export declare function executeNotificationDeliveryWorker(input: NotificationDeliveryWorkerInput): Promise<NotificationDeliveryWorkerResult>;
