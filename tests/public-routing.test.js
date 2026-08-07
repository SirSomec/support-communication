import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isPrivateWorkspaceHash,
  legacyPublicPathForHash,
  navigateToPrivateHash,
  normalizeLegacyPublicHash,
  normalizePublicPathname,
  resolvePublicRoute
} from "../src/public/routing.js";

describe("public pathname routing", () => {
  it("resolves all canonical public paths", () => {
    assert.equal(resolvePublicRoute("/")?.view, "landing");
    assert.equal(resolvePublicRoute("/pricing/")?.view, "pricing");
    assert.equal(resolvePublicRoute("/docs/")?.view, "docs");
    assert.equal(resolvePublicRoute("/website-support-chat/")?.view, "commercial");
    assert.equal(resolvePublicRoute("/ai-support-bot/")?.view, "commercial");
    assert.equal(resolvePublicRoute("/support-sla/")?.view, "commercial");
    assert.equal(resolvePublicRoute("/unknown/"), null);
  });

  it("accepts slashless paths while keeping trailing-slash canonicals", () => {
    assert.equal(normalizePublicPathname("/pricing"), "/pricing/");
    assert.equal(normalizePublicPathname("/docs"), "/docs/");
    assert.equal(normalizePublicPathname("/support-sla"), "/support-sla/");
    assert.equal(resolvePublicRoute("/pricing")?.pathname, "/pricing/");
  });

  it("normalizes legacy public hashes with replaceState and preserves the query", () => {
    let replacement = "";
    const pathname = normalizeLegacyPublicHash(
      { hash: "#/pricing", search: "?utm_source=legacy" },
      { replaceState: (_state, _title, next) => { replacement = next; } }
    );

    assert.equal(pathname, "/pricing/");
    assert.equal(replacement, "/pricing/?utm_source=legacy");
    assert.equal(legacyPublicPathForHash("#/docs"), "/docs/");
  });

  it("does not treat landing anchors as application routes", () => {
    assert.equal(legacyPublicPathForHash("#channels"), null);
    assert.equal(legacyPublicPathForHash("#capabilities"), null);
    assert.equal(isPrivateWorkspaceHash("#faq"), false);
  });

  it("keeps workspace, login and onboarding on private hashes", () => {
    assert.equal(isPrivateWorkspaceHash("#/app"), true);
    assert.equal(isPrivateWorkspaceHash("#/login"), true);
    assert.equal(isPrivateWorkspaceHash("#/onboarding"), true);
    assert.equal(isPrivateWorkspaceHash("#/pricing"), false);
  });

  it("reloads the document when moving from a public page into the private app", () => {
    const calls = [];
    const windowLike = {
      history: {
        pushState: (...args) => calls.push(["pushState", ...args])
      },
      location: {
        reload: () => calls.push(["reload"])
      }
    };

    assert.equal(navigateToPrivateHash("#/onboarding", windowLike), true);
    assert.deepEqual(calls, [
      ["pushState", null, "", "/#/onboarding"],
      ["reload"]
    ]);
    assert.equal(navigateToPrivateHash("#/pricing", windowLike), false);
    assert.equal(calls.length, 2);
  });
});

describe("public/private bootstrap boundary", () => {
  it("loads private App dynamically and keeps public pages out of App", () => {
    const mainSource = readFileSync("src/main.jsx", "utf8");
    const appSource = readFileSync("src/App.jsx", "utf8");

    assert.match(mainSource, /await import\("\.\/App\.jsx"\)/);
    assert.doesNotMatch(mainSource, /import App from/);
    assert.doesNotMatch(appSource, /features\/public/);
    assert.doesNotMatch(appSource, /publicLeadService/);
  });

  it("uses pathname links between public pages", () => {
    const publicSources = [
      "src/features/public/LandingPage.jsx",
      "src/features/public/PricingPage.jsx",
      "src/features/public/ApiDocsPage.jsx",
      "src/features/public/CommercialLandingPage.jsx"
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(publicSources, /href=["']#\/(landing|pricing|docs)/);
    assert.match(publicSources, /href="\/pricing\/"/);
    assert.match(publicSources, /href="\/docs\/"/);
    assert.match(publicSources, /commercialPageDefinitions/);
  });
});
