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
    visibility: "public",
    version: "v4.2",
    updated: "Сегодня, 10:40",
    owner: "Елена С.",
    usage: 312,
    helpfulRate: 89,
    body: "Проверьте статус заказа в OMS, назовите клиенту текущий этап доставки, ожидаемое окно и ссылку на отслеживание. Если срок нарушен, создайте rescue-задачу и зафиксируйте внутренний комментарий.",
    attachments: [
      { id: "att-delivery-map", name: "Схема статусов доставки.pdf", type: "PDF", size: "1.8 МБ", status: "ready" },
      { id: "att-courier-sla", name: "SLA курьерских служб.xlsx", type: "XLSX", size: "640 КБ", status: "ready" }
    ],
    versions: [
      {
        id: "kb-delivery-v42",
        label: "v4.2",
        status: "Опубликована",
        author: "Елена С.",
        updated: "Сегодня, 10:40",
        changes: "Добавлены MAX и fallback для просроченного SLA."
      },
      {
        id: "kb-delivery-v41",
        label: "v4.1",
        status: "Архив",
        author: "Иван П.",
        updated: "20 июня, 15:10",
        changes: "Уточнен текст для SDK-виджета."
      }
    ],
    approvalHistory: [
      {
        id: "approval-delivery-3",
        actor: "Елена С.",
        role: "Старший сотрудник",
        action: "Опубликовала",
        date: "Сегодня, 10:40",
        comment: "Формулировки проверены, каналы синхронизированы.",
        tone: "ok"
      },
      {
        id: "approval-delivery-2",
        actor: "Анна Р.",
        role: "Автор",
        action: "Отправила на проверку",
        date: "Сегодня, 09:55",
        comment: "Обновила блок про просроченный SLA.",
        tone: "info"
      }
    ]
  },
  {
    id: "kb-refund-terms",
    title: "Сроки возврата средств",
    status: "На проверке",
    category: "Оплата",
    topics: ["Оплата / Возврат"],
    channels: ["SDK", "VK"],
    visibility: "public",
    version: "v2.0",
    updated: "Вчера, 17:05",
    owner: "Анна Р.",
    usage: 147,
    helpfulRate: 82,
    body: "Возврат зависит от способа оплаты: банковская карта до 10 рабочих дней, СБП до 3 рабочих дней, бонусный счет мгновенно после подтверждения. Всегда укажите клиенту следующий шаг и номер заявки.",
    attachments: [
      { id: "att-refund-policy", name: "Политика возвратов.pdf", type: "PDF", size: "920 КБ", status: "ready" }
    ],
    versions: [
      {
        id: "kb-refund-v20",
        label: "v2.0",
        status: "На проверке",
        author: "Анна Р.",
        updated: "Вчера, 17:05",
        changes: "Добавлены сроки СБП и обязательный номер заявки."
      },
      {
        id: "kb-refund-v19",
        label: "v1.9",
        status: "Опубликована",
        author: "Елена С.",
        updated: "18 июня, 12:20",
        changes: "Базовые сроки по карте и бонусному счету."
      }
    ],
    approvalHistory: [
      {
        id: "approval-refund-2",
        actor: "Анна Р.",
        role: "Автор",
        action: "Отправила на проверку",
        date: "Вчера, 17:05",
        comment: "Нужно подтвердить сроки СБП у финансов.",
        tone: "info"
      },
      {
        id: "approval-refund-1",
        actor: "Елена С.",
        role: "Старший сотрудник",
        action: "Попросила правки",
        date: "Вчера, 14:30",
        comment: "Добавить следующий шаг для клиента.",
        tone: "warn"
      }
    ]
  },
  {
    id: "kb-auth-code",
    title: "Не приходит код подтверждения",
    status: "Черновик",
    category: "Авторизация",
    topics: ["Авторизация / Код"],
    channels: ["VK", "MAX"],
    visibility: "internal",
    version: "v0.7",
    updated: "22 июня",
    owner: "Олег Н.",
    usage: 38,
    helpfulRate: 74,
    body: "Проверьте лимит отправки кодов, актуальность телефона и наличие блокировки SMS. В публичный self-service статью не публиковать до согласования с безопасностью.",
    attachments: [
      { id: "att-auth-checklist", name: "Чеклист авторизации.md", type: "MD", size: "24 КБ", status: "ready" }
    ],
    versions: [
      {
        id: "kb-auth-v07",
        label: "v0.7",
        status: "Черновик",
        author: "Олег Н.",
        updated: "22 июня",
        changes: "Собран черновик для внутренней проверки."
      }
    ],
    approvalHistory: [
      {
        id: "approval-auth-1",
        actor: "Олег Н.",
        role: "Автор",
        action: "Создал черновик",
        date: "22 июня",
        comment: "Ожидает проверки безопасности.",
        tone: "info"
      }
    ]
  }
];
