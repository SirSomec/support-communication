export const notificationItems = [
  {
    id: "sla-vladimir",
    type: "SLA",
    typeKey: "sla",
    title: "Владимир Б. без тематики",
    detail: "Закрытие заблокировано, SLA просрочен",
    meta: "Telegram · очередь спасения",
    action: "Открыть диалог",
    tone: "danger",
    history: "11:36 · SLA alert доставлен старшему сотруднику"
  },
  {
    id: "mention-anna",
    type: "Mention",
    typeKey: "mention",
    title: "Анна Р. упомянула вас",
    detail: "Нужна проверка возврата до закрытия",
    meta: "MAX · старший сотрудник",
    action: "Посмотреть",
    tone: "warn",
    history: "11:34 · mention из внутреннего комментария"
  },
  {
    id: "channel-vk",
    type: "Channel",
    typeKey: "channel",
    title: "VK: рост ошибок webhook",
    detail: "3 ошибки доставки за последние 15 минут",
    meta: "Интеграции · требует администратора",
    action: "Открыть канал",
    tone: "info",
    history: "11:31 · webhook retry превысил порог"
  },
  {
    id: "export-ready",
    type: "Export",
    typeKey: "export",
    title: "Ежедневный отчет готов",
    detail: "XLSX, 486 строк, audit export-2418",
    meta: "Отчеты · сегодня 11:30",
    action: "Скачать",
    tone: "ok",
    history: "11:30 · export queue завершила задачу"
  }
];

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
