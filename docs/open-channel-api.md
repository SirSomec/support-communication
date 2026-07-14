# Внешние интеграции: Open Channel API, External Bot API, Event Webhooks, Widget API

Единый интеграционный слой платформы для внешних систем. Формат событий следует
де-факто конвенции популярных платформ онлайн-чатов, поэтому перенос готовой
интеграции с такой платформы сводится к замене адресов и токенов на стороне
клиента — структура JSON, имена событий и коды ответов сохраняются.

Все URL ниже указаны относительно базового адреса API: `https://<host>/api/v1`.

---

## 1. Управление (админ-API)

Аутентификация: сессия оператора арендатора (`POST /auth/tenant/login`), права
`settings.read` / `settings.manage`.

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET/POST | `/integrations/external/chat-channels` | Список / создание чат-каналов Open Channel |
| PATCH/DELETE | `/integrations/external/chat-channels/:id` | Обновление (в т.ч. `rotateToken`), удаление |
| GET/POST | `/integrations/external/bot-connections` | Список / подключение внешнего бот-провайдера |
| PATCH/DELETE | `/integrations/external/bot-connections/:id` | Обновление, удаление |
| GET/POST | `/integrations/external/webhooks` | Список / подписка URL на событийные вебхуки |
| PATCH/DELETE | `/integrations/external/webhooks/:id` | Обновление (`events`, `status`), удаление |
| GET | `/integrations/external/deliveries` | Журнал исходящих доставок (отладка; фильтры `kind`, `status`) |

Токен канала/бота возвращается **полностью только в ответе на создание** (и при
`rotateToken`); далее отдаётся маскированный `tokenPreview`.

Поля создания чат-канала: `name`, `outboundUrl` (URL вашего сервера для
исходящих событий), `routingQueueId` (необязательно). Ответ содержит
`inboundPath` — путь приёма событий с токеном.

Поля подключения бота: `name`, `providerUrl` (эндпоинт бот-платформы),
`token` (необязательно — сгенерируем; должен быть уникален), `channels`
(список типов каналов, `null` = все, например `["SDK", "CHATAPI"]`).

Поля подписки вебхуков: `url`, `events` (`null` = все поддерживаемые:
`chat_accepted`, `chat_updated`, `chat_finished`, `client_attribute_updated`,
`client_updated`, `offline_message`).

---

## 2. Open Channel API (кастомный чат-канал)

Двунаправленный асинхронный протокол «ваш сервер ↔ платформа» для обращений из
мобильных приложений, десктопа или полностью кастомного виджета. Диалоги
попадают операторам как обычный канал.

### Транспорт

- POST, JSON, UTF-8, `Content-Type: application/json; charset=utf-8`.
- Приём событий: `POST /open-channel/{TOKEN}` (токен выдаётся при создании канала).
- Статус канала: `GET /open-channel/{TOKEN}/status` → тело `0` (нет активных
  собеседников) либо `1`.
- Ответы на приём: `2xx` — принято; `4xx` — постоянная ошибка, повторять не
  нужно (тело `text/plain` с описанием); `5xx`/сетевая — повторите до 3 раз с
  интервалом 3–60 секунд.
- Исходящие события (ответы операторов) платформа доставляет POST-запросами на
  `outboundUrl` канала с теми же правилами повторов.

### Структура события

Протокол симметричный: `{sender, recipient, message}`.

`sender`/`recipient` (объект User): `id` (строка ≤255 — обязателен: `sender.id`
при отправке к нам, `recipient.id` в событиях от нас), `name`, `photo`, `url`,
`title`, `email`, `phone`, `invite`, `group`, `intent`, `crm_link`,
`custom_data`.

`message`: `type` (обязателен), `id` (для дедупликации и статусов), `date`
(unix-время), `text`, `title`, `file`, `thumb`, `file_size`, `width`, `height`,
`file_name`, `mime_type`, `latitude`, `longitude`, `value`, `keyboard`
(до 7 клавиш `{id, text, title, image}`), `multiple`.

### Типы сообщений

| Тип | Обязательные поля | Поведение платформы |
| --- | --- | --- |
| `text` | `text` | Текст в диалог |
| `photo`/`sticker`/`video`/`audio`/`document` | `file` | Сообщение с вложением-ссылкой |
| `location` | `latitude`, `longitude` | Текст с координатами |
| `rate` | `value` | `0` — отказ от оценки; `>0` — положительная; `<0` — отрицательная (CSAT) |
| `seen` | `id` | Подтверждение прочтения — принимается |
| `keyboard` | `keyboard` | Ответ клиента выбранными клавишами |
| `typein` | — | Индикатор набора — принимается (не чаще 1 раза в 5 с) |
| `start` | — | Возобновление диалога после `stop` |
| `stop` | — | Завершение диалога |

Пример входящего текстового сообщения:

```json
{
  "sender": {
    "id": "001",
    "name": "Иван Иванович",
    "phone": "+79581003291",
    "email": "me@example.com"
  },
  "message": { "type": "text", "id": "0001", "date": 946684800, "text": "Добрый день!" }
}
```

Пример исходящего события (ответ оператора) на ваш `outboundUrl`:

```json
{
  "sender": { "id": "agent", "name": "Мария" },
  "recipient": { "id": "001" },
  "message": { "type": "text", "id": "agent-1", "date": 946684800, "text": "Здравствуйте!" }
}
```

---

## 3. External Bot API (подключение бот-платформы)

Обмен событиями через вебхуки; инициатор — платформа: сообщение клиента
отправляется бот-провайдеру, ответ бота возвращается в диалог.

- Все события: POST, `application/json`; таймаут 3 секунды, 2 повтора; если
  ответ не получен — клиент переводится на оператора.
- Аутентификация — токен бот-провайдера в пути URL:
  - платформа → провайдер: `POST {providerUrl}/{TOKEN}`;
  - провайдер → платформа: `POST /external-bot/webhooks/{connectionId}/{TOKEN}`
    (полный путь возвращается при создании подключения в `inboundPath`).
- Формат ошибки: `{"error": {"code": "...", "message": "..."}}`; коды:
  `invalid_client` (401), `unauthorized_client`, `invalid_request` (400).

### События платформа → бот-провайдер

| Событие | Когда |
| --- | --- |
| `CLIENT_MESSAGE` | Новое сообщение клиента, пока диалог ведёт бот |
| `AGENT_UNAVAILABLE` | Бот запросил перевод, но операторов нет — бот может продолжить |
| `CHAT_CLOSED` | Диалог принят оператором или закрыт — бот больше не пишет |

Пример `CLIENT_MESSAGE`:

```json
{
  "id": "9661ab9c-…",
  "site_id": "tenant-001",
  "client_id": "1233",
  "chat_id": "2037",
  "agents_online": true,
  "sender": { "id": 1233, "name": "John Smith", "url": "https://example.com", "has_contacts": false },
  "message": { "type": "TEXT", "text": "Вы можете мне помочь?", "timestamp": 1665415879 },
  "channel": { "id": "xbc-…", "type": "chatapi" },
  "event": "CLIENT_MESSAGE"
}
```

### События бот-провайдер → платформа

| Событие | Назначение |
| --- | --- |
| `BOT_MESSAGE` | Ответ бота в диалог (`message.type`: `TEXT`, `MARKDOWN`, `BUTTONS`, `PHOTO`, `VIDEO`, `AUDIO`, `VOICE`, `DOCUMENT`, `LOCATION`) |
| `INVITE_AGENT` | Перевод диалога на оператора (при недоступности придёт `AGENT_UNAVAILABLE`) |
| `INIT_RATE` | Запрос формы оценки диалога |

`BUTTONS` и медиа-типы, не поддержанные каналом клиента, транслируются в текст
(заголовок + нумерованные варианты / ссылка на файл). `MARKDOWN` использует
поле `text` как текстовый фолбэк.

---

## 4. Event Webhooks (события диалогов)

POST JSON на URL подписки. Тип события — строковое поле `event_name`.

| `event_name` | Когда |
| --- | --- |
| `chat_accepted` | Оператор принял диалог |
| `chat_updated` | Обновились данные клиента в активном диалоге |
| `chat_finished` | Диалог завершён (включает переписку) |
| `client_attribute_updated` | Изменены атрибуты клиента |

Общие поля события: `event_name`, `widget_id`, `user_token` (значение
`setUserToken` из Widget API, иначе `null`), `visitor {name, email, phone,
description, number, social, chats_count}`, `organization`, `status`,
`assigned_agent`, `tags[]`, `chat_id` (число), `department`, `session {geoip,
utm, utm_json, ip_addr, user_agent}`, `page {url, title}`, `agent {id, name,
email}`, `analytics`.

`chat_finished` дополнительно содержит `agents[]`, `chat.messages[]`
(`{message, timestamp, type: "visitor"|"agent", agent_id}`), `chat.blacklisted`,
`chat.rate`, `plain_messages`.

### Ответ на `chat_accepted` / `chat_updated`

Вернув JSON, вы можете обогатить карточку диалога — данные отобразятся
оператору, как будто их ввёл клиент:

```json
{
  "result": "ok",
  "custom_data": [{ "title": "LTV", "content": "42 000 ₽" }],
  "contact_info": { "name": "Пётр Петров", "phone": "+79990001122", "email": "petr@example.com" },
  "crm_link": "https://crm.example.com/clients/1"
}
```

На остальные события ожидается `{"result": "ok"}` (или текст ошибки).

Повторы: транзиентные ошибки (5xx/сеть) — до 3 попыток; ответ `4xx` считается
постоянной ошибкой. Журнал доставок доступен в админ-API
(`GET /integrations/external/deliveries`).

---

## 5. Widget API (страничный API виджета)

Виджет (`SupportWidget.init({...})`) публикует на странице объект
**`window.sw_api`** и вызывает глобальные колбэки с префиксом **`sw_`**.
Отключение: `SupportWidget.init({ pageApi: false, ... })`.

Для сайтов, мигрирующих с других виджетов, тот же объект и колбэки доступны и
под привычными их интеграциям именами — достаточно заменить ключ и адреса
подключения виджета, код страницы менять не обязательно.

### Колбэки (объявляются на странице)

`sw_onLoadCallback`, `sw_onOpen`, `sw_onClose`, `sw_onChangeState(state)`
(`"chat"` | `"label"`), `sw_onMessageSent` (первое сообщение),
`sw_onClientStartChat`, `sw_onAccept` (оператор принял диалог),
`sw_onMessageReceived` (новое сообщение оператора), `sw_onResizeCallback`,
`sw_onWidgetDestroy`.

Глобальные функции: `sw_init()` (повторная инициализация после destroy),
`sw_destroy()`.

### Методы `sw_api`

| Метод | Описание |
| --- | --- |
| `open(params?)` / `close()` | Открыть/закрыть окно чата → `{result}` |
| `chatMode()` | `"online"` \| `"offline"` — есть ли доступные операторы |
| `setContactInfo({name, email, phone, description})` | Контакты клиента — оператору и в вебхуки |
| `getContactInfo()` | `{client_name, email, phone, description}` |
| `setCustomData([{title?, key?, content, link?}])` | До 10 полей произвольных данных в панель оператора |
| `setClientAttributes({имя: значение})` | Атрибуты клиента (строки/числа) |
| `setUserToken(token)` | Идентификатор клиента — попадёт в поле `user_token` всех вебхуков |
| `sendOfflineMessage({name, email, phone, description, message})` | Контакты + сообщение одним вызовом → `{result}` |
| `sendPageTitle(title, fromApi?, url?)` | Обновить страницу клиента для SPA |
| `showProactiveInvitation(text, departmentId?)` | Показать приглашение к диалогу |
| `setWidgetColor(color, color2?)` | Цвет/градиент виджета |
| `getVisitorNumber(cb(err, number))` | Стабильный номер посетителя |
| `getUnreadMessagesCount()` | Счётчик непрочитанных сообщений оператора |
| `getUtm()` | UTM-метки первого визита `{source, medium, campaign, content, term}` |
| `clearHistory()` | Очистить локальную историю и идентичность (деавторизация) |
| `startCall(phone)` / `isCallbackEnabled(cb)` | Телефония не подключена → `{result: "fail", reason: "calls_not_available"}` |
| `setRules(rules)` | Принимается без действия (совместимость) |

### Серверные эндпоинты виджета (публичный API-ключ)

- `POST /public/sdk/client-info` — карточка клиента (`contactInfo`,
  `customData`, `attributes`, `userToken`; возвращает `visitorNumber`).
- `GET /public/sdk/agents/status` — `{agentsOnline}` для `chatMode()`.

---

## 6. Ограничения текущей версии

- Телефония (`call_event`, `startCall`) не поддерживается.
- Офлайн-формы нет — `offline_message` зарезервировано, событие не эмитится;
  `sendOfflineMessage` отправляет обычное сообщение с контактами.
- CRM-вебхуки (сделки/задачи/воронки) не поддерживаются.
- `session.geoip`/`utm` в вебхуках передаются пустыми структурами (поля
  сохранены для совместимости парсеров).
- `INIT_RATE` принимается и фиксируется, но отдельная форма оценки в виджете
  по нему пока не показывается (оценка доступна при закрытии диалога).
- Оценка из `CLIENT_RATED` не пересылается бот-провайдеру.

## 7. Конфигурация

| Переменная | Назначение | По умолчанию |
| --- | --- | --- |
| `OPEN_CHANNEL_STORE_FILE` | Файл хранилища слоя | `.runtime/open-channel.json` |
| `OPEN_CHANNEL_DISABLED` | `true` — отключить фоновые циклы | — |
| `OPEN_CHANNEL_DELIVERY_INTERVAL_MS` | Период очереди доставки | `3000` |
| `OPEN_CHANNEL_PUMP_INTERVAL_MS` | Период событийного насоса | `2000` |
