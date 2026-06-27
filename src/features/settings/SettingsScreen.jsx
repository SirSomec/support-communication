import React from "react";
import {
  KeyRound,
  ShieldCheck
} from "lucide-react";
import { ProductScreen, SectionTitle } from "../../ui.jsx";
import {
  channelDetails,
  channelSettings
} from "../../data.js";
import { createScreenStateItems } from "../../app/screenState.js";
import { AdminWorkspaces } from "./AdminWorkspaces.jsx";
import { ChannelConnectionsPanel } from "./ChannelConnectionsPanel.jsx";
import { EmployeeManagementPanel } from "./EmployeeManagementPanel.jsx";
import { SettingsAccessPanel } from "./SettingsAccessPanel.jsx";
import { SdkConsolePanel } from "./SdkConsolePanel.jsx";
import { TopicDirectoryPanel } from "./TopicDirectoryPanel.jsx";

export function SettingsScreen({ onBack, onToast, access, roleMode, onRoleMode }) {
  const canEditSettings = access.canManageSettings;

  return (
    <ProductScreen
      title="Настройки"
      subtitle="Права, каналы, лимиты операторов, маршрутизация и обязательные правила закрытия."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: channelSettings.length,
        empty: `${channelSettings.length} каналов`,
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
      <SettingsAccessPanel
        canEditSettings={canEditSettings}
        onRoleMode={onRoleMode}
        roleMode={roleMode}
      />

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
