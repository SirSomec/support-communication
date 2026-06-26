import React, { useMemo, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { ChannelBadge, ChannelList, SectionTitle, ToolbarSearch } from "../../ui.jsx";
import { employeeChannelRules, employeeGroups } from "../../data.js";

export function EmployeeManagementPanel({ access, canEditSettings, canResetEmployeePassword, onToast, roleMode }) {
  const [employeeRules, setEmployeeRules] = useState(employeeChannelRules);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeChannelRules[0].id);
  const [employeeQuery, setEmployeeQuery] = useState("");

  const canEditEmployeeDirectory = canEditSettings;
  const selectedEmployee = employeeRules.find((employee) => employee.id === selectedEmployeeId) ?? employeeRules[0];

  const visibleEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    if (!query) {
      return employeeRules;
    }

    return employeeRules.filter((employee) => [
      employee.employee,
      employee.role,
      employee.group,
      employee.passwordStatus,
      ...employee.channels
    ].join(" ").toLowerCase().includes(query));
  }, [employeeQuery, employeeRules]);

  function updateSelectedEmployee(field, value) {
    if (!canEditEmployeeDirectory) {
      return;
    }

    setEmployeeRules((current) => current.map((employee) => employee.id === selectedEmployee.id ? { ...employee, [field]: value } : employee));
  }

  function toggleSelectedEmployeeChannel(channelName) {
    if (!canEditEmployeeDirectory) {
      return;
    }

    setEmployeeRules((current) => current.map((employee) => {
      if (employee.id !== selectedEmployee.id) {
        return employee;
      }

      const channels = employee.channels.includes(channelName)
        ? employee.channels.filter((channel) => channel !== channelName)
        : [...employee.channels, channelName];
      return { ...employee, channels };
    }));
  }

  function handlePasswordReset(employeeName) {
    if (!canResetEmployeePassword) {
      return;
    }

    setEmployeeRules((current) => current.map((employee) => employee.employee === employeeName
      ? { ...employee, passwordStatus: "Сброс отправлен" }
      : employee
    ));
    onToast(`${employeeName}: ссылка для смены пароля отправлена и попадет в audit.`);
  }

  return (
    <section className="work-panel employee-rules-panel">
      <SectionTitle title="Каналы и лимиты по сотрудникам" action="исключения и маскирование данных" />
      <div className="employee-management">
        <div className="employee-directory">
          <ToolbarSearch
            ariaLabel="Поиск сотрудника"
            className="employee-search"
            iconSize={17}
            placeholder="Сотрудник, роль, группа, канал"
            value={employeeQuery}
            onChange={setEmployeeQuery}
          />
          <div className="employee-selector-list">
            {visibleEmployees.map((employee) => (
              <button
                aria-pressed={selectedEmployee.id === employee.id}
                className={selectedEmployee.id === employee.id ? "selected" : ""}
                data-employee-id={employee.id}
                key={employee.id}
                onClick={() => setSelectedEmployeeId(employee.id)}
                type="button"
              >
                <strong>{employee.employee}</strong>
                <span>{employee.role} · {employee.group}</span>
                <ChannelList channels={employee.channels} />
              </button>
            ))}
            {!visibleEmployees.length ? (
              <div className="employee-empty">Сотрудники не найдены.</div>
            ) : null}
          </div>
        </div>

        <div className="employee-editor">
          <header>
            <div>
              <strong>{selectedEmployee.employee}</strong>
              <span>{selectedEmployee.role} · {selectedEmployee.lastLogin}</span>
            </div>
            <button
              disabled={!canResetEmployeePassword}
              onClick={() => handlePasswordReset(selectedEmployee.employee)}
              title={canResetEmployeePassword ? "Сбросить пароль сотруднику" : access.reason}
              type="button"
            >
              <KeyRound size={16} />
              Сбросить пароль
            </button>
          </header>
          <div className="employee-editor-grid">
            <label>
              <span>Роль</span>
              <select disabled={!canEditEmployeeDirectory} value={selectedEmployee.role} onChange={(event) => updateSelectedEmployee("role", event.target.value)} title={canEditEmployeeDirectory ? "Изменить роль" : access.reason}>
                {["Сотрудник", "Старший сотрудник", "Администратор"].map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>
            <label>
              <span>Группа</span>
              <select disabled={!canEditEmployeeDirectory} value={selectedEmployee.group} onChange={(event) => updateSelectedEmployee("group", event.target.value)} title={canEditEmployeeDirectory ? "Назначить группу" : access.reason}>
                {employeeGroups.map((group) => <option value={group.name} key={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label>
              <span>Лимит чатов</span>
              <input disabled={!canEditEmployeeDirectory} min="1" max="30" type="number" value={selectedEmployee.chatLimit} onChange={(event) => updateSelectedEmployee("chatLimit", Number(event.target.value))} title={canEditEmployeeDirectory ? "Изменить лимит сотрудника" : access.reason} />
            </label>
            <div>
              <span>Пароль</span>
              <strong>{selectedEmployee.passwordStatus}</strong>
            </div>
          </div>
          <div className="employee-channel-editor" aria-label="Каналы сотрудника">
            {["SDK", "Telegram", "MAX", "VK"].map((channelName) => (
              <label key={channelName}>
                <input
                  checked={selectedEmployee.channels.includes(channelName)}
                  disabled={!canEditEmployeeDirectory}
                  onChange={() => toggleSelectedEmployeeChannel(channelName)}
                  title={canEditEmployeeDirectory ? `Переключить канал ${channelName}` : access.reason}
                  type="checkbox"
                />
                <ChannelBadge channel={channelName} />
              </label>
            ))}
          </div>
          <div className="employee-permission-toggles">
            <label>
              <input
                checked={selectedEmployee.canOverride}
                disabled={!canEditEmployeeDirectory}
                onChange={(event) => updateSelectedEmployee("canOverride", event.target.checked)}
                title={canEditEmployeeDirectory ? "Разрешить override" : access.reason}
                type="checkbox"
              />
              <span>Override очереди</span>
            </label>
            <label>
              <input
                checked={selectedEmployee.sensitiveData}
                disabled={!canEditEmployeeDirectory}
                onChange={(event) => updateSelectedEmployee("sensitiveData", event.target.checked)}
                title={canEditEmployeeDirectory ? "Показывать чувствительные данные" : access.reason}
                type="checkbox"
              />
              <span>Чувствительные данные</span>
            </label>
          </div>
          <footer>
            <span>{canEditEmployeeDirectory ? "Изменения попадут в audit после сохранения." : `${roleMode}: можно смотреть карточку сотрудника${canResetEmployeePassword ? " и сбрасывать пароль." : "."}`}</span>
            <button
              disabled={!canEditEmployeeDirectory}
              onClick={() => onToast(`${selectedEmployee.employee}: настройки сотрудника сохранены.`)}
              title={canEditEmployeeDirectory ? "Сохранить сотрудника" : access.reason}
              type="button"
            >
              <ShieldCheck size={16} />
              Сохранить
            </button>
          </footer>
        </div>
      </div>
      <div className="employee-group-strip" aria-label="Группы сотрудников">
        {employeeGroups.map((group) => (
          <div key={group.id}>
            <strong>{group.name}</strong>
            <span>{group.members} сотрудников · {group.scope}</span>
          </div>
        ))}
      </div>
      <div className="employee-rule-list">
        {employeeRules.map((rule) => (
          <article className="employee-rule" key={rule.id}>
            <header>
              <strong>{rule.employee}</strong>
              <span>{rule.role} · {rule.group}</span>
              <b>{rule.chatLimit} чатов</b>
            </header>
            <ChannelList channels={rule.channels} />
            <p>{rule.exceptions.join("; ")}</p>
            <footer>
              <span>{rule.canOverride ? "может override" : "без override"}</span>
              <span>{rule.sensitiveData ? "видит чувствительные данные" : "данные маскированы"}</span>
              <span>{rule.passwordStatus}</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
