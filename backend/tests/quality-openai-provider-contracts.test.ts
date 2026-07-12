import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID,
  configureOpenAiCompatibleQualityProvider,
  createOpenAiCompatibleQualityScoringProvider,
  redactQualityDraftText,
  type QualityAiProviderConfiguration
} from "../apps/api-gateway/src/quality/quality-scoring.openai-provider.ts";
import { QUALITY_SCORING_PROVIDER_PORT_VERSION } from "../apps/api-gateway/src/quality/quality-scoring.provider.ts";
import { QualityRepository } from "../apps/api-gateway/src/quality/quality.repository.ts";
import { QualityService } from "../apps/api-gateway/src/quality/quality.service.ts";

describe("OpenAI-compatible quality scoring provider", () => {
  it("redacts obvious email and phone values before the HTTP request", async () => {
    const bodies: string[] = [];
    const provider = createOpenAiCompatibleQualityScoringProvider({
      apiKey: "test-secret",
      baseUrl: "https://quality.example.test/v1",
      maxRetries: 0,
      model: "quality-model",
      rateLimitPerMinute: 10,
      timeoutMs: 500
    }, {
      fetch: async (_url, init) => {
        bodies.push(String(init?.body));
        return jsonResponse(validProviderPayload());
      }
    });

    const result = await provider.score(providerRequest("Contact jane@example.com or +7 (999) 123-45-67"));

    assert.equal(result.status, "ok");
    assert.equal(bodies.length, 1);
    assert.doesNotMatch(bodies[0], /jane@example\.com|999|123-45-67/);
    assert.match(bodies[0], /REDACTED_EMAIL/);
    assert.match(bodies[0], /REDACTED_PHONE/);
    assert.equal(redactQualityDraftText("mail a@b.ru phone 8 900 123 45 67"), "mail [REDACTED_EMAIL] phone [REDACTED_PHONE]");
  });

  it("maps provider result id, model version and token usage through the existing port", async () => {
    const provider = createOpenAiCompatibleQualityScoringProvider({
      apiKey: "test-secret",
      baseUrl: "https://quality.example.test/v1/",
      maxRetries: 0,
      model: "configured-model"
    }, { fetch: async () => jsonResponse(validProviderPayload()) });

    const result = await provider.score(providerRequest("I understand and will check this now."));

    assert.equal(result.status, "ok");
    assert.equal(result.providerResultId, "chatcmpl-quality-1");
    assert.equal(result.explainability.modelVersion, "served-model-v2");
    assert.deepEqual(result.telemetry.usage, { inputTokens: 41, outputTokens: 17 });
  });

  it("bounds retries and applies a local per-minute rate limit", async () => {
    let calls = 0;
    const provider = createOpenAiCompatibleQualityScoringProvider({
      apiKey: "test-secret",
      baseUrl: "https://quality.example.test/v1",
      maxRetries: 2,
      model: "quality-model",
      rateLimitPerMinute: 1
    }, {
      fetch: async () => { calls += 1; return new Response("unavailable", { status: 503 }); },
      sleep: async () => undefined
    });

    const failed = await provider.score(providerRequest("First"));
    const limited = await provider.score(providerRequest("Second"));

    assert.equal(calls, 3);
    assert.equal(failed.status, "failed");
    assert.equal(failed.status === "failed" && failed.error.code, "provider_unavailable");
    assert.equal(limited.status, "failed");
    assert.equal(limited.status === "failed" && limited.error.code, "provider_rate_limited");
  });

  it("aborts a slow request at the configured timeout", async () => {
    const provider = createOpenAiCompatibleQualityScoringProvider({
      apiKey: "test-secret",
      baseUrl: "https://quality.example.test/v1",
      maxRetries: 0,
      model: "quality-model",
      timeoutMs: 100
    }, {
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })
    });

    const result = await provider.score(providerRequest("Slow request"));

    assert.equal(result.status, "failed");
    assert.equal(result.status === "failed" && result.error.code, "provider_timeout");
  });

  it("reports incomplete environment configuration honestly", () => {
    const disabled = configureOpenAiCompatibleQualityProvider({ QUALITY_AI_ENABLED: "false" });
    const missingKey = configureOpenAiCompatibleQualityProvider({
      QUALITY_AI_BASE_URL: "https://quality.example.test/v1",
      QUALITY_AI_ENABLED: "true",
      QUALITY_AI_MODEL: "quality-model"
    });

    assert.deepEqual(disabled, { configured: false, model: null, provider: null, providerId: null, reason: "disabled" });
    assert.equal(missingKey.configured, false);
    assert.equal(missingKey.reason, "missing_api_key");
  });
});

describe("quality service AI consent and fallback", () => {
  it("fails closed without explicit consent and never calls the external provider", async () => {
    let calls = 0;
    const repository = QualityRepository.inMemory();
    const service = new QualityService(repository, configuredProvider(async () => {
      calls += 1;
      return jsonResponse(validProviderPayload());
    }));

    const result = await service.scoreDraftResponse({
      conversationId: "conversation-no-consent",
      text: "I understand and will check this now."
    }, { tenantId: "tenant-quality-ai" });

    assert.equal(result.status, "ok");
    assert.equal(calls, 0);
    assert.equal(result.data.scoringMode, "rules");
    assert.equal(result.data.fallbackReason, "consent_required");
  });

  it("uses AI with consent and persists provider identity while recording model and usage in lifecycle data", async () => {
    const repository = QualityRepository.inMemory();
    const service = new QualityService(repository, configuredProvider(async () => jsonResponse(validProviderPayload())));

    const result = await service.scoreDraftResponse({
      aiConsent: true,
      conversationId: "conversation-ai-consent",
      text: "I understand and will check this now."
    }, { tenantId: "tenant-quality-ai" });

    assert.equal(result.status, "ok");
    assert.equal(result.data.scoringMode, "ai");
    assert.equal(result.data.provider.providerResultId, "chatcmpl-quality-1");
    const audit = repository.listAiScoringAudits({ tenantId: "tenant-quality-ai" })[0];
    assert.equal(audit.providerId, OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID);
    assert.equal(audit.providerResultId, "chatcmpl-quality-1");
    const lifecycle = repository.readState().lifecycleEvents?.[0];
    assert.equal(lifecycle?.data.modelVersion, "served-model-v2");
    assert.deepEqual(lifecycle?.data.usage, { inputTokens: 41, outputTokens: 17 });
  });

  it("falls back safely when the provider response is invalid", async () => {
    const repository = QualityRepository.inMemory();
    const service = new QualityService(repository, configuredProvider(async () => jsonResponse({ choices: [] })));

    const result = await service.scoreDraftResponse({
      aiConsent: true,
      conversationId: "conversation-ai-fallback",
      text: "Too short"
    }, { tenantId: "tenant-quality-ai" });

    assert.equal(result.status, "ok");
    assert.equal(result.data.scoringMode, "rules");
    assert.equal(result.data.fallbackReason, "invalid_response");
    assert.equal(repository.listAiScoringAudits({ tenantId: "tenant-quality-ai" })[0].status, "ok");
  });

  it("exposes connected capabilities only for a complete provider configuration", async () => {
    const connected = new QualityService(QualityRepository.inMemory(), configuredProvider(async () => jsonResponse(validProviderPayload())));
    const disconnected = new QualityService(QualityRepository.inMemory(), {
      configured: false, model: null, provider: null, providerId: null, reason: "missing_api_key"
    });

    const connectedWorkspace = await connected.fetchQualityWorkspace({ tenantId: "tenant-quality-ai" });
    const disconnectedWorkspace = await disconnected.fetchQualityWorkspace({ tenantId: "tenant-quality-ai" });

    assert.equal(connectedWorkspace.data.capabilities.aiProviderConnected, true);
    assert.equal(connectedWorkspace.data.capabilities.aiConsentRequired, true);
    assert.equal(disconnectedWorkspace.data.capabilities.aiProviderConnected, false);
    assert.equal(disconnectedWorkspace.data.capabilities.aiProviderReason, "missing_api_key");
  });
});

function configuredProvider(fetchImpl: typeof fetch): QualityAiProviderConfiguration {
  return {
    configured: true,
    model: "quality-model",
    provider: createOpenAiCompatibleQualityScoringProvider({
      apiKey: "test-secret",
      baseUrl: "https://quality.example.test/v1",
      maxRetries: 0,
      model: "quality-model"
    }, { fetch: fetchImpl }),
    providerId: OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID,
    reason: null
  };
}

function providerRequest(text: string) {
  return {
    channel: "Telegram",
    conversationId: "conversation-quality-provider",
    draft: { text },
    mode: "reply" as const,
    portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
    requestedAt: "2026-07-11T10:00:00.000Z",
    tenantId: "tenant-quality-provider",
    traceId: "trc_quality_provider"
  };
}

function validProviderPayload(): Record<string, unknown> {
  return {
    choices: [{ message: { content: JSON.stringify({
      checks: [{ detail: "Clear next step", id: "next-step", label: "Next step", tone: "ok" }],
      reasons: ["Clear and actionable"],
      repairActions: [],
      score: 93
    }) } }],
    id: "chatcmpl-quality-1",
    model: "served-model-v2",
    usage: { completion_tokens: 17, prompt_tokens: 41 }
  };
}

function jsonResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" }, status: 200 });
}
