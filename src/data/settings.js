export const roles = [
  { name: "Сотрудник", panel: false, settings: false, reset: false, reports: "Личные" },
  { name: "Старший сотрудник", panel: true, settings: false, reset: true, reports: "Команда" },
  { name: "Администратор", panel: true, settings: true, reset: true, reports: "Все" }
];

export const channelSettings = [
  { name: "SDK", enabled: true, staff: 18, limit: 12 },
  { name: "Telegram", enabled: true, staff: 14, limit: 8 },
  { name: "MAX", enabled: true, staff: 9, limit: 8 },
  { name: "VK", enabled: true, staff: 11, limit: 8 }
];

export const integrationCards = [
  { name: "SDK Web / Mobile", channel: "SDK", status: "Активен", detail: "2 приложения, 14 680 сессий сегодня", health: 98 },
  { name: "Telegram Bot", channel: "Telegram", status: "Активен", detail: "Webhook 200 OK, 28% новых обращений", health: 94 },
  { name: "MAX Business", channel: "MAX", status: "Тестовый контур", detail: "9 операторов, лимит 8 чатов", health: 82 },
  { name: "VK Сообщества", channel: "VK", status: "Требует внимания", detail: "SLA 68%, очередь перегружена", health: 68 }
];

export const channelDetails = [
  {
    id: "sdk",
    name: "SDK Web / Mobile",
    channel: "SDK",
    status: "Активен",
    detail: "2 приложения, 14 680 сессий сегодня",
    health: 98,
    rawId: "chn_sdk_prod_01",
    lastSync: "Сегодня, 12:14",
    route: "Очередь SDK -> 1-я линия",
    limit: "12 чатов на оператора",
    employees: "18 сотрудников",
    groups: ["Мобильное приложение", "Web widget"],
    connections: [
      { id: "sdk-web-prod", name: "Web widget production", env: "prod", status: "OK", lastEvent: "12:13", traffic: "8 420 событий", rawId: "conn_sdk_web_prod" },
      { id: "sdk-ios-prod", name: "iOS / Android SDK", env: "prod", status: "OK", lastEvent: "12:12", traffic: "6 260 событий", rawId: "conn_sdk_mobile_prod" },
      { id: "sdk-stage", name: "Stage sandbox", env: "stage", status: "Warn", lastEvent: "11:58", traffic: "47 событий", rawId: "conn_sdk_stage" }
    ],
    logs: [
      { id: "log-sdk-421", connectionId: "sdk-ios-prod", time: "12:02", severity: "info", message: "identifyUser принят, device iOS 17", traceId: "trc_sdk_9421" },
      { id: "log-sdk-418", connectionId: "sdk-stage", time: "11:57", severity: "warn", message: "Stage sandbox: payload без phone, ответ 202", traceId: "trc_sdk_9418" },
      { id: "log-sdk-401", connectionId: "sdk-web-prod", time: "11:40", severity: "info", message: "syncTopic обновил тематику Оплата / Возврат", traceId: "trc_sdk_9401" }
    ]
  },
  {
    id: "telegram",
    name: "Telegram Bot",
    channel: "Telegram",
    status: "Активен",
    detail: "Webhook 200 OK, 28% новых обращений",
    health: 94,
    rawId: "chn_tg_support_bot",
    lastSync: "Сегодня, 12:09",
    route: "Telegram -> Очередь мессенджеров",
    limit: "8 чатов на оператора",
    employees: "14 сотрудников",
    groups: ["Telegram Bot", "VIP bot"],
    connections: [
      { id: "tg-main", name: "Support main bot", env: "prod", status: "OK", lastEvent: "12:09", traffic: "3 940 сообщений", rawId: "conn_tg_main_bot" },
      { id: "tg-vip", name: "VIP bot", env: "prod", status: "OK", lastEvent: "12:03", traffic: "620 сообщений", rawId: "conn_tg_vip_bot" }
    ],
    logs: [
      { id: "log-tg-210", connectionId: "tg-main", time: "12:04", severity: "info", message: "Webhook delivery 200 OK", traceId: "trc_tg_210" },
      { id: "log-tg-205", connectionId: "tg-main", time: "11:51", severity: "warn", message: "Повторная доставка update после timeout 2.1 сек", traceId: "trc_tg_205" },
      { id: "log-tg-199", connectionId: "tg-vip", time: "11:36", severity: "info", message: "Файл вложения принят и поставлен в scan queue", traceId: "trc_tg_199" }
    ]
  },
  {
    id: "max",
    name: "MAX Business",
    channel: "MAX",
    status: "Тестовый контур",
    detail: "9 операторов, лимит 8 чатов",
    health: 82,
    rawId: "chn_max_business_beta",
    lastSync: "Сегодня, 11:56",
    route: "MAX -> Beta queue -> Старший сотрудник",
    limit: "8 чатов на оператора",
    employees: "9 сотрудников",
    groups: ["MAX Beta", "MAX escalations"],
    connections: [
      { id: "max-beta", name: "Business beta", env: "beta", status: "Warn", lastEvent: "11:56", traffic: "1 130 сообщений", rawId: "conn_max_beta" },
      { id: "max-backup", name: "Backup webhook", env: "stage", status: "Paused", lastEvent: "10:48", traffic: "0 сообщений", rawId: "conn_max_backup" }
    ],
    logs: [
      { id: "log-max-88", connectionId: "max-beta", time: "11:56", severity: "warn", message: "Beta API вернул retry-after 30 сек", traceId: "trc_max_088" },
      { id: "log-max-79", connectionId: "max-beta", time: "11:20", severity: "info", message: "Тест приема доставлен в очередь MAX", traceId: "trc_max_079" },
      { id: "log-max-71", connectionId: "max-backup", time: "10:48", severity: "error", message: "Backup webhook отключен до подтверждения ключа", traceId: "trc_max_071" }
    ]
  },
  {
    id: "vk",
    name: "VK Сообщества",
    channel: "VK",
    status: "Требует внимания",
    detail: "SLA 68%, очередь перегружена",
    health: 68,
    rawId: "chn_vk_community_main",
    lastSync: "Сегодня, 12:01",
    route: "VK -> Rescue queue",
    limit: "8 чатов на оператора",
    employees: "11 сотрудников",
    groups: ["Основное сообщество", "Отдельный проект"],
    connections: [
      { id: "vk-main", name: "Основное сообщество", env: "prod", status: "Warn", lastEvent: "12:01", traffic: "2 480 сообщений", rawId: "conn_vk_main" },
      { id: "vk-project", name: "Проектная группа", env: "prod", status: "OK", lastEvent: "11:59", traffic: "760 сообщений", rawId: "conn_vk_project" },
      { id: "vk-test", name: "Тестовое сообщество", env: "stage", status: "OK", lastEvent: "11:35", traffic: "34 сообщения", rawId: "conn_vk_stage" }
    ],
    logs: [
      { id: "log-vk-332", connectionId: "vk-main", time: "12:01", severity: "warn", message: "Очередь перегружена, 9 чатов ждут назначения", traceId: "trc_vk_332" },
      { id: "log-vk-330", connectionId: "vk-main", time: "11:58", severity: "error", message: "Ошибка отправки вложения: файл больше лимита канала", traceId: "trc_vk_330" },
      { id: "log-vk-318", connectionId: "vk-project", time: "11:41", severity: "info", message: "Callback confirmation обновлен", traceId: "trc_vk_318" }
    ]
  }
];

export const sdkEvents = [
  ["identifyUser", "Передает телефон, устройство и ID гигера"],
  ["initConversation", "Инициирует диалог по номеру телефона"],
  ["trackEntryPoint", "Фиксирует SDK, Telegram, MAX или VK"],
  ["syncTopic", "Синхронизирует тематику и запрет закрытия"]
];

export const employeeChannelRules = [
  {
    id: "rule-ivan",
    employee: "Иван П.",
    role: "Сотрудник",
    group: "1-я линия",
    channels: ["SDK", "Telegram"],
    chatLimit: 12,
    exceptions: ["Можно принимать VIP сверх лимита с подтверждением старшего"],
    canOverride: false,
    sensitiveData: false,
    passwordStatus: "Активен",
    lastLogin: "Сегодня, 11:48"
  },
  {
    id: "rule-anna",
    employee: "Анна Р.",
    role: "Старший сотрудник",
    group: "Старшие смены",
    channels: ["MAX", "VK", "Telegram"],
    chatLimit: 10,
    exceptions: ["Может перераспределять очередь VK", "Может сбрасывать пароль сотруднику"],
    canOverride: true,
    sensitiveData: true,
    passwordStatus: "Требует смены через 9 дней",
    lastLogin: "Сегодня, 12:02"
  },
  {
    id: "rule-admin",
    employee: "Администратор",
    role: "Администратор",
    group: "Администраторы",
    channels: ["SDK", "Telegram", "MAX", "VK"],
    chatLimit: 30,
    exceptions: ["Полный доступ к настройкам каналов и аудиту"],
    canOverride: true,
    sensitiveData: true,
    passwordStatus: "MFA включена",
    lastLogin: "Сегодня, 12:16"
  }
];

export const employeeGroups = [
  { id: "line-1", name: "1-я линия", members: 18, scope: "SDK, Telegram" },
  { id: "senior-shifts", name: "Старшие смены", members: 5, scope: "Очереди, пароли, перераспределение" },
  { id: "finance", name: "Финансы", members: 4, scope: "Возвраты и платежи" },
  { id: "admins", name: "Администраторы", members: 3, scope: "Полные настройки" }
];
