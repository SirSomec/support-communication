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
