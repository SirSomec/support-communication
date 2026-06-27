import React, { Suspense, lazy } from "react";
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
import { RouteLoading } from "./app/RouteLoading.jsx";
import { useTemplateLibrary } from "./app/useTemplateLibrary.js";
import { useWorkspaceRoute } from "./app/useWorkspaceRoute.js";
import { serviceAdminAccessProfile, serviceAdminRole } from "./app/access.js";
import { DialogWorkspace } from "./features/dialogs/DialogWorkspace.jsx";
import { DraftSwitchDialog, OutboundDialogLauncher, SaveTemplateDialog } from "./features/dialogs/DialogModals.jsx";
import { Sidebar, TopBar } from "./features/app-shell/AppShell.jsx";
import { SectionRouter } from "./features/section-router.jsx";
import { Toast } from "./ui.jsx";
import {
  aiSuggestions,
  conversations
} from "./data.js";

const SERVICE_ADMIN_DEMO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_SERVICE_ADMIN === "true";
const LandingPage = lazy(() => import("./features/public/index.js"));
const AuthPage = lazy(() => import("./features/auth/index.js"));
const OrganizationOnboarding = lazy(() => import("./features/onboarding/index.js"));
const ServiceAdminDashboard = lazy(() => import("./features/service-admin/index.js").then((module) => ({
  default: module.ServiceAdminDashboard
})));

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
  const appShellAccess = SERVICE_ADMIN_DEMO_ENABLED ? { ...access, canServiceAdmin: true } : access;
  const { route, routeActions } = useWorkspaceRoute({
    access: appShellAccess,
    onAuthenticated: (payload) => {
      const organizationName = payload?.organization?.name ?? payload?.tenant?.name ?? "организация";
      setToast(`Вход выполнен: ${organizationName}`);
    },
    onDenied: setToast
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

  if (route.namespace === "public") {
    return (
      <div data-testid="route-public-landing">
        <Suspense fallback={<RouteLoading label="Загрузка публичного контура" />}>
          <LandingPage
            onNavigateAuth={routeActions.openAuth}
            onRequestDemo={() => setToast("Заявка на демо отправлена команде продаж.")}
            onStartTrial={routeActions.openOnboarding}
          />
        </Suspense>
        {toast ? <Toast message={toast} onClose={handleToastClose} /> : null}
      </div>
    );
  }

  if (route.namespace === "auth") {
    return (
      <div data-testid="route-auth-login">
        <Suspense fallback={<RouteLoading label="Загрузка авторизации" />}>
          <AuthPage
            onAuthSuccess={routeActions.completeAuth}
            onNavigateLanding={routeActions.openLanding}
            onStartOnboarding={routeActions.openOnboarding}
          />
        </Suspense>
        {toast ? <Toast message={toast} onClose={handleToastClose} /> : null}
      </div>
    );
  }

  if (route.namespace === "onboarding") {
    return (
      <div data-testid="route-onboarding">
        <Suspense fallback={<RouteLoading label="Загрузка onboarding" />}>
          <OrganizationOnboarding
            onBack={routeActions.openLanding}
            onFinish={routeActions.completeOnboarding}
          />
        </Suspense>
        {toast ? <Toast message={toast} onClose={handleToastClose} /> : null}
      </div>
    );
  }

  if (route.namespace === "service-admin" && appShellAccess.canServiceAdmin) {
    return (
      <div data-testid="route-service-admin" className="app-shell">
        <Sidebar active="service-admin" access={serviceAdminAccessProfile} onSelect={handleSectionSelect} />
        <main className="workspace">
          <TopBar
            access={serviceAdminAccessProfile}
            activeSection="service-admin"
            onOpenAuth={routeActions.openAuth}
            onOpenLanding={routeActions.openLanding}
            onOpenServiceAdmin={routeActions.openServiceAdmin}
            onOutbound={handleOutboundRequest}
            onRoleMode={handleRoleModeChange}
            onToast={setToast}
            roleMode={serviceAdminRole}
            showRoleSwitcher={false}
          />
          <Suspense fallback={<RouteLoading label="Загрузка администрирования сервиса" />}>
            <ServiceAdminDashboard
              onBack={routeActions.openApp}
              onToast={setToast}
            />
          </Suspense>
        </main>
        {toast ? <Toast message={toast} onClose={handleToastClose} /> : null}
      </div>
    );
  }

  return (
    <div className="app-shell" data-testid="route-app-shell">
      <Sidebar active={section} access={access} onSelect={handleSectionSelect} />
      <main className="workspace">
        <TopBar
          access={appShellAccess}
          activeSection={section}
          onOpenAuth={routeActions.openAuth}
          onOpenLanding={routeActions.openLanding}
          onOpenServiceAdmin={routeActions.openServiceAdmin}
          onOutbound={handleOutboundRequest}
          onRoleMode={handleRoleModeChange}
          onToast={setToast}
          roleMode={roleMode}
        />
        {section === "dialogs" ? (
          <DialogWorkspace
            access={access}
            aiSuggestions={visibleAiSuggestions}
            allConversations={conversationItems}
            attachments={attachments}
            closedIds={closedIds}
            composeMode={composeMode}
            conversation={selected}
            conversations={filtered}
            draft={draft}
            filter={filter}
            isClosed={isClosed}
            onAiSuggestionAction={handleAiSuggestionAction}
            onAttachFiles={handleAttachFiles}
            onAttachmentComplete={handleCompleteAttachment}
            onAttachmentRemove={handleRemoveAttachment}
            onAttachmentRetry={handleRetryAttachment}
            onCloseDialog={handleClose}
            onConversationSelect={handleConversationSelect}
            onDialogAction={handleDialogAction}
            onFilter={setFilter}
            onQuery={setQuery}
            onQueueFilterChange={updateQueueFilter}
            onQueueFiltersReset={resetQueueFilters}
            onSaveTemplate={handleOpenTemplateSave}
            onSend={handleSend}
            onStatusChange={handleStatusChange}
            onTopic={handleTopicChange}
            query={query}
            queueFilters={queueFilters}
            selectedId={selectedId}
            setComposeMode={setComposeMode}
            setDraft={setDraft}
            setTranscriptMode={setTranscriptMode}
            status={selectedStatus}
            templates={templateLibrary}
            topic={selectedTopic}
            topics={topics}
            transcriptMode={transcriptMode}
          />
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
