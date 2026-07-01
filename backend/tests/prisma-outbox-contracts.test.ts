import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { describe, it } from "node:test";
import { createOutboxEvent } from "@support-communication/events";

describe("Prisma database and transactional outbox contracts", () => {
  it("documents database ownership for every service schema and current Prisma table", () => {
    const ownershipMapUrl = new URL("../docs/database-ownership-map.md", import.meta.url);
    assert.equal(existsSync(ownershipMapUrl), true, "backend/docs/database-ownership-map.md ownership map must exist");

    const ownershipMap = readFileSync(ownershipMapUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const backendPlan = readFileSync(new URL("../../docs/backend-development-plan.md", import.meta.url), "utf8");
    const serviceSchemas = [
      "api-gateway",
      "realtime-gateway",
      "auth-service",
      "tenant-service",
      "rbac-service",
      "conversation-service",
      "message-service",
      "channel-service",
      "client-profile-service",
      "template-knowledge-service",
      "routing-sla-service",
      "report-service",
      "integration-webhook-service",
      "file-service",
      "automation-bot-service",
      "quality-ai-service",
      "billing-service",
      "audit-service",
      "platform-admin-service",
      "incident-service",
      "feature-flag-service",
      "notification-service"
    ];

    for (const service of serviceSchemas) {
      assert.match(ownershipMap, new RegExp(`\\|\\s*\`${service}\``), `${service} must have a database ownership row`);
    }

    const mappedTables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((match) => String(match[1])).sort();
    assert.ok(mappedTables.length > 0, "Prisma schema must expose mapped PostgreSQL tables");
    const ownerRows = ownershipMap
      .split("\n")
      .filter((line) => /^\|\s*`[^`]+`/.test(line));
    assert.ok(ownerRows.length > 0, "ownership map must include service owner rows");
    for (const table of mappedTables) {
      const owningRows = ownerRows.filter((row) => row.split("|")[3]?.includes(`\`${table}\``));
      assert.equal(owningRows.length, 1, `${table} must be assigned to exactly one owning service row`);
    }

    const outboxWorkerRow = ownerRows.find((row) => row.includes("`outbox-worker`"));
    assert.ok(outboxWorkerRow, "outbox-worker ownership row is required for shared event infrastructure");
    assert.match(outboxWorkerRow, /`outbox_events`/);

    assert.doesNotMatch(ownershipMap, /\b(TBD|TODO|unassigned)\b/i);
    assert.match(ownershipMap, /Owner service/);
    assert.match(ownershipMap, /Current PostgreSQL tables/);
    assert.match(ownershipMap, /Next migration slice/);
    assert.match(
      backendPlan,
      /Status 2026-06-28:[\s\S]*database ownership map that assigns every current Prisma table to one service owner\./
    );
    assert.match(
      backendPlan,
      /- \[x\] Slice 0\.1: add a database ownership map for every remaining service schema in `backend\/docs\/` and assert it from `backend\/tests\/prisma-outbox-contracts\.test\.ts`\./
    );
  });

  it("exposes local Prisma workflow scripts for validation, generation and migration deploy", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootPackageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };

    assert.match(packageJson.scripts["prisma:validate"], /prisma validate --schema prisma\/schema\.prisma/);
    assert.match(packageJson.scripts["prisma:generate"], /prisma generate --schema prisma\/schema\.prisma/);
    assert.match(packageJson.scripts["prisma:migrate:deploy"], /prisma migrate deploy --schema prisma\/schema\.prisma/);
    assert.match(packageJson.scripts["tenant-isolation:verify"], /node --test --import tsx tests\/tenant-isolation-contracts\.test\.ts/);
    assert.match(rootPackageJson.scripts["backend:tenant-isolation:verify"], /cd backend && npm run tenant-isolation:verify/);
    assert.match(packageJson.scripts["audit-immutability:verify"], /node --test --import tsx tests\/audit-immutability-contracts\.test\.ts/);
    assert.match(rootPackageJson.scripts["backend:audit-immutability:verify"], /cd backend && npm run audit-immutability:verify/);
    assert.match(packageJson.scripts["redaction:runtime-smoke"], /scripts\/redaction-runtime-smoke\.mjs/);
    assert.match(rootPackageJson.scripts["backend:redaction:runtime-smoke"], /cd backend && npm run redaction:runtime-smoke/);
    assert.match(packageJson.scripts["smoke:postgres"], /--env-file=.env.example/);
    assert.match(packageJson.scripts["smoke:postgres"], /scripts\/smoke-postgres\.mjs/);

    const smokeScript = readFileSync(new URL("../scripts/smoke-postgres.mjs", import.meta.url), "utf8");
    assert.match(smokeScript, /prisma:migrate:deploy/);
    assert.match(smokeScript, /prisma:seed/);

    const releaseChecklistScript = readFileSync(new URL("../scripts/release-checklist.mjs", import.meta.url), "utf8");
    assert.match(releaseChecklistScript, /Tenant isolation verification/);
    assert.match(releaseChecklistScript, /tenant-isolation:verify/);
    assert.match(releaseChecklistScript, /Immutable audit verification/);
    assert.match(releaseChecklistScript, /audit-immutability:verify/);
    assert.match(releaseChecklistScript, /Secret redaction runtime smoke/);
    assert.match(releaseChecklistScript, /redaction:runtime-smoke/);
    assert.equal(existsSync(new URL("audit-immutability-contracts.test.ts", import.meta.url)), true);
    assert.equal(existsSync(new URL("redaction-runtime-smoke-contracts.test.ts", import.meta.url)), true);
  });

  it("validates the Prisma schema through the configured local env", () => {
    const validation = spawnSync("npm", ["run", "prisma:validate"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      shell: true
    });

    assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  });

  it("keeps generated Prisma SQL aligned with the hand-written initial migration", () => {
    const diff = spawnSync("npx", [
      "prisma",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script"
    ], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      shell: true
    });

    assert.equal(diff.status, 0, diff.stderr || diff.stdout);
    assert.match(diff.stdout, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(diff.stdout, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(diff.stdout, /"allowed_actions" TEXT\[\] DEFAULT ARRAY\[\]::TEXT\[\]/);
    assert.match(diff.stdout, /"occurred_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(diff.stdout, /CREATE TABLE "tenant_users"/);
    assert.match(diff.stdout, /CREATE TABLE "permission_roles"/);
    assert.match(diff.stdout, /CREATE TABLE "service_admin_audit_events"/);
    assert.match(diff.stdout, /CREATE TABLE "billing_tenant_states"/);
    assert.match(diff.stdout, /CREATE TABLE "billing_sync_jobs"/);
    assert.match(diff.stdout, /CREATE TABLE "billing_quota_ledger_entries"/);
    assert.match(diff.stdout, /CREATE TABLE "billing_quota_reservations"/);
    assert.match(diff.stdout, /CREATE TABLE "billing_subscriptions"/);
    assert.match(diff.stdout, /CREATE TABLE "billing_invoices"/);
    assert.match(diff.stdout, /CREATE TABLE "billing_provider_sync_events"/);
  });

  it("defines the PostgreSQL Prisma schema for identity foundation and outbox rows", () => {
    const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
    assert.equal(existsSync(schemaUrl), true, "backend/prisma/schema.prisma must exist");

    const schema = readFileSync(schemaUrl, "utf8");
    assert.match(schema, /datasource\s+db\s+\{[\s\S]*provider\s+=\s+"postgresql"/);
    assert.match(schema, /generator\s+client\s+\{[\s\S]*provider\s+=\s+"prisma-client-js"/);

    for (const model of ["Tenant", "TenantAuditEvent", "TenantUser", "PermissionRole", "ServiceAdminAuditEvent", "ServiceAdminImpersonation", "BreakGlassApproval", "BillingTenantState", "BillingSyncJob", "BillingQuotaLedgerEntry", "BillingQuotaReservation", "BillingSubscription", "BillingInvoice", "BillingProviderSyncEvent", "Conversation", "ConversationMessage", "ConversationInboundEvent", "ConversationRealtimeEvent", "ConversationOutboundDescriptor", "ChannelDeliveryReceipt", "MfaChallenge", "ServiceAdminSession", "PasswordCredential", "PasswordPolicy", "CredentialAuditEvent", "OidcProviderConfig", "OidcCallbackDescriptor", "SamlProviderMetadata", "SamlAcsRequestDescriptor", "SamlAssertionReplay", "OutboxEvent"]) {
      assert.match(schema, new RegExp(`model\\s+${model}\\s+\\{`), `${model} model is required`);
    }

    for (const table of ["tenants", "tenant_audit_events", "tenant_users", "permission_roles", "service_admin_audit_events", "service_admin_impersonations", "break_glass_approvals", "billing_tenant_states", "billing_sync_jobs", "billing_quota_ledger_entries", "billing_quota_reservations", "billing_subscriptions", "billing_invoices", "billing_provider_sync_events", "conversations", "conversation_messages", "conversation_inbound_events", "conversation_realtime_events", "conversation_outbound_descriptors", "channel_delivery_receipts", "mfa_challenges", "service_admin_sessions", "service_admin_token_pairs", "service_admin_token_rotations", "service_admin_token_revocations", "password_credentials", "password_policies", "credential_audit_events", "oidc_provider_configs", "oidc_callback_descriptors", "saml_provider_metadata", "saml_acs_request_descriptors", "saml_assertion_replays", "outbox_events"]) {
      assert.match(schema, new RegExp(`@@map\\("${table}"\\)`), `${table} table mapping is required`);
    }
    assert.match(schema, /model BillingSyncJob \{[\s\S]*attempts\s+Int\s+@default\(0\)/);
    assert.match(schema, /model BillingSyncJob \{[\s\S]*lastError\s+String\?\s+@map\("last_error"\)/);
    assert.match(schema, /model BillingSyncJob \{[\s\S]*lockedAt\s+DateTime\?\s+@map\("locked_at"\)/);
    assert.match(schema, /model BillingSyncJob \{[\s\S]*nextAttemptAt\s+DateTime\?\s+@map\("next_attempt_at"\)/);
    assert.match(schema, /model BillingSyncJob \{[\s\S]*deadLetteredAt\s+DateTime\?\s+@map\("dead_lettered_at"\)/);
    assert.match(schema, /model BillingSyncJob \{[\s\S]*publishedAt\s+DateTime\?\s+@map\("published_at"\)/);
    assert.match(schema, /model TenantAuditEvent \{[\s\S]*immutable\s+Boolean\s+@default\(true\)/);
    assert.match(schema, /model ServiceAdminImpersonation \{[\s\S]*auditEventId\s+String\?\s+@map\("audit_event_id"\)/);
    assert.match(schema, /model BillingQuotaLedgerEntry \{[\s\S]*auditEvent\s+Json\?\s+@map\("audit_event"\)/);
    assert.match(schema, /model BillingQuotaReservation \{[\s\S]*auditEvent\s+Json\?\s+@map\("audit_event"\)/);
    assert.match(schema, /model BillingQuotaReservation \{[\s\S]*auditEvents\s+Json\s+@default\("\[\]"\)\s+@map\("audit_events"\)/);
    assert.match(schema, /model BillingQuotaReservation \{[\s\S]*lockedAt\s+DateTime\?\s+@map\("locked_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(schema, /model BillingProviderSyncEvent \{[\s\S]*auditEvents\s+Json\s+@default\("\[\]"\)\s+@map\("audit_events"\)/);
    assert.match(schema, /model ConversationOutboundDescriptor \{[\s\S]*requestFingerprint\s+String\?\s+@map\("request_fingerprint"\)/);
    assert.match(schema, /model ChannelDeliveryReceipt \{[\s\S]*providerEventId\s+String\s+@map\("provider_event_id"\)/);
    assert.match(schema, /model ChannelDeliveryReceipt \{[\s\S]*idempotencyKey\s+String\s+@unique\(map: "channel_delivery_receipts_idempotency_key_key"\)\s+@map\("idempotency_key"\)/);
    assert.match(schema, /model OutboxEvent \{[\s\S]*nextAttemptAt\s+DateTime\?\s+@map\("next_attempt_at"\)/);
    assert.match(schema, /model OutboxEvent \{[\s\S]*deadLetteredAt\s+DateTime\?\s+@map\("dead_lettered_at"\)/);
    assert.match(schema, /model OutboxEvent \{[\s\S]*deadLetterReplayAuditEvents\s+Json\s+@default\("\[\]"\)\s+@map\("dead_letter_replay_audit_events"\)/);
    assert.match(schema, /model BillingSyncJob \{[\s\S]*deadLetterReplayAuditEvents\s+Json\s+@default\("\[\]"\)\s+@map\("dead_letter_replay_audit_events"\)/);
  });

  it("ships an initial SQL migration for identity and outbox tables", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    assert.equal(existsSync(migrationsUrl), true, "backend/prisma/migrations must exist");

    const migrationDirectories = await readdir(migrationsUrl);
    assert.ok(migrationDirectories.some((name) => /init/.test(name)), "an init migration directory is required");

    const initDirectory = migrationDirectories.find((name) => /init/.test(name));
    assert.ok(initDirectory);

    const sqlUrl = new URL(`../prisma/migrations/${initDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "initial migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    for (const table of ["tenants", "tenant_audit_events", "mfa_challenges", "service_admin_sessions", "outbox_events"]) {
      assert.match(sql, new RegExp(`CREATE TABLE "${table}"`), `${table} table must be created`);
    }

    assert.match(sql, /CREATE INDEX "outbox_events_status_queue_occurred_at_idx"/);
    assert.match(sql, /CREATE INDEX "tenant_audit_events_tenant_id_at_idx"/);
  });

  it("ships an additive migration for identity credential, policy and credential audit rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const credentialsDirectory = migrationDirectories.find((name) => /identity_credentials/.test(name));
    assert.ok(credentialsDirectory, "an identity credential migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${credentialsDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "identity credential migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "password_credentials"/);
    assert.match(sql, /CREATE UNIQUE INDEX "password_credentials_email_key"/);
    assert.match(sql, /CREATE TABLE "password_policies"/);
    assert.match(sql, /CREATE UNIQUE INDEX "password_policies_scope_key"/);
    assert.match(sql, /CREATE TABLE "credential_audit_events"/);
    assert.match(sql, /CREATE INDEX "credential_audit_events_subject_id_at_idx"/);
  });

  it("ships an additive migration for service-admin token lifecycle rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const serviceAdminTokensDirectory = migrationDirectories.find((name) => /service_admin_tokens/.test(name));
    assert.ok(serviceAdminTokensDirectory, "a service-admin token migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${serviceAdminTokensDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "service-admin token migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "service_admin_token_pairs"/);
    assert.match(sql, /CREATE UNIQUE INDEX "service_admin_token_pairs_access_hash_key"/);
    assert.match(sql, /CONSTRAINT "service_admin_token_pairs_distinct_hashes_check" CHECK \("access_token_hash" <> "refresh_token_hash"\)/);
    assert.match(sql, /CREATE TABLE "service_admin_token_rotations"/);
    assert.match(sql, /CONSTRAINT "service_admin_token_rotations_pkey" PRIMARY KEY \("idempotency_key"\)/);
    assert.match(sql, /CREATE TABLE "service_admin_token_revocations"/);
    assert.match(sql, /CONSTRAINT "service_admin_token_revocations_pkey" PRIMARY KEY \("idempotency_key"\)/);
  });

  it("ships an additive migration for immutable tenant audit rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const immutableAuditDirectory = migrationDirectories.find((name) => /tenant_audit_immutable/.test(name));
    assert.ok(immutableAuditDirectory, "a tenant audit immutable migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${immutableAuditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "tenant audit immutable migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "tenant_audit_events"/);
    assert.match(sql, /ADD COLUMN "immutable" BOOLEAN NOT NULL DEFAULT true/);
  });

  it("ships an additive migration for OIDC provider config and callback descriptor rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const oidcDirectory = migrationDirectories.find((name) => /identity_oidc/.test(name));
    assert.ok(oidcDirectory, "an OIDC identity migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${oidcDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "OIDC identity migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "oidc_provider_configs"/);
    assert.match(sql, /CREATE INDEX "oidc_provider_configs_tenant_enabled_idx"/);
    assert.match(sql, /CREATE TABLE "oidc_callback_descriptors"/);
    assert.match(sql, /CREATE UNIQUE INDEX "oidc_callback_descriptors_state_key"/);
    assert.match(sql, /CREATE INDEX "oidc_callback_descriptors_provider_requested_idx"/);
  });

  it("ships an additive migration for SAML provider metadata, ACS descriptors and assertion replay rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const samlDirectory = migrationDirectories.find((name) => /identity_saml/.test(name));
    assert.ok(samlDirectory, "a SAML identity migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${samlDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "SAML identity migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "saml_provider_metadata"/);
    assert.match(sql, /CREATE INDEX "saml_provider_metadata_tenant_enabled_idx"/);
    assert.match(sql, /CREATE TABLE "saml_acs_request_descriptors"/);
    assert.match(sql, /CREATE UNIQUE INDEX "saml_acs_request_descriptors_request_id_key"/);
    assert.match(sql, /CREATE UNIQUE INDEX "saml_acs_request_descriptors_relay_state_key"/);
    assert.match(sql, /CREATE TABLE "saml_assertion_replays"/);
    assert.match(sql, /CONSTRAINT "saml_assertion_replays_pkey" PRIMARY KEY \("provider_id", "assertion_id"\)/);
  });

  it("ships an additive migration for tenant users, permission roles and service-admin audit rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const usersRbacDirectory = migrationDirectories.find((name) => /identity_users_rbac/.test(name));
    assert.ok(usersRbacDirectory, "an identity users/RBAC migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${usersRbacDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "identity users/RBAC migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "tenant_users"/);
    assert.match(sql, /CREATE TABLE "permission_roles"/);
    assert.match(sql, /CREATE TABLE "service_admin_audit_events"/);
    assert.match(sql, /CREATE UNIQUE INDEX "tenant_users_tenant_id_email_key"/);
    assert.match(sql, /CREATE INDEX "tenant_users_tenant_id_status_idx"/);
    assert.match(sql, /CREATE UNIQUE INDEX "permission_roles_key_key"/);
    assert.match(sql, /CREATE INDEX "service_admin_audit_events_user_id_at_idx"/);
  });

  it("ships an additive migration for RBAC policy versions, role grants and permission denial rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const rbacDirectory = migrationDirectories.find((name) => /identity_rbac_policy_grants/.test(name));
    assert.ok(rbacDirectory, "an identity RBAC policy/grants migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${rbacDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "identity RBAC policy/grants migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "rbac_policy_versions"/);
    assert.match(sql, /CREATE INDEX "rbac_policy_versions_status_activated_at_idx"/);
    assert.match(sql, /CREATE UNIQUE INDEX "rbac_policy_versions_one_active_idx" ON "rbac_policy_versions"\("status"\) WHERE "status" = 'active'/);
    assert.match(sql, /CREATE TABLE "rbac_role_grants"/);
    assert.match(sql, /CONSTRAINT "rbac_role_grants_effect_check" CHECK \("effect" IN \('allow', 'deny'\)\)/);
    assert.match(sql, /CONSTRAINT "rbac_role_grants_policy_version_fk" FOREIGN KEY \("policy_version_id"\) REFERENCES "rbac_policy_versions"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(sql, /CONSTRAINT "rbac_role_grants_role_key_fk" FOREIGN KEY \("role_key"\) REFERENCES "permission_roles"\("key"\) ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(sql, /CONSTRAINT "rbac_role_grants_tenant_id_fk" FOREIGN KEY \("tenant_id"\) REFERENCES "tenants"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(sql, /CREATE INDEX "rbac_role_grants_policy_tenant_role_action_idx"/);
    assert.match(sql, /CREATE TABLE "permission_denial_events"/);
    assert.match(sql, /CONSTRAINT "permission_denial_events_immutable_check" CHECK \("immutable" = true\)/);
    assert.match(sql, /CONSTRAINT "permission_denial_events_policy_version_fk" FOREIGN KEY \("policy_version_id"\) REFERENCES "rbac_policy_versions"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(sql, /CONSTRAINT "permission_denial_events_role_key_fk" FOREIGN KEY \("role_key"\) REFERENCES "permission_roles"\("key"\) ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(sql, /CONSTRAINT "permission_denial_events_tenant_id_fk" FOREIGN KEY \("tenant_id"\) REFERENCES "tenants"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(sql, /CREATE INDEX "permission_denial_events_tenant_action_at_idx"/);
  });

  it("ships an additive migration for durable billing tenant state and sync jobs", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const billingDirectory = migrationDirectories.find((name) => /billing_storage/.test(name));
    assert.ok(billingDirectory, "a billing storage migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${billingDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing storage migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "billing_tenant_states"/);
    assert.match(sql, /CREATE TABLE "billing_sync_jobs"/);
    assert.match(sql, /"plan_id" TEXT NOT NULL/);
    assert.match(sql, /"usage" JSONB NOT NULL/);
    assert.match(sql, /CREATE INDEX "billing_sync_jobs_tenant_id_created_at_idx"/);
    assert.match(sql, /CREATE INDEX "billing_sync_jobs_status_queue_created_at_idx"/);
  });

  it("ships an additive migration for service-admin impersonation and break-glass state", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const serviceAdminDirectory = migrationDirectories.find((name) => /service_admin_state/.test(name));
    assert.ok(serviceAdminDirectory, "a service-admin state migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${serviceAdminDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "service-admin state migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "service_admin_impersonations"/);
    assert.match(sql, /CREATE TABLE "break_glass_approvals"/);
    assert.match(sql, /"stop_audit_event" JSONB/);
    assert.match(sql, /CREATE INDEX "service_admin_impersonations_tenant_user_active_idx"/);
    assert.match(sql, /CREATE INDEX "break_glass_approvals_status_expires_at_idx"/);
  });

  it("ships an additive migration for service-admin impersonation approval binding", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const approvalBindingDirectory = migrationDirectories.find((name) => /service_admin_impersonation_approval_id/.test(name));
    assert.ok(approvalBindingDirectory, "a service-admin impersonation approval binding migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${approvalBindingDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "service-admin impersonation approval binding migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "service_admin_impersonations" ADD COLUMN "approval_id" TEXT/);
    assert.match(sql, /CREATE INDEX "service_admin_impersonations_approval_id_idx"/);
  });

  it("ships an additive migration for service-admin impersonation start audit binding", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const startAuditDirectory = migrationDirectories.find((name) => /service_admin_impersonation_start_audit_binding/.test(name));
    assert.ok(startAuditDirectory, "a service-admin impersonation start audit binding migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${startAuditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "service-admin impersonation start audit binding migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "service_admin_impersonations" ADD COLUMN "audit_event_id" TEXT/);
    assert.match(sql, /CREATE INDEX "service_admin_impersonations_audit_event_id_idx"/);
  });

  it("ships an additive migration for billing quota ledger entries", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const quotaLedgerDirectory = migrationDirectories.find((name) => /billing_quota_ledger/.test(name));
    assert.ok(quotaLedgerDirectory, "a billing quota ledger migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${quotaLedgerDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing quota ledger migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "billing_quota_ledger_entries"/);
    assert.match(sql, /"decision" TEXT NOT NULL/);
    assert.match(sql, /"requested" INTEGER NOT NULL/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_quota_ledger_entries_idempotency_key_key"/);
    assert.match(sql, /CREATE INDEX "billing_quota_ledger_entries_tenant_resource_created_at_idx"/);
    assert.match(sql, /CREATE INDEX "billing_quota_ledger_tenant_resource_decision_idx"/);
    assert.match(sql, /CREATE INDEX "billing_quota_ledger_entries_decision_created_at_idx"/);
  });

  it("ships an additive migration for billing quota reservations", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const quotaReservationsDirectory = migrationDirectories.find((name) => /billing_quota_reservations/.test(name));
    assert.ok(quotaReservationsDirectory, "a billing quota reservations migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${quotaReservationsDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing quota reservations migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "billing_quota_reservations"/);
    assert.match(sql, /"used_before" INTEGER NOT NULL/);
    assert.match(sql, /"used_after" INTEGER/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_quota_reservations_idempotency_key_key"/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_quota_reservations_commit_idempotency_key_key"/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_quota_reservations_release_idempotency_key_key"/);
    assert.match(sql, /CREATE INDEX "billing_quota_res_tenant_resource_status_created_idx"/);
    assert.match(sql, /CREATE INDEX "billing_quota_reservations_status_expires_at_idx"/);
  });

  it("ships an additive migration for quota reservation worker leases", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const leaseDirectory = migrationDirectories.find((name) => /billing_quota_reservation_leases/.test(name));
    assert.ok(leaseDirectory, "a billing quota reservation leases migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${leaseDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing quota reservation leases migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "billing_quota_reservations"/);
    assert.match(sql, /ADD COLUMN "locked_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /CREATE INDEX "billing_quota_res_status_expires_locked_idx" ON "billing_quota_reservations"\("status", "expires_at", "locked_at"\)/);
  });

  it("ships an additive migration for immutable billing quota audit evidence", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const billingAuditDirectory = migrationDirectories.find((name) => /billing_audit_immutability/.test(name));
    assert.ok(billingAuditDirectory, "a billing audit immutability migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${billingAuditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing audit immutability migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "billing_quota_ledger_entries"/);
    assert.match(sql, /ADD COLUMN "audit_event" JSONB/);
  });

  it("ships an additive migration for immutable billing quota reservation audit evidence", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const reservationAuditDirectory = migrationDirectories.find((name) => /billing_quota_reservation_audit_immutability/.test(name));
    assert.ok(reservationAuditDirectory, "a billing quota reservation audit immutability migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${reservationAuditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing quota reservation audit immutability migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "billing_quota_reservations"/);
    assert.match(sql, /ADD COLUMN "audit_event" JSONB/);
    assert.match(sql, /ADD COLUMN "audit_events" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it("ships an additive migration for billing provider subscription and invoice sync state", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const providerSyncDirectory = migrationDirectories.find((name) => /billing_provider_sync/.test(name));
    assert.ok(providerSyncDirectory, "a billing provider sync migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${providerSyncDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing provider sync migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "billing_subscriptions"/);
    assert.match(sql, /CREATE TABLE "billing_invoices"/);
    assert.match(sql, /CREATE TABLE "billing_provider_sync_events"/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_subscriptions_provider_subscription_key"/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_invoices_provider_invoice_key"/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_provider_sync_events_idempotency_key_key"/);
    assert.match(sql, /CREATE INDEX "billing_provider_sync_events_tenant_provider_created_at_idx"/);
  });

  it("ships an additive migration for tenant-scoped payment retry schedules", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const retryScheduleDirectory = migrationDirectories.find((name) => /payment_retry_schedules/.test(name));
    assert.ok(retryScheduleDirectory, "a payment retry schedules migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${retryScheduleDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "payment retry schedules migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const retryScheduleModel = schema.match(/model BillingPaymentRetrySchedule \{[\s\S]*?\n\}/)?.[0] ?? "";
    const billingOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `billing-service` |")) ?? "";

    assert.match(retryScheduleModel, /model BillingPaymentRetrySchedule/);
    assert.match(retryScheduleModel, /scheduleId\s+String\s+@map\("schedule_id"\)/);
    assert.match(retryScheduleModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(retryScheduleModel, /invoiceId\s+String\s+@map\("invoice_id"\)/);
    assert.match(retryScheduleModel, /provider\s+String/);
    assert.match(retryScheduleModel, /providerInvoiceId\s+String\s+@map\("provider_invoice_id"\)/);
    assert.match(retryScheduleModel, /idempotencyKey\s+String\s+@unique\(map: "billing_payment_retry_schedules_idempotency_key_key"\)\s+@map\("idempotency_key"\)/);
    assert.match(retryScheduleModel, /requestFingerprint\s+String\s+@map\("request_fingerprint"\)/);
    assert.match(retryScheduleModel, /status\s+String/);
    assert.match(retryScheduleModel, /attempt\s+Int\s+@default\(0\)/);
    assert.match(retryScheduleModel, /maxAttempts\s+Int\s+@map\("max_attempts"\)/);
    assert.match(retryScheduleModel, /nextAttemptAt\s+DateTime\s+@map\("next_attempt_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(retryScheduleModel, /lastAttemptAt\s+DateTime\?\s+@map\("last_attempt_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(retryScheduleModel, /traceId\s+String\s+@map\("trace_id"\)/);
    assert.match(retryScheduleModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(retryScheduleModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(retryScheduleModel, /@@id\(\[tenantId, scheduleId\], map: "billing_payment_retry_schedules_pkey"\)/);
    assert.match(retryScheduleModel, /@@index\(\[tenantId, invoiceId, status, nextAttemptAt\], map: "billing_retry_sched_tenant_invoice_status_next_idx"\)/);
    assert.match(retryScheduleModel, /@@index\(\[tenantId, status, nextAttemptAt\], map: "billing_retry_sched_tenant_status_next_idx"\)/);
    assert.match(retryScheduleModel, /@@index\(\[provider, providerInvoiceId\], map: "billing_retry_sched_provider_invoice_idx"\)/);
    assert.match(retryScheduleModel, /@@map\("billing_payment_retry_schedules"\)/);
    assert.match(sql, /CREATE TABLE "billing_payment_retry_schedules"/);
    assert.match(sql, /"schedule_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"invoice_id" TEXT NOT NULL/);
    assert.match(sql, /"provider" TEXT NOT NULL/);
    assert.match(sql, /"provider_invoice_id" TEXT NOT NULL/);
    assert.match(sql, /"idempotency_key" TEXT NOT NULL/);
    assert.match(sql, /"request_fingerprint" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"attempt" INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /"max_attempts" INTEGER NOT NULL/);
    assert.match(sql, /"next_attempt_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"last_attempt_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /"trace_id" TEXT NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "billing_payment_retry_schedules_pkey" PRIMARY KEY \("tenant_id", "schedule_id"\)/);
    assert.match(sql, /CONSTRAINT "billing_payment_retry_schedules_status_check" CHECK \("status" IN \('canceled', 'exhausted', 'paid', 'scheduled'\)\)/);
    assert.match(sql, /CONSTRAINT "billing_payment_retry_schedules_attempt_check" CHECK \("attempt" >= 0 AND "max_attempts" > 0\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_payment_retry_schedules_idempotency_key_key" ON "billing_payment_retry_schedules"\("idempotency_key"\)/);
    assert.match(sql, /CREATE INDEX "billing_retry_sched_tenant_invoice_status_next_idx" ON "billing_payment_retry_schedules"\("tenant_id", "invoice_id", "status", "next_attempt_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_retry_sched_tenant_status_next_idx" ON "billing_payment_retry_schedules"\("tenant_id", "status", "next_attempt_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_retry_sched_provider_invoice_idx" ON "billing_payment_retry_schedules"\("provider", "provider_invoice_id"\)/);
    assert.match(sql, /ALTER TABLE "billing_payment_retry_schedules" ADD CONSTRAINT "billing_payment_retry_schedules_tenant_id_fkey"/);
    assert.match(billingOwnershipRow, /\|\s*`billing-service`\s*\|[^|]*\|[^|]*`billing_payment_retry_schedules`/);
  });

  it("ships an additive migration for tenant-scoped payment dunning state", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const dunningDirectory = migrationDirectories.find((name) => /payment_dunning_states/.test(name));
    assert.ok(dunningDirectory, "a payment dunning states migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${dunningDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "payment dunning states migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const dunningModel = schema.match(/model BillingPaymentDunningState \{[\s\S]*?\n\}/)?.[0] ?? "";
    const billingOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `billing-service` |")) ?? "";

    assert.match(dunningModel, /model BillingPaymentDunningState/);
    assert.match(dunningModel, /dunningId\s+String\s+@map\("dunning_id"\)/);
    assert.match(dunningModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(dunningModel, /invoiceId\s+String\s+@map\("invoice_id"\)/);
    assert.match(dunningModel, /subscriptionId\s+String\?\s+@map\("subscription_id"\)/);
    assert.match(dunningModel, /provider\s+String/);
    assert.match(dunningModel, /providerInvoiceId\s+String\s+@map\("provider_invoice_id"\)/);
    assert.match(dunningModel, /idempotencyKey\s+String\s+@unique\(map: "billing_payment_dunning_states_idempotency_key_key"\)\s+@map\("idempotency_key"\)/);
    assert.match(dunningModel, /requestFingerprint\s+String\s+@map\("request_fingerprint"\)/);
    assert.match(dunningModel, /stage\s+String/);
    assert.match(dunningModel, /status\s+String/);
    assert.match(dunningModel, /failedAttempts\s+Int\s+@default\(0\)\s+@map\("failed_attempts"\)/);
    assert.match(dunningModel, /lastFailureAt\s+DateTime\?\s+@map\("last_failure_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(dunningModel, /nextActionAt\s+DateTime\?\s+@map\("next_action_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(dunningModel, /traceId\s+String\s+@map\("trace_id"\)/);
    assert.match(dunningModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(dunningModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(dunningModel, /@@id\(\[tenantId, dunningId\], map: "billing_payment_dunning_states_pkey"\)/);
    assert.match(dunningModel, /@@index\(\[tenantId, invoiceId, status, updatedAt\], map: "billing_dunning_tenant_invoice_status_updated_idx"\)/);
    assert.match(dunningModel, /@@index\(\[tenantId, status, nextActionAt\], map: "billing_dunning_tenant_status_next_action_idx"\)/);
    assert.match(dunningModel, /@@index\(\[provider, providerInvoiceId\], map: "billing_dunning_provider_invoice_idx"\)/);
    assert.match(dunningModel, /@@map\("billing_payment_dunning_states"\)/);
    assert.match(sql, /CREATE TABLE "billing_payment_dunning_states"/);
    assert.match(sql, /"dunning_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"invoice_id" TEXT NOT NULL/);
    assert.match(sql, /"subscription_id" TEXT/);
    assert.match(sql, /"provider" TEXT NOT NULL/);
    assert.match(sql, /"provider_invoice_id" TEXT NOT NULL/);
    assert.match(sql, /"idempotency_key" TEXT NOT NULL/);
    assert.match(sql, /"request_fingerprint" TEXT NOT NULL/);
    assert.match(sql, /"stage" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"failed_attempts" INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /"last_failure_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /"next_action_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /"trace_id" TEXT NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "billing_payment_dunning_states_pkey" PRIMARY KEY \("tenant_id", "dunning_id"\)/);
    assert.match(sql, /CONSTRAINT "billing_payment_dunning_states_status_check" CHECK \("status" IN \('active', 'canceled', 'paid', 'paused'\)\)/);
    assert.match(sql, /CONSTRAINT "billing_payment_dunning_states_stage_check" CHECK \("stage" IN \('final_notice', 'grace', 'initial'\)\)/);
    assert.match(sql, /CONSTRAINT "billing_payment_dunning_states_failed_attempts_check" CHECK \("failed_attempts" >= 0\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_payment_dunning_states_idempotency_key_key" ON "billing_payment_dunning_states"\("idempotency_key"\)/);
    assert.match(sql, /CREATE INDEX "billing_dunning_tenant_invoice_status_updated_idx" ON "billing_payment_dunning_states"\("tenant_id", "invoice_id", "status", "updated_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_dunning_tenant_status_next_action_idx" ON "billing_payment_dunning_states"\("tenant_id", "status", "next_action_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_dunning_provider_invoice_idx" ON "billing_payment_dunning_states"\("provider", "provider_invoice_id"\)/);
    assert.match(sql, /ALTER TABLE "billing_payment_dunning_states" ADD CONSTRAINT "billing_payment_dunning_states_tenant_id_fkey"/);
    assert.match(billingOwnershipRow, /\|\s*`billing-service`\s*\|[^|]*\|[^|]*`billing_payment_dunning_states`/);
  });

  it("ships an additive migration for tenant-scoped reconciliation conflicts", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const conflictDirectory = migrationDirectories.find((name) => /reconciliation_conflicts/.test(name));
    assert.ok(conflictDirectory, "a reconciliation conflicts migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${conflictDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "reconciliation conflicts migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const conflictModel = schema.match(/model BillingReconciliationConflict \{[\s\S]*?\n\}/)?.[0] ?? "";
    const billingOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `billing-service` |")) ?? "";

    assert.match(conflictModel, /model BillingReconciliationConflict/);
    assert.match(conflictModel, /conflictId\s+String\s+@map\("conflict_id"\)/);
    assert.match(conflictModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(conflictModel, /invoiceId\s+String\s+@map\("invoice_id"\)/);
    assert.match(conflictModel, /provider\s+String/);
    assert.match(conflictModel, /providerInvoiceId\s+String\s+@map\("provider_invoice_id"\)/);
    assert.match(conflictModel, /idempotencyKey\s+String\s+@unique\(map: "billing_reconciliation_conflicts_idempotency_key_key"\)\s+@map\("idempotency_key"\)/);
    assert.match(conflictModel, /requestFingerprint\s+String\s+@map\("request_fingerprint"\)/);
    assert.match(conflictModel, /reason\s+String/);
    assert.match(conflictModel, /severity\s+String/);
    assert.match(conflictModel, /status\s+String/);
    assert.match(conflictModel, /expected\s+Json/);
    assert.match(conflictModel, /actual\s+Json/);
    assert.match(conflictModel, /resolution\s+String\?/);
    assert.match(conflictModel, /resolvedAt\s+DateTime\?\s+@map\("resolved_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(conflictModel, /detectedAt\s+DateTime\s+@map\("detected_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(conflictModel, /traceId\s+String\s+@map\("trace_id"\)/);
    assert.match(conflictModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(conflictModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(conflictModel, /@@id\(\[tenantId, conflictId\], map: "billing_reconciliation_conflicts_pkey"\)/);
    assert.match(conflictModel, /@@index\(\[tenantId, invoiceId, status, detectedAt\], map: "billing_recon_conflicts_tenant_invoice_status_detected_idx"\)/);
    assert.match(conflictModel, /@@index\(\[tenantId, status, severity, updatedAt\], map: "billing_recon_conflicts_tenant_status_severity_updated_idx"\)/);
    assert.match(conflictModel, /@@index\(\[provider, providerInvoiceId\], map: "billing_recon_conflicts_provider_invoice_idx"\)/);
    assert.match(conflictModel, /@@map\("billing_reconciliation_conflicts"\)/);
    assert.match(sql, /CREATE TABLE "billing_reconciliation_conflicts"/);
    assert.match(sql, /"conflict_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"invoice_id" TEXT NOT NULL/);
    assert.match(sql, /"provider" TEXT NOT NULL/);
    assert.match(sql, /"provider_invoice_id" TEXT NOT NULL/);
    assert.match(sql, /"idempotency_key" TEXT NOT NULL/);
    assert.match(sql, /"request_fingerprint" TEXT NOT NULL/);
    assert.match(sql, /"reason" TEXT NOT NULL/);
    assert.match(sql, /"severity" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"expected" JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /"actual" JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /"resolution" TEXT/);
    assert.match(sql, /"resolved_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /"detected_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"trace_id" TEXT NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "billing_reconciliation_conflicts_pkey" PRIMARY KEY \("tenant_id", "conflict_id"\)/);
    assert.match(sql, /CONSTRAINT "billing_reconciliation_conflicts_status_check" CHECK \("status" IN \('ignored', 'open', 'resolved'\)\)/);
    assert.match(sql, /CONSTRAINT "billing_reconciliation_conflicts_severity_check" CHECK \("severity" IN \('high', 'low', 'medium'\)\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_reconciliation_conflicts_idempotency_key_key" ON "billing_reconciliation_conflicts"\("idempotency_key"\)/);
    assert.match(sql, /CREATE INDEX "billing_recon_conflicts_tenant_invoice_status_detected_idx" ON "billing_reconciliation_conflicts"\("tenant_id", "invoice_id", "status", "detected_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_recon_conflicts_tenant_status_severity_updated_idx" ON "billing_reconciliation_conflicts"\("tenant_id", "status", "severity", "updated_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_recon_conflicts_provider_invoice_idx" ON "billing_reconciliation_conflicts"\("provider", "provider_invoice_id"\)/);
    assert.match(sql, /ALTER TABLE "billing_reconciliation_conflicts" ADD CONSTRAINT "billing_reconciliation_conflicts_tenant_id_fkey"/);
    assert.match(billingOwnershipRow, /\|\s*`billing-service`\s*\|[^|]*\|[^|]*`billing_reconciliation_conflicts`/);
  });

  it("ships an additive migration for tenant-scoped idempotent payment retry keys", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const retryKeyDirectory = migrationDirectories.find((name) => /payment_retry_keys/.test(name));
    assert.ok(retryKeyDirectory, "a payment retry keys migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${retryKeyDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "payment retry keys migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const retryKeyModel = schema.match(/model BillingPaymentRetryKey \{[\s\S]*?\n\}/)?.[0] ?? "";
    const billingOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `billing-service` |")) ?? "";

    assert.match(retryKeyModel, /model BillingPaymentRetryKey/);
    assert.match(retryKeyModel, /retryKeyId\s+String\s+@map\("retry_key_id"\)/);
    assert.match(retryKeyModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(retryKeyModel, /invoiceId\s+String\s+@map\("invoice_id"\)/);
    assert.match(retryKeyModel, /scheduleId\s+String\?\s+@map\("schedule_id"\)/);
    assert.match(retryKeyModel, /provider\s+String/);
    assert.match(retryKeyModel, /providerInvoiceId\s+String\s+@map\("provider_invoice_id"\)/);
    assert.match(retryKeyModel, /idempotencyKey\s+String\s+@unique\(map: "billing_payment_retry_keys_idempotency_key_key"\)\s+@map\("idempotency_key"\)/);
    assert.match(retryKeyModel, /requestFingerprint\s+String\s+@map\("request_fingerprint"\)/);
    assert.match(retryKeyModel, /status\s+String/);
    assert.match(retryKeyModel, /attempt\s+Int\s+@default\(0\)/);
    assert.match(retryKeyModel, /result\s+Json\s+@default\("\{\}"\)/);
    assert.match(retryKeyModel, /firstAttemptAt\s+DateTime\s+@map\("first_attempt_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(retryKeyModel, /lastAttemptAt\s+DateTime\?\s+@map\("last_attempt_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(retryKeyModel, /traceId\s+String\s+@map\("trace_id"\)/);
    assert.match(retryKeyModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(retryKeyModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(retryKeyModel, /@@id\(\[tenantId, retryKeyId\], map: "billing_payment_retry_keys_pkey"\)/);
    assert.match(retryKeyModel, /@@index\(\[tenantId, invoiceId, status, firstAttemptAt\], map: "billing_retry_keys_tenant_invoice_status_first_idx"\)/);
    assert.match(retryKeyModel, /@@index\(\[tenantId, status, updatedAt\], map: "billing_retry_keys_tenant_status_updated_idx"\)/);
    assert.match(retryKeyModel, /@@index\(\[provider, providerInvoiceId\], map: "billing_retry_keys_provider_invoice_idx"\)/);
    assert.match(retryKeyModel, /@@map\("billing_payment_retry_keys"\)/);
    assert.match(sql, /CREATE TABLE "billing_payment_retry_keys"/);
    assert.match(sql, /"retry_key_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"invoice_id" TEXT NOT NULL/);
    assert.match(sql, /"schedule_id" TEXT/);
    assert.match(sql, /"provider" TEXT NOT NULL/);
    assert.match(sql, /"provider_invoice_id" TEXT NOT NULL/);
    assert.match(sql, /"idempotency_key" TEXT NOT NULL/);
    assert.match(sql, /"request_fingerprint" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"attempt" INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /"result" JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /"first_attempt_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"last_attempt_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /"trace_id" TEXT NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "billing_payment_retry_keys_pkey" PRIMARY KEY \("tenant_id", "retry_key_id"\)/);
    assert.match(sql, /CONSTRAINT "billing_payment_retry_keys_status_check" CHECK \("status" IN \('claimed', 'failed', 'succeeded'\)\)/);
    assert.match(sql, /CONSTRAINT "billing_payment_retry_keys_attempt_check" CHECK \("attempt" >= 0\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_payment_retry_keys_idempotency_key_key" ON "billing_payment_retry_keys"\("idempotency_key"\)/);
    assert.match(sql, /CREATE INDEX "billing_retry_keys_tenant_invoice_status_first_idx" ON "billing_payment_retry_keys"\("tenant_id", "invoice_id", "status", "first_attempt_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_retry_keys_tenant_status_updated_idx" ON "billing_payment_retry_keys"\("tenant_id", "status", "updated_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_retry_keys_provider_invoice_idx" ON "billing_payment_retry_keys"\("provider", "provider_invoice_id"\)/);
    assert.match(sql, /ALTER TABLE "billing_payment_retry_keys" ADD CONSTRAINT "billing_payment_retry_keys_tenant_id_fkey"/);
    assert.match(billingOwnershipRow, /\|\s*`billing-service`\s*\|[^|]*\|[^|]*`billing_payment_retry_keys`/);
  });

  it("ships an additive migration for tenant-scoped billing approvals", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const approvalDirectory = migrationDirectories.find((name) => /billing_approvals/.test(name));
    assert.ok(approvalDirectory, "a billing approvals migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${approvalDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing approvals migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const approvalModel = schema.match(/model BillingApproval \{[\s\S]*?\n\}/)?.[0] ?? "";
    const billingOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `billing-service` |")) ?? "";

    assert.match(approvalModel, /model BillingApproval/);
    assert.match(approvalModel, /approvalId\s+String\s+@map\("approval_id"\)/);
    assert.match(approvalModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(approvalModel, /subjectType\s+String\s+@map\("subject_type"\)/);
    assert.match(approvalModel, /subjectId\s+String\s+@map\("subject_id"\)/);
    assert.match(approvalModel, /status\s+String/);
    assert.match(approvalModel, /reason\s+String/);
    assert.match(approvalModel, /requestFingerprint\s+String\s+@map\("request_fingerprint"\)/);
    assert.match(approvalModel, /requestedBy\s+String\s+@map\("requested_by"\)/);
    assert.match(approvalModel, /requestedByName\s+String\s+@map\("requested_by_name"\)/);
    assert.match(approvalModel, /decidedBy\s+String\?\s+@map\("decided_by"\)/);
    assert.match(approvalModel, /decidedByName\s+String\?\s+@map\("decided_by_name"\)/);
    assert.match(approvalModel, /decisionReason\s+String\?\s+@map\("decision_reason"\)/);
    assert.match(approvalModel, /traceId\s+String\s+@map\("trace_id"\)/);
    assert.match(approvalModel, /expiresAt\s+DateTime\s+@map\("expires_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(approvalModel, /decidedAt\s+DateTime\?\s+@map\("decided_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(approvalModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(approvalModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(approvalModel, /@@id\(\[tenantId, approvalId\], map: "billing_approvals_pkey"\)/);
    assert.match(approvalModel, /@@unique\(\[tenantId, requestFingerprint\], map: "billing_approvals_tenant_request_fingerprint_key"\)/);
    assert.match(approvalModel, /@@index\(\[tenantId, status, expiresAt\], map: "billing_approvals_tenant_status_expires_idx"\)/);
    assert.match(approvalModel, /@@index\(\[tenantId, subjectType, subjectId, status\], map: "billing_approvals_tenant_subject_status_idx"\)/);
    assert.match(approvalModel, /@@index\(\[tenantId, createdAt\], map: "billing_approvals_tenant_created_idx"\)/);
    assert.match(approvalModel, /@@map\("billing_approvals"\)/);
    assert.doesNotMatch(approvalModel, /raw|secret|payload/i);
    assert.match(sql, /CREATE TABLE "billing_approvals"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"approval_id" TEXT NOT NULL/);
    assert.match(sql, /"subject_type" TEXT NOT NULL/);
    assert.match(sql, /"subject_id" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"reason" TEXT NOT NULL/);
    assert.match(sql, /"request_fingerprint" TEXT NOT NULL/);
    assert.match(sql, /"requested_by" TEXT NOT NULL/);
    assert.match(sql, /"requested_by_name" TEXT NOT NULL/);
    assert.match(sql, /"decided_by" TEXT/);
    assert.match(sql, /"decided_by_name" TEXT/);
    assert.match(sql, /"decision_reason" TEXT/);
    assert.match(sql, /"trace_id" TEXT NOT NULL/);
    assert.match(sql, /"expires_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"decided_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "billing_approvals_pkey" PRIMARY KEY \("tenant_id", "approval_id"\)/);
    assert.match(sql, /CONSTRAINT "billing_approvals_status_check" CHECK \("status" IN \('approved', 'expired', 'pending', 'rejected'\)\)/);
    assert.match(sql, /CONSTRAINT "billing_approvals_subject_type_check" CHECK \("subject_type" IN \('payment_action', 'tariff_change'\)\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_approvals_tenant_request_fingerprint_key" ON "billing_approvals"\("tenant_id", "request_fingerprint"\)/);
    assert.match(sql, /CREATE INDEX "billing_approvals_tenant_status_expires_idx" ON "billing_approvals"\("tenant_id", "status", "expires_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_approvals_tenant_subject_status_idx" ON "billing_approvals"\("tenant_id", "subject_type", "subject_id", "status"\)/);
    assert.match(sql, /CREATE INDEX "billing_approvals_tenant_created_idx" ON "billing_approvals"\("tenant_id", "created_at"\)/);
    assert.match(sql, /ALTER TABLE "billing_approvals" ADD CONSTRAINT "billing_approvals_tenant_id_fkey"/);
    assert.doesNotMatch(sql, /raw|secret|payload/i);
    assert.match(billingOwnershipRow, /\|\s*`billing-service`\s*\|[^|]*\|[^|]*`billing_approvals`/);
  });

  it("ships an additive migration for tenant-scoped billing legal entities", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const legalEntityDirectory = migrationDirectories.find((name) => /billing_legal_entities/.test(name));
    assert.ok(legalEntityDirectory, "a billing legal entities migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${legalEntityDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing legal entities migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const legalEntityModel = schema.match(/model BillingLegalEntity \{[\s\S]*?\n\}/)?.[0] ?? "";
    const billingOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `billing-service` |")) ?? "";

    assert.match(legalEntityModel, /model BillingLegalEntity/);
    assert.match(legalEntityModel, /legalEntityId\s+String\s+@map\("legal_entity_id"\)/);
    assert.match(legalEntityModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(legalEntityModel, /legalName\s+String\s+@map\("legal_name"\)/);
    assert.match(legalEntityModel, /registrationNumber\s+String\s+@map\("registration_number"\)/);
    assert.match(legalEntityModel, /taxId\s+String\s+@map\("tax_id"\)/);
    assert.match(legalEntityModel, /vatId\s+String\?\s+@map\("vat_id"\)/);
    assert.match(legalEntityModel, /addressLine1\s+String\s+@map\("address_line_1"\)/);
    assert.match(legalEntityModel, /addressLine2\s+String\?\s+@map\("address_line_2"\)/);
    assert.match(legalEntityModel, /city\s+String/);
    assert.match(legalEntityModel, /region\s+String/);
    assert.match(legalEntityModel, /postalCode\s+String\s+@map\("postal_code"\)/);
    assert.match(legalEntityModel, /country\s+String/);
    assert.match(legalEntityModel, /status\s+String/);
    assert.match(legalEntityModel, /auditEvents\s+Json\s+@default\("\[\]"\)\s+@map\("audit_events"\)/);
    assert.match(legalEntityModel, /traceId\s+String\s+@map\("trace_id"\)/);
    assert.match(legalEntityModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(legalEntityModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(legalEntityModel, /@@id\(\[tenantId, legalEntityId\], map: "billing_legal_entities_pkey"\)/);
    assert.match(legalEntityModel, /@@unique\(\[tenantId, registrationNumber\], map: "billing_legal_entities_tenant_registration_number_key"\)/);
    assert.match(legalEntityModel, /@@index\(\[tenantId, status, updatedAt\], map: "billing_legal_entities_tenant_status_updated_idx"\)/);
    assert.match(legalEntityModel, /@@index\(\[tenantId, country, status\], map: "billing_legal_entities_tenant_country_status_idx"\)/);
    assert.match(legalEntityModel, /@@index\(\[tenantId, legalName\], map: "billing_legal_entities_tenant_legal_name_idx"\)/);
    assert.match(legalEntityModel, /@@map\("billing_legal_entities"\)/);
    assert.doesNotMatch(legalEntityModel, /raw|secret/i);
    assert.match(sql, /CREATE TABLE "billing_legal_entities"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"legal_entity_id" TEXT NOT NULL/);
    assert.match(sql, /"legal_name" TEXT NOT NULL/);
    assert.match(sql, /"registration_number" TEXT NOT NULL/);
    assert.match(sql, /"tax_id" TEXT NOT NULL/);
    assert.match(sql, /"vat_id" TEXT/);
    assert.match(sql, /"address_line_1" TEXT NOT NULL/);
    assert.match(sql, /"address_line_2" TEXT/);
    assert.match(sql, /"city" TEXT NOT NULL/);
    assert.match(sql, /"region" TEXT NOT NULL/);
    assert.match(sql, /"postal_code" TEXT NOT NULL/);
    assert.match(sql, /"country" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"trace_id" TEXT NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "billing_legal_entities_pkey" PRIMARY KEY \("tenant_id", "legal_entity_id"\)/);
    assert.match(sql, /CONSTRAINT "billing_legal_entities_status_check" CHECK \("status" IN \('active', 'archived', 'pending_review'\)\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_legal_entities_tenant_registration_number_key" ON "billing_legal_entities"\("tenant_id", "registration_number"\)/);
    assert.match(sql, /CREATE INDEX "billing_legal_entities_tenant_status_updated_idx" ON "billing_legal_entities"\("tenant_id", "status", "updated_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_legal_entities_tenant_country_status_idx" ON "billing_legal_entities"\("tenant_id", "country", "status"\)/);
    assert.match(sql, /CREATE INDEX "billing_legal_entities_tenant_legal_name_idx" ON "billing_legal_entities"\("tenant_id", "legal_name"\)/);
    assert.match(sql, /ALTER TABLE "billing_legal_entities" ADD CONSTRAINT "billing_legal_entities_tenant_id_fkey"/);
    assert.doesNotMatch(sql, /raw|secret|document/i);
    assert.match(billingOwnershipRow, /\|\s*`billing-service`\s*\|[^|]*\|[^|]*`billing_legal_entities`/);
  });

  it("ships an additive migration for billing legal entity audit events", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const auditDirectory = migrationDirectories.find((name) => /billing_legal_entity_audit_events/.test(name));
    assert.ok(auditDirectory, "a billing legal entity audit events migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${auditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing legal entity audit events migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "billing_legal_entities"/);
    assert.match(sql, /ADD COLUMN "audit_events" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it("ships an additive migration for tenant-scoped billing tax document metadata", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const taxDocumentDirectory = migrationDirectories.find((name) => /billing_tax_documents/.test(name));
    assert.ok(taxDocumentDirectory, "a billing tax documents migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${taxDocumentDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing tax documents migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const taxDocumentModel = schema.match(/model BillingTaxDocument \{[\s\S]*?\n\}/)?.[0] ?? "";
    const billingOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `billing-service` |")) ?? "";

    assert.match(taxDocumentModel, /model BillingTaxDocument/);
    assert.match(taxDocumentModel, /documentId\s+String\s+@map\("document_id"\)/);
    assert.match(taxDocumentModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(taxDocumentModel, /legalEntityId\s+String\s+@map\("legal_entity_id"\)/);
    assert.match(taxDocumentModel, /documentType\s+String\s+@map\("document_type"\)/);
    assert.match(taxDocumentModel, /fileName\s+String\s+@map\("file_name"\)/);
    assert.match(taxDocumentModel, /mimeType\s+String\s+@map\("mime_type"\)/);
    assert.match(taxDocumentModel, /requestFingerprint\s+String\s+@map\("request_fingerprint"\)/);
    assert.match(taxDocumentModel, /sha256\s+String/);
    assert.match(taxDocumentModel, /status\s+String/);
    assert.match(taxDocumentModel, /storageLocator\s+String\s+@map\("storage_locator"\)/);
    assert.match(taxDocumentModel, /uploadedBy\s+String\s+@map\("uploaded_by"\)/);
    assert.match(taxDocumentModel, /uploadedByName\s+String\s+@map\("uploaded_by_name"\)/);
    assert.match(taxDocumentModel, /traceId\s+String\s+@map\("trace_id"\)/);
    assert.match(taxDocumentModel, /auditEvents\s+Json\s+@default\("\[\]"\)\s+@map\("audit_events"\)/);
    assert.match(taxDocumentModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(taxDocumentModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(taxDocumentModel, /@@id\(\[tenantId, documentId\], map: "billing_tax_documents_pkey"\)/);
    assert.match(taxDocumentModel, /@@unique\(\[tenantId, requestFingerprint\], map: "billing_tax_documents_tenant_request_fingerprint_key"\)/);
    assert.match(taxDocumentModel, /@@index\(\[tenantId, legalEntityId, status, updatedAt\], map: "billing_tax_docs_tenant_entity_status_updated_idx"\)/);
    assert.match(taxDocumentModel, /@@index\(\[tenantId, documentType, status\], map: "billing_tax_docs_tenant_type_status_idx"\)/);
    assert.match(taxDocumentModel, /@@index\(\[tenantId, sha256\], map: "billing_tax_docs_tenant_sha256_idx"\)/);
    assert.match(taxDocumentModel, /@@map\("billing_tax_documents"\)/);
    assert.doesNotMatch(taxDocumentModel, /raw|secret/i);
    assert.match(sql, /CREATE TABLE "billing_tax_documents"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"document_id" TEXT NOT NULL/);
    assert.match(sql, /"legal_entity_id" TEXT NOT NULL/);
    assert.match(sql, /"document_type" TEXT NOT NULL/);
    assert.match(sql, /"file_name" TEXT NOT NULL/);
    assert.match(sql, /"mime_type" TEXT NOT NULL/);
    assert.match(sql, /"request_fingerprint" TEXT NOT NULL/);
    assert.match(sql, /"sha256" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"storage_locator" TEXT NOT NULL/);
    assert.match(sql, /"uploaded_by" TEXT NOT NULL/);
    assert.match(sql, /"uploaded_by_name" TEXT NOT NULL/);
    assert.match(sql, /"trace_id" TEXT NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "billing_tax_documents_pkey" PRIMARY KEY \("tenant_id", "document_id"\)/);
    assert.match(sql, /CONSTRAINT "billing_tax_documents_status_check" CHECK \("status" IN \('approved', 'archived', 'pending_review', 'rejected'\)\)/);
    assert.match(sql, /CONSTRAINT "billing_tax_documents_document_type_check" CHECK \("document_type" IN \('bank_statement', 'tax_residency_certificate', 'vat_certificate'\)\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "billing_tax_documents_tenant_request_fingerprint_key" ON "billing_tax_documents"\("tenant_id", "request_fingerprint"\)/);
    assert.match(sql, /CREATE INDEX "billing_tax_docs_tenant_entity_status_updated_idx" ON "billing_tax_documents"\("tenant_id", "legal_entity_id", "status", "updated_at"\)/);
    assert.match(sql, /CREATE INDEX "billing_tax_docs_tenant_type_status_idx" ON "billing_tax_documents"\("tenant_id", "document_type", "status"\)/);
    assert.match(sql, /CREATE INDEX "billing_tax_docs_tenant_sha256_idx" ON "billing_tax_documents"\("tenant_id", "sha256"\)/);
    assert.match(sql, /ALTER TABLE "billing_tax_documents" ADD CONSTRAINT "billing_tax_documents_tenant_id_fkey"/);
    assert.match(sql, /ALTER TABLE "billing_tax_documents" ADD CONSTRAINT "billing_tax_documents_legal_entity_fkey"/);
    assert.doesNotMatch(sql, /raw|secret/i);
    assert.match(billingOwnershipRow, /\|\s*`billing-service`\s*\|[^|]*\|[^|]*`billing_tax_documents`/);
  });

  it("ships an additive migration for billing tax document audit events", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const auditDirectory = migrationDirectories.find((name) => /billing_tax_document_audit_events/.test(name));
    assert.ok(auditDirectory, "a billing tax document audit event migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${auditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing tax document audit event migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "billing_tax_documents"/);
    assert.match(sql, /ADD COLUMN "audit_events" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it("ships an additive migration for billing provider sync audit event history", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const auditDirectory = migrationDirectories.find((name) => /billing_provider_sync_audit_events/.test(name));
    assert.ok(auditDirectory, "a billing provider sync audit event migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${auditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing provider sync audit event migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "billing_provider_sync_events"/);
    assert.match(sql, /ADD COLUMN "audit_events" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it("ships an additive migration for invoice-only billing provider events", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const invoiceOptionalDirectory = migrationDirectories.find((name) => /billing_invoice_optional_subscription/.test(name));
    assert.ok(invoiceOptionalDirectory, "a billing invoice optional subscription migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${invoiceOptionalDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing invoice optional subscription migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "billing_invoices" ALTER COLUMN "subscription_id" DROP NOT NULL/);
    assert.match(sql, /ON DELETE SET NULL ON UPDATE CASCADE/);
  });

  it("ships an additive migration for billing sync worker leases", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const billingWorkerDirectory = migrationDirectories.find((name) => /billing_sync_job_worker/.test(name));
    assert.ok(billingWorkerDirectory, "a billing sync job worker migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${billingWorkerDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "billing sync job worker migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "billing_sync_jobs" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /ALTER TABLE "billing_sync_jobs" ADD COLUMN "last_error" TEXT/);
    assert.match(sql, /ALTER TABLE "billing_sync_jobs" ADD COLUMN "locked_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /ALTER TABLE "billing_sync_jobs" ADD COLUMN "published_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /CREATE INDEX "billing_sync_jobs_status_queue_locked_at_idx"/);
  });

  it("ships an additive migration for worker retry backoff and dead-letter fields", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const retryDirectory = migrationDirectories.find((name) => /worker_retry_dead_letter/.test(name));
    assert.ok(retryDirectory, "a worker retry/dead-letter migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${retryDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "worker retry/dead-letter migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "outbox_events" ADD COLUMN "next_attempt_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /ALTER TABLE "outbox_events" ADD COLUMN "dead_lettered_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /ALTER TABLE "billing_sync_jobs" ADD COLUMN "next_attempt_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /ALTER TABLE "billing_sync_jobs" ADD COLUMN "dead_lettered_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /CREATE INDEX "outbox_events_status_queue_next_attempt_at_idx"/);
    assert.match(sql, /CREATE INDEX "billing_sync_jobs_status_queue_next_attempt_at_idx"/);
  });

  it("ships an additive migration for immutable dead-letter replay audit event history", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const replayAuditDirectory = migrationDirectories.find((name) => /dead_letter_replay_audit_events/.test(name));
    assert.ok(replayAuditDirectory, "a dead-letter replay audit event migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${replayAuditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "dead-letter replay audit event migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /ALTER TABLE "outbox_events"/);
    assert.match(sql, /ADD COLUMN "dead_letter_replay_audit_events" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    assert.match(sql, /ALTER TABLE "billing_sync_jobs"/);
  });

  it("ships an additive migration for persistent conversation storage", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const conversationDirectory = migrationDirectories.find((name) => /conversation_storage/.test(name));
    assert.ok(conversationDirectory, "a conversation storage migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${conversationDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "conversation storage migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "conversations"/);
    assert.match(sql, /CREATE TABLE "conversation_messages"/);
    assert.match(sql, /CREATE TABLE "conversation_inbound_events"/);
    assert.match(sql, /CREATE TABLE "conversation_realtime_events"/);
    assert.match(sql, /CREATE UNIQUE INDEX "conversation_inbound_events_channel_event_id_key"/);
    assert.match(sql, /CREATE INDEX "conversation_messages_conversation_id_created_at_idx"/);
    assert.match(sql, /CREATE INDEX "conversation_realtime_events_resource_idx"/);
  });

  it("ships an additive SQL migration for conversation outbound descriptors", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const sql = migrationDirectories
      .filter((name) => name !== "migration_lock.toml")
      .map((name) => readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"))
      .join("\n");

    assert.match(sql, /CREATE TABLE "conversation_outbound_descriptors"/);
    assert.match(sql, /CREATE INDEX "conversation_outbound_descriptors_conversation_created_idx"/);
    assert.match(sql, /CREATE INDEX "conversation_outbound_descriptors_status_channel_created_idx"/);
    assert.match(sql, /CREATE UNIQUE INDEX "conversation_outbound_descriptors_idempotency_key_key"/);
    assert.match(sql, /ADD COLUMN "request_fingerprint" TEXT/);
  });

  it("ships an additive SQL migration for channel delivery receipts", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const receiptsDirectory = migrationDirectories.find((name) => /channel_delivery_receipts/.test(name));
    assert.ok(receiptsDirectory, "a channel delivery receipt migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${receiptsDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "channel delivery receipt migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "channel_delivery_receipts"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"conversation_id" TEXT NOT NULL/);
    assert.match(sql, /"message_id" TEXT NOT NULL/);
    assert.match(sql, /"provider_event_id" TEXT NOT NULL/);
    assert.match(sql, /CREATE UNIQUE INDEX "channel_delivery_receipts_idempotency_key_key"/);
    assert.match(sql, /CREATE UNIQUE INDEX "channel_delivery_receipts_provider_event_key"/);
    assert.match(sql, /CREATE INDEX "channel_delivery_receipts_message_received_at_idx"/);
    assert.match(sql, /CREATE INDEX "channel_delivery_receipts_tenant_channel_received_at_idx"/);
    assert.match(sql, /FOREIGN KEY \("conversation_id"\) REFERENCES "conversations"\("id"\)/);
  });

  it("ships an additive migration for workspace file metadata storage", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const workspaceDirectory = migrationDirectories.find((name) => /workspace_file_metadata/.test(name));
    assert.ok(workspaceDirectory, "a workspace file metadata migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${workspaceDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "workspace file metadata migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    assert.match(sql, /CREATE TABLE "workspace_files"/);
    assert.match(sql, /"file_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"object_key" TEXT NOT NULL/);
    assert.match(sql, /"scan_state" TEXT NOT NULL/);
    assert.match(sql, /"size_bytes" BIGINT NOT NULL/);
    assert.match(sql, /CREATE INDEX "workspace_files_storage_scan_state_idx"/);
    assert.match(sql, /CREATE INDEX "workspace_files_tenant_file_id_idx"/);
  });

  it("ships an additive migration for workspace file scan result metadata", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const sql = migrationDirectories
      .filter((name) => name !== "migration_lock.toml")
      .map((name) => readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"))
      .join("\n");

    assert.match(sql, /ADD COLUMN "scan_checked_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /ADD COLUMN "scan_reason" TEXT/);
    assert.match(sql, /ADD COLUMN "scan_verdict" TEXT/);
    assert.match(sql, /ADD COLUMN "scanner" TEXT/);
    assert.match(sql, /CREATE INDEX "workspace_files_scan_verdict_checked_at_idx"/);
  });

  it("ships an additive migration for workspace file scan result idempotency", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const sql = migrationDirectories
      .filter((name) => name !== "migration_lock.toml")
      .map((name) => readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"))
      .join("\n");

    assert.match(sql, /CREATE TABLE "workspace_file_scan_result_idempotency"/);
    assert.match(sql, /"key" TEXT NOT NULL/);
    assert.match(sql, /"fingerprint" TEXT NOT NULL/);
    assert.match(sql, /"result" JSONB NOT NULL/);
    assert.match(sql, /CREATE UNIQUE INDEX "workspace_file_scan_result_idempotency_key_key"/);
    assert.match(sql, /CREATE INDEX "workspace_file_scan_result_idem_file_created_idx"/);
  });

  it("ships an additive migration for client profile identity rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const profileDirectory = migrationDirectories.find((name) => /client_profile_identities/.test(name));
    assert.ok(profileDirectory, "a client profile identity migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${profileDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "client profile identity migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model ClientProfile/);
    assert.match(schema, /@@map\("client_profiles"\)/);
    assert.match(sql, /CREATE TABLE "client_profiles"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"source_profile_id" TEXT NOT NULL/);
    assert.match(sql, /"phone" TEXT NOT NULL/);
    assert.match(sql, /"previous" JSONB NOT NULL/);
    assert.match(sql, /CREATE UNIQUE INDEX "client_profiles_tenant_source_profile_key"/);
    assert.match(sql, /CREATE INDEX "client_profiles_tenant_id_updated_at_idx"/);
    assert.match(sql, /CREATE INDEX "client_profiles_tenant_id_channel_idx"/);
    assert.match(ownershipMap, /\|\s*`client-profile-service`[\s\S]*`client_profiles`/);
  });

  it("ships an additive migration for client merge graph edge rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const mergeDirectory = migrationDirectories.find((name) => /client_merge_graph/.test(name));
    assert.ok(mergeDirectory, "a client merge graph migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${mergeDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "client merge graph migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const allClientMergeSql = migrationDirectories
      .filter((name) => /client_merge/.test(name))
      .map((name) => readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"))
      .join("\n");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model ClientMergeEvent/);
    assert.match(schema, /@@map\("client_merge_events"\)/);
    assert.match(sql, /CREATE TABLE "client_merge_events"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"primary_profile_id" TEXT NOT NULL/);
    assert.match(sql, /"candidate_profile_id" TEXT/);
    assert.match(sql, /"detached_profile_id" TEXT/);
    assert.match(sql, /"merge_graph_edge" TEXT NOT NULL/);
    assert.match(sql, /"immutable" BOOLEAN NOT NULL DEFAULT true/);
    assert.match(schema, /@@unique\(\[tenantId, action, mergeGraphEdge\], map: "client_merge_events_tenant_action_edge_key"\)/);
    assert.match(sql, /CREATE INDEX "client_merge_events_tenant_primary_idx"/);
    assert.match(sql, /CREATE INDEX "client_merge_events_tenant_candidate_idx"/);
    assert.match(sql, /CREATE INDEX "client_merge_events_tenant_detached_idx"/);
    assert.match(allClientMergeSql, /CREATE UNIQUE INDEX "client_merge_events_tenant_action_edge_key"/);
    assert.match(ownershipMap, /\|\s*`client-profile-service`[\s\S]*`client_merge_events`/);
  });

  it("ships an additive migration for client merge conflict rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const conflictDirectory = migrationDirectories.find((name) => /client_merge_conflicts/.test(name));
    assert.ok(conflictDirectory, "a client merge conflict migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${conflictDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "client merge conflict migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model ClientMergeConflict/);
    assert.match(schema, /@@map\("client_merge_conflicts"\)/);
    assert.match(sql, /CREATE TABLE "client_merge_conflicts"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"primary_profile_id" TEXT NOT NULL/);
    assert.match(sql, /"candidate_profile_id" TEXT NOT NULL/);
    assert.match(sql, /"conflicting_fields" TEXT\[\] NOT NULL/);
    assert.match(sql, /"state" TEXT NOT NULL/);
    assert.match(sql, /CREATE INDEX "client_merge_conflicts_tenant_state_idx"/);
    assert.match(sql, /CREATE INDEX "client_merge_conflicts_tenant_primary_idx"/);
    assert.match(ownershipMap, /\|\s*`client-profile-service`[\s\S]*`client_merge_conflicts`/);
  });

  it("ships an additive migration for template record rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const templateDirectory = migrationDirectories.find((name) => /template_records/.test(name));
    assert.ok(templateDirectory, "a template records migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${templateDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "template records migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model TemplateRecord/);
    assert.match(schema, /@@map\("template_records"\)/);
    assert.match(sql, /CREATE TABLE "template_records"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"channel" TEXT NOT NULL/);
    assert.match(sql, /"scope" TEXT NOT NULL/);
    assert.match(sql, /"title" TEXT NOT NULL/);
    assert.match(sql, /"text" TEXT NOT NULL/);
    assert.match(sql, /"topic" TEXT NOT NULL/);
    assert.match(sql, /"usage" INTEGER NOT NULL/);
    assert.match(sql, /"version" INTEGER NOT NULL/);
    assert.match(sql, /"audit_id" TEXT/);
    assert.match(sql, /CREATE INDEX "template_records_tenant_scope_updated_at_idx"/);
    assert.match(sql, /CREATE INDEX "template_records_tenant_channel_topic_idx"/);
    assert.match(ownershipMap, /\|\s*`template-knowledge-service`[\s\S]*`template_records`/);
  });

  it("ships an additive migration for template version rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const versionDirectory = migrationDirectories.find((name) => /template_versions/.test(name));
    assert.ok(versionDirectory, "a template versions migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${versionDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "template versions migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model TemplateVersion/);
    assert.match(schema, /@@map\("template_versions"\)/);
    assert.match(sql, /CREATE TABLE "template_versions"/);
    assert.match(sql, /"template_id" TEXT NOT NULL/);
    assert.match(sql, /"channel" TEXT NOT NULL/);
    assert.match(sql, /"scope" TEXT NOT NULL/);
    assert.match(sql, /"title" TEXT NOT NULL/);
    assert.match(sql, /"text" TEXT NOT NULL/);
    assert.match(sql, /"topic" TEXT NOT NULL/);
    assert.match(sql, /"usage" INTEGER NOT NULL/);
    assert.match(sql, /"version" INTEGER NOT NULL/);
    assert.match(sql, /FOREIGN KEY \("template_id"\) REFERENCES "template_records"\("id"\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "template_versions_template_id_version_key"/);
    assert.match(sql, /CREATE INDEX "template_versions_template_id_version_idx"/);
    assert.match(ownershipMap, /\|\s*`template-knowledge-service`[\s\S]*`template_versions`/);
  });

  it("ships an additive migration for template audit rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const auditDirectory = migrationDirectories.find((name) => /template_audit/.test(name));
    assert.ok(auditDirectory, "a template audit migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${auditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "template audit migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model TemplateAuditEvent/);
    assert.match(schema, /@@map\("template_audit_events"\)/);
    assert.match(sql, /CREATE TABLE "template_audit_events"/);
    assert.match(sql, /"template_id" TEXT NOT NULL/);
    assert.match(sql, /"action" TEXT NOT NULL/);
    assert.match(sql, /"immutable" BOOLEAN NOT NULL DEFAULT true/);
    assert.match(sql, /"reason" TEXT/);
    assert.match(sql, /"timestamp" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /FOREIGN KEY \("template_id"\) REFERENCES "template_records"\("id"\)/);
    assert.match(sql, /CREATE INDEX "template_audit_events_template_id_timestamp_idx"/);
    assert.match(sql, /CREATE INDEX "template_audit_events_action_timestamp_idx"/);
    assert.match(ownershipMap, /\|\s*`template-knowledge-service`[\s\S]*`template_audit_events`/);
  });

  it("ships an additive migration for knowledge article rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const articleDirectory = migrationDirectories.find((name) => /knowledge_articles/.test(name));
    assert.ok(articleDirectory, "a knowledge articles migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${articleDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "knowledge articles migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model KnowledgeArticle/);
    assert.match(schema, /@@map\("knowledge_articles"\)/);
    assert.match(sql, /CREATE TABLE "knowledge_articles"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL DEFAULT 'tenant-volga'/);
    assert.match(sql, /"title" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"category" TEXT NOT NULL/);
    assert.match(sql, /"topics" TEXT\[\] NOT NULL/);
    assert.match(sql, /"channels" TEXT\[\] NOT NULL/);
    assert.match(sql, /"visibility" TEXT NOT NULL/);
    assert.match(sql, /"version" TEXT NOT NULL/);
    assert.match(sql, /"helpful_rate" INTEGER NOT NULL/);
    assert.match(sql, /"attachments" JSONB NOT NULL/);
    assert.match(sql, /"versions" JSONB NOT NULL/);
    assert.match(sql, /"approval_history" JSONB NOT NULL/);
    assert.match(sql, /CREATE INDEX "knowledge_articles_tenant_visibility_status_updated_at_idx"/);
    assert.match(sql, /CREATE INDEX "knowledge_articles_tenant_category_idx"/);
    assert.match(ownershipMap, /\|\s*`template-knowledge-service`[\s\S]*`knowledge_articles`/);
  });

  it("ships an additive migration for knowledge draft version rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const draftDirectory = migrationDirectories.find((name) => /knowledge_draft_versions/.test(name));
    assert.ok(draftDirectory, "a knowledge draft versions migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${draftDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "knowledge draft versions migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model KnowledgeDraftVersion/);
    assert.match(schema, /@@map\("knowledge_draft_versions"\)/);
    assert.match(sql, /CREATE TABLE "knowledge_draft_versions"/);
    assert.match(sql, /"article_id" TEXT NOT NULL/);
    assert.match(sql, /"author" TEXT NOT NULL/);
    assert.match(sql, /"body" TEXT NOT NULL/);
    assert.match(sql, /"changes" TEXT/);
    assert.match(sql, /"label" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /FOREIGN KEY \("article_id"\) REFERENCES "knowledge_articles"\("id"\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "knowledge_draft_versions_article_id_id_key"/);
    assert.match(sql, /CREATE INDEX "knowledge_draft_versions_article_id_updated_at_idx"/);
    assert.match(sql, /CREATE INDEX "knowledge_draft_versions_article_id_status_idx"/);
    assert.match(ownershipMap, /\|\s*`template-knowledge-service`[\s\S]*`knowledge_draft_versions`/);
  });

  it("ships an additive migration for knowledge approval decision rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const approvalDirectory = migrationDirectories.find((name) => /knowledge_approval_decisions/.test(name));
    assert.ok(approvalDirectory, "a knowledge approval decisions migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${approvalDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "knowledge approval decisions migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model KnowledgeApprovalDecision/);
    assert.match(schema, /@@map\("knowledge_approval_decisions"\)/);
    assert.match(sql, /CREATE TABLE "knowledge_approval_decisions"/);
    assert.match(sql, /"article_id" TEXT NOT NULL/);
    assert.match(sql, /"draft_id" TEXT/);
    assert.match(sql, /"action" TEXT NOT NULL/);
    assert.match(sql, /"actor" TEXT NOT NULL/);
    assert.match(sql, /"immutable" BOOLEAN NOT NULL DEFAULT true/);
    assert.match(sql, /"reason" TEXT/);
    assert.match(sql, /"timestamp" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /FOREIGN KEY \("article_id"\) REFERENCES "knowledge_articles"\("id"\)/);
    assert.match(sql, /FOREIGN KEY \("draft_id"\) REFERENCES "knowledge_draft_versions"\("id"\)/);
    assert.match(sql, /CREATE INDEX "knowledge_approval_decisions_article_id_timestamp_idx"/);
    assert.match(sql, /CREATE INDEX "knowledge_approval_decisions_draft_id_timestamp_idx"/);
    assert.match(sql, /CREATE INDEX "knowledge_approval_decisions_action_timestamp_idx"/);
    assert.match(ownershipMap, /\|\s*`template-knowledge-service`[\s\S]*`knowledge_approval_decisions`/);
  });

  it("ships an additive migration for routing rule rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const routingDirectory = migrationDirectories.find((name) => /routing_rules/.test(name));
    assert.ok(routingDirectory, "a routing rules migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${routingDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "routing rules migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model RoutingRule/);
    assert.match(schema, /@@map\("routing_rules"\)/);
    assert.match(sql, /CREATE TABLE "routing_rules"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"channel" TEXT NOT NULL/);
    assert.match(sql, /"limit_mode" TEXT NOT NULL/);
    assert.match(sql, /"wait_threshold_seconds" INTEGER NOT NULL/);
    assert.match(sql, /"priority_strategy" TEXT NOT NULL/);
    assert.match(sql, /CREATE UNIQUE INDEX "routing_rules_tenant_channel_key"/);
    assert.match(sql, /CREATE INDEX "routing_rules_tenant_enabled_idx"/);
    assert.match(ownershipMap, /\|\s*`routing-sla-service`[\s\S]*`routing_rules`/);
  });

  it("ships an additive migration for queue membership rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const membershipDirectory = migrationDirectories.find((name) => /queue_membership/.test(name) || /routing_rules_queue_membership/.test(name));
    assert.ok(membershipDirectory, "a queue membership migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${membershipDirectory}/migration.sql`, import.meta.url);
    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model QueueMembership/);
    assert.match(schema, /@@map\("queue_memberships"\)/);
    assert.match(sql, /CREATE TABLE "queue_memberships"/);
    assert.match(sql, /"queue_id" TEXT NOT NULL/);
    assert.match(sql, /"operator_id" TEXT NOT NULL/);
    assert.match(sql, /"role" TEXT NOT NULL/);
    assert.match(sql, /CREATE UNIQUE INDEX "queue_memberships_tenant_queue_operator_key"/);
    assert.match(sql, /CREATE INDEX "queue_memberships_tenant_queue_active_idx"/);
    assert.match(ownershipMap, /\|\s*`routing-sla-service`[\s\S]*`queue_memberships`/);
  });

  it("ships an additive migration for operator capacity rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const capacityDirectory = migrationDirectories.find((name) => /operator_capacity/.test(name) || /routing_rules_queue_membership/.test(name));
    assert.ok(capacityDirectory, "an operator capacity migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${capacityDirectory}/migration.sql`, import.meta.url);
    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model OperatorCapacity/);
    assert.match(schema, /@@map\("operator_capacities"\)/);
    assert.match(sql, /CREATE TABLE "operator_capacities"/);
    assert.match(sql, /"chat_limit" INTEGER NOT NULL/);
    assert.match(sql, /"override_allowed" BOOLEAN NOT NULL DEFAULT false/);
    assert.match(sql, /CREATE UNIQUE INDEX "operator_capacities_tenant_operator_channel_key"/);
    assert.match(sql, /CREATE INDEX "operator_capacities_tenant_operator_idx"/);
    assert.match(ownershipMap, /\|\s*`routing-sla-service`[\s\S]*`operator_capacities`/);
  });

  it("ships an additive migration for routing analytics rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const analyticsDirectory = migrationDirectories.find((name) => /routing_analytics/.test(name));
    assert.ok(analyticsDirectory, "a routing analytics migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${analyticsDirectory}/migration.sql`, import.meta.url);
    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model RoutingAnalyticsRow/);
    assert.match(schema, /@@map\("routing_analytics_rows"\)/);
    assert.match(sql, /CREATE TABLE "routing_analytics_rows"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"event_kind" TEXT NOT NULL/);
    assert.match(sql, /"conversation_id" TEXT NOT NULL/);
    assert.match(sql, /"occurred_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /CREATE INDEX "routing_analytics_rows_tenant_event_kind_idx"/);
    assert.match(sql, /CREATE INDEX "routing_analytics_rows_tenant_occurred_at_idx"/);
    assert.match(ownershipMap, /\|\s*`routing-sla-service`[\s\S]*`routing_analytics_rows`/);
  });

  it("ships an additive migration for report metric definition rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const metricDirectory = migrationDirectories.find((name) => /metric_definitions/.test(name));
    assert.ok(metricDirectory, "a metric definitions migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${metricDirectory}/migration.sql`, import.meta.url);
    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model MetricDefinition/);
    assert.match(schema, /@@map\("metric_definitions"\)/);
    assert.match(sql, /CREATE TABLE "metric_definitions"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"key" TEXT NOT NULL/);
    assert.match(sql, /"name" TEXT NOT NULL/);
    assert.match(sql, /"source" TEXT NOT NULL/);
    assert.match(sql, /"unit" TEXT NOT NULL/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /CREATE UNIQUE INDEX "metric_definitions_tenant_key_key"/);
    assert.match(sql, /CREATE INDEX "metric_definitions_tenant_source_idx"/);
    assert.match(ownershipMap, /\|\s*`report-service`[\s\S]*`metric_definitions`/);
  });

  it("ships an additive migration for report metric version rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const versionDirectory = migrationDirectories.find((name) => /metric_versions/.test(name));
    assert.ok(versionDirectory, "a metric versions migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${versionDirectory}/migration.sql`, import.meta.url);
    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model MetricVersion/);
    assert.match(schema, /@@map\("metric_versions"\)/);
    assert.match(sql, /CREATE TABLE "metric_versions"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"definition_id" TEXT NOT NULL/);
    assert.match(sql, /"version" TEXT NOT NULL/);
    assert.match(sql, /"query_key" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /FOREIGN KEY \("definition_id", "tenant_id"\) REFERENCES "metric_definitions"\("id", "tenant_id"\)/);
    assert.match(sql, /CONSTRAINT "metric_versions_status_check" CHECK \("status" IN \('active', 'draft', 'retired'\)\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "metric_versions_tenant_definition_version_key"/);
    assert.match(sql, /CREATE INDEX "metric_versions_tenant_definition_status_idx"/);
    assert.match(sql, /CREATE UNIQUE INDEX "metric_definitions_id_tenant_key"/);
    assert.match(ownershipMap, /\|\s*`report-service`[\s\S]*`metric_versions`/);
  });

  it("ships an additive migration for report metric tenant override rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const overrideDirectory = migrationDirectories.find((name) => /metric_tenant_overrides/.test(name));
    assert.ok(overrideDirectory, "a metric tenant overrides migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${overrideDirectory}/migration.sql`, import.meta.url);
    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model MetricTenantOverride/);
    assert.match(schema, /@@map\("metric_tenant_overrides"\)/);
    assert.match(schema, /definition\s+MetricDefinition\s+@relation\(fields: \[definitionId, tenantId\], references: \[id, tenantId\], onDelete: Cascade\)/);
    assert.match(schema, /metricVersion\s+MetricVersion\s+@relation\(fields: \[metricVersionId, tenantId\], references: \[id, tenantId\], onDelete: Cascade\)/);
    assert.match(sql, /CREATE TABLE "metric_tenant_overrides"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"definition_id" TEXT NOT NULL/);
    assert.match(sql, /"metric_version_id" TEXT NOT NULL/);
    assert.match(sql, /"reason" TEXT NOT NULL/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /FOREIGN KEY \("definition_id", "tenant_id"\) REFERENCES "metric_definitions"\("id", "tenant_id"\)/);
    assert.match(sql, /FOREIGN KEY \("metric_version_id", "tenant_id"\) REFERENCES "metric_versions"\("id", "tenant_id"\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "metric_tenant_overrides_tenant_definition_key"/);
    assert.match(sql, /CREATE INDEX "metric_tenant_overrides_tenant_version_idx"/);
    assert.match(sql, /CREATE UNIQUE INDEX "metric_versions_id_tenant_key"/);
    assert.match(ownershipMap, /\|\s*`report-service`[\s\S]*`metric_tenant_overrides`/);
  });

  it("ships an additive migration for saved report template rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const templateDirectory = migrationDirectories.find((name) => /saved_report_templates/.test(name));
    const exportJobDirectory = migrationDirectories.find((name) => /report_export_jobs/.test(name));
    const idempotencyDirectory = migrationDirectories.find((name) => /report_idempotency_keys/.test(name));
    assert.ok(templateDirectory, "a saved report templates migration directory is required");
    assert.ok(exportJobDirectory, "a report export jobs migration directory is required");
    assert.ok(idempotencyDirectory, "a report idempotency keys migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${templateDirectory}/migration.sql`, import.meta.url);
    const exportJobSqlUrl = new URL(`../prisma/migrations/${exportJobDirectory}/migration.sql`, import.meta.url);
    const idempotencySqlUrl = new URL(`../prisma/migrations/${idempotencyDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "saved report templates migration.sql must exist");
    assert.equal(existsSync(exportJobSqlUrl), true, "report export jobs migration.sql must exist");
    assert.equal(existsSync(idempotencySqlUrl), true, "report idempotency keys migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const exportJobSql = readFileSync(exportJobSqlUrl, "utf8");
    const idempotencySql = readFileSync(idempotencySqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model SavedReportTemplate/);
    assert.match(schema, /model ReportExportJob/);
    assert.match(schema, /model ReportIdempotencyKey/);
    assert.match(schema, /@@map\("saved_report_templates"\)/);
    assert.match(schema, /@@map\("report_export_jobs"\)/);
    assert.match(schema, /@@map\("report_idempotency_keys"\)/);
    assert.match(sql, /CREATE TABLE "saved_report_templates"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"owner_user_id" TEXT NOT NULL/);
    assert.match(sql, /"report_type" TEXT NOT NULL/);
    assert.match(sql, /"columns" TEXT\[\] NOT NULL/);
    assert.match(sql, /"filters" JSONB NOT NULL/);
    assert.match(sql, /"visibility_scope" TEXT NOT NULL/);
    assert.match(sql, /"visibility_roles" TEXT\[\] NOT NULL/);
    assert.match(sql, /"visibility_permissions" TEXT\[\] NOT NULL/);
    assert.match(sql, /CONSTRAINT "saved_report_templates_visibility_scope_check" CHECK \("visibility_scope" IN \('private', 'roles', 'permissions'\)\)/);
    assert.match(sql, /CREATE INDEX "saved_report_templates_tenant_visibility_idx"/);
    assert.match(sql, /CREATE INDEX "saved_report_templates_tenant_owner_idx"/);
    assert.match(sql, /CREATE INDEX "saved_report_templates_tenant_report_type_idx"/);
    assert.match(exportJobSql, /CREATE TABLE "report_export_jobs"/);
    assert.match(exportJobSql, /"status_key" TEXT NOT NULL/);
    assert.match(exportJobSql, /"columns" TEXT\[\] NOT NULL/);
    assert.match(exportJobSql, /"filters" JSONB NOT NULL/);
    assert.match(exportJobSql, /CONSTRAINT "report_export_jobs_format_check" CHECK \("format" IN \('CSV', 'PDF', 'XLSX'\)\)/);
    assert.match(exportJobSql, /CONSTRAINT "report_export_jobs_status_key_check" CHECK \("status_key" IN \('error', 'expired', 'queued', 'ready', 'running'\)\)/);
    assert.match(exportJobSql, /CREATE INDEX "report_export_jobs_queue_status_created_idx"/);
    assert.match(idempotencySql, /CREATE TABLE "report_idempotency_keys"/);
    assert.match(idempotencySql, /CONSTRAINT "report_idempotency_keys_pkey" PRIMARY KEY \("key"\)/);
    assert.match(idempotencySql, /CREATE INDEX "report_idempotency_keys_job_idx"/);
    assert.match(ownershipMap, /\|\s*`report-service`[\s\S]*`saved_report_templates`/);
    assert.match(ownershipMap, /\|\s*`report-service`[\s\S]*`report_export_jobs`/);
    assert.match(ownershipMap, /\|\s*`report-service`[\s\S]*`report_idempotency_keys`/);
  });

  it("ships an additive migration for hashed public API key rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const publicApiKeyDirectory = migrationDirectories.find((name) => /public_api_keys/.test(name));
    assert.ok(publicApiKeyDirectory, "a public API key migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${publicApiKeyDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "public API key migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model PublicApiKey/);
    assert.match(schema, /@@map\("public_api_keys"\)/);
    assert.match(schema, /secretHash\s+String\s+@unique\(map: "public_api_keys_secret_hash_key"\)\s+@map\("secret_hash"\)/);
    assert.match(schema, /keyPreview\s+String\s+@map\("key_preview"\)/);
    assert.match(sql, /CREATE TABLE "public_api_keys"/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"environment" TEXT NOT NULL/);
    assert.match(sql, /"secret_hash" TEXT NOT NULL/);
    assert.match(sql, /"key_preview" TEXT NOT NULL/);
    assert.match(sql, /"scopes" TEXT\[\] NOT NULL/);
    assert.doesNotMatch(sql, /raw_secret|raw_key/i);
    assert.match(sql, /CREATE UNIQUE INDEX "public_api_keys_secret_hash_key"/);
    assert.match(sql, /CREATE INDEX "public_api_keys_tenant_environment_status_idx"/);
    assert.match(sql, /CONSTRAINT "public_api_keys_environment_check" CHECK \("environment" IN \('production', 'stage'\)\)/);
    assert.match(sql, /CONSTRAINT "public_api_keys_status_check" CHECK \("status" IN \('active', 'revoked'\)\)/);
    assert.match(ownershipMap, /\|\s*`integration-webhook-service`[\s\S]*`public_api_keys`/);
  });

  it("ships an additive migration for public API key reveal-state rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const revealStateDirectory = migrationDirectories.find((name) => /public_api_key_reveal_states/.test(name));
    assert.ok(revealStateDirectory, "a public API key reveal-state migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${revealStateDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "public API key reveal-state migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model PublicApiKeyRevealState/);
    assert.match(schema, /@@map\("public_api_key_reveal_states"\)/);
    assert.match(schema, /keyPreview\s+String\s+@map\("key_preview"\)/);
    assert.match(schema, /consumedAt\s+DateTime\?\s+@map\("consumed_at"\)/);
    assert.match(sql, /CREATE TABLE "public_api_key_reveal_states"/);
    assert.match(sql, /"key_id" TEXT NOT NULL/);
    assert.match(sql, /"key_preview" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"consumed_at" TIMESTAMPTZ\(3\)/);
    assert.doesNotMatch(sql, /raw_secret|raw_key|secret_hash/i);
    assert.match(sql, /CONSTRAINT "public_api_key_reveal_states_pkey" PRIMARY KEY \("key_id"\)/);
    assert.match(sql, /CONSTRAINT "public_api_key_reveal_states_status_check" CHECK \("status" IN \('available', 'consumed'\)\)/);
    assert.match(sql, /FOREIGN KEY \("key_id"\) REFERENCES "public_api_keys"\("key_id"\) ON DELETE CASCADE ON UPDATE CASCADE/);
    assert.match(sql, /CREATE INDEX "public_api_key_reveal_states_status_created_idx"/);
    assert.match(sql, /CREATE INDEX "public_api_key_reveal_states_consumed_at_idx"/);
    assert.match(ownershipMap, /\|\s*`integration-webhook-service`[\s\S]*`public_api_key_reveal_states`/);
  });

  it("ships an additive migration for public API key rotation audit rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const rotationAuditDirectory = migrationDirectories.find((name) => /public_api_key_rotation_audit/.test(name));
    assert.ok(rotationAuditDirectory, "a public API key rotation audit migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${rotationAuditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "public API key rotation audit migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model PublicApiKeyRotationAuditEvent/);
    assert.match(schema, /@@map\("public_api_key_rotation_audit_events"\)/);
    assert.match(schema, /auditId\s+String\s+@id\s+@map\("audit_id"\)/);
    assert.match(schema, /rotationId\s+String\s+@map\("rotation_id"\)/);
    assert.match(schema, /keyPreview\s+String\s+@map\("key_preview"\)/);
    assert.match(sql, /CREATE TABLE "public_api_key_rotation_audit_events"/);
    assert.match(sql, /"audit_id" TEXT NOT NULL/);
    assert.match(sql, /"rotation_id" TEXT NOT NULL/);
    assert.match(sql, /"key_id" TEXT NOT NULL/);
    assert.match(sql, /"key_preview" TEXT NOT NULL/);
    assert.match(sql, /"immutable" BOOLEAN NOT NULL DEFAULT true/);
    assert.doesNotMatch(sql, /raw_secret|raw_key|secret_hash/i);
    assert.match(sql, /CONSTRAINT "public_api_key_rotation_audit_events_pkey" PRIMARY KEY \("audit_id"\)/);
    assert.match(sql, /CONSTRAINT "public_api_key_rotation_audit_events_immutable_check" CHECK \("immutable" = true\)/);
    assert.match(sql, /FOREIGN KEY \("key_id"\) REFERENCES "public_api_keys"\("key_id"\) ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(sql, /CREATE INDEX "public_api_key_rotation_audit_events_key_at_idx"/);
    assert.match(sql, /CREATE INDEX "public_api_key_rotation_audit_events_rotation_idx"/);
    assert.match(sql, /CREATE INDEX "public_api_key_rotation_audit_events_action_at_idx"/);
    assert.match(ownershipMap, /\|\s*`integration-webhook-service`[\s\S]*`public_api_key_rotation_audit_events`/);
  });

  it("ships an additive migration for signed webhook replay nonce rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const nonceDirectory = migrationDirectories.find((name) => /signed_webhook_replay_nonces/.test(name));
    assert.ok(nonceDirectory, "a signed webhook replay nonce migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${nonceDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "signed webhook replay nonce migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model SignedWebhookReplayNonce/);
    assert.match(schema, /endpointId\s+String\s+@map\("endpoint_id"\)/);
    assert.match(schema, /firstSeenAt\s+DateTime\s+@map\("first_seen_at"\)/);
    assert.match(schema, /@@id\(\[endpointId, nonce\], map: "signed_webhook_replay_nonces_pkey"\)/);
    assert.match(schema, /@@map\("signed_webhook_replay_nonces"\)/);
    assert.match(sql, /CREATE TABLE "signed_webhook_replay_nonces"/);
    assert.match(sql, /"endpoint_id" TEXT NOT NULL/);
    assert.match(sql, /"nonce" TEXT NOT NULL/);
    assert.match(sql, /"first_seen_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.doesNotMatch(sql, /signature|secret|payload/i);
    assert.match(sql, /CONSTRAINT "signed_webhook_replay_nonces_pkey" PRIMARY KEY \("endpoint_id", "nonce"\)/);
    assert.match(sql, /CREATE INDEX "signed_webhook_replay_nonces_endpoint_first_seen_idx"/);
    assert.match(ownershipMap, /\|\s*`integration-webhook-service`[\s\S]*`signed_webhook_replay_nonces`/);
  });

  it("ships an additive migration for webhook delivery journal rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const journalDirectory = migrationDirectories.find((name) => /webhook_delivery_journal/.test(name));
    assert.ok(journalDirectory, "a webhook delivery journal migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${journalDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "webhook delivery journal migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");

    assert.match(schema, /model WebhookDeliveryJournalEntry/);
    assert.match(schema, /deliveryId\s+String\s+@id\s+@map\("delivery_id"\)/);
    assert.match(schema, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(schema, /endpointId\s+String\s+@map\("endpoint_id"\)/);
    assert.match(schema, /eventType\s+String\s+@map\("event_type"\)/);
    assert.match(schema, /idempotencyKey\s+String\s+@unique\(map: "webhook_delivery_journal_idempotency_key_key"\)\s+@map\("idempotency_key"\)/);
    assert.match(schema, /payloadRef\s+String\s+@map\("payload_ref"\)/);
    assert.match(schema, /status\s+String/);
    assert.match(schema, /lastAttemptAt\s+DateTime\?\s+@map\("last_attempt_at"\)/);
    assert.match(schema, /lockedAt\s+DateTime\?\s+@map\("locked_at"\)/);
    assert.match(schema, /nextAttemptAt\s+DateTime\?\s+@map\("next_attempt_at"\)/);
    assert.match(schema, /deadLetteredAt\s+DateTime\?\s+@map\("dead_lettered_at"\)/);
    assert.match(schema, /lastError\s+Json\?\s+@map\("last_error"\)/);
    assert.match(schema, /@@index\(\[status, queue, lockedAt\], map: "webhook_delivery_journal_status_queue_locked_idx"\)/);
    assert.match(schema, /@@index\(\[status, deadLetteredAt\], map: "webhook_delivery_journal_dead_letter_status_idx"\)/);
    assert.match(schema, /@@map\("webhook_delivery_journal"\)/);
    assert.match(sql, /CREATE TABLE "webhook_delivery_journal"/);
    assert.match(sql, /"delivery_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"endpoint_id" TEXT NOT NULL/);
    assert.match(sql, /"event_type" TEXT NOT NULL/);
    assert.match(sql, /"idempotency_key" TEXT NOT NULL/);
    assert.match(sql, /"payload_ref" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"target_url" TEXT NOT NULL/);
    assert.match(sql, /"attempts" INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /"last_attempt_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /"last_error" JSONB/);
    assert.match(sql, /"locked_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /"next_attempt_at" TIMESTAMPTZ\(3\)/);
    assert.match(sql, /"dead_lettered_at" TIMESTAMPTZ\(3\)/);
    assert.doesNotMatch(sql, /secret|signature|authorization/i);
    assert.match(sql, /CONSTRAINT "webhook_delivery_journal_pkey" PRIMARY KEY \("delivery_id"\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "webhook_delivery_journal_idempotency_key_key"/);
    assert.match(sql, /CREATE INDEX "webhook_delivery_journal_status_queue_next_attempt_idx"/);
    assert.match(sql, /CREATE INDEX "webhook_delivery_journal_status_queue_locked_idx"/);
    assert.match(sql, /CREATE INDEX "webhook_delivery_journal_tenant_endpoint_status_idx"/);
    assert.match(sql, /CREATE INDEX "webhook_delivery_journal_dead_letter_status_idx"/);
    assert.match(ownershipMap, /\|\s*`integration-webhook-service`[\s\S]*`webhook_delivery_journal`/);
  });

  it("ships an additive migration for bot scenario rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const scenarioDirectory = migrationDirectories.find((name) => /bot_scenarios/.test(name));
    assert.ok(scenarioDirectory, "a bot scenarios migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${scenarioDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "bot scenarios migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const botScenarioModel = schema.match(/model BotScenario \{[\s\S]*?\n\}/)?.[0] ?? "";
    const automationBotOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `automation-bot-service` |")) ?? "";

    assert.match(botScenarioModel, /model BotScenario/);
    assert.match(botScenarioModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(botScenarioModel, /schemaVersion\s+String\s+@map\("schema_version"\)/);
    assert.match(botScenarioModel, /channels\s+String\[\]\s+@default\(\[\]\)/);
    assert.match(botScenarioModel, /flowNodes\s+Json\s+@map\("flow_nodes"\)/);
    assert.match(botScenarioModel, /flowEdges\s+Json\s+@map\("flow_edges"\)/);
    assert.match(botScenarioModel, /@@unique\(\[tenantId, id\], map: "bot_scenarios_tenant_id_key"\)/);
    assert.match(botScenarioModel, /@@index\(\[tenantId, status\], map: "bot_scenarios_tenant_status_idx"\)/);
    assert.match(botScenarioModel, /@@map\("bot_scenarios"\)/);
    assert.match(sql, /CREATE TABLE "bot_scenarios"/);
    assert.match(sql, /"id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"schema_version" TEXT NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"channels" TEXT\[\] DEFAULT ARRAY\[\]::TEXT\[\]/);
    assert.match(sql, /"flow_nodes" JSONB NOT NULL/);
    assert.match(sql, /"flow_edges" JSONB NOT NULL/);
    assert.match(sql, /CONSTRAINT "bot_scenarios_pkey" PRIMARY KEY \("id"\)/);
    assert.match(sql, /CONSTRAINT "bot_scenarios_status_check" CHECK \("status" IN \('draft', 'published', 'archived'\)\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "bot_scenarios_tenant_id_key"/);
    assert.match(sql, /CREATE INDEX "bot_scenarios_tenant_status_idx"/);
    assert.match(sql, /CREATE INDEX "bot_scenarios_tenant_updated_at_idx"/);
    assert.match(automationBotOwnershipRow, /\|\s*`automation-bot-service`\s*\|[^|]*\|[^|]*`bot_scenarios`/);
  });

  it("ships an additive migration for bot scenario version rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const versionDirectory = migrationDirectories.find((name) => /bot_scenario_versions/.test(name));
    assert.ok(versionDirectory, "a bot scenario versions migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${versionDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "bot scenario versions migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const botScenarioModel = schema.match(/model BotScenario \{[\s\S]*?\n\}/)?.[0] ?? "";
    const botScenarioVersionModel = schema.match(/model BotScenarioVersion \{[\s\S]*?\n\}/)?.[0] ?? "";
    const automationBotOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `automation-bot-service` |")) ?? "";

    assert.match(botScenarioModel, /versions\s+BotScenarioVersion\[\]/);
    assert.match(botScenarioVersionModel, /model BotScenarioVersion/);
    assert.match(botScenarioVersionModel, /versionId\s+String\s+@id\s+@map\("version_id"\)/);
    assert.match(botScenarioVersionModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(botScenarioVersionModel, /scenarioId\s+String\s+@map\("scenario_id"\)/);
    assert.match(botScenarioVersionModel, /runtimeVersion\s+String\?\s+@map\("runtime_version"\)/);
    assert.match(botScenarioVersionModel, /status\s+String/);
    assert.match(botScenarioVersionModel, /flowNodes\s+Json\s+@map\("flow_nodes"\)/);
    assert.match(botScenarioVersionModel, /flowEdges\s+Json\s+@map\("flow_edges"\)/);
    assert.match(botScenarioVersionModel, /scenario\s+BotScenario\s+@relation\(fields: \[tenantId, scenarioId\], references: \[tenantId, id\], onDelete: Cascade\)/);
    assert.match(botScenarioVersionModel, /@@unique\(\[tenantId, scenarioId, versionId\], map: "bot_scenario_versions_tenant_scenario_version_key"\)/);
    assert.match(botScenarioVersionModel, /@@index\(\[tenantId, scenarioId, status\], map: "bot_scenario_versions_tenant_scenario_status_idx"\)/);
    assert.match(botScenarioVersionModel, /@@index\(\[tenantId, createdAt\], map: "bot_scenario_versions_tenant_created_at_idx"\)/);
    assert.match(botScenarioVersionModel, /@@map\("bot_scenario_versions"\)/);
    assert.match(sql, /CREATE TABLE "bot_scenario_versions"/);
    assert.match(sql, /"version_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"scenario_id" TEXT NOT NULL/);
    assert.match(sql, /"runtime_version" TEXT/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"flow_nodes" JSONB NOT NULL/);
    assert.match(sql, /"flow_edges" JSONB NOT NULL/);
    assert.match(sql, /CONSTRAINT "bot_scenario_versions_pkey" PRIMARY KEY \("version_id"\)/);
    assert.match(sql, /CONSTRAINT "bot_scenario_versions_status_check" CHECK \("status" IN \('draft', 'published', 'retired'\)\)/);
    assert.match(sql, /FOREIGN KEY \("tenant_id", "scenario_id"\) REFERENCES "bot_scenarios"\("tenant_id", "id"\) ON DELETE CASCADE ON UPDATE CASCADE/);
    assert.match(sql, /CREATE UNIQUE INDEX "bot_scenario_versions_tenant_scenario_version_key" ON "bot_scenario_versions"\("tenant_id", "scenario_id", "version_id"\)/);
    assert.match(sql, /CREATE INDEX "bot_scenario_versions_tenant_scenario_status_idx" ON "bot_scenario_versions"\("tenant_id", "scenario_id", "status"\)/);
    assert.match(sql, /CREATE INDEX "bot_scenario_versions_tenant_created_at_idx" ON "bot_scenario_versions"\("tenant_id", "created_at"\)/);
    assert.match(automationBotOwnershipRow, /\|\s*`automation-bot-service`\s*\|[^|]*\|[^|]*`bot_scenario_versions`/);
  });

  it("ships an additive migration for immutable bot publish audit rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const auditDirectory = migrationDirectories.find((name) => /bot_publish_audit_events/.test(name));
    assert.ok(auditDirectory, "a bot publish audit events migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${auditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "bot publish audit events migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const botScenarioVersionModel = schema.match(/model BotScenarioVersion \{[\s\S]*?\n\}/)?.[0] ?? "";
    const botPublishAuditModel = schema.match(/model BotPublishAuditEvent \{[\s\S]*?\n\}/)?.[0] ?? "";
    const automationBotOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `automation-bot-service` |")) ?? "";

    assert.match(botScenarioVersionModel, /publishAuditEvents\s+BotPublishAuditEvent\[\]/);
    assert.match(botPublishAuditModel, /model BotPublishAuditEvent/);
    assert.match(botPublishAuditModel, /auditId\s+String\s+@id\s+@map\("audit_id"\)/);
    assert.match(botPublishAuditModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(botPublishAuditModel, /scenarioId\s+String\s+@map\("scenario_id"\)/);
    assert.match(botPublishAuditModel, /versionId\s+String\s+@map\("version_id"\)/);
    assert.match(botPublishAuditModel, /action\s+String/);
    assert.match(botPublishAuditModel, /actor\s+String/);
    assert.match(botPublishAuditModel, /idempotencyKey\s+String\s+@unique\(map: "bot_publish_audit_events_idempotency_key_key"\)\s+@map\("idempotency_key"\)/);
    assert.match(botPublishAuditModel, /runtimeVersion\s+String\s+@map\("runtime_version"\)/);
    assert.match(botPublishAuditModel, /immutable\s+Boolean\s+@default\(true\)/);
    assert.match(botPublishAuditModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/);
    assert.match(botPublishAuditModel, /version\s+BotScenarioVersion\s+@relation\(fields: \[tenantId, scenarioId, versionId\], references: \[tenantId, scenarioId, versionId\], onDelete: Restrict\)/);
    assert.match(botPublishAuditModel, /@@index\(\[tenantId, scenarioId, createdAt\], map: "bot_publish_audit_events_tenant_scenario_created_idx"\)/);
    assert.match(botPublishAuditModel, /@@map\("bot_publish_audit_events"\)/);
    assert.match(sql, /CREATE TABLE "bot_publish_audit_events"/);
    assert.match(sql, /"audit_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"scenario_id" TEXT NOT NULL/);
    assert.match(sql, /"version_id" TEXT NOT NULL/);
    assert.match(sql, /"action" TEXT NOT NULL/);
    assert.match(sql, /"actor" TEXT NOT NULL/);
    assert.match(sql, /"idempotency_key" TEXT NOT NULL/);
    assert.match(sql, /"runtime_version" TEXT NOT NULL/);
    assert.match(sql, /"immutable" BOOLEAN NOT NULL DEFAULT true/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "bot_publish_audit_events_pkey" PRIMARY KEY \("audit_id"\)/);
    assert.match(sql, /CONSTRAINT "bot_publish_audit_events_immutable_check" CHECK \("immutable" = true\)/);
    assert.match(sql, /FOREIGN KEY \("tenant_id", "scenario_id", "version_id"\) REFERENCES "bot_scenario_versions"\("tenant_id", "scenario_id", "version_id"\) ON DELETE RESTRICT ON UPDATE CASCADE/);
    assert.match(sql, /CREATE UNIQUE INDEX "bot_publish_audit_events_idempotency_key_key" ON "bot_publish_audit_events"\("idempotency_key"\)/);
    assert.match(sql, /CREATE INDEX "bot_publish_audit_events_tenant_scenario_created_idx" ON "bot_publish_audit_events"\("tenant_id", "scenario_id", "created_at"\)/);
    assert.match(automationBotOwnershipRow, /\|\s*`automation-bot-service`\s*\|[^|]*\|[^|]*`bot_publish_audit_events`/);
  });

  it("ships an additive migration for proactive execution window rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const windowDirectory = migrationDirectories.find((name) => /proactive_execution_windows/.test(name));
    assert.ok(windowDirectory, "a proactive execution windows migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${windowDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "proactive execution windows migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const proactiveWindowModel = schema.match(/model ProactiveExecutionWindow \{[\s\S]*?\n\}/)?.[0] ?? "";
    const automationBotOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `automation-bot-service` |")) ?? "";

    assert.match(proactiveWindowModel, /model ProactiveExecutionWindow/);
    assert.match(proactiveWindowModel, /windowId\s+String\s+@id\s+@map\("window_id"\)/);
    assert.match(proactiveWindowModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(proactiveWindowModel, /ruleId\s+String\s+@map\("rule_id"\)/);
    assert.match(proactiveWindowModel, /timezone\s+String/);
    assert.match(proactiveWindowModel, /startsAt\s+String\s+@map\("starts_at"\)/);
    assert.match(proactiveWindowModel, /endsAt\s+String\s+@map\("ends_at"\)/);
    assert.match(proactiveWindowModel, /daysOfWeek\s+Int\[\]\s+@default\(\[\]\)\s+@map\("days_of_week"\)/);
    assert.match(proactiveWindowModel, /active\s+Boolean\s+@default\(true\)/);
    assert.match(proactiveWindowModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/);
    assert.match(proactiveWindowModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)/);
    assert.match(proactiveWindowModel, /@@unique\(\[tenantId, ruleId, windowId\], map: "proactive_execution_windows_tenant_rule_window_key"\)/);
    assert.match(proactiveWindowModel, /@@index\(\[tenantId, ruleId, active\], map: "proactive_execution_windows_tenant_rule_active_idx"\)/);
    assert.match(proactiveWindowModel, /@@index\(\[tenantId, active\], map: "proactive_execution_windows_tenant_active_idx"\)/);
    assert.match(proactiveWindowModel, /@@map\("proactive_execution_windows"\)/);
    assert.match(sql, /CREATE TABLE "proactive_execution_windows"/);
    assert.match(sql, /"window_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"rule_id" TEXT NOT NULL/);
    assert.match(sql, /"timezone" TEXT NOT NULL/);
    assert.match(sql, /"starts_at" TEXT NOT NULL/);
    assert.match(sql, /"ends_at" TEXT NOT NULL/);
    assert.match(sql, /"days_of_week" INTEGER\[\] DEFAULT ARRAY\[\]::INTEGER\[\]/);
    assert.match(sql, /"active" BOOLEAN NOT NULL DEFAULT true/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "proactive_execution_windows_pkey" PRIMARY KEY \("window_id"\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "proactive_execution_windows_tenant_rule_window_key" ON "proactive_execution_windows"\("tenant_id", "rule_id", "window_id"\)/);
    assert.match(sql, /CREATE INDEX "proactive_execution_windows_tenant_rule_active_idx" ON "proactive_execution_windows"\("tenant_id", "rule_id", "active"\)/);
    assert.match(sql, /CREATE INDEX "proactive_execution_windows_tenant_active_idx" ON "proactive_execution_windows"\("tenant_id", "active"\)/);
    assert.match(automationBotOwnershipRow, /\|\s*`automation-bot-service`\s*\|[^|]*\|[^|]*`proactive_execution_windows`/);
  });

  it("ships an additive migration for proactive frequency cap rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const capDirectory = migrationDirectories.find((name) => /proactive_frequency_caps/.test(name));
    assert.ok(capDirectory, "a proactive frequency caps migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${capDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "proactive frequency caps migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const proactiveCapModel = schema.match(/model ProactiveFrequencyCap \{[\s\S]*?\n\}/)?.[0] ?? "";
    const automationBotOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `automation-bot-service` |")) ?? "";

    assert.match(proactiveCapModel, /model ProactiveFrequencyCap/);
    assert.match(proactiveCapModel, /capId\s+String\s+@id\s+@map\("cap_id"\)/);
    assert.match(proactiveCapModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(proactiveCapModel, /ruleId\s+String\s+@map\("rule_id"\)/);
    assert.match(proactiveCapModel, /period\s+String/);
    assert.match(proactiveCapModel, /limit\s+Int/);
    assert.match(proactiveCapModel, /used\s+Int\s+@default\(0\)/);
    assert.match(proactiveCapModel, /resetAt\s+DateTime\s+@map\("reset_at"\)/);
    assert.match(proactiveCapModel, /active\s+Boolean\s+@default\(true\)/);
    assert.match(proactiveCapModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/);
    assert.match(proactiveCapModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)/);
    assert.match(proactiveCapModel, /@@unique\(\[tenantId, ruleId, capId\], map: "proactive_frequency_caps_tenant_rule_cap_key"\)/);
    assert.match(proactiveCapModel, /@@index\(\[tenantId, ruleId, active\], map: "proactive_frequency_caps_tenant_rule_active_idx"\)/);
    assert.match(proactiveCapModel, /@@index\(\[tenantId, active, resetAt\], map: "proactive_frequency_caps_tenant_active_reset_idx"\)/);
    assert.match(proactiveCapModel, /@@map\("proactive_frequency_caps"\)/);
    assert.match(sql, /CREATE TABLE "proactive_frequency_caps"/);
    assert.match(sql, /"cap_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"rule_id" TEXT NOT NULL/);
    assert.match(sql, /"period" TEXT NOT NULL/);
    assert.match(sql, /"limit" INTEGER NOT NULL/);
    assert.match(sql, /"used" INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /"reset_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"active" BOOLEAN NOT NULL DEFAULT true/);
    assert.match(sql, /CONSTRAINT "proactive_frequency_caps_pkey" PRIMARY KEY \("cap_id"\)/);
    assert.match(sql, /CONSTRAINT "proactive_frequency_caps_period_check" CHECK \("period" IN \('hour', 'day', 'week'\)\)/);
    assert.match(sql, /CONSTRAINT "proactive_frequency_caps_limit_check" CHECK \("limit" >= 0\)/);
    assert.match(sql, /CONSTRAINT "proactive_frequency_caps_used_check" CHECK \("used" >= 0\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "proactive_frequency_caps_tenant_rule_cap_key" ON "proactive_frequency_caps"\("tenant_id", "rule_id", "cap_id"\)/);
    assert.match(sql, /CREATE INDEX "proactive_frequency_caps_tenant_rule_active_idx" ON "proactive_frequency_caps"\("tenant_id", "rule_id", "active"\)/);
    assert.match(sql, /CREATE INDEX "proactive_frequency_caps_tenant_active_reset_idx" ON "proactive_frequency_caps"\("tenant_id", "active", "reset_at"\)/);
    assert.match(automationBotOwnershipRow, /\|\s*`automation-bot-service`\s*\|[^|]*\|[^|]*`proactive_frequency_caps`/);
  });

  it("ships an additive migration for proactive experiment assignment rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const assignmentDirectory = migrationDirectories.find((name) => /proactive_experiment_assignments/.test(name));
    assert.ok(assignmentDirectory, "a proactive experiment assignments migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${assignmentDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "proactive experiment assignments migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const proactiveAssignmentModel = schema.match(/model ProactiveExperimentAssignment \{[\s\S]*?\n\}/)?.[0] ?? "";
    const automationBotOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `automation-bot-service` |")) ?? "";

    assert.match(proactiveAssignmentModel, /model ProactiveExperimentAssignment/);
    assert.match(proactiveAssignmentModel, /assignmentId\s+String\s+@id\s+@map\("assignment_id"\)/);
    assert.match(proactiveAssignmentModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(proactiveAssignmentModel, /ruleId\s+String\s+@map\("rule_id"\)/);
    assert.match(proactiveAssignmentModel, /experimentId\s+String\s+@map\("experiment_id"\)/);
    assert.match(proactiveAssignmentModel, /subjectId\s+String\s+@map\("subject_id"\)/);
    assert.match(proactiveAssignmentModel, /variant\s+String/);
    assert.match(proactiveAssignmentModel, /assignedAt\s+DateTime\s+@map\("assigned_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(proactiveAssignmentModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(proactiveAssignmentModel, /updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(proactiveAssignmentModel, /@@unique\(\[tenantId, ruleId, subjectId\], map: "proactive_experiment_assignments_tenant_rule_subject_key"\)/);
    assert.match(proactiveAssignmentModel, /@@index\(\[tenantId, ruleId, variant\], map: "proactive_experiment_assignments_tenant_rule_variant_idx"\)/);
    assert.match(proactiveAssignmentModel, /@@index\(\[tenantId, subjectId\], map: "proactive_experiment_assignments_tenant_subject_idx"\)/);
    assert.match(proactiveAssignmentModel, /@@map\("proactive_experiment_assignments"\)/);
    assert.match(sql, /CREATE TABLE "proactive_experiment_assignments"/);
    assert.match(sql, /"assignment_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"rule_id" TEXT NOT NULL/);
    assert.match(sql, /"experiment_id" TEXT NOT NULL/);
    assert.match(sql, /"subject_id" TEXT NOT NULL/);
    assert.match(sql, /"variant" TEXT NOT NULL/);
    assert.match(sql, /"assigned_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "proactive_experiment_assignments_pkey" PRIMARY KEY \("assignment_id"\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "proactive_experiment_assignments_tenant_rule_subject_key" ON "proactive_experiment_assignments"\("tenant_id", "rule_id", "subject_id"\)/);
    assert.match(sql, /CREATE INDEX "proactive_experiment_assignments_tenant_rule_variant_idx" ON "proactive_experiment_assignments"\("tenant_id", "rule_id", "variant"\)/);
    assert.match(sql, /CREATE INDEX "proactive_experiment_assignments_tenant_subject_idx" ON "proactive_experiment_assignments"\("tenant_id", "subject_id"\)/);
    assert.match(automationBotOwnershipRow, /\|\s*`automation-bot-service`\s*\|[^|]*\|[^|]*`proactive_experiment_assignments`/);
  });

  it("ships an additive migration for tenant-scoped quality rating rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const ratingDirectory = migrationDirectories.find((name) => /quality_ratings/.test(name));
    assert.ok(ratingDirectory, "a quality ratings migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${ratingDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "quality ratings migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const qualityRatingModel = schema.match(/model QualityRating \{[\s\S]*?\n\}/)?.[0] ?? "";
    const qualityOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `quality-ai-service` |")) ?? "";

    assert.match(qualityRatingModel, /model QualityRating/);
    assert.match(qualityRatingModel, /ratingId\s+String\s+@map\("rating_id"\)/);
    assert.match(qualityRatingModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(qualityRatingModel, /conversationId\s+String\s+@map\("conversation_id"\)/);
    assert.match(qualityRatingModel, /channel\s+String/);
    assert.match(qualityRatingModel, /operator\s+String/);
    assert.match(qualityRatingModel, /clientId\s+String\?\s+@map\("client_id"\)/);
    assert.match(qualityRatingModel, /topic\s+String\?/);
    assert.match(qualityRatingModel, /scale\s+String/);
    assert.match(qualityRatingModel, /score\s+Float\?/);
    assert.match(qualityRatingModel, /auditId\s+String\s+@map\("audit_id"\)/);
    assert.match(qualityRatingModel, /realtimeEventId\s+String\s+@map\("realtime_event_id"\)/);
    assert.match(qualityRatingModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(qualityRatingModel, /@@id\(\[tenantId, ratingId\], map: "quality_ratings_pkey"\)/);
    assert.match(qualityRatingModel, /@@unique\(\[tenantId, auditId\], map: "quality_ratings_tenant_audit_key"\)/);
    assert.match(qualityRatingModel, /@@unique\(\[tenantId, realtimeEventId\], map: "quality_ratings_tenant_realtime_event_key"\)/);
    assert.match(qualityRatingModel, /@@index\(\[tenantId, conversationId, createdAt\], map: "quality_ratings_tenant_conversation_created_idx"\)/);
    assert.match(qualityRatingModel, /@@index\(\[tenantId, channel, operator, createdAt\], map: "quality_ratings_tenant_channel_operator_created_idx"\)/);
    assert.match(qualityRatingModel, /@@map\("quality_ratings"\)/);
    assert.match(sql, /CREATE TABLE "quality_ratings"/);
    assert.match(sql, /"rating_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"conversation_id" TEXT NOT NULL/);
    assert.match(sql, /"channel" TEXT NOT NULL/);
    assert.match(sql, /"operator" TEXT NOT NULL/);
    assert.match(sql, /"client_id" TEXT/);
    assert.match(sql, /"topic" TEXT/);
    assert.match(sql, /"scale" TEXT NOT NULL/);
    assert.match(sql, /"score" DOUBLE PRECISION/);
    assert.match(sql, /"audit_id" TEXT NOT NULL/);
    assert.match(sql, /"realtime_event_id" TEXT NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "quality_ratings_pkey" PRIMARY KEY \("tenant_id", "rating_id"\)/);
    assert.match(sql, /CONSTRAINT "quality_ratings_scale_check" CHECK \("scale" IN \('CSAT', 'CSI', 'QA'\)\)/);
    assert.match(sql, /CONSTRAINT "quality_ratings_score_check" CHECK \("score" IS NULL OR "score" >= 0\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "quality_ratings_tenant_audit_key" ON "quality_ratings"\("tenant_id", "audit_id"\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "quality_ratings_tenant_realtime_event_key" ON "quality_ratings"\("tenant_id", "realtime_event_id"\)/);
    assert.match(sql, /CREATE INDEX "quality_ratings_tenant_conversation_created_idx" ON "quality_ratings"\("tenant_id", "conversation_id", "created_at"\)/);
    assert.match(sql, /CREATE INDEX "quality_ratings_tenant_channel_operator_created_idx" ON "quality_ratings"\("tenant_id", "channel", "operator", "created_at"\)/);
    assert.match(qualityOwnershipRow, /\|\s*`quality-ai-service`\s*\|[^|]*\|[^|]*`quality_ratings`/);
  });

  it("ships an additive migration for tenant-scoped manual QA review rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const reviewDirectory = migrationDirectories.find((name) => /manual_qa_reviews/.test(name));
    assert.ok(reviewDirectory, "a manual QA reviews migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${reviewDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "manual QA reviews migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const manualReviewModel = schema.match(/model ManualQaReview \{[\s\S]*?\n\}/)?.[0] ?? "";
    const qualityOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `quality-ai-service` |")) ?? "";

    assert.match(manualReviewModel, /model ManualQaReview/);
    assert.match(manualReviewModel, /reviewId\s+String\s+@map\("review_id"\)/);
    assert.match(manualReviewModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(manualReviewModel, /conversationId\s+String\s+@map\("conversation_id"\)/);
    assert.match(manualReviewModel, /reviewer\s+String/);
    assert.match(manualReviewModel, /score\s+Float\?/);
    assert.match(manualReviewModel, /criteria\s+Json\s+@default\("\{\}"\)/);
    assert.match(manualReviewModel, /overrideReason\s+String\?\s+@map\("override_reason"\)/);
    assert.match(manualReviewModel, /auditId\s+String\s+@map\("audit_id"\)/);
    assert.match(manualReviewModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(manualReviewModel, /@@id\(\[tenantId, reviewId\], map: "manual_qa_reviews_pkey"\)/);
    assert.match(manualReviewModel, /@@unique\(\[tenantId, auditId\], map: "manual_qa_reviews_tenant_audit_key"\)/);
    assert.match(manualReviewModel, /@@index\(\[tenantId, conversationId, createdAt\], map: "manual_qa_reviews_tenant_conversation_created_idx"\)/);
    assert.match(manualReviewModel, /@@index\(\[tenantId, reviewer, createdAt\], map: "manual_qa_reviews_tenant_reviewer_created_idx"\)/);
    assert.match(manualReviewModel, /@@map\("manual_qa_reviews"\)/);
    assert.match(sql, /CREATE TABLE "manual_qa_reviews"/);
    assert.match(sql, /"review_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"conversation_id" TEXT NOT NULL/);
    assert.match(sql, /"reviewer" TEXT NOT NULL/);
    assert.match(sql, /"score" DOUBLE PRECISION/);
    assert.match(sql, /"criteria" JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /"override_reason" TEXT/);
    assert.match(sql, /"audit_id" TEXT NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "manual_qa_reviews_pkey" PRIMARY KEY \("tenant_id", "review_id"\)/);
    assert.match(sql, /CONSTRAINT "manual_qa_reviews_score_check" CHECK \("score" IS NULL OR "score" >= 0\)/);
    assert.match(sql, /CREATE UNIQUE INDEX "manual_qa_reviews_tenant_audit_key" ON "manual_qa_reviews"\("tenant_id", "audit_id"\)/);
    assert.match(sql, /CREATE INDEX "manual_qa_reviews_tenant_conversation_created_idx" ON "manual_qa_reviews"\("tenant_id", "conversation_id", "created_at"\)/);
    assert.match(sql, /CREATE INDEX "manual_qa_reviews_tenant_reviewer_created_idx" ON "manual_qa_reviews"\("tenant_id", "reviewer", "created_at"\)/);
    assert.match(qualityOwnershipRow, /\|\s*`quality-ai-service`\s*\|[^|]*\|[^|]*`manual_qa_reviews`/);
  });

  it("ships an additive migration for tenant-scoped AI scoring audit rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const auditDirectory = migrationDirectories.find((name) => /ai_scoring_audits/.test(name));
    assert.ok(auditDirectory, "an AI scoring audits migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${auditDirectory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "AI scoring audits migration.sql must exist");

    const sql = readFileSync(sqlUrl, "utf8");
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const auditModel = schema.match(/model AiScoringAudit \{[\s\S]*?\n\}/)?.[0] ?? "";
    const qualityOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `quality-ai-service` |")) ?? "";

    assert.match(auditModel, /model AiScoringAudit/);
    assert.match(auditModel, /auditId\s+String\s+@map\("audit_id"\)/);
    assert.match(auditModel, /tenantId\s+String\s+@map\("tenant_id"\)/);
    assert.match(auditModel, /conversationId\s+String\s+@map\("conversation_id"\)/);
    assert.match(auditModel, /providerId\s+String\s+@map\("provider_id"\)/);
    assert.match(auditModel, /providerResultId\s+String\?\s+@map\("provider_result_id"\)/);
    assert.match(auditModel, /queue\s+String/);
    assert.match(auditModel, /score\s+Float\?/);
    assert.match(auditModel, /status\s+String/);
    assert.match(auditModel, /traceId\s+String\s+@map\("trace_id"\)/);
    assert.match(auditModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(auditModel, /@@id\(\[tenantId, auditId\], map: "ai_scoring_audits_pkey"\)/);
    assert.match(auditModel, /@@index\(\[tenantId, conversationId, createdAt\], map: "ai_scoring_audits_tenant_conversation_created_idx"\)/);
    assert.match(auditModel, /@@index\(\[tenantId, queue, status, createdAt\], map: "ai_scoring_audits_tenant_queue_status_created_idx"\)/);
    assert.match(auditModel, /@@index\(\[tenantId, traceId\], map: "ai_scoring_audits_tenant_trace_idx"\)/);
    assert.match(auditModel, /@@index\(\[tenantId, providerId, providerResultId\], map: "ai_scoring_audits_tenant_provider_result_idx"\)/);
    assert.match(auditModel, /@@map\("ai_scoring_audits"\)/);
    assert.match(sql, /CREATE TABLE "ai_scoring_audits"/);
    assert.match(sql, /"audit_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT NOT NULL/);
    assert.match(sql, /"conversation_id" TEXT NOT NULL/);
    assert.match(sql, /"provider_id" TEXT NOT NULL/);
    assert.match(sql, /"provider_result_id" TEXT/);
    assert.match(sql, /"queue" TEXT NOT NULL/);
    assert.match(sql, /"score" DOUBLE PRECISION/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"trace_id" TEXT NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CONSTRAINT "ai_scoring_audits_pkey" PRIMARY KEY \("tenant_id", "audit_id"\)/);
    assert.match(sql, /CONSTRAINT "ai_scoring_audits_status_check" CHECK \("status" IN \('failed', 'ok'\)\)/);
    assert.match(sql, /CONSTRAINT "ai_scoring_audits_score_check" CHECK \("score" IS NULL OR "score" >= 0\)/);
    assert.match(sql, /CREATE INDEX "ai_scoring_audits_tenant_conversation_created_idx" ON "ai_scoring_audits"\("tenant_id", "conversation_id", "created_at"\)/);
    assert.match(sql, /CREATE INDEX "ai_scoring_audits_tenant_queue_status_created_idx" ON "ai_scoring_audits"\("tenant_id", "queue", "status", "created_at"\)/);
    assert.match(sql, /CREATE INDEX "ai_scoring_audits_tenant_trace_idx" ON "ai_scoring_audits"\("tenant_id", "trace_id"\)/);
    assert.match(sql, /CREATE INDEX "ai_scoring_audits_tenant_provider_result_idx" ON "ai_scoring_audits"\("tenant_id", "provider_id", "provider_result_id"\)/);
    assert.match(qualityOwnershipRow, /\|\s*`quality-ai-service`\s*\|[^|]*\|[^|]*`ai_scoring_audits`/);
  });

  it("ships Prisma schema and ownership for platform telemetry samples", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const directory = migrationDirectories.find((name) => /platform_telemetry_samples/.test(name));
    assert.ok(directory, "a platform telemetry samples migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${directory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "platform telemetry samples migration.sql must exist");

    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const sql = readFileSync(sqlUrl, "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const telemetryModel = schema.match(/model PlatformTelemetrySample \{[\s\S]*?\n\}/)?.[0] ?? "";
    const monitoringOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `platform-monitoring-service` |")) ?? "";

    assert.match(telemetryModel, /model PlatformTelemetrySample/);
    assert.match(telemetryModel, /componentId\s+String\s+@map\("component_id"\)/);
    assert.match(telemetryModel, /tenantId\s+String\?\s+@map\("tenant_id"\)/);
    assert.match(telemetryModel, /metricKey\s+String\s+@map\("metric_key"\)/);
    assert.match(telemetryModel, /sampledAt\s+DateTime\s+@map\("sampled_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(telemetryModel, /source\s+String/);
    assert.match(telemetryModel, /tags\s+Json\s+@default\("\{\}"\)/);
    assert.match(telemetryModel, /unit\s+String/);
    assert.match(telemetryModel, /value\s+Float/);
    assert.match(telemetryModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(telemetryModel, /@@index\(\[componentId, metricKey, sampledAt\], map: "platform_telemetry_samples_component_metric_sampled_idx"\)/);
    assert.match(telemetryModel, /@@index\(\[tenantId, metricKey, sampledAt\], map: "platform_telemetry_samples_tenant_metric_sampled_idx"\)/);
    assert.match(telemetryModel, /@@index\(\[sampledAt\], map: "platform_telemetry_samples_sampled_at_idx"\)/);
    assert.match(telemetryModel, /@@map\("platform_telemetry_samples"\)/);
    assert.match(sql, /CREATE TABLE "platform_telemetry_samples"/);
    assert.match(sql, /"component_id" TEXT NOT NULL/);
    assert.match(sql, /"tenant_id" TEXT/);
    assert.match(sql, /"metric_key" TEXT NOT NULL/);
    assert.match(sql, /"sampled_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"source" TEXT NOT NULL/);
    assert.match(sql, /"tags" JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /"unit" TEXT NOT NULL/);
    assert.match(sql, /"value" DOUBLE PRECISION NOT NULL/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CREATE INDEX "platform_telemetry_samples_component_metric_sampled_idx" ON "platform_telemetry_samples"\("component_id", "metric_key", "sampled_at"\)/);
    assert.match(sql, /CREATE INDEX "platform_telemetry_samples_tenant_metric_sampled_idx" ON "platform_telemetry_samples"\("tenant_id", "metric_key", "sampled_at"\)/);
    assert.match(sql, /CREATE INDEX "platform_telemetry_samples_sampled_at_idx" ON "platform_telemetry_samples"\("sampled_at"\)/);
    assert.match(monitoringOwnershipRow, /\|\s*`platform-monitoring-service`\s*\|[^|]*\|[^|]*`platform_telemetry_samples`/);
  });

  it("ships Prisma schema and ownership for platform health rollups", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const directory = migrationDirectories.find((name) => /platform_health_rollups/.test(name));
    assert.ok(directory, "a platform health rollups migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${directory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "platform health rollups migration.sql must exist");

    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const sql = readFileSync(sqlUrl, "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const rollupModel = schema.match(/model PlatformHealthRollup \{[\s\S]*?\n\}/)?.[0] ?? "";
    const monitoringOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `platform-monitoring-service` |")) ?? "";

    assert.match(rollupModel, /model PlatformHealthRollup/);
    assert.match(rollupModel, /componentId\s+String\s+@map\("component_id"\)/);
    assert.match(rollupModel, /windowStart\s+DateTime\s+@map\("window_start"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(rollupModel, /windowEnd\s+DateTime\s+@map\("window_end"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(rollupModel, /generatedAt\s+DateTime\s+@map\("generated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(rollupModel, /status\s+String/);
    assert.match(rollupModel, /availability\s+Float/);
    assert.match(rollupModel, /errorRate\s+Float\s+@map\("error_rate"\)/);
    assert.match(rollupModel, /latencyP95Ms\s+Int\s+@map\("latency_p95_ms"\)/);
    assert.match(rollupModel, /sampleCount\s+Int\s+@map\("sample_count"\)/);
    assert.match(rollupModel, /incidentIds\s+Json\s+@default\("\[\]"\)\s+@map\("incident_ids"\)/);
    assert.match(rollupModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(rollupModel, /@@index\(\[componentId, windowEnd\], map: "platform_health_rollups_component_window_end_idx"\)/);
    assert.match(rollupModel, /@@index\(\[status, windowEnd\], map: "platform_health_rollups_status_window_end_idx"\)/);
    assert.match(rollupModel, /@@index\(\[windowEnd\], map: "platform_health_rollups_window_end_idx"\)/);
    assert.match(rollupModel, /@@map\("platform_health_rollups"\)/);
    assert.match(sql, /CREATE TABLE "platform_health_rollups"/);
    assert.match(sql, /"component_id" TEXT NOT NULL/);
    assert.match(sql, /"window_start" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"window_end" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"generated_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /"status" TEXT NOT NULL/);
    assert.match(sql, /"availability" DOUBLE PRECISION NOT NULL/);
    assert.match(sql, /"error_rate" DOUBLE PRECISION NOT NULL/);
    assert.match(sql, /"latency_p95_ms" INTEGER NOT NULL/);
    assert.match(sql, /"sample_count" INTEGER NOT NULL/);
    assert.match(sql, /"incident_ids" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /CREATE INDEX "platform_health_rollups_component_window_end_idx" ON "platform_health_rollups"\("component_id", "window_end"\)/);
    assert.match(sql, /CREATE INDEX "platform_health_rollups_status_window_end_idx" ON "platform_health_rollups"\("status", "window_end"\)/);
    assert.match(sql, /CREATE INDEX "platform_health_rollups_window_end_idx" ON "platform_health_rollups"\("window_end"\)/);
    assert.match(monitoringOwnershipRow, /\|\s*`platform-monitoring-service`\s*\|[^|]*\|[^|]*`platform_health_rollups`/);
  });

  it("ships Prisma schema and ownership for platform alert routing rules", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const directory = migrationDirectories.find((name) => /platform_alert_routing_rules/.test(name));
    assert.ok(directory, "a platform alert routing rules migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${directory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "platform alert routing rules migration.sql must exist");

    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const sql = readFileSync(sqlUrl, "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const ruleModel = schema.match(/model PlatformAlertRoutingRule \{[\s\S]*?\n\}/)?.[0] ?? "";
    const notificationOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `notification-service` |")) ?? "";

    assert.match(ruleModel, /model PlatformAlertRoutingRule/);
    assert.match(ruleModel, /componentIds\s+Json\s+@default\("\[\]"\)\s+@map\("component_ids"\)/);
    assert.match(ruleModel, /statuses\s+Json\s+@default\("\[\]"\)/);
    assert.match(ruleModel, /severities\s+Json\s+@default\("\[\]"\)/);
    assert.match(ruleModel, /destinationChannel\s+String\s+@map\("destination_channel"\)/);
    assert.match(ruleModel, /destinationTarget\s+String\s+@map\("destination_target"\)/);
    assert.match(ruleModel, /enabled\s+Boolean\s+@default\(true\)/);
    assert.match(ruleModel, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(ruleModel, /updatedAt\s+DateTime\s+@map\("updated_at"\)\s+@db\.Timestamptz\(3\)/);
    assert.match(ruleModel, /@@index\(\[enabled, updatedAt\], map: "platform_alert_routing_rules_enabled_updated_idx"\)/);
    assert.match(ruleModel, /@@index\(\[destinationChannel\], map: "platform_alert_routing_rules_destination_channel_idx"\)/);
    assert.match(ruleModel, /@@map\("platform_alert_routing_rules"\)/);
    assert.match(sql, /CREATE TABLE "platform_alert_routing_rules"/);
    assert.match(sql, /"component_ids" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    assert.match(sql, /"statuses" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    assert.match(sql, /"severities" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    assert.match(sql, /"destination_channel" TEXT NOT NULL/);
    assert.match(sql, /"destination_target" TEXT NOT NULL/);
    assert.match(sql, /"enabled" BOOLEAN NOT NULL DEFAULT true/);
    assert.match(sql, /"created_at" TIMESTAMPTZ\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
    assert.match(sql, /"updated_at" TIMESTAMPTZ\(3\) NOT NULL/);
    assert.match(sql, /CREATE INDEX "platform_alert_routing_rules_enabled_updated_idx" ON "platform_alert_routing_rules"\("enabled", "updated_at"\)/);
    assert.match(sql, /CREATE INDEX "platform_alert_routing_rules_destination_channel_idx" ON "platform_alert_routing_rules"\("destination_channel"\)/);
    assert.match(notificationOwnershipRow, /\|\s*`notification-service`\s*\|[^|]*\|[^|]*`platform_alert_routing_rules`/);
  });

  it("ships Prisma schema and ownership for feature flag rules", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const directory = migrationDirectories.find((name) => /feature_flag_rules/.test(name));
    assert.ok(directory, "a feature flag rules migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${directory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "feature flag rules migration.sql must exist");

    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const sql = readFileSync(sqlUrl, "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const ruleModel = schema.match(/model FeatureFlagRule \{[\s\S]*?\n\}/)?.[0] ?? "";
    const featureFlagOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `feature-flag-service` |")) ?? "";

    assert.match(ruleModel, /model FeatureFlagRule/);
    assert.match(ruleModel, /flagId\s+String\s+@map\("flag_id"\)/);
    assert.match(ruleModel, /flagKey\s+String\s+@map\("flag_key"\)/);
    assert.match(ruleModel, /targeting\s+String/);
    assert.match(ruleModel, /rollout\s+Int/);
    assert.match(ruleModel, /bucketSalt\s+String\s+@map\("bucket_salt"\)/);
    assert.match(ruleModel, /segments\s+Json\s+@default\("\[\]"\)/);
    assert.match(ruleModel, /enabledTenantIds\s+Json\s+@default\("\[\]"\)\s+@map\("enabled_tenant_ids"\)/);
    assert.match(ruleModel, /variants\s+Json\s+@default\("\[\]"\)/);
    assert.match(ruleModel, /@@index\(\[flagId, targeting\], map: "feature_flag_rules_flag_targeting_idx"\)/);
    assert.match(ruleModel, /@@index\(\[flagKey\], map: "feature_flag_rules_flag_key_idx"\)/);
    assert.match(ruleModel, /@@map\("feature_flag_rules"\)/);
    assert.match(sql, /CREATE TABLE "feature_flag_rules"/);
    assert.match(sql, /"flag_id" TEXT NOT NULL/);
    assert.match(sql, /"flag_key" TEXT NOT NULL/);
    assert.match(sql, /"targeting" TEXT NOT NULL/);
    assert.match(sql, /"rollout" INTEGER NOT NULL/);
    assert.match(sql, /"bucket_salt" TEXT NOT NULL/);
    assert.match(sql, /CONSTRAINT "feature_flag_rules_rollout_check" CHECK \("rollout" >= 0 AND "rollout" <= 100\)/);
    assert.match(sql, /CREATE INDEX "feature_flag_rules_flag_targeting_idx" ON "feature_flag_rules"\("flag_id", "targeting"\)/);
    assert.match(sql, /CREATE INDEX "feature_flag_rules_flag_key_idx" ON "feature_flag_rules"\("flag_key"\)/);
    assert.match(featureFlagOwnershipRow, /\|\s*`feature-flag-service`\s*\|[^|]*\|[^|]*`feature_flag_rules`/);
  });

  it("ships Prisma schema and ownership for platform audit and outbox rows", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const directory = migrationDirectories.find((name) => /platform_audit_outbox/.test(name));
    assert.ok(directory, "a platform audit outbox migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${directory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "platform audit outbox migration.sql must exist");

    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const sql = readFileSync(sqlUrl, "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const auditModel = schema.match(/model PlatformAuditRow \{[\s\S]*?\n\}/)?.[0] ?? "";
    const outboxModel = schema.match(/model PlatformOutboxRow \{[\s\S]*?\n\}/)?.[0] ?? "";
    const featureFlagOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `feature-flag-service` |")) ?? "";

    assert.match(auditModel, /model PlatformAuditRow/);
    assert.match(auditModel, /mutationKind\s+String\s+@map\("mutation_kind"\)/);
    assert.match(auditModel, /idempotencyKey\s+String\s+@unique\s+@map\("idempotency_key"\)/);
    assert.match(auditModel, /fingerprint\s+String/);
    assert.match(auditModel, /immutable\s+Boolean\s+@default\(true\)/);
    assert.match(auditModel, /@@index\(\[mutationKind, createdAt\], map: "platform_audit_rows_mutation_created_idx"\)/);
    assert.match(auditModel, /@@map\("platform_audit_rows"\)/);
    assert.match(outboxModel, /model PlatformOutboxRow/);
    assert.match(outboxModel, /aggregateType\s+String\s+@map\("aggregate_type"\)/);
    assert.match(outboxModel, /queue\s+String/);
    assert.match(outboxModel, /@@index\(\[queue, status, createdAt\], map: "platform_outbox_rows_queue_status_created_idx"\)/);
    assert.match(outboxModel, /@@map\("platform_outbox_rows"\)/);
    assert.match(sql, /CREATE TABLE "platform_audit_rows"/);
    assert.match(sql, /"mutation_kind" TEXT NOT NULL/);
    assert.match(sql, /"idempotency_key" TEXT NOT NULL/);
    assert.match(sql, /CONSTRAINT "platform_audit_rows_mutation_kind_check" CHECK \("mutation_kind" IN \('incident', 'alert', 'rollout'\)\)/);
    assert.match(sql, /CONSTRAINT "platform_audit_rows_immutable_check" CHECK \("immutable" = true\)/);
    assert.match(sql, /CREATE TABLE "platform_outbox_rows"/);
    assert.match(sql, /"aggregate_type" TEXT NOT NULL/);
    assert.match(sql, /CONSTRAINT "platform_outbox_rows_mutation_kind_check" CHECK \("mutation_kind" IN \('incident', 'alert', 'rollout'\)\)/);
    assert.match(sql, /CREATE INDEX "platform_audit_rows_mutation_created_idx" ON "platform_audit_rows"\("mutation_kind", "created_at"\)/);
    assert.match(sql, /CREATE INDEX "platform_outbox_rows_queue_status_created_idx" ON "platform_outbox_rows"\("queue", "status", "created_at"\)/);
    assert.match(featureFlagOwnershipRow, /\|\s*`feature-flag-service`\s*\|[^|]*\|[^|]*`platform_audit_rows`/);
    assert.match(featureFlagOwnershipRow, /\|\s*`feature-flag-service`\s*\|[^|]*\|[^|]*`platform_outbox_rows`/);
  });

  it("ships Prisma index coverage for alert acknowledgement audit reads", async () => {
    const migrationsUrl = new URL("../prisma/migrations", import.meta.url);
    const migrationDirectories = await readdir(migrationsUrl);
    const directory = migrationDirectories.find((name) => /platform_alert_ack_audit_index/.test(name));
    assert.ok(directory, "a platform alert acknowledgement audit index migration directory is required");

    const sqlUrl = new URL(`../prisma/migrations/${directory}/migration.sql`, import.meta.url);
    assert.equal(existsSync(sqlUrl), true, "platform alert acknowledgement audit index migration.sql must exist");

    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const sql = readFileSync(sqlUrl, "utf8");
    const ownershipMap = readFileSync(new URL("../docs/database-ownership-map.md", import.meta.url), "utf8");
    const auditModel = schema.match(/model PlatformAuditRow \{[\s\S]*?\n\}/)?.[0] ?? "";
    const featureFlagOwnershipRow = ownershipMap
      .split("\n")
      .find((line) => line.startsWith("| `feature-flag-service` |")) ?? "";

    assert.match(auditModel, /@@index\(\[mutationKind, action, target, createdAt\], map: "platform_audit_rows_ack_action_target_idx"\)/);
    assert.match(sql, /CREATE INDEX "platform_audit_rows_ack_action_target_idx" ON "platform_audit_rows"\("mutation_kind", "action", "target", "created_at"\)/);
    assert.match(featureFlagOwnershipRow, /\|\s*`feature-flag-service`\s*\|[^|]*\|[^|]*`platform_audit_rows`/);
  });

  it("exports Prisma client and transaction helpers from the database package", async () => {
    const database = await import("@support-communication/database");

    assert.equal(typeof database.createPrismaClient, "function");
    assert.equal(typeof database.createPrismaBillingSyncJobStore, "function");
    assert.equal(typeof database.createPrismaConversationOutboundDescriptorStore, "function");
    assert.equal(typeof database.withTransaction, "function");

    const calls: string[] = [];
    const fakeClient = {
      $transaction: async <T>(operation: (client: { id: string }) => Promise<T>) => {
        calls.push("transaction-started");
        return operation({ id: "tx-client" });
      }
    };

    const result = await database.withTransaction(fakeClient, async (client: { id: string }) => client.id);
    assert.equal(result, "tx-client");
    assert.deepEqual(calls, ["transaction-started"]);
  });

  it("loads conversation outbound descriptors through a Prisma-backed worker descriptor store", async () => {
    const database = await import("@support-communication/database");
    const calls: unknown[] = [];
    const fakeClient = {
      conversationOutboundDescriptor: {
        findUnique: async (input: unknown) => {
          calls.push(input);
          return {
            channel: "WHATSAPP",
            conversationId: "conv_prisma_descriptor",
            id: "descriptor_prisma_001",
            idempotencyKey: "delivery-key-001",
            kind: "message_delivery",
            messageId: "msg_prisma_descriptor",
            payload: { text: "Prisma descriptor dispatch" },
            tenantId: "tenant-prisma-descriptor"
          };
        }
      }
    };

    const descriptor = await database
      .createPrismaConversationOutboundDescriptorStore(fakeClient)
      .findOutboundDescriptorById("descriptor_prisma_001");

    assert.deepEqual(calls, [{ where: { id: "descriptor_prisma_001" } }]);
    assert.deepEqual(descriptor, {
      channel: "WHATSAPP",
      conversationId: "conv_prisma_descriptor",
      id: "descriptor_prisma_001",
      idempotencyKey: "delivery-key-001",
      kind: "message_delivery",
      messageId: "msg_prisma_descriptor",
      payload: { text: "Prisma descriptor dispatch" },
      tenantId: "tenant-prisma-descriptor"
    });
  });

  it("persists channel delivery receipts through a Prisma-backed receipt store with provider replay", async () => {
    const database = await import("@support-communication/database");
    assert.equal(typeof database.createPrismaChannelDeliveryReceiptStore, "function");

    const receipts: Array<Record<string, unknown>> = [];
    const calls: Array<{ input: unknown; op: string }> = [];
    const fakeClient = {
      channelDeliveryReceipt: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          calls.push({ input: data, op: "create" });
          receipts.push(data);
          return data;
        },
        findMany: async (input: unknown) => {
          calls.push({ input, op: "findMany" });
          return receipts;
        },
        findUnique: async (input: { where: { provider_providerEventId?: { provider: string; providerEventId: string } } }) => {
          calls.push({ input, op: "findUnique" });
          const key = input.where.provider_providerEventId;
          return key
            ? receipts.find((receipt) => receipt.provider === key.provider && receipt.providerEventId === key.providerEventId) ?? null
            : null;
        }
      }
    };
    const store = database.createPrismaChannelDeliveryReceiptStore(fakeClient);
    const receipt = {
      channel: "Telegram",
      conversationId: "maria",
      id: "receipt_001",
      idempotencyKey: "receipt-key-001",
      messageId: "msg_agent_001",
      payload: { rawStatus: "delivered" },
      provider: "telegram",
      providerEventId: "tg-delivered-001",
      receivedAt: "2026-06-29T12:00:00.000Z",
      status: "delivered",
      tenantId: "tenant-volga",
      traceId: "trc_receipt_001"
    };

    const created = await store.recordDeliveryReceipt(receipt);
    const replay = await store.recordDeliveryReceipt({ ...receipt, id: "receipt_duplicate_should_replay" });
    const listed = await store.listDeliveryReceipts({
      channel: "Telegram",
      messageId: "msg_agent_001",
      tenantId: "tenant-volga"
    });

    assert.equal(created.id, "receipt_001");
    assert.equal(replay.id, "receipt_001");
    assert.equal(receipts.length, 1);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].receivedAt, "2026-06-29T12:00:00.000Z");
    assert.equal(calls.filter((call) => call.op === "create").length, 1);
    assert.deepEqual(calls.find((call) => call.op === "findMany")?.input, {
      orderBy: { receivedAt: "asc" },
      where: {
        channel: "Telegram",
        messageId: "msg_agent_001",
        tenantId: "tenant-volga"
      }
    });
  });

  it("persists outbox descriptors through a Prisma-backed outbox store", async () => {
    const database = await import("@support-communication/database");
    assert.equal(typeof database.createPrismaOutboxStore, "function");

    const writes: unknown[] = [];
    const fakeClient = {
      outboxEvent: {
        create: async ({ data }: { data: unknown }) => {
          writes.push(data);
          return data;
        }
      }
    };
    const store = database.createPrismaOutboxStore(fakeClient);
    const event = createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_outbox_prisma",
      type: "tenant.status.changed"
    });

    const stored = await store.append(event);
    assert.equal(stored.id, event.id);
    assert.deepEqual(writes, [{
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      id: event.id,
      occurredAt: new Date(event.occurredAt),
      payload: event.payload,
      queue: event.queue,
      status: "pending",
      traceId: event.traceId,
      type: event.type
    }]);
  });

  it("claims Prisma outbox rows with a single skip-locked lease query", async () => {
    const database = await import("@support-communication/database");
    const now = new Date("2026-06-27T10:00:00.000Z");
    let queryText = "";
    let queryValues: unknown[] = [];
    const fakeClient = {
      $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
        queryText = query;
        queryValues = values;
        return [{
          aggregateId: "tenant-volga",
          aggregateType: "tenant",
          attempts: 0,
          id: "outbox_claimed",
          lastError: null,
          lockedAt: now,
          occurredAt: now,
          payload: { status: "restricted" },
          publishedAt: null,
          queue: "identity-events",
          status: "publishing",
          traceId: "trc_claim",
          type: "tenant.status.changed"
        }];
      },
      outboxEvent: {
        create: async ({ data }: { data: unknown }) => data
      }
    };

    const claimed = await database.createPrismaOutboxStore(fakeClient).claimPending({
      leaseTimeoutMs: 60_000,
      limit: 5,
      now,
      queue: "identity-events"
    });

    assert.deepEqual(claimed.map((event) => event.id), ["outbox_claimed"]);
    assert.match(queryText, /FOR UPDATE SKIP LOCKED/);
    assert.match(queryText, /"status" = 'publishing'/);
    assert.match(queryText, /"locked_at" <= \$2/);
    assert.match(queryText, /"next_attempt_at" IS NULL/);
    assert.match(queryText, /"next_attempt_at" <= \$1/);
    assert.deepEqual(queryValues, [
      now,
      new Date("2026-06-27T09:59:00.000Z"),
      5,
      "identity-events"
    ]);
  });

  it("updates Prisma outbox failures with retry backoff and terminal dead-letter state", async () => {
    const database = await import("@support-communication/database");
    const failedAt = new Date("2026-06-28T10:00:00.000Z");
    const updates: Array<{ data: Record<string, unknown>; where: { id: string } }> = [];
    const fakeClient = {
      outboxEvent: {
        create: async ({ data }: { data: unknown }) => data,
        update: async (input: { data: Record<string, unknown>; where: { id: string } }) => {
          updates.push(input);
          return {
            aggregateId: "tenant-volga",
            aggregateType: "tenant",
            attempts: input.data.attempts ? 1 : 0,
            deadLetteredAt: input.data.deadLetteredAt ?? null,
            id: input.where.id,
            lastError: input.data.lastError ?? null,
            lockedAt: input.data.lockedAt ?? null,
            nextAttemptAt: input.data.nextAttemptAt ?? null,
            occurredAt: failedAt,
            payload: { status: "restricted" },
            publishedAt: input.data.publishedAt ?? null,
            queue: "identity-events",
            status: input.data.status,
            traceId: "trc_outbox_failure_state",
            type: "tenant.status.changed"
          };
        }
      }
    };
    const store = database.createPrismaOutboxStore(fakeClient);

    const retryable = await store.markFailed("outbox_retry", "queue unavailable", failedAt, {
      maxAttempts: 3,
      retryBackoffMs: 60_000
    });
    const terminal = await store.markFailed("outbox_dead", "queue unavailable", failedAt, {
      maxAttempts: 1,
      retryBackoffMs: 60_000
    });

    assert.equal(retryable.status, "failed");
    assert.equal(retryable.nextAttemptAt, "2026-06-28T10:01:00.000Z");
    assert.equal(retryable.deadLetteredAt, null);
    assert.equal(terminal.status, "dead_lettered");
    assert.equal(terminal.nextAttemptAt, null);
    assert.equal(terminal.deadLetteredAt, "2026-06-28T10:00:00.000Z");
    assert.equal((updates[0].data.nextAttemptAt as Date).toISOString(), "2026-06-28T10:01:00.000Z");
    assert.equal(updates[1].data.status, "dead_lettered");
  });

  it("atomically replays Prisma dead-lettered outbox rows by id, queue and status", async () => {
    const database = await import("@support-communication/database");
    const replayedAt = new Date("2026-06-28T10:05:00.000Z");
    let queryText = "";
    let queryValues: unknown[] = [];
    const fakeClient = {
      $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
        queryText = query;
        queryValues = values;
        return [{
          aggregateId: "tenant-volga",
          aggregateType: "tenant",
          attempts: 4,
          deadLetteredAt: null,
          deadLetterReplayAuditEvents: [{
            action: "worker.dead_letter.replay",
            immutable: true,
            target: "outbox_replay_prisma"
          }],
          id: "outbox_replay_prisma",
          lastError: "dead_letter_replay:operator approved replay",
          lockedAt: null,
          nextAttemptAt: null,
          occurredAt: replayedAt,
          payload: { status: "restricted" },
          publishedAt: null,
          queue: "identity-events",
          status: "failed",
          traceId: "trc_outbox_replay_prisma",
          type: "tenant.status.changed"
        }];
      },
      outboxEvent: {
        create: async ({ data }: { data: unknown }) => data
      }
    };

    const replayed = await database.createPrismaOutboxStore(fakeClient).replayDeadLettered(
      "outbox_replay_prisma",
      "identity-events",
      "operator approved replay",
      replayedAt,
      {
        action: "worker.dead_letter.replay",
        at: replayedAt.toISOString(),
        id: "evt_dead_letter_replay_outbox_replay_prisma",
        immutable: true,
        queue: "identity-events",
        reason: "operator approved replay",
        result: "requeued",
        target: "outbox_replay_prisma"
      }
    );

    assert.equal(replayed.status, "failed");
    assert.equal(replayed.attempts, 4);
    assert.equal(replayed.deadLetterReplayAuditEvents?.[0]?.immutable, true);
    assert.equal(replayed.deadLetteredAt, null);
    assert.equal(replayed.nextAttemptAt, null);
    assert.match(queryText, /UPDATE "outbox_events"/);
    assert.match(queryText, /"attempts" = "attempts" \+ 1/);
    assert.match(queryText, /"dead_letter_replay_audit_events" = COALESCE\("dead_letter_replay_audit_events", '\[\]'::jsonb\) \|\| \$4::jsonb/);
    assert.match(queryText, /"dead_lettered_at" = NULL/);
    assert.match(queryText, /"next_attempt_at" = NULL/);
    assert.match(queryText, /"id" = \$1/);
    assert.match(queryText, /"queue" = \$2/);
    assert.match(queryText, /"status" = 'dead_lettered'/);
    assert.deepEqual(queryValues, [
      "outbox_replay_prisma",
      "identity-events",
      "dead_letter_replay:operator approved replay",
      JSON.stringify([{
        action: "worker.dead_letter.replay",
        at: replayedAt.toISOString(),
        id: "evt_dead_letter_replay_outbox_replay_prisma",
        immutable: true,
        queue: "identity-events",
        reason: "operator approved replay",
        result: "requeued",
        target: "outbox_replay_prisma"
      }])
    ]);
  });

  it("claims Prisma billing sync jobs with a single skip-locked lease query", async () => {
    const database = await import("@support-communication/database");
    const now = new Date("2026-06-28T10:00:00.000Z");
    let queryText = "";
    let queryValues: unknown[] = [];
    const updates: unknown[] = [];
    const fakeClient = {
      $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
        queryText = query;
        queryValues = values;
        return [{
          actor: "billing-provider",
          actorName: "stripe",
          attempts: 0,
          auditEventId: "provider_sync_evt_claim",
          createdAt: now,
          fromPlanId: "starter",
          id: "billing_sync_claimed",
          lastError: null,
          lockedAt: now,
          payload: {
            eventType: "invoice.paid",
            provider: "stripe",
            tenantId: "tenant-lumen"
          },
          publishedAt: null,
          queue: "billing-sync",
          reason: "invoice.paid",
          status: "publishing",
          tenantId: "tenant-lumen",
          toPlanId: "business",
          traceId: "trc_billing_claim"
        }];
      },
      billingSyncJob: {
        findMany: async () => [],
        update: async (input: { data: Record<string, unknown>; where: { id: string } }) => {
          updates.push(input);
          return {
            actor: "billing-provider",
            actorName: "stripe",
            attempts: input.data.attempts ? 1 : 0,
            auditEventId: "provider_sync_evt_claim",
            createdAt: now,
            fromPlanId: "starter",
            id: input.where.id,
            lastError: input.data.lastError ?? null,
            lockedAt: input.data.lockedAt ?? null,
            payload: { eventType: "invoice.paid", provider: "stripe", tenantId: "tenant-lumen" },
            publishedAt: input.data.publishedAt ?? null,
            queue: "billing-sync",
            reason: "invoice.paid",
            status: input.data.status,
            tenantId: "tenant-lumen",
            toPlanId: "business",
            traceId: "trc_billing_claim"
          };
        }
      }
    };

    const store = database.createPrismaBillingSyncJobStore(fakeClient);
    const claimed = await store.claimPending({
      leaseTimeoutMs: 60_000,
      limit: 5,
      now,
      queue: "billing-sync"
    });
    const published = await store.markPublished("billing_sync_claimed", now);
    const failed = await store.markFailed("billing_sync_claimed", "provider unavailable", now);

    assert.deepEqual(claimed.map((job) => job.id), ["billing_sync_claimed"]);
    assert.match(queryText, /UPDATE "billing_sync_jobs"/);
    assert.match(queryText, /FOR UPDATE SKIP LOCKED/);
    assert.match(queryText, /"status" = 'publishing'/);
    assert.match(queryText, /"locked_at" <= \$2/);
    assert.match(queryText, /"next_attempt_at" IS NULL/);
    assert.match(queryText, /"next_attempt_at" <= \$1/);
    assert.deepEqual(queryValues, [
      now,
      new Date("2026-06-28T09:59:00.000Z"),
      5,
      "billing-sync"
    ]);
    assert.equal(published.status, "published");
    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 1);
    assert.deepEqual(updates.map((update) => (update as { data: Record<string, unknown> }).data.status), ["published", "failed"]);
  });

  it("updates Prisma billing sync failures with retry backoff and terminal dead-letter state", async () => {
    const database = await import("@support-communication/database");
    const failedAt = new Date("2026-06-28T10:00:00.000Z");
    const updates: Array<{ data: Record<string, unknown>; where: { id: string } }> = [];
    const fakeClient = {
      billingSyncJob: {
        findMany: async () => [],
        update: async (input: { data: Record<string, unknown>; where: { id: string } }) => {
          updates.push(input);
          return {
            actor: "billing-provider",
            actorName: "stripe",
            attempts: input.data.attempts ? 1 : 0,
            auditEventId: "provider_sync_evt_failure_state",
            createdAt: failedAt,
            deadLetteredAt: input.data.deadLetteredAt ?? null,
            fromPlanId: "starter",
            id: input.where.id,
            lastError: input.data.lastError ?? null,
            lockedAt: input.data.lockedAt ?? null,
            nextAttemptAt: input.data.nextAttemptAt ?? null,
            payload: { eventType: "invoice.paid", provider: "stripe", tenantId: "tenant-lumen" },
            publishedAt: input.data.publishedAt ?? null,
            queue: "billing-sync",
            reason: "invoice.paid",
            status: input.data.status,
            tenantId: "tenant-lumen",
            toPlanId: "business",
            traceId: "trc_billing_failure_state"
          };
        }
      }
    };
    const store = database.createPrismaBillingSyncJobStore(fakeClient);

    const retryable = await store.markFailed("billing_sync_retry", "provider unavailable", failedAt, {
      maxAttempts: 3,
      retryBackoffMs: 60_000
    });
    const terminal = await store.markFailed("billing_sync_dead", "provider unavailable", failedAt, {
      maxAttempts: 1,
      retryBackoffMs: 60_000
    });

    assert.equal(retryable.status, "failed");
    assert.equal(retryable.nextAttemptAt, "2026-06-28T10:01:00.000Z");
    assert.equal(retryable.deadLetteredAt, null);
    assert.equal(terminal.status, "dead_lettered");
    assert.equal(terminal.nextAttemptAt, null);
    assert.equal(terminal.deadLetteredAt, "2026-06-28T10:00:00.000Z");
    assert.equal((updates[0].data.nextAttemptAt as Date).toISOString(), "2026-06-28T10:01:00.000Z");
    assert.equal(updates[1].data.status, "dead_lettered");
  });

  it("atomically replays Prisma dead-lettered billing sync jobs by id, queue and status", async () => {
    const database = await import("@support-communication/database");
    const replayedAt = new Date("2026-06-28T11:30:00.000Z");
    let queryText = "";
    let queryValues: unknown[] = [];
    const fakeClient = {
      $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
        queryText = query;
        queryValues = values;
        return [{
          actor: "billing-provider",
          actorName: "stripe",
          attempts: 5,
          auditEventId: "provider_sync_evt_replay",
          createdAt: replayedAt,
          deadLetteredAt: null,
          deadLetterReplayAuditEvents: [{
            action: "worker.dead_letter.replay",
            immutable: true,
            target: "billing_sync_replay_prisma"
          }],
          fromPlanId: "starter",
          id: "billing_sync_replay_prisma",
          lastError: "dead_letter_replay:provider recovered",
          lockedAt: null,
          nextAttemptAt: null,
          payload: { eventType: "invoice.paid", provider: "stripe", tenantId: "tenant-lumen" },
          publishedAt: null,
          queue: "billing-sync",
          reason: "invoice.paid",
          status: "failed",
          tenantId: "tenant-lumen",
          toPlanId: "business",
          traceId: "trc_billing_replay_prisma"
        }];
      },
      billingSyncJob: {
        findMany: async () => []
      }
    };

    const replayed = await database.createPrismaBillingSyncJobStore(fakeClient).replayDeadLettered(
      "billing_sync_replay_prisma",
      "billing-sync",
      "provider recovered",
      replayedAt,
      {
        action: "worker.dead_letter.replay",
        at: replayedAt.toISOString(),
        id: "evt_dead_letter_replay_billing_sync_replay_prisma",
        immutable: true,
        queue: "billing-sync",
        reason: "provider recovered",
        result: "requeued",
        target: "billing_sync_replay_prisma"
      }
    );

    assert.equal(replayed.status, "failed");
    assert.equal(replayed.attempts, 5);
    assert.equal(replayed.deadLetterReplayAuditEvents?.[0]?.immutable, true);
    assert.equal(replayed.deadLetteredAt, null);
    assert.equal(replayed.nextAttemptAt, null);
    assert.match(queryText, /UPDATE "billing_sync_jobs"/);
    assert.match(queryText, /"attempts" = "attempts" \+ 1/);
    assert.match(queryText, /"dead_letter_replay_audit_events" = COALESCE\("dead_letter_replay_audit_events", '\[\]'::jsonb\) \|\| \$5::jsonb/);
    assert.match(queryText, /"dead_lettered_at" = NULL/);
    assert.match(queryText, /"next_attempt_at" = NULL/);
    assert.match(queryText, /"id" = \$1/);
    assert.match(queryText, /"queue" = \$2/);
    assert.match(queryText, /"status" = 'dead_lettered'/);
    assert.deepEqual(queryValues, [
      "billing_sync_replay_prisma",
      "billing-sync",
      "dead_letter_replay:provider recovered",
      replayedAt,
      JSON.stringify([{
        action: "worker.dead_letter.replay",
        at: replayedAt.toISOString(),
        id: "evt_dead_letter_replay_billing_sync_replay_prisma",
        immutable: true,
        queue: "billing-sync",
        reason: "provider recovered",
        result: "requeued",
        target: "billing_sync_replay_prisma"
      }])
    ]);
  });

  it("publishes pending outbox events and records success or retryable failure", async () => {
    const events = await import("@support-communication/events");
    assert.equal(typeof events.InMemoryOutboxStore, "function");
    assert.equal(typeof events.OutboxPublisher, "function");

    const store = new events.InMemoryOutboxStore();
    const success = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_outbox_success",
      type: "tenant.status.changed"
    }));
    const failure = await store.append(createOutboxEvent({
      aggregateId: "svc-session-1",
      aggregateType: "service-admin-session",
      payload: { authState: "mfa_verified" },
      queue: "identity-events",
      traceId: "trc_outbox_failure",
      type: "service_admin.login"
    }));
    const dispatched: string[] = [];
    const publisher = new events.OutboxPublisher(store, async (event: typeof success) => {
      dispatched.push(event.id);
      if (event.id === failure.id) {
        throw new Error("queue unavailable");
      }
    });

    const result = await publisher.publishPending({ limit: 10 });
    assert.deepEqual(result, {
      failed: 1,
      published: 1,
      scanned: 2
    });
    assert.deepEqual(dispatched.sort(), [failure.id, success.id].sort());

    const records = await store.list({ statuses: ["failed", "published"] });
    assert.equal(records.find((event) => event.id === success.id)?.status, "published");
    const failed = records.find((event) => event.id === failure.id);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.attempts, 1);
    assert.equal(failed?.lastError, "queue unavailable");
  });

  it("runs an outbox worker iteration with queue, limit and lease options", async () => {
    const events = await import("@support-communication/events");
    assert.equal(typeof events.OutboxWorker, "function");

    const store = new events.InMemoryOutboxStore();
    const identityEvent = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_worker_identity",
      type: "tenant.status.changed"
    }));
    const billingEvent = await store.append(createOutboxEvent({
      aggregateId: "tenant-lumen",
      aggregateType: "billing-tenant",
      payload: { planId: "business" },
      queue: "billing-sync",
      traceId: "trc_worker_billing",
      type: "billing.tenant.plan_changed"
    }));
    const dispatched: string[] = [];
    const publisher = new events.OutboxPublisher(store, async (event: typeof identityEvent) => {
      dispatched.push(event.id);
    });
    const worker = new events.OutboxWorker(publisher, {
      leaseTimeoutMs: 60_000,
      limit: 1,
      queue: "identity-events"
    });

    const result = await worker.runOnce();

    assert.deepEqual(result, {
      failed: 0,
      published: 1,
      scanned: 1
    });
    assert.deepEqual(dispatched, [identityEvent.id]);
    assert.equal((await store.list({ statuses: ["published"] })).some((event) => event.id === identityEvent.id), true);
    assert.equal((await store.list({ statuses: ["pending"] })).some((event) => event.id === billingEvent.id), true);
  });

  it("runs an outbox worker loop with deterministic sleep and graceful stop", async () => {
    const events = await import("@support-communication/events");
    const store = new events.InMemoryOutboxStore();
    const first = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_worker_loop_first",
      type: "tenant.status.changed"
    }));
    const dispatched: string[] = [];
    const pauses: number[] = [];
    let worker: InstanceType<typeof events.OutboxWorker>;
    const publisher = new events.OutboxPublisher(store, async (event: typeof first) => {
      dispatched.push(event.id);
      if (dispatched.length === 1) {
        await store.append(createOutboxEvent({
          aggregateId: "svc-session-1",
          aggregateType: "service-admin-session",
          payload: { authState: "mfa_verified" },
          queue: "identity-events",
          traceId: "trc_worker_loop_second",
          type: "service_admin.login"
        }));
      }
      if (dispatched.length === 2) {
        worker.stop();
      }
    });
    worker = new events.OutboxWorker(publisher, {
      intervalMs: 25,
      limit: 1,
      queue: "identity-events",
      sleep: async (milliseconds: number) => {
        pauses.push(milliseconds);
      }
    });

    const result = await worker.start({ maxIterations: 10 });

    assert.deepEqual(result, {
      failed: 0,
      iterations: 2,
      published: 2,
      scanned: 2,
      stopped: true
    });
    assert.equal(dispatched.length, 2);
    assert.equal(dispatched[0], first.id);
    assert.deepEqual(pauses, [25]);
  });

  it("keeps outbox worker start idempotent and avoids overlapping publish loops", async () => {
    const events = await import("@support-communication/events");
    let resolvePublish: ((value: { failed: number; published: number; scanned: number }) => void) | undefined;
    const publishCalls: Array<{ limit?: number; queue?: string }> = [];
    const fakePublisher = {
      publishPending: async (options: { limit?: number; queue?: string }) => {
        publishCalls.push(options);
        return new Promise<{ failed: number; published: number; scanned: number }>((resolve) => {
          resolvePublish = resolve;
        });
      }
    };
    const sleeps: number[] = [];
    const worker = new events.OutboxWorker(fakePublisher as InstanceType<typeof events.OutboxPublisher>, {
      intervalMs: 10,
      limit: 1,
      queue: "identity-events",
      sleep: async (milliseconds: number) => {
        sleeps.push(milliseconds);
        worker.stop();
      }
    });

    const firstStart = worker.start();
    const secondStart = worker.start();
    await Promise.resolve();

    assert.equal(publishCalls.length, 1);
    resolvePublish?.({ failed: 0, published: 1, scanned: 1 });
    const [firstResult, secondResult] = await Promise.all([firstStart, secondStart]);

    assert.equal(firstResult.iterations, 1);
    assert.deepEqual(secondResult, firstResult);
    assert.deepEqual(sleeps, [10]);
  });

  it("claims outbox events once and recovers stale publishing leases", async () => {
    const events = await import("@support-communication/events");
    const store = new events.InMemoryOutboxStore();
    const event = await store.append(createOutboxEvent({
      aggregateId: "tenant-volga",
      aggregateType: "tenant",
      payload: { status: "restricted" },
      queue: "identity-events",
      traceId: "trc_outbox_claim",
      type: "tenant.status.changed"
    }));

    const firstClaim = await store.claimPending({
      limit: 10,
      now: new Date("2026-06-27T10:00:00.000Z")
    });
    const secondClaim = await store.claimPending({
      limit: 10,
      now: new Date("2026-06-27T10:00:01.000Z")
    });
    const staleClaim = await store.claimPending({
      leaseTimeoutMs: 60_000,
      limit: 10,
      now: new Date("2026-06-27T10:01:01.000Z")
    });

    assert.deepEqual(firstClaim.map((item) => item.id), [event.id]);
    assert.deepEqual(secondClaim, []);
    assert.deepEqual(staleClaim.map((item) => item.id), [event.id]);
    assert.equal(staleClaim[0].status, "publishing");
    assert.equal(staleClaim[0].lockedAt, "2026-06-27T10:01:01.000Z");
  });
});
