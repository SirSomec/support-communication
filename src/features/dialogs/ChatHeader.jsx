import React, { useEffect, useState } from "react";
import { Check, Info, MoreHorizontal, UserRoundCheck, X } from "lucide-react";
import { maskPhone, statusLabels } from "../../app/dialogModel.js";
import { Avatar } from "./Avatar.jsx";
import { DialogActionMenu } from "./DialogActionMenu.jsx";

export function ChatHeader({
  access,
  activeRescue,
  assignees = [],
  conversation,
  isClosed,
  onDialogAction,
  onAssignment,
  onStatusChange,
  onTopic,
  status,
  topic,
  topicOptions = []
}) {
  const [isActionPanelOpen, setActionPanelOpen] = useState(false);
  const [isAssignmentPanelOpen, setAssignmentPanelOpen] = useState(false);
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentPending, setAssignmentPending] = useState(false);
  const [targetOperatorId, setTargetOperatorId] = useState("");
  const visiblePhone = access.canViewSensitive ? conversation.phone : maskPhone(conversation.phone);
  const availableTargets = assignees.filter((assignee) => assignee.id !== conversation.operatorId);

  useEffect(() => {
    setAssignmentPanelOpen(false);
    setAssignmentReason("");
    setAssignmentError("");
    setTargetOperatorId("");
  }, [conversation.id]);

  function toggleAssignmentPanel() {
    setAssignmentPanelOpen((current) => {
      const next = !current;
      if (next) {
        setTargetOperatorId(availableTargets[0]?.id ?? "");
        setAssignmentError("");
      }
      return next;
    });
  }

  async function submitAssignment() {
    if (!targetOperatorId || assignmentReason.trim().length < 8) return;
    setAssignmentPending(true);
    setAssignmentError("");
    const result = await onAssignment({
      operatorId: targetOperatorId,
      reason: assignmentReason.trim()
    });
    setAssignmentPending(false);
    if (!result?.ok) {
      setAssignmentError(result?.message ?? "Не удалось изменить ответственного.");
      return;
    }
    setAssignmentPanelOpen(false);
    setAssignmentReason("");
  }

  return (
    <header className="chat-header">
      <div className="chat-identity">
        <Avatar conversation={conversation} />
        <div>
          <h1>{conversation.name}</h1>
          <span>{visiblePhone}</span>
          <small
            className="assignment-owner"
            title={`Ответственный: ${conversation.operatorName || "не назначен"}`}
          >
            {conversation.operatorName || "Не назначен"}
          </small>
        </div>
      </div>
      <div className="chat-actions">
        <button
          aria-expanded={isAssignmentPanelOpen}
          aria-label="Назначить оператора"
          disabled={!access.canManageDialogs || isClosed}
          onClick={toggleAssignmentPanel}
          title={access.canManageDialogs ? "Назначить или передать диалог" : access.reason}
          type="button"
        >
          <UserRoundCheck size={19} />
        </button>
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
      {isAssignmentPanelOpen ? (
        <div className="assignment-panel" data-testid="dialog-assignment-panel">
          <label>
            <span>{conversation.operatorId ? "Передать оператору" : "Назначить оператору"}</span>
            <select
              aria-label="Оператор"
              disabled={assignmentPending || availableTargets.length === 0}
              onChange={(event) => setTargetOperatorId(event.target.value)}
              value={targetOperatorId}
            >
              {!availableTargets.length ? <option value="">Нет доступных операторов</option> : null}
              {availableTargets.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.role}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Причина</span>
            <input
              aria-label="Причина назначения"
              disabled={assignmentPending}
              minLength={8}
              onChange={(event) => setAssignmentReason(event.target.value)}
              placeholder="Не менее 8 символов"
              value={assignmentReason}
            />
          </label>
          <div className="assignment-panel-actions">
            <button aria-label="Отменить назначение" onClick={() => setAssignmentPanelOpen(false)} title="Отмена" type="button">
              <X size={17} />
            </button>
            <button
              aria-label="Подтвердить назначение"
              className="assignment-submit"
              disabled={assignmentPending || !targetOperatorId || assignmentReason.trim().length < 8}
              onClick={submitAssignment}
              title={conversation.operatorId ? "Передать диалог" : "Назначить диалог"}
              type="button"
            >
              <Check size={17} />
            </button>
          </div>
          {assignmentError ? <p role="alert">{assignmentError}</p> : null}
        </div>
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
