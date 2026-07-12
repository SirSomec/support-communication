import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canTransitionKnowledgeSourceStatus,
  deriveKnowledgeSourceReadiness,
  isKnowledgeSourceRetrievalEligible
} from "../apps/api-gateway/src/knowledge-sources/knowledge-source.types.ts";

describe("Knowledge source lifecycle contracts", () => {
  it("only exposes a ready and approved source to retrieval", () => {
    assert.equal(deriveKnowledgeSourceReadiness("ready", "approved"), "ready");
    assert.equal(deriveKnowledgeSourceReadiness("ready", "pending"), "stale");
    assert.equal(deriveKnowledgeSourceReadiness("indexing", "approved"), "not_ready");
    assert.equal(isKnowledgeSourceRetrievalEligible({ approvalStatus: "approved", readiness: "ready", status: "ready" }), true);
    assert.equal(isKnowledgeSourceRetrievalEligible({ approvalStatus: "pending", readiness: "stale", status: "ready" }), false);
  });

  it("allows only additive lifecycle paths and makes archive terminal", () => {
    assert.equal(canTransitionKnowledgeSourceStatus("draft", "uploaded"), true);
    assert.equal(canTransitionKnowledgeSourceStatus("indexing", "ready"), true);
    assert.equal(canTransitionKnowledgeSourceStatus("ready", "draft"), false);
    assert.equal(canTransitionKnowledgeSourceStatus("archived", "ready"), false);
  });

  it("keeps the Prisma catalog tenant scoped with retrieval and lifecycle indexes", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../prisma/migrations/202607120006_knowledge_sources/migration.sql", import.meta.url), "utf8");

    assert.match(schema, /model KnowledgeSource/);
    assert.match(schema, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(schema, /@@index\(\[tenantId, status, readiness, approvalStatus\]/);
    assert.match(migration, /CREATE TABLE "knowledge_sources"/);
    assert.match(migration, /"approval_status" TEXT NOT NULL DEFAULT 'pending'/);
    assert.match(migration, /"knowledge_sources_tenant_retrieval_idx"/);
  });
});
