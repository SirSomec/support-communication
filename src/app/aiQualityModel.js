const empathyPattern = /понимаю|извин|сожале|помогу|проверю/i;
const resolutionPattern = /проверю|подскажу|вернусь|передам|оформ|свяж/i;
const riskyPattern = /не могу|невозможно|самостоятельно|проблема клиента|виноват|ваша проблема|это не к нам/i;

export function getAiSuggestionExplanation(suggestion) {
  const reasons = [
    `Совпадает с тематикой: ${suggestion.suggestedTopic}`,
    `Тон: ${suggestion.tone}`,
    `Риск: ${suggestion.risk}`
  ];

  if (suggestion.type === "summary") {
    reasons.push("Подходит для внутреннего комментария перед передачей старшему");
  }

  if (suggestion.type === "article") {
    reasons.push("Можно прикрепить как self-service ссылку без автоотправки");
  }

  return reasons;
}

export function getPreSendQualityChecks({ draft, mode, attachments, suggestions }) {
  const text = draft.trim();
  const isInternal = mode === "internal";
  const hasAttachments = attachments.some((attachment) => attachment.status === "ready");
  const hasBlockingAttachment = attachments.some((attachment) => attachment.status !== "ready");

  if (!text && !hasAttachments) {
    return [
      {
        id: "empty",
        label: isInternal ? "Комментарий пустой" : "Ответ пустой",
        detail: "Добавьте текст или готовое вложение перед отправкой.",
        tone: "danger"
      }
    ];
  }

  const checks = [];

  if (!isInternal && text.length < 24) {
    checks.push({
      id: "short",
      label: "Ответ короткий",
      detail: "Для клиентского ответа лучше добавить следующий шаг или срок.",
      tone: "warn"
    });
  }

  if (!isInternal && text && !empathyPattern.test(text)) {
    checks.push({
      id: "empathy",
      label: "Нет эмпатии",
      detail: "Добавьте нейтральное признание проблемы или обещание проверки.",
      tone: "warn"
    });
  }

  if (!isInternal && text && !resolutionPattern.test(text)) {
    checks.push({
      id: "resolution",
      label: "Не указан следующий шаг",
      detail: "Ответ должен объяснять, что оператор сделает дальше.",
      tone: "warn"
    });
  }

  if (riskyPattern.test(text)) {
    checks.push({
      id: "risk",
      label: "Риск формулировки",
      detail: "Проверьте тон: текст может звучать как отказ без альтернативы.",
      tone: "danger"
    });
  }

  if (hasBlockingAttachment) {
    checks.push({
      id: "attachment",
      label: "Вложение не готово",
      detail: "Загрузка или ошибка вложения уже блокирует отправку.",
      tone: "danger"
    });
  }

  if (!checks.length) {
    checks.push({
      id: "ready",
      label: isInternal ? "Комментарий готов" : "Ответ готов",
      detail: suggestions.length ? "AI-подсказки сверены, критичных рисков нет." : "Критичных рисков перед отправкой нет.",
      tone: "ok"
    });
  }

  return checks;
}
