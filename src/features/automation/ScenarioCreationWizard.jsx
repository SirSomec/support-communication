import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleHelp,
  Eye,
  MessageSquareText,
  Route,
  ShieldCheck,
  X
} from "lucide-react";
import { Modal } from "../../ui.jsx";
import {
  buildClientExperiencePreview,
  clearWizardDraft,
  createDefaultWizardForm,
  findTriggerPhraseConflicts,
  loadWizardDraft,
  previewKeywordTrigger,
  saveWizardDraft,
  scenarioGoalOptions,
  scenarioHandoffOptions,
  scenarioTriggerOptions,
  scenarioWizardSteps
} from "./automationModel.js";
import { ScenarioKnowledgeSourceSelector } from "./ScenarioKnowledgeSourceSelector.jsx";

const channelOptions = ["SDK", "Telegram", "MAX", "VK"];
const MAX_TRIGGER_PHRASES = 12;
const MAX_TRIGGER_PHRASE_LENGTH = 120;
const keywordMatchModes = [
  { id: "contains", label: "Фраза встречается в сообщении", description: "Подходит для обычных запросов: «где мой заказ», «узнать статус»." },
  { id: "tokens", label: "Все слова фразы есть в сообщении", description: "Подходит, когда клиент добавляет между ключевыми словами другие слова." },
  { id: "exact", label: "Сообщение полностью совпадает с фразой", description: "Используйте только для коротких и точных команд." }
];
const keywordPhraseExamples = ["где мой заказ", "узнать статус", "нужна помощь"];

export function ScenarioCreationWizard({
  aiReadiness = { status: "not_configured" },
  existingScenarios = [],
  isSaving,
  knowledgeSources = [],
  knowledgeSourcesError = "",
  knowledgeSourcesLoading = false,
  onAddUrlSource,
  onClose,
  onCreate
}) {
  const restored = useMemo(() => loadWizardDraft(), []);
  const [step, setStep] = useState(restored?.step ?? 0);
  const [form, setForm] = useState(() => restored?.form ?? createDefaultWizardForm());
  const [phraseInput, setPhraseInput] = useState("");
  const [phraseError, setPhraseError] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState(restored ? "восстановлен" : "");
  const [livePreviewMessage, setLivePreviewMessage] = useState("Здравствуйте, где мой заказ?");
  const [triggerPriority, setTriggerPriority] = useState(0);

  const selectedGoal = findOption(scenarioGoalOptions, form.goal);
  const selectedTrigger = findOption(scenarioTriggerOptions, form.trigger);
  const selectedHandoffRule = findOption(scenarioHandoffOptions, form.handoffRule);
  const selectedMatchMode = findOption(keywordMatchModes, form.matchMode);
  const keywordTriggerIsConfigured = form.trigger !== "keyword" || form.triggerPhrases.length > 0;
  const canCreate = form.name.trim().length > 0 && form.channels.length > 0 && keywordTriggerIsConfigured && form.firstMessage.trim().length > 0;
  const canAdvance = step === 0
    ? form.name.trim().length > 0
    : step === 1
      ? form.channels.length > 0 && keywordTriggerIsConfigured
      : step === 2
        ? form.firstMessage.trim().length > 0
        : true;
  const progress = ((step + 1) / scenarioWizardSteps.length) * 100;
  const clientPreview = useMemo(() => buildClientExperiencePreview(form), [form]);
  const livePreview = useMemo(
    () => previewKeywordTrigger(livePreviewMessage, form.triggerPhrases, form.matchMode),
    [form.matchMode, form.triggerPhrases, livePreviewMessage]
  );
  const phraseConflicts = useMemo(
    () => findTriggerPhraseConflicts(form.triggerPhrases, existingScenarios),
    [existingScenarios, form.triggerPhrases]
  );
  const scenarioSummary = useMemo(() => ({
    channels: form.channels.join(", "),
    handoff: `${selectedHandoffRule.label} → ${form.handoffQueue.trim() || "Очередь 1-я линия"}`,
    message: form.firstMessage.trim() || selectedGoal.defaultMessage,
    sources: buildSourceSummary(knowledgeSources, form.selectedSourceIds),
    trigger: buildTriggerSummary(selectedTrigger, selectedMatchMode, form.triggerPhrases)
  }), [form, knowledgeSources, selectedGoal, selectedHandoffRule, selectedMatchMode, selectedTrigger]);

  useEffect(() => {
    saveWizardDraft(form, step);
    setDraftSavedAt("сохранён");
  }, [form, step]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function chooseGoal(goal) {
    setForm((current) => ({
      ...current,
      firstMessage: current.firstMessage === selectedGoal.defaultMessage ? goal.defaultMessage : current.firstMessage,
      goal: goal.id,
      name: current.name === selectedGoal.suggestedName ? goal.suggestedName : current.name
    }));
  }

  function toggleChannel(channel) {
    setForm((current) => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter((item) => item !== channel)
        : [...current.channels, channel]
    }));
  }

  function chooseTrigger(trigger) {
    update("trigger", trigger.id);
    setPhraseError("");
  }

  function addTriggerPhrase(rawPhrase = phraseInput) {
    const phrasesToAdd = String(rawPhrase).split(",").map(normalizePhrase).filter(Boolean);
    if (phrasesToAdd.length === 0) {
      setPhraseError("Введите фразу, по которой бот должен запускаться.");
      return;
    }
    const tooLongPhrase = phrasesToAdd.find((phrase) => phrase.length > MAX_TRIGGER_PHRASE_LENGTH);
    if (tooLongPhrase) {
      setPhraseError(`Одна фраза может содержать не больше ${MAX_TRIGGER_PHRASE_LENGTH} символов.`);
      return;
    }

    const existingPhrases = new Set(form.triggerPhrases.map(toPhraseKey));
    const uniquePhrases = phrasesToAdd.filter((phrase) => !existingPhrases.has(toPhraseKey(phrase)));
    if (uniquePhrases.length === 0) {
      setPhraseError("Эта фраза уже добавлена.");
      return;
    }
    if (form.triggerPhrases.length + uniquePhrases.length > MAX_TRIGGER_PHRASES) {
      setPhraseError(`Можно добавить не больше ${MAX_TRIGGER_PHRASES} фраз.`);
      return;
    }

    update("triggerPhrases", [...form.triggerPhrases, ...uniquePhrases]);
    setPhraseInput("");
    setPhraseError("");
  }

  function removeTriggerPhrase(phrase) {
    update("triggerPhrases", form.triggerPhrases.filter((item) => item !== phrase));
    setPhraseError("");
  }

  async function handleCreate() {
    if (canCreate && !isSaving) {
      await onCreate({
        ...form,
        firstMessage: scenarioSummary.message,
        handoffQueue: form.handoffQueue.trim() || "Очередь 1-я линия",
        matchMode: form.matchMode,
        name: form.name.trim(),
        sourceBindings: form.selectedSourceIds.map((sourceId) => ({ sourceId })),
        triggerPriority
      });
      clearWizardDraft();
    }
  }

  return (
    <Modal
      closeLabel="Закрыть мастер создания сценария"
      eyebrow={`Без кода · черновик ${draftSavedAt ? `(${draftSavedAt})` : ""}`}
      footer={step === scenarioWizardSteps.length - 1 ? (
        <>
          <button disabled={isSaving} onClick={() => setStep(step - 1)} type="button"><ArrowLeft size={16} />Назад</button>
          <button className="primary-action" disabled={!canCreate || isSaving} onClick={() => void handleCreate()} type="button"><CheckCircle2 size={17} />{isSaving ? "Создаём..." : "Создать черновик"}</button>
        </>
      ) : (
        <>
          <button disabled={step === 0 || isSaving} onClick={() => setStep(step - 1)} type="button"><ArrowLeft size={16} />Назад</button>
          <button className="primary-action" disabled={!canAdvance || isSaving} onClick={() => setStep(step + 1)} type="button">Далее<ArrowRight size={16} /></button>
        </>
      )}
      onClose={onClose}
      overlayClassName="scenario-wizard-overlay"
      panelClassName="scenario-wizard-panel"
      title="Мастер создания сценария"
      titleId="scenario-wizard-title"
    >
      <div className="scenario-wizard-progress" aria-label={`Шаг ${step + 1} из ${scenarioWizardSteps.length}`}>
        <div aria-valuemax={scenarioWizardSteps.length} aria-valuemin="1" aria-valuenow={step + 1} className="scenario-wizard-progress-bar" role="progressbar"><span style={{ width: `${progress}%` }} /></div>
        <ol>{scenarioWizardSteps.map((label, index) => <li aria-current={index === step ? "step" : undefined} className={index <= step ? "complete" : ""} key={label}><span>{index + 1}</span>{label}</li>)}</ol>
      </div>

      {step === 0 ? (
        <section className="scenario-wizard-step" aria-labelledby="scenario-wizard-step-goal">
          <WizardIntro icon={<Bot size={20} />} id="scenario-wizard-step-goal" title="Для чего нужен сценарий?">Выберите задачу. Мы подготовим стартовый поток: его можно править после сохранения черновика.</WizardIntro>
          <div className="scenario-goal-grid" role="radiogroup" aria-label="Задача сценария">
            {scenarioGoalOptions.map((goal) => <button aria-checked={form.goal === goal.id} className={form.goal === goal.id ? "selected" : ""} key={goal.id} onClick={() => chooseGoal(goal)} role="radio" type="button"><strong>{goal.label}</strong><span>{goal.description}</span></button>)}
          </div>
          <label className="scenario-wizard-field"><span>Название сценария</span><input onChange={(event) => update("name", event.target.value)} placeholder="Например, Статус заказа" value={form.name} /><small>{clientPreview.teamSees}</small></label>
          <ClientPreview lines={[clientPreview.teamSees, "Клиент пока ничего не увидит — сценарий ещё черновик."]} />
        </section>
      ) : null}

      {step === 1 ? (
        <section className="scenario-wizard-step" aria-labelledby="scenario-wizard-step-trigger">
          <WizardIntro icon={<Route size={20} />} id="scenario-wizard-step-trigger" title="Когда запускать сценарий?">Настройте условие старта и каналы. Один сценарий можно использовать в нескольких каналах.</WizardIntro>
          <div className="scenario-option-list" role="radiogroup" aria-label="Условие запуска">
            {scenarioTriggerOptions.map((trigger) => <button aria-checked={form.trigger === trigger.id} className={form.trigger === trigger.id ? "selected" : ""} key={trigger.id} onClick={() => chooseTrigger(trigger)} role="radio" type="button"><strong>{trigger.label}</strong><span>{trigger.description}</span></button>)}
          </div>
          {form.trigger === "keyword" ? (
            <fieldset className="scenario-keyword-config">
              <legend>Какие фразы должен распознать бот?</legend>
              <p>Добавьте слова или короткие предложения так, как их обычно пишут клиенты. Регистр букв и лишние пробелы не учитываются.</p>
              <div className="scenario-keyword-input-row">
                <label className="sr-only" htmlFor="scenario-trigger-phrase">Ключевая фраза</label>
                <input
                  aria-describedby="scenario-trigger-phrase-help"
                  id="scenario-trigger-phrase"
                  maxLength={MAX_TRIGGER_PHRASE_LENGTH}
                  onChange={(event) => setPhraseInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTriggerPhrase();
                    }
                  }}
                  placeholder="Например, где мой заказ"
                  value={phraseInput}
                />
                <button onClick={() => addTriggerPhrase()} type="button">Добавить</button>
              </div>
              <small id="scenario-trigger-phrase-help">Нажмите Enter или «Добавить». Несколько фраз можно вставить через запятую.</small>
              {form.triggerPhrases.length > 0 ? (
                <ul aria-label="Добавленные ключевые фразы" className="scenario-keyword-chips">
                  {form.triggerPhrases.map((phrase) => <li key={phrase}><span>{phrase}</span><button aria-label={`Удалить фразу «${phrase}»`} onClick={() => removeTriggerPhrase(phrase)} type="button"><X size={14} /></button></li>)}
                </ul>
              ) : null}
              <div className="scenario-keyword-examples"><span>Примеры:</span>{keywordPhraseExamples.map((phrase) => <button key={phrase} onClick={() => addTriggerPhrase(phrase)} type="button">+ {phrase}</button>)}</div>
              <div className="scenario-match-mode" role="radiogroup" aria-label="Как сравнивать фразы">
                <strong>Как искать фразу</strong>
                {keywordMatchModes.map((mode) => <label className={form.matchMode === mode.id ? "selected" : ""} key={mode.id}><input checked={form.matchMode === mode.id} name="scenario-match-mode" onChange={() => update("matchMode", mode.id)} type="radio" value={mode.id} /><span><b>{mode.label}</b><small>{mode.description}</small></span></label>)}
              </div>
              <label className="scenario-wizard-field">
                <span>Приоритет запуска</span>
                <input max={100} min={0} onChange={(event) => setTriggerPriority(Number(event.target.value) || 0)} type="number" value={triggerPriority} />
                <small>Чем выше число, тем раньше этот сценарий выбирается при совпадении нескольких фраз. Обычно достаточно 0.</small>
              </label>
              <label className="scenario-wizard-field">
                <span>Проверка на примере сообщения клиента</span>
                <textarea aria-label="Пример сообщения для проверки фразы" onChange={(event) => setLivePreviewMessage(event.target.value)} value={livePreviewMessage} />
                <small className={livePreview.matches ? "scenario-live-preview-ok" : "scenario-live-preview-miss"}>
                  {livePreview.matches
                    ? `Сработает (${livePreview.modeLabel}): ${livePreview.matchedPhrases.map((phrase) => `«${phrase}»`).join(", ")}`
                    : `Не сработает для режима «${livePreview.modeLabel}». Измените фразу или пример сообщения.`}
                </small>
              </label>
              {phraseConflicts.length ? (
                <div className="scenario-wizard-note scenario-wizard-note--warn" role="status">
                  <CircleHelp size={18} />
                  <span>
                    Похожие фразы уже есть в других сценариях: {phraseConflicts.slice(0, 3).map((item) => `«${item.phrase}» → ${item.scenarioName}`).join("; ")}.
                    Поднимите приоритет или уточните формулировку.
                  </span>
                </div>
              ) : null}
              {!keywordTriggerIsConfigured || phraseError ? <small className="scenario-field-error">{phraseError || "Добавьте хотя бы одну ключевую фразу."}</small> : null}
            </fieldset>
          ) : null}
          <fieldset className="scenario-channel-picker"><legend>Каналы запуска</legend><p>Клиент увидит один и тот же первый ответ в выбранных каналах.</p><div>{channelOptions.map((channel) => <button aria-pressed={form.channels.includes(channel)} className={form.channels.includes(channel) ? "selected" : ""} key={channel} onClick={() => toggleChannel(channel)} type="button">{channel}</button>)}</div>{form.channels.length === 0 ? <small className="scenario-field-error">Выберите хотя бы один канал.</small> : null}</fieldset>
          <ClientPreview lines={clientPreview.clientSees.slice(0, 2)} />
        </section>
      ) : null}

      {step === 2 ? (
        <section className="scenario-wizard-step" aria-labelledby="scenario-wizard-step-help">
          <WizardIntro icon={<MessageSquareText size={20} />} id="scenario-wizard-step-help" title="Как бот поможет клиенту?">Напишите обычный текст первого ответа. Это то, что клиент увидит сразу после запуска сценария.</WizardIntro>
          <label className="scenario-wizard-field"><span>Первый ответ бота</span><textarea onChange={(event) => update("firstMessage", event.target.value)} value={form.firstMessage} /><small>Без переменных и JSON — только понятный текст для клиента.</small></label>
          <ClientPreview lines={[`Бот ответит: «${clientPreview.message}»`, `Каналы: ${clientPreview.channelsLabel}`]} />
        </section>
      ) : null}

      {step === 3 ? (
        <section className="scenario-wizard-step" aria-labelledby="scenario-wizard-step-knowledge">
          <WizardIntro icon={<Bot size={20} />} id="scenario-wizard-step-knowledge" title="Знания и передача оператору">Выберите источники для AI и правило handoff. Без источников бот сможет отправлять только заготовленный ответ.</WizardIntro>
          <div className="scenario-wizard-note"><CircleHelp size={18} /><span>{aiReadinessMessage(aiReadiness)}</span></div>
          <ScenarioKnowledgeSourceSelector
            error={knowledgeSourcesError}
            isLoading={knowledgeSourcesLoading}
            onSelectedSourceIdsChange={(selectedSourceIds) => update("selectedSourceIds", selectedSourceIds)}
            selectedSourceIds={form.selectedSourceIds}
            sources={knowledgeSources}
          />
          {onAddUrlSource ? <button className="scenario-wizard-secondary" disabled={isSaving} onClick={onAddUrlSource} type="button">Добавить URL-страницу</button> : null}
          <div className="scenario-option-list compact" role="radiogroup" aria-label="Правило передачи оператору"><strong>Передать оператору, если</strong>{scenarioHandoffOptions.map((rule) => <button aria-checked={form.handoffRule === rule.id} className={form.handoffRule === rule.id ? "selected" : ""} key={rule.id} onClick={() => update("handoffRule", rule.id)} role="radio" type="button"><strong>{rule.label}</strong><span>{rule.description}</span></button>)}</div>
          <label className="scenario-wizard-field"><span>Очередь операторов</span><input onChange={(event) => update("handoffQueue", event.target.value)} value={form.handoffQueue} /><small>Оператор получит историю диалога и причину передачи до первого ручного сообщения.</small></label>
          <ClientPreview lines={[clientPreview.clientSees[3], `Знания: ${clientPreview.sourcesLabel}`]} />
        </section>
      ) : null}

      {step === 4 ? (
        <section className="scenario-wizard-step" aria-labelledby="scenario-wizard-step-review">
          <WizardIntro icon={<ShieldCheck size={20} />} id="scenario-wizard-step-review" title="Проверьте, как всё будет работать">Сейчас создастся только черновик: клиенты не увидят сценарий, пока вы не прогоните тест и не опубликуете его.</WizardIntro>
          <div className="scenario-execution-preview" aria-live="polite">
            <ScenarioSummary index="1" title="Запуск" value={`${scenarioSummary.trigger} · ${scenarioSummary.channels}`} />
            <ScenarioSummary index="2" title="Как помогает" value={scenarioSummary.message} />
            <ScenarioSummary index="3" title="Знания для AI" value={scenarioSummary.sources} />
            <ScenarioSummary index="4" title="Передача оператору" value={scenarioSummary.handoff} />
          </div>
          <ClientPreview lines={clientPreview.clientSees} title="Что увидит клиент" />
          <div className="scenario-wizard-note"><CircleHelp size={18} /><span>Черновик шагов сохранён в этом браузере. После создания откроется canvas — там можно поменять шаги и нажать «Прогнать тест» до публикации.</span></div>
        </section>
      ) : null}
    </Modal>
  );
}

function ClientPreview({ lines, title = "Что увидит клиент" }) {
  return (
    <aside className="scenario-client-preview" aria-label={title}>
      <header><Eye size={16} /><strong>{title}</strong></header>
      <ol>{lines.map((line) => <li key={line}>{line}</li>)}</ol>
    </aside>
  );
}

function WizardIntro({ children, icon, id, title }) {
  return <div className="scenario-wizard-intro">{icon}<div><h3 id={id}>{title}</h3><p>{children}</p></div></div>;
}

function ScenarioSummary({ index, title, value }) {
  return <article><span>{index}</span><div><strong>{title}</strong><p>{value}</p></div></article>;
}

function findOption(options, id) {
  return options.find((option) => option.id === id) ?? options[0];
}

function normalizePhrase(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function toPhraseKey(phrase) {
  return phrase.toLocaleLowerCase("ru");
}

function buildTriggerSummary(trigger, matchMode, phrases) {
  if (trigger.id !== "keyword") return trigger.label;
  const phraseSummary = phrases.length ? `: ${phrases.map((phrase) => `«${phrase}»`).join(", ")}` : ": фраза ещё не добавлена";
  return `${trigger.label} — ${matchMode.label}${phraseSummary}`;
}

function buildSourceSummary(sources, selectedSourceIds) {
  if (!selectedSourceIds.length) return "Не выбраны — сценарий использует только заготовленные сообщения";

  const sourceNames = new Map(sources.map((source) => [source.id, source.title || source.name || "Источник без названия"]));
  return selectedSourceIds.map((sourceId) => sourceNames.get(sourceId) || "Выбранный источник").join(", ");
}

function aiReadinessMessage(readiness) {
  if (readiness?.status === "ready") return "AI-подключение проверено и готово. С выбранными источниками бот сможет отвечать на консультационные вопросы.";
  if (readiness?.status === "unavailable") return "AI-подключение есть, но пока не прошло проверку или отключено. Обратитесь к администратору сервиса: сценарий можно сохранить, но AI-ответы не запустятся.";
  return "AI ещё не подключён для вашей организации. Сценарий можно подготовить, а после настройки ключа администратором — включить AI-ответы.";
}
