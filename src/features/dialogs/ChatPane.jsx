import React, { useEffect, useMemo, useState } from "react";
import { getRescueRemainingSeconds } from "../../app/dialogModel.js";
import { AuditTimeline } from "./AuditTimeline.jsx";
import { BotHandoffSummary } from "./BotHandoffSummary.jsx";
import { ChatHeader } from "./ChatHeader.jsx";
import { buildClientThreadTimeline } from "./clientThreadModel.js";
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
    </section>
  );
}
