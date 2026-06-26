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
