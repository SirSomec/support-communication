import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Copy,
  FileText,
  Headphones,
  Info,
  Lock,
  MessageCircle,
  MoreHorizontal,
  PanelRightOpen,
  Paperclip,
  PhoneCall,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  UsersRound,
  X,
  Zap
} from "lucide-react";
import { roleAccessProfiles, roleModes } from "./app/access.js";
import {
  aiActionLabels,
  aiSuggestionStatusLabels,
  attachmentStatusLabels,
  createAuditEvent,
  createComposerAttachment,
  dialogActionConfigs,
  formatRescueTimer,
  getAiSuggestionDraft,
  getAiSuggestionMode,
  getConversationTimeValue,
  getRescueRemainingSeconds,
  getStatusMeta,
  maskPhone,
  queueFilterDefaults,
  queueSlaTones,
  queueWaitingStatuses,
  releaseAttachmentPreviews,
  rescueDurationSeconds,
  slaSortRank,
  statusLabels
} from "./app/dialogModel.js";
import { useModalA11y } from "./app/useModalA11y.js";
import { SectionPlaceholder } from "./features/section-router.jsx";
import {
  aiSuggestions,
  conversations,
  initialTemplates,
  navItems,
  topicOptions
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
              draft={draft}
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

const notificationItems = [
  {
    id: "sla-vladimir",
    type: "SLA",
    title: "Владимир Б. без тематики",
    detail: "Закрытие заблокировано, SLA просрочен",
    meta: "Telegram · очередь спасения",
    action: "Открыть диалог",
    tone: "danger"
  },
  {
    id: "mention-anna",
    type: "Mention",
    title: "Анна Р. упомянула вас",
    detail: "Нужна проверка возврата до закрытия",
    meta: "MAX · старший сотрудник",
    action: "Посмотреть",
    tone: "warn"
  },
  {
    id: "channel-vk",
    type: "Channel",
    title: "VK: рост ошибок webhook",
    detail: "3 ошибки доставки за последние 15 минут",
    meta: "Интеграции · требует администратора",
    action: "Открыть канал",
    tone: "info"
  },
  {
    id: "export-ready",
    type: "Export",
    title: "Ежедневный отчет готов",
    detail: "XLSX, 486 строк, audit export-2418",
    meta: "Отчеты · сегодня 11:30",
    action: "Скачать",
    tone: "ok"
  }
];

function TopBar({ access, activeSection, onOutbound, onRoleMode, onToast, roleMode }) {
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState([]);
  const unreadNotifications = notificationItems.filter((item) => !readNotificationIds.includes(item.id));

  useEffect(() => {
    setNotificationsOpen(false);
  }, [activeSection]);

  function handleNotificationAction(item) {
    setReadNotificationIds((current) => current.includes(item.id) ? current : [...current, item.id]);
    setNotificationsOpen(false);
    onToast(`${item.type}: ${item.action}`);
  }

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
        <div className="notification-center">
          <button
            aria-expanded={isNotificationsOpen}
            aria-label="Уведомления"
            className={`icon-button has-badge ${isNotificationsOpen ? "active" : ""}`}
            onClick={() => setNotificationsOpen((current) => !current)}
            title="Уведомления"
            type="button"
          >
            <Bell size={20} />
            {unreadNotifications.length ? <span>{unreadNotifications.length}</span> : null}
          </button>
          {isNotificationsOpen ? (
            <section className="notification-drawer" aria-label="Центр уведомлений">
              <header>
                <div>
                  <strong>Уведомления</strong>
                  <span>{unreadNotifications.length} новых из {notificationItems.length}</span>
                </div>
                <button
                  onClick={() => setReadNotificationIds(notificationItems.map((item) => item.id))}
                  type="button"
                >
                  Все прочитаны
                </button>
              </header>
              <div className="notification-list">
                {notificationItems.map((item) => {
                  const isRead = readNotificationIds.includes(item.id);

                  return (
                    <article className={`notification-item ${item.tone} ${isRead ? "read" : ""}`} key={item.id}>
                      <span className="notification-type">{item.type}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                        <small>{item.meta}</small>
                      </div>
                      <button onClick={() => handleNotificationAction(item)} type="button">{item.action}</button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
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

function OutboundDialogLauncher({ conversations, onClose, onCreate, onToast }) {
  const dialogRef = useModalA11y(onClose);
  const [phone, setPhone] = useState("+7 ");
  const [clientName, setClientName] = useState("");
  const [channel, setChannel] = useState("SDK");
  const [topic, setTopic] = useState(topicOptions[0]);
  const [message, setMessage] = useState("Здравствуйте! Пишем по вашему обращению, готовы помочь в этом диалоге.");

  const normalizedPhone = phone.replace(/\D/g, "");
  const existing = conversations.find((conversation) => conversation.phone.replace(/\D/g, "") === normalizedPhone);
  const device = channel === "SDK" ? "Android / iOS из SDK" : "Определится каналом";
  const canCreate = normalizedPhone.length >= 11 && message.trim().length > 0;

  function handleCreate() {
    if (!canCreate) {
      onToast("Укажите телефон и стартовое сообщение для исходящего диалога.");
      return;
    }

    onCreate({
      phone,
      clientName: existing?.name ?? clientName.trim(),
      channel,
      topic,
      message: message.trim(),
      device,
      existing
    });
  }

  return (
    <div className="outbound-overlay" role="presentation">
      <section className="outbound-panel" aria-labelledby="outbound-dialog-title" aria-modal="true" ref={dialogRef} role="dialog">
        <header>
          <div>
            <span>SDK contact center</span>
            <h2 id="outbound-dialog-title">Новый исходящий диалог</h2>
          </div>
          <button aria-label="Закрыть" className="icon-button" onClick={onClose} title="Закрыть" type="button">
            <X size={18} />
          </button>
        </header>

        <div className="outbound-grid">
          <label>
            <span>Телефон клиента</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 000-00-00" />
          </label>
          <label>
            <span>Имя, если новый клиент</span>
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Новый клиент" disabled={Boolean(existing)} />
          </label>
          <label>
            <span>Канал запуска</span>
            <select value={channel} onChange={(event) => setChannel(event.target.value)}>
              {["SDK", "Telegram", "MAX", "VK"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Тематика</span>
            <select value={topic} onChange={(event) => setTopic(event.target.value)}>
              {topicOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <label className="outbound-message">
          <span>Стартовое сообщение</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>

        <div className="sdk-preview">
          <div>
            <PhoneCall size={18} />
            <strong>{existing ? `Найден профиль: ${existing.name}` : "Будет создан новый профиль"}</strong>
            <span>{phone} · {channel} · {device}</span>
          </div>
          <div>
            <Smartphone size={18} />
            <strong>SDK-событие</strong>
            <span>initConversation(phone, channel, topic, operatorId)</span>
          </div>
        </div>

        <footer>
          <button onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={!canCreate} onClick={handleCreate} type="button">
            <Send size={17} />
            Создать диалог
          </button>
        </footer>
      </section>
    </div>
  );
}

function SaveTemplateDialog({ draft, onClose, onSave }) {
  const dialogRef = useModalA11y(onClose);
  const [form, setForm] = useState(draft);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSave() {
    onSave({
      ...form,
      title: form.title.trim() || "Новый шаблон",
      text: form.text.trim()
    });
  }

  return (
    <div className="template-save-overlay" role="presentation">
      <section className="template-save-panel" aria-labelledby="save-template-title" aria-modal="true" ref={dialogRef} role="dialog">
        <header>
          <div>
            <span>Личная база оператора</span>
            <h2 id="save-template-title">Сохранить как шаблон</h2>
          </div>
          <button aria-label="Закрыть" className="icon-button" onClick={onClose} title="Закрыть" type="button">
            <X size={18} />
          </button>
        </header>

        <div className="template-save-grid">
          <label>
            <span>Название</span>
            <input value={form.title} onChange={(event) => update("title", event.target.value)} />
          </label>
          <label>
            <span>Доступ</span>
            <select value={form.scope} onChange={(event) => update("scope", event.target.value)}>
              {["Личный", "Командный", "Глобальный"].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Канал</span>
            <select value={form.channel} onChange={(event) => update("channel", event.target.value)}>
              {["Все", "SDK", "Telegram", "MAX", "VK"].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Тематика</span>
            <input value={form.topic} onChange={(event) => update("topic", event.target.value)} />
          </label>
        </div>

        <label className="template-save-text">
          <span>Текст шаблона</span>
          <textarea value={form.text} onChange={(event) => update("text", event.target.value)} />
        </label>

        <div className="variable-row compact">
          {["{client_name}", "{operator_name}", "{ticket_id}", "{topic}"].map((variable) => (
            <button key={variable} onClick={() => update("text", `${form.text} ${variable}`.trim())} type="button">{variable}</button>
          ))}
        </div>

        <footer>
          <button onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={!form.text.trim()} onClick={handleSave} type="button">
            <BookOpen size={17} />
            Сохранить шаблон
          </button>
        </footer>
      </section>
    </div>
  );
}

function DraftSwitchDialog({ attachments, currentConversation, draft, onCancel, onConfirm, targetConversation }) {
  const dialogRef = useModalA11y(onCancel);
  const draftPreview = draft.trim() ? draft.trim().slice(0, 120) : "Текст не набран";

  return (
    <div className="draft-switch-overlay" role="presentation">
      <section className="draft-switch-panel" aria-labelledby="draft-switch-title" aria-modal="true" ref={dialogRef} role="dialog">
        <header>
          <div>
            <span>Несохраненный черновик</span>
            <h2 id="draft-switch-title">Перейти в другой диалог?</h2>
          </div>
          <button aria-label="Закрыть" className="icon-button" onClick={onCancel} title="Закрыть" type="button">
            <X size={18} />
          </button>
        </header>
        <div className="draft-switch-body">
          <p>
            Сейчас открыт диалог с <strong>{currentConversation.name}</strong>. При переходе к <strong>{targetConversation.name}</strong> текущий черновик и очередь вложений будут очищены.
          </p>
          <div className="draft-switch-summary">
            <span>
              <strong>Черновик</strong>
              {draftPreview}
            </span>
            <span>
              <strong>Вложения</strong>
              {attachments.length ? `${attachments.length} в очереди` : "Нет вложений"}
            </span>
          </div>
        </div>
        <footer>
          <button onClick={onCancel} type="button">Остаться</button>
          <button className="danger-action" onClick={onConfirm} type="button">
            Сбросить и перейти
          </button>
        </footer>
      </section>
    </div>
  );
}

function ConversationList({
  conversations,
  allConversations,
  selectedId,
  onSelect,
  filter,
  onFilter,
  queueFilters,
  onQueueFilterChange,
  onQueueFiltersReset,
  query,
  onQuery,
  topics,
  closedIds
}) {
  const [isFilterPanelOpen, setFilterPanelOpen] = useState(false);
  const channelOptions = Array.from(new Set(allConversations.map((conversation) => conversation.channel)));
  const activeFilterCount = [
    queueFilters.channel !== "all",
    queueFilters.topic !== "all",
    queueFilters.status !== "all",
    queueFilters.sort !== "time",
    queueFilters.onlyInternal
  ].filter(Boolean).length;
  const counters = {
    waiting: allConversations.filter((item) => queueWaitingStatuses.includes(item.status)).length,
    sla: allConversations.filter((item) => queueSlaTones.includes(item.slaTone)).length,
    rescue: allConversations.filter((item) => !topics[item.id] || item.slaTone === "danger").length,
    quality: allConversations.filter((item) => item.tags.some((tag) => ["жалоба", "важно", "возврат"].includes(tag.toLowerCase()))).length
  };

  return (
    <section className="conversation-list" aria-label="Список диалогов">
      <div className="queue-tabs">
        <TabButton id="mine" active={filter} onClick={onFilter} label="Мои" />
        <TabButton id="waiting" active={filter} onClick={onFilter} label="Ожидают" count={counters.waiting} tone="danger" />
        <TabButton id="sla" active={filter} onClick={onFilter} label="SLA" count={counters.sla} tone="warn" />
        <TabButton id="rescue" active={filter} onClick={onFilter} label="Спасти" count={counters.rescue} tone="danger" />
        <TabButton id="quality" active={filter} onClick={onFilter} label="Оценки" count={counters.quality} tone="warn" />
        <TabButton id="all" active={filter} onClick={onFilter} label="Все" />
      </div>
      <div className="queue-controls">
        <div className="queue-search">
          <Search size={19} />
          <input aria-label="Поиск по диалогам" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Поиск по диалогам" />
          <button
            aria-expanded={isFilterPanelOpen}
            aria-label="Расширенные фильтры"
            className={isFilterPanelOpen ? "active" : ""}
            onClick={() => setFilterPanelOpen((current) => !current)}
            title="Расширенные фильтры"
            type="button"
          >
            <SlidersHorizontal size={19} />
            {activeFilterCount ? <span>{activeFilterCount}</span> : null}
          </button>
        </div>
        {isFilterPanelOpen ? (
          <div className="queue-filter-panel">
            <label>
              <span>Канал</span>
              <select value={queueFilters.channel} onChange={(event) => onQueueFilterChange("channel", event.target.value)}>
                <option value="all">Все каналы</option>
                {channelOptions.map((channel) => <option value={channel} key={channel}>{channel}</option>)}
              </select>
            </label>
            <label>
              <span>Тематика</span>
              <select value={queueFilters.topic} onChange={(event) => onQueueFilterChange("topic", event.target.value)}>
                <option value="all">Все тематики</option>
                <option value="none">Без тематики</option>
                {topicOptions.map((topic) => <option value={topic} key={topic}>{topic}</option>)}
              </select>
            </label>
            <label>
              <span>Статус</span>
              <select value={queueFilters.status} onChange={(event) => onQueueFilterChange("status", event.target.value)}>
                <option value="all">Все статусы</option>
                {Object.entries(statusLabels).map(([status, label]) => <option value={status} key={status}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Сортировка</span>
              <select value={queueFilters.sort} onChange={(event) => onQueueFilterChange("sort", event.target.value)}>
                <option value="time">Последнее сообщение</option>
                <option value="sla">SLA сначала</option>
                <option value="status">Статус</option>
                <option value="channel">Канал</option>
              </select>
            </label>
            <label className="queue-filter-check">
              <input
                type="checkbox"
                checked={queueFilters.onlyInternal}
                onChange={(event) => onQueueFilterChange("onlyInternal", event.target.checked)}
              />
              <span>Есть внутренний комментарий</span>
            </label>
            <button className="queue-filter-reset" onClick={onQueueFiltersReset} type="button">Сбросить</button>
          </div>
        ) : null}
        {activeFilterCount ? (
          <div className="active-filter-chips" aria-label="Активные фильтры">
            {queueFilters.channel !== "all" ? <span>Канал: {queueFilters.channel}</span> : null}
            {queueFilters.topic !== "all" ? <span>{queueFilters.topic === "none" ? "Без тематики" : queueFilters.topic}</span> : null}
            {queueFilters.status !== "all" ? <span>Статус: {statusLabels[queueFilters.status]}</span> : null}
            {queueFilters.sort !== "time" ? <span>Сортировка: {queueFilters.sort === "sla" ? "SLA" : queueFilters.sort === "status" ? "статус" : "канал"}</span> : null}
            {queueFilters.onlyInternal ? <span>Внутренние комментарии</span> : null}
          </div>
        ) : null}
      </div>
      <div className="queue-items">
        {conversations.map((conversation) => (
          <button
            aria-current={selectedId === conversation.id ? "true" : undefined}
            className={`queue-row ${selectedId === conversation.id ? "selected" : ""} ${conversation.slaTone === "danger" ? "danger" : ""}`}
            key={conversation.id}
            onClick={() => onSelect(conversation.id)}
          >
            <Avatar conversation={conversation} />
            <span className="queue-body">
              <span className="queue-title">
                <strong>{conversation.name}</strong>
                <time>{conversation.time}</time>
              </span>
              <span className={`channel-chip ${conversation.channel.toLowerCase()}`}>{conversation.channel}</span>
              <span className={`status-chip ${getStatusMeta(conversation.status).tone}`}>{statusLabels[conversation.status] ?? conversation.status}</span>
              <span className="queue-preview">{conversation.preview}</span>
              <span className={`queue-meta ${conversation.slaTone}`}>
                {conversation.slaTone === "danger" ? <AlertTriangle size={15} /> : null}
                {conversation.slaTone === "warn" || conversation.slaTone === "hold" ? <Clock3 size={15} /> : null}
                {closedIds.has(conversation.id) || conversation.status === "closed" ? "Закрыт" : conversation.sla}
              </span>
              {!topics[conversation.id] ? <span className="topic-warning">Для закрытия укажите тематику</span> : null}
            </span>
            {conversation.unread ? <span className="unread-dot" /> : null}
          </button>
        ))}
        {!conversations.length ? (
          <div className="queue-empty">
            <strong>Нет диалогов</strong>
            <span>Измените фильтр или поисковый запрос.</span>
          </div>
        ) : null}
      </div>
      <footer className="queue-footer">
        <span>Показано {conversations.length} из {allConversations.length}</span>
        <div>
          <button aria-label="Назад" title="Назад" type="button"><ChevronLeft size={18} /></button>
          <button aria-label="Вперед" title="Вперед" type="button"><ChevronRight size={18} /></button>
        </div>
      </footer>
    </section>
  );
}

function TabButton({ id, active, onClick, label, count, tone }) {
  return (
    <button aria-pressed={active === id} className={`queue-tab ${active === id ? "active" : ""}`} onClick={() => onClick(id)} type="button">
      {label}
      {count ? <span className={`tab-count ${tone ?? ""}`}>{count}</span> : null}
    </button>
  );
}

function Avatar({ conversation }) {
  if (conversation.avatar) {
    return <img className="avatar" src={conversation.avatar} alt="" />;
  }

  return <span className={`avatar avatar-fallback ${conversation.channel.toLowerCase()}`}>{conversation.initials}</span>;
}

function ChatPane({
  conversation,
  topic,
  onTopic,
  composeMode,
  setComposeMode,
  transcriptMode,
  setTranscriptMode,
  draft,
  setDraft,
  aiSuggestions: inlineAiSuggestions,
  onAiSuggestionAction,
  attachments,
  onAttachFiles,
  onAttachmentComplete,
  onAttachmentRetry,
  onAttachmentRemove,
  onSend,
  templates,
  onSaveTemplate,
  onDialogAction,
  onCloseDialog,
  onStatusChange,
  access,
  isClosed,
  status
}) {
  const [isActionPanelOpen, setActionPanelOpen] = useState(false);
  const [rescueNow, setRescueNow] = useState(Date.now());
  const statusMeta = getStatusMeta(status);
  const activeRescue = conversation.rescue?.state === "active" && !isClosed ? conversation.rescue : null;
  const rescueRemainingSeconds = activeRescue ? getRescueRemainingSeconds(activeRescue, rescueNow) : 0;
  const isRescueExpired = Boolean(activeRescue && rescueRemainingSeconds === 0);
  const botHandoffSummary = {
    scenario: topic?.includes("Авторизация") ? "Код подтверждения" : topic?.includes("Оплата") ? "Первичный возврат" : "Статус доставки",
    asked: ["подтверждение телефона", "последний заказ", "согласие на подключение оператора"],
    received: [conversation.phone, conversation.topic || "тематика не выбрана", conversation.entry],
    reason: conversation.slaTone === "danger" ? "бот передал из-за SLA-риска" : "бот передал после запроса человека"
  };
  const visibleMessages = conversation.messages.filter((message) => {
    if (transcriptMode === "internal") {
      return message.type === "internal";
    }

    if (transcriptMode === "events") {
      return message.type === "event";
    }

    return true;
  });

  useEffect(() => {
    if (!activeRescue) {
      return undefined;
    }

    setRescueNow(Date.now());
    const timer = window.setInterval(() => setRescueNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeRescue?.deadlineAt]);

  return (
    <section className="chat-pane" aria-label="Окно чата">
      <header className="chat-header">
        <div className="chat-identity">
          <Avatar conversation={conversation} />
          <div>
            <h1>{conversation.name}</h1>
            <span>{conversation.phone}</span>
          </div>
        </div>
        <div className="chat-actions">
          <button
            aria-expanded={isActionPanelOpen}
            aria-label="Действия с диалогом"
            onClick={() => setActionPanelOpen((current) => !current)}
            title="Действия с диалогом"
            type="button"
          >
            <MoreHorizontal size={21} />
          </button>
          <button aria-label="Информация" title="Информация" type="button"><Info size={20} /></button>
        </div>
        {isActionPanelOpen ? (
          <div className="chat-action-menu">
            <div className="chat-action-status">
              <span>Текущий статус</span>
              <strong>{statusMeta.label}</strong>
            </div>
            {!access.canManageDialogs ? <p className="disabled-reason">{access.reason}</p> : null}
            {dialogActionConfigs.map((action) => {
              const rescueAlreadyActive = action.id === "rescue" && Boolean(activeRescue);
              const actionDisabled = isClosed || !access.canManageDialogs || rescueAlreadyActive;

              return (
                <button
                  disabled={actionDisabled}
                  key={action.title}
                  onClick={() => {
                    onDialogAction(action);
                    setActionPanelOpen(false);
                  }}
                  type="button"
                >
                  <strong>{action.title}</strong>
                  <span>{rescueAlreadyActive ? "Rescue timer уже запущен" : action.description}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <label className="status-select-inline">
          <span>Статус:</span>
          <select
            disabled={!access.canManageDialogs || (isClosed && status !== "closed")}
            onChange={(event) => onStatusChange(event.target.value)}
            value={status}
          >
            {Object.entries(statusLabels).map(([key, label]) => (
              <option disabled={isClosed && !["closed", "reopened"].includes(key)} key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label className="topic-select">
          <span>Тематика:</span>
          <select value={topic} onChange={(event) => onTopic(event.target.value)}>
            <option value="">Не выбрана</option>
            {topicOptions.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="transcript-toolbar" aria-label="Фильтр истории чата">
        <div className="transcript-toolbar-left">
          <div className="transcript-filter-buttons" role="group" aria-label="Тип записей">
            {[
              ["all", "Все"],
              ["internal", "Комментарии"],
              ["events", "Audit"]
            ].map(([id, label]) => (
              <button
                aria-pressed={transcriptMode === id}
                className={transcriptMode === id ? "active" : ""}
                key={id}
                onClick={() => setTranscriptMode(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {activeRescue ? (
            <div className={`rescue-timer-chip ${isRescueExpired ? "expired" : rescueRemainingSeconds <= 60 ? "danger" : ""}`}>
              <Clock3 size={16} />
              <strong>{formatRescueTimer(rescueRemainingSeconds)}</strong>
              <span>{isRescueExpired ? "Время вышло" : activeRescue.reason}</span>
              <b>{activeRescue.nextAction}</b>
            </div>
          ) : null}
        </div>
        <div className="transcript-toolbar-actions">
          <button className="compact-close-button" disabled={isClosed || !topic} onClick={onCloseDialog} type="button">
            {isClosed ? <ShieldCheck size={16} /> : <Lock size={16} />}
            {isClosed ? "Закрыт" : "Закрыть"}
          </button>
        </div>
      </div>
      {!topic && !isClosed ? (
        <div className="inline-disabled-reason">
          <AlertTriangle size={15} />
          Для закрытия выберите тематику. Это правило действует во всех ролях и каналах.
        </div>
      ) : null}
      <section className="bot-handoff-summary" aria-label="Резюме бота перед передачей оператору">
        <header>
          <Bot size={17} />
          <strong>Handoff summary: {botHandoffSummary.scenario}</strong>
          <span>{botHandoffSummary.reason}</span>
        </header>
        <div>
          <span>
            <b>Бот спросил</b>
            {botHandoffSummary.asked.join(", ")}
          </span>
          <span>
            <b>Получено</b>
            {botHandoffSummary.received.join(" · ")}
          </span>
          <span>
            <b>Дальше</b>
            Ответить оператору без повторного сбора данных
          </span>
        </div>
      </section>

      <div className="chat-transcript">
        <div className="day-divider">Сегодня</div>
        {visibleMessages.map((message) => (
          <MessageBubble key={message.id} message={message} onSaveTemplate={onSaveTemplate} />
        ))}
        {!visibleMessages.length ? <div className="empty-transcript">Нет записей для выбранного фильтра</div> : null}
      </div>

      <Composer
        mode={composeMode}
        setMode={setComposeMode}
        draft={draft}
        setDraft={setDraft}
        aiSuggestions={inlineAiSuggestions}
        onAiSuggestionAction={onAiSuggestionAction}
        attachments={attachments}
        onAttachFiles={onAttachFiles}
        onAttachmentComplete={onAttachmentComplete}
        onAttachmentRetry={onAttachmentRetry}
        onAttachmentRemove={onAttachmentRemove}
        onSend={onSend}
        templates={templates}
        onSaveTemplate={onSaveTemplate}
        disabled={isClosed}
      />
    </section>
  );
}

function MessageBubble({ message, onSaveTemplate }) {
  if (message.type === "event") {
    return <AuditEventCard message={message} />;
  }

  if (message.type === "internal") {
    return (
      <article className="internal-note">
        <strong>Внутренний комментарий</strong>
        <p>{message.text}</p>
        {message.attachments?.length ? (
          <div className="message-attachments">
            {message.attachments.map((attachment) => (
              <AttachmentPreview attachment={attachment} compact key={attachment.id} />
            ))}
          </div>
        ) : null}
        <footer>
          <span>{message.author}</span>
          <time>{message.time}</time>
        </footer>
      </article>
    );
  }

  return (
    <article className={`message-bubble ${message.side}`}>
      <p>{message.text}</p>
      {message.attachments?.length ? (
        <div className="message-attachments">
          {message.attachments.map((attachment) => (
            <AttachmentPreview attachment={attachment} compact key={attachment.id} />
          ))}
        </div>
      ) : null}
      <footer>
        {message.side === "agent" ? (
          <button
            aria-label="Сохранить сообщение как шаблон"
            onClick={() => onSaveTemplate(message.text)}
            title="Сохранить как шаблон"
            type="button"
          >
            <BookOpen size={14} />
          </button>
        ) : null}
        <time>{message.time}</time>
      </footer>
    </article>
  );
}

function AuditEventCard({ message }) {
  const fromStatusLabel = message.fromStatus ? statusLabels[message.fromStatus] ?? message.fromStatus : "";
  const toStatusLabel = message.toStatus ? statusLabels[message.toStatus] ?? message.toStatus : "";

  return (
    <article className={`audit-event-card ${message.eventKind ?? "legacy"}`}>
      <header>
        <span>{message.eventKind ? "Audit" : "Событие"}</span>
        <time>{message.time}</time>
      </header>
      <p>{message.detail ?? message.text}</p>
      <footer>
        {message.actor ? <span>{message.actor}</span> : null}
        {fromStatusLabel || toStatusLabel ? (
          <b>
            {fromStatusLabel ? <i>{fromStatusLabel}</i> : null}
            {fromStatusLabel && toStatusLabel ? " -> " : null}
            {toStatusLabel ? <i>{toStatusLabel}</i> : null}
          </b>
        ) : null}
        {message.fromTopic || message.toTopic ? (
          <b>
            {message.fromTopic ? <i>{message.fromTopic}</i> : null}
            {message.fromTopic && message.toTopic ? " -> " : null}
            {message.toTopic ? <i>{message.toTopic}</i> : null}
          </b>
        ) : null}
      </footer>
    </article>
  );
}

function AttachmentPreview({ attachment, compact = false }) {
  return (
    <span className={`attachment-preview ${compact ? "compact" : ""}`}>
      <span className="attachment-thumb">
        {attachment.previewUrl ? (
          <img alt={`Превью ${attachment.name}`} src={attachment.previewUrl} />
        ) : (
          <FileText size={compact ? 16 : 18} />
        )}
      </span>
      <span className="attachment-meta">
        <strong>{attachment.name}</strong>
        <small>{attachment.type} · {attachment.size}</small>
      </span>
    </span>
  );
}

function AiComposerPanel({ suggestions = [], disabled, onAction }) {
  if (!suggestions.length) {
    return null;
  }

  return (
    <div className="inline-ai-panel" aria-label="AI-подсказки в чате">
      {suggestions.map((suggestion) => (
        <article className={`inline-ai-card ${suggestion.state}`} key={suggestion.id}>
          <header>
            <span>
              <Sparkles size={16} />
              <strong>{suggestion.title}</strong>
            </span>
            <b>{suggestion.confidence}%</b>
          </header>
          <p>{suggestion.text}</p>
          <div className="inline-ai-meta">
            <span>{suggestion.suggestedTopic}</span>
            <span>Тон: {suggestion.tone}</span>
            <span>Риск: {suggestion.risk}</span>
          </div>
          <footer>
            <span className={`status-chip ${suggestion.state === "idle" ? "info" : suggestion.state === "rejected" ? "closed" : "ok"}`}>
              {aiSuggestionStatusLabels[suggestion.state] ?? aiSuggestionStatusLabels.idle}
            </span>
            <div>
              <button disabled={disabled} onClick={() => onAction(suggestion, "accept")} type="button">
                <CheckCircle2 size={15} />
                Принять
              </button>
              <button disabled={disabled} onClick={() => onAction(suggestion, "edit")} type="button">
                <Pencil size={15} />
                Редактировать
              </button>
              <button disabled={disabled} onClick={() => onAction(suggestion, "reject")} type="button">
                <X size={15} />
                Отклонить
              </button>
            </div>
          </footer>
        </article>
      ))}
    </div>
  );
}

function Composer({
  mode,
  setMode,
  draft,
  setDraft,
  aiSuggestions: inlineAiSuggestions,
  onAiSuggestionAction,
  attachments,
  onAttachFiles,
  onAttachmentComplete,
  onAttachmentRetry,
  onAttachmentRemove,
  onSend,
  templates,
  onSaveTemplate,
  disabled
}) {
  const primaryTemplate = templates[0];
  const fileInputRef = useRef(null);
  const [isTemplatePickerOpen, setTemplatePickerOpen] = useState(false);
  const blockingAttachment = attachments.find((attachment) => attachment.status !== "ready");
  const sendDisabled = disabled || Boolean(blockingAttachment);
  const attachmentReason = blockingAttachment
    ? blockingAttachment.status === "uploading"
      ? "Дождитесь завершения загрузки вложений."
      : "Удалите вложение с ошибкой или повторите загрузку."
    : "";
  const aiDraft =
    mode === "internal"
      ? "Клиент эмоционален, перед закрытием проверьте статус доставки и добавьте ссылку на заказ во внутренний комментарий."
      : "Понимаю ожидание. Я проверю статус заказа и вернусь с точным временем доставки в этом диалоге.";

  function handleFileInputChange(event) {
    onAttachFiles(event.target.files);
    event.target.value = "";
  }

  return (
    <section className={`composer ${mode === "internal" ? "internal-mode" : ""}`}>
      <div className="composer-tabs">
        <button className={mode === "reply" ? "active" : ""} onClick={() => setMode("reply")} disabled={disabled}>
          <MessageCircle size={17} />
          Ответ клиенту
        </button>
        <button className={mode === "internal" ? "active" : ""} onClick={() => setMode("internal")} disabled={disabled}>
          <Info size={17} />
          Внутренний комментарий
        </button>
        <button
          aria-expanded={isTemplatePickerOpen}
          onClick={() => setTemplatePickerOpen((current) => !current)}
          disabled={disabled || !primaryTemplate}
          type="button"
        >
          <BookOpen size={17} />
          Шаблоны
        </button>
      </div>
      {isTemplatePickerOpen ? (
        <div className="composer-template-picker">
          {templates.slice(0, 4).map((template) => (
            <button
              key={template.id}
              onClick={() => {
                setDraft(template.text);
                setTemplatePickerOpen(false);
              }}
              type="button"
            >
              <strong>{template.title}</strong>
              <span>{template.scope} · {template.channel} · {template.topic}</span>
            </button>
          ))}
        </div>
      ) : null}
      <AiComposerPanel suggestions={inlineAiSuggestions} disabled={disabled} onAction={onAiSuggestionAction} />
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={disabled ? "Диалог закрыт" : mode === "internal" ? "Текст увидят только сотрудники..." : "Введите сообщение..."}
        disabled={disabled}
      />
      <input
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        aria-label="Выбор вложений"
        className="visually-hidden-file-input"
        disabled={disabled}
        multiple
        onChange={handleFileInputChange}
        ref={fileInputRef}
        type="file"
      />
      {attachments.length ? (
        <div className="attachment-queue" aria-label="Очередь вложений">
          {attachments.map((attachment) => (
            <article className={`attachment-card ${attachment.status}`} key={attachment.id}>
              <AttachmentPreview attachment={attachment} />
              <span className={`attachment-status ${attachment.status}`}>
                {attachment.status === "uploading" ? <UploadCloud size={14} /> : null}
                {attachment.status === "error" ? <AlertTriangle size={14} /> : null}
                {attachmentStatusLabels[attachment.status]}
              </span>
              <div className="attachment-progress" aria-hidden="true">
                <i style={{ width: `${attachment.progress}%` }} />
              </div>
              {attachment.error ? <p>{attachment.error}</p> : null}
              <div className="attachment-actions">
                {attachment.status === "uploading" ? (
                  <button disabled={disabled} onClick={() => onAttachmentComplete(attachment.id)} type="button">Завершить</button>
                ) : null}
                {attachment.status === "error" && attachment.retryable ? (
                  <button disabled={disabled} onClick={() => onAttachmentRetry(attachment.id)} type="button">
                    <RotateCcw size={14} />
                    Повторить
                  </button>
                ) : null}
                <button aria-label={`Удалить ${attachment.name}`} disabled={disabled} onClick={() => onAttachmentRemove(attachment.id)} title="Удалить вложение" type="button">
                  <Trash2 size={14} />
                  Удалить
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {attachmentReason ? (
        <div className="composer-warning">
          <AlertTriangle size={15} />
          {attachmentReason}
        </div>
      ) : null}
      <footer className="composer-footer">
        <div className="composer-tools">
          <button aria-label="Прикрепить файл" disabled={disabled} onClick={() => fileInputRef.current?.click()} title="Прикрепить файл" type="button"><Paperclip size={18} /></button>
          <button aria-label="Добавить реакцию" disabled={disabled} onClick={() => setDraft(`${draft} Спасибо.`.trim())} type="button"><Smile size={18} /></button>
          <button aria-label="Сохранить как шаблон" disabled={disabled} onClick={onSaveTemplate} title="Сохранить как шаблон" type="button"><BookOpen size={18} /></button>
          <button
            aria-label="ИИ-подсказка"
            disabled={disabled}
            onClick={() => {
              if (inlineAiSuggestions.length) {
                onAiSuggestionAction(inlineAiSuggestions[0], "edit");
                return;
              }

              setDraft((current) => [current.trim(), aiDraft].filter(Boolean).join("\n\n"));
            }}
            title="ИИ-подсказка"
            type="button"
          >
            <Sparkles size={18} />
          </button>
        </div>
        <button className="send-button" onClick={onSend} disabled={sendDisabled} title={attachmentReason || undefined}>
          <Send size={18} />
          {mode === "internal" ? "Сохранить" : "Отправить"}
        </button>
      </footer>
    </section>
  );
}

function CustomerPanel({ conversation, topic, onTopic, setDraft, templates, onClose, access, isClosed }) {
  return (
    <aside className="customer-panel" aria-label="Карточка клиента">
      <PanelSection title="О клиенте" action={<button aria-label="Копировать"><Copy size={18} /></button>}>
        <InfoRow label="Телефон" value={access.canViewSensitive ? conversation.phone : maskPhone(conversation.phone)} />
        <InfoRow label="Устройство" value={conversation.device} icon={<Smartphone size={15} />} />
        <InfoRow label="Точка входа" value={conversation.entry} />
        <InfoRow label="Клиент с" value={conversation.clientSince} />
        <InfoRow label="Язык" value={conversation.language} />
        <div className="channel-list">
          <span>Канал(ы)</span>
          <div>
            {["SDK", "Telegram", "MAX", "VK"].map((channel) => (
              <span className={`channel-chip ${channel.toLowerCase()}`} key={channel}>{channel}</span>
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Предыдущие диалоги" action={<button>Смотреть все</button>}>
        <div className="history-list">
          {(conversation.previous.length ? conversation.previous : [["-", "Истории пока нет", "Новый"]]).map(([date, title, status]) => (
            <div className="history-row" key={`${date}${title}`}>
              <time>{date}</time>
              <span>{title}</span>
              <b>{status}</b>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Теги" action={<button><Plus size={16} /> Добавить тег</button>}>
        <div className="tag-list">
          {conversation.tags.map((tag) => (
            <span key={tag}>{tag}<button aria-label={`Удалить тег ${tag}`}>×</button></span>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Рекомендуемые шаблоны">
        <div className="template-list">
          {templates.slice(0, 3).map((template) => (
            <button key={template.id} onClick={() => setDraft(template.text)}>
              <span>
                <strong>{template.title}</strong>
                <small>{template.scope} · {template.channel}</small>
              </span>
              <b>Вставить</b>
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Рекомендуемые статьи">
        <div className="article-list">
          {["Отслеживание заказа", "Сроки и условия доставки"].map((title) => (
            <button key={title}>
              <span>
                <strong>{title}</strong>
                <small>{title === "Отслеживание заказа" ? "Инструкция" : "Статья"}</small>
              </span>
              <FileText size={17} />
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Закрытие диалога">
        <label className="close-topic">
          <span>Тематика</span>
          <select value={topic} onChange={(event) => onTopic(event.target.value)} disabled={isClosed}>
            <option value="">Не выбрана</option>
            {topicOptions.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        </label>
        <button className="close-button" onClick={onClose} disabled={isClosed || !topic}>
          {isClosed ? <ShieldCheck size={17} /> : <Lock size={17} />}
          {isClosed ? "Закрыт" : "Закрыть"}
        </button>
        {!topic ? (
          <p className="close-warning">
            <AlertTriangle size={16} />
            Для закрытия укажите тематику
          </p>
        ) : null}
      </PanelSection>
    </aside>
  );
}

function PanelSection({ title, action, children }) {
  return (
    <section className="panel-section">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function InfoRow({ label, value, icon }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
      {icon}
    </div>
  );
}

function Toast({ message, onClose }) {
  return (
    <button className="toast" onClick={onClose}>
      <CircleGauge size={18} />
      {message}
    </button>
  );
}

export default App;
