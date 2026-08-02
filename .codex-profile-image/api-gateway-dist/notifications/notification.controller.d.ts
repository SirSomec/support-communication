import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { NotificationService } from "./notification.service.js";
export declare class NotificationController {
    private readonly notificationService;
    constructor(notificationService: NotificationService);
    fetchNotifications(query: {
        unreadOnly?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    markNotificationsRead(payload: {
        all?: boolean;
        notificationIds?: string[];
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchNotificationPreferences(request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchBrowserPushPublicKey(request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createBrowserPushSubscription(payload: {
        endpoint?: string;
        expirationTime?: number | null;
        keys?: {
            auth?: string;
            p256dh?: string;
        };
        userAgent?: string | null;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    deleteBrowserPushSubscription(subscriptionId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    sendCriticalAlertTest(payload: {
        channelIds?: string[];
        includeBrowserPush?: boolean;
        message?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateNotificationPreferences(payload: {
        browserPushEnabled?: boolean;
        browserPushEndpoint?: string | null;
        browserPushPermission?: string | null;
        browserPushSubscriptionId?: string | null;
        enabledExternalChannelIds?: string[];
        mutedSoundRuleIds?: string[];
        mutedTypeKeys?: string[];
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
