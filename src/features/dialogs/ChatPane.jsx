import React, { useEffect, useState } from "react";
import { getRescueRemainingSeconds } from "../../app/dialogModel.js";
import { AuditTimeline } from "./AuditTimeline.jsx";
import { ChatHeader } from "./ChatHeader.jsx";
import { Composer } from "./Composer.jsx";
import { TranscriptToolbar } from "./TranscriptToolbar.jsx";

export function ChatPane({
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
  onSend,
  templates,
  onSaveTemplate,
  onDialogAction,
  onAssignment,
  onCloseDialog,
  onStatusChange,
  access,
  isClosed,
  status,
  topicOptions
}) {
  const [rescueNow, setRescueNow] = useState(Date.now());
  const activeRescue = conversation.rescue?.state === "active" && !isClosed ? conversation.rescue : null;
  const rescueRemainingSeconds = activeRescue ? getRescueRemainingSeconds(activeRescue, rescueNow) : 0;
  const isRescueExpired = Boolean(activeRescue && rescueRemainingSeconds === 0);

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
      <AuditTimeline messages={conversation.messages} onSaveTemplate={onSaveTemplate} transcriptMode={transcriptMode} />

      <Composer
        mode={composeMode}
        setMode={setComposeMode}
        draft={draft}
        setDraft={setDraft}
        aiSuggestions={inlineAiSuggestions}
        onAiSuggestionAction={onAiSuggestionAction}
        attachments={attachments}
        onAttachFiles={(fileList) => onAttachFiles(fileList, conversation.channel)}
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
