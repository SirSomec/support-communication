import { writeStructuredLog } from "@support-communication/observability";
import { ConversationRepository } from "../../conversation/conversation.repository.js";
import { OpenChannelRepository } from "./open-channel.repository.js";
import { ExternalBotBridge } from "./external-bot.route.js";
import { OpenChannelEventPump } from "./open-channel-event-pump.js";
import { openChannelDeliveryService, resolveAgentsOnline } from "./open-channel-public.controller.js";

/**
 * Background loops of the external integration layer: the delivery queue
 * (event webhooks / Open Channel chat / bot events with retries) and the
 * realtime-event pump that converts platform events into outbound
 * notifications. Disabled with OPEN_CHANNEL_DISABLED=true.
 */
export function startOpenChannelRuntime(env: Record<string, string | undefined> = process.env): { stop(): void } | null {
  if (String(env.OPEN_CHANNEL_DISABLED ?? "").trim() === "true") {
    return null;
  }

  const repository = OpenChannelRepository.default();
  const conversationRepository = ConversationRepository.default();
  const delivery = openChannelDeliveryService();
  const pump = new OpenChannelEventPump({
    botBridge: new ExternalBotBridge({
      agentsOnline: (tenantId) => resolveAgentsOnline(tenantId),
      delivery,
      repository
    }),
    conversationRepository,
    delivery,
    repository
  });

  const deliveryIntervalMs = positiveInteger(env.OPEN_CHANNEL_DELIVERY_INTERVAL_MS) ?? 3_000;
  const pumpIntervalMs = positiveInteger(env.OPEN_CHANNEL_PUMP_INTERVAL_MS) ?? 2_000;
  delivery.start(deliveryIntervalMs);
  pump.start(pumpIntervalMs);

  writeStructuredLog("info", "Open channel runtime started", {
    deliveryIntervalMs,
    operation: "openChannelRuntimeStart",
    pumpIntervalMs,
    service: "api-gateway"
  });

  return {
    stop() {
      delivery.stop();
      pump.stop();
    }
  };
}

function positiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
