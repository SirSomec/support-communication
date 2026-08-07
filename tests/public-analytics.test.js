import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  disablePublicAnalytics,
  initializePublicAnalytics,
  PUBLIC_ANALYTICS_CONSENT_KEY,
  PUBLIC_ANALYTICS_GOALS,
  readPublicAnalyticsConsent,
  resetPublicAnalyticsForTests,
  trackPublicAnalyticsGoal,
  trackPublicRouteView,
  writePublicAnalyticsConsent
} from "../src/public/analytics/publicAnalytics.js";
import { getPublicSiteConfig } from "../src/public/seo/publicRouteManifest.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values
  };
}

function createBrowserFixture() {
  const elements = new Map();
  const appended = [];
  const documentRef = {
    createElement: () => ({}),
    getElementById: (id) => elements.get(id) ?? null,
    head: {
      append(element) {
        appended.push(element);
        if (element.id) elements.set(element.id, element);
      }
    }
  };
  return { appended, documentRef, windowRef: {} };
}

describe("public analytics", () => {
  beforeEach(() => resetPublicAnalyticsForTests());

  it("validates the optional build-time Metrika counter ID", () => {
    assert.equal(getPublicSiteConfig({ PUBLIC_SITE_METRIKA_ID: "12345678" }).metrikaId, "12345678");
    assert.equal(getPublicSiteConfig({ PUBLIC_SITE_METRIKA_ID: "" }).metrikaId, "");
    assert.throws(() => getPublicSiteConfig({ PUBLIC_SITE_METRIKA_ID: "12-example" }), /PUBLIC_SITE_METRIKA_ID/);
  });

  it("stores only an explicit, versioned consent decision", () => {
    const storage = createStorage();
    assert.equal(readPublicAnalyticsConsent(storage), null);
    writePublicAnalyticsConsent("granted", storage);
    assert.equal(storage.values.get(PUBLIC_ANALYTICS_CONSENT_KEY), "granted");
    assert.equal(readPublicAnalyticsConsent(storage), "granted");
    assert.throws(() => writePublicAnalyticsConsent("unknown", storage), /granted or denied/);
  });

  it("loads and initializes Metrika only once with privacy-reduced settings", () => {
    const fixture = createBrowserFixture();
    assert.equal(initializePublicAnalytics({ counterId: "12345678", ...fixture }), true);
    assert.equal(initializePublicAnalytics({ counterId: "12345678", ...fixture }), true);
    assert.equal(fixture.appended.length, 1);
    assert.equal(fixture.appended[0].src, "https://mc.yandex.ru/metrika/tag.js");
    assert.equal(fixture.appended[0].async, true);

    const [counterId, method, options] = fixture.windowRef.ym.a[0];
    assert.equal(counterId, 12345678);
    assert.equal(method, "init");
    assert.deepEqual(options, {
      accurateTrackBounce: true,
      clickmap: false,
      sendTitle: false,
      trackHash: false,
      trackLinks: true,
      webvisor: false
    });
  });

  it("fails closed without a counter ID or browser document", () => {
    const fixture = createBrowserFixture();
    assert.equal(initializePublicAnalytics({ counterId: "", ...fixture }), false);
    assert.equal(initializePublicAnalytics({ counterId: "12345678", documentRef: null, windowRef: fixture.windowRef }), false);
    assert.equal(fixture.appended.length, 0);
  });

  it("sends allowlisted goals without form values or other parameters", () => {
    const fixture = createBrowserFixture();
    initializePublicAnalytics({ counterId: "12345678", ...fixture });
    assert.equal(trackPublicAnalyticsGoal("email=user@example.test"), false);
    assert.equal(trackPublicAnalyticsGoal(PUBLIC_ANALYTICS_GOALS.registrationStart), true);
    assert.equal(trackPublicRouteView(PUBLIC_ANALYTICS_GOALS.pricingView), true);
    assert.equal(trackPublicRouteView(PUBLIC_ANALYTICS_GOALS.pricingView), false);

    const goalCalls = fixture.windowRef.ym.a.filter(([, method]) => method === "reachGoal");
    assert.deepEqual(goalCalls.map((call) => call[2]), ["registration_start", "pricing_view"]);
    assert.ok(goalCalls.every((call) => call.length === 3), "goals must never receive arbitrary parameters");
  });

  it("sends each allowlisted commercial route goal only once per page load", () => {
    const fixture = createBrowserFixture();
    initializePublicAnalytics({ counterId: "12345678", ...fixture });

    for (const goal of [
      PUBLIC_ANALYTICS_GOALS.websiteSupportChatView,
      PUBLIC_ANALYTICS_GOALS.aiSupportBotView,
      PUBLIC_ANALYTICS_GOALS.supportSlaView
    ]) {
      assert.equal(trackPublicRouteView(goal), true);
      assert.equal(trackPublicRouteView(goal), false);
    }
    assert.equal(trackPublicRouteView("unlisted_route_view"), false);

    const goalCalls = fixture.windowRef.ym.a.filter(([, method]) => method === "reachGoal");
    assert.deepEqual(goalCalls.map((call) => call[2]), [
      "website_support_chat_view",
      "ai_support_bot_view",
      "support_sla_view"
    ]);
  });

  it("uses the documented counter opt-out flag when consent is withdrawn", () => {
    const fixture = createBrowserFixture();
    initializePublicAnalytics({ counterId: "12345678", ...fixture });
    assert.equal(disablePublicAnalytics({ counterId: "12345678", windowRef: fixture.windowRef }), true);
    assert.equal(fixture.windowRef.disableYaCounter12345678, true);
    initializePublicAnalytics({ counterId: "12345678", ...fixture });
    assert.equal(fixture.windowRef.disableYaCounter12345678, false);
  });
});
