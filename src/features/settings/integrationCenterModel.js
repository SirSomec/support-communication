export const integrationProducts = [
  {
    id: "telegram",
    type: "telegram",
    name: "Telegram",
    description: "Собирайте обращения из Telegram в общей очереди операторов.",
    requirement: "Понадобится токен бота из @BotFather.",
    credential: {
      label: "Токен бота",
      hint: "Откройте @BotFather в Telegram, выберите бота и скопируйте токен.",
      placeholder: "123456:ABC…"
    },
    kind: "channel"
  },
  {
    id: "max",
    type: "max",
    name: "MAX",
    description: "Принимайте обращения из MAX и отвечайте из единого рабочего окна.",
    requirement: "Понадобится токен бота или бизнес-аккаунта MAX.",
    credential: {
      label: "Токен доступа",
      hint: "Создайте токен в настройках бота или бизнес-аккаунта MAX.",
      placeholder: "Вставьте токен"
    },
    kind: "channel"
  },
  {
    id: "vk",
    type: "vk",
    name: "VK",
    description: "Не пропускайте сообщения сообщества ВКонтакте и распределяйте их команде.",
    requirement: "Понадобится ключ доступа сообщества VK.",
    credential: {
      label: "Ключ доступа сообщества",
      hint: "В сообществе VK откройте «Управление» → «Работа с API» и создайте ключ.",
      placeholder: "Вставьте ключ доступа"
    },
    kind: "channel"
  },
  {
    id: "external-app",
    name: "Внешнее приложение",
    description: "Подключите чат сайта или мобильного приложения через готовый API-маршрут.",
    requirement: "Понадобится адрес вашего сервера для ответов операторов (необязательно).",
    kind: "external"
  },
  {
    id: "sdk",
    name: "Виджет и SDK",
    description: "Добавьте чат на сайт или в приложение с готовым кодом и проверкой событий.",
    requirement: "Понадобится доступ к коду сайта или приложения.",
    kind: "technical",
    technicalWorkspace: "sdk"
  },
  {
    id: "api",
    name: "API и webhooks",
    description: "Свяжите поддержку с CRM или внутренними сервисами через API и события.",
    requirement: "Понадобится технический специалист с доступом к вашей системе.",
    kind: "technical",
    technicalWorkspace: "api"
  }
];

export function getIntegrationProduct(productId) {
  return integrationProducts.find((product) => product.id === productId) ?? null;
}

export function buildChannelConnectionPayload(product, form) {
  const name = String(form.name ?? "").trim();
  const token = String(form.token ?? "").trim();
  const credentials = token ? { token } : undefined;

  if (product?.type === "vk") {
    return {
      chatLimit: 8,
      credentials: {
        ...(token ? { token } : {}),
        ...(String(form.groupId ?? "").trim() ? { groupId: String(form.groupId).trim() } : {})
      },
      environment: "production",
      name,
      routingQueueId: String(form.routingQueueId ?? "").trim(),
      type: product.type
    };
  }

  return {
    chatLimit: 8,
    ...(credentials ? { credentials } : {}),
    environment: "production",
    name,
    routingQueueId: String(form.routingQueueId ?? "").trim(),
    type: product?.type
  };
}

export function validateIntegrationSetup(product, form) {
  if (!String(form.name ?? "").trim()) {
    return "Дайте подключению понятное название — его увидят операторы.";
  }

  if (product?.credential && !String(form.token ?? "").trim()) {
    return `Заполните поле «${product.credential.label}».`;
  }

  return "";
}

export function formatConnectionStatus(status) {
  return status === "active" ? "Работает" : status === "paused" ? "На паузе" : "Отключено";
}
