import type { ApiEnvironmentKey, ChannelDetail, SecuritySession, WebhookDelivery } from "./integration.types.js";
export declare const channelDetails: ChannelDetail[];
export declare const apiEnvironmentKeys: ApiEnvironmentKey[];
export declare const webhookEndpoints: {
    id: string;
    name: string;
    channel: string;
    url: string;
    status: string;
    signature: string;
    retries: string;
    lastDelivery: string;
    failureRate: string;
}[];
export declare const webhookDeliveryLog: WebhookDelivery[];
export declare const apiChangelog: {
    version: string;
    title: string;
    detail: string;
}[];
export declare const securityControls: {
    id: string;
    title: string;
    state: string;
    detail: string;
    tone: string;
}[];
export declare const activeSecuritySessions: SecuritySession[];
export declare const securityAlerts: {
    id: string;
    time: string;
    level: string;
    text: string;
    route: string;
}[];
