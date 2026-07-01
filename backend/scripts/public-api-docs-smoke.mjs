import { readFileSync } from "node:fs";

const runtimeMode = process.argv.includes("--runtime");

const checks = [
  {
    file: "apps/api-gateway/src/integrations/integration.controller.ts",
    patterns: [
      /operationId:\s*"listIntegrationWorkspace"/,
      /operationId:\s*"rotatePublicApiKey"/,
      /operationId:\s*"replaySignedWebhookDelivery"/,
      /ApiBody\(\{/
    ]
  },
  {
    file: "apps/api-gateway/src/integrations/public-api.controller.ts",
    patterns: [
      /operationId:\s*"identifyPublicSdkClient"/,
      /ApiQuery\(\{\s*name:\s*"environment"/,
      /denial envelopes include rate-limit metadata/
    ]
  },
  {
    file: "docs/public-api-examples.md",
    patterns: [
      /## Sandbox SDK identify/,
      /## Production SDK identify/,
      /## Signed webhook receive/,
      /Authorization: Bearer sk_test_<sandbox_public_api_key>/,
      /Authorization: Bearer sk_live_<production_public_api_key>/,
      /X-Webhook-Signature: sha256=<hmac_sha256_hex>/
    ],
    forbidden: [
      /sk_live_[A-Za-z0-9]{8,}/,
      /whsec_[A-Za-z0-9_]+/
    ]
  }
];

const runtimeChecks = [
  {
    file: "apps/api-gateway/src/integrations/public-api.route.ts",
    patterns: [
      /identifyPublicClientFromRoute/,
      /handlePublicIdentifyUserRequest/
    ]
  },
  {
    file: "apps/api-gateway/src/integrations/signed-webhook.route.ts",
    patterns: [
      /normalizeSignedInboundWebhookFromRoute/,
      /createVerifiedInboundWebhookNormalizationDescriptor/,
      /receiveSignedInboundWebhook/
    ]
  },
  {
    file: "apps/api-gateway/src/integrations/integration.service.ts",
    patterns: [
      /replayWebhookDelivery/,
      /idempotency_key_reused/,
      /originalTraceId/
    ]
  }
];

if (runtimeMode) {
  checks.push(...runtimeChecks);
}

for (const check of checks) {
  const source = readFileSync(new URL(`../${check.file}`, import.meta.url), "utf8");
  for (const pattern of check.patterns) {
    if (!pattern.test(source)) {
      process.stderr.write(`Public API docs smoke missing ${pattern} in ${check.file}\n`);
      process.exit(1);
    }
  }

  for (const pattern of check.forbidden ?? []) {
    if (pattern.test(source)) {
      process.stderr.write(`Public API docs smoke found forbidden ${pattern} in ${check.file}\n`);
      process.exit(1);
    }
  }
}

process.stdout.write(`Public API docs ${runtimeMode ? "runtime " : ""}smoke passed.\n`);
