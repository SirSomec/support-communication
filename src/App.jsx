import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useAiSuggestions } from "./app/useAiSuggestions.js";
import { useAppTransientState } from "./app/useAppTransientState.js";
import { useComposerAttachments } from "./app/useComposerAttachments.js";
import { useComposerState } from "./app/useComposerState.js";
import { useConversationInbox } from "./app/useConversationInbox.js";
import { useConversationSelection } from "./app/useConversationSelection.js";
import { useAppNavigation } from "./app/useAppNavigation.js";
import { useDialogActions } from "./app/useDialogActions.js";
import { useDialogQueueFilters } from "./app/useDialogQueueFilters.js";
import { useOutboundConversation } from "./app/useOutboundConversation.js";
import { RouteLoading } from "./app/RouteLoading.jsx";
import { useTemplateLibrary } from "./app/useTemplateLibrary.js";
import { useWorkspaceRoute } from "./app/useWorkspaceRoute.js";
import { useTenantSessionState } from "./app/useTenantSessionState.js";
import { resolveNotificationActionAvailability, resolveNotificationNavigationTarget } from "./app/notificationNavigation.js";
import { DialogWorkspace } from "./features/dialogs/DialogWorkspace.jsx";
import { DraftSwitchDialog, OutboundDialogLauncher, SaveTemplateDialog } from "./features/dialogs/DialogModals.jsx";
import { Sidebar, TopBar } from "./features/app-shell/AppShell.jsx";
import { SectionRouter } from "./features/section-router.jsx";
import { permissionService } from "./services/permissionService.js";
import { publicLeadService } from "./services/publicLeadService.js";
import { qualityService } from "./services/qualityService.js";
import { settingsService } from "./services/settingsService.js";
import { ScreenStateStrip, Skeleton, Toast, WorkspaceState } from "./ui.jsx";

const ROLE_SWITCHER_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROLE_SWITCHER === "true";
const SERVICE_ADMIN_UNAVAILABLE_MESSAGE = "Откройте /service-admin — этот раздел недоступен из рабочего места организации.";
const LandingPage = lazy(() => import("./features/public/index.js"));
const AuthPage = lazy(() => import("./features/auth/index.js"));
const OrganizationOnboarding = lazy(() => import("./features/onboarding/index.js"));

function App() {
  const [topicOptions, setTopicOptions] = useState([]);
  const [permissionModel, setPermissionModel] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [notificationNavigationTarget, setNotificationNavigationTarget] = useState(null);
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
  const tenantSession = useTenantSessionState({
    enabled: typeof window !== "undefined" && (window.location.hash === "#/app" || window.location.hash.startsWith("#/app"))
  });
  const {
    appendMessage,
    applyConversationAssignment,
    applyConversationStatus,
    assignees,
    closedIds,
    conversationItems,
    error: inboxError,
    loadConversationDetail,
    loading: inboxLoading,
    refreshInbox,
    setClosedIds,
    setConversationItems,
    setTopics,
    topics
  } = useConversationInbox({ sessionActive: tenantSession.authenticated });
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
    permissionModel,
    sessionPermissions: tenantSession.permissions,
    setOutboundOpen,
    setToast,
    useSessionPermissions: tenantSession.authenticated
  });
  const { route, routeActions } = useWorkspaceRoute({
    tenantSession,
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
  });
  const loadedDetailIdRef = useRef("");
  useEffect(() => {
    if (!tenantSession.authenticated || !selectedId || selectedId === "empty") {
      loadedDetailIdRef.current = "";
      return;
    }

    const hasConversation = conversationItems.some((conversation) => conversation.id === selectedId);
    if (!hasConversation && inboxLoading) {
      return;
    }

    if (loadedDetailIdRef.current === selectedId) {
      return;
    }

    loadedDetailIdRef.current = selectedId;
    void loadConversationDetail(selectedId, { force: true });
  }, [conversationItems, inboxLoading, loadConversationDetail, selectedId, tenantSession.authenticated]);
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
    enabled: tenantSession.authenticated,
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
    refreshInbox,
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
    operator: tenantSession.operator,
    refreshInbox,
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

  async function handlePublicDemoRequest(payload) {
    const response = await publicLeadService.createDemoRequest(payload);

    if (response.status === "ok") {
      setToast("Заявка на демо принята. Мы свяжемся с вами после проверки маршрута.");
      return response;
    }

    if (response.status === "rate_limited" && response.data?.duplicate) {
      setToast("Заявка уже принята. Повторная отправка ограничена.");
      return response;
    }

    setToast(response.error?.message ?? "Не удалось отправить заявку на демо.");
    return response;
  }

  function handleNotificationNavigation(actionTarget, item) {
    const resolvedTarget = resolveNotificationNavigationTarget(actionTarget);

    if (!resolvedTarget) {
      return {
        ok: false,
        message: access.reason ?? "Раздел из уведомления недоступен."
      };
    }

    if (resolvedTarget.namespace === "service-admin") {
      setToast(SERVICE_ADMIN_UNAVAILABLE_MESSAGE);
      return {
        ok: false,
        message: SERVICE_ADMIN_UNAVAILABLE_MESSAGE
      };
    }

    const targetSection = resolvedTarget.section;
    const targetResourceId = typeof resolvedTarget.detail?.resourceId === "string" ? resolvedTarget.detail.resourceId : "";

    if (!targetSection || !access.sections.includes(targetSection)) {
      return {
        ok: false,
        message: access.reason ?? "Раздел из уведомления недоступен."
      };
    }

    if (targetSection === "dialogs" && targetResourceId) {
      const targetConversation = conversationItems.find((conversation) => conversation.id === targetResourceId);
      if (!targetConversation) {
        return {
          ok: false,
          message: "Диалог из уведомления не найден."
        };
      }

      setSelectedId(targetResourceId);
    }

    setNotificationNavigationTarget(buildNotificationNavigationState(resolvedTarget, item));
    routeActions.openApp();
    handleSectionSelect(targetSection);

    return {
      ok: true,
      message: `${item?.type ?? "Уведомление"}: ${item?.action ?? "открыто"}`
    };
  }

  function getNotificationActionAvailability(actionTarget) {
    return resolveNotificationActionAvailability(actionTarget, {
      accessProfile: access,
      conversationItems
    });
  }

  useEffect(() => {
    if (route.namespace !== "app" || !tenantSession.authenticated) {
      setTopicOptions([]);
      setPermissionModel(null);
      return undefined;
    }

    let ignore = false;

    async function loadTopicOptions() {
      const response = await settingsService.fetchTopics();
      if (!ignore && response.status === "ok") {
        setTopicOptions(Array.isArray(response.data?.activeOptions) ? response.data.activeOptions : []);
      }
    }

    async function loadPermissionModel() {
      const response = await permissionService.fetchPermissionModel();
      if (!ignore && response.status === "ok") {
        setPermissionModel(response.data ?? null);
      }
    }

    loadTopicOptions();
    loadPermissionModel();
    return () => {
      ignore = true;
    };
  }, [route.namespace, tenantSession.authenticated]);

  useEffect(() => {
    if (!tenantSession.authenticated) {
      setAiSuggestions([]);
      return undefined;
    }

    let ignore = false;

    async function loadAiSuggestions() {
      const response = await qualityService.fetchQualityWorkspace();
      if (!ignore && response.status === "ok") {
        const suggestions = Array.isArray(response.data?.aiSuggestions)
          ? response.data.aiSuggestions
          : Array.isArray(response.data?.suggestions)
            ? response.data.suggestions
            : [];
        setAiSuggestions(suggestions);
      }
    }

    loadAiSuggestions();

    return () => {
      ignore = true;
    };
  }, [tenantSession.authenticated]);

  if (route.namespace === "public") {
    return (
      <div data-testid="route-public-landing">
        <Suspense fallback={<RouteLoading label="Загрузка публичного контура" />}>
          <LandingPage
            demoRequestEnabled
            onNavigateAuth={routeActions.openAuth}
            onRequestDemo={handlePublicDemoRequest}
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

  if (route.namespace === "app" && tenantSession.loading) {
    return (
      <div data-testid="route-app-loading">
        <RouteLoading label="Проверка tenant-сессии" />
      </div>
    );
  }

  if (route.namespace === "app" && !tenantSession.authenticated) {
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

  return (
    <div className="app-shell" data-testid="route-app-shell">
      <Sidebar active={section} access={access} onSelect={handleSectionSelect} operator={tenantSession.operator} />
      <main className="workspace">
        <TopBar
          access={access}
          activeSection={section}
          onOpenAuth={routeActions.openAuth}
          onOpenLanding={routeActions.openLanding}
          getNotificationActionAvailability={getNotificationActionAvailability}
          onNavigateNotificationAction={handleNotificationNavigation}
          onOutbound={handleOutboundRequest}
          onRoleMode={handleRoleModeChange}
          onToast={setToast}
          operatorConversationCount={conversationItems.filter((item) => item.operatorId === tenantSession.operator?.id).length}
          roleMode={roleMode}
          showRoleSwitcher={ROLE_SWITCHER_ENABLED}
        />
        {section === "dialogs" && !conversationItems.length ? (
          inboxLoading ? (
            <div aria-label="Загружаем диалоги" className="cockpit cockpit-skeleton" role="status">
              <div className="cockpit-skeleton-column">
                {[0, 1, 2, 3, 4, 5].map((row) => (
                  <div className="cockpit-skeleton-row" key={row}>
                    <Skeleton className="cockpit-skeleton-avatar" height={36} width={36} />
                    <div className="cockpit-skeleton-lines">
                      <Skeleton height={12} width="70%" />
                      <Skeleton height={10} width="90%" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="cockpit-skeleton-main">
                <Skeleton height={16} width="40%" />
                <Skeleton height={64} width="72%" />
                <Skeleton height={64} width="58%" />
                <Skeleton height={40} width="100%" />
              </div>
              <div className="cockpit-skeleton-column">
                <Skeleton height={14} width="55%" />
                <Skeleton height={90} width="100%" />
                <Skeleton height={90} width="100%" />
              </div>
            </div>
          ) : inboxError ? (
            <WorkspaceState
              tone="error"
              title="Не удалось загрузить диалоги"
              description={inboxError}
              actionLabel="Повторить"
              onAction={() => refreshInbox()}
            />
          ) : (
            <WorkspaceState
              tone="empty"
              title="Очередь пуста"
              description="Новые обращения появятся здесь после поступления из подключенных каналов. Исходящий диалог можно создать кнопкой «Новый диалог»."
              actionLabel="Обновить"
              onAction={() => refreshInbox()}
            />
          )
        ) : section === "dialogs" ? (
          <>
            {inboxLoading ? (
              <ScreenStateStrip items={[{ label: "Inbox", tone: "loading", value: "Загружается..." }]} />
            ) : null}
            {inboxError ? (
              <ScreenStateStrip items={[{ label: "Inbox", tone: "error", value: inboxError }]} />
            ) : null}
            <DialogWorkspace
              access={access}
              assignees={assignees}
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
              onAssignment={(payload) => applyConversationAssignment(selected.id, payload)}
              onFilter={setFilter}
              onQuery={setQuery}
              onQueueFilterChange={updateQueueFilter}
              onQueueFiltersReset={resetQueueFilters}
              onRefreshInbox={refreshInbox}
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
              topicOptions={topicOptions}
              topics={topics}
              transcriptMode={transcriptMode}
            />
          </>
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
            onTopicOptionsChange={setTopicOptions}
            operator={tenantSession.operator}
            topicOptions={topicOptions}
            navigationTarget={notificationNavigationTarget?.namespace === "app" && notificationNavigationTarget.section === section ? notificationNavigationTarget : null}
          />
        )}
      </main>
      {isOutboundOpen ? (
        <OutboundDialogLauncher
          conversations={conversationItems}
          onClose={handleOutboundClose}
          onCreate={handleOutboundCreate}
          onToast={setToast}
          topicOptions={topicOptions}
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

function buildNotificationNavigationState(resolvedTarget, item) {
  return {
    ...(resolvedTarget.detail ?? {}),
    namespace: resolvedTarget.namespace,
    section: resolvedTarget.section,
    view: resolvedTarget.view,
    notificationId: item?.id ?? "",
    navigationKey: `${item?.id ?? resolvedTarget.section}:${Date.now()}`
  };
}

export default App;
