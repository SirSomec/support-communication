# Frontend Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести фронтенд омниканальной платформы поддержки до полноценного продукта уровня Usedesk/Jivo, покрывающего все функциональные требования и конкурентные механики.

**Architecture:** Текущий интерфейс остается React/Vite single-page app с локальной навигацией и общей дизайн-системой. Архитектура постепенно выделяется в доменные data-файлы, app-модули, feature-router, сервисные адаптеры под API и переиспользуемые UI-примитивы без переписывания уже работающих сценариев.

**Tech Stack:** React 19, Vite, `lucide-react`, CSS, in-app Browser smoke QA, future service adapters for backend/API integration.

---

Версия: 2.27
Дата актуализации: 2026-06-26
Статус: актуализированный рабочий план после выноса app shell (`Sidebar`/`TopBar`), PanelScreen, ClientsScreen, ReportsScreen, TemplatesScreen, QualityScreen, VisitorsScreen, AutomationScreen, SettingsScreen, notification center, ConversationList, ChatPane, CustomerPanel, DialogModals, composer, AI composer panel, attachment preview, ChatHeader, TranscriptToolbar, DialogActionMenu, AuditTimeline, KnowledgeBaseWorkspace, AiQualityWorkspace, Modal, Toast, StatusBadge, ToolbarSearch, SegmentedControl и EntityTable в feature/shared-компоненты, расширения уведомлений фильтрами/подписками/history, добавления AI explainability, pre-send quality check, AI real-time scoring/coaching/effectiveness UI, расширенного редактора базы знаний с approval history/версиями/вложениями/self-service preview, bot channel assignment/after-hours/metrics/handoff summary, разбиения seed-данных, app-модулей и расширенного smoke/e2e QA
Основание: [functional-requirements-support-communication-platform.md](functional-requirements-support-communication-platform.md)

## 1. Цель фронтенда

Собрать полноценный рабочий интерфейс омниканальной платформы поддержки уровня Usedesk/Jivo: операторский cockpit, панель старшего сотрудника, клиентские профили, шаблоны, отчеты, настройки прав, каналов, SDK, автоматизацию, контроль качества, активные визиты и конкурентные механики proactive/rescue/bots.

Фронтенд не должен быть MVP или набором демо-страниц. Каждый раздел проектируется как рабочая поверхность для ежедневного использования: плотная, сканируемая, с ясными состояниями, быстрыми действиями, понятной навигацией и проверяемыми пользовательскими сценариями.

## 2. Текущий стек и ограничения

- React 19 + Vite.
- `lucide-react` для иконок.
- Локальная навигация через состояние `section`; полноценный роутинг пока не введен.
- Основной cockpit пока находится в `src/App.jsx`, но app shell (`Sidebar`/`TopBar`) вынесен в `src/features/app-shell/AppShell.jsx`, notification center вынесен в `src/features/notifications/NotificationCenter.jsx`, ConversationList, ChatPane, CustomerPanel, DialogModals, composer/AI panel/attachment preview/ChatHeader/TranscriptToolbar/DialogActionMenu/AuditTimeline вынесены в `src/features/dialogs/*`, а доменная модель диалогов, уведомлений, AI quality check и правила доступа вынесены в `src/app/*`.
- Продуктовые разделы находятся в `src/features/*`: `PanelScreen`, `ClientsScreen`, `ReportsScreen`, `TemplatesScreen`, `QualityScreen`, `VisitorsScreen`, `AutomationScreen` и `SettingsScreen` подключаются через `src/features/section-router.jsx`; legacy `src/sections.jsx` больше не используется, расширенный workspace базы знаний вынесен в `src/features/quality/KnowledgeBaseWorkspace.jsx`, а AI scoring/coaching workspace — в `src/features/quality/AiQualityWorkspace.jsx`.
- Общие UI-примитивы, Modal, Toast, StatusBadge, ToolbarSearch, SegmentedControl и EntityTable вынесены в `src/ui.jsx`.
- Seed-данные разнесены по доменным файлам `src/data/*.js`; `src/data.js` оставлен публичным barrel-агрегатором.
- Стили находятся в `src/styles.css`.
- Dev server: `http://127.0.0.1:5173/`.
- Все продуктовые разделы на `ProductScreen` имеют единый `ScreenStateStrip`: загрузка, данные/пусто и ошибки с локальными счетчиками.
- Добавлен Playwright smoke suite `npm run test:smoke`: state strip по разделам, app shell role access/notification drawer close, queue filters/tabs, customer panel template/close-topic guard, outbound quick action, save-template modal semantics, draft-switch warning, rescue timer, notification filters/subscriptions/history, AI explainability/pre-send check, AI real-time scoring/coaching/effectiveness, handoff summary, расширенный knowledge editor с версиями/approval/вложениями/self-service, bot builder/import/channel assignment и responsive matrix 390/768/1024/1440.
- Дизайн-система: темная левая навигация, белые рабочие панели, синие primary actions, компактные таблицы, радиус 8px, без hero/landing-композиции.

## 3. Фактически реализовано во фронтенде

### 3.1. Операторский cockpit

- Трехколоночный рабочий экран: список диалогов, история чата, карточка клиента.
- Омниканальная очередь с SDK, Telegram, MAX, VK.
- Фильтры очереди: `Мои`, `Ожидают`, `SLA`, `Спасти`, `Оценки`, `Все`.
- Фильтры очереди сверстаны в две строки без горизонтального скролла.
- Поиск по диалогам.
- Расширенная панель фильтров очереди: канал, тематика, статус, наличие внутреннего комментария, сортировка по времени, SLA, статусу и каналу.
- История сообщений: клиентские сообщения, ответы оператора, системные события, внутренние комментарии.
- Фильтр истории: `Все`, `Комментарии`, `Audit`.
- В очереди и шапке чата отображаются workflow-статусы: новое, в очереди, назначено, в работе, ожидает клиента, ожидает оператора, передано, на паузе, закрыто, переоткрыто.
- В чате есть audit timeline: смена статуса, действия оператора, смена тематики и закрытие отображаются отдельными audit-card событиями.
- Внутренний комментарий отделен от клиентского ответа режимом composer, текстом кнопки и визуальным стилем.
- Тематика доступна в шапке чата и правой карточке.
- Закрытие без тематики заблокировано в UI и объяснено предупреждением.
- Смена тематики добавляет audit-событие в историю.
- Действия над диалогом: передать старшему, вернуть в очередь, запустить спасение, поставить паузу SLA.
- `Запустить спасение` запускает rescue timer в transcript toolbar, переводит диалог в фильтр `Спасти`, блокирует повторный запуск и пишет audit-событие `eventKind: rescue`.
- Composer поддерживает ответ клиенту, внутренний комментарий, вставку шаблонов, upload/preview/error UI вложений, inline AI-панель и сохранение текста как шаблона.
- Inline AI-панель в чате показывает summary/reply/article-подсказки по выбранному диалогу, confidence, suggested topic, tone, risk и действия accept/edit/reject.
- AI-действия не отправляют сообщение автоматически: они вставляют текст в черновик или скрывают подсказку и записываются в audit history диалога.
- AI-карточки имеют explainability-блок `Почему предложено`: совпавшая тематика, тон, риск и сценарное ограничение.
- Composer показывает pre-send quality check: пустой ответ, короткий ответ, отсутствие эмпатии, отсутствие следующего шага, риск формулировки и состояние `готово`.
- При смене диалога с несохраненным текстом или вложениями показывается warning-modal: можно остаться или сбросить черновик и перейти.
- Сообщение оператора можно сохранить как шаблон одной кнопкой из истории.
- В topbar реализован notification center: SLA-alert, mention, channel error, export-ready, счетчик непрочитанных, mark-all-read, фильтры, группы, настройки подписок, history и действия по каждому уведомлению.
- В живом чате показан bot handoff summary: сценарий, что бот спросил, что получил и почему передал оператору.

### 3.2. Клиентский контекст

- Карточка клиента показывает телефон, устройство, точку входа, дату клиента, язык, каналы, теги и предыдущие диалоги.
- Поддержаны канальные признаки SDK, Telegram, MAX, VK.
- В карточке есть блок рекомендуемых шаблонов и рекомендуемых статей.

### 3.3. Исходящие диалоги

- Через `Быстрые действия` доступен modal создания исходящего диалога.
- Есть телефон, имя нового клиента, канал, тематика, стартовое сообщение.
- Есть поиск существующего профиля по телефону.
- Есть validation: нельзя создать диалог без валидного телефона и стартового сообщения.
- UI показывает SDK-событие `initConversation(phone, channel, topic, operatorId)`.

### 3.4. Панель старшего сотрудника

- Раздел `Панель` показывает online/break/offline операторов, активные диалоги, ожидание, SLA-риски.
- Есть фильтр по каналу.
- Есть таблица операторов с лимитами, текущей нагрузкой, средним временем ответа, SLA и доступными каналами.
- Таблица операторов адаптируется без горизонтального скролла: каналы переносятся внутри строки, а на узких экранах строка перестраивается в компактный двухстрочный layout.
- Есть health-блок очередей по SDK, Telegram, MAX, VK.
- Есть действие перераспределения очередей как UI-сценарий.

### 3.5. Клиенты

- Раздел `Клиенты` показывает клиентские профили из текущих диалогов.
- Есть поиск по имени, телефону и каналу.
- Таблица показывает телефон, канал, устройство, тематику, дату клиента и историю.

### 3.6. Шаблоны

- Раздел `Шаблоны` содержит список, поиск, редактор, доступ, канал, тематику, переменные и текст.
- Есть личные, командные и глобальные шаблоны.
- Создание шаблона из отдельной вкладки и из окна чата связано с общей библиотекой шаблонов.
- Новый шаблон сразу появляется в composer и разделе `Шаблоны`.

### 3.7. Отчеты и экспорт

- Раздел `Отчеты` содержит ежедневный отчет, дайджест руководителя, таблицу метрик, chart-блоки и распределение по каналам.
- Есть фильтры периода, типа отчета, канала, оператора, тематики, команды, статуса, SLA и типа диалога.
- Есть настройка состава колонок выгрузки с обязательной колонкой показателя.
- Есть UI-сценарий экспорта XLSX с добавлением новой задачи в очередь.
- Есть очередь и история выгрузок: XLSX, CSV, PDF, статусы `В очереди`, `Готовится`, `Готов`, `Ошибка`, `Истек`, progress, audit id.
- Есть действия по состояниям: download для готового файла, retry для ошибки, regenerate для истекшего файла, disabled state для выполняемой задачи.
- В отчетах отражены CSAT/CSI, SLA и операторы как типы отчетов.

### 3.8. Настройки, права, каналы и SDK

- Раздел `Настройки` содержит role switcher: сотрудник, старший сотрудник, администратор.
- В верхней панели есть глобальный role switcher для проверки интерфейса под ролью сотрудника, старшего сотрудника и администратора.
- Матрица ролей показывает доступ к панели, настройкам, паролям и отчетам.
- Навигация и ключевые действия учитывают роль: недоступные разделы и операции получают disabled state, title/inline-объяснение, sensitive phone masking для сотрудника.
- Для неадминистратора глобальные настройки переводятся в read-only/disabled state.
- Есть настройки каналов и лимитов на оператора.
- Есть детальная поверхность канала: несколько подключений, raw IDs, маршрутизация, лимиты, группы, журнал событий/ошибок и тест приема/отправки.
- Есть настройки каналов и лимитов по сотрудникам, override, маскирование чувствительных данных, группы, парольный статус и role-aware сброс пароля.
- Есть карточки подключений SDK, Telegram, MAX, VK с health/status.
- Есть SDK-консоль со snippet и событиями `identifyUser`, `initConversation`, `trackEntryPoint`, `syncTopic`.
- Есть критичные правила: запрет закрытия без тематики, внутренний комментарий не отправляется клиенту, лимиты, аудит экспортов.

### 3.9. Активные визиты, proactive и rescue

- Раздел `Визиты` показывает активные SDK/VK-сессии до начала чата.
- Есть контекст визита: страница, точка входа, последнее событие, маршрут.
- Есть SDK timeline событий до начала чата.
- Есть действие `Начать диалог` из активного визита.
- Есть очередь спасения с таймерами, оператором, причиной и действием.
- Есть rescue timer прямо в окне чата: оставшееся время, причина, следующий шаг, role-aware disabled state и audit-событие запуска.
- В отчетах есть отдельный блок `Спасенные и пропущенные`: summary по outcome, средний timer, автовозврат и строки спасенных/пропущенных диалогов.
- Есть proactive-правила с сегментами, каналами, cooldown/A-B/privacy и acceptance rate.
- Есть visual builder proactive-правила: условия/сегмент, экран или URL, задержка показа, cooldown, рабочее время, offline form, privacy, каналы, preview приглашения, A/B-тексты и метрики принятия/конверсии/отказов.
- Privacy для наблюдения за печатью обозначен как контекст без текста ввода.

### 3.10. Качество, CSAT/CSI, AI и база знаний

- Раздел `Качество` показывает CSAT, низкие оценки, AI-подсказки и статьи.
- Есть список оценок с баллом, каналом, оператором, тематикой и комментарием клиента.
- Есть фильтр низких оценок как UI-сценарий.
- Есть AI-помощник с summary/reply/article, confidence, suggested topic, risk и действиями accept/edit/reject в разделе качества и inline в composer чата.
- AI-действия в чате пишутся в audit-фильтр transcript как события `eventKind: ai`.
- Есть AI real-time scoring workspace: общий live score, сигналы по эмпатии, следующему шагу, тематике/базе знаний и риску формулировки.
- Есть coaching queue с подсказками исправления для оператора, preview рекомендуемой формулировки, фильтрами `Риски/SLA/База знаний` и действием применения.
- Есть панель эффективности AI-подсказок: принято без правок, отредактировано, влияние на FCR и ложные срабатывания.
- Есть таблица базы знаний со статусами публикации, каналами, видимостью, версиями, вложениями, полезностью и публичностью для self-service.
- Есть встроенный редактор базы знаний: выбор статьи, название, статус `Черновик/На проверке/Опубликована`, видимость `Публичная/Только оператор`, текст, каналы, сохранение версии, отправка на проверку, публикация, возврат на доработку и live preview.
- Есть governance-блок базы знаний: approval history, список версий, attachments panel с добавлением/удалением вложения и self-service preview SDK/виджета с поиском и переходом к оператору.

### 3.11. Боты, автоматизация и audit

- Раздел `Боты` показывает сценарии AI-оператора, proactive, handoff и audit.
- Есть конструктор сценариев как UI-поверхность: триггер, шаги, каналы, success rate, редактирование.
- Есть canvas/flow-builder сценариев: ноды `message`, `quick_replies`, `condition`, `contact_request`, `webhook`, `handoff`, `fallback`, связи, inspector выбранной ноды, validation rules и test cases.
- Есть transcript preview тестового прогона сценария без отправки клиенту.
- Есть import/export JSON flow со `schemaVersion`, `flowNodes`, `flowEdges`, validation и inline ошибкой при невалидном JSON.
- Есть тестовый прогон сценариев как UI-сценарий.
- Есть привязка ботов к каналам SDK/Telegram/MAX/VK с role-aware disabled state.
- Есть after-hours policy card для нерабочего времени, bot metrics card и отдельная handoff summary card.
- Есть audit автоматизации: экспорт, изменение лимита, rescue timer.

## 4. Матрица покрытия функциональных требований

| Требование из спецификации | Текущий frontend-статус | Что еще нужно довести |
| --- | --- | --- |
| Омниканальный inbox SDK/Telegram/MAX/VK | Отражен в списках, карточках, фильтрах, настройках и данных | Детальные статусы доставки, ошибки сообщений, вложения по каналам |
| Внутренний комментарий, невидимый клиенту | Реализован в composer и истории | Права просмотра, audit-экспорт без клиентского transcript, защита от случайного режима через подтверждение при длинном внутреннем тексте |
| Тематика в любое время чата | Реализована в шапке и правой карточке; в настройках добавлен многоуровневый справочник с поиском, фильтром актив/архив, role-aware действиями и единым источником `topicOptions` | Backend-синхронизация справочника, импорт/экспорт, версионирование и audit log изменений |
| Запрет закрытия без тематики | Реализован disabled state и warning | Серверная валидация после подключения API |
| Выгрузка отчетов по всем показателям | Есть таблица метрик, chart-блоки, расширенные фильтры, настройка колонок, export queue и действия download/retry/regenerate | Реальные файлы выгрузок, сохраненные шаблоны отчетов, backend-очередь и единые определения метрик |
| SDK-подключение | Есть SDK-консоль, события, snippet и playground с live raw payload preview, validation/result state и role-aware запуском события | Ключи окружений, реальные delivery/read/attachment события, backend-тестовый стенд и changelog |
| Telegram, MAX, VK | Есть каналы, статусы, health, настройки; добавлена детальная поверхность канала с несколькими подключениями, raw IDs, журналом ошибок, фильтрами и тестом приема/отправки | Реальные webhook/API операции, управление токенами, retry delivery и backend-аудит тестов |
| Инициация диалога по телефону через SDK | Реализован modal исходящего диалога | Проверка прав, согласий, доступности канала, дублей и юридических ограничений |
| Панель: онлайн, перерыв, активные, ожидание | Реализована | Drill-down оператора, bulk actions, preview перераспределения |
| Роли сотрудник/старший/администратор | Есть глобальный role switcher, матрица, role-aware navigation/action disabled states и маскирование телефона для сотрудника | Довести до backend-ready permission model: права на каждое действие, аудит отказов, серверная валидация и управление группами |
| База шаблонов оператора | Реализована отдельная вкладка и editor | Архивирование, копирование, approval flow, расширенная аналитика использования |
| Сохранение шаблона из чата | Реализовано из composer и сообщения | Сохранение из выделенного фрагмента текста |
| Телефон, устройство, точка входа | Реализовано в карточке клиента и SDK/visitor данных, телефон маскируется по роли | Device timeline и полная детальная страница клиента |
| Лимит чатов на оператора | Реализован в панели и настройках | Симуляция маршрутизации и hard validation при назначении |
| Каналы каждому сотруднику | Реализован интерактивный редактор сотрудника: роль, группа, каналы, лимит, override, чувствительные данные, парольный статус и сброс пароля для старшего/админа | Массовое назначение, backend-аудит изменений, серверная модель групп |
| Клиентские профили и объединение | Реализованы список, детальная панель клиента, маскирование sensitive fields по роли, кандидаты дублей и локальный merge/unmerge UI | Backend merge graph, conflict resolution, source profile IDs и audit объединения |
| Поиск и фильтры | Частично: поиск диалогов, клиентов, шаблонов, отчеты; очередь поддерживает фильтры по каналу, тематике, статусу, внутренним комментариям и сортировки | Довести фильтры до production-набора: дата, оператор, телефон, клиентский ID, сохраненные пресеты и backend-пагинация |
| Статусы обращений | Реализованы workflow-статусы в очереди, шапке чата, фильтре и действиях диалога | Backend transitions, transition guards по роли/каналу, системные назначения и массовые операции |
| Вложения | Реализован upload/preview/error UI в composer, inline-ошибки размера/типа, блокировка отправки при uploading/error и отображение готовых вложений в transcript | Реальный upload API, storage, antivirus/scan, delivery/read states и тонкие ограничения по каждому каналу |
| Уведомления | Реализован topbar notification center: непрочитанные, SLA, mentions, channel errors, export-ready, фильтры, группы, настройки подписок, history и действия по уведомлениям | Реальные источники событий, push/browser notifications и backend audit |
| SLA | Отражен в очереди, панели, отчетах | Настройка правил SLA по каналу/тематике/расписанию |
| Audit | Есть фильтр в чате, structured audit timeline для статусов, действий, тематик и закрытия, export audit | Единый audit log с фильтрами, деталкой события, retention и backend-событиями |
| База знаний | Реализованы рекомендации, таблица статей, встроенный редактор, preview, статус публикации, каналы, видимость, approval history, вложения, версии статьи и self-service preview виджета | Backend CRUD, полнотекстовый поиск, storage, approval workflow API, публикация версий и аналитика self-service |
| CSAT/CSI | Частично реализован раздел качества и отчетный тип | Настройка отправки оценки по каналам, карточка оценки, динамика по операторам |
| AI-помощь | Реализована inline panel в чате, AI-подсказка в composer, explainability, pre-send quality check, раздел качества, audit AI-действий accept/edit/reject, AI real-time scoring workspace, coaching queue и метрики эффективности подсказок | Backend-модели подсказок, production scoring service, реальные repair actions и телеметрия эффективности |
| Proactive invites | Реализованы список правил, visual builder условий, preview приглашения, A/B управление и метрики принятия/конверсии/отказов | Backend delivery, серверные frequency caps, персистентность экспериментов, таргетинг и аналитика эффективности |
| Активные посетители | Реализован отдельный раздел | Права, обезличивание, ручная инициация с проверками, город/источник |
| Спасение чатов | Реализованы очередь спасения, фильтр, действие запуска, rescue timer в чате, audit запуска и отчет спасенных/пропущенных | Серверный countdown, автоматический возврат, настройки rescue по каналу/очереди/роли и backend outcome analytics |
| Сценарные боты и AI-оператор | Реализованы список сценариев, canvas/flow-builder, canonical node types, flow edges, inspector, transcript preview, JSON import/export, after-hours policy, channel assignment, bot metrics и handoff summary в живом чате | Backend runtime, публикация/версии сценариев, реальные bot metrics, audit import/export/test/publish и production handoff events |
| UI/UX продукта | Реализована базовая дизайн-система, единый ScreenStateStrip и Playwright smoke/e2e для state strip, rescue, notifications, AI checks, knowledge editor, bot builder и responsive 390/768/1024/1440 | Keyboard nav, visual regression и backend partial/loading/error states |

Вывод после сверки: все ключевые функциональные направления из спецификации представлены во frontend-плане и имеют хотя бы одну запланированную UI-поверхность. Большинство критичных требований уже отражены в текущем интерфейсе как интерактивные frontend-сценарии; оставшаяся работа связана с глубиной production-поведения, правами, детализацией, API-интеграцией и QA.

## 5. Архитектурный план фронтенда

### 5.1. Ближайшая структуризация кода

Уже сделано:

- Общие UI-примитивы вынесены в `src/ui.jsx`.
- Основные seed-данные разнесены в `src/data/*.js`, а `src/data.js` оставлен публичным barrel-агрегатором.
- Ролевая модель и доменная модель диалогов вынесены в `src/app/access.js` и `src/app/dialogModel.js`.
- Helper `createScreenStateItems` вынесен в `src/app/screenState.js` для переиспользования product-screen state strip.
- Модель уведомлений вынесена в `src/app/notificationModel.js`.
- Правила AI explainability и pre-send quality check вынесены в `src/app/aiQualityModel.js`.
- Sidebar и TopBar вынесены в `src/features/app-shell/AppShell.jsx` без изменения CSS-контрактов, topbar notification center и quick action flow.
- PanelScreen вынесен в `src/features/panel/PanelScreen.jsx`; section-router подключает его напрямую, а данные операторов/очередей больше не импортируются в общий `sections.jsx`.
- ClientsScreen вынесен в `src/features/clients/ClientsScreen.jsx`; section-router подключает его напрямую.
- ReportsScreen вынесен в `src/features/reports/ReportsScreen.jsx` вместе с report-only фильтрами, export status classes и данными таблиц/графиков.
- TemplatesScreen вынесен в `src/features/templates/TemplatesScreen.jsx` с сохранением fallback-режима локальных шаблонов и подключения к общей базе шаблонов через `onTemplatesChange`.
- QualityScreen вынесен в `src/features/quality/QualityScreen.jsx`; раздел качества подключает AI scoring/coaching workspace и базу знаний внутри feature-папки.
- VisitorsScreen вынесен в `src/features/visitors/VisitorsScreen.jsx` вместе с proactive builder helper `InfoPill` и локальным списком каналов proactive.
- AutomationScreen вынесен в `src/features/automation/AutomationScreen.jsx` вместе с bot flow node dictionary, import/export flow logic и channel assignment state.
- SettingsScreen вынесен в `src/features/settings/SettingsScreen.jsx`; legacy `src/sections.jsx` удален из активной архитектуры.
- Topbar notification center вынесен в `src/features/notifications/NotificationCenter.jsx` без изменения CSS-контрактов и smoke-селекторов.
- ConversationList/TabButton, ChatPane, CustomerPanel/PanelSection/InfoRow, DialogModals, Composer, inline AI panel и attachment preview вынесены в `src/features/dialogs/*` без изменения CSS-контрактов и smoke-селекторов.
- Toast вынесен в `src/ui.jsx` и получил `aria-live="polite"`/`role="status"`.
- StatusBadge вынесен в `src/ui.jsx`; все текущие `status-chip` JSX-вхождения используют единый компонент.
- ToolbarSearch вынесен в `src/ui.jsx`; текущие `toolbar-search` JSX-вхождения используют единый компонент.
- SegmentedControl вынесен в `src/ui.jsx`; settings role switcher и фильтр статуса тематик используют единый компонент.
- EntityTable вынесен в `src/ui.jsx`; таблицы клиентов и отчета используют общий wrapper с сохранением row layouts.
- Focus trap для модальных окон вынесен в `src/app/useModalA11y.js`.
- Роутер продуктовых экранов вынесен в `src/features/section-router.jsx`.
- Навигация и продуктовые массивы используют единый источник данных.

Дальше:

- Разделить крупные компоненты на feature-модули:
  - `src/features/dialogs/`
  - `src/features/templates/`
  - `src/features/reports/`
  - `src/features/settings/`
  - `src/features/integrations/`
  - `src/features/supervisor-panel/`
  - `src/features/visitors/`
  - `src/features/quality/`
  - `src/features/automation/`
- Продолжить разнос `src/App.jsx`, `src/styles.css` и крупных feature-экранов на подмодули без изменения пользовательских сценариев.
- Вынести общие компоненты:
  - `Modal`
  - `Toast`
  - `ToolbarSearch`
  - `EntityTable`
  - `SegmentedControl`
  - `StatusBadge`
  - `AuditTimeline`
  - `ActionMenu`
- Сохранить текущую визуальную систему без рестайлинга ради рестайлинга.

### 5.2. Состояние и будущая интеграция API

- Пока использовать локальный state для интерактивных сценариев.
- Подготовить слой `src/services/` с мок-адаптерами под будущий backend:
  - `dialogService`
  - `templateService`
  - `reportService`
  - `integrationService`
  - `permissionService`
  - `visitorService`
  - `automationService`
  - `qualityService`
- Для каждого сервиса описать loading, empty, error, partial states.
- Не привязывать новые UI-поверхности напрямую к seed-массивам.

## 6. Актуальный roadmap frontend-разработки

### Фаза 1. Операторский cockpit до production-ready

Цель: превратить текущий рабочий cockpit в полноценную поверхность оператора.

Задачи:

- Расширить фильтры очереди сверх текущих канала, тематики, статуса и внутреннего комментария: оператор, дата, телефон, клиентский ID.
- Расширить сортировки сверх текущих последнего сообщения, SLA, статуса и канала: дата создания и приоритет.
- Довести текущие workflow-статусы до backend transitions, transition guards по роли/каналу и массовых операций.
- Довести вложения после текущего upload/preview/error UI до реального upload API, storage, antivirus/scan и delivery/read states.
- Расширить текущий warning о несохраненном черновике на будущие автопереходы, поиск и системные назначения после подключения backend-событий.
- Добавлен rescue timer прямо в transcript toolbar чата.
- Добавлена inline AI-панель рядом с composer: summary/reply/article, suggested topic, tone, risk, accept/edit/reject и audit AI-действий.
- Реализовано: pre-send quality check в composer.
- Расширить текущий audit timeline до единого audit log с фильтрами, деталкой события, retention и backend-событиями.

Acceptance criteria:

- Оператор видит причину попадания диалога в очередь и следующий ожидаемый шаг.
- Все критичные статусы читаются без открытия карточки клиента.
- Закрытие без тематики невозможно и визуально объяснено.
- Internal note невозможно спутать с клиентским сообщением.
- Горизонтального overflow нет на 390, 768, 1024 и 1440 px.

### Фаза 2. Клиентские профили

Цель: сделать карточку клиента полноценным источником контекста.

Задачи:

- Добавить детальную страницу клиента.
- Добавить объединение и разделение дублей профилей.
- Показать устройства, ОС, версию приложения, язык, timezone, первую и последнюю точку входа.
- Показать историю всех каналов и обращений.
- Добавить маскирование чувствительных данных по роли.
- Добавить внутренние заметки и пользовательские поля.
- Добавить SDK-события до начала чата: экран, источник, время в приложении, события доставки и прочтения.

Acceptance criteria:

- Оператор видит номер телефона, устройство и точку входа без поиска в других системах.
- Чувствительные данные скрываются при недостаточных правах.
- История помогает ответить, а не превращается в длинный лог без приоритета.

### Фаза 3. Шаблоны и база знаний

Цель: довести контур шаблонов и базы знаний до полноценного инструмента оператора и команды.

Задачи:

- Добавить архивирование, копирование и удаление шаблонов.
- Добавить категории, теги, язык, владелец, approval status.
- Добавить сохранение шаблона из выделенного фрагмента сообщения.
- Добавить preview шаблона с подстановкой переменных.
- Добавить аналитику использования шаблонов по оператору, каналу и тематике.
- Реализовано: редактор базы знаний со статьями, черновиками, публикацией, вложениями, публичностью/внутренностью, версиями и approval history.
- Добавить вставку статьи или ссылки на статью в ответ оператором.
- Реализовано: self-service preview для SDK/виджета с поиском публичных статей и переходом к оператору.

Acceptance criteria:

- Оператор может сохранить шаблон из чата не покидая диалог.
- Новый шаблон сразу доступен в рекомендациях и на вкладке `Шаблоны`.
- Шаблон показывает область доступа, канал, owner и статус.
- Редактор не перегружает оператора техническими полями.

### Фаза 4. Каналы, SDK и исходящие диалоги

Цель: закрыть полный frontend-контур подключений SDK, Telegram, MAX, VK и исходящих контактов.

Задачи:

- Расширить `Настройки -> Подключения` до отдельных карточек/деталок канала.
- Для каждого канала показать статус, параметры, сотрудников, группы, маршрутизацию, лимиты, журнал ошибок, тест приема/отправки, последнюю синхронизацию и технический ID.
- Добавить поддержку нескольких подключений Telegram/VK.
- Добавить SDK playground: init, identifyUser, initConversation, trackEntryPoint, syncTopic, attachments, delivery/read events.
- Добавить payload preview устройства: ОС, версия ОС, модель, версия приложения, язык, timezone, экран.
- Расширить исходящий диалог: поиск клиента, выбор сценария, проверка доступности канала, дубль-предупреждения, проверка прав, consent/legal warning, audit создания.

Acceptance criteria:

- Администратор понимает, какой канал сломан и почему.
- Старший сотрудник видит только доступные ему действия.
- Исходящий диалог нельзя создать без валидного телефона, стартового сообщения и доступного канала.
- SDK-события имеют понятные человекочитаемые описания и raw payload.

### Фаза 5. Панель старшего сотрудника и маршрутизация

Цель: дать старшему сотруднику управляемую панель смены и маршрутизации.

Задачи:

- Добавить drill-down в оператора: диалоги, нагрузка, SLA, качество, каналы, перерывы.
- Добавить preview перераспределения очередей до применения.
- Добавить настройки перерывов и статусов операторов.
- Добавить bulk actions: передать группу диалогов, поднять приоритет, назначить старшему, вернуть в очередь.
- Добавить симуляцию маршрутизации по лимитам, каналам, ролям, тематике и последнему оператору.
- Добавить предупреждения: перегруз, просрочка, низкая оценка, rescue.

Acceptance criteria:

- Состояние смены понятно за 30 секунд.
- Проблемные очереди и операторы визуально выделены.
- Перераспределение имеет preview и audit-событие.

### Фаза 6. Отчеты, дайджест и экспорт

Цель: закрыть управленческую отчетность и выгрузки по всем показателям.

Задачи:

- Добавлены фильтры: период, канал, оператор, тематика, команда, статус, SLA, тип диалога.
- Добавлены chart-блоки: новые обращения, закрытые, первое время ответа, SLA, нагрузка операторов, тематики, CSAT/CSI, rescue.
- Добавлен отчетный блок спасенных/пропущенных диалогов: outcome summary, средний timer, автовозврат и строки разбора.
- Добавлена настройка состава колонок выгрузки.
- Добавлены реальные UI-состояния экспорта: queued, running, ready, error, expired.
- Добавлены download-ready UI, retry для ошибок и regenerate для истекших файлов.
- Добавить сохраненные шаблоны отчетов.
- Добавлен frontend audit entry point для каждого экспорта; backend audit trail остается интеграционной задачей.

Acceptance criteria:

- Все метрики из интерфейса можно выгрузить.
- Дайджест читается как управленческий summary, а не как набор чисел.
- Экспорт имеет понятный статус: готовится, готов, ошибка.

### Фаза 7. Права, роли, администрирование и безопасность

Цель: реализовать UI для сотрудника, старшего сотрудника и администратора во всех разделах.

Задачи:

- Довести текущий глобальный role mode в `Диалоги`, `Панель`, `Клиенты`, `Шаблоны`, `Отчеты`, `Визиты`, `Качество`, `Боты` до полной action-level матрицы.
- Добавить матрицу прав по действиям: просмотр панели, общие настройки, смена паролей, отчеты, каналы, шаблоны, база знаний, чувствительные данные, active visitors, audit.
- Добавить управление сотрудниками и группами.
- Добавить смену пароля сотруднику старшим сотрудником.
- Добавить настройку доступных каналов на сотрудника и исключения.
- Добавить UI маскирования телефона, client id и typing/context data.
- Добавить audit log действий с правами, каналами, экспортом и паролями.

Acceptance criteria:

- Пользователь понимает, почему действие недоступно.
- Администратор видит полный доступ, старший сотрудник не меняет глобальные настройки.
- Изменения прав визуально попадают в аудит.

### Фаза 8. Качество, CSAT/CSI и AI-помощь

Цель: завершить контур контроля качества и AI-инструментов без подмены оператора.

Задачи:

- Добавить настройку отправки CSAT/CSI после закрытия или перевода статуса.
- Добавить настройки каналов, где запрашивается оценка.
- Добавить карточку оценки: балл, комментарий клиента, оператор, тематика, канал, история проверки.
- Добавить динамику качества по оператору, каналу и тематике.
- Добавить ручную оценку ответа старшим сотрудником по критериям.
- Реализовано: AI explainability, почему предложена тематика/ответ/статья.
- Добавлен audit AI-действий: принять, редактировать, отклонить.
- Реализовано: встроенный редактор базы знаний со статусом публикации, каналами, версиями, approval history, вложениями и self-service preview.
- Реализовано: pre-send quality check в composer.
- Реализовано: AI real-time scoring, coaching queue с подсказками исправления и dashboard эффективности подсказок.

Acceptance criteria:

- AI-подсказка не отправляется автоматически.
- Все AI-действия маркированы как вспомогательные.
- AI scoring показывает объяснимые сигналы и не блокирует ручную работу оператора без явного правила.
- Старший сотрудник видит качество по оператору, каналу и тематике.

### Фаза 9. Proactive, активные посетители и rescue

Цель: довести конкурентные механики Usedesk/Jivo до полноценного frontend-контура.

Задачи:

- Реализовано: visual builder proactive-правил с условиями, сегментами, каналами, экраном/URL, временем, cooldown, рабочим временем, offline form и privacy.
- Реализовано: preview приглашения для SDK/виджета.
- Реализовано: A/B управление текстами и активным вариантом.
- Реализовано: статистика принятия, конверсии в диалог и отказов в карточках правил.
- Реализовано: rescue timer в чате и отчет спасенных/пропущенных диалогов.
- Добавить права на просмотр active visitors.
- Добавить настройки хранения, обезличивания и typing visibility.
- Добавить rescue-настройки по каналу, очереди и роли.

Acceptance criteria:

- Proactive-настройки понятны руководителю поддержки, не только разработчику.
- Режим наблюдения отделен от очереди обращений.
- Таймер rescue виден, но не перегружает чат.

### Фаза 10. Боты и автоматизация

Цель: сделать визуальный модуль автоматической обработки обращений до оператора.

Задачи:

- Реализовано: canvas/flow-builder сценариев.
- Реализовано: ноды `message`, `quick_replies`, `condition`, `contact_request`, `webhook`, `handoff`, `fallback`.
- Реализовано частично: validation rules для сценариев и inline import validation; email/custom fields остаются backend/runtime задачей.
- Реализовано: frontend-карточка сценария для нерабочего времени.
- Реализовано: назначение разных ботов на разные каналы как UI-сценарий.
- Реализовано: тестовый запуск с transcript preview как frontend preview.
- Реализовано: импорт/экспорт сценариев JSON со schema/version/nodes/edges.
- Реализовано: frontend-статистика диалогов с ботом.
- Реализовано: прозрачный handoff, оператор видит резюме того, что бот уже спросил и получил, в разделе ботов и живом чате.

Acceptance criteria:

- Клиент понимает, когда общается с ботом, а когда с оператором.
- У клиента есть понятный путь к человеку, если это разрешено правилами.
- Оператор при подключении видит краткое резюме бота.

### Фаза 11. Production readiness и QA

Цель: довести интерфейс до стабильного продукта.

Задачи:

- Реализовано: responsive smoke QA для 390, 768, 1024, 1440 px в `npm run test:smoke`.
- Проверить keyboard navigation и focus states.
- Проверить `aria-label`, `aria-modal`, `role="dialog"`, таблицы и кнопки.
- Реализовано: empty/loading/error states для product-разделов через единый `ScreenStateStrip`.
- Реализовано: smoke/e2e сценарии для state strip, app shell role access/notification drawer close, queue filters/tabs, customer panel template/close-topic guard, outbound quick action, save-template modal semantics, draft-switch warning, rescue timer, notification filters/subscriptions/history, AI explainability/pre-send check, AI real-time scoring/coaching, live handoff summary, knowledge editor, bot builder import/channel assignment validation и responsive overflow.
- Добавить visual regression checklist.
- Разделить CSS на feature-файлы или CSS modules, если файл станет плохо поддерживаемым.
- Подготовить Storybook или внутреннюю страницу UI-kit, если компонентная база продолжит расти.

Acceptance criteria:

- Нет горизонтального overflow на mobile и desktop.
- Нет clipped text в кнопках, таблицах, карточках и модалках.
- Нет неактивных controls без объяснения.
- Все модальные окна закрываются предсказуемо и не конфликтуют с одинаковыми labels.

## 7. Приоритетный backlog следующего этапа

### 7.1. Frontend UI и архитектура

1. Продолжить разнос `App.jsx`, `styles.css` и крупных feature-экранов на подмодули без изменения поведения; app shell, PanelScreen, ClientsScreen, ReportsScreen, TemplatesScreen, QualityScreen, VisitorsScreen, AutomationScreen, SettingsScreen, notification center, ConversationList, ChatPane, CustomerPanel, DialogModals, composer, DialogActionMenu, AuditTimeline, ChatHeader, TranscriptToolbar и Modal уже вынесены, следующий безопасный кандидат — декомпозиция `SettingsScreen` на role matrix/channel settings/topic directory/SDK workspace или CSS-разделение для стабильных feature-блоков.
2. Реализовано: общий `Modal`; `Toast`, `StatusBadge`, `ToolbarSearch`, `SegmentedControl`, `EntityTable` и `Modal` уже вынесены в `src/ui.jsx`, `DialogActionMenu` и `AuditTimeline` — в `src/features/dialogs/*`.
3. Реализовано: база знаний доведена до расширенного UI с approval history, версиями статьи, вложениями и preview self-service виджета.
4. Реализовано во frontend: AI real-time scoring, операторские подсказки исправления и аналитика эффективности подсказок. Осталось подключить production scoring service, реальные repair actions и backend-телеметрию.
5. Расширить notification center до push/browser notifications и серверных источников после подключения backend event stream.
6. Довести QA до production-уровня: keyboard navigation, focus map, semantic table/grid для динамической таблицы отчетов, visual regression checklist и UI-kit/Storybook при росте компонентной базы.

### 7.2. Backend/service integration backlog

1. Довести ролевую модель до backend-ready permission model: права на каждое действие, аудит отказов, серверная валидация, сотрудники и группы.
2. Довести клиентские профили до backend merge graph, conflict resolution, source profile IDs и audit объединения.
3. Расширить фильтры очереди до даты, оператора, телефона, клиентского ID, сохраненных пресетов и backend-пагинации.
4. Довести вложения до backend upload/storage, antivirus/scan, delivery states и канальных ограничений на API.
5. Довести workflow-статусы до backend transitions, transition guards и массовых операций.
6. Подключить отчеты к реальным файлам выгрузок, сохраненным шаблонам отчетов, backend-очереди и единым определениям метрик.
7. Подключить каналы Telegram/MAX/VK/SDK к реальным webhook/API операциям, токенам, retry delivery и backend-аудиту тестов.
8. Довести rescue до production-контура: серверный countdown, автоматический возврат, настройки по каналу/очереди/роли и backend outcome analytics.
9. Довести proactive до production-контура: backend delivery, серверные frequency caps, сохранение экспериментов, таргетинг и аналитику эффективности.
10. Довести ботов до production-контура: backend runtime, публикация/версии сценариев, реальные bot metrics, audit import/export/test/publish и production handoff events.
11. Синхронизировать live bot handoff summary с текущей выбранной тематикой из `topics` state, а не только с seed-значением диалога.
12. Добавить backend partial/loading/error states после сервисного слоя.

## 8. QA-gates для каждой frontend-итерации

- `npm run build` проходит.
- `npm run test:smoke` проходит.
- Browser/IAB smoke-test: page identity, not blank, no framework overlay, console без релевантных `error/warn`.
- Проверен основной interaction path новой функциональности.
- Проверены desktop и mobile viewport.
- Проверен screenshot против текущей дизайн-системы.
- Нет горизонтального overflow.
- Нет clipped text в основных controls.
- Icon-only controls имеют `aria-label`, `title` и понятную область клика.
- Новые модальные окна имеют `role="dialog"` и `aria-modal="true"`.
- Новые empty/error/loading states описаны или явно отложены в backlog.
- Если меняется план, матрица покрытия требований должна быть актуализирована вместе с roadmap.

## 9. Definition of Done для frontend-фичи

Фича считается готовой, если:

- пользовательский сценарий можно пройти без обращения к коду;
- изменения состояния видны в UI, а не только в toast;
- есть validation и disabled states для некорректных действий;
- desktop и mobile не ломают компоновку;
- новая поверхность соответствует текущей дизайн-системе;
- данные и компоненты не создают дублирующую логику, если уже есть общий state;
- есть понятный путь будущего подключения API;
- требование из функциональной спецификации отмечено в матрице покрытия;
- изменение зафиксировано в git отдельным коммитом.

## 10. Исполнительный чеклист

- [x] Централизовать seed-данные в `src/data.js`.
- [x] Вынести общие UI-примитивы в `src/ui.jsx`.
- [x] Реализовать операторский cockpit с очередью, чатом и карточкой клиента.
- [x] Реализовать внутренние комментарии и визуальное отделение от клиентского ответа.
- [x] Реализовать выбор тематики и блокировку закрытия без тематики.
- [x] Реализовать базу шаблонов и сохранение шаблона из чата.
- [x] Реализовать исходящий диалог по телефону через SDK-oriented flow.
- [x] Реализовать панель операторов, очередей и лимитов.
- [x] Реализовать отчеты, дайджест и export queue.
- [x] Реализовать настройки ролей, каналов, лимитов и SDK-консоль.
- [x] Реализовать active visitors, proactive rules и rescue queue как UI-поверхности.
- [x] Реализовать CSAT/CSI, AI-подсказки и базу знаний как UI-поверхности.
- [x] Реализовать сценарии ботов, proactive/handoff и audit автоматизации как UI-поверхности.
- [x] Разнести `src/data.js` на доменные data-файлы и оставить `src/data.js` barrel-агрегатором.
- [x] Вынести app-модули доступа, модели диалогов, modal a11y hook и section router.
- [x] Вынести topbar notification center в `src/features/notifications/NotificationCenter.jsx`.
- [x] Вынести composer, inline AI panel и attachment preview в `src/features/dialogs/*`.
- [x] Вынести Toast в `src/ui.jsx` и добавить live-region semantics.
- [x] Вынести StatusBadge в `src/ui.jsx`.
- [x] Вынести ToolbarSearch в `src/ui.jsx`.
- [x] Вынести SegmentedControl в `src/ui.jsx`.
- [x] Вынести EntityTable в `src/ui.jsx`.
- [x] Вынести Modal в `src/ui.jsx` и подключить outbound/save-template/draft-switch dialog shell.
- [x] Вынести DialogActionMenu и AuditTimeline из `src/App.jsx` в `src/features/dialogs/*`.
- [x] Вынести ChatHeader, TranscriptToolbar и Avatar из `src/App.jsx` в `src/features/dialogs/*`.
- [x] Вынести ConversationList и TabButton из `src/App.jsx` в `src/features/dialogs/*`.
- [x] Вынести ChatPane из `src/App.jsx` в `src/features/dialogs/*`.
- [x] Вынести CustomerPanel, PanelSection и InfoRow из `src/App.jsx` в `src/features/dialogs/*`.
- [x] Вынести OutboundDialogLauncher, SaveTemplateDialog и DraftSwitchDialog из `src/App.jsx` в `src/features/dialogs/*`.
- [x] Вынести Sidebar и TopBar из `src/App.jsx` в `src/features/app-shell/*`.
- [x] Вынести ClientsScreen из `src/sections.jsx` в `src/features/clients/*` и общий `createScreenStateItems` в `src/app/*`.
- [x] Вынести PanelScreen из `src/sections.jsx` в `src/features/panel/*`.
- [x] Вынести ReportsScreen из `src/sections.jsx` в `src/features/reports/*`.
- [x] Вынести TemplatesScreen из `src/sections.jsx` в `src/features/templates/*`.
- [x] Вынести QualityScreen из `src/sections.jsx` в `src/features/quality/*`.
- [x] Вынести VisitorsScreen из `src/sections.jsx` в `src/features/visitors/*`.
- [x] Вынести AutomationScreen из `src/sections.jsx` в `src/features/automation/*`.
- [x] Вынести SettingsScreen из `src/sections.jsx` в `src/features/settings/*`.
- [ ] Продолжить разнос `App.jsx`, `src/styles.css` и крупных feature-экранов на подмодули.
- [x] Добавить расширенные фильтры и сортировки очереди диалогов.
- [x] Добавить полноценные статусы обращения и audit timeline.
- [x] Добавить upload/preview/error UI для вложений.
- [x] Добавить warning о несохраненном черновике при смене диалога.
- [x] Добавить детальную страницу клиента и merge/unmerge дублей.
- [x] Добавить многоуровневый справочник тематик с поиском, архивностью и правами.
- [x] Добавить детальные страницы каналов с логами, тестом сообщения и несколькими подключениями.
- [x] Добавить SDK playground с raw payload preview.
- [x] Применить role switcher и disabled states ко всем разделам.
- [x] Добавить управление сотрудниками, группами, паролями и каналами сотрудника.
- [x] Расширить отчеты chart-блоками, настройкой колонок, retry/download states.
- [x] Добавить inline AI-панель в чат и audit AI-действий.
- [x] Добавить AI explainability и pre-send quality check в composer.
- [x] Расширить AI-контур до real-time scoring, coaching queue и analytics UI.
- [x] Добавить topbar notification center с SLA, mention, channel error, export-ready, фильтрами, подписками и history.
- [x] Добавить live bot handoff summary в чат оператора.
- [x] Добавить редактор базы знаний со статусом публикации, каналами и preview.
- [x] Расширить базу знаний до approval history, версий статьи, вложений и self-service preview.
- [x] Добавить visual builder proactive-правил с preview и A/B управлением.
- [ ] Backend integration: proactive delivery, серверные frequency caps, сохранение экспериментов, таргетинг и аналитика эффективности.
- [x] Добавить rescue timer в чат и отчет спасенных/пропущенных диалогов.
- [ ] Backend integration: rescue server countdown, автоматический возврат, настройки по каналу/очереди/роли и backend outcome analytics.
- [x] Добавить canvas/flow-builder ботов с нодами, тестовым transcript preview и импортом/экспортом.
- [x] Добавить bot after-hours policy, channel assignment, bot metrics и handoff summary UI.
- [ ] Backend integration: bot runtime, публикация/версии сценариев, реальные bot metrics, audit import/export/test/publish и production handoff events.
- [x] Добавить системные loading/empty/error states для всех разделов.
- [x] Добавить smoke/e2e сценарии для критичных flows: states, app shell role access/notification drawer close, queue filters/tabs, customer panel template/close-topic guard, outbound quick action, save-template modal semantics, draft-switch warning, rescue, notification filters/subscriptions/history, AI explainability/pre-send, AI scoring/coaching, knowledge editor, bot builder/channel assignment и responsive.
- [x] Провести responsive QA на 390, 768, 1024 и 1440 px.
