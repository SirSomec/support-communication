import { ChatPane } from "./ChatPane.jsx";
import { ConversationList } from "./ConversationList.jsx";
import { CustomerPanel } from "./CustomerPanel.jsx";
import "./dialogs.css";

export function DialogWorkspace({
  access,
  appealScrollTarget,
  assignees,
  aiSuggestions,
  allConversations,
  allThreads,
  attachments,
  closedIds,
  composeMode,
  conversation,
  conversations,
  draft,
  filter,
  isClosed,
  onAiSuggestionAction,
  onAttachFiles,
  onAttachmentComplete,
  onAttachmentRemove,
  onAttachmentRetry,
  onCloseDialog,
  onConversationSelect,
  onDialogAction,
  onEnsureConversationLoaded,
  onNavigateToAppeal,
  onAssignment,
  onFilter,
  onQuery,
  onQueueFilterChange,
  onQueueFiltersReset,
  onReplyChannelChange,
  onSaveTemplate,
  onSend,
  onStatusChange,
  onTopic,
  query,
  queueFilters,
  replyChannel,
  replyChannelOptions,
  selectedId,
  setComposeMode,
  setDraft,
  setTranscriptMode,
  status,
  templates,
  topic,
  topicOptions,
  topics,
  transcriptMode
}) {
  const hasConversation = Boolean(conversation && conversation.id !== "empty");

  return (
    <div className="cockpit">
      <ConversationList
        conversations={conversations}
        allConversations={allThreads ?? allConversations}
        selectedId={selectedId}
        onSelect={onConversationSelect}
        filter={filter}
        onFilter={onFilter}
        queueFilters={queueFilters}
        onQueueFilterChange={onQueueFilterChange}
        onQueueFiltersReset={onQueueFiltersReset}
        query={query}
        onQuery={onQuery}
        topics={topics}
        topicOptions={topicOptions}
        closedIds={closedIds}
      />
      {hasConversation ? <ChatPane
        appealScrollTarget={appealScrollTarget}
        assignees={assignees}
        conversation={conversation}
        topic={topic}
        onTopic={onTopic}
        composeMode={composeMode}
        setComposeMode={setComposeMode}
        transcriptMode={transcriptMode}
        setTranscriptMode={setTranscriptMode}
        draft={draft}
        setDraft={setDraft}
        aiSuggestions={aiSuggestions}
        onAiSuggestionAction={onAiSuggestionAction}
        attachments={attachments}
        onAttachFiles={onAttachFiles}
        onAttachmentComplete={onAttachmentComplete}
        onAttachmentRetry={onAttachmentRetry}
        onAttachmentRemove={onAttachmentRemove}
        onReplyChannelChange={onReplyChannelChange}
        onSend={onSend}
        replyChannel={replyChannel}
        replyChannelOptions={replyChannelOptions}
        templates={templates}
        onSaveTemplate={onSaveTemplate}
        onDialogAction={onDialogAction}
        onAssignment={onAssignment}
        onCloseDialog={onCloseDialog}
        onStatusChange={onStatusChange}
        access={access}
        isClosed={isClosed}
        status={status}
        topicOptions={topicOptions}
        topics={topics}
      /> : (
        <section className="dialog-empty-workspace" aria-label="Диалог не выбран">
          <strong>Нет выбранного диалога</strong>
          <span>Новые обращения появятся здесь после поступления из подключенных каналов.</span>
        </section>
      )}
      {hasConversation ? <CustomerPanel
        conversation={conversation}
        topic={topic}
        onTopic={onTopic}
        setDraft={setDraft}
        templates={templates}
        onClose={onCloseDialog}
        access={access}
        isClosed={isClosed}
        topicOptions={topicOptions}
        allConversations={allConversations}
        onEnsureConversationLoaded={onEnsureConversationLoaded}
        onNavigateToAppeal={onNavigateToAppeal}
      /> : <aside className="customer-panel customer-panel-empty" aria-label="Карточка клиента не выбрана" />}
    </div>
  );
}

export default DialogWorkspace;
