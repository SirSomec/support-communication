import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillTemplateVariables, insertTemplateVariable, renderTemplatePreview } from "../src/features/templates/templateModel.js";

describe("template editor model", () => {
  it("inserts a supported variable at the current selection", () => {
    assert.deepEqual(insertTemplateVariable("Hello !", "{client_name}", 6, 6), {
      cursor: 19,
      text: "Hello {client_name}!"
    });
    assert.deepEqual(insertTemplateVariable("Ответ", "{unknown}", 0, 5), {
      cursor: 5,
      text: "Ответ"
    });
  });

  it("renders a readable preview with example values", () => {
    assert.equal(
      renderTemplatePreview("{client_name}, тикет {ticket_id}: {topic}", {
        client_name: "Мария",
        topic: "Доставка"
      }),
      "Мария, тикет SUP-1042: Доставка"
    );
  });

  it("fills supported variables with dialog data and preserves missing values", () => {
    assert.equal(
      fillTemplateVariables(
        "Здравствуйте, {client_name}! Я {operator_name}. Обращение {ticket_id}: {topic}. {client_name}, проверяю.",
        {
          client_name: "Мария",
          operator_name: "Алексей",
          ticket_id: "SUP-2048",
          topic: "Доставка"
        }
      ),
      "Здравствуйте, Мария! Я Алексей. Обращение SUP-2048: Доставка. Мария, проверяю."
    );
    assert.equal(fillTemplateVariables("Тема: {topic}", {}), "Тема: {topic}");
  });
});
