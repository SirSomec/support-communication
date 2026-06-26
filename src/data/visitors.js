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
