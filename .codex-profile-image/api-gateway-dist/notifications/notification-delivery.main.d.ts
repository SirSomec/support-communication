type NotificationDeliveryProviderMode = "disabled" | "local" | "web-push";
export interface NotificationDeliveryWorkerRuntimeConfig {
    intervalMs: number;
    limit: number;
    maxAttempts: number;
    once: boolean;
    providerMode: NotificationDeliveryProviderMode;
    queue: string;
    retryDelayMs: number;
}
export declare function runNotificationDeliveryWorkerFromEnv(source?: NodeJS.ProcessEnv): Promise<void>;
export declare function loadNotificationDeliveryWorkerRuntimeConfig(source?: NodeJS.ProcessEnv, argv?: string[]): NotificationDeliveryWorkerRuntimeConfig;
export declare function assertNotificationDeliveryProviderReady(source: NodeJS.ProcessEnv, providerMode: NotificationDeliveryProviderMode): void;
export {};
