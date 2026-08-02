export type NotificationCategory = "sla_risk" | "channel_failure" | "export_completion" | "invite_event" | "privileged_admin";
export type NotificationTone = "danger" | "info" | "ok" | "warn";
export type NotificationActionTarget = {
    fileName?: string;
    format?: string;
    jobId: string;
    kind: "download";
    service: "reports";
} | {
    kind: "navigate";
    resourceId?: string;
    section: string;
};
export interface NotificationRecord {
    action: string;
    actionTarget?: NotificationActionTarget | null;
    category: NotificationCategory;
    createdAt: string;
    detail: string;
    history: string;
    id: string;
    meta: string;
    readAt: string | null;
    recipientUserId: string | null;
    tenantId: string;
    title: string;
    tone: NotificationTone;
    type: string;
    typeKey: string;
}
export interface NotificationPreferencesRecord {
    browserPushEnabled: boolean;
    browserPushEndpoint: string | null;
    browserPushPermission: string | null;
    browserPushSubscriptionId: string | null;
    enabledExternalChannelIds: string[];
    mutedSoundRuleIds: string[];
    mutedTypeKeys: string[];
    tenantId: string;
    updatedAt: string;
    userId: string | null;
}
export interface BrowserPushSubscriptionRecord {
    createdAt: string;
    endpoint: string;
    endpointHash: string;
    expirationTime: number | null;
    id: string;
    keys: {
        auth: string;
        p256dh: string;
    };
    revokedAt: string | null;
    status: "active" | "revoked";
    tenantId: string;
    updatedAt: string;
    userAgent: string | null;
    userId: string | null;
}
export interface NotificationDeliveryDescriptor {
    attempts?: number;
    createdAt: string;
    deliveredAt?: string | null;
    endpointHash: string;
    failedAt?: string | null;
    id: string;
    lastError?: string | null;
    nextAttemptAt?: string | null;
    notificationId: string;
    payload: {
        body: string;
        title: string;
        url: string;
    };
    providerMessageId?: string | null;
    queue: string;
    status: "delivered" | "failed" | "processing" | "queued";
    subscriptionId: string;
    tenantId: string;
    traceId: string;
    type: "browser-push.critical-alert.test";
    updatedAt?: string;
    userId: string | null;
}
export interface NotificationPreferenceAuditEvent {
    action: string;
    at: string;
    id: string;
    immutable: true;
    reason: string;
    result: "ok";
    tenantId: string;
    traceId: string;
    userId: string | null;
}
export interface NotificationState {
    browserPushSubscriptions: BrowserPushSubscriptionRecord[];
    deliveryDescriptors: NotificationDeliveryDescriptor[];
    notifications: NotificationRecord[];
    preferenceAuditEvents: NotificationPreferenceAuditEvent[];
    preferences: NotificationPreferencesRecord[];
}
export interface NotificationListFilter {
    tenantId?: string;
    unreadOnly?: boolean;
    userId?: string;
}
export interface PrismaNotificationRepositoryOptions {
    client: PrismaNotificationClient;
}
interface PrismaNotificationDataClient {
    browserPushSubscription: {
        findMany(input: {
            orderBy?: {
                createdAt: "desc";
            };
            where?: PrismaBrowserPushSubscriptionWhereInput;
        }): Promise<PrismaBrowserPushSubscriptionRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaBrowserPushSubscriptionRow | null>;
        upsert(input: {
            create: PrismaBrowserPushSubscriptionCreateInput;
            update: PrismaBrowserPushSubscriptionUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaBrowserPushSubscriptionRow>;
    };
    notification: {
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            };
            where?: PrismaNotificationWhereInput;
        }): Promise<PrismaNotificationRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaNotificationRow | null>;
        upsert(input: {
            create: PrismaNotificationCreateInput;
            update: PrismaNotificationUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaNotificationRow>;
    };
    notificationDeliveryDescriptor: {
        findMany(input: {
            orderBy: {
                createdAt: "asc";
            };
            take?: number;
            where?: PrismaNotificationDeliveryDescriptorWhereInput;
        }): Promise<PrismaNotificationDeliveryDescriptorRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaNotificationDeliveryDescriptorRow | null>;
        updateMany(input: {
            data: Partial<PrismaNotificationDeliveryDescriptorUpdateInput>;
            where: PrismaNotificationDeliveryDescriptorWhereInput;
        }): Promise<{
            count: number;
        }>;
        upsert(input: {
            create: PrismaNotificationDeliveryDescriptorCreateInput;
            update: PrismaNotificationDeliveryDescriptorUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaNotificationDeliveryDescriptorRow>;
    };
    notificationPreference: {
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaNotificationPreferenceRow | null>;
        upsert(input: {
            create: PrismaNotificationPreferenceCreateInput;
            update: PrismaNotificationPreferenceUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaNotificationPreferenceRow>;
    };
    notificationPreferenceAuditEvent: {
        findMany(input: {
            orderBy: {
                at: "desc";
            };
            where?: PrismaNotificationPreferenceAuditEventWhereInput;
        }): Promise<PrismaNotificationPreferenceAuditEventRow[]>;
        upsert(input: {
            create: PrismaNotificationPreferenceAuditEventCreateInput;
            update: PrismaNotificationPreferenceAuditEventUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaNotificationPreferenceAuditEventRow>;
    };
}
export interface PrismaNotificationClient extends PrismaNotificationDataClient {
}
interface PrismaNotificationWhereInput {
    tenantId?: string;
}
interface PrismaNotificationRow {
    action: string;
    actionTarget: Record<string, unknown> | null;
    category: string;
    createdAt: Date;
    detail: string;
    history: string;
    id: string;
    meta: string;
    readAt: Date | null;
    recipientUserId: string | null;
    tenantId: string;
    title: string;
    tone: string;
    type: string;
    typeKey: string;
}
interface PrismaNotificationCreateInput extends PrismaNotificationRow {
}
type PrismaNotificationUpdateInput = Omit<PrismaNotificationCreateInput, "createdAt" | "id">;
interface PrismaNotificationPreferenceRow {
    browserPushEnabled: boolean;
    browserPushEndpoint: string | null;
    browserPushPermission: string | null;
    browserPushSubscriptionId: string | null;
    enabledExternalChannelIds: string[];
    id: string;
    mutedSoundRuleIds: string[];
    mutedTypeKeys: string[];
    tenantId: string;
    updatedAt: Date;
    userId: string | null;
}
interface PrismaNotificationPreferenceCreateInput extends PrismaNotificationPreferenceRow {
}
type PrismaNotificationPreferenceUpdateInput = Omit<PrismaNotificationPreferenceCreateInput, "id">;
interface PrismaBrowserPushSubscriptionWhereInput {
    endpointHash?: string;
    status?: string;
    tenantId?: string;
}
interface PrismaBrowserPushSubscriptionRow {
    createdAt: Date;
    endpoint: string;
    endpointHash: string;
    expirationTime: number | null;
    id: string;
    keyAuth: string;
    keyP256dh: string;
    revokedAt: Date | null;
    status: string;
    tenantId: string;
    updatedAt: Date;
    userAgent: string | null;
    userId: string | null;
}
interface PrismaBrowserPushSubscriptionCreateInput extends PrismaBrowserPushSubscriptionRow {
}
type PrismaBrowserPushSubscriptionUpdateInput = Omit<PrismaBrowserPushSubscriptionCreateInput, "createdAt" | "id">;
interface PrismaNotificationDeliveryDescriptorWhereInput {
    id?: string;
    queue?: string;
    status?: string | {
        in: string[];
    };
    tenantId?: string;
    updatedAt?: Date;
}
interface PrismaNotificationDeliveryDescriptorRow {
    attempts: number;
    createdAt: Date;
    deliveredAt: Date | null;
    endpointHash: string;
    failedAt: Date | null;
    id: string;
    lastError: string | null;
    nextAttemptAt: Date | null;
    notificationId: string;
    payload: Record<string, unknown>;
    providerMessageId: string | null;
    queue: string;
    status: string;
    subscriptionId: string;
    tenantId: string;
    traceId: string;
    type: string;
    updatedAt: Date;
    userId: string | null;
}
interface PrismaNotificationDeliveryDescriptorCreateInput extends PrismaNotificationDeliveryDescriptorRow {
}
type PrismaNotificationDeliveryDescriptorUpdateInput = Omit<PrismaNotificationDeliveryDescriptorCreateInput, "createdAt" | "id">;
interface PrismaNotificationPreferenceAuditEventWhereInput {
    tenantId?: string;
}
interface PrismaNotificationPreferenceAuditEventRow {
    action: string;
    at: Date;
    id: string;
    immutable: boolean;
    reason: string;
    result: string;
    tenantId: string;
    traceId: string;
    userId: string | null;
}
interface PrismaNotificationPreferenceAuditEventCreateInput extends PrismaNotificationPreferenceAuditEventRow {
}
type PrismaNotificationPreferenceAuditEventUpdateInput = Omit<PrismaNotificationPreferenceAuditEventCreateInput, "id">;
export declare class NotificationRepository {
    private readonly store;
    private readonly prismaClient?;
    private constructor();
    static default(): NotificationRepository;
    static useDefault(repository: NotificationRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: NotificationState): NotificationRepository;
    static prisma({ client }: PrismaNotificationRepositoryOptions): NotificationRepository;
    readState(): NotificationState;
    listNotifications(filter?: NotificationListFilter): NotificationRecord[];
    listNotificationsAsync(filter?: NotificationListFilter): Promise<NotificationRecord[]>;
    findNotification(notificationId: string, tenantId?: string): NotificationRecord | undefined;
    findNotificationAsync(notificationId: string, tenantId?: string): Promise<NotificationRecord | undefined>;
    saveNotification(record: NotificationRecord): NotificationRecord;
    saveNotificationAsync(record: NotificationRecord): Promise<NotificationRecord>;
    getNotificationPreferences(input: {
        tenantId: string;
        userId?: string | null;
        now?: string;
    }): NotificationPreferencesRecord;
    getNotificationPreferencesAsync(input: {
        tenantId: string;
        userId?: string | null;
        now?: string;
    }): Promise<NotificationPreferencesRecord>;
    saveNotificationPreferences(record: NotificationPreferencesRecord): NotificationPreferencesRecord;
    saveNotificationPreferencesAsync(record: NotificationPreferencesRecord): Promise<NotificationPreferencesRecord>;
    saveBrowserPushSubscription(record: BrowserPushSubscriptionRecord): BrowserPushSubscriptionRecord;
    saveBrowserPushSubscriptionAsync(record: BrowserPushSubscriptionRecord): Promise<BrowserPushSubscriptionRecord>;
    listBrowserPushSubscriptions(filter: {
        endpointHash?: string;
        status?: BrowserPushSubscriptionRecord["status"];
        tenantId: string;
        userId?: string | null;
    }): BrowserPushSubscriptionRecord[];
    listBrowserPushSubscriptionsAsync(filter: {
        endpointHash?: string;
        status?: BrowserPushSubscriptionRecord["status"];
        tenantId: string;
        userId?: string | null;
    }): Promise<BrowserPushSubscriptionRecord[]>;
    findBrowserPushSubscription(input: {
        subscriptionId: string;
        tenantId: string;
        userId?: string | null;
    }): BrowserPushSubscriptionRecord | undefined;
    findBrowserPushSubscriptionAsync(input: {
        subscriptionId: string;
        tenantId: string;
        userId?: string | null;
    }): Promise<BrowserPushSubscriptionRecord | undefined>;
    revokeBrowserPushSubscription(input: {
        revokedAt: string;
        subscriptionId: string;
        tenantId: string;
        userId?: string | null;
    }): BrowserPushSubscriptionRecord | undefined;
    revokeBrowserPushSubscriptionAsync(input: {
        revokedAt: string;
        subscriptionId: string;
        tenantId: string;
        userId?: string | null;
    }): Promise<BrowserPushSubscriptionRecord | undefined>;
    saveNotificationDeliveryDescriptor(descriptor: NotificationDeliveryDescriptor): NotificationDeliveryDescriptor;
    saveNotificationDeliveryDescriptorAsync(descriptor: NotificationDeliveryDescriptor): Promise<NotificationDeliveryDescriptor>;
    listNotificationDeliveryDescriptors(filter?: {
        dueBefore?: string;
        limit?: number;
        queue?: string;
        status?: NotificationDeliveryDescriptor["status"];
        tenantId?: string;
    }): NotificationDeliveryDescriptor[];
    listNotificationDeliveryDescriptorsAsync(filter?: {
        dueBefore?: string;
        limit?: number;
        queue?: string;
        status?: NotificationDeliveryDescriptor["status"];
        tenantId?: string;
    }): Promise<NotificationDeliveryDescriptor[]>;
    claimNotificationDeliveryDescriptorsAsync(input: {
        leaseMs: number;
        limit?: number;
        now: string;
        queue: string;
        tenantId?: string;
    }): Promise<NotificationDeliveryDescriptor[]>;
    markNotificationDeliveryDescriptorDelivered(input: {
        deliveredAt: string;
        descriptorId: string;
        expectedClaimedAt?: string;
        providerMessageId: string;
    }): NotificationDeliveryDescriptor | undefined;
    markNotificationDeliveryDescriptorDeliveredAsync(input: {
        deliveredAt: string;
        descriptorId: string;
        expectedClaimedAt?: string;
        providerMessageId: string;
    }): Promise<NotificationDeliveryDescriptor | undefined>;
    markNotificationDeliveryDescriptorFailed(input: {
        failedAt?: string | null;
        descriptorId: string;
        expectedClaimedAt?: string;
        lastError: string;
        nextAttemptAt?: string | null;
        retriable: boolean;
    }): NotificationDeliveryDescriptor | undefined;
    markNotificationDeliveryDescriptorFailedAsync(input: {
        failedAt?: string | null;
        descriptorId: string;
        expectedClaimedAt?: string;
        lastError: string;
        nextAttemptAt?: string | null;
        retriable: boolean;
    }): Promise<NotificationDeliveryDescriptor | undefined>;
    private updateNotificationDeliveryDescriptor;
    private updateNotificationDeliveryDescriptorAsync;
    recordPreferenceAuditEvent(event: NotificationPreferenceAuditEvent): NotificationPreferenceAuditEvent;
    recordPreferenceAuditEventAsync(event: NotificationPreferenceAuditEvent): Promise<NotificationPreferenceAuditEvent>;
    markNotificationsRead(input: {
        all?: boolean;
        notificationIds?: string[];
        readAt: string;
        tenantId: string;
        userId?: string;
    }): NotificationRecord[];
    markNotificationsReadAsync(input: {
        all?: boolean;
        notificationIds?: string[];
        readAt: string;
        tenantId: string;
        userId?: string;
    }): Promise<NotificationRecord[]>;
}
export {};
