import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  externalCriticalChannels,
  filterNotifications,
  getNotificationGroupSummary,
  notificationFilterOptions,
  notificationItems,
  notificationSoundRules,
  notificationSubscriptionOptions
} from "../../app/notificationModel.js";

export function NotificationCenter({ activeSection, onToast }) {
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState([]);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [mutedNotificationTypes, setMutedNotificationTypes] = useState([]);
  const [isBrowserPushEnabled, setBrowserPushEnabled] = useState(false);
  const [mutedSoundRuleIds, setMutedSoundRuleIds] = useState([]);
  const [enabledExternalChannelIds, setEnabledExternalChannelIds] = useState(["admin-telegram", "incident-webhook"]);
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

  function handleNotificationAction(item) {
    setReadNotificationIds((current) => current.includes(item.id) ? current : [...current, item.id]);
    setNotificationsOpen(false);
    onToast(`${item.type}: ${item.action}`);
  }

  function toggleNotificationType(typeKey) {
    setMutedNotificationTypes((current) =>
      current.includes(typeKey) ? current.filter((item) => item !== typeKey) : [...current, typeKey]
    );
    if (notificationFilter === typeKey) {
      setNotificationFilter("all");
    }
  }

  function toggleSoundRule(ruleId) {
    setMutedSoundRuleIds((current) =>
      current.includes(ruleId) ? current.filter((item) => item !== ruleId) : [...current, ruleId]
    );
  }

  function toggleExternalChannel(channelId) {
    setEnabledExternalChannelIds((current) =>
      current.includes(channelId) ? current.filter((item) => item !== channelId) : [...current, channelId]
    );
  }

  return (
    <div className="notification-center">
      <button
        aria-expanded={isNotificationsOpen}
        aria-label="Уведомления"
        className={`icon-button has-badge ${isNotificationsOpen ? "active" : ""}`}
        onClick={() => setNotificationsOpen((current) => !current)}
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
              <span>{unreadNotifications.length} новых из {subscribedNotifications.length}</span>
            </div>
            <button
              onClick={() => setReadNotificationIds(subscribedNotifications.map((item) => item.id))}
              type="button"
            >
              Все прочитаны
            </button>
          </header>
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

              return (
                <article className={`notification-item ${item.tone} ${isRead ? "read" : ""}`} key={item.id}>
                  <span className="notification-type">{item.type}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <small>{item.meta}</small>
                  </div>
                  <button onClick={() => handleNotificationAction(item)} type="button">{item.action}</button>
                </article>
              );
            })}
            {!visibleNotifications.length ? (
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
                  onChange={() => toggleNotificationType(option.id)}
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
                onClick={() => {
                  setBrowserPushEnabled((current) => !current);
                  onToast(isBrowserPushEnabled ? "Browser push выключен." : "Browser push включен для критичных событий.");
                }}
                type="button"
              >
                {isBrowserPushEnabled ? "Выключить" : "Включить"}
              </button>
            </article>
            <div className="notification-sound-rules">
              {notificationSoundRules.map((rule) => (
                <label key={rule.id}>
                  <input checked={!mutedSoundRuleIds.includes(rule.id)} onChange={() => toggleSoundRule(rule.id)} type="checkbox" />
                  <span>
                    <b>{rule.label}</b>
                    <small>{rule.description}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="notification-external-channels">
              {externalCriticalChannels.map((channel) => (
                <label key={channel.id}>
                  <input checked={enabledExternalChannelIds.includes(channel.id)} onChange={() => toggleExternalChannel(channel.id)} type="checkbox" />
                  <span>
                    <b>{channel.label}</b>
                    <small>{channel.detail}</small>
                  </span>
                </label>
              ))}
            </div>
            <button
              className="notification-test-route"
              onClick={() => onToast(`${enabledExternalChannelIds.length} внешних каналов получат тест critical alert.`)}
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
