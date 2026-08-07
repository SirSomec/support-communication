import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

const landingSource = readFileSync(new URL("../src/features/public/LandingPage.jsx", import.meta.url), "utf8");
const cockpitImage = new URL("../src/assets/operator-cockpit-concept.jpg", import.meta.url);
const socialPreview = new URL("../public/og/support-communication.jpg", import.meta.url);

describe("public performance contracts", () => {
  it("uses the optimized cockpit preview with intrinsic dimensions", () => {
    assert.match(landingSource, /operator-cockpit-concept\.jpg/);
    assert.doesNotMatch(landingSource, /operator-cockpit-concept\.png/);
    assert.match(landingSource, /width=\{1200\}/);
    assert.match(landingSource, /height=\{759\}/);
    assert.ok(statSync(cockpitImage).size < 250_000, "cockpit preview must stay below 250 KB");
  });

  it("keeps the social preview lightweight", () => {
    assert.ok(statSync(socialPreview).size < 200_000, "Open Graph image must stay below 200 KB");
  });
});
