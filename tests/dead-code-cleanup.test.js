import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("reviewed dead-code cleanup", () => {
  it("removes superseded conversation mutation helpers", () => {
    assert.equal(existsSync(new URL("../src/app/useConversationMutations.js", import.meta.url)), false);
    const dialogModel = readFileSync(new URL("../src/app/dialogModel.js", import.meta.url), "utf8");
    assert.doesNotMatch(dialogModel, /export function createOutboundConversation\(/);
  });

  it("removes unused async load-test result wrappers", () => {
    const source = readFileSync(new URL("../backend/apps/api-gateway/src/operations/load-test-runner.worker.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /export function getLoadTestRun(?:Status|Metrics|ErrorSummary)Async\(/);
  });

  it("keeps attachment indexing on the durable worker path", () => {
    const source = readFileSync(new URL("../backend/apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts", import.meta.url), "utf8");

    assert.doesNotMatch(source, /ingestScannedAttachment/);
    assert.match(source, /async enqueueAttachmentIngestion\(/);
  });

  it("removes the unused and stale backend contracts package", () => {
    const backendTsconfig = readFileSync(new URL("../backend/tsconfig.json", import.meta.url), "utf8");
    const backendBaseTsconfig = readFileSync(new URL("../backend/tsconfig.base.json", import.meta.url), "utf8");

    assert.equal(existsSync(new URL("../backend/packages/contracts/package.json", import.meta.url)), false);
    assert.doesNotMatch(backendTsconfig, /packages\/contracts/);
    assert.doesNotMatch(backendBaseTsconfig, /@support-communication\/contracts/);
  });

  it("removes the disconnected sandbox billing provider cluster", () => {
    assert.equal(existsSync(new URL("../backend/apps/api-gateway/src/billing/billing-provider.port.ts", import.meta.url)), false);
    assert.equal(existsSync(new URL("../backend/apps/api-gateway/src/billing/billing-provider.sandbox.ts", import.meta.url)), false);
  });

  it("removes migration-era seed shims, codemods and orphan UI/catalog modules", () => {
    const removed = [
      "../backend/scripts/seeds/identity.seed.ts",
      "../backend/scripts/add-seed-type-imports.mjs",
      "../backend/scripts/fix-seed-imports.mjs",
      "../backend/scripts/migrate-fixture-imports.mjs",
      "../backend/scripts/rewrite-script-seeds.mjs",
      "../backend/scripts/split-fixtures.mjs",
      "../backend/apps/api-gateway/src/identity/identity.seed.ts",
      "../backend/apps/api-gateway/src/service-admin/seed-catalog.ts",
      "../src/features/settings/TelegramChannelSetupPanel.jsx"
    ];

    for (const path of removed) {
      assert.equal(existsSync(new URL(path, import.meta.url)), false, `expected ${path} to be removed`);
    }
  });
});
