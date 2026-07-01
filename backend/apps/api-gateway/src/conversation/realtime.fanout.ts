import { Redis } from "ioredis";
import type { RealtimeEvent } from "./conversation.repository.js";

export type RealtimeFanoutEvent = RealtimeEvent;

export interface RealtimeFanoutPublishResult {
  channel: string | null;
  reason?: string;
  status: "published" | "skipped";
  subscribers: number;
}

export interface RealtimeFanoutSubscription {
  close(): Promise<void>;
  status: "active" | "disabled";
}

export interface RealtimeFanoutAdapter {
  publish(event: RealtimeFanoutEvent): Promise<RealtimeFanoutPublishResult>;
  subscribe(handler: (event: RealtimeFanoutEvent) => void | Promise<void>): Promise<RealtimeFanoutSubscription>;
}

export interface RealtimeRedisClient {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, handler: (message: string, channel: string) => void): Promise<() => Promise<void>>;
}

export interface RedisRealtimeFanoutAdapterOptions {
  channel: string;
  redis: Pick<RealtimeRedisClient, "publish">;
  subscriberFactory: () => RealtimeRedisClient;
}

export interface RealtimeRedisConnectionSettings {
  db?: number;
  host: string;
  password?: string;
  port: number;
  username?: string;
}

export interface RealtimeFanoutEnvSource {
  REALTIME_REDIS_CHANNEL?: string;
  REALTIME_REDIS_FANOUT_ENABLED?: string;
  REDIS_URL?: string;
}

export interface RealtimeFanoutFactoryOptions {
  redisFactory: (settings: RealtimeRedisConnectionSettings) => RealtimeRedisClient;
}

export function createRedisRealtimeFanoutAdapter(options: RedisRealtimeFanoutAdapterOptions): RealtimeFanoutAdapter {
  return {
    async publish(event: RealtimeFanoutEvent): Promise<RealtimeFanoutPublishResult> {
      const subscribers = await options.redis.publish(options.channel, JSON.stringify(event));
      return {
        channel: options.channel,
        status: "published",
        subscribers
      };
    },

    async subscribe(handler: (event: RealtimeFanoutEvent) => void | Promise<void>): Promise<RealtimeFanoutSubscription> {
      const subscriber = options.subscriberFactory();
      const unsubscribe = await subscriber.subscribe(options.channel, (message) => {
        const event = parseRealtimeFanoutEvent(message);
        if (event) {
          void handler(event);
        }
      });

      return {
        async close(): Promise<void> {
          await unsubscribe();
        },
        status: "active"
      };
    }
  };
}

export function createRealtimeFanoutAdapterFromEnv(
  source: RealtimeFanoutEnvSource,
  options: RealtimeFanoutFactoryOptions = { redisFactory: createDefaultRealtimeRedisClient }
): RealtimeFanoutAdapter {
  if (String(source.REALTIME_REDIS_FANOUT_ENABLED ?? "").trim().toLowerCase() !== "true") {
    return createDisabledRealtimeFanoutAdapter("realtime_redis_fanout_disabled");
  }

  const redisUrl = String(source.REDIS_URL ?? "").trim();
  if (!redisUrl) {
    return createDisabledRealtimeFanoutAdapter("redis_url_missing");
  }

  const channel = String(source.REALTIME_REDIS_CHANNEL ?? "").trim() || "support:realtime";
  const settings = parseRedisConnectionFromUrl(redisUrl);
  if (!settings.ok) {
    return createDisabledRealtimeFanoutAdapter(settings.reason);
  }

  const redis = options.redisFactory(settings.value);
  return createRedisRealtimeFanoutAdapter({
    channel,
    redis,
    subscriberFactory: () => options.redisFactory(settings.value)
  });
}

export function createDefaultRealtimeRedisClient(settings: RealtimeRedisConnectionSettings): RealtimeRedisClient {
  const client = new Redis({
    ...(settings.db === undefined ? {} : { db: settings.db }),
    host: settings.host,
    ...(settings.password ? { password: settings.password } : {}),
    port: settings.port,
    ...(settings.username ? { username: settings.username } : {})
  });

  return {
    async publish(channel: string, message: string): Promise<number> {
      return client.publish(channel, message);
    },

    async subscribe(channel: string, handler: (message: string, channel: string) => void): Promise<() => Promise<void>> {
      const onMessage = (receivedChannel: string, message: string) => {
        if (receivedChannel === channel) {
          handler(message, receivedChannel);
        }
      };
      client.on("message", onMessage);
      await client.subscribe(channel);

      return async () => {
        client.off("message", onMessage);
        await client.unsubscribe(channel);
        client.disconnect();
      };
    }
  };
}

export function createDisabledRealtimeFanoutAdapter(reason: string): RealtimeFanoutAdapter {
  return {
    async publish(): Promise<RealtimeFanoutPublishResult> {
      return {
        channel: null,
        reason,
        status: "skipped",
        subscribers: 0
      };
    },

    async subscribe(): Promise<RealtimeFanoutSubscription> {
      return {
        async close(): Promise<void> {},
        status: "disabled"
      };
    }
  };
}

function parseRealtimeFanoutEvent(message: string): RealtimeFanoutEvent | null {
  try {
    const parsed = JSON.parse(message) as Partial<RealtimeFanoutEvent>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (
      typeof parsed.eventId !== "string"
      || typeof parsed.eventName !== "string"
      || typeof parsed.occurredAt !== "string"
      || typeof parsed.resourceId !== "string"
      || typeof parsed.resourceType !== "string"
      || typeof parsed.schemaVersion !== "string"
      || typeof parsed.tenantId !== "string"
      || typeof parsed.traceId !== "string"
      || !parsed.data
      || typeof parsed.data !== "object"
      || Array.isArray(parsed.data)
    ) {
      return null;
    }

    return {
      data: parsed.data as Record<string, unknown>,
      eventId: parsed.eventId,
      eventName: parsed.eventName,
      occurredAt: parsed.occurredAt,
      resourceId: parsed.resourceId,
      resourceType: parsed.resourceType,
      schemaVersion: parsed.schemaVersion,
      tenantId: parsed.tenantId,
      traceId: parsed.traceId
    };
  } catch {
    return null;
  }
}

function parseRedisConnectionFromUrl(value: string): { ok: true; value: RealtimeRedisConnectionSettings } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "redis_url_invalid" };
  }

  if (parsed.protocol !== "redis:") {
    return { ok: false, reason: "redis_url_unsupported_scheme" };
  }

  const dbText = parsed.pathname.replace(/^\//, "");
  const db = dbText ? Number(dbText) : undefined;
  const port = parsed.port ? Number(parsed.port) : 6379;
  if ((dbText && (!Number.isInteger(db) || db === undefined || db < 0)) || !Number.isInteger(port) || port <= 0) {
    return { ok: false, reason: "redis_url_invalid" };
  }

  const credentials = decodeRedisCredentials(parsed);
  if (!credentials.ok) {
    return credentials;
  }

  return {
    ok: true,
    value: {
      ...(db === undefined ? {} : { db }),
      host: parsed.hostname || "127.0.0.1",
      ...(credentials.password ? { password: credentials.password } : {}),
      port,
      ...(credentials.username ? { username: credentials.username } : {})
    }
  };
}

function decodeRedisCredentials(parsed: URL): { ok: true; password?: string; username?: string } | { ok: false; reason: string } {
  try {
    return {
      ok: true,
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {})
    };
  } catch {
    return { ok: false, reason: "redis_url_invalid" };
  }
}
