export const TEMPLATE_VARIABLES = ["{client_name}", "{operator_name}", "{ticket_id}", "{topic}"];

export function insertTemplateVariable(text, variable, selectionStart, selectionEnd) {
  const source = String(text ?? "");
  const token = TEMPLATE_VARIABLES.includes(variable) ? variable : "";
  if (!token) {
    return { cursor: source.length, text: source };
  }
  const start = clampSelection(selectionStart, source.length);
  const end = Math.max(start, clampSelection(selectionEnd, source.length));
  const next = `${source.slice(0, start)}${token}${source.slice(end)}`;
  return {
    cursor: start + token.length,
    text: next
  };
}

export function renderTemplatePreview(text, values = {}) {
  const replacements = {
    client_name: "Анна",
    operator_name: "Алексей",
    ticket_id: "SUP-1042",
    topic: "Общий вопрос",
    ...values
  };

  return fillTemplateVariables(text, replacements);
}

export function fillTemplateVariables(text, values = {}) {
  return TEMPLATE_VARIABLES.reduce((result, variable) => {
    const key = variable.slice(1, -1);
    const replacement = values[key];
    return replacement === undefined || replacement === null
      ? result
      : result.replaceAll(variable, String(replacement));
  }, String(text ?? ""));
}

function clampSelection(value, length) {
  const normalized = Number.isInteger(value) ? value : length;
  return Math.min(Math.max(normalized, 0), length);
}
