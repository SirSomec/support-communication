import React, { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  applyBrowserPushSubscriptionResponse,
  applyCriticalAlertTestResponse,
  applyNotificationMarkReadResponse,
  applyNotificationPreferencesResponse,
  normalizeNotificationDeliveryChannels,
  normalizeNotificationPreferences
} from "../../app/notificationActions.js";
import { integrationService } from "../../services/integrationService.js";
import { notificationService } from "../../services/notificationService.js";
import { reportService } from "../../services/reportService.js";
import "./notifications.css";
import {
  collectReadNotificationIds,
  filterNotifications,
  getNotificationGroupSummary,
  mapNotificationItems,
  notificationFilterOptions,
  notificationSoundRules,
  notificationSubscriptionOptions
} from "../../app/notificationModel.js";

const defaultNotificationPreferences = {
  browserPushEnabled: false,
  browserPushEndpoint: null,
  browserPushPermission: null,
  browserPushSubscriptionId: null,
  enabledExternalChannelIds: [],
  mutedSoundRuleIds: [],
  mutedTypeKeys: [],
  tenantId: null,
  updatedAt: null,
  userId: null
};

export function NotificationCenter({
  activeSection,
  getNotificationActionAvailability = () => ({ disabled: false, reason: "" }),
  onNavigateNotificationAction,
  onToast
}) {
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [readNotificationIds, setReadNotificationIds] = useState([]);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [notificationPreferences, setNotificationPreferences] = useState(null);
  const [externalDeliveryChannels, setExternalDeliveryChannels] = useState([]);
  const [deliveryChannelsLoading, setDeliveryChannelsLoading] = useState(true);
  const [deliveryChannelsError, setDeliveryChannelsError] = useState(null);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState(null);
  const [pendingPreferenceAction, setPendingPreferenceAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const currentNotificationPreferences = notificationPreferences ?? defaultNotificationPreferences;
  const mutedNotificationTypes = currentNotificationPreferences.mutedTypeKeys;
  const isBrowserPushEnabled = currentNotificationPreferences.browserPushEnabled;
  const mutedSoundRuleIds = currentNotificationPreferences.mutedSoundRuleIds;
  const enabledExternalChannelIds = currentNotificationPreferences.enabledExternalChannelIds;
  const notificationPreferenceDisabled = preferencesLoading || !notificationPreferences || Boolean(pendingPreferenceAction);
  const notificationPreferenceUnavailableReason = preferencesError ?? (preferencesLoading ? "Notification preferences are loading." : "");
  const externalChannelControlsDisabled = notificationPreferenceDisabled || deliveryChannelsLoading || Boolean(deliveryChannelsError);
  const externalChannelUnavailableReason = deliveryChannelsError ?? notificationPreferenceUnavailableReason;

  const subscribedNotifications = notificationItems.filter((item) => !mutedNotificationTypes.includes(item.typeKey));
  const unreadNotifications = subscribedNotifications.filter((item) => !readNotificationIds.includes(item.id));
  const visibleNotifications = filterNotifications(
    notificationItems,
    notificationFilter,
    readNotificationIds,
    mutedNotificationTypes
  );
  const notificationGroups = getNotificationGroupSummary(notificationItems, readNotificationIds, mutedNotificationTypes);
  const notificationHistory = notificationItems.filter((item) => readNotificationIds.includes(item.id));

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const response = await notificationService.fetchNotifications();
    if (response.status !== "ok") {
      setNotificationItems([]);
      setReadNotificationIds([]);
      setLoadError(response.error?.message ?? "Не удалось загрузить уведомления.");
      setLoading(false);
      return;
    }

    const items = mapNotificationItems(response.data.items ?? response.data.notifications ?? []);
    setNotificationItems(items);
    setReadNotificationIds(collectReadNotificationIds(items));
    setLoading(false);
  }, []);

  const loadNotificationPreferences = useCallback(async () => {
    setPreferencesLoading(true);
    setPreferencesError(null);

    const response = await notificationService.fetchNotificationPreferences();
    if (response.status !== "ok") {
      setNotificationPreferences(null);
      setPreferencesError(response.error?.message ?? "Notification delivery preferences failed to load.");
      setPreferencesLoading(false);
      return;
    }

    const preferences = normalizeNotificationPreferences(response.data?.preferences);
    if (!preferences) {
      setNotificationPreferences(null);
      setPreferencesError("Notification delivery preferences were not confirmed by the backend.");
      setPreferencesLoading(false);
      return;
    }

    setNotificationPreferences(preferences);
    setPreferencesLoading(false);
  }, []);

  const loadNotificationDeliveryChannels = useCallback(async () => {
    setDeliveryChannelsLoading(true);
    setDeliveryChannelsError(null);

    const response = await integrationService.fetchChannelConnections();
    const channels = normalizeNotificationDeliveryChannels(response);
    if (response.status !== "ok") {
      setExternalDeliveryChannels([]);
      setDeliveryChannelsError(response.error?.message ?? "Notification delivery channels failed to load.");
      setDeliveryChannelsLoading(false);
      return;
    }

    setExternalDeliveryChannels(channels);
    setDeliveryChannelsLoading(false);
  }, []);

  useEffect(() => {
    void loadNotifications();
    void loadNotificationPreferences();
    void loadNotificationDeliveryChannels();
  }, [loadNotifications, loadNotificationDeliveryChannels, loadNotificationPreferences]);

  useEffect(() => {
    setNotificationsOpen(false);
  }, [activeSection]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isNotificationsOpen]);

  async function executeNotificationAction(item) {
    const actionTarget = item.actionTarget;
    if (actionTarget?.kind === "download" && actionTarget?.service === "reports") {
      const response = await reportService.downloadExportFile({
        fileName: actionTarget.fileName,
        format: actionTarget.format,
        jobId: actionTarget.jobId
      });

      if (response.status !== "ok") {
        return {
          ok: false,
          message: response.error?.message ?? "Не удалось скачать файл из уведомления."
        };
      }

      downloadBlob(response.data.blob, response.data.fileName || actionTarget.fileName || `${actionTarget.jobId}.xlsx`);
      return {
        ok: true,
        message: `${item.type}: файл ${response.data.fileName ?? actionTarget.fileName ?? item.action} скачивается.`
      };
    }

    if (actionTarget?.kind === "navigate") {
      if (typeof onNavigateNotificationAction !== "function") {
        return {
          ok: false,
          message: "РќР°РІРёРіР°С†РёСЏ РёР· СѓРІРµРґРѕРјР»РµРЅРёСЏ РЅРµ РїРѕРґРєР»СЋС‡РµРЅР°."
        };
      }

      const navigationResult = await onNavigateNotificationAction(actionTarget, item);
      if (!navigationResult?.ok) {
        return {
          ok: false,
          message: navigationResult?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ С†РµР»СЊ СѓРІРµРґРѕРјР»РµРЅРёСЏ."
        };
      }

      return {
        ok: true,
        message: navigationResult.message ?? `${item.type}: ${item.action}`
      };
    }

    return {
      ok: false,
      message: "РЈ СѓРІРµРґРѕРјР»РµРЅРёСЏ РЅРµС‚ РїРѕРґРґРµСЂР¶РёРІР°РµРјРѕРіРѕ РґРµР№СЃС‚РІРёСЏ."
    };
  }

  async function handleNotificationAction(item) {
    const actionResult = await executeNotificationAction(item);
    if (!actionResult.ok) {
      onToast(actionResult.message);
      return;
    }

    const response = await notificationService.markNotificationsRead({
      notificationIds: [item.id]
    });

    const result = applyNotificationMarkReadResponse({
      currentReadIds: readNotificationIds,
      fallbackIds: [item.id],
      response
    });

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setReadNotificationIds(result.ids);
    setNotificationsOpen(false);
    onToast(actionResult.message ?? `${item.type}: ${item.action}`);
  }

  async function handleMarkAllRead() {
    const response = await notificationService.markNotificationsRead({ all: true });
    const result = applyNotificationMarkReadResponse({
      currentReadIds: readNotificationIds,
      fallbackIds: subscribedNotifications.map((item) => item.id),
      response
    });

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setReadNotificationIds(result.ids);
  }

  function toggleNotificationType(typeKey) {
    const mutedTypeKeys = mutedNotificationTypes.includes(typeKey)
      ? mutedNotificationTypes.filter((item) => item !== typeKey)
      : [...mutedNotificationTypes, typeKey];

    void persistNotificationPreferences(
      { mutedTypeKeys },
      "Notification subscription preferences updated."
    );
    if (notificationFilter === typeKey) {
      setNotificationFilter("all");
    }
  }

  function toggleSoundRule(ruleId) {
    const mutedSoundRuleIds = currentNotificationPreferences.mutedSoundRuleIds.includes(ruleId)
      ? currentNotificationPreferences.mutedSoundRuleIds.filter((item) => item !== ruleId)
      : [...currentNotificationPreferences.mutedSoundRuleIds, ruleId];

    void persistNotificationPreferences(
      { mutedSoundRuleIds },
      "Notification sound preferences updated."
    );
  }

  function toggleExternalChannel(channelId) {
    const enabledExternalChannelIds = currentNotificationPreferences.enabledExternalChannelIds.includes(channelId)
      ? currentNotificationPreferences.enabledExternalChannelIds.filter((item) => item !== channelId)
      : [...currentNotificationPreferences.enabledExternalChannelIds, channelId];

    void persistNotificationPreferences(
      { enabledExternalChannelIds },
      "Notification external channel preferences updated."
    );
  }

  async function toggleBrowserPush() {
    if (isBrowserPushEnabled) {
      await disableBrowserPush();
      return;
    }

    if (!isBrowserPushSupported()) {
      onToast("Browser push is unavailable in this browser.");
      return;
    }

    const publicKeyResponse = await notificationService.fetchBrowserPushPublicKey();
    if (publicKeyResponse.status !== "ok" || !publicKeyResponse.data?.publicKey) {
      onToast(publicKeyResponse.error?.message ?? "Browser push public key is not configured.");
      return;
    }

    const permission = await window.Notification.requestPermission();
    if (permission !== "granted") {
      onToast("Browser push permission was not granted.");
      return;
    }

    setPendingPreferenceAction("browser-push-subscribe");
    let subscriptionPayload = null;
    try {
      subscriptionPayload = await createBrowserPushSubscriptionPayload(publicKeyResponse.data.publicKey);
    } catch {
      subscriptionPayload = null;
    }
    if (!subscriptionPayload) {
      setPendingPreferenceAction(null);
      onToast("Browser push subscription could not be created.");
      return;
    }

    const response = await notificationService.createBrowserPushSubscription(subscriptionPayload);
    const result = applyBrowserPushSubscriptionResponse({
      currentPreferences: currentNotificationPreferences,
      response
    });
    setPendingPreferenceAction(null);

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setNotificationPreferences(result.preferences);
    onToast("Browser push enabled for critical notifications.");
  }

  async function disableBrowserPush() {
    const subscriptionId = currentNotificationPreferences.browserPushSubscriptionId;
    if (!subscriptionId) {
      await persistNotificationPreferences(
        {
          browserPushEnabled: false,
          browserPushEndpoint: null,
          browserPushPermission: "default",
          browserPushSubscriptionId: null
        },
        "Browser push disabled."
      );
      return;
    }

    setPendingPreferenceAction("browser-push-unsubscribe");
    const response = await notificationService.deleteBrowserPushSubscription(subscriptionId);
    const result = applyBrowserPushSubscriptionResponse({
      currentPreferences: currentNotificationPreferences,
      response
    });
    setPendingPreferenceAction(null);

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    await unsubscribeBrowserPushLocally().catch(() => undefined);
    setNotificationPreferences(result.preferences);
    onToast("Browser push disabled.");
  }

  async function persistNotificationPreferences(patch, successMessage) {
    setPendingPreferenceAction(successMessage);
    const response = await notificationService.updateNotificationPreferences(patch);
    const result = applyNotificationPreferencesResponse({
      currentPreferences: currentNotificationPreferences,
      response
    });
    setPendingPreferenceAction(null);

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setNotificationPreferences(result.preferences);
    onToast(successMessage);
  }

  async function handleCriticalAlertTest() {
    setPendingPreferenceAction("critical-alert-test");
    const response = await notificationService.sendCriticalAlertTest({
      channelIds: enabledExternalChannelIds,
      includeBrowserPush: isBrowserPushEnabled,
      message: "Notification route smoke"
    });
    const result = applyCriticalAlertTestResponse({ response });
    setPendingPreferenceAction(null);

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    const [notification] = mapNotificationItems([result.notification]);
    setNotificationItems((current) => [
      notification,
      ...current.filter((item) => item.id !== notification.id)
    ]);
    onToast(`Critical alert test queued for ${result.deliveredCount} channel${result.deliveredCount === 1 ? "" : "s"}.`);
  }

  return (
    <div className="notification-center">
      <button
        aria-expanded={isNotificationsOpen}
        aria-label="Уведомления"
        className={`icon-button has-badge ${isNotificationsOpen ? "active" : ""}`}
        onClick={() => {
          setNotificationsOpen((current) => {
            const next = !current;
            if (next) {
              void loadNotifications();
              void loadNotificationPreferences();
              void loadNotificationDeliveryChannels();
            }
            return next;
          });
        }}
        title="Уведомления"
        type="button"
      >
        <Bell size={20} />
        {unreadNotifications.length ? <span>{unreadNotifications.length}</span> : null}
      </button>
      {isNotificationsOpen ? (
        <section className="notification-drawer" aria-label="Центр уведомлений" role="region">
          <header>
            <div>
              <strong>Уведомления</strong>
              <span>
                {loading ? "Загрузка..." : `${unreadNotifications.length} новых из ${subscribedNotifications.length}`}
              </span>
            </div>
            <button
              disabled={loading || !unreadNotifications.length}
              onClick={() => void handleMarkAllRead()}
              type="button"
            >
              Все прочитаны
            </button>
          </header>
          {loadError ? (
            <div className="notification-empty">
              <strong>Ошибка загрузки</strong>
              <span>{loadError}</span>
            </div>
          ) : null}
          <div className="notification-filters" aria-label="Фильтры уведомлений">
            {notificationFilterOptions.map((filterOption) => (
              <button
                aria-pressed={notificationFilter === filterOption.id}
                className={notificationFilter === filterOption.id ? "active" : ""}
                key={filterOption.id}
                onClick={() => setNotificationFilter(filterOption.id)}
                type="button"
              >
                {filterOption.label}
              </button>
            ))}
          </div>
          <div className="notification-groups" aria-label="Группы уведомлений">
            {notificationGroups.map((group) => (
              <button
                className={group.muted ? "muted" : ""}
                key={group.id}
                onClick={() => setNotificationFilter(group.id)}
                type="button"
              >
                <strong>{group.label}</strong>
                <span>{group.muted ? "выключено" : `${group.unread}/${group.count}`}</span>
              </button>
            ))}
          </div>
          <div className="notification-list">
            {visibleNotifications.map((item) => {
              const isRead = readNotificationIds.includes(item.id);
              const notificationActionState = getNotificationActionAvailability(item.actionTarget, item) ?? {
                disabled: false,
                reason: ""
              };

              return (
                <article className={`notification-item ${item.tone} ${isRead ? "read" : ""}`} key={item.id}>
                  <span className="notification-type">{item.type}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <small>{item.meta}</small>
                    {notificationActionState.disabled && notificationActionState.reason ? (
                      <small className="notification-action-note">{notificationActionState.reason}</small>
                    ) : null}
                  </div>
                  <button
                    disabled={notificationActionState.disabled}
                    onClick={() => void handleNotificationAction(item)}
                    title={notificationActionState.reason}
                    type="button"
                  >
                    {item.action}
                  </button>
                </article>
              );
            })}
            {!loading && !visibleNotifications.length ? (
              <div className="notification-empty">
                <strong>Нет уведомлений</strong>
                <span>Измените фильтр или включите подписку на тип события.</span>
              </div>
            ) : null}
          </div>
          <div className="notification-settings" aria-label="Настройки подписок">
            <strong>Подписки</strong>
            {notificationSubscriptionOptions.map((option) => (
              <label key={option.id}>
                <input
                  checked={!mutedNotificationTypes.includes(option.id)}
                  disabled={notificationPreferenceDisabled}
                  onChange={() => toggleNotificationType(option.id)}
                  title={notificationPreferenceUnavailableReason}
                  type="checkbox"
                />
                <span>
                  <b>{option.label}</b>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="notification-delivery-settings" aria-label="Push, звук и внешние каналы">
            <strong>Доставка</strong>
            <article className="browser-push-card">
              <span>
                <b>Browser push</b>
                <small>{isBrowserPushEnabled ? "Включено для SLA, channel errors и export-ready" : "Ожидает разрешения браузера"}</small>
              </span>
              <button
                disabled={notificationPreferenceDisabled}
                onClick={() => void toggleBrowserPush()}
                title={notificationPreferenceUnavailableReason}
                type="button"
              >
                {isBrowserPushEnabled ? "Выключить" : "Включить"}
              </button>
            </article>
            <div className="notification-sound-rules">
              {notificationSoundRules.map((rule) => (
                <label key={rule.id}>
                  <input checked={!mutedSoundRuleIds.includes(rule.id)} disabled={notificationPreferenceDisabled} onChange={() => toggleSoundRule(rule.id)} title={notificationPreferenceUnavailableReason} type="checkbox" />
                  <span>
                    <b>{rule.label}</b>
                    <small>{rule.description}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="notification-external-channels">
              {externalDeliveryChannels.map((channel) => (
                <label key={channel.id}>
                  <input checked={enabledExternalChannelIds.includes(channel.id)} disabled={externalChannelControlsDisabled} onChange={() => toggleExternalChannel(channel.id)} title={externalChannelUnavailableReason} type="checkbox" />
                  <span>
                    <b>{channel.label}</b>
                    <small>{channel.detail}</small>
                  </span>
                </label>
              ))}
              {!deliveryChannelsLoading && !externalDeliveryChannels.length ? (
                <span className="notification-delivery-empty">Нет активных подключений</span>
              ) : null}
            </div>
            <button
              className="notification-test-route"
              disabled={notificationPreferenceDisabled || (!enabledExternalChannelIds.length && !isBrowserPushEnabled)}
              title={externalChannelUnavailableReason}
              onClick={() => void handleCriticalAlertTest()}
              type="button"
            >
              Тест critical alert
            </button>
          </div>
          <div className="notification-history" aria-label="История уведомлений">
            <strong>История</strong>
            {notificationHistory.length ? notificationHistory.map((item) => (
              <span key={`history-${item.id}`}>
                <b>{item.type}</b>
                {item.history}
              </span>
            )) : <span>Прочитанных уведомлений пока нет</span>}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function isBrowserPushSupported() {
  return typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function createBrowserPushSubscriptionPayload(publicKey) {
  const registration = await navigator.serviceWorker.register("/browser-push-service-worker.js");
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription ?? await registration.pushManager.subscribe({
    applicationServerKey: urlBase64ToUint8Array(publicKey),
    userVisibleOnly: true
  });
  const payload = subscription.toJSON();

  if (!payload?.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    return null;
  }

  return {
    endpoint: payload.endpoint,
    expirationTime: payload.expirationTime ?? null,
    keys: {
      auth: payload.keys.auth,
      p256dh: payload.keys.p256dh
    },
    userAgent: navigator.userAgent
  };
}

async function unsubscribeBrowserPushLocally() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  await subscription?.unsubscribe?.();
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}
