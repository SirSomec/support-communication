import React, { useEffect, useState } from "react";
import { getRescueRemainingSeconds } from "../../app/dialogModel.js";
import { AuditTimeline, BotHandoffSummary } from "./AuditTimeline.jsx";
import { ChatHeader } from "./ChatHeader.jsx";
import { Composer } from "./Composer.jsx";
import { TranscriptToolbar } from "./TranscriptToolbar.jsx";

export function ChatPane({
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
  const [rescueNow, setRescueNow] = useState(Date.now());
  const activeRescue = conversation.rescue?.state === "active" && !isClosed ? conversation.rescue : null;
  const rescueRemainingSeconds = activeRescue ? getRescueRemainingSeconds(activeRescue, rescueNow) : 0;
  const isRescueExpired = Boolean(activeRescue && rescueRemainingSeconds === 0);
  const botHandoffSummary = {
    scenario: topic?.includes("Авторизация") ? "Код подтверждения" : topic?.includes("Оплата") ? "Первичный возврат" : "Статус доставки",
    asked: ["подтверждение телефона", "последний заказ", "согласие на подключение оператора"],
    received: [conversation.phone, conversation.topic || "тематика не выбрана", conversation.entry],
    reason: conversation.slaTone === "danger" ? "бот передал из-за SLA-риска" : "бот передал после запроса человека"
  };

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
        conversation={conversation}
        isClosed={isClosed}
        onDialogAction={onDialogAction}
        onStatusChange={onStatusChange}
        onTopic={onTopic}
        status={status}
        topic={topic}
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
      <BotHandoffSummary summary={botHandoffSummary} />

      <AuditTimeline messages={conversation.messages} onSaveTemplate={onSaveTemplate} transcriptMode={transcriptMode} />

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
