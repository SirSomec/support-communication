import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTemplateQuery, suggestTemplates } from "../src/features/dialogs/templateSuggestModel.js";

const templateLibrary = [
  { id: "t1", title: "Приветствие", text: "Здравствуйте! Меня зовут {operator_name}, чем могу помочь?" },
  { id: "t2", title: "Возврат средств", text: "Возврат оформляется в течение 10 дней после заявки." },
  { id: "t3", title: "Прощание", text: "Спасибо за обращение! Хорошего дня." },
  { id: "t4", title: "Здоровье заказа", text: "Проверяю статус вашего заказа, вернусь с ответом." }
];

function ids(suggestions) {
  return suggestions.map((template) => template.id);
}

test("пустой ввод и один символ не показывают подсказки", () => {
  assert.deepEqual(suggestTemplates(templateLibrary, ""), []);
  assert.deepEqual(suggestTemplates(templateLibrary, "   "), []);
  assert.deepEqual(suggestTemplates(templateLibrary, "з"), []);
});

test("первые символы текста шаблона предлагают его без учета регистра", () => {
  assert.deepEqual(ids(suggestTemplates(templateLibrary, "здравств")), ["t1"]);
  assert.deepEqual(ids(suggestTemplates(templateLibrary, "СПАС")), ["t3"]);
});

test("первые символы названия тоже находят шаблон", () => {
  assert.deepEqual(ids(suggestTemplates(templateLibrary, "прощ")), ["t3"]);
});

test("начало текста ранжируется выше начала названия", () => {
  assert.deepEqual(ids(suggestTemplates(templateLibrary, "зд")), ["t1", "t4"]);
});

test("полностью введенный текст шаблона не предлагается повторно", () => {
  const exact = "Здравствуйте! Меня зовут {operator_name}, чем могу помочь?";
  assert.deepEqual(suggestTemplates(templateLibrary, exact), []);
});

test("лишние пробелы и переносы строк в запросе и шаблоне схлопываются", () => {
  const library = [{ id: "m1", title: "Многострочный", text: "Здравствуйте!\nМы получили ваш запрос." }];
  assert.deepEqual(ids(suggestTemplates(library, "  здравствуйте!   мы ")), ["m1"]);
  assert.equal(normalizeTemplateQuery("  Здравствуйте!\nМы "), "здравствуйте! мы");
});

test("лимит ограничивает количество подсказок", () => {
  const library = Array.from({ length: 8 }, (_, index) => ({
    id: `s${index}`,
    title: `Шаблон ${index}`,
    text: `Здравствуйте, вариант ${index}`
  }));
  assert.equal(suggestTemplates(library, "здравствуйте").length, 5);
  assert.deepEqual(ids(suggestTemplates(library, "здравствуйте", 2)), ["s0", "s1"]);
});

test("битые элементы библиотеки не ломают подбор", () => {
  const library = [null, { id: "x1", title: "Без текста" }, ...templateLibrary];
  assert.deepEqual(ids(suggestTemplates(library, "здравств")), ["t1"]);
  assert.deepEqual(suggestTemplates(undefined, "здравств"), []);
});
