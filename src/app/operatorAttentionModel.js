import { isAssignedToOperator } from "./dialogModel.js";

export function getAssignedConversationCount(conversations, operatorId) {
  if (!operatorId || !Array.isArray(conversations)) return 0;
  return conversations.filter((conversation) => conversation?.status !== "closed" && isAssignedToOperator(conversation, operatorId)).length;
}

export function isInboundAssignedMessageEvent(event, conversations, operatorId) {
  const mode = String(event?.data?.mode ?? "").trim();
  if (event?.eventName !== "message.created" || (mode && mode !== "inbound")) return false;
  const conversationId = String(event?.resourceId ?? "").trim();
  const conversation = conversations?.find((item) => item?.id === conversationId);
  return Boolean(conversation && isAssignedToOperator(conversation, operatorId));
}

export function formatFaviconBadgeCount(count) {
  const normalized = Math.max(0, Math.trunc(Number(count) || 0));
  return normalized > 99 ? "99+" : String(normalized);
}
