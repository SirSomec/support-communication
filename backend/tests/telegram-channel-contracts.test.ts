import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IntegrationRepository } from "../apps/api-gateway/dist/integrations/integration.repository.js";
import { IntegrationService } from "../apps/api-gateway/dist/integrations/integration.service.js";
import { saveTelegramConnectionRecord } from "../apps/api-gateway/dist/integrations/telegram-channel-connection.js";

const TENANT_ID = "tenant-pilot-001";

describe("tenant telegram channel settings contracts", () => {
  it("saves bot token for tenant and returns masked connection with webhook instructions", async () => {
    const repository = IntegrationRepository.inMemory();
    const service = new IntegrationService(repository);

    const saved = await service.saveTelegramConnection(TENANT_ID, {
      botToken: "7123456789:AAH-test-token-value"
    }, {
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { id: 7123456789, username: "pilot_support_bot" }
        })
      })
    });

    assert.equal(saved.status, "ok");
    assert.equal(saved.data.connection.tenantId, TENANT_ID);
    assert.equal(saved.data.connection.tokenConfigured, true);
    assert.equal(saved.data.connection.tokenPreview, "7123456789:****");
    assert.equal(saved.data.connection.botUsername, "pilot_support_bot");
    assert.match(String(saved.data.connection.webhookUrl), /\/api\/v1\/webhooks\/telegram$/);
    assert.equal(typeof saved.data.connection.webhookSecret, "string");

    const fetched = await service.fetchTelegramConnection(TENANT_ID);
    assert.equal(fetched.data.connection.tokenConfigured, true);
    assert.equal(fetched.data.connection.botToken, undefined);
  });

  it("rejects invalid bot token on save", async () => {
    const service = new IntegrationService(IntegrationRepository.inMemory());
    const response = await service.saveTelegramConnection(TENANT_ID, {
      botToken: "not-a-token"
    });

    assert.equal(response.status, "invalid");
    assert.equal(response.error?.code, "telegram_bot_token_invalid");
  });

  it("disconnects tenant telegram connection", async () => {
    const repository = IntegrationRepository.inMemory();
    const record = await saveTelegramConnectionRecord({
      botToken: "7123456789:AAH-test-token-value",
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { id: 7123456789, username: "pilot_support_bot" }
        })
      }),
      publicWebhookBaseUrl: "https://support.example",
      tenantId: TENANT_ID
    });
    repository.saveTelegramConnection(record);

    const service = new IntegrationService(repository);
    const disconnected = await service.disconnectTelegramConnection(TENANT_ID);

    assert.equal(disconnected.status, "ok");
    assert.equal(disconnected.data.connection.status, "disabled");
    assert.equal(disconnected.data.connection.tokenConfigured, false);
  });
});
