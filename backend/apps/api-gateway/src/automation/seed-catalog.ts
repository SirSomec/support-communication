import type { BotScenario, ProactiveRule } from "./automation.types.js";
import type { AutomationBotRuntimeInstance, AutomationBotScenarioVersion } from "./automation.repository.js";

// Закрепленная версия demo-сценария доставки: на нее ссылается (FK в Postgres)
// демо-инстанс бота ниже. Правила триггеров заданы явно — рантайм читает
// правила версии, а не сценария.
export const botScenarioVersions: AutomationBotScenarioVersion[] = [
  {
    createdAt: "2026-07-16T07:55:00.000Z",
    flowEdges: [
      { from: "delivery-message", to: "delivery-contact", label: "needs_contact" },
      { from: "delivery-contact", to: "delivery-handoff", label: "delay" }
    ],
    flowNodes: [
      { id: "delivery-message", type: "message", title: "Accept delivery question" },
      { id: "delivery-contact", type: "contact_request", title: "Verify contact" },
      { id: "delivery-handoff", type: "handoff", title: "Transfer to operator" }
    ],
    scenarioId: "bot-delivery-status",
    status: "published",
    tenantId: "tenant-volga",
    triggerRules: [{ id: "delivery-new-conversation", priority: 0, type: "new_conversation" }],
    versionId: "bot-delivery-status-v1"
  }
];

// Демо-диалог «olga» сейчас ведет бот: инстанс подсвечивает вкладку
// «У бота» в инбоксе без прогона реального сценария.
export const botRuntimeInstances: AutomationBotRuntimeInstance[] = [
  {
    attempts: 0,
    context: { lastClientMessage: "Как поменять способ оплаты?" },
    conversationId: "olga",
    createdAt: "2026-07-16T08:00:00.000Z",
    currentNodeId: "delivery-contact",
    id: "bot_runtime_seed_olga",
    lastError: null,
    nextAttemptAt: null,
    scenarioId: "bot-delivery-status",
    status: "active",
    tenantId: "tenant-volga",
    updatedAt: "2026-07-16T08:05:00.000Z",
    versionId: "bot-delivery-status-v1"
  }
];

export const botScenarios: BotScenario[] = [
  {
    id: "bot-delivery-status",
    name: "Delivery status",
    status: "draft",
    schemaVersion: "bot-flow/v1",
    tenantId: "tenant-volga",
    channels: ["SDK", "Telegram"],
    flowNodes: [
      { id: "delivery-message", type: "message", title: "Accept delivery question" },
      { id: "delivery-contact", type: "contact_request", title: "Verify contact" },
      { id: "delivery-handoff", type: "handoff", title: "Transfer to operator" }
    ],
    flowEdges: [
      { from: "delivery-message", to: "delivery-contact", label: "needs_contact" },
      { from: "delivery-contact", to: "delivery-handoff", label: "delay" }
    ],
    triggerRules: [{ id: "delivery-new-conversation", priority: 0, type: "new_conversation" }]
  },
  {
    id: "bot-auth-code",
    name: "Auth code",
    status: "test",
    schemaVersion: "bot-flow/v1",
    tenantId: "tenant-volga",
    channels: ["VK", "MAX"],
    flowNodes: [
      { id: "auth-message", type: "message", title: "Accept auth issue" },
      { id: "auth-webhook", type: "webhook", title: "Retry code delivery" },
      { id: "auth-fallback", type: "fallback", title: "Fallback to operator" }
    ],
    flowEdges: [
      { from: "auth-message", to: "auth-webhook", label: "cooldown_ok" },
      { from: "auth-webhook", to: "auth-fallback", label: "failed" }
    ],
    triggerRules: [{ id: "auth-new-conversation", priority: 10, type: "new_conversation" }]
  }
];

export const proactiveRules: ProactiveRule[] = [
  {
    id: "rule-checkout",
    channels: ["SDK", "Telegram"],
    tenantId: "tenant-volga",
    activeVariant: "A",
    cooldown: "24h",
    segment: "checkout",
    status: "enabled"
  },
  {
    id: "rule-returning-vk",
    channels: ["VK"],
    tenantId: "tenant-volga",
    activeVariant: "B",
    cooldown: "12h",
    segment: "returning",
    status: "paused"
  }
];

export const automationAuditEvents = [
  {
    id: "audit-bot-1001",
    action: "bot.publish",
    actor: "system",
    target: "bot-delivery-status",
    immutable: true,
    tenantId: "tenant-volga"
  },
  {
    id: "audit-proactive-1002",
    action: "proactive.rule.update",
    actor: "senior-operator",
    target: "rule-checkout",
    immutable: true,
    tenantId: "tenant-volga"
  }
];

export const runtimeMetrics = [
  {
    id: "bot-runtime",
    label: "Bot runtime",
    queue: "bot-runtime",
    value: "312",
    detail: "handled dialogs"
  },
  {
    id: "proactive-effectiveness",
    label: "Proactive effectiveness",
    queue: "proactive-delivery",
    value: "18%",
    detail: "started conversations"
  }
];
