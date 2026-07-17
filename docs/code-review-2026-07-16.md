# Код-ревью проекта Support communication

> Многоагентное ревью: 22 ревьюера прошли подсистемы бэкенда/фронтенда и 5 сквозных тем (безопасность, мёртвый код, гонки, целостность данных, обработка ошибок). Каждая находка проверена независимыми скептиками-верификаторами (2 на critical/high, 1 на medium/low); ниже — только то, что пережило верификацию.
> Второй раунд закрыл 8 зон, оставшихся без покрытия → [code-review-2026-07-16-gaps.md](code-review-2026-07-16-gaps.md).
> Сгенерировано автоматически 17.07.2026, 03:28:09 (МСК). Не редактировать вручную.

## Итоги

| Метрика | Значение |
|---|---|
| Сырых находок от 22 ревьюеров | 213 |
| После дедупликации | 192 |
| **Подтверждено верификацией** | **149** |
| — 🔴 critical | 1 |
| — 🟠 high | 27 |
| — 🟡 medium | 76 |
| — ⚪ low | 45 |
| Спорных (вердикты разошлись) | 1 |
| Опровергнуто верификаторами (ложные срабатывания) | 42 |

**Что чинить в первую очередь:** одна критичная гонка с потерей сообщений и блок security/тенант-изоляции (публичный SDK-ингресс перезаписывает чужие диалоги, незащищённые ручки, кросс-тенантная утечка realtime). Полный список critical/high — ниже с доказательствами и сценариями.

---

## 🔴🟠 Critical и High — детально

### 1. 🔴 `backend/apps/api-gateway/src/conversation/conversation.repository.ts:640`
**Персист диалога полностью перезаписывает список сообщений из устаревшего снапшота (deleteMany + createMany) без блокировок и версий — конкурентные записи одного диалога теряют сообщения.**

- **Область:** Скв.: гонки · **категория:** race · найдено независимо 3 ревьюерами
- **Почему дефект:** savePrismaConversation → replacePrismaConversationMessages делает `deleteMany({where:{conversationId}})` и `createMany` из массива conversation.messages, который сервис получил через findConversation ДО транзакции и мутировал push'ем (conversation.service.ts:1064, 1678). Ни optimistic-версии, ни SELECT FOR UPDATE, ни повторного чтения внутри транзакции нет (grep по version/mutex/FOR UPDATE в каталоге conversation — пусто). Все мутации диалога (normalizeInboundEvent, appendMessage, queueOutboundMessageReply, transition) идут через этот путь.
- **Сценарий:** Клиент шлёт два сообщения подряд (два вебхука обрабатываются параллельно) или оператор отвечает одновременно с входящим сообщением: оба запроса читают messages=[m1..m5], A коммитит [m1..m5,m6], B затем удаляет все строки (включая m6) и вставляет свой снапшот [m1..m5,m7] — сообщение m6 безвозвратно исчезает из переписки.

> _Проверка:_ Подтверждено кодом: replacePrismaConversationMessages (conversation.repository.ts:636-650) делает deleteMany+createMany из in-memory снапшота, полученного через findConversation ДО транзакции (service:1646→1678→1687, 947→1064), без isolationLevel/FOR UPDATE/версий — grep по репо это подтверждает (FOR UPDATE есть только в outbox-поллерах). Вебхуки (telegram/signed/sdk routes) и ответы оператора/AI обрабатываются конкурентно, идемпотентность дедуплицирует лишь одинаковый eventId, поэтому сценарий «B затирает закоммиченный m6» реализуем на Postgres под ReadCommitted без ошибок — тихая необратимая потеря сообщений.

### 2. 🟠 `backend/apps/api-gateway/src/integrations/public-sdk-messages.route.ts:95`
**Публичный SDK-ингресс принимает произвольный conversationId и использует его как id создаваемого диалога, что позволяет перезаписать существующий диалог любого тенанта.**

- **Область:** Интеграции / Open Channel · **категория:** security
- **Почему дефект:** resolveOrCreatePublicSdkConversation: `const conversationId = requestedConversationId || anchorId` и `createInitial: () => ({ id: conversationId, ... })`. Поиск существующего диалога идёт только по anchorId (хэш tenant:externalId), а клиентский conversationId никак не проверяется на принадлежность тенанту. Дальше savePrismaConversation (conversation.repository.ts:626) делает `conversation.upsert({ where: { id: conversation.id } })` по глобальному PK и `conversationMessage.deleteMany + createMany` — при совпадении id существующая запись ЧУЖОГО тенанта обновляется (tenantId, name, providerConversationId перезаписываются данными атакующего), а все её сообщения удаляются. requireConversationTenant проверяет лишь непустоту tenantId. Код ошибки sdk_conversation_tenant_mismatch в роуте существует, но сама проверка — нет (null возвращается только при пустом externalId).
- **Сценарий:** Атакующий с валидным публичным API-ключом своего тенанта A шлёт POST /api/v1/public/sdk/messages с новым externalId и conversationId = id диалога тенанта B (id детерминированные: sdk_/tg_/openchat_ + хэш — подбираются или утекают). Анкер не найден → создаётся «новый» диалог с этим id → upsert перезаписывает диалог тенанта B: он переезжает в тенант A, все сообщения клиента B стираются.

> _Проверка:_ Подтверждено по коду. resolveOrCreatePublicSdkConversation (public-sdk-messages.route.ts:90-106) берёт клиентский conversationId как id нового диалога без проверки принадлежности тенанту; при новом externalId findLatestAppealConversation (appeal-lifecycle.ts:229-237) фильтрует только по tenantId=A, поэтому чужой диалог не находится и идёт ветка создания. savePrismaConversation (conversation.repository.ts:626-648) делает conversation.upsert по глобальному PK id (schema.prisma:618 id String @id, не составной уник) + conversationMessage.deleteMany — запись тенанта B перезаписывается (tenantId→A) и её сообщения стираются. requireConversationTenant проверяет лишь непустоту tenantId; реального sdk_conversation_tenant_mismatch-контроля нет. Severity понижаю до high: атака аутентифицированная (нужен валидный публичный ключ) и требует знания конкретного conversationId жертвы (id не секрет, но и н…

### 3. 🟠 `backend/apps/api-gateway/src/workspace/topics.controller.ts:7`
**Все ручки /workspace/topics (чтение, создание, изменение, архив, восстановление) полностью без аутентификации и авторизации.**

- **Область:** Workspace / Operations / Platform · **категория:** security · найдено независимо 3 ревьюерами
- **Почему дефект:** TopicsController — единственный контроллер зоны без @UseGuards и без Require*-декораторов; глобального гварда нет (в main.ts только setGlobalPrefix и exception filter, APP_GUARD нигде не регистрируется). Все остальные контроллеры (clients, files, knowledge, templates, notifications, operations, platform, service-admin) явно вешают TenantOperatorOrServiceAdminGuard или ServiceAdminSessionGuard. Вдобавок tenantId берётся прямо из query (fetchTopics) с фолбэком на захардкоженный DEFAULT_TENANT_ID="tenant-northstar" (topic-directory.service.ts:317-319), т.е. тенант-изоляции нет даже номинально.
- **Сценарий:** Неаутентифицированный запрос GET /api/v1/workspace/topics?tenantId=<любой> читает справочник тем любого тенанта; POST/PATCH/archive без единого заголовка авторизации изменяют/архивируют темы, влияющие на маршрутизацию диалогов.

> _Проверка:_ Подтверждено: topics.controller.ts без единого гварда, APP_GUARD в backend отсутствует (grep — ноль совпадений), а все соседние контроллеры явно вешают Tenant/ServiceAdmin-гварды; tenantId берётся из query с фолбэком на "tenant-northstar", а updateTopic/archive/restore ищут тему только по topicId вообще без проверки тенанта. Сценарий воспроизводим: неаутентифицированные GET/POST/PATCH проходят — других слоёв защиты нет. Серьёзность снижена до high: хранилище — in-memory Map с демо-сидом (не Postgres), данные без PII/секретов, мутации не переживают рестарт.

### 4. 🟠 `backend/apps/api-gateway/src/identity/tenant.route.ts:20`
**PATCH /tenants/:tenantId/status игнорирует tenantId из URL: currentTenantId сессии сервис-админа затирает параметр маршрута, и статус меняется не у того тенанта.**

- **Область:** Identity / Auth · **категория:** correctness
- **Почему дефект:** В updateTenantStatusFromRoute: `const tenantId = request.serviceAdminContext?.currentTenantId ?? payload.tenantId` — приоритет перевёрнут. Контроллер (tenant.controller.ts:36) передаёт tenantId из URL в payload, но реальная bearer-сессия всегда имеет currentTenantId: login() (auth.service.ts:419-425) фиксирует его как "tenant-volga" либо первый тенант, а эндпоинта смены текущего тенанта в кодовой базе нет (grep по currentTenantId — только чтение). Тесты (tests/billing-service-admin-contracts.test.ts:221+) не ловят баг, т.к. везде ставят currentTenantId равным payload.tenantId.
- **Сценарий:** Сервис-админ вызывает PATCH /tenants/tenant-lumen/status {status: "restricted", confirmed: true} → блокируется tenant-volga (currentTenantId его сессии), а не tenant-lumen; аудит-событие и outbox тоже пишутся для чужого тенанта. Целевой тенант остаётся активным.

> _Проверка:_ Подтверждено: tenant.route.ts:20 ставит currentTenantId сессии выше tenantId из URL, а реальный bearer-логин (auth.service.ts:419-425) всегда фиксирует currentTenantId («tenant-volga» либо первый тенант) и ни один эндпоинт его не меняет (selectTenant лишь проверяет membership, сессию не трогает). Фронтенд шлёт целевой тенант только в URL (src/services/tenantService.js:32), поэтому PATCH статуса всегда применяется к тенанту сессии — статус, аудит и outbox пишутся не тому тенанту; при этом GET /tenants/:tenantId использует URL-параметр напрямую, что подтверждает баг, а не дизайн. Тесты маскируют дефект: в billing-service-admin-contracts.test.ts:221-273 currentTenantId всегда равен payload.tenantId.

### 5. 🟠 `backend/apps/api-gateway/src/conversation/realtime.websocket.ts:92`
**WebSocket-реплей realtime-событий принимает access-токен тенант-оператора как сервис-админский и отдаёт события всех тенантов — нарушение тенант-изоляции.**

- **Область:** Identity / Auth · **категория:** security
- **Почему дефект:** sessionLookup в authorizeRealtimeSocket — просто `findServiceAdminSessionByAccessToken(token)`, без фильтра tenant-operator-сессий, который есть в ServiceAdminSessionGuard (service-admin-session.guard.ts:35: `session?.id.startsWith("top-session_") ? null : session`). Сессии операторов хранятся в той же таблице (createTenantOperatorSession → createServiceAdminSession с префиксом top-session, mfaVerifiedAt заполнен), у роли admin allowedActions = ["*"] → hasAction("*", "realtime.events.read") проходит. Далее writeRealtimeWebSocketReplay (строка 78) вызывает fetchRealtimeEvents({since}) без tenant-scope — conversation.service.ts:1830-1837 при пустом scope возвращает события всех тенантов. Эндпоинт реально установлен в main.ts:68.
- **Сценарий:** Администратор тенанта A логинится через /auth/tenant/login, открывает ws /api/v1/realtime/events/socket со своим access-токеном → получает поток realtime-событий (диалоги, сообщения) всех остальных тенантов платформы.

> _Проверка:_ Подтверждено по коду. authorizeRealtimeSocket (realtime.websocket.ts:92) делает findServiceAdminSessionByAccessToken без фильтра top-session_, который есть в HTTP-гварде (service-admin-session.guard.ts:35); resolveDecision (auth-context/index.ts:64-103) префикс не проверяет. Операторская сессия admin имеет allowedActions ["*"] (runtime-catalog.ts:50) и mfaVerifiedAt → пройдёт hasAction. Далее fetchRealtimeEvents({since}) вызывается без scope (websocket:78), а conversation.service.ts:1835-1836 при пустом scope отдаёт события всех тенантов; легитимный HTTP-путь (realtime.controller.ts:22) наоборот скоупит по tenantId. Эндпоинт установлен безусловно (main.ts:68). Межтенантный слив realtime-событий, но нужна учётка тенант-админа — severity high.

### 6. 🟠 `backend/apps/api-gateway/src/routing/routing.repository.ts:1478`
**После первого же срабатывания sla-timer/rescue-return воркера (отдельный процесс) все ручные операции маршрутизации в API-гейтвее навсегда падают с routing_state_snapshot_conflict — кэш версии снапшота не обновляется при конфликте.**

- **Область:** Диалоги / Routing · **категория:** ops
- **Почему дефект:** saveManualRoutingTransition/saveBatchRoutingTransition/saveStateWithLifecycleEvents вызывают saveStateSnapshot с expectedVersion = this.stateSnapshotVersion — значением, закэшированным при hydrateStateSnapshot (вызывается один раз в main.ts:48 при старте) или при собственной успешной записи. Воркеры sla-timer.main.ts и rescue-return.main.ts — отдельные процессы (свои entrypoint'ы, в compose — отдельные контейнеры), их applySlaTimerTransition/applyRescueReturnTransition инкрементируют version в БД (читают её свежей внутри транзакции). При несовпадении версии updateMany возвращает count 0 и бросается routing_state_snapshot_conflict; ни в persistManualTransition (routing.service.ts:1438–1443, только откат in-memory и rethrow), ни где-либо ещё нет ре-гидрации версии или ретрая.
- **Сценарий:** Оператор ставит SLA на паузу (version 5→6). Через 15 минут sla-timer-воркер резюмирует SLA (version 6→7). Дальше ЛЮБОЕ ручное действие маршрутизации через гейтвей (назначение, transfer, возврат в очередь, пауза SLA, rescue, redistribution commit) кидает routing_state_snapshot_conflict → HTTP 500, и так до перезапуска процесса гейтвея, потому что stateSnapshotVersion остаётся 6 навсегда.

> _Проверка:_ Подтверждено кодом: воркеры (отдельные контейнеры в docker-compose, строки 362/390) передают в saveStateSnapshot свежую версию из readCurrentStateSnapshot (routing.repository.ts:862, 974) и инкрементируют её в БД, а все ручные пути гейтвея (1199, 1255, 1351, 1360) используют закэшированный this.stateSnapshotVersion, обновляемый только при hydrateStateSnapshot (один раз в main.ts:48) или собственной успешной записи. Строка routing_state_snapshot_conflict нигде не ловится (grep: только throw на 1492 и тесты), persistManualTransition (routing.service.ts:1438-1443) лишь откатывает in-memory и rethrow — после первого срабатывания воркера версия кэша навсегда отстаёт и все ручные операции маршрутизации падают до рестарта гейтвея.

### 7. 🟠 `backend/apps/api-gateway/src/automation/bot-runtime.service.ts:556`
**Триггер new_conversation («Первое сообщение клиента») никогда не срабатывает в продакшене: ни один ingress не передаёт payload.isNewConversation.**

- **Область:** Боты / AI-рантайм · **категория:** contract
- **Почему дефект:** matchingTrigger требует payload.isNewConversation === true, но флаг выставляет только песочница (bot-sandbox.service.ts:162). Продакшен-вызовы runBotRuntime — public-sdk-messages.route.ts:244 (payload: { text }), telegram-webhook.route.ts:144 и telegram-polling.worker.ts:222 (payload: { text: parsed.text }) — флаг не передают; grep по backend (без dist) подтверждает: isNewConversation встречается только в этих двух файлах automation/. При этом new_conversation — дефолтный триггер создаваемых сценариев (defaultScenarioTriggerRules в automation.service.ts:1699), триггер seed-сценариев (seed-catalog.ts:22,64,82) и правило, восстанавливаемое effectiveTriggerRules по заголовку «Первое сообщение клиента».
- **Сценарий:** Тенант публикует бота с триггером «Первое сообщение клиента» (дефолт мастера). Клиент пишет первое сообщение в виджет или Telegram → resolveScenario не находит совпадения → bot_runtime_published_scenario_not_found → tryBotRuntime молча глотает ошибку → бот не отвечает вообще, хотя в тест-чате (песочнице) тот же сценарий работает — расхождение маскирует баг.

> _Проверка:_ Подтверждено: bot-runtime.service.ts:556 требует payload.isNewConversation === true, но grep по backend (без dist) показывает, что флаг выставляет только песочница (bot-sandbox.service.ts:162), а все три продакшен-ingress'a (public-sdk-messages.route.ts:244, telegram-webhook.route.ts:144, telegram-polling.worker.ts:222) передают payload только с text — сценарий с дефолтным триггером new_conversation (automation.service.ts:1699, seed-catalog.ts:22/64/82) в проде не резолвится, ошибка bot_runtime_published_scenario_not_found глотается tryBotRuntime (catch { return null }). Расхождение с песочницей даже глубже заявленного: она передаёт scenarioId, обходя trigger-matching целиком, а её трасса evaluateTriggerTrace (bot-sandbox.service.ts:448) безусловно считает new_conversation совпавшим. Серьёзность high корректна: дефолтный бот молча не отвечает в проде при работающем тест-чате.

### 8. 🟠 `backend/apps/api-gateway/src/integrations/open-channel/open-channel-delivery.service.ts:85`
**Клейм доставок Open Channel не помечает записи как in-flight, а setInterval запускает пересекающиеся runOnce — одна доставка отправляется несколько раз параллельно.**

- **Область:** Интеграции / Open Channel · **категория:** race · найдено независимо 2 ревьюерами
- **Почему дефект:** claimDueDeliveries (open-channel.repository.ts:588-623) лишь инкрементирует attempts, оставляя status="pending" и старый nextAttemptAt в прошлом; nextAttemptAt сдвигается только в resolveDelivery после завершения HTTP-вызова. start() ставит setInterval(3с) без флага «running» (в отличие от startTelegramPollingWorker, где такой флаг есть), а таймауты доставки — до 10с на попытку и записи обрабатываются последовательно. Значит пока первая попытка висит, каждый следующий тик снова клеймит ту же запись и шлёт дубликат POST.
- **Сценарий:** Вебхук-эндпоинт клиента отвечает за 8-10 секунд: тики t=0/3/6/9с все клеймят одну доставку → консьюмер получает 3-4 одинаковых события chat_accepted/chat_message, attempts мгновенно достигает maxAttempts и запись ложно уходит в dead_letter, хотя доставка удалась.

> _Проверка:_ Подтверждено кодом: claimDueDeliveries (open-channel.repository.ts:595-599 и 616-619) инкрементирует только attempts/updatedAt, оставляя status="pending" и старый nextAttemptAt, а start() (open-channel-delivery.service.ts:83-95) ставит setInterval без флага running (в telegram-polling.worker.ts:92-107 такой флаг есть) — при таймауте попытки до 10с каждый 3-секундный тик заново клеймит ту же запись и шлёт дубликат POST; продакшен-путь реален (main.ts:74 → delivery.start(3000)). Дополнительно resolveDelivery безусловно перезаписывает статус, так что опоздавший фейл дубликата может вернуть delivered-запись в pending или ложно увести в dead_letter.

### 9. 🟠 `backend/apps/api-gateway/src/integrations/telegram-polling.worker.ts:145`
**Ошибка getUpdates по одному Telegram-подключению прерывает весь цикл опроса — остальные тенанты перестают получать сообщения.**

- **Область:** Интеграции / Open Channel · **категория:** ops · найдено независимо 2 ревьюерами
- **Почему дефект:** В pollTelegramUpdatesOnce вызов fetchTelegramUpdates внутри `for (const connection of connections)` не обёрнут в try/catch; fetchTelegramUpdates бросает telegram_polling_provider_failed/telegram_polling_webhook_conflict/timeout. Исключение вылетает из всей функции, startTelegramPollingWorker только логирует через onError и на следующем тике снова начинает с начала списка (createdAt asc) — до сломанного подключения и снова падает.
- **Сценарий:** У одного тенанта отозван бот-токен (401 на каждый getUpdates) или на стороне Telegram настроен webhook (постоянный 409): все подключения, идущие в списке после него, навсегда перестают опрашиваться — входящие сообщения других тенантов не поступают, пока проблемное подключение не отключат вручную.

> _Проверка:_ Подтверждено: в pollTelegramUpdatesOnce (telegram-polling.worker.ts:145) fetchTelegramUpdates внутри цикла по подключениям не обёрнут в try/catch и бросает telegram_polling_provider_failed:401/webhook_conflict/timeout наружу; onError в telegram-polling.main.ts:48-54 только логирует, а Prisma-репозиторий возвращает подключения строго orderBy createdAt asc (integration.repository.ts:2584), поэтому все подключения после сломанного стабильно не опрашиваются на каждом тике. Поведение «одно битое подключение валит весь прогон» даже зафиксировано существующим тестом assert.rejects (tests/telegram-polling-contracts.test.ts:227-232). Severity high корректна: одна тенантская мисконфигурация (отозванный токен/включённый webhook) молча останавливает входящие сообщения других тенантов, при этом Telegram хранит апдейты ~24ч — возможна реальная потеря.

### 10. 🟠 `backend/apps/api-gateway/src/integrations/integration.service.ts:1533`
**webhookUrl, выдаваемый для VK/MAX/Telegram подключений, указывает на несуществующий маршрут /api/v1/integrations/{type}/webhook/{connectionId}.**

- **Область:** Интеграции / Open Channel · **категория:** contract
- **Почему дефект:** resolveChannelServiceEndpoint строит `${base}/api/v1/integrations/${type}/webhook/${connectionId}` и игнорирует providedWebhookUrl для token-managed типов; этот URL сохраняется в connection.webhookUrl и отдаётся админке через maskChannelConnection. Реальные ингресс-маршруты (grep всех @Controller/@Post + setGlobalPrefix('api/v1') в main.ts:63): POST /api/v1/webhooks/vk/:connectionId, /api/v1/webhooks/max/:connectionId, /api/v1/webhooks/telegram. Ни один контроллер не обслуживает путь integrations/{type}/webhook — тот же неверный URL зашит и в seed.ts:126.
- **Сценарий:** Тенант создаёт VK-подключение, копирует webhookUrl из ответа createChannelConnection и вписывает его в Callback API ВКонтакте: все колбэки получают 404, VK помечает сервер нерабочим, сообщения из VK/MAX не доходят до платформы.

> _Проверка:_ Подтверждено: resolveChannelServiceEndpoint (integration.service.ts:1533) строит /api/v1/integrations/{type}/webhook/{connectionId}, а полный перебор контроллеров показывает, что такого маршрута нет — реальный ингресс POST /api/v1/webhooks/vk|max/:connectionId (provider-webhook.controller.ts:18,25) и /api/v1/webhooks/telegram. Мёртвый URL сохраняется и отдаётся тенанту через maskChannelConnection рядом с webhookSecret, при этом авторегистрации колбэка у VK/MAX и поллинга для них нет — корректный URL продукт нигде не публикует, так что настройка входящих VK/MAX по контракту гарантированно даёт 404. Telegram смягчён отдельным флоу /integrations/channels/telegram с правильным URL и поллинг-воркером, поэтому severity high (блокер именно для VK/MAX), не critical.

### 11. 🟠 `backend/apps/api-gateway/src/knowledge-sources/knowledge-retrieval.service.ts:53`
**Ключ 5-минутного кэша retrieval не включает scoreThreshold, поэтому результаты, посчитанные с одним порогом, отдаются вызовам с другим порогом — политика evidence-threshold обходит кэш.**

- **Область:** Знания / AI-подключения · **категория:** correctness
- **Почему дефект:** buildRetrievalCacheKey (knowledge-retrieval-cache.ts:105) строится только из query, sourceBindings, tenantId и tokenBudget, а scoreThreshold (строка 73) влияет и на фильтр кандидатов (строка 87), и на lead-chunk fallback (строка 98, включается только при threshold <= 0.05). Порог приходит из per-scenario политики retrievalScoreThreshold (automation/agent-policy.ts:37-44) и из bot-runtime.service.ts:286; endpoint «Знаний» (knowledge-retrieval-api.service.ts) вообще вызывает retrieve без порога. tokenBudget у бота и у UI-теста одинаковый (1500), т.е. ключи совпадают.
- **Сценарий:** Оператор проверяет вопрос в разделе «Знания» (threshold=0.05, в кэш кладётся слабый lead-chunk со score 0.01) → в течение 5 минут клиент задаёт тот же вопрос боту сценария со строгим retrievalScoreThreshold=0.4 → cache hit возвращает слабый фрагмент, бот отвечает «по знаниям» вопреки политике вместо handoff. Обратный порядок — строгий вызов кэширует пустой результат, и лояльный вызов 5 минут получает «знаний нет».

> _Проверка:_ Подтверждено: buildRetrievalCacheKey (knowledge-retrieval-cache.ts:105-113) не включает scoreThreshold, а retrieve возвращает кэш до применения порога (knowledge-retrieval.service.ts:53-70), при этом порог управляет и фильтром (стр. 87), и lead-chunk fallback (стр. 98). Коллизия реализуема: оба вызывающих (бот с policy.retrievalScoreThreshold и endpoint «Знаний» без порога) используют один singleton-кэш в одном процессе, одинаковый tokenBudget 1500 и те же sourceBindings сценария, а evaluatePostPolicy (agent-policy.ts:85-90) сверяет только счётчики цитат и не перепроверяет score — слабый кэшированный фрагмент (0.01) проходит как «знания найдены», ломая обещанный в комментарии кода handoff при строгом пороге. Severity high оправдана: тихий обход evidence-политики в клиентском потоке бота, обе стороны (ответ невпопад вместо handoff и ложное «знаний нет») воспроизводимы в 5-минутном окне TT…

### 12. 🟠 `backend/apps/api-gateway/src/billing/billing.repository.ts:4333`
**applyUsageDelta/usageValue не поддерживают ресурсы users и workspaces, поэтому commit квотной резервации по этим ресурсам не потребляет квоту.**

- **Область:** Биллинг / Отчёты / Качество · **категория:** correctness
- **Почему дефект:** quotaMetric в billing.service.ts (строки 1543, 1545) поддерживает ресурсы users/workspaces (used = tenant.users / tenant.workspaces), а normalizeResource явно маппит 'user'->'users', 'workspace'->'workspaces' — т.е. это полноценные ресурсы API резервации. Но applyUsageDelta (строка 4333) в switch не имеет кейсов 'users'/'workspaces' и молча возвращает usage без изменений, а usageValue возвращает 0 по default. Commit (и Prisma-путь, строка 2005, и in-memory, строка 2887) обновляет только tenant.usage и никогда tenant.users/tenant.workspaces.
- **Сценарий:** POST /billing/reservations {resource:'users', requested:1} → allow → POST /billing/reservations/:id/commit → ответ содержит usedAfter=0 (при usedBefore=340), tenant.users не увеличивается. Повторяя цикл reserve→commit, арендатор бесконечно проводит места сверх includedUsers — лимит тарифа фактически не применяется для мест и воркспейсов, а счётчик usedAfter в записи резервации испорчен (0 < usedBefore).

> _Проверка:_ Подтверждено: applyUsageDelta (billing.repository.ts:4335-4357) не имеет кейсов 'users'/'workspaces' и молча возвращает usage без изменений, а usageValue возвращает 0 по default — при этом reserveQuota принимает эти ресурсы (quotaMetric, service:1543/1545) и activeReservedAmount считает только статус 'reserved' (service:1159), так что после commit холд исчезает, tenant.users/workspaces нигде не инкрементируются (единственная запись — при провижининге), и цикл reserve→commit бесконечно проходит без потребления квоты с испорченным usedAfter=0 < usedBefore.

### 13. 🟠 `backend/apps/api-gateway/src/billing/billing.repository.ts:1994`
**commitQuotaReservation и releaseQuotaReservation в репозитории не проверяют текущий статус резервации — проверка статуса живёт только в сервисе вне транзакции.**

- **Область:** Биллинг / Отчёты / Качество · **категория:** race
- **Почему дефект:** Prisma-транзакция commitQuotaReservation (строки 1994-2030) читает резервацию только на существование и безусловно инкрементирует usage тенанта и пишет status='committed'; releaseQuotaReservation (строки 2032-2051) аналогично безусловно ставит 'released'. In-memory версии (строки 2868, 2916) тоже без guard'а. Единственные проверки статуса — в BillingService.commitQuotaReservation/releaseQuotaReservation (billing.service.ts:536-558, 615-637) до вызова репозитория, между чтением и записью нет атомарности.
- **Сценарий:** Два параллельных POST /billing/reservations/:id/commit с разными idempotencyKey: оба читают статус 'reserved', оба проходят проверку, обе транзакции инкрементируют tenant.usage — потребление списывается дважды за одну резервацию (двойной биллинг счётчиков). Аналогично: commit конкурентно с release (или с релизом воркера просроченных) — резервация может быть закоммичена уже после release либо релизнута после commit без отката usage.

> _Проверка:_ Подтверждено: в billing.repository.ts транзакция commitQuotaReservation (1994-2030) и нетранзакционный releaseQuotaReservation (2032-2051) обновляют по where {id} без guard'а по статусу, а единственные проверки статуса — в billing.service.ts (536-558, 615-637) отдельным чтением до вызова репозитория; мьютексов, isolationLevel и updateMany-с-условием нет, уникальные индексы idempotency-ключей межстрочные и гонку на одной строке не блокируют. Сценарий воспроизводим даже с одинаковым idempotencyKey (in-flight retry): вторая транзакция читает уже инкрементированный usage тенанта и прибавляет requested повторно, а конкурентный release (в т.ч. воркером просрочки, guard которого тоже в JS вне атомарности) не откатывает usage после commit. Severity high оправдана: перманентный дрейф счётчиков квот без механизма компенсации.

### 14. 🟠 `backend/apps/api-gateway/src/reports/report-digest.worker.ts:85`
**Digest-воркер передаёт periodKey (дату вида '2026-06-30') как period экспорт-задачи, но export-воркер принимает только today/yesterday/7days/30days — каждый scheduled-digest экспорт падает.**

- **Область:** Биллинг / Отчёты / Качество · **категория:** contract
- **Почему дефект:** queueScheduledDigestExportJob вызывает requestReportExport с period: descriptor.periodKey (строка 85); periodKey — календарная дата (tests/report-export-worker-contracts.test.ts: '2026-06-30', смок: `period_${runId}`). Задача сохраняется с queue 'report-export', её позже забирает executeReportExportWorkerOnce → reportExportSnapshot → buildLiveReportWorkspace({period: job.period}) → normalizePeriod (report-live-workspace.ts:163-170) кидает RangeError('Unsupported report period: 2026-06-30') → catch помечает job statusKey='error'. Тесты покрывают только постановку задачи, не её исполнение воркером.
- **Сценарий:** Descriptor дайджеста со status 'due' клеймится, экспорт ставится в очередь (status ok), descriptor помечается 'completed' и ставится notification 'export.ready' — но при первом же прогоне report-export-worker задача уходит в error с failureMessage 'Unsupported report period: …'. Файл дайджеста никогда не создаётся, при этом уведомление о готовности уже отправлено в очередь.

> _Проверка:_ Цепочка подтверждена кодом: report-digest.worker.ts:85 передаёт periodKey как period, requestReportExport сохраняет его без валидации в job очереди 'report-export' (report.service.ts:589,600), а executeReportExportWorkerOnce → reportExportSnapshot → normalizePeriod (report-live-workspace.ts:163-170) принимает только today/yesterday/7days/30days и кидает RangeError — job уходит в error (report-export.worker.ts:508-518). periodKey по дизайну уникален на период (даты в тестах, идемпотентный ключ scheduled-digest-export:...:periodKey), т.е. валидным enum быть не может; при этом descriptor помечается 'completed' и уведомление 'export.ready' ставится до исполнения экспорта — ложный успех подтверждён.

### 15. 🟠 `backend/apps/api-gateway/src/workspace/workspace.service.ts:689`
**POST /templates позволяет оператору одного тенанта перезаписать и «угнать» шаблон другого тенанта, передав его id.**

- **Область:** Workspace / Operations / Platform · **категория:** security
- **Почему дефект:** WorkspaceService.saveTemplate принимает клиентский template.id и без проверки владельца (нет findTemplate(id, {tenantId})) вызывает workspaceRepository.saveTemplate, который делает prisma upsert по where:{id} (workspace.repository.ts:1334-1343), а toPrismaTemplateRecordUpdateInput включает tenantId (workspace.repository.ts:2572-2578). Существующая запись чужого тенанта обновляется текстом/заголовком атакующего и получает tenantId вызывающего.
- **Сценарий:** Оператор тенанта B с правом templates.write отправляет POST /templates c body {id:"tpl_<id тенанта A>", title, text, ...} → шаблон тенанта A перезаписан и перенесён в тенант B; тенант A теряет свой шаблон, изоляция тенантов нарушена.

> _Проверка:_ Подтверждено. POST /templates (templates.controller.ts:27-28) передаёт клиентский id и tenant вызывающего в saveTemplate; сервис (workspace.service.ts:689-698) использует template.id без проверки владельца; репозиторий делает prisma upsert по where:{id} (workspace.repository.ts:1336-1339), а модель TemplateRecord имеет id String @id как единственный PK (schema.prisma:960), поэтому update-input с tenantId/text/title (2572-2584) перезаписывает чужую строку и меняет её tenantId. Единственный барьер — id жертвы это неперечислимый UUID (нужен утёкший id), но проверки write-ownership нет вовсе — нарушение tenant-изоляции реально, severity high.

### 16. 🟠 `backend/apps/outbox-worker/src/clamav-scanner.main.ts:25`
**HTTP-сервис clamav-scanner не имеет никакой аутентификации и выполняет GET по произвольному URL из тела запроса (SSRF), при этом порт опубликован на хост.**

- **Область:** Outbox / События / БД · **категория:** security
- **Почему дефект:** Обработчик POST /scan берёт signedFile.url и signedFile.headers прямо из JSON запроса и делает fetch(url, {headers...}) без какой-либо проверки Authorization — заголовок вообще не читается. При этом клиентская сторона контракта поддерживает токен: createHttpAttachmentScanner в outbox-worker/src/index.ts:1565 отправляет `authorization: Bearer ...`, и docker-compose передаёт OUTBOX_SCANNER_BEARER_TOKEN, но сервер его игнорирует — авторизация мёртвая. В docker-compose.yml сервис clamav-scanner публикует `ports: 14120:4120` на хост и слушает 0.0.0.0.
- **Сценарий:** Любой, кто дотягивается до порта 14120 хоста, отправляет POST /scan с signedFile.url на внутренний адрес (minio, api-gateway, metadata endpoint) и произвольными заголовками — сервис выполнит аутентифицированный GET изнутри сети; ответ ('signed_file_download_failed:403' vs verdict) работает как оракул статус-кодов и позволяет сканировать внутреннюю сеть.

> _Проверка:_ Подтверждено кодом. clamav-scanner.main.ts:10-44 не читает Authorization (grep по 'authorization'/'request.headers' пуст), берёт url и headers прямо из тела и делает fetch(url,{headers}) без валидации схемы/хоста (SSRF с контролем заголовков). Клиент шлёт Bearer (index.ts:1565), но сервер его игнорирует; дефолт токена в compose пуст. Порт 14120:4120 опубликован на хост (docker-compose.yml:544), listen на 0.0.0.0, реверс-прокси нет. Ответ 'signed_file_download_failed:<status>' (стр.30/42) — оракул статус-кодов. Severity high обоснована.

### 17. 🟠 `src/app/useWorkspaceRoute.js:56`
**Guard маршрута #/app срабатывает по устаревшему состоянию сессии и выбрасывает аутентифицированного оператора на форму логина при возврате в приложение.**

- **Область:** Фронтенд: каркас · **категория:** race
- **Почему дефект:** isAppDenied (строка 40) вычисляется как route==='app' && !loading && !authenticated. Но состояние сессии локально обнуляется при уходе с #/app: в App.jsx:62 enabled для useTenantSessionState вычисляется из window.location.hash, а useTenantSessionState.js:18-20 при !enabled ставит {authenticated:false, loading:false}. При возврате на #/app эффект-guard (строки 51-64) выполняется в том же коммите, что и повторный refresh(): refresh только запускает fetch и планирует loading:true на следующий рендер, а замыкание guard-а уже захватило isAppDenied=true — setRoute('auth') и replaceState('#/login') выполняются до завершения проверки сессии. Токен в sessionStorage при этом валиден: refresh чуть позже вернёт authenticated:true, но route уже принудительно 'auth', и App.jsx:433 безусловно рендерит AuthPage.
- **Сценарий:** Оператор работает в воркспейсе, нажимает всегда видимую кнопку «Сайт» в TopBar (AppShell.jsx:102) или «Вход», затем возвращается кнопкой «Назад» браузера на #/app. Вместо воркспейса он получает форму логина и тост «Войдите в аккаунт оператора…», хотя сессия жива — приходится заново вводить учётные данные.

> _Проверка:_ Подтверждено кодом: уход с #/app обнуляет сессию локально (App.jsx:61-63 → useTenantSessionState.js:18-20), а при возврате по Back guard (useWorkspaceRoute.js:51-64) выполняется в коммите со stale-замыканием {authenticated:false, loading:false} — setState(loading:true) из refresh батчится и не успевает, поэтому setRoute('auth')+replaceState('#/login') выкидывают оператора на AuthPage (App.jsx:433), где нет авто-восстановления сессии, и ловушка повторяется при каждом hash-переходе на #/app без полной перезагрузки.

### 18. 🟠 `src/features/dialogs/ChatPane.jsx:82`
**Гонка в requestAiAssist: ответ незавершённого запроса ИИ-подсказки из предыдущего диалога/канала попадает в модалку текущего — без проверки идентичности запроса.**

- **Область:** Фронтенд: кокпит диалогов · **категория:** race
- **Почему дефект:** requestAiAssist (ChatPane.jsx:74-99) не имеет токена запроса: setAiAssist(current => ...) проверяет только, что current не null («модалка не закрыта»), но не то, что ответ относится к актуальному запросу. Эффект на строке 70-72 обнуляет aiAssist при смене conversation.id, однако если оператор сразу открывает ИИ-подсказку в новом диалоге, current снова truthy ({loading:true}) — и завершившийся запрос старого диалога записывает свои suggestions/citations в состояние.
- **Сценарий:** Оператор жмёт «ИИ-подсказка» в диалоге клиента А (запрос медленный), переключается на диалог клиента Б и снова жмёт «ИИ-подсказка». Ответ по клиенту А приходит (до или после ответа Б) → модалка в диалоге Б показывает варианты ответа, сгенерированные по переписке клиента А; оператор вставляет их в композер и может отправить клиенту Б чужой контекст. Та же гонка воспроизводится при смене канала ответа между двумя запросами (target resolveThreadSendTarget различается).

> _Проверка:_ Подтверждено: setAiAssist в ChatPane.jsx:82 проверяет только truthiness current, а не идентичность запроса; ChatPane рендерится без key={conversation.id} (DialogWorkspace.jsx:80), поэтому инстанс и замыкание висящего промиса переживают переключение диалога, AbortController в src отсутствует, кнопка «ИИ-подсказка» (Composer.jsx:279) не блокируется на время загрузки. Второй клик в диалоге Б делает current={loading:true}, и ответ по диалогу А записывает свои suggestions/citations в модалку Б — оператор может вставить и отправить клиенту Б текст, сгенерированный по переписке А.

### 19. 🟠 `src/features/settings/SettingsScreen.jsx:22`
**После перехода в настройки из уведомления пользователь навсегда «заперт» на deep-link-вкладке: эффект принудительно возвращает activeTab к requestedTab при каждой ручной смене вкладки.**

- **Область:** Фронтенд: настройки/сервис-админка · **категория:** correctness
- **Почему дефект:** Эффект `useEffect(() => { if (requestedTab && requestedTab !== activeTab) setActiveTab(requestedTab); }, [activeTab, requestedTab])` зависит от activeTab. Проп navigationTarget приходит из App.jsx (строка 627) из состояния notificationNavigationTarget, которое устанавливается в handleNotificationNavigation (App.jsx:343) и НИГДЕ не сбрасывается. Пока пользователь в разделе settings, requestedTab стабилен, и любой setActiveTab(другая вкладка) немедленно откатывается эффектом. В buildNotificationNavigationState даже заложен navigationKey для одноразового применения цели — здесь он не используется.
- **Сценарий:** Пользователь кликает уведомление, ведущее на вкладку «Подключения» → открываются настройки на connections. Затем кликает вкладку «Сотрудники» → вкладка мигает и мгновенно возвращается на «Подключения». Все 7 вкладок недоступны до перезагрузки страницы или клика по другому уведомлению.

> _Проверка:_ Подтверждено кодом: эффект SettingsScreen.jsx:24-28 откатывает любой setActiveTab к requestedTab, а notificationNavigationTarget в App.jsx устанавливается только в handleNotificationNavigation (строка 343) и нигде не сбрасывается — grep по src нашёл лишь строки 45/343/627. navigationKey (App.jsx:669) создаётся, но нигде не потребляется, так что one-shot-механизма нет; после deep-link из уведомления все остальные вкладки настроек недоступны до перезагрузки.

### 20. 🟠 `src/features/automation/AutomationScreen.jsx:495`
**Смена источников знаний у опубликованного сценария молча затирает все ранее накопленные черновые правки (draft overlay) опубликованными значениями.**

- **Область:** Фронтенд: прочее · **категория:** data-integrity
- **Почему дефект:** handleConsoleUpdate вызывает persistScenarioDraft({ ...selectedScenario, ...fields }), где selectedScenario — сырой сценарий с ОПУБЛИКОВАННЫМИ полями (draft лежит отдельно в scenario.draft и в поля не влит). Вкладка «Знания» в ScenarioConsole.jsx:382 передаёт fields = { sourceBindings }, поэтому в PATCH уходят published name/channels/basePrompt/flowNodes/flowEdges/triggerRules. Бэкенд saveScenarioDraftOverlay (automation.service.ts:878-892) для каждого request-поля !== undefined перезаписывает его в overlay — т.е. draft.name/flowNodes и т.д. откатываются к опубликованным значениям. Форма настроек корректно строит payload от effective (mergeDraft), а knowledge-вкладка — нет.
- **Сценарий:** Опубликованный сценарий → в «Настройке» меняют тон/промпт/фразы (сохраняется как черновик следующей версии, баннер «есть неопубликованные изменения») → переходят в «Знания» и ставят галочку у источника → все черновые правки настроек молча заменяются опубликованными значениями; при публикации пользователь получает не то, что настраивал.

> _Проверка:_ Подтверждено кодом: вкладка «Знания» (ScenarioConsole.jsx:382) передаёт только { sourceBindings }, а handleConsoleUpdate (AutomationScreen.jsx:495) шлёт PATCH из сырого selectedScenario с опубликованными name/basePrompt/flowNodes/flowEdges/channels/triggerRules (draft лежит отдельно в .draft и в top-level не влит, см. normalizeScenario:1079 и persistScenarioDraft:340). Бэкенд saveScenarioDraftOverlay (automation.service.ts:878-892) перезаписывает в overlay каждое поле !== undefined, контроллер ничего не фильтрует — значит все накопленные черновые правки настроек молча откатываются к опубликованным значениям; severity high корректна (тихая потеря работы пользователя, но не затрагивает работающую опубликованную версию).

### 21. 🟠 `packages/web-widget/src/index.js:155`
**visitorSessionToken живет 15 минут, но виджет никогда его не обновляет — после истечения опрос ответов оператора молча умирает навсегда.**

- **Область:** Web-widget · **категория:** correctness · найдено независимо 2 ревьюерами
- **Почему дефект:** Токен выдается только в ответе POST /public/sdk/messages (backend/apps/api-gateway/src/integrations/public-sdk-messages.route.ts:23 — VISITOR_TOKEN_TTL_SECONDS = 60*15, строка 271 — единственное место выдачи). Ответ poll-эндпоинта токена не содержит, а pollOperatorReplies после истечения получает envelope status=denied (visitor_session_token_expired), apiRequest бросает исключение, которое проглатывается в startPolling через .catch(() => {}). Никакой логики переполучения токена (reconnect) в виджете нет.
- **Сценарий:** Посетитель пишет вопрос и ждет. Оператор отвечает через 20 минут — виджет продолжает опрашивать каждые 3 секунды, но все запросы отклоняются по истекшему токену, и ответ оператора не появляется у посетителя, пока тот сам не отправит еще одно сообщение (что выдаст новый токен).

> _Проверка:_ Подтверждено: createVisitorSessionToken вызывается только в ответе POST /public/sdk/messages (public-sdk-messages.route.ts:271, TTL 15 мин — строки 23/480), poll-хендлер отклоняет истёкший токен denied-конвертом (строки 311–322, 513–514) и не возвращает новый. В виджете токен присваивается только в sendVisitorMessage (index.js:141–143), а startPolling глотает ошибку через .catch(() => {}) (index.js:372–374) — после 15 минут ожидания ответы оператора молча не доходят, пока посетитель сам не напишет снова.

### 22. 🟠 `packages/web-widget/src/index.js:99`
**buildUrl использует new URL() без base и падает на относительном apiBase, который официально рекомендован в demo.html и embed-сниппете.**

- **Область:** Web-widget · **категория:** contract
- **Почему дефект:** new URL("/api/v1/public/sdk/...") без второго аргумента бросает TypeError: Invalid URL. При этом packages/web-widget/demo.html (строки 58-61 и 75-82) прямо документирует и использует apiBase: "/api/v1" («При preview через Vite proxy достаточно относительного пути»). Presence/poll/инвайты глушат ошибку через .catch(() => {}), поэтому виджет выглядит рабочим, но ни один запрос не уходит.
- **Сценарий:** Разработчик поднимает demo.html по инструкции из самого файла: виджет отрисовывается, presence и приглашения молча не работают, а при отправке сообщения посетитель видит «Ошибка отправки: Failed to construct 'URL': Invalid URL».

> _Проверка:_ Подтверждено: buildUrl (src/index.js:99) вызывает new URL без base — new URL('/api/v1/...') воспроизводимо бросает TypeError: Invalid URL, а init валидирует только непустоту apiBase. При этом demo.html и embed-сниппет официально рекомендуют и используют apiBase: "/api/v1", прокси /api реально настроен в vite.config.js (server и preview), а presence/поллинг глушат ошибки через .catch(() => {}) — виджет выглядит рабочим, но ни один запрос не уходит, и ошибка видна только при отправке сообщения.

### 23. 🟠 `backend/scripts/release-checklist.mjs:8`
**Релизный чеклист безусловно выполняет prisma:seed, который заводит в целевой БД демо-аккаунты (включая платформенного service-admin) с известным паролем «correct-password».**

- **Область:** Скрипты / Инфраструктура · **категория:** security
- **Почему дефект:** Шаг { name: "Prisma identity seed", script: "prisma:seed" } запускает backend/scripts/seed-identity.ts, где defaultServiceAdminPasswordCredential() и defaultTenantPasswordCredentials() пишут hashPasswordCredential("correct-password") для service-admin@example.com (role service_admin, tenantScope platform из seed-catalog.ts) и всех демо-операторов. В seed-identity.ts нет ни одной проверки окружения (grep по RUNTIME_PROFILE/production — пусто). При этом release-database-preflight.mjs официально поддерживает удалённую БД через RELEASE_ALLOW_REMOTE_DATABASE=true + RELEASE_TARGET_ENVIRONMENT — то есть путь «чеклист против не-локальной БД» является поддерживаемым сценарием, а не злоупотреблением.
- **Сценарий:** Оператор запускает `npm run release:checklist` c DATABASE_URL стейджа/прода и RELEASE_ALLOW_REMOTE_DATABASE=true (как того требует preflight). В целевой БД появляются password_credentials с паролем «correct-password» (unsalted sha256), включая учётку сервис-админа платформенного скоупа — полная компрометация окружения любым, кто читал открытый репозиторий.

> _Проверка:_ Подтверждено кодом: release-checklist.mjs:8 безусловно гонит prisma:seed → seed-identity.ts, где для service-admin@example.com (role service_admin, tenantScope platform) и всех демо-операторов пишется hashPasswordCredential("correct-password") без каких-либо проверок окружения; preflight официально поддерживает удалённую БД (RELEASE_ALLOW_REMOTE_DATABASE=true), а node --env-file НЕ перекрывает заданный в шелле DATABASE_URL (проверил эмпирически, Node v22) — значит remote-URL доходит до сида. Уточнения автора неверны, но дефект остаётся: хеш это scrypt-с-солью, а не unsalted sha256 (атака использует ИЗВЕСТНЫЙ открытый пароль, не взлом хеша), и upsert на update не перезаписывает hash — но в remote-среде создаёт бэкдор-аккаунты заново; requireMfa:true для service-admin слегка умеряет прямой вход, но демо-операторы всё равно создаются с известным паролем.

### 24. 🟠 `scripts/runtime-backup.mjs:52`
**pipeCommand завершает файл дампа по событию 'exit' процесса, когда в stdout ещё могут оставаться непрочитанные данные — pg_dump может быть молча обрезан.**

- **Область:** Скрипты / Инфраструктура · **категория:** race
- **Почему дефект:** child.once("exit", (code) => code === 0 ? output.end(resolvePromise) : ...) — по документации Node на момент 'exit' stdio-потоки могут быть ещё открыты (нужно ждать 'close' или 'finish' у destination после естественного конца pipe). output.end() финализирует WriteStream досрочно; последующие записи pipe уходят в write-after-end и молча теряются (pipe вешает свой error-хендлер на dest). Затем manifest.json (строки 27–39) считает sha256 уже от обрезанного файла, так что верификация целостности в runtime-restore-drill.mjs (строки 12–17) проходит успешно.
- **Сценарий:** Большой дамп (несколько МБ): docker exec завершился, а хвост данных ещё в пайпе → postgres.dump обрезан, манифест зафиксировал битый файл как валидный. Для боевого бэкапа (npm run backup:runtime без drill) порча обнаружится только при реальном восстановлении, когда данные уже потеряны.

> _Проверка:_ Подтверждено репро на этой машине: Node действительно эмитит 'exit' до конца stdout (наблюдал порядок data→exit→end), а если 'exit' застаёт stdout на паузе из-за backpressure (штатное состояние при записи на диск), output.end() резолвит промис, скрипт завершается с кодом 0 без единой ошибки, файл обрезан — хвост тихо выбрасывается через unpipe после 'close' WriteStream (не write-after-end, как думал автор, но итог тот же). На быстром SSD хвост (~150КБ бэклога) успевает слиться быстрее ~1мс задержки нотификации exit (33 прогона без потерь), но документация предписывает бэкап на отдельный диск (D:\support-backups), где окно реально; manifest.json при этом фиксирует sha уже обрезанного дампа, и sha-проверка drill проходит. Severity high оправдана: тихая порча боевого бэкапа, обнаруживаемая только при восстановлении.

### 25. 🟠 `backend/apps/api-gateway/src/conversation/appeal-lifecycle.ts:209`
**resolveOrForkAppealConversation делает check-then-act с рандомным id follow-up обращения — конкурентные вебхуки одного клиента создают два параллельных диалога.**

- **Область:** Скв.: гонки · **категория:** race · найдено независимо 2 ревьюерами
- **Почему дефект:** findLatestAppealConversation (findConversation + listConversations — полный скан таблицы, широкое окно гонки), затем buildFollowUpAppeal генерирует id `${anchorId}_appeal_${randomUUID()...}` и сохраняет. Никакого уникального ограничения «одно открытое обращение на anchor» нет; рандомный суффикс лишает upsert детерминированной сходимости. Функция используется всеми входящими каналами: telegram-webhook.route.ts:225, provider-conversation.ts:36, public-sdk-messages.route.ts:97, open-chat.route.ts:220.
- **Сценарий:** Клиент после закрытого диалога быстро отправляет два сообщения; оба вебхука видят закрытого родителя (status=closed) и каждый создаёт свой follow-up с разным рандомным id → в инбоксе появляются два открытых обращения одного клиента, сообщения раскиданы между ними, бот/маршрутизация срабатывают дважды.

> _Проверка:_ Подтверждено кодом: resolveOrForkAppealConversation (appeal-lifecycle.ts:190-211) делает read→decide→write без блокировок, follow-up id содержит randomUUID (строка 135), а upsert идёт только по id (conversation.repository.ts:626-630), поэтому два конкурентных вебхука после закрытого диалога вставляют два разных открытых обращения. В schema.prisma у Conversation нет уникального ограничения «одно открытое обращение на anchor», дедуп normalizeInboundEvent вызывается после резолва и ключуется по eventId (разный у разных сообщений), механизма склейки дублей нет — сценарий воспроизводим на всех четырёх входящих каналах.

### 26. 🟠 `backend/apps/api-gateway/src/integrations/open-channel/open-channel.repository.ts:616`
**claimDueDeliveriesPrisma не помечает доставку как взятую в работу (статус остаётся pending), а цикл OpenChannelDeliveryService.start() не имеет защиты от наложения тиков — вебхуки/чат-события доставляются внешним потребителям многократно.**

- **Область:** Скв.: гонки · **категория:** race · найдено независимо 2 ревьюерами
- **Почему дефект:** Claim делает findMany(status='pending', nextAttemptAt<=now) и update только attempts+1/updatedAt — ни status='publishing', ни lockedAt, ни guard в where. resolveDelivery меняет статус лишь ПОСЛЕ HTTP-попытки (таймаут до 10с на доставку, до 20 доставок за проход). start() в open-channel-delivery.service.ts:85 — setInterval(3с) c `void this.runOnce()` без флага running (в отличие от воркеров url-source-refresh/document-ingestion, где флаг есть). Рантайм стартует в проде: main.ts:74 → startOpenChannelRuntime().
- **Сценарий:** Потребитель вебхука отвечает медленно (5-10с): проход занимает десятки секунд, каждые 3с новый тик снова находит те же записи pending и снова POST'ит их — внешняя система получает один и тот же chat_accepted/chat_message многократно, счётчик attempts гонится и может преждевременно увести запись в dead_letter.

> _Проверка:_ Подтверждено кодом: claimDueDeliveriesPrisma (open-channel.repository.ts:606-623) обновляет только attempts/updatedAt, оставляя status="pending" и nextAttemptAt без изменений, а start() (open-channel-delivery.service.ts:83-95) — setInterval(3с) с `void this.runOnce()` без флага running, при этом проход серийно POST'ит до 20 доставок с таймаутом до 10с и меняет статус лишь после HTTP-попытки. Достаточно потребителя, отвечающего медленнее 3с (в пределах поддерживаемых 10с), чтобы каждый тик повторно захватывал те же записи: внешняя система получает дубли событий, а разогнанный attempts (maxAttempts=3) преждевременно уводит запись в dead_letter при первой же неудаче. Рантайм стартует в проде безусловно (main.ts:74 → open-channel-runtime.ts:35), смягчений (идемпотентность, лок, сериализация проходов) нигде нет.

### 27. 🟠 `backend/apps/api-gateway/src/conversation/conversation.repository.ts:710`
**listConversations() читает ВСЕ диалоги всех тенантов без take и без фильтра по tenantId, с include всех сообщений каждого диалога, и вызывается на горячих путях.**

- **Область:** Скв.: Prisma/данные · **категория:** ops
- **Почему дефект:** PrismaConversationRepository.listConversations использует conversationWithMessagesQuery(): только include:{messages} и orderBy, ни where, ни take (строки 374-377, 1493-1498). Вызовы: telegram-webhook.route.ts:407 (на каждый входящий webhook с оценкой), conversation.service.ts:322, canonical-routing-conversation.repository.ts:59 (маршрутизация), quality.service.ts:151, open-chat.route.ts:204 — все фильтруют по тенанту уже в памяти.
- **Сценарий:** На инсталляции с несколькими тенантами и историей в десятки тысяч диалогов каждый Telegram-webhook и каждый цикл маршрутизации выгружает в память всю таблицу conversations плюс все conversation_messages БД целиком — время ответа и память растут линейно с общим объёмом данных, изоляция по тенанту обеспечивается только пост-фильтром в JS.

> _Проверка:_ Подтверждено кодом: PrismaConversationRepository.listConversations() (conversation.repository.ts:710) вызывает findMany с conversationWithMessagesQuery(), где тип запроса (строки 374-377, 1493-1502) вообще не содержит полей where/take — выгружается вся таблица со всеми сообщениями. Продакшен всегда на Prisma (packages/database/src/index.ts:50 «Prisma-only runtime... repositories always run on Prisma»), а все 5 вызовов (fetchDialogs с пагинацией в памяти, telegram-rating, маршрутизация, quality, публичный пинг open-chat:204) фильтруют tenantId уже в JS. Severity high корректна: это деградация времени/памяти O(вся БД) на горячих путях, но не утечка между тенантами.

### 28. 🟠 `backend/apps/api-gateway/src/conversation/conversation.repository.ts:851`
**listRealtimeEvents не поддерживает ни take, ни курсор, а open-channel event pump вызывает его каждые 2 секунды на append-only таблице без ретенции — полный скан conversation_realtime_events на каждый тик.**

- **Область:** Скв.: Prisma/данные · **категория:** ops
- **Почему дефект:** Метод строит findMany только с orderBy и опциональным where.tenantId. open-channel-event-pump.ts:77 вызывает listRealtimeEvents({}) в runOnce (setInterval 2s, строка 56) и фильтрует по курсору lastOccurredAt уже в JS. Записи в conversation_realtime_events добавляются при каждой мутации диалога, production-кода удаления/ретенции нет (deleteMany по этой таблице встречается только в smoke-скриптах). Аналогично conversation.service.ts:1835 и bot-runtime.worker.ts:276 читают события тенанта целиком.
- **Сценарий:** Через месяц работы таблица содержит миллионы строк; пумпа каждые 2 секунды вытягивает их все в память гейтвея, сортирует и отбрасывает по курсору — CPU/память процесса и трафик к Postgres растут неограниченно, пумпа перестаёт успевать за интервал (а re-entrancy-защиты у setInterval тоже нет).

> _Проверка:_ Подтверждено: listRealtimeEvents (conversation.repository.ts:851) строит findMany без take/курсора, а пумпа (open-channel-event-pump.ts:77) вызывает его с пустым фильтром каждые 2 с (setInterval без re-entrancy-защиты, стартует безусловно из main.ts:74, opt-out только OPEN_CHANNEL_DISABLED), применяя курсор lastOccurredAt уже в JS после полной выгрузки таблицы. Записи append-only (create без трима из 6+ мест, включая каждый inbound-месседж), единственный deleteMany — в pilot-smoke-тесте, ретенции/индекса под форму запроса нет; conversation.service.ts:1835 и bot-runtime.worker.ts:276 читают журнал тенанта целиком (последний — ради поиска одного уникального eventId). Severity high корректна: деградация неограниченная, но постепенная, без потери данных.


---

## 🟡 Medium (76)

#### Identity / Auth (8)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/identity/mfa-otp.ts:68` | security | Fail-open дефолты по NODE_ENV: незаданный NODE_ENV трактуется как "test" → MFA-код сервис-админа фиксированный "123456", MFA тенант-операторов отключён, включены недоделанные SSO-потоки. |
| 🟡 | `backend/apps/api-gateway/src/identity/auth.service.ts:1350` | data-integrity | acceptInvite сжигает invite-токен до проверки membership: при несовпадении пользователя/тенанта токен уже помечен consumed и приглашение безвозвратно теряется. |
| 🟡 | `backend/apps/api-gateway/src/identity/auth.service.ts:1007` | correctness | Гейт логина тенант-оператора опирается на findTenantUserByEmail (findFirst без orderBy): при membership в нескольких тенантах логин недетерминированно блокируется, если «первой» вернулась неактивная запись. |
| 🟡 | `backend/apps/api-gateway/src/identity/settings-employee.service.ts:242` | correctness | updateEmployee принимает произвольный payload.status без валидации и позволяет деактивировать последнего администратора, обходя проверку last_admin_required. |
| 🟡 | `backend/apps/api-gateway/src/identity/settings-employee.service.ts:270` | error-handling | resetEmployeePassword — заглушка: не создаёт recovery-токен и ничего не отправляет, лишь дописывает строку в supportNotes, которую потом парсит как «статус». |
| 🟡 | `backend/apps/api-gateway/src/identity/tenant-provision.service.ts:144` | data-integrity | Компенсация в provisionTenant — no-op (`void tenantId`): при падении любого шага после saveTenant остаётся полусозданный тенант, а slug заблокирован навсегда. |
| 🟡 | `backend/apps/api-gateway/src/identity/auth.service.ts:1210` | contract | Клиенту выдаётся refreshToken (TTL 14 дней), но эндпоинта обновления токенов не существует — rotateServiceAdminRefreshToken мёртвый код, сессия жёстко умирает через 60 минут. |
| 🟡 | `backend/apps/api-gateway/src/identity/settings-rules.service.ts:36` | data-integrity | Бизнес-правила настроек и их аудит живут только в in-memory Map инстанса: изменения теряются при рестарте и не видны другим инстансам гейтвея. |

#### Биллинг / Отчёты / Качество (6)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/reports/report.controller.ts:137` | security | requesterUserId берётся только из serviceAdminContext и никогда из tenantOperatorContext.userId — приватные шаблоны отчётов видны всем операторам тенанта. |
| 🟡 | `backend/apps/api-gateway/src/billing/billing.service.ts:443` | race | reserveQuota делает check-then-create без атомарности: подсчёт занятого объёма и создание резервации — отдельные операции. |
| 🟡 | `backend/apps/api-gateway/src/billing/quota-expiration.worker.ts:51` | ops | Воркер освобождения просроченных квотных резерваций не подключён ни к одному entrypoint — просроченные резервации навсегда блокируют квоту. |
| 🟡 | `backend/apps/api-gateway/src/quality/quality.service.ts:253` | correctness | Идемпотентный повтор scoreDraftResponse с AI-провайдером возвращает ошибку idempotency_key_reused вместо кэшированного результата и повторно тратит вызов LLM. |
| 🟡 | `backend/apps/api-gateway/src/reports/report.service.ts:234` | error-handling | fetchReportWorkspace не перехватывает RangeError из normalizePeriod/normalizeTimezoneOffset — невалидные query-параметры дают 500 вместо invalid-envelope. |
| 🟡 | `backend/apps/api-gateway/src/reports/report.service.ts:880` | correctness | materializeReadyExportFile игнорирует snapshotAt задачи и строит файл по текущему времени — содержимое ленивой регенерации не соответствует заявленному снапшоту экспорта. |

#### Фронтенд: кокпит диалогов (5)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `src/features/dialogs/ChatHeader.jsx:30` | security | Маскирование телефона клиента «fails open»: номер в любом формате, кроме канонического «+7 XXX XXX-XX-XX», показывается оператору без права canViewSensitive полностью. |
| 🟡 | `src/features/dialogs/TranscriptToolbar.jsx:21` | data-integrity | Выбранный «Результат закрытия» (resolutionOutcome) не сбрасывается при переключении диалога в TranscriptToolbar и CustomerPanel — закрытие следующего диалога уходит с результатом, выбранным для предыдущего. |
| 🟡 | `src/features/dialogs/BotHandoffSummary.jsx:22` | correctness | Состояние оценки бот-хендоффа (selected/status/error) переживает переключение диалогов: после оценки в одном диалоге плашка другого диалога показывает «Оценка сохранена» и блокирует кнопки. |
| 🟡 | `src/features/dialogs/CustomerPanel.jsx:140` | error-handling | Если закрыть модалку «Диалог клиента» во время загрузки полного списка, повторное открытие молча пропускает загрузку: показывается неполная история без ошибки и без ретрая. |
| 🟡 | `src/features/dialogs/ConversationList.jsx:213` | dead-code | Пагинация списка диалогов — заглушка: кнопки «Назад»/«Вперед» не имеют обработчиков, а инбокс всегда грузит только page 1 (pageSize 50), так что диалоги дальше первых 50 недостижимы из кокпита. |

#### Интеграции / Open Channel (5)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/integrations/telegram-outbound.dispatcher.ts:53` | correctness | Исходящие Telegram-сообщения отправляются через первое активное подключение тенанта, игнорируя бота, которому принадлежит диалог. |
| 🟡 | `backend/apps/api-gateway/src/integrations/integration.repository.ts:2133` | race | Клейм записей журнала webhook-доставки в Prisma-ветке неатомарен: findMany + безусловный update позволяют двум воркерам захватить одну запись. |
| 🟡 | `backend/apps/api-gateway/src/integrations/open-channel/open-channel-event-pump.ts:100` | data-integrity | Event pump продвигает курсор мимо событий, обработка которых упала, — вебхук/уведомление бота теряется навсегда; параллельные тики с одним курсором дают дубликаты. |
| 🟡 | `backend/apps/api-gateway/src/integrations/open-channel/open-channel-admin.controller.ts:411` | security | SSRF: outboundUrl/providerUrl/webhook URL принимают любой http(s)-адрес, включая внутренние сети, и фоновые воркеры POST'ят туда из инфраструктуры. |
| 🟡 | `backend/apps/api-gateway/src/integrations/open-channel/external-bot.route.ts:106` | correctness | notifyChatClosed отправляет CHAT_CLOSED в первое активное bot-подключение тенанта, а не в то, которое реально ведёт диалог. |

#### Workspace / Operations / Platform (5)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/notifications/notification.service.ts:575` | data-integrity | В sendCriticalAlertTest в файле сохранён «кракозябренный» текст (двойная перекодировка кириллицы) — пользователи видят мусор вместо «Проверить critical route». |
| 🟡 | `backend/apps/api-gateway/src/workspace/workspace.service.ts:327` | security | Квота на загрузку файлов реально не применяется: fileUploadQuota нигде не подключается в рантайме, проверка молча пропускается. |
| 🟡 | `backend/apps/api-gateway/src/workspace/object-storage.ts:85` | correctness | Проверка размера/чексуммы при finalizeUpload мертва в продакшене: ни S3-совместимый, ни локальный сайнер не реализуют getObjectMetadata. |
| 🟡 | `backend/apps/api-gateway/src/operations/bootstrap.ts:74` | dead-code | Реплей dead-letter сообщений не может сработать вне локального рантайма: реестр backend-сторов пуст, а в локальном режиме регистрируются лишь детерминированные заглушки. |
| 🟡 | `backend/apps/api-gateway/src/notifications/notification-delivery.worker.ts:178` | race | Воркер доставки browser-push не клеймит дескрипторы и не защищён от перекрытия итераций — возможна повторная отправка одного и того же push. |

#### Фронтенд: прочее (5)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `src/features/automation/ScenarioConsole.jsx:148` | contract | В паспорте сценария поле «Знания» всегда показывает «источники не привязаны»: используется row.sourceTitles, которого buildScenarioListRow не возвращает. |
| 🟡 | `src/features/automation/AutomationScreen.jsx:214` | correctness | В пустом состоянии (нет ни одного сценария) кнопка «Добавить URL-страницу» в мастере молча не работает: модалка urlSourceForm не отрендерена в этой ветке. |
| 🟡 | `src/features/automation/ScenarioConsole.jsx:95` | error-handling | handleSave сбрасывает formDirty даже при неудачном сохранении, из-за чего кнопка «Сохранить» блокируется, а индикатор несохранённых правок исчезает. |
| 🟡 | `src/features/onboarding/OrganizationOnboarding.jsx:125` | contract | Обязательный шаг «Лимиты», чекбокс «Требовать 2FA», роль администратора, отрасль и годовая оплата собираются в онбординге, но никогда не отправляются на бэкенд. |
| 🟡 | `src/features/auth/AuthPage.jsx:195` | contract | Форма SSO требует и валидирует домен организации, но не передаёт его в startOidcLogin; выбор провайдера тоже почти декоративен. |

#### Скрипты / Инфраструктура (5)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `scripts/runtime-watchdog.mjs:59` | error-handling | Ошибка или зависание webhook-уведомления убивает watchdog целиком: notify() бросает исключение в необёрнутом top-level цикле, а у fetch нет таймаута. |
| 🟡 | `scripts/compose-health-check.mjs:7` | ops | Health-гейт не проверяет два долгоживущих воркера из docker-compose.yml — knowledge-document-ingestion-worker и url-source-refresh-worker. |
| 🟡 | `scripts/release-gate.mjs:109` | race | Гейт запускает compose-health-check сразу после `docker compose up -d --build` без --wait: воркеры с healthcheck ещё в состоянии starting, шаг падает ложно. |
| 🟡 | `scripts/release-gate.mjs:19` | contract | Список scrubProviderEnv разошёлся с именами переменных, которые реально интерполирует docker-compose: чистятся неиспользуемые имена, а действующие протекают в «чистый» гейтовый стек. |
| 🟡 | `docker-compose.yml:55` | security | В production-like стеке зашиты необновляемые секреты: JWT-секреты, PUBLIC_API_KEY_SECRET и DEMO_SERVICE_ADMIN_KEY без ${}-переопределения, причём значение ключа сервис-админа специально обходит гвард на дефолт. |

#### Боты / AI-рантайм (4)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/automation/automation.service.ts:275` | security | Mass assignment в updateBotScenario: спред ...request переносит в сохраняемый сценарий любые поля BotScenario из тела PATCH, включая legalHold/auditHold/activeVersionId/createdAt/retentionUntil/draft. |
| 🟡 | `backend/apps/api-gateway/src/automation/automation.repository.ts:1308` | data-integrity | saveWorkspaceAuditEvent — единственный метод фасада без делегирования в Prisma-адаптер: на Prisma-рантайме аудит-события пишутся в процессный InMemoryStore и теряются. |
| 🟡 | `backend/apps/api-gateway/src/automation/automation.repository.ts:2038` | contract | Prisma readStateAsync не загружает botRuntimeInstances и botRuntimeSteps, поэтому операционные сводки сценариев на Prisma-рантайме всегда пустые. |
| 🟡 | `backend/apps/api-gateway/src/automation/bot-runtime.service.ts:117` | dead-code | retryInboundEvent/retryBotRuntimeInboundEvent не вызываются ни одним воркером или роутом — состояние retry_scheduled никогда не ретраится, а клиент остаётся без ответа и без оператора. |

#### Знания / AI-подключения (4)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts:79` | data-integrity | enable() решает «ready или draft» только по metadata.chunks, поэтому URL- и MCP-источники после disable→enable проваливаются в draft; у MCP-источника нет ни одного пути обратно в ready — он необратимо выпадает из retrieval. |
| 🟡 | `backend/apps/api-gateway/src/ai-connections/ai-usage.repository.ts:93` | race | Prisma-ветка учёта AI-квот делает неатомарный read-modify-write: конкурирующие запросы теряют записи requestTimes и приращения usedTokens, позволяя превышать RPM-лимит и месячный бюджет токенов. |
| 🟡 | `backend/apps/api-gateway/src/automation/ai-bot-response.service.ts:177` | correctness | Rate limit MCP-коннектора (rateLimitPerMinute) в основном бот-пути не работает: McpReadOnlyConnectorService создаётся заново на каждый запрос, а его счётчик минутного окна живёт в поле экземпляра. |
| 🟡 | `backend/apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts:312` | ops | Задачи индексации, захваченные упавшим воркером, навсегда остаются в статусе processing: нет lease-таймаута, повторной выдачи и лимита attempts — источник вечно висит в «indexing». |

#### Тесты (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `playwright.config.js:4` | test-gap | В конфиге Playwright не задан testMatch, поэтому дефолтная маска захватывает все node:test-сьюты *.test.js из tests/ и запускает их (и все spec-файлы параллельно) при голом `npx playwright test`. |
| 🟡 | `tests/settings-runtime.spec.js:317` | correctness | Тест «reports runtime creates export retries failed jobs...» перманентно красный: он требует в сиде export-джобы в статусах error/expired и ready, а смок-сид создаёт пустой список exportJobs. |
| 🟡 | `playwright.config.js:25` | ops | reuseExistingServer: true у vite-dev-сервера сводит на нет защитный override DEV_API_PROXY_TARGET: уже запущенный dev-сервер с .env.development.local проксирует смоки в пилотный гейтвей 4101. |

#### Скв.: Prisma/данные (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/identity/identity-auth-flow.repository.ts:28` | ops | N+1 при каждом логине оператора: listTenantMembershipsForEmail перебирает все тенанты и для каждого выгружает всех его пользователей, чтобы найти членства одного email. |
| 🟡 | `backend/apps/api-gateway/src/routing/routing.repository.ts:1430` | ops | saveStateSideTables на каждое сохранение состояния маршрутизации заново upsert'ит ВСЕ строки routing_analytics_rows (и jobs/memberships/rules) по одной — количество запросов на транзакцию растёт линейно с историей назначений. |
| 🟡 | `backend/apps/api-gateway/src/conversation/conversation.repository.ts:894` | ops | listLifecycleEvents выгружает из БД все lifecycle-события тенанта/диалога и применяет cursor/limit уже в памяти — пагинация не доходит до SQL. |

#### Диалоги / Routing (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/conversation/conversation.service.ts:244` | ops | Неограниченный рост памяти: массив liveRealtimeEvents в ConversationService пополняется каждым событием из Redis-fanout и никогда не усечётся. |
| 🟡 | `backend/apps/api-gateway/src/routing/routing.service.ts:105` | race | RoutingService — синглтон с разделяемым мутабельным состоянием (conversations/operators/queues/rescueReportRows), которое мутируется между await'ами конкурентными запросами, а откат при ошибке затирает изменения параллельного запроса. |
| 🟡 | `backend/apps/api-gateway/src/conversation/conversation.service.ts:881` | data-integrity | Защита legacy-записей при ручном изменении телефона не срабатывает для числовых Telegram chatId: адрес доставки затирается, ответы клиенту перестают доставляться. |

#### Outbox / События / БД (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/outbox-worker/src/index.ts:477` | correctness | В runFileScanScannerWorker событие, для которого сканер вернул пустой результат, навсегда зависает в статусе publishing — без учёта попыток и без dead-letter. |
| 🟡 | `backend/apps/outbox-worker/src/index.ts:1897` | race | Весь путь передачи вложений VK/MAX/Telegram (скачивание файла и upload к провайдеру) выполняется без таймаутов; параметр timeoutMs в resolveMaxAttachments принят, но нигде не используется. |
| 🟡 | `backend/apps/outbox-worker/src/index.ts:1019` | error-handling | Сбой бухгалтерской записи (recordProviderMessageBinding или обновление deliveryState=delivered) после успешной доставки провайдеру приводит к пометке события failed и повторной отправке уже доставленного сообщения. |

#### Каркас gateway / пакеты (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/packages/redaction/src/index.ts:50` | security | Операторский access token, передаваемый в query (?accessToken=) для SSE-стрима, не покрыт ни одним паттерном редакции и утекает в логи в открытом виде. |
| 🟡 | `backend/apps/api-gateway/src/http-exception.filter.ts:17` | contract | Глобальный фильтр ловит только HttpException — любое другое необработанное исключение отдаётся клиенту без конверта и traceId. |
| 🟡 | `backend/apps/api-gateway/src/identity/auth.controller.ts:51` | security | POST /auth/tenant/select без guard позволяет неаутентифицированно перечислять членства: по email+tenantId возвращаются название тенанта и роль пользователя. |

#### Web-widget (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `packages/web-widget/src/index.js:574` | security | clearHistory() («деавторизация» по докам) чистит storage, но не сбрасывает живые state.subjectId/externalId/sessionId — новые сообщения продолжают попадать в диалог прежнего пользователя. |
| 🟡 | `packages/web-widget/src/index.js:287` | contract | После принятия проактивного приглашения виджет обнуляет visitorSessionToken, а ответ accept-эндпоинта токена не содержит — открытый чат не может получать сообщения оператора. |
| 🟡 | `packages/web-widget/src/index.js:916` | ops | Виджет несовместим со строгим CSP: стили — только через инлайновые <style>, разметка — через innerHTML, что ломается под style-src без unsafe-inline и под Trusted Types. |

#### Скв.: мёртвый код (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/automation/bot-observability.ts:127` | ops | Функция recordBotDeliveryFailure не вызывается нигде в репозитории, поэтому метрика bot_delivery_failures_total всегда равна 0 и алерт runtime_dead_letter по сбоям доставки бота никогда не сработает. |
| 🟡 | `backend/apps/api-gateway/src/knowledge-sources/url-source-config.test.ts:1` | test-gap | Два полноценных тест-файла лежат внутри src/ и никогда не запускаются: url-source-config.test.ts (анти-SSRF проверки) и ai-connections/openai-compatible-chat.provider.test.ts. |
| 🟡 | `backend/apps/api-gateway/src/billing/billing-provider.sandbox.ts:163` | dead-code | Мёртвый кластер биллинг-провайдера: billing-provider.sandbox.ts (166 строк) и billing-provider.port.ts не используются никем, а фабрика createBillingProvider(mode) игнорирует параметр mode и всегда возвращает sandbox. |

#### Скв.: гонки (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `backend/apps/api-gateway/src/reports/report.repository.ts:893` | race | claimQueuedExportJobsAsync — неатомарный клейм экспорт-задач (findMany queued → upsert Running без guard'а) и без lease: конкуренты обрабатывают задачу дважды, а после падения воркера задача навсегда зависает в Running. |
| 🟡 | `backend/apps/api-gateway/src/reports/report-digest.worker.ts:63` | error-handling | Клейм плановых дайджестов неатомарен и без восстановления: при исключении в queueScheduledDigestExportJob или падении процесса дескрипторы навсегда остаются в running и дайджест за период не отправляется. |
| 🟡 | `backend/apps/api-gateway/src/ai-connections/ai-usage.repository.ts:119` | race | Счётчик AI-usage обновляется по схеме read-modify-write без атомарного инкремента — конкурентные AI-ответы теряют учтённые токены и запросы, лимиты бюджета/rate-limit обходятся. |

#### Фронтенд: каркас (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `src/app/useConversationInbox.js:50` | error-handling | При 401/session_expired посреди работы очищается только sessionStorage, но React-состояние сессии не сбрасывается — пользователь остаётся в мёртвом воркспейсе, а realtime-поллинг бесконечно молотит API без токена. |
| 🟡 | `src/app/useRealtimeInbox.js:63` | security | Access token сессии передаётся в query string URL EventSource — попадает в access-логи прокси/гейтвея. |

#### Фронтенд: сервисы/сторы (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `src/services/authService.js:44` | security | Методы authService.logout и authService.logoutTenant нигде не вызываются — «Выйти» в UI не отзывает серверную сессию, bearer-токен остаётся валидным до истечения срока. |
| 🟡 | `src/services/tenantProvisionService.js:28` | data-integrity | В боевой payload онбординга захардкожен фиктивный домен `${slug}.example.test` для SDK-канала — каждая реально созданная организация получает канал, привязанный к несуществующему домену. |

#### Фронтенд: настройки/сервис-админка (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| 🟡 | `src/service-admin/ServiceAdminApp.jsx:47` | security | «Выйти» из сервис-админки не отзывает bearer-сессию на сервере — только удаляет токен из sessionStorage. |


---

## ⚪ Low (45)

<details><summary>Показать 45 находок low</summary>

#### Скв.: мёртвый код (6)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `src/app/useConversationMutations.js:7` | dead-code | Файл-сирота: хук useConversationMutations (84 строки) не импортируется ни одним модулем. |
| ⚪ | `backend/scripts/seeds/identity.seed.ts:1` | dead-code | Каталог backend/scripts/seeds/ (11 шим-файлов плюс закоммиченные артефакты сборки .js/.d.ts/.js.map) и пять одноразовых кодмод-скриптов мертвы — остатки миграции fixtures→seeds. |
| ⚪ | `backend/apps/api-gateway/src/service-admin/seed-catalog.ts:3` | dead-code | Демо-каталог serviceAdminTenants/serviceAdminUsers мёртв: его единственный импортёр — мёртвый шим backend/scripts/seeds/service-admin.seed.ts. |
| ⚪ | `backend/apps/api-gateway/src/identity/identity.seed.ts:1` | dead-code | Однострочный файл-шим identity.seed.ts (export * from "./seed-catalog.js") никем не импортируется. |
| ⚪ | `src/app/dialogModel.js:207` | dead-code | Функция createOutboundConversation мертва — вытеснена createQueuedOutboundConversation из useOutboundConversation.js, но осталась в модели. |
| ⚪ | `backend/apps/api-gateway/src/operations/load-test-runner.worker.ts:359` | dead-code | Async-дублёры геттеров нагрузочных прогонов — getLoadTestRunStatusAsync, getLoadTestRunMetricsAsync, getLoadTestRunErrorSummaryAsync — не вызываются нигде. |

#### Фронтенд: настройки/сервис-админка (4)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `src/features/service-admin/AiConnectionsWorkspace.jsx:38` | race | Смена организации в AI-подключениях без отмены незавершённого запроса и без сброса режима редактирования: возможен показ подключений чужого тенанта и PATCH со смешанной парой tenantId/connectionId. |
| ⚪ | `src/features/settings/TelegramChannelSetupPanel.jsx:14` | dead-code | Целая панель настройки Telegram-бота (токен, webhook URL, secret_token, команда setWebhook) — мёртвый код: компонент нигде не импортируется и не рендерится. |
| ⚪ | `src/features/settings/ChannelConnectionsPanel.jsx:96` | correctness | При активном deep-link из уведомления выбор подключения сбрасывается обратно на «фокусное» после каждой перезагрузки списка (т.е. после любой мутации). |
| ⚪ | `src/features/settings/SettingsScreen.jsx:59` | correctness | Сводка «Подключения» в навигации настроек всегда показывает «0 из 0 активны», пока пользователь не откроет саму вкладку подключений. |

#### Фронтенд: кокпит диалогов (4)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `src/features/dialogs/clientDialogHistoryModel.js:62` | correctness | Архивным строкам истории из сиблинг-обращений присваивается канал текущего обращения, а не канал обращения-источника (sibling.channel). |
| ⚪ | `src/features/dialogs/AuditTimeline.jsx:18` | correctness | Флаг pinnedToBottomRef не сбрасывается при переключении диалога: после скролла вверх в одном диалоге следующий открывается не на последнем сообщении и перестаёт автопрокручиваться на новых сообщениях. |
| ⚪ | `src/features/dialogs/CustomerPanel.jsx:217` | dead-code | Нерабочие управляющие кнопки: «Копировать» в карточке клиента и «Информация» в шапке чата не имеют обработчиков. |
| ⚪ | `src/features/dialogs/Composer.jsx:35` | dead-code | Проп onAttachmentComplete протаскивается через DialogWorkspace → ChatPane → Composer, но в Composer нигде не используется — мёртвая проводка. |

#### Workspace / Operations / Platform (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/apps/api-gateway/src/notifications/notification.service.ts:96` | dead-code | NotificationService.configureRealtimeFanoutFromEnv никогда не вызывается — realtime-фанаут уведомлений навсегда остаётся отключённым адаптером. |
| ⚪ | `backend/apps/api-gateway/src/workspace/workspace.service.ts:230` | data-integrity | mergeClientProfiles/unmergeClientProfile записывают immutable merge-события для произвольных, в т.ч. несуществующих, profileId без валидации. |
| ⚪ | `backend/apps/api-gateway/src/workspace/topic-directory.service.ts:210` | data-integrity | Справочник тем живёт только в module-level Map (sharedTopicStore): любые изменения теряются при рестарте и не разделяются между инстансами. |

#### Знания / AI-подключения (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts:330` | race | savePrismaIngestionJob делает findFirst→create без обработки нарушения уникальности: гонка двух одинаковых enqueue-запросов даёт необработанный P2002 и 500 вместо идемпотентного duplicate-ответа. |
| ⚪ | `backend/apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts:306` | dead-code | ingestScannedAttachment — мёртвый в продакшене метод: его не вызывает ни один контроллер или воркер, продовый путь индексации идёт через processOneKnowledgeDocumentIngestion с дублирующей логикой. |
| ⚪ | `backend/apps/api-gateway/src/knowledge-sources/document-ingestion.worker.ts:33` | error-handling | Воркер пишет в failureCode произвольный error.message: в поле, которое контрактно является машинным кодом и показывается в бейджах «Знаний», попадает сырой текст исключения транспорта. |

#### Фронтенд: прочее (3)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `src/features/automation/AutomationScreen.jsx:1105` | data-integrity | normalizeScenario отбрасывает sourceVersion из sourceBindings, и любое сохранение из UI снимает закрепление версий источников. |
| ⚪ | `src/features/auth/authModel.js:40` | dead-code | Захардкоженные демо-организации (North Retail, City Care, Internal Support) используются как начальные memberships и как organization в onAuthSuccess. |
| ⚪ | `src/features/templates/TemplatesScreen.jsx:220` | dead-code | Кнопки переменных {client_name}/{operator_name}/{ticket_id}/{topic} и «Предпросмотр» — нерабочие заглушки. |

#### Диалоги / Routing (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/apps/api-gateway/src/routing/routing.service.ts:259` | contract | Параметр overrideLimit в POST /routing/assignments принимается контроллером и сервисом, но никогда не срабатывает: превышение лимита отклоняется даже при capacity.overrideAllowed === true. |
| ⚪ | `backend/apps/api-gateway/src/conversation/conversation.service.ts:604` | correctness | Закрытый диалог можно перевести в любой статус (active, assigned, waiting_client …) в обход официального reopen: блокируется только closed→closed, и при этом resolutionOutcome не очищается. |

#### Outbox / События / БД (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/prisma/schema.prisma:666` | data-integrity | Расхождение схемы и миграций: несколько индексов, созданных миграциями, не объявлены в schema.prisma — следующий autogenerate-diff Prisma их удалит или переименует. |
| ⚪ | `backend/apps/outbox-worker/src/index.ts:1483` | error-handling | HTTP-хелперы воркера затирают исходную причину ошибки константой worker_http_dispatch_failed, теряя диагностику в lastError события. |

#### Фронтенд: сервисы/сторы (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `src/services/supportAdminService.js:142` | correctness | В aiConnectionRequest guard «AI connection id is required» мёртв для undefined/null/"": запрос с отсутствующим connectionId уходит на маршрут коллекции, а testAiConnection/disableAiConnection превращаются в вызов create-эндпоинта. |
| ⚪ | `src/services/apiClient.js:41` | ops | apiRequest не принимает AbortSignal и не имеет таймаута — ни один запрос в приложении нельзя отменить, зависший fetch держит loading-состояние бесконечно. |

#### Web-widget (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `packages/web-widget/src/index.js:4` | contract | Виджет по умолчанию шлет environment=stage, тогда как бэкенд по умолчанию считает production — продакшен-встройка без явного environment полностью и молча не работает. |
| ⚪ | `packages/web-widget/src/index.js:372` | error-handling | Все три цикла опроса (3с/5с/15с) глушат любые ошибки и не имеют backoff — при перманентной ошибке (невалидный ключ, 5xx) виджет вечно долбит API без диагностики. |

#### Скрипты / Инфраструктура (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/scripts/security-audit.mjs:29` | correctness | При total > 0, но нулевом exit-коде npm audit скрипт печатает «audit failed» и выходит с кодом 0 — гейт зелёный при наличии уязвимостей. |
| ⚪ | `docker/nginx.conf:11` | ops | Проксирование /api/ не настроено под SSE-эндпоинт /api/v1/realtime/events/stream: дефолтные proxy_read_timeout=60s и proxy_buffering=on рвут/задерживают поток. |

#### Тесты (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `tests/pilot-flow.spec.js:8` | test-gap | Тест «widget demo page loads and SupportWidget.init is available» в автоматических прогонах всегда молча скипается: сервер демо-виджета на 5174 никто не поднимает. |
| ⚪ | `tests/smoke.spec.js:1112` | test-gap | Условные ветки if/else вокруг наличия сид-фикстур («Production SDK key», «VK inbound») деградируют смок до тривиальных ассертов и маскируют потерю сида. |

#### Скв.: Prisma/данные (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts:197` | data-integrity | Prisma-ветка delete() удаляет только сам источник знаний, оставляя его ingestion-джобы сиротами, хотя контракт (docstring и in-memory ветка) обещает удалять их вместе с источником. |
| ⚪ | `backend/apps/api-gateway/src/automation/proactive-exposure.repository.ts:199` | error-handling | recordMessageConversion глушит любые ошибки create через пустой catch — при сбое БД конверсия молча теряется вместо проброса ошибки. |

#### Боты / AI-рантайм (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/apps/api-gateway/src/automation/bot-sandbox-session.repository.ts:214` | race | recordSandboxUsagePrisma инкрементирует месячный счётчик токенов песочницы через read-modify-write без атомарности — параллельные ходы теряют инкременты. |
| ⚪ | `backend/apps/api-gateway/src/automation/proactive-delivery.worker.ts:63` | dead-code | runProactiveDeliveryWorkerOnce не использует объявленные входы conversationRepository и visitorTtlMs; спланированные descriptor/outbox отбрасываются, normalizeVisitorTtlMs — мёртвая функция. |

#### Каркас gateway / пакеты (2)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/packages/contracts/src/index.ts:3` | dead-code | Пакет @support-communication/contracts никем не импортируется, а его список backendServices разошёлся с реальными значениями поля service в конвертах. |
| ⚪ | `backend/packages/observability/src/index.ts:55` | ops | Конфиг LOG_LEVEL валидируется, но нигде не применяется: writeStructuredLog пишет все уровни в stdout безусловно. |

#### Интеграции / Open Channel (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/apps/api-gateway/src/integrations/telegram-outbound.dispatcher.ts:68` | error-handling | HTTP-вызов Telegram sendMessage выполняется без таймаута/AbortSignal — зависший запрос блокирует доставку исходящих сообщений. |

#### Фронтенд: каркас (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `src/App.jsx:178` | error-handling | Провал загрузки деталей диалога проглатывается молча и не ретраится: ref помечается «загружено» до выполнения запроса. |

#### Identity / Auth (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/apps/api-gateway/src/identity/runtime-catalog.ts:23` | contract | Два разошедшихся каталога ролей: identityPermissionRoleCatalog (fallback Prisma и in-memory) не содержит presence.read/presence.write и русских алиасов, которые есть в seed-catalog.permissionRoles. |

#### Скв.: ошибки (1)

| Sev | Где | Категория | Суть |
|---|---|---|---|
| ⚪ | `backend/apps/outbox-worker/src/clamav-scanner.main.ts:42` | contract | Сканер отвечает 503 на любые ошибки, включая перманентные валидационные (signed_file_required, file_too_large, request_too_large) — вызывающий воркер зря ретраит непоправимые запросы до dead letter. |

</details>

---

## ⚖️ Спорные (нужна ручная оценка)

#### 🟡 `backend/apps/api-gateway/src/conversation/conversation.service.ts:2495` — matchesTenantScope возвращает true при пустом tenantId, из-за чего диалоговые ручки не изолируют тенанты для сервис-админа без выбранного тенанта.
_Категория: data-integrity. Вердикты разошлись — нужна ручная оценка._
- [подтверждает] Механика подтверждена: matchesTenantScope при пустом tenantId возвращает true (2494-2499), а fetchDialogs/fetchDialogDetail/assignConversation/updateConversationTags/updateConversationClientPhone/transitionConversationStatus/appendMessage используют его как единственный tenant-гейт (последующий if(!tenantId) опирается на собственный tenant диалога и пустой scope не ловит), тогда как соседи (fetchConversationTimeline:402, reports) требуют tenantContextRequired. dialogContextFromRequest для сервис-админа без currentTenantId возвращает {}. Однако предусловие «пустой currentTenantId» в проде почти недостижимо: логин всегда проставляет currentTenantId (auth.service.ts:425), обнуляющей мутации сессии нет, пустой tenant реален лишь при нуле тенантов на логине или через dev-only demo-заголовки; актор — платформенный супер-админ с легитимной кросс-тенантностью. Дефект реальный (нарушение инварианта, defense-in-depth и корректность аудита), но high завышен — medium.
- [опровергает] Предпосылка сценария неверна: продовый логин сервис-админа (auth.service.ts:425) всегда ставит currentTenantId (tenant-volga или первый тенант), импёрсонизация его не трогает, эндпоинта очистки/смены нет — состояние «сервис-админ без тенанта» в проде недостижимо (demo-заголовки гейтятся NODE_ENV=dev/test). Пустой tenantId в matchesTenantScope — реальная, но латентная несогласованность defense-in-depth (timeline/assignees требуют tenant, dialogs — нет), достойная hardening-фикса низкой серьёзности, а не эксплуатируемый high.


---

## ❌ Опровергнуто верификаторами (42)

Ревьюеры их подняли, но независимая проверка признала ложными срабатываниями (случай обработан в другом месте / сценарий нереализуем / вкусовщина).

<details><summary>Показать 42 опровергнутых</summary>

- `backend/apps/api-gateway/src/integrations/public-sdk-messages.route.ts:555` — ~~Захардкоженный fallback-секрет visitor session token: без переменной окружения токены подписываются известной константой "sdk-visitor-session-secret".~~
- `backend/apps/api-gateway/src/knowledge-sources/url-source-policy.repository.ts:70` — ~~Сохранение политики URL-источников с allowedHosts=null падает на реальном Prisma: в nullable Json-колонку передаётся обычный JS null вместо Prisma.JsonNull/DbNull.~~
- `backend/apps/api-gateway/src/routing/routing.service.ts:755` — ~~Параметр durationSeconds в POST /routing/rescue/start объявлен в контракте (контроллер и payload-интерфейс), но игнорируется — таймер всегда 240 секунд.~~
- `tests/smoke.spec.js:398` — ~~Смоки одного файла мутируют общий сид (закрывают диалог Vladimir B., MFA-reset usr-volga-admin, плодят шаблоны) и неявно зависят от порядка объявления тестов; ретраи и выборочный запуск ломают инварианты.~~
- `backend/apps/api-gateway/src/integrations/open-channel/open-channel-delivery.service.ts:151` — ~~Исходящая доставка Open Channel/веб-хуков фетчит сконфигурированный tenant-ом URL без SSRF-защиты (нет проверки приватных IP/DNS), а ответ отражается обратно в диалог.~~
- `backend/apps/api-gateway/src/integrations/open-channel/open-channel-event-pump.ts:56` — ~~OpenChannelEventPump.runOnce читает и сохраняет общий курсор без защиты от наложения тиков — параллельные проходы обрабатывают одни и те же realtime-события и дублируют enqueue вебхуков/бот-уведомлений.~~
- `backend/apps/api-gateway/src/billing/billing.repository.ts:1661` — ~~claimExpiredQuotaReservations выбирает просроченные резервации через findMany и лочит их безусловным update по id — конкурирующие воркеры заклеймят и обработают одни и те же резервации.~~
- `backend/apps/api-gateway/src/integrations/telegram-polling.worker.ts:198` — ~~Провальный апдейт (conversation=null или normalized.status!=ok) не сдвигает offset и не имеет лимита попыток: либо вечный ре-poll одного апдейта, либо тихая потеря сообщения клиента.~~
- `backend/apps/api-gateway/src/integrations/telegram-channel-connection.ts:142` — ~~validateTelegramBotToken вызывает Telegram getMe без таймаута (defaultTelegramHttpFetch — голый fetch): HTTP-запрос создания/обновления канала виснет на всё время зависания api.telegram.org.~~
- `backend/apps/api-gateway/src/identity/auth.service.ts:276` — ~~Параметр privileged в AuthService.login объявлен, но нигде в теле метода не используется, и ни один вызывающий его не передаёт — забытая ветка privileged-политики логина.~~
- `backend/apps/api-gateway/src/conversation/realtime.controller.ts:22` — ~~Realtime-эндпоинты не сужают выдачу сервис-админа до выбранного tenant'а: в отличие от DialogController, здесь игнорируется serviceAdminContext.currentTenantId и отдаются события всех tenant'ов.~~
- `backend/apps/api-gateway/src/automation/agent-policy.ts:94` — ~~В topicMatches тернарный оператор с полностью идентичными ветками: условие topic.split(/\s+/).length > 1 не влияет на результат.~~
- `backend/apps/api-gateway/src/automation/ai-bot-response.service.ts:229` — ~~Функция estimatePromptTokens объявлена, но нигде не используется.~~
- `backend/apps/api-gateway/src/integrations/open-channel/open-chat.route.ts:382` — ~~contentEventId для Chat API сообщений без id включает Date.now(), из-за чего заявленная контентная дедупликация не работает и ретраи создают дубликаты сообщений.~~
- `backend/apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts:213` — ~~Объявленная стейт-машина статусов источника (canTransitionKnowledgeSourceStatus) нигде не применяется: disable() «воскрешает» терминальный archived-источник, который затем через enable() возвращается в retrieval.~~
- `backend/apps/api-gateway/src/billing/billing.service.ts:1911` — ~~paymentSummary складывает amountDue/amountPaid всех инвойсов тенанта без учёта валюты и подписывает сумму валютой первого инвойса.~~
- `backend/apps/api-gateway/src/reports/report.service.ts:1374` — ~~rescueRowsForChannel, isMissedRescueRow и slugify в report.service.ts — мёртвый код, причём isMissedRescueRow содержит битую кириллицу (mojibake).~~
- `backend/apps/api-gateway/src/platform/platform-monitoring.service.ts:414` — ~~Повтор acknowledgeComponentAlert с тем же Idempotency-Key дублирует записи подтверждения алерта.~~
- `backend/apps/outbox-worker/src/index.ts:1918` — ~~stableProviderRandomId сворачивает idempotency key в 31-битный хеш для VK random_id — коллизия заставит VK молча отбросить другое сообщение; Math.abs(-2^31) даёт значение вне int32.~~
- `backend/apps/outbox-worker/src/integration-telegram-store.ts:54` — ~~При неактивном или чужом telegram-подключении резолвер молча подставляет глобальный fallback-токен OUTBOX_TELEGRAM_BOT_TOKEN вместо ошибки.~~
- `backend/packages/config/src/index.ts:42` — ~~Продакшен-проверки конфига отключаются молча (fail-open), если NODE_ENV не задан: дефолты NODE_ENV=development и RUNTIME_PROFILE=local включают локальный профиль.~~
- `backend/apps/api-gateway/src/health.controller.ts:20` — ~~Параметр requestId в health() и ready() не имеет параметр-декоратора Nest и всегда undefined — ветка requestId в build*Envelope недостижима через HTTP.~~
- `src/app/useDialogActions.js:40` — ~~handleTopicChange и handleStatusChange не ожидают результат мутации и показывают success-тост до ответа сервера; смена темы вдобавок не защищена guard-ом canManageDialogs.~~
- `src/app/useAppNavigation.js:26` — ~~Guard секций при недоступной секции сбрасывает в жёстко зашитую 'dialogs', не проверяя, что она доступна пользователю.~~
- `src/app/useDialogActions.js:247` — ~~Ветка handleDialogAction с appendMessage недостижима, а при активации отправила бы служебное audit-событие клиенту как обычный ответ.~~
- `src/app/access.js:178` — ~~Deprecated-экспорт roleAccessProfiles не используется нигде в репозитории, но вычисляется на этапе загрузки модуля.~~
- `src/services/dialogService.js:14` — ~~dialogService (все методы) и source/question-методы knowledgeService не валидируют route id, в отличие от остальных сервисов слоя: undefined попадает в URL как строка "undefined".~~
- `src/services/apiClient.js:21` — ~~buildApiUrl молча отбрасывает path-префикс из VITE_API_BASE_URL: абсолютный путь /api/v1/... при резолве через new URL затирает базовый путь.~~
- `src/features/settings/SdkConsolePanel.jsx:180` — ~~Кнопка «Запустить событие» в SDK playground не блокируется на время запроса — двойной клик по initConversation создаёт два реальных исходящих диалога.~~
- `src/features/settings/AdminWorkspaces.jsx:112` — ~~Ротация API-ключа, повтор webhook-доставки и отзыв security-сессии не защищены от двойного клика: busy не выставляется, а кнопка «Повторить» вообще не имеет disabled.~~
- `src/features/settings/RulesPanel.jsx:176` — ~~Параметры правила отправляют PATCH на каждый blur поля, даже если значение не изменилось: лишние записи, audit-события и тосты «изменения сохранены»; очищенное числовое поле молча отправляет 0.~~
- `src/features/service-admin/ServiceAdminDashboard.jsx:186` — ~~handleRefreshAuthState обращается к envelope.data.authenticated без проверки status: при сетевой ошибке data === null — TypeError в обработчике клика, пользователь не получает никакой обратной связи.~~
- `src/features/settings/EmployeeManagementPanel.jsx:137` — ~~Сброс пароля и сброс MFA сотрудника не защищены от повторного клика во время запроса — двойной клик отправляет два сброса и два письма.~~
- `src/features/automation/ScenarioCreationWizard.jsx:205` — ~~handleCreate очищает сохранённый в sessionStorage черновик мастера даже при неудачном создании сценария.~~
- `src/features/knowledge/KnowledgeScreen.jsx:95` — ~~loadAll молча игнорирует ошибки загрузки вопросов без ответа, MCP-подключений и обратной связи — вкладки показывают ложные «пустые» состояния.~~
- `src/ui.jsx:50` — ~~ScreenStateStrip не поддерживает tone "partial", который передают Reports и Quality: предупреждение рендерится с зелёной галочкой и без warn-стилей.~~
- `packages/web-widget/src/index.js:138` — ~~При смене conversationId после форка обращения (follow-up appeal) не сбрасываются ratingSubmitted и operatorAccepted — повторное обращение нельзя оценить, onAccept не вызывается.~~
- `packages/web-widget/src/index.js:90` — ~~refreshAgentsStatus вызывается один раз при init — sw_api.chatMode() навсегда возвращает статус операторов на момент загрузки страницы.~~
- `docker-compose.yml:124` — ~~У notification-delivery-worker выставлен LOCAL_DEVELOPMENT_SEED_ENABLED: "true" при NODE_ENV=staging/production-like — значение мёртвое и запрещено собственным конфиг-гвардом бэкенда.~~
- `tests/backend-runtime.test.js:1441` — ~~Демаскирование WebSocket-фреймов сломано: Buffer.from(payload, fn) игнорирует колбэк-маппер, XOR с маской не применяется.~~
- `tests/pilot-smoke.test.js:495` — ~~Хелпер patchJson объявлен, но нигде в файле не используется — мёртвый код.~~
- `backend/apps/api-gateway/src/integrations/integration.service.ts:263` — ~~В catch создания Telegram-канала сырое message исключения подставляется как машинный код ошибки конверта — в поле code утекают строки вида «fetch failed» или «Unexpected token < in JSON».~~
</details>

---

## 🔭 Что осталось за рамками ревью (критик полноты)

- **Бэкенд-модули api-gateway вне всех зон: presence/, incidents/, feature-flags/, audit/, runtime/ (~19 файлов в backend/apps/api-gateway/src/)** — Реальные домены — присутствие операторов, инциденты с воркером коммуникаций, движок раскатки фиче-флагов, аудит воркспейса, локальный сид (local-development-seed.ts). Зона «каркас» покрывала только верхнеуровневые файлы (main.ts, app.module.ts и т.п.), а перечень доменных зон эти каталоги не включает; сквозные агенты касаются их лишь grep'ом.
- **public/ и входные HTML: public/browser-push-service-worker.js, site.webmanifest, index.html, service-admin/index.html** — Сервис-воркер браузерных пушей — исполняемый рантайм-код (обработка push-событий, кликов, данных уведомлений), ни одна фронтенд-зона его не покрывает; входные HTML — мета/CSP/подключение бандлов.
- **Фронтенд-каркас вне списка «остальных features»: src/features/app-shell/AppShell.jsx, src/features/section-router.jsx, src/features/audit/AuditScreen.jsx** — AppShell и section-router — навигационный каркас всего приложения; в перечне зоны «остальные features» эти файлы/каталоги не названы, значит формально не покрыты.
- **Документация: docs/ (39 файлов) и backend/docs/** — Публичный контракт docs/open-channel-api.md (внешний Open Channel API) и ранбуки с исполняемыми командами (local-stack-runbook, runtime-backup-and-recovery, runtime-configuration) никто не сверял с кодом — риск дрейфа контракта и нерабочих команд восстановления.
- **Трекаемые сиды stub-гейтвея: .playwright-runtime/*.json (18 файлов)** — Смоки зависят от формы этих фикстур; зона «тесты как код» их не включала. Дрейф сидов с реальными контрактами API и известная история с загрязнением состояния делают их отдельным источником ложно-зелёных/красных тестов.
- **Отсутствие CI, git-хуков и lint-конвейера как класс риска** — В репо нет .github/, gitlab-ci, husky, хуков — тесты и линт никто не гоняет автоматически. Ревью по зонам этого не заметит, потому что файлов просто нет; стоит зафиксировать как процессный риск.
- **Env-контракт: backend/.env.example и согласованность ключей с config-пакетом и docker-compose** — Инфра-зона покрывала compose/Dockerfile/скрипты, зона пакетов — код config/, но сам .env.example (эталон переменных для развёртывания) не назван нигде; рассинхрон ключей — типовой источник падений при деплое.
- **Периферия web-widget: packages/web-widget/demo.html, vite.config.js, package.json виджета** — Зона виджета заявлена как «src, test»; demo.html — публичная демо-страница с инлайн-скриптом подключения, а vite.config определяет формат сборки, раздаваемой клиентам.

_Мелкие расхождения перечней с фактом: src/features/dialogs содержит 26 файлов, а не 23; backend/prisma/ формально входит в зону №8, но она озаглавлена «prisma-схема», при том что в каталоге 148 SQL-миграций — стоит убедиться, что агент реально смотрел миграции (дрейф migrations против schema.prisma), а не только schema.prisma. Каталоги dist/, .runtime/, .worktrees/, test-results/, .claude/ не трекаются — не считал их зонами. CI-конфигов в репозитории нет вовсе (проверено git ls-files), поэтому гэп сформулирован как отсутствие конвейера, а не как непокрытые файлы._
