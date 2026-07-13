import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, History, PauseCircle, Plus, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { ConfirmDialog, SectionTitle, SegmentedControl, StatusBadge } from "../../ui.jsx";
import { ScenarioKnowledgeSourceSelector } from "./ScenarioKnowledgeSourceSelector.jsx";
import { ScenarioOperationalPanel } from "./ScenarioOperationalPanel.jsx";
import { ScenarioSandboxChat } from "./ScenarioSandboxChat.jsx";
import {
  DEFAULT_AI_FALLBACK_MESSAGE,
  buildScenarioListRow,
  describeMatchMode,
  describeScenarioTrigger,
  formatScenarioStatusLabel,
  scenarioLanguageOptions,
  scenarioStatusTone,
  scenarioToneOptions
} from "./automationModel.js";

export const SCENARIO_CONSOLE_TABS = [
  { label: "Обзор", value: "overview" },
  { label: "Настройка", value: "settings" },
  { label: "Знания", value: "knowledge" },
  { label: "Тест", value: "test" },
  { label: "Версии", value: "versions" },
  { label: "Результаты", value: "results" }
];

/**
 * Консоль сценария (BAI-810): один экран, где видно и настраивается всё —
 * паспорт, поля, знания, живой тест, версии с откатом и результаты.
 */
export function ScenarioConsole({
  access,
  aiReadiness,
  aiUsage,
  activeTab,
  canManage,
  isSaving,
  knowledgeSources,
  knowledgeSourcesError,
  knowledgeSourcesLoading,
  onAddUrlSource,
  onArchive,
  onDisable,
  onDiscardDraft,
  onPublish,
  onRestore,
  onRollback,
  onTabChange,
  onToast,
  onUpdateScenario,
  onVerified,
  operations,
  scenario,
  versions
}) {
  const draft = scenario?.draft ?? null;
  const effective = useMemo(() => mergeDraft(scenario, draft), [scenario, draft]);
  const [form, setForm] = useState(() => buildForm(effective));
  const [formDirty, setFormDirty] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState(null);

  useEffect(() => {
    setForm(buildForm(effective));
    setFormDirty(false);
  }, [scenario?.id, draft?.updatedAt, scenario?.updatedAt]);

  if (!scenario) {
    return null;
  }

  const row = buildScenarioListRow(scenario, { aiReadiness, knowledgeSources, versions });
  const scenarioVersions = versions
    .filter((version) => version.scenarioId === scenario.id)
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
  const aiNode = (effective.flowNodes ?? []).find((node) => node.type === "ai_reply") ?? null;
  const hasDraftChanges = Boolean(draft);

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
    setFormDirty(true);
  }

  function handlePhraseAdd(rawValue) {
    const value = String(rawValue ?? "").trim();
    if (!value || form.phrases.includes(value) || form.phrases.length >= 12) return;
    updateForm({ phrases: [...form.phrases, value] });
  }

  async function handleSave() {
    if (!canManage) return onToast(access.reason);
    const payload = collectUpdatePayload(effective, form);
    await onUpdateScenario(payload);
    setFormDirty(false);
  }

  return (
    <section className="work-panel scenario-console" aria-label={`Консоль сценария ${scenario.name}`}>
      <div className="scenario-console-head">
        <div>
          <h2>{effective.name}</h2>
          <div className="scenario-console-badges">
            <StatusBadge tone={scenarioStatusTone(scenario.status)}>{formatScenarioStatusLabel(scenario.status)}</StatusBadge>
            {hasDraftChanges ? <StatusBadge tone="warn">есть неопубликованные изменения</StatusBadge> : null}
          </div>
        </div>
        <SegmentedControl ariaLabel="Разделы сценария" onChange={onTabChange} options={SCENARIO_CONSOLE_TABS} value={activeTab} />
      </div>

      {activeTab === "overview" ? (
        <div className="scenario-passport">
          {hasDraftChanges ? (
            <div className="scenario-draft-banner" role="status">
              <AlertTriangle size={15} />
              <span>
                Черновик изменений от {formatDateTime(draft.updatedAt)}{draft.updatedBy ? ` (${draft.updatedBy})` : ""}. Клиенты продолжают видеть опубликованную версию.
              </span>
              <span className="scenario-draft-banner-actions">
                <button disabled={!canManage || isSaving} onClick={() => onPublish(scenario)} type="button">
                  <CheckCircle2 size={14} /> Опубликовать изменения
                </button>
                <button disabled={!canManage || isSaving} onClick={() => onDiscardDraft(scenario)} type="button">
                  <Undo2 size={14} /> Отменить изменения
                </button>
              </span>
            </div>
          ) : null}
          <dl className="scenario-passport-grid">
            <div>
              <dt>Когда запускается</dt>
              <dd>{describeScenarioTrigger(effective)}</dd>
            </div>
            <div>
              <dt>Каналы</dt>
              <dd>{(effective.channels ?? []).join(", ") || "не выбраны"}</dd>
            </div>
            <div>
              <dt>Как отвечает</dt>
              <dd>
                {aiNode
                  ? `AI по знаниям · тон: ${labelFor(scenarioToneOptions, aiNode.config?.tone)} · язык: ${labelFor(scenarioLanguageOptions, aiNode.config?.language)}${aiNode.config?.consultationMode ? ` · консультация до ${aiNode.config?.maxTurns ?? 10} реплик` : ""}`
                  : "фиксированные шаги без AI"}
              </dd>
            </div>
            <div>
              <dt>Знания</dt>
              <dd>{row.sourceTitles?.length ? row.sourceTitles.join(", ") : "источники не привязаны"}</dd>
            </div>
            <div>
              <dt>Передача оператору</dt>
              <dd>{aiNode ? `очередь «${aiNode.config?.handoffQueue ?? "default"}»` : (effective.handoff ?? "по шагу Handoff")}</dd>
            </div>
            <div>
              <dt>Последняя публикация</dt>
              <dd>{row.lastPublishedAt ? formatDateTime(row.lastPublishedAt) : "ещё не публиковался"}</dd>
            </div>
          </dl>
          {row.errors?.length ? (
            <ul className="scenario-passport-warnings">
              {row.errors.map((item) => (
                <li key={item}>
                  <AlertTriangle size={14} /> {item}
                  <button onClick={() => onTabChange(warningTab(item))} type="button">Исправить</button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="scenario-console-actions">
            {scenario.status === "published" ? (
              <button disabled={!canManage || isSaving} onClick={() => onDisable(scenario)} type="button">
                <PauseCircle size={15} /> Пауза
              </button>
            ) : null}
            {scenario.status === "draft" || scenario.status === "disabled" ? (
              <button className="primary-action" disabled={!canManage || isSaving} onClick={() => onPublish(scenario)} type="button">
                <CheckCircle2 size={15} /> Проверить и опубликовать
              </button>
            ) : null}
            {scenario.status === "archived" ? (
              <button disabled={!canManage || isSaving} onClick={() => onRestore(scenario)} type="button">
                <RotateCcw size={15} /> Восстановить
              </button>
            ) : (
              <button className="scenario-delete-button" disabled={!canManage || isSaving} onClick={() => onArchive(scenario)} type="button">
                <Trash2 size={15} /> Удалить
              </button>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <form
          className="scenario-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          {scenario.status === "published" ? (
            <p className="scenario-settings-note">
              Сценарий опубликован: изменения сохранятся как черновик следующей версии и не тронут работающего бота, пока вы их не опубликуете.
            </p>
          ) : null}
          <div className="scenario-settings-grid">
            <label>
              <span>Название сценария</span>
              <input disabled={!canManage} onChange={(event) => updateForm({ name: event.target.value })} type="text" value={form.name} />
            </label>
            <label>
              <span>Приоритет запуска</span>
              <input disabled={!canManage} min="-10000" max="10000" onChange={(event) => updateForm({ priority: event.target.value })} type="number" value={form.priority} />
            </label>
          </div>
          <fieldset className="scenario-settings-channels">
            <legend>Каналы запуска</legend>
            <div>
              {["SDK", "Telegram", "MAX", "VK"].map((channel) => (
                <button
                  aria-pressed={form.channels.includes(channel)}
                  className={form.channels.includes(channel) ? "active" : ""}
                  disabled={!canManage}
                  key={channel}
                  onClick={() => updateForm({
                    channels: form.channels.includes(channel)
                      ? form.channels.filter((item) => item !== channel)
                      : [...form.channels, channel]
                  })}
                  type="button"
                >
                  {channel}
                </button>
              ))}
            </div>
          </fieldset>

          {form.triggerType === "phrase" || form.triggerType === "always_except" ? (
            <fieldset className="scenario-settings-trigger">
              <legend>{form.triggerType === "phrase" ? "Ключевые фразы" : "Фразы-исключения («всегда, кроме»)"}</legend>
              <div className="scenario-trigger-chips">
                {form.phrases.map((phrase) => (
                  <span className="scenario-trigger-chip" key={phrase}>
                    {phrase}
                    <button aria-label={`Удалить фразу ${phrase}`} disabled={!canManage} onClick={() => updateForm({ phrases: form.phrases.filter((item) => item !== phrase) })} type="button">×</button>
                  </span>
                ))}
                {!form.phrases.length ? <span className="scenario-trigger-empty">Фразы не заданы</span> : null}
              </div>
              <div className="scenario-trigger-add">
                <input
                  disabled={!canManage}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handlePhraseAdd(event.currentTarget.value);
                      event.currentTarget.value = "";
                    }
                  }}
                  placeholder="Например: где мой заказ"
                  type="text"
                />
                <button
                  disabled={!canManage}
                  onClick={(event) => {
                    const input = event.currentTarget.previousElementSibling;
                    handlePhraseAdd(input?.value);
                    if (input) input.value = "";
                  }}
                  type="button"
                >
                  <Plus size={14} /> Добавить
                </button>
              </div>
              <div className="scenario-trigger-mode" role="radiogroup" aria-label="Как искать фразу">
                {[["contains", describeMatchMode("contains")], ["tokens", describeMatchMode("tokens")], ["exact", describeMatchMode("exact")]].map(([mode, label]) => (
                  <label key={mode}>
                    <input checked={form.matchMode === mode} disabled={!canManage} name="console-match-mode" onChange={() => updateForm({ matchMode: mode })} type="radio" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="scenario-settings-note">Запуск: {describeScenarioTrigger(effective)}. Тип запуска меняется в мастере или расширенном режиме.</p>
          )}

          {aiNode ? (
            <fieldset className="scenario-settings-ai">
              <legend>AI-ответ</legend>
              <div className="scenario-settings-grid">
                <label>
                  <span>Тон</span>
                  <select disabled={!canManage} onChange={(event) => updateForm({ tone: event.target.value })} value={form.tone}>
                    {scenarioToneOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Язык ответа</span>
                  <select disabled={!canManage} onChange={(event) => updateForm({ language: event.target.value })} value={form.language}>
                    {scenarioLanguageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Очередь передачи оператору</span>
                  <input disabled={!canManage} onChange={(event) => updateForm({ handoffQueue: event.target.value })} type="text" value={form.handoffQueue} />
                </label>
                <label>
                  <span>Лимит реплик консультации</span>
                  <input disabled={!canManage} max="30" min="1" onChange={(event) => updateForm({ maxTurns: event.target.value })} type="number" value={form.maxTurns} />
                </label>
              </div>
              <label>
                <span>Базовый промпт сценария</span>
                <textarea disabled={!canManage} maxLength={4000} onChange={(event) => updateForm({ basePrompt: event.target.value })} rows={4} value={form.basePrompt} />
              </label>
              <label>
                <span>Сообщение, если AI не смог ответить</span>
                <textarea disabled={!canManage} onChange={(event) => updateForm({ fallbackMessage: event.target.value })} rows={2} value={form.fallbackMessage} />
              </label>
            </fieldset>
          ) : null}

          <div className="scenario-console-actions">
            <button className="primary-action" disabled={!canManage || isSaving || !formDirty} title={canManage ? "Сохранить настройки" : access.reason} type="submit">
              <Save size={15} /> {scenario.status === "published" ? "Сохранить черновик изменений" : "Сохранить"}
            </button>
            {formDirty ? <span className="scenario-settings-dirty">Есть несохранённые правки</span> : null}
          </div>
        </form>
      ) : null}

      {activeTab === "knowledge" ? (
        <div className="scenario-console-knowledge">
          <ScenarioKnowledgeSourceSelector
            disabled={!canManage || isSaving}
            emptyMessage="Нет готовых источников. Добавьте URL-страницу или подготовьте документ в разделе «Знания», затем выберите его здесь."
            error={knowledgeSourcesError}
            id={`console-sources-${scenario.id}`}
            isLoading={knowledgeSourcesLoading}
            onSelectedSourceIdsChange={(sourceIds) => onUpdateScenario({ sourceBindings: sourceIds.map((sourceId) => ({ sourceId })) })}
            selectedSourceIds={(effective.sourceBindings ?? []).map((binding) => binding.sourceId).filter(Boolean)}
            sources={knowledgeSources}
          />
          <button disabled={!canManage || isSaving} onClick={onAddUrlSource} type="button">
            <Plus size={15} /> Добавить URL-страницу
          </button>
        </div>
      ) : null}

      {activeTab === "test" ? (
        <div className="scenario-console-test">
          {hasDraftChanges ? (
            <p className="scenario-settings-note">Тест-чат прогоняет черновик изменений — то, что увидят клиенты после публикации.</p>
          ) : null}
          <ScenarioSandboxChat
            accessReason={access.reason}
            aiReadiness={aiReadiness}
            canManage={canManage}
            mode={hasDraftChanges ? "draft" : undefined}
            onToast={onToast}
            onVerified={onVerified}
            scenario={effective}
          />
        </div>
      ) : null}

      {activeTab === "versions" ? (
        <div className="scenario-version-list">
          {!scenarioVersions.length ? (
            <p className="scenario-settings-note">Версий пока нет: сценарий ещё не публиковался.</p>
          ) : (
            <ol>
              {scenarioVersions.map((version, index) => {
                const previous = scenarioVersions[index + 1];
                const isActive = version.versionId === scenario.activeVersionId;
                return (
                  <li className={isActive ? "active" : ""} key={version.versionId}>
                    <div>
                      <strong>
                        <History size={14} /> {formatDateTime(version.createdAt)}
                        {isActive ? <StatusBadge tone="ok">активная</StatusBadge> : null}
                      </strong>
                      <span>{describeVersionDiff(version, previous)}</span>
                      <small>{version.versionId}</small>
                    </div>
                    {!isActive && scenario.status === "published" ? (
                      <button disabled={!canManage || isSaving} onClick={() => setRollbackTarget(version)} type="button">
                        <RotateCcw size={14} /> Откатиться
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : null}

      {activeTab === "results" ? (
        <div className="scenario-console-results">
          <ScenarioOperationalPanel aiUsage={aiUsage} operations={operations} scenarioName={scenario.name} />
        </div>
      ) : null}

      {rollbackTarget ? (
        <ConfirmDialog
          confirmLabel="Откатиться"
          danger
          message={`Активной станет версия от ${formatDateTime(rollbackTarget.createdAt)}. Новые диалоги пойдут по ней; уже начатые останутся на своих версиях. Текущая версия сохранится в истории.`}
          onCancel={() => setRollbackTarget(null)}
          onConfirm={() => {
            const target = rollbackTarget;
            setRollbackTarget(null);
            onRollback(scenario, target.versionId);
          }}
          title={`Откатить «${scenario.name}»?`}
        />
      ) : null}
    </section>
  );
}

function mergeDraft(scenario, draft) {
  if (!scenario) return scenario;
  if (!draft) return scenario;
  return {
    ...scenario,
    ...(draft.name ? { name: draft.name } : {}),
    ...(draft.channels ? { channels: draft.channels } : {}),
    ...(draft.basePrompt !== undefined ? { basePrompt: draft.basePrompt } : {}),
    ...(draft.priority !== undefined ? { priority: draft.priority } : {}),
    ...(draft.flowNodes ? { flowNodes: draft.flowNodes } : {}),
    ...(draft.flowEdges ? { flowEdges: draft.flowEdges } : {}),
    ...(draft.sourceBindings ? { sourceBindings: draft.sourceBindings } : {}),
    ...(draft.triggerRules ? { triggerRules: draft.triggerRules } : {})
  };
}

function buildForm(effective) {
  const aiNode = (effective?.flowNodes ?? []).find((node) => node.type === "ai_reply") ?? null;
  const rule = (effective?.triggerRules ?? []).find((item) => item.type === "phrase" || item.type === "always_except")
    ?? (effective?.triggerRules ?? [])[0]
    ?? null;
  return {
    basePrompt: String(effective?.basePrompt ?? ""),
    channels: [...(effective?.channels ?? [])],
    fallbackMessage: String(aiNode?.config?.fallbackMessage ?? DEFAULT_AI_FALLBACK_MESSAGE),
    handoffQueue: String(aiNode?.config?.handoffQueue ?? "1-я линия"),
    language: String(aiNode?.config?.language ?? "ru"),
    matchMode: rule?.matchMode ?? "contains",
    maxTurns: String(aiNode?.config?.maxTurns ?? 10),
    name: String(effective?.name ?? ""),
    phrases: [...(rule?.phrases ?? [])],
    priority: String(effective?.priority ?? 0),
    tone: String(aiNode?.config?.tone ?? "neutral"),
    triggerType: rule?.type ?? "new_conversation"
  };
}

function collectUpdatePayload(effective, form) {
  const flowNodes = (effective.flowNodes ?? []).map((node) => node.type === "ai_reply"
    ? {
      ...node,
      config: {
        ...(node.config ?? {}),
        consultationMode: node.config?.consultationMode ?? true,
        fallbackMessage: form.fallbackMessage.trim() || DEFAULT_AI_FALLBACK_MESSAGE,
        handoffQueue: form.handoffQueue.trim() || "1-я линия",
        language: form.language,
        maxTurns: clampNumber(form.maxTurns, 1, 30, 10),
        tone: form.tone
      }
    }
    : node);
  const triggerRules = (effective.triggerRules ?? []).map((rule) => rule.type === "phrase" || rule.type === "always_except"
    ? { ...rule, matchMode: form.matchMode, phrases: form.phrases }
    : rule);
  return {
    basePrompt: form.basePrompt.trim(),
    channels: form.channels,
    flowEdges: effective.flowEdges ?? [],
    flowNodes,
    name: form.name.trim() || effective.name,
    priority: clampNumber(form.priority, -10000, 10000, 0),
    sourceBindings: effective.sourceBindings ?? [],
    triggerRules
  };
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function labelFor(options, id) {
  return options.find((option) => option.id === id)?.label ?? options.find((option) => option.id === "neutral" || option.id === "ru")?.label ?? "—";
}

function warningTab(warning) {
  if (/источник|знан/i.test(warning)) return "knowledge";
  if (/AI-подключение/i.test(warning)) return "overview";
  return "settings";
}

function describeVersionDiff(version, previous) {
  if (!previous) return "Первая публикация";
  const changes = [];
  if (JSON.stringify(version.triggerRules ?? null) !== JSON.stringify(previous.triggerRules ?? null)) changes.push("триггеры");
  if (JSON.stringify(version.sourceBindings ?? null) !== JSON.stringify(previous.sourceBindings ?? null)) changes.push("источники");
  if ((version.basePrompt ?? "") !== (previous.basePrompt ?? "")) changes.push("промпт");
  if (JSON.stringify(version.flowNodes ?? null) !== JSON.stringify(previous.flowNodes ?? null)) changes.push("шаги");
  if (JSON.stringify(version.flowEdges ?? null) !== JSON.stringify(previous.flowEdges ?? null)) changes.push("переходы");
  if ((version.priority ?? 0) !== (previous.priority ?? 0)) changes.push("приоритет");
  return changes.length ? `Изменены: ${changes.join(", ")}` : "Без изменений конфигурации";
}

function formatDateTime(value) {
  const parsed = Date.parse(String(value ?? ""));
  if (Number.isNaN(parsed)) return String(value ?? "—");
  return new Date(parsed).toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit", year: "numeric" });
}
