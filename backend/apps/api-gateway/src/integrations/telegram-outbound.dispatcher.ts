import type {
  OutboundMessageDispatcher,
  OutboundMessageDispatchRequest,
  OutboundMessageDispatchResult
} from "../conversation/conversation.service.js";
import { IntegrationRepository, type TelegramConnectionStoredRecord } from "./integration.repository.js";
import { findActiveTelegramBotToken } from "./telegram-channel-connection.js";

interface TelegramSendMessageResponse {
  ok: boolean;
  result?: {
    message_id?: number | string;
  };
}

interface TelegramOutboundDispatcherOptions {
  apiBaseUrl?: string;
  fetcher?: TelegramOutboundFetch;
  integrationRepository?: TelegramConnectionReader;
}

interface TelegramConnectionReader {
  listTelegramConnections(): TelegramConnectionStoredRecord[];
  listTelegramConnectionsAsync?(): Promise<TelegramConnectionStoredRecord[]>;
}

interface TelegramOutboundFetch {
  (input: string, init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
  }): Promise<{ json(): Promise<unknown>; ok: boolean; status: number }> | { json(): Promise<unknown>; ok: boolean; status: number };
}

const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export function createTelegramOutboundMessageDispatcher(
  options: TelegramOutboundDispatcherOptions = {}
): OutboundMessageDispatcher {
  const apiBaseUrl = String(options.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL).replace(/\/+$/, "");
  const fetcher = options.fetcher ?? globalThis.fetch;
  const integrationRepository = options.integrationRepository ?? IntegrationRepository.default();

  return {
    async deliverMessage(request: OutboundMessageDispatchRequest): Promise<OutboundMessageDispatchResult> {
      if (String(request.channel).trim().toLowerCase() !== "telegram") {
        return { status: "skipped", reason: "channel_not_telegram" };
      }

      const connections = integrationRepository.listTelegramConnectionsAsync
        ? await integrationRepository.listTelegramConnectionsAsync()
        : integrationRepository.listTelegramConnections();
      const token = findActiveTelegramBotToken(connections, request.tenantId);
      if (!token) {
        return { status: "failed", reason: "telegram_connection_not_found" };
      }

      const chatId = String(request.chatId ?? request.conversationId ?? "").trim();
      const text = String(request.text ?? "").trim();
      if (!chatId) {
        return { status: "failed", reason: "telegram_chat_id_required" };
      }
      if (!text) {
        return { status: "failed", reason: "telegram_text_required" };
      }

      const endpoint = `${apiBaseUrl}/bot${token}/sendMessage`;
      const response = await fetcher(endpoint, {
        body: JSON.stringify({
          chat_id: chatId,
          disable_web_page_preview: true,
          text
        }),
        headers: {
          "content-type": "application/json",
          "idempotency-key": request.idempotencyKey,
          "x-trace-id": request.traceId
        },
        method: "POST"
      });

      let payload: TelegramSendMessageResponse | null = null;
      try {
        payload = await response.json() as TelegramSendMessageResponse;
      } catch {
        payload = null;
      }

      if (!response.ok || payload?.ok === false) {
        return {
          providerStatus: response.status,
          reason: `telegram_dispatch_failed:${response.status}`,
          status: "failed"
        };
      }

      return {
        providerMessageId: payload?.result?.message_id === undefined
          ? undefined
          : String(payload.result.message_id),
        providerStatus: response.status,
        status: "delivered"
      };
    }
  };
}
