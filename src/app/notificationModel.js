export const notificationFilterOptions = [
  { id: "all", label: "Все" },
  { id: "unread", label: "Новые" },
  { id: "sla", label: "SLA" },
  { id: "mention", label: "Mention" },
  { id: "channel", label: "Channel" },
  { id: "export", label: "Export" }
];

export const notificationSubscriptionOptions = [
  { id: "sla", label: "SLA alerts", description: "Просрочки, rescue, закрытие без тематики" },
  { id: "mention", label: "Mentions", description: "Упоминания во внутренних комментариях" },
  { id: "channel", label: "Channel errors", description: "Webhook, delivery, token и health events" },
  { id: "export", label: "Exports", description: "Готовность, ошибки и истечение файлов" }
];

export const notificationSoundRules = [
  { id: "sound-sla", typeKey: "sla", label: "SLA и rescue", description: "Короткий сигнал для просрочек и спасения" },
  { id: "sound-channel", typeKey: "channel", label: "Ошибки каналов", description: "Отдельный тон для webhook/token ошибок" },
  { id: "sound-mention", typeKey: "mention", label: "Упоминания", description: "Мягкий сигнал без перебивания ввода" }
];

export const externalCriticalChannels = [
  { id: "admin-telegram", label: "Admin Telegram", detail: "Критичные webhook/security события" },
  { id: "email-digest", label: "Email digest", detail: "Сводка ошибок за 15 минут" },
  { id: "incident-webhook", label: "Incident webhook", detail: "POST в внешний мониторинг" }
];

export function mapNotificationItems(items = []) {
  return items.map((item) => ({
    action: item.action,
    actionTarget: normalizeNotificationActionTarget(item.actionTarget),
    category: item.category,
    detail: item.detail,
    history: item.history,
    id: item.id,
    meta: item.meta,
    readAt: item.readAt ?? null,
    title: item.title,
    tone: item.tone,
    type: item.type,
    typeKey: item.typeKey
  }));
}

function normalizeNotificationActionTarget(actionTarget) {
  if (!actionTarget || typeof actionTarget !== "object" || Array.isArray(actionTarget)) {
    return null;
  }

  if (actionTarget.kind === "download") {
    const jobId = String(actionTarget.jobId ?? "").trim();
    const service = String(actionTarget.service ?? "").trim();
    if (!jobId || service !== "reports") {
      return null;
    }

    return {
      fileName: String(actionTarget.fileName ?? "").trim() || undefined,
      format: String(actionTarget.format ?? "").trim() || undefined,
      jobId,
      kind: "download",
      service: "reports"
    };
  }

  if (actionTarget.kind === "navigate") {
    const section = String(actionTarget.section ?? "").trim();
    if (!section) {
      return null;
    }

    return {
      kind: "navigate",
      resourceId: String(actionTarget.resourceId ?? "").trim() || undefined,
      section
    };
  }

  return null;
}

export function filterNotifications(items, filter, readIds, mutedTypes) {
  return items.filter((item) => {
    if (mutedTypes.includes(item.typeKey)) {
      return false;
    }

    if (filter === "unread") {
      return !readIds.includes(item.id);
    }

    if (filter === "all") {
      return true;
    }

    return item.typeKey === filter;
  });
}

export function getNotificationGroupSummary(items, readIds, mutedTypes) {
  return notificationSubscriptionOptions.map((option) => {
    const groupItems = items.filter((item) => item.typeKey === option.id);
    const unread = groupItems.filter((item) => !readIds.includes(item.id)).length;

    return {
      ...option,
      count: groupItems.length,
      unread,
      muted: mutedTypes.includes(option.id)
    };
  });
}

export function collectReadNotificationIds(items = []) {
  return items.filter((item) => item.readAt).map((item) => item.id);
}
