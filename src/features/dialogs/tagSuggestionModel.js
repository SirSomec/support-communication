import { isRepeatAppeal, REPEAT_APPEAL_TAG } from "../../app/dialogModel.js";
import { threadAppeals } from "./clientThreadModel.js";

const APPEAL_ANCHOR_TAG_PREFIX = "appeal-anchor:";

export const TAG_MIN_LENGTH = 2;
export const TAG_MAX_LENGTH = 32;
export const TAG_LIMIT_PER_DIALOG = 20;

// Служебные метки (повторное обращение, якорь треда) ставит система:
// оператор их не видит в панели и не может добавить или удалить руками.
export function isServiceTag(tag) {
  const value = String(tag ?? "");
  return value === REPEAT_APPEAL_TAG || value.startsWith(APPEAL_ANCHOR_TAG_PREFIX);
}

export function getVisibleTags(conversation) {
  const tags = Array.isArray(conversation?.tags) ? conversation.tags : [];
  const seen = new Set();
  const visible = [];

  for (const tag of tags) {
    const value = String(tag);
    const key = value.toLowerCase();
    if (isServiceTag(value) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    visible.push(value);
  }

  return visible;
}

export function normalizeTagInput(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function validateTagInput(value, currentTags = []) {
  const tag = normalizeTagInput(value);
  const known = new Set(currentTags.map((item) => normalizeTagInput(item)));

  if (tag.length < TAG_MIN_LENGTH) {
    return { ok: false, error: `Тег должен быть не короче ${TAG_MIN_LENGTH} символов.` };
  }
  if (tag.length > TAG_MAX_LENGTH) {
    return { ok: false, error: `Тег должен быть не длиннее ${TAG_MAX_LENGTH} символов.` };
  }
  if (isServiceTag(tag)) {
    return { ok: false, error: "Служебные метки добавляются системой автоматически." };
  }
  if (known.has(tag)) {
    return { ok: false, error: "Такой тег уже добавлен." };
  }
  if (currentTags.length >= TAG_LIMIT_PER_DIALOG) {
    return { ok: false, error: `Не больше ${TAG_LIMIT_PER_DIALOG} тегов на диалог.` };
  }

  return { ok: true, tag };
}

// Ключевые слова тематики и сообщений клиента; RU + EN, потому что
// исторические диалоги и сид-данные содержат англоязычные тексты.
const CONTENT_TAG_RULES = [
  { tag: "доставка", hint: "Речь идет о доставке", pattern: /достав|курьер|посылк|delivery|shipping|order status/ },
  { tag: "возврат", hint: "Клиент говорит о возврате", pattern: /возврат|верните|верну[тл]|refund|return/ },
  { tag: "оплата", hint: "Вопрос об оплате или списании", pattern: /оплат|плат[её]ж|списан|списал|карт[аеуы]|payment|charge/ },
  { tag: "авторизация", hint: "Проблема со входом или кодом", pattern: /авториз|логин|парол|не могу войти|код подтверждения|confirmation code|authorization|login/ },
  { tag: "жалоба", hint: "Похоже на жалобу", pattern: /жалоб|недоволь|возмущ|ужасн|безобраз|complaint/ },
  { tag: "технический сбой", hint: "Клиент сообщает об ошибке", pattern: /не работает|ошибк|сбо[йяе]|завис|вылета|error|bug|crash/ },
  { tag: "промокод", hint: "Речь о промокоде или скидке", pattern: /промокод|скидк|promo|discount/ },
  { tag: "адрес", hint: "Изменение адреса", pattern: /адрес|address/ },
  { tag: "товар", hint: "Вопрос по товару", pattern: /товар|product/ },
  { tag: "отмена", hint: "Отмена заказа", pattern: /отмен|cancel/ }
];

// Предложения «по ситуации»: сигналы самого диалога (повтор, rescue, SLA,
// передача от бота), тематика и текст сообщений клиента, каналы треда и
// теги, которые команда уже использует в других диалогах.
export function buildTagSuggestions({ conversation, topic = "", conversations = [], limit = 8 } = {}) {
  if (!conversation) {
    return [];
  }

  const excluded = new Set((Array.isArray(conversation.tags) ? conversation.tags : []).map((tag) => normalizeTagInput(tag)));
  const suggestions = [];
  const push = (tag, hint, source) => {
    const normalized = normalizeTagInput(tag);
    if (!normalized || normalized.length > TAG_MAX_LENGTH || excluded.has(normalized) || isServiceTag(normalized)) {
      return;
    }
    excluded.add(normalized);
    suggestions.push({ tag: normalized, hint, source });
  };

  if (isRepeatAppeal(conversation)) {
    push("повторное обращение", "Клиент вернулся по той же теме в течение 24 часов", "situation");
  }
  if (conversation.rescue?.state === "active") {
    push("спасение", "Для диалога запущен rescue-таймер", "situation");
  }
  if (conversation.slaTone === "warn" || conversation.slaTone === "danger") {
    push("важно", "SLA под угрозой", "situation");
  }
  if (conversation.botHandoff) {
    push("передано ботом", "Диалог передан оператору из бот-сценария", "situation");
  }
  if (conversation.status === "reopened") {
    push("переоткрыт", "Диалог был переоткрыт после закрытия", "situation");
  }

  const appeals = threadAppeals(conversation);
  const haystack = buildContentHaystack(conversation, topic, appeals);
  for (const rule of CONTENT_TAG_RULES) {
    if (rule.pattern.test(haystack)) {
      push(rule.tag, rule.hint, "content");
    }
  }

  const channels = Array.isArray(conversation.channels) && conversation.channels.length
    ? conversation.channels
    : [conversation.channel];
  for (const channel of channels) {
    const value = String(channel ?? "").trim();
    if (value) {
      push(value, "Канал обращения", "channel");
    }
  }

  for (const { tag, count } of collectPopularTags(conversations, appeals)) {
    push(tag, `Часто используется (диалогов: ${count})`, "popular");
  }

  return suggestions.slice(0, Math.max(0, limit));
}

function buildContentHaystack(conversation, topic, appeals) {
  const parts = [topic, conversation.topic, conversation.preview];

  for (const appeal of appeals) {
    parts.push(appeal.topic);
    for (const message of Array.isArray(appeal.messages) ? appeal.messages : []) {
      if (message?.side === "client") {
        parts.push(message.text);
      }
    }
  }

  return parts.map((part) => String(part ?? "").toLowerCase()).join(" \n ");
}

function collectPopularTags(conversations, appeals) {
  const ownIds = new Set(appeals.map((appeal) => appeal.id));
  const counts = new Map();

  for (const item of Array.isArray(conversations) ? conversations : []) {
    if (!item || ownIds.has(item.id)) {
      continue;
    }
    for (const tag of getVisibleTags(item)) {
      const normalized = normalizeTagInput(tag);
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ru"))
    .map(([tag, count]) => ({ tag, count }));
}
