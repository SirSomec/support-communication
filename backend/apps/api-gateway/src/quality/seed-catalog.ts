import type { QualityMetric } from "./quality.types.js";
import type { QualityRatingRecord } from "./quality.repository.js";

// Персистированные клиентские оценки демо-диалогов: инбокс подсвечивает ими
// вкладку «Оценки». Идентификаторы совпадают с qualityMetrics, чтобы merge
// в quality workspace не плодил дубликатов строк.
export const qualityRatings: QualityRatingRecord[] = [
  {
    auditId: "evt_quality_seed_maria",
    channel: "MAX",
    clientId: "client-maria",
    conversationId: "maria",
    createdAt: "2026-07-15T16:20:00.000Z",
    operator: "operator-anna",
    ratingId: "csat-1001",
    realtimeEventId: "evt_quality_score_seed_maria",
    scale: "CSAT",
    score: 5,
    tenantId: "tenant-volga",
    topic: "Payment / Refund"
  },
  {
    auditId: "evt_quality_seed_vladimir",
    channel: "Telegram",
    clientId: "client-vladimir",
    conversationId: "vladimir",
    createdAt: "2026-07-15T18:45:00.000Z",
    operator: "operator-kirill",
    ratingId: "csat-1002",
    realtimeEventId: "evt_quality_score_seed_vladimir",
    scale: "CSAT",
    score: 2,
    tenantId: "tenant-volga",
    topic: "Product / Mismatch"
  }
];

export const qualityMetrics: QualityMetric[] = [
  {
    id: "csat-1001",
    conversationId: "maria",
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
    conversationId: "vladimir",
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
    conversationId: "olga",
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
    conversationId: "maria",
    type: "summary",
    title: "Краткое резюме",
    text: "Клиент ждет заказ. Проверить статус доставки и вернуться с точным сроком.",
    suggestedTopic: "Delivery / Status",
    tone: "calm",
    risk: "low",
    confidence: 94
  },
  {
    id: "ai-vladimir-reply",
    conversationId: "vladimir",
    type: "reply",
    title: "Ответ по несоответствию",
    text: "Понимаю, что товар не соответствует описанию. Проверю заказ и предложу обмен или возврат.",
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
