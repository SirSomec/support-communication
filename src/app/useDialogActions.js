import {
  createAuditEvent,
  formatRescueTimer,
  rescueDurationSeconds,
  statusLabels
} from "./dialogModel.js";

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
  selected,
  selectedStatus,
  selectedTopic,
  setClosedIds,
  setConversationItems,
  setDraft,
  setFilter,
  setToast,
  setTopics,
  topics
}) {
  function handleTopicChange(value) {
    const previousTopic = topics[selected.id] ?? "";
    setTopics((current) => ({ ...current, [selected.id]: value }));

    if (value && value !== previousTopic) {
      appendMessage(selected.id, {
        actor: "Иван П.",
        detail: previousTopic ? `Тематика изменена: ${previousTopic} -> ${value}` : `Проставлена тематика: ${value}`,
        eventKind: "topic",
        fromTopic: previousTopic || "Не выбрана",
        text: previousTopic ? `Тематика изменена: ${previousTopic} -> ${value}` : `Проставлена тематика: ${value}`,
        toTopic: value,
        type: "event",
        time: "сейчас"
      });
      setToast("Тематика сохранена и попадет в audit trail.");
    }
  }

  function handleStatusChange(nextStatus) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return;
    }

    if (nextStatus === selectedStatus) {
      return;
    }

    if (nextStatus === "closed") {
      handleClose();
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

  function handleRescueStart(actionConfig) {
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

    const startedAt = Date.now();
    const deadlineAt = startedAt + rescueDurationSeconds * 1000;
    const nextStatus = actionConfig.nextStatus ?? "assigned";
    const rescue = {
      state: "active",
      startedAt,
      deadlineAt,
      durationSeconds: rescueDurationSeconds,
      reason: "Ручной запуск: диалог требует ответа или возврата в очередь",
      nextAction: "Ответить клиенту или вернуть в SLA-очередь",
      owner: "Иван П.",
      source: actionConfig.title
    };

    setConversationItems((current) =>
      current.map((conversation) => {
        if (conversation.id !== selected.id) {
          return conversation;
        }

        const previousStatus = conversation.status ?? "active";
        const auditEvent = createAuditEvent({
          eventKind: "rescue",
          fromStatus: previousStatus,
          toStatus: nextStatus,
          detail: `Запущен rescue timer ${formatRescueTimer(rescueDurationSeconds)}: ${rescue.nextAction}`,
          text: `Запущен rescue timer ${formatRescueTimer(rescueDurationSeconds)}: ${rescue.nextAction}`
        });

        return {
          ...conversation,
          status: nextStatus,
          sla: `Rescue ${formatRescueTimer(rescueDurationSeconds)}`,
          slaTone: "danger",
          rescue,
          messages: [...conversation.messages, auditEvent],
          preview: "Запущен rescue timer: нужен ответ или возврат в очередь",
          time: "сейчас"
        };
      })
    );

    setFilter("rescue");
    setToast(`${actionConfig.title}: таймер ${formatRescueTimer(rescueDurationSeconds)} запущен, диалог добавлен в фильтр "Спасти".`);
  }

  function handleDialogAction(actionConfig) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return;
    }

    if (actionConfig.id === "rescue") {
      handleRescueStart(actionConfig);
      return;
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

  function handleClose() {
    if (!selectedTopic) {
      setToast("Для закрытия диалога выберите тематику.");
      return;
    }

    const next = new Set(closedIds);
    next.add(selected.id);
    setClosedIds(next);
    applyConversationStatus(selected.id, "closed", {
      detail: `Диалог закрыт с тематикой ${selectedTopic}`,
      eventKind: "close"
    });
    setToast("Диалог закрыт и попадет в ежедневный отчет.");
  }

  function handleSend() {
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

    appendMessage(selected.id, {
      type: composeMode === "internal" ? "internal" : undefined,
      side: composeMode === "internal" ? undefined : "agent",
      text: draft.trim() || "Отправлено вложение",
      attachments: readyAttachments,
      author: composeMode === "internal" ? "Иван П." : undefined,
      time: "сейчас"
    });
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
