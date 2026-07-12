import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aiBotConnectionFixtures,
  aiBotFixtureCatalog,
  aiBotFixtureTenants,
  aiBotKnowledgeSourceFixtures,
  aiScenarioFixture,
  legacyPublishedScenarioFixture
} from "../apps/api-gateway/src/automation/ai-bot-fixtures.js";

describe("AI bot development fixtures", () => {
  it("keeps the legacy and AI examples isolated by tenant", () => {
    assert.equal(aiBotFixtureTenants.length, 2);
    assert.notEqual(legacyPublishedScenarioFixture.tenantId, aiScenarioFixture.tenantId);
    assert.equal(legacyPublishedScenarioFixture.tenantId, "tenant-fixture-legacy");
    assert.equal(aiScenarioFixture.tenantId, "tenant-fixture-ai");
    assert.equal(legacyPublishedScenarioFixture.status, "published");
    assert.equal(legacyPublishedScenarioFixture.enabled, true);
    assert.equal(aiScenarioFixture.mode, "grounded_consultation");
    assert.ok(aiBotKnowledgeSourceFixtures.every((source) => source.tenantId === aiScenarioFixture.tenantId));
    assert.ok(aiBotConnectionFixtures.every((connection) => connection.tenantId === aiScenarioFixture.tenantId));
  });

  it("covers ready and not-ready knowledge plus ready and disabled connections", () => {
    assert.deepEqual(aiBotKnowledgeSourceFixtures.map((source) => source.readiness).sort(), ["not_ready", "ready"]);
    assert.deepEqual(aiBotConnectionFixtures.map((connection) => connection.status).sort(), ["disabled", "ready"]);
    assert.equal(aiScenarioFixture.connectionId, aiBotConnectionFixtures.find((connection) => connection.status === "ready")?.id);
    assert.deepEqual(aiScenarioFixture.sourceIds, aiBotKnowledgeSourceFixtures.filter((source) => source.readiness === "ready").map((source) => source.id));
  });

  it("contains no credential material or credential-shaped fields", () => {
    const serialized = JSON.stringify(aiBotFixtureCatalog).toLowerCase();
    assert.doesNotMatch(serialized, /sk[-_]|bearer\s|api[_-]?key|password|token|secret/);
    assert.equal(hasCredentialField(aiBotFixtureCatalog), false);
  });
});

function hasCredentialField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasCredentialField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => /api.?key|password|secret|token/i.test(key) || hasCredentialField(child));
}
