import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAuditEvent, getStatusMeta } from "./dialogModel.js";
import { isServiceTag } from "../features/dialogs/tagSuggestionModel.js";
import { clearTenantSession } from "./sessionStore.js";
import { mapApiConversation, mapApiConversationCollection } from "./conversationApiMapper.js";
import { useRealtimeInbox } from "./useRealtimeInbox.js";
import { dialogService } from "../services/dialogService.js";

const ATTACHMENT_PREVIEW_LABEL = "Вложение";
const NOW_LABEL = "сейчас";

export function useConversationInbox({ sessionActive = false, onPresenceEvent } = {}) {
  const [conversationItems, setConversationItems] = useState([]);
  const [topics, setTopics] = useState({});
  const [closedIds, setClosedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [assignees, setAssignees] = useState([]);
  const detailInFlightRef = useRef(new Set());
  const detailDebounceRef = useRef(new Map());
  const processedRealtimeEventIdsRef = useRef(new Set());
  const onPresenceEventRef = useRef(onPresenceEvent);

  useEffect(() => {
    onPresenceEventRef.current = onPresenceEvent;
  }, [onPresenceEvent]);

  const syncMetaFromItems = useCallback((items) => {
    setTopics(Object.fromEntries(items.map((conversation) => [conversation.id, conversation.topic ?? ""])));
    setClosedIds(new Set(items.filter((conversation) => conversation.status === "closed").map((conversation) => conversation.id)));
  }, []);

  const refreshInbox = useCallback(async () => {
    if (!sessionActive) {
      setConversationItems([]);
      setTopics({});
      setClosedIds(new Set());
      setError("");
      setLoading(false);
      return { ok: false };
    }

    setLoading(true);
    setRefreshing(true);
    setError("");
    const response = await dialogService.fetchDialogs({ page: 1, pageSize: 50 });
    if (response.status !== "ok") {
      if (response.error?.code === "unauthorized" || response.error?.code === "session_revoked" || response.error?.code === "session_expired") {
        clearTenantSession();
      }
      setError(response.error?.message ?? "Не удалось загрузить список диалогов.");
      setLoading(false);
      setRefreshing(false);
      return { ok: false, response };
    }

    const items = mapApiConversationCollection(response.data);
    setConversationItems(items);
    syncMetaFromItems(items);
    setLoading(false);
    setRefreshing(false);
    return { ok: true, response };
  }, [sessionActive, syncMetaFromItems]);

  useEffect(() => {
    void refreshInbox();
  }, [refreshInbox, sessionActive]);

  useEffect(() => {
    if (!sessionActive) {
      setAssignees([]);
      return;
    }

    let ignore = false;
    void dialogService.fetchAssignees().then((response) => {
      if (ignore) return;
      const items = response.status === "ok" && Array.isArray(response.data?.items)
        ? response.data.items
        : [];
      setAssignees(items.map((item) => ({
        id: String(item?.id ?? ""),
        name: String(item?.name ?? ""),
        role: String(item?.role ?? "")
      })).filter((item) => item.id && item.name));
    });

    return () => {
      ignore = true;
    };
  }, [sessionActive]);

  const appendMessage = useCallback(async (conversationId, message, options = {}) => {
    const optimistic = options.optimistic ?? true;
    const persist = options.persist ?? true;
    const temporaryId = `local-${Date.now()}`;
    const optimisticMessage = {
      id: message.id ?? temporaryId,
      ...message,
      time: message.time ?? NOW_LABEL
    };
    let previousConversation = null;

    if (optimistic) {
      setConversationItems((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) {
            return conversation;
          }

          previousConversation = conversation;
          return withAppendedMessage(conversation, optimisticMessage);
        })
      );
    }

    if (!persist) {
      return { ok: true, message: optimisticMessage };
    }

    const payload = {
      mode: message.type === "internal" ? "internal" : "reply",
      text: message.text,
      attachments: message.attachments
    };

    const response = await dialogService.appendMessage({
      conversationId,
      ...payload
    });

    if (response.status !== "ok") {
      if (optimistic && previousConversation) {
        setConversationItems((current) =>
          current.map((conversation) => (conversation.id === conversationId ? previousConversation : conversation))
        );
      }
      setError(response.error?.message ?? "Не удалось отправить сообщение.");
      return { ok: false, response };
    }

    const serverMessage = response.data?.message ? mapApiMessage(response.data.message) : null;
    if (serverMessage && optimistic) {
      setConversationItems((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) {
            return conversation;
          }

          return {
            ...conversation,
            messages: conversation.messages.map((item) => (item.id === optimisticMessage.id ? serverMessage : item)),
            preview: serverMessage.text || conversation.preview,
            time: mapTime(serverMessage.time)
          };
        })
      );
    } else if (serverMessage) {
      setConversationItems((current) =>
        current.map((conversation) => {
          if (conversation.id !== conversationId) {
            return conversation;
          }
          return withAppendedMessage(conversation, serverMessage);
        })
      );
    }

    return { ok: true, response };
  }, []);

  const applyConversationStatus = useCallback(async (conversationId, nextStatus, eventPayload) => {
    let previousConversation = null;
    setConversationItems((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        previousConversation = conversation;
        const meta = getStatusMeta(nextStatus);
        const nextTopic = typeof eventPayload === "object" && eventPayload?.toTopic
          ? eventPayload.toTopic
          : conversation.topic;
        const auditEvent = eventPayload
          ? createAuditEvent({
              eventKind: typeof eventPayload === "object" && eventPayload.eventKind ? eventPayload.eventKind : "status",
              fromStatus: conversation.status,
              toStatus: nextStatus,
              ...(typeof eventPayload === "string" ? { detail: eventPayload } : eventPayload)
            })
          : null;

        return {
          ...conversation,
          resolutionOutcome: nextStatus === "closed"
            ? eventPayload?.resolutionOutcome ?? conversation.resolutionOutcome
            : nextStatus === "reopened" ? "" : conversation.resolutionOutcome,
          status: nextStatus,
          topic: nextTopic,
          sla: meta.sla,
          slaTone: meta.tone,
          messages: auditEvent ? [...conversation.messages, auditEvent] : conversation.messages,
          time: NOW_LABEL
        };
      })
    );

    setClosedIds((current) => {
      const next = new Set(current);
      if (nextStatus === "closed") {
        next.add(conversationId);
      } else {
        next.delete(conversationId);
      }
      return next;
    });

    const response = await dialogService.transitionConversationStatus({
      conversationId,
      nextStatus,
      resolutionOutcome: typeof eventPayload === "object" ? eventPayload?.resolutionOutcome : undefined,
      topic: typeof eventPayload === "object" ? eventPayload?.toTopic : undefined
    });

    if (response.status !== "ok") {
      if (previousConversation) {
        setConversationItems((current) =>
          current.map((conversation) => (conversation.id === conversationId ? previousConversation : conversation))
        );
        setTopics((current) => ({ ...current, [conversationId]: previousConversation.topic ?? "" }));
        setClosedIds((current) => {
          const next = new Set(current);
          if (previousConversation.status === "closed") {
            next.add(conversationId);
          } else {
            next.delete(conversationId);
          }
          return next;
        });
      }

      setError(response.error?.message ?? "Не удалось обновить статус.");
      return { ok: false, response };
    }

    const serverConversation = response.data?.conversation ? mapApiConversation(response.data.conversation) : null;
    if (serverConversation) {
      setConversationItems((current) =>
        current.map((conversation) => (conversation.id === conversationId ? serverConversation : conversation))
      );
      setTopics((current) => ({ ...current, [conversationId]: serverConversation.topic ?? "" }));
      setClosedIds((current) => {
        const next = new Set(current);
        if (serverConversation.status === "closed") {
          next.add(conversationId);
        } else {
          next.delete(conversationId);
        }
        return next;
      });
    }

    return { ok: true, response };
  }, []);

  // Теги обновляются на уровне обращения; сервер сохраняет служебные метки
  // (repeat-appeal, appeal-anchor:*) сам, поэтому наружу уходят только видимые.
  const applyConversationTags = useCallback(async (conversationId, tags) => {
    let previousConversation = null;
    setConversationItems((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        previousConversation = conversation;
        const serviceTags = (conversation.tags ?? []).filter((tag) => isServiceTag(tag));
        return { ...conversation, tags: [...tags, ...serviceTags] };
      })
    );

    const response = await dialogService.updateConversationTags({ conversationId, tags });

    if (response.status !== "ok") {
      if (previousConversation) {
        setConversationItems((current) =>
          current.map((conversation) => (conversation.id === conversationId ? previousConversation : conversation))
        );
      }
      setError(response.error?.message ?? "Не удалось обновить теги.");
      return { ok: false, response };
    }

    const serverTags = Array.isArray(response.data?.tags) ? response.data.tags.map((tag) => String(tag)) : null;
    if (serverTags) {
      setConversationItems((current) =>
        current.map((conversation) => (conversation.id === conversationId ? { ...conversation, tags: serverTags } : conversation))
      );
    }

    return { ok: true, response };
  }, []);

  // Телефон, введенный оператором, применяется оптимистично и откатывается,
  // если сервер отклонил значение (формат проверяется и на бэкенде).
  const applyConversationClientPhone = useCallback(async (conversationId, phone) => {
    let previousConversation = null;
    setConversationItems((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        previousConversation = conversation;
        return { ...conversation, phone };
      })
    );

    const response = await dialogService.updateConversationClientPhone({ conversationId, phone });

    if (response.status !== "ok") {
      if (previousConversation) {
        setConversationItems((current) =>
          current.map((conversation) => (conversation.id === conversationId ? previousConversation : conversation))
        );
      }
      setError(response.error?.message ?? "Не удалось обновить телефон клиента.");
      return { ok: false, response };
    }

    const serverPhone = typeof response.data?.phone === "string" ? response.data.phone : phone;
    setConversationItems((current) =>
      current.map((conversation) => (conversation.id === conversationId ? { ...conversation, phone: serverPhone } : conversation))
    );

    return { ok: true, response };
  }, []);

  const applyConversationAssignment = useCallback(async (conversationId, payload) => {
    const response = await dialogService.assignConversation({ conversationId, ...payload });
    if (response.status !== "ok") {
      const message = response.error?.message ?? "Не удалось назначить оператора.";
      setError(message);
      return { ok: false, message, response };
    }

    const serverConversation = response.data?.conversation
      ? mapApiConversation(response.data.conversation)
      : null;
    if (serverConversation) {
      setConversationItems((current) => current.map((conversation) => (
        conversation.id === conversationId ? serverConversation : conversation
      )));
    }
    setError("");
    return { ok: true, response };
  }, []);

  const loadConversationDetail = useCallback(async (conversationId, options = {}) => {
    const normalizedId = String(conversationId ?? "").trim();
    if (!sessionActive || !normalizedId || normalizedId === "empty") {
      return { ok: false };
    }

    if (!options.force && detailInFlightRef.current.has(normalizedId)) {
      return { ok: false, skipped: true };
    }

    detailInFlightRef.current.add(normalizedId);
    const response = await dialogService.fetchDialogDetail(normalizedId);
    if (response.status !== "ok") {
      detailInFlightRef.current.delete(normalizedId);
      return { ok: false, response };
    }

    const mapped = mapApiConversation({
      ...(response.data?.conversation ?? {}),
      lifecycleEvents: response.data?.lifecycleEvents ?? []
    });
    setConversationItems((current) =>
      current.some((item) => item.id === mapped.id)
        ? current.map((item) => (item.id === mapped.id ? mapped : item))
        : [mapped, ...current]
    );
    setTopics((current) => ({ ...current, [mapped.id]: mapped.topic ?? "" }));
    setClosedIds((current) => {
      const next = new Set(current);
      if (mapped.status === "closed") {
        next.add(mapped.id);
      } else {
        next.delete(mapped.id);
      }
      return next;
    });
    detailInFlightRef.current.delete(normalizedId);
    return { ok: true, response };
  }, [sessionActive]);

  const scheduleConversationDetailRefresh = useCallback((conversationId) => {
    const normalizedId = String(conversationId ?? "").trim();
    if (!normalizedId || normalizedId === "empty") {
      return;
    }

    const timers = detailDebounceRef.current;
    const existingTimer = timers.get(normalizedId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    timers.set(
      normalizedId,
      window.setTimeout(() => {
        timers.delete(normalizedId);
        void loadConversationDetail(normalizedId);
      }, 400)
    );
  }, [loadConversationDetail]);

  useEffect(() => () => {
    for (const timer of detailDebounceRef.current.values()) {
      window.clearTimeout(timer);
    }
    detailDebounceRef.current.clear();
    detailInFlightRef.current.clear();
    processedRealtimeEventIdsRef.current.clear();
  }, []);

  const handleRealtimeEvent = useCallback((event) => {
    const isPresenceEvent = event.eventName === "operator.presence.updated";
    if (!isPresenceEvent && event.eventName !== "message.created" && event.eventName !== "conversation.updated") {
      return;
    }

    const eventId = String(event?.eventId ?? "").trim();
    if (eventId) {
      const processed = processedRealtimeEventIdsRef.current;
      if (processed.has(eventId)) {
        return;
      }
      processed.add(eventId);
      if (processed.size > 500) {
        const staleIds = [...processed].slice(0, processed.size - 250);
        staleIds.forEach((id) => processed.delete(id));
      }
    }

    if (isPresenceEvent) {
      onPresenceEventRef.current?.(event);
      return;
    }

    scheduleConversationDetailRefresh(event.resourceId);
  }, [scheduleConversationDetailRefresh]);

  useRealtimeInbox({
    enabled: sessionActive,
    onEvent: handleRealtimeEvent
  });

  return useMemo(() => ({
    appendMessage,
    applyConversationAssignment,
    applyConversationClientPhone,
    applyConversationStatus,
    applyConversationTags,
    assignees,
    closedIds,
    conversationItems,
    error,
    loadConversationDetail,
    loading,
    refreshInbox,
    refreshing,
    setClosedIds,
    setConversationItems,
    setTopics,
    topics
  }), [
    appendMessage,
    applyConversationAssignment,
    applyConversationClientPhone,
    applyConversationStatus,
    applyConversationTags,
    assignees,
    closedIds,
    conversationItems,
    error,
    loadConversationDetail,
    loading,
    refreshInbox,
    refreshing,
    topics
  ]);
}

function withAppendedMessage(conversation, message) {
  return {
    ...conversation,
    messages: [...conversation.messages, message],
    preview: message.text ?? (
      message.attachments?.length
        ? `${ATTACHMENT_PREVIEW_LABEL}: ${message.attachments[0].name}`
        : conversation.preview
    ),
    time: mapTime(message.time)
  };
}

function mapApiMessage(message) {
  return {
    ...message,
    time: mapTime(message?.time)
  };
}

function mapTime(value) {
  if (String(value ?? "").trim().toLowerCase() === "now") {
    return NOW_LABEL;
  }
  return value ?? NOW_LABEL;
}
