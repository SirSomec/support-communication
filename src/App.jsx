import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Headphones,
  Search,
  ShieldCheck,
  UsersRound,
  Zap
} from "lucide-react";
import { roleAccessProfiles, roleModes } from "./app/access.js";
import {
  aiActionLabels,
  createAuditEvent,
  createComposerAttachment,
  formatRescueTimer,
  getAiSuggestionDraft,
  getAiSuggestionMode,
  getConversationTimeValue,
  getStatusMeta,
  queueFilterDefaults,
  queueSlaTones,
  queueWaitingStatuses,
  releaseAttachmentPreviews,
  rescueDurationSeconds,
  slaSortRank,
  statusLabels
} from "./app/dialogModel.js";
import { ChatPane } from "./features/dialogs/ChatPane.jsx";
import { ConversationList } from "./features/dialogs/ConversationList.jsx";
import { CustomerPanel } from "./features/dialogs/CustomerPanel.jsx";
import { DraftSwitchDialog, OutboundDialogLauncher, SaveTemplateDialog } from "./features/dialogs/DialogModals.jsx";
import { NotificationCenter } from "./features/notifications/NotificationCenter.jsx";
import { SectionPlaceholder } from "./features/section-router.jsx";
import { Toast } from "./ui.jsx";
import {
  aiSuggestions,
  conversations,
  initialTemplates,
  navItems
} from "./data.js";

function App() {
  const [conversationItems, setConversationItems] = useState(conversations);
  const [section, setSection] = useState("dialogs");
  const [roleMode, setRoleMode] = useState("Администратор");
  const [selectedId, setSelectedId] = useState("maria");
  const [filter, setFilter] = useState("mine");
  const [queueFilters, setQueueFilters] = useState(queueFilterDefaults);
  const [query, setQuery] = useState("");
  const [composeMode, setComposeMode] = useState("reply");
  const [transcriptMode, setTranscriptMode] = useState("all");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const attachmentsRef = useRef([]);
  const [pendingConversationId, setPendingConversationId] = useState(null);
  const [isOutboundOpen, setOutboundOpen] = useState(false);
  const [templateLibrary, setTemplateLibrary] = useState(initialTemplates);
  const [saveTemplateDraft, setSaveTemplateDraft] = useState(null);
  const [aiSuggestionStates, setAiSuggestionStates] = useState({});
  const [topics, setTopics] = useState(() =>
    Object.fromEntries(conversations.map((conversation) => [conversation.id, conversation.topic]))
  );
  const [closedIds, setClosedIds] = useState(() => new Set(conversations.filter((item) => item.status === "closed").map((item) => item.id)));
  const [toast, setToast] = useState("");

  const selected = conversationItems.find((conversation) => conversation.id === selectedId) ?? conversationItems[0];
  const pendingConversation = pendingConversationId
    ? conversationItems.find((conversation) => conversation.id === pendingConversationId)
    : null;
  const access = roleAccessProfiles[roleMode];
  const selectedTopic = topics[selected.id] ?? "";
  const selectedStatus = selected.status ?? "active";
  const isClosed = closedIds.has(selected.id) || selectedStatus === "closed";
  const hasUnsentComposerContent = Boolean(draft.trim() || attachments.length);
  const visibleAiSuggestions = aiSuggestions
    .filter((suggestion) => suggestion.conversationId === selected.id && aiSuggestionStates[suggestion.id] !== "rejected")
    .map((suggestion) => ({
      ...suggestion,
      state: aiSuggestionStates[suggestion.id] ?? "idle"
    }));

  useEffect(() => {
    if (!access.sections.includes(section)) {
      setSection("dialogs");
      setToast(`${roleMode}: ${access.reason}`);
    }

    if (!access.canOutbound && isOutboundOpen) {
      setOutboundOpen(false);
    }
  }, [access, isOutboundOpen, roleMode, section]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => releaseAttachmentPreviews(attachmentsRef.current), []);

  useEffect(() => {
    if (!attachments.some((attachment) => attachment.status === "uploading")) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.status === "uploading"
            ? {
                ...attachment,
                status: "ready",
                progress: 100
              }
            : attachment
        )
      );
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [attachments]);

  const filtered = useMemo(() => {
    return conversationItems
      .filter((conversation) => {
        const topic = topics[conversation.id] ?? "";
        const hasInternalComment = conversation.messages.some((message) => message.type === "internal");
        const matchesQuery = `${conversation.name} ${conversation.phone} ${conversation.preview} ${conversation.channel} ${topic} ${conversation.status}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesFilter =
          filter === "mine" ||
          (filter === "waiting" && queueWaitingStatuses.includes(conversation.status)) ||
          (filter === "sla" && queueSlaTones.includes(conversation.slaTone)) ||
          (filter === "rescue" && (!topic || conversation.slaTone === "danger")) ||
          (filter === "quality" && conversation.tags.some((tag) => ["жалоба", "важно", "возврат"].includes(tag.toLowerCase()))) ||
          filter === "all";
        const matchesChannel = queueFilters.channel === "all" || conversation.channel === queueFilters.channel;
        const matchesTopic =
          queueFilters.topic === "all" ||
          (queueFilters.topic === "none" && !topic) ||
          topic === queueFilters.topic;
        const matchesStatus = queueFilters.status === "all" || conversation.status === queueFilters.status;
        const matchesInternal = !queueFilters.onlyInternal || hasInternalComment;

        return matchesQuery && matchesFilter && matchesChannel && matchesTopic && matchesStatus && matchesInternal;
      })
      .sort((left, right) => {
        if (queueFilters.sort === "sla") {
          return (slaSortRank[left.slaTone] ?? 5) - (slaSortRank[right.slaTone] ?? 5);
        }

        if (queueFilters.sort === "status") {
          return left.status.localeCompare(right.status, "ru");
        }

        if (queueFilters.sort === "channel") {
          return left.channel.localeCompare(right.channel, "ru");
        }

        return getConversationTimeValue(right.time) - getConversationTimeValue(left.time);
      });
  }, [conversationItems, filter, query, queueFilters, topics]);

  function handleQueueFilterChange(field, value) {
    setQueueFilters((current) => ({ ...current, [field]: value }));
  }

  function handleRoleModeChange(nextRole) {
    setRoleMode(nextRole);
    setToast(`Режим прав: ${nextRole}`);
  }

  function handleSectionSelect(nextSection) {
    if (!access.sections.includes(nextSection)) {
      setToast(`${roleMode}: ${access.reason}`);
      return;
    }

    setSection(nextSection);
  }

  function handleConversationSelect(nextConversationId) {
    if (nextConversationId === selectedId) {
      return;
    }

    if (hasUnsentComposerContent) {
      setPendingConversationId(nextConversationId);
      return;
    }

    setSelectedId(nextConversationId);
  }

  function handleStayOnConversation() {
    setPendingConversationId(null);
  }

  function handleDiscardDraftAndSwitch() {
    if (!pendingConversationId) {
      return;
    }

    setSelectedId(pendingConversationId);
    setDraft("");
    releaseAttachmentPreviews(attachments);
    setAttachments([]);
    setPendingConversationId(null);
    setToast("Черновик и очередь вложений сброшены.");
  }

  function handleAttachFiles(fileList) {
    const files = Array.from(fileList ?? []);

    if (!files.length) {
      return;
    }

    setAttachments((current) => [
      ...current,
      ...files.map((file, index) => createComposerAttachment(file, index, selected.channel))
    ]);
    setToast(`Вложения добавлены в очередь: ${files.length}`);
  }

  function handleCompleteAttachment(attachmentId) {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId
          ? {
              ...attachment,
              status: "ready",
              progress: 100,
              error: ""
            }
          : attachment
      )
    );
  }

  function handleRetryAttachment(attachmentId) {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId
          ? {
              ...attachment,
              status: "uploading",
              progress: 54,
              error: ""
            }
          : attachment
      )
    );
  }

  function handleRemoveAttachment(attachmentId) {
    const removed = attachments.find((attachment) => attachment.id === attachmentId);
    if (removed) {
      releaseAttachmentPreviews([removed]);
    }

    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function handleOutboundCreate(outbound) {
    const id = `outbound-${Date.now()}`;
    const newConversation = {
      id,
      name: outbound.clientName || "Новый клиент",
      initials: outbound.clientName ? outbound.clientName.split(" ").map((part) => part[0]).join("").slice(0, 2) : "НК",
      avatar: "",
      channel: outbound.channel,
      phone: outbound.phone,
      time: "сейчас",
      preview: outbound.message,
      status: "active",
      sla: "00:00",
      slaTone: "ok",
      topic: outbound.topic,
      unread: false,
      device: outbound.device,
      entry: outbound.channel,
      language: "Русский",
      clientSince: outbound.existing ? outbound.existing.clientSince : "Новый контакт",
      tags: ["исходящий", outbound.channel.toLowerCase()],
      previous: outbound.existing ? outbound.existing.previous : [],
      messages: [
        { id: 1, type: "event", text: `Диалог инициирован через ${outbound.channel} по номеру телефона`, time: "сейчас" },
        { id: 2, side: "agent", text: outbound.message, time: "сейчас" }
      ]
    };

    setConversationItems((current) => [newConversation, ...current]);
    setTopics((current) => ({ ...current, [id]: outbound.topic }));
    setSelectedId(id);
    setDraft("");
    releaseAttachmentPreviews(attachments);
    setAttachments([]);
    setSection("dialogs");
    setOutboundOpen(false);
    setToast(`Исходящий диалог создан: ${outbound.phone}`);
  }

  function appendMessage(conversationId, message) {
    setConversationItems((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        return {
          ...conversation,
          messages: [...conversation.messages, { id: Date.now(), ...message }],
          preview: message.text ?? (message.attachments?.length ? `Вложение: ${message.attachments[0].name}` : conversation.preview),
          time: "сейчас"
        };
      })
    );
  }

  function applyConversationStatus(conversationId, nextStatus, eventPayload) {
    const meta = getStatusMeta(nextStatus);

    setConversationItems((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        const previousStatus = conversation.status ?? "active";
        const auditEvent = eventPayload
          ? createAuditEvent({
              eventKind: "status",
              fromStatus: previousStatus,
              toStatus: nextStatus,
              ...(typeof eventPayload === "string" ? { detail: eventPayload } : eventPayload)
            })
          : null;

        const rescueState = nextStatus === "closed" && conversation.rescue
          ? {
              ...conversation.rescue,
              completedAt: Date.now(),
              outcome: "saved",
              state: "saved"
            }
          : conversation.rescue;

        return {
          ...conversation,
          status: nextStatus,
          sla: meta.sla,
          slaTone: meta.tone,
          ...(rescueState ? { rescue: rescueState } : {}),
          messages: auditEvent ? [...conversation.messages, auditEvent] : conversation.messages,
          time: "сейчас"
        };
      })
    );
  }

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

  function handleOpenTemplateSave(source) {
    const sourceText = typeof source === "string" ? source : draft;

    if (!sourceText.trim()) {
      setToast("Введите текст ответа перед сохранением шаблона.");
      return;
    }

    setSaveTemplateDraft({
      title: selectedTopic ? selectedTopic.split(" / ").at(-1) : "Новый шаблон",
      scope: "Личный",
      channel: selected.channel,
      topic: selectedTopic || "Без тематики",
      text: sourceText.trim()
    });
  }

  function handleTemplateSave(template) {
    const next = {
      id: `chat-template-${Date.now()}`,
      usage: 0,
      updated: "только что",
      ...template
    };

    setTemplateLibrary((current) => [next, ...current]);
    setSaveTemplateDraft(null);
    setToast(`Шаблон сохранен: ${next.title}`);
  }

  function handleAiSuggestionAction(suggestion, action) {
    if (isClosed) {
      setToast("Диалог закрыт, AI-подсказки доступны только для просмотра.");
      return;
    }

    const nextState = action === "reject" ? "rejected" : action === "edit" ? "editing" : "accepted";
    setAiSuggestionStates((current) => ({ ...current, [suggestion.id]: nextState }));

    if (action !== "reject") {
      const suggestionDraft = getAiSuggestionDraft(suggestion);
      const nextMode = getAiSuggestionMode(suggestion);
      setComposeMode(nextMode);
      setDraft((current) => [current.trim(), suggestionDraft].filter(Boolean).join("\n\n"));
    }

    appendMessage(selected.id, {
      actor: "AI copilot",
      detail: `AI-подсказка ${aiActionLabels[action]}: ${suggestion.title}`,
      eventKind: "ai",
      id: `ai-audit-${suggestion.id}-${action}-${Date.now()}`,
      text: `AI-подсказка ${aiActionLabels[action]}: ${suggestion.title}`,
      type: "event",
      time: "сейчас"
    });
    setToast(`AI-действие записано в audit: ${suggestion.title}.`);
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
    setAttachments([]);
    setToast(composeMode === "internal" ? "Внутренний комментарий сохранен в истории чата." : "Ответ отправлен клиенту.");
  }

  return (
    <div className="app-shell">
      <Sidebar active={section} access={access} onSelect={handleSectionSelect} />
      <main className="workspace">
        <TopBar
          access={access}
          activeSection={section}
          onOutbound={() => {
            if (!access.canOutbound) {
              setToast(access.reason);
              return;
            }

            setOutboundOpen(true);
          }}
          onRoleMode={handleRoleModeChange}
          onToast={setToast}
          roleMode={roleMode}
        />
        {section === "dialogs" ? (
          <div className="cockpit">
            <ConversationList
              conversations={filtered}
              allConversations={conversationItems}
              selectedId={selectedId}
              onSelect={handleConversationSelect}
              filter={filter}
              onFilter={setFilter}
              queueFilters={queueFilters}
              onQueueFilterChange={handleQueueFilterChange}
              onQueueFiltersReset={() => setQueueFilters(queueFilterDefaults)}
              query={query}
              onQuery={setQuery}
              topics={topics}
              closedIds={closedIds}
            />
            <ChatPane
              conversation={selected}
              topic={selectedTopic}
              onTopic={handleTopicChange}
              composeMode={composeMode}
              setComposeMode={setComposeMode}
              transcriptMode={transcriptMode}
              setTranscriptMode={setTranscriptMode}
              draft={draft}
              setDraft={setDraft}
              aiSuggestions={visibleAiSuggestions}
              onAiSuggestionAction={handleAiSuggestionAction}
              attachments={attachments}
              onAttachFiles={handleAttachFiles}
              onAttachmentComplete={handleCompleteAttachment}
              onAttachmentRetry={handleRetryAttachment}
              onAttachmentRemove={handleRemoveAttachment}
              onSend={handleSend}
              templates={templateLibrary}
              onSaveTemplate={handleOpenTemplateSave}
              onDialogAction={handleDialogAction}
              onCloseDialog={handleClose}
              onStatusChange={handleStatusChange}
              access={access}
              isClosed={isClosed}
              status={selectedStatus}
            />
            <CustomerPanel
              conversation={selected}
              topic={selectedTopic}
              onTopic={handleTopicChange}
              setDraft={setDraft}
              templates={templateLibrary}
              onClose={handleClose}
              access={access}
              isClosed={isClosed}
            />
          </div>
        ) : (
          <SectionPlaceholder
            section={section}
            onBack={() => setSection("dialogs")}
            conversations={conversationItems}
            templates={templateLibrary}
            onTemplatesChange={setTemplateLibrary}
            onToast={setToast}
            access={access}
            roleMode={roleMode}
            onRoleMode={handleRoleModeChange}
          />
        )}
      </main>
      {isOutboundOpen ? (
        <OutboundDialogLauncher
          conversations={conversationItems}
          onClose={() => setOutboundOpen(false)}
          onCreate={handleOutboundCreate}
          onToast={setToast}
        />
      ) : null}
      {saveTemplateDraft ? (
        <SaveTemplateDialog
          draft={saveTemplateDraft}
          onClose={() => setSaveTemplateDraft(null)}
          onSave={handleTemplateSave}
        />
      ) : null}
      {pendingConversation ? (
        <DraftSwitchDialog
          attachments={attachments}
          currentConversation={selected}
          draft={draft}
          onCancel={handleStayOnConversation}
          onConfirm={handleDiscardDraftAndSwitch}
          targetConversation={pendingConversation}
        />
      ) : null}
      {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
    </div>
  );
}

function Sidebar({ active, access, onSelect }) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <Headphones size={22} />
      </div>
      <nav className="nav-list" aria-label="Главная навигация">
        {navItems.map(({ key, label, icon: Icon }) => {
          const isAllowed = access.sections.includes(key);

          return (
            <button
              aria-label={isAllowed ? label : `${label}: ${access.reason}`}
              className={`nav-item ${active === key ? "active" : ""}`}
              disabled={!isAllowed}
              key={key}
              onClick={() => onSelect(key)}
              title={isAllowed ? label : access.reason}
              type="button"
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="operator-card">
        <img
          alt=""
          src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&q=80"
        />
        <div>
          <strong>Иван П.</strong>
          <span><i /> Онлайн</span>
        </div>
        <ChevronDown size={16} />
      </div>
    </aside>
  );
}

function TopBar({ access, activeSection, onOutbound, onRoleMode, onToast, roleMode }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="status-select">
          <span className="presence-dot" />
          Онлайн
          <ChevronDown size={16} />
        </button>
        <button className="status-select">
          <UsersRound size={17} />
          7 / 12 чатов
          <ChevronDown size={16} />
        </button>
        <label className="role-switcher">
          <ShieldCheck size={17} />
          <select value={roleMode} onChange={(event) => onRoleMode(event.target.value)} aria-label="Режим проверки прав">
            {roleModes.map((role) => <option key={role}>{role}</option>)}
          </select>
        </label>
      </div>
      <div className="topbar-right">
        <NotificationCenter activeSection={activeSection} onToast={onToast} />
        <button className="icon-button" aria-label="Поиск" title="Поиск" type="button">
          <Search size={20} />
        </button>
        {!access.canOutbound ? <span className="topbar-access-note">{access.reason}</span> : null}
        <button className="quick-action" disabled={!access.canOutbound} onClick={onOutbound} title={access.canOutbound ? "Быстрые действия" : access.reason} type="button">
          <Zap size={17} />
          Быстрые действия
          <ChevronDown size={16} />
        </button>
      </div>
    </header>
  );
}

export default App;
