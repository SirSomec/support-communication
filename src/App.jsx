import React from "react";
import { useAiSuggestions } from "./app/useAiSuggestions.js";
import { useAppTransientState } from "./app/useAppTransientState.js";
import { useComposerAttachments } from "./app/useComposerAttachments.js";
import { useComposerState } from "./app/useComposerState.js";
import { useConversationMutations } from "./app/useConversationMutations.js";
import { useConversationSelection } from "./app/useConversationSelection.js";
import { useAppNavigation } from "./app/useAppNavigation.js";
import { useDialogActions } from "./app/useDialogActions.js";
import { useDialogQueueFilters } from "./app/useDialogQueueFilters.js";
import { useOutboundConversation } from "./app/useOutboundConversation.js";
import { useTemplateLibrary } from "./app/useTemplateLibrary.js";
import { ChatPane } from "./features/dialogs/ChatPane.jsx";
import { ConversationList } from "./features/dialogs/ConversationList.jsx";
import { CustomerPanel } from "./features/dialogs/CustomerPanel.jsx";
import { DraftSwitchDialog, OutboundDialogLauncher, SaveTemplateDialog } from "./features/dialogs/DialogModals.jsx";
import { Sidebar, TopBar } from "./features/app-shell/AppShell.jsx";
import { SectionRouter } from "./features/section-router.jsx";
import { Toast } from "./ui.jsx";
import {
  aiSuggestions,
  conversations
} from "./data.js";

function App() {
  const {
    handleToastClose,
    isOutboundOpen,
    setOutboundOpen,
    setToast,
    toast
  } = useAppTransientState();
  const {
    composeMode,
    draft,
    setComposeMode,
    setDraft,
    setTranscriptMode,
    transcriptMode
  } = useComposerState();
  const {
    appendMessage,
    applyConversationStatus,
    closedIds,
    conversationItems,
    setClosedIds,
    setConversationItems,
    setTopics,
    topics
  } = useConversationMutations({ initialConversations: conversations });
  const {
    access,
    section,
    roleMode,
    handleRoleModeChange,
    handleSectionSelect,
    handleBackToDialogs,
    handleOutboundRequest
  } = useAppNavigation({
    initialSection: "dialogs",
    initialRoleMode: "Администратор",
    isOutboundOpen,
    setOutboundOpen,
    setToast
  });
  const {
    attachments,
    clearAttachments,
    completeAttachment: handleCompleteAttachment,
    handleAttachFiles,
    hasAttachments,
    removeAttachment: handleRemoveAttachment,
    retryAttachment: handleRetryAttachment
  } = useComposerAttachments({ setToast });
  const {
    filter,
    filtered,
    query,
    queueFilters,
    resetQueueFilters,
    setFilter,
    setQuery,
    updateQueueFilter
  } = useDialogQueueFilters({ conversationItems, topics });
  const {
    handleConversationSelect,
    handleDiscardDraftAndSwitch,
    handleStayOnConversation,
    pendingConversation,
    selected,
    selectedId,
    setSelectedId
  } = useConversationSelection({
    conversationItems,
    draft,
    hasAttachments,
    clearAttachments,
    setDraft,
    setToast,
    initialSelectedId: "maria"
  });
  const selectedTopic = topics[selected.id] ?? "";
  const {
    closeSaveTemplateDialog,
    handleOpenTemplateSave,
    handleTemplateSave,
    saveTemplateDraft,
    setTemplateLibrary,
    templateLibrary
  } = useTemplateLibrary({
    draft,
    selectedChannel: selected.channel,
    selectedTopic,
    setToast
  });
  const selectedStatus = selected.status ?? "active";
  const isClosed = closedIds.has(selected.id) || selectedStatus === "closed";
  const { handleAiSuggestionAction, visibleAiSuggestions } = useAiSuggestions({
    suggestions: aiSuggestions,
    selectedId: selected.id,
    isClosed,
    appendMessage,
    setComposeMode,
    setDraft,
    setToast
  });
  const {
    handleClose,
    handleDialogAction,
    handleSend,
    handleStatusChange,
    handleTopicChange
  } = useDialogActions({
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
  });
  const { handleOutboundClose, handleOutboundCreate } = useOutboundConversation({
    clearAttachments,
    handleBackToDialogs,
    setConversationItems,
    setDraft,
    setOutboundOpen,
    setSelectedId,
    setToast,
    setTopics
  });

  return (
    <div className="app-shell">
      <Sidebar active={section} access={access} onSelect={handleSectionSelect} />
      <main className="workspace">
        <TopBar
          access={access}
          activeSection={section}
          onOutbound={handleOutboundRequest}
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
              onQueueFilterChange={updateQueueFilter}
              onQueueFiltersReset={resetQueueFilters}
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
          <SectionRouter
            section={section}
            onBack={handleBackToDialogs}
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
          onClose={handleOutboundClose}
          onCreate={handleOutboundCreate}
          onToast={setToast}
        />
      ) : null}
      {saveTemplateDraft ? (
        <SaveTemplateDialog
          draft={saveTemplateDraft}
          onClose={closeSaveTemplateDialog}
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
      {toast ? <Toast message={toast} onClose={handleToastClose} /> : null}
    </div>
  );
}

export default App;
