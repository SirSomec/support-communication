# Product/search brief Support Communication — SEM-00

Статус: готов к продуктовой проверке  
Дата среза: 2026-08-07  
Рынок исследования: Россия; контрольные регионы выдачи — Россия, Москва и Санкт-Петербург  
Область: продуктовые факты и ограничения для SEM-02–SEM-09 и первой волны коммерческих страниц

## 1. Назначение и правило доказательности

Этот brief определяет, кому и о каких возможностях Support Communication допустимо писать в поисковых и коммерческих материалах. Он не подтверждает рыночный спрос и не выбирает будущие URL: это должны сделать SERP-, Wordstat- и кластерный анализ.

Источники трактуются в следующем порядке:

1. Подключённый runtime-код, контроллеры, worker-ы и текущие продуктовые экраны.
2. Канонические runtime-каталоги тарифов и ролей.
3. Тесты и реестр полноты как дополнительное подтверждение и источник оговорок.
4. Публичный текст лендинга — только как действующая формулировка, но не как доказательство факта.
5. Старые планы, seed-данные и демонстрационные примеры не являются доказательством функции или результата.

Статусы ниже:

- **подтверждено реализацией** — есть подключённый runtime-контур, API или работающий пользовательский путь;
- **подтверждено условно** — функция реализована, но требует внешних credentials, тарифа, провайдера или отдельной live-приёмки;
- **гипотеза** — пригодно для исследования спроса, но не доказано клиентскими данными;
- **запрещено до подтверждения** — нельзя использовать как публичное обещание в первой волне.

## 2. Позиционирование для исследования

Рабочая категория: B2B-платформа для организации клиентской поддержки, объединяющая обращения, работу операторов, маршрутизацию, SLA, качество, отчётность, автоматизацию и интеграции.

Подтверждение категории:

- текущая главная страница позиционирует продукт как единый операционный контур поддержки и показывает рабочее место оператора: [LandingPage.jsx:291–337](../../src/features/public/LandingPage.jsx#L291);
- в приложение подключены отдельные runtime-модули диалогов, маршрутизации, качества, отчётов, автоматизации, интеграций и знаний: [app.module.ts:27–50](../../backend/apps/api-gateway/src/app.module.ts#L27);
- канонические публичные страницы сейчас ограничены главной, тарифами и документацией: [publicRouteManifest.js:9–58](../../src/public/seo/publicRouteManifest.js#L9).

Границы позиционирования:

- продукт нельзя называть CRM общего назначения, телефонией, call-центром или системой email-тикетов: таких полных контуров реализация не подтверждает;
- «омниканальность» допустима только с перечислением фактически поддержанных каналов и оговорками из раздела 6;
- «готово к продакшену», «работает в продакшене» и аналогичные утверждения требуют не только наличия кода, но и актуального live-smoke конкретного внешнего провайдера.

## 3. ICP и роли в покупке

### 3.1. Рабочий ICP

| Сегмент/роль | Статус | Job-to-be-done для исследования | Основание и ограничение |
| --- | --- | --- | --- |
| Руководитель клиентской поддержки / руководитель смены | Гипотеза с сильным product fit | Свести каналы в одну очередь, видеть загрузку, SLA, просрочки, качество и отчёты | Для руководителя реализованы workload, назначения, перераспределение, SLA и rescue: [routing.controller.ts:14–106](../../backend/apps/api-gateway/src/routing/routing.controller.ts#L14). Но интервью/лиды, подтверждающие его как основного покупателя, в репозитории отсутствуют. |
| Операционный руководитель | Гипотеза | Стандартизировать работу поддержки, контролировать результат и выгрузки | Реализованы отчётный workspace, routing activity и export jobs: [report.controller.ts:15–114](../../backend/apps/api-gateway/src/reports/report.controller.ts#L15). Покупательская роль данными не подтверждена. |
| Владелец малого бизнеса | Гипотеза с подтверждённым onboarding-path | Самостоятельно запустить поддержку сайта одним сотрудником и затем расширить команду | Free рассчитан на одного owner: [tariff-catalog.ts:5–20](../../backend/apps/api-gateway/src/billing/tariff-catalog.ts#L5), а публичная регистрация принудительно создаёт Free-организацию: [tenant-provision.controller.ts:11–27](../../backend/apps/api-gateway/src/identity/tenant-provision.controller.ts#L11). Реального customer-fit подтверждения нет. |
| IT/интеграционный руководитель или разработчик | Вторичная гипотеза | Подключить сайт, собственный канал, API или webhooks безопасным воспроизводимым способом | Публичная документация покрывает SDK, Open Channel, файлы, CSAT и webhooks: [ApiDocsPage.jsx:25–62](../../src/features/public/ApiDocsPage.jsx#L25), [ApiDocsPage.jsx:423–461](../../src/features/public/ApiDocsPage.jsx#L423). |
| ИБ/compliance reviewer | Влияющая роль, не основной ICP | Проверить роли, изоляцию, аудит и обработку секретов | RBAC и отдельный service-admin контур реализованы: [runtime-catalog.ts:23–63](../../backend/apps/api-gateway/src/identity/runtime-catalog.ts#L23). Нельзя выводить из этого соответствие конкретному закону или прохождение внешнего security review. |

Решение для семантики: основные seed-кластеры строить вокруг задач руководителя поддержки и владельца небольшой команды; интеграционные запросы вести отдельным кластером. Не утверждать, что это фактический портрет клиента, пока нет обезличенных данных интервью, продаж или заявок.

### 3.2. Подтверждённые пользователи продукта

| Роль в продукте | Подтверждённая зона работы | Evidence |
| --- | --- | --- |
| Сотрудник / оператор первой линии | Диалоги, клиенты, шаблоны и собственный presence | Каноническая роль `employee`: [runtime-catalog.ts:23–30](../../backend/apps/api-gateway/src/identity/runtime-catalog.ts#L23). |
| Старший сотрудник / руководитель смены | Управление диалогами, панель и маршрутизация, отчёты/экспорт, качество, знания | Каноническая роль `senior`: [runtime-catalog.ts:32–47](../../backend/apps/api-gateway/src/identity/runtime-catalog.ts#L32). |
| Администратор организации / владелец | Полный tenant-доступ, настройки и интеграции | Каноническая роль `admin`, включая alias `owner`: [runtime-catalog.ts:49–55](../../backend/apps/api-gateway/src/identity/runtime-catalog.ts#L49). |
| Администратор платформы | Внутреннее управление сервисом, отделённое от ролей организации | Отдельный service-admin профиль: [access.js:3–50](../../src/app/access.js#L3). Не включать его в пользовательское обещание коммерческой страницы. |

### 3.3. Размер организации

Реализация тарифов поддерживает ступени в 1, 3, 15, 35 и 70 пользователей: [tariff-catalog.ts:3–94](../../backend/apps/api-gateway/src/billing/tariff-catalog.ts#L3). Поэтому диапазон **1–70 сотрудников поддержки** допустим как рабочая граница исследования, но не как доказанный ICP или ограничение всей платформы.

Нельзя пока утверждать:

- что наиболее конверсионный сегмент — именно малый/средний бизнес;
- что продукт успешно эксплуатируется командой конкретного размера;
- что 70 пользователей — технический максимум платформы, а не текущая коммерческая комплектация.

## 4. Подтверждённые продуктовые возможности

| Возможность | Допустимая формулировка для исследования/brief | Статус и evidence |
| --- | --- | --- |
| Единое рабочее место и очередь диалогов | «Работа с обращениями из подключённых каналов в одном рабочем месте» | Подтверждено реализацией: conversation и routing модули подключены в composition root [app.module.ts:27–48](../../backend/apps/api-gateway/src/app.module.ts#L27); frontend имеет отдельный dialog workspace и permission model [access.js:6–31](../../src/app/access.js#L6). |
| Web SDK / чат на сайте | «Виджет и Public SDK API для сообщений, файлов, presence, ответов и оценок» | Подтверждено реализацией: endpoints identify/messages/uploads/presence/ratings/polling [public-api.controller.ts:64–142](../../backend/apps/api-gateway/src/integrations/public-api.controller.ts#L64), [public-api.controller.ts:160–213](../../backend/apps/api-gateway/src/integrations/public-api.controller.ts#L160), [public-api.controller.ts:292–419](../../backend/apps/api-gateway/src/integrations/public-api.controller.ts#L292). Нужны SDK key и домен. |
| Telegram | «Подключение Telegram-бота для входящих обращений и ответов операторов» | Подтверждено условно: webhook подключён [telegram-webhook.controller.ts:12–27](../../backend/apps/api-gateway/src/integrations/telegram-webhook.controller.ts#L12), исходящая отправка использует Bot API [telegram-outbound.dispatcher.ts:46–106](../../backend/apps/api-gateway/src/integrations/telegram-outbound.dispatcher.ts#L46), настройки подключения доступны tenant-администратору [integration.controller.ts:338–385](../../backend/apps/api-gateway/src/integrations/integration.controller.ts#L338). Нужен действующий bot token и live-smoke. |
| ВКонтакте | «Интеграция сообщества ВКонтакте с приёмом обращений и ответами» | Подтверждено условно: отдельный verified webhook [provider-webhook.controller.ts:13–29](../../backend/apps/api-gateway/src/integrations/provider-webhook.controller.ts#L13), настройка callback/credentials [integration.service.ts:297–381](../../backend/apps/api-gateway/src/integrations/integration.service.ts#L297), outbox отправляет через `messages.send` [outbox-worker/index.ts:1355–1390](../../backend/apps/outbox-worker/src/index.ts#L1355). Финальная live-приёмка с реальными credentials остаётся отдельным gate [product-completeness-register.md:35](../product-completeness-register.md#L35). |
| MAX | «Интеграция MAX с приёмом обращений и ответами» | Подтверждено условно: отдельный webhook [provider-webhook.controller.ts:30–35](../../backend/apps/api-gateway/src/integrations/provider-webhook.controller.ts#L30), подписка провайдера и credentials [integration.service.ts:305–358](../../backend/apps/api-gateway/src/integrations/integration.service.ts#L305), исходящая доставка реализована в outbox [outbox-worker/index.ts:1401–1430](../../backend/apps/outbox-worker/src/index.ts#L1401). Для публичного «работает в продакшене» нужен live-smoke. |
| Маршрутизация и SLA | «Назначение и перераспределение диалогов, контроль SLA и rescue просроченных обращений» | Подтверждено реализацией: workload, assignment/simulation, redistribution, SLA pause и rescue endpoints [routing.controller.ts:14–106](../../backend/apps/api-gateway/src/routing/routing.controller.ts#L14). Не обещать конкретное улучшение времени ответа. |
| Отчёты и выгрузки | «Отчёты по работе поддержки и асинхронные выгрузки» | Подтверждено реализацией: workspace, routing activity, export request/retry/download [report.controller.ts:15–114](../../backend/apps/api-gateway/src/reports/report.controller.ts#L15). Для исторических данных возможны неизвестные значения; это явно зафиксировано в реестре полноты [product-completeness-register.md:30](../product-completeness-register.md#L30). |
| Качество и клиентские оценки | «CSAT, ручные проверки и оценка черновиков/AI-решений» | Подтверждено реализацией: quality workspace, draft score, ratings, manual reviews и AI suggestion decisions [quality.controller.ts:15–118](../../backend/apps/api-gateway/src/quality/quality.controller.ts#L15); SDK rating endpoint [public-api.controller.ts:337–373](../../backend/apps/api-gateway/src/integrations/public-api.controller.ts#L337). Внешний AI-провайдер и его доступность должны оговариваться. |
| AI-бот и handoff | «Настраиваемые bot-сценарии, тестовый sandbox и передача оператору» | Подтверждено условно: создание/версионирование/публикация сценариев, test runs и sandbox подключены к API [automation.controller.ts:24–219](../../backend/apps/api-gateway/src/automation/automation.controller.ts#L24), [automation.controller.ts:238–311](../../backend/apps/api-gateway/src/automation/automation.controller.ts#L238); handoff endpoint [automation.controller.ts:340–357](../../backend/apps/api-gateway/src/automation/automation.controller.ts#L340). Реальные AI-ответы зависят от модели, лимитов и активного сценария. |
| Источники знаний | «Статьи/документы/URL и управляемые источники знаний для поиска и AI-сценариев» | Подтверждено реализацией: CRUD, refresh, ingestion и preview endpoints [knowledge-sources.controller.ts:10–87](../../backend/apps/api-gateway/src/knowledge-sources/knowledge-sources.controller.ts#L10); MCP — отдельный read-only контур, подключённый в модуле [knowledge-sources.module.ts:8–17](../../backend/apps/api-gateway/src/knowledge-sources/knowledge-sources.module.ts#L8). |
| API, Open Channel и webhooks | «Public SDK API, Open Channel и подписанные исходящие webhooks для интеграций» | Подтверждено реализацией: Open Channel receive/status и совместимые bridges [open-channel-public.controller.ts:32–122](../../backend/apps/api-gateway/src/integrations/open-channel/open-channel-public.controller.ts#L32); публичная документация описывает раздельные Open Channel/webhook контуры [ApiDocsPage.jsx:423–461](../../src/features/public/ApiDocsPage.jsx#L423). Не называть весь внутренний API публичным. |
| Роли и аудит | «Ролевое разграничение и журнал событий в рамках организации» | Подтверждено реализацией: роли и actions [runtime-catalog.ts:23–63](../../backend/apps/api-gateway/src/identity/runtime-catalog.ts#L23), tenant audit events защищены permission [workspace-audit.controller.ts:8–22](../../backend/apps/api-gateway/src/audit/workspace-audit.controller.ts#L8). Формулировка «100% всех действий» запрещена без проверки полного event coverage. |
| Проактивные приглашения посетителям | «Presence и проактивные приглашения через Web SDK» | Подтверждено реализацией: heartbeat/disconnect/invitations endpoints [public-api.controller.ts:98–142](../../backend/apps/api-gateway/src/integrations/public-api.controller.ts#L98). Нужны активная конфигурация SDK и правила. |

## 5. Тарифная модель и conversion paths

### 5.1. Что подтверждено тарифным runtime

Канонический каталог содержит:

| Тариф | Пользователи | Текущий публичный путь |
| --- | ---: | --- |
| Free | 1, только владелец | Самостоятельная регистрация |
| Starter | до 3 | CTA «Попробовать бесплатно» ведёт сначала в Free-onboarding |
| Business | до 15 | CTA «Попробовать бесплатно» ведёт сначала в Free-onboarding |
| Scale | до 35 | CTA «Попробовать бесплатно» ведёт сначала в Free-onboarding |
| Enterprise | до 70 | Запрос контакта/демо |

Источник комплектаций и change policy: [tariff-catalog.ts:3–94](../../backend/apps/api-gateway/src/billing/tariff-catalog.ts#L3). Публичная страница загружает этот каталог через `/public/catalog/tariffs`: [billing.controller.ts:174–183](../../backend/apps/api-gateway/src/billing/billing.controller.ts#L174), [PricingPage.jsx:25–49](../../src/features/public/PricingPage.jsx#L25).

Размер тарифа — это текущая коммерческая конфигурация, а не доказательство производительности. Цены и наборы функций в будущих SEO-текстах должны либо читаться из канонического каталога, либо проходить повторную проверку перед публикацией.

### 5.2. Conversion path A — бесплатная регистрация

```text
Коммерческая/тарифная страница
→ «Начать бесплатно» / «Попробовать бесплатно»
→ /#/onboarding
→ POST /api/v1/tenants/provision
→ Free-организация + владелец + SDK-подключение
```

Evidence:

- public handler переводит пользователя на `#/onboarding`: [PublicSiteApp.jsx:123–126](../../src/public/PublicSiteApp.jsx#L123);
- frontend всегда отправляет `plan.id = free` и вызывает публичный provision API: [tenantProvisionService.js:19–50](../../src/services/tenantProvisionService.js#L19);
- backend также принудительно фиксирует Free, независимо от входного payload: [tenant-provision.controller.ts:11–27](../../backend/apps/api-gateway/src/identity/tenant-provision.controller.ts#L11);
- Free запрещает приглашать сотрудников и ограничивает владельца одним местом: [tenant-provision.service.ts:113–140](../../backend/apps/api-gateway/src/identity/tenant-provision.service.ts#L113).

Допустимый primary CTA: **«Начать бесплатно»**.  
Недопустимо обещать: моментальную покупку любого платного тарифа с публичной страницы, trial платного тарифа или регистрацию без указания реального домена SDK — текущий backend требует домен [tenant-provision.service.ts:118–130](../../backend/apps/api-gateway/src/identity/tenant-provision.service.ts#L118).

### 5.3. Conversion path B — запрос демо/контакта

```text
Главная или Enterprise-тариф
→ открыть форму
→ имя + компания + email + сообщение + согласие
→ POST /api/v1/public/demo-requests
→ сохранённая заявка со статусом queued и notification descriptor
```

Evidence:

- форма и обязательные поля: [LandingPage.jsx:576–679](../../src/features/public/LandingPage.jsx#L576);
- public handler отправляет запрос и показывает успех только при `status === ok`: [PublicSiteApp.jsx:100–115](../../src/public/PublicSiteApp.jsx#L100);
- backend валидирует имя, компанию, email, сообщение и consent: [public-demo-request.service.ts:194–224](../../backend/apps/api-gateway/src/integrations/public-demo-request.service.ts#L194);
- заявка, audit event и notification descriptor сохраняются как queued: [public-demo-request.service.ts:142–190](../../backend/apps/api-gateway/src/integrations/public-demo-request.service.ts#L142).

Допустимый secondary CTA: **«Запросить демо»** / **«Обсудить задачу»**.  
Недопустимо обещать время ответа, звонок в тот же день или гарантированную доставку конкретному менеджеру без отдельного операционного SLA.

## 6. Матрица каналов

| Канал/интерфейс | Решение для первой волны | Что можно говорить | Что нельзя говорить |
| --- | --- | --- | --- |
| Web SDK / чат сайта | Включать в семантику | Виджет, сообщения, файлы, presence, ответы и CSAT при настройке SDK | «Установка одной строкой и полностью готово за минуты» без измеренного onboarding evidence |
| Telegram | Включать в семантику | Подключение бота, входящие диалоги и ответы операторов | Что любой Telegram-аккаунт подключается без bot token/configuration |
| ВКонтакте | Исследовать; публикация после live-gate | Реализована интеграция сообществ с webhook и ответами | «Уже работает в продакшене» без актуальной приёмки реальных credentials |
| MAX | Исследовать; публикация после live-gate | Реализована интеграция с webhook и ответами | «Уже работает в продакшене» без актуальной приёмки реальных credentials |
| REST/Public SDK API | Включать отдельным интеграционным кластером | Документированные public endpoints и SDK use cases | Что все внутренние endpoints открыты внешнему клиенту |
| Open Channel/webhooks | Включать отдельным интеграционным кластером | Приём событий по token и подписанная исходящая webhook-доставка при настройке signing secret | Гарантированная совместимость с любым helpdesk без интеграционной проверки |
| Email | Не использовать как работающий канал | Только «планируется/на подключении», если такая roadmap-формулировка вообще нужна | «Email-обращения уже попадают в единую очередь» и `email-support` как доказанную продуктовую функцию |
| WhatsApp | Не использовать как работающий канал | Только «на подключении» | Любые обещания live-интеграции |
| Viber | Не использовать как работающий канал | Только «на подключении» | Любые обещания live-интеграции |

Email требует отдельного продуктового решения: текущий лендинг явно помечает Email как «на подключении» [LandingPage.jsx:58–66](../../src/features/public/LandingPage.jsx#L58), но Free и Starter содержат feature `email-support` [tariff-catalog.ts:5–38](../../backend/apps/api-gateway/src/billing/tariff-catalog.ts#L5). До устранения конфликта feature нельзя трактовать ни как email-канал, ни как гарантированную поддержку по почте.

## 7. Разрешённые публичные claims

При сохранении указанных оговорок допускаются следующие базовые обещания:

1. Support Communication помогает работать с обращениями из подключённых каналов в одном рабочем месте.
2. В продукте есть роли оператора, старшего сотрудника и администратора организации.
3. Реализованы назначение и перераспределение обращений, SLA и работа с просроченными диалогами.
4. Доступны отчёты и выгрузки; конкретный состав и полнота исторических данных зависят от накопленных событий.
5. Web SDK поддерживает сообщения, файлы, presence, polling ответов и оценки.
6. Telegram-бот может принимать обращения и доставлять ответы операторов после настройки.
7. Реализованы интеграционные контуры ВКонтакте и MAX; публичное утверждение об их live-production статусе требует отдельного подтверждения.
8. Есть настраиваемые bot-сценарии, sandbox, источники знаний и handoff; AI-ответ зависит от активного сценария, модели и лимитов.
9. Есть Public SDK API, Open Channel и webhook-интеграции в пределах документированных endpoints.
10. Free создаёт организацию для одного владельца без публичной покупки платного тарифа.
11. Можно отправить заявку на демо; система принимает и ставит валидную заявку в очередь.

Каждая будущая коммерческая страница должна использовать только релевантное подмножество claims, а не повторять весь список.

## 8. Запрещённые и неподтверждённые claims

### 8.1. Результаты, клиенты и social proof

До появления первичных доказательств запрещены:

- `−38%` времени первого ответа, «первый ответ почти вдвое быстрее» и любые другие проценты улучшения;
- «1 день от регистрации до первого диалога», «запуск за день/вечер/минуты» как обещание результата;
- «100% действий в аудите» и другие абсолютные показатели покрытия;
- отзывы Марины, Алексея и Дмитрия как реальные клиентские отзывы — в коде они подписаны как «пример отзыва»: [LandingPage.jsx:107–125](../../src/features/public/LandingPage.jsx#L107);
- логотипы/названия «Нордвэй», «Контур», «Пик», «Ритм», «Орбита» как реальные клиенты — блок явно обозначен примерами: [LandingPage.jsx:169–198](../../src/features/public/LandingPage.jsx#L169);
- любые рейтинги, число клиентов, операторов, диалогов, скорость, uptime или ROI без датированного источника и методики.

Текущие hero metrics находятся прямо в массиве статического контента [LandingPage.jsx:29–33](../../src/features/public/LandingPage.jsx#L29); наличие на лендинге не превращает их в evidence.

### 8.2. Юридические, инфраструктурные и security claims

Запрещено до документального подтверждения:

- соответствие 152-ФЗ, требованиям ФСТЭК/ФСБ или отраслевым стандартам;
- включение в реестр российского ПО, «импортозамещение» и российское происхождение ПО;
- on-premise/private cloud поставка;
- хранение всех данных исключительно в России или гарантированный выбор страны хранения;
- прохождение внешнего security review или отсутствие замечаний;
- «полное маскирование PII во всех контурах», «полная неизменяемость всех событий», «невозможность утечки»;
- конкретные RPO/RTO, uptime и SLA как клиентское обязательство без утверждённых условий договора.

### 8.3. Функциональные и коммерческие claims

Запрещено или требует отдельного gate:

- Email, WhatsApp и Viber как работающие каналы;
- live-production статус VK/MAX без актуальной внешней приёмки;
- телефония, звонки, call tracking и полноценный call-center;
- коробочная CRM, продажи, маркетинговая автоматизация или массовые рассылки;
- «любой канал», «любая интеграция», «все мессенджеры»;
- автоматическое решение всех обращений AI-ботом, гарантированная точность/скорость AI и бесплатные AI-ответы;
- SSO, dedicated success, data residency и custom SLA как безусловно доступные всем клиентам: они присутствуют в Enterprise-каталоге [tariff-catalog.ts:77–92](../../backend/apps/api-gateway/src/billing/tariff-catalog.ts#L77), но требуют отдельного технического/коммерческого evidence для текста;
- самостоятельная покупка платного тарифа прямо с публичной pricing page: текущие CTA не выполняют такой checkout;
- бесплатный тариф как командное решение: он owner-only и ограничен одним пользователем.

## 9. Поисковая география и язык

- Основной язык: русский.
- Основной рынок: Россия.
- SERP/Wordstat: Россия как основной срез; Москва и Санкт-Петербург — отдельные контрольные срезы.
- Валюта публичного каталога: RUB: [billing.service.ts:100–115](../../backend/apps/api-gateway/src/billing/billing.service.ts#L100).
- Onboarding по умолчанию использует регион `ru-1`: [tenantProvisionService.js:5–10](../../src/services/tenantProvisionService.js#L5).
- Городские SEO-страницы не создаются; различия Москвы/Санкт-Петербурга используются только для анализа выдачи и спроса.

Ни RUB, ни `ru-1` сами по себе не доказывают российскую юрисдикцию компании, статус российского ПО или локализацию всех данных.

## 10. Владелец продуктовой проверки

Обязательный reviewer для всех claims и Gate A/B: **владелец продукта / лицо, отвечающее за коммерческую достоверность Support Communication**.

Конкретное имя, должность и резервный reviewer в репозитории не зафиксированы. До назначения:

- статус этого документа — «готов к продуктовой проверке», а не «утверждён»;
- нельзя публиковать новые коммерческие страницы;
- reviewer должен отдельно подтвердить ICP, live-статус внешних каналов, тарифные условия, delivery demo-заявок и любые security/legal claims.

Рекомендуемая запись решения:

```text
Product reviewer: <ФИО/роль>
Reviewed at: <YYYY-MM-DD>
Decision: approved | approved with exclusions | rejected
Exclusions/evidence links: <...>
```

## 11. Решения для следующих этапов

### Допустить в SEM-02/SEM-03 как seed-направления

- система/платформа поддержки клиентов, единое окно и общая очередь;
- управление обращениями и операторами поддержки;
- чат/Web SDK для сайта;
- Telegram для клиентской поддержки;
- омниканальность — только с явным перечислением каналов;
- маршрутизация, распределение обращений, SLA и просрочки;
- отчёты и контроль качества поддержки;
- AI-бот первой линии, база/источники знаний и передача оператору;
- API, Open Channel, webhooks и интеграция helpdesk-сценариев;
- поддержка ВКонтакте и MAX как отдельные исследовательские гипотезы с live-gate.

### Исключить или отложить

- Email/WhatsApp/Viber как live-кластеры;
- телефонию и call-center;
- on-premise, 152-ФЗ, импортозамещение и реестр российского ПО;
- страницы с обещанием конкретного результата/срока запуска;
- страницы-кейсы и отраслевые страницы без реальных клиентов и уникального evidence;
- сравнительные страницы с брендами конкурентов до отдельной фактологической и правовой проверки.

Назначение URL остаётся запрещено до SERP-кластеризации и Gate A.

## 12. Открытые продуктовые пробелы перед Gate A

1. Нет подтверждённых интервью, сегментации заявок или продаж, поэтому ICP — рабочая гипотеза.
2. Не назначен конкретный product reviewer.
3. Требуется актуальный live-smoke VK и MAX с реальными credentials перед сильным production claim.
4. Нужно устранить конфликт `email-support` в тарифах и статуса Email «на подключении».
5. Нужна коммерческая проверка feature mapping тарифов, особенно SSO, data residency, dedicated success и custom SLA.
6. Нужна операционная проверка доставки demo notification и реального процесса ответа; backend доказывает только постановку заявки в очередь.
7. Текущие hero metrics, примеры отзывов и примеры логотипов не пригодны как evidence для новых страниц.
8. Нужна проверка полного scope audit/redaction перед любыми абсолютными security claims.
9. Нужна проверка, какие форматы отчётных выгрузок и периоды гарантируются клиенту, а какие зависят от накопленных событий.
10. Нужно решить, остаются ли ВКонтакте/MAX в первой волне после оценки спроса или откладываются до live-gate.

## 13. Критерии приёмки SEM-00

- [x] Зафиксированы рабочий ICP и влияющие роли; гипотезы отделены от доказанных ролей продукта.
- [x] Зафиксирован рабочий размер клиента и его связь с текущими тарифами.
- [x] Перечислены поддерживаемые, условно поддерживаемые и неподдерживаемые каналы.
- [x] Для разрешённых продуктовых обещаний приведены implementation-evidence ссылки.
- [x] Сформирован запретный список количественных, клиентских, юридических, security и функциональных claims.
- [x] Зафиксированы два фактических conversion path: Free-регистрация и demo request.
- [x] Зафиксирована география исследования.
- [ ] Product reviewer назначен по имени и утвердил brief.

Итог: документ достаточен для начала SEM-02 и сбора SERP-гипотез, но новые коммерческие страницы остаются заблокированы до продуктового review и Gate A.
