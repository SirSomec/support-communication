import React, { useEffect, useMemo, useState } from "react";
import { PlayCircle, Zap } from "lucide-react";
import { SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { copyTextToClipboard } from "../../services/clipboardService.js";
import { dialogService } from "../../services/dialogService.js";
import { integrationService } from "../../services/integrationService.js";

const sdkSnippet = `SupportSDK.init({ appId: "gig-app", channels: ["SDK", "Telegram", "MAX", "VK"] })`;

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

  async function handleCopySdkSnippet() {
    if (!canEditSettings) {
      onToast(access.reason);
      return;
    }

    const result = await copyTextToClipboard(sdkSnippet);
    onToast(result.ok ? "SDK snippet скопирован." : result.message);
  }

  return (
    <section className="settings-section sdk-console">
      <SettingsSectionHeader
        title="SDK-консоль"
        meta={loadError ? "backend error" : "тестовый стенд"}
        hint="Инструмент разработчика: сниппет для установки SDK, playground для проверки событий и справочник точек входа."
      />
      {loadError ? <div className="entity-empty"><strong>{loadError}</strong></div> : null}
      <div className="settings-card sdk-console-body settings-scroll">
      <div className="sdk-code">
        <code>{sdkSnippet}</code>
        <button disabled={!canEditSettings} onClick={() => void handleCopySdkSnippet()} title={canEditSettings ? "Копировать SDK snippet" : access.reason} type="button">Копировать</button>
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
    </section>
  );
}
