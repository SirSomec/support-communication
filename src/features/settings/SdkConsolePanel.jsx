import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Code2, Copy, FileText, Globe2, MessageCircle, Paperclip, PlayCircle, Send, Smartphone, X, Zap } from "lucide-react";
import { SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { copyTextToClipboard } from "../../services/clipboardService.js";
import { dialogService } from "../../services/dialogService.js";
import { integrationService } from "../../services/integrationService.js";

const sdkSnippet = `SupportSDK.init({ appId: "gig-app", channels: ["SDK", "Telegram", "MAX", "VK"] })`;
function widgetSnippet({ apiBase, environment, publicKey }) {
  return `<script src="https://cdn.example.com/support-widget.js"></script>\n<script>\n  SupportWidget.init({\n    apiBase: "${apiBase}",\n    publicKey: "${publicKey}",\n    environment: "${environment}"\n  });\n</script>`;
}

function defaultWidgetApiBase() {
  if (typeof window === "undefined") return "https://support.example.com/api/v1";
  return `${window.location.origin}/api/v1`;
}

const defaultSdkEvents = [
  ["identifyUser", "Передает телефон, устройство и ID гигера"],
  ["initConversation", "Инициирует диалог по номеру телефона"],
  ["trackEntryPoint", "Фиксирует SDK, Telegram, MAX или VK"],
  ["syncTopic", "Синхронизирует тематику и запрет закрытия"]
];

function createSdkPlaygroundErrorResult(message, code = "sdk_request_failed") {
  const errorMessage = typeof message === "string" && message.trim()
    ? message
    : "Не удалось выполнить SDK событие.";

  return {
    tone: "error",
    title: "SDK событие не выполнено",
    response: JSON.stringify({
      ok: false,
      error: {
        code,
        message: errorMessage
      }
    }, null, 2)
  };
}

function getSdkPlaygroundSuccessEvidence(serviceResponse, eventName) {
  if (!serviceResponse || typeof serviceResponse !== "object" || typeof serviceResponse.status !== "string") {
    return { error: createSdkPlaygroundErrorResult("Некорректный ответ SDK сервиса.", "malformed_response") };
  }

  if (serviceResponse.status !== "ok") {
    return {
      error: createSdkPlaygroundErrorResult(
        serviceResponse.error?.message,
        serviceResponse.error?.code ?? "sdk_request_failed"
      )
    };
  }

  const requestId = eventName === "initConversation"
    ? serviceResponse.data?.backendQueueId
    : serviceResponse.data?.delivery?.requestId;
  if (!String(serviceResponse.traceId ?? "").trim() || !String(requestId ?? "").trim()) {
    return { error: createSdkPlaygroundErrorResult("Некорректный ответ SDK сервиса.", "malformed_response") };
  }

  return {
    requestId,
    traceId: serviceResponse.traceId
  };
}

export function SdkConsolePanel({ access, canEditSettings, onToast }) {
  const [view, setView] = useState("start");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [widgetCheckState, setWidgetCheckState] = useState("");
  const [widgetApiBase, setWidgetApiBase] = useState(defaultWidgetApiBase);
  const [widgetEnvironment, setWidgetEnvironment] = useState("production");
  const [widgetPublicKey, setWidgetPublicKey] = useState("");
  const [widgetKeyBusy, setWidgetKeyBusy] = useState(false);
  const [widgetKeyError, setWidgetKeyError] = useState("");
  const [widgetPreviewOpen, setWidgetPreviewOpen] = useState(true);
  const [sdkEvents, setSdkEvents] = useState(defaultSdkEvents);
  const [sdkChannelConnections, setSdkChannelConnections] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [sdkPlaygroundEvent, setSdkPlaygroundEvent] = useState(defaultSdkEvents[0][0]);
  const [sdkPlaygroundEnv, setSdkPlaygroundEnv] = useState("production");
  const [sdkPlaygroundChannel, setSdkPlaygroundChannel] = useState("SDK");
  const [sdkPlaygroundUser, setSdkPlaygroundUser] = useState("gig-olga-0940");
  const [sdkPlaygroundPhone, setSdkPlaygroundPhone] = useState("+7 985 430-09-40");
  const [sdkPlaygroundMessage, setSdkPlaygroundMessage] = useState("Здравствуйте, проверяем запуск диалога из SDK.");
  const [sdkPlaygroundResult, setSdkPlaygroundResult] = useState(null);
  const [sdkPlaygroundRunning, setSdkPlaygroundRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const [workspaceResponse, connectionsResponse] = await Promise.all([
          integrationService.fetchIntegrationWorkspace(),
          integrationService.fetchChannelConnections()
        ]);
        if (cancelled) {
          return;
        }

        if (workspaceResponse.status !== "ok" || connectionsResponse.status !== "ok") {
          setLoadError(
            workspaceResponse.error?.message
            ?? connectionsResponse.error?.message
            ?? "Не удалось загрузить SDK workspace."
          );
          setSdkChannelConnections([]);
          return;
        }

        setSdkEvents(workspaceResponse.data?.sdkEventCatalog?.length
          ? workspaceResponse.data.sdkEventCatalog
          : defaultSdkEvents);
        setSdkChannelConnections(connectionsResponse.data?.connections ?? []);
        setSdkPlaygroundEvent((current) => current || workspaceResponse.data?.sdkEventCatalog?.[0]?.[0] || defaultSdkEvents[0][0]);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Не удалось загрузить SDK workspace.");
          setSdkChannelConnections([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingWorkspace(false);
        }
      }
    }

    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableEnvironments = useMemo(() => new Set(
    sdkChannelConnections
      .filter((connection) => connection.type === sdkPlaygroundChannel.toLowerCase() && connection.status === "active")
      .map((connection) => connection.environment)
  ), [sdkChannelConnections, sdkPlaygroundChannel]);

  const sdkPayloadPreview = useMemo(() => {
    const base = {
      appId: sdkPlaygroundEnv === "production" ? "gig-app-prod" : "gig-app-stage",
      event: sdkPlaygroundEvent,
      channel: sdkPlaygroundChannel,
      userId: sdkPlaygroundUser,
      timestamp: new Date().toISOString()
    };

    if (sdkPlaygroundEvent === "identifyUser") {
      return {
        ...base,
        payload: {
          phone: sdkPlaygroundPhone,
          device: sdkPlaygroundChannel === "SDK" ? "iOS 17" : "external",
          entryPoint: sdkPlaygroundChannel
        }
      };
    }

    if (sdkPlaygroundEvent === "initConversation") {
      return {
        ...base,
        payload: {
          phone: sdkPlaygroundPhone,
          topic: "Оплата / Возврат",
          message: sdkPlaygroundMessage,
          operatorId: "auto"
        }
      };
    }

    if (sdkPlaygroundEvent === "trackEntryPoint") {
      return {
        ...base,
        payload: {
          source: sdkPlaygroundChannel,
          screen: "order_status",
          utm: "support_entry"
        }
      };
    }

    return {
      ...base,
      payload: {
        topic: "Оплата / Возврат",
        requiredForClose: true,
        source: sdkPlaygroundChannel
      }
    };
  }, [sdkPlaygroundChannel, sdkPlaygroundEnv, sdkPlaygroundEvent, sdkPlaygroundMessage, sdkPlaygroundPhone, sdkPlaygroundUser]);

  async function handleSdkPlaygroundRun() {
    if (!canEditSettings || loadError || loadingWorkspace || sdkPlaygroundRunning) {
      return;
    }

    const requiresPhone = ["identifyUser", "initConversation"].includes(sdkPlaygroundEvent);
    const requiresMessage = sdkPlaygroundEvent === "initConversation";
    if ((requiresPhone && !sdkPlaygroundPhone.trim()) || (requiresMessage && !sdkPlaygroundMessage.trim())) {
      setSdkPlaygroundResult({
        tone: "error",
        title: "Payload не прошел валидацию",
        response: "{ \"ok\": false, \"error\": \"phone_or_message_required\" }"
      });
      return;
    }

    setSdkPlaygroundResult(null);
    setSdkPlaygroundRunning(true);

    try {
      let serviceResponse;
      if (sdkPlaygroundEvent === "initConversation") {
        serviceResponse = await dialogService.createOutboundConversationRequest({
            channel: sdkPlaygroundChannel,
            environment: sdkPlaygroundEnv,
            message: sdkPlaygroundMessage,
            phone: sdkPlaygroundPhone,
            topic: "Оплата / Возврат",
            userId: sdkPlaygroundUser
          });
      } else {
        const connection = sdkChannelConnections.find((item) =>
          item.type === sdkPlaygroundChannel.toLowerCase()
          && item.environment === sdkPlaygroundEnv
          && item.status === "active"
        );
        if (!connection) {
          setSdkPlaygroundResult(createSdkPlaygroundErrorResult(
            `Нет активного подключения ${sdkPlaygroundChannel} в окружении ${sdkPlaygroundEnv}.`,
            "channel_connection_unavailable"
          ));
          return;
        }
        serviceResponse = await integrationService.testChannelConnectionInstance({
            connectionId: connection.id,
            message: sdkPlaygroundEvent,
            mode: "receive",
            recipient: sdkPlaygroundPhone || sdkPlaygroundUser
          });
      }
      const evidence = getSdkPlaygroundSuccessEvidence(serviceResponse, sdkPlaygroundEvent);
      if (evidence.error) {
        setSdkPlaygroundResult(evidence.error);
        return;
      }

      const response = {
        ok: true,
        event: sdkPlaygroundEvent,
        environment: sdkPlaygroundEnv,
        traceId: evidence.traceId,
        requestId: evidence.requestId,
        route: sdkPlaygroundEvent === "initConversation" ? "outbound_queue" : "event_stream"
      };
      setSdkPlaygroundResult({
        tone: "success",
        title: "Payload принят тестовым стендом",
        response: JSON.stringify(response, null, 2)
      });
      onToast(`SDK playground: ${sdkPlaygroundEvent} выполнен в ${sdkPlaygroundEnv}.`);
    } catch (error) {
      setSdkPlaygroundResult(createSdkPlaygroundErrorResult(
        error instanceof Error ? error.message : "Не удалось выполнить SDK событие."
      ));
    } finally {
      setSdkPlaygroundRunning(false);
    }
  }

  async function handleCopySnippet(snippet, label) {
    if (!canEditSettings) {
      onToast(access.reason);
      return;
    }

    const result = await copyTextToClipboard(snippet);
    onToast(result.ok ? `${label} скопирован.` : result.message);
  }

  async function handleCreateWidgetKey() {
    if (!canEditSettings || widgetKeyBusy) return;
    setWidgetKeyBusy(true);
    setWidgetKeyError("");
    const response = await integrationService.createApiKey({
      environment: widgetEnvironment,
      name: `Виджет сайта (${widgetEnvironment})`,
      scopes: ["clients:identify", "conversations:write"]
    });
    setWidgetKeyBusy(false);
    if (response.status !== "ok" || !response.data?.rawKey || response.data?.rawKeyShownOnce !== true) {
      setWidgetKeyError(response.error?.message ?? "Не удалось создать публичный ключ виджета.");
      return;
    }
    setWidgetPublicKey(response.data.rawKey);
    onToast("Публичный ключ виджета создан. Скопируйте код сейчас: ключ показывается один раз.");
  }

  return (
    <section className="settings-section sdk-console" aria-labelledby="widget-sdk-title">
      <SettingsSectionHeader
        title="Чат на сайте или в приложении"
        meta={loadError ? "backend error" : "тестовый стенд"}
        hint="Добавьте чат на сайт по готовой инструкции или откройте инструменты для мобильного приложения и разработчиков."
      />
      {loadError ? <div className="entity-empty"><strong>{loadError}</strong></div> : null}
      {view === "start" ? (
        <WidgetStartView
          canEditSettings={canEditSettings}
          onOpenApi={() => onToast("Настройки API и webhooks доступны в разделе «API и webhooks».")}
          onOpenSdk={() => setView("sdk")}
          onOpenWidget={() => setView("widget")}
        />
      ) : null}
      {view === "widget" ? (
        <WidgetSetupView
          canEditSettings={canEditSettings}
          checkState={widgetCheckState}
          onBack={() => setView("start")}
          onCheck={() => setWidgetCheckState(websiteUrl.trim() ? "ready" : "url-required")}
          onCopy={() => void handleCopySnippet(widgetSnippet({
            apiBase: widgetApiBase,
            environment: widgetEnvironment,
            publicKey: widgetPublicKey
          }), "Код виджета")}
          onCreateKey={() => void handleCreateWidgetKey()}
          onEnvironmentChange={setWidgetEnvironment}
          onApiBaseChange={setWidgetApiBase}
          publicKey={widgetPublicKey}
          keyBusy={widgetKeyBusy}
          keyError={widgetKeyError}
          apiBase={widgetApiBase}
          environment={widgetEnvironment}
          previewOpen={widgetPreviewOpen}
          onPreviewToggle={() => setWidgetPreviewOpen((current) => !current)}
          onUrlChange={(value) => {
            setWebsiteUrl(value);
            setWidgetCheckState("");
          }}
          url={websiteUrl}
        />
      ) : null}
      {view === "sdk" ? (
      <div className="settings-card sdk-console-body settings-scroll">
        <div className="sdk-developer-header">
          <div>
            <h3>Для разработчика</h3>
            <p>Ключ и события для мобильного приложения. Расширенная проверка доступна ниже.</p>
          </div>
          <button onClick={() => setView("start")} type="button">К выбору способа</button>
        </div>
      <div className="sdk-code">
        <code>{sdkSnippet}</code>
        <button disabled={!canEditSettings} onClick={() => void handleCopySnippet(sdkSnippet, "SDK snippet")} title={canEditSettings ? "Копировать SDK snippet" : access.reason} type="button">Копировать</button>
      </div>
      <div className="sdk-playground">
        <div className="section-title compact-title">
          <h3>Playground payload</h3>
          <span>{canEditSettings ? "raw preview и тестовый стенд" : "только администратор"}</span>
        </div>
        <div className="sdk-playground-grid">
          <label>
            <span>Событие</span>
            <select disabled={!canEditSettings} value={sdkPlaygroundEvent} onChange={(event) => setSdkPlaygroundEvent(event.target.value)} title={canEditSettings ? "Выберите SDK событие" : access.reason}>
              {sdkEvents.map(([event]) => <option value={event} key={event}>{event}</option>)}
            </select>
          </label>
          <label>
            <span>Окружение</span>
            <select disabled={!canEditSettings} value={sdkPlaygroundEnv} onChange={(event) => setSdkPlaygroundEnv(event.target.value)} title={canEditSettings ? "Выберите окружение" : access.reason}>
              <option disabled={sdkPlaygroundEvent !== "initConversation" && !availableEnvironments.has("production")} value="production">production</option>
              <option disabled={sdkPlaygroundEvent !== "initConversation" && !availableEnvironments.has("stage")} value="stage">stage</option>
            </select>
          </label>
          <label>
            <span>Канал</span>
            <select disabled={!canEditSettings} value={sdkPlaygroundChannel} onChange={(event) => setSdkPlaygroundChannel(event.target.value)} title={canEditSettings ? "Выберите канал" : access.reason}>
              {["SDK", "Telegram", "MAX", "VK"].map((channel) => <option value={channel} key={channel}>{channel}</option>)}
            </select>
          </label>
          <label>
            <span>User ID</span>
            <input disabled={!canEditSettings} value={sdkPlaygroundUser} onChange={(event) => setSdkPlaygroundUser(event.target.value)} title={canEditSettings ? "ID гигера" : access.reason} />
          </label>
          <label>
            <span>Телефон</span>
            <input disabled={!canEditSettings} value={sdkPlaygroundPhone} onChange={(event) => setSdkPlaygroundPhone(event.target.value)} title={canEditSettings ? "Телефон гигера" : access.reason} />
          </label>
          <label className="sdk-message-field">
            <span>Сообщение</span>
            <textarea disabled={!canEditSettings} value={sdkPlaygroundMessage} onChange={(event) => setSdkPlaygroundMessage(event.target.value)} title={canEditSettings ? "Текст стартового сообщения" : access.reason} />
          </label>
        </div>
        <div className="sdk-payload-preview">
          <div>
            <strong>Raw payload</strong>
            <code>{JSON.stringify(sdkPayloadPreview, null, 2)}</code>
          </div>
          <div>
            <strong>Response</strong>
            {sdkPlaygroundResult ? (
              <code className={sdkPlaygroundResult.tone}>{sdkPlaygroundResult.response}</code>
            ) : (
              <span>Запустите событие, чтобы увидеть ответ тестового стенда.</span>
            )}
          </div>
        </div>
        <div className="sdk-playground-actions">
          {sdkPlaygroundResult ? <span className={sdkPlaygroundResult.tone}>{sdkPlaygroundResult.title}</span> : <span>Payload обновляется при изменении полей.</span>}
          <button disabled={!canEditSettings || loadingWorkspace || sdkPlaygroundRunning || Boolean(loadError)} onClick={handleSdkPlaygroundRun} title={canEditSettings ? "Запустить SDK событие" : access.reason} type="button">
            <PlayCircle size={16} />
            {sdkPlaygroundRunning ? "Выполняется..." : "Запустить событие"}
          </button>
        </div>
      </div>
      <div className="sdk-event-list">
        {sdkEvents.map(([event, description]) => (
          <div className="sdk-event-row" key={event}>
            <Zap size={17} />
            <strong>{event}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>
      </div>
      ) : null}
    </section>
  );
}

function WidgetStartView({ canEditSettings, onOpenApi, onOpenSdk, onOpenWidget }) {
  return (
    <div className="widget-start">
      <div className="widget-choice-grid">
        <article className="widget-choice primary">
          <span className="widget-choice-icon"><Globe2 size={25} /></span>
          <div>
            <h3>Добавить чат на сайт</h3>
            <p>Скопируйте готовый код и вставьте его на сайт. Специальные знания не нужны.</p>
          </div>
          <button className="primary-action" disabled={!canEditSettings} onClick={onOpenWidget} type="button">Настроить виджет</button>
        </article>
        <article className="widget-choice">
          <span className="widget-choice-icon"><Smartphone size={25} /></span>
          <div>
            <h3>Добавить чат в мобильное приложение</h3>
            <p>Инструкция, ключ проекта и события для разработчика приложения.</p>
          </div>
          <button disabled={!canEditSettings} onClick={onOpenSdk} type="button">Открыть SDK</button>
        </article>
      </div>
      <button className="widget-api-link" disabled={!canEditSettings} onClick={onOpenApi} type="button">
        <Code2 size={20} />
        <span><strong>Настроить нестандартное подключение</strong><small>API и webhooks для связи с вашей системой</small></span>
      </button>
      <ol className="widget-steps" aria-label="Как установить виджет">
        <li><b>1</b><span>Настройте виджет</span></li>
        <li><b>2</b><span>Скопируйте код</span></li>
        <li><b>3</b><span>Проверьте на сайте</span></li>
      </ol>
    </div>
  );
}

function WidgetSetupView({ apiBase, canEditSettings, checkState, environment, keyBusy, keyError, onApiBaseChange, onBack, onCheck, onCopy, onCreateKey, onEnvironmentChange, onPreviewToggle, onUrlChange, previewOpen, publicKey, url }) {
  return (
    <div className="widget-setup settings-card">
      <div className="widget-setup-heading">
        <div>
          <h3>Добавьте чат на сайт</h3>
          <p>Выполните шаги ниже или передайте их тому, кто редактирует ваш сайт.</p>
        </div>
        <button onClick={onBack} type="button">К выбору способа</button>
      </div>
      <ol className="widget-install-list">
        <li>
          <b>1</b>
          <div className="widget-key-setup">
            <strong>Создайте публичный ключ виджета</strong>
            <small>Это ключ для браузера, а не серверный секрет. Он показывается только один раз и понадобится в коде ниже.</small>
            <div className="widget-key-fields">
              <label><span>Окружение</span><select disabled={!canEditSettings || keyBusy} onChange={(event) => onEnvironmentChange(event.target.value)} value={environment}><option value="production">production</option><option value="stage">stage</option></select></label>
              <label><span>Адрес API</span><input disabled={!canEditSettings || keyBusy} onChange={(event) => onApiBaseChange(event.target.value)} value={apiBase} /></label>
            </div>
            {publicKey ? <code className="widget-public-key">{publicKey}</code> : null}
            {keyError ? <em role="alert">{keyError}</em> : null}
          </div>
          <button className="primary-outline" disabled={!canEditSettings || keyBusy} onClick={onCreateKey} type="button">{keyBusy ? "Создаём…" : "Создать ключ"}</button>
        </li>
        <li>
          <b>2</b>
          <div><strong>Скопируйте код и вставьте его на сайт</strong><small>Разместите его перед закрывающим тегом <code>&lt;/body&gt;</code>.</small></div>
          <button className="primary-outline" disabled={!canEditSettings || !publicKey} onClick={onCopy} type="button"><Copy size={16} /> Скопировать код</button>
        </li>
        <li>
          <b>3</b>
          <div className="widget-check"><strong>Проверьте установку</strong><small>Укажите адрес страницы, где установлен виджет.</small><input aria-label="Адрес сайта" onChange={(event) => onUrlChange(event.target.value)} placeholder="https://example.ru" type="url" value={url} />
            {checkState === "url-required" ? <em role="alert">Введите адрес сайта, чтобы продолжить.</em> : null}
            {checkState === "ready" ? <em className="success"><CheckCircle2 size={15} /> Откройте эту страницу в браузере и отправьте тестовое сообщение.</em> : null}
          </div>
          <button disabled={!canEditSettings} onClick={onCheck} type="button">Проверить</button>
        </li>
      </ol>
      <WidgetPreview environment={environment} hasPublicKey={Boolean(publicKey)} onToggle={onPreviewToggle} open={previewOpen} />
    </div>
  );
}

function WidgetPreview({ environment, hasPublicKey, onToggle, open }) {
  return (
    <section className="widget-preview" aria-label="Предпросмотр виджета">
      <header>
        <div><h4>Предпросмотр на сайте</h4><p>Интерактивный макет: обращения не отправляются.</p></div>
        <span className={hasPublicKey ? "ready" : "waiting"}>{hasPublicKey ? `${environment}: ключ готов` : "Создайте ключ для установки"}</span>
      </header>
      <div className="widget-preview-canvas">
        <span className="widget-preview-page-title">Ваша страница сайта</span>
        {open ? (
          <div className="widget-preview-chat">
            <div className="widget-preview-chat-head">
              <span><strong>Поддержка</strong><small>Обычно отвечаем в течение нескольких минут</small></span>
              <button aria-label="Свернуть предпросмотр" onClick={onToggle} type="button"><X size={18} strokeWidth={2.4} /></button>
            </div>
            <div className="widget-preview-conversation">
              <div className="widget-preview-message">Здравствуйте! Чем можем помочь?</div>
            </div>
            <div className="widget-preview-file"><FileText aria-hidden="true" size={14} /><span>example.pdf</span><X aria-hidden="true" size={14} /></div>
            <div className="widget-preview-input">
              <button aria-label="Прикрепить файл в предпросмотре" type="button"><Paperclip size={17} /></button>
              <span>Напишите сообщение…</span>
              <button aria-label="Отправить сообщение из предпросмотра" type="button"><Send size={16} /></button>
            </div>
          </div>
        ) : null}
        <button aria-label={open ? "Свернуть предпросмотр" : "Открыть предпросмотр"} className="widget-preview-toggle" onClick={onToggle} type="button"><MessageCircle size={23} /></button>
      </div>
    </section>
  );
}
