// Кому засчитывается оценка, когда обращение закрыл бот/автоматика и у
// диалога нет операторного следа: клиент оценивает автоматическое решение.
export const AI_CLOSED_CONVERSATION_OPERATOR = "ai-bot";

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
