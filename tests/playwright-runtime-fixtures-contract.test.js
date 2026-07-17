import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const fixtureRoot = new URL("../.playwright-runtime/api-gateway/", import.meta.url);

describe("Playwright runtime data source", () => {
  it("does not keep a second JSON fixture source beside Prisma", () => {
    const files = existsSync(fixtureRoot)
      ? readdirSync(fixtureRoot).filter((name) => name.endsWith(".json"))
      : [];
    assert.deepEqual(files, []);
  });

  it("seeds the hermetic smoke database through the canonical Prisma pipeline", () => {
    const seed = readFileSync(new URL("../backend/scripts/smoke-db-seed.mjs", import.meta.url), "utf8");
    assert.match(seed, /smoke-db-reset\.mjs/);
    assert.match(seed, /seed-identity\.ts/);
    assert.match(seed, /seed-smoke-catalog\.ts/);
    assert.doesNotMatch(seed, /\.playwright-runtime/);
  });

  it("fails closed when named settings records are absent from the seeded database", () => {
    const smoke = readFileSync(new URL("./smoke.spec.js", import.meta.url), "utf8");
    assert.match(smoke, /hasText:\s*"Production SDK key"[\s\S]*?toHaveCount\(1\)/);
    assert.match(smoke, /hasText:\s*"VK inbound"[\s\S]*?toHaveCount\(1\)/);
  });
});
