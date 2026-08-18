import React from "react";
import { ChevronDown, Globe2, Headphones, LogOut, PanelLeftClose, PanelLeftOpen, Search, ShieldCheck, UsersRound, Volume2, VolumeX, Zap } from "lucide-react";
import { roleModes } from "../../app/access.js";
import { navigationItems } from "../../app/navigationModel.js";
import { PRESENCE_STATUSES, PRESENCE_STATUS_NOT_SET_LABEL, presenceStatusClass, presenceStatusLabel } from "../../app/presenceModel.js";
import { NotificationCenter } from "../notifications/NotificationCenter.jsx";
import { OperatorAvatar } from "../operators/OperatorAvatar.jsx";
import "./app-shell.css";

export function Sidebar({ active, access, avatarActionDisabled = false, collapsed = false, onAvatarClick, onSelect, onToggleCollapsed, operator, presenceStatus = "" }) {
  const operatorName = operator?.name || operator?.email || "Сотрудник";

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`} id="workspace-sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <Headphones size={22} />
        </div>
        <button
          aria-controls="workspace-sidebar"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Развернуть боковое меню" : "Свернуть боковое меню"}
          className="sidebar-toggle"
          onClick={onToggleCollapsed}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          type="button"
        >
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>
      <nav className="nav-list" aria-label="Главная навигация">
        {navigationItems.filter((item) => item.key !== "support").map(({ key, label, icon: Icon }) => {
          const isAllowed = access.sections.includes(key);

          return (
            <button
              aria-label={isAllowed ? label : `${label}: ${access.reason}`}
              className={`nav-item ${active === key ? "active" : ""}`}
              disabled={!isAllowed}
              key={key}
              onClick={() => onSelect(key)}
              title={isAllowed ? label : access.reason}
              type="button"
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <nav className="nav-list sidebar-support-nav" aria-label="Поддержка">
        {navigationItems.filter((item) => item.key === "support").map(({ key, label, icon: Icon }) => (
          <button aria-label={label} className={`nav-item ${active === key ? "active" : ""}`} key={key} onClick={() => onSelect(key)} title={label} type="button">
            <Icon size={20} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="operator-card">
        <button
          aria-label="Изменить аватар"
          className="operator-profile-trigger"
          disabled={avatarActionDisabled}
          onClick={onAvatarClick}
          title={avatarActionDisabled ? "В режиме просмотра изменение профиля недоступно" : "Выбрать аватар"}
          type="button"
        >
          <OperatorAvatar avatar={operator?.avatar} decorative name={operatorName} size={32} />
        </button>
        <div>
          <strong>{operatorName}</strong>
          <span className="operator-card-presence">
            <i className={`presence-dot ${presenceStatusClass(presenceStatus)}`} aria-hidden="true" />
            {presenceStatusLabel(presenceStatus)}
          </span>
        </div>
      </div>
    </aside>
  );
}

export function TopBar({
  access,
  activeSection,
  getNotificationActionAvailability,
  onLogout,
  onOpenLanding,
  onNavigateNotificationAction,
  onOutbound,
  onPresenceChange,
  onRoleMode,
  onToast,
  onToggleMessageSound,
  notificationsEnabled = true,
  operatorConversationCount = 0,
  presencePending = false,
  presenceStatus = "",
  roleMode,
  showRoleSwitcher = true,
  soundEnabled = true
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <label className={`status-select presence-select ${presenceStatusClass(presenceStatus)}`} title="Статус влияет на распределение обращений">
          <i className={`presence-dot ${presenceStatusClass(presenceStatus)}`} aria-hidden="true" />
          <select
            aria-label="Статус оператора"
            disabled={presencePending}
            onChange={(event) => onPresenceChange?.(event.target.value)}
            value={presenceStatus || ""}
          >
            {!presenceStatus ? <option disabled value="">{PRESENCE_STATUS_NOT_SET_LABEL}</option> : null}
            {PRESENCE_STATUSES.map((status) => (
              <option key={status.key} value={status.key}>{status.label}</option>
            ))}
          </select>
        </label>
        <button className="status-select">
          <UsersRound size={17} />
          {operatorConversationCount} {conversationWord(operatorConversationCount)}
        </button>
        {showRoleSwitcher ? (
          <label className="role-switcher">
            <ShieldCheck size={17} />
            <select value={roleMode} onChange={(event) => onRoleMode(event.target.value)} aria-label="Режим проверки прав">
              {roleModes.map((role) => <option key={role}>{role}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="topbar-right">
        <div className="topbar-route-actions" aria-label="Публичный контур">
          <button className="ghost-action" onClick={onOpenLanding} type="button">
            <Globe2 size={16} />
            Сайт
          </button>
          <button className="ghost-action" onClick={onLogout} type="button">
            <LogOut size={16} />
            Выйти
          </button>
        </div>
        {notificationsEnabled ? (
          <NotificationCenter
            activeSection={activeSection}
            getNotificationActionAvailability={getNotificationActionAvailability}
            onNavigateNotificationAction={onNavigateNotificationAction}
            onToast={onToast}
          />
        ) : null}
        <button
          aria-label={soundEnabled ? "Отключить звук новых сообщений" : "Включить звук новых сообщений"}
          aria-pressed={soundEnabled}
          className={`icon-button sound-toggle ${soundEnabled ? "sound-enabled" : ""}`}
          onClick={onToggleMessageSound}
          title={soundEnabled ? "Отключить звук новых сообщений" : "Включить звук новых сообщений"}
          type="button"
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        <button className="icon-button" aria-label="Поиск" title="Поиск" type="button">
          <Search size={20} />
        </button>
        {!access.canOutbound ? <span className="topbar-access-note">{access.reason}</span> : null}
        <button className="quick-action" disabled={!access.canOutbound} onClick={onOutbound} title={access.canOutbound ? "Быстрые действия" : access.reason} type="button">
          <Zap size={17} />
          Быстрые действия
          <ChevronDown size={16} />
        </button>
      </div>
    </header>
  );
}

function conversationWord(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "диалогов";
  if (mod10 === 1) return "диалог";
  if (mod10 >= 2 && mod10 <= 4) return "диалога";
  return "диалогов";
}
