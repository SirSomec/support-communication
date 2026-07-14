import React, { useEffect, useMemo, useState } from "react";
import { getRescueRemainingSeconds } from "../../app/dialogModel.js";
import { dialogService } from "../../services/dialogService.js";
import { AiAssistModal } from "./AiAssistModal.jsx";
import { AuditTimeline } from "./AuditTimeline.jsx";
import { BotHandoffSummary } from "./BotHandoffSummary.jsx";
import { ChatHeader } from "./ChatHeader.jsx";
import { buildClientThreadTimeline, resolveThreadSendTarget } from "./clientThreadModel.js";
import { Composer } from "./Composer.jsx";
import { TranscriptToolbar } from "./TranscriptToolbar.jsx";

export function ChatPane({
  appealScrollTarget,
  assignees,
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
  onReplyChannelChange,
  onSend,
  replyChannel,
  replyChannelOptions,
  templates,
  onSaveTemplate,
  onDialogAction,
  onAssignment,
  onCloseDialog,
  onStatusChange,
  access,
  isClosed,
  status,
  topicOptions,
  topics
}) {
  const [rescueNow, setRescueNow] = useState(Date.now());
  // null — модалка закрыта; иначе { loading, error, data } текущего запроса ИИ-подсказки.
  const [aiAssist, setAiAssist] = useState(null);
  const activeRescue = conversation.rescue?.state === "active" && !isClosed ? conversation.rescue : null;
  const rescueRemainingSeconds = activeRescue ? getRescueRemainingSeconds(activeRescue, rescueNow) : 0;
  const isRescueExpired = Boolean(activeRescue && rescueRemainingSeconds === 0);
  // Единая лента клиента: все обращения треда с разделителями между ними.
  const timeline = useMemo(
    () => buildClientThreadTimeline(conversation, { topics: topics ?? {}, transcriptMode }),
    [conversation, topics, transcriptMode]
  );

  useEffect(() => {
    if (!activeRescue) {
      return undefined;
    }

    setRescueNow(Date.now());
    const timer = window.setInterval(() => setRescueNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeRescue?.deadlineAt]);

  // Смена диалога закрывает модалку: подсказки другого клиента не должны пережить переключение.
  useEffect(() => {
    setAiAssist(null);
  }, [conversation.id]);

  async function requestAiAssist() {
    setAiAssist({ loading: true });
    // Анализируем то обращение, в которое уйдет ответ (выбранный канал треда).
    const targetConversationId = resolveThreadSendTarget(conversation, replyChannel) ?? conversation.id;
    const response = await dialogService.fetchAiReplySuggestions(targetConversationId);
    const suggestions = Array.isArray(response.data?.suggestions) ? response.data.suggestions : [];

    // Оператор мог закрыть модалку во время запроса — результат тогда не показываем.
    setAiAssist((current) => {
      if (!current) {
        return current;
      }

      if (response.status !== "ok" || !suggestions.length) {
        return { error: response.error?.message ?? "Не удалось получить ИИ-подсказку. Попробуйте ещё раз." };
      }

      return {
        data: {
          citations: Array.isArray(response.data?.citations) ? response.data.citations : [],
          knowledgeUsed: Boolean(response.data?.knowledgeUsed),
          suggestions
        }
      };
    });
  }

  function handleAiAssistPick(suggestion) {
    setDraft((current) => [current.trim(), suggestion.text].filter(Boolean).join("\n\n"));
    setComposeMode("reply");
    setAiAssist(null);
  }

  return (
    <section className="chat-pane" aria-label="Окно чата">
      <ChatHeader
        access={access}
        activeRescue={activeRescue}
        assignees={assignees}
        conversation={conversation}
        isClosed={isClosed}
        onDialogAction={onDialogAction}
        onAssignment={onAssignment}
        onStatusChange={onStatusChange}
        onTopic={onTopic}
        status={status}
        topic={topic}
        topicOptions={topicOptions}
      />

      <TranscriptToolbar
        activeRescue={activeRescue}
        isClosed={isClosed}
        isRescueExpired={isRescueExpired}
        onCloseDialog={onCloseDialog}
        onTranscriptModeChange={setTranscriptMode}
        rescueRemainingSeconds={rescueRemainingSeconds}
        topic={topic}
        transcriptMode={transcriptMode}
      />
      <BotHandoffSummary
        canViewSensitive={access?.canViewSensitive}
        conversationId={conversation.id}
        handoff={conversation.botHandoff}
        phone={conversation.phone}
        scenarioId={conversation.botHandoff?.botId}
        topic={topic || conversation.topic}
      />
      <AuditTimeline
        appealScrollTarget={appealScrollTarget}
        onSaveTemplate={onSaveTemplate}
        timeline={timeline}
      />

      <Composer
        mode={composeMode}
        setMode={setComposeMode}
        draft={draft}
        setDraft={setDraft}
        aiSuggestions={inlineAiSuggestions}
        onAiSuggestionAction={onAiSuggestionAction}
        onAiAssist={requestAiAssist}
        attachments={attachments}
        onAttachFiles={(fileList) => onAttachFiles(fileList, replyChannel || conversation.channel)}
        onAttachmentComplete={onAttachmentComplete}
        onAttachmentRetry={onAttachmentRetry}
        onAttachmentRemove={onAttachmentRemove}
        onReplyChannelChange={onReplyChannelChange}
        onSend={onSend}
        replyChannel={replyChannel}
        replyChannelOptions={replyChannelOptions}
        templates={templates}
        onSaveTemplate={onSaveTemplate}
        disabled={isClosed}
      />

      {aiAssist ? (
        <AiAssistModal
          citations={aiAssist.data?.citations ?? []}
          error={aiAssist.error}
          knowledgeUsed={Boolean(aiAssist.data?.knowledgeUsed)}
          loading={Boolean(aiAssist.loading)}
          onClose={() => setAiAssist(null)}
          onPick={handleAiAssistPick}
          onRetry={requestAiAssist}
          suggestions={aiAssist.data?.suggestions ?? []}
        />
      ) : null}
    </section>
  );
}
