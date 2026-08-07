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
      /operationId:\s*"createPublicSdkUpload"/,
      /operationId:\s*"identifyPublicSdkClient"/,
      /operationId:\s*"pollPublicSdkMessages"/,
      /PUBLIC_SDK_MESSAGE_BODY_SCHEMA/,
      /PUBLIC_SDK_RATING_BODY_SCHEMA/,
      /ApiPublicEnvironment/,
      /denial envelopes include rate-limit metadata/
    ]
  },
  {
    file: "apps/api-gateway/src/integrations/public-api.openapi.ts",
    patterns: [
      /PUBLIC_API_ENVIRONMENT_QUERY/,
      /required:\s*false/,
      /PUBLIC_API_ENVELOPE_SCHEMA/,
      /PUBLIC_SDK_UPLOAD_BODY_SCHEMA/,
      /PUBLIC_SDK_MESSAGE_BODY_SCHEMA/,
      /PUBLIC_SDK_CLIENT_INFO_BODY_SCHEMA/,
      /OPEN_CHANNEL_EVENT_BODY_SCHEMA/,
      /visitorSessionToken/
    ]
  },
  {
    file: "apps/api-gateway/src/openapi.ts",
    patterns: [
      /Support Communication Client API/,
      /Руководство для разработчиков/,
      /displayOperationId:\s*true/,
      /persistAuthorization:\s*false/,
      /pruneUnusedSchemas\(document\)/
    ],
    forbidden: [
      /Phase 0 API Gateway shell/
    ]
  },
  {
    file: "../src/features/public/ApiDocsPage.jsx",
    patterns: [
      /const pollExample/,
      /const uploadExample/,
      /client_updated/,
      /idempotency-key/,
      /visitorSessionToken/
    ],
    forbidden: [
      /x-webhook-nonce/
    ]
  },
  {
    file: "docs/public-api-examples.md",
    patterns: [
      /## Sandbox SDK identify/,
      /## Public demo request/,
      /## Production SDK identify/,
      /## Signed webhook receive/,
      /POST \/api\/v1\/public\/demo-requests/,
      /Authorization: Bearer sk_test_<sandbox_public_api_key>/,
      /Authorization: Bearer sk_live_<production_public_api_key>/,
      /X-Webhook-Signature: sha256=<hmac_sha256_hex>/
    ],
    forbidden: [
      /sk_live_[A-Za-z0-9]{8,}/,
      /whsec_[A-Za-z0-9_]+/
    ]
  },
  {
    file: "../docs/open-channel-api.md",
    patterns: [
      /`chat_accepted`, `chat_updated`, `chat_finished`, `client_updated`,\s*`client_attribute_updated`, `offline_message`/,
      /`invalid_client` \(401\), `invalid_request` \(400\)/,
      /`offline_message` \| Виджет отправил офлайн-сообщение/,
      /результат `CLIENT_RATED` пересылается бот-провайдеру/
    ],
    forbidden: [
      /\bunauthorized_client\b/,
      /\bdepartment\b/
    ]
  },
  {
    file: "apps/api-gateway/src/integrations/open-channel/open-channel-admin.controller.ts",
    patterns: [
      /SUPPORTED_WEBHOOK_EVENTS = \["chat_accepted", "chat_updated", "chat_finished", "client_attribute_updated", "client_updated", "offline_message"\]/
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
