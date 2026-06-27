import React, { useState } from "react";
import { Info, MoreHorizontal } from "lucide-react";
import { maskPhone, statusLabels } from "../../app/dialogModel.js";
import { topicOptions } from "../../data.js";
import { Avatar } from "./Avatar.jsx";
import { DialogActionMenu } from "./DialogActionMenu.jsx";

export function ChatHeader({
  access,
  activeRescue,
  conversation,
  isClosed,
  onDialogAction,
  onStatusChange,
  onTopic,
  status,
  topic
}) {
  const [isActionPanelOpen, setActionPanelOpen] = useState(false);
  const visiblePhone = access.canViewSensitive ? conversation.phone : maskPhone(conversation.phone);

  return (
    <header className="chat-header">
      <div className="chat-identity">
        <Avatar conversation={conversation} />
        <div>
          <h1>{conversation.name}</h1>
          <span>{visiblePhone}</span>
        </div>
      </div>
      <div className="chat-actions">
        <button
          aria-expanded={isActionPanelOpen}
          aria-label="Действия с диалогом"
          onClick={() => setActionPanelOpen((current) => !current)}
          title="Действия с диалогом"
          type="button"
        >
          <MoreHorizontal size={21} />
        </button>
        <button aria-label="Информация" title="Информация" type="button"><Info size={20} /></button>
      </div>
      {isActionPanelOpen ? (
        <DialogActionMenu
          access={access}
          activeRescue={activeRescue}
          isClosed={isClosed}
          onAction={(action) => {
            onDialogAction(action);
            setActionPanelOpen(false);
          }}
          status={status}
        />
      ) : null}
      <label className="status-select-inline">
        <span>Статус:</span>
        <select
          disabled={!access.canManageDialogs || (isClosed && status !== "closed")}
          onChange={(event) => onStatusChange(event.target.value)}
          value={status}
        >
          {Object.entries(statusLabels).map(([key, label]) => (
            <option disabled={isClosed && !["closed", "reopened"].includes(key)} key={key} value={key}>{label}</option>
          ))}
        </select>
      </label>
      <label className="topic-select">
        <span>Тематика:</span>
        <select value={topic} onChange={(event) => onTopic(event.target.value)}>
          <option value="">Не выбрана</option>
          {topicOptions.map((option) => (
            <option value={option} key={option}>{option}</option>
          ))}
        </select>
      </label>
    </header>
  );
}
