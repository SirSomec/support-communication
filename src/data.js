import {
  BarChart3,
  Bot,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  Settings,
  ShieldCheck,
  Zap,
  UsersRound
} from "lucide-react";

export const conversations = [
  {
    id: "maria",
    name: "Мария К.",
    initials: "МК",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=128&q=80",
    channel: "SDK",
    phone: "+7 999 204-18-44",
    time: "11:24",
    preview: "Где мой заказ? Он должен был приехать вчера.",
    status: "active",
    sla: "02:15",
    slaTone: "ok",
    topic: "Доставка / Статус заказа",
    unread: true,
    device: "Android",
    entry: "SDK",
    language: "Русский",
    clientSince: "12 мая 2024",
    tags: ["доставка", "статус заказа", "важный клиент"],
    previous: [
      ["05.05.2024", "Возврат товара", "Закрыт"],
      ["22.04.2024", "Вопрос по оплате", "Закрыт"],
      ["10.04.2024", "Изменение заказа", "Закрыт"]
    ],
    messages: [
      { id: 1, side: "client", text: "Где мой заказ? Он должен был приехать вчера.", time: "11:24" },
      { id: 2, type: "event", text: "Назначен оператором Иван П.", time: "11:24" },
      { id: 3, side: "agent", text: "Здравствуйте, Мария! Сейчас проверю информацию по вашему заказу.", time: "11:25" },
      {
        id: 4,
        type: "internal",
        text: "Проверить статус в ЛК и связаться с курьерской службой.",
        author: "Иван П.",
        time: "11:25"
      },
      { id: 5, side: "client", text: "Хорошо, спасибо!", time: "11:25" },
      {
        id: 6,
        side: "agent",
        text: "Ваш заказ №12345 передан курьеру, он будет доставлен сегодня до 18:00. Приношу извинения за задержку.",
        time: "11:26"
      },
      { id: 7, side: "client", text: "Спасибо, буду ждать.", time: "11:27" }
    ]
  },
  {
    id: "dmitry",
    name: "Дмитрий С.",
    initials: "ДС",
    channel: "Telegram",
    phone: "+7 916 481-77-02",
    time: "11:20",
    preview: "Можно ли изменить адрес доставки?",
    status: "waiting_operator",
    sla: "01:45",
    slaTone: "ok",
    topic: "Доставка / Адрес",
    device: "iOS",
    entry: "Telegram",
    language: "Русский",
    clientSince: "03 июня 2024",
    tags: ["доставка", "изменение адреса"],
    previous: [["11.05.2024", "Промокод", "Закрыт"]],
    messages: [
      { id: 1, side: "client", text: "Можно ли изменить адрес доставки?", time: "11:20" },
      { id: 2, side: "agent", text: "Да, напишите новый адрес. Я проверю, можно ли изменить маршрут.", time: "11:21" }
    ]
  },
  {
    id: "irina",
    name: "Ирина П.",
    initials: "ИП",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=128&q=80",
    channel: "MAX",
    phone: "+7 925 111-02-19",
    time: "11:18",
    preview: "Спасибо, вопрос решен!",
    status: "closed",
    sla: "Закрыт",
    slaTone: "closed",
    topic: "Оплата / Возврат",
    device: "Android",
    entry: "MAX",
    language: "Русский",
    clientSince: "24 января 2024",
    tags: ["оплата", "возврат"],
    previous: [],
    messages: [
      { id: 1, side: "client", text: "Спасибо, вопрос решен!", time: "11:18" },
      { id: 2, type: "event", text: "Диалог закрыт с тематикой Оплата / Возврат", time: "11:19" }
    ]
  },
  {
    id: "alexey",
    name: "Алексей Т.",
    initials: "АТ",
    channel: "VK",
    phone: "+7 903 773-11-05",
    time: "11:10",
    preview: "Не приходит код подтверждения",
    status: "waiting_client",
    sla: "Ожидает",
    slaTone: "hold",
    topic: "Авторизация / Код",
    device: "Web",
    entry: "VK",
    language: "Русский",
    clientSince: "09 февраля 2024",
    tags: ["авторизация", "код"],
    previous: [],
    messages: [
      { id: 1, side: "client", text: "Не приходит код подтверждения", time: "11:10" },
      { id: 2, side: "agent", text: "Проверю отправку кода. Напишите, пожалуйста, последние 4 цифры номера.", time: "11:11" }
    ]
  },
  {
    id: "olga",
    name: "Ольга Л.",
    initials: "ОЛ",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=128&q=80",
    channel: "SDK",
    phone: "+7 985 430-09-40",
    time: "11:05",
    preview: "Возврат денежных средств",
    status: "active",
    sla: "SLA 00:30",
    slaTone: "warn",
    topic: "Оплата / Возврат",
    device: "iOS",
    entry: "SDK",
    language: "Русский",
    clientSince: "14 марта 2024",
    tags: ["возврат", "важно"],
    previous: [["28.05.2024", "Смена карты", "Закрыт"]],
    messages: [
      { id: 1, side: "client", text: "Когда вернутся деньги за отмененный заказ?", time: "11:05" },
      { id: 2, type: "event", text: "SLA первого ответа истекает через 30 минут", time: "11:05" }
    ]
  },
  {
    id: "vladimir",
    name: "Владимир Б.",
    initials: "ВБ",
    channel: "Telegram",
    phone: "+7 921 991-12-53",
    time: "10:58",
    preview: "Товар не соответствует описанию",
    status: "queued",
    sla: "SLA просрочен",
    slaTone: "danger",
    topic: "",
    device: "Android",
    entry: "Telegram",
    language: "Русский",
    clientSince: "29 апреля 2024",
    tags: ["товар", "жалоба"],
    previous: [],
    messages: [
      { id: 1, side: "client", text: "Товар не соответствует описанию. Хочу вернуть.", time: "10:58" },
      { id: 2, type: "event", text: "Для закрытия укажите тематику", time: "10:59" }
    ]
  }
];

export const navItems = [
  { key: "dialogs", label: "Диалоги", icon: MessageCircle },
  { key: "panel", label: "Панель", icon: LayoutDashboard },
  { key: "clients", label: "Клиенты", icon: UsersRound },
  { key: "templates", label: "Шаблоны", icon: ClipboardList },
  { key: "visitors", label: "Визиты", icon: Zap },
  { key: "reports", label: "Отчеты", icon: BarChart3 },
  { key: "quality", label: "Качество", icon: ShieldCheck },
  { key: "automation", label: "Боты", icon: Bot },
  { key: "settings", label: "Настройки", icon: Settings }
];

export const topicDirectorySeed = [
  {
    id: "delivery",
    name: "Доставка",
    owner: "Операции",
    description: "Вопросы статуса заказа, адреса и взаимодействия с курьером.",
    branches: [
      {
        id: "delivery-order",
        name: "Заказ",
        children: [
          {
            id: "delivery-status",
            name: "Статус заказа",
            channels: ["SDK", "Telegram"],
            required: true,
            archived: false,
            routing: "1-я линия",
            access: "Редактирует администратор"
          },
          {
            id: "delivery-address",
            name: "Адрес доставки",
            channels: ["SDK", "MAX"],
            required: true,
            archived: false,
            routing: "Операции",
            access: "Редактирует администратор"
          }
        ]
      },
      {
        id: "delivery-courier",
        name: "Курьер",
        children: [
          {
            id: "delivery-courier-contact",
            name: "Связь с курьером",
            channels: ["Telegram", "VK"],
            required: false,
            archived: false,
            routing: "Старший сотрудник",
            access: "Просмотр старшему сотруднику"
          }
        ]
      }
    ]
  },
  {
    id: "payment",
    name: "Оплата",
    owner: "Финансы",
    description: "Возвраты, списания, промокоды и сверка платежей.",
    branches: [
      {
        id: "payment-refunds",
        name: "Возвраты",
        children: [
          {
            id: "payment-refund-status",
            name: "Возврат",
            channels: ["SDK", "VK"],
            required: true,
            archived: false,
            routing: "Финансовая очередь",
            access: "Редактирует администратор"
          },
          {
            id: "payment-card-change",
            name: "Смена карты",
            channels: ["SDK"],
            required: false,
            archived: true,
            routing: "Финансовая очередь",
            access: "Архив виден только в настройках"
          }
        ]
      }
    ]
  },
  {
    id: "account",
    name: "Авторизация",
    owner: "Антифрод",
    description: "Коды входа, восстановление доступа и проверка личности.",
    branches: [
      {
        id: "account-login",
        name: "Вход",
        children: [
          {
            id: "account-code",
            name: "Код",
            channels: ["MAX", "VK"],
            required: true,
            archived: false,
            routing: "Антифрод",
            access: "Редактирует администратор"
          },
          {
            id: "account-identity",
            name: "Проверка личности",
            channels: ["SDK", "Telegram", "MAX"],
            required: true,
            archived: false,
            routing: "Старший сотрудник",
            access: "Просмотр старшему сотруднику"
          }
        ]
      }
    ]
  },
  {
    id: "product",
    name: "Товар",
    owner: "Каталог",
    description: "Несоответствие описанию, комплектация и качество товара.",
    branches: [
      {
        id: "product-quality",
        name: "Качество",
        children: [
          {
            id: "product-mismatch",
            name: "Несоответствие",
            channels: ["Telegram", "VK"],
            required: true,
            archived: false,
            routing: "Каталог",
            access: "Редактирует администратор"
          }
        ]
      }
    ]
  }
];

export const topicOptions = topicDirectorySeed.flatMap((group) =>
  group.branches.flatMap((branch) =>
    branch.children.filter((topic) => !topic.archived).map((topic) => `${group.name} / ${topic.name}`)
  )
);

export const operators = [
  { name: "Иван П.", status: "online", chats: 7, limit: 12, avg: "01:18", sla: 96, channels: ["SDK", "Telegram"] },
  { name: "Анна Р.", status: "online", chats: 10, limit: 12, avg: "01:42", sla: 91, channels: ["MAX", "VK"] },
  { name: "Кирилл М.", status: "break", chats: 3, limit: 8, avg: "02:11", sla: 88, channels: ["Telegram"] },
  { name: "Елена С.", status: "online", chats: 5, limit: 10, avg: "01:05", sla: 98, channels: ["SDK"] },
  { name: "Олег Н.", status: "offline", chats: 0, limit: 8, avg: "03:20", sla: 82, channels: ["VK"] }
];

export const queues = [
  { name: "SDK", active: 42, waiting: 8, overdue: 2, limit: 12, health: 82 },
  { name: "Telegram", active: 35, waiting: 11, overdue: 3, limit: 8, health: 74 },
  { name: "MAX", active: 24, waiting: 5, overdue: 1, limit: 8, health: 89 },
  { name: "VK", active: 25, waiting: 9, overdue: 4, limit: 8, health: 68 }
];

export const reportRows = [
  { metric: "Новые обращения", today: "486", previous: "438", delta: "+11%", status: "Рост нагрузки" },
  { metric: "Закрытые обращения", today: "451", previous: "429", delta: "+5%", status: "В норме" },
  { metric: "Среднее время первого ответа", today: "01:36", previous: "01:52", delta: "-14%", status: "Лучше" },
  { metric: "SLA выполнен", today: "91%", previous: "87%", delta: "+4 п.п.", status: "Лучше" },
  { metric: "Без тематики", today: "0", previous: "3", delta: "-3", status: "Контроль работает" }
];

export const reportBars = [
  ["SDK", 38],
  ["Telegram", 28],
  ["MAX", 18],
  ["VK", 16]
];

export const reportChartBlocks = [
  {
    id: "new-closed",
    title: "Новые и закрытые",
    value: "486 / 451",
    delta: "+11% новых",
    tone: "ok",
    points: [64, 70, 58, 76, 84, 91, 88],
    legend: ["Новые", "Закрытые"]
  },
  {
    id: "first-response",
    title: "Первый ответ",
    value: "01:36",
    delta: "-16 сек",
    tone: "ok",
    points: [82, 78, 72, 69, 64, 59, 54],
    legend: ["SLA", "Ответ"]
  },
  {
    id: "operator-load",
    title: "Нагрузка операторов",
    value: "7.2 / 12",
    delta: "60% среднего лимита",
    tone: "warn",
    points: [42, 55, 63, 71, 68, 74, 60],
    legend: ["Чаты", "Лимит"]
  },
  {
    id: "topics",
    title: "Тематики",
    value: "34%",
    delta: "Доставка лидирует",
    tone: "ok",
    points: [34, 22, 18, 14, 12],
    legend: ["Доставка", "Оплата"]
  },
  {
    id: "quality",
    title: "CSAT / CSI",
    value: "4.7 / 82",
    delta: "7 низких оценок",
    tone: "warn",
    points: [78, 82, 84, 80, 86, 83, 82],
    legend: ["CSAT", "CSI"]
  },
  {
    id: "rescue",
    title: "Спасение",
    value: "18 / 23",
    delta: "78% спасено",
    tone: "ok",
    points: [45, 52, 58, 62, 71, 78, 76],
    legend: ["Спасено", "Пропущено"]
  }
];

export const rescueOutcomeSummary = [
  { label: "Спасено", value: "18", detail: "78% rescue-сценариев", tone: "ok" },
  { label: "Пропущено", value: "5", detail: "нужен разбор старшего", tone: "danger" },
  { label: "Средний timer", value: "02:16", detail: "до ответа или возврата", tone: "hold" },
  { label: "Автовозврат", value: "9", detail: "в SLA-очередь", tone: "info" }
];

export const rescueReportRows = [
  {
    id: "rescue-report-vladimir",
    client: "Владимир Б.",
    channel: "Telegram",
    operator: "Кирилл М.",
    timer: "00:42",
    reason: "Принят, но нет ответа оператора",
    outcome: "Спасен",
    resolution: "Вернулся в очередь, ответ за 01:12",
    digest: "Попал в ежедневный отчет"
  },
  {
    id: "rescue-report-olga",
    client: "Ольга Л.",
    channel: "SDK",
    operator: "Иван П.",
    timer: "01:18",
    reason: "Низкая оценка после прошлого диалога",
    outcome: "Спасен",
    resolution: "Ответ проверен старшим перед закрытием",
    digest: "В дайджест качества"
  },
  {
    id: "rescue-report-vk",
    client: "Очередь VK",
    channel: "VK",
    operator: "Не назначен",
    timer: "00:00",
    reason: "Очередь перегружена, SLA 68%",
    outcome: "Пропущен",
    resolution: "Timer истек без перераспределения",
    digest: "Требует разбора"
  },
  {
    id: "rescue-report-max",
    client: "Мария Н.",
    channel: "MAX",
    operator: "Анна Р.",
    timer: "02:04",
    reason: "Жалоба и повторное обращение",
    outcome: "Спасен",
    resolution: "Старший подключился в чате",
    digest: "Попал в ежедневный отчет"
  }
];

export const reportColumnOptions = [
  { id: "metric", label: "Показатель", locked: true },
  { id: "today", label: "Текущий период" },
  { id: "previous", label: "Сравнение" },
  { id: "delta", label: "Динамика" },
  { id: "status", label: "Комментарий" }
];

export const initialTemplates = [
  {
    id: "delay",
    title: "Задержка доставки",
    scope: "Командный",
    channel: "SDK",
    topic: "Доставка",
    usage: 184,
    updated: "Сегодня, 11:04",
    text: "Понимаю ожидание. Проверю статус заказа и вернусь с точным временем доставки."
  },
  {
    id: "courier",
    title: "Передан курьеру",
    scope: "Личный",
    channel: "Telegram",
    topic: "Доставка",
    usage: 97,
    updated: "Вчера, 18:20",
    text: "Заказ передан курьеру и будет доставлен сегодня до 18:00."
  },
  {
    id: "phone",
    title: "Запрос телефона",
    scope: "Глобальный",
    channel: "Все",
    topic: "Идентификация",
    usage: 241,
    updated: "22 июня",
    text: "Напишите, пожалуйста, номер телефона, указанный в заказе."
  },
  {
    id: "refund",
    title: "Возврат средств",
    scope: "Командный",
    channel: "VK",
    topic: "Оплата",
    usage: 73,
    updated: "20 июня",
    text: "Проверю статус возврата и уточню срок зачисления средств."
  }
];

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

export const activeVisitors = [
  {
    id: "visitor-4382",
    name: "Мария К.",
    phone: "+7 999 204-18-44",
    channel: "SDK",
    device: "Android 14",
    page: "Заказ №12345",
    entry: "Экран отслеживания",
    activeFor: "04:12",
    lastEvent: "Открыла статус доставки",
    segment: "важный клиент",
    operatorHint: "Иван П.",
    typing: true,
    privacy: "Контекст без текста ввода"
  },
  {
    id: "visitor-5109",
    name: "Новый посетитель",
    phone: "",
    channel: "SDK",
    device: "iOS 17",
    page: "Оплата заказа",
    entry: "Мобильное приложение",
    activeFor: "02:48",
    lastEvent: "Повторная ошибка оплаты",
    segment: "риск обращения",
    operatorHint: "Очередь: Оплата",
    typing: false,
    privacy: "Только технический контекст"
  },
  {
    id: "visitor-7721",
    name: "Алексей Т.",
    phone: "+7 903 773-11-05",
    channel: "VK",
    device: "Web",
    page: "Авторизация",
    entry: "VK Сообщества",
    activeFor: "01:31",
    lastEvent: "Запросил повторный код",
    segment: "авторизация",
    operatorHint: "Анна Р.",
    typing: false,
    privacy: "Канал без SDK-событий"
  }
];

export const rescueChats = [
  {
    id: "rescue-vladimir",
    client: "Владимир Б.",
    channel: "Telegram",
    operator: "Кирилл М.",
    timer: "00:42",
    reason: "Принят, но нет ответа оператора",
    status: "Возврат в очередь через 42 сек",
    priority: "Высокий",
    nextAction: "Уведомить старшего и вернуть в SLA-очередь"
  },
  {
    id: "rescue-olga",
    client: "Ольга Л.",
    channel: "SDK",
    operator: "Иван П.",
    timer: "01:18",
    reason: "Низкая оценка после прошлого диалога",
    status: "На контроле качества",
    priority: "Средний",
    nextAction: "Проверить ответ перед закрытием"
  },
  {
    id: "rescue-vk-queue",
    client: "Очередь VK",
    channel: "VK",
    operator: "Не назначен",
    timer: "03:05",
    reason: "Очередь перегружена, SLA 68%",
    status: "Требует перераспределения",
    priority: "Критичный",
    nextAction: "Передать 4 диалога свободным операторам"
  }
];

export const qualityScores = [
  {
    id: "csat-1001",
    client: "Ирина П.",
    score: 5,
    scale: "CSAT",
    channel: "MAX",
    operator: "Анна Р.",
    topic: "Оплата / Возврат",
    comment: "Быстро помогли с возвратом.",
    status: "Учтено в отчете",
    reviewedBy: "Старший сотрудник"
  },
  {
    id: "csat-1002",
    client: "Владимир Б.",
    score: 2,
    scale: "CSAT",
    channel: "Telegram",
    operator: "Кирилл М.",
    topic: "Товар / Несоответствие",
    comment: "Долго ждал ответа, пришлось писать повторно.",
    status: "Низкая оценка",
    reviewedBy: "Ожидает проверки"
  },
  {
    id: "qa-204",
    client: "Мария К.",
    score: 92,
    scale: "QA",
    channel: "SDK",
    operator: "Иван П.",
    topic: "Доставка / Статус заказа",
    comment: "Ответ полный, но нет ссылки на отслеживание.",
    status: "Рекомендация отправлена оператору",
    reviewedBy: "Елена С."
  }
];

export const aiSuggestions = [
  {
    id: "ai-maria-summary",
    conversationId: "maria",
    type: "summary",
    title: "Краткое резюме",
    text: "Клиент ждет заказ №12345, задержка связана с курьерской службой.",
    suggestedTopic: "Доставка / Статус заказа",
    tone: "спокойный",
    risk: "низкий",
    confidence: 94,
    actions: ["Вставить в заметку", "Отклонить"]
  },
  {
    id: "ai-vladimir-reply",
    conversationId: "vladimir",
    type: "reply",
    title: "Предложенный ответ",
    text: "Понимаю, что товар не подошел. Проверю заказ и подскажу быстрый способ возврата.",
    suggestedTopic: "Товар / Несоответствие",
    tone: "нужно извинение",
    risk: "SLA просрочен",
    confidence: 88,
    actions: ["Вставить", "Редактировать", "Отклонить"]
  },
  {
    id: "ai-article-refund",
    conversationId: "olga",
    type: "article",
    title: "Рекомендуемая статья",
    text: "Сроки возврата средств по способам оплаты",
    suggestedTopic: "Оплата / Возврат",
    tone: "нейтральный",
    risk: "средний",
    confidence: 91,
    actions: ["Открыть", "Прикрепить", "Отклонить"]
  }
];

export const exportJobs = [
  {
    id: "export-2418",
    name: "Ежедневный отчет",
    format: "XLSX",
    period: "Сегодня",
    statusKey: "ready",
    status: "Готов",
    progress: 100,
    requestedBy: "Иван П.",
    createdAt: "11:30",
    rows: 486,
    auditId: "audit-8831"
  },
  {
    id: "export-2419",
    name: "CSAT и низкие оценки",
    format: "CSV",
    period: "7 дней",
    statusKey: "running",
    status: "Готовится",
    progress: 62,
    requestedBy: "Анна Р.",
    createdAt: "11:34",
    rows: 128,
    auditId: "audit-8832"
  },
  {
    id: "export-2420",
    name: "Сводка по каналам",
    format: "PDF",
    period: "30 дней",
    statusKey: "error",
    status: "Ошибка",
    progress: 0,
    requestedBy: "Администратор",
    createdAt: "10:12",
    rows: 0,
    auditId: "audit-8819"
  },
  {
    id: "export-2421",
    name: "Нагрузка операторов",
    format: "XLSX",
    period: "Вчера",
    statusKey: "expired",
    status: "Истек",
    progress: 100,
    requestedBy: "Анна Р.",
    createdAt: "09:40",
    rows: 314,
    auditId: "audit-8807"
  }
];

export const botScenarios = [
  {
    id: "bot-delivery-status",
    name: "Статус доставки",
    status: "Включен",
    trigger: "Клиент спрашивает про заказ",
    channels: ["SDK", "Telegram"],
    steps: ["Запросить телефон", "Найти заказ", "Показать статус", "Передать оператору при задержке"],
    handoff: "Очередь Доставка",
    successRate: 71
  },
  {
    id: "bot-auth-code",
    name: "Код подтверждения",
    status: "Тест",
    trigger: "Не приходит код",
    channels: ["VK", "MAX"],
    steps: ["Проверить номер", "Повторить отправку", "Собрать последние 4 цифры", "Эскалировать"],
    handoff: "Очередь Авторизация",
    successRate: 54
  },
  {
    id: "bot-refund-intake",
    name: "Первичный возврат",
    status: "Пауза",
    trigger: "Возврат средств",
    channels: ["SDK"],
    steps: ["Уточнить номер заказа", "Проверить статус оплаты", "Показать сроки", "Создать задачу"],
    handoff: "Очередь Оплата",
    successRate: 0
  }
];

export const knowledgeArticles = [
  {
    id: "kb-delivery-tracking",
    title: "Отслеживание заказа",
    status: "Опубликована",
    category: "Доставка",
    topics: ["Доставка / Статус заказа"],
    channels: ["SDK", "Telegram", "MAX", "VK"],
    updated: "Сегодня, 10:40",
    owner: "Елена С.",
    usage: 312,
    helpfulRate: 89
  },
  {
    id: "kb-refund-terms",
    title: "Сроки возврата средств",
    status: "На проверке",
    category: "Оплата",
    topics: ["Оплата / Возврат"],
    channels: ["SDK", "VK"],
    updated: "Вчера, 17:05",
    owner: "Анна Р.",
    usage: 147,
    helpfulRate: 82
  },
  {
    id: "kb-auth-code",
    title: "Не приходит код подтверждения",
    status: "Черновик",
    category: "Авторизация",
    topics: ["Авторизация / Код"],
    channels: ["VK", "MAX"],
    updated: "22 июня",
    owner: "Олег Н.",
    usage: 38,
    helpfulRate: 74
  }
];

export const auditEvents = [
  {
    id: "audit-8831",
    time: "11:30",
    actor: "Иван П.",
    role: "Сотрудник",
    action: "Запустил экспорт",
    target: "Ежедневный отчет XLSX",
    detail: "Период: Сегодня, строк: 486",
    channel: "Все"
  },
  {
    id: "audit-8832",
    time: "11:34",
    actor: "Анна Р.",
    role: "Старший сотрудник",
    action: "Изменила лимит",
    target: "Канал VK",
    detail: "Лимит на оператора: 8 -> 10",
    channel: "VK"
  },
  {
    id: "audit-8833",
    time: "11:36",
    actor: "Система",
    role: "Автоматизация",
    action: "Вернула диалог",
    target: "Владимир Б.",
    detail: "Сработал rescue timer после принятия без ответа",
    channel: "Telegram"
  }
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

export const proactiveRules = [
  {
    id: "proactive-checkout-risk",
    name: "Помощь на оплате",
    status: "Включено",
    segment: "Ошибка оплаты или 2 минуты на экране оплаты",
    channels: ["SDK"],
    screen: "app://checkout/payment",
    triggerDelay: "120 сек",
    cooldown: "24 часа",
    workHours: "09:00-21:00",
    offlineForm: "Показать форму контакта после 21:00",
    message: "Вижу, что с оплатой может быть проблема. Помочь оформить заказ?",
    abTest: "A: короткий текст / B: с промокодом",
    acceptanceRate: 18,
    conversionRate: 11,
    dismissRate: 42,
    activeVariant: "A",
    variants: [
      { id: "A", label: "A", text: "Вижу, что с оплатой может быть проблема. Помочь оформить заказ?", conversion: 11, dismiss: 42 },
      { id: "B", label: "B", text: "Поможем завершить оплату и проверим, доступен ли промокод.", conversion: 14, dismiss: 36 }
    ],
    privacyNotice: "Не показывать текст ввода до начала чата"
  },
  {
    id: "proactive-delivery-delay",
    name: "Задержка доставки",
    status: "Тест",
    segment: "Открыт заказ с просроченной доставкой",
    channels: ["SDK", "Telegram"],
    screen: "app://orders/delayed",
    triggerDelay: "30 сек",
    cooldown: "7 дней",
    workHours: "Круглосуточно",
    offlineForm: "Не показывать, сразу создать обращение",
    message: "Можем быстро проверить доставку и связаться с курьером.",
    abTest: "Без A/B",
    acceptanceRate: 26,
    conversionRate: 19,
    dismissRate: 31,
    activeVariant: "A",
    variants: [
      { id: "A", label: "A", text: "Можем быстро проверить доставку и связаться с курьером.", conversion: 19, dismiss: 31 },
      { id: "B", label: "B", text: "Похоже, доставка задерживается. Проверить статус заказа сейчас?", conversion: 22, dismiss: 28 }
    ],
    privacyNotice: "Показывать только номер заказа и статус"
  },
  {
    id: "proactive-return-help",
    name: "Возврат товара",
    status: "Пауза",
    segment: "Просмотр правил возврата больше 90 секунд",
    channels: ["SDK", "VK"],
    screen: "web://help/returns",
    triggerDelay: "90 сек",
    cooldown: "14 дней",
    workHours: "10:00-20:00",
    offlineForm: "Собрать телефон и номер заказа",
    message: "Подскажем, как оформить возврат без лишних шагов.",
    abTest: "A: вопрос / B: кнопка начать возврат",
    acceptanceRate: 0,
    conversionRate: 0,
    dismissRate: 0,
    activeVariant: "A",
    variants: [
      { id: "A", label: "A", text: "Подскажем, как оформить возврат без лишних шагов.", conversion: 0, dismiss: 0 },
      { id: "B", label: "B", text: "Начать возврат сейчас и получить инструкцию?", conversion: 0, dismiss: 0 }
    ],
    privacyNotice: "Контекст страницы без персональных данных"
  }
];
