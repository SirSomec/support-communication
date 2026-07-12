import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiConnectionRepository } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";
import { AiConnectionsService } from "../apps/api-gateway/src/ai-connections/ai-connections.service.ts";
import { configureOpenAiCompatibleQualityProvider } from "../apps/api-gateway/src/quality/quality-scoring.openai-provider.ts";

describe("AI product configuration boundary", () => {
  it("never uses Quality AI credentials for the tenant consultation assistant", async () => {
    const service = new AiConnectionsService(AiConnectionRepository.inMemory(), {
      QUALITY_AI_API_KEY: "quality-only-secret",
      QUALITY_AI_ENABLED: "true",
      QUALITY_AI_MODEL: "quality-model"
    });
    const result = await service.create("tenant-a", { baseUrl: "https://ai.example.test/v1", chatModel: "support-model", secret: "support-secret" });

    assert.equal(result.status, "invalid");
    assert.equal(result.error?.message, "Secret storage is unavailable.");
    assert.doesNotMatch(JSON.stringify(result), /quality-only-secret|support-secret/);
  });

  it("never enables Quality AI from tenant assistant configuration", () => {
    const configuration = configureOpenAiCompatibleQualityProvider({
      AI_CONNECTIONS_MASTER_KEY: Buffer.alloc(32, 2).toString("base64"),
      AI_CONNECTIONS_MODEL: "support-model"
    } as NodeJS.ProcessEnv);

    assert.equal(configuration.configured, false);
    assert.equal(configuration.provider, null);
    assert.equal(configuration.reason, "disabled");
  });
});
