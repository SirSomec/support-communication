import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { commercialPageDefinitions } from "../src/public/content/commercialPageDefinitions.js";
import { createPublicRouteManifest } from "../src/public/seo/publicRouteManifest.js";

describe("commercial SEO page content contract", () => {
  it("keeps metadata, H1s, analytics goals and related routes unique", () => {
    assert.equal(commercialPageDefinitions.length, 7);
    for (const field of ["pathname", "outputFile", "title", "description", "h1", "analyticsGoal"]) {
      assert.equal(new Set(commercialPageDefinitions.map((page) => page[field])).size, 7, `${field} must be unique`);
    }

    for (const page of commercialPageDefinitions) {
      assert.ok(page.title.length >= 50 && page.title.length <= 70, `${page.id} title length`);
      assert.ok(page.description.length >= 120 && page.description.length <= 170, `${page.id} description length`);
      assert.equal(page.pathname.endsWith("/"), true);
      assert.equal(page.faq.length >= 3, true);
      assert.equal(page.relatedPageIds.length, 1);
      assert.equal(page.relatedPageIds.includes(page.id), false);
      assert.equal(page.visual.steps.length >= 4, true);
      assert.ok(["start_free", "request_demo"].includes(page.primaryCta.kind));
    }

    for (const heading of ["capabilities", "workflow", "faq", "related"]) {
      assert.equal(new Set(commercialPageDefinitions.map((page) => page.sectionHeadings[heading])).size, 7, `${heading} must be page-specific`);
    }
  });

  it("uses definitions as the manifest source and keeps FAQ visible without FAQ JSON-LD", () => {
    const routes = createPublicRouteManifest({ PUBLIC_SITE_INDEXABLE: "true" });
    for (const page of commercialPageDefinitions) {
      const route = routes.find((item) => item.id === page.id);
      assert.ok(route, `${page.id} route is missing`);
      assert.equal(route.title, page.title);
      assert.equal(route.description, page.description);
      assert.equal(route.h1, page.h1);
      assert.equal(route.analyticsGoal, page.analyticsGoal);
      assert.deepEqual(route.jsonLdTypes, ["BreadcrumbList"]);
    }

    const component = readFileSync("src/features/public/CommercialLandingPage.jsx", "utf8");
    assert.match(component, /commercialPageDefinitions/);
    assert.match(component, /<details/);
    assert.match(component, /<summary>/);
    assert.doesNotMatch(component, /FAQPage|Question|acceptedAnswer/);
  });

  it("states the required product limits and avoids unsupported outcome claims", () => {
    const byId = new Map(commercialPageDefinitions.map((page) => [page.id, JSON.stringify(page)]));
    assert.match(byId.get("website-support-chat"), /SDK key/);
    assert.match(byId.get("website-support-chat"), /домен/);

    const ai = byId.get("ai-support-bot");
    assert.match(ai, /модел/);
    assert.match(ai, /лимит/);
    assert.match(ai, /сценар/);
    assert.match(ai, /handoff|передач/);

    const sla = byId.get("support-sla");
    assert.match(sla, /не гарантирует|без обещаний/i);

    const allContent = [...byId.values()].join("\n");
    assert.doesNotMatch(allContent, /ускор(ит|ение)\s+(в|на)\s*\d|сократ(ит|им)\s+.*\d+%|гарантированн(ая|ое|ый)\s+(точность|скорость)/i);
  });

  it("links the home page to all three solution pages without duplicating their copy", () => {
    const landing = readFileSync("src/features/public/LandingPage.jsx", "utf8");
    assert.match(landing, /commercialPageDefinitions\.map/);
    for (const page of commercialPageDefinitions) {
      assert.doesNotMatch(landing, new RegExp(page.h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});
