export interface ConversationMessage {
  attachments?: Array<Record<string, unknown>>;
  author?: string;
  createdAt?: string;
  id: string | number;
  side?: "agent" | "client";
  text: string;
  time: string;
  type?: "event" | "internal";
}

export interface ConversationAppealMetadata {
  anchorId?: string;
  closedAt?: string;
  isRepeatAppeal?: boolean;
  parentConversationId?: string;
}

export interface ConversationRecord {
  avatar?: string;
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
