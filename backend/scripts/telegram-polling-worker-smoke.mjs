import assert from "node:assert/strict";
import { createServer } from "node:http";
import { ConversationRepository } from "../apps/api-gateway/dist/conversation/conversation.repository.js";
import { ConversationService } from "../apps/api-gateway/dist/conversation/conversation.service.js";
import { IntegrationRepository } from "../apps/api-gateway/dist/integrations/integration.repository.js";
import { pollTelegramUpdatesOnce } from "../apps/api-gateway/dist/integrations/telegram-polling.worker.js";
import { telegramConversationId } from "../apps/api-gateway/dist/integrations/telegram-webhook.route.js";

const tenantId = "tenant-telegram-polling-smoke";
const botId = "456789";
const chatId = "778899";
const now = new Date().toISOString();
const integrationRepository = IntegrationRepository.inMemory();
const conversationRepository = ConversationRepository.inMemory();
const conversationService = new ConversationService(conversationRepository);

await integrationRepository.saveTelegramConnectionAsync({
  botId,
  botToken: `${botId}:smoke_token_123456`,
  botUsername: "polling_smoke_bot",
  createdAt: now,
  pollingOffset: 0,
  status: "active",
  tenantId,
  tokenPreview: `${botId}:****`,
  updatedAt: now,
  webhookSecret: "tg_wh_polling_smoke"
});

const server = createServer((request, response) => {
  if (!request.url?.includes("/getUpdates")) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false }));
    return;
  }

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({
    ok: true,
    result: [{
      message: {
        chat: { id: chatId, type: "private" },
        from: { first_name: "Polling", last_name: "Smoke" },
        message_id: 17,
        text: "Telegram polling smoke message"
      },
      update_id: 71
    }]
  }));
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const result = await pollTelegramUpdatesOnce({
    apiBaseUrl: `http://127.0.0.1:${address.port}`,
    conversationRepository,
    conversationService,
    integrationRepository,
    offsets: new Map(),
    timeoutMs: 2_000
  });

  assert.deepEqual(result, { accepted: 1, duplicates: 0, failed: 0, polled: 1 });
  const connection = await integrationRepository.findTelegramConnectionByTenantIdAsync(tenantId);
  assert.equal(connection?.pollingOffset, 72);
  const conversation = await conversationRepository.findConversation(telegramConversationId(tenantId, botId, chatId));
  assert.equal(conversation?.preview, "Telegram polling smoke message");
  assert.equal(conversation?.tenantId, tenantId);

  process.stdout.write("Telegram polling worker smoke completed.\n");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
