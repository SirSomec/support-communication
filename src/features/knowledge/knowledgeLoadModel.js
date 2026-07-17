const LOAD_LABELS = {
  articlesResponse: "статьи",
  feedbackResponse: "обратную связь",
  mcpResponse: "MCP-подключения",
  sourcesResponse: "источники",
  unansweredResponse: "вопросы без ответа"
};

export function collectKnowledgeLoadErrors(responses = {}) {
  const errors = [];
  for (const [key, label] of Object.entries(LOAD_LABELS)) {
    const response = responses[key];
    if (response?.status === "ok") continue;
    errors.push(response?.error?.message ?? `Не удалось загрузить ${label}.`);
  }
  return errors;
}
