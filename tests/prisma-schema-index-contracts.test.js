import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Prisma migration index parity", () => {
  it("keeps existing migration-created indexes declared in schema.prisma", () => {
    const schema = readFileSync(new URL("../backend/prisma/schema.prisma", import.meta.url), "utf8");

    assert.match(schema, /@@index\(\[auditEventId\], map: "service_admin_impersonations_audit_event_id_idx"\)/);
    assert.match(schema, /@@index\(\[tenantId, resolutionOutcome, updatedAt\], map: "conversations_tenant_resolution_outcome_updated_idx"\)/);
    assert.match(schema, /@@index\(\[tenantId, channelConnectionId, status\], map: "public_api_keys_tenant_channel_connection_idx"\)/);
    assert.match(schema, /@@index\(\[tenantId, status\], map: "mcp_connectors_tenant_status_idx"\)/);

    const migration = readFileSync(new URL("../backend/prisma/migrations/202607120011_mcp_connectors/migration.sql", import.meta.url), "utf8");
    assert.match(migration, /CREATE INDEX "mcp_connectors_tenant_status_idx" ON "mcp_connectors"\("tenant_id","status"\)/);
  });
});
