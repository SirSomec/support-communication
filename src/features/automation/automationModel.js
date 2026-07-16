export const botNodeTypeOptions = [
  { id: "message", label: "Сообщение" },
  { id: "ai_reply", label: "AI-ответ по знаниям" },
  { id: "quick_replies", label: "Быстрые ответы" },
  { id: "condition", label: "Условие" },
  { id: "contact_request", label: "Запрос контакта" },
  { id: "webhook", label: "Webhook" },
  { id: "handoff", label: "Handoff" },
  { id: "fallback", label: "Fallback" }
];
export const botNodeTypeLabels = Object.fromEntries(botNodeTypeOptions.map((type) => [type.id, type.label]));

export const scenarioGoalOptions = [
  {
    id: "answer",
    label: "Ответить на частый вопрос",
    description: "Бот сразу отправит понятный ответ и предложит помощь оператора.",
    suggestedName: "Ответы на частые вопросы",
    defaultMessage: "Здравствуйте! Помогу разобраться. Опишите вопрос в одном сообщении — если потребуется, подключу оператора."
  },
  {
    id: "qualification",
    label: "Собрать данные для обращения",
    description: "Бот уточнит тему и контакты, чтобы оператор получил контекст без повторных вопросов.",
    suggestedName: "Сбор данных перед оператором",
    defaultMessage: "Здравствуйте! Уточните, пожалуйста, тему обращения и удобный способ связи. После этого передам всё оператору."
  },
  {
    id: "status",
    label: "Помочь со статусом заказа",
    description: "Бот попросит номер заказа и передаст обращение в нужную очередь.",
    suggestedName: "Статус заказа",
    defaultMessage: "Здравствуйте! Пришлите номер заказа — проверю статус. Если понадобится уточнение, передам запрос оператору."
  }
];

export const scenarioTriggerOptions = [
  { id: "first_message", label: "Первое сообщение клиента", description: "Сценарий начнётся, когда клиент напишет в выбранный канал." },
  { id: "keyword", label: "Ключевая фраза в сообщении", description: "Сценарий отработает, когда в сообщении встретится нужная фраза." },
  { id: "always_except", label: "Всегда, кроме", description: "Сценарий отвечает на любое сообщение, кроме указанных исключений." },
  { id: "after_hours", label: "В нерабочее время", description: "Сценарий возьмёт диалог, пока операторы недоступны." }
];

export const scenarioHandoffOptions = [
  { id: "request", label: "Клиент просит оператора", description: "Передавать, когда клиент явно просит помощь человека." },
  { id: "no_answer", label: "Бот не смог помочь", description: "Передавать после нераспознанного или сложного вопроса." },
  { id: "after_data", label: "После сбора данных", description: "Передавать сразу, как клиент ответит на стартовые вопросы." }
];

export function createScenarioFromWizard(id, values = {}) {
  const goal = findOption(scenarioGoalOptions, values.goal, "answer");
  const trigger = findOption(scenarioTriggerOptions, values.trigger, "first_message");
  const handoffRule = findOption(scenarioHandoffOptions, values.handoffRule, "request");
  const channels = Array.isArray(values.channels) && values.channels.length ? values.channels : ["SDK"];
  const primaryChannel = channels[0];
  const name = String(values.name ?? "").trim() || goal.suggestedName;
  const firstMessage = String(values.firstMessage ?? "").trim() || goal.defaultMessage;
  const handoffQueue = String(values.handoffQueue ?? "").trim() || "Очередь 1-я линия";
  const triggerTitle = trigger.label;
  const triggerPhrases = Array.isArray(values.triggerPhrases)
    ? values.triggerPhrases.map((phrase) => String(phrase).trim()).filter(Boolean)
    : [];
  const sourceBindings = normalizeSourceBindings(values.sourceBindings);
  const basePrompt = String(values.basePrompt ?? "").trim().slice(0, 4000);
  const language = findOption(scenarioLanguageOptions, values.language, "ru").id;
  const tone = findOption(scenarioToneOptions, values.tone, "neutral").id;
  const fallbackMessage = String(values.fallbackMessage ?? "").trim() || DEFAULT_AI_FALLBACK_MESSAGE;
  const triggerRules = trigger.id === "keyword"
    ? [{ id: "phrase-1", type: "phrase", phrases: triggerPhrases, matchMode: values.matchMode ?? "contains", priority: Number(values.triggerPriority) || 0 }]
    : trigger.id === "always_except"
      ? [{ id: "always-except-1", type: "always_except", phrases: triggerPhrases, matchMode: values.matchMode ?? "contains", priority: Number(values.triggerPriority) || 0 }]
    : [{ id: "new-conversation", type: trigger.id === "first_message" ? "new_conversation" : "manual", priority: Number(values.triggerPriority) || 0 }];

  return {
    id,
    name,
    status: "draft",
    schemaVersion: "bot-flow/v1",
    ...(basePrompt ? { basePrompt } : {}),
    sourceBindings,
    owner: "Администратор",
    updatedAt: "сейчас",
    trigger: triggerTitle,
    triggerRules,
    channels,
    steps: ["Запуск", "Ответ клиенту", "Проверка передачи", "Handoff"],
    handoff: handoffQueue,
    successRate: 0,
    flowNodes: [
      { id: `${id}-trigger`, type: "message", typeLabel: "Сообщение", title: triggerTitle, detail: `${trigger.description} Каналы: ${channels.join(", ")}.`, channel: primaryChannel, position: { x: 1, y: 1 } },
      {
        id: `${id}-reply`,
        type: "ai_reply",
        typeLabel: "AI-ответ",
        title: "Ответ AI по базе знаний",
        detail: firstMessage,
        config: {
          behaviorRules: String(values.behaviorRules ?? "").trim().slice(0, 1000),
          blockedTopics: normalizeTopicList(values.blockedTopics),
          consultationMode: true,
          fallbackMessage,
          handoffQueue,
          instructions: firstMessage,
          language,
          maxTurns: 10,
          operatorOnlyTopics: normalizeTopicList(values.operatorOnlyTopics),
          refusalMessage: String(values.refusalMessage ?? "").trim() || DEFAULT_REFUSAL_MESSAGE,
          requireSource: values.requireSource !== false,
          retrievalScoreThreshold: clampScore(values.retrievalScoreThreshold),
          tone
        },
        channel: primaryChannel,
        position: { x: 2, y: 1 }
      },
      { id: `${id}-condition`, type: "condition", typeLabel: "Условие", title: handoffRule.label, detail: handoffRule.description, channel: primaryChannel, position: { x: 3, y: 1 } },
      { id: `${id}-handoff`, type: "handoff", typeLabel: "Handoff", title: `Передать в «${handoffQueue}»`, detail: `Оператор получит историю диалога, выбранный канал и причину: ${handoffRule.label.toLowerCase()}.`, channel: primaryChannel, position: { x: 4, y: 1 } }
    ],
    flowEdges: [
      { from: `${id}-trigger`, to: `${id}-reply`, label: "запустить" },
      { from: `${id}-reply`, to: `${id}-condition`, label: "проверить" },
      { from: `${id}-condition`, to: `${id}-handoff`, label: "передать" }
    ],
    validationRules: goal.id === "qualification" ? ["тема обращения", "контакт"] : [],
    previewMessages: [
      { side: "client", speaker: "Клиент", time: "00:01", text: "Здравствуйте, мне нужна помощь." },
      { side: "bot", speaker: "Бот", time: "00:02", text: firstMessage },
      { side: "bot", speaker: "Бот", time: "00:05", text: `Если потребуется, передам диалог в «${handoffQueue}».` }
    ],
    testCases: [{ id: `${id}-wizard-test`, name: "Проверка мастера", expected: "draft ready for test" }],
    exportVersion: "flow-v1.3"
  };
}

function normalizeSourceBindings(bindings) {
  if (!Array.isArray(bindings)) return [];

  const seen = new Set();
  return bindings.flatMap((binding) => {
    const sourceId = String(binding?.sourceId ?? "").trim();
    if (!sourceId || seen.has(sourceId)) return [];
    seen.add(sourceId);

    const sourceVersion = String(binding?.sourceVersion ?? "").trim();
    return [{ sourceId, ...(sourceVersion ? { sourceVersion } : {}) }];
  });
}

export function createDraftScenario(id) {
      return {
        id,
        name: "Новый сценарий",
        status: "draft",
        schemaVersion: "bot-flow/v1",
        owner: "Администратор",
        updatedAt: "сейчас",
        trigger: "Опишите триггер",
        triggerRules: [{ id: "new-conversation", type: "new_conversation", priority: 0 }],
        channels: ["SDK"],
        steps: ["Триггер", "Ответ", "Handoff"],
        handoff: "Очередь 1-я линия",
        successRate: 0,
        flowNodes: [
          { id: `${id}-message`, type: "message", typeLabel: "Сообщение", title: "Новый триггер", detail: "Условие запуска сценария", channel: "SDK", position: { x: 1, y: 1 } },
          { id: `${id}-condition`, type: "condition", typeLabel: "Условие", title: "Условие перехода", detail: "Правило ветвления сценария", channel: "SDK", position: { x: 2, y: 1 } },
          { id: `${id}-handoff`, type: "handoff", typeLabel: "Handoff", title: "Передача оператору", detail: "Очередь и причина handoff", channel: "SDK", position: { x: 3, y: 1 } }
        ],
        flowEdges: [
          { from: `${id}-message`, to: `${id}-condition`, label: "next" },
          { from: `${id}-condition`, to: `${id}-handoff`, label: "handoff" }
        ],
        validationRules: ["phone"],
        previewMessages: [
          { side: "client", speaker: "Клиент", time: "00:01", text: "Пример входящего сообщения." },
          { side: "bot", speaker: "Бот", time: "00:03", text: "Черновик ответа бота." },
          { side: "bot", speaker: "Бот", time: "00:07", text: "При необходимости подключу оператора." }
        ],
        testCases: [
          { id: `${id}-default`, name: "Базовый тест", expected: "handoff" }
        ],
        exportVersion: "flow-v1.3"
      };
}

function findOption(options, value, fallbackId) {
  return options.find((option) => option.id === value)
    ?? options.find((option) => option.id === fallbackId)
    ?? options[0];
}

export const scenarioWizardSteps = ["Задача", "Запуск", "Как помогает", "Знания и передача", "Проверка"];
export const SCENARIO_WIZARD_DRAFT_KEY = "bot-scenario-wizard-draft-v1";

export const scenarioLanguageOptions = [
  { id: "ru", label: "Русский", description: "Бот отвечает по-русски." },
  { id: "en", label: "English", description: "The bot answers in English." }
];

export const scenarioToneOptions = [
  { id: "friendly", label: "Дружелюбный", description: "Тёплый и простой тон, без канцелярита." },
  { id: "neutral", label: "Нейтральный", description: "Спокойный деловой тон по умолчанию." },
  { id: "formal", label: "Официальный", description: "Сдержанный тон для формальных обращений." }
];

export const DEFAULT_AI_FALLBACK_MESSAGE = "Сейчас я не могу надёжно ответить по материалам. Передам вопрос специалисту.";
export const DEFAULT_REFUSAL_MESSAGE = "Извините, по этому вопросу я не могу помочь. Если нужно, могу передать диалог оператору.";

export function normalizeTopicList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const topics = [];
  for (const item of value) {
    const topic = String(item ?? "").trim().slice(0, 120);
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
    if (topics.length >= 40) break;
  }
  return topics;
}

export function clampScore(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
}

export function describeAiReadiness(readiness = {}) {
  const status = String(readiness.status ?? "not_configured");
  if (status === "ready") {
    return {
      canFix: false,
      fixHint: null,
      reason: readiness.readyConnectionCount
        ? `Проверено подключений: ${readiness.readyConnectionCount}. Бот сможет опираться на выбранные источники.`
        : "AI-подключение проверено и готово к ответам по выбранным источникам.",
      status,
      title: "AI готов",
      tone: "ok"
    };
  }
  if (status === "unavailable") {
    return {
      canFix: true,
      fixHint: "Исправить в Service Admin → AI-подключения",
      reason: "Ключ есть, но не прошёл проверку или отключён. Черновик сохранить можно, а AI-ответы не запустятся, пока подключение не исправят.",
      status,
      title: "AI пока недоступен",
      tone: "warn"
    };
  }
  return {
    canFix: true,
    fixHint: "Настроить в Service Admin → AI-подключения",
    reason: "Для организации ещё нет рабочего AI-ключа. Сценарий можно подготовить; после настройки ключа администратором сервиса AI-ответы заработают.",
    status: "not_configured",
    title: "AI ещё не настроен",
    tone: "warn"
  };
}

export function createDefaultWizardForm() {
  return {
    basePrompt: "",
    channels: ["SDK"],
    fallbackMessage: DEFAULT_AI_FALLBACK_MESSAGE,
    firstMessage: scenarioGoalOptions[0].defaultMessage,
    goal: scenarioGoalOptions[0].id,
    handoffQueue: "Очередь 1-я линия",
    handoffRule: scenarioHandoffOptions[0].id,
    language: scenarioLanguageOptions[0].id,
    matchMode: "contains",
    name: scenarioGoalOptions[0].suggestedName,
    selectedSourceIds: [],
    tone: "neutral",
    trigger: scenarioTriggerOptions[0].id,
    triggerPhrases: []
  };
}

export function saveWizardDraft(form, step, storage = globalThis.sessionStorage) {
  if (!storage?.setItem) return;
  storage.setItem(SCENARIO_WIZARD_DRAFT_KEY, JSON.stringify({
    form,
    savedAt: new Date().toISOString(),
    step: Math.max(0, Math.min(scenarioWizardSteps.length - 1, Number(step) || 0))
  }));
}

export function loadWizardDraft(storage = globalThis.sessionStorage) {
  if (!storage?.getItem) return null;
  try {
    const raw = storage.getItem(SCENARIO_WIZARD_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.form || typeof parsed.form !== "object") return null;
    return {
      form: { ...createDefaultWizardForm(), ...parsed.form },
      step: Math.max(0, Math.min(scenarioWizardSteps.length - 1, Number(parsed.step) || 0))
    };
  } catch {
    return null;
  }
}

export function clearWizardDraft(storage = globalThis.sessionStorage) {
  if (!storage?.removeItem) return;
  storage.removeItem(SCENARIO_WIZARD_DRAFT_KEY);
}

export function buildClientExperiencePreview(form = {}, context = {}) {
  const goal = findOption(scenarioGoalOptions, form.goal, "answer");
  const trigger = findOption(scenarioTriggerOptions, form.trigger, "first_message");
  const handoff = findOption(scenarioHandoffOptions, form.handoffRule, "request");
  const channels = Array.isArray(form.channels) && form.channels.length ? form.channels : ["SDK"];
  const message = String(form.firstMessage ?? "").trim() || goal.defaultMessage;
  const phrases = Array.isArray(form.triggerPhrases) ? form.triggerPhrases.filter(Boolean) : [];
  const triggerLine = trigger.id === "keyword"
    ? (phrases.length ? `Клиент напишет одну из фраз: ${phrases.slice(0, 3).map((phrase) => `«${phrase}»`).join(", ")}` : "Клиент напишет ключевую фразу (ещё не задана)")
    : trigger.id === "always_except"
      ? (phrases.length
        ? `Бот ответит на любое сообщение, кроме: ${phrases.slice(0, 3).map((phrase) => `«${phrase}»`).join(", ")}`
        : "Бот ответит на любое сообщение в выбранных каналах")
    : trigger.description;
  return {
    channelsLabel: channels.join(", "),
    clientSees: [
      `В канале ${channels[0]} клиент начнёт диалог.`,
      triggerLine,
      `Бот ответит: «${message}»`,
      `Если потребуется человек — передадим в «${String(form.handoffQueue ?? "").trim() || "Очередь 1-я линия"}» (${handoff.label.toLowerCase()}).`
    ],
    handoffLabel: `${handoff.label} → ${String(form.handoffQueue ?? "").trim() || "Очередь 1-я линия"}`,
    message,
    sourcesLabel: Array.isArray(form.selectedSourceIds) && form.selectedSourceIds.length
      ? `${form.selectedSourceIds.length} источник(ов)`
      : "Только заготовленные сообщения",
    teamSees: `В списке сценариев коллеги увидят название «${String(form.name ?? "").trim() || goal.suggestedName}». Клиенты название не видят.`
  };
}

export const SCENARIO_ADVANCED_MODE_KEY = "bot-scenario-advanced-mode";

export function loadAdvancedModePreference(storage = globalThis.sessionStorage) {
  if (!storage?.getItem) return false;
  return storage.getItem(SCENARIO_ADVANCED_MODE_KEY) === "1";
}

export function saveAdvancedModePreference(enabled, storage = globalThis.sessionStorage) {
  if (!storage?.setItem) return;
  storage.setItem(SCENARIO_ADVANCED_MODE_KEY, enabled ? "1" : "0");
}

export const SCENARIO_ARCHIVE_RETENTION_DAYS = 30;

export function buildPublishChecklist(scenario = {}, context = {}) {
  const aiReadiness = context.aiReadiness ?? { status: "not_configured" };
  const channels = Array.isArray(scenario.channels) ? scenario.channels : [];
  const nodes = Array.isArray(scenario.flowNodes) ? scenario.flowNodes : [];
  const bindings = Array.isArray(scenario.sourceBindings) ? scenario.sourceBindings : [];
  const rules = Array.isArray(scenario.triggerRules) ? scenario.triggerRules : [];
  const hasAi = nodes.some((node) => node.type === "ai_reply");
  const phraseRule = rules.find((rule) => rule.type === "phrase");
  const alwaysExceptRule = rules.find((rule) => rule.type === "always_except");
  const items = [
    { blocking: true, id: "name", label: "Указано название сценария", ok: Boolean(String(scenario.name ?? "").trim()) },
    { blocking: true, id: "channels", label: "Выбран хотя бы один канал", ok: channels.length > 0 },
    { blocking: true, id: "nodes", label: "Есть шаги сценария", ok: nodes.length > 0 },
    {
      blocking: true,
      id: "trigger",
      label: phraseRule
        ? "Добавлена хотя бы одна ключевая фраза"
        : alwaysExceptRule
          ? "Задан режим «Всегда, кроме»"
          : "Задан триггер запуска",
      ok: phraseRule
        ? Boolean(phraseRule.phrases?.length)
        : alwaysExceptRule
          ? true
        : rules.length > 0 || Boolean(String(scenario.trigger ?? "").trim()) || nodes.length > 0
    }
  ];
  if (hasAi) {
    items.push({
      blocking: true,
      id: "ai",
      label: "AI-подключение организации готово",
      ok: aiReadiness.status === "ready"
    });
    items.push({
      blocking: true,
      id: "sources",
      label: "Выбран хотя бы один источник знаний",
      ok: bindings.length > 0
    });
  }
  items.push({
    blocking: false,
    id: "test",
    label: "Рекомендуется прогнать тест в песочнице перед публикацией",
    ok: Boolean(context.sandboxVerified)
  });

  return {
    canPublish: items.every((item) => !item.blocking || item.ok),
    items,
    retentionNote: `Удалённые сценарии хранятся в архиве ${SCENARIO_ARCHIVE_RETENTION_DAYS} дней и остаются доступными для восстановления.`
  };
}

export function normalizeTriggerPreviewText(value, locale = "ru") {
  return String(value ?? "").normalize("NFC").toLocaleLowerCase(locale).replace(/\s+/gu, " ").trim();
}

export function matchesTriggerPreviewPhrase(message, phrase, mode = "contains", locale = "ru") {
  const normalizedMessage = normalizeTriggerPreviewText(message, locale);
  const normalizedPhrase = normalizeTriggerPreviewText(phrase, locale);
  if (!normalizedMessage || !normalizedPhrase) return false;
  const phraseTokens = normalizedPhrase.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!phraseTokens.length) return false;
  if (mode === "exact") return normalizedMessage === normalizedPhrase;
  if (mode === "contains") return normalizedMessage.includes(normalizedPhrase);
  const messageTokens = new Set(normalizedMessage.match(/[\p{L}\p{N}]+/gu) ?? []);
  return phraseTokens.every((token) => messageTokens.has(token));
}

export function previewKeywordTrigger(message, phrases = [], matchMode = "contains") {
  const matched = phrases.filter((phrase) => matchesTriggerPreviewPhrase(message, phrase, matchMode));
  return {
    matchedPhrases: matched,
    matches: matched.length > 0,
    modeLabel: describeMatchMode(matchMode)
  };
}

/** Preview for «Всегда, кроме»: matches unless an exclusion phrase hits. */
export function previewAlwaysExceptTrigger(message, exclusions = [], matchMode = "contains") {
  const matchedExclusions = exclusions.filter((phrase) => matchesTriggerPreviewPhrase(message, phrase, matchMode));
  return {
    matchedPhrases: matchedExclusions,
    matches: matchedExclusions.length === 0,
    modeLabel: describeMatchMode(matchMode)
  };
}

export function findTriggerPhraseConflicts(phrases = [], scenarios = [], currentScenarioId = "") {
  const normalizedPhrases = phrases.map((phrase) => normalizeTriggerPreviewText(phrase)).filter(Boolean);
  if (!normalizedPhrases.length) return [];

  const conflicts = [];
  for (const scenario of scenarios) {
    if (!scenario || scenario.id === currentScenarioId || scenario.status === "archived") continue;
    const rules = Array.isArray(scenario.triggerRules) ? scenario.triggerRules : [];
    for (const rule of rules) {
      if (rule?.type !== "phrase") continue;
      const otherPhrases = Array.isArray(rule.phrases) ? rule.phrases : [];
      for (const phrase of otherPhrases) {
        const key = normalizeTriggerPreviewText(phrase);
        if (normalizedPhrases.includes(key)) {
          conflicts.push({
            phrase: String(phrase),
            scenarioId: scenario.id,
            scenarioName: scenario.name || scenario.id
          });
        }
      }
    }
  }
  return conflicts;
}

const scenarioStatusLabels = {
  archived: "Архив",
  disabled: "Выключен",
  draft: "Черновик",
  published: "Опубликован",
  test: "Тест"
};

export function formatScenarioStatusLabel(status) {
  const value = String(status ?? "").trim().toLowerCase();
  return scenarioStatusLabels[value] ?? (String(status ?? "").trim() || "Без статуса");
}

export function formatFallbackReasonLabel(reason) {
  const value = String(reason ?? "").trim();
  if (!value) return "Причина не зафиксирована";
  const labels = {
    ai_requested_handoff: "AI-агент передал диалог оператору",
    ai_resolved: "Бот закрыл обращение: вопрос решен",
    ai_unavailable: "AI недоступен",
    bot_ai_concurrency_limit_reached: "Достигнут лимит параллельных AI-запросов",
    bot_ai_consultation_turn_limit: "Достигнут лимит реплик консультации",
    bot_ai_quota_exhausted: "Исчерпан месячный бюджет токенов",
    bot_ai_rate_limit_reached: "Превышен лимит запросов в минуту",
    client_requested_operator: "Клиент попросил оператора",
    handoff: "Передача оператору",
    handoff_requested: "Запрошена передача оператору",
    policy_operator_only: "Тема «только оператор» по рамкам ответов",
    policy_source_required: "Ответ не подтверждён источником",
    webhook_timeout: "Таймаут webhook"
  };
  return labels[value] ?? value;
}

export function formatAiUsageCostBucket(bucket) {
  const value = String(bucket ?? "").trim().toLowerCase();
  if (value === "low") return "низкая";
  if (value === "medium") return "средняя";
  if (value === "high") return "высокая";
  return "нет";
}

export function buildScenarioOperationalView(operations = null, aiUsage = null) {
  const source = operations && typeof operations === "object" ? operations : {};
  const usage = aiUsage ?? source.aiUsage ?? null;
  const recentFailures = Array.isArray(source.recentFailures) ? source.recentFailures : [];
  const recentHandoffs = Array.isArray(source.recentHandoffs) ? source.recentHandoffs : [];
  const recentPublishes = Array.isArray(source.recentPublishes) ? source.recentPublishes : [];
  const lastCitations = Array.isArray(source.lastCitations) ? source.lastCitations : [];

  return {
    citationsLabel: lastCitations.length
      ? lastCitations.map((item) => `${item.title}${item.version != null ? ` v${item.version}` : ""}`).join(", ")
      : "Пока нет citations",
    failureCount: recentFailures.length,
    failures: recentFailures.slice(0, 5).map((item) => ({
      detail: item.error ? formatFallbackReasonLabel(item.error) : formatFallbackReasonLabel(item.outcome),
      id: `${item.conversationId}-${item.at}-${item.outcome}`,
      when: formatListTimestamp(item.at)
    })),
    fallbackReasonLabel: formatFallbackReasonLabel(source.lastFallbackReason),
    handoffCount: recentHandoffs.length,
    handoffs: recentHandoffs.slice(0, 5).map((item) => ({
      detail: [item.queue, formatFallbackReasonLabel(item.reason)].filter(Boolean).join(" · "),
      id: `${item.conversationId}-${item.at}`,
      when: formatListTimestamp(item.at)
    })),
    publishCount: recentPublishes.length,
    publishes: recentPublishes.slice(0, 5).map((item) => ({
      detail: `${item.actor} · ${item.versionId}`,
      id: `${item.versionId}-${item.at}`,
      when: formatListTimestamp(item.at)
    })),
    statusLabel: formatScenarioStatusLabel(source.status),
    statusTone: scenarioStatusTone(source.status),
    usage: usage
      ? {
        budgetLabel: usage.monthlyTokenBudget != null
          ? `${usage.usedTokens} / ${usage.monthlyTokenBudget} ток.`
          : `${usage.usedTokens} ток.`,
        costLabel: `оценка ${formatAiUsageCostBucket(usage.estimatedCostBucket)}${usage.estimatedCostUsd ? ` · ~$${Number(usage.estimatedCostUsd).toFixed(4)}` : ""}`,
        month: usage.month
      }
      : null
  };
}


export function scenarioStatusTone(status) {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "published") return "ok";
  if (value === "archived" || value === "disabled") return "warn";
  if (value === "draft" || value === "test") return "info";
  return "info";
}

export function describeScenarioTrigger(scenario = {}) {
  const rules = Array.isArray(scenario.triggerRules) ? scenario.triggerRules : [];
  if (!rules.length) {
    return String(scenario.trigger ?? "").trim() || "Триггер не задан";
  }

  const phraseRule = rules.find((rule) => rule.type === "phrase");
  if (phraseRule) {
    const phrases = Array.isArray(phraseRule.phrases)
      ? phraseRule.phrases.map((phrase) => String(phrase).trim()).filter(Boolean)
      : [];
    const mode = describeMatchMode(phraseRule.matchMode);
    if (!phrases.length) return `Ключевая фраза (${mode})`;
    const preview = phrases.slice(0, 3).join(", ");
    return phrases.length > 3 ? `Фраза (${mode}): ${preview} +${phrases.length - 3}` : `Фраза (${mode}): ${preview}`;
  }

  const alwaysExceptRule = rules.find((rule) => rule.type === "always_except");
  if (alwaysExceptRule) {
    const phrases = Array.isArray(alwaysExceptRule.phrases)
      ? alwaysExceptRule.phrases.map((phrase) => String(phrase).trim()).filter(Boolean)
      : [];
    if (!phrases.length) return "Всегда, кроме — без исключений";
    const preview = phrases.slice(0, 3).join(", ");
    return phrases.length > 3
      ? `Всегда, кроме: ${preview} +${phrases.length - 3}`
      : `Всегда, кроме: ${preview}`;
  }

  if (rules.some((rule) => rule.type === "new_conversation")) {
    return "Первое сообщение клиента";
  }

  if (rules.some((rule) => rule.type === "manual")) {
    return "Ручной запуск";
  }

  return String(scenario.trigger ?? "").trim() || "Триггер не задан";
}

export function describeMatchMode(matchMode) {
  switch (String(matchMode ?? "contains").toLowerCase()) {
    case "exact":
      return "точное совпадение";
    case "tokens":
      return "по словам";
    default:
      return "содержит текст";
  }
}

export function buildScenarioListRow(scenario = {}, context = {}) {
  const versions = Array.isArray(context.versions) ? context.versions : [];
  const knowledgeSources = Array.isArray(context.knowledgeSources) ? context.knowledgeSources : [];
  const aiReadiness = context.aiReadiness ?? { status: "not_configured" };
  const sourceBindings = Array.isArray(scenario.sourceBindings) ? scenario.sourceBindings : [];
  const flowNodes = Array.isArray(scenario.flowNodes) ? scenario.flowNodes : [];
  const hasAi = flowNodes.some((node) => node.type === "ai_reply");
  const sourceTitles = sourceBindings.map((binding) => {
    const source = knowledgeSources.find((item) => item.id === binding.sourceId);
    return source?.title ?? binding.sourceId;
  }).filter(Boolean);

  const activeVersion = versions.find((version) => version.versionId === scenario.activeVersionId);
  const latestPublished = versions
    .filter((version) => version.scenarioId === scenario.id && version.status === "published")
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")))[0];
  const lastPublishedAt = activeVersion?.createdAt ?? latestPublished?.createdAt ?? null;

  const errors = [];
  if (hasAi && aiReadiness.status !== "ready") {
    errors.push(aiReadiness.status === "unavailable" ? "AI-подключение недоступно" : "AI-подключение не настроено");
  }
  if (hasAi && sourceBindings.length === 0) {
    errors.push("Нет привязанных источников знаний");
  }
  if (scenario.status === "published" && scenario.enabled === false) {
    errors.push("Опубликован, но остановлен");
  }
  if (Array.isArray(context.scenarioErrors)) {
    for (const message of context.scenarioErrors) {
      if (message) errors.push(String(message));
    }
  }

  return {
    aiSummary: hasAi
      ? (sourceTitles.length
        ? `AI · ${sourceTitles.slice(0, 2).join(", ")}${sourceTitles.length > 2 ? ` +${sourceTitles.length - 2}` : ""}`
        : "AI · источники не выбраны")
      : "Без AI",
    channels: Array.isArray(scenario.channels) ? scenario.channels : [],
    errors,
    hasAi,
    hasErrors: errors.length > 0,
    id: scenario.id,
    lastPublishedAt,
    lastPublishedLabel: lastPublishedAt
      ? formatListTimestamp(lastPublishedAt)
      : (scenario.status === "published" ? "Опубликован" : "Ещё не публиковался"),
    name: String(scenario.name ?? scenario.id ?? "Сценарий"),
    sourceCount: sourceBindings.length,
    status: String(scenario.status ?? "draft"),
    statusLabel: formatScenarioStatusLabel(scenario.status),
    statusTone: scenarioStatusTone(scenario.status),
    triggerSummary: describeScenarioTrigger(scenario)
  };
}

function formatListTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(date);
}
