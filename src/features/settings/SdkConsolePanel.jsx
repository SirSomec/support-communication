import React, { useMemo, useState } from "react";
import { PlayCircle, Zap } from "lucide-react";
import { SectionTitle } from "../../ui.jsx";
import { sdkEvents } from "../../data.js";
import { dialogService } from "../../services/dialogService.js";
import { integrationService } from "../../services/integrationService.js";

export function SdkConsolePanel({ access, canEditSettings, onToast }) {
  const [sdkPlaygroundEvent, setSdkPlaygroundEvent] = useState(sdkEvents[0][0]);
  const [sdkPlaygroundEnv, setSdkPlaygroundEnv] = useState("production");
  const [sdkPlaygroundChannel, setSdkPlaygroundChannel] = useState("SDK");
  const [sdkPlaygroundUser, setSdkPlaygroundUser] = useState("gig-olga-0940");
  const [sdkPlaygroundPhone, setSdkPlaygroundPhone] = useState("+7 985 430-09-40");
  const [sdkPlaygroundMessage, setSdkPlaygroundMessage] = useState("Здравствуйте, проверяем запуск диалога из SDK.");
  const [sdkPlaygroundResult, setSdkPlaygroundResult] = useState(null);

  const sdkPayloadPreview = useMemo(() => {
    const base = {
      appId: sdkPlaygroundEnv === "production" ? "gig-app-prod" : "gig-app-stage",
      event: sdkPlaygroundEvent,
      channel: sdkPlaygroundChannel,
      userId: sdkPlaygroundUser,
      timestamp: "2026-06-26T12:00:00+03:00"
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
    if (!canEditSettings) {
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

    const serviceResponse = sdkPlaygroundEvent === "initConversation"
      ? await dialogService.createOutboundConversationRequest({
          channel: sdkPlaygroundChannel,
          environment: sdkPlaygroundEnv,
          message: sdkPlaygroundMessage,
          phone: sdkPlaygroundPhone,
          topic: "Оплата / Возврат",
          userId: sdkPlaygroundUser
        })
      : await integrationService.testChannelConnection({
          channel: { id: sdkPlaygroundChannel.toLowerCase(), channel: sdkPlaygroundChannel, connections: [{ rawId: sdkPlaygroundEnv }] },
          message: sdkPlaygroundEvent,
          mode: "receive",
          recipient: sdkPlaygroundPhone || sdkPlaygroundUser
        });
    const response = {
      ok: true,
      event: sdkPlaygroundEvent,
      environment: sdkPlaygroundEnv,
      traceId: serviceResponse.traceId,
      requestId: serviceResponse.data.backendQueueId ?? serviceResponse.data.delivery?.requestId,
      acceptedAt: "2026-06-26T12:00:02+03:00",
      route: sdkPlaygroundEvent === "initConversation" ? "outbound_queue" : "event_stream"
    };
    setSdkPlaygroundResult({
      tone: "success",
      title: "Payload принят тестовым стендом",
      response: JSON.stringify(response, null, 2)
    });
    onToast(`SDK playground: ${sdkPlaygroundEvent} выполнен в ${sdkPlaygroundEnv}.`);
  }

  return (
    <section className="work-panel sdk-console">
      <SectionTitle title="SDK-консоль" action="Ключи, события, точки входа" />
      <div className="sdk-code">
        <code>{`SupportSDK.init({ appId: "gig-app", channels: ["SDK", "Telegram", "MAX", "VK"] })`}</code>
        <button disabled={!canEditSettings} onClick={() => onToast("SDK snippet скопирован.")} title={canEditSettings ? "Копировать SDK snippet" : access.reason} type="button">Копировать</button>
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
              <option value="production">production</option>
              <option value="stage">stage</option>
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
          <button disabled={!canEditSettings} onClick={handleSdkPlaygroundRun} title={canEditSettings ? "Запустить SDK событие" : access.reason} type="button">
            <PlayCircle size={16} />
            Запустить событие
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
    </section>
  );
}
