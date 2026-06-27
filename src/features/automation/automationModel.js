export const botNodeTypeOptions = [
  { id: "message", label: "Сообщение" },
  { id: "quick_replies", label: "Быстрые ответы" },
  { id: "condition", label: "Условие" },
  { id: "contact_request", label: "Запрос контакта" },
  { id: "webhook", label: "Webhook" },
  { id: "handoff", label: "Handoff" },
  { id: "fallback", label: "Fallback" }
];
export const botNodeTypeLabels = Object.fromEntries(botNodeTypeOptions.map((type) => [type.id, type.label]));

export function createDraftScenario(id) {
      return {
        id,
        name: "Новый сценарий",
        status: "Черновик",
        schemaVersion: "bot-flow/v1",
        owner: "Администратор",
        updatedAt: "сейчас",
        trigger: "Опишите триггер",
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
