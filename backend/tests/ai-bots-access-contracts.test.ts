import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionService } from "../apps/api-gateway/src/identity/permission.service.ts";
import { createSeededIdentityRepository } from "../apps/api-gateway/src/identity/seed.ts";
import { serviceAdminSession } from "../apps/api-gateway/src/identity/seed-catalog.ts";
import { featureFlags as platformFeatureFlags } from "../apps/api-gateway/src/platform/seed-catalog.ts";

const AI_BOT_FLAG_KEYS = ["ai_bots", "ai_bot_mcp_sources"];

describe("AI bot access foundation contracts", () => {
  it("ships tenant-scoped AI bot flags disabled by default", () => {
    const flags = AI_BOT_FLAG_KEYS.map((key) => platformFeatureFlags.find((flag) => flag.key === key));

    assert.equal(flags.every(Boolean), true);
    for (const flag of flags) {
      assert.equal(flag?.status, "off");
      assert.equal(flag?.scope, "tenant");
      assert.equal(flag?.rollout, 0);
      assert.deepEqual(flag?.enabledTenantIds, []);
      assert.equal(flag?.killSwitch, true);
    }
  });

  it("authorizes only the intended admin roles for scenario, source and AI connection actions", async () => {
    const permissions = new PermissionService(createSeededIdentityRepository());
    const tenantAdminScenario = await permissions.validatePermission({
      action: "automation.scenarios.write",
      actorRole: "admin",
      resource: "bot-scenario",
      tenantId: "tenant-volga"
    });
    const tenantAdminSource = await permissions.validatePermission({
      action: "knowledge.sources.write",
      actorRole: "admin",
      resource: "knowledge-source",
      tenantId: "tenant-volga"
    });
    const serviceAdminConnection = await permissions.validatePermission({
      action: "ai.connections.manage",
      actorId: serviceAdminSession.adminId,
      actorRole: serviceAdminSession.role,
      resource: "ai-connection",
      tenantId: "tenant-volga"
    });
    const seniorConnection = await permissions.validatePermission({
      action: "ai.connections.manage",
      actorRole: "senior",
      resource: "ai-connection",
      tenantId: "tenant-volga"
    });

    assert.equal(tenantAdminScenario.data.allowed, true);
    assert.equal(tenantAdminSource.data.allowed, true);
    assert.equal(serviceAdminConnection.data.allowed, true);
    assert.equal(seniorConnection.data.allowed, false);
  });
});
