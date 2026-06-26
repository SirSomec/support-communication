import React, { useState } from "react";
import {
  KeyRound,
  ShieldCheck,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { ChannelBadge, Permission, ProductScreen, SectionTitle, SegmentedControl } from "../../ui.jsx";
import {
  channelDetails,
  channelSettings,
  roles
} from "../../data.js";
import { createScreenStateItems } from "../../app/screenState.js";
import { AdminWorkspaces } from "./AdminWorkspaces.jsx";
import { ChannelConnectionsPanel } from "./ChannelConnectionsPanel.jsx";
import { EmployeeManagementPanel } from "./EmployeeManagementPanel.jsx";
import { SdkConsolePanel } from "./SdkConsolePanel.jsx";
import { TopicDirectoryPanel } from "./TopicDirectoryPanel.jsx";

export function SettingsScreen({ onBack, onToast, access, roleMode, onRoleMode }) {
  const [channels, setChannels] = useState(channelSettings);
  const canEditSettings = access.canManageSettings;

  function toggleChannel(name) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, enabled: !channel.enabled } : channel));
  }

  function updateLimit(name, limit) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, limit } : channel));
  }

  return (
    <ProductScreen
      title="Настройки"
      subtitle="Права, каналы, лимиты операторов, маршрутизация и обязательные правила закрытия."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: channels.length,
        empty: `${channels.length} каналов`,
        emptyWhenZero: "каналы не настроены",
        errors: channelDetails.flatMap((channel) => channel.logs).filter((log) => log.severity === "error").length,
        errorLabel: "критичных ошибок нет"
      })}
      actions={
        <button className="primary-action" disabled={!canEditSettings} onClick={() => onToast("Настройки сохранены и попадут в аудит.")}>
          <ShieldCheck size={17} />
          Сохранить
        </button>
      }
    >
      <div className="role-mode-panel">
        <div>
          <strong>Проверка интерфейса по роли</strong>
          <span>{canEditSettings ? "Полный доступ к общим настройкам" : "Общие настройки доступны только на чтение"}</span>
        </div>
        <SegmentedControl
          ariaLabel="Текущая роль"
          options={["Сотрудник", "Старший сотрудник", "Администратор"]}
          value={roleMode}
          onChange={onRoleMode}
        />
      </div>

      <div className="settings-layout">
        <section className="work-panel">
          <SectionTitle title="Матрица ролей" action="Серверная проверка прав" />
          <div className="role-table">
            <div className="role-head">
              <span>Роль</span>
              <span>Панель</span>
              <span>Настройки</span>
              <span>Пароли</span>
              <span>Отчеты</span>
            </div>
            {roles.map((role) => (
              <div className="role-row" key={role.name}>
                <strong>{role.name}</strong>
                <Permission enabled={role.panel} />
                <Permission enabled={role.settings} />
                <Permission enabled={role.reset} />
                <span>{role.reports}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Каналы и лимиты" action="На одного оператора" />
          <div className="channel-settings">
            {channels.map((channel) => (
              <article key={channel.name}>
                <button
                  aria-label={`Переключить ${channel.name}`}
                  aria-pressed={channel.enabled}
                  className="toggle-button"
                  disabled={!canEditSettings}
                  onClick={() => toggleChannel(channel.name)}
                  title={`Переключить ${channel.name}`}
                  type="button"
                >
                  {channel.enabled ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
                </button>
                <ChannelBadge channel={channel.name} />
                <span>{channel.staff} сотрудников</span>
                <label>
                  <span>Лимит</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={channel.limit}
                    disabled={!canEditSettings}
                    onChange={(event) => updateLimit(channel.name, Number(event.target.value))}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>
      </div>

      <EmployeeManagementPanel
        access={access}
        canEditSettings={canEditSettings}
        canResetEmployeePassword={access.canResetPasswords}
        onToast={onToast}
        roleMode={roleMode}
      />

      <TopicDirectoryPanel
        access={access}
        canEditSettings={canEditSettings}
        onToast={onToast}
        roleMode={roleMode}
      />

      <div className="integration-layout">
        <ChannelConnectionsPanel
          access={access}
          canEditSettings={canEditSettings}
          onToast={onToast}
        />

        <SdkConsolePanel
          access={access}
          canEditSettings={canEditSettings}
          onToast={onToast}
        />
      </div>
      <AdminWorkspaces
        access={access}
        canEditSettings={canEditSettings}
        onToast={onToast}
        roleMode={roleMode}
      />

      <div className="rules-panel">
        <SectionTitle title="Критичные правила" action="Включены" />
        {[
          ["Нельзя закрыть диалог без тематики", "Обязательное правило для всех каналов"],
          ["Внутренний комментарий не отправляется клиенту", "Разделение режимов ввода"],
          ["Оператор не получает чаты сверх лимита", "Override только с правами старшего"],
          ["Экспорт отчетов фиксируется в аудите", "CSV/XLSX/PDF"]
        ].map(([title, description]) => (
          <div className="rule-row" key={title}>
            <KeyRound size={18} />
            <strong>{title}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>
    </ProductScreen>
  );
}
