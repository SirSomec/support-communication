import React from "react";
import { ChevronDown, Globe2, Headphones, LogIn, Search, ServerCog, ShieldCheck, UsersRound, Zap } from "lucide-react";
import { roleModes } from "../../app/access.js";
import { navigationItems } from "../../app/navigationModel.js";
import { NotificationCenter } from "../notifications/NotificationCenter.jsx";
import "./app-shell.css";

export function Sidebar({ active, access, onSelect, operator }) {
  const operatorName = operator?.name || operator?.email || "Сотрудник";
  const operatorInitials = buildInitials(operatorName);

  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <Headphones size={22} />
      </div>
      <nav className="nav-list" aria-label="Главная навигация">
        {navigationItems.map(({ key, label, icon: Icon }) => {
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
      <div className="operator-card">
        <span className="operator-avatar" aria-hidden="true">{operatorInitials}</span>
        <div>
          <strong>{operatorName}</strong>
          <span>Статус не задан</span>
        </div>
      </div>
    </aside>
  );
}

export function TopBar({
  access,
  activeSection,
  getNotificationActionAvailability,
  onOpenAuth,
  onOpenLanding,
  onOpenServiceAdmin,
  onNavigateNotificationAction,
  onOutbound,
  onRoleMode,
  onToast,
  notificationsEnabled = true,
  operatorConversationCount = 0,
  roleMode,
  showRoleSwitcher = true
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="status-select">
          Статус не задан
        </button>
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
          <button className="ghost-action" onClick={onOpenAuth} type="button">
            <LogIn size={16} />
            Вход
          </button>
          {access.canServiceAdmin ? (
            <button className="ghost-action service-admin-entry" onClick={onOpenServiceAdmin} type="button">
              <ServerCog size={16} />
              Админ сервиса
            </button>
          ) : null}
        </div>
        {notificationsEnabled ? (
          <NotificationCenter
            activeSection={activeSection}
            getNotificationActionAvailability={getNotificationActionAvailability}
            onNavigateNotificationAction={onNavigateNotificationAction}
            onToast={onToast}
          />
        ) : null}
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

function buildInitials(name) {
  return String(name)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "--";
}

function conversationWord(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "диалогов";
  if (mod10 === 1) return "диалог";
  if (mod10 >= 2 && mod10 <= 4) return "диалога";
  return "диалогов";
}
