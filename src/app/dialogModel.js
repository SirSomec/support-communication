export const queueFilterDefaults = {
  channel: "all",
  topic: "all",
  status: "all",
  sort: "time",
  onlyInternal: false
};

export const conversationStatusMeta = {
  new: { label: "Новое", tone: "info", sla: "Новое" },
  queued: { label: "В очереди", tone: "hold", sla: "Ожидает" },
  assigned: { label: "Назначено", tone: "ok", sla: "Назначено" },
  active: { label: "В работе", tone: "ok", sla: "В работе" },
  waiting_client: { label: "Ожидает клиента", tone: "hold", sla: "Ожидает клиента" },
  waiting_operator: { label: "Ожидает оператора", tone: "hold", sla: "Ожидает оператора" },
  transferred: { label: "Передано", tone: "warn", sla: "Передано" },
  paused: { label: "На паузе", tone: "hold", sla: "SLA пауза" },
  closed: { label: "Закрыто", tone: "closed", sla: "Закрыт" },
  reopened: { label: "Переоткрыто", tone: "warn", sla: "Переоткрыто" }
};

export const statusLabels = Object.fromEntries(
  Object.entries(conversationStatusMeta).map(([status, meta]) => [status, meta.label])
);

export const slaSortRank = {
  danger: 0,
  warn: 1,
  hold: 2,
  ok: 3,
  closed: 4
};

export const queueWaitingStatuses = ["queued", "waiting_client", "waiting_operator"];
export const queueSlaTones = ["warn", "danger"];

export const aiActionLabels = {
  accept: "принята",
  edit: "открыта на редактирование",
  reject: "отклонена"
};

export const aiSuggestionStatusLabels = {
  idle: "Новая",
  accepted: "Принята",
  editing: "Редактируется",
  rejected: "Отклонена"
};

export const dialogActionConfigs = [
  {
    title: "Передать старшему",
    description: "Старший сотрудник увидит диалог в панели",
    nextStatus: "transferred"
  },
  {
    title: "Вернуть в очередь",
    description: "Диалог станет доступен свободным операторам",
    nextStatus: "queued"
  },
  {
    id: "rescue",
    title: "Запустить спасение",
    description: "Сработает таймер и приоритет в очереди",
    nextStatus: "assigned"
  },
  {
    title: "Поставить паузу SLA",
    description: "Причина попадет в audit trail",
    nextStatus: "paused"
  }
];

export const attachmentStatusLabels = {
  ready: "Готово",
  uploading: "Загрузка",
  error: "Ошибка"
};

export const rescueDurationSeconds = 4 * 60;

const maxAttachmentSizeBytes = 20 * 1024 * 1024;
const allowedAttachmentExtensions = ["pdf", "png", "jpg", "jpeg", "webp"];
const imageAttachmentExtensions = ["png", "jpg", "jpeg", "webp"];

export function createAuditEvent({
  actor = "Иван П.",
  detail,
  eventKind = "status",
  fromStatus,
  text,
  time = "сейчас",
  toStatus
}) {
  return {
    id: Date.now(),
    type: "event",
    actor,
    detail,
    eventKind,
    fromStatus,
    text: text ?? detail,
    time,
    toStatus
  };
}

function getFileExtension(fileName) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) : "";
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export function formatRescueTimer(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function getRescueRemainingSeconds(rescue, now) {
  if (!rescue?.deadlineAt) {
    return rescue?.remainingSeconds ?? 0;
  }

  return Math.max(0, Math.ceil((rescue.deadlineAt - now) / 1000));
}

export function createComposerAttachment(file, index, channel) {
  const extension = getFileExtension(file.name);
  const errors = [];

  if (!allowedAttachmentExtensions.includes(extension)) {
    errors.push("Недоступный тип файла: PDF, PNG, JPG или WEBP");
  }

  if (file.size > maxAttachmentSizeBytes) {
    errors.push("Файл больше 20 МБ");
  }

  const isImage = imageAttachmentExtensions.includes(extension) && !errors.length;

  return {
    id: `${file.name}-${file.lastModified}-${index}-${Date.now()}`,
    name: file.name,
    type: extension ? extension.toUpperCase() : "FILE",
    size: formatFileSize(file.size),
    status: errors.length ? "error" : "uploading",
    progress: errors.length ? 100 : 64,
    preview: isImage ? "Превью изображения" : "Файл",
    previewUrl: isImage ? URL.createObjectURL(file) : "",
    channel,
    retryable: false,
    error: errors.join(". ")
  };
}

export function releaseAttachmentPreviews(attachments) {
  attachments.forEach((attachment) => {
    if (attachment.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  });
}

export function getConversationTimeValue(time) {
  if (time === "сейчас") {
    return 24 * 60;
  }

  const [hours, minutes] = String(time).split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
}

export function maskPhone(phone) {
  return phone.replace(/(\+7)\s(\d{3})\s(\d{3})-(\d{2})-(\d{2})/, "$1 *** ***-**-$5");
}

export function getStatusMeta(status) {
  return conversationStatusMeta[status] ?? conversationStatusMeta.active;
}

export function getAiSuggestionDraft(suggestion) {
  if (suggestion.type === "article") {
    return `Рекомендуемая статья: ${suggestion.text}`;
  }

  return suggestion.text;
}

export function getAiSuggestionMode(suggestion) {
  return suggestion.type === "summary" ? "internal" : "reply";
}
