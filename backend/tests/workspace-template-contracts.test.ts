import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";
import { WorkspaceService } from "../apps/api-gateway/src/workspace/workspace.service.ts";

describe("workspace template contracts", () => {
  beforeEach(() => {
    WorkspaceRepository.useDefault(WorkspaceRepository.inMemory());
  });

  afterEach(() => {
    WorkspaceRepository.useDefault(WorkspaceRepository.inMemory());
  });

  it("creates and lists tenant-scoped templates", async () => {
    const workspace = new WorkspaceService();

    const saved = await workspace.saveTemplate({
      channel: "SDK",
      title: "Delay reply",
      topic: "Delivery",
      text: "We are checking your order."
    }, { tenantId: "tenant-volga" });

    assert.equal(saved.status, "ok");
    assert.equal(saved.data.tenantId, "tenant-volga");

    const listed = await workspace.fetchTemplates({}, { tenantId: "tenant-volga" });
    assert.ok(listed.data.items.some((item) => item.title === "Delay reply"));

    const foreign = await workspace.fetchTemplates({}, { tenantId: "tenant-ladoga" });
    assert.equal(foreign.data.items.length, 0);
  });

  it("rejects template writes without a tenant context", async () => {
    const workspace = new WorkspaceService();
    const saved = await workspace.saveTemplate({
      channel: "SDK",
      title: "Unsafe template",
      topic: "Delivery",
      text: "Must not be saved without a tenant."
    });

    assert.equal(saved.status, "invalid");
    assert.equal(saved.error.code, "tenant_context_required");
    assert.equal((await WorkspaceRepository.default().listTemplates()).length, 0);
  });
});
