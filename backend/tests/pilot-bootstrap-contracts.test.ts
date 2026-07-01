import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

describe("pilot bootstrap", () => {
  it("defines pilot compose overlay with prisma repositories", () => {
    const compose = readFileSync(new URL("../../docker-compose.pilot.yml", import.meta.url), "utf8");
    assert.match(compose, /IDENTITY_REPOSITORY:\s*prisma/);
    assert.match(compose, /CONVERSATION_REPOSITORY:\s*prisma/);
  });

  it("exposes pilot-bootstrap script in package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.scripts["pilot:bootstrap"], "node --env-file=.env.example scripts/pilot-bootstrap.mjs");
  });
});
