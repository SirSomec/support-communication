import React, { useEffect, useRef, useState } from "react";
import "./automation.css";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  FileText,
  ListChecks,
  Pencil,
  PlayCircle,
  Plus,
  Sparkles,
  Workflow,
  Zap
} from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { buildBotScenarioUpdatePatch, changeBotScenarioLifecycle, discardBotScenarioDraft, publishBotScenario, rollbackBotScenario, submitBotScenarioUpdate } from "../../app/automationScenarioActions.js";
import { automationService } from "../../services/automationService.js";
import { knowledgeService } from "../../services/knowledgeService.js";
import { ConfirmDialog, MetricTile, ProductScreen, SectionTitle, SegmentedControl } from "../../ui.jsx";
import { ScenarioCreationWizard } from "./ScenarioCreationWizard.jsx";
import { ScenarioListPanel } from "./ScenarioListPanel.jsx";
import { ScenarioArchiveConfirmModal, ScenarioPauseConfirmModal, ScenarioPublishChecklistModal } from "./ScenarioLifecycleModals.jsx";
import { ScenarioKnowledgeSourceSelector } from "./ScenarioKnowledgeSourceSelector.jsx";
import { ScenarioConsole } from "./ScenarioConsole.jsx";
import { botNodeTypeLabels, botNodeTypeOptions, createDraftScenario, createScenarioFromWizard, formatScenarioStatusLabel, loadAdvancedModePreference, saveAdvancedModePreference } from "./automationModel.js";

export function AutomationScreen({ onBack, onToast, access }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auditEvents, setAuditEvents] = useState([]);
  const [proactiveRules, setProactiveRules] = useState([]);
  const [runtimeMetrics, setRuntimeMetrics] = useState([]);
  const [scenarioItems, setScenarioItems] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [importDraft, setImportDraft] = useState("");
  const [importError, setImportError] = useState("");
  const [savingAction, setSavingAction] = useState("");
  const [isScenarioWizardOpen, setScenarioWizardOpen] = useState(false);
  const [knowledgeSources, setKnowledgeSources] = useState([]);
  const [knowledgeSourcesError, setKnowledgeSourcesError] = useState("");
  const [knowledgeSourcesLoading, setKnowledgeSourcesLoading] = useState(true);
  const [aiReadiness, setAiReadiness] = useState({ status: "not_configured" });
  const [scenarioVersions, setScenarioVersions] = useState([]);
  const [workspacePartial, setWorkspacePartial] = useState(false);
  const [sandboxVerifiedScenarioId, setSandboxVerifiedScenarioId] = useState("");
  const [consoleTab, setConsoleTab] = useState("overview");
  const [workView, setWorkView] = useState("scenarios");
  const sandboxChatRef = useRef(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [pauseTarget, setPauseTarget] = useState(null);
  const [urlSourceForm, setUrlSourceForm] = useState(null);
  const [publishChecklistOpen, setPublishChecklistOpen] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(() => loadAdvancedModePreference());
  const [scenarioOperations, setScenarioOperations] = useState([]);
  const [aiUsage, setAiUsage] = useState(null);

  function toggleAdvancedMode(nextValue) {
    const enabled = Boolean(nextValue);
    setAdvancedMode(enabled);
    saveAdvancedModePreference(enabled);
  }

  async function loadWorkspace({ ignoreSignal } = {}) {
    setLoading(true);
    setError("");
    const [response, sourcesResponse] = await Promise.all([
      automationService.fetchAutomationWorkspace(),
      knowledgeService.fetchSources()
    ]);
    if (ignoreSignal?.ignored) {
      return;
    }

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось загрузить automation workspace.");
      setLoading(false);
      return;
    }

    const scenarios = normalizeScenarios(response.data?.botScenarios);
    const nextScenarioId = scenarios.some((scenario) => scenario.id === selectedScenarioId)
      ? selectedScenarioId
      : (scenarios[0]?.id ?? "");
    const selected = scenarios.find((scenario) => scenario.id === nextScenarioId);
    const nextNodeId = selected?.flowNodes?.some((node) => node.id === selectedNodeId)
      ? selectedNodeId
      : (selected?.flowNodes?.[0]?.id ?? "");
    setAuditEvents(Array.isArray(response.data?.auditEvents) ? response.data.auditEvents : []);
    setProactiveRules(Array.isArray(response.data?.proactiveRules) ? response.data.proactiveRules : []);
    setRuntimeMetrics(normalizeRuntimeMetrics(response.data?.runtimeMetrics));
    setAiReadiness(response.data?.aiReadiness ?? { status: "not_configured" });
    setAiUsage(response.data?.aiUsage ?? null);
    setScenarioOperations(Array.isArray(response.data?.scenarioOperations) ? response.data.scenarioOperations : []);
    setScenarioVersions(Array.isArray(response.data?.botScenarioVersions) ? response.data.botScenarioVersions : []);
    setWorkspacePartial(Boolean(response.data?.partial));
    setScenarioItems(scenarios);
    setSelectedScenarioId(nextScenarioId);
    setSelectedNodeId(nextNodeId);
    if (sourcesResponse.status === "ok") {
      setKnowledgeSources(sourcesResponse.data?.sources ?? []);
      setKnowledgeSourcesError("");
    } else {
      setKnowledgeSources([]);
      setKnowledgeSourcesError(sourcesResponse.error?.message ?? "Не удалось загрузить источники знаний.");
    }
    setKnowledgeSourcesLoading(false);
    setLoading(false);
  }

  useEffect(() => {
    const ignoreSignal = { ignored: false };
    void loadWorkspace({ ignoreSignal });
    return () => {
      ignoreSignal.ignored = true;
    };
  }, []);

  const selectedScenario = scenarioItems.find((scenario) => scenario.id === selectedScenarioId) ?? scenarioItems[0] ?? null;
  const selectedNode = selectedScenario?.flowNodes?.find((node) => node.id === selectedNodeId) ?? selectedScenario?.flowNodes?.[0] ?? null;
  const selectedOperations = scenarioOperations.find((item) => item.scenarioId === selectedScenario?.id) ?? null;
  const canManageAutomation = access.canManageSettings;
  const isSaving = Boolean(savingAction);
  const urlSourceDialog = urlSourceForm ? (
    <ConfirmDialog
      confirmDisabled={!/^https:\/\/.+/i.test(urlSourceForm.url.trim())}
      confirmLabel="Добавить"
      description="Страница будет загружена, подготовлена и подтверждена как источник знаний для AI-ответов."
      eyebrow="Источник знаний"
      onCancel={() => setUrlSourceForm(null)}
      onConfirm={() => void submitUrlKnowledgeSource()}
      title="Добавить URL-страницу"
    >
      <label>
        <span>HTTPS-адрес страницы с ответами для клиентов</span>
        <input
          onChange={(event) => setUrlSourceForm((current) => ({ ...current, url: event.target.value }))}
          placeholder="https://example.com/faq"
          type="url"
          value={urlSourceForm.url}
        />
      </label>
      <label>
        <span>Название источника</span>
        <input
          onChange={(event) => setUrlSourceForm((current) => ({ ...current, title: event.target.value }))}
          placeholder="Страница знаний"
          value={urlSourceForm.title}
        />
      </label>
    </ConfirmDialog>
  ) : null;

  if (loading) {
    return (
      <ProductScreen
        title="Боты и automation"
        subtitle="Загрузка..."
        onBack={onBack}
        stateItems={createScreenStateItems({
          loading: "загружается...",
          total: 0,
          emptyWhenZero: "ожидание API",
          errorLabel: "ошибок нет"
        })}
      />
    );
  }

  if (error) {
    return (
      <ProductScreen
        title="Боты и automation"
        subtitle="Ошибка загрузки"
        onBack={onBack}
        stateItems={[
          { label: "Загрузка", tone: "error", value: "ошибка" },
          { label: "Данные", tone: "empty", value: "недоступны" },
          { label: "Ошибки", tone: "error", value: error }
        ]}
        actions={
          <button onClick={() => void loadWorkspace()} type="button">
            Повторить
          </button>
        }
      >
        <ScenarioListPanel
          aiReadiness={aiReadiness}
          canManage={canManageAutomation}
          isSaving={isSaving}
          knowledgeSources={knowledgeSources}
          knowledgeSourcesError={knowledgeSourcesError}
          knowledgeSourcesLoading={knowledgeSourcesLoading}
          onRetry={() => void loadWorkspace()}
          partial={workspacePartial}
          scenarios={[]}
          selectedScenarioId=""
          versions={scenarioVersions}
          workspaceError={error}
        />
      </ProductScreen>
    );
  }

  if (!selectedScenario || !selectedNode) {
    return (
      <ProductScreen
        title="Боты и automation"
        subtitle="Создайте первый сценарий, чтобы настроить ответы бота, переходы и передачу оператору."
        onBack={onBack}
        stateItems={createScreenStateItems({
          total: 0,
          emptyWhenZero: "сценариев ботов пока нет",
          errorLabel: knowledgeSourcesError ? "частичные данные" : "ошибок нет"
        })}
        actions={
          <button disabled={!canManageAutomation || isSaving} onClick={openScenarioWizard} title={canManageAutomation ? "Открыть мастер создания первого сценария" : access.reason} type="button">
            <Plus size={17} />
            Создать в мастере
          </button>
        }
      >
        <ScenarioListPanel
          aiReadiness={aiReadiness}
          canManage={canManageAutomation}
          isSaving={isSaving}
          knowledgeSources={knowledgeSources}
          knowledgeSourcesError={knowledgeSourcesError}
          knowledgeSourcesLoading={knowledgeSourcesLoading}
          onArchive={archiveScenario}
          onDisable={disableScenario}
          onOpen={selectScenario}
          onPublish={requestScenarioPublish}
          onRestore={restoreScenario}
          onRetry={() => void loadWorkspace()}
          partial={workspacePartial}
          scenarios={scenarioItems}
          selectedScenarioId={selectedScenarioId}
          versions={scenarioVersions}
        />
        {isScenarioWizardOpen ? <ScenarioCreationWizard aiReadiness={aiReadiness} canFixAiConnection={Boolean(access?.canManageServiceAdmin || access?.role === "Администратор сервиса")} existingScenarios={scenarioItems} isSaving={isSaving} knowledgeSources={knowledgeSources} knowledgeSourcesError={knowledgeSourcesError} knowledgeSourcesLoading={knowledgeSourcesLoading} onAddUrlSource={addUrlKnowledgeSource} onClose={() => setScenarioWizardOpen(false)} onCreate={handleScenarioWizardCreate} onOpenAiConnections={() => window.open("/service-admin", "_blank", "noopener,noreferrer")} /> : null}
        {urlSourceDialog}
      </ProductScreen>
    );
  }
  const enabledScenarios = scenarioItems.filter((scenario) => isEnabledAutomationStatus(scenario.status)).length;
  const enabledProactive = proactiveRules.filter((rule) => isEnabledAutomationStatus(rule.status)).length;
  const botMetricRows = runtimeMetrics.length
    ? runtimeMetrics
    : [{ label: "Bot runtime", value: "нет данных", detail: "runtimeMetrics не вернулись из backend" }];
  const exportPayload = JSON.stringify({
    schemaVersion: selectedScenario.schemaVersion,
    exportVersion: selectedScenario.exportVersion,
    id: selectedScenario.id,
    name: selectedScenario.name,
    status: selectedScenario.status,
    owner: selectedScenario.owner,
    updatedAt: selectedScenario.updatedAt,
    trigger: selectedScenario.trigger,
    channels: selectedScenario.channels,
    flowNodes: selectedScenario.flowNodes,
    flowEdges: selectedScenario.flowEdges,
    validationRules: selectedScenario.validationRules,
    previewMessages: selectedScenario.previewMessages,
    testCases: selectedScenario.testCases,
    handoff: selectedScenario.handoff
  }, null, 2);

  function selectScenario(scenario) {
    setSelectedScenarioId(scenario.id);
    setSelectedNodeId(scenario.flowNodes[0]?.id ?? "");
    setImportDraft("");
    setImportError("");
  }

  function requestScenarioPublish(scenario) {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }
    selectScenario(scenario);
    setPublishChecklistOpen(true);
  }

  async function archiveScenario(scenario) {
    if (!canManageAutomation) return;
    setArchiveTarget(scenario);
  }

  async function confirmArchiveScenario(scenario) {
    if (!canManageAutomation || !scenario) return;
    setSavingAction(`archive:${scenario.id}`);
    try {
      const result = await changeBotScenarioLifecycle(scenario.id, "archive");
      if (!result.ok) return onToast(result.message);
      const archived = normalizeScenario(result.scenario);
      setScenarioItems((current) => replaceScenario(current, archived));
      selectScenario(archived);
      setArchiveTarget(null);
      onToast(`Сценарий «${scenario.name}» перемещён в архив. Его можно восстановить в течение срока хранения.`);
    } finally { setSavingAction(""); }
  }

  async function disableScenario(scenario) {
    if (!canManageAutomation) return;
    setPauseTarget(scenario);
  }

  async function confirmDisableScenario(scenario) {
    if (!canManageAutomation || !scenario) return;
    setSavingAction(`disable:${scenario.id}`);
    try {
      const result = await changeBotScenarioLifecycle(scenario.id, "disable");
      if (!result.ok) return onToast(result.message);
      const disabled = normalizeScenario(result.scenario);
      setScenarioItems((current) => replaceScenario(current, disabled));
      selectScenario(disabled);
      setPauseTarget(null);
      onToast(`Сценарий «${scenario.name}» остановлен. Чтобы включить снова — опубликуйте после проверки.`);
    } finally { setSavingAction(""); }
  }

  async function restoreScenario(scenario) {
    if (!canManageAutomation) return;
    setSavingAction(`restore:${scenario.id}`);
    try {
      const result = await changeBotScenarioLifecycle(scenario.id, "restore");
      if (!result.ok) return onToast(result.message);
      const restored = normalizeScenario(result.scenario);
      setScenarioItems((current) => replaceScenario(current, restored));
      selectScenario(restored);
      onToast(`Сценарий «${scenario.name}» восстановлен и выключен: проверьте настройки и опубликуйте заново.`);
    } finally { setSavingAction(""); }
  }

  function addUrlKnowledgeSource() {
    setUrlSourceForm({ title: "Страница знаний", url: "" });
  }

  async function submitUrlKnowledgeSource() {
    const url = urlSourceForm?.url?.trim();
    const title = urlSourceForm?.title?.trim() || "Страница знаний";
    setUrlSourceForm(null);
    if (!url) return;
    setSavingAction("url-source");
    try {
      const created = await knowledgeService.createSource({ kind: "url", sourceConfig: { url }, title });
      const source = created.data?.source;
      if (created.status !== "ok" || !source) return onToast(created.error?.message ?? "Не удалось добавить URL.");
      const refreshed = await knowledgeService.refreshSource(source.id);
      if (refreshed.status !== "ok") return onToast(refreshed.error?.message ?? "URL добавлен, но страницу не удалось подготовить.");
      const approved = await knowledgeService.approveSource(source.id);
      if (approved.status !== "ok") return onToast(approved.error?.message ?? "Страница подготовлена и ждёт подтверждения.");
      setKnowledgeSources((current) => [...current.filter((item) => item.id !== source.id), approved.data.source]);
      onToast("URL-источник подготовлен и доступен для выбора.");
    } finally { setSavingAction(""); }
  }

  async function persistScenarioDraft(nextScenario, { selectNodeId, successMessage } = {}) {
    setSavingAction(`save:${nextScenario.id}`);
    try {
      const result = await submitBotScenarioUpdate(nextScenario);
      if (!result.ok) {
        onToast(result.message);
        return null;
      }

      const persisted = normalizeScenario({ ...nextScenario, ...result.scenario });
      setScenarioItems((current) => replaceScenario(current, persisted));
      setSelectedScenarioId(persisted.id);
      setSelectedNodeId(selectNodeId ?? persisted.flowNodes[0]?.id ?? "");
      if (successMessage) {
        onToast(successMessage);
      }
      return persisted;
    } finally {
      setSavingAction("");
    }
  }

  function updateSelectedNode(field, value) {
    setScenarioItems((current) => current.map((scenario) => {
      if (scenario.id !== selectedScenario.id) {
        return scenario;
      }

      return {
        ...scenario,
        flowNodes: scenario.flowNodes.map((node) => node.id === selectedNode.id
          ? { ...node, [field]: value, ...(field === "type" ? { typeLabel: botNodeTypeLabels[value] } : {}) }
          : node
        )
      };
    }));
  }

  function updateScenarioSourceBindings(selectedSourceIds) {
    if (!canManageAutomation || !selectedScenario) {
      return;
    }
    const sourceBindings = (Array.isArray(selectedSourceIds) ? selectedSourceIds : [])
      .map((sourceId) => String(sourceId ?? "").trim())
      .filter(Boolean)
      .map((sourceId) => ({ sourceId }));

    setScenarioItems((current) => current.map((scenario) => (
      scenario.id === selectedScenario.id ? { ...scenario, sourceBindings } : scenario
    )));
  }

  function updateScenarioBasePrompt(value) {
    if (!canManageAutomation || !selectedScenario) {
      return;
    }
    const basePrompt = String(value ?? "").slice(0, 4000);
    setScenarioItems((current) => current.map((scenario) => (
      scenario.id === selectedScenario.id ? { ...scenario, basePrompt } : scenario
    )));
  }

  async function handleAddNode() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const nextNode = {
      id: `node-${Date.now()}`,
      type: "message",
      typeLabel: botNodeTypeLabels.message,
      title: "Новая нода",
      detail: "Опишите условие, ответ или handoff.",
      channel: selectedScenario.channels[0] ?? "SDK",
      position: { x: 1, y: Math.ceil((selectedScenario.flowNodes.length + 1) / 2) }
    };

    const nextScenario = {
      ...selectedScenario,
      flowNodes: [...selectedScenario.flowNodes, nextNode],
      flowEdges: [
        ...(selectedScenario.flowEdges ?? []),
        ...(selectedScenario.flowNodes.length ? [{ from: selectedScenario.flowNodes.at(-1).id, to: nextNode.id, label: "next" }] : [])
      ]
    };

    await persistScenarioDraft(nextScenario, {
      selectNodeId: nextNode.id,
      successMessage: "Нода добавлена и сохранена на backend."
    });
  }

  async function handleScenarioCreate() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const id = `bot-draft-${Date.now()}`;
    const draftScenario = createDraftScenario(id);
    setSavingAction(`create:${id}`);
    const response = await automationService.createBotScenario(draftScenario);
    setSavingAction("");

    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось создать сценарий.");
      return;
    }

    const persisted = normalizeScenario({ ...draftScenario, ...response.data?.scenario });
    setScenarioItems((current) => [persisted, ...current]);
    setSelectedScenarioId(persisted.id);
    setSelectedNodeId(persisted.flowNodes[0].id);
    setImportDraft("");
    setImportError("");
    onToast("Черновик сценария создан и сохранен на backend.");
  }

  function openScenarioWizard() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    setScenarioWizardOpen(true);
  }

  async function handleScenarioWizardCreate(values) {
    if (!canManageAutomation) {
      onToast(access.reason);
      return false;
    }

    const id = `bot-draft-${Date.now()}`;
    const draftScenario = createScenarioFromWizard(id, values);
    setSavingAction(`create:${id}`);

    try {
      const response = await automationService.createBotScenario(draftScenario);
      if (response.status !== "ok") {
        onToast(response.error?.message ?? "Не удалось создать сценарий.");
        return false;
      }

      const persisted = normalizeScenario({ ...draftScenario, ...response.data?.scenario });
      setScenarioItems((current) => [persisted, ...current]);
      setSelectedScenarioId(persisted.id);
      setSelectedNodeId(persisted.flowNodes[0].id);
      setImportDraft("");
      setImportError("");
      setScenarioWizardOpen(false);
      onToast(`Черновик «${persisted.name}» создан. Прогоните тест, затем опубликуйте сценарий.`);
      return true;
    } finally {
      setSavingAction("");
    }
  }

  async function handleConsoleUpdate(fields) {
    if (!canManageAutomation || !selectedScenario) {
      onToast(access.reason);
      return null;
    }
    return persistScenarioDraft(buildBotScenarioUpdatePatch(selectedScenario.id, fields), {
      successMessage: selectedScenario.status === "published"
        ? "Изменения сохранены в черновик. Клиенты увидят их после публикации."
        : "Настройки сценария сохранены."
    });
  }

  async function handleDiscardDraft(scenario) {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }
    setSavingAction(`discard:${scenario.id}`);
    try {
      const result = await discardBotScenarioDraft(scenario.id);
      if (!result.ok) return onToast(result.message);
      const persisted = normalizeScenario(result.scenario);
      setScenarioItems((current) => replaceScenario(current, persisted));
      onToast("Черновик изменений отменён: сценарий соответствует опубликованной версии.");
    } finally {
      setSavingAction("");
    }
  }

  async function handleRollbackVersion(scenario, versionId) {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }
    setSavingAction(`rollback:${scenario.id}`);
    try {
      const result = await rollbackBotScenario(scenario.id, versionId);
      if (!result.ok) return onToast(result.message);
      const persisted = normalizeScenario(result.scenario);
      setScenarioItems((current) => replaceScenario(current, persisted));
      onToast("Откат выполнен: новые диалоги пойдут по выбранной версии.");
    } finally {
      setSavingAction("");
    }
  }

  function focusSandboxChat() {
    setWorkView("scenarios");
    setConsoleTab("test");
    sandboxChatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleScenarioPublish() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }
    setPublishChecklistOpen(true);
  }

  async function confirmScenarioPublish() {
    if (!canManageAutomation || !selectedScenario) {
      onToast(access.reason);
      return;
    }

    setSavingAction(`publish:${selectedScenario.id}`);
    try {
      const result = await publishBotScenario(selectedScenario);
      if (!result.ok) {
        onToast(result.message);
        return;
      }

      const publishedScenario = normalizeScenario({
        ...selectedScenario,
        activeVersionId: result.runtimeVersion,
        draft: undefined,
        enabled: true,
        exportVersion: result.runtimeVersion,
        status: result.versionState || "published",
        updatedAt: new Date().toISOString()
      });
      setScenarioItems((current) => replaceScenario(current, publishedScenario));
      selectScenario(publishedScenario);
      setPublishChecklistOpen(false);
      onToast(`Сценарий «${selectedScenario.name}» опубликован: ${result.runtimeVersion}.`);
      await refreshScenarioDetail(publishedScenario.id);
    } finally {
      setSavingAction("");
    }
  }

  async function refreshScenarioDetail(scenarioId) {
    const detail = await automationService.fetchBotScenario(scenarioId);
    if (detail.status !== "ok") return;
    const scenario = detail.data?.scenario;
    const versions = Array.isArray(detail.data?.versions) ? detail.data.versions : [];
    if (scenario) {
      setScenarioItems((current) => replaceScenario(current, normalizeScenario(scenario)));
    }
    setScenarioVersions((current) => [
      ...current.filter((item) => item.scenarioId !== scenarioId),
      ...versions
    ]);
  }

  async function handleSaveSelectedScenario() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    await persistScenarioDraft(selectedScenario, {
      selectNodeId: selectedNode.id,
      successMessage: `${selectedScenario.name}: сценарий сохранен на backend.`
    });
  }

  async function handleImportFlow() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    try {
      const payload = JSON.parse(importDraft);
      const validNodeTypes = new Set(botNodeTypeOptions.map((type) => type.id));
      const hasValidNodes = Array.isArray(payload.flowNodes) &&
        payload.flowNodes.length &&
        payload.flowNodes.every((node) => node.id && validNodeTypes.has(node.type));
      const hasValidEdges = payload.flowEdges === undefined ||
        (Array.isArray(payload.flowEdges) && payload.flowEdges.every((edge) => edge.from && edge.to));

      if (!payload.name || !hasValidNodes || !hasValidEdges) {
        throw new Error("JSON должен содержать name, flowNodes с валидными type и корректные flowEdges.");
      }

      const backendValidation = await automationService.validateBotFlowImport(payload);
      if (backendValidation.status !== "ok") {
        throw new Error(backendValidation.error?.message ?? "JSON должен содержать name, flowNodes с валидными type и корректные flowEdges.");
      }

      const validatedPayload = backendValidation.data?.payload ?? payload;
      const nextScenario = normalizeScenario({
        ...selectedScenario,
        name: validatedPayload.name,
        status: payload.status ?? selectedScenario.status,
        schemaVersion: validatedPayload.schemaVersion ?? payload.schemaVersion ?? selectedScenario.schemaVersion,
        owner: payload.owner ?? selectedScenario.owner,
        updatedAt: "сейчас",
        trigger: payload.trigger ?? selectedScenario.trigger,
        triggerRules: validatedPayload.triggerRules ?? payload.triggerRules ?? selectedScenario.triggerRules,
        sourceBindings: validatedPayload.sourceBindings ?? payload.sourceBindings ?? selectedScenario.sourceBindings,
        basePrompt: validatedPayload.basePrompt ?? payload.basePrompt ?? selectedScenario.basePrompt,
        channels: Array.isArray(payload.channels) ? payload.channels : selectedScenario.channels,
        handoff: payload.handoff ?? selectedScenario.handoff,
        flowNodes: validatedPayload.flowNodes,
        flowEdges: Array.isArray(validatedPayload.flowEdges) ? validatedPayload.flowEdges : selectedScenario.flowEdges,
        validationRules: Array.isArray(payload.validationRules) ? payload.validationRules : selectedScenario.validationRules,
        previewMessages: Array.isArray(payload.previewMessages) ? payload.previewMessages : selectedScenario.previewMessages,
        testCases: Array.isArray(payload.testCases) ? payload.testCases : selectedScenario.testCases,
        exportVersion: payload.exportVersion ?? payload.version ?? selectedScenario.exportVersion
      });
      const persisted = await persistScenarioDraft(nextScenario, {
        selectNodeId: nextScenario.flowNodes[0].id,
        successMessage: `Импортирован flow: ${nextScenario.name} и сохранен на backend.`
      });
      if (!persisted) {
        return;
      }
      setImportError("");
    } catch (error) {
      setImportError(error.message || "Импорт не выполнен: вставьте валидный JSON flow.");
    }
  }

  function handleExportFlowDownload() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const blob = new Blob([exportPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedScenario.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onToast(`${selectedScenario.name}: JSON export скачан.`);
  }

  return (
    <ProductScreen
      title="Боты и автоматизация"
      subtitle="Сценарии AI-оператора, proactive-приглашения, handoff в очереди и audit действий автоматики."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: scenarioItems.length,
        empty: `${scenarioItems.length} сценариев`,
        emptyWhenZero: "сценариев нет",
        errors: importError || knowledgeSourcesError || workspacePartial ? 1 : 0,
        errorLabel: knowledgeSourcesError || workspacePartial ? "частичные данные" : "ошибок flow нет"
      })}
      actions={
        <>
          <button disabled={!canManageAutomation || isSaving} onClick={openScenarioWizard} title={canManageAutomation ? "Открыть мастер создания сценария" : access.reason} type="button">
            <Plus size={17} />
            Создать в мастере
          </button>
          <button disabled={!canManageAutomation || isSaving} onClick={handleScenarioPublish} title={canManageAutomation ? "Опубликовать сценарий" : access.reason} type="button">
            <CheckCircle2 size={17} />
            Опубликовать
          </button>
          <button className="primary-action" disabled={!canManageAutomation || isSaving} onClick={focusSandboxChat} title={canManageAutomation ? "Открыть живой тест-чат" : access.reason} type="button">
            <PlayCircle size={17} />
            Тест-чат
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<Bot size={21} />} label="Сценарии" value={scenarioItems.length} detail={`${enabledScenarios} включены`} />
        <MetricTile icon={<Zap size={21} />} label="Proactive" value={proactiveRules.length} detail={`${enabledProactive} активны`} />
        <MetricTile icon={<Workflow size={21} />} label="Handoff" value="4" detail="очереди назначения" />
        <MetricTile icon={<ListChecks size={21} />} label="Audit" value={auditEvents.length} detail="последние события" />
      </div>

      <BotSetupChecklist
        aiReady={aiReadiness?.status === "ready"}
        hasEnabledScenario={enabledScenarios > 0}
        hasScenario={scenarioItems.length > 0}
        hasSources={knowledgeSources.some((source) => source.readiness === "ready")}
        tested={Boolean(sandboxVerifiedScenarioId)}
      />

      <SegmentedControl
        ariaLabel="Режим раздела ботов"
        className="automation-view-switch"
        onChange={setWorkView}
        options={[{ label: "Сценарии", value: "scenarios" }, { label: "Работа ботов", value: "operations" }]}
        value={workView}
      />

      {workView === "scenarios" ? (
        <div className="automation-layout automation-layout--console">
          <ScenarioListPanel
            aiReadiness={aiReadiness}
            canManage={canManageAutomation}
            isSaving={isSaving}
            knowledgeSources={knowledgeSources}
            knowledgeSourcesError={knowledgeSourcesError}
            knowledgeSourcesLoading={knowledgeSourcesLoading}
            onArchive={archiveScenario}
            onDisable={disableScenario}
            onOpen={(scenario) => {
              selectScenario(scenario);
              setConsoleTab("overview");
            }}
            onPublish={requestScenarioPublish}
            onRestore={restoreScenario}
            onRetry={() => void loadWorkspace()}
            partial={workspacePartial}
            scenarios={scenarioItems}
            selectedScenarioId={selectedScenario.id}
            versions={scenarioVersions}
          />

          <div ref={sandboxChatRef}>
            <ScenarioConsole
              access={access}
              activeTab={consoleTab}
              aiReadiness={aiReadiness}
              aiUsage={aiUsage}
              canManage={canManageAutomation}
              isSaving={isSaving}
              knowledgeSources={knowledgeSources}
              knowledgeSourcesError={knowledgeSourcesError}
              knowledgeSourcesLoading={knowledgeSourcesLoading}
              onAddUrlSource={addUrlKnowledgeSource}
              onArchive={archiveScenario}
              onDisable={disableScenario}
              onDiscardDraft={handleDiscardDraft}
              onPublish={requestScenarioPublish}
              onRestore={restoreScenario}
              onRollback={handleRollbackVersion}
              onTabChange={setConsoleTab}
              onToast={onToast}
              onUpdateScenario={handleConsoleUpdate}
              onVerified={setSandboxVerifiedScenarioId}
              operations={selectedOperations}
              scenario={selectedScenario}
              versions={scenarioVersions}
            />
          </div>
        </div>
      ) : (
        <div className="automation-layout">
          <section className="work-panel bot-metrics-card">
            <SectionTitle title="Метрики ботов" action="backend runtime" />
            <div className="bot-metric-list">
              {botMetricRows.map((metric) => (
                <span key={metric.label}>
                  <b>{metric.value}</b>
                  <strong>{metric.label}</strong>
                  <small>{metric.detail}</small>
                </span>
              ))}
            </div>
          </section>

          <section className="work-panel">
            <SectionTitle title="Audit автоматизации" action="экспорт, лимиты, rescue" />
            <div className="audit-list">
              {auditEvents.map((event) => (
                <article className="audit-row" key={event.id}>
                  <time>{event.time}</time>
                  <strong>{event.action}</strong>
                  <span>{event.actor} · {event.role}</span>
                  <p>{event.target}: {event.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      <section className="work-panel bot-mode-panel">
        <SectionTitle title="Режим работы" action={advancedMode ? "дополнительный" : "no-code"} />
        <div className="bot-mode-toggle">
          <label>
            <input
              checked={advancedMode}
              onChange={(event) => toggleAdvancedMode(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Дополнительный режим</strong>
              <small>Canvas, редактор нод и JSON import/export — только после базового no-code пути. Импорт проходит ту же серверную проверку policy/source/trigger.</small>
            </span>
          </label>
        </div>
      </section>

      {advancedMode ? (
      <section className="work-panel bot-builder-panel">
        <SectionTitle title="Canvas сценария" action={`${selectedScenario.name} · ${formatScenarioStatusLabel(selectedScenario.status)}`} />
        <div className="bot-builder-grid">
          <div className="bot-canvas-panel">
            <div className="bot-canvas-toolbar">
              <strong>{selectedScenario.trigger}</strong>
              <span>{selectedScenario.handoff} · {selectedScenario.schemaVersion} · {selectedScenario.owner}</span>
            </div>
            <div className="bot-canvas-sources">
              <ScenarioKnowledgeSourceSelector
                disabled={!canManageAutomation || isSaving || selectedScenario.status === "published"}
                emptyMessage="Нет готовых источников. Добавьте URL или подготовьте документ, затем выберите его здесь."
                error={knowledgeSourcesError}
                id={`canvas-sources-${selectedScenario.id}`}
                isLoading={knowledgeSourcesLoading}
                onSelectedSourceIdsChange={updateScenarioSourceBindings}
                selectedSourceIds={(selectedScenario.sourceBindings ?? []).map((binding) => binding.sourceId).filter(Boolean)}
                sources={knowledgeSources}
              />
              {canManageAutomation ? (
                <button
                  className="bot-canvas-add-source"
                  disabled={isSaving || selectedScenario.status === "published"}
                  onClick={() => void addUrlKnowledgeSource()}
                  type="button"
                >
                  <Plus size={15} />
                  Добавить URL-страницу
                </button>
              ) : null}
              <label className="bot-canvas-base-prompt" htmlFor={`canvas-base-prompt-${selectedScenario.id}`}>
                <span>Базовый промпт сценария</span>
                <textarea
                  disabled={!canManageAutomation || isSaving || selectedScenario.status === "published"}
                  id={`canvas-base-prompt-${selectedScenario.id}`}
                  onChange={(event) => updateScenarioBasePrompt(event.target.value)}
                  placeholder="Основные инструкции для AI: тон, ограничения, что нельзя обещать."
                  rows={4}
                  value={selectedScenario.basePrompt ?? ""}
                />
                <small>Передаётся в начало system prompt до safety rails и инструкций ноды. Сохраните черновик, чтобы записать на backend.</small>
              </label>
              {selectedScenario.status === "published" ? (
                <p className="bot-advanced-hint">Опубликованный сценарий нельзя менять. Поставьте на паузу, обновите источники и опубликуйте снова.</p>
              ) : (
                <p className="bot-advanced-hint">Источники и базовый промпт относятся ко всему сценарию. Нажмите «Сохранить», чтобы записать на backend.</p>
              )}
            </div>
            <div className="bot-flow-canvas" aria-label="Ноды сценария">
              {selectedScenario.flowNodes.map((node, index) => (
                <button
                  aria-pressed={selectedNode.id === node.id}
                  className={`bot-flow-node ${selectedNode.id === node.id ? "selected" : ""} ${node.type}`}
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  <strong>{node.title}</strong>
                  <small>{node.typeLabel ?? botNodeTypeLabels[node.type] ?? node.type} · {node.channel}</small>
                  <p>{node.detail}</p>
                </button>
              ))}
            </div>
            <div className="bot-edge-list" aria-label="Связи сценария">
              {(selectedScenario.flowEdges ?? []).map((edge) => (
                <span key={`${edge.from}-${edge.to}-${edge.label}`}>
                  {edge.from} {"->"} {edge.to} <b>{edge.label}</b>
                </span>
              ))}
            </div>
          </div>

          <aside className="bot-node-editor">
            <header>
              <Pencil size={17} />
              <strong>Редактор ноды</strong>
            </header>
            <label>
              <span>Тип</span>
              <select disabled={!canManageAutomation || isSaving} value={selectedNode.type} onChange={(event) => updateSelectedNode("type", event.target.value)}>
                {botNodeTypeOptions.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>
            <label>
              <span>Название</span>
              <input disabled={!canManageAutomation || isSaving} value={selectedNode.title} onChange={(event) => updateSelectedNode("title", event.target.value)} />
            </label>
            <label>
              <span>Канал шага</span>
              <select disabled={!canManageAutomation || isSaving} value={selectedNode.channel} onChange={(event) => updateSelectedNode("channel", event.target.value)}>
                {(selectedScenario.channels?.length ? selectedScenario.channels : ["SDK"]).map((channel) => (
                  <option key={channel} value={channel}>{channel}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Логика</span>
              <textarea disabled={!canManageAutomation || isSaving} value={selectedNode.detail} onChange={(event) => updateSelectedNode("detail", event.target.value)} />
            </label>
            <footer>
              <button disabled={!canManageAutomation || isSaving} onClick={handleAddNode} title={canManageAutomation ? "Добавить ноду" : access.reason} type="button">
                <Plus size={16} />
                Нода
              </button>
              <button disabled={!canManageAutomation || isSaving} onClick={handleSaveSelectedScenario} title={canManageAutomation ? "Сохранить сценарий" : access.reason} type="button">
                <CheckCircle2 size={16} />
                Сохранить
              </button>
            </footer>
            <div className="bot-validation-list">
              <strong>Validation</strong>
              {(selectedScenario.validationRules ?? []).map((rule) => <span key={rule}>{rule}</span>)}
              <strong>Test cases</strong>
              {(selectedScenario.testCases ?? []).map((test) => <span key={test.id}>{test.name} {"->"} {test.expected}</span>)}
            </div>
          </aside>

          <aside className="bot-preview-panel">
            <div className="bot-transcript-preview">
              <header>
                <Sparkles size={17} />
                <strong>Transcript preview</strong>
              </header>
              {selectedScenario.previewMessages.map((message, index) => (
                <div className={`bot-preview-message ${message.side ?? (message.speaker === "Клиент" ? "client" : "bot")}`} key={`${message.speaker}-${index}`}>
                  <span>{message.speaker} · {message.time ?? `00:0${index + 1}`}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
            <div className="bot-io-panel">
              <header>
                <FileText size={17} />
                <strong>Import / Export</strong>
              </header>
              <p className="bot-advanced-hint">JSON проходит ту же серверную проверку, что и публикация: узлы, trigger, источники и AI-policy.</p>
              <textarea readOnly value={exportPayload} aria-label="JSON export сценария" />
              <textarea disabled={!canManageAutomation || isSaving} value={importDraft} onChange={(event) => setImportDraft(event.target.value)} placeholder="Вставьте JSON flow для импорта" />
              {importError ? (
                <div className="bot-import-error">
                  <AlertTriangle size={15} />
                  {importError}
                </div>
              ) : null}
              <footer>
                <button disabled={!canManageAutomation || isSaving} onClick={() => setImportDraft(exportPayload)} title={canManageAutomation ? "Скопировать export в импорт" : access.reason} type="button">Вставить export</button>
                <button disabled={!canManageAutomation || isSaving} onClick={handleImportFlow} title={canManageAutomation ? "Импортировать flow" : access.reason} type="button">Импорт</button>
                <button disabled={!canManageAutomation || isSaving} onClick={handleExportFlowDownload} title={canManageAutomation ? "Экспортировать JSON" : access.reason} type="button">
                  <Download size={15} />
                  Export
                </button>
              </footer>
            </div>
          </aside>
        </div>
      </section>
      ) : (
        <section className="work-panel bot-advanced-closed">
          <SectionTitle title="Canvas и JSON скрыты" action="no-code путь" />
          <p>Основной путь — мастер, список сценариев и песочница. Включите дополнительный режим выше, если нужен canvas или JSON import/export.</p>
        </section>
      )}
      {isScenarioWizardOpen ? <ScenarioCreationWizard aiReadiness={aiReadiness} canFixAiConnection={Boolean(access?.canManageServiceAdmin || access?.role === "Администратор сервиса")} existingScenarios={scenarioItems} isSaving={isSaving} knowledgeSources={knowledgeSources} knowledgeSourcesError={knowledgeSourcesError} knowledgeSourcesLoading={knowledgeSourcesLoading} onAddUrlSource={addUrlKnowledgeSource} onClose={() => setScenarioWizardOpen(false)} onCreate={handleScenarioWizardCreate} onOpenAiConnections={() => window.open("/service-admin", "_blank", "noopener,noreferrer")} /> : null}
      {archiveTarget ? <ScenarioArchiveConfirmModal isSaving={isSaving} onClose={() => setArchiveTarget(null)} onConfirm={(scenario) => void confirmArchiveScenario(scenario)} scenario={archiveTarget} /> : null}
      {pauseTarget ? <ScenarioPauseConfirmModal isSaving={isSaving} onClose={() => setPauseTarget(null)} onConfirm={(scenario) => void confirmDisableScenario(scenario)} scenario={pauseTarget} /> : null}
      {urlSourceDialog}
      {publishChecklistOpen && selectedScenario ? (
        <ScenarioPublishChecklistModal
          aiReadiness={aiReadiness}
          isSaving={isSaving}
          knowledgeSources={knowledgeSources}
          onClose={() => setPublishChecklistOpen(false)}
          onConfirm={() => void confirmScenarioPublish()}
          sandboxVerified={sandboxVerifiedScenarioId === selectedScenario.id}
          scenario={selectedScenario}
        />
      ) : null}
    </ProductScreen>
  );
}

function normalizeScenarios(value) {
  return Array.isArray(value) ? value.map((scenario) => normalizeScenario(scenario)) : [];
}

/** BAI-861: короткий чек-лист «с чего начать», исчезает, когда бот запущен. */
function BotSetupChecklist({ aiReady, hasEnabledScenario, hasScenario, hasSources, tested }) {
  const steps = [
    { done: hasSources, label: "Подключите знания", hint: "Раздел «Знания»: статья, документ или страница" },
    { done: hasScenario, label: "Создайте сценарий", hint: "Мастер задаёт запуск, ответ и передачу оператору" },
    { done: aiReady, label: "Подключите AI", hint: "Настраивает администратор сервиса в разделе «AI»" },
    { done: tested, label: "Протестируйте в чате", hint: "Живой тест-чат показывает ответ и путь бота" },
    { done: hasEnabledScenario, label: "Опубликуйте", hint: "После проверки сценарий начнёт отвечать клиентам" }
  ];
  const completed = steps.filter((step) => step.done).length;
  if (completed === steps.length) return null;
  return (
    <section aria-label="С чего начать" className="work-panel bot-setup-checklist">
      <SectionTitle action={`${completed} из ${steps.length}`} title="С чего начать" />
      <ol>
        {steps.map((step) => (
          <li className={step.done ? "done" : ""} key={step.label}>
            {step.done ? <CheckCircle2 size={16} /> : <span className="bot-setup-dot" aria-hidden="true" />}
            <span>
              <strong>{step.label}</strong>
              <small>{step.hint}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function normalizeScenario(scenario = {}) {
  const scenarioId = String(scenario.id ?? `bot-${Date.now()}`);
  const channels = normalizeStringList(scenario.channels, ["SDK"]);
  const flowNodes = normalizeFlowNodes(scenario.flowNodes, scenarioId, channels);
  const flowEdges = Array.isArray(scenario.flowEdges) ? scenario.flowEdges : [];
  const name = String(scenario.name ?? scenarioId);
  const handoffNode = flowNodes.find((node) => node.type === "handoff");

  return {
    ...scenario,
    basePrompt: String(scenario.basePrompt ?? "").slice(0, 4000),
    channels,
    exportVersion: scenario.exportVersion ?? scenario.version ?? scenario.schemaVersion ?? "bot-flow/v1",
    flowEdges,
    flowNodes,
    handoff: scenario.handoff ?? handoffNode?.title ?? "operator handoff",
    id: scenarioId,
    name,
    owner: scenario.owner ?? "backend",
    previewMessages: Array.isArray(scenario.previewMessages) && scenario.previewMessages.length
      ? scenario.previewMessages
      : createPreviewMessages(flowNodes),
    schemaVersion: scenario.schemaVersion ?? "bot-flow/v1",
    status: String(scenario.status ?? "draft"),
    sourceBindings: Array.isArray(scenario.sourceBindings)
      ? scenario.sourceBindings
        .map((binding) => ({
          sourceId: String(binding?.sourceId ?? "").trim(),
          ...(String(binding?.sourceVersion ?? "").trim()
            ? { sourceVersion: String(binding.sourceVersion).trim() }
            : {})
        }))
        .filter((binding) => binding.sourceId)
      : [],
    steps: normalizeStringList(scenario.steps, flowNodes.map((node) => node.typeLabel ?? node.type)),
    successRate: scenario.successRate ?? null,
    testCases: Array.isArray(scenario.testCases) && scenario.testCases.length
      ? scenario.testCases
      : [{ id: `${scenarioId}-backend-test`, name: "Backend smoke", expected: "ok" }],
    triggerRules: Array.isArray(scenario.triggerRules) ? scenario.triggerRules : [],
    trigger: scenario.trigger ?? flowNodes[0]?.title ?? name,
    updatedAt: scenario.updatedAt ?? "",
    validationRules: normalizeStringList(scenario.validationRules, [])
  };
}

function normalizeFlowNodes(value, scenarioId, channels) {
  const sourceNodes = Array.isArray(value) && value.length
    ? value
    : [{ id: `${scenarioId}-start`, type: "message", title: "Start" }];

  return sourceNodes.map((node, index) => {
    const type = String(node.type ?? "message");
    const title = String(node.title ?? node.id ?? `Node ${index + 1}`);
    return {
      ...node,
      channel: node.channel ?? channels[0] ?? "SDK",
      detail: node.detail ?? title,
      id: String(node.id ?? `${scenarioId}-node-${index + 1}`),
      position: node.position ?? { x: index + 1, y: 1 },
      title,
      type,
      typeLabel: node.typeLabel ?? botNodeTypeLabels[type] ?? type
    };
  });
}

function normalizeRuntimeMetrics(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((metric) => ({
    detail: String(metric.detail ?? metric.queue ?? "backend"),
    label: String(metric.label ?? metric.id ?? "Metric"),
    value: String(metric.value ?? "—")
  }));
}

function createPreviewMessages(flowNodes) {
  return flowNodes.slice(0, 3).map((node, index) => ({
    side: index === 0 ? "client" : "bot",
    speaker: index === 0 ? "Клиент" : "Бот",
    text: node.detail ?? node.title,
    time: `00:0${index + 1}`
  }));
}

function replaceScenario(current, persisted) {
  return current.map((scenario) => scenario.id === persisted.id ? persisted : scenario);
}

function normalizeStringList(value, fallback) {
  return Array.isArray(value) ? value.map((item) => String(item)) : fallback;
}

function isEnabledAutomationStatus(status) {
  const value = String(status ?? "").toLowerCase();
  return value.includes("enabled") || value.includes("published") || value.includes("включ");
}
