import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configureConversationRealtimeFanout } from "../apps/api-gateway/src/conversation/bootstrap.ts";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { ConversationService } from "../apps/api-gateway/src/conversation/conversation.service.ts";
import { bootstrapConversationState } from "../apps/api-gateway/src/conversation/seed.ts";
import {
  createDisabledRealtimeFanoutAdapter,
  createRealtimeFanoutAdapterFromEnv,
  createRedisRealtimeFanoutAdapter,
  type RealtimeFanoutEvent
} from "../apps/api-gateway/src/conversation/realtime.fanout.ts";

describe("Redis realtime fan-out adapter contracts", () => {
  it("publishes realtime events to deterministic Redis subscribers", async () => {
    const redis = new FakeRealtimeRedis();
    const publisher = createRedisRealtimeFanoutAdapter({
      channel: "support:realtime",
      redis,
      subscriberFactory: () => redis
    });
    const subscriber = createRedisRealtimeFanoutAdapter({
      channel: "support:realtime",
      redis,
      subscriberFactory: () => redis
    });
    const received: RealtimeFanoutEvent[] = [];

    const subscription = await subscriber.subscribe((event) => {
      received.push(event);
    });
    const event = realtimeEvent("rt_fanout_001", "message.created");
    const publish = await publisher.publish(event);

    assert.equal(publish.status, "published");
    assert.equal(publish.channel, "support:realtime");
    assert.deepEqual(redis.published.map((item) => item.channel), ["support:realtime"]);
    assert.deepEqual(received.map((item) => item.eventId), ["rt_fanout_001"]);
    assert.deepEqual(received[0].data, { messageId: "msg_fanout_001" });

    await subscription.close();
    await publisher.publish(realtimeEvent("rt_fanout_002", "message.updated"));

    assert.deepEqual(received.map((item) => item.eventId), ["rt_fanout_001"]);
  });

  it("falls back to disabled fan-out without throwing when Redis is not configured", async () => {
    const adapter = createDisabledRealtimeFanoutAdapter("redis_not_configured");
    const received: RealtimeFanoutEvent[] = [];

    const publish = await adapter.publish(realtimeEvent("rt_disabled_001", "message.created"));
    const subscription = await adapter.subscribe((event) => {
      received.push(event);
    });

    await subscription.close();

    assert.equal(publish.status, "skipped");
    assert.equal(publish.reason, "redis_not_configured");
    assert.equal(subscription.status, "disabled");
    assert.deepEqual(received, []);
  });

  it("builds a disabled adapter by default and a Redis adapter when fan-out is enabled", async () => {
    const redis = new FakeRealtimeRedis();
    const disabled = createRealtimeFanoutAdapterFromEnv({}, {
      redisFactory: () => redis
    });
    const enabled = createRealtimeFanoutAdapterFromEnv({
      REALTIME_REDIS_CHANNEL: "support:realtime:tenant-volga",
      REALTIME_REDIS_FANOUT_ENABLED: "true",
      REDIS_URL: "redis://localhost:6379/2"
    }, {
      redisFactory: (settings) => {
        assert.deepEqual(settings, {
          db: 2,
          host: "localhost",
          port: 6379
        });
        return redis;
      }
    });
    const received: RealtimeFanoutEvent[] = [];

    const disabledPublish = await disabled.publish(realtimeEvent("rt_disabled_factory", "message.created"));
    const subscription = await enabled.subscribe((event) => {
      received.push(event);
    });
    const enabledPublish = await enabled.publish(realtimeEvent("rt_enabled_factory", "message.created"));
    await subscription.close();

    assert.equal(disabledPublish.status, "skipped");
    assert.equal(disabledPublish.reason, "realtime_redis_fanout_disabled");
    assert.equal(enabledPublish.status, "published");
    assert.equal(enabledPublish.channel, "support:realtime:tenant-volga");
    assert.deepEqual(received.map((event) => event.eventId), ["rt_enabled_factory"]);
  });

  it("fails closed for malformed or unsupported Redis fan-out runtime URLs", async () => {
    const malformed = createRealtimeFanoutAdapterFromEnv({
      REALTIME_REDIS_FANOUT_ENABLED: "true",
      REDIS_URL: "not-a-url"
    }, {
      redisFactory: () => {
        throw new Error("redis_factory_should_not_be_called");
      }
    });
    const unsupported = createRealtimeFanoutAdapterFromEnv({
      REALTIME_REDIS_FANOUT_ENABLED: "true",
      REDIS_URL: "http://localhost:6379/0"
    }, {
      redisFactory: () => {
        throw new Error("redis_factory_should_not_be_called");
      }
    });
    const malformedCredentials = createRealtimeFanoutAdapterFromEnv({
      REALTIME_REDIS_FANOUT_ENABLED: "true",
      REDIS_URL: "redis://user:%E0%A4%A@localhost:6379/0"
    }, {
      redisFactory: () => {
        throw new Error("redis_factory_should_not_be_called");
      }
    });

    const malformedPublish = await malformed.publish(realtimeEvent("rt_bad_env_001", "message.created"));
    const unsupportedPublish = await unsupported.publish(realtimeEvent("rt_bad_env_002", "message.created"));
    const malformedCredentialsPublish = await malformedCredentials.publish(realtimeEvent("rt_bad_env_003", "message.created"));

    assert.equal(malformedPublish.status, "skipped");
    assert.equal(malformedPublish.reason, "redis_url_invalid");
    assert.equal(unsupportedPublish.status, "skipped");
    assert.equal(unsupportedPublish.reason, "redis_url_unsupported_scheme");
    assert.equal(malformedCredentialsPublish.status, "skipped");
    assert.equal(malformedCredentialsPublish.reason, "redis_url_invalid");
  });

  it("ignores malformed Redis fan-out messages and keeps the subscription active", async () => {
    const redis = new FakeRealtimeRedis();
    const adapter = createRedisRealtimeFanoutAdapter({
      channel: "support:realtime",
      redis,
      subscriberFactory: () => redis
    });
    const received: RealtimeFanoutEvent[] = [];

    const subscription = await adapter.subscribe((event) => {
      received.push(event);
    });
    await redis.publishRaw("support:realtime", "{malformed-json");
    await redis.publishRaw("support:realtime", JSON.stringify({ eventId: "missing-required-fields" }));
    await adapter.publish(realtimeEvent("rt_valid_after_malformed", "message.created"));
    await subscription.close();

    assert.deepEqual(received.map((event) => event.eventId), ["rt_valid_after_malformed"]);
  });

  it("configures the default conversation service fan-out adapter from runtime env", async () => {
    const redis = new FakeRealtimeRedis();
    configureConversationRealtimeFanout({
      REALTIME_REDIS_FANOUT_ENABLED: "true",
      REDIS_URL: "redis://127.0.0.1:6379/0"
    }, {
      redisFactory: () => redis
    });
    try {
      const conversations = new ConversationService(ConversationRepository.inMemory(bootstrapConversationState()));
      const inbound = await conversations.normalizeInboundEvent("telegram", {
        conversationId: "dmitry",
        eventId: "tg-runtime-fanout-001",
        text: "Runtime fan-out configured"
      });

      assert.equal(inbound.status, "ok");
      assert.equal(redis.published.length, 1);
      assert.equal(redis.published[0].channel, "support:realtime");
      assert.match(redis.published[0].message, /tg-runtime-fanout-001|message\.created/);
    } finally {
      configureConversationRealtimeFanout({}, {
        redisFactory: () => redis
      });
    }
  });
});

class FakeRealtimeRedis {
  readonly published: Array<{ channel: string; message: string }> = [];
  private readonly handlers = new Map<string, Set<(message: string, channel: string) => void>>();

  async publish(channel: string, message: string): Promise<number> {
    this.published.push({ channel, message });
    return this.publishRaw(channel, message);
  }

  async publishRaw(channel: string, message: string): Promise<number> {
    for (const handler of this.handlers.get(channel) ?? []) {
      handler(message, channel);
    }

    return this.handlers.get(channel)?.size ?? 0;
  }

  async subscribe(channel: string, handler: (message: string, channel: string) => void): Promise<() => Promise<void>> {
    const handlers = this.handlers.get(channel) ?? new Set<(message: string, channel: string) => void>();
    handlers.add(handler);
    this.handlers.set(channel, handlers);

    return async () => {
      handlers.delete(handler);
    };
  }
}

function realtimeEvent(eventId: string, eventName: string): RealtimeFanoutEvent {
  return {
    data: { messageId: "msg_fanout_001" },
    eventId,
    eventName,
    occurredAt: "2026-06-29T12:00:00.000Z",
    resourceId: "maria",
    resourceType: "conversation",
    schemaVersion: "v1",
    tenantId: "tenant-volga",
    traceId: "trace-fanout-001"
  };
}
