import { statusLabels } from "./dialogModel.js";
import { routingService } from "../services/routingService.js";

export function useDialogActions({
  access,
  appendMessage,
  applyConversationStatus,
  attachments,
  clearAttachments,
  closedIds,
  composeMode,
  draft,
  isClosed,
  refreshInbox,
  selected,
  selectedStatus,
  selectedTopic,
  setClosedIds,
  setConversationItems,
  setDraft,
  setFilter,
  setToast,
  setTopics,
  topics,
  startRescueRequest = routingService.startRescue
}) {
  function handleTopicChange(value) {
    const previousTopic = topics[selected.id] ?? "";
    setTopics((current) => ({ ...current, [selected.id]: value }));

    if (value && value !== previousTopic) {
      applyConversationStatus(selected.id, selectedStatus, {
        detail: previousTopic ? `Topic changed: ${previousTopic} -> ${value}` : `Topic selected: ${value}`,
        eventKind: "topic",
        fromTopic: previousTopic || "Not selected",
        toTopic: value
      });
      setToast("Тематика сохранена в audit trail.");
    }
  }

  function handleStatusChange(nextStatus, options = {}) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return;
    }

    if (nextStatus === selectedStatus) {
      return;
    }

    if (nextStatus === "closed") {
      handleClose(options);
      return;
    }

    if (isClosed && nextStatus !== "reopened") {
      setToast("Закрытый диалог можно только переоткрыть.");
      return;
    }

    if (nextStatus === "reopened") {
      const nextClosedIds = new Set(closedIds);
      nextClosedIds.delete(selected.id);
      setClosedIds(nextClosedIds);
    }

    applyConversationStatus(
      selected.id,
      nextStatus,
      {
        detail: `Статус изменен: ${statusLabels[selectedStatus] ?? selectedStatus} -> ${statusLabels[nextStatus]}`,
        eventKind: nextStatus === "reopened" ? "reopen" : "status"
      }
    );
    setToast(`Статус: ${statusLabels[nextStatus]}`);
  }

  async function handleRescueStart(actionConfig) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return;
    }

    if (isClosed) {
      setToast("Закрытый диалог нельзя поставить на rescue.");
      return;
    }

    if (selected.rescue?.state === "active") {
      setToast("Rescue timer уже запущен для этого диалога.");
      return;
    }

    const reason = actionConfig.reason ?? "Ручной запуск из карточки диалога";
    const source = actionConfig.source ?? "dialog_action_menu";
    const response = await startRescueRequest({
      conversationId: selected.id,
      reason,
      source
    });

    if (response.status !== "ok") {
      setToast(rescueErrorMessage(response));
      return { ok: false, response };
    }

    const serverConversation = response.data?.conversation;
    const serverRescue = response.data?.rescue ?? serverConversation?.rescue;
    if (serverConversation && serverRescue) {
      setConversationItems((current) => current.map((conversation) => (
        conversation.id === selected.id
          ? mergeRescueResponse(conversation, serverConversation, serverRescue)
          : conversation
      )));
    } else if (refreshInbox) {
      await refreshInbox();
    }

    setFilter("rescue");
    setToast(`${actionConfig.title}: Rescue запущен, диалог добавлен в фильтр "Спасти".`);
    return { ok: true, response };
  }

  function handleDialogAction(actionConfig) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return;
    }

    if (actionConfig.id === "rescue") {
      return handleRescueStart(actionConfig);
    }

    if (actionConfig.nextStatus) {
      applyConversationStatus(selected.id, actionConfig.nextStatus, {
        detail: `${actionConfig.title}: ${statusLabels[actionConfig.nextStatus]}`,
        eventKind: "action"
      });
    } else {
      appendMessage(selected.id, {
        actor: "Иван П.",
        detail: `${actionConfig.title}: Иван П.`,
        eventKind: "action",
        type: "event",
        text: `${actionConfig.title}: Иван П.`,
        time: "сейчас"
      });
    }
    setToast(`${actionConfig.title} зафиксировано в истории диалога.`);
  }

  async function handleClose({ resolutionOutcome } = {}) {
    if (!selectedTopic) {
      setToast("Для закрытия диалога выберите тематику.");
      return;
    }

    const result = await applyConversationStatus(selected.id, "closed", {
      detail: `Диалог закрыт с тематикой ${selectedTopic}`,
      eventKind: "close",
      resolutionOutcome,
      toTopic: selectedTopic
    });
    if (!result?.ok) {
      return;
    }
    setToast("Диалог закрыт и попадет в ежедневный отчет.");
  }

  async function handleSend() {
    const readyAttachments = attachments.filter((attachment) => attachment.status === "ready");
    const hasAttachmentIssues = attachments.some((attachment) => attachment.status !== "ready");

    if (hasAttachmentIssues) {
      setToast("Завершите загрузку или удалите вложения с ошибками перед отправкой.");
      return;
    }

    if (!draft.trim() && !readyAttachments.length) {
      setToast("Введите сообщение или прикрепите готовое вложение перед отправкой.");
      return;
    }

    const result = await appendMessage(selected.id, {
      type: composeMode === "internal" ? "internal" : undefined,
      side: composeMode === "internal" ? undefined : "agent",
      text: draft.trim() || "Отправлено вложение",
      attachments: readyAttachments,
      author: composeMode === "internal" ? "Иван П." : undefined,
      time: "сейчас"
    }, {
      optimistic: false,
      persist: true
    });

    if (!result?.ok) {
      setToast("Не удалось отправить сообщение. Попробуйте еще раз.");
      return;
    }

    setDraft("");
    clearAttachments({ releasePreviews: false });
    setToast(composeMode === "internal" ? "Внутренний комментарий сохранен в истории чата." : "Ответ отправлен клиенту.");
  }


  return {
    handleClose,
    handleDialogAction,
    handleRescueStart,
    handleSend,
    handleStatusChange,
    handleTopicChange
  };
}

function mergeRescueResponse(conversation, serverConversation, serverRescue) {
  return {
    ...conversation,
    ...(serverConversation.status ? { status: serverConversation.status } : {}),
    ...(serverConversation.sla ? { sla: serverConversation.sla } : {}),
    ...(serverConversation.slaTone ? { slaTone: serverConversation.slaTone } : {}),
    ...(serverConversation.operatorId ? { operatorId: serverConversation.operatorId } : {}),
    ...(serverConversation.operatorName ? { operatorName: serverConversation.operatorName } : {}),
    rescue: serverRescue
  };
}

function rescueErrorMessage(response) {
  const messages = {
    conversation_closed: "Закрытый диалог нельзя поставить на Rescue.",
    conversation_not_found: "Диалог не найден. Обновите список и попробуйте снова.",
    rescue_already_active: "Rescue уже запущен для этого диалога."
  };
  const code = response.error?.code;
  return messages[code]
    ?? `Не удалось запустить Rescue. ${response.error?.message ?? "Попробуйте ещё раз."}`;
}
