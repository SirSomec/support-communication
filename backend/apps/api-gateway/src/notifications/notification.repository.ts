import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";

export type NotificationCategory =
  | "sla_risk"
  | "channel_failure"
  | "export_completion"
  | "invite_event"
  | "privileged_admin";

export type NotificationTone = "danger" | "info" | "ok" | "warn";

export type NotificationActionTarget =
  | {
      fileName?: string;
      format?: string;
      jobId: string;
      kind: "download";
      service: "reports";
    }
  | {
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
  status: "delivered" | "failed" | "queued";
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

export interface NotificationRepositoryOptions {
  filePath: string;
}

export interface PrismaNotificationRepositoryOptions {
  client: PrismaNotificationClient;
}

interface PrismaNotificationDataClient {
  browserPushSubscription: {
    findMany(input: { orderBy?: { createdAt: "desc" }; where?: PrismaBrowserPushSubscriptionWhereInput }): Promise<PrismaBrowserPushSubscriptionRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaBrowserPushSubscriptionRow | null>;
    upsert(input: {
      create: PrismaBrowserPushSubscriptionCreateInput;
      update: PrismaBrowserPushSubscriptionUpdateInput;
      where: { id: string };
    }): Promise<PrismaBrowserPushSubscriptionRow>;
  };
  notification: {
    findMany(input: { orderBy: { createdAt: "desc" }; where?: PrismaNotificationWhereInput }): Promise<PrismaNotificationRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaNotificationRow | null>;
    upsert(input: {
      create: PrismaNotificationCreateInput;
      update: PrismaNotificationUpdateInput;
      where: { id: string };
    }): Promise<PrismaNotificationRow>;
  };
  notificationDeliveryDescriptor: {
    findMany(input: { orderBy: { createdAt: "asc" }; take?: number; where?: PrismaNotificationDeliveryDescriptorWhereInput }): Promise<PrismaNotificationDeliveryDescriptorRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaNotificationDeliveryDescriptorRow | null>;
    upsert(input: {
      create: PrismaNotificationDeliveryDescriptorCreateInput;
      update: PrismaNotificationDeliveryDescriptorUpdateInput;
      where: { id: string };
    }): Promise<PrismaNotificationDeliveryDescriptorRow>;
  };
  notificationPreference: {
    findUnique(input: { where: { id: string } }): Promise<PrismaNotificationPreferenceRow | null>;
    upsert(input: {
      create: PrismaNotificationPreferenceCreateInput;
      update: PrismaNotificationPreferenceUpdateInput;
      where: { id: string };
    }): Promise<PrismaNotificationPreferenceRow>;
  };
  notificationPreferenceAuditEvent: {
    findMany(input: { orderBy: { at: "desc" }; where?: PrismaNotificationPreferenceAuditEventWhereInput }): Promise<PrismaNotificationPreferenceAuditEventRow[]>;
    upsert(input: {
      create: PrismaNotificationPreferenceAuditEventCreateInput;
      update: PrismaNotificationPreferenceAuditEventUpdateInput;
      where: { id: string };
    }): Promise<PrismaNotificationPreferenceAuditEventRow>;
  };
}

export interface PrismaNotificationClient extends PrismaNotificationDataClient {}

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

interface PrismaNotificationCreateInput extends PrismaNotificationRow {}

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

interface PrismaNotificationPreferenceCreateInput extends PrismaNotificationPreferenceRow {}

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

interface PrismaBrowserPushSubscriptionCreateInput extends PrismaBrowserPushSubscriptionRow {}

type PrismaBrowserPushSubscriptionUpdateInput = Omit<PrismaBrowserPushSubscriptionCreateInput, "createdAt" | "id">;

interface PrismaNotificationDeliveryDescriptorWhereInput {
  queue?: string;
  status?: string;
  tenantId?: string;
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

interface PrismaNotificationDeliveryDescriptorCreateInput extends PrismaNotificationDeliveryDescriptorRow {}

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

interface PrismaNotificationPreferenceAuditEventCreateInput extends PrismaNotificationPreferenceAuditEventRow {}

type PrismaNotificationPreferenceAuditEventUpdateInput = Omit<PrismaNotificationPreferenceAuditEventCreateInput, "id">;

let defaultNotificationRepository: NotificationRepository | null = null;

export class NotificationRepository {
  private constructor(
    private readonly store: DurableStore<NotificationState>,
    private readonly prismaClient?: PrismaNotificationClient
  ) {}

  static default(): NotificationRepository {
    return defaultNotificationRepository ?? NotificationRepository.inMemory();
  }

  static useDefault(repository: NotificationRepository): void {
    defaultNotificationRepository = repository;
  }

  static clearDefault(): void {
    defaultNotificationRepository = null;
  }

  static inMemory(seed: NotificationState = seedNotificationState()): NotificationRepository {
    return new NotificationRepository(new InMemoryStore(normalizeState(seed)));
  }

  static open({ filePath }: NotificationRepositoryOptions): NotificationRepository {
    return new NotificationRepository(new JsonFileStore({ filePath, seed: seedNotificationState() }));
  }

  static prisma({ client }: PrismaNotificationRepositoryOptions): NotificationRepository {
    assertCompletePrismaNotificationClient(client);
    return new NotificationRepository(new InMemoryStore(seedNotificationState()), client);
  }

  readState(): NotificationState {
    if (this.prismaClient) {
      throw new Error("prisma_notifications_async_required");
    }

    return clone(normalizeState(this.store.read()));
  }

  listNotifications(filter: NotificationListFilter = {}): NotificationRecord[] {
    if (this.prismaClient) {
      throw new Error("prisma_notifications_async_required");
    }

    if (!filter.tenantId) {
      return [];
    }

    return clone(this.readState().notifications
      .filter((notification) => notification.tenantId === filter.tenantId)
      .filter((notification) => !filter.userId || !notification.recipientUserId || notification.recipientUserId === filter.userId)
      .filter((notification) => !filter.unreadOnly || !notification.readAt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }

  async listNotificationsAsync(filter: NotificationListFilter = {}): Promise<NotificationRecord[]> {
    if (this.prismaClient) {
      if (!filter.tenantId) {
        return [];
      }

      const rows = await this.prismaClient.notification.findMany({
        orderBy: { createdAt: "desc" },
        where: { tenantId: filter.tenantId }
      });
      return rows.map(toNotificationRecord)
        .filter((notification) => !filter.userId || !notification.recipientUserId || notification.recipientUserId === filter.userId)
        .filter((notification) => !filter.unreadOnly || !notification.readAt);
    }

    return this.listNotifications(filter);
  }

  findNotification(notificationId: string, tenantId?: string): NotificationRecord | undefined {
    if (this.prismaClient) {
      throw new Error("prisma_notifications_async_required");
    }

    return this.readState().notifications.find((notification) =>
      notification.id === notificationId
        && (!tenantId || notification.tenantId === tenantId)
    );
  }

  async findNotificationAsync(notificationId: string, tenantId?: string): Promise<NotificationRecord | undefined> {
    if (this.prismaClient) {
      const row = await this.prismaClient.notification.findUnique({ where: { id: requireString(notificationId) } });
      const notification = row ? toNotificationRecord(row) : undefined;
      return notification && (!tenantId || notification.tenantId === tenantId) ? notification : undefined;
    }

    return this.findNotification(notificationId, tenantId);
  }

  saveNotification(record: NotificationRecord): NotificationRecord {
    if (this.prismaClient) {
      throw new Error("prisma_notifications_async_required");
    }

    const persisted = normalizeNotification(record);
    this.store.update((state) => {
      const normalized = normalizeState(state);
      const exists = normalized.notifications.some((item) => item.id === persisted.id);
      return {
        ...normalized,
        notifications: exists
          ? normalized.notifications.map((item) => item.id === persisted.id ? persisted : item)
          : [...normalized.notifications, persisted]
      };
    });

    return clone(persisted);
  }

  async saveNotificationAsync(record: NotificationRecord): Promise<NotificationRecord> {
    const persisted = normalizeNotification(record);
    if (this.prismaClient) {
      const create = toPrismaNotificationCreateInput(persisted);
      const row = await this.prismaClient.notification.upsert({
        create,
        update: toPrismaNotificationUpdateInput(create),
        where: { id: create.id }
      });
      return toNotificationRecord(row);
    }

    return this.saveNotification(persisted);
  }

  getNotificationPreferences(input: { tenantId: string; userId?: string | null; now?: string }): NotificationPreferencesRecord {
    if (this.prismaClient) {
      throw new Error("prisma_notification_preferences_async_required");
    }

    const tenantId = requireString(input.tenantId);
    const userId = nullableString(input.userId);
    const existing = this.readState().preferences?.find((preference) =>
      preference.tenantId === tenantId
        && preference.userId === userId
    );

    return clone(existing ?? defaultNotificationPreferences({
      now: input.now,
      tenantId,
      userId
    }));
  }

  async getNotificationPreferencesAsync(input: { tenantId: string; userId?: string | null; now?: string }): Promise<NotificationPreferencesRecord> {
    const tenantId = requireString(input.tenantId);
    const userId = nullableString(input.userId);
    if (this.prismaClient) {
      const row = await this.prismaClient.notificationPreference.findUnique({ where: { id: notificationPreferenceId(tenantId, userId) } });
      return row ? toNotificationPreferencesRecord(row) : defaultNotificationPreferences({
        now: input.now,
        tenantId,
        userId
      });
    }

    return this.getNotificationPreferences(input);
  }

  saveNotificationPreferences(record: NotificationPreferencesRecord): NotificationPreferencesRecord {
    if (this.prismaClient) {
      throw new Error("prisma_notification_preferences_async_required");
    }

    const persisted = normalizeNotificationPreferences(record);

    this.store.update((state) => {
      const normalized = normalizeState(state);
      const exists = normalized.preferences.some((preference) =>
        preference.tenantId === persisted.tenantId
          && preference.userId === persisted.userId
      );

      return {
        ...normalized,
        preferences: exists
          ? normalized.preferences.map((preference) =>
              preference.tenantId === persisted.tenantId && preference.userId === persisted.userId ? persisted : preference
            )
          : [...normalized.preferences, persisted]
      };
    });

    return clone(persisted);
  }

  async saveNotificationPreferencesAsync(record: NotificationPreferencesRecord): Promise<NotificationPreferencesRecord> {
    const persisted = normalizeNotificationPreferences(record);
    if (this.prismaClient) {
      const create = toPrismaNotificationPreferenceCreateInput(persisted);
      const row = await this.prismaClient.notificationPreference.upsert({
        create,
        update: toPrismaNotificationPreferenceUpdateInput(create),
        where: { id: create.id }
      });
      return toNotificationPreferencesRecord(row);
    }

    return this.saveNotificationPreferences(persisted);
  }

  saveBrowserPushSubscription(record: BrowserPushSubscriptionRecord): BrowserPushSubscriptionRecord {
    if (this.prismaClient) {
      throw new Error("prisma_browser_push_subscriptions_async_required");
    }

    const persisted = normalizeBrowserPushSubscription(record);

    this.store.update((state) => {
      const normalized = normalizeState(state);
      const exists = normalized.browserPushSubscriptions.some((subscription) => subscription.id === persisted.id);

      return {
        ...normalized,
        browserPushSubscriptions: exists
          ? normalized.browserPushSubscriptions.map((subscription) => subscription.id === persisted.id ? persisted : subscription)
          : [...normalized.browserPushSubscriptions, persisted]
      };
    });

    return clone(persisted);
  }

  async saveBrowserPushSubscriptionAsync(record: BrowserPushSubscriptionRecord): Promise<BrowserPushSubscriptionRecord> {
    const persisted = normalizeBrowserPushSubscription(record);
    if (this.prismaClient) {
      const create = toPrismaBrowserPushSubscriptionCreateInput(persisted);
      const row = await this.prismaClient.browserPushSubscription.upsert({
        create,
        update: toPrismaBrowserPushSubscriptionUpdateInput(create),
        where: { id: create.id }
      });
      return toBrowserPushSubscriptionRecord(row);
    }

    return this.saveBrowserPushSubscription(persisted);
  }

  listBrowserPushSubscriptions(filter: {
    endpointHash?: string;
    status?: BrowserPushSubscriptionRecord["status"];
    tenantId: string;
    userId?: string | null;
  }): BrowserPushSubscriptionRecord[] {
    if (this.prismaClient) {
      throw new Error("prisma_browser_push_subscriptions_async_required");
    }

    const tenantId = requireString(filter.tenantId);
    const userId = nullableString(filter.userId);
    return clone(this.readState().browserPushSubscriptions
      .filter((subscription) => subscription.tenantId === tenantId)
      .filter((subscription) => userId === null || subscription.userId === userId)
      .filter((subscription) => !filter.endpointHash || subscription.endpointHash === filter.endpointHash)
      .filter((subscription) => !filter.status || subscription.status === filter.status));
  }

  async listBrowserPushSubscriptionsAsync(filter: {
    endpointHash?: string;
    status?: BrowserPushSubscriptionRecord["status"];
    tenantId: string;
    userId?: string | null;
  }): Promise<BrowserPushSubscriptionRecord[]> {
    const tenantId = requireString(filter.tenantId);
    const userId = nullableString(filter.userId);
    if (this.prismaClient) {
      const rows = await this.prismaClient.browserPushSubscription.findMany({
        orderBy: { createdAt: "desc" },
        where: {
          ...(filter.endpointHash ? { endpointHash: filter.endpointHash } : {}),
          ...(filter.status ? { status: filter.status } : {}),
          tenantId
        }
      });
      return rows.map(toBrowserPushSubscriptionRecord)
        .filter((subscription) => userId === null || subscription.userId === userId);
    }

    return this.listBrowserPushSubscriptions(filter);
  }

  findBrowserPushSubscription(input: {
    subscriptionId: string;
    tenantId: string;
    userId?: string | null;
  }): BrowserPushSubscriptionRecord | undefined {
    if (this.prismaClient) {
      throw new Error("prisma_browser_push_subscriptions_async_required");
    }

    const tenantId = requireString(input.tenantId);
    const subscriptionId = requireString(input.subscriptionId);
    const userId = nullableString(input.userId);
    return clone(this.readState().browserPushSubscriptions.find((subscription) =>
      subscription.id === subscriptionId
        && subscription.tenantId === tenantId
        && (userId === null || subscription.userId === userId)
    ));
  }

  async findBrowserPushSubscriptionAsync(input: {
    subscriptionId: string;
    tenantId: string;
    userId?: string | null;
  }): Promise<BrowserPushSubscriptionRecord | undefined> {
    const tenantId = requireString(input.tenantId);
    const subscriptionId = requireString(input.subscriptionId);
    const userId = nullableString(input.userId);
    if (this.prismaClient) {
      const row = await this.prismaClient.browserPushSubscription.findUnique({ where: { id: subscriptionId } });
      const subscription = row ? toBrowserPushSubscriptionRecord(row) : undefined;
      return subscription
        && subscription.tenantId === tenantId
        && (userId === null || subscription.userId === userId)
        ? subscription
        : undefined;
    }

    return this.findBrowserPushSubscription(input);
  }

  revokeBrowserPushSubscription(input: {
    revokedAt: string;
    subscriptionId: string;
    tenantId: string;
    userId?: string | null;
  }): BrowserPushSubscriptionRecord | undefined {
    if (this.prismaClient) {
      throw new Error("prisma_browser_push_subscriptions_async_required");
    }

    const tenantId = requireString(input.tenantId);
    const subscriptionId = requireString(input.subscriptionId);
    const userId = nullableString(input.userId);
    let revoked: BrowserPushSubscriptionRecord | undefined;

    this.store.update((state) => {
      const normalized = normalizeState(state);
      return {
        ...normalized,
        browserPushSubscriptions: normalized.browserPushSubscriptions.map((subscription) => {
          if (
            subscription.id !== subscriptionId
            || subscription.tenantId !== tenantId
            || (userId !== null && subscription.userId !== userId)
          ) {
            return subscription;
          }

          revoked = {
            ...subscription,
            revokedAt: input.revokedAt,
            status: "revoked",
            updatedAt: input.revokedAt
          };
          return revoked;
        })
      };
    });

    return revoked ? clone(revoked) : undefined;
  }

  async revokeBrowserPushSubscriptionAsync(input: {
    revokedAt: string;
    subscriptionId: string;
    tenantId: string;
    userId?: string | null;
  }): Promise<BrowserPushSubscriptionRecord | undefined> {
    if (this.prismaClient) {
      const subscription = await this.findBrowserPushSubscriptionAsync(input);
      if (!subscription) {
        return undefined;
      }

      return this.saveBrowserPushSubscriptionAsync({
        ...subscription,
        revokedAt: input.revokedAt,
        status: "revoked",
        updatedAt: input.revokedAt
      });
    }

    return this.revokeBrowserPushSubscription(input);
  }

  saveNotificationDeliveryDescriptor(descriptor: NotificationDeliveryDescriptor): NotificationDeliveryDescriptor {
    if (this.prismaClient) {
      throw new Error("prisma_notification_delivery_descriptors_async_required");
    }

    const persisted = normalizeNotificationDeliveryDescriptor(descriptor);

    this.store.update((state) => {
      const normalized = normalizeState(state);
      const exists = normalized.deliveryDescriptors.some((item) => item.id === persisted.id);
      return {
        ...normalized,
        deliveryDescriptors: exists
          ? normalized.deliveryDescriptors.map((item) => item.id === persisted.id ? persisted : item)
          : [...normalized.deliveryDescriptors, persisted]
      };
    });

    return clone(persisted);
  }

  async saveNotificationDeliveryDescriptorAsync(descriptor: NotificationDeliveryDescriptor): Promise<NotificationDeliveryDescriptor> {
    const persisted = normalizeNotificationDeliveryDescriptor(descriptor);
    if (this.prismaClient) {
      const create = toPrismaNotificationDeliveryDescriptorCreateInput(persisted);
      const row = await this.prismaClient.notificationDeliveryDescriptor.upsert({
        create,
        update: toPrismaNotificationDeliveryDescriptorUpdateInput(create),
        where: { id: create.id }
      });
      return toNotificationDeliveryDescriptor(row);
    }

    return this.saveNotificationDeliveryDescriptor(persisted);
  }

  listNotificationDeliveryDescriptors(filter: {
    dueBefore?: string;
    limit?: number;
    queue?: string;
    status?: NotificationDeliveryDescriptor["status"];
    tenantId?: string;
  } = {}): NotificationDeliveryDescriptor[] {
    if (this.prismaClient) {
      throw new Error("prisma_notification_delivery_descriptors_async_required");
    }

    const dueBefore = nullableString(filter.dueBefore);
    const queue = nullableString(filter.queue);
    const tenantId = nullableString(filter.tenantId);
    const descriptors = this.readState().deliveryDescriptors
      .filter((descriptor) => !queue || descriptor.queue === queue)
      .filter((descriptor) => !filter.status || descriptor.status === filter.status)
      .filter((descriptor) => !tenantId || descriptor.tenantId === tenantId)
      .filter((descriptor) => !dueBefore || !descriptor.nextAttemptAt || descriptor.nextAttemptAt <= dueBefore)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const limit = Number.isInteger(filter.limit) && Number(filter.limit) >= 0
      ? Number(filter.limit)
      : descriptors.length;
    return clone(descriptors.slice(0, limit));
  }

  async listNotificationDeliveryDescriptorsAsync(filter: {
    dueBefore?: string;
    limit?: number;
    queue?: string;
    status?: NotificationDeliveryDescriptor["status"];
    tenantId?: string;
  } = {}): Promise<NotificationDeliveryDescriptor[]> {
    if (this.prismaClient) {
      const dueBefore = nullableString(filter.dueBefore);
      const rows = await this.prismaClient.notificationDeliveryDescriptor.findMany({
        orderBy: { createdAt: "asc" },
        where: {
          ...(filter.queue ? { queue: filter.queue } : {}),
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.tenantId ? { tenantId: filter.tenantId } : {})
        }
      });
      const descriptors = rows.map(toNotificationDeliveryDescriptor)
        .filter((descriptor) => !dueBefore || !descriptor.nextAttemptAt || descriptor.nextAttemptAt <= dueBefore);
      const limit = Number.isInteger(filter.limit) && Number(filter.limit) >= 0
        ? Number(filter.limit)
        : descriptors.length;
      return clone(descriptors.slice(0, limit));
    }

    return this.listNotificationDeliveryDescriptors(filter);
  }

  markNotificationDeliveryDescriptorDelivered(input: {
    deliveredAt: string;
    descriptorId: string;
    providerMessageId: string;
  }): NotificationDeliveryDescriptor | undefined {
    return this.updateNotificationDeliveryDescriptor(input.descriptorId, (descriptor) => ({
      ...descriptor,
      attempts: (descriptor.attempts ?? 0) + 1,
      deliveredAt: input.deliveredAt,
      failedAt: null,
      lastError: null,
      nextAttemptAt: null,
      providerMessageId: input.providerMessageId,
      status: "delivered",
      updatedAt: input.deliveredAt
    }));
  }

  async markNotificationDeliveryDescriptorDeliveredAsync(input: {
    deliveredAt: string;
    descriptorId: string;
    providerMessageId: string;
  }): Promise<NotificationDeliveryDescriptor | undefined> {
    return this.updateNotificationDeliveryDescriptorAsync(input.descriptorId, (descriptor) => ({
      ...descriptor,
      attempts: (descriptor.attempts ?? 0) + 1,
      deliveredAt: input.deliveredAt,
      failedAt: null,
      lastError: null,
      nextAttemptAt: null,
      providerMessageId: input.providerMessageId,
      status: "delivered",
      updatedAt: input.deliveredAt
    }));
  }

  markNotificationDeliveryDescriptorFailed(input: {
    failedAt?: string | null;
    descriptorId: string;
    lastError: string;
    nextAttemptAt?: string | null;
    retriable: boolean;
  }): NotificationDeliveryDescriptor | undefined {
    const updatedAt = input.failedAt ?? new Date().toISOString();
    return this.updateNotificationDeliveryDescriptor(input.descriptorId, (descriptor) => ({
      ...descriptor,
      attempts: (descriptor.attempts ?? 0) + 1,
      deliveredAt: null,
      failedAt: input.retriable ? null : updatedAt,
      lastError: input.lastError,
      nextAttemptAt: input.retriable ? input.nextAttemptAt ?? null : null,
      providerMessageId: null,
      status: input.retriable ? "queued" : "failed",
      updatedAt
    }));
  }

  async markNotificationDeliveryDescriptorFailedAsync(input: {
    failedAt?: string | null;
    descriptorId: string;
    lastError: string;
    nextAttemptAt?: string | null;
    retriable: boolean;
  }): Promise<NotificationDeliveryDescriptor | undefined> {
    const updatedAt = input.failedAt ?? new Date().toISOString();
    return this.updateNotificationDeliveryDescriptorAsync(input.descriptorId, (descriptor) => ({
      ...descriptor,
      attempts: (descriptor.attempts ?? 0) + 1,
      deliveredAt: null,
      failedAt: input.retriable ? null : updatedAt,
      lastError: input.lastError,
      nextAttemptAt: input.retriable ? input.nextAttemptAt ?? null : null,
      providerMessageId: null,
      status: input.retriable ? "queued" : "failed",
      updatedAt
    }));
  }

  private updateNotificationDeliveryDescriptor(
    descriptorId: string,
    update: (descriptor: NotificationDeliveryDescriptor) => NotificationDeliveryDescriptor
  ): NotificationDeliveryDescriptor | undefined {
    if (this.prismaClient) {
      throw new Error("prisma_notification_delivery_descriptors_async_required");
    }

    const normalizedDescriptorId = requireString(descriptorId);
    let updated: NotificationDeliveryDescriptor | undefined;

    this.store.update((state) => {
      const normalized = normalizeState(state);
      return {
        ...normalized,
        deliveryDescriptors: normalized.deliveryDescriptors.map((descriptor) => {
          if (descriptor.id !== normalizedDescriptorId) {
            return descriptor;
          }

          updated = normalizeNotificationDeliveryDescriptor(update(descriptor));
          return updated;
        })
      };
    });

    return updated ? clone(updated) : undefined;
  }

  private async updateNotificationDeliveryDescriptorAsync(
    descriptorId: string,
    update: (descriptor: NotificationDeliveryDescriptor) => NotificationDeliveryDescriptor
  ): Promise<NotificationDeliveryDescriptor | undefined> {
    if (this.prismaClient) {
      const normalizedDescriptorId = requireString(descriptorId);
      const row = await this.prismaClient.notificationDeliveryDescriptor.findUnique({ where: { id: normalizedDescriptorId } });
      if (!row) {
        return undefined;
      }

      return this.saveNotificationDeliveryDescriptorAsync(update(toNotificationDeliveryDescriptor(row)));
    }

    return this.updateNotificationDeliveryDescriptor(descriptorId, update);
  }

  recordPreferenceAuditEvent(event: NotificationPreferenceAuditEvent): NotificationPreferenceAuditEvent {
    if (this.prismaClient) {
      throw new Error("prisma_notification_preference_audit_async_required");
    }

    const persisted = normalizePreferenceAuditEvent(event);
    this.store.update((state) => {
      const normalized = normalizeState(state);
      return {
        ...normalized,
        preferenceAuditEvents: [...normalized.preferenceAuditEvents, persisted]
      };
    });
    return clone(persisted);
  }

  async recordPreferenceAuditEventAsync(event: NotificationPreferenceAuditEvent): Promise<NotificationPreferenceAuditEvent> {
    const persisted = normalizePreferenceAuditEvent(event);
    if (this.prismaClient) {
      const create = toPrismaNotificationPreferenceAuditEventCreateInput(persisted);
      const row = await this.prismaClient.notificationPreferenceAuditEvent.upsert({
        create,
        update: toPrismaNotificationPreferenceAuditEventUpdateInput(create),
        where: { id: create.id }
      });
      return toNotificationPreferenceAuditEvent(row);
    }

    return this.recordPreferenceAuditEvent(persisted);
  }

  markNotificationsRead(input: {
    all?: boolean;
    notificationIds?: string[];
    readAt: string;
    tenantId: string;
    userId?: string;
  }): NotificationRecord[] {
    if (this.prismaClient) {
      throw new Error("prisma_notifications_async_required");
    }

    const ids = new Set(input.notificationIds ?? []);
    const updated: NotificationRecord[] = [];

    this.store.update((state) => {
      const normalized = normalizeState(state);
      return {
        ...normalized,
        notifications: normalized.notifications.map((notification) => {
        if (notification.tenantId !== input.tenantId) {
          return notification;
        }

        if (input.userId && notification.recipientUserId && notification.recipientUserId !== input.userId) {
          return notification;
        }

        const shouldMark = input.all
          ? !notification.readAt
          : ids.has(notification.id);

        if (!shouldMark || notification.readAt) {
          return notification;
        }

        const next = {
          ...notification,
          readAt: input.readAt
        };
        updated.push(clone(next));
        return next;
      })
      };
    });

    return updated;
  }

  async markNotificationsReadAsync(input: {
    all?: boolean;
    notificationIds?: string[];
    readAt: string;
    tenantId: string;
    userId?: string;
  }): Promise<NotificationRecord[]> {
    if (this.prismaClient) {
      const ids = new Set(input.notificationIds ?? []);
      const notifications = await this.listNotificationsAsync({ tenantId: input.tenantId, userId: input.userId });
      const updated = notifications.filter((notification) => {
        const shouldMark = input.all ? !notification.readAt : ids.has(notification.id);
        return shouldMark && !notification.readAt;
      }).map((notification) => ({
        ...notification,
        readAt: input.readAt
      }));

      return Promise.all(updated.map((notification) => this.saveNotificationAsync(notification)));
    }

    return this.markNotificationsRead(input);
  }
}

function seedNotificationState(): NotificationState {
  return {
    browserPushSubscriptions: [],
    deliveryDescriptors: [],
    notifications: [
      {
        id: "notif-sla-vladimir",
        actionTarget: {
          kind: "navigate",
          resourceId: "vladimir",
          section: "dialogs"
        },
        tenantId: "tenant-volga",
        category: "sla_risk",
        type: "SLA",
        typeKey: "sla",
        title: "Владимир Б. без тематики",
        detail: "Закрытие заблокировано, SLA просрочен",
        meta: "Telegram · очередь спасения",
        action: "Открыть диалог",
        tone: "danger",
        history: "11:36 · SLA alert доставлен старшему сотруднику",
        readAt: null,
        recipientUserId: null,
        createdAt: "2026-07-02T08:36:00.000Z"
      },
      {
        id: "notif-mention-anna",
        actionTarget: {
          kind: "navigate",
          resourceId: "irina",
          section: "dialogs"
        },
        tenantId: "tenant-volga",
        category: "invite_event",
        type: "Mention",
        typeKey: "mention",
        title: "Анна Р. упомянула вас",
        detail: "Нужна проверка возврата до закрытия",
        meta: "MAX · старший сотрудник",
        action: "Посмотреть",
        tone: "warn",
        history: "11:34 · mention из внутреннего комментария",
        readAt: null,
        recipientUserId: null,
        createdAt: "2026-07-02T08:34:00.000Z"
      },
      {
        id: "notif-channel-vk",
        actionTarget: {
          kind: "navigate",
          resourceId: "vk",
          section: "settings"
        },
        tenantId: "tenant-volga",
        category: "channel_failure",
        type: "Channel",
        typeKey: "channel",
        title: "VK: рост ошибок webhook",
        detail: "3 ошибки доставки за последние 15 минут",
        meta: "Интеграции · требует администратора",
        action: "Открыть канал",
        tone: "info",
        history: "11:31 · webhook retry превысил порог",
        readAt: null,
        recipientUserId: null,
        createdAt: "2026-07-02T08:31:00.000Z"
      },
      {
        id: "notif-ladoga-sla",
        actionTarget: {
          kind: "navigate",
          resourceId: "tenant-ladoga",
          section: "panel"
        },
        tenantId: "tenant-ladoga",
        category: "sla_risk",
        type: "SLA",
        typeKey: "sla",
        title: "Очередь Ladoga перегружена",
        detail: "SLA risk на 4 диалогах",
        meta: "Telegram · rescue queue",
        action: "Открыть панель",
        tone: "danger",
        history: "10:12 · SLA risk escalated",
        readAt: null,
        recipientUserId: null,
        createdAt: "2026-07-02T07:12:00.000Z"
      },
      {
        id: "notif-privileged-admin",
        actionTarget: {
          kind: "navigate",
          resourceId: "service-admin-audit",
          section: "audit"
        },
        tenantId: "tenant-volga",
        category: "privileged_admin",
        type: "Privileged",
        typeKey: "privileged",
        title: "Service-admin audit export готов",
        detail: "CSV, 128 событий, redaction policy applied",
        meta: "Service admin · privileged",
        action: "Открыть audit",
        tone: "info",
        history: "09:55 · privileged export completed",
        readAt: "2026-07-02T09:56:00.000Z",
        recipientUserId: null,
        createdAt: "2026-07-02T06:55:00.000Z"
      }
    ],
    preferenceAuditEvents: [],
    preferences: []
  };
}

function normalizeState(state: NotificationState): NotificationState {
  return {
    browserPushSubscriptions: (state.browserPushSubscriptions ?? []).map(normalizeBrowserPushSubscription),
    deliveryDescriptors: (state.deliveryDescriptors ?? []).map(normalizeNotificationDeliveryDescriptor),
    notifications: (state.notifications ?? []).map(normalizeNotification),
    preferenceAuditEvents: (state.preferenceAuditEvents ?? []).map(normalizePreferenceAuditEvent),
    preferences: (state.preferences ?? []).map(normalizeNotificationPreferences)
  };
}

function normalizeNotification(record: NotificationRecord): NotificationRecord {
  return {
    action: requireString(record.action),
    actionTarget: normalizeNotificationActionTarget(record.actionTarget),
    category: normalizeCategory(record.category),
    createdAt: requireString(record.createdAt),
    detail: requireString(record.detail),
    history: requireString(record.history),
    id: requireString(record.id),
    meta: requireString(record.meta),
    readAt: nullableString(record.readAt),
    recipientUserId: nullableString(record.recipientUserId),
    tenantId: requireString(record.tenantId),
    title: requireString(record.title),
    tone: normalizeTone(record.tone),
    type: requireString(record.type),
    typeKey: requireString(record.typeKey)
  };
}

function normalizeCategory(value: string): NotificationCategory {
  const categories = new Set<NotificationCategory>([
    "sla_risk",
    "channel_failure",
    "export_completion",
    "invite_event",
    "privileged_admin"
  ]);

  return categories.has(value as NotificationCategory) ? value as NotificationCategory : "sla_risk";
}

function normalizeTone(value: string): NotificationTone {
  const tones = new Set<NotificationTone>(["danger", "info", "ok", "warn"]);
  return tones.has(value as NotificationTone) ? value as NotificationTone : "info";
}

function normalizeNotificationActionTarget(value: unknown): NotificationActionTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const target = value as Record<string, unknown>;
  const kind = requireString(target.kind);
  if (kind === "download") {
    const service = requireString(target.service);
    const jobId = requireString(target.jobId);
    if (service !== "reports" || !jobId) {
      return null;
    }

    const fileName = nullableString(target.fileName);
    const format = nullableString(target.format);
    return {
      ...(fileName ? { fileName } : {}),
      ...(format ? { format } : {}),
      jobId,
      kind: "download",
      service: "reports"
    };
  }

  if (kind === "navigate") {
    const section = requireString(target.section);
    if (!section) {
      return null;
    }

    const resourceId = nullableString(target.resourceId);
    return {
      kind: "navigate",
      ...(resourceId ? { resourceId } : {}),
      section
    };
  }

  return null;
}

function defaultNotificationPreferences({
  now = new Date().toISOString(),
  tenantId,
  userId
}: {
  now?: string;
  tenantId: string;
  userId: string | null;
}): NotificationPreferencesRecord {
  return {
    browserPushEnabled: false,
    browserPushEndpoint: null,
    browserPushPermission: null,
    browserPushSubscriptionId: null,
    enabledExternalChannelIds: [],
    mutedSoundRuleIds: [],
    mutedTypeKeys: [],
    tenantId,
    updatedAt: now,
    userId
  };
}

function normalizeNotificationPreferences(record: NotificationPreferencesRecord): NotificationPreferencesRecord {
  return {
    browserPushEnabled: record.browserPushEnabled === true,
    browserPushEndpoint: nullableString(record.browserPushEndpoint),
    browserPushPermission: nullableString(record.browserPushPermission),
    browserPushSubscriptionId: nullableString(record.browserPushSubscriptionId),
    enabledExternalChannelIds: normalizeStringList(record.enabledExternalChannelIds),
    mutedSoundRuleIds: normalizeStringList(record.mutedSoundRuleIds),
    mutedTypeKeys: normalizeStringList(record.mutedTypeKeys),
    tenantId: requireString(record.tenantId),
    updatedAt: requireString(record.updatedAt),
    userId: nullableString(record.userId)
  };
}

function normalizeBrowserPushSubscription(record: BrowserPushSubscriptionRecord): BrowserPushSubscriptionRecord {
  const status = record.status === "revoked" ? "revoked" : "active";
  return {
    createdAt: requireString(record.createdAt),
    endpoint: requireString(record.endpoint),
    endpointHash: requireString(record.endpointHash),
    expirationTime: typeof record.expirationTime === "number" && Number.isFinite(record.expirationTime)
      ? Math.trunc(record.expirationTime)
      : null,
    id: requireString(record.id),
    keys: {
      auth: requireString(record.keys?.auth),
      p256dh: requireString(record.keys?.p256dh)
    },
    revokedAt: nullableString(record.revokedAt),
    status,
    tenantId: requireString(record.tenantId),
    updatedAt: requireString(record.updatedAt),
    userAgent: nullableString(record.userAgent),
    userId: nullableString(record.userId)
  };
}

function normalizeNotificationDeliveryDescriptor(descriptor: NotificationDeliveryDescriptor): NotificationDeliveryDescriptor {
  const status = descriptor.status === "delivered" || descriptor.status === "failed" ? descriptor.status : "queued";
  const createdAt = requireString(descriptor.createdAt);
  return {
    attempts: typeof descriptor.attempts === "number" && Number.isFinite(descriptor.attempts)
      ? Math.max(0, Math.trunc(descriptor.attempts))
      : 0,
    createdAt,
    deliveredAt: nullableString(descriptor.deliveredAt),
    endpointHash: requireString(descriptor.endpointHash),
    failedAt: nullableString(descriptor.failedAt),
    id: requireString(descriptor.id),
    lastError: nullableString(descriptor.lastError),
    nextAttemptAt: nullableString(descriptor.nextAttemptAt),
    notificationId: requireString(descriptor.notificationId),
    payload: {
      body: requireString(descriptor.payload?.body),
      title: requireString(descriptor.payload?.title),
      url: requireString(descriptor.payload?.url) || "/#/app"
    },
    providerMessageId: nullableString(descriptor.providerMessageId),
    queue: requireString(descriptor.queue) || "browser-push",
    status,
    subscriptionId: requireString(descriptor.subscriptionId),
    tenantId: requireString(descriptor.tenantId),
    traceId: requireString(descriptor.traceId),
    type: "browser-push.critical-alert.test",
    updatedAt: requireString(descriptor.updatedAt) || createdAt,
    userId: nullableString(descriptor.userId)
  };
}

function normalizePreferenceAuditEvent(event: NotificationPreferenceAuditEvent): NotificationPreferenceAuditEvent {
  return {
    action: requireString(event.action),
    at: requireString(event.at),
    id: requireString(event.id),
    immutable: true,
    reason: requireString(event.reason),
    result: "ok",
    tenantId: requireString(event.tenantId),
    traceId: requireString(event.traceId),
    userId: nullableString(event.userId)
  };
}

function notificationPreferenceId(tenantId: string, userId: string | null): string {
  return `${tenantId}:${userId ?? "tenant"}`;
}

function toPrismaNotificationCreateInput(record: NotificationRecord): PrismaNotificationCreateInput {
  return {
    action: record.action,
    actionTarget: record.actionTarget ? clone(record.actionTarget) : null,
    category: record.category,
    createdAt: new Date(record.createdAt),
    detail: record.detail,
    history: record.history,
    id: record.id,
    meta: record.meta,
    readAt: record.readAt ? new Date(record.readAt) : null,
    recipientUserId: record.recipientUserId,
    tenantId: record.tenantId,
    title: record.title,
    tone: record.tone,
    type: record.type,
    typeKey: record.typeKey
  };
}

function toPrismaNotificationUpdateInput(create: PrismaNotificationCreateInput): PrismaNotificationUpdateInput {
  return {
    action: create.action,
    actionTarget: create.actionTarget,
    category: create.category,
    detail: create.detail,
    history: create.history,
    meta: create.meta,
    readAt: create.readAt,
    recipientUserId: create.recipientUserId,
    tenantId: create.tenantId,
    title: create.title,
    tone: create.tone,
    type: create.type,
    typeKey: create.typeKey
  };
}

function toNotificationRecord(row: PrismaNotificationRow): NotificationRecord {
  return normalizeNotification({
    action: row.action,
    actionTarget: normalizeNotificationActionTarget(row.actionTarget),
    category: row.category as NotificationCategory,
    createdAt: row.createdAt.toISOString(),
    detail: row.detail,
    history: row.history,
    id: row.id,
    meta: row.meta,
    readAt: row.readAt?.toISOString() ?? null,
    recipientUserId: row.recipientUserId,
    tenantId: row.tenantId,
    title: row.title,
    tone: row.tone as NotificationTone,
    type: row.type,
    typeKey: row.typeKey
  });
}

function toPrismaNotificationPreferenceCreateInput(record: NotificationPreferencesRecord): PrismaNotificationPreferenceCreateInput {
  return {
    browserPushEnabled: record.browserPushEnabled,
    browserPushEndpoint: record.browserPushEndpoint,
    browserPushPermission: record.browserPushPermission,
    browserPushSubscriptionId: record.browserPushSubscriptionId,
    enabledExternalChannelIds: [...record.enabledExternalChannelIds],
    id: notificationPreferenceId(record.tenantId, record.userId),
    mutedSoundRuleIds: [...record.mutedSoundRuleIds],
    mutedTypeKeys: [...record.mutedTypeKeys],
    tenantId: record.tenantId,
    updatedAt: new Date(record.updatedAt),
    userId: record.userId
  };
}

function toPrismaNotificationPreferenceUpdateInput(create: PrismaNotificationPreferenceCreateInput): PrismaNotificationPreferenceUpdateInput {
  return {
    browserPushEnabled: create.browserPushEnabled,
    browserPushEndpoint: create.browserPushEndpoint,
    browserPushPermission: create.browserPushPermission,
    browserPushSubscriptionId: create.browserPushSubscriptionId,
    enabledExternalChannelIds: create.enabledExternalChannelIds,
    mutedSoundRuleIds: create.mutedSoundRuleIds,
    mutedTypeKeys: create.mutedTypeKeys,
    tenantId: create.tenantId,
    updatedAt: create.updatedAt,
    userId: create.userId
  };
}

function toNotificationPreferencesRecord(row: PrismaNotificationPreferenceRow): NotificationPreferencesRecord {
  return normalizeNotificationPreferences({
    browserPushEnabled: row.browserPushEnabled,
    browserPushEndpoint: row.browserPushEndpoint,
    browserPushPermission: row.browserPushPermission,
    browserPushSubscriptionId: row.browserPushSubscriptionId,
    enabledExternalChannelIds: row.enabledExternalChannelIds,
    mutedSoundRuleIds: row.mutedSoundRuleIds,
    mutedTypeKeys: row.mutedTypeKeys,
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId
  });
}

function toPrismaBrowserPushSubscriptionCreateInput(record: BrowserPushSubscriptionRecord): PrismaBrowserPushSubscriptionCreateInput {
  return {
    createdAt: new Date(record.createdAt),
    endpoint: record.endpoint,
    endpointHash: record.endpointHash,
    expirationTime: record.expirationTime,
    id: record.id,
    keyAuth: record.keys.auth,
    keyP256dh: record.keys.p256dh,
    revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
    status: record.status,
    tenantId: record.tenantId,
    updatedAt: new Date(record.updatedAt),
    userAgent: record.userAgent,
    userId: record.userId
  };
}

function toPrismaBrowserPushSubscriptionUpdateInput(create: PrismaBrowserPushSubscriptionCreateInput): PrismaBrowserPushSubscriptionUpdateInput {
  return {
    endpoint: create.endpoint,
    endpointHash: create.endpointHash,
    expirationTime: create.expirationTime,
    keyAuth: create.keyAuth,
    keyP256dh: create.keyP256dh,
    revokedAt: create.revokedAt,
    status: create.status,
    tenantId: create.tenantId,
    updatedAt: create.updatedAt,
    userAgent: create.userAgent,
    userId: create.userId
  };
}

function toBrowserPushSubscriptionRecord(row: PrismaBrowserPushSubscriptionRow): BrowserPushSubscriptionRecord {
  return normalizeBrowserPushSubscription({
    createdAt: row.createdAt.toISOString(),
    endpoint: row.endpoint,
    endpointHash: row.endpointHash,
    expirationTime: row.expirationTime,
    id: row.id,
    keys: {
      auth: row.keyAuth,
      p256dh: row.keyP256dh
    },
    revokedAt: row.revokedAt?.toISOString() ?? null,
    status: row.status as BrowserPushSubscriptionRecord["status"],
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString(),
    userAgent: row.userAgent,
    userId: row.userId
  });
}

function toPrismaNotificationDeliveryDescriptorCreateInput(descriptor: NotificationDeliveryDescriptor): PrismaNotificationDeliveryDescriptorCreateInput {
  const createdAt = new Date(descriptor.createdAt);
  return {
    attempts: descriptor.attempts ?? 0,
    createdAt,
    deliveredAt: descriptor.deliveredAt ? new Date(descriptor.deliveredAt) : null,
    endpointHash: descriptor.endpointHash,
    failedAt: descriptor.failedAt ? new Date(descriptor.failedAt) : null,
    id: descriptor.id,
    lastError: descriptor.lastError ?? null,
    nextAttemptAt: descriptor.nextAttemptAt ? new Date(descriptor.nextAttemptAt) : null,
    notificationId: descriptor.notificationId,
    payload: clone(descriptor.payload),
    providerMessageId: descriptor.providerMessageId ?? null,
    queue: descriptor.queue,
    status: descriptor.status,
    subscriptionId: descriptor.subscriptionId,
    tenantId: descriptor.tenantId,
    traceId: descriptor.traceId,
    type: descriptor.type,
    updatedAt: new Date(descriptor.updatedAt ?? descriptor.createdAt),
    userId: descriptor.userId
  };
}

function toPrismaNotificationDeliveryDescriptorUpdateInput(create: PrismaNotificationDeliveryDescriptorCreateInput): PrismaNotificationDeliveryDescriptorUpdateInput {
  return {
    attempts: create.attempts,
    deliveredAt: create.deliveredAt,
    endpointHash: create.endpointHash,
    failedAt: create.failedAt,
    lastError: create.lastError,
    nextAttemptAt: create.nextAttemptAt,
    notificationId: create.notificationId,
    payload: create.payload,
    providerMessageId: create.providerMessageId,
    queue: create.queue,
    status: create.status,
    subscriptionId: create.subscriptionId,
    tenantId: create.tenantId,
    traceId: create.traceId,
    type: create.type,
    updatedAt: create.updatedAt,
    userId: create.userId
  };
}

function toNotificationDeliveryDescriptor(row: PrismaNotificationDeliveryDescriptorRow): NotificationDeliveryDescriptor {
  return normalizeNotificationDeliveryDescriptor({
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    endpointHash: row.endpointHash,
    failedAt: row.failedAt?.toISOString() ?? null,
    id: row.id,
    lastError: row.lastError,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    notificationId: row.notificationId,
    payload: {
      body: String(row.payload.body ?? ""),
      title: String(row.payload.title ?? ""),
      url: String(row.payload.url ?? "/#/app")
    },
    providerMessageId: row.providerMessageId,
    queue: row.queue,
    status: row.status as NotificationDeliveryDescriptor["status"],
    subscriptionId: row.subscriptionId,
    tenantId: row.tenantId,
    traceId: row.traceId,
    type: row.type as NotificationDeliveryDescriptor["type"],
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId
  });
}

function toPrismaNotificationPreferenceAuditEventCreateInput(event: NotificationPreferenceAuditEvent): PrismaNotificationPreferenceAuditEventCreateInput {
  return {
    action: event.action,
    at: new Date(event.at),
    id: event.id,
    immutable: event.immutable,
    reason: event.reason,
    result: event.result,
    tenantId: event.tenantId,
    traceId: event.traceId,
    userId: event.userId
  };
}

function toPrismaNotificationPreferenceAuditEventUpdateInput(create: PrismaNotificationPreferenceAuditEventCreateInput): PrismaNotificationPreferenceAuditEventUpdateInput {
  return {
    action: create.action,
    at: create.at,
    immutable: create.immutable,
    reason: create.reason,
    result: create.result,
    tenantId: create.tenantId,
    traceId: create.traceId,
    userId: create.userId
  };
}

function toNotificationPreferenceAuditEvent(row: PrismaNotificationPreferenceAuditEventRow): NotificationPreferenceAuditEvent {
  if (!row.immutable) {
    throw new Error("notification_preference_audit_event_mutable");
  }

  return normalizePreferenceAuditEvent({
    action: row.action,
    at: row.at.toISOString(),
    id: row.id,
    immutable: true,
    reason: row.reason,
    result: row.result as NotificationPreferenceAuditEvent["result"],
    tenantId: row.tenantId,
    traceId: row.traceId,
    userId: row.userId
  });
}

function assertCompletePrismaNotificationClient(client: PrismaNotificationClient): void {
  if (!client.notification) {
    throw new Error("prisma_notification_delegate_required");
  }

  if (!client.notificationPreference) {
    throw new Error("prisma_notification_preference_delegate_required");
  }

  if (!client.browserPushSubscription) {
    throw new Error("prisma_browser_push_subscription_delegate_required");
  }

  if (!client.notificationDeliveryDescriptor) {
    throw new Error("prisma_notification_delivery_descriptor_delegate_required");
  }

  if (!client.notificationPreferenceAuditEvent) {
    throw new Error("prisma_notification_preference_audit_delegate_required");
  }
}

function normalizeStringList(values: unknown): string[] {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
  ));
}

function requireString(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
