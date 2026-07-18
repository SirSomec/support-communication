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

  it("forces personal scope for operators without shared-template access", async () => {
    const workspace = new WorkspaceService();
    const employeeContext = {
      operatorId: "usr-employee-1",
      permissions: ["dialogs.read", "templates.read", "templates.write"],
      tenantId: "tenant-volga"
    };

    const personal = await workspace.saveTemplate({
      channel: "SDK",
      title: "My personal answer",
      topic: "Delivery",
      text: "Personal text."
    }, employeeContext);
    assert.equal(personal.status, "ok");
    assert.equal(personal.data.scope, "personal");
    assert.equal(personal.data.ownerId, "usr-employee-1");

    const teamDenied = await workspace.saveTemplate({
      channel: "SDK",
      scope: "team",
      title: "Team attempt",
      topic: "Delivery",
      text: "Should be denied."
    }, employeeContext);
    assert.equal(teamDenied.status, "denied");
    assert.equal(teamDenied.error.code, "template_scope_forbidden");
  });

  it("lets senior staff manage shared templates and hides foreign personal ones", async () => {
    const workspace = new WorkspaceService();
    const seniorContext = {
      operatorId: "usr-senior-1",
      permissions: ["templates.read", "templates.write", "templates.manageShared"],
      tenantId: "tenant-volga"
    };
    const employeeContext = {
      operatorId: "usr-employee-1",
      permissions: ["templates.read", "templates.write"],
      tenantId: "tenant-volga"
    };
    const otherEmployeeContext = {
      operatorId: "usr-employee-2",
      permissions: ["templates.read", "templates.write"],
      tenantId: "tenant-volga"
    };

    const team = await workspace.saveTemplate({
      channel: "SDK",
      scope: "Командный",
      title: "Team answer",
      topic: "Delivery",
      text: "Shared text."
    }, seniorContext);
    assert.equal(team.status, "ok");
    assert.equal(team.data.scope, "team");
    assert.equal(team.data.ownerId, null);

    const personal = await workspace.saveTemplate({
      channel: "SDK",
      scope: "personal",
      title: "Private answer",
      topic: "Delivery",
      text: "Private text."
    }, employeeContext);
    assert.equal(personal.status, "ok");

    // Чужой личный шаблон не виден другому оператору, но виден старшей роли.
    const otherView = await workspace.fetchTemplates({}, otherEmployeeContext);
    assert.equal(otherView.data.items.some((item) => item.id === personal.data.id), false);
    assert.equal(otherView.data.items.some((item) => item.id === team.data.id), true);
    assert.equal(otherView.data.canManageShared, false);

    const seniorView = await workspace.fetchTemplates({}, seniorContext);
    assert.equal(seniorView.data.items.some((item) => item.id === personal.data.id), true);
    assert.equal(seniorView.data.canManageShared, true);

    // Оператор без manageShared не может править командный шаблон.
    const editDenied = await workspace.saveTemplate({
      channel: "SDK",
      id: team.data.id,
      title: "Edited team answer",
      topic: "Delivery",
      text: "Edited."
    }, otherEmployeeContext);
    assert.equal(editDenied.status, "denied");

    // Владелец правит свой личный шаблон, чужой оператор — нет.
    const ownerEdit = await workspace.saveTemplate({
      channel: "SDK",
      id: personal.data.id,
      title: "Private answer v2",
      topic: "Delivery",
      text: "Private text v2.",
      version: 2
    }, employeeContext);
    assert.equal(ownerEdit.status, "ok");
    assert.equal(ownerEdit.data.ownerId, "usr-employee-1");

    const foreignEdit = await workspace.saveTemplate({
      channel: "SDK",
      id: personal.data.id,
      title: "Hijack",
      topic: "Delivery",
      text: "Hijack."
    }, otherEmployeeContext);
    assert.equal(foreignEdit.status, "denied");
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
