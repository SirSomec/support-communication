import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadNotificationDeliveryWorkerRuntimeConfig,
  runNotificationDeliveryWorkerFromEnv
} from "../apps/api-gateway/src/notifications/notification-delivery.main.ts";

describe("browser push production-like provider gate", () => {
  it("fails fast when a production-like browser-push worker has no live provider", () => {
    for (const providerMode of [undefined, "disabled", "local"]) {
      const source: NodeJS.ProcessEnv = {
        BROWSER_PUSH_PUBLIC_KEY: "public-key",
        NODE_ENV: "test",
        RUNTIME_PROFILE: "production-like"
      };
      if (providerMode) {
        source.NOTIFICATION_DELIVERY_PROVIDER_MODE = providerMode;
      }

      assert.throws(
        () => loadNotificationDeliveryWorkerRuntimeConfig(source, []),
        /browser_push_provider_required_in_production_like_runtime/
      );
    }
  });

  it("blocks worker bootstrap before a disabled provider can scan descriptors", async () => {
    await assert.rejects(
      runNotificationDeliveryWorkerFromEnv({
        BROWSER_PUSH_PUBLIC_KEY: "public-key",
        NODE_ENV: "staging",
        NOTIFICATION_DELIVERY_PROVIDER_MODE: "disabled",
        RUNTIME_PROFILE: "production-like"
      }),
      /browser_push_provider_required_in_production_like_runtime/
    );
  });

  it("allows a disabled provider when browser push is fully disabled in production-like runtime", () => {
    for (const source of [
      {
        NODE_ENV: "test",
        NOTIFICATION_DELIVERY_PROVIDER_MODE: "disabled",
        RUNTIME_PROFILE: "production-like"
      },
      {
        BROWSER_PUSH_ENABLED: "false",
        NODE_ENV: "staging",
        NOTIFICATION_DELIVERY_PROVIDER_MODE: "disabled",
        RUNTIME_PROFILE: "production-like"
      }
    ]) {
      assert.equal(
        loadNotificationDeliveryWorkerRuntimeConfig(source, []).providerMode,
        "disabled"
      );
    }
  });

  it("requires a live provider when browser push is explicitly enabled without keys", () => {
    assert.throws(
      () => loadNotificationDeliveryWorkerRuntimeConfig({
        BROWSER_PUSH_ENABLED: "true",
        NODE_ENV: "staging",
        NOTIFICATION_DELIVERY_PROVIDER_MODE: "disabled",
        RUNTIME_PROFILE: "production-like"
      }, []),
      /browser_push_provider_required_in_production_like_runtime/
    );
  });

  it("applies the live-provider gate to staging and production node environments", () => {
    for (const nodeEnv of ["staging", "production"]) {
      assert.throws(
        () => loadNotificationDeliveryWorkerRuntimeConfig({
          BROWSER_PUSH_PRIVATE_KEY: "private-key",
          NODE_ENV: nodeEnv,
          NOTIFICATION_DELIVERY_PROVIDER_MODE: "disabled",
          RUNTIME_PROFILE: "local"
        }, []),
        /browser_push_provider_required_in_production_like_runtime/
      );
    }
  });

  it("requires complete VAPID credentials before accepting the web-push provider", () => {
    const baseSource: NodeJS.ProcessEnv = {
      NODE_ENV: "staging",
      NOTIFICATION_DELIVERY_PROVIDER_MODE: "web-push",
      RUNTIME_PROFILE: "production-like"
    };

    assert.throws(
      () => loadNotificationDeliveryWorkerRuntimeConfig(baseSource, []),
      /browser_push_vapid_keys_required/
    );
    assert.throws(
      () => loadNotificationDeliveryWorkerRuntimeConfig({
        ...baseSource,
        BROWSER_PUSH_PUBLIC_KEY: "public-key"
      }, []),
      /browser_push_vapid_keys_required/
    );
    assert.throws(
      () => loadNotificationDeliveryWorkerRuntimeConfig({
        ...baseSource,
        BROWSER_PUSH_PRIVATE_KEY: "private-key"
      }, []),
      /browser_push_vapid_keys_required/
    );
  });

  it("accepts a configured web-push provider in production-like runtime", () => {
    const config = loadNotificationDeliveryWorkerRuntimeConfig({
      BROWSER_PUSH_PRIVATE_KEY: "private-key",
      BROWSER_PUSH_PUBLIC_KEY: "public-key",
      NODE_ENV: "staging",
      NOTIFICATION_DELIVERY_PROVIDER_MODE: "web-push",
      RUNTIME_PROFILE: "production-like"
    }, []);

    assert.equal(config.providerMode, "web-push");
  });

  it("keeps disabled and deterministic providers available in local runtime", () => {
    assert.equal(loadNotificationDeliveryWorkerRuntimeConfig({
      NODE_ENV: "development",
      NOTIFICATION_DELIVERY_PROVIDER_MODE: "disabled",
      RUNTIME_PROFILE: "local"
    }, []).providerMode, "disabled");
    assert.equal(loadNotificationDeliveryWorkerRuntimeConfig({
      NODE_ENV: "test",
      NOTIFICATION_DELIVERY_PROVIDER_MODE: "local",
      RUNTIME_PROFILE: "local"
    }, []).providerMode, "local");
  });

  it("rejects unsupported provider mode values instead of silently disabling delivery", () => {
    assert.throws(
      () => loadNotificationDeliveryWorkerRuntimeConfig({
        NODE_ENV: "development",
        NOTIFICATION_DELIVERY_PROVIDER_MODE: "webpush",
        RUNTIME_PROFILE: "local"
      }, []),
      /notification_delivery_provider_mode_invalid/
    );
  });
});
