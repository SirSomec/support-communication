import { createEmptyWorkspaceState, type ClientProfileRecord, type KnowledgeArticle, type TemplateRecord, type WorkspaceState } from "./workspace.repository.js";

const clientProfileFixtures: ClientProfileRecord[] = [
  {
    id: "maria",
    tenantId: "tenant-volga",
    sourceProfileId: "src_sdk_maria",
    name: "Maria K.",
    channel: "SDK",
    phone: "+7 999 204-18-44",
    device: "Android",
    entry: "SDK",
    topic: "Delivery / Status",
    clientSince: "2024-05-12",
    previous: [["2024-05-05", "Return", "Closed"]]
  },
  {
    id: "dmitry",
    tenantId: "tenant-volga",
    sourceProfileId: "src_telegram_dmitry",
    name: "Dmitry S.",
    channel: "Telegram",
    phone: "+7 916 481-77-02",
    device: "iOS",
    entry: "Telegram",
    topic: "Delivery / Address",
    clientSince: "2024-06-03",
    previous: [["2024-05-11", "Promo code", "Closed"]]
  },
  {
    id: "olga",
    tenantId: "tenant-volga",
    sourceProfileId: "src_sdk_olga",
    name: "Olga L.",
    channel: "SDK",
    phone: "+7 985 430-09-40",
    device: "iOS",
    entry: "SDK",
    topic: "Payment / Refund",
    clientSince: "2024-03-14",
    previous: [["2024-05-28", "Card change", "Closed"]]
  }
];

const templateFixtures: TemplateRecord[] = [
  {
    id: "delay",
    tenantId: "tenant-volga",
    title: "Delivery delay",
    scope: "team",
    channel: "SDK",
    topic: "Delivery",
    usage: 184,
    updated: "2026-06-27T08:04:00.000Z",
    text: "I understand the wait. I will check the order status and return with the delivery window.",
    version: 3
  },
  {
    id: "refund",
    tenantId: "tenant-volga",
    title: "Refund status",
    scope: "team",
    channel: "VK",
    topic: "Payment",
    usage: 73,
    updated: "2026-06-20T12:00:00.000Z",
    text: "I will check the refund status and confirm the expected posting date.",
    version: 2
  }
];

const knowledgeFixtures: KnowledgeArticle[] = [
  {
    id: "kb-delivery-tracking",
    tenantId: "tenant-volga",
    title: "Order tracking",
    status: "published",
    category: "Delivery",
    topics: ["Delivery / Status"],
    channels: ["SDK", "Telegram", "MAX", "VK"],
    visibility: "public",
    version: "v4.2",
    updated: "2026-06-27T10:40:00.000Z",
    owner: "Elena S.",
    usage: 312,
    helpfulRate: 89,
    body: "Check the order status in OMS and give the customer the current delivery stage.",
    attachments: [{ id: "att-delivery-map", name: "delivery-status-map.pdf", type: "PDF", size: "1.8 MB", status: "ready" }],
    versions: [
      { id: "kb-delivery-v42", label: "v4.2", status: "published", author: "Elena S.", updated: "2026-06-27T10:40:00.000Z" },
      { id: "kb-delivery-v41", label: "v4.1", status: "archived", author: "Ivan P.", updated: "2026-06-20T15:10:00.000Z" }
    ],
    approvalHistory: [
      { id: "approval-delivery-3", actor: "Elena S.", action: "published", tone: "ok" },
      { id: "approval-delivery-2", actor: "Anna R.", action: "sent_for_review", tone: "info" }
    ]
  },
  {
    id: "kb-refund-terms",
    tenantId: "tenant-volga",
    title: "Refund timelines",
    status: "review",
    category: "Payment",
    topics: ["Payment / Refund"],
    channels: ["SDK", "VK"],
    visibility: "public",
    version: "v2.0",
    updated: "2026-06-26T17:05:00.000Z",
    owner: "Anna R.",
    usage: 147,
    helpfulRate: 82,
    body: "Refund timing depends on payment method. Always include the next step and request number.",
    attachments: [{ id: "att-refund-policy", name: "refund-policy.pdf", type: "PDF", size: "920 KB", status: "ready" }],
    versions: [{ id: "kb-refund-v20", label: "v2.0", status: "review", author: "Anna R.", updated: "2026-06-26T17:05:00.000Z" }],
    approvalHistory: [{ id: "approval-refund-2", actor: "Anna R.", action: "sent_for_review", tone: "info" }]
  },
  {
    id: "kb-auth-code",
    tenantId: "tenant-volga",
    title: "Confirmation code not received",
    status: "draft",
    category: "Authorization",
    topics: ["Authorization / Code"],
    channels: ["VK", "MAX"],
    visibility: "internal",
    version: "v0.7",
    updated: "2026-06-22T12:00:00.000Z",
    owner: "Oleg N.",
    usage: 38,
    helpfulRate: 74,
    body: "Check code send limits and phone freshness before publishing.",
    attachments: [{ id: "att-auth-checklist", name: "auth-checklist.md", type: "MD", size: "24 KB", status: "ready" }],
    versions: [{ id: "kb-auth-v07", label: "v0.7", status: "draft", author: "Oleg N.", updated: "2026-06-22T12:00:00.000Z" }],
    approvalHistory: [{ id: "approval-auth-1", actor: "Oleg N.", action: "created_draft", tone: "info" }]
  },
  {
    // Стабильная опубликованная статья для смоков массового одобрения источников:
    // другие сценарии её не редактируют, поэтому она всегда published.
    id: "kb-return-policy",
    tenantId: "tenant-volga",
    title: "Return policy",
    status: "published",
    category: "Delivery",
    topics: ["Delivery / Returns"],
    channels: ["SDK", "Telegram"],
    visibility: "public",
    version: "v1.0",
    updated: "2026-07-01T09:00:00.000Z",
    owner: "Elena S.",
    usage: 54,
    helpfulRate: 91,
    body: "Returns are accepted within 14 days. Refund is issued to the original payment method after inspection.",
    attachments: [],
    versions: [{ id: "kb-return-v10", label: "v1.0", status: "published", author: "Elena S.", updated: "2026-07-01T09:00:00.000Z" }],
    approvalHistory: [{ id: "approval-return-1", actor: "Elena S.", action: "published", tone: "ok" }]
  }
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function bootstrapWorkspaceState(base?: Partial<WorkspaceState>): WorkspaceState {
  const empty = createEmptyWorkspaceState();
  return {
    ...empty,
    ...base,
    clientProfiles: base?.clientProfiles ?? clone(clientProfileFixtures),
    knowledgeArticles: base?.knowledgeArticles ?? clone(knowledgeFixtures),
    templates: base?.templates ?? clone(templateFixtures)
  };
}
