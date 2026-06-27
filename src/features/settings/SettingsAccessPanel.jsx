import React, { useState } from "react";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { ChannelBadge, Permission, SectionTitle, SegmentedControl } from "../../ui.jsx";
import { channelSettings, roles } from "../../data.js";

export function SettingsAccessPanel({ canEditSettings, onRoleMode, roleMode }) {
  const [channels, setChannels] = useState(channelSettings);

  function toggleChannel(name) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, enabled: !channel.enabled } : channel));
  }

  function updateLimit(name, limit) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, limit } : channel));
  }

  return (
    <>
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
    </>
  );
}
