import React from "react";
import { ChevronDown, Globe2, Headphones, LogIn, Search, ServerCog, ShieldCheck, UsersRound, Zap } from "lucide-react";
import { roleModes } from "../../app/access.js";
import { navigationItems } from "../../app/navigationModel.js";
import { NotificationCenter } from "../notifications/NotificationCenter.jsx";
import "./app-shell.css";

export function Sidebar({ active, access, onSelect }) {
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
        <img
          alt=""
          src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&q=80"
        />
        <div>
          <strong>Иван П.</strong>
          <span><i /> Онлайн</span>
        </div>
        <ChevronDown size={16} />
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
  roleMode,
  showRoleSwitcher = true
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="status-select">
          <span className="presence-dot" />
          Онлайн
          <ChevronDown size={16} />
        </button>
        <button className="status-select">
          <UsersRound size={17} />
          7 / 12 чатов
          <ChevronDown size={16} />
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
