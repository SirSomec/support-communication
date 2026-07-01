export interface QualityMetric {
  channel: string;
  client: string;
  conversationId: string;
  id: string;
  operator: string;
  scale: "CSAT" | "CSI" | "QA";
  score: number;
  status: string;
  topic: string;
}

export const qualityMetrics: QualityMetric[] = [
  {
    id: "csat-1001",
    conversationId: "conv-maria",
    client: "client-maria",
    score: 5,
    scale: "CSAT",
    channel: "MAX",
    operator: "operator-anna",
    topic: "Payment / Refund",
    status: "reported"
  },
  {
    id: "csat-1002",
    conversationId: "conv-vladimir",
    client: "client-vladimir",
    score: 2,
    scale: "CSAT",
    channel: "Telegram",
    operator: "operator-kirill",
    topic: "Product / Mismatch",
    status: "low_score"
  },
  {
    id: "qa-204",
    conversationId: "conv-olga",
    client: "client-olga",
    score: 92,
    scale: "QA",
    channel: "SDK",
    operator: "operator-ivan",
    topic: "Delivery / Status",
    status: "coaching_sent"
  }
];

export const aiSuggestions = [
  {
    id: "ai-maria-summary",
    conversationId: "conv-maria",
    type: "summary",
    title: "Conversation summary",
    suggestedTopic: "Delivery / Status",
    tone: "calm",
    risk: "low",
    confidence: 94
  },
  {
    id: "ai-vladimir-reply",
    conversationId: "conv-vladimir",
    type: "reply",
    title: "Suggested reply",
    suggestedTopic: "Product / Mismatch",
    tone: "needs apology",
    risk: "sla_overdue",
    confidence: 88
  }
];

export const knowledgeArticles = [
  {
    id: "kb-delivery-tracking",
    title: "Delivery tracking",
    status: "published",
    topics: ["Delivery / Status"],
    channels: ["SDK", "Telegram", "MAX", "VK"],
    version: "v4.2"
  }
];

export const aiRealtimeChecks = [
  {
    id: "tone-empathy",
    label: "Empathy and tone",
    score: 92,
    state: "ok"
  },
  {
    id: "risk-language",
    label: "Risky wording",
    score: 43,
    state: "danger"
  }
];

export const aiCoachingQueue = [
  {
    id: "coach-vladimir-next-step",
    channel: "Telegram",
    client: "client-vladimir",
    severity: "warn",
    topic: "Product / Mismatch",
    trigger: "missing_next_step"
  }
];

export const aiEffectivenessMetrics = [
  {
    id: "accepted-rate",
    label: "Accepted without edits",
    value: "64%",
    detail: "reply and article suggestions"
  },
  {
    id: "false-positive",
    label: "False positives",
    value: "5%",
    detail: "rejected by senior QA"
  }
];
