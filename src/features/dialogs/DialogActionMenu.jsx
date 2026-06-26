import React from "react";
import { dialogActionConfigs, getStatusMeta } from "../../app/dialogModel.js";

export function DialogActionMenu({ access, activeRescue, isClosed, onAction, status }) {
  const statusMeta = getStatusMeta(status);

  return (
    <div className="chat-action-menu">
      <div className="chat-action-status">
        <span>Текущий статус</span>
        <strong>{statusMeta.label}</strong>
      </div>
      {!access.canManageDialogs ? <p className="disabled-reason">{access.reason}</p> : null}
      {dialogActionConfigs.map((action) => {
        const rescueAlreadyActive = action.id === "rescue" && Boolean(activeRescue);
        const actionDisabled = isClosed || !access.canManageDialogs || rescueAlreadyActive;

        return (
          <button
            disabled={actionDisabled}
            key={action.title}
            onClick={() => onAction(action)}
            type="button"
          >
            <strong>{action.title}</strong>
            <span>{rescueAlreadyActive ? "Rescue timer уже запущен" : action.description}</span>
          </button>
        );
      })}
    </div>
  );
}
