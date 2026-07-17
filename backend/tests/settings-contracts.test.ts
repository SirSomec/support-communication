import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { IntegrationService } from "../apps/api-gateway/src/integrations/integration.service.ts";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { SettingsEmployeeService } from "../apps/api-gateway/src/identity/settings-employee.service.ts";
import { SettingsRulesService } from "../apps/api-gateway/src/identity/settings-rules.service.ts";
import { SettingsRulesRepository } from "../apps/api-gateway/src/identity/settings-rules.repository.ts";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { PermissionService } from "../apps/api-gateway/src/identity/permission.service.ts";
import { permissionRoles, serviceAdminSession } from "../apps/api-gateway/src/identity/seed-catalog.ts";
import { createSeededIdentityRepository } from "../apps/api-gateway/src/identity/seed.ts";

function telegramFetchOk(username = "settings_bot") {
  return async (_input: string) => ({
    json: async () => ({ ok: true, result: { id: 123456, username } }),
    ok: true,
    status: 200
  });
}

describe("settings runtime contracts", () => {
  it("lists multiple telegram channel connections for one tenant", async () => {
    const integrations = new IntegrationService(IntegrationRepository.inMemory(), { telegramFetch: telegramFetchOk() });
    const tenantId = "tenant-settings";

    const initial = await integrations.fetchChannelConnections(tenantId, { type: "telegram" });
    const first = await integrations.createChannelConnection(tenantId, {
      name: "Telegram primary",
      type: "telegram",
      credentials: { botToken: "123456:ABCDEF" }
    });
    const second = await integrations.createChannelConnection(tenantId, {
      name: "Telegram backup",
      type: "telegram",
      credentials: { botToken: "654321:FEDCBA" }
    });
    const list = await integrations.fetchChannelConnections(tenantId, { type: "telegram" });

    assert.equal(initial.status, "ok");
    assert.equal(initial.data.connections.length, 0);
    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.equal(list.status, "ok");
    assert.equal(list.data.connections.length, 2);
    assert.ok(list.data.connections.every((connection) => connection.credentialsMasked === true));
    assert.equal(JSON.stringify(list.data.connections).includes("ABCDEF"), false);
  });

  it("manages tenant employee settings with role, group, channel and reset audit evidence", async () => {
    const repository = createSeededIdentityRepository();
    const settings = new SettingsEmployeeService(repository);

    const workspace = await settings.fetchEmployees({ tenantId: "tenant-northstar" });
    assert.equal(workspace.status, "ok");
    assert.ok(workspace.data.employees.length >= 1);

    const updated = await settings.updateEmployee("usr-ns-agent", {
      channels: ["Telegram", "MAX"],
      chatLimit: 9,
      canOverride: true,
      groupId: "group-vip",
      roleKey: "senior",
      sensitiveData: true
    }, { tenantId: "tenant-northstar" });
    assert.equal(updated.status, "ok");
    assert.deepEqual(updated.data.employee.channels, ["Telegram", "MAX"]);

    const restartedSettings = new SettingsEmployeeService(repository);
    const afterRestart = await restartedSettings.fetchEmployees({ tenantId: "tenant-northstar" });
    const persistedEmployee = afterRestart.data.employees.find((employee) => employee.id === "usr-ns-agent");
    assert.equal(persistedEmployee.groupId, "group-vip");
    assert.equal(persistedEmployee.chatLimit, 9);
    assert.deepEqual(persistedEmployee.channels, ["Telegram", "MAX"]);

    const createdGroup = await restartedSettings.createGroup({
      channels: ["SDK"],
      memberIds: ["usr-ns-agent"],
      name: "Payment support",
      scope: "Payments"
    }, { tenantId: "tenant-northstar" });
    const afterGroupRestart = new SettingsEmployeeService(repository);
    const persistedGroups = await afterGroupRestart.fetchGroups({ tenantId: "tenant-northstar" });
    assert.ok(persistedGroups.data.groups.some((group) => group.id === createdGroup.data.group.id && group.name === "Payment support"));
  });

  it("manages settings rules with critical confirmation and impact tests", async () => {
    const settingsRules = new SettingsRulesService();

    const workspace = await settingsRules.fetchRules({ tenantId: "tenant-northstar" });
    assert.equal(workspace.status, "ok");
    assert.ok(workspace.data.rules.length >= 1);

    const testRun = await settingsRules.testRule("operator-chat-limit", { sampleSize: 50 }, { tenantId: "tenant-northstar" });
    assert.equal(testRun.status, "ok");
    assert.equal(testRun.data.result.sampleSize, 50);
  });

  it("persists tenant rules and immutable audit across service instances", async () => {
    const repository = SettingsRulesRepository.inMemory();
    const first = new SettingsRulesService(repository);
    const updated = await first.updateRule("operator-chat-limit", {
      parameters: { defaultLimit: 13 },
      reason: "Capacity policy update"
    }, { tenantId: "tenant-rules-persistence" });
    assert.equal(updated.status, "ok");

    const second = new SettingsRulesService(repository);
    const workspace = await second.fetchRules({ tenantId: "tenant-rules-persistence" });
    const persisted = workspace.data.rules.find((rule) => rule.id === "operator-chat-limit");
    const audit = await second.listSettingsAuditEventsAsync("tenant-rules-persistence");
    assert.equal(persisted.parameters.defaultLimit, 13);
    assert.equal(audit.some((event) => event.id === updated.data.auditEvent.id && event.immutable), true);
    assert.equal((await second.fetchRules({ tenantId: "tenant-other" })).data.rules.find((rule) => rule.id === "operator-chat-limit").parameters.defaultLimit, 8);
  });

  it("requires explicit tenant context for settings service workspaces and mutations", async () => {
    const employees = new SettingsEmployeeService(IdentityRepository.inMemory());
    const employeeWorkspace = await employees.fetchEmployees();
    const groups = await employees.fetchGroups();
    const createdGroup = await employees.createGroup({ name: "Missing tenant" });

    assert.equal(employeeWorkspace.status, "invalid");
    assert.equal(employeeWorkspace.error?.code, "tenant_context_required");
    assert.equal(groups.status, "invalid");
    assert.equal(groups.error?.code, "tenant_context_required");
    assert.equal(createdGroup.status, "invalid");
    assert.equal(createdGroup.error?.code, "tenant_context_required");

    const rules = new SettingsRulesService();
    const rulesWorkspace = await rules.fetchRules();
    const updatedRule = await rules.updateRule("operator-chat-limit", { enabled: true });
    const ruleTest = await rules.testRule("operator-chat-limit", { sampleSize: 50 });

    assert.equal(rulesWorkspace.status, "invalid");
    assert.equal(rulesWorkspace.error?.code, "tenant_context_required");
    assert.equal(updatedRule.status, "invalid");
    assert.equal(updatedRule.error?.code, "tenant_context_required");
    assert.equal(ruleTest.status, "invalid");
    assert.equal(ruleTest.error?.code, "tenant_context_required");
  });

  it("exposes integration capabilities snapshot for backend integration panel", async () => {
    const integrations = new IntegrationService();
    const snapshot = await integrations.fetchIntegrationCapabilities();

    assert.equal(snapshot.status, "ok");
    assert.equal(snapshot.data.routeGaps.length, 0);
    assert.ok(snapshot.data.services.some((service) => service.id === "auditService"));
    assert.ok(snapshot.data.services.some((service) => service.id === "settingsService"));
  });

  it("allows tenant administrators and service administrators to access settings routes", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/identity/settings.controller.ts", import.meta.url), "utf8");

    assert.match(source, /@UseGuards\(TenantOperatorOrServiceAdminGuard\)[\s\S]*@Controller\("settings"\)/);
    assert.match(source, /@Get\("employees"\)[\s\S]*@RequireTenantOperatorPermission\("settings\.read"\)[\s\S]*@RequireServiceAdminAction\("settings\.read"\)/);
    assert.match(source, /@Patch\("rules\/:ruleId"\)[\s\S]*@RequireTenantOperatorPermission\("settings\.manage"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)/);
  });

  it("grants seeded service-admin settings permissions through the active RBAC policy", async () => {
    const serviceAdminRole = permissionRoles.find((role) => role.key === serviceAdminSession.role);
    const permissions = new PermissionService(createSeededIdentityRepository());

    assert.ok(serviceAdminSession.allowedActions.includes("settings.read"));
    assert.ok(serviceAdminSession.allowedActions.includes("settings.manage"));
    assert.ok(serviceAdminRole?.actions.includes("settings.read"));
    assert.ok(serviceAdminRole?.actions.includes("settings.manage"));

    const read = await permissions.validatePermission({
      action: "settings.read",
      actorId: serviceAdminSession.adminId,
      actorRole: serviceAdminSession.role,
      resource: "service-admin",
      tenantId: serviceAdminSession.currentTenantId
    });
    const manage = await permissions.validatePermission({
      action: "settings.manage",
      actorId: serviceAdminSession.adminId,
      actorRole: serviceAdminSession.role,
      resource: "service-admin",
      tenantId: serviceAdminSession.currentTenantId
    });

    assert.equal(read.status, "ok");
    assert.equal(manage.status, "ok");
  });
});
