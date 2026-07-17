# Код-ревью — второй раунд: закрытие пробелов

> Дополнение к [основному отчёту](code-review-2026-07-16.md). Первый раунд покрыл основной код; критик полноты назвал 8 зон, оставшихся без ревью. Этот раунд добивает именно их: 8 ревьюеров + адверсариальная верификация (2 скептика на critical/high, 1 на medium/low).
> Сгенерировано автоматически 17.07.2026, 03:27:41 (МСК). Не редактировать вручную.

## Итоги раунда

| Метрика | Значение |
|---|---|
| Сырых находок | 20 |
| После дедупликации | 19 |
| **Подтверждено** | **15** (🔴 0 · 🟠 1 · 🟡 3 · ⚪ 11) |
| Спорных | 0 |
| Опровергнуто | 4 |

**Отдельно (найдено при разведке, не агентом):** `.github/workflows/ci.yml` физически существует в рабочей копии, но **не закоммичен** (`git ls-files` его не видит) — на remote конвейер не запускается, тесты/линт автоматически не гоняются.

---

## 🔴🟠 Critical и High — детально

### 1. 🟠 `.github/workflows/ci.yml:1`
**Файл CI-пайплайна существует на диске, но не закоммичен в git — на remote CI не запускается вообще.**

- **Область:** env-контракт и CI · **категория:** ops
- **Почему дефект:** `git ls-files .github/workflows/ci.yml` не возвращает путь, `git status` показывает `?? .github/` (untracked), `git check-ignore` пуст (не игнорируется, просто не добавлен). В git не трекается ни одного workflow (`git ls-files | grep -i workflow` даёт только тест-файлы). Значит на GitHub нет ни одного workflow-файла.
- **Расхождение/сценарий:** Пайплайн описывает полноценные гейты (typecheck, unit/integration, tenant-isolation:verify, migration-rollback-check:verify, prisma:validate, Playwright e2e с изолированной БД). Команда считает, что PR и push в main проходят через CI, но на remote workflow отсутствует — любой сломанный/непрошедший тесты коммит вливается в main незамеченным, гейты качества и тенант-изоляции фактически не работают.

> _Проверка:_ Подтверждено: git ls-files .github/ пуст, git log --all -- .github/ пуст (файл никогда не коммитился), status показывает ?? .github/ (untracked), check-ignore пуст. При этом remote origin на GitHub реально настроен, а ci.yml на диске — не заглушка, а полный пайплайн (typecheck, unit/integration, tenant-isolation:verify, migration-rollback-check:verify, prisma:validate, Playwright e2e). GitHub Actions исполняет только закоммиченные workflow, поэтому CI на remote не запускается — заявленные гейты качества и тенант-изоляции не работают.


---

## 🟡 Medium (3)

#### Фронтенд-каркас (AppShell/router/audit) (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `src/features/audit/AuditScreen.jsx:89` | security | Экспорт CSV аудита уязвим к формульной инъекции (CSV/formula injection): значения с ведущими = + - @ не нейтрализуются. |

#### Дрейф документации (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `docs/runtime-configuration.md:268` | doc-drift | Doc утверждает, что compose поднимает воркеры с NOTIFICATION_REPOSITORY/INTEGRATION_REPOSITORY=prisma, хотя эти env удалены и в compose не задаются |

#### Фикстуры .playwright-runtime (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `.playwright-runtime/api-gateway/quality.json:1` | dead-code | Весь набор фикстур stub-гейтвея .playwright-runtime/api-gateway/*.json (19 трекаемых файлов) осиротел после prisma-only миграции: ни один код его больше не грузит, но файлы остаются в git и тихо разъезжаются с реальными контрактами. |


---

## ⚪ Low (11)

<details><summary>Показать 11</summary>

#### Дрейф документации (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `docs/open-channel-api.md:128` | doc-drift | External Bot API документирует код ошибки unauthorized_client, которого код никогда не возвращает |
| ⚪ | `docs/open-channel-api.md:40` | doc-drift | Событие вебхука client_updated объявлено поддерживаемым для подписки, но код его никогда не эмитит |
| ⚪ | `docs/open-channel-api.md:182` | doc-drift | В общих полях событийного вебхука документировано поле department, которого нет ни в одном эмитируемом payload |

#### Бэкенд: audit/incidents/presence/feature-flags/runtime (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/apps/api-gateway/src/audit/workspace-audit.service.ts:178` | correctness | Неизвестное или пустое значение period молча отключает фильтр по времени в аудите вместо дефолта 30 дней |
| ⚪ | `backend/apps/api-gateway/src/incidents/incident.service.ts:323` | dead-code | Функция overlayById объявлена, но нигде в файле не вызывается (мёртвый код) |
| ⚪ | `backend/apps/api-gateway/src/presence/bootstrap.ts:13` | dead-code | Опция seed в OperatorPresenceBootstrapOptions объявлена, но никогда не применяется |

#### Сервис-воркер пушей + HTML (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `public/browser-push-service-worker.js:46` | security | notificationclick открывает произвольный URL из payload без проверки на same-origin/относительность (open redirect / фишинг). |
| ⚪ | `index.html:3` | config | На входных HTML (включая привилегированную админ-панель) нет CSP — ни через заголовки, ни через meta. |

#### env-контракт и CI (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `docker-compose.yml:64` | security | Публично известный AES-мастер-ключ шифрования учёток задан дефолтным фолбэком в production-like сервисах и не проходит fail-closed валидацию (в отличие от JWT-секретов). |

#### Prisma-миграции (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/prisma/schema.prisma:2385` | doc-drift | Индекс mcp_connectors [tenantId, status] объявлен в schema.prisma без map:, но миграция создала его под нестандартным именем — схема и история миграций рассинхронизированы. |

#### Периферия web-widget (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `packages/web-widget/demo.html:47` | doc-drift | Документированный сценарий локальной демо не работает: `vite preview` раздаёт `dist/`, а demo.html и `/dist/widget.js` там отсутствуют. |

</details>

---

## ⚖️ Спорные

_нет_

---

## ❌ Опровергнуто верификаторами (4)

<details><summary>Показать 4</summary>

- `public/browser-push-service-worker.js:9` — ~~Все браузерные пуши получают один и тот же статичный tag, из-за чего новые уведомления молча заменяют предыдущие.~~
- `src/features/audit/AuditScreen.jsx:67` — ~~mapAuditEvent бросает исключение на некорректном event.at, а loadEvents не имеет try/catch — экран навсегда застревает в состоянии загрузки.~~
- `backend/.env.example:8` — ~~Переменная BILLING_PROVIDER_MODE, которую реально читает код, не документирована в .env.example и не задаётся в compose; вместо неё описан другой ключ BILLING_SYNC_PROVIDER_MODE.~~
- `docker-compose.yml:55` — ~~Слабые секреты и пароль БД захардкожены литералами в production-like сервисах compose (без возможности переопределения через env).~~
</details>
