import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const requiredFiles = [
  "backend/package.json",
  "backend/tsconfig.json",
  "backend/tsconfig.base.json",
  "backend/.env.example",
  "backend/docker/docker-compose.yml",
  "backend/apps/api-gateway/package.json",
  "backend/apps/api-gateway/src/main.ts",
  "backend/apps/api-gateway/src/app.module.ts",
  "backend/apps/api-gateway/src/health.controller.ts",
  "backend/apps/api-gateway/src/openapi.ts",
  "backend/apps/outbox-worker/package.json",
  "backend/apps/outbox-worker/src/index.ts",
  "backend/apps/outbox-worker/src/main.ts",
  "backend/packages/envelope/package.json",
  "backend/packages/envelope/src/index.ts",
  "backend/packages/config/package.json",
  "backend/packages/config/src/index.ts",
  "backend/packages/observability/package.json",
  "backend/packages/observability/src/index.ts",
  "backend/tests/foundation.test.ts"
];

describe("backend phase 0 foundation scaffold", () => {
  it("contains the required backend monorepo files", () => {
    for (const file of requiredFiles) {
      assert.equal(existsSync(join(process.cwd(), file)), true, `${file} exists`);
    }
  });

  it("exposes root scripts for backend verification", () => {
    const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));

    assert.equal(rootPackage.scripts["backend:lint"], "cd backend && npm run lint");
    assert.equal(rootPackage.scripts["backend:typecheck"], "cd backend && npm run typecheck");
    assert.equal(rootPackage.scripts["backend:test"], "cd backend && npm test");
    assert.equal(rootPackage.scripts["backend:test:integration"], "cd backend && npm run test:integration");
    assert.equal(rootPackage.scripts["backend:redaction:runtime-smoke"], "cd backend && npm run redaction:runtime-smoke");
    assert.equal(
      rootPackage.scripts["backend:test:runtime"],
      "npm run backend:redaction:runtime-smoke && node --test tests/backend-runtime.test.js"
    );
    assert.equal(rootPackage.scripts["backend:smoke:postgres"], "cd backend && npm run smoke:postgres");
    assert.equal(rootPackage.scripts["backend:release:checklist"], "cd backend && npm run release:checklist");
    assert.equal(rootPackage.scripts["backend:build"], "cd backend && npm run build");
    assert.equal(rootPackage.scripts["backend:outbox:worker:once"], "cd backend && npm run outbox:worker:once");
  });

  it("declares backend workspaces for apps and shared packages", () => {
    const backendPackage = JSON.parse(readFileSync("backend/package.json", "utf8"));

    assert.deepEqual(backendPackage.workspaces, ["apps/api-gateway", "apps/outbox-worker", "packages/*"]);
    assert.equal(backendPackage.type, "module");
  });

  it("documents a backend release verification checklist command", () => {
    const backendPackage = JSON.parse(readFileSync("backend/package.json", "utf8"));
    const readme = readFileSync("backend/README.md", "utf8");
    const releaseScript = readFileSync("backend/scripts/release-checklist.mjs", "utf8");

    assert.match(backendPackage.scripts["release:checklist"], /scripts\/release-checklist\.mjs/);
    for (const script of [
      "prisma:validate",
      "prisma:migrate:deploy",
      "outbox:worker:once",
      "billing:worker:once"
    ]) {
      assert.match(releaseScript, new RegExp(`script: "${script}"`));
      assert.equal(readme.includes(`npm run ${script}`), true);
    }

    assert.doesNotMatch(releaseScript, /script: "prisma:seed"/);

    assert.match(readme, /npm run release:checklist/);
    assert.match(readme, /schema validation/i);
    assert.match(readme, /worker smoke/i);
  });

  it("keeps local backend env files out of git", () => {
    const gitignore = readFileSync(".gitignore", "utf8");

    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^\.env\..*$/m);
    assert.match(gitignore, /^!.*\.env\.example$/m);
  });

  it("boots the gateway with local env defaults and documents prefixed OpenAPI paths", () => {
    const backendPackage = JSON.parse(readFileSync("backend/package.json", "utf8"));
    const mainSource = readFileSync("backend/apps/api-gateway/src/main.ts", "utf8");

    assert.match(backendPackage.scripts["start:api-gateway"], /--env-file=.env.example/);
    assert.ok(
      mainSource.indexOf("app.setGlobalPrefix(`api/${config.API_VERSION}`)") <
        mainSource.indexOf("setupOpenApi(app, config.API_VERSION)"),
      "global prefix is configured before OpenAPI document generation"
    );
  });

  it("forwards the inbound request id through health and readiness envelopes", () => {
    const healthController = readFileSync("backend/apps/api-gateway/src/health.controller.ts", "utf8");

    assert.match(healthController, /health\(@Headers\("x-request-id"\) requestId\?: string\)/);
    assert.match(healthController, /ready\(@Headers\("x-request-id"\) requestId\?: string\)/);
  });

  it("documents public API key management endpoints in OpenAPI decorators", () => {
    const controllerSource = readFileSync("backend/apps/api-gateway/src/integrations/integration.controller.ts", "utf8");

    assert.match(controllerSource, /ApiBearerAuth/);
    assert.match(controllerSource, /operationId:\s*"listIntegrationWorkspace"/);
    assert.match(controllerSource, /masked public API key metadata/);
    assert.match(controllerSource, /operationId:\s*"rotatePublicApiKey"/);
    assert.match(controllerSource, /ApiParam\(\{\s*name:\s*"keyId"/);
    assert.match(controllerSource, /Public API key identifier to rotate/);
    assert.match(controllerSource, /raw key material is never returned/);
  });

  it("documents public SDK runtime endpoints in OpenAPI decorators", () => {
    const controllerSource = readFileSync("backend/apps/api-gateway/src/integrations/public-api.controller.ts", "utf8");

    assert.match(controllerSource, /ApiBearerAuth/);
    assert.match(controllerSource, /operationId:\s*"identifyPublicSdkClient"/);
    assert.match(controllerSource, /Public SDK identify runtime endpoint/);
    assert.match(controllerSource, /ApiQuery\(\{\s*name:\s*"environment"/);
    assert.match(controllerSource, /production or stage public API key environment/);
    assert.match(controllerSource, /denial envelopes include rate-limit metadata/);
  });

  it("documents signed webhook replay endpoints in OpenAPI decorators", () => {
    const controllerSource = readFileSync("backend/apps/api-gateway/src/integrations/integration.controller.ts", "utf8");

    assert.match(controllerSource, /operationId:\s*"replaySignedWebhookDelivery"/);
    assert.match(controllerSource, /Signed webhook delivery replay endpoint/);
    assert.match(controllerSource, /ApiParam\(\{\s*name:\s*"deliveryId"/);
    assert.match(controllerSource, /Webhook delivery identifier to replay/);
    assert.match(controllerSource, /ApiBody\(\{/);
    assert.match(controllerSource, /idempotencyKey/);
    assert.match(controllerSource, /original trace id is preserved/);
  });

  it("documents sandbox public SDK examples without live key material", () => {
    const docs = readFileSync("backend/docs/public-api-examples.md", "utf8");

    assert.match(docs, /## Sandbox SDK identify/);
    assert.match(docs, /POST \/api\/v1\/public\/sdk\/identify\?environment=stage/);
    assert.match(docs, /Authorization: Bearer sk_test_<sandbox_public_api_key>/);
    assert.match(docs, /"externalId": "sandbox-client-001"/);
    assert.match(docs, /"environment": "stage"/);
    assert.doesNotMatch(docs, /sk_live_[A-Za-z0-9_]+/);
  });

  it("documents production public SDK examples without concrete live secrets", () => {
    const docs = readFileSync("backend/docs/public-api-examples.md", "utf8");

    assert.match(docs, /## Production SDK identify/);
    assert.match(docs, /POST \/api\/v1\/public\/sdk\/identify\?environment=production/);
    assert.match(docs, /Authorization: Bearer sk_live_<production_public_api_key>/);
    assert.match(docs, /"externalId": "client-001"/);
    assert.match(docs, /"acceptedEnvironment": "production"/);
    assert.match(docs, /rawKeyExposed/);
    assert.doesNotMatch(docs, /sk_live_[A-Za-z0-9]{8,}/);
  });

  it("documents signed webhook examples without concrete webhook secrets", () => {
    const docs = readFileSync("backend/docs/public-api-examples.md", "utf8");

    assert.match(docs, /## Signed webhook receive/);
    assert.match(docs, /POST \/api\/v1\/webhooks\/vk/);
    assert.match(docs, /X-Webhook-Timestamp: 2026-06-30T13:05:00.000Z/);
    assert.match(docs, /X-Webhook-Nonce: nonce-<unique-event-id>/);
    assert.match(docs, /X-Webhook-Signature: sha256=<hmac_sha256_hex>/);
    assert.match(docs, /HMAC_SHA256\(webhook_secret, "\{timestamp\}\.\{raw_body\}"\)/);
    assert.match(docs, /Replay the same nonce is denied as `webhook_nonce_replay`/);
    assert.doesNotMatch(docs, /whsec_[A-Za-z0-9_]+/);
  });

  it("exposes a CI smoke command for generated public API docs", () => {
    const packageJson = JSON.parse(readFileSync("backend/package.json", "utf8"));
    const releaseChecklist = readFileSync("backend/scripts/release-checklist.mjs", "utf8");

    assert.match(packageJson.scripts["public-api:docs:verify"], /scripts\/public-api-docs-smoke\.mjs/);
    assert.match(releaseChecklist, /Public API docs smoke/);
    assert.match(releaseChecklist, /public-api:docs:verify/);

    const smokeScript = readFileSync("backend/scripts/public-api-docs-smoke.mjs", "utf8");
    assert.match(smokeScript, /public-api-examples\.md/);
    assert.match(smokeScript, /integration\.controller\.ts/);
    assert.match(smokeScript, /public-api\.controller\.ts/);
  });

  it("exposes a runtime smoke command for generated public API docs", () => {
    const packageJson = JSON.parse(readFileSync("backend/package.json", "utf8"));
    const smokeScript = readFileSync("backend/scripts/public-api-docs-smoke.mjs", "utf8");

    assert.match(packageJson.scripts["public-api:docs:runtime-smoke"], /public-api-docs-smoke\.mjs --runtime/);
    assert.match(smokeScript, /--runtime/);
    assert.match(smokeScript, /public-api\.route\.ts/);
    assert.match(smokeScript, /signed-webhook\.route\.ts/);
    assert.match(smokeScript, /replayWebhookDelivery/);
  });
});
