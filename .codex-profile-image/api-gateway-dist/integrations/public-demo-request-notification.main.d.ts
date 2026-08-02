interface PublicDemoRequestNotificationWorkerRuntimeConfig {
    intervalMs: number;
    limit: number;
    once: boolean;
    providerMode: "disabled" | "local" | "smtp";
}
export declare function runPublicDemoRequestNotificationWorkerFromEnv(source?: NodeJS.ProcessEnv, argv?: string[]): Promise<void>;
export declare function loadPublicDemoRequestNotificationWorkerRuntimeConfig(source?: NodeJS.ProcessEnv, argv?: string[]): PublicDemoRequestNotificationWorkerRuntimeConfig;
export declare function createPublicDemoRequestNotificationProviderFromEnv(source: NodeJS.ProcessEnv, providerMode: PublicDemoRequestNotificationWorkerRuntimeConfig["providerMode"]): import("./public-demo-request-notification.worker.js").PublicDemoRequestNotificationProvider;
export {};
