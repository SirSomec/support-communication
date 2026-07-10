import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QualityService } from "../apps/api-gateway/src/quality/quality.service.ts";

describe("quality workspace contracts", () => {
  it("returns quality workspace payload with tenant metadata", async () => {
    const quality = new QualityService();

    const workspace = await quality.fetchQualityWorkspace({ tenantId: "tenant-volga" });

    assert.equal(workspace.status, "ok");
    assert.equal(workspace.data.tenantId, "tenant-volga");
    assert.ok(Array.isArray(workspace.data.qualityScores));
    assert.ok(Array.isArray(workspace.data.aiSuggestions));
  });
});
