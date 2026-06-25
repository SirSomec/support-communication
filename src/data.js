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
    status: "waiting",
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
    status: "waiting",
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
    status: "sla",
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
    status: "breached",
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

export const topicOptions = [
  "Доставка / Статус заказа",
  "Доставка / Адрес",
  "Оплата / Возврат",
  "Авторизация / Код",
  "Товар / Несоответствие"
];

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
    status: "Ошибка",
    progress: 0,
    requestedBy: "Администратор",
    createdAt: "10:12",
    rows: 0,
    auditId: "audit-8819"
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
    channels: ["SDK", "Telegram"],
    chatLimit: 12,
    exceptions: ["Можно принимать VIP сверх лимита с подтверждением старшего"],
    canOverride: false,
    sensitiveData: false
  },
  {
    id: "rule-anna",
    employee: "Анна Р.",
    role: "Старший сотрудник",
    channels: ["MAX", "VK", "Telegram"],
    chatLimit: 10,
    exceptions: ["Может перераспределять очередь VK", "Может сбрасывать пароль сотруднику"],
    canOverride: true,
    sensitiveData: true
  },
  {
    id: "rule-admin",
    employee: "Администратор",
    role: "Администратор",
    channels: ["SDK", "Telegram", "MAX", "VK"],
    chatLimit: 30,
    exceptions: ["Полный доступ к настройкам каналов и аудиту"],
    canOverride: true,
    sensitiveData: true
  }
];

export const proactiveRules = [
  {
    id: "proactive-checkout-risk",
    name: "Помощь на оплате",
    status: "Включено",
    segment: "Ошибка оплаты или 2 минуты на экране оплаты",
    channels: ["SDK"],
    cooldown: "24 часа",
    message: "Вижу, что с оплатой может быть проблема. Помочь оформить заказ?",
    abTest: "A: короткий текст / B: с промокодом",
    acceptanceRate: 18,
    privacyNotice: "Не показывать текст ввода до начала чата"
  },
  {
    id: "proactive-delivery-delay",
    name: "Задержка доставки",
    status: "Тест",
    segment: "Открыт заказ с просроченной доставкой",
    channels: ["SDK", "Telegram"],
    cooldown: "7 дней",
    message: "Можем быстро проверить доставку и связаться с курьером.",
    abTest: "Без A/B",
    acceptanceRate: 26,
    privacyNotice: "Показывать только номер заказа и статус"
  },
  {
    id: "proactive-return-help",
    name: "Возврат товара",
    status: "Пауза",
    segment: "Просмотр правил возврата больше 90 секунд",
    channels: ["SDK", "VK"],
    cooldown: "14 дней",
    message: "Подскажем, как оформить возврат без лишних шагов.",
    abTest: "A: вопрос / B: кнопка начать возврат",
    acceptanceRate: 0,
    privacyNotice: "Контекст страницы без персональных данных"
  }
];
