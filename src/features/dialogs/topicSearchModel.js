// Быстрый подбор тематики по первым символам ввода. Совпадение ищем без
// учета регистра по подстроке, а ранжируем так, чтобы «первые символы»
// работали ожидаемо: сначала начало полного названия «Группа / Название»,
// затем начало любого слова (обычно название внутри группы), затем
// вхождение в середину слова. Внутри ранга сохраняется порядок справочника
// (sortOrder тематик).

export function normalizeTopicQuery(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

const WORD_CHARACTER = /[0-9a-zа-яё]/i;

function isWordStart(haystack, position) {
  if (position <= 0) {
    return true;
  }
  return !WORD_CHARACTER.test(haystack[position - 1]);
}

export function findTopicMatch(option, query) {
  const normalized = normalizeTopicQuery(query);
  if (!normalized) {
    return null;
  }
  const position = String(option ?? "").toLowerCase().indexOf(normalized);
  if (position === -1) {
    return null;
  }
  return { start: position, length: normalized.length };
}

export function filterTopicOptions(options, query) {
  const list = (Array.isArray(options) ? options : [])
    .filter((option) => typeof option === "string" && option.trim().length > 0);
  const normalized = normalizeTopicQuery(query);

  if (!normalized) {
    return list;
  }

  const ranked = [];
  for (let index = 0; index < list.length; index += 1) {
    const option = list[index];
    const haystack = option.toLowerCase();
    const position = haystack.indexOf(normalized);
    if (position === -1) {
      continue;
    }
    const rank = position === 0 ? 0 : isWordStart(haystack, position) ? 1 : 2;
    ranked.push({ index, option, position, rank });
  }

  return ranked
    .sort((left, right) => left.rank - right.rank || left.position - right.position || left.index - right.index)
    .map((entry) => entry.option);
}
