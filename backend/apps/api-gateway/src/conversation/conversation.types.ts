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

export interface ConversationRecord {
  avatar?: string;
  channel: string;
  clientSince: string;
  device: string;
  entry: string;
  id: string;
  initials: string;
  language: string;
  messages: ConversationMessage[];
  name: string;
  operatorId?: string;
  operatorName?: string;
  phone: string;
  preview: string;
  previous: string[][];
  sla: string;
  slaTone: string;
  status: string;
  tags: string[];
  tenantId?: string;
  time: string;
  topic: string;
  unread?: boolean;
  updatedAt?: string;
}
