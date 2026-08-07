# Отчёт о реализации первой SEO-волны

Дата: **2026-08-07**  
Статус: **локально готово; production Gate B не пройден**.

## Что реализовано

Новые indexable routes:

- `/website-support-chat/`;
- `/ai-support-bot/`;
- `/support-sla/`.

Единый источник контента и metadata: `src/public/content/commercialPageDefinitions.js`. Общий SSR-safe render: `src/features/public/CommercialLandingPage.jsx` и отдельный адаптивный CSS.

Каждая страница имеет:

- отдельный intent, title, description, H1 и canonical;
- видимый `BreadcrumbList` в JSON-LD;
- видимый FAQ без автоматического `FAQPage` markup;
- page-specific H2, product details, ограничения и оригинальную HTML/CSS workflow-схему;
- одну контекстную ссылку на связанное решение, а не полный cross-link каждой страницы со всеми;
- ссылки на `/pricing/` и `/docs/`;
- работающий conversion path: регистрация для website chat/SLA, форма демо для AI;
- отдельную consent-first goal: `website_support_chat_view`, `ai_support_bot_view`, `support_sla_view`.

Manifest теперь формирует 6 публичных маршрутов. Тот же список используется prerender и sitemap. Обе Nginx-конфигурации получили exact canonical locations и 308 для slashless/`index.html` variants. Случайный URL и отсутствующий asset по-прежнему возвращают hard 404.

## Editorial honesty cleanup главной

Перед локальным Gate B удалены или исправлены существовавшие неподтверждённые элементы:

- проценты и сроки без собственного baseline (`−38%`, `100%`, «за один день», «через минуты»);
- фиктивные отзывы и логотипы клиентов;
- формулировка, что VK/MAX уже работают в production;
- абсолютный claim полного аудита;
- демонстрационный AI-ответ с вымышленным сроком возврата и скоростью ответа.

Статусы каналов теперь разделяют реализованный код, необходимость credentials и отдельный live-gate.

## Проверки

### Автоматические

- `npm run test:unit`: **425/425 passed**;
- целевые commercial/SEO/routing/analytics/Nginx/CSP/performance тесты: **45/45 passed**;
- `npm run build`: passed;
- prerender verifier: **6 indexable routes verified**;
- visible-stub guard: passed;
- FAQ JSON-LD на коммерческих страницах отсутствует;
- уникальность title/description/H1/analytics goals проверяется тестом;
- formula/data validation: 12 из 12 priority score пересчитаны без расхождений.

Build сохраняет прежнее предупреждение Vite: private `App` chunk больше 500 kB. Новые страницы не добавляют зависимостей. Текущий public bundle: JS **71 330 B**, CSS **41 861 B**. Общий JS+CSS build — **1 530 638 B**, примерно **+1,83%** к зафиксированному перед реализацией baseline 1 503 188 B.

### Browser QA

Встроенный браузер, localhost preview:

- desktop `/website-support-chat/`: правильные URL/title/canonical, 1 `<main>`, 1 `<h1>`, 4 FAQ, console warning/error = 0;
- CTA «Начать бесплатно»: переход на `/#/onboarding`, onboarding rendered, console clean;
- CTA `/ai-support-bot/` → «Запросить демо»: переход на `/#request-demo`, форма с заголовком «Демо AI-сценария поддержки» rendered, console clean;
- после honesty cleanup на фоне формы отсутствуют `−38%` и блок фиктивных отзывов.

Rendered mobile QA 390 px не завершён: browser runtime заблокировал localhost reload после viewport override. CSS статически содержит breakpoint 800/520 px, single-column hero/cards/FAQ, full-width CTA и `overflow-x: hidden`, но это не заменяет rendered-проверку.

## Что не выполнено

- product/editorial reviewer не назначен;
- расширенный SERP 25–40 × TOP-10 и отдельные Москва/Санкт-Петербург не сняты;
- mobile 390 px rendered QA не пройден;
- Lighthouse/CWV новых страниц не измерен;
- commit, push, deploy, sitemap resubmit и URL reindex не выполнялись;
- day-7/day-28 monitoring ещё не наступил.

## Gate B перед production

1. Назначить владельца и утвердить claims трёх briefs.
2. Пройти mobile 390 px и keyboard QA в доступном browser runtime.
3. Выполнить pre-release smoke всех 6 public routes и private login/onboarding.
4. Только после этого — commit/push/deploy, проверка 200/308/404, sitemap и переобход.
5. Через 7 дней снять расширенный SERP и первые query/page данные; через 28 дней принять решение о второй волне.

