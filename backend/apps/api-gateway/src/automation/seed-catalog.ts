import type { BotScenario, ProactiveRule } from "./automation.types.js";

export const botScenarios: BotScenario[] = [
  {
    id: "bot-delivery-status",
    name: "Delivery status",
    status: "enabled",
    schemaVersion: "bot-flow/v1",
    tenantId: "tenant-demo",
    channels: ["SDK", "Telegram"],
    flowNodes: [
      { id: "delivery-message", type: "message", title: "Accept delivery question" },
      { id: "delivery-contact", type: "contact_request", title: "Verify contact" },
      { id: "delivery-handoff", type: "handoff", title: "Transfer to operator" }
    ],
    flowEdges: [
      { from: "delivery-message", to: "delivery-contact", label: "needs_contact" },
      { from: "delivery-contact", to: "delivery-handoff", label: "delay" }
    ]
  },
  {
    id: "bot-auth-code",
    name: "Auth code",
    status: "test",
    schemaVersion: "bot-flow/v1",
    tenantId: "tenant-demo",
    channels: ["VK", "MAX"],
    flowNodes: [
      { id: "auth-message", type: "message", title: "Accept auth issue" },
      { id: "auth-webhook", type: "webhook", title: "Retry code delivery" },
      { id: "auth-fallback", type: "fallback", title: "Fallback to operator" }
    ],
    flowEdges: [
      { from: "auth-message", to: "auth-webhook", label: "cooldown_ok" },
      { from: "auth-webhook", to: "auth-fallback", label: "failed" }
    ]
  }
];

export const proactiveRules: ProactiveRule[] = [
  {
    id: "rule-checkout",
    channels: ["SDK", "Telegram"],
    tenantId: "tenant-demo",
    activeVariant: "A",
    cooldown: "24h",
    segment: "checkout",
    status: "enabled"
  },
  {
    id: "rule-returning-vk",
    channels: ["VK"],
    tenantId: "tenant-demo",
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
    tenantId: "tenant-demo"
  },
  {
    id: "audit-proactive-1002",
    action: "proactive.rule.update",
    actor: "senior-operator",
    target: "rule-checkout",
    immutable: true,
    tenantId: "tenant-demo"
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
