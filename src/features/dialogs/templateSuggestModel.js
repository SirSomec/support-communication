// Автоподсказка шаблонов в композере: оператор начинает печатать ответ, и по
// первым введенным символам предлагаются шаблоны для предзаполнения окна ввода.
// Совпадение ищем без учета регистра по началу текста шаблона (оператор печатает
// сам ответ) и по началу названия (оператор помнит шаблон по имени); текстовые
// совпадения ранжируются выше, внутри ранга сохраняется порядок библиотеки.
// Шаблон, чей текст уже полностью введен, не предлагается повторно: после
// подстановки Enter должен отправлять сообщение, а не подставлять снова.

export const TEMPLATE_SUGGEST_MIN_QUERY = 2;
export const TEMPLATE_SUGGEST_LIMIT = 5;

export function normalizeTemplateQuery(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function suggestTemplates(templates, draft, limit = TEMPLATE_SUGGEST_LIMIT) {
  const query = normalizeTemplateQuery(draft);
  if (query.length < TEMPLATE_SUGGEST_MIN_QUERY) {
    return [];
  }

  const ranked = [];
  const list = Array.isArray(templates) ? templates : [];
  for (let index = 0; index < list.length; index += 1) {
    const template = list[index];
    const text = normalizeTemplateQuery(template?.text);
    if (!text || text === query) {
      continue;
    }
    const title = normalizeTemplateQuery(template?.title);
    const rank = text.startsWith(query) ? 0 : title && title.startsWith(query) ? 1 : -1;
    if (rank === -1) {
      continue;
    }
    ranked.push({ index, rank, template });
  }

  return ranked
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.template);
}
