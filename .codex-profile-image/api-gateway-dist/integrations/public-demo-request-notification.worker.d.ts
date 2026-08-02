import type { PublicDemoRequestNotificationDescriptor, PublicDemoRequestNotificationStatus } from "./integration.repository.js";
export interface PublicDemoRequestNotificationProvider {
    disabled?: boolean;
    send(input: PublicDemoRequestNotificationProviderInput): Promise<PublicDemoRequestNotificationProviderResult>;
}
export interface PublicDemoRequestNotificationProviderInput {
    descriptor: PublicDemoRequestNotificationDescriptor;
    now: string;
}
export interface PublicDemoRequestNotificationProviderResult {
    providerMessageId: string;
}
export interface SmtpPublicDemoRequestNotificationProviderOptions {
    auth?: {
        password: string;
        username: string;
    };
    from: string;
    host: string;
    port: number;
    secure?: boolean;
    timeoutMs?: number;
    tlsRejectUnauthorized?: boolean;
    to: string;
}
export interface PublicDemoRequestNotificationWorkerRepository {
    listPublicDemoRequestNotificationDescriptorsAsync(filters: {
        limit?: number;
        queue: "lead-notification";
        status: PublicDemoRequestNotificationStatus;
    }): Promise<PublicDemoRequestNotificationDescriptor[]>;
    savePublicDemoRequestNotificationDescriptorAsync(descriptor: PublicDemoRequestNotificationDescriptor): Promise<PublicDemoRequestNotificationDescriptor>;
}
export interface ExecutePublicDemoRequestNotificationWorkerInput {
    limit?: number;
    now?: string;
    provider: PublicDemoRequestNotificationProvider;
    repository: PublicDemoRequestNotificationWorkerRepository;
}
export interface ExecutePublicDemoRequestNotificationWorkerResult {
    delivered: number;
    failed: number;
    scanned: number;
}
export declare function executePublicDemoRequestNotificationWorker(input: ExecutePublicDemoRequestNotificationWorkerInput): Promise<ExecutePublicDemoRequestNotificationWorkerResult>;
export declare function createDeterministicPublicDemoRequestNotificationProvider(): PublicDemoRequestNotificationProvider;
export declare function createSmtpPublicDemoRequestNotificationProvider(options: SmtpPublicDemoRequestNotificationProviderOptions): PublicDemoRequestNotificationProvider;
export declare function createDisabledPublicDemoRequestNotificationProvider(reason: string): PublicDemoRequestNotificationProvider;
