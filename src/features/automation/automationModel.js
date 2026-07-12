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
  const triggerRules = trigger.id === "keyword"
    ? [{ id: "phrase-1", type: "phrase", phrases: triggerPhrases, matchMode: values.matchMode ?? "contains", priority: 0 }]
    : [{ id: "new-conversation", type: trigger.id === "first_message" ? "new_conversation" : "manual", priority: 0 }];

  return {
    id,
    name,
    status: "draft",
    schemaVersion: "bot-flow/v1",
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
      { id: `${id}-reply`, type: "ai_reply", typeLabel: "AI-ответ", title: "Ответ AI по базе знаний", detail: firstMessage, config: { instructions: firstMessage }, channel: primaryChannel, position: { x: 2, y: 1 } },
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
