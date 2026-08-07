# Как конкуренты занимают поисковую выдачу поддержки клиентов

Статус: SEM-06 завершён; вход для SEM-08/SEM-09  
Дата проверки: 2026-08-07  
Аудитория: продукт, маркетинг, SEO и разработка Support Communication  
Рынок: российская русскоязычная B2B-выдача

## Executive Summary

- **Лидеры получают видимость за счёт портфеля страниц, а не повторения ключей на главной.** Kaiten и Usedesk сочетают продуктовые посадочные с guide/listicle-материалами; Okdesk, HappyDesk и ITSM 365 дополняют главные страницы отдельными материалами по SLA, API и омниканальности. Это безопасно повторять как архитектурный принцип после SERP-кластеризации.
- **Коммерческая страница обычно отвечает сразу на четыре вопроса:** для кого продукт, какие задачи решает, как выглядит в работе и что сделать дальше. У 8 из 15 игроков есть самостоятельный free/trial/registration path; ещё у 8 есть demo/sales path, часто оба. На 11 страницах обнаружена явная ссылка на тарифы, но только HelpDeskEddy показал конкретную цену прямо на проверенном ранжирующемся URL.
- **Доверие строится на доказательствах, которых у Support Communication пока нет.** Конкуренты используют клиентские кейсы, логотипы, количественные результаты, годы на рынке, реестр российского ПО и отраслевые истории. Их формат можно изучать, но цифры, бренды и юридические claims нельзя заимствовать или имитировать без собственных первичных доказательств и разрешений.
- **У Support Communication есть достижимый дифференциатор:** честно показывать реальный operator workflow, Web SDK/API, маршрутизацию, SLA, AI-handoff и актуальный статус каналов; связывать каждое обещание с product evidence; держать public bundle легче тяжёлых Tilda-страниц. До Gate A нельзя заранее создавать `/helpdesk/` или другие URL только потому, что они есть у конкурентов.

## 1. Что именно проверено

Исходный SERP-срез содержит 120 органических результатов: 12 запросов × TOP-5 Яндекса и Google, по 60 строк на поисковик. Сбор выполнен 7 августа 2026 года с 18:37:29 до 18:38:45 UTC:

- [03-serp-snapshots-partial.csv](03-serp-snapshots-partial.csv) — запрос, поисковик, регион, позиция, URL, title/snippet и тип страницы;
- [04-competitor-register-draft.csv](04-competitor-register-draft.csv) — частота появления, кластеры и предварительная классификация;
- [00-product-search-brief.md](00-product-search-brief.md) — разрешённые и запрещённые claims Support Communication.

Для SEM-06 выбраны все 15 продуктовых и смежных игроков из реестра. У каждого проверен фактически ранжировавшийся URL или связанная продуктовая страница. Title и H1 ниже описаны по смыслу, без копирования формулировок. Проверялись:

- offer, структура контента, CTA, наличие цены/ссылки на тарифы;
- product evidence, кейсы и trust-сигналы;
- видимые внутренние ссылки на features, роли, отрасли, блог, документацию, API и кейсы;
- raw HTML: HTTP-доступность, title, H1, canonical, viewport, JSON-LD и ориентировочный объём HTML;
- только метаданные mobile-readiness; полноценный визуальный mobile QA и Core Web Vitals не выполнялись.

Наблюдения отражают состояние страниц на дату проверки, а не независимую верификацию продуктовых или клиентских утверждений конкурентов.

## 2. Выдачу занимают коммерческие страницы и контент вместе

В выборке 13 из 15 основных URL — homepage или feature/solution landing; Jivo и Directum ранжируются редакционными материалами. При этом у лидеров с тремя и более появлениями почти всегда есть оба контура:

1. **Коммерческий:** homepage, solution/feature page, тарифы, регистрация или демо.
2. **Информационный:** объяснение категории, SLA, автоматизации, AI, API, сравнение инструментов или сценарий внедрения.

Это объясняет повторное присутствие одного домена по разным запросам:

| Домен | Строк в частичном TOP-5 | Разных запросов | Что ранжируется |
| --- | ---: | ---: | --- |
| Kaiten | 8 | 4 | Service Desk landing + определение helpdesk + рейтинг систем |
| Usedesk | 7 | 5 | Homepage + материалы об автоматизации и инструментах поддержки |
| Okdesk | 4 | 4 | Homepage + SLA-материал + API docs |
| HappyDesk | 4 | 3 | Homepage + SLA-материал |
| Jivo | 4 | 3 | AI-support guide и общий API explainer |
| AutoFAQ | 4 | 2 | Homepage + AI/automation guides |
| HelpDeskEddy | 3 | 3 | Homepage + AI feature + API page |
| Naumen | 3 | 2 | CSM product landing + helpdesk explainer |

**Вывод для Support Communication:** одна главная не должна одновременно владеть категорией, каналом, AI, SLA и API. Отдельный URL оправдан только отдельным SERP-интентом; информационный контент должен поддерживать коммерческий cluster и ссылаться на соответствующую продуктовую страницу.

## 3. Аудит 15 конкурентов

### 3.1. Прямые продуктовые конкуренты

#### Kaiten

Проверенная страница: [модуль «Служба поддержки»](https://kaiten.ru/features/service-desk/)

- **Title/H1 intent:** category-rich title объединяет Service Desk, Help Desk и учёт заявок; H1 переводит это в пользовательскую задачу единого окна для внешних и внутренних обращений.
- **Offer:** отдельный модуль внутри более широкой work-management платформы; формы, email/Telegram/портал, карточка заявки, SLA, отчёты и оценка сервиса.
- **CTA/pricing:** повторяемый CTA бесплатной регистрации; ссылка на тарифы есть, цена на проверенном URL не показана.
- **Evidence/content:** скриншоты продукта, пошаговый workflow, отчёты, перечень функций, legal/company-реквизиты и ссылка на реестр ПО. Есть отдельные кейсы, API, база знаний, внедрение и comparisons.
- **Internal linking:** особенно сильная hub-структура — features, роли команд, отрасли, блог, кейсы, документация, API и сравнения с альтернативами.
- **Поисковый подход:** одна solution page закрывает коммерческий intent, а статьи «что такое» и «рейтинг» занимают informational/comparison intent.
- **Что нам полезно:** отдельная страница под подтверждённый support workflow, продуктовые изображения, шаги «источник → очередь → оператор → отчёт», CTA Free.
- **Не повторять без evidence:** сроки настройки, отсутствие лимитов, on-premise и реестровые claims.

#### Usedesk

Проверенная страница: [главная Usedesk](https://usedesk.ru/)

- **Title/H1 intent:** title сохраняет категорию helpdesk, но H1 и hero переориентированы на AI-агентов и совместную работу AI + человека.
- **Offer:** AI поверх мультиканального helpdesk; подсказки, резюме, тональность, контроль качества и автоматизация типовых запросов.
- **CTA/pricing:** primary path — «Демо с экспертом»; есть отдельные тарифы и вход. Конкретная цена на главной не показана.
- **Evidence/content:** численные claims, страницы клиентов, research/guide/webinar/podcast-контент, role pages для руководителя поддержки, продаж и владельца бизнеса.
- **Internal linking:** product features, роли, тарифы, клиенты, блог, исследование, гайды и мобильные SDK.
- **Поисковый подход:** homepage адаптирована под актуальную AI-категорию, а статьи отдельно удерживают category, website-chat и automation-запросы.
- **Что нам полезно:** чёткая связка AI-бота и operator handoff; отдельные страницы под руководителя и интегратора — только если SERP подтвердит разные интенты.
- **Не повторять без evidence:** проценты автоматизации/экономии, сроки demo/setup, on-premise и любые клиентские результаты.

#### Okdesk

Проверенная страница: [главная Okdesk](https://okdesk.ru/)

- **Title/H1 intent:** продукт позиционируется шире helpdesk — заявки, выездное обслуживание и ТОиР; H1 повторяет категорийное обещание без информационного перегруза.
- **Offer:** B2B-сервисные процессы, техподдержка, ремонты, объекты и field service; это частично смежно, а не полностью совпадает с Support Communication.
- **CTA/pricing:** самостоятельный «Попробовать» ведёт на регистрацию; есть отдельная pricing page, цена на главной не показана.
- **Evidence/content:** заявлены годы на рынке и число клиентов; есть кейсы, отраслевые решения, исследования B2B-сервиса, документация по продукту и API, ссылка на реестр ПО.
- **Internal linking:** развитые feature/industry hubs, блог, help center, API docs и отдельные исследовательские проекты.
- **Structured data:** в raw HTML обнаружены `SoftwareApplication`, `Offer`, `AggregateRating`, `Organization` и связанные типы.
- **Поисковый подход:** homepage владеет широкой категорией; статьи по SLA и отдельная API-документация забирают узкие экспертные запросы.
- **Что нам полезно:** связать коммерческую страницу с API docs, SLA-материалом и конкретным product walkthrough.
- **Не повторять без evidence:** рейтинги, реестр, client counts, on-premise и field-service терминологию, которой нет в продукте.

#### HappyDesk

Проверенная страница: [главная HappyDesk](https://happydesk.ru/)

- **Title/H1 intent:** title включает «хелпдеск» и «тикетную систему»; H1 сводит offer к обращениям в одном окне и AI-боту.
- **Offer:** каналы, тикеты, AI, SLA, отчёты, база знаний, портал, API и телефония; дополнительно продвигается коробочная версия.
- **CTA/pricing:** два пути — 14-дневный trial без карты и demo; pricing page вынесена отдельно.
- **Evidence/content:** численные claims, годы на рынке, российские серверы/реестр, product sections, роли «оператор/руководитель/директор/предприниматель», FAQ и SLA-статьи.
- **Internal linking:** role pages, feature pages, pricing, on-premise, demo video, blog и API/integration pages.
- **Structured data:** обнаружены `FAQPage` и `BreadcrumbList`; FAQ видим на странице, поэтому schema соответствует контенту.
- **Поисковый подход:** категорийная homepage + role segmentation + узкий SLA content.
- **Что нам полезно:** dual CTA, честное сравнение Free/demo путей, видимый FAQ с реальными вопросами.
- **Не повторять без evidence:** trial другого тарифа, телефонию, email, on-premise, проценты экономии и юридические claims.

#### HelpDeskEddy

Проверенная страница: [главная HelpDeskEddy](https://helpdeskeddy.ru/)

- **Title/H1 intent:** title покрывает Help Desk и Service Desk; H1 обещает порядок в обращениях и сразу уточняет многоканальность, маршрутизацию и AI.
- **Offer:** широкий helpdesk с каналами, API, automation, отчётами, CSAT, базой знаний и интеграциями.
- **CTA/pricing:** 14 дней бесплатно и demo с экспертом; прямо на ранжирующейся странице показана облачная цена 2 000 ₽ за сотрудника в месяц.
- **Evidence/content:** самая сильная case architecture в выборке — отзывы с ролями, клиентские бренды, отдельные кейсы и количественные outcomes, затем pricing block.
- **Internal linking:** API, knowledge base, обучение, marketplace, feature pages, cases и стоимость.
- **Поисковый подход:** homepage закрывает category/commerce, а AI feature и API page ранжируются по отдельным кластерам.
- **Что нам полезно:** прозрачная цена из канонического каталога; product-led proof; кейс-структура «до → внедрение → измеримый результат» в будущем.
- **Не повторять сейчас:** чужую цену, «20+ каналов», клиентские цифры, импортозамещение и кейс-метрики без собственных разрешений и методики.

#### Naumen

Проверенная страница: [Naumen Customer Service Management](https://www.naumen.ru/products/csm/)

- **Title/H1 intent:** title называет enterprise CSM и обработку клиентских обращений; H1 сформулирован через задачи бизнеса, а не только название категории.
- **Offer:** сквозная обработка обращений по уровням поддержки, единый профиль, маршрутизация и интеграция с широкой экосистемой Naumen.
- **CTA/pricing:** demo и консультация; публичная цена на проверенном URL не найдена.
- **Evidence/content:** product tour, база знаний, success stories, ecosystem links, реестр российского ПО и сильные количественные performance claims.
- **Internal linking:** большая enterprise-архитектура: продукты, отрасли, истории успеха, knowledge, events и company trust.
- **Поисковый подход:** product landing обслуживает enterprise intent, а объясняющая Help Desk-страница ранжируется по категорийным запросам.
- **Что нам полезно:** problem-first блоки для руководителя и схема полного lifecycle обращения.
- **Не повторять без evidence:** 99,9%, ускорение в разы, high-load, персональные данные, реестр и enterprise ecosystem claims.

#### ITSM 365

Проверенная страница: [омниканальная поддержка ITSM 365](https://itsm365.com/product/support/omnichannel/)

- **Title/H1 intent:** exact-intent посадочная под омниканальную поддержку; H1 связывает каналы с бизнес-коммуникацией.
- **Offer:** единое окно без потери контекста; связанные product pages раскрывают заявки, автоматизацию, роли, отчёты и SLA.
- **CTA/pricing:** CTA бесплатной попытки ведёт на форму; явная цена на URL не найдена.
- **Evidence/content:** feature walkthrough, связанные страницы управления заявками, role pain points, документация/PDF и образовательные SLA-материалы.
- **Internal linking:** ticket management, product/support hub, блог, документы, school и контакты.
- **Поисковый подход:** узкие feature pages под omnichannel/ticket management и educational page под SLA.
- **Что нам полезно:** отдельная посадочная по каналу/операционному сценарию только при подтверждённом самостоятельном intent.
- **Не повторять без evidence:** 7 каналов, десятки automation tools, ускорение на 40%, телефонию/email/WhatsApp и ITSM-asset management.

### 3.2. Смежные конкуренты по AI, чату и омниканальности

#### Jivo

Проверенная страница: [guide про AI-бота поддержки](https://www.jivo.ru/blog/tutorials-jivo/ai-chatbot-support.html)

- **Title/H1 intent:** exact informational query про AI-чат-бота и автоматизацию поддержки.
- **Offer:** статья объясняет категорию, сценарии, handoff и приводит собственные/клиентские кейсы; коммерческий продукт встроен через contextual links.
- **CTA/pricing:** pricing и product links есть в общей навигации, но явный primary CTA в проверенном article body не зафиксирован.
- **Evidence/content:** дата, время чтения, product examples, кейсы с детальными численными результатами и ссылки на источники отдельных market claims.
- **Internal linking:** AI-оператор, тарифы, кейсы, API, security, industries и knowledge base.
- **Поисковый подход:** содержательный guide закрывает AI-intent лучше общей product page и мягко переводит к продукту.
- **Что нам полезно:** оригинальный guide с демонстрацией реального sandbox/handoff после первой коммерческой волны.
- **Не повторять:** кейсовые проценты, универсальность AI, мгновенные ответы, сравнение стоимости с человеком без собственного исследования.

#### AutoFAQ

Проверенная страница: [главная AutoFAQ](https://autofaq.ai/)

- **Title/H1 intent:** title перечисляет AI-продукты для поддержки клиентов и сотрудников; H1 объединяет их зонтиком AI-агентов.
- **Offer:** AI-first portfolio: чат-платформа, copilot, классификатор, поиск по знаниям, sales/employee support.
- **CTA/pricing:** demo/application path и отдельные тарифы; конкретные цены на главной не показаны.
- **Evidence/content:** крупные usage claims, отраслевые сегменты, кейсы, product tabs, economic-effect calculator и technical thought leadership.
- **Internal linking:** отдельные продукты, use cases, industries, tariffs, demo, кейсы и статьи.
- **Поисковый подход:** homepage концентрирует AI-категорию, статьи занимают «автоматизация поддержки» и «интеграция AI-бота».
- **Что нам полезно:** отдельное объяснение AI roles — бот первой линии, помощник оператора, классификация — если каждое подтверждено продуктом.
- **Не повторять:** миллионы обращений, «в несколько раз», экономический эффект и отраслевые claims без данных.

#### Webim

Проверенная страница: [чат для сайта Webim](https://webim.ru/chat-for-site/)

- **Title/H1 intent:** exact landing под онлайн-чат; title добавляет интеграции, чат-ботов и круглосуточную поддержку.
- **Offer:** виджет как канал продаж/поддержки, связанный с более широкой омниканальной платформой.
- **CTA/pricing:** ссылка на тарифы есть; явный hero CTA и цена на проверенном текстовом представлении не зафиксированы.
- **Evidence/content:** изображения виджета, benefits, feature pages, кейсы, API, on-premise и отраслевые решения.
- **Internal linking:** все каналы, integrations, chatbots, API, cases, tariffs, blog и knowledge base.
- **Structured data:** обнаружены `Organization`, `WebSite` и `BreadcrumbList`.
- **Поисковый подход:** узкая commercial page владеет website-chat intent; homepage отдельно покрывает omnichannel.
- **Что нам полезно:** самостоятельная Web SDK/website-chat page с install flow, screenshots и link на API docs.
- **Не повторять:** 24/7 как сервисное обещание, рост продаж/конверсии, email/on-premise и кастомные доработки без evidence.

#### Телфин

Проверенная страница: [омниканальные коммуникации Телфин](https://www.telphin.ru/products/omnichannel)

- **Title/H1 intent:** exact omnichannel terminology; H1 и первый экран объясняют объединение телефонии, мессенджеров и online-chat.
- **Offer:** communication strategy и набор telephony-led продуктов; продукт шире и в другом центре тяжести, чем Support Communication.
- **CTA/pricing:** «Подключить услуги»/личный кабинет; цена на URL не найдена.
- **Evidence/content:** benefits, audience/industry scenarios, integrations, отзывы, база знаний и сильная региональная навигация.
- **Internal linking:** продукты телефонии, роли/типы компаний, десятки отраслей/городов, блог и knowledge base.
- **Technical limitation:** page content доступен поисковому crawler, но raw scripted request получил 401; structured data, canonical и HTML weight не подтверждены.
- **Поисковый подход:** exact solution landing + очень широкая отраслево-региональная taxonomy.
- **Что нам полезно:** объяснить омниканальность через сохранение контекста между подтверждёнными каналами.
- **Не повторять:** телефонию, city-page масштабирование и бесшовность всех каналов; городские страницы запрещены текущим SEO-планом.

#### ChatApp

Проверенная страница: [онлайн-чат для сайта ChatApp](https://chatapp.online/chat-na-sajt/)

- **Title/H1 intent:** exact «онлайн-чат на сайт» + AI-agent modifier.
- **Offer:** виджет, AI-менеджер, CRM и CMS integrations; детальная матрица мессенджеров и CRM.
- **CTA/pricing:** 3-дневная бесплатная попытка, подключение с менеджером и demo; есть отдельная pricing page.
- **Evidence/content:** CMS-specific installation, integration matrix, product visuals и поясняющий блок «что это».
- **Internal linking:** многочисленные комбинации «канал × CRM», marketplace/channel pages, academy и blog.
- **Structured data:** обнаружены `WebPage`, `WebSite` и `BreadcrumbList`.
- **Поисковый подход:** exact landing использует ключ в title/H1 и раскрывает implementation-specific compatibility.
- **Что нам полезно:** перечислить реально поддерживаемые Web SDK actions и CMS-neutral install steps.
- **Не повторять:** «5 минут», автоматическое превращение каждого диалога в сделку, безлимит и CRM integrations, которых у нас нет.

#### TWIN

Проверенная страница: [главная TWIN](https://twin24.ai/)

- **Title/H1 intent:** title задаёт омниканальную AI-платформу, H1 — экономический outcome коммуникаций.
- **Offer:** voice/chat agents, chat platform, mailings, site widget and lead generation; пересечение с нами частичное.
- **CTA/pricing:** регистрация и product-specific «узнать больше»; явная цена на homepage не найдена.
- **Evidence/content:** отдельные продукты, отрасли, use cases, integration pages, клиенты/кейсы и партнёрская сеть.
- **Internal linking:** product hub, tasks, industries, integrations, cases, partners и company content.
- **Поисковый подход:** broad homepage под omnichannel/AI + отдельные product and use-case landings.
- **Что нам полезно:** product hub с ясным разделением bot, operator workspace и widget — без смешивания всех решений в одном SEO-тексте.
- **Не повторять:** voice, mailings, call-center automation, lead-generation и экономические promises.

#### Riabot

Проверенная страница: [AI для поддержки Riabot](https://riabot.ru/solutions/ii-dlya-podderzhki)

- **Title/H1 intent:** exact solution page под AI-бота клиентской/технической поддержки.
- **Offer:** бот на данных компании, типовые вопросы, channel integrations и передача сотруднику.
- **CTA/pricing:** «Создать ИИ-поддержку» ведёт в приложение; ссылка на тарифы видна в общей навигации, цена на URL не показана.
- **Evidence/content:** integration logos и интерактивно оформленный sample dialog; кейсы доступны отдельным разделом.
- **Internal linking:** менее глубокий текстовый граф на проверенной странице, чем у category leaders; основные links ведут в channels, solutions, cases, pricing и blog.
- **Structured data:** JSON-LD blocks обнаружены, но типы не удалось надёжно извлечь из raw HTML — не считаются подтверждёнными.
- **Поисковый подход:** exact title/H1 + демонстрация пользовательского вопроса и простого setup path.
- **Что нам полезно:** встроенный демонстрационный диалог на основе реального sandbox без клиентских данных.
- **Не повторять:** setup за минуты, WhatsApp/Avito/CRM, точность AI и полностью автономное решение вопросов.

### 3.3. Контентный конкурент с собственным продуктом

#### Directum

Проверенная страница: [рейтинг российских Help Desk систем](https://www.directum.ru/blog-post/help_desk__top-10_rossijjskikh_sistem)

- **Title/H1 intent:** список российских систем с актуальным годом; внутри определение категории, критерии выбора и рейтинг, включающий собственный Directum ESM.
- **Offer:** не прямая landing page, а comparison/listicle, который формирует критерии и переводит к собственному продукту/демо.
- **CTA/pricing:** demo access и ссылка на общую страницу цен; цены в статье не показаны.
- **Evidence/content:** дата материала, содержание, критерии выбора, список конкурентов, calculator/lead magnet и product links.
- **Internal linking:** плотный corporate graph — решения, отрасли, материалы, мероприятия и product pages.
- **Structured data:** обнаружены `Article`, `Organization` и `BreadcrumbList`.
- **Поисковый подход:** publication refresh с годом в title/H1; comparison intent используется для discovery собственного продукта.
- **Что нам полезно:** нейтральный guide «как выбрать систему поддержки» возможен позднее, если он реально помогает выбору.
- **Не повторять сейчас:** рейтинги и сравнения с брендами до фактологической, методологической и правовой проверки; нельзя искусственно менять год без содержательного обновления.

## 4. Коммерческие паттерны

### 4.1. CTA соответствует цене и сложности внедрения

| Путь | Конкуренты, где он проверен | Интерпретация |
| --- | --- | --- |
| Self-serve/free/trial/registration | Kaiten, Okdesk, HappyDesk, HelpDeskEddy, ITSM 365, ChatApp, TWIN, Riabot | Подходит продукту с быстрым первым value и низким барьером входа. |
| Demo/consult/sales | Usedesk, HappyDesk, HelpDeskEddy, Naumen, AutoFAQ, ChatApp, Directum, Телфин | Подходит AI/enterprise/custom offer, где до покупки нужна квалификация. |
| Dual CTA | HappyDesk, HelpDeskEddy, ChatApp | Не заставляет SMB и enterprise-аудиторию проходить один funnel. |
| Contextual content → product | Jivo, Directum, Kaiten, Usedesk, AutoFAQ | Информационный intent получает следующий шаг без превращения статьи в рекламную страницу. |

Support Communication уже имеет два честных пути — Free onboarding и demo request. Их следует сохранять на коммерческих страницах:

- primary CTA «Начать бесплатно» для Web SDK/shared-inbox/малой команды;
- secondary CTA «Запросить демо» для AI, интеграций и Enterprise;
- не называть CTA платным checkout: текущая публичная регистрация создаёт Free.

### 4.2. Цена — доверительный сигнал, но не обязательна на каждой странице

На 11 из 15 проверенных страниц есть видимая ссылка на тарифы. Только HelpDeskEddy показывает конкретную цену прямо на аудитируемой ранжирующейся странице. Enterprise-first игроки чаще ведут в demo/consultation.

Для Support Communication безопасно:

- брать актуальные цены и комплектации только из канонического public catalog;
- показывать Free и ясный следующий шаг;
- на feature pages ссылаться на `/pricing/`, не копировать тарифные значения вручную;
- отдельно объяснить оплату AI-диалогов, если cluster затрагивает AI и данные подтверждены каталогом.

## 5. Evidence и доверие — главный разрыв

Конкуренты используют пять типов доказательств:

1. **Product proof:** screenshots, tours, sample dialogs, API docs, knowledge base.
2. **Customer proof:** logos, named quotes, case pages and role/company context.
3. **Measured outcomes:** response time, automation rate, cost reduction, SLA/CSAT changes.
4. **Company proof:** years on market, team, legal details, ecosystem and partners.
5. **Regulatory/deployment proof:** registry entries, Russian servers, on-premise, data/security statements.

Support Communication уже может безопасно использовать только первый тип:

- настоящий operator cockpit без клиентских данных;
- Web SDK/API examples;
- реальные routing/SLA/report/quality workflows;
- AI sandbox, trace and handoff;
- таблицу статуса каналов с явными ограничениями.

Типы 2–5 требуют отдельного evidence gate. Иллюстративные логотипы и отзывы текущего лендинга не являются доказательством и не должны переходить на новые SEO-страницы.

## 6. Внутренняя архитектура помогает широте запросов

Повторяющиеся типы внутренних страниц:

- feature pages: омниканальность, чат сайта, AI, automation, SLA, отчёты;
- role pages: руководитель поддержки, оператор, владелец, IT;
- industry pages: retail, finance, government, logistics and others;
- docs/API/knowledge base;
- cases/customer stories;
- pricing/demo/trial;
- educational blog, guides, glossary and comparisons.

Самый безопасный первый граф Support Communication:

```text
главная
├── тарифы
├── документация API
└── коммерческие страницы, выбранные Gate A
    ├── релевантный раздел документации
    ├── тарифы
    ├── подтверждённый соседний use case
    └── Free / demo CTA
```

Role/industry pages, блог и comparisons не должны запускаться массово: в текущем плане они либо не входят в первую волну, либо требуют отдельного спроса и уникального evidence.

## 7. Structured data, mobile и performance spot-check

### 7.1. Что проверено технически

| Страница | HTTP/raw HTML | HTML, примерно | Canonical | JSON-LD в raw HTML | Viewport meta |
| --- | --- | ---: | --- | --- | --- |
| Kaiten Service Desk | 200 | 116 KB | есть | не обнаружен | есть |
| Usedesk homepage | 200 | 1,10 MB | есть | `SiteNavigationElement` | есть |
| Okdesk homepage | 200 | 216 KB | не обнаружен | `SoftwareApplication`, `Offer`, `AggregateRating`, `Organization` | есть |
| HappyDesk homepage | 200 | 1,28 MB | есть | `FAQPage`, `BreadcrumbList` | есть |
| HelpDeskEddy homepage | 200 | 241 KB | есть | не обнаружен | есть |
| Naumen CSM | 200 | 181 KB | не обнаружен | не обнаружен | есть |
| ITSM 365 omnichannel | 200 | 393 KB | есть | не обнаружен | есть |
| Jivo AI article | 200 | 225 KB | есть | не обнаружен | есть |
| AutoFAQ homepage | 200 | 2,07 MB | есть | не обнаружен | есть |
| Webim site chat | 200 | 138 KB | есть | `Organization`, `WebSite`, `BreadcrumbList` | есть |
| Телфин omnichannel | scripted request 401 | не измерен | не проверен | не проверен | не проверен |
| ChatApp site chat | 200 | 192 KB | не обнаружен | `WebPage`, `WebSite`, `BreadcrumbList` | есть |
| TWIN homepage | 200 | 258 KB | есть | не обнаружен | есть |
| Directum listicle | 200 | 184 KB | есть | `Article`, `Organization`, `BreadcrumbList` | есть |
| Riabot AI support | 200 | 229 KB | есть | blocks есть, тип не подтверждён | есть |

Оговорки:

- HTML size — размер одного распакованного документа при контрольном запросе, не page weight и не Core Web Vitals.
- «Не обнаружен» означает отсутствие элемента в полученном raw HTML; JavaScript мог добавить его после загрузки.
- Наличие viewport meta — только базовый mobile signal. Visual QA на мобильной ширине не выполнялся.
- Lighthouse, LCP, INP, CLS и полная загрузка assets не измерялись; делать вывод «страница быстрая/медленная» нельзя.

### 7.2. Что это означает для нас

- Structured data не является общим секретом лидеров: только 7 из 14 raw-доступных страниц имели JSON-LD blocks. Она должна соответствовать видимому контенту, а не использоваться как набор keywords.
- Для первой волны достаточно корректных `BreadcrumbList`, `SoftwareApplication` только там, где подходит тип, и `FAQPage` только при реально видимом FAQ. Текущая schema foundation уже есть; расширять её следует из route/content contract.
- Три проверенных homepage отдают более 1 MB только HTML. Support Communication может сохранить конкурентное техническое преимущество: prerendered unique HTML, route-level bundles, оптимизированные изображения и отсутствие private-workspace bundle.
- Canonical нужно генерировать централизованно: на трёх raw-доступных URL он не обнаружен, но повторять этот пробел не следует.

## 8. Ключевые слова и поисковые форматы, которые можно использовать

Generic category/feature phrases не принадлежат конкурентам. Их можно использовать, если страница действительно отвечает intent и функция подтверждена:

| Направление | Безопасные формулировки для исследования | Product evidence Support Communication | Решение |
| --- | --- | --- | --- |
| Категория | система/платформа поддержки клиентов; helpdesk; сервис клиентской поддержки | единое рабочее место, роли, очередь, отчёты | исследовать; окончательный кластер по SERP overlap |
| Омниканальность | омниканальная поддержка; обращения из разных каналов; единая очередь | Web SDK, Telegram; VK/MAX условно после live-gate | использовать с явным списком каналов |
| Чат сайта | чат поддержки для сайта; виджет обратной связи; Web SDK | public SDK, messages, files, presence, CSAT | сильный кандидат после scoring |
| Telegram | поддержка клиентов в Telegram; Telegram-бот для службы поддержки | ingress/outbound/runtime | сильный кандидат; bot-token/setup caveat |
| AI | AI/ИИ-бот поддержки; автоматизация первой линии; передача оператору | bot scenarios, knowledge, sandbox, trace, handoff | сильный кандидат без outcome claims |
| Operations | контроль SLA; распределение обращений; контроль загрузки операторов | routing, SLA, rescue, reports | исследовать как отдельный use-case cluster |
| Integrations | API службы поддержки; Open Channel; webhook helpdesk | public docs and runtime endpoints | отдельный technical/commercial cluster |
| ВКонтакте/MAX | поддержка через ВКонтакте/MAX | functional runtime, live acceptance pending | исследовать; публикация после product gate |

Рискованные формулировки:

- `единое окно поддержки` без уточнения — в текущем SERP преимущественно означает государственные/социальные меры поддержки и имеет слабую продуктовую релевантность;
- `service desk` может вести к внутренней ITSM/asset-management выдаче, тогда как наш основной продукт — клиентская поддержка;
- competitor brand queries, `аналог` и `сравнение` требуют отдельного legal/factual gate;
- `российский helpdesk`, `импортозамещение`, `реестр ПО`, `152-ФЗ`, `on-premise` пока запрещены product brief;
- email, WhatsApp, Viber, телефония и CRM нельзя использовать как работающие каналы.

## 9. Что безопасно повторить

### Можно внедрять после Gate A

1. **Один интент — одна каноническая landing page.** Уникальные title, H1, offer, evidence, FAQ and CTA; не страницы-синонимы.
2. **Problem-first hero.** Назвать роль/задачу, подтверждённый workflow и следующий шаг без недоказанного процента результата.
3. **Product walkthrough.** Показать реальные интерфейсы и последовательность: подключение → обращение → routing → operator/AI → quality/report.
4. **Dual CTA.** Free onboarding и demo request с разными ожиданиями.
5. **Прозрачная ссылка на тарифы.** Значения читаются из канонического каталога, а не дублируются в тексте.
6. **Docs as evidence.** Контекстные ссылки на Web SDK, API/Open Channel, security notes and examples.
7. **Visible FAQ + matching schema.** Только вопросы реального SERP intent и ответы, подтверждённые продуктом.
8. **Breadcrumbs and internal links.** Главная, pricing, docs and related intent без footer-spam.
9. **Demo without fabricated data.** Sandbox/dialog/operator cockpit с явной маркировкой демонстрации.
10. **Лёгкая техническая реализация.** Prerender, route splitting, optimized media and measured bundle budget.

### Можно позже, после появления evidence

- named customer cases and quantified outcomes;
- role pages при подтверждённом разном SERP intent;
- industry pages с настоящими workflows/cases;
- guide/how-to content вокруг каждой коммерческой страницы;
- comparison pages with methodology and legal review;
- calculators/lead magnets с проверенной моделью расчёта.

## 10. Что нельзя копировать или имитировать

1. Тексты, композицию блоков, иллюстрации и branded terminology конкурентов.
2. Чужие ключевые слова вместе с чужими продуктовыми claims; generic запрос допустим, неподдерживаемая функция — нет.
3. Проценты автоматизации, экономии, скорости, SLA/CSAT и ROI без собственной выборки, периода, baseline и источника.
4. Клиентские логотипы, отзывы, industries and case results без разрешений и первичных материалов.
5. Реестр ПО, российские серверы, data residency, compliance, on-premise and security certification без документов.
6. `TOP-10`, «лучший», рейтинги и страницы «альтернатива X» без прозрачной методики и правовой проверки.
7. Искусственное обновление года в title без пересмотра содержания.
8. Массовые city/industry/CRM × channel pages; это создаёт doorway/cannibalization risk.
9. Обещания setup за минуты/день, unlimited operators/channels and 24/7 service без операционных guarantees.
10. Schema markup для невидимых FAQ, неподтверждённых ratings или fabricated reviews.

## 11. Рекомендованные следующие действия

1. В SEM-08 кластеризовать по SERP overlap, отдельно проверив:
   - category/helpdesk;
   - website chat/Web SDK;
   - Telegram support;
   - AI first line/handoff;
   - routing/SLA;
   - API/Open Channel.
2. В SEM-09 оценить кандидатов по demand, business value, commercial intent, product evidence и SERP feasibility; не повышать приоритет только из-за активности конкурента.
3. На Gate A выбрать три страницы, каждая из которых имеет собственный intent, working CTA and product proof.
4. До PAGE-03 назначить product reviewer и закрыть live-gate VK/MAX, конфликт Email и точность tariff feature mapping.
5. Создать evidence inventory для каждой выбранной страницы: screenshot, API/doc link, demo flow, safe claims and exclusions.
6. Сохранить текущий technical baseline: prerendered HTML, canonical, sitemap, consent-first analytics and route-level performance guardrails.
7. Вернуться к cases/comparisons только после получения реальных customer evidence и legal approval.

## 12. Further Questions

- Какой из подтверждённых workflows лучше всего демонстрирует value за первые 5–10 минут Free onboarding?
- Есть ли обезличенные demo requests/interviews, подтверждающие язык руководителей поддержки и владельцев бизнеса?
- Какие реальные production credentials и smoke evidence доступны для Telegram, VK and MAX?
- Какие tariff features коммерчески гарантированы, а какие пока являются конфигурацией каталога?
- Можно ли получить первый разрешённый customer case с baseline, периодом и измеримым outcome?
- Должна ли AI-page продавать bot-first support, operator copilot или оба сценария; совпадает ли их SERP intent?
- Нужна ли отдельная «SLA и маршрутизация» страница или эти запросы принадлежат общей helpdesk page?

## 13. Caveats and Assumptions

- SERP snapshot частичный: 12 запросов, TOP-5 и одна дата. Это источник discovery и intent, не полный share-of-voice.
- Позиции зависят от региона, персонализации, даты и состава поисковых features.
- Audit проверяет опубликованные страницы, но не подтверждает истинность заявлений конкурентов.
- Pricing status относится к аудитируемому URL; отдельная pricing page могла содержать другие условия.
- Internal linking оценивался по видимым ссылкам и raw HTML, без полного crawl domain graph.
- Structured data проверялась в raw HTML; client-side markup мог не попасть в срез.
- Mobile ограничен viewport meta; responsive behavior, accessibility and interaction не проходили browser QA.
- Performance ограничен размером raw HTML; Lighthouse and field CWV не измерялись.
- Телфин ограничил scripted request ответом 401, поэтому его technical fields не заполнены.
- Все выводы требуют повторной проверки перед публикацией, если competitor page или собственный продукт изменятся.
