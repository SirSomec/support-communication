import { CLIENT_PHONE_PATTERN, createAuditEvent, formatRescueNextAction, formatRescueTimer, statusLabels } from "./dialogModel.js";
import { threadAppeals } from "../features/dialogs/clientThreadModel.js";
import { getVisibleTags, normalizeTagInput } from "../features/dialogs/tagSuggestionModel.js";
import { routingService } from "../services/routingService.js";

export function useDialogActions({
  access,
  appendMessage,
  applyConversationClientPhone,
  applyConversationStatus,
  applyConversationTags,
  attachments,
  clearAttachments,
  closedIds,
  composeMode,
  draft,
  isClosed,
  operator = null,
  refreshInbox,
  selected,
  selectedStatus,
  selectedTopic,
  sendTargetConversationId = "",
  setClosedIds,
  setConversationItems,
  setDraft,
  setFilter,
  setToast,
  setTopics,
  topics,
  startRescueRequest = routingService.startRescue
}) {
  const operatorName = String(operator?.name ?? "").trim() || "Оператор";

  async function handleTopicChange(value) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return { ok: false };
    }

    const previousTopic = topics[selected.id] ?? "";
    setTopics((current) => ({ ...current, [selected.id]: value }));

    if (value && value !== previousTopic) {
      const result = await applyConversationStatus(selected.id, selectedStatus, {
        detail: previousTopic ? `Topic changed: ${previousTopic} -> ${value}` : `Topic selected: ${value}`,
        eventKind: "topic",
        fromTopic: previousTopic || "Not selected",
        toTopic: value
      });
      if (!result?.ok) {
        setTopics((current) => ({ ...current, [selected.id]: previousTopic }));
        setToast(result?.response?.error?.message ?? "Не удалось сохранить тематику.");
        return { ok: false, response: result?.response };
      }
      setToast("Тематика сохранена в audit trail.");
    }
    return { ok: true };
  }

  // Панель показывает объединенные теги треда, поэтому новый набор
  // применяется к актуальному обращению, а снятые теги дополнительно
  // убираются из остальных обращений треда — иначе они вернутся при слиянии.
  async function handleTagsApply(nextTags) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return { ok: false };
    }
    if (!applyConversationTags) {
      return { ok: false };
    }

    const normalizedNext = [];
    const nextKeys = new Set();
    for (const tag of Array.isArray(nextTags) ? nextTags : []) {
      const normalized = normalizeTagInput(tag);
      if (normalized && !nextKeys.has(normalized)) {
        nextKeys.add(normalized);
        normalizedNext.push(normalized);
      }
    }

    const primaryResult = await applyConversationTags(selected.id, normalizedNext);
    if (!primaryResult?.ok) {
      setToast(primaryResult?.response?.error?.message ?? "Не удалось обновить теги. Попробуйте еще раз.");
      return { ok: false };
    }

    let secondaryFailed = false;
    for (const appeal of threadAppeals(selected)) {
      if (appeal.id === selected.id) {
        continue;
      }
      const visible = getVisibleTags(appeal);
      const kept = visible.filter((tag) => nextKeys.has(normalizeTagInput(tag)));
      if (kept.length === visible.length) {
        continue;
      }
      const result = await applyConversationTags(appeal.id, kept);
      if (!result?.ok) {
        secondaryFailed = true;
      }
    }

    setToast(secondaryFailed
      ? "Теги актуального обращения обновлены, но часть прошлых обращений обновить не удалось."
      : "Теги диалога обновлены.");
    return { ok: true };
  }

  // Тред группируется по телефону, поэтому введенный оператором номер
  // применяется ко всем обращениям треда — иначе обращения без номера
  // отвалятся в отдельный тред при следующей группировке.
  async function handleClientPhoneSave(nextPhone) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return { ok: false };
    }
    if (!applyConversationClientPhone) {
      return { ok: false };
    }

    const phone = String(nextPhone ?? "").trim().replace(/\s+/g, " ");
    if (phone && !CLIENT_PHONE_PATTERN.test(phone)) {
      return { error: "Укажите телефон в формате +7 999 123-45-67 (от 5 до 20 цифр).", ok: false };
    }

    const primaryResult = await applyConversationClientPhone(selected.id, phone);
    if (!primaryResult?.ok) {
      return {
        error: primaryResult?.response?.error?.message ?? "Не удалось сохранить телефон. Попробуйте еще раз.",
        ok: false
      };
    }

    let secondaryFailed = false;
    for (const appeal of threadAppeals(selected)) {
      if (appeal.id === selected.id || String(appeal.phone ?? "").trim() === phone) {
        continue;
      }
      const result = await applyConversationClientPhone(appeal.id, phone);
      if (!result?.ok) {
        secondaryFailed = true;
      }
    }

    setToast(secondaryFailed
      ? "Телефон актуального обращения сохранен, но часть прошлых обращений обновить не удалось."
      : "Телефон клиента сохранен.");
    return { ok: true };
  }

  async function handleStatusChange(nextStatus, options = {}) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return;
    }

    if (nextStatus === selectedStatus) {
      return;
    }

    if (nextStatus === "closed") {
      return handleClose(options);
    }

    if (isClosed && nextStatus !== "reopened") {
      setToast("Закрытый диалог можно только переоткрыть.");
      return;
    }

    const result = await applyConversationStatus(
      selected.id,
      nextStatus,
      {
        detail: `Статус изменен: ${statusLabels[selectedStatus] ?? selectedStatus} -> ${statusLabels[nextStatus]}`,
        eventKind: nextStatus === "reopened" ? "reopen" : "status"
      }
    );
    if (!result?.ok) {
      setToast(result?.response?.error?.message ?? "Не удалось изменить статус.");
      return { ok: false, response: result?.response };
    }

    if (nextStatus === "reopened") {
      const nextClosedIds = new Set(closedIds);
      nextClosedIds.delete(selected.id);
      setClosedIds(nextClosedIds);
    }
    setToast(`Статус: ${statusLabels[nextStatus]}`);
    return { ok: true };
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
      const rescueAuditEvent = createAuditEvent({
        eventKind: "rescue",
        fromStatus: selectedStatus,
        toStatus: serverConversation.status ?? "assigned",
        detail: `Запущен rescue timer ${formatRescueTimer(serverRescue.durationSeconds)}: ${formatRescueNextAction(serverRescue.nextAction)}`
      });
      setConversationItems((current) => current.map((conversation) => (
        conversation.id === selected.id
          ? mergeRescueResponse(conversation, serverConversation, serverRescue, rescueAuditEvent)
          : conversation
      )));
    } else if (refreshInbox) {
      await refreshInbox();
    }

    setFilter("rescue");
    setToast(`${actionConfig.title}: Rescue запущен, диалог добавлен в фильтр "Спасти".`);
    return { ok: true, response };
  }

  async function handleDialogAction(actionConfig) {
    if (!access.canManageDialogs) {
      setToast(access.reason);
      return;
    }

    if (actionConfig.id === "rescue") {
      return handleRescueStart(actionConfig);
    }

    if (actionConfig.nextStatus) {
      const result = await applyConversationStatus(selected.id, actionConfig.nextStatus, {
        detail: `${actionConfig.title}: ${statusLabels[actionConfig.nextStatus]}`,
        eventKind: "action"
      });
      if (!result?.ok) {
        setToast(result?.response?.error?.message ?? "Не удалось выполнить действие.");
        return { ok: false, response: result?.response };
      }
      setToast(`${actionConfig.title} зафиксировано в истории диалога.`);
      return { ok: true };
    }

    setToast("Это действие больше не поддерживается.");
    return { ok: false };
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

    // Ответ клиенту уходит в обращение выбранного канала; внутренний
    // комментарий остается в актуальном обращении треда.
    const targetConversationId = composeMode === "internal"
      ? selected.id
      : sendTargetConversationId || selected.id;
    const result = await appendMessage(targetConversationId, {
      type: composeMode === "internal" ? "internal" : undefined,
      side: composeMode === "internal" ? undefined : "agent",
      text: draft.trim() || "Отправлено вложение",
      attachments: readyAttachments,
      author: operatorName,
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
    handleClientPhoneSave,
    handleClose,
    handleDialogAction,
    handleRescueStart,
    handleSend,
    handleStatusChange,
    handleTagsApply,
    handleTopicChange
  };
}

function mergeRescueResponse(conversation, serverConversation, serverRescue, auditEvent = null) {
  return {
    ...conversation,
    ...(serverConversation.status ? { status: serverConversation.status } : {}),
    ...(serverConversation.sla ? { sla: serverConversation.sla } : {}),
    ...(serverConversation.slaTone ? { slaTone: serverConversation.slaTone } : {}),
    ...(serverConversation.operatorId ? { operatorId: serverConversation.operatorId } : {}),
    ...(serverConversation.operatorName ? { operatorName: serverConversation.operatorName } : {}),
    ...(auditEvent ? { messages: [...(conversation.messages ?? []), auditEvent] } : {}),
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
