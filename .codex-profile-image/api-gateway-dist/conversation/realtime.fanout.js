import { Redis } from "ioredis";
export function createRedisRealtimeFanoutAdapter(options) {
    return {
        async publish(event) {
            const subscribers = await options.redis.publish(options.channel, JSON.stringify(event));
            return {
                channel: options.channel,
                status: "published",
                subscribers
            };
        },
        async subscribe(handler) {
            const subscriber = options.subscriberFactory();
            const unsubscribe = await subscriber.subscribe(options.channel, (message) => {
                const event = parseRealtimeFanoutEvent(message);
                if (event) {
                    void handler(event);
                }
            });
            return {
                async close() {
                    await unsubscribe();
                },
                status: "active"
            };
        }
    };
}
export function createRealtimeFanoutAdapterFromEnv(source, options = { redisFactory: createDefaultRealtimeRedisClient }) {
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
export function createDefaultRealtimeRedisClient(settings) {
    const client = new Redis({
        ...(settings.db === undefined ? {} : { db: settings.db }),
        host: settings.host,
        ...(settings.password ? { password: settings.password } : {}),
        port: settings.port,
        ...(settings.username ? { username: settings.username } : {})
    });
    return {
        async publish(channel, message) {
            return client.publish(channel, message);
        },
        async subscribe(channel, handler) {
            const onMessage = (receivedChannel, message) => {
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
export function createDisabledRealtimeFanoutAdapter(reason) {
    return {
        async publish() {
            return {
                channel: null,
                reason,
                status: "skipped",
                subscribers: 0
            };
        },
        async subscribe() {
            return {
                async close() { },
                status: "disabled"
            };
        }
    };
}
function parseRealtimeFanoutEvent(message) {
    try {
        const parsed = JSON.parse(message);
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        if (typeof parsed.eventId !== "string"
            || typeof parsed.eventName !== "string"
            || typeof parsed.occurredAt !== "string"
            || typeof parsed.resourceId !== "string"
            || typeof parsed.resourceType !== "string"
            || typeof parsed.schemaVersion !== "string"
            || typeof parsed.tenantId !== "string"
            || typeof parsed.traceId !== "string"
            || !parsed.data
            || typeof parsed.data !== "object"
            || Array.isArray(parsed.data)) {
            return null;
        }
        return {
            data: parsed.data,
            eventId: parsed.eventId,
            eventName: parsed.eventName,
            occurredAt: parsed.occurredAt,
            resourceId: parsed.resourceId,
            resourceType: parsed.resourceType,
            schemaVersion: parsed.schemaVersion,
            tenantId: parsed.tenantId,
            traceId: parsed.traceId
        };
    }
    catch {
        return null;
    }
}
function parseRedisConnectionFromUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
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
function decodeRedisCredentials(parsed) {
    try {
        return {
            ok: true,
            ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
            ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {})
        };
    }
    catch {
        return { ok: false, reason: "redis_url_invalid" };
    }
}
//# sourceMappingURL=realtime.fanout.js.map