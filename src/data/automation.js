export const botScenarios = [
  {
    id: "bot-delivery-status",
    name: "Статус доставки",
    status: "Включен",
    schemaVersion: "bot-flow/v1",
    owner: "Елена С.",
    updatedAt: "Сегодня, 12:20",
    trigger: "Клиент спрашивает про заказ",
    channels: ["SDK", "Telegram"],
    steps: ["Запросить телефон", "Найти заказ", "Показать статус", "Передать оператору при задержке"],
    handoff: "Очередь Доставка",
    successRate: 71,
    flowNodes: [
      { id: "delivery-message", type: "message", typeLabel: "Сообщение", title: "Принять вопрос", detail: "Распознать intent delivery_status и подтвердить, что бот проверит заказ.", channel: "SDK, Telegram", position: { x: 1, y: 1 } },
      { id: "delivery-contact", type: "contact_request", typeLabel: "Запрос контакта", title: "Уточнить телефон", detail: "Взять phone из профиля или запросить последние 4 цифры для валидации.", channel: "Все", position: { x: 2, y: 1 } },
      { id: "delivery-webhook", type: "webhook", typeLabel: "Webhook", title: "Получить заказ", detail: "GET /orders/status по phone и последнему order_id из SDK контекста.", channel: "SDK", position: { x: 3, y: 1 } },
      { id: "delivery-condition", type: "condition", typeLabel: "Условие", title: "Есть задержка?", detail: "Если ETA просрочен больше чем на 30 минут, включить handoff.", channel: "Все", position: { x: 4, y: 1 } },
      { id: "delivery-quick-replies", type: "quick_replies", typeLabel: "Быстрые ответы", title: "Показать варианты", detail: "Кнопки: Где курьер, Изменить адрес, Подключить оператора.", channel: "SDK", position: { x: 1, y: 2 } },
      { id: "delivery-handoff", type: "handoff", typeLabel: "Handoff", title: "Передать оператору", detail: "Очередь Доставка, причина: задержка, приоритет SLA.", channel: "Telegram", position: { x: 2, y: 2 } },
      { id: "delivery-fallback", type: "fallback", typeLabel: "Fallback", title: "Нет заказа", detail: "Если заказ не найден, создать обращение с тегом нужна идентификация.", channel: "Все", position: { x: 3, y: 2 } }
    ],
    flowEdges: [
      { from: "delivery-message", to: "delivery-contact", label: "нужна идентификация" },
      { from: "delivery-contact", to: "delivery-webhook", label: "phone ok" },
      { from: "delivery-webhook", to: "delivery-condition", label: "order found" },
      { from: "delivery-condition", to: "delivery-quick-replies", label: "ETA ok" },
      { from: "delivery-condition", to: "delivery-handoff", label: "delay" },
      { from: "delivery-webhook", to: "delivery-fallback", label: "not found" }
    ],
    validationRules: ["phone", "order_id", "delivery_eta"],
    previewMessages: [
      { side: "client", speaker: "Клиент", time: "00:01", text: "Где мой заказ? Курьер не приехал." },
      { side: "bot", speaker: "Бот", time: "00:03", text: "Проверю статус. Подтвердите телефон из заказа." },
      { side: "bot", speaker: "Бот", time: "00:08", text: "Заказ задерживается, передаю оператору с высоким приоритетом." }
    ],
    testCases: [
      { id: "delivery-delay", name: "Просроченный ETA", expected: "handoff" },
      { id: "delivery-ok", name: "ETA в норме", expected: "quick_replies" }
    ],
    exportVersion: "flow-v1.3"
  },
  {
    id: "bot-auth-code",
    name: "Код подтверждения",
    status: "Тест",
    schemaVersion: "bot-flow/v1",
    owner: "Олег Н.",
    updatedAt: "Сегодня, 11:50",
    trigger: "Не приходит код",
    channels: ["VK", "MAX"],
    steps: ["Проверить номер", "Повторить отправку", "Собрать последние 4 цифры", "Эскалировать"],
    handoff: "Очередь Авторизация",
    successRate: 54,
    flowNodes: [
      { id: "auth-message", type: "message", typeLabel: "Сообщение", title: "Принять жалобу", detail: "intent auth_code или retry_code из VK/MAX.", channel: "VK, MAX", position: { x: 1, y: 1 } },
      { id: "auth-contact", type: "contact_request", typeLabel: "Запрос контакта", title: "Проверить номер", detail: "Сверить phone и последние 4 цифры.", channel: "Все", position: { x: 2, y: 1 } },
      { id: "auth-condition", type: "condition", typeLabel: "Условие", title: "Cooldown прошел?", detail: "Если повторная отправка была меньше 60 сек назад, показать ожидание.", channel: "Все", position: { x: 3, y: 1 } },
      { id: "auth-webhook", type: "webhook", typeLabel: "Webhook", title: "Повторить отправку", detail: "POST /auth/code/retry и показать таймер 60 сек.", channel: "MAX", position: { x: 4, y: 1 } },
      { id: "auth-handoff", type: "handoff", typeLabel: "Handoff", title: "Эскалировать", detail: "Очередь Авторизация, причина: код не доставлен.", channel: "VK", position: { x: 2, y: 2 } },
      { id: "auth-fallback", type: "fallback", typeLabel: "Fallback", title: "Не удалось проверить", detail: "Создать обращение без повторной отправки, если номер не совпал.", channel: "Все", position: { x: 3, y: 2 } }
    ],
    flowEdges: [
      { from: "auth-message", to: "auth-contact", label: "verify phone" },
      { from: "auth-contact", to: "auth-condition", label: "phone ok" },
      { from: "auth-condition", to: "auth-webhook", label: "cooldown ok" },
      { from: "auth-condition", to: "auth-handoff", label: "retry failed" },
      { from: "auth-contact", to: "auth-fallback", label: "phone mismatch" }
    ],
    validationRules: ["phone", "otp_cooldown"],
    previewMessages: [
      { side: "client", speaker: "Клиент", time: "00:01", text: "Код не приходит уже второй раз." },
      { side: "bot", speaker: "Бот", time: "00:04", text: "Проверю номер и попробую отправить код повторно." },
      { side: "bot", speaker: "Бот", time: "00:12", text: "Если код снова не придет, подключу оператора авторизации." }
    ],
    testCases: [
      { id: "auth-cooldown-ok", name: "Повторная отправка доступна", expected: "webhook" },
      { id: "auth-phone-mismatch", name: "Номер не совпал", expected: "fallback" }
    ],
    exportVersion: "flow-v1.3"
  },
  {
    id: "bot-refund-intake",
    name: "Первичный возврат",
    status: "Пауза",
    schemaVersion: "bot-flow/v1",
    owner: "Анна Р.",
    updatedAt: "Вчера, 17:05",
    trigger: "Возврат средств",
    channels: ["SDK"],
    steps: ["Уточнить номер заказа", "Проверить статус оплаты", "Показать сроки", "Создать задачу"],
    handoff: "Очередь Оплата",
    successRate: 0,
    flowNodes: [
      { id: "refund-message", type: "message", typeLabel: "Сообщение", title: "Запрос возврата", detail: "intent refund или payment_status из SDK.", channel: "SDK", position: { x: 1, y: 1 } },
      { id: "refund-contact", type: "contact_request", typeLabel: "Запрос контакта", title: "Уточнить заказ", detail: "Запросить order_id и сверить phone.", channel: "SDK", position: { x: 2, y: 1 } },
      { id: "refund-webhook", type: "webhook", typeLabel: "Webhook", title: "Проверить оплату", detail: "GET /payments/refund-status по order_id.", channel: "SDK", position: { x: 3, y: 1 } },
      { id: "refund-condition", type: "condition", typeLabel: "Условие", title: "Статус спорный?", detail: "Если возврат не найден или сумма не совпала, создать задачу.", channel: "SDK", position: { x: 4, y: 1 } },
      { id: "refund-message-terms", type: "message", typeLabel: "Сообщение", title: "Показать сроки", detail: "Сроки возврата по карте, СБП или бонусам.", channel: "SDK", position: { x: 1, y: 2 } },
      { id: "refund-handoff", type: "handoff", typeLabel: "Handoff", title: "Финансовая проверка", detail: "Очередь Оплата, задача finance_review.", channel: "SDK", position: { x: 2, y: 2 } }
    ],
    flowEdges: [
      { from: "refund-message", to: "refund-contact", label: "need order" },
      { from: "refund-contact", to: "refund-webhook", label: "order ok" },
      { from: "refund-webhook", to: "refund-condition", label: "status loaded" },
      { from: "refund-condition", to: "refund-message-terms", label: "standard" },
      { from: "refund-condition", to: "refund-handoff", label: "manual review" }
    ],
    validationRules: ["phone", "order_id", "payment_method"],
    previewMessages: [
      { side: "client", speaker: "Клиент", time: "00:01", text: "Когда вернутся деньги?" },
      { side: "bot", speaker: "Бот", time: "00:04", text: "Уточню номер заказа и проверю статус возврата." },
      { side: "bot", speaker: "Бот", time: "00:10", text: "Если платеж спорный, создам задачу для финансовой команды." }
    ],
    testCases: [
      { id: "refund-standard", name: "Обычный срок возврата", expected: "message" },
      { id: "refund-manual-review", name: "Спорный платеж", expected: "handoff" }
    ],
    exportVersion: "flow-v1.3"
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
