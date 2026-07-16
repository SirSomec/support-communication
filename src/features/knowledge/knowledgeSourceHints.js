// Подсказки «видит ли бот источник и почему нет» для строк раздела «Знания».
// Зеркалит серверный isKnowledgeSourceRetrievalEligible: retrieval пускает
// источник только при status=ready + readiness=ready + approvalStatus=approved,
// а сам источник должен быть привязан к опубликованному включённому сценарию.

export function isSourceBotEligible(source) {
  return source?.status === "ready" && source?.readiness === "ready" && source?.approvalStatus === "approved";
}

export function isActiveBotScenario(usageItem) {
  return usageItem?.status === "published" && usageItem?.enabled !== false;
}

export function buildSourceBotHints(source, scenarioUsage = []) {
  if (!source || source.status === "archived") {
    return [];
  }

  const hints = [];
  if (isSourceBotEligible(source)) {
    hints.push({
      id: "eligible",
      label: "отвечает клиентам",
      title: "Источник одобрен и участвует в ответах бота.",
      tone: "ok"
    });
  } else if (source.status === "ready" && source.approvalStatus === "pending") {
    hints.push({
      id: "approval-pending",
      label: "ждёт одобрения",
      title: "Бот не использует источник, пока вы не одобрите его содержимое.",
      tone: "warn"
    });
  } else if (source.status === "disabled") {
    hints.push({
      id: "source-disabled",
      label: "бот не использует: источник отключён",
      title: "Включите источник, чтобы бот снова отвечал по нему.",
      tone: "hold"
    });
  } else {
    hints.push({
      id: "not-ready",
      label: "бот не использует: не готов",
      title: "Источник ещё не готов к ответам: дождитесь индексации или обновите содержимое, затем одобрите его.",
      tone: "warn"
    });
  }

  const bound = (Array.isArray(scenarioUsage) ? scenarioUsage : []).filter((item) => item && item.status !== "archived");
  if (!bound.length) {
    hints.push({
      id: "unbound",
      label: "не привязан к ботам",
      title: "Бот не увидит источник, пока вы не добавите его в сценарий на шаге «Знания» и не опубликуете сценарий.",
      tone: "warn"
    });
  } else if (!bound.some((item) => isActiveBotScenario(item))) {
    hints.push({
      id: "bots-inactive",
      label: "боты выключены или не опубликованы",
      title: `Источник привязан к сценариям (${bound.map((item) => item.name).join(", ")}), но ни один из них сейчас не опубликован и не включён.`,
      tone: "warn"
    });
  }

  return hints;
}
