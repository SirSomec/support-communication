export interface ConversationMessage {
  attachments?: Array<Record<string, unknown>>;
  author?: string;
  createdAt?: string;
  id: string | number;
  side?: "agent" | "client";
  text: string;
  time: string;
  type?: "event" | "internal" | "csat_feedback";
}

// Комментарий к CSAT-оценке: после оценки закрытое обращение ждет отзыв
// клиента, и его следующее сообщение не открывает новое обращение.
export interface ConversationCsatFeedbackState {
  offeredAt: string;
  ratingId: string;
  state: "awaiting" | "received" | "declined";
}

export interface ConversationAppealMetadata {
  anchorId?: string;
  closedAt?: string;
  csatFeedback?: ConversationCsatFeedbackState;
  isRepeatAppeal?: boolean;
  parentConversationId?: string;
}

// Read-time данные для инбокса: активная бот-сессия и последняя клиентская
// оценка живут в доменах automation/quality и подмешиваются при выдаче,
// в conversations они не персистятся.
export interface ConversationBotSession {
  scenarioId: string;
  status: "active" | "completed" | "dead_lettered" | "handoff" | "retry_scheduled";
  updatedAt: string;
}

export interface ConversationQualityAssessment {
  createdAt: string;
  scale: string;
  score: number | null;
}

export interface ConversationRecord {
  avatar?: string;
  botHandoff?: {
    aiOutcome?: string;
    botId?: string;
    citations?: Array<{ sourceId: string; title: string; version?: number }>;
    collectedFields?: Record<string, unknown>;
    goal?: string;
    nodeId?: string;
    phone?: string;
    queue?: string;
    reason?: string;
    scenarioName?: string;
    sessionState?: string;
    topic?: string;
  };
  botSession?: ConversationBotSession;
  channel: string;
  channelConnectionId?: string;
  clientSince: string;
  device: string;
  entry: string;
  id: string;
  initials: string;
  language: string;
  messages: ConversationMessage[];
  metadata?: ConversationAppealMetadata;
  name: string;
  operatorId?: string;
  operatorName?: string;
  phone: string;
  preview: string;
  previous: string[][];
  providerConversationId?: string;
  providerUserId?: string;
  qualityAssessment?: ConversationQualityAssessment;
  queueId?: string;
  rescueState?: Record<string, unknown>;
  resolutionOutcome?: string;
  sla: string;
  slaTone: string;
  status: string;
  tags: string[];
  teamId?: string;
  tenantId: string;
  time: string;
  topic: string;
  unread?: boolean;
  updatedAt?: string;
}
