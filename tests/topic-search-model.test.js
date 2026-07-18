import assert from "node:assert/strict";
import test from "node:test";
import { filterTopicOptions, findTopicMatch, normalizeTopicQuery } from "../src/features/dialogs/topicSearchModel.js";

const directoryOptions = [
  "Доставка / Статус заказа",
  "Доставка / Адрес доставки",
  "Доставка / Связь с курьером",
  "Оплата / Возврат",
  "Авторизация / Код",
  "Авторизация / Проверка личности",
  "Товар / Несоответствие"
];

test("пустой запрос возвращает весь справочник в исходном порядке", () => {
  assert.deepEqual(filterTopicOptions(directoryOptions, ""), directoryOptions);
  assert.deepEqual(filterTopicOptions(directoryOptions, "   "), directoryOptions);
});

test("первые символы группы фильтруют без учета регистра", () => {
  assert.deepEqual(filterTopicOptions(directoryOptions, "ДОСТ"), [
    "Доставка / Статус заказа",
    "Доставка / Адрес доставки",
    "Доставка / Связь с курьером"
  ]);
});

test("первые символы названия тематики находят ее по началу слова", () => {
  assert.deepEqual(filterTopicOptions(directoryOptions, "несоотв"), ["Товар / Несоответствие"]);
  assert.deepEqual(filterTopicOptions(directoryOptions, "адрес"), ["Доставка / Адрес доставки"]);
});

test("начало полного названия ранжируется выше начала слова и середины", () => {
  const options = ["Невозврат", "Оплата / Возврат", "Возврат товара"];
  assert.deepEqual(filterTopicOptions(options, "возврат"), [
    "Возврат товара",
    "Оплата / Возврат",
    "Невозврат"
  ]);
});

test("совпадение в середине слова тоже находится", () => {
  assert.deepEqual(filterTopicOptions(directoryOptions, "ставк"), [
    "Доставка / Статус заказа",
    "Доставка / Адрес доставки",
    "Доставка / Связь с курьером"
  ]);
});

test("лишние пробелы в запросе схлопываются", () => {
  assert.deepEqual(filterTopicOptions(directoryOptions, "  товар   /  "), ["Товар / Несоответствие"]);
  assert.equal(normalizeTopicQuery("  Товар   /  Несоответствие "), "товар / несоответствие");
});

test("нестроковые и пустые опции отбрасываются без ошибок", () => {
  assert.deepEqual(filterTopicOptions([null, "", "Оплата / Возврат", 42, "   "], "опл"), ["Оплата / Возврат"]);
  assert.deepEqual(filterTopicOptions(undefined, "опл"), []);
});

test("findTopicMatch возвращает фрагмент для подсветки", () => {
  assert.deepEqual(findTopicMatch("Товар / Несоответствие", "несоотв"), { start: 8, length: 7 });
  assert.equal(findTopicMatch("Товар / Несоответствие", "оплата"), null);
  assert.equal(findTopicMatch("Товар / Несоответствие", ""), null);
});
