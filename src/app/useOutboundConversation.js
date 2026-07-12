import { useCallback } from "react";
import { dialogService } from "../services/dialogService.js";

const nowLabel = "сейчас";

export async function submitOutboundConversation(
  outbound,
  {
    createOutboundConversationRequest = (payload) => dialogService.createOutboundConversationRequest(payload)
  } = {}
) {
  const payload = {
    channel: outbound.channel,
    ...(outbound.clientName?.trim() ? { clientName: outbound.clientName.trim() } : {}),
    message: outbound.message,
    phone: outbound.phone,
    topic: outbound.topic
  };
  const response = await createOutboundConversationRequest(payload);

  if (response.status !== "ok") {
    return {
      ok: false,
      message: response.error?.message ?? "Не удалось поставить исходящий диалог в очередь."
    };
  }

  const descriptor = response.data ?? {};
  if (!descriptor.descriptorId && !descriptor.backendQueueId) {
    return {
      ok: false,
      message: "API не вернул descriptor для исходящего диалога."
    };
  }

  return {
    ok: true,
    conversation: createQueuedOutboundConversation(outbound, descriptor)
  };
}

export function createQueuedOutboundConversation(outbound, descriptor) {
  const id = descriptor.descriptorId ?? descriptor.backendQueueId;
  const name = descriptor.clientName ?? outbound.clientName ?? "Новый клиент";
  const channel = descriptor.channel ?? outbound.channel;
  const message = descriptor.message ?? outbound.message;
  const phone = descriptor.phone ?? outbound.phone;
  const topic = descriptor.topic ?? outbound.topic;

  return {
    id,
    name,
    initials: createInitials(name),
    avatar: "",
    channel,
    phone,
    time: nowLabel,
    preview: message,
    status: descriptor.status ?? "queued",
    sla: "Ожидает отправки",
    slaTone: "hold",
    topic,
    unread: false,
    device: outbound.device,
    entry: channel,
    language: "Русский",
    clientSince: outbound.existing ? outbound.existing.clientSince : "Новый контакт",
    tags: ["исходящий", "queued", String(channel).toLowerCase()],
    previous: outbound.existing ? outbound.existing.previous : [],
    outboundDescriptor: {
      auditId: descriptor.auditId,
      backendQueueId: descriptor.backendQueueId,
      consentCheck: descriptor.consentCheck,
      descriptorId: descriptor.descriptorId,
      outboxEventId: descriptor.outboxEventId,
      queue: descriptor.queue,
      status: descriptor.status ?? "queued"
    },
    messages: [
      {
        id: `${id}-event`,
        type: "event",
        text: `Исходящий диалог поставлен в очередь ${descriptor.queue ?? "message-delivery"}`,
        time: nowLabel
      },
      {
        id: `${id}-agent`,
        side: "agent",
        text: message,
        time: nowLabel
      }
    ]
  };
}

function createInitials(name) {
  const initials = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return initials || "НК";
}

export function useOutboundConversation({
  clearAttachments,
  handleBackToDialogs,
  setConversationItems,
  setDraft,
  setOutboundOpen,
  setSelectedId,
  setToast,
  setTopics
}) {
  const handleOutboundClose = useCallback(() => {
    setOutboundOpen(false);
  }, [setOutboundOpen]);

  const handleOutboundCreate = useCallback(
    async (outbound) => {
      const result = await submitOutboundConversation(outbound);

      if (!result.ok) {
        setToast(result.message);
        return result;
      }

      const newConversation = result.conversation;

      setConversationItems((current) => [newConversation, ...current]);
      setTopics((current) => ({ ...current, [newConversation.id]: newConversation.topic }));
      setSelectedId(newConversation.id);
      setDraft("");
      clearAttachments();
      handleBackToDialogs();
      setOutboundOpen(false);
      setToast(`Исходящий диалог поставлен в очередь: ${outbound.phone}`);
      return result;
    },
    [
      clearAttachments,
      handleBackToDialogs,
      setConversationItems,
      setDraft,
      setOutboundOpen,
      setSelectedId,
      setToast,
      setTopics
    ]
  );

  return {
    handleOutboundClose,
    handleOutboundCreate
  };
}
