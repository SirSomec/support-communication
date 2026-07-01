import { ChatPane } from "./ChatPane.jsx";
import { ConversationList } from "./ConversationList.jsx";
import { CustomerPanel } from "./CustomerPanel.jsx";
import "./dialogs.css";

export function DialogWorkspace({
  access,
  aiSuggestions,
  allConversations,
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
  onFilter,
  onQuery,
  onQueueFilterChange,
  onQueueFiltersReset,
  onSaveTemplate,
  onSend,
  onStatusChange,
  onTopic,
  query,
  queueFilters,
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
  return (
    <div className="cockpit">
      <ConversationList
        conversations={conversations}
        allConversations={allConversations}
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
      <ChatPane
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
        onSend={onSend}
        templates={templates}
        onSaveTemplate={onSaveTemplate}
        onDialogAction={onDialogAction}
        onCloseDialog={onCloseDialog}
        onStatusChange={onStatusChange}
        access={access}
        isClosed={isClosed}
        status={status}
        topicOptions={topicOptions}
      />
      <CustomerPanel
        conversation={conversation}
        topic={topic}
        onTopic={onTopic}
        setDraft={setDraft}
        templates={templates}
        onClose={onCloseDialog}
        access={access}
        isClosed={isClosed}
        topicOptions={topicOptions}
      />
    </div>
  );
}

export default DialogWorkspace;
